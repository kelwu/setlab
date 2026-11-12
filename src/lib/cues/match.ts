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

/**
 * Index each picked file under its full relative path and under that path
 * minus the picked folder's own name ("Music/House/a.mp3" → also
 * "House/a.mp3"). Nothing shorter: DJs keep copies of the same song in several
 * folders, often with different cues, so a bare-filename match would silently
 * export the wrong copy's cues. -1 marks a key two picked files share.
 */
export function buildPickIndex(pickedRelPaths: string[]): Map<string, number> {
  const index = new Map<string, number>();
  pickedRelPaths.forEach((rel, i) => {
    const segs = segments(rel);
    const keys = new Set([segs.join('/'), segs.slice(1).join('/')].filter(Boolean));
    for (const key of keys) {
      const prev = index.get(key);
      index.set(key, prev === undefined || prev === i ? i : -1);
    }
  });
  return index;
}

/**
 * Index of the picked file for a Serato path: the Serato path must END with the
 * picked file's whole path inside the picked folder. null = not in the pick
 * (Serato wouldn't find it there either) or ambiguous.
 */
export function matchSeratoPath(seratoPath: string, index: Map<string, number>): number | null {
  const segs = segments(seratoPath);
  for (let k = 0; k < segs.length; k++) {
    const hit = index.get(segs.slice(k).join('/'));
    if (hit !== undefined) return hit >= 0 ? hit : null;
  }
  return null;
}

/**
 * Match a whole library at once. Per-track matching can't tell two folders with
 * the same name apart ("Users/kel/Music/x.mp3" vs "Users/kel/OneDrive/Music/x.mp3"
 * when the DJ picked the first), so: match each track, find the Serato path
 * prefix most matches share (= where the picked folder lives), then keep only
 * matches with that prefix. Returns Serato path → picked index.
 */
export function matchLibrary(seratoPaths: string[], pickedRelPaths: string[]): Map<string, number> {
  const index = buildPickIndex(pickedRelPaths);
  const pickedSegs = pickedRelPaths.map(segments);
  const hits: { path: string; pick: number; prefix: string }[] = [];
  const votes = new Map<string, number>();

  for (const path of seratoPaths) {
    const pick = matchSeratoPath(path, index);
    if (pick === null) continue;
    // The Serato path is <prefix>/<picked path, possibly minus its top folder>.
    // Normalise the prefix to "what sits above the picked folder".
    const s = segments(path);
    const p = pickedSegs[pick];
    const withTop = s.slice(-p.length).join('/') === p.join('/');
    const prefix = s.slice(0, s.length - (withTop ? p.length : p.length - 1)).join('/') + (withTop ? '' : '/?');
    hits.push({ path, pick, prefix });
    votes.set(prefix, (votes.get(prefix) ?? 0) + 1);
  }

  let root = '';
  let best = -1;
  for (const [prefix, n] of votes) if (n > best) { best = n; root = prefix; }

  const out = new Map<string, number>();
  for (const h of hits) if (h.prefix === root) out.set(h.path, h.pick);
  return out;
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
