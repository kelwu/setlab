// Attach stored cue scans (track_cues) to the tracks of a SetLab set/crate
// export. Pure, so the API route and tests share it.
//
// The library a DJ uploaded and the folder they scanned in /convert don't
// always come from the same machine: in practice the paths differ by user
// folder ("Users/kel/…" vs "Users/kelwu/…") and even by a punctuation change in
// a folder name. So matching goes from strict to loose and stops at the first
// unambiguous hit:
//   1. the same path (case-insensitive)
//   2. the same parent folder + filename, compared on letters/digits only
//   3. the same artist|title key, when only one stored scan has it — or, if
//      several do, the one whose filename also matches
// A duration check rejects a hit when both sides know the length and they
// disagree, which catches a different edit/version filed under the same tags.

import { trackKey } from '@/lib/setdrop/rekordbox-parser';
import { normalizeRelPath } from './match';
import { convertSeratoToRekordbox } from './offset';
import { CuePoint, Rgb, TrackCues } from './types';

export interface CueLookupRequest {
  filePath: string;
  artist: string;
  title: string;
  /** Seconds, when the library knows it. */
  durationSec?: number;
}

export interface StoredCueRow {
  file_path: string;
  track_key: string | null;
  cues: TrackCues;
  size_bytes: number | null;
  duration_ms: number | null;
}

/** What an export needs to write a Rekordbox TRACK with working hot cues. */
export interface ExportCue {
  /** Already shifted into Rekordbox's timebase. */
  cues: CuePoint[];
  sizeBytes?: number;
  durationMs?: number;
  sampleRate?: number;
  trackColor?: Rgb | null;
}

const DURATION_TOLERANCE_MS = 2000;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function segments(p: string): string[] {
  return normalizeRelPath(p).split('/').filter(Boolean);
}

/** Parent folder + filename on letters/digits only, e.g. "darumaplaylist/coverg…mp3". */
function tailKey(p: string): string {
  const s = segments(p);
  return s.length >= 2 ? `${squash(s[s.length - 2])}/${squash(s[s.length - 1])}` : '';
}

function fileKey(p: string): string {
  const s = segments(p);
  return s.length ? squash(s[s.length - 1]) : '';
}

function durationOk(req: CueLookupRequest, row: StoredCueRow): boolean {
  if (!req.durationSec || !row.duration_ms) return true;
  return Math.abs(req.durationSec * 1000 - row.duration_ms) <= DURATION_TOLERANCE_MS;
}

function uniqueBy(rows: StoredCueRow[], key: (r: StoredCueRow) => string): Map<string, StoredCueRow | null> {
  const m = new Map<string, StoredCueRow | null>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, m.has(k) ? null : r); // null = two stored scans share this key
  }
  return m;
}

export function toExportCue(row: StoredCueRow): ExportCue | null {
  const tc = row.cues;
  if (!tc?.cues?.length) return null;
  return {
    cues: convertSeratoToRekordbox(tc.cues, tc.mp3),
    sizeBytes: row.size_bytes ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    sampleRate: tc.mp3?.sampleRate,
    trackColor: tc.trackColor,
  };
}

/** One result per request, in order; null where no stored scan matched (or it had no cues). */
export function matchStoredCues(requests: CueLookupRequest[], rows: StoredCueRow[]): (ExportCue | null)[] {
  const byPath = uniqueBy(rows, r => normalizeRelPath(r.file_path));
  const byTail = uniqueBy(rows, r => tailKey(r.file_path));
  const byKey = new Map<string, StoredCueRow[]>();
  for (const r of rows) {
    if (!r.track_key) continue;
    const list = byKey.get(r.track_key) ?? [];
    list.push(r);
    byKey.set(r.track_key, list);
  }

  return requests.map(req => {
    const pick = (r: StoredCueRow | null | undefined) => (r && durationOk(req, r) ? r : null);

    let hit = pick(byPath.get(normalizeRelPath(req.filePath)));
    if (!hit) { const t = tailKey(req.filePath); hit = t ? pick(byTail.get(t)) : null; }
    if (!hit && (req.artist || req.title)) {
      const same = (byKey.get(trackKey(req.artist, req.title)) ?? []).filter(r => durationOk(req, r));
      if (same.length === 1) hit = same[0];
      else if (same.length > 1) {
        const f = fileKey(req.filePath);
        const byFile = same.filter(r => fileKey(r.file_path) === f);
        if (byFile.length === 1) hit = byFile[0];
      }
    }
    return hit ? toExportCue(hit) : null;
  });
}
