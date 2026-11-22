import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SetlistBuilder } from '@/components/setdrop/SetlistBuilder';
import { getOnboardingProgress } from '@/lib/setdrop/onboarding-server';
import { shouldRouteToImport } from '@/lib/setdrop/onboarding';

export default async function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const [progress, params] = await Promise.all([getOnboardingProgress(supabase, user.id), searchParams]);
  // Upload-first: without a library, Plan Set only has demo tracks. Send the DJ to
  // import, where "Try a demo set first" links back here with ?demo=1.
  if (shouldRouteToImport(progress.hasLibrary, params.demo)) redirect('/library?from=plan');
  return <SetlistBuilder onboarding={progress} />;
}
