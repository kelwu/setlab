import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { trackKey } from '@/lib/setdrop/rekordbox-parser';
import { matchStoredCues, CueLookupRequest, StoredCueRow } from '@/lib/cues/lookup';
import { userHasCueExport } from '@/lib/cues/entitlement';

// POST /api/cues/lookup — the stored hot cues for the tracks of a set/crate
// export, so they can be written into the Rekordbox XML. Cues travelling with
// SetLab exports are a Pro feature; this route is where that's enforced (the
// XML itself is built client-side). Free users get only a count, which the UI
// uses for the upgrade prompt. RLS scopes every read to the caller's library.

const MAX_TRACKS = 500;
const IN_CHUNK = 100; // keep each PostgREST `in (…)` URL comfortably short
const COLS = 'file_path, track_key, cues, size_bytes, duration_ms';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { tracks?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const raw = Array.isArray(body.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
  const requests: CueLookupRequest[] = raw.map(r => {
    const o = (typeof r === 'object' && r ? r : {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === 'string' ? v.slice(0, 2000) : '');
    const d = typeof o.durationSec === 'number' && Number.isFinite(o.durationSec) ? o.durationSec : undefined;
    return { filePath: s(o.filePath), artist: s(o.artist), title: s(o.title), durationSec: d };
  });
  if (!requests.length) return NextResponse.json({ pro: true, results: [], withCues: 0 });

  const { data: lib } = await supabase
    .from('serato_libraries').select('id').eq('user_id', user.id).maybeSingle();
  if (!lib) return NextResponse.json({ pro: true, results: requests.map(() => null), withCues: 0 });

  const paths = [...new Set(requests.map(r => r.filePath).filter(Boolean))];
  const keys = [...new Set(requests.filter(r => r.artist || r.title).map(r => trackKey(r.artist, r.title)))];

  const rows = new Map<string, StoredCueRow>();
  const fetchIn = async (col: 'file_path' | 'track_key', values: string[]) => {
    for (let i = 0; i < values.length; i += IN_CHUNK) {
      const { data, error } = await supabase
        .from('track_cues').select(COLS)
        .eq('library_id', lib.id).gt('cue_count', 0)
        .in(col, values.slice(i, i + IN_CHUNK));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as StoredCueRow[]) rows.set(r.file_path, r);
    }
  };
  try {
    await Promise.all([fetchIn('file_path', paths), fetchIn('track_key', keys)]);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Lookup failed' }, { status: 500 });
  }

  const results = matchStoredCues(requests, [...rows.values()]);
  const withCues = results.filter(Boolean).length;

  if (!(await userHasCueExport(supabase, user.id))) {
    return NextResponse.json({ pro: false, results: [], withCues });
  }
  return NextResponse.json({ pro: true, results, withCues });
}
