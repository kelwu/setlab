import { describe, it, expect } from 'vitest';
import { analysePick } from '../folder-pick';
import { buildCrateTree, flattenCrates, pruneCrateTree } from '../serato/crate-reader';
import { cuesToPositionMarks } from '../rekordbox-marks';
import type { CuePoint } from '../types';

describe('analysePick', () => {
  it('finds the database, its crates and the audio', () => {
    const rel = [
      'Music/_Serato_/database V2',
      'Music/_Serato_/Subcrates/House.crate',
      'Music/_Serato_/Subcrates/House%%Deep.crate',
      'Music/_Serato_/neworder.pref',
      'Music/House/a.mp3',
      'Music/House/._a.mp3',            // AppleDouble stub — ignored
      'Music/House/cover.jpg',          // not audio
      'Music/Old/_Serato_/database V2', // deeper backup — must not win
      'Music/Old/_Serato_/Subcrates/Old.crate',
      'Music/Old/b.m4a',
    ];
    const l = analysePick(rel);
    expect(l.dbIndex).toBe(0);
    expect(l.crateIndexes).toEqual([1, 2]);
    expect(l.audioIndexes.map(i => rel[i])).toEqual(['Music/House/a.mp3', 'Music/Old/b.m4a']);
    expect(l.topFolder).toBe('Music');
  });

  it('reports a pick with no Serato library', () => {
    expect(analysePick(['Tunes/a.mp3']).dbIndex).toBeNull();
  });
});

describe('crate ids and pruning', () => {
  const tree = buildCrateTree([
    { filename: 'House.crate', tracks: ['h'] },
    { filename: 'House%%Deep.crate', tracks: ['d'] },
    { filename: 'House%%Deep%%Late.crate', tracks: ['l'] },
    { filename: 'Latin.crate', tracks: ['x'] },
  ]);

  it('gives each crate its full Serato path as id', () => {
    expect(flattenCrates(tree).map(c => c.id)).toEqual(['House', 'House%%Deep', 'House%%Deep%%Late', 'Latin']);
  });

  it('keeps selected crates and turns unselected ancestors into empty folders', () => {
    const pruned = pruneCrateTree(tree, new Set(['House%%Deep%%Late']));
    expect(pruned).toHaveLength(1);
    expect(pruned[0]).toMatchObject({ id: 'House', tracks: [] });
    expect(pruned[0].children[0]).toMatchObject({ id: 'House%%Deep', tracks: [] });
    expect(pruned[0].children[0].children[0]).toMatchObject({ id: 'House%%Deep%%Late', tracks: ['l'] });
  });
});

describe('loops as hot cues', () => {
  const hot = (slot: number): CuePoint => ({ kind: 'hotcue', slot, startMs: slot * 1000, name: '', color: null });
  const loop = (slot: number): CuePoint => ({ kind: 'loop', slot, startMs: 50_000 + slot, endMs: 60_000, name: `L${slot}`, color: null });

  it('places loops on pads no hot cue uses, never displacing one', () => {
    const xml = cuesToPositionMarks([hot(0), hot(1), loop(0), loop(1)], { loopsAsHotcue: true });
    expect(xml).toContain('Name="L0" Type="4" Start="50.000" End="60.000" Num="2"');
    expect(xml).toContain('Name="L1" Type="4" Start="50.001" End="60.000" Num="3"');
  });

  it('falls back to memory loops when all 8 pads are taken', () => {
    const xml = cuesToPositionMarks([...[0, 1, 2, 3, 4, 5, 6, 7].map(hot), loop(0)], { loopsAsHotcue: true });
    expect(xml).toContain('Name="L0" Type="4" Start="50.000" End="60.000" Num="-1"');
  });
});
