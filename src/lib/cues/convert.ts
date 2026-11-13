// Assemble a Serato → Rekordbox conversion: database tracks + crate tree +
// per-file cue scans → one Rekordbox collection XML. Pure, so the wizard, the
// export toggle and tests all share it.

import type { LibraryTrack } from '@/lib/agents/types';
import { isLocalFilePath } from '@/lib/setdrop/file-path';
import { CrateNode } from './serato/crate-reader';
import { normalizeRelPath, resolveAbsolutePath } from './match';
import { convertSeratoToRekordbox } from './offset';
import { buildRekordboxLibraryXml, kindForPath, RbPlaylistNode, RbTrack } from './rekordbox-library-xml';
import { MarkOptions } from './rekordbox-marks';
import { ScannedFile } from './scan';

export const CONVERT_FOLDER_NAME = 'Serato (SetLab)';

export interface ConvertInput {
  /** Tracks from `database V2` (parseSeratoDatabase). */
  dbTracks: LibraryTrack[];
  crates: CrateNode[];
  /** Scan results keyed by the Serato path of the track they belong to. */
  scans: Map<string, ScannedFile>;
  /** Library root — see resolveAbsolutePath. */
  root: string;
  /** When given, only these Serato paths are exported (and crates are pruned to them). */
  selected?: Set<string>;
  markOpts?: MarkOptions;
  /** Carry Serato track colours (snapped to Rekordbox's palette). Default true. */
  trackColours?: boolean;
}

export interface ConvertStats {
  tracks: number;
  tracksWithCues: number;
  cues: number;
  /** Local tracks exported without a scan (not in the pick). */
  notScanned: number;
  /** Streaming references (no local file) — left in Serato. */
  streaming: number;
  playlists: number;
}

export function convertSeratoLibrary(input: ConvertInput): { xml: string; stats: ConvertStats } {
  const { dbTracks, crates, scans, root, selected, markOpts = {}, trackColours = true } = input;
  const stats: ConvertStats = { tracks: 0, tracksWithCues: 0, cues: 0, notScanned: 0, streaming: 0, playlists: 0 };

  const rbTracks: RbTrack[] = [];
  const idByPath = new Map<string, number>();

  for (const t of dbTracks) {
    const path = t.filePath;
    if (!path) continue;
    if (selected && !selected.has(path)) continue;
    if (!isLocalFilePath(path)) { stats.streaming++; continue; }
    const key = normalizeRelPath(path);
    if (idByPath.has(key)) continue; // same file listed twice in the DB

    const scan = scans.get(path);
    const tc = scan?.cues;
    const cues = tc?.cues.length ? convertSeratoToRekordbox(tc.cues, tc.mp3) : undefined;
    const id = rbTracks.length + 1;
    idByPath.set(key, id);
    rbTracks.push({
      id,
      location: resolveAbsolutePath(path, root),
      name: t.title,
      artist: t.artist,
      genre: t.genre,
      year: t.year,
      bpm: t.bpm || undefined,
      tonality: t.key || undefined,
      comment: tc?.comment,
      kind: kindForPath(path),
      sizeBytes: scan?.size,
      durationMs: scan?.durationMs || undefined,
      sampleRate: tc?.mp3?.sampleRate,
      cues,
      trackColor: trackColours ? tc?.trackColor : null,
    });
    if (!scan) stats.notScanned++;
    if (cues?.length) { stats.tracksWithCues++; stats.cues += cues.length; }
  }
  stats.tracks = rbTracks.length;

  const toNode = (c: CrateNode): RbPlaylistNode | null => {
    const trackIds = c.tracks
      .map(p => idByPath.get(normalizeRelPath(p)))
      .filter((id): id is number => id !== undefined);
    const children = c.children.map(toNode).filter((n): n is RbPlaylistNode => n !== null);
    if (!trackIds.length && !children.length) return null;
    if (trackIds.length) stats.playlists++;
    return { name: c.name, trackIds, children };
  };
  const tree = crates.map(toNode).filter((n): n is RbPlaylistNode => n !== null);
  const playlists = tree.length ? [{ name: CONVERT_FOLDER_NAME, children: tree }] : [];

  return { xml: buildRekordboxLibraryXml(rbTracks, playlists, markOpts), stats };
}
