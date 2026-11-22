// Getting-started checklist for new DJs: upload library → plan a set → export.
// Pure logic only (no Supabase / React) so it can be unit-tested and shared by
// the dashboard, the library import screen and the set builder.

export interface OnboardingProgress {
  /** Imported library tracks (Serato DB V2 / Rekordbox XML) or wishlist tracks exist. */
  hasLibrary: boolean;
  /** At least one saved setlist. */
  hasSet: boolean;
  /** At least one logged export (Serato crate, Rekordbox XML or M3U). */
  hasExport: boolean;
}

export type OnboardingStepId = 'library' | 'plan' | 'export';
export type OnboardingStepStatus = 'done' | 'current' | 'upcoming';

export interface OnboardingStep {
  id: OnboardingStepId;
  n: number;
  label: string;
  sub: string;
  href: string;
  cta: string;
  status: OnboardingStepStatus;
}

const STEP_DEFS: Omit<OnboardingStep, 'status'>[] = [
  {
    id: 'library', n: 1, label: 'Upload your library',
    sub: 'One file from Serato (database V2) or Rekordbox (collection XML). Track info only, no audio.',
    href: '/library', cta: 'Upload Library',
  },
  {
    id: 'plan', n: 2, label: 'Plan a set',
    sub: 'Tell the AI your gig (crowd, slot, length) and it sequences an ordered set from your tracks.',
    href: '/builder', cta: 'Plan a Set',
  },
  {
    id: 'export', n: 3, label: 'Export to your DJ software',
    sub: 'Download the set as a Serato crate, Rekordbox XML or M3U playlist.',
    href: '/history', cta: 'Open Your Sets',
  },
];

const DONE_KEY: Record<OnboardingStepId, keyof OnboardingProgress> = {
  library: 'hasLibrary',
  plan: 'hasSet',
  export: 'hasExport',
};

/**
 * Steps with a status each. "current" is the first step not yet done, so a DJ
 * who planned a demo set before importing still sees Upload as the next step.
 */
export function getOnboardingSteps(progress: OnboardingProgress): OnboardingStep[] {
  let currentAssigned = false;
  return STEP_DEFS.map(def => {
    const done = progress[DONE_KEY[def.id]];
    let status: OnboardingStepStatus;
    if (done) status = 'done';
    else if (!currentAssigned) { status = 'current'; currentAssigned = true; }
    else status = 'upcoming';
    return { ...def, status };
  });
}

export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return progress.hasLibrary && progress.hasSet && progress.hasExport;
}

export function currentOnboardingStep(progress: OnboardingProgress): OnboardingStep | null {
  return getOnboardingSteps(progress).find(s => s.status === 'current') ?? null;
}

/**
 * Plan Set is the main entry point (landing CTAs sign up with redirect=/builder).
 * Without a library it only has demo tracks, so send the DJ to import first unless
 * they explicitly chose the demo (?demo=1).
 */
export function shouldRouteToImport(hasLibrary: boolean, demoParam: string | string[] | undefined): boolean {
  if (hasLibrary) return false;
  const demo = Array.isArray(demoParam) ? demoParam[0] : demoParam;
  return demo !== '1';
}

/**
 * Where a brand-new account lands after signup. The app's hub pages (dashboard,
 * Plan Set) need a library to be useful, so a fresh account starts on import.
 * Explicit tool destinations (e.g. /convert) are kept.
 */
const IMPORT_FIRST_DESTINATIONS = new Set(['/dashboard', '/builder']);
export function newAccountDestination(base: string): string {
  const path = base.split('?')[0];
  return IMPORT_FIRST_DESTINATIONS.has(path) ? '/library' : base;
}
