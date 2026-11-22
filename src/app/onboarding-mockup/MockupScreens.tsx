'use client';
// TEMPORARY mockup route for screenshot review only. Not for merge.
import { useEffect, useState } from 'react';
import { Library } from '@/components/setdrop/Library';
import { SetlistBuilder } from '@/components/setdrop/SetlistBuilder';
import { Dashboard } from '@/components/setdrop/Dashboard';

const none = { hasLibrary: false, hasSet: false, hasExport: false };

export function MockupScreens({ screen }: { screen: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      localStorage.removeItem('sd_library');
      localStorage.removeItem('sd_onboarding_done');
      if (screen === 'library-rekordbox') localStorage.setItem('sd_import_software', 'rekordbox');
      else localStorage.removeItem('sd_import_software');
    } catch { /* ignore */ }
    setReady(true);
  }, [screen]);
  if (!ready) return null;
  if (screen === 'builder') return <SetlistBuilder onboarding={none} />;
  if (screen === 'dashboard') return <Dashboard onboarding={none} />;
  if (screen === 'success') return <Library onboarding={none} mockImported={1240} />;
  return <Library onboarding={none} fromPlan={screen === 'library-from-plan'} />;
}
