import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/cues — the signed-in DJ's stored cue fingerprints, so a re-scan can
// skip files whose size+mtime haven't changed since they were last read.
// RLS (users_own_track_cues) scopes every read to the caller's own library.

const PAGE = 1000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: lib } = await supabase
    .from('serato_libraries').select('id').eq('user_id', user.id).maybeSingle();
  if (!lib) return NextResponse.json({ libraryId: null, fingerprints: {}, tracksWithCues: 0 });

  const fingerprints: Record<string, string> = {};
  let tracksWithCues = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('track_cues')
      .select('file_path, fingerprint, cue_count')
      .eq('library_id', lib.id)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const r of data ?? []) {
      fingerprints[r.file_path] = r.fingerprint;
      if (r.cue_count > 0) tracksWithCues++;
    }
    if (!data || data.length < PAGE) break;
  }

  return NextResponse.json({ libraryId: lib.id, fingerprints, tracksWithCues });
}
