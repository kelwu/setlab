import { describe, it, expect } from 'vitest';
import { parseSeratoCrate, crateNamePath, buildCrateTree } from '../serato/crate-reader';
import { parseSeratoDatabase } from '@/lib/setdrop/serato-db-parser';
import { buildPickIndex, matchSeratoPath, matchLibrary, resolveAbsolutePath, guessLibraryRoot, normalizeRelPath } from '../match';
import { convertSeratoLibrary, CONVERT_FOLDER_NAME } from '../convert';
import { sanitizeTrackCues, MAX_CUES_PER_TRACK, MAX_NAME_LEN } from '../validate';
import { escapeXmlAttr } from '../rekordbox-marks';
import { analyseFirstFrame, mp3DurationMs } from '../serato/mpeg-header';
import type { ScannedFile } from '../scan';
import type { TrackCues } from '../types';

// --- Serato tag-container builders -----------------------------------------
const u32 = (n: number) => Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
const utf16be = (s: string) => Buffer.from(s, 'utf16le').swap16();
const tag = (name: string, payload: Buffer) => Buffer.concat([Buffer.from(name, 'ascii'), u32(payload.length), payload]);
const otrk = (fields: Record<string, string>) =>
  tag('otrk', Buffer.concat(Object.entries(fields).map(([k, v]) => tag(k, utf16be(v)))));

describe('crate reader', () => {
  it('reads ptrk paths in order', () => {
    const crate = Buffer.concat([
      tag('vrsn', utf16be('1.0/Serato ScratchLive Crate')),
      tag('osrt', tag('tvcn', utf16be('song'))),
      otrk({ ptrk: 'Users/kel/Music/a.mp3' }),
      otrk({ ptrk: 'Users/kel/Music/b.mp3' }),
    ]);
    expect(parseSeratoCrate(crate)).toEqual(['Users/kel/Music/a.mp3', 'Users/kel/Music/b.mp3']);
  });

  it('splits nesting from the filename', () => {
    expect(crateNamePath('Subcrates/House%%Deep%%Late.crate')).toEqual(['House', 'Deep', 'Late']);
  });

  it('builds a tree, creating implicit parents and keeping parent tracks', () => {
    const tree = buildCrateTree([
      { filename: 'House.crate', tracks: ['h.mp3'] },
      { filename: 'House%%Deep.crate', tracks: ['d.mp3'] },
      { filename: 'Edits%%2024.crate', tracks: ['e.mp3'] },
    ]);
    expect(tree.map(n => n.name)).toEqual(['House', 'Edits']);
    expect(tree[0].tracks).toEqual(['h.mp3']);
    expect(tree[0].children[0]).toMatchObject({ name: 'Deep', tracks: ['d.mp3'] });
    expect(tree[1].tracks).toEqual([]); // implicit folder
  });
});

describe('database parser (Uint8Array)', () => {
  it('parses a plain Uint8Array, not just a Buffer', () => {
    const db = Buffer.concat([
      tag('vrsn', utf16be('2.0/Serato Scratch LIVE Database')),
      otrk({ pfil: 'Users/kel/Music/x.mp3', tsng: 'Song', tart: 'Artist', tbpm: '124.00', tkey: 'Am' }),
    ]);
    const { tracks } = parseSeratoDatabase(new Uint8Array(db));
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ title: 'Song', artist: 'Artist', bpm: 124, key: '8A', filePath: 'Users/kel/Music/x.mp3' });
  });
});

describe('path matching', () => {
  const picked = ['Music/House/a.mp3', 'Music/Hip Hop/a.mp3', 'Music/House/b.MP3'];
  const index = buildPickIndex(picked);

  it('matches on the longest shared suffix', () => {
    expect(matchSeratoPath('Users/kel/Music/House/a.mp3', index)).toBe(0);
    expect(matchSeratoPath('Users/kel/Music/Hip Hop/a.mp3', index)).toBe(1);
  });
  it('is case-insensitive and handles backslashes and absolute forms', () => {
    expect(matchSeratoPath('/Users/kel/music/house/B.mp3', index)).toBe(2);
    expect(matchSeratoPath('C:\\Users\\kel\\Music\\House\\b.mp3', index)).toBe(2);
  });
  it('refuses an ambiguous bare filename and reports missing files', () => {
    expect(matchSeratoPath('Elsewhere/a.mp3', index)).toBeNull();
    expect(matchSeratoPath('Users/kel/Music/House/zzz.mp3', index)).toBeNull();
  });
  it('never matches a same-named copy in a different folder', () => {
    // Real case: "Daruma Playlist/Blinding Lights.mp3" must not pick up the copy
    // one folder up, which carries different cues.
    const idx = buildPickIndex(['Music/Crate/Blinding Lights.mp3']);
    expect(matchSeratoPath('Users/kel/Music/Crate/Daruma Playlist/Blinding Lights.mp3', idx)).toBeNull();
    expect(matchSeratoPath('Users/kel/Music/Crate/Blinding Lights.mp3', idx)).toBe(0);
  });
  it('matches when the pick is a drive root (Serato path has no user prefix)', () => {
    const idx = buildPickIndex(['DJ SSD/_sDJ Music/House/a.mp3']);
    expect(matchSeratoPath('_sDJ Music/House/a.mp3', idx)).toBe(0);
  });
  it('matchLibrary rejects a same-named folder elsewhere on the drive', () => {
    const picked = ['Music/Crate/a.mp3', 'Music/Crate/b.mp3', 'Music/Crate/c.mp3'];
    const m = matchLibrary([
      'Users/kel/Music/Crate/a.mp3',
      'Users/kel/Music/Crate/b.mp3',
      'Users/kel/OneDrive/Music/Crate/c.mp3', // a different file that only looks the same
    ], picked);
    expect([...m.keys()]).toEqual(['Users/kel/Music/Crate/a.mp3', 'Users/kel/Music/Crate/b.mp3']);
  });
  it('normalizes file:// URLs', () => {
    expect(normalizeRelPath('file://localhost/Users/Kel/A%20B.mp3')).toBe('users/kel/a b.mp3');
  });
});

describe('resolveAbsolutePath / guessLibraryRoot', () => {
  it('prefixes volume-relative paths with the root', () => {
    expect(resolveAbsolutePath('Users/kel/x.mp3', '')).toBe('/Users/kel/x.mp3');
    expect(resolveAbsolutePath('Users/kel/x.mp3', 'C:')).toBe('C:/Users/kel/x.mp3');
    expect(resolveAbsolutePath('_sDJ Music/x.mp3', '/Volumes/DJ SSD/')).toBe('/Volumes/DJ SSD/_sDJ Music/x.mp3');
  });
  it('passes absolute paths through', () => {
    expect(resolveAbsolutePath('/Volumes/X/a.mp3', 'C:')).toBe('/Volumes/X/a.mp3');
    expect(resolveAbsolutePath('/C:/Music/a.mp3', '')).toBe('/C:/Music/a.mp3');
    expect(resolveAbsolutePath('D:\\Music\\a.mp3', '')).toBe('D:/Music/a.mp3');
  });
  it('guesses system drive vs external drive', () => {
    expect(guessLibraryRoot('Users/kel/Music/a.mp3', 'mac', 'Music')).toBe('');
    expect(guessLibraryRoot('Users/kel/Music/a.mp3', 'windows', 'Music')).toBe('C:');
    expect(guessLibraryRoot('_sDJ Music/a.mp3', 'mac', 'DJ SSD')).toBe('/Volumes/DJ SSD');
  });
});

describe('convertSeratoLibrary', () => {
  const lt = (filePath: string, title: string) =>
    ({ id: filePath, artist: 'A', title, bpm: 120, key: '8A', filePath, isWishlist: false });
  const caseA: TrackCues = {
    sourceApp: 'serato', format: 'mp3', trackColor: { r: 0xcc, g: 0, b: 0 },
    mp3: { timingCase: 'A', sampleRate: 44100, samplesPerFrame: 1152, encoder: null },
    cues: [{ kind: 'hotcue', slot: 0, startMs: 1000, name: 'Drop', color: { r: 0xcc, g: 0, b: 0 } }],
  };
  const scan = (relPath: string, cues?: TrackCues): ScannedFile =>
    ({ relPath, size: 5_000_000, lastModified: 1, fingerprint: '5000000:1', status: cues ? 'ok' : 'no-cues', cues, durationMs: 200_400 });

  const dbTracks = [
    lt('Users/kel/Music/a.mp3', 'Alpha'),
    lt('Users/kel/Music/b.mp3', 'Beta'),
    lt('Users/kel/Music/c.m4a', 'Gamma'),
    lt('/tidal:tracks:123', 'Stream'),
  ];
  const crates = buildCrateTree([
    { filename: 'House.crate', tracks: ['Users/kel/Music/a.mp3'] },
    { filename: 'House%%Deep.crate', tracks: ['Users/kel/Music/b.mp3', 'Users/kel/Music/gone.mp3'] },
    { filename: 'Empty.crate', tracks: [] },
  ]);
  const scans = new Map([['Users/kel/Music/a.mp3', scan('Music/a.mp3', caseA)], ['Users/kel/Music/b.mp3', scan('Music/b.mp3')]]);

  const { xml, stats } = convertSeratoLibrary({ dbTracks, crates, scans, root: '' });

  it('exports local tracks, skips streaming, applies the offset', () => {
    expect(stats).toMatchObject({ tracks: 3, tracksWithCues: 1, cues: 1, notScanned: 1, streaming: 1 });
    // case A at 44.1 kHz: 1000 ms − 26.1 ms → 0.974 s
    expect(xml).toContain('<POSITION_MARK Name="Drop" Type="0" Start="0.974" Num="0" Red="204" Green="0" Blue="0"/>');
  });
  it('writes the metadata Rekordbox needs to show cues', () => {
    expect(xml).toMatch(/Name="Alpha"[^>]*Kind="MP3 File" Size="5000000" TotalTime="200" SampleRate="44100"/);
    expect(xml).toContain('Location="file://localhost/Users/kel/Music/a.mp3"');
    expect(xml).toContain('Colour="0xFF0000"'); // #CC0000 snaps to Rekordbox red
  });
  it('mirrors crates under one folder; a crate with tracks AND children gets a same-named playlist', () => {
    expect(xml).toContain(`<NODE Type="0" Name="${CONVERT_FOLDER_NAME}" Count="1">`);
    expect(xml).toMatch(/<NODE Type="0" Name="House" Count="2">\s*<NODE Name="House" Type="1" KeyType="0" Entries="1">/);
    expect(xml).toContain('<NODE Name="Deep" Type="1" KeyType="0" Entries="1">'); // missing file dropped
    expect(xml).not.toContain('Name="Empty"');
    expect(stats.playlists).toBe(2);
  });
  it('honours a selection', () => {
    const r = convertSeratoLibrary({ dbTracks, crates, scans, root: '', selected: new Set(['Users/kel/Music/b.mp3']) });
    expect(r.stats.tracks).toBe(1);
    expect(r.xml).not.toContain('Name="Alpha"');
  });
});

describe('sanitizeTrackCues', () => {
  it('clamps, drops junk and caps counts', () => {
    const cues = Array.from({ length: 40 }, (_, i) => ({ kind: 'hotcue', slot: i % 8, startMs: i * 1000, name: 'x'.repeat(200), color: { r: 300, g: -5, b: 10 } }));
    const out = sanitizeTrackCues({ sourceApp: 'serato', format: 'mp3', cues: [...cues, { kind: 'evil' }], trackColor: null, beatgrid: [1, 2, 3] })!;
    expect(out.cues).toHaveLength(MAX_CUES_PER_TRACK);
    expect(out.cues[0].name).toHaveLength(MAX_NAME_LEN);
    expect(out.cues[0].color).toEqual({ r: 255, g: 0, b: 10 });
    expect(out).not.toHaveProperty('beatgrid');
  });
  it('rejects non-objects and loops that end before they start', () => {
    expect(sanitizeTrackCues('nope')).toBeNull();
    const out = sanitizeTrackCues({ sourceApp: 'serato', cues: [{ kind: 'loop', slot: 0, startMs: 5000, endMs: 4000, name: '' }] })!;
    expect(out.cues).toHaveLength(0);
  });
});

describe('escapeXmlAttr', () => {
  it('strips characters XML 1.0 forbids', () => {
    expect(escapeXmlAttr('A\u0001B & "C"\uD800')).toBe('AB &amp; &quot;C&quot;');
    expect(escapeXmlAttr('emoji 🎧 ok')).toBe('emoji 🎧 ok');
  });
});

describe('mp3DurationMs', () => {
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, stereo, no CRC: FF FB 90 00
  const header = [0xff, 0xfb, 0x90, 0x00];
  it('uses the Xing frame count when present', () => {
    const b = new Uint8Array(512);
    b.set(header, 0);
    b.set([0x58, 0x69, 0x6e, 0x67, 0, 0, 0, 1], 4 + 32); // "Xing", flags = frames
    b.set([0, 0, 0x1b, 0x6b], 4 + 32 + 8);               // 7019 frames
    const f = analyseFirstFrame(b)!;
    expect(f.xingFrames).toBe(7019);
    expect(mp3DurationMs(f, 0)).toBe(Math.round((7019 * 1152 * 1000) / 44100));
  });
  it('estimates CBR length from the bitrate without a Xing header', () => {
    const b = new Uint8Array(512);
    b.set(header, 0);
    const f = analyseFirstFrame(b)!;
    expect(f.bitrateKbps).toBe(128);
    expect(mp3DurationMs(f, 16_000 * 180)).toBe(180_000); // 128 kbps = 16,000 B/s
  });
});
