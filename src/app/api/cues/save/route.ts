import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sanitizeTrackCues } from '@/lib/cues/validate';
import { trackKey } from '@/lib/setdrop/rekordbox-parser';

// POST /api/cues/save — upsert a batch of scanned cue records for the caller's
// library. Only cue metadata arrives here; audio never leaves the browser.
// Writes go through the user's own client so RLS's WITH CHECK enforces that
// every row lands in a library they own.

const MAX_BATCH = 1000;

interface IncomingTrack {
  filePath?: unknown;
  artist?: unknown;
  title?: unknown;
  fingerprint?: unknown;
  sizeBytes?: unknown;
  durationMs?: unknown;
  cues?: unknown;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { tracks?: IncomingTrack[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const tracks = Array.isArray(body.tracks) ? body.tracks : [];
  if (!tracks.length) return NextResponse.json({ error: 'No tracks' }, { status: 400 });
  if (tracks.length > MAX_BATCH) return NextResponse.json({ error: `At most ${MAX_BATCH} tracks per request` }, { status: 413 });

  const { data: lib } = await supabase
    .from('serato_libraries').select('id').eq('user_id', user.id).maybeSingle();
  // Cues hang off the library; without one there's nothing to attach them to.
  if (!lib) return NextResponse.json({ error: 'No library', code: 'no_library' }, { status: 409 });

  const now = new Date().toISOString();
  const rows = new Map<string, Record<string, unknown>>();
  let rejected = 0;
  for (const t of tracks) {
    const filePath = typeof t.filePath === 'string' ? t.filePath.slice(0, 2000) : '';
    const fingerprint = typeof t.fingerprint === 'string' ? t.fingerprint.slice(0, 64) : '';
    const cues = sanitizeTrackCues(t.cues);
    if (!filePath || !fingerprint || !cues) { rejected++; continue; }
    const artist = typeof t.artist === 'string' ? t.artist : '';
    const title = typeof t.title === 'string' ? t.title : '';
    const num = (v: unknown, max: number) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : null;
    rows.set(filePath, {
      library_id: lib.id,
      file_path: filePath,
      track_key: artist || title ? trackKey(artist, title) : null,
      fingerprint,
      cues,
      cue_count: cues.cues.length,
      size_bytes: num(t.sizeBytes, 2 ** 40),
      duration_ms: num(t.durationMs, 2 ** 31 - 1),
      scanned_at: now,
    });
  }

  if (rows.size) {
    const { error } = await supabase
      .from('track_cues')
      .upsert([...rows.values()], { onConflict: 'library_id,file_path' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: rows.size, rejected });
}
