import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SetlistBuilder } from '@/components/setdrop/SetlistBuilder';
import { getOnboardingProgress } from '@/lib/setdrop/onboarding-server';
import { shouldRouteToImport } from '@/lib/setdrop/onboarding';
import { suggestGigGenre } from '@/lib/setdrop/genre';

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

// First set only: start Plan Set on the library's biggest genre so a new DJ isn't
// facing a blank form. Best-effort; any failure just means no suggestion.
async function firstSetGenre(supabase: ServerSupabase, userId: string): Promise<string | null> {
  try {
    const { data: lib } = await supabase.from('serato_libraries').select('id').eq('user_id', userId).maybeSingle();
    if (!lib) return null;
    const { data } = await supabase.rpc('get_top_genres', { p_library_id: lib.id, p_limit: 25 });
    return suggestGigGenre((data ?? []) as { genre: string | null; track_count: number }[]);
  } catch {
    return null;
  }
}

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
  const suggestedGenre = progress.hasLibrary && !progress.hasSet ? await firstSetGenre(supabase, user.id) : null;
  return <SetlistBuilder onboarding={progress} suggestedGenre={suggestedGenre} />;
}
