// Parse the modern `Serato Markers2` payload into neutral cues.
//
// Layout (plan §2 "Serato Markers2"), where the input is the GEOB object data
// (everything after the frame's description NUL):
//   01 01                       outer version
//   <base64 text>               '\n' every 72 chars, '=' padding often omitted,
//                               sometimes one stray trailing char
//   00                          end of the base64 text
//   <NUL padding>               Serato pre-allocates ≥ 470 bytes
// The decoded base64 is:
//   01 01                       inner version
//   <entries...>                each: ASCII name + \0, u32 BE length, payload
//   00                          terminator (a name that starts with NUL)
//
// Entry payloads we read: COLOR, CUE, LOOP, BPMLOCK. Unknown entries are skipped
// by their length, so FLIP and future types never break the walk.

import { ascii, decodeBase64Lenient, decodeUtf8, indexOfNul, u32be } from '../bytes';
import { CuePoint, Rgb } from '../types';

export interface Markers2Result {
  cues: CuePoint[];
  trackColor: Rgb | null;
  bpmLocked: boolean;
}

function rgb(b: Uint8Array, o: number): Rgb {
  return { r: b[o], g: b[o + 1], b: b[o + 2] };
}

export function parseSeratoMarkers2(geobData: Uint8Array): Markers2Result {
  const empty: Markers2Result = { cues: [], trackColor: null, bpmLocked: false };
  if (geobData.length < 2) return empty;

  // Strip the outer "01 01", then take the base64 run up to the first NUL.
  const b64End = indexOfNul(geobData, 2);
  const decoded = decodeBase64Lenient(geobData.subarray(2, b64End));
  if (decoded.length < 2) return empty;

  const cues: CuePoint[] = [];
  let trackColor: Rgb | null = null;
  let bpmLocked = false;

  let p = 2; // skip inner "01 01"
  while (p < decoded.length) {
    if (decoded[p] === 0) break; // terminator
    const nameEnd = indexOfNul(decoded, p);
    const type = ascii(decoded, p, nameEnd);
    p = nameEnd + 1;
    if (p + 4 > decoded.length) break;
    const len = u32be(decoded, p);
    p += 4;
    const payload = decoded.subarray(p, p + len);
    p += len;

    switch (type) {
      case 'COLOR':
        if (payload.length >= 4) trackColor = rgb(payload, 1); // 00 RR GG BB
        break;
      case 'CUE':
        // 00, u8 index, u32 pos, 00, RGB, 00 00, name\0
        if (payload.length >= 13) {
          const nEnd = indexOfNul(payload, 12);
          cues.push({
            kind: 'hotcue',
            slot: payload[1],
            startMs: u32be(payload, 2),
            name: decodeUtf8(payload.subarray(12, nEnd)),
            color: rgb(payload, 7),
          });
        }
        break;
      case 'LOOP':
        // 00, u8 index, u32 start, u32 end, FFFFFFFF, 00, RGB, 00, u8 locked, name\0
        if (payload.length >= 21) {
          const nEnd = indexOfNul(payload, 20);
          cues.push({
            kind: 'loop',
            slot: payload[1],
            startMs: u32be(payload, 2),
            endMs: u32be(payload, 6),
            name: decodeUtf8(payload.subarray(20, nEnd)),
            color: rgb(payload, 15),
            locked: payload[19] === 1,
          });
        }
        break;
      case 'BPMLOCK':
        if (payload.length >= 1) bpmLocked = payload[0] === 1;
        break;
      default:
        break; // skip FLIP and unknown types by length
    }
  }

  return { cues, trackColor, bpmLocked };
}
