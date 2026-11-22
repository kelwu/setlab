import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Dashboard } from '@/components/setdrop/Dashboard';
import { getOnboardingProgress } from '@/lib/setdrop/onboarding-server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const progress = await getOnboardingProgress(supabase, user.id);
  return <Dashboard onboarding={progress} />;
}
