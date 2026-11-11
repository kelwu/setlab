// MP3 position-offset correction between DJ apps.
//
// Different encoders tag the first MPEG frame differently (Xing/Info/LAME +
// CRC), and apps disagree on how much of that first frame is encoder delay. The
// same stored millisecond therefore points at slightly different audio in each
// app, so a cue copied verbatim lands a frame early or late.
//
// The rule below is the dj-data-converter classification (plan §2 "MP3
// offset"): timing case D (a valid LAME tag) needs no correction; cases A/B/C
// shift by one MPEG frame of samples (~26 ms at 44.1 kHz, ~24 ms at 48 kHz).
//
// Serato → Rekordbox isn't documented anywhere, so this was measured (Phase 0,
// 2026-11-10, rekordbox 7.2.19 on Windows): RAW Serato positions imported via
// XML landed late on case A/B tracks by about one frame and exactly on case D,
// at 44.1 kHz. Not yet observed: case C (rare) and A/B at 48 kHz. Keeping the
// whole rule in this one function is what makes that correction (and the
// Phase 2 reverse direction) a single tested place.

import { CuePoint, Mp3TimingInfo } from './types';

/**
 * The signed millisecond shift to apply to Serato positions so they line up in
 * Rekordbox. Negative = Rekordbox plays the cue earlier. Returns 0 when there's
 * no timing info (e.g. a non-MP3 format) or on case D.
 */
export function seratoToRekordboxOffsetMs(mp3?: Mp3TimingInfo): number {
  if (!mp3 || mp3.timingCase === 'D') return 0;
  // One encoder-delay frame expressed in ms. 1152 / 44100 ≈ 26.1, 1152 / 48000
  // = 24.0 — matches the documented 26/24 ms figures. Applied as a negative.
  return -(mp3.samplesPerFrame / mp3.sampleRate) * 1000;
}

/** Apply a signed ms shift to one cue, clamping positions at 0. */
export function shiftCue(cue: CuePoint, deltaMs: number): CuePoint {
  if (!deltaMs) return cue;
  const start = Math.max(0, Math.round(cue.startMs + deltaMs));
  const out: CuePoint = { ...cue, startMs: start };
  if (cue.endMs != null) out.endMs = Math.max(0, Math.round(cue.endMs + deltaMs));
  return out;
}

/** Apply the Serato → Rekordbox offset to every cue in a list. */
export function convertSeratoToRekordbox(cues: CuePoint[], mp3?: Mp3TimingInfo): CuePoint[] {
  const delta = seratoToRekordboxOffsetMs(mp3);
  return delta ? cues.map(c => shiftCue(c, delta)) : cues;
}
