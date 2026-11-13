// Classify the first MPEG audio frame to pick the position-offset case.
//
// We read the 4-byte frame header (sample rate, channel mode, layer), then look
// for an Info/Xing tag inside that first (silent) frame and, if present, a LAME
// extension with a CRC-16. That gives the four timing cases the offset logic
// keys on (plan §2 "MP3 offset"):
//   A  no Xing/Info header
//   B  Info/Xing but no LAME tag (or a Lavc/Lavf one)
//   C  LAME tag whose CRC doesn't validate
//   D  LAME tag with a valid CRC
//
// Only Layer III is handled (every Serato MP3). Returns null if no valid frame
// sync is found in the window.

import { u16be, u32be } from '../bytes';
import { Mp3TimingCase, Mp3TimingInfo } from '../types';

// Layer III bitrates (kbps) by bitrate index; MPEG 2/2.5 share a table.
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000],  // MPEG 2.5
};

export interface FrameAnalysis extends Mp3TimingInfo {
  /** Byte offset of the frame sync, for diagnostics. */
  frameOffset: number;
  xingType: 'Xing' | 'Info' | null;
  /** Stored vs. computed LAME CRC — surfaced so Phase 0 can confirm the CRC
   *  algorithm against real files before we trust the C/D split. */
  storedCrc: number | null;
  computedCrc: number | null;
  /** First frame's bitrate — the whole file's for CBR (used when no Xing count). */
  bitrateKbps: number;
  /** Audio frame count from the Xing/Info header, when present. */
  xingFrames: number | null;
}

/**
 * Track length in ms. Exact for files with a Xing/Info frame count (all VBR and
 * LAME CBR files); otherwise estimated from the CBR bitrate and the audio byte
 * length. Rekordbox shows no hot cues on an XML track with TotalTime="0", so the
 * export always needs a value, and whole seconds is all the XML carries.
 */
export function mp3DurationMs(frame: FrameAnalysis, audioBytes: number): number {
  if (frame.xingFrames) return Math.round((frame.xingFrames * frame.samplesPerFrame * 1000) / frame.sampleRate);
  if (!frame.bitrateKbps) return 0;
  return Math.round((Math.max(0, audioBytes) * 8) / frame.bitrateKbps);
}

// CRC-16/ARC (poly 0xA001 reflected, init 0x0000) — the algorithm LAME uses for
// its info-tag CRC. Validated in Phase 0; see FrameAnalysis.storedCrc.
function crc16arc(b: Uint8Array, start: number, end: number): number {
  let crc = 0;
  for (let i = start; i < end; i++) {
    crc ^= b[i];
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc & 0xffff;
}

function isFrameSync(b: Uint8Array, o: number): boolean {
  if (b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return false;
  const versionId = (b[o + 1] >> 3) & 0x3;
  const layer = (b[o + 1] >> 1) & 0x3;
  const bitrateIdx = (b[o + 2] >> 4) & 0xf;
  const srIdx = (b[o + 2] >> 2) & 0x3;
  // versionId 1 is reserved; layer 1 (0b01) = Layer III; bitrate 0/15 and
  // sample-rate index 3 are invalid.
  return versionId !== 1 && layer === 1 && bitrateIdx !== 0 && bitrateIdx !== 0xf && srIdx !== 3;
}

/** Scan `bytes` from `from` for the first valid Layer III frame and analyze it. */
export function analyzeFirstFrame(bytes: Uint8Array, from = 0, scanLen = 4096): FrameAnalysis | null {
  const limit = Math.min(bytes.length - 4, from + scanLen);
  let o = -1;
  for (let i = from; i <= limit; i++) {
    if (isFrameSync(bytes, i)) { o = i; break; }
  }
  if (o < 0) return null;

  const versionId = (bytes[o + 1] >> 3) & 0x3;
  const protection = bytes[o + 1] & 0x1;            // 0 = CRC-protected (2 extra bytes)
  const srIdx = (bytes[o + 2] >> 2) & 0x3;
  const bitrateKbps = (versionId === 3 ? BITRATES_V1 : BITRATES_V2)[(bytes[o + 2] >> 4) & 0xf];
  const channelMode = (bytes[o + 3] >> 6) & 0x3;    // 3 = mono
  const mono = channelMode === 3;
  const mpeg1 = versionId === 3;

  const sampleRate = SAMPLE_RATES[versionId][srIdx];
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  const sideInfo = mpeg1 ? (mono ? 17 : 32) : (mono ? 9 : 17);

  // Xing/Info sits after the header, optional CRC bytes, and the side-info block.
  const xing = o + 4 + (protection ? 0 : 2) + sideInfo;
  const tag = xing + 4 <= bytes.length ? String.fromCharCode(bytes[xing], bytes[xing + 1], bytes[xing + 2], bytes[xing + 3]) : '';
  const xingType: 'Xing' | 'Info' | null = tag === 'Xing' ? 'Xing' : tag === 'Info' ? 'Info' : null;

  const base = { timingCase: 'A' as Mp3TimingCase, sampleRate, samplesPerFrame, encoder: null as string | null, frameOffset: o, xingType, storedCrc: null as number | null, computedCrc: null as number | null, bitrateKbps, xingFrames: null as number | null };

  if (!xingType) return base; // case A

  // Skip the Xing fields to reach the LAME extension.
  const flags = (bytes[xing + 4] << 24) + (bytes[xing + 5] << 16) + (bytes[xing + 6] << 8) + bytes[xing + 7];
  let p = xing + 8;
  if (flags & 0x1) {         // frame count
    if (p + 4 <= bytes.length) base.xingFrames = u32be(bytes, p) || null;
    p += 4;
  }
  if (flags & 0x2) p += 4;   // byte count
  if (flags & 0x4) p += 100; // TOC
  if (flags & 0x8) p += 4;   // quality
  const lame = p;

  let encoder: string | null = null;
  for (let i = 0; i < 9 && lame + i < bytes.length; i++) {
    const c = bytes[lame + i];
    if (c >= 0x20 && c < 0x7f) encoder = (encoder ?? '') + String.fromCharCode(c);
  }
  const isLame = !!encoder && encoder.startsWith('LAME');
  if (!isLame) return { ...base, timingCase: 'B', encoder }; // case B (Lavf/Lavc or none)

  // The info-tag CRC is the last 2 bytes of the 36-byte LAME extension and
  // covers the frame from its start up to (not including) those 2 bytes.
  const crcPos = lame + 34;
  if (crcPos + 2 > bytes.length) return { ...base, timingCase: 'C', encoder };
  const storedCrc = u16be(bytes, crcPos);
  const computedCrc = crc16arc(bytes, o, crcPos);
  const timingCase: Mp3TimingCase = storedCrc === computedCrc ? 'D' : 'C';
  return { ...base, timingCase, encoder, storedCrc, computedCrc };
}
