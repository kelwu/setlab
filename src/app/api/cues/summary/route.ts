import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { userHasCueExport } from '@/lib/cues/entitlement';

// GET /api/cues/summary — cheap status for the "Include hot cues" export
// toggle: how many of the DJ's tracks have stored cues, whether their plan lets
// exports carry them, and the library's source app (the converter only reads
// Serato, so the "convert your cues" hint is shown to Serato libraries only).

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const [{ data: lib }, pro] = await Promise.all([
    supabase.from('serato_libraries').select('id, source').eq('user_id', user.id).maybeSingle(),
    userHasCueExport(supabase, user.id),
  ]);
  if (!lib) return NextResponse.json({ tracksWithCues: 0, pro, source: null });

  const { count } = await supabase
    .from('track_cues')
    .select('id', { count: 'exact', head: true })
    .eq('library_id', lib.id)
    .gt('cue_count', 0);

  return NextResponse.json({ tracksWithCues: count ?? 0, pro, source: lib.source ?? 'serato' });
}
