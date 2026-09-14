// Serato crate binary format writer
// Format: tag-based structure with 4-char type + uint32BE length + payload
// Strings are UTF-16 Big Endian, no BOM
import { BRAND } from '../brand';

function encodeUtf16BE(str: string): Uint8Array {
  // str.length counts UTF-16 code units (surrogates count as 2), so this
  // allocation is always large enough even for emoji/supplementary chars.
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i); // returns the raw UTF-16 code unit
    out[i * 2]     = (code >>> 8) & 0xFF;
    out[i * 2 + 1] = code & 0xFF;
  }
  return out;
}

function writeTag(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
  const len = payload.length;
  out[4] = (len >>> 24) & 0xFF;
  out[5] = (len >>> 16) & 0xFF;
  out[6] = (len >>> 8)  & 0xFF;
  out[7] = len & 0xFF;
  out.set(payload, 8);
  return out;
}

// Normalize a stored file path to Serato's crate convention: a path relative to
// the volume root with forward slashes and NO leading slash — e.g.
// "Users/kel/Music/track.mp3". This is critical: Serato does NOT store any track
// metadata (BPM/key/artist/genre) in the .crate itself; it matches each ptrk path
// against its own library database by an EXACT string comparison and shows the
// metadata it already has for that file. If the string doesn't match byte-for-byte
// the row imports blank. Serato's pfil (and therefore ptrk) is volume-relative with
// no leading slash, so our importer keeps that verbatim — the earlier code here
// wrongly PREPENDED a leading slash, which broke the match for every Serato library.
function toSeratoPath(raw: string): string {
  let path = raw.trim();

  // Strip file:// URI scheme (Rekordbox-sourced paths arrive as file://localhost/…).
  if (path.startsWith('file://')) path = path.replace(/^file:\/\/(localhost)?/, '');

  // URL-decode percent-encoded chars.
  try { path = decodeURIComponent(path); } catch { /* leave as-is */ }

  // Backslashes → forward slashes.
  path = path.replace(/\\/g, '/');

  // Serato stores volume-relative paths with NO leading slash. Strip any leading
  // slash (macOS "/Users/…" and Rekordbox "/C:/…" / "/Volumes/…" forms); Serato-
  // native paths ("Users/…") are already slash-less and pass through untouched.
  path = path.replace(/^\/+/, '');

  return path;
}

export function buildCrate(rawPaths: string[]): Uint8Array {
  const parts: Uint8Array[] = [
    writeTag('vrsn', encodeUtf16BE('1.0/Serato ScratchLive Crate')),
  ];

  for (const raw of rawPaths) {
    const path = toSeratoPath(raw);
    const ptrk = writeTag('ptrk', encodeUtf16BE(path));
    parts.push(writeTag('otrk', ptrk));
  }

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

export function downloadCrate(data: Uint8Array, name: string): void {
  const safe = name.replace(/[<>:"/\\|?*]/g, '').trim() || BRAND.name;
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.crate`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
