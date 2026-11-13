// Per-DJ taste learning — closes the post-gig feedback loop.
//
// After each gig, `POST /api/gigs/[id]/reflect` stores a planned-vs-actual `diff[]`
// in `gig_history.reflection_json`. That data is the DJ's real behavior: which
// suggested tracks they keep dropping, and which tracks they always reach for that
// we never suggested. This module aggregates those diffs across a DJ's recent gigs
// into a bounded affinity map that re-ranks the candidate pool in
// `filterTracksForGig` — so the loop gets better with every gig reflected on.
//
// Design constraints (deliberate):
// - Per-DJ only. Callers pass one user's diffs; no cross-user data enters here.
// - Bounded + damped. Scores are clamped so affinity only re-ranks WITHIN the
//   genre-relevant pool; it can never rescue an off-genre track or hard-exclude
//   one. A single gig can't dominate (needs ≥2-gig corroboration to matter).
// - Pure. No I/O, no imports — trivially unit-testable.

// Mirror of the reflection diff shape written by src/app/api/gigs/[id]/reflect/route.ts.
// Kept local so this module stays dependency-free.
export interface DiffEntry {
  position: number;
  planned: { artist: string; title: string; energyLevel: number } | null;
  actual: { artist: string; title: string } | null;
  status: 'matched' | 'swapped' | 'skipped' | 'added';
}

export interface TasteAffinity {
  gigsAnalyzed: number;
  trackScores: Record<string, number>; // "artist — title" (lowercased) → signed, bounded [-3, +3]
  artistScores: Record<string, number>; // artist (lowercased) → signed, bounded [-1.5, +1.5]
  goTos: Array<{ artist: string; title: string; count: number }>; // played-but-never-planned, ≥2 gigs
  droppedOften: Array<{ artist: string; title: string; count: number }>; // planned-but-dropped, ≥2 gigs
}

const TRACK_BOUND = 3;
const ARTIST_BOUND = 1.5;
const MIN_GIGS_TO_QUALIFY = 2; // a track must show the same behavior in ≥2 gigs to earn a strong score

// Per-event weights. `added` (a track the DJ played that we never suggested) is the
// strongest positive — it's their go-to we keep missing. `matched` is a mild
// confirmation. Negatives come from planned tracks the DJ dropped.
const TRACK_WEIGHT = { added: 1.5, swappedIn: 1.0, matched: 0.25, skipped: -1.0, swappedOut: -1.0 };
const ARTIST_WEIGHT = { added: 0.5, swappedIn: 0.4, matched: 0.1 };

function trackKey(artist: string, title: string): string {
  return `${artist.toLowerCase().trim()} — ${title.toLowerCase().trim()}`;
}
function artistKey(artist: string): string {
  return artist.toLowerCase().trim();
}
function clamp(n: number, bound: number): number {
  return Math.max(-bound, Math.min(bound, n));
}

interface TrackAgg {
  artist: string;
  title: string;
  raw: number; // accumulated weighted signal
  posGigs: Set<number>; // gig indices contributing positive signal
  negGigs: Set<number>; // gig indices contributing negative signal
  addedCount: number; // times played-but-never-planned
  droppedCount: number; // times planned-but-skipped/swapped-out
}

// diffs: one entry per gig, each the `reflection_json.diff[]` array for that gig.
export function computeAffinity(diffs: DiffEntry[][]): TasteAffinity {
  const gigsAnalyzed = diffs.length;
  const empty: TasteAffinity = { gigsAnalyzed, trackScores: {}, artistScores: {}, goTos: [], droppedOften: [] };

  // Below the corroboration threshold we don't personalize at all — one or two data
  // points aren't a taste, and the cold-start path must stay identical to today.
  if (gigsAnalyzed < MIN_GIGS_TO_QUALIFY) return empty;

  const tracks = new Map<string, TrackAgg>();
  const artistRaw = new Map<string, { artist: string; raw: number }>();

  const bumpArtist = (artist: string, delta: number) => {
    if (!artist.trim()) return;
    const k = artistKey(artist);
    const cur = artistRaw.get(k) ?? { artist, raw: 0 };
    cur.raw += delta;
    artistRaw.set(k, cur);
  };
  const track = (artist: string, title: string): TrackAgg => {
    const k = trackKey(artist, title);
    let agg = tracks.get(k);
    if (!agg) {
      agg = { artist, title, raw: 0, posGigs: new Set(), negGigs: new Set(), addedCount: 0, droppedCount: 0 };
      tracks.set(k, agg);
    }
    return agg;
  };

  diffs.forEach((gigDiff, gigIdx) => {
    for (const d of gigDiff) {
      switch (d.status) {
        case 'added': // played, never planned → strong positive (the DJ's go-to)
          if (d.actual) {
            const a = track(d.actual.artist, d.actual.title);
            a.raw += TRACK_WEIGHT.added; a.posGigs.add(gigIdx); a.addedCount++;
            bumpArtist(d.actual.artist, ARTIST_WEIGHT.added);
          }
          break;
        case 'swapped': // planned-out negative, actual-in positive
          if (d.planned) {
            const p = track(d.planned.artist, d.planned.title);
            p.raw += TRACK_WEIGHT.swappedOut; p.negGigs.add(gigIdx); p.droppedCount++;
          }
          if (d.actual) {
            const a = track(d.actual.artist, d.actual.title);
            a.raw += TRACK_WEIGHT.swappedIn; a.posGigs.add(gigIdx);
            bumpArtist(d.actual.artist, ARTIST_WEIGHT.swappedIn);
          }
          break;
        case 'skipped': // planned, not played → negative
          if (d.planned) {
            const p = track(d.planned.artist, d.planned.title);
            p.raw += TRACK_WEIGHT.skipped; p.negGigs.add(gigIdx); p.droppedCount++;
          }
          break;
        case 'matched': // suggestion landed → mild positive
          if (d.planned) {
            const p = track(d.planned.artist, d.planned.title);
            p.raw += TRACK_WEIGHT.matched; p.posGigs.add(gigIdx);
            bumpArtist(d.planned.artist, ARTIST_WEIGHT.matched);
          }
          break;
      }
    }
  });

  // Global damping: with few gigs on record, scale everything down so a thin history
  // nudges rather than dictates. Reaches full strength at 3 gigs.
  const damp = Math.min(gigsAnalyzed, 3) / 3;

  const trackScores: Record<string, number> = {};
  const goTos: TasteAffinity['goTos'] = [];
  const droppedOften: TasteAffinity['droppedOften'] = [];

  for (const [k, agg] of tracks) {
    // A track only earns a meaningful score once its dominant behavior repeats across
    // ≥2 gigs; otherwise damp it hard so one-off swaps barely move the needle.
    const corroboration = Math.max(agg.posGigs.size, agg.negGigs.size);
    const corroborationFactor = corroboration >= MIN_GIGS_TO_QUALIFY ? 1 : 0.25;
    const score = clamp(agg.raw * damp * corroborationFactor, TRACK_BOUND);
    if (Math.abs(score) >= 0.01) trackScores[k] = score;

    if (agg.addedCount >= MIN_GIGS_TO_QUALIFY) {
      goTos.push({ artist: agg.artist, title: agg.title, count: agg.addedCount });
    }
    if (agg.droppedCount >= MIN_GIGS_TO_QUALIFY) {
      droppedOften.push({ artist: agg.artist, title: agg.title, count: agg.droppedCount });
    }
  }

  const artistScores: Record<string, number> = {};
  for (const [k, { raw }] of artistRaw) {
    const score = clamp(raw * damp, ARTIST_BOUND);
    if (Math.abs(score) >= 0.01) artistScores[k] = score;
  }

  goTos.sort((a, b) => b.count - a.count);
  droppedOften.sort((a, b) => b.count - a.count);

  return { gigsAnalyzed, trackScores, artistScores, goTos, droppedOften };
}

// Key a library track the same way computeAffinity keys its scores. Exposed so the
// pipeline looks up affinity with identical normalization.
export function affinityTrackKey(artist: string, title: string): string {
  return trackKey(artist, title);
}
export function affinityArtistKey(artist: string): string {
  return artistKey(artist);
}
