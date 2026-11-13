// Minimal ID3v2 reader for the cue engine.
//
// We only need three things from the tag: the Serato GEOB frames (by their
// description), the user COMM comment, and where the audio starts (so the first
// MPEG frame can be analyzed for the offset case). We read the header, then the
// tag body, handle v2.3 vs v2.4 frame sizes and unsynchronisation, and skip
// everything else (notably APIC artwork, which can be megabytes) by frame size.

import {
  ascii, ByteSource, decodeLatin1, decodeUtf16be, decodeUtf16le, decodeUtf8, synchsafe32, u32be,
} from '../bytes';

export interface Id3Result {
  majorVersion: number;
  /** GEOB object data keyed by frame description, e.g. "Serato Markers2". */
  geobs: Map<string, Uint8Array>;
  comment: string | null;
  /** Byte offset where audio begins (after the tag and optional footer). */
  audioStart: number;
}

// Undo ID3 unsynchronisation: every 0xFF 0x00 becomes 0xFF.
function deunsync(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  let o = 0;
  for (let i = 0; i < b.length; i++) {
    out[o++] = b[i];
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return out.subarray(0, o);
}

function decodeText(enc: number, b: Uint8Array): string {
  switch (enc) {
    case 1: // UTF-16 with BOM
      if (b[0] === 0xff && b[1] === 0xfe) return decodeUtf16le(b.subarray(2));
      if (b[0] === 0xfe && b[1] === 0xff) return decodeUtf16be(b.subarray(2));
      return decodeUtf16le(b);
    case 2: return decodeUtf16be(b); // UTF-16BE, no BOM
    case 3: return decodeUtf8(b);    // UTF-8
    default: return decodeLatin1(b); // ISO-8859-1
  }
}

// Read a NUL-terminated string in the given encoding; returns the value and the
// offset just past the terminator. Single-byte for latin1/utf8, double for utf16.
function readNullTerm(b: Uint8Array, start: number, enc: number): { value: string; next: number } {
  const wide = enc === 1 || enc === 2;
  let i = start;
  if (wide) {
    for (; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) break;
    return { value: decodeText(enc, b.subarray(start, i)), next: i + 2 };
  }
  for (; i < b.length; i++) if (b[i] === 0) break;
  return { value: decodeText(enc, b.subarray(start, i)), next: i + 1 };
}

function parseGeob(data: Uint8Array): { description: string; object: Uint8Array } {
  const enc = data[0];
  const mime = readNullTerm(data, 1, 0);          // MIME is always latin1
  const filename = readNullTerm(data, mime.next, enc);
  const description = readNullTerm(data, filename.next, enc);
  return { description: description.value, object: data.subarray(description.next) };
}

function parseComm(data: Uint8Array): string {
  const enc = data[0];
  const desc = readNullTerm(data, 4, enc);        // skip enc(1) + language(3)
  return decodeText(enc, data.subarray(desc.next)).replace(/\0+$/, '');
}

export async function readId3(src: ByteSource): Promise<Id3Result | null> {
  if (src.size < 10) return null;
  const header = await src.read(0, 10);
  if (ascii(header, 0, 3) !== 'ID3') return null;

  const majorVersion = header[3];
  const flags = header[5];
  const tagUnsync = (flags & 0x80) !== 0;
  const hasExtHeader = (flags & 0x40) !== 0;
  const hasFooter = (flags & 0x10) !== 0;
  const size = synchsafe32(header, 6);
  const audioStart = 10 + size + (hasFooter ? 10 : 0);

  let body = await src.read(10, 10 + size);
  if (tagUnsync) body = deunsync(body);

  let pos = 0;
  if (hasExtHeader) {
    // v2.4 ext-header size is synchsafe and self-inclusive; v2.3 is a plain u32
    // not counting its own 4 bytes. Skip either way.
    pos += majorVersion === 4 ? synchsafe32(body, 0) : u32be(body, 0) + 4;
  }

  const geobs = new Map<string, Uint8Array>();
  let comment: string | null = null;

  while (pos + 10 <= body.length) {
    const id = ascii(body, pos, pos + 4);
    if (id.charCodeAt(0) === 0) break; // padding
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // corrupt / end
    const frameSize = majorVersion === 4 ? synchsafe32(body, pos + 4) : u32be(body, pos + 4);
    const frameFlags2 = body[pos + 9];
    let data = body.subarray(pos + 10, pos + 10 + frameSize);
    pos += 10 + frameSize;
    if (frameSize <= 0 || data.length === 0) continue;

    // v2.4 per-frame unsync (0x02) and data-length-indicator (0x01 adds 4 bytes).
    if (majorVersion === 4) {
      if (frameFlags2 & 0x01) data = data.subarray(4);
      if (frameFlags2 & 0x02) data = deunsync(data);
    }

    if (id === 'GEOB') {
      const g = parseGeob(data);
      if (g.description) geobs.set(g.description, g.object);
    } else if (id === 'COMM' && comment === null) {
      comment = parseComm(data) || null;
    }
  }

  return { majorVersion, geobs, comment, audioStart };
}
