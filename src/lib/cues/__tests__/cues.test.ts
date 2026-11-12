import { describe, it, expect } from 'vitest';
import { bytesByteSource, decodeBase64Lenient } from '../bytes';
import { readSeratoMp3Cues } from '../serato/read';
import { serato32Decode } from '../serato/markers';
import { parseSeratoMarkers2 } from '../serato/markers2';
import { seratoToRekordboxOffsetMs } from '../offset';
import { cuesToPositionMarks } from '../rekordbox-marks';
import { rgbToHex, hexToRgb, nearestInPalette } from '../colors';
import type { CuePoint, Mp3TimingInfo } from '../types';

const u32be = (n: number) => Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

describe('decodeBase64Lenient', () => {
  it('ignores newlines and tolerates missing padding', () => {
    const hello = decodeBase64Lenient('SGVs\nbG8'); // "Hello", no '=' padding, with a newline
    expect(Buffer.from(hello).toString('latin1')).toBe('Hello');
  });
  it('matches a strict decode with padding', () => {
    const out = decodeBase64Lenient('U2VyYXRv'); // "Serato"
    expect(Buffer.from(out).toString('latin1')).toBe('Serato');
  });
});

describe('serato32Decode', () => {
  it('round-trips a packed 7-bit-per-byte value', () => {
    const v = 1_000_000;
    const packed = Uint8Array.from([(v >> 21) & 0x7f, (v >> 14) & 0x7f, (v >> 7) & 0x7f, v & 0x7f]);
    expect(serato32Decode(packed, 0)).toBe(v);
  });
});

describe('parseSeratoMarkers2', () => {
  function entry(name: string, payload: Buffer): Buffer {
    return Buffer.concat([Buffer.from(name + '\0', 'latin1'), u32be(payload.length), payload]);
  }
  it('parses CUE, LOOP, COLOR and BPMLOCK through the base64 wrapper', () => {
    const cue = Buffer.concat([
      Buffer.from([0x00, 2]), u32be(12345), Buffer.from([0x00, 0xcc, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from('Intro\0', 'utf8'),
    ]);
    const loop = Buffer.concat([
      Buffer.from([0x00, 1]), u32be(1000), u32be(5000), Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from([0x00]), Buffer.from([0x27, 0xaa, 0xe1]), Buffer.from([0x00, 0x01]),
      Buffer.from('Loop1\0', 'utf8'),
    ]);
    const inner = Buffer.concat([
      Buffer.from([0x01, 0x01]),
      entry('COLOR', Buffer.from([0x00, 0x99, 0x88, 0x77])),
      entry('CUE', cue),
      entry('LOOP', loop),
      entry('BPMLOCK', Buffer.from([0x01])),
      Buffer.from([0x00]),
    ]);
    const geob = Buffer.concat([
      Buffer.from([0x01, 0x01]), Buffer.from(inner.toString('base64'), 'latin1'),
      Buffer.from([0x00]), Buffer.alloc(16),
    ]);

    const res = parseSeratoMarkers2(new Uint8Array(geob));
    expect(res.bpmLocked).toBe(true);
    expect(res.trackColor).toEqual({ r: 0x99, g: 0x88, b: 0x77 });
    expect(res.cues).toHaveLength(2);

    const hot = res.cues.find(c => c.kind === 'hotcue')!;
    expect(hot).toMatchObject({ slot: 2, startMs: 12345, name: 'Intro', color: { r: 0xcc, g: 0, b: 0 } });

    const lp = res.cues.find(c => c.kind === 'loop')!;
    expect(lp).toMatchObject({ slot: 1, startMs: 1000, endMs: 5000, locked: true, name: 'Loop1' });
  });
});

describe('seratoToRekordboxOffsetMs', () => {
  const info = (over: Partial<Mp3TimingInfo>): Mp3TimingInfo =>
    ({ timingCase: 'A', sampleRate: 44100, samplesPerFrame: 1152, encoder: null, ...over });
  it('is zero for case D', () => {
    expect(seratoToRekordboxOffsetMs(info({ timingCase: 'D' }))).toBe(0);
  });
  it('is ~ -26 ms at 44.1 kHz and -24 ms at 48 kHz for cases A/B/C', () => {
    expect(seratoToRekordboxOffsetMs(info({}))).toBeCloseTo(-26.12, 1);
    expect(seratoToRekordboxOffsetMs(info({ sampleRate: 48000 }))).toBeCloseTo(-24.0, 1);
  });
  it('is zero when there is no timing info', () => {
    expect(seratoToRekordboxOffsetMs(undefined)).toBe(0);
  });
});

describe('cuesToPositionMarks', () => {
  it('writes hot cues as Type 0 with the slot number and locale-independent seconds', () => {
    const cue: CuePoint = { kind: 'hotcue', slot: 3, startMs: 1500, name: 'Drop', color: { r: 255, g: 0, b: 0 } };
    const xml = cuesToPositionMarks([cue]);
    expect(xml).toContain('Type="0"');
    expect(xml).toContain('Num="3"');
    expect(xml).toContain('Start="1.500"');
    expect(xml).toContain('Red="255" Green="0" Blue="0"');
  });
  it('writes loops as Type 4 memory loops (Num -1) by default with an End', () => {
    const loop: CuePoint = { kind: 'loop', slot: 0, startMs: 2000, endMs: 4000, name: 'L', color: null };
    const xml = cuesToPositionMarks([loop]);
    expect(xml).toContain('Type="4"');
    expect(xml).toContain('Num="-1"');
    expect(xml).toContain('End="4.000"');
  });
});

describe('readSeratoMp3Cues (integration)', () => {
  function entry(name: string, payload: Buffer): Buffer {
    return Buffer.concat([Buffer.from(name + '\0', 'latin1'), u32be(payload.length), payload]);
  }
  function markers2Geob(): Buffer {
    const cue = Buffer.concat([
      Buffer.from([0x00, 0]), u32be(8000), Buffer.from([0x00, 0xcc, 0x00, 0x00, 0x00, 0x00]),
      Buffer.from('Start\0', 'utf8'),
    ]);
    const inner = Buffer.concat([Buffer.from([0x01, 0x01]), entry('CUE', cue), Buffer.from([0x00])]);
    return Buffer.concat([Buffer.from([0x01, 0x01]), Buffer.from(inner.toString('base64'), 'latin1'), Buffer.from([0x00]), Buffer.alloc(8)]);
  }
  // Synchsafe (7 bits/byte) size used by the ID3v2 tag header.
  const synchsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);

  it('walks the ID3 tag, reads the GEOB, and classifies the first frame as case A', async () => {
    const obj = markers2Geob();
    const geobData = Buffer.concat([
      Buffer.from([0x00]),                                   // text encoding
      Buffer.from('application/octet-stream\0', 'latin1'),   // MIME
      Buffer.from('\0', 'latin1'),                           // filename
      Buffer.from('Serato Markers2\0', 'latin1'),            // description
      obj,                                                   // object data
    ]);
    const frame = Buffer.concat([Buffer.from('GEOB', 'latin1'), u32be(geobData.length), Buffer.from([0x00, 0x00]), geobData]);
    const header = Buffer.concat([Buffer.from('ID3', 'latin1'), Buffer.from([0x03, 0x00, 0x00]), synchsafe(frame.length)]);
    // A valid MPEG1 Layer III frame header (no Xing) → timing case A, 44.1 kHz.
    const audio = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(200)]);
    const mp3 = Buffer.concat([header, frame, audio]);

    const { cues: track, frame: analysis } = await readSeratoMp3Cues(bytesByteSource(new Uint8Array(mp3)), 'test.mp3');
    expect(track.cues).toHaveLength(1);
    expect(track.cues[0]).toMatchObject({ kind: 'hotcue', slot: 0, startMs: 8000, name: 'Start' });
    expect(analysis?.timingCase).toBe('A');
    expect(track.mp3?.sampleRate).toBe(44100);
  });
});

describe('colors', () => {
  it('converts rgb <-> hex', () => {
    expect(rgbToHex({ r: 0xc0, g: 0x26, b: 0x26 })).toBe('C02626');
    expect(hexToRgb('#E62828')).toEqual({ r: 0xe6, g: 0x28, b: 0x28 });
  });
  it('finds the nearest palette colour', () => {
    const palette = [{ r: 230, g: 40, b: 40 }, { r: 40, g: 226, b: 20 }];
    expect(nearestInPalette({ r: 200, g: 20, b: 20 }, palette)).toEqual(palette[0]);
  });
});
