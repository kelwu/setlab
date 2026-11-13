import { describe, it, expect } from 'vitest';
import { matchStoredCues, StoredCueRow } from '../lookup';
import { buildRekordboxXml, matchExportTracks } from '@/lib/setdrop/rekordbox-export';
import type { LibraryTrack, SetlistTrack } from '@/lib/agents/types';
import type { TrackCues } from '../types';

const cuesAt = (ms: number, timingCase: 'A' | 'D' = 'D'): TrackCues => ({
  sourceApp: 'serato', format: 'mp3', trackColor: null,
  mp3: { timingCase, sampleRate: 44100, samplesPerFrame: 1152, encoder: null },
  cues: [{ kind: 'hotcue', slot: 0, startMs: ms, name: 'Drop', color: { r: 204, g: 0, b: 0 } }],
});

const row = (file_path: string, track_key: string | null, ms: number, extra: Partial<StoredCueRow> = {}): StoredCueRow => ({
  file_path, track_key, cues: cuesAt(ms), size_bytes: 9_000_000, duration_ms: 240_000, ...extra,
});

describe('matchStoredCues', () => {
  it('matches the same path, ignoring case and a leading slash', () => {
    const [hit] = matchStoredCues(
      [{ filePath: '/Users/kel/Music/House/A.mp3', artist: 'x', title: 'y' }],
      [row('users/kel/music/house/a.mp3', 'other|key', 1000)],
    );
    expect(hit?.cues[0].startMs).toBe(1000);
  });

  it('matches a copy on another machine by folder + filename', () => {
    // Real case: library uploaded from a Mac, cues scanned on a Windows laptop,
    // and a folder renamed in between ("Bank's" → "Banks").
    const [hit] = matchStoredCues(
      [{ filePath: "Users/kelwu/Music/DJ Kelton Banks Crate/Daruma/Cover Girls - Because Of You.mp3", artist: '', title: '' }],
      [row("Users/wuazn/Music/DJ Kelton Bank's Crate/Daruma/Cover Girls - Because Of You.mp3", null, 2000)],
    );
    expect(hit?.cues[0].startMs).toBe(2000);
  });

  it('falls back to a unique artist|title key', () => {
    const [hit] = matchStoredCues(
      [{ filePath: 'Volumes/USB/elsewhere/renamed.mp3', artist: 'Cover Girls', title: 'Because Of You' }],
      [row('Users/a/Music/x.mp3', 'cover girls|because of you', 3000)],
    );
    expect(hit?.cues[0].startMs).toBe(3000);
  });

  it('skips an ambiguous key unless the filename settles it', () => {
    const rows = [
      row('Music/House/song.mp3', 'a|b', 1000),
      row('Music/Edits/song (edit).mp3', 'a|b', 5000),
    ];
    const [none, edit] = matchStoredCues([
      { filePath: 'Other/unrelated.mp3', artist: 'A', title: 'B' },
      { filePath: 'Other/Song (Edit).mp3', artist: 'A', title: 'B' },
    ], rows);
    expect(none).toBeNull();
    expect(edit?.cues[0].startMs).toBe(5000);
  });

  it('rejects a hit whose length disagrees', () => {
    const [hit] = matchStoredCues(
      [{ filePath: 'Music/House/a.mp3', artist: '', title: '', durationSec: 300 }],
      [row('Music/House/a.mp3', null, 1000, { duration_ms: 240_000 })],
    );
    expect(hit).toBeNull();
  });

  it('applies the Serato → Rekordbox MP3 offset', () => {
    const [hit] = matchStoredCues(
      [{ filePath: 'Music/a.mp3', artist: '', title: '' }],
      [{ ...row('Music/a.mp3', null, 10_000), cues: cuesAt(10_000, 'A') }],
    );
    expect(hit?.cues[0].startMs).toBe(10_000 - 26); // one 1152-sample frame at 44.1 kHz
  });
});

describe('buildRekordboxXml with cues', () => {
  const lib: LibraryTrack[] = [
    { id: '1', artist: 'Artist', title: 'Song', bpm: 124, key: '8A', genre: 'House', filePath: 'Users/kel/Music/song.mp3', isWishlist: false },
    { id: '2', artist: 'Other', title: 'Tune', bpm: 120, key: '5A', filePath: 'Users/kel/Music/tune.mp3', isWishlist: false },
    { id: '3', artist: 'Stream', title: 'Ref', bpm: 120, key: '5A', filePath: 'soundcloud:tracks:123', isWishlist: false },
  ];
  const set = lib.map((l, i): SetlistTrack => ({
    position: i + 1, artist: l.artist, title: l.title, bpm: l.bpm, key: l.key, energyLevel: 5,
    whyThisTrack: '', transitionNotes: '', harmonicMixingNotes: '', isWishlistTrack: false,
  }));

  it('lists only local files for the cue lookup', () => {
    expect(matchExportTracks(set, lib).map(t => t.id)).toEqual(['1', '2']);
  });

  it('writes hot cues plus the length/size/kind Rekordbox needs to show them', () => {
    const cues = new Map([['Users/kel/Music/song.mp3', {
      cues: cuesAt(15_463).cues, sizeBytes: 9_891_690, durationMs: 244_428, sampleRate: 44100,
    }]]);
    const { xml, matched, skipped, withCues } = buildRekordboxXml('Friday', set, lib, { cues });
    expect({ matched, skipped, withCues }).toEqual({ matched: 2, skipped: 1, withCues: 1 });
    expect(xml).toContain('Kind="MP3 File" Size="9891690" TotalTime="244"');
    expect(xml).toContain('<POSITION_MARK Name="Drop" Type="0" Start="15.463" Num="0"');
    // The track without cues stays a bare entry, as before.
    expect(xml).toMatch(/Name="Tune"[^>]*TotalTime="0"[^>]*\/>/);
    expect(xml).toContain('<NODE Name="Friday" Type="1" KeyType="0" Entries="2">');
  });

  it('is unchanged in shape without cues', () => {
    const { xml, withCues } = buildRekordboxXml('Friday', set, lib);
    expect(withCues).toBe(0);
    expect(xml).not.toContain('POSITION_MARK');
    expect(xml).toContain('Location="file://localhost/Users/kel/Music/song.mp3"');
    expect(xml).toContain('Genre="House"');
  });
});
