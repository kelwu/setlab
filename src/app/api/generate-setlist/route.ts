import { NextRequest, NextResponse } from 'next/server';
import { runSetlistPipeline } from '@/lib/agents/pipeline';
import { SetlistInput, LibraryTrack, GeneratedSetlist } from '@/lib/agents/types';
import { SetlistInputError } from '@/lib/agents/errors';
import { LIBRARY_TRACKS } from '@/lib/setdrop/constants';
import { createClient } from '@/lib/supabase/server';
import { recordUsage, usageToday, costToday, recordCost, recordGenerationEvent, type CallUsage } from '@/lib/api-usage';
import { PLANS } from '@/lib/stripe';
import { computeAffinity, type DiffEntry, type TasteAffinity } from '@/lib/setdrop/taste';
import { targetTrackCount } from '@/lib/setdrop/readiness';
import { getSimilarArtists } from '@/lib/setdrop/lastfm';

export const maxDuration = 300;

function getDemoLibrary(): LibraryTrack[] {
  return LIBRARY_TRACKS.map(t => ({
    id: String(t.pos),
    artist: t.artist,
    title: t.title,
    bpm: t.bpm,
    key: t.key,
    genre: 'Afrobeats',
    isWishlist: t.wishlist,
    beatportSearchUrl: `https://www.beatport.com/search?q=${encodeURIComponent(`${t.artist} ${t.title}`)}`,
    bpmSupremeSearchUrl: `https://www.bpmsupreme.com/search?q=${encodeURIComponent(`${t.artist} ${t.title}`)}`,
    traxsourceSearchUrl: `https://www.traxsource.com/search?term=${encodeURIComponent(`${t.artist} ${t.title}`)}`,
    djcitySearchUrl: `https://www.djcity.com/search?q=${encodeURIComponent(`${t.artist} ${t.title}`)}`,
  }));
}

type StreamEvent =
  | { type: 'step'; step: number; message: string }
  | { type: 'complete'; setlist: GeneratedSetlist; excludedCount: number; libraryTracksUsed: number }
  | { type: 'error'; message: string };

function encode(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(req: NextRequest) {
  // Parse and validate body before streaming starts so we can return real HTTP errors
  let body: { input: SetlistInput; tracks?: LibraryTrack[] };
  try {
    body = await req.json() as { input: SetlistInput; tracks?: LibraryTrack[] };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { input, tracks } = body;
  // The pool must be defined by at least one axis: genre, era, artist, or playlist.
  const hasPoolAxis = !!(
    input?.primaryGenre || input?.sourcePlaylist || input?.eras?.length || input?.artists?.length
  );
  if (!hasPoolAxis || !input?.crowdContext || !input?.durationMinutes || !input?.lineupSlot) {
    return NextResponse.json(
      { error: 'Missing required fields: at least one pool filter (genre, era, artist, or playlist), plus crowdContext, durationMinutes, lineupSlot' },
      { status: 400 }
    );
  }

  // Auth + rate limiting — must complete before streaming starts so errors are real HTTP responses
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { banned, isBeta: dbBeta } = await recordUsage(user.id, 'generate-setlist');
  if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });

  // Beta testers (env allowlist or admin-granted flag) bypass rate limiting entirely
  const betaEmails = (process.env.BETA_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isBeta = dbBeta || (!!user.email && betaEmails.includes(user.email.toLowerCase()));

  // Generation is unlimited for normal use; enforce only anti-abuse guards (the
  // paywall is on exports, not generation): a soft daily count cap AND a per-user
  // daily estimated-spend ceiling, since generation is the real COGS driver.
  let tier: 'free' | 'pro' = 'free';
  if (!isBeta) {
    const { data: userRow } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    tier = (userRow?.subscription_tier ?? 'free') as 'free' | 'pro';
    const dailyCap = PLANS[tier].dailyGenCap;
    if (dailyCap != null) {
      // recordUsage already logged this call, so `used` includes it.
      const used = await usageToday(user.id, 'generate-setlist');
      if (used > dailyCap) {
        return NextResponse.json({ error: 'daily_limit', tier, limit: dailyCap }, { status: 429 });
      }
    }
    const ceiling = PLANS[tier].dailyCostCeilingUsd;
    if (ceiling != null && (await costToday(user.id)) >= ceiling) {
      return NextResponse.json({ error: 'cost_limit', tier }, { status: 429 });
    }
  }

  // Start streaming response
  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();

  // Keepalive: the pipeline has 20–40s silent gaps (blueprint + selector) where no
  // SSE bytes flow. Mobile browsers drop a connection that looks idle, so emit an
  // SSE comment every 10s. The client ignores lines that don't start with "data: ".
  const KEEPALIVE = new TextEncoder().encode(': keepalive\n\n');
  let streamClosed = false;
  const heartbeat = setInterval(() => {
    if (streamClosed) return;
    writer.write(KEEPALIVE).catch(() => { /* connection gone — will surface below */ });
  }, 10_000);

  (async () => {
    const genStart = Date.now();
    try {
      await writer.write(encode({ type: 'step', step: 0, message: 'Analyzing your library...' }));

      // Load library
      let library: LibraryTrack[] = tracks?.length ? tracks : [];
      if (!library.length) {
        try {
          if (user) {
            const { data: lib } = await supabase
              .from('serato_libraries')
              .select('id')
              .eq('user_id', user.id)
              .single();
            if (lib && input.sourcePlaylist) {
              // Playlist mode: the pool is exactly the crate's tracks, joined by real
              // serato_tracks UUIDs (see library-save.ts) — no genre filtering.
              const { data: crate } = await supabase
                .from('serato_crates')
                .select('track_ids')
                .eq('library_id', lib.id)
                .eq('crate_name', input.sourcePlaylist)
                .maybeSingle();
              const ids = (crate?.track_ids ?? []) as string[];
              const CHUNK = 300;
              const rows: Array<{
                id: string; artist: string | null; title: string | null;
                bpm: number | null; key: string | null; genre: string | null;
                year: number | null; file_path: string | null; lastfm_tags: string[] | null;
              }> = [];
              for (let i = 0; i < ids.length; i += CHUNK) {
                const { data } = await supabase.from('serato_tracks')
                  .select('id, artist, title, bpm, key, genre, year, file_path, lastfm_tags')
                  .eq('library_id', lib.id)
                  .eq('in_library', true)
                  .in('id', ids.slice(i, i + CHUNK));
                if (data) rows.push(...data);
              }
              if (rows.length) {
                library = rows.map(t => ({
                  id: t.id, artist: t.artist ?? '', title: t.title ?? '',
                  bpm: t.bpm ?? 0, key: t.key ?? '', genre: t.genre ?? undefined,
                  year: t.year ?? undefined,
                  filePath: t.file_path ?? undefined, lastfmTags: t.lastfm_tags ?? [],
                  isWishlist: false, enrichmentSource: 'serato' as const,
                }));
              }
            } else if (lib) {
              // Multi-axis pool: the candidate rows are fetched by whichever axes the
              // DJ supplied (genre / era / artist). Era + artist narrow in SQL to keep
              // the returned set small; genre keeps its tiered fetch. The pipeline does
              // the precise decade-membership + genre-tier filtering on top.
              const SELECT = 'id, artist, title, bpm, key, genre, year, file_path, lastfm_tags';
              const genre = input.primaryGenre;
              const eras = input.eras ?? [];
              const artists = input.artists ?? [];
              const sanitizeLike = (s: string) => s.replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();

              // Era → inclusive year bounds. Non-contiguous decades are over-fetched
              // here and precisely filtered by decade membership in the pipeline.
              const yearMin = eras.length ? Math.min(...eras) : undefined;
              const yearMax = eras.length ? Math.max(...eras) + 9 : undefined;
              const artistFilter = artists.length
                ? artists.map(a => `artist.ilike.%${sanitizeLike(a)}%`).filter(f => f.length > 'artist.ilike.%%'.length).join(',')
                : '';

              // Apply the era/artist axes to any query builder (structural generic — no `any`).
              const applyAxes = <Q extends {
                gte(c: string, v: number): Q; lte(c: string, v: number): Q; or(f: string): Q;
              }>(q: Q): Q => {
                let out = q;
                if (yearMin !== undefined) out = out.gte('year', yearMin);
                if (yearMax !== undefined) out = out.lte('year', yearMax);
                if (artistFilter) out = out.or(artistFilter);
                return out;
              };

              // Seed tracks are explicit must-includes — fetched WITHOUT axis narrowing.
              const sanitizeSeed = (s: string) =>
                s.replace(/[,()[\]—–]/g, ' ').replace(/\s+/g, ' ').trim();
              const seedQueries = (input.seedTracks ?? []).map(seed => {
                const safe = sanitizeSeed(seed);
                return supabase.from('serato_tracks')
                  .select(SELECT)
                  .eq('library_id', lib.id)
                  .eq('in_library', true)
                  .or(`title.ilike.%${safe}%,artist.ilike.%${safe}%`)
                  .limit(5);
              });

              let allRows: Array<{
                id: string; artist: string | null; title: string | null;
                bpm: number | null; key: string | null; genre: string | null;
                year: number | null; file_path: string | null; lastfm_tags: string[] | null;
              }> = [];
              const seedResults = await Promise.all(seedQueries);

              if (genre) {
                // Genre present: keep the tiered fetch (exact-ish / null-genre / other),
                // each narrowed by era + artist in SQL.
                const [{ data: genreRows }, { data: nullGenreRows }, { data: otherRows }] =
                  await Promise.all([
                    applyAxes(supabase.from('serato_tracks').select(SELECT)
                      .eq('library_id', lib.id).eq('in_library', true).ilike('genre', `%${genre}%`)).limit(400),
                    applyAxes(supabase.from('serato_tracks').select(SELECT)
                      .eq('library_id', lib.id).eq('in_library', true).is('genre', null)).limit(100),
                    applyAxes(supabase.from('serato_tracks').select(SELECT)
                      .eq('library_id', lib.id).eq('in_library', true).not('genre', 'ilike', `%${genre}%`)).limit(100),
                  ]);
                allRows = [...(genreRows ?? []), ...(nullGenreRows ?? []), ...(otherRows ?? [])];
              } else {
                // No genre axis — the pool is defined by era and/or artist alone.
                const { data } = await applyAxes(supabase.from('serato_tracks').select(SELECT)
                  .eq('library_id', lib.id).eq('in_library', true)).limit(800);
                allRows = data ?? [];
              }

              // Artist-anchored top-up: if the chosen artist(s) can't fill the set,
              // widen to Last.fm similar artists (ranked), still respecting genre + era.
              // Anchors stay prioritized in the pipeline; this only adds candidates.
              if (artists.length && allRows.length < targetTrackCount(input.durationMinutes, input.primaryGenre)) {
                const anchorLower = new Set(artists.map(a => a.toLowerCase().trim()));
                const seenSimilar = new Set<string>();
                const ranked: string[] = [];
                const perAnchor = await Promise.all(artists.map(a => getSimilarArtists(a, 20)));
                for (const list of perAnchor) {
                  for (const name of list) {
                    const key = name.toLowerCase().trim();
                    if (!key || anchorLower.has(key) || seenSimilar.has(key)) continue;
                    seenSimilar.add(key);
                    ranked.push(name);
                  }
                }
                const names = ranked.slice(0, 40);
                const simFilter = names.map(a => `artist.ilike.%${sanitizeLike(a)}%`)
                  .filter(f => f.length > 'artist.ilike.%%'.length).join(',');
                if (simFilter) {
                  let simQuery = supabase.from('serato_tracks').select(SELECT).eq('library_id', lib.id).eq('in_library', true);
                  if (yearMin !== undefined) simQuery = simQuery.gte('year', yearMin);
                  if (yearMax !== undefined) simQuery = simQuery.lte('year', yearMax);
                  if (genre) simQuery = simQuery.ilike('genre', `%${genre}%`);
                  const { data: simRows } = await simQuery.or(simFilter).limit(400);
                  const seenIds = new Set(allRows.map(r => r.id));
                  const picked = (simRows ?? []).filter(r => !seenIds.has(r.id));
                  allRows.push(...picked);
                  // Record which similar artists actually contributed tracks (for the note).
                  input.similarArtists = names.filter(n =>
                    picked.some(r => (r.artist ?? '').toLowerCase().includes(n.toLowerCase())),
                  );
                }
              }

              if (!allRows.length) {
                // Nothing matched the axes — fall back to a narrowed sample so the
                // pipeline can emit a precise "not enough tracks" message rather than
                // erroring on an empty library.
                const { data: fallbackRows } = await applyAxes(supabase.from('serato_tracks')
                  .select(SELECT).eq('library_id', lib.id).eq('in_library', true)).limit(500);
                allRows = fallbackRows ?? [];
              }

              const seedRows = seedResults.flatMap(r => r.data ?? []);
              const seen = new Set(allRows.map(r => r.id));
              for (const r of seedRows) { if (!seen.has(r.id)) { allRows.push(r); seen.add(r.id); } }
              if (allRows.length) {
                library = allRows.map(t => ({
                  id: t.id, artist: t.artist ?? '', title: t.title ?? '',
                  bpm: t.bpm ?? 0, key: t.key ?? '', genre: t.genre ?? undefined,
                  year: t.year ?? undefined,
                  filePath: t.file_path ?? undefined, lastfmTags: t.lastfm_tags ?? [],
                  isWishlist: false, enrichmentSource: 'serato' as const,
                }));
              }
            }
            if (!library.length) {
              const { data: wish } = await supabase
                .from('wishlist_tracks')
                .select('id, artist, title, bpm, key, genre, beatport_search_url, bpm_supreme_search_url, traxsource_search_url, djcity_search_url')
                .eq('user_id', user.id).eq('status', 'wishlist');
              if (wish?.length) {
                library.push(...wish.map(w => ({
                  id: w.id, artist: w.artist ?? '', title: w.title ?? '',
                  bpm: w.bpm ?? 0, key: w.key ?? '', genre: w.genre ?? undefined,
                  isWishlist: true,
                  beatportSearchUrl: w.beatport_search_url ?? undefined,
                  bpmSupremeSearchUrl: w.bpm_supreme_search_url ?? undefined,
                  traxsourceSearchUrl: w.traxsource_search_url ?? undefined,
                  djcitySearchUrl: w.djcity_search_url ?? undefined,
                  enrichmentSource: 'manual' as const,
                })));
              }
            }
          }
        } catch { /* non-fatal — fall through to demo */ }
      }
      if (!library.length) library = getDemoLibrary();

      // Fetch recently played tracks + post-gig reflections. The reflections feed the
      // per-DJ taste loop: what the DJ actually swapped/skipped/added at past gigs
      // re-ranks this set's candidate pool (see computeAffinity + filterTracksForGig).
      let recentlyPlayed: string[] = [];
      let affinity: TasteAffinity | undefined;
      try {
        if (user) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 90);
          const { data: gigs } = await supabase
            .from('gig_history').select('setlist_id, reflection_json').eq('user_id', user.id)
            .gte('played_at', cutoff.toISOString()).order('played_at', { ascending: false }).limit(10);

          // Distill each gig's planned-vs-actual diff into a bounded taste profile.
          const diffs: DiffEntry[][] = (gigs ?? [])
            .map(g => (g.reflection_json as { diff?: DiffEntry[] } | null)?.diff)
            .filter((d): d is DiffEntry[] => Array.isArray(d) && d.length > 0);
          if (diffs.length) affinity = computeAffinity(diffs);

          const ids = (gigs ?? []).map(g => g.setlist_id).filter(Boolean) as string[];
          if (ids.length) {
            const { data: played } = await supabase.from('setlists')
              .select('tracks_json').in('id', ids);
            const seenTracks = new Set<string>();
            (played ?? []).forEach(s => {
              if (Array.isArray(s.tracks_json)) {
                (s.tracks_json as Array<{ artist: string; title: string }>).forEach(t => {
                  if (t.artist && t.title) seenTracks.add(`${t.artist} — ${t.title}`);
                });
              }
            });
            recentlyPlayed = Array.from(seenTracks);
          }
        }
      } catch { /* non-fatal */ }

      const usages: CallUsage[] = [];
      const setlist = await runSetlistPipeline(
        input, library, recentlyPlayed, affinity,
        (event) => { writer.write(encode(event)); },
        (u) => { usages.push(u); },
      );
      await recordCost(user.id, 'generate-setlist', usages);
      await recordGenerationEvent(user.id, 'generate-setlist', 'success', Date.now() - genStart);

      await writer.write(encode({
        type: 'complete',
        setlist,
        excludedCount: recentlyPlayed.length,
        libraryTracksUsed: library.length,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      // A SetlistInputError is an expected, user-actionable refusal (library too
      // thin for the request) — record it as 'rejected' so the health-check
      // watchdog doesn't count it as a failure. Everything else is a real error.
      const status = err instanceof SetlistInputError ? 'rejected' : 'error';
      if (status === 'error') console.error('[generate-setlist] Error:', message);
      await recordGenerationEvent(user?.id ?? null, 'generate-setlist', status, Date.now() - genStart, message);
      await writer.write(encode({ type: 'error', message }));
    } finally {
      streamClosed = true;
      clearInterval(heartbeat);
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Disable proxy/CDN buffering so keepalives + progress flush immediately.
      'X-Accel-Buffering': 'no',
    },
  });
}
