import { LibraryTrack } from '@/lib/agents/types';
import { SetlistTrack } from '@/lib/agents/types';
import { BRAND } from '../brand';

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

function toRekordboxLocation(filePath: string): string {
  let path = filePath.trim();
  // Strip existing file:// prefix (with optional localhost) so we can re-encode cleanly
  if (path.startsWith('file://')) {
    path = decodeURIComponent(path.replace(/^file:\/\/(localhost)?/, ''));
  }
  // Windows absolute path: C:\... or C:/... → /C:/...
  if (/^[A-Za-z]:[/\\]/.test(path)) {
    path = '/' + path.replace(/\\/g, '/');
  }
  // Ensure leading slash
  if (!path.startsWith('/')) path = '/' + path;
  // Encode every segment — handles #, %, &, spaces, parens, apostrophes, etc.
  const encoded = path.split('/').map(seg => seg === '' ? '' : encodeURIComponent(seg)).join('/');
  return 'file://localhost' + encoded;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildRekordboxXml(
  setlistName: string,
  tracks: SetlistTrack[],
  library: LibraryTrack[],
): { xml: string; matched: number } {
  // Match setlist tracks to library file paths. We also carry the matched library
  // track's genre/year: the SetlistTrack itself has neither (see types.ts), but the
  // Rekordbox XML embeds metadata inline, so pulling them from the library entry is
  // what makes genre — a field DJs sort/filter on — actually populate on import.
  const matched: Array<{ track: SetlistTrack; filePath: string; genre: string; year: string; id: number }> = [];
  let idCounter = 1;

  for (const t of tracks) {
    const found = findLibraryTrack(t.artist, t.title, library);
    if (found) {
      matched.push({
        track: t,
        filePath: found.filePath ?? '',
        genre: found.genre ?? '',
        year: found.year ? String(found.year) : '',
        id: idCounter++,
      });
    }
  }

  const collectionEntries = matched.map(({ track, filePath, genre, year, id }) => {
    const location = toRekordboxLocation(filePath);
    return `    <TRACK TrackID="${id}" Name="${escapeXml(track.title)}" Artist="${escapeXml(track.artist)}" `
      + `TotalTime="0" DiscNumber="0" TrackNumber="0" Year="${escapeXml(year)}" Genre="${escapeXml(genre)}" Album="" `
      + `AverageBpm="${track.bpm.toFixed(2)}" Comments="" Rating="0" `
      + `Location="${escapeXml(location)}" Remixer="" Tonality="${escapeXml(track.key)}" `
      + `Label="" Mix=""/>`;
  }).join('\n');

  const playlistTracks = matched
    .map(({ id }) => `        <TRACK Key="${id}"/>`)
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="AlphaTheta"/>
  <COLLECTION Entries="${matched.length}">
${collectionEntries}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT">
      <NODE Name="${escapeXml(setlistName)}" Type="1" Count="${matched.length}">
${playlistTracks}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`;

  return { xml, matched: matched.length };
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
): { m3u: string; matched: number } {
  const lines = ['#EXTM3U', `#PLAYLIST:${setlistName}`];
  let matched = 0;
  for (const t of tracks) {
    const found = findLibraryTrack(t.artist, t.title, library);
    if (!found?.filePath) continue;
    lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`);
    lines.push(toM3uPath(found.filePath));
    matched++;
  }
  return { m3u: lines.join('\n'), matched };
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
