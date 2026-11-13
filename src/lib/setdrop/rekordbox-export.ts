import { LibraryTrack } from '@/lib/agents/types';
import { SetlistTrack } from '@/lib/agents/types';
import { BRAND } from '../brand';
import { isLocalFilePath } from './file-path';
import { buildRekordboxLibraryXml, kindForPath, RbTrack, toRekordboxLocation } from '@/lib/cues/rekordbox-library-xml';
import type { ExportCue } from '@/lib/cues/lookup';

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Exact normalized match first; fuzzy fallback handles AI-added "feat. X" or minor title differences
function findLibraryTrack(artist: string, title: string, library: LibraryTrack[]): LibraryTrack | undefined {
  const na = normalize(artist);
  const nt = normalize(title);
  const exact = library.find(l => normalize(l.artist) === na && normalize(l.title) === nt);
  if (exact) return exact;
  return library.find(l => {
    const la = normalize(l.artist);
    const lt = normalize(l.title);
    const artistMatch = la === na || la.startsWith(na) || na.startsWith(la);
    const titleMatch = lt === nt || lt.startsWith(nt) || nt.startsWith(lt);
    return artistMatch && titleMatch;
  });
}

export { toRekordboxLocation };

export interface RekordboxXmlOptions {
  /** Hot cues per library file path (from /api/cues/lookup). Pro only. */
  cues?: Map<string, ExportCue>;
}

/** The library tracks an export will contain, in set order (local files only). */
export function matchExportTracks(tracks: SetlistTrack[], library: LibraryTrack[]): LibraryTrack[] {
  const out: LibraryTrack[] = [];
  for (const t of tracks) {
    const found = findLibraryTrack(t.artist, t.title, library);
    if (found?.filePath && isLocalFilePath(found.filePath)) out.push(found);
  }
  return out;
}

export function buildRekordboxXml(
  setlistName: string,
  tracks: SetlistTrack[],
  library: LibraryTrack[],
  opts: RekordboxXmlOptions = {},
): { xml: string; matched: number; skipped: number; withCues: number } {
  // Match setlist tracks to library file paths. We also carry the matched library
  // track's genre/year: the SetlistTrack itself has neither (see types.ts), but the
  // Rekordbox XML embeds metadata inline, so pulling them from the library entry is
  // what makes genre — a field DJs sort/filter on — actually populate on import.
  const rbTracks: RbTrack[] = [];
  let found = 0;
  let withCues = 0;

  for (const t of tracks) {
    const lib = findLibraryTrack(t.artist, t.title, library);
    if (!lib) continue;
    found++;
    const filePath = lib.filePath ?? '';
    // Skip streaming references (SoundCloud/TIDAL/etc.) — they have no local file to
    // point Rekordbox at, so including them produces broken "missing file" entries.
    if (!isLocalFilePath(filePath)) continue;
    const cue = opts.cues?.get(filePath);
    const year = Number(lib.year);
    rbTracks.push({
      id: rbTracks.length + 1,
      location: filePath,
      name: t.title,
      artist: t.artist,
      genre: lib.genre || undefined,
      year: Number.isFinite(year) && year > 0 ? year : undefined,
      bpm: t.bpm || undefined,
      tonality: t.key || undefined,
      // Rekordbox shows no hot cues on an XML track without its real length,
      // size and kind (Phase 0) — so those come with the cues.
      ...(cue ? {
        kind: kindForPath(filePath),
        sizeBytes: cue.sizeBytes,
        durationMs: cue.durationMs,
        sampleRate: cue.sampleRate,
        cues: cue.cues,
      } : {}),
    });
    if (cue?.cues.length) withCues++;
  }

  const xml = buildRekordboxLibraryXml(rbTracks, [{ name: setlistName, trackIds: rbTracks.map(r => r.id) }]);
  return { xml, matched: rbTracks.length, skipped: found - rbTracks.length, withCues };
}

// --- M3U export (simpler Rekordbox import: File → Import → Import Playlist) ---

function toM3uPath(filePath: string): string {
  let path = filePath.trim();
  if (path.startsWith('file://')) {
    path = decodeURIComponent(path.replace(/^file:\/\/(localhost)?/, ''));
  }
  // Windows: /C:/... → C:/...
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  return path;
}

export function buildM3u(
  setlistName: string,
  tracks: SetlistTrack[],
  library: LibraryTrack[],
): { m3u: string; matched: number; skipped: number } {
  const lines = ['#EXTM3U', `#PLAYLIST:${setlistName}`];
  let matched = 0;
  let skipped = 0;
  for (const t of tracks) {
    const found = findLibraryTrack(t.artist, t.title, library);
    if (!found?.filePath) continue;
    if (!isLocalFilePath(found.filePath)) { skipped++; continue; } // streaming ref — no local file
    lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
    lines.push(toM3uPath(found.filePath));
    matched++;
  }
  // CRLF line endings + trailing newline: the M3U de-facto standard uses CRLF, and
  // several Windows DJ apps (and strict parsers) mishandle LF-only files. Keeps the
  // playlist portable across players, which is the main reason to pick M3U over XML.
  return { m3u: lines.join('\r\n') + '\r\n', matched, skipped };
}

export function downloadM3u(m3u: string, name: string): void {
  const safe = name.replace(/[<>:"/\\|?*]/g, '').trim() || BRAND.name;
  const blob = new Blob([m3u], { type: 'audio/x-mpegurl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.m3u`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadRekordboxXml(xml: string, name: string): void {
  const safe = name.replace(/[<>:"/\\|?*]/g, '').trim() || BRAND.name;
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
