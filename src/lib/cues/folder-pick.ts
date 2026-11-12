// Make sense of one browser folder pick (`<input webkitdirectory>`): find the
// Serato database and crates, and the audio files. Pure — takes the relative
// paths the browser reports, returns indexes into the same list.
//
// Serato keeps `_Serato_/` inside ~/Music on the system drive and at the root
// of each external drive, so picking Music (or the drive) gets the database,
// the crates AND the audio in one go.

import { isLocalFilePath } from '@/lib/setdrop/file-path';

export interface PickLayout {
  /** Index of `_Serato_/database V2`, or null when the pick has none. */
  dbIndex: number | null;
  /** Indexes of `_Serato_/Subcrates/*.crate` belonging to that database. */
  crateIndexes: number[];
  /** Indexes of audio files outside `_Serato_/`. */
  audioIndexes: number[];
  /** First path segment — the name of the folder the DJ picked. */
  topFolder: string;
}

const segs = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean);

export function analysePick(relPaths: string[]): PickLayout {
  let dbIndex: number | null = null;
  let dbDepth = Infinity;
  let dbSeratoDir = '';
  const crateCandidates: { i: number; seratoDir: string }[] = [];
  const audioIndexes: number[] = [];

  relPaths.forEach((rel, i) => {
    const s = segs(rel);
    const name = s[s.length - 1] ?? '';
    if (name.startsWith('._')) return; // macOS AppleDouble stubs on exFAT drives
    const seratoAt = s.findIndex(x => x.toLowerCase() === '_serato_');
    if (seratoAt >= 0) {
      const seratoDir = s.slice(0, seratoAt + 1).join('/').toLowerCase();
      const rest = s.slice(seratoAt + 1).map(x => x.toLowerCase());
      // The shallowest database wins: a backup copy deeper in the tree
      // (e.g. "Music/Old/_Serato_") must not shadow the live one.
      if (rest.length === 1 && rest[0] === 'database v2' && seratoAt < dbDepth) {
        dbIndex = i; dbDepth = seratoAt; dbSeratoDir = seratoDir;
      } else if (rest.length === 2 && rest[0] === 'subcrates' && rest[1].endsWith('.crate')) {
        crateCandidates.push({ i, seratoDir });
      }
      return;
    }
    if (isLocalFilePath(rel)) audioIndexes.push(i);
  });

  return {
    dbIndex,
    crateIndexes: crateCandidates.filter(c => c.seratoDir === dbSeratoDir).map(c => c.i),
    audioIndexes,
    topFolder: segs(relPaths[0] ?? '')[0] ?? '',
  };
}
