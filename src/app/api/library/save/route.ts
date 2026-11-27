import { NextRequest, NextResponse, after } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { saveTracksToDatabase } from '@/lib/setdrop/library-save';
import { updateLoopsContact } from '@/lib/email/loops';
import type { RekordboxPlaylist } from '@/lib/setdrop/rekordbox-parser';
import type { LibraryTrack } from '@/lib/agents/types';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json() as
      | { tracks: LibraryTrack[]; playlists?: RekordboxPlaylist[]; source?: 'serato' | 'rekordbox' }
      | { storagePath: string; source?: 'serato' | 'rekordbox' };

    const source = body.source ?? 'serato';
    let tracks: LibraryTrack[];
    let playlists: RekordboxPlaylist[] | undefined;

    if ('storagePath' in body && body.storagePath) {
      if (!body.storagePath.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const admin = createAdminClient();
      const { data: blob, error: dlError } = await admin.storage
        .from('library-uploads')
        .download(body.storagePath);
      if (dlError || !blob) {
        return NextResponse.json({ error: dlError?.message ?? 'Failed to download tracks' }, { status: 500 });
      }
      // Blob is either a bare LibraryTrack[] (legacy) or { tracks, playlists }.
      const parsed = JSON.parse(await blob.text()) as
        | LibraryTrack[]
        | { tracks: LibraryTrack[]; playlists?: RekordboxPlaylist[] };
      if (Array.isArray(parsed)) {
        tracks = parsed;
      } else {
        tracks = parsed.tracks;
        playlists = parsed.playlists;
      }
      admin.storage.from('library-uploads').remove([body.storagePath]).catch(() => {});
    } else if ('tracks' in body) {
      tracks = body.tracks;
      playlists = body.playlists;
    } else {
      return NextResponse.json({ error: 'No tracks or storagePath provided' }, { status: 400 });
    }

    if (!tracks?.length) return NextResponse.json({ error: 'No tracks provided' }, { status: 400 });

    const stats = await saveTracksToDatabase(user.id, tracks, source, playlists);

    // Fire-and-forget: mark the contact as having imported a library (Loops segmentation).
    const loopsEmail = user.email;
    if (loopsEmail) after(() => updateLoopsContact(loopsEmail, { libraryImported: true }));

    return NextResponse.json({
      ok: true,
      libraryId: stats.libraryId,
      trackCount: stats.trackCount,
      added: stats.added,
      removed: stats.removed,
      unchanged: stats.unchanged,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[save-library] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
