// Match Serato database paths to the files a DJ picked in the browser, and
// turn Serato's volume-relative paths back into absolute ones for Rekordbox.
//
// Serato stores paths relative to the volume root ("Users/kel/Music/x.mp3",
// "_sDJ Music/x.mp3" on an external drive), though some libraries carry
// absolute forms ("/Users/…", "/Volumes/…", "/C:/…"). A browser folder pick
// gives paths relative to the picked folder ("Music/House/x.mp3"). The longest
// shared path suffix pairs the two, and is robust to the DJ picking ~/Music,
// a subfolder, or the whole drive.

/** Comparable form: forward slashes, no file:// or leading slash, lowercased
 *  (macOS and Windows file systems are case-insensitive by default). */
export function normalizeRelPath(p: string): string {
  let s = p.trim();
  if (s.startsWith('file://')) {
    s = s.replace(/^file:\/\/(localhost)?/, '');
    try { s = decodeURIComponent(s); } catch { /* keep as-is */ }
  }
  return s.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function segments(p: string): string[] {
  return normalizeRelPath(p).split('/').filter(Boolean);
}

/** Map every path suffix of each picked file to its index (-1 when two picked
 *  files share that suffix, so it can't decide a match on its own). */
export function buildPickIndex(pickedRelPaths: string[]): Map<string, number> {
  const index = new Map<string, number>();
  pickedRelPaths.forEach((rel, i) => {
    const segs = segments(rel);
    for (let k = segs.length - 1; k >= 0; k--) {
      const suffix = segs.slice(k).join('/');
      const prev = index.get(suffix);
      index.set(suffix, prev === undefined || prev === i ? i : -1);
    }
  });
  return index;
}

/**
 * Index of the picked file for a Serato path, by the longest shared suffix that
 * points at exactly one picked file. A bare filename counts, as long as only
 * one picked file has it. null = not found in the pick (or ambiguous).
 */
export function matchSeratoPath(seratoPath: string, index: Map<string, number>): number | null {
  const segs = segments(seratoPath);
  for (let k = 0; k < segs.length; k++) {
    const hit = index.get(segs.slice(k).join('/'));
    if (hit !== undefined) return hit >= 0 ? hit : null;
  }
  return null;
}

const DRIVE = /^\/?[A-Za-z]:[/\\]/;

/** True when the Serato path already names its volume (macOS /Users, /Volumes,
 *  or a Windows drive letter), so no library root needs prefixing. */
export function isAbsoluteSeratoPath(p: string): boolean {
  return DRIVE.test(p) || p.startsWith('/');
}

/**
 * Absolute path for Rekordbox's Location. `root` is where the Serato volume is
 * mounted: '' for the macOS system drive, '/Volumes/<Name>' for a macOS
 * external, 'C:' / 'D:' on Windows. Already-absolute paths pass through.
 */
export function resolveAbsolutePath(seratoPath: string, root: string): string {
  const p = seratoPath.trim().replace(/\\/g, '/');
  if (isAbsoluteSeratoPath(p)) return p;
  const r = root.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return `${r}/${p}`;
}

export type ClientPlatform = 'mac' | 'windows' | 'other';

export function detectPlatform(userAgent: string): ClientPlatform {
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'mac';
  return 'other';
}

/**
 * Best guess at the library root, for the editable "Library location" field.
 * Paths under Users/ or home/ live on the system drive; anything else is on an
 * external drive, which on macOS mounts at /Volumes/<drive name> — usually the
 * folder the DJ picked when they chose the whole drive.
 */
export function guessLibraryRoot(sampleSeratoPath: string, platform: ClientPlatform, pickedTopFolder: string): string {
  const onSystemDrive = /^(users|home)\//i.test(normalizeRelPath(sampleSeratoPath));
  if (platform === 'windows') return onSystemDrive ? 'C:' : 'D:';
  return onSystemDrive ? '' : `/Volumes/${pickedTopFolder}`;
}
