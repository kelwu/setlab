import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordUsage, recordCost, usageFrom, type CallUsage } from '@/lib/api-usage';

export const maxDuration = 60;

interface TrackInput {
  position: number;
  artist: string;
  title: string;
  isWishlist?: boolean;
}

interface ResolvedTrack {
  position: number;
  beatportUrl?: string;
  bpmSupremeUrl?: string;
  bpmSupremeFound?: boolean;
  traxsourceUrl?: string;
  traxsourceFound?: boolean;
  djcityUrl?: string;
  djcityFound?: boolean;
}

function anthropic() {
  // Shared client carries a default timeout backstop. NOTE: the web-search
  // fan-out here (up to ~300 calls/request) is still uncapped — see the infra
  // backlog for the fan-out cap + per-search timeouts.
  return getAnthropic();
}

// Beatport's own frontend search API — returns real track page URLs
async function resolveBeatport(artist: string, title: string): Promise<string | undefined> {
  const q = encodeURIComponent(`${artist} ${title}`);
  try {
    const res = await fetch(
      `https://www.beatport.com/api/v4/catalog/search?q=${q}&type=tracks&per_page=5`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible)',
        },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!res.ok) return undefined;

    const data = await res.json() as {
      tracks?: {
        data?: Array<{
          url?: string;
          name?: string;
          artists?: Array<{ name: string }>;
        }>;
      };
    };

    const hits = data?.tracks?.data;
    if (!hits?.length) return undefined;

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const na = norm(artist);
    const nt = norm(title);

    const scored = hits.map(h => {
      const hArtists = (h.artists ?? []).map(a => norm(a.name));
      const hTitle = norm(h.name ?? '');
      const artistHit = hArtists.some(a => a.includes(na) || na.includes(a)) ? 2 : 0;
      const titleHit = (hTitle.includes(nt) || nt.includes(hTitle)) && nt.length > 2 ? 1 : 0;
      return { h, score: artistHit + titleHit };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.score < 2 || !best.h.url) return undefined;

    return `https://www.beatport.com${best.h.url}`;
  } catch {
    return undefined;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Web search verification for pools without public APIs. Each call is a paid
// web search ($0.01), so results are cached in `track_url_cache` keyed by
// (artist, title, pool) and SHARED across all users/setlists — a track resolved
// once is free on every later view and for every other user.
async function searchPool(
  artist: string,
  title: string,
  domain: string,
  onUsage?: (u: CallUsage) => void,
): Promise<{ url?: string; found: boolean }> {
  const admin = createAdminClient();
  const artistNorm = norm(artist);
  const titleNorm = norm(title);

  try {
    const { data: cached } = await admin
      .from('track_url_cache')
      .select('url, found')
      .eq('artist_norm', artistNorm)
      .eq('title_norm', titleNorm)
      .eq('pool', domain)
      .maybeSingle();
    if (cached) {
      const c = cached as { url: string | null; found: boolean };
      return { url: c.url ?? undefined, found: c.found };
    }
  } catch { /* cache miss / lookup failure — fall through to a live search */ }

  try {
    const msg = await anthropic().messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 64,
      messages: [{ role: 'user', content: `"${artist}" "${title}"` }],
      tools: [{
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: 1,
        allowed_domains: [domain],
      } as Anthropic.Messages.WebSearchTool20260209],
      tool_choice: { type: 'any' },
    }, { timeout: 15_000 });
    onUsage?.(usageFrom('claude-haiku-4-5', msg));

    let result: { url?: string; found: boolean } = { found: false };
    for (const block of msg.content) {
      if (block.type === 'web_search_tool_result') {
        const content = (block as Anthropic.Messages.WebSearchToolResultBlock).content;
        if (Array.isArray(content) && content.length > 0) {
          result = { url: content[0].url, found: true };
          break;
        }
      }
    }

    // Cache the outcome (including "not found") so we don't re-pay for it.
    try {
      await admin.from('track_url_cache').upsert({
        artist_norm: artistNorm,
        title_norm: titleNorm,
        pool: domain,
        url: result.url ?? null,
        found: result.found,
      }, { onConflict: 'artist_norm,title_norm,pool' });
    } catch { /* non-fatal — result still returned */ }

    return result;
  } catch {
    return { found: false };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { banned } = await recordUsage(user.id, 'resolve-urls');
  if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });

  const { tracks } = await req.json() as { tracks: TrackInput[] };
  if (!Array.isArray(tracks) || !tracks.length) {
    return NextResponse.json({ resolved: [] });
  }

  const capped = tracks.slice(0, 100);
  // Bound the paid web-search fan-out: resolve store pools for at most the first
  // WISHLIST_RESOLVE_CAP wishlist tracks (× 3 pools = 60 searches max/request).
  // Caching means re-views and popular tracks cost nothing, so this cap only
  // bites a single first view of a huge wishlist. Beatport (free direct API)
  // still resolves for all tracks.
  const WISHLIST_RESOLVE_CAP = 20;
  const wishlistToResolve = new Set(
    capped.filter(t => t.isWishlist).slice(0, WISHLIST_RESOLVE_CAP).map(t => t.position),
  );

  const usages: CallUsage[] = [];
  const pushUsage = (u: CallUsage) => usages.push(u);

  const results = await Promise.allSettled(
    capped.map(async (t): Promise<ResolvedTrack> => {
      const resolved: ResolvedTrack = { position: t.position };

      resolved.beatportUrl = await resolveBeatport(t.artist, t.title);

      if (t.isWishlist && wishlistToResolve.has(t.position)) {
        const [bpm, trax, djc] = await Promise.all([
          searchPool(t.artist, t.title, 'www.bpmsupreme.com', pushUsage),
          searchPool(t.artist, t.title, 'www.traxsource.com', pushUsage),
          searchPool(t.artist, t.title, 'www.djcity.com', pushUsage),
        ]);
        resolved.bpmSupremeUrl = bpm.url;
        resolved.bpmSupremeFound = bpm.found;
        resolved.traxsourceUrl = trax.url;
        resolved.traxsourceFound = trax.found;
        resolved.djcityUrl = djc.url;
        resolved.djcityFound = djc.found;
      }

      return resolved;
    })
  );

  // Record only the web searches that actually ran (cache hits produce no usage).
  await recordCost(user.id, 'resolve-urls', usages);

  const resolved: ResolvedTrack[] = results
    .filter((r): r is PromiseFulfilledResult<ResolvedTrack> => r.status === 'fulfilled')
    .map(r => r.value);

  return NextResponse.json({ resolved });
}
