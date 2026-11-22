import { describe, expect, it } from 'vitest';
import {
  currentOnboardingStep,
  getOnboardingSteps,
  isOnboardingComplete,
  newAccountDestination,
  shouldRouteToImport,
} from '../onboarding';

const none = { hasLibrary: false, hasSet: false, hasExport: false };

describe('getOnboardingSteps', () => {
  it('starts a brand-new account on upload, in order', () => {
    const steps = getOnboardingSteps(none);
    expect(steps.map(s => s.id)).toEqual(['library', 'plan', 'export']);
    expect(steps.map(s => s.status)).toEqual(['current', 'upcoming', 'upcoming']);
  });

  it('ticks steps off from account state and moves the current step on', () => {
    expect(getOnboardingSteps({ ...none, hasLibrary: true }).map(s => s.status))
      .toEqual(['done', 'current', 'upcoming']);
    expect(getOnboardingSteps({ hasLibrary: true, hasSet: true, hasExport: false }).map(s => s.status))
      .toEqual(['done', 'done', 'current']);
  });

  it('keeps upload as the current step when a demo set was planned first', () => {
    const steps = getOnboardingSteps({ ...none, hasSet: true });
    expect(steps.map(s => s.status)).toEqual(['current', 'done', 'upcoming']);
    expect(currentOnboardingStep({ ...none, hasSet: true })?.id).toBe('library');
  });

  it('names the formats the importer and exporter actually support', () => {
    const [upload, , exp] = getOnboardingSteps(none);
    expect(upload.sub).toMatch(/Serato/);
    expect(upload.sub).toMatch(/Rekordbox/);
    expect(exp.sub).toMatch(/Serato crate/);
    expect(exp.sub).toMatch(/Rekordbox XML/);
    expect(exp.sub).toMatch(/M3U/);
  });
});

describe('isOnboardingComplete', () => {
  it('is complete only when all three are done', () => {
    expect(isOnboardingComplete(none)).toBe(false);
    expect(isOnboardingComplete({ hasLibrary: true, hasSet: true, hasExport: false })).toBe(false);
    expect(isOnboardingComplete({ hasLibrary: true, hasSet: true, hasExport: true })).toBe(true);
    expect(currentOnboardingStep({ hasLibrary: true, hasSet: true, hasExport: true })).toBeNull();
  });
});

describe('shouldRouteToImport', () => {
  it('sends Plan Set to import when there is no library', () => {
    expect(shouldRouteToImport(false, undefined)).toBe(true);
  });
  it('lets the DJ in when they chose the demo', () => {
    expect(shouldRouteToImport(false, '1')).toBe(false);
    expect(shouldRouteToImport(false, ['1'])).toBe(false);
  });
  it('never redirects once a library exists', () => {
    expect(shouldRouteToImport(true, undefined)).toBe(false);
  });
});

describe('newAccountDestination', () => {
  it('starts new accounts on import instead of the hub pages', () => {
    expect(newAccountDestination('/dashboard')).toBe('/library');
    expect(newAccountDestination('/builder')).toBe('/library');
  });
  it('keeps explicit tool destinations', () => {
    expect(newAccountDestination('/convert')).toBe('/convert');
    expect(newAccountDestination('/id')).toBe('/id');
  });
});
