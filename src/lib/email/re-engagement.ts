// Decides who gets which re-engagement email, and how many times. Pure logic so
// the cron route stays thin and the rules are unit-tested.

export type ReEngagementStage = 'import' | 'plan' | 'export' | 'winback';

/** Loops event fired for each stage. Each one needs its own loop (and copy) in Loops. */
export const STAGE_EVENT: Record<ReEngagementStage, string> = {
  import: 're_engagement_import',
  plan: 're_engagement_plan',
  export: 're_engagement_export',
  winback: 're_engagement_winback',
};

/** Hard cap on re-engagement emails per user, ever. */
export const MAX_SENDS = 2;
/** Days of inactivity before the first email. */
export const INACTIVE_DAYS = 14;
/** Minimum days between two re-engagement emails to the same user. */
export const MIN_GAP_DAYS = 21;

export interface UserActivity {
  hasLibrary: boolean;
  setCount: number;
  exportCount: number;
}

/** The furthest point a user reached, which decides what nudge fits. */
export function classifyStage(a: UserActivity): ReEngagementStage {
  if (!a.hasLibrary) return 'import';
  if (a.setCount === 0) return 'plan';
  if (a.exportCount === 0) return 'export';
  return 'winback';
}

export interface Candidate {
  userId: string;
  email: string;
  lastSignInAt: string;
  activity: UserActivity;
  /** sent_at timestamps of earlier re-engagement emails to this user */
  priorSends: string[];
}

export type SkipReason = 'capped' | 'too_soon' | 'active';

export interface Decision {
  userId: string;
  email: string;
  stage: ReEngagementStage;
  skip?: SkipReason;
}

const DAY = 24 * 3_600_000;

export function decide(c: Candidate, now = Date.now()): Decision {
  const stage = classifyStage(c.activity);
  const base = { userId: c.userId, email: c.email, stage };
  if (Date.parse(c.lastSignInAt) > now - INACTIVE_DAYS * DAY) return { ...base, skip: 'active' };
  if (c.priorSends.length >= MAX_SENDS) return { ...base, skip: 'capped' };
  const last = c.priorSends.reduce((m, s) => Math.max(m, Date.parse(s)), 0);
  if (last > now - MIN_GAP_DAYS * DAY) return { ...base, skip: 'too_soon' };
  return base;
}
