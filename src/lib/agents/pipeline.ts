import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';
import { usageFrom, type CallUsage } from '@/lib/api-usage';
import {
  SetlistInput, LibraryTrack, LibraryProfile, GigIntelReport,
  SetBlueprint, GeneratedSetlist,
} from './types';
import { GIG_BLUEPRINT_SYSTEM, SELECTOR_SYSTEM, NOTES_SYSTEM } from './prompts';
import { SetlistInputError } from './errors';
import { camelotRelation, toCamelot } from '@/lib/setdrop/key-utils';
import { genreRelevance, superFamily, passesGenreGate } from '@/lib/setdrop/genre';
import { passesCleanFilter } from '@/lib/setdrop/clean';
import { MIN_SUPERFAMILY_TRACKS, targetTrackCount } from '@/lib/setdrop/readiness';
import { TasteAffinity, affinityTrackKey, affinityArtistKey } from '@/lib/setdrop/taste';

// Notes are model-generated free text; occasionally the model leaks its own
// reasoning into them (e.g. "Wait — pos 17… Planning accordingly…"). The prompt
// forbids this; this strips any that slips through so users never see scratchpad.
const LEAK_MARKERS = [/\bWait\s*[—–-]/i, /planning accordingly/i, /respect the .*?rule/i, /\bpos\.?\s*\d+/i, /\bposition\s+\d+\b/i];
function stripLeaked(s: string, fallback: string): string {
  if (!s) return fallback;
  if (!LEAK_MARKERS.some(m => m.test(s))) return s;
  const kept = s
    .split(/(?<=[.!?])\s+/)
    .filter(c => !LEAK_MARKERS.some(m => m.test(c)))
    .join(' ')
    .trim();
  return kept || fallback;
}

const MODEL = 'claude-sonnet-4-6';
// The per-track notes are descriptive text, not the creative selection, so they
// run on the cheaper/faster Haiku in a parallel second stage (see runNotesStage).
const NOTES_MODEL = 'claude-haiku-4-5-20251001';
const MAX_SELECTOR_TRACKS = 200;

// The route runs with maxDuration = 300s. Abort the whole pipeline before that
// ceiling so we can surface a real error to the client instead of a stream that
// the platform silently kills mid-flight (which the user sees as a hang).
const PIPELINE_TIMEOUT_MS = 285_000;
// Per-call ceilings so a single hung API request fails fast instead of eating the
// entire budget. The SDK's own default timeout is 10min — longer than our function
// limit — so without these a stalled call always blows past 300s.
// Three sequential stages, each internally fast: blueprint (single no-search
// call ~15-30s), selection (Sonnet, compact ids-only output ~15-40s), and notes
// (Haiku, parallel batches ~15-30s wall). Worst case 60 + 120 + 45 = 225 < 285
// PIPELINE_TIMEOUT < 300 maxDuration — a big margin vs the old monolithic call.
// (Selector gets the widest window: a 3hr / ~60-track set is its slowest output.)
const BLUEPRINT_TIMEOUT_MS = 60_000;
const SELECTOR_TIMEOUT_MS = 120_000;  // stage: selection only (no per-track prose) — headroom for 3hr (~60-track) sets
const NOTES_TIMEOUT_MS = 45_000;      // stage: each parallel note batch (Haiku)

type CallOptions = { signal?: AbortSignal; timeout?: number; onUsage?: (u: CallUsage) => void; model?: string };

function isTimeoutOrAbort(err: unknown): boolean {
  if (err instanceof Anthropic.APIUserAbortError) return true;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return true;
  const name = (err as { name?: string } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

// Shared client; per-call { timeout } options below still override its default.
function client() {
  return getAnthropic();
}

const GIG_BLUEPRINT_TOOL: Anthropic.Tool = {
  name: 'generate_gig_blueprint',
  description: 'Output gig intelligence and set blueprint.',
  input_schema: {
    type: 'object',
    required: ['gigIntel', 'blueprint'],
    properties: {
      gigIntel: {
        type: 'object',
        required: ['crowdProfile', 'trendingGenres', 'recommendedBpmRange', 'avoidArtists', 'contextNotes'],
        properties: {
          venueName: { type: 'string' },
          crowdProfile: { type: 'string' },
          trendingGenres: { type: 'array', items: { type: 'string' } },
          recommendedBpmRange: {
            type: 'object',
            required: ['min', 'max'],
            properties: { min: { type: 'number' }, max: { type: 'number' } },
          },
          avoidArtists: { type: 'array', items: { type: 'string' } },
          contextNotes: { type: 'string' },
        },
      },
      blueprint: {
        type: 'object',
        required: ['totalTracks', 'phases', 'transitionStrategy', 'openerHeadlinerNotes'],
        properties: {
          totalTracks: { type: 'number' },
          phases: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'trackCount', 'energyTarget', 'bpmRange', 'genreGuidance'],
              properties: {
                name: { type: 'string' },
                trackCount: { type: 'number' },
                energyTarget: { type: 'number' },
                bpmRange: {
                  type: 'object',
                  required: ['min', 'max'],
                  properties: { min: { type: 'number' }, max: { type: 'number' } },
                },
                genreGuidance: { type: 'string' },
              },
            },
          },
          transitionStrategy: { type: 'string' },
          openerHeadlinerNotes: { type: 'string' },
        },
      },
    },
  },
};

// Stage-1 selection: the model returns only positions + library track ids +
// energy (no per-track prose, no echoed metadata). We reconstruct artist/title/
// bpm/key/URLs from the real library track by id — cheaper, faster, and it can't
// mistype metadata. Notes are written by the separate Haiku stage.
const SELECTOR_TOOL: Anthropic.Tool = {
  name: 'select_and_sequence_tracks',
  description: 'Output the ordered track selection (library ids + positions) and review notes.',
  input_schema: {
    type: 'object',
    required: ['tracks', 'reviewNotes'],
    properties: {
      tracks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['position', 'id', 'energyLevel'],
          properties: {
            position: { type: 'number', description: '1-based play order' },
            id: { type: 'string', description: 'The track id EXACTLY as given in the candidate library' },
            energyLevel: { type: 'number' },
            wordplayConnection: { type: 'string' },
            isWishlistTrack: { type: 'boolean' },
          },
        },
      },
      reviewNotes: { type: 'string' },
    },
  },
};

// Stage-2 notes (Haiku): per-track why + transition, written for the already-
// chosen, already-sequenced set.
const NOTES_TOOL: Anthropic.Tool = {
  name: 'write_track_notes',
  description: 'Write the per-track why + transition notes for a batch of sequenced tracks.',
  input_schema: {
    type: 'object',
    required: ['notes'],
    properties: {
      notes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['position', 'whyThisTrack', 'transitionNotes'],
          properties: {
            position: { type: 'number' },
            whyThisTrack: { type: 'string' },
            transitionNotes: { type: 'string' },
          },
        },
      },
    },
  },
};

async function callWithTool<T>(
  system: string,
  userMessage: string,
  tool: Anthropic.Tool,
  maxTokens: number,
  options: CallOptions = {},
): Promise<T> {
  const anthropic = client();
  const model = options.model ?? MODEL;
  const msg = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
  }, { signal: options.signal, timeout: options.timeout, maxRetries: 0 });
  options.onUsage?.(usageFrom(model, msg));

  const block = msg.content.find(b => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error(`Expected tool_use block from ${tool.name}`);
  }
  return block.input as T;
}

// Compute library profile from tracks in code — no LLM needed
function computeLibraryProfile(tracks: LibraryTrack[]): LibraryProfile {
  const genreCounts: Record<string, number> = {};
  const artistCounts: Record<string, number> = {};
  const keyCounts: Record<string, number> = {};
  let low = 0, mid = 0, high = 0, wishlist = 0;
  const bpms: number[] = [];

  for (const t of tracks) {
    const g = t.genre || 'Unknown';
    genreCounts[g] = (genreCounts[g] ?? 0) + 1;
    artistCounts[t.artist] = (artistCounts[t.artist] ?? 0) + 1;
    if (t.key) keyCounts[t.key] = (keyCounts[t.key] ?? 0) + 1;
    if (t.bpm > 0) bpms.push(t.bpm);
    if (t.bpm > 0 && t.bpm < 100) low++;
    else if (t.bpm >= 100 && t.bpm <= 125) mid++;
    else if (t.bpm > 125) high++;
    if (t.isWishlist) wishlist++;
  }

  const total = tracks.length || 1;
  const genreDistribution = Object.fromEntries(
    Object.entries(genreCounts).map(([g, c]) => [g, Math.round((c / total) * 100)])
  );
  const topArtists = Object.entries(artistCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a]) => a);
  const bpmMin = bpms.length ? bpms.reduce((a, b) => a < b ? a : b) : 0;
  const bpmMax = bpms.length ? bpms.reduce((a, b) => a > b ? a : b) : 0;
  const bpmAvg = bpms.length ? Math.round(bpms.reduce((s, b) => s + b, 0) / bpms.length) : 0;

  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
  const strengths = topGenres.slice(0, 3).map(([g, c]) => `Strong ${g} selection (${c} tracks)`);
  const gaps = topGenres.length > 5
    ? topGenres.slice(-3).map(([g]) => `Limited ${g} representation`)
    : [];

  return {
    totalTracks: total, genreDistribution,
    bpmRange: { min: bpmMin, max: bpmMax, avg: bpmAvg },
    energySpread: { low, mid, high },
    topArtists, keyDistribution: keyCounts,
    wishlistCount: wishlist, strengths, gaps,
  };
}

// ── Multi-axis pool helpers ──────────────────────────────────────────────
// The candidate pool is the AND of whatever axes the DJ supplied: genre, era
// (release-year decade), artist, playlist. These helpers keep the axis logic
// and the human-readable phrasing in one place so the filter, the gate, the
// LLM prompt, and the review notes all agree.

const decadeOf = (year: number) => Math.floor(year / 10) * 10;

/** "the 2000s" / "the 1990s & 2010s" from decade-start years. */
function eraLabel(eras: number[]): string {
  const decades = [...new Set(eras)].sort((a, b) => a - b).map(d => `${d}s`);
  if (decades.length <= 1) return `the ${decades[0] ?? ''}`.trim();
  return `the ${decades.slice(0, -1).join(', ')} & ${decades[decades.length - 1]}`;
}

/** "Drake" / "Drake & Future" / "Drake, Future & Skrillex". */
function artistLabel(artists: string[]): string {
  if (artists.length <= 1) return artists[0] ?? '';
  return `${artists.slice(0, -1).join(', ')} & ${artists[artists.length - 1]}`;
}

/** Human phrase for the active pool axes, e.g. "pop from the 2000s", "tracks by
 *  Drake", "the 2010s". Used in gate errors, the blueprint prompt, and notes. */
function poolDescription(input: SetlistInput): string {
  const genre = input.primaryGenre
    ? (input.secondaryGenre ? `${input.primaryGenre}/${input.secondaryGenre}` : input.primaryGenre)
    : '';
  const segs: string[] = [];
  if (genre) segs.push(genre);
  if (input.artists?.length) segs.push(`${genre ? '' : 'tracks '}by ${artistLabel(input.artists)}`.trim());
  if (input.eras?.length) segs.push(`from ${eraLabel(input.eras)}`);
  if (input.sourcePlaylist) segs.push(`within your "${input.sourcePlaylist}" playlist`);
  return segs.join(' ').trim() || 'your library';
}

/** Track passes the era axis: has a year whose decade is one the DJ selected.
 *  Null-year tracks are excluded when era is active (they can't be placed). */
function makeEraPredicate(input: SetlistInput) {
  const eraSet = new Set(input.eras ?? []);
  const active = eraSet.size > 0;
  return (t: { year?: number }) => !active || (t.year != null && eraSet.has(decadeOf(t.year)));
}

/** Artist axis. `pass` = membership (anchor OR Last.fm-similar artist) used to build
 *  the pool; `isAnchor` = strict anchor match, used to exempt anchors from the
 *  per-artist cap and skip them in the repeated-artist honesty note. Typed on
 *  `{ artist }` so it works for both LibraryTrack pools and selected tracks. */
function makeArtistPredicate(input: SetlistInput) {
  const anchors = (input.artists ?? []).map(a => a.toLowerCase().trim()).filter(Boolean);
  const similar = (input.similarArtists ?? []).map(a => a.toLowerCase().trim()).filter(Boolean);
  const accept = [...anchors, ...similar];
  const active = anchors.length > 0;
  const has = (list: string[], t: { artist: string }) => list.some(a => t.artist.toLowerCase().includes(a));
  return {
    active,
    pass: (t: { artist: string }) => !active || has(accept, t),
    isAnchor: (t: { artist: string }) => has(anchors, t),
  };
}

/** Error copy when the combined (non-playlist) pool is too thin to fill the set. */
function poolFloorError(input: SetlistInput, n: number): string {
  const genreActive = !!input.primaryGenre;
  const eraActive = (input.eras?.length ?? 0) > 0;
  const artistActive = (input.artists?.length ?? 0) > 0;
  if (eraActive && !genreActive && !artistActive) {
    return `Not enough tracks from ${eraLabel(input.eras!)} — your library has only ${n} dated track${n === 1 ? '' : 's'} in that range (many tracks may lack release-year data). Pick more decades, add a genre, or shorten the set.`;
  }
  if (artistActive && !genreActive && !eraActive) {
    const tried = (input.similarArtists?.length ?? 0) > 0 ? ' (even including similar artists)' : '';
    return `Not enough tracks by ${artistLabel(input.artists!)}${tried} — your library has only ${n}. Add more of their music, broaden the artists, or shorten the set.`;
  }
  return `Not enough tracks match ${poolDescription(input)} — only ${n} found. Loosen a filter (genre, era, or artist) or shorten the set.`;
}

// Filter library down to the most relevant tracks for this gig
function filterTracksForGig(
  tracks: LibraryTrack[],
  blueprint: SetBlueprint,
  input: SetlistInput,
  affinity?: TasteAffinity,
): LibraryTrack[] {
  const bpmMin = Math.min(...blueprint.phases.map(p => p.bpmRange.min)) - 15;
  const bpmMax = Math.max(...blueprint.phases.map(p => p.bpmRange.max)) + 15;
  const seeds = (input.seedTracks ?? []).map(s => s.toLowerCase());

  const isSeed = (t: LibraryTrack) =>
    seeds.some(s => t.title.toLowerCase().includes(s) || t.artist.toLowerCase().includes(s));

  // Era + artist axes narrow the pool in every mode (including within a playlist).
  const matchesEra = makeEraPredicate(input);
  const artist = makeArtistPredicate(input);

  // Genre GATES the pool only when a genre axis is supplied: a track outside the
  // gig's genre family — a different super-family (R&B for a Trance gig) OR an
  // unrecognised 'other' genre (Rock/Country for a House gig) — is excluded
  // outright via passesGenreGate. Genre is not a soft bonus a tempo match can tie.
  // Tracks that pass are scored by tier (exact 4 / family 3 / adjacent 2 / unknown
  // 0, floored at 0 for disco-lineage bridges). Secondary genre can rescue a track.
  // When no genre is set (era/artist/playlist-only), genre isn't a gate: every
  // track scores 0 and order is decided by BPM/tags/affinity below.
  const genreScoreFor = (t: LibraryTrack): number | null => {
    if (!input.primaryGenre) return 0;
    const tags = t.lastfmTags ?? [];
    const primaryOk = passesGenreGate(input.primaryGenre, t.genre ?? '', tags);
    const secondaryOk = input.secondaryGenre
      ? passesGenreGate(input.secondaryGenre, t.genre ?? '', tags) : false;
    if (!primaryOk && !secondaryOk) return null; // out of family (and its bridges) → excluded
    const primary = genreRelevance(input.primaryGenre, t.genre ?? '', tags).score;
    const secondary = input.secondaryGenre
      ? genreRelevance(input.secondaryGenre, t.genre ?? '', tags).score : -1;
    return Math.max(primary, secondary, 0); // never negative once it passed the gate
  };

  // Cap candidates per artist so a library skewed toward one artist can't produce
  // an artist-skewed pool (which is what makes the selector over-repeat). Keeps each
  // artist's highest-scoring tracks; the set-level "max 2 per artist" is enforced by
  // the selector prompt on top of this.
  const POOL_PER_ARTIST_CAP = 3;
  const perArtist: Record<string, number> = {};

  const scored = tracks
    .filter(t => !t.isWishlist && !isSeed(t))
    .filter(t => matchesEra(t) && artist.pass(t))
    .map(t => ({ t, genre: genreScoreFor(t) }))
    .filter((x): x is { t: LibraryTrack; genre: number } => x.genre !== null)
    .map(({ t, genre }) => {
      let score = genre;
      if (t.bpm >= bpmMin && t.bpm <= bpmMax) score += 2;
      if (t.lastfmTags?.length) score += 1;
      // Personalization: re-rank WITHIN the genre-relevant pool from the DJ's own
      // gig history. Bounded in taste.ts so it nudges order but never rescues an
      // off-genre track (already gated out above) or forces a track out entirely.
      if (affinity) {
        score += affinity.trackScores[affinityTrackKey(t.artist, t.title)] ?? 0;
        score += 0.5 * (affinity.artistScores[affinityArtistKey(t.artist)] ?? 0);
      }
      return { t, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter(({ t }) => {
      // Anchor artists are the whole point of an artist-anchored set — never cap them.
      // (Similar-artist top-ups still get the normal cap, to keep them varied.)
      if (artist.active && artist.isAnchor(t)) return true;
      const key = t.artist.toLowerCase().trim();
      perArtist[key] = (perArtist[key] ?? 0) + 1;
      return perArtist[key] <= POOL_PER_ARTIST_CAP;
    })
    .slice(0, MAX_SELECTOR_TRACKS)
    .map(({ t }) => t);

  // Always include seed tracks and wishlist tracks (uncapped — user-requested)
  const pinned = tracks.filter(t => t.isWishlist || isSeed(t));
  return [...pinned, ...scored];
}

// Call 1: Gig intel + blueprint — web search for live venue/trend context, then structured output
async function runGigBlueprint(
  profile: LibraryProfile,
  input: SetlistInput,
  targetTracks: number,
  signal?: AbortSignal,
  onUsage?: (u: CallUsage) => void,
): Promise<{ gigIntel: GigIntelReport; blueprint: SetBlueprint }> {
  const anthropic = client();
  const userMessage = `Library profile:
${JSON.stringify(profile, null, 2)}

Gig context:
- Venue: ${input.venueContext || 'Not specified'}
- Crowd: ${input.crowdContext}
- Pool: ${poolDescription(input)}
- Primary genre: ${input.primaryGenre
    || (input.sourcePlaylist
      ? `(building from the "${input.sourcePlaylist}" playlist — infer the dominant genre and energy from the library profile above)`
      : (input.eras?.length || input.artists?.length)
        ? '(no genre filter — the pool is defined by the era/artist above; infer dominant genre and energy from the profile)'
        : 'Not specified')}
- Secondary genre: ${input.secondaryGenre || 'None'}
- Era: ${input.eras?.length ? eraLabel(input.eras) : 'Any'}
- Artists: ${input.artists?.length ? artistLabel(input.artists) : 'Any'}
- Lineup slot: ${input.lineupSlot}
- Duration: ${input.durationMinutes} minutes
- targetTrackCount: ${targetTracks} (fill the set to this many tracks unless the library has fewer)
- Vibe: ${input.vibe || 'Not specified'}
- Energy arc: ${JSON.stringify(input.energyArc)}`;

  // Single no-search blueprint call, built purely from the library profile + gig
  // context. Web search was removed here: it was the slow, variable step
  // (frequently >50s in prod, and the client's one retry doubled that toward
  // ~100s on a timeout), while its only output — a trending-genre nudge — is
  // advisory (it doesn't filter tracks, shape the set structure, or surface to
  // the user). maxRetries:0 so a slow call fails into the budget rather than
  // silently retrying and doubling its cost.
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: GIG_BLUEPRINT_SYSTEM,
    messages: [{ role: 'user', content: userMessage }],
    tools: [GIG_BLUEPRINT_TOOL],
    tool_choice: { type: 'tool', name: 'generate_gig_blueprint' },
  }, { signal, timeout: BLUEPRINT_TIMEOUT_MS, maxRetries: 0 });
  onUsage?.(usageFrom(MODEL, res));

  const block = res.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use' && b.name === 'generate_gig_blueprint',
  );
  if (!block) throw new Error('Expected tool_use block from generate_gig_blueprint');
  return block.input as { gigIntel: GigIntelReport; blueprint: SetBlueprint };
}

// Call 2: Select and write polished notes from filtered tracks
// Stage 2 of selection: write the per-track why + transition notes on Haiku, in
// parallel batches, so a big set's notes don't serialize into one slow call. A
// slow/failed batch degrades to empty notes for those tracks (harmless — the
// harmonic note is still computed in code), and never sinks the generation.
async function runNotesStage(
  picked: Array<{ sel: { position: number; id: string; energyLevel: number }; lib: LibraryTrack }>,
  signal?: AbortSignal,
  onUsage?: (u: CallUsage) => void,
): Promise<Map<number, { whyThisTrack: string; transitionNotes: string }>> {
  const items = picked.map(({ sel, lib }, i) => {
    const next = picked[i + 1]?.lib;
    return {
      position: sel.position,
      artist: lib.artist, title: lib.title, bpm: lib.bpm, key: lib.key,
      genre: lib.genre ?? '', energy: sel.energyLevel, tags: (lib.lastfmTags ?? []).slice(0, 6),
      into: next
        ? `${next.artist} — ${next.title} (${next.bpm}bpm ${toCamelot(next.key) || next.key || '?'})`
        : 'FINAL TRACK — let it ride out',
    };
  });

  const BATCH = 6;
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));

  const results = await Promise.all(batches.map(async batch => {
    try {
      const res = await callWithTool<{ notes: Array<{ position: number; whyThisTrack: string; transitionNotes: string }> }>(
        NOTES_SYSTEM,
        `Write notes for these tracks, in set order:\n${JSON.stringify(batch, null, 2)}`,
        NOTES_TOOL,
        1500,
        { signal, timeout: NOTES_TIMEOUT_MS, onUsage, model: NOTES_MODEL },
      );
      return res.notes ?? [];
    } catch {
      return [];
    }
  }));

  return new Map(
    results.flat().map(n => [n.position, { whyThisTrack: n.whyThisTrack, transitionNotes: n.transitionNotes }]),
  );
}

async function runSelectorReviewer(
  input: SetlistInput,
  tracks: LibraryTrack[],
  blueprint: SetBlueprint,
  intel: GigIntelReport,
  recentlyPlayed: string[],
  affinity?: TasteAffinity,
  signal?: AbortSignal,
  onUsage?: (u: CallUsage) => void,
): Promise<{ tracks: GeneratedSetlist['tracks']; reviewNotes: string }> {
  // Stage 1 (Sonnet): select + sequence. Compact output — positions + library
  // ids + energy only, no per-track prose — so this call stays fast.
  const selection = await callWithTool<{
    tracks: Array<{ position: number; id: string; energyLevel: number; isWishlistTrack?: boolean; wordplayConnection?: string }>;
    reviewNotes: string;
  }>(
    SELECTOR_SYSTEM,
    `Set blueprint:
${JSON.stringify(blueprint, null, 2)}

Gig intel:
${JSON.stringify(intel, null, 2)}

User preferences:
- Setlist name: "${input.name || 'Untitled Set'}"
- Pool focus: ${poolDescription(input)}
- Wordplay theme: ${input.wordplayTheme || 'None'}
- Seed tracks: ${input.seedTracks?.join(', ') || 'None'}
- Anchor artists (intentional focus — the "max 2 per artist" rule does NOT apply to these): ${input.artists?.join(', ') || 'None'}

Recently played tracks (DO NOT repeat these):
${recentlyPlayed.length ? recentlyPlayed.map(t => `- ${t}`).join('\n') : 'None'}

Available tracks (${tracks.length} total):
${JSON.stringify(tracks.map(t => ({
  id: t.id, artist: t.artist, title: t.title,
  bpm: t.bpm, key: t.key, genre: t.genre,
  lastfmTags: t.lastfmTags ?? [], isWishlist: t.isWishlist,
})), null, 2)}`,
    SELECTOR_TOOL,
    // Compact output (ids only), but a long set is ~90-130 tokens/track once you
    // count UUID ids + reviewNotes, so a 120-min (~30 track) set needs headroom —
    // 2048 truncated large sets into an empty tracks array. A 180-min set is ~60-72
    // tracks, so 8192 is no longer safe; 16384 covers the longest set. The model
    // stops at tool completion, so this doesn't slow normal sets.
    16384,
    { signal, timeout: SELECTOR_TIMEOUT_MS, onUsage },
  );
  if (!selection?.tracks?.length) {
    throw new Error('Selector returned no tracks — the model response may have been truncated. Please try again.');
  }

  // Join the selection back to the candidate pool by id (dropping any hallucinated
  // ids), in play order. Metadata + purchase URLs come from the real library track.
  const byId = new Map(tracks.map(t => [t.id, t]));
  const picked = selection.tracks
    .filter(s => byId.has(s.id))
    .sort((a, b) => a.position - b.position)
    .map(sel => ({ sel, lib: byId.get(sel.id)! }));
  if (!picked.length) {
    throw new Error('Selector returned no matching tracks — please try again.');
  }

  // Stage 2 (Haiku): write the per-track notes in parallel, sequence-aware.
  const notesByPos = await runNotesStage(picked, signal, onUsage);

  const base = picked.map(({ sel, lib }, i) => {
    const n = notesByPos.get(sel.position);
    return {
      position: i + 1,
      artist: lib.artist, title: lib.title, bpm: lib.bpm, key: lib.key ?? '',
      energyLevel: sel.energyLevel ?? 5,
      whyThisTrack: n?.whyThisTrack ?? '',
      transitionNotes: n?.transitionNotes ?? '',
      harmonicMixingNotes: '',
      wordplayConnection: sel.wordplayConnection,
      isWishlistTrack: lib.isWishlist || sel.isWishlistTrack || false,
      beatportUrl: lib.beatportUrl ?? lib.beatportSearchUrl,
      bpmSupremeSearchUrl: lib.bpmSupremeSearchUrl,
      traxsourceSearchUrl: lib.traxsourceSearchUrl,
      djcitySearchUrl: lib.djcitySearchUrl,
    };
  });

  // Own the harmonic assessment in code — the model fabricates Camelot distances.
  // This only annotates the already-selected/sequenced list (no reordering), and
  // scrubs any leaked reasoning from the note stage's free text.
  const annotated = base.map((t, i) => {
    const next = base[i + 1];
    const harmonicMixingNotes = next
      ? `→ ${next.artist} "${next.title}" (${toCamelot(next.key) || next.key || '?'}): ${camelotRelation(t.key, next.key).label}`
      : 'Final track — let it ride out.';
    return {
      ...t,
      harmonicMixingNotes,
      transitionNotes: stripLeaked(t.transitionNotes, 'Blend into the next track: ride the outro, EQ-swap the bass, and drop on the downbeat.'),
      whyThisTrack: stripLeaked(t.whyThisTrack, ''),
    };
  });

  // Honesty: if an artist still appears 3+ times, the diversified pool was genuinely
  // too thin to avoid it — surface that rather than ship a lopsided set silently.
  // Anchor artists are excluded: repeating them is the point of an artist-anchored set.
  const anchor = makeArtistPredicate(input);
  const artistCounts: Record<string, { name: string; count: number }> = {};
  for (const t of annotated) {
    if (anchor.active && anchor.isAnchor(t)) continue;
    const key = t.artist.toLowerCase().trim();
    artistCounts[key] = { name: t.artist, count: (artistCounts[key]?.count ?? 0) + 1 };
  }
  const worst = Object.values(artistCounts).sort((a, b) => b.count - a.count)[0];
  let reviewNotes = selection.reviewNotes;
  if (worst && worst.count >= 3) {
    const fix = input.sourcePlaylist
      ? `Add more variety to the playlist to diversify future sets.`
      : `Broaden your pool (more artists or genres) to diversify future sets.`;
    reviewNotes += `\n\nHeads up — this set repeats ${worst.name} ${worst.count}×: ${poolDescription(input)} is thin in this tempo range. ${fix}`;
  }

  // Transparency: personalization is automatic, so say when it happened and what it did.
  // Reuses this reviewNotes surface (no new UI). Only when there's real, corroborated
  // taste to name — go-to's leaned into and/or tracks the DJ keeps dropping eased off.
  if (affinity && affinity.gigsAnalyzed >= 2) {
    const fmt = (t: { artist: string; title: string }) => `${t.artist} — ${t.title}`;
    const goTos = affinity.goTos.slice(0, 3).map(fmt);
    const dropped = affinity.droppedOften.slice(0, 3).map(fmt);
    if (goTos.length || dropped.length) {
      const parts: string[] = [];
      if (goTos.length) parts.push(`leaned into your go-to's (${goTos.join(', ')})`);
      if (dropped.length) parts.push(`eased off tracks you keep dropping (${dropped.join(', ')})`);
      reviewNotes += `\n\nPersonalized from your last ${affinity.gigsAnalyzed} gigs: ${parts.join(' and ')}.`;
    }
  }

  return { tracks: annotated, reviewNotes };
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
    '-' + Math.random().toString(36).slice(2, 7);
}

export type PipelineProgressEvent = { type: 'step'; step: number; message: string };

// Main pipeline — profile in code + blueprint (Sonnet) + selection (Sonnet) +
// parallel notes (Haiku)
export async function runSetlistPipeline(
  input: SetlistInput,
  tracks: LibraryTrack[],
  recentlyPlayed: string[] = [],
  affinity?: TasteAffinity,
  onProgress?: (event: PipelineProgressEvent) => void,
  onUsage?: (u: CallUsage) => void,
): Promise<GeneratedSetlist> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), PIPELINE_TIMEOUT_MS);
  const { signal } = controller;

  try {
    onProgress?.({ type: 'step', step: 1, message: 'Gathering gig intel...' });

    // Clean-only (corporate / radio): drop tracks whose title marks them explicit
    // BEFORE anything else, so the profile, the readiness floor, and the selector
    // all reason over the same clean pool — an explicit track can never reach the
    // set even if it were seeded or wishlisted.
    const pool = input.cleanOnly
      ? tracks.filter(t => passesCleanFilter(t.title, 'block'))
      : tracks;

    const profile = computeLibraryProfile(pool);

    // Pool readiness across whatever axes the DJ supplied (genre / era / artist /
    // playlist). One scan computes: genre super-family + exact counts (for the genre
    // floor and honesty note), and the COMBINED-pool size — tracks passing every
    // active axis — which is what actually has to fill the set.
    const playlistMode = !!input.sourcePlaylist;
    const genreActive = !!input.primaryGenre;
    const eraActive = (input.eras?.length ?? 0) > 0;
    const matchesEra = makeEraPredicate(input);
    const anchor = makeArtistPredicate(input);
    const gigSuper = genreActive ? superFamily(input.primaryGenre!) : 'other';
    const target = targetTrackCount(input.durationMinutes, input.primaryGenre);

    let exactGenreCount = 0;
    let superFamilyCount = 0;
    let poolCount = 0;      // tracks passing all active axes (genre-not-off, era, artist)
    let poolWithYear = 0;   // of the combined pool, how many carry a release year
    for (const t of pool) {
      if (t.isWishlist) continue;
      if (genreActive) {
        const rel = genreRelevance(input.primaryGenre!, t.genre ?? '', t.lastfmTags ?? []);
        if (rel.tier === 'exact') exactGenreCount++;
        if (gigSuper !== 'other' && superFamily(t.genre ?? '', t.lastfmTags ?? []) === gigSuper) superFamilyCount++;
      }
      if (!matchesEra(t) || !anchor.pass(t)) continue;
      if (genreActive) {
        const tags = t.lastfmTags ?? [];
        const inGenre = passesGenreGate(input.primaryGenre!, t.genre ?? '', tags)
          || (!!input.secondaryGenre && passesGenreGate(input.secondaryGenre, t.genre ?? '', tags));
        if (!inGenre) continue; // out of the gig's genre family (and its bridges) → excluded
      }
      poolCount++;
      if (t.year != null) poolWithYear++;
    }

    if (playlistMode) {
      // The DJ curated the pool, so no genre super-family floor — just make sure
      // enough tracks survive any era/artist/genre narrowing to build the duration.
      const floor = Math.min(target, 8); // don't block short sets
      if (poolCount < floor) {
        const narrowed = genreActive || eraActive || anchor.active;
        throw new SetlistInputError(
          narrowed
            ? `Only ${poolCount} track${poolCount === 1 ? '' : 's'} in your "${input.sourcePlaylist}" playlist match your filters — too few for a ${input.durationMinutes}-minute set. Loosen a filter or pick a shorter duration.`
            : `Your "${input.sourcePlaylist}" playlist has only ${poolCount} track${poolCount === 1 ? '' : 's'} — too few to build a ${input.durationMinutes}-minute set. Add more tracks to the playlist, or pick a shorter duration.`,
        );
      }
    } else {
      // Genre super-family floor: fail fast if the library can't support the gig's
      // super-family at all (e.g. Trance with an all-hip-hop library).
      if (genreActive && gigSuper !== 'other' && superFamilyCount < MIN_SUPERFAMILY_TRACKS) {
        throw new SetlistInputError(
          `Not enough tracks for a ${input.primaryGenre} set — your library has only ${superFamilyCount} ${gigSuper} track${superFamilyCount === 1 ? '' : 's'}. Import more ${input.primaryGenre} (or related) music and try again.`,
        );
      }
      // Combined-pool floor: even if the genre is well-stocked, the era/artist
      // intersection may be too thin to fill the set.
      if (poolCount < target) {
        throw new SetlistInputError(poolFloorError(input, poolCount));
      }
    }

    onProgress?.({ type: 'step', step: 2, message: 'Architecting the set structure...' });
    const { gigIntel: intel, blueprint } = await runGigBlueprint(profile, input, target, signal, onUsage);

    onProgress?.({ type: 'step', step: 3, message: 'Selecting and sequencing tracks...' });
    const filtered = filterTracksForGig(pool, blueprint, input, affinity);

    const reviewed = await runSelectorReviewer(input, filtered, blueprint, intel, recentlyPlayed, affinity, signal, onUsage);

    onProgress?.({ type: 'step', step: 4, message: 'Reviewing transitions and flow...' });

    // Honesty: if there aren't enough true-genre tracks to fill the set, say the set
    // leans on adjacent genres rather than pretend it's pure. (Only when a genre axis
    // is active; no genre gate in playlist mode.)
    let reviewNotes = reviewed.reviewNotes;
    if (!playlistMode && genreActive && exactGenreCount < reviewed.tracks.length) {
      reviewNotes += `\n\nNote: your library has only ${exactGenreCount} true ${input.primaryGenre} track${exactGenreCount === 1 ? '' : 's'}, so this set is built largely from adjacent ${gigSuper} genres. Import more ${input.primaryGenre} for a truer ${input.primaryGenre} set.`;
    }
    // Parallel honesty for the era axis: if much of the pool lacked release-year data,
    // the era filter only saw the tracks we could date.
    if (eraActive && poolWithYear < reviewed.tracks.length) {
      reviewNotes += `\n\nNote: only ${poolWithYear} of your matched tracks carry release-year data, so this ${eraLabel(input.eras!)} set is built from the tracks we could date — re-sync your library with year metadata for tighter era targeting.`;
    }
    // Transparency for artist top-up: the anchor artist didn't have enough tracks,
    // so we widened to Last.fm similar artists. Say which ones and how many anchors fit.
    if (input.similarArtists?.length && input.artists?.length) {
      const anchorPred = makeArtistPredicate(input);
      const anchorInSet = reviewed.tracks.filter(t => anchorPred.isAnchor(t)).length;
      const shown = input.similarArtists.slice(0, 5);
      const more = input.similarArtists.length > shown.length ? ', and more' : '';
      reviewNotes += `\n\nOnly ${anchorInSet} track${anchorInSet === 1 ? '' : 's'} by ${artistLabel(input.artists)} fit — filled the rest with similar artists (${artistLabel(shown)}${more}).`;
    }

    return {
      name: input.name || 'Untitled Set',
      tracks: reviewed.tracks,
      reviewNotes,
      shareSlug: generateSlug(input.name || 'set'),
    };
  } catch (err) {
    if (isTimeoutOrAbort(err)) {
      throw new Error(
        'Setlist generation timed out. Your library may be large or the service is busy — please try again.',
      );
    }
    throw err;
  } finally {
    clearTimeout(deadline);
  }
}
