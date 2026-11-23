// Gig dates are calendar days (YYYY-MM-DD), not instants. `new Date('2026-12-06')`
// reads that as UTC midnight, which is Dec 5 on a US clock, so every comparison
// and display goes through these helpers instead: a gig date is the local day.

/** Parse a YYYY-MM-DD (or ISO timestamp) gig date as that local calendar day. */
export function parseGigDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole calendar days from `now` to the gig day: 0 = today, 1 = tomorrow, negative = past. */
export function daysUntilGig(value: string, now: Date = new Date()): number {
  const ms = startOfDay(parseGigDate(value)).getTime() - startOfDay(now).getTime();
  return Math.round(ms / 86_400_000);
}

/** The soonest gig today or later, or null. Input order doesn't matter. */
export function nextGig<T extends { gigDate: string }>(gigs: T[], now: Date = new Date()): T | null {
  const upcoming = gigs.filter(g => daysUntilGig(g.gigDate, now) >= 0);
  upcoming.sort((a, b) => parseGigDate(a.gigDate).getTime() - parseGigDate(b.gigDate).getTime());
  return upcoming[0] ?? null;
}

/** Gigs before today, most recent first. */
export function pastGigs<T extends { gigDate: string }>(gigs: T[], now: Date = new Date()): T[] {
  return gigs
    .filter(g => daysUntilGig(g.gigDate, now) < 0)
    .sort((a, b) => parseGigDate(b.gigDate).getTime() - parseGigDate(a.gigDate).getTime());
}

export function formatGigDate(value: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  return parseGigDate(value).toLocaleDateString('en-US', opts);
}
