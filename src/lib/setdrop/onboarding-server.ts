import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { OnboardingProgress } from './onboarding';

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Reads the three getting-started milestones for the signed-in user (RLS-scoped). */
export async function getOnboardingProgress(supabase: ServerSupabase, userId: string): Promise<OnboardingProgress> {
  const [libraryRes, wishlistRes, setsRes, exportsRes] = await Promise.all([
    supabase.from('serato_libraries').select('total_tracks').eq('user_id', userId).maybeSingle(),
    supabase.from('wishlist_tracks').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'wishlist'),
    supabase.from('setlists').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('exports').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return {
    hasLibrary: (libraryRes.data?.total_tracks ?? 0) > 0 || (wishlistRes.count ?? 0) > 0,
    hasSet: (setsRes.count ?? 0) > 0,
    hasExport: (exportsRes.count ?? 0) > 0,
  };
}
