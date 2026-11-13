// Read one Serato MP3's cues into the neutral TrackCues model.
//
// Pulls the Serato GEOB blocks and comment from the ID3 tag, merges the modern
// and legacy cue data, and analyzes the first MPEG frame for the offset case.
// v1 is MP3 only (plan §7a decision 4); AIFF reuses this same ID3 path later.

import { ByteSource } from '../bytes';
import { AudioFormat, TrackCues } from '../types';
import { readId3 } from './id3';
import { analyzeFirstFrame, FrameAnalysis, mp3DurationMs } from './mpeg-header';
import { parseSeratoMarkers2 } from './markers2';
import { parseSeratoMarkers_ } from './markers';
import { mergeSeratoCues } from './merge';

export interface SeratoReadResult {
  cues: TrackCues;
  /** First-frame analysis, including the stored/computed CRC for Phase 0. */
  frame: FrameAnalysis | null;
  /** Track length from the MPEG header (0 when unknown). */
  durationMs: number;
}

function formatFromName(filename: string): AudioFormat {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'm4a' || ext === 'mp4' || ext === 'm4v') return 'm4a';
  if (ext === 'flac') return 'flac';
  if (ext === 'aif' || ext === 'aiff') return 'aiff';
  if (ext === 'wav') return 'wav';
  return 'mp3';
}

/** True when the bytes start (within 8 KB) with two back-to-back MPEG audio
 *  frames. One frame header can turn up by chance in random data; a second one
 *  exactly a frame-length later almost never does. Used only to tell a real
 *  untagged MP3 from a corrupt or mislabeled file — not for cue timing. */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  let from = 0;
  for (let tries = 0; tries < 64; tries++) {
    const f = analyzeFirstFrame(bytes, from, 8192 - from);
    if (!f) return false;
    const o = f.frameOffset;
    const padding = (bytes[o + 2] >> 1) & 1;
    const len = Math.floor(((f.samplesPerFrame / 8) * f.bitrateKbps * 1000) / f.sampleRate) + padding;
    const n = o + len;
    if (len > 4 && n + 1 < bytes.length && bytes[n] === 0xff && (bytes[n + 1] & 0xe0) === 0xe0) return true;
    from = o + 1;
    if (from >= 8192) return false;
  }
  return false;
}

export async function readSeratoMp3Cues(src: ByteSource, filename: string): Promise<SeratoReadResult> {
  const format = formatFromName(filename);
  const id3 = await readId3(src);
  if (!id3) {
    // No tag means no Serato cues — but make sure it's really an MP3, so a
    // corrupt or mislabeled file shows as unreadable instead of "no cues".
    if (!looksLikeMp3(await src.read(0, Math.min(src.size, 16384)))) throw new Error('Not a readable MP3 file.');
    return { cues: { sourceApp: 'serato', format, cues: [], trackColor: null }, frame: null, durationMs: 0 };
  }
  // A tag that claims to run past the end of the file means the file is cut
  // off (an interrupted download or copy). Its cue data can't be trusted.
  if (id3.audioStart > src.size) throw new Error('This file looks cut off — it may not have finished downloading or copying.');

  const m2raw = id3.geobs.get('Serato Markers2');
  const mLegRaw = id3.geobs.get('Serato Markers_');
  const m2 = m2raw ? parseSeratoMarkers2(m2raw) : { cues: [], trackColor: null, bpmLocked: false };
  const legacy = mLegRaw ? parseSeratoMarkers_(mLegRaw) : null;
  const cues = mergeSeratoCues(m2, legacy);

  const windowEnd = Math.min(src.size, id3.audioStart + 8192);
  const frame = id3.audioStart < src.size
    ? analyzeFirstFrame(await src.read(id3.audioStart, windowEnd))
    : null;

  const trackCues: TrackCues = {
    sourceApp: 'serato',
    format,
    cues,
    trackColor: m2.trackColor ?? legacy?.trackColor ?? null,
    bpmLocked: m2.bpmLocked || undefined,
    comment: id3.comment ?? undefined,
    mp3: frame
      ? { timingCase: frame.timingCase, sampleRate: frame.sampleRate, samplesPerFrame: frame.samplesPerFrame, encoder: frame.encoder }
      : undefined,
  };

  const durationMs = frame ? mp3DurationMs(frame, src.size - id3.audioStart - frame.frameOffset) : 0;
  return { cues: trackCues, frame, durationMs };
}
