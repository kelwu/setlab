// Direction-agnostic cue model. Serato → Rekordbox is the v1 path, but nothing
// here is Serato-specific so the Rekordbox → Serato direction (phase 2) can
// reuse it unchanged.
//
// Positions are stored in the SOURCE app's timebase. Different DJ apps decode
// the start of an MP3 differently (encoder delay / LAME header handling), so the
// same millisecond value can point at slightly different audio in each app.
// Conversion between timebases happens only in offset.ts, at export time.

export interface Rgb { r: number; g: number; b: number }

export type CueKind = 'hotcue' | 'memory' | 'loop';

export interface CuePoint {
  kind: CueKind;
  /** 0-7 for hot cues / hot loops; null for memory cues and memory loops. */
  slot: number | null;
  startMs: number;
  /** Loops only. */
  endMs?: number;
  name: string;
  /** Color as the source app DISPLAYS it (not its internal stored value). */
  color: Rgb | null;
  locked?: boolean;
}

export type CueSourceApp = 'serato' | 'rekordbox';
export type AudioFormat = 'mp3' | 'm4a' | 'flac' | 'aiff' | 'wav';

/**
 * How the first MPEG frame is tagged — the thing DJ apps disagree on, and
 * therefore what decides the position offset between apps:
 *   A  no Xing/Info header
 *   B  Xing/Info header without a LAME tag (or a Lavc/Lavf one)
 *   C  LAME tag whose CRC doesn't validate
 *   D  LAME tag with a valid CRC
 */
export type Mp3TimingCase = 'A' | 'B' | 'C' | 'D';

export interface Mp3TimingInfo {
  timingCase: Mp3TimingCase;
  sampleRate: number;
  samplesPerFrame: number;
  /** Raw encoder string from the LAME/Info tag, e.g. "LAME3.100" — kept for diagnosis. */
  encoder: string | null;
}

export interface BeatgridMarker {
  positionSec: number;
  /** Terminal marker only. */
  bpm?: number;
  /** Non-terminal markers: beats until the next marker. */
  beatsToNext?: number;
}

export interface TrackCues {
  sourceApp: CueSourceApp;
  format: AudioFormat;
  mp3?: Mp3TimingInfo;
  cues: CuePoint[];
  trackColor: Rgb | null;
  comment?: string;
  bpmLocked?: boolean;
  /** Captured but not exported in v1 — Rekordbox re-analyzes the grid. */
  beatgrid?: BeatgridMarker[];
}
