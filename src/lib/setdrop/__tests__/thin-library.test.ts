import { describe, expect, it } from 'vitest';
import { genreRelevance, gigGenreMatch, lacksGenreSignal, passesGenreGate, suggestGigGenre } from '../genre';
import { classifyReadiness, MIN_SUPERFAMILY_TRACKS, type ReadinessCounts } from '../readiness';

describe('lacksGenreSignal', () => {
  it('treats empty and unplaceable genre strings as untagged', () => {
    expect(lacksGenreSignal('')).toBe(true);
    expect(lacksGenreSignal('Peru BPM')).toBe(true);
    expect(lacksGenreSignal('Other')).toBe(true);
  });

  it('keeps real genres, including non-dance ones, as a signal', () => {
    expect(lacksGenreSignal('Tech House')).toBe(false);
    expect(lacksGenreSignal('Hip Hop/Rap')).toBe(false);
    expect(lacksGenreSignal('Disco')).toBe(false);
    expect(lacksGenreSignal('Rock')).toBe(false);
    expect(lacksGenreSignal('Blues')).toBe(false);
    expect(lacksGenreSignal('Loop Samples')).toBe(false);
  });
});

describe('genre gate with record-pool labels', () => {
  it('scores an unplaceable genre as the untagged fallback', () => {
    expect(genreRelevance('Reggaeton', 'Peru BPM').tier).toBe('unknown');
    expect(gigGenreMatch('Reggaeton', null, 'Peru BPM').inGenre).toBe(true);
  });

  it('still keeps real off-family genres out', () => {
    expect(passesGenreGate('House', 'Rock')).toBe(false);
    expect(passesGenreGate('House', 'Hip Hop')).toBe(false);
    expect(passesGenreGate('Reggaeton', 'Blues')).toBe(false);
  });

  it('crate fill (allowUnknown off) never pads with unplaceable genres', () => {
    expect(passesGenreGate('House', 'Peru BPM', [], { allowUnknown: false })).toBe(false);
    expect(passesGenreGate('House', '', [], { allowUnknown: false })).toBe(false);
  });

  it('an unclassified gig genre keeps exact matches', () => {
    expect(genreRelevance('Peru BPM', 'Peru BPM').tier).toBe('exact');
  });
});

describe('super-family floor counts untagged tracks with a BPM', () => {
  const counts = (over: Partial<ReadinessCounts>): ReadinessCounts => ({
    exact: 0, family: 0, adjacent: 0, superFamily: 0, usable: 0, withYear: 0, poolTotal: 0, ...over,
  });

  it('is red when the library has neither tagged nor untagged tracks', () => {
    expect(classifyReadiness(counts({ superFamily: 3, usable: 40 }), 24, false).status).toBe('red');
  });

  it('is no longer red for a mostly untagged library', () => {
    const r = classifyReadiness(counts({ superFamily: 3, untagged: 400, usable: 403 }), 24, false);
    expect(r.status).not.toBe('red');
    expect(MIN_SUPERFAMILY_TRACKS).toBe(20);
  });
});

describe('suggestGigGenre', () => {
  it('merges spelling variants and picks the biggest builder genre', () => {
    const rows = [
      { genre: 'Other', track_count: 900 },
      { genre: 'Hip Hop', track_count: 300 },
      { genre: 'Hiphop', track_count: 250 },
      { genre: 'House', track_count: 400 },
    ];
    expect(suggestGigGenre(rows)).toBe('Hip-Hop');
  });

  it('ignores labels that are not builder genres and returns null when none map', () => {
    expect(suggestGigGenre([{ genre: 'Peru BPM', track_count: 1067 }, { genre: null, track_count: 50 }])).toBeNull();
    expect(suggestGigGenre([])).toBeNull();
  });

  it('accepts string counts as returned by Postgres bigint', () => {
    expect(suggestGigGenre([{ genre: 'Tech House', track_count: '12' }])).toBe('Tech House');
  });
});
