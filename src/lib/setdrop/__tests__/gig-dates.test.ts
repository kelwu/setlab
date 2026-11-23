import { describe, expect, it } from 'vitest';
import { daysUntilGig, formatGigDate, nextGig, pastGigs, parseGigDate } from '../gig-dates';

const now = new Date(2026, 10, 23, 15, 30); // Nov 23, 2026, 3:30 pm local

describe('gig dates are local calendar days', () => {
  it('parses YYYY-MM-DD as that local day, not UTC midnight', () => {
    const d = parseGigDate('2026-12-06');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 11, 6]);
    expect(formatGigDate('2026-12-06', { month: 'short', day: 'numeric' })).toBe('Dec 6');
  });

  it('counts whole days, with today as 0 even late in the day', () => {
    expect(daysUntilGig('2026-11-23', now)).toBe(0);
    expect(daysUntilGig('2026-11-24', now)).toBe(1);
    expect(daysUntilGig('2026-12-06', now)).toBe(13);
    expect(daysUntilGig('2026-11-22', now)).toBe(-1);
  });
});

describe('nextGig / pastGigs', () => {
  const gigs = [
    { gigDate: '2026-12-31', n: 'nye' },
    { gigDate: '2026-11-22', n: 'last night' },
    { gigDate: '2026-11-23', n: 'tonight' },
    { gigDate: '2026-12-06', n: 'dec 6' },
  ];

  it('picks the nearest upcoming gig, including tonight, whatever the input order', () => {
    expect(nextGig(gigs, now)?.n).toBe('tonight');
    expect(nextGig(gigs.filter(g => g.n !== 'tonight'), now)?.n).toBe('dec 6');
  });

  it('returns null with no upcoming gig', () => {
    expect(nextGig([{ gigDate: '2026-01-01' }], now)).toBeNull();
    expect(nextGig([], now)).toBeNull();
  });

  it('lists past gigs most recent first and leaves tonight out', () => {
    expect(pastGigs(gigs, now).map(g => g.n)).toEqual(['last night']);
  });
});
