// Server-side shape check for cue payloads posted from the browser. The client
// is untrusted, so everything is re-built field by field with clamps rather
// than stored as sent.

import { AudioFormat, CueKind, CuePoint, Mp3TimingCase, Rgb, TrackCues } from './types';

export const MAX_CUES_PER_TRACK = 16;
export const MAX_NAME_LEN = 64;
export const MAX_COMMENT_LEN = 512;
const MAX_POS_MS = 6 * 60 * 60 * 1000; // 6 h — longer than any real track

const KINDS: CueKind[] = ['hotcue', 'memory', 'loop'];
const FORMATS: AudioFormat[] = ['mp3', 'm4a', 'flac', 'aiff', 'wav'];
const CASES: Mp3TimingCase[] = ['A', 'B', 'C', 'D'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

function rgb(v: unknown): Rgb | null {
  if (!isObj(v)) return null;
  const r = int(v.r, 0, 255), g = int(v.g, 0, 255), b = int(v.b, 0, 255);
  return r === null || g === null || b === null ? null : { r, g, b };
}

function cue(v: unknown): CuePoint | null {
  if (!isObj(v) || !KINDS.includes(v.kind as CueKind)) return null;
  const startMs = int(v.startMs, 0, MAX_POS_MS);
  if (startMs === null) return null;
  const slot = v.slot === null || v.slot === undefined ? null : int(v.slot, 0, 7);
  const out: CuePoint = { kind: v.kind as CueKind, slot, startMs, name: str(v.name, MAX_NAME_LEN), color: rgb(v.color) };
  if (v.kind === 'loop') {
    const endMs = int(v.endMs, 0, MAX_POS_MS);
    if (endMs === null || endMs <= startMs) return null;
    out.endMs = endMs;
  }
  if (v.locked === true) out.locked = true;
  return out;
}

export function sanitizeTrackCues(v: unknown): TrackCues | null {
  if (!isObj(v) || v.sourceApp !== 'serato') return null;
  const format = FORMATS.includes(v.format as AudioFormat) ? (v.format as AudioFormat) : 'mp3';
  const cues = (Array.isArray(v.cues) ? v.cues : [])
    .slice(0, MAX_CUES_PER_TRACK * 2)
    .map(cue)
    .filter((c): c is CuePoint => c !== null)
    .slice(0, MAX_CUES_PER_TRACK);

  const out: TrackCues = { sourceApp: 'serato', format, cues, trackColor: rgb(v.trackColor) };
  if (isObj(v.mp3) && CASES.includes(v.mp3.timingCase as Mp3TimingCase)) {
    const sampleRate = int(v.mp3.sampleRate, 8000, 48000);
    const spf = int(v.mp3.samplesPerFrame, 576, 1152);
    if (sampleRate && (spf === 576 || spf === 1152)) {
      out.mp3 = { timingCase: v.mp3.timingCase as Mp3TimingCase, sampleRate, samplesPerFrame: spf, encoder: str(v.mp3.encoder, 32) || null };
    }
  }
  const comment = str(v.comment, MAX_COMMENT_LEN);
  if (comment) out.comment = comment;
  if (v.bpmLocked === true) out.bpmLocked = true;
  // beatgrid deliberately dropped: not exported in v1 (Rekordbox re-analyses).
  return out;
}
