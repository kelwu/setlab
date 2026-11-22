import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Library } from '@/components/setdrop/Library';
import { getOnboardingProgress } from '@/lib/setdrop/onboarding-server';

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const [progress, params] = await Promise.all([getOnboardingProgress(supabase, user.id), searchParams]);
  return <Library onboarding={progress} fromPlan={params.from === 'plan'} newUser={params.new_user === '1'} />;
}
