import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordUsage, usageToday, costToday, recordCost, usageFrom } from '@/lib/api-usage';
import { PLANS } from '@/lib/stripe';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';
import type { CrateTrack } from '@/lib/crates/types';
import { superFamily, genreRelevance, passesGenreGate } from '@/lib/setdrop/genre';

export const maxDuration = 60;

const MODEL = 'claude-sonnet-5';
// Default crate size when the client doesn't request a specific count. Keeps a
// broad prompt (e.g. a genre with hundreds of matches) from producing an
// unusable, uncurated crate. A client sending targetCount: 0 means "no cap".
const DEFAULT_CRATE_SIZE = 50;
// Below this many genre matches we still return the crate but flag it, so the
// user knows the genre barely matched rather than silently getting a thin/odd set.
const GENRE_MATCH_WARN_FLOOR = 8;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTrack {
  id: string;
  artist: string | null;
  title: string | null;
  bpm: number | null;
  key: string | null;
  genre: string | null;
  year: number | null;
  file_path: string | null;
  lastfm_tags: string[] | null;
}

interface CrateProfile {
  crateName: string;
  genreKeywords: string[];
  bpmMin: number;
  bpmMax: number;
  targetEnergy: 'warmup' | 'build' | 'peak' | 'mixed';
  sortOrder: 'asc' | 'desc' | 'energy_arc';
  moodNotes: string;
  // Set only when the prompt names a track count (e.g. "30-track warmup"). Used
  // when the UI leaves size on "Auto"; an explicit UI size always overrides it.
  targetCount?: number | null;
}

// ─── AI tool ──────────────────────────────────────────────────────────────────

const PROFILE_TOOL: Anthropic.Tool = {
  name: 'parse_crate_prompt',
  description: 'Parse a DJ crate prompt into a structured selection profile based on the available library genres.',
  input_schema: {
    type: 'object',
    required: ['crateName', 'genreKeywords', 'bpmMin', 'bpmMax', 'targetEnergy', 'sortOrder', 'moodNotes'],
    properties: {
      crateName: {
        type: 'string',
        description: 'Short descriptive name for the crate (max 40 chars)',
      },
      genreKeywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Genre keywords to match against the library. Use broad terms if specific sub-genres may not be in the library.',
      },
      bpmMin: {
        type: 'number',
        description: 'Minimum BPM for track selection',
      },
      bpmMax: {
        type: 'number',
        description: 'Maximum BPM for track selection',
      },
      targetEnergy: {
        type: 'string',
        enum: ['warmup', 'build', 'peak', 'mixed'],
        description: 'Energy level of the crate',
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc', 'energy_arc'],
        description: 'asc = low-to-high BPM (warmup/build), desc = high-to-low (peak), energy_arc = ascending arc',
      },
      moodNotes: {
        type: 'string',
        description: 'One sentence describing the vibe/context of this crate',
      },
      targetCount: {
        type: 'number',
        description: 'Only set this if the prompt explicitly names a number of tracks (e.g. "30-track set", "give me 20"). Otherwise omit it.',
      },
    },
  },
};

const SYSTEM = `You are a DJ library tool. You parse natural-language crate prompts into structured selection profiles.

Common prompt patterns:
- "Friday peak 1am" → peak energy, 128-135 BPM, genre from library's dominant genre, desc sort
- "Wedding cocktail hour" → warmup/mixed, 95-115 BPM, mainstream genres, asc sort
- "Warmup set" → warmup energy, 118-126 BPM, asc sort
- "Tech house peak" → peak, 128-134 BPM, genreKeywords: ["tech house", "house"], desc sort
- "Afrobeats vibes" → mixed, 100-118 BPM, genreKeywords: ["afrobeats", "afro"], energy_arc sort
- "Hip hop warmup" → warmup/build, 80-95 BPM, genreKeywords: ["hip hop", "r&b"], asc sort

BPM guidance by genre family:
- House / Tech House: warmup 118-124, build 124-128, peak 128-135
- Techno: warmup 128-134, peak 138-148
- Hip Hop / Trap: warmup 75-88, build 88-100, peak 100-115
- Afrobeats: 98-118
- R&B / Soul: 70-100
- Latin / Reggaeton: 85-100
- Pop / Top 40: 95-130

Use genreKeywords that would match what's in a typical DJ's Serato library (Serato genres are often broad: "House", "Hip Hop", "R&B", etc.).
If (and only if) the prompt names a specific number of tracks (e.g. "30-track warmup", "give me 20"), set targetCount to that number; otherwise omit it.
Call parse_crate_prompt with the structured profile.`;

// ─── Track filtering & sorting ────────────────────────────────────────────────

interface ExtraFilters {
  yearMin?: number;
  yearMax?: number;
  excludeArtists?: string[];
  cleanOnly?: boolean;
}

// Normalize a genre/tag for comparison: lowercase and collapse any run of
// non-alphanumerics (hyphens, slashes, extra spaces) to a single space. This is
// what makes "Nu-Disco", "nu disco", and "nu disco / disco" all comparable.
function normGenre(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

interface FilterResult {
  tracks: RawTrack[];
  // True when the user asked for a specific genre (so callers can message about it).
  genreRequested: boolean;
  // How many tracks actually matched the requested genre.
  genreMatchCount: number;
}

// Non-genre, non-BPM hard filters: year range, excluded artists, clean-only. Shared
// by the strict matcher and the fill step so the two can never diverge.
function matchesHardFilters(t: RawTrack, extra: ExtraFilters): boolean {
  const { yearMin, yearMax, excludeArtists, cleanOnly } = extra;
  if (yearMin !== undefined && (t.year == null || t.year < yearMin)) return false;
  if (yearMax !== undefined && (t.year == null || t.year > yearMax)) return false;
  if (excludeArtists?.length) {
    const artist = (t.artist ?? '').toLowerCase();
    const ex = excludeArtists.map(a => a.toLowerCase().trim()).filter(Boolean);
    if (ex.some(e => artist.includes(e))) return false;
  }
  if (cleanOnly) {
    const titleLower = (t.title ?? '').toLowerCase();
    const isDirty = /\(dirty\)|\[dirty\]|dirty version|dirty edit|dirty mix/i.test(titleLower);
    const cleanPattern = /\(clean\)|\[clean\]|clean edit|radio edit/i;
    if (isDirty || !cleanPattern.test(titleLower)) return false;
  }
  return true;
}

function filterTracks(raw: RawTrack[], profile: CrateProfile, extra: ExtraFilters = {}): FilterResult {
  const { bpmMin, bpmMax, genreKeywords } = profile;

  const pool = raw.filter(t => {
    const bpm = t.bpm ?? 0;
    if (bpm < bpmMin || bpm > bpmMax) return false;
    return matchesHardFilters(t, extra);
  });

  const kwNorms = genreKeywords.map(normGenre).filter(Boolean);
  if (!kwNorms.length) {
    return { tracks: pool, genreRequested: false, genreMatchCount: pool.length };
  }

  const matched = pool.filter(t => {
    const g = normGenre(t.genre ?? '');
    const tags = (t.lastfm_tags ?? []).map(normGenre).filter(Boolean);
    // Untagged tracks must never match a specific genre. (The old code compared
    // against '' via kw.includes(genre), which is always true, so untagged junk
    // matched every genre — the root cause of wrong-genre crates.)
    if (!g && !tags.length) return false;
    return kwNorms.some(kw =>
      (g !== '' && (g.includes(kw) || kw.includes(g))) ||
      tags.some(tag => tag.includes(kw) || kw.includes(tag)),
    );
  });

  // Return only the genre-matched tracks — never silently fall back to the full
  // BPM pool. The caller decides how to message a thin or empty match.
  return { tracks: matched, genreRequested: true, genreMatchCount: matched.length };
}

// When a strict genre match falls short of an EXPLICIT target, top the crate up
// from the wider genre family so a requested 25 doesn't silently return 12. Pulls
// candidates that share the gig genre's SUPER-FAMILY (or match its exact/family
// token), ranked by genre relevance then BPM fit, from a slightly widened BPM
// window. The super-family gate is the important one: genreRelevance() scores a
// genre it doesn't recognise (Rock, Country → 'other') as a soft "adjacent", so a
// score-only gate would pad a house crate with Bon Jovi. Requiring the same KNOWN
// super-family keeps fills genre-true — the DJ stays in control of "close enough".
function fillToTarget(
  raw: RawTrack[],
  profile: CrateProfile,
  extra: ExtraFilters,
  already: RawTrack[],
  need: number,
): { tracks: RawTrack[]; usedWiderBpm: boolean } {
  const gigGenre = profile.genreKeywords[0] ?? '';
  if (!gigGenre || need <= 0) return { tracks: [], usedWiderBpm: false };
  // Only fill within a known super-family — refuse to guess for 'other'.
  const gigSuper = superFamily(gigGenre);
  if (gigSuper === 'other') return { tracks: [], usedWiderBpm: false };

  const { bpmMin, bpmMax } = profile;
  const WIDEN = 6;
  const haveIds = new Set(already.map(t => t.id));

  const scored: Array<{ t: RawTrack; score: number; inBpm: boolean }> = [];
  for (const t of raw) {
    if (haveIds.has(t.id)) continue;
    if (!matchesHardFilters(t, extra)) continue;
    const bpm = t.bpm ?? 0;
    if (bpm <= 0) continue;
    const inBpm = bpm >= bpmMin && bpm <= bpmMax;
    if (bpm < bpmMin - WIDEN || bpm > bpmMax + WIDEN) continue;
    const tags = t.lastfm_tags ?? [];
    // Shared genre gate — same source of truth as the setlist pool + readiness.
    // allowUnknown:false so the fill never pads a genre crate with untagged tracks.
    if (!passesGenreGate(gigGenre, t.genre ?? '', tags, { allowUnknown: false })) continue;
    scored.push({ t, score: genreRelevance(gigGenre, t.genre ?? '', tags).score, inBpm });
  }

  // In-BPM first, then higher relevance (exact > family > adjacent).
  scored.sort((a, b) => (a.inBpm !== b.inBpm ? (a.inBpm ? -1 : 1) : b.score - a.score));
  const picked = scored.slice(0, need);
  return { tracks: picked.map(s => s.t), usedWiderBpm: picked.some(s => !s.inBpm) };
}

// Evenly sample n items across an ascending-sorted list so a capped crate spans
// the whole BPM range instead of clustering at the low (or high) end.
function sampleAcross<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = items.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

// Build-to-peak-then-cool-down ordering over an ascending-sorted list: climb
// through the lower body, hit the peak, then ease back down.
function arcOrder(asc: RawTrack[]): RawTrack[] {
  if (asc.length < 4) return asc;
  const peakIdx = Math.floor(asc.length * 0.75);
  const rising = asc.slice(0, peakIdx);          // low → near-peak
  const cooldown = asc.slice(peakIdx).reverse();  // peak → descending
  return [...rising, ...cooldown];
}

// Select the crate (applying the size cap as a spread across the BPM range) and
// order it per the requested sort. Cap is applied before arc shaping so the arc
// spans the final set. `cap === null` means no cap.
function orderAndCap(
  tracks: RawTrack[],
  sortOrder: CrateProfile['sortOrder'],
  cap: number | null,
): RawTrack[] {
  const asc = tracks
    .filter(t => t.bpm != null)
    .sort((a, b) => (a.bpm ?? 0) - (b.bpm ?? 0));
  const withoutBpm = tracks.filter(t => t.bpm == null);

  const selected = cap != null ? sampleAcross(asc, cap) : asc;

  let ordered: RawTrack[];
  if (sortOrder === 'desc') ordered = [...selected].reverse();
  else if (sortOrder === 'energy_arc') ordered = arcOrder(selected);
  else ordered = selected; // asc

  // Backfill any remaining slots with BPM-less tracks, kept at the end.
  const remaining = cap != null ? Math.max(0, cap - ordered.length) : withoutBpm.length;
  return [...ordered, ...withoutBpm.slice(0, remaining)];
}

function toStoredTrack(t: RawTrack): CrateTrack {
  return {
    id: t.id,
    artist: t.artist ?? '',
    title: t.title ?? '',
    bpm: t.bpm,
    key: t.key,
    genre: t.genre,
    year: t.year,
    filePath: t.file_path,
  };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { banned, isBeta } = await recordUsage(user.id, 'crates-generate');
    if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });

    // Crate generation is unlimited for normal use; enforce only a soft daily cap
    // as an anti-abuse guard (the paywall is on exports, not generation).
    if (!isBeta) {
      const { data: userRow } = await supabase
        .from('users')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();
      const tier = (userRow?.subscription_tier ?? 'free') as 'free' | 'pro';
      const dailyCap = PLANS[tier].dailyGenCap;
      if (dailyCap != null) {
        const used = await usageToday(user.id, 'crates-generate');
        if (used > dailyCap) {
          return NextResponse.json({ error: 'daily_limit', tier, limit: dailyCap }, { status: 429 });
        }
      }
      const ceiling = PLANS[tier].dailyCostCeilingUsd;
      if (ceiling != null && (await costToday(user.id)) >= ceiling) {
        return NextResponse.json({ error: 'cost_limit', tier }, { status: 429 });
      }
    }

    const body = await req.json() as { prompt?: string; name?: string; genre?: string; bpmMin?: number; bpmMax?: number; yearMin?: number; yearMax?: number; excludeArtists?: string[]; cleanOnly?: boolean; targetCount?: number };
    const prompt = (body.prompt ?? '').trim();
    if (!prompt) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

    const admin = createAdminClient();

    const { data: library } = await admin
      .from('serato_libraries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!library) return NextResponse.json({ error: 'No library found' }, { status: 404 });

    const { data: rawTracks } = await admin
      .from('serato_tracks')
      .select('id, artist, title, bpm, key, genre, year, file_path, lastfm_tags')
      .eq('library_id', library.id)
      .eq('in_library', true)
      .limit(100000);

    if (!rawTracks?.length) return NextResponse.json({ error: 'Library is empty' }, { status: 404 });

    // Summarise available genres for Claude context
    const genreCounts: Record<string, number> = {};
    for (const t of rawTracks) {
      const g = (t.genre ?? 'Unknown').trim();
      genreCounts[g] = (genreCounts[g] ?? 0) + 1;
    }
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([g, n]) => `${g} (${n})`);

    // Claude parses the prompt into a selection profile
    const anthropic = getAnthropic();
    const userMsg = `Crate prompt: "${prompt}"\n\nLibrary genres available: ${topGenres.join(', ')}\n\nCall parse_crate_prompt with a selection profile.`;

    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      tools: [PROFILE_TOOL],
      tool_choice: { type: 'tool', name: 'parse_crate_prompt' },
      thinking: { type: 'disabled' as const },
    }, { timeout: 45_000, maxRetries: 0 });
    await recordCost(user.id, 'crates-generate', usageFrom(MODEL, msg));

    const block = msg.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    );
    if (!block) throw new Error('No tool_use block from parse_crate_prompt');

    const profile = block.input as CrateProfile;

    // Apply explicit overrides from request body
    if (body.name) profile.crateName = body.name;
    if (body.genre) profile.genreKeywords = [body.genre];
    if (body.bpmMin !== undefined) profile.bpmMin = body.bpmMin;
    if (body.bpmMax !== undefined) profile.bpmMax = body.bpmMax;

    const extra: ExtraFilters = {
      yearMin: body.yearMin,
      yearMax: body.yearMax,
      excludeArtists: body.excludeArtists,
      cleanOnly: body.cleanOnly,
    };

    // Strict match: genre keywords + BPM window.
    const strict = filterTracks(rawTracks as RawTrack[], profile, extra);
    const { genreRequested } = strict;

    // An EXPLICIT target = the user set a size (UI count) or named one in the prompt
    // (e.g. "give me 25"). Only an explicit target triggers fill; Auto/All never do.
    const explicitTarget =
      (typeof body.targetCount === 'number' && body.targetCount > 0) ? body.targetCount
      : (typeof profile.targetCount === 'number' && profile.targetCount > 0) ? profile.targetCount
      : null;

    // Size precedence: explicit target wins; targetCount:0 = "All" (no cap); Auto
    // falls back to DEFAULT_CRATE_SIZE so a broad genre can't produce a huge crate.
    let cap: number | null;
    if (body.targetCount === 0) cap = null;          // "All matches"
    else if (explicitTarget != null) cap = explicitTarget;
    else cap = DEFAULT_CRATE_SIZE;

    // Fill toward an explicit target when the strict match falls short — pull the
    // wider genre family (transparently flagged below) instead of returning 12 for
    // a requested 25. Skipped for Auto/All, where there's no user target to hit.
    let pool = strict.tracks;
    let fillUsedWiderBpm = false;
    if (genreRequested && explicitTarget != null && cap != null && pool.length < cap) {
      const fill = fillToTarget(rawTracks as RawTrack[], profile, extra, pool, cap - pool.length);
      pool = [...pool, ...fill.tracks];
      fillUsedWiderBpm = fill.usedWiderBpm;
    }

    const strictIds = new Set(strict.tracks.map(t => t.id));
    const ordered = orderAndCap(pool, profile.sortOrder, cap);
    const selected = ordered.map(toStoredTrack);
    const exactN = ordered.filter(t => strictIds.has(t.id)).length;
    const expandedN = ordered.length - exactN;

    if (!selected.length) {
      // Genre requested but nothing tagged with it: the honest failure. Previously
      // this silently returned unrelated BPM-matched tracks.
      if (genreRequested) {
        const genreLabel = profile.genreKeywords[0] ?? 'that genre';
        return NextResponse.json({
          error: `No tracks tagged "${genreLabel}" in your library — check the spelling or try a broader genre.`,
          profile,
        }, { status: 422 });
      }
      // A year filter is the most common cause of an empty result: tracks synced
      // before year support have no year and are excluded. Point the user there.
      const yearActive = body.yearMin !== undefined || body.yearMax !== undefined;
      const withYear = (rawTracks as RawTrack[]).filter(t => t.year != null).length;
      const error = yearActive && withYear === 0
        ? 'No tracks matched — your library has no year data yet. Re-sync your library in Library to enable year filtering, or remove the year range.'
        : 'No tracks matched these filters — try widening the BPM or year range.';
      return NextResponse.json({ error, profile }, { status: 422 });
    }

    // Always tell the DJ the crate's composition — never a silent shortfall. Three
    // cases: still short of the requested size, filled by stretching to the wider
    // family, or a thin exact match on an Auto/All crate.
    const genreLabel = profile.genreKeywords[0] ?? 'that genre';
    let warning: string | undefined;
    if (genreRequested) {
      if (explicitTarget != null && ordered.length < explicitTarget) {
        warning = expandedN > 0
          ? `Only ${ordered.length} of ${explicitTarget} — ${exactN} exact ${genreLabel} plus ${expandedN} from the wider ${genreLabel} family. Widen the BPM or year range, or enrich your library tags, to fill the rest.`
          : `Only ${exactN} ${genreLabel} track${exactN === 1 ? '' : 's'} in your library within range — widen the BPM or year range, or enrich your tags, to reach ${explicitTarget}.`;
      } else if (expandedN > 0) {
        warning = `${ordered.length}-track crate: ${exactN} exact ${genreLabel}, ${expandedN} pulled from the wider ${genreLabel} family${fillUsedWiderBpm ? ' and BPM range' : ''} to hit your target.`;
      } else if (exactN < GENRE_MATCH_WARN_FLOOR) {
        warning = `Only ${exactN} track${exactN === 1 ? '' : 's'} matched "${genreLabel}" — try a broader genre or enrich your library.`;
      }
    }

    // Persist the crate
    const { data: crate, error: insertErr } = await admin
      .from('themed_crates')
      .insert({
        user_id: user.id,
        name: profile.crateName,
        prompt,
        tracks_json: selected,
      })
      .select('id, name, prompt, tracks_json, created_at')
      .single();

    if (insertErr || !crate) {
      throw new Error(insertErr?.message ?? 'Failed to save crate');
    }

    return NextResponse.json({
      crate: {
        id: crate.id,
        name: crate.name,
        prompt: crate.prompt,
        tracks: crate.tracks_json as CrateTrack[],
        moodNotes: profile.moodNotes,
        createdAt: crate.created_at,
      },
      ...(warning ? { warning } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[crates/generate]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
