import { describe, expect, it } from 'vitest';
import { classifyStage, decide, MAX_SENDS, type Candidate } from '../re-engagement';

const NOW = Date.parse('2026-12-01T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 24 * 3_600_000).toISOString();
const cand = (over: Partial<Candidate> = {}): Candidate => ({
  userId: 'u1', email: 'a@b.co', lastSignInAt: daysAgo(30),
  activity: { hasLibrary: true, setCount: 2, exportCount: 1 }, priorSends: [], ...over,
});

describe('classifyStage', () => {
  it('picks the furthest point reached', () => {
    expect(classifyStage({ hasLibrary: false, setCount: 0, exportCount: 0 })).toBe('import');
    expect(classifyStage({ hasLibrary: true, setCount: 0, exportCount: 0 })).toBe('plan');
    expect(classifyStage({ hasLibrary: true, setCount: 3, exportCount: 0 })).toBe('export');
    expect(classifyStage({ hasLibrary: true, setCount: 3, exportCount: 2 })).toBe('winback');
  });
});

describe('decide', () => {
  it('sends the first email to a dormant user', () => {
    expect(decide(cand(), NOW).skip).toBeUndefined();
  });
  it('skips users active in the last 14 days', () => {
    expect(decide(cand({ lastSignInAt: daysAgo(5) }), NOW).skip).toBe('active');
  });
  it('waits the minimum gap before a second email', () => {
    expect(decide(cand({ priorSends: [daysAgo(10)] }), NOW).skip).toBe('too_soon');
    expect(decide(cand({ priorSends: [daysAgo(25)] }), NOW).skip).toBeUndefined();
  });
  it('never emails someone recorded as unsubscribed', () => {
    expect(decide(cand({ suppressed: true }), NOW).skip).toBe('unsubscribed');
  });
  it('never sends past the cap', () => {
    const sends = Array.from({ length: MAX_SENDS }, () => daysAgo(90));
    expect(decide(cand({ priorSends: sends }), NOW).skip).toBe('capped');
  });
});
