// Shared "set readiness" model — the single source of truth for whether a DJ's
// library has enough tracks to build a good set for a given genre + duration.
//
// Two distinct numbers:
//   - TARGET  = how many tracks the generated set contains (fills the slot).
//   - USABLE  = how many library tracks qualify for the gig genre(s).
// Readiness judges USABLE against TARGET with CURATION HEADROOM — a library that
// has exactly enough tracks to fill the slot *is* the whole set (no room for the
// AI or the DJ to choose). A healthy library gives options.
//
// Pure, no I/O. Imported by both the pre-gen readiness endpoint and the backend
// pipeline so the pre-gen hint and the backend hard-fail can never drift.

import { superFamily } from './genre';

export const MIN_SUPERFAMILY_TRACKS = 20;   // backend hard-fail floor (pipeline.ts)
// EFFECTIVE minutes of airtime per track — already discounted for blend overlap, so
// it's shorter than a track's file length (DJs mix in/out; a 6-min file gets ~3 min
// solo). This is the base/default; minutesPerTrack() adjusts it by genre. Mirrors the
// blueprint rule in prompts.ts.
export const MINUTES_PER_TRACK = 3;
export const CURATE_HEADROOM = 2.5;         // GREEN needs 2.5× the set size ("room to curate")

// Genres that let tracks breathe (fewer transitions, longer per-track airtime).
const SLOW_GENRE = /\b(lounge|down\s?tempo|chill(?:out)?|ambient|jazz|bossa)\b/i;

/** Effective minutes of airtime per track for a gig's primary genre, accounting for
 *  how that style is typically mixed:
 *    - open-format (hip-hop / top 40 / mashups): fast cuts → ~2.5 min
 *    - electronic (house / techno / trance) & default: continuous blends → 3 min
 *    - lounge / downtempo / ambient / jazz: tracks breathe → 4 min
 *  Undefined genre falls back to the base. */
export function minutesPerTrack(genre?: string): number {
  const g = genre?.trim();
  if (!g) return MINUTES_PER_TRACK;
  if (SLOW_GENRE.test(g)) return 4;
  if (superFamily(g) === 'open-format') return 2.5;
  return MINUTES_PER_TRACK; // electronic + other
}

/** How many tracks a set of the given duration contains. Mirrors the blueprint's
 *  `totalTracks = min(targetTrackCount, …)` rule; pace varies by genre. */
export function targetTrackCount(durationMinutes: number, genre?: string): number {
  return Math.max(1, Math.ceil(durationMinutes / minutesPerTrack(genre)));
}

export type ReadinessStatus = 'red' | 'amber' | 'green' | 'unknown';

export interface ReadinessCounts {
  exact: number;       // true-genre matches
  family: number;      // same fine-family
  adjacent: number;    // same super-family
  superFamily: number; // total in the gig's super-family
  usable: number;      // combined-pool survivors — tracks passing every active axis (genre/era/artist)
  withYear: number;    // of the combined pool, how many carry a non-null release year (era coverage)
  poolTotal: number;   // library tracks scanned before genre scoring (base pool after era/artist filters)
  untagged?: number;   // of the combined pool, tracks with no usable genre tag but a BPM (placed by tempo)
}

export interface ReadinessResult {
  status: ReadinessStatus;
  reason?: string;              // e.g. 'no-auth', 'no-library'
  counts: ReadinessCounts;
  target: number;
  threshold: number;            // MIN_SUPERFAMILY_TRACKS — echoed so UI copy stays in sync
}

const EMPTY_COUNTS: ReadinessCounts = { exact: 0, family: 0, adjacent: 0, superFamily: 0, usable: 0, withYear: 0, poolTotal: 0 };

/** Build an 'unknown' result (no auth / no library) — the builder falls back to
 *  its existing demo-library messaging when it sees this. */
export function unknownReadiness(reason: string): ReadinessResult {
  return { status: 'unknown', reason, counts: { ...EMPTY_COUNTS }, target: 0, threshold: MIN_SUPERFAMILY_TRACKS };
}

/**
 * Classify a library's readiness for a gig. First matching tier wins.
 *   RED   — can't fill the slot honestly: below the super-family floor, or fewer
 *           usable tracks than the set even needs.
 *   AMBER — buildable but no room to curate (usable < headroom×target), or the set
 *           will lean on adjacent genres (few true-genre tracks).
 *   GREEN — real headroom to curate and keep future sets fresh.
 *
 * @param gigSuperIsOther true when the gig genre's super-family is 'other'
 *        (open-format / unmapped) — the <20 electronic-vs-open floor doesn't apply.
 * @param opts.genreActive  whether a genre axis is in play (default true, preserving
 *        legacy callers). When false, the genre-specific triggers (super-family floor,
 *        "few true-genre tracks") are skipped — an era-only or artist-only pool has no genre.
 * @param opts.eraActive    whether an era axis is in play. When true, a pool thin on
 *        year-dated tracks (withYear < headroom×target) drops to AMBER.
 */
export function classifyReadiness(
  counts: ReadinessCounts,
  target: number,
  gigSuperIsOther: boolean,
  opts: { genreActive?: boolean; eraActive?: boolean } = {},
): ReadinessResult {
  const { genreActive = true, eraActive = false } = opts;
  let status: ReadinessStatus;

  // Untagged tracks with a BPM count toward the super-family floor, mirroring the
  // pipeline: they can't be ruled out, and the set's tempo window places them.
  const familyPool = counts.superFamily + (counts.untagged ?? 0);
  if ((genreActive && !gigSuperIsOther && familyPool < MIN_SUPERFAMILY_TRACKS) || counts.usable < target) {
    status = 'red';
  } else if (
    counts.usable < target * CURATE_HEADROOM ||
    (genreActive && counts.exact < target) ||
    (eraActive && counts.withYear < target * CURATE_HEADROOM)
  ) {
    status = 'amber';
  } else {
    status = 'green';
  }

  return { status, counts, target, threshold: MIN_SUPERFAMILY_TRACKS };
}
