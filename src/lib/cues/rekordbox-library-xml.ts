// Write a full Rekordbox collection XML: tracks with their cues, plus a
// playlist tree. Used by the Serato → Rekordbox converter.
//
// Phase 0 (rekordbox 7.2.19) showed Rekordbox shows NO hot cues for an XML
// track whose TotalTime is "0", so every track carries its real length, size,
// kind and sample rate when known.

import { CuePoint, Rgb } from './types';
import { cuesToPositionMarks, escapeXmlAttr as esc, MarkOptions } from './rekordbox-marks';
import { nearestInPalette, rgbToHex } from './colors';

export interface RbTrack {
  id: number;
  /** Absolute path on the DJ's machine (macOS "/Users/…", Windows "C:/…"). */
  location: string;
  name: string;
  artist: string;
  album?: string;
  genre?: string;
  year?: number;
  bpm?: number;
  tonality?: string;
  comment?: string;
  sizeBytes?: number;
  durationMs?: number;
  sampleRate?: number;
  kind?: string;
  /** Already in Rekordbox's timebase (offset applied by the caller). */
  cues?: CuePoint[];
  trackColor?: Rgb | null;
}

export interface RbPlaylistNode {
  name: string;
  trackIds?: number[];
  children?: RbPlaylistNode[];
}

// Rekordbox's eight track colours, as its own XML exports write them. The
// Colour attribute only takes these, so a Serato colour snaps to the nearest.
const RB_TRACK_COLOURS: Rgb[] = [
  { r: 0xff, g: 0x00, b: 0x7f }, // pink
  { r: 0xff, g: 0x00, b: 0x00 }, // red
  { r: 0xff, g: 0xa5, b: 0x00 }, // orange
  { r: 0xff, g: 0xff, b: 0x00 }, // yellow
  { r: 0x00, g: 0xff, b: 0x00 }, // green
  { r: 0x25, g: 0xfd, b: 0xe9 }, // aqua
  { r: 0x00, g: 0x00, b: 0xff }, // blue
  { r: 0x66, g: 0x00, b: 0x99 }, // purple
];

/** Serato's "no colour" is white (or black on some versions) — leave unset. */
function trackColourAttr(c: Rgb | null | undefined): string {
  if (!c) return '';
  const hex = rgbToHex(c);
  if (hex === 'FFFFFF' || hex === '000000') return '';
  return ` Colour="0x${rgbToHex(nearestInPalette(c, RB_TRACK_COLOURS))}"`;
}

export function toRekordboxLocation(filePath: string): string {
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
  // Encode every segment — handles #, %, &, spaces, parens, apostrophes, etc. — but
  // keep a Windows drive letter's colon literal: encodeURIComponent turns "C:" into
  // "C%3A", which Rekordbox can't resolve back to a real file path.
  const encoded = path.split('/')
    .map(seg => (seg === '' ? '' : /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/');
  return 'file://localhost' + encoded;
}

const KIND_BY_EXT: Record<string, string> = {
  mp3: 'MP3 File', m4a: 'M4A File', mp4: 'M4A File', aac: 'AAC File',
  wav: 'WAV File', aif: 'AIFF File', aiff: 'AIFF File', flac: 'FLAC File',
};

/** Rekordbox's Kind label for a file, from its extension. */
export function kindForPath(path: string): string | undefined {
  return KIND_BY_EXT[path.split('?')[0].split('.').pop()?.toLowerCase() ?? ''];
}

function attr(name: string, v: string | number | undefined | null): string {
  return v === undefined || v === null || v === '' ? '' : ` ${name}="${esc(String(v))}"`;
}

function trackXml(t: RbTrack, markOpts: MarkOptions): string {
  const head = `    <TRACK TrackID="${t.id}"${attr('Name', t.name)}${attr('Artist', t.artist)}`
    + `${attr('Album', t.album)}${attr('Genre', t.genre)}${attr('Year', t.year)}`
    + `${attr('Kind', t.kind)}${attr('Size', t.sizeBytes)}`
    + ` TotalTime="${t.durationMs ? Math.max(1, Math.round(t.durationMs / 1000)) : 0}"`
    + `${attr('SampleRate', t.sampleRate)}`
    + `${t.bpm ? ` AverageBpm="${t.bpm.toFixed(2)}"` : ''}${attr('Tonality', t.tonality)}`
    + `${attr('Comments', t.comment)}${trackColourAttr(t.trackColor)}`
    + ` Location="${esc(toRekordboxLocation(t.location))}"`;
  const marks = t.cues?.length ? cuesToPositionMarks(t.cues, markOpts) : '';
  return marks ? `${head}>\n${marks}\n    </TRACK>` : `${head}/>`;
}

/** A crate that has tracks AND sub-crates can't map 1:1 — Rekordbox folders
 *  hold no tracks — so its own tracks go in a same-named playlist first. */
function nodeXml(n: RbPlaylistNode, depth: number): string {
  const pad = '  '.repeat(depth);
  const kids = n.children ?? [];
  const ids = n.trackIds ?? [];
  if (!kids.length) {
    const rows = ids.map(id => `${pad}  <TRACK Key="${id}"/>`).join('\n');
    return `${pad}<NODE Name="${esc(n.name)}" Type="1" KeyType="0" Entries="${ids.length}">`
      + (rows ? `\n${rows}\n${pad}` : '') + `</NODE>`;
  }
  const inner = [
    ...(ids.length ? [nodeXml({ name: n.name, trackIds: ids }, depth + 1)] : []),
    ...kids.map(k => nodeXml(k, depth + 1)),
  ];
  return `${pad}<NODE Type="0" Name="${esc(n.name)}" Count="${inner.length}">\n${inner.join('\n')}\n${pad}</NODE>`;
}

export function buildRekordboxLibraryXml(
  tracks: RbTrack[],
  playlists: RbPlaylistNode[],
  markOpts: MarkOptions = {},
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="AlphaTheta"/>
  <COLLECTION Entries="${tracks.length}">
${tracks.map(t => trackXml(t, markOpts)).join('\n')}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="${playlists.length}">
${playlists.map(p => nodeXml(p, 3)).join('\n')}
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;
}
