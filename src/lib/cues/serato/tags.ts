// Serato's tag container format, shared by `database V2` and `.crate` files:
// a flat run of [4-char ASCII name][uint32 BE length][payload]. Container tags
// (otrk) hold the same structure nested inside their payload.
//
// Works on plain Uint8Array (Node's Buffer is a subclass), so the same walker
// runs on the server upload path and in the browser converter.

import { ascii, decodeUtf16be, decodeUtf8, u32be } from '../bytes';

export function walkSeratoTags(buf: Uint8Array): Map<string, Uint8Array[]> {
  const tags = new Map<string, Uint8Array[]>();
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const name = ascii(buf, pos, pos + 4);
    const length = u32be(buf, pos + 4);
    pos += 8;
    if (pos + length > buf.length) break;
    const payload = buf.subarray(pos, pos + length);
    pos += length;
    const list = tags.get(name);
    if (list) list.push(payload);
    else tags.set(name, [payload]);
  }
  return tags;
}

/** Strip a UTF-8 BOM or UTF-16LE BOM some tools prepend to Serato files. */
export function stripBom(buf: Uint8Array): Uint8Array {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3);
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2);
  return buf;
}

export function tagString16(tags: Map<string, Uint8Array[]>, name: string): string | undefined {
  const b = tags.get(name)?.[0];
  return b ? decodeUtf16be(b) || undefined : undefined;
}

export function tagString8(tags: Map<string, Uint8Array[]>, name: string): string | undefined {
  const b = tags.get(name)?.[0];
  return b ? decodeUtf8(b) || undefined : undefined;
}
