// Parse the legacy `Serato Markers_` block.
//
// Why we still read it (plan §2): for cues 0-4 the legacy block overrides
// position, color and type, and — crucially — a cue that is present in
// Markers2 but *unset* here counts as DELETED. Without this, a cue the DJ
// removed in Serato would reappear in the export and throw off the Phase 0
// offset measurement. Names always come from Markers2.
//
// Layout (plan §2): header `02 05`, u32 BE count (14), then 14 × 22-byte entries
// (5 cues, then 9 loops), then a trailing serato32 track color. Positions and
// colors are serato32-encoded (24 bits packed into four 7-bit bytes).
//
// On MP3 the block is sometimes base64-wrapped and sometimes raw, so we detect
// the `02 05` header directly and fall back to a base64 decode.

import { decodeBase64Lenient, u32be } from '../bytes';
import { Rgb } from '../types';

export interface LegacyCue {
  slot: number;
  set: boolean;
  startMs: number;
  color: Rgb;
}

export interface MarkersResult {
  cues: LegacyCue[];
  trackColor: Rgb | null;
}

const ENTRY_SIZE = 22;

/** Decode four 7-bit bytes into a 28-bit integer (serato32). */
export function serato32Decode(b: Uint8Array, o: number): number {
  return ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
}

function serato32Rgb(b: Uint8Array, o: number): Rgb {
  const v = serato32Decode(b, o);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function unwrap(geobData: Uint8Array): Uint8Array | null {
  if (geobData.length >= 2 && geobData[0] === 0x02 && geobData[1] === 0x05) return geobData;
  const decoded = decodeBase64Lenient(geobData);
  if (decoded.length >= 2 && decoded[0] === 0x02 && decoded[1] === 0x05) return decoded;
  return null;
}

export function parseSeratoMarkers_(geobData: Uint8Array): MarkersResult | null {
  const data = unwrap(geobData);
  if (!data) return null;

  const count = u32be(data, 2);
  if (count <= 0 || count > 64) return null; // sanity
  let p = 6;
  const cues: LegacyCue[] = [];

  for (let i = 0; i < count; i++) {
    if (p + ENTRY_SIZE > data.length) break;
    const e = data.subarray(p, p + ENTRY_SIZE);
    p += ENTRY_SIZE;
    // Entry: startFlag(1) start(4) endFlag(1) end(4) fixed(6) color(4) type(1) locked(1)
    if (i < 5) {
      const set = e[0] === 0x00; // 0x00 = position present; 0x7F = unset
      cues.push({ slot: i, set, startMs: set ? serato32Decode(e, 1) : 0, color: serato32Rgb(e, 16) });
    }
    // loops (i >= 5) are read from Markers2 instead; skipped here on purpose.
  }

  const trackColor = p + 4 <= data.length ? serato32Rgb(data, p) : null;
  return { cues, trackColor };
}
