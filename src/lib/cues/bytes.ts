// Small byte helpers shared by the tag readers. Everything works on Uint8Array
// so the same code runs in the browser, a Web Worker, and Node (scripts/tests).

/**
 * A random-access byte source. In the browser this wraps a File (so only the
 * requested slice is read from disk); in Node it wraps a file handle.
 */
export interface ByteSource {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

export function fileByteSource(file: Blob): ByteSource {
  return {
    size: file.size,
    async read(start, end) {
      return new Uint8Array(await file.slice(start, end).arrayBuffer());
    },
  };
}

export function bytesByteSource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(start, end) {
      return bytes.subarray(start, Math.min(end, bytes.length));
    },
  };
}

export function u32be(b: Uint8Array, o: number): number {
  return ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}

export function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) + b[o + 1];
}

export function synchsafe32(b: Uint8Array, o: number): number {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

export function ascii(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

const utf8 = new TextDecoder('utf-8');
const utf16le = new TextDecoder('utf-16le');
const utf16be = new TextDecoder('utf-16be');
const latin1 = new TextDecoder('latin1');

export function decodeUtf8(b: Uint8Array): string { return utf8.decode(b); }
export function decodeUtf16be(b: Uint8Array): string { return utf16be.decode(b.subarray(0, b.length & ~1)); }
export function decodeLatin1(b: Uint8Array): string { return latin1.decode(b); }
export function decodeUtf16le(b: Uint8Array): string { return utf16le.decode(b.subarray(0, b.length & ~1)); }

/** Index of the first NUL at or after `from`, or b.length. */
export function indexOfNul(b: Uint8Array, from: number): number {
  for (let i = from; i < b.length; i++) if (b[i] === 0) return i;
  return b.length;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/**
 * Lenient base64 decoder for Serato's payloads: ignores newlines and any other
 * non-alphabet bytes, tolerates missing '=' padding, and tolerates the one
 * stray trailing character Serato sometimes leaves (a length ≡ 1 mod 4, which
 * a strict decoder rejects — it carries no complete byte, so it's dropped).
 */
export function decodeBase64Lenient(input: Uint8Array | string): Uint8Array {
  const src = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const vals: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const v = B64_LOOKUP[src[i]];
    if (v >= 0) vals.push(v);
    else if (src[i] === 0x3d /* = */) break;
  }
  const out = new Uint8Array(Math.floor((vals.length * 6) / 8));
  let o = 0;
  for (let i = 0; i + 1 < vals.length; i += 4) {
    const a = vals[i], b = vals[i + 1], c = vals[i + 2] ?? 0, d = vals[i + 3] ?? 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 0xff;
    if (i + 2 < vals.length && o < out.length) out[o++] = (n >> 8) & 0xff;
    if (i + 3 < vals.length && o < out.length) out[o++] = n & 0xff;
  }
  return out.subarray(0, o);
}
