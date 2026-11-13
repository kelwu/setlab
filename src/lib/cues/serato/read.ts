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

export async function readSeratoMp3Cues(src: ByteSource, filename: string): Promise<SeratoReadResult> {
  const format = formatFromName(filename);
  const id3 = await readId3(src);
  if (!id3) {
    return { cues: { sourceApp: 'serato', format, cues: [], trackColor: null }, frame: null, durationMs: 0 };
  }

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
