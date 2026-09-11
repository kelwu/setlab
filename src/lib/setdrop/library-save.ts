import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { LibraryTrack } from '@/lib/agents/types';
import { trackKey, type RekordboxPlaylist } from './rekordbox-parser';

const BATCH = 500;

export interface SaveStats {
  libraryId: string;
  trackCount: number;
  added: number;
  removed: number;
  unchanged: number;
}

export async function saveTracksToDatabase(
  userId: string,
  tracks: LibraryTrack[],
  source: 'serato' | 'rekordbox',
  playlists?: RekordboxPlaylist[],
): Promise<SaveStats> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const seen = new Set<string>();
  const deduped = tracks.filter(t => {
    const key = trackKey(t.artist ?? '', t.title ?? '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const { data: existing } = await admin
    .from('serato_libraries')
    .select('id')
    .eq('user_id', userId)
    .single();

  let libraryId: string;

  if (existing) {
    await admin.from('serato_libraries')
      .update({ total_tracks: deduped.length, last_synced: now, source })
      .eq('id', existing.id);
    libraryId = existing.id;
  } else {
    const { data, error } = await admin.from('serato_libraries')
      .insert({ user_id: userId, total_tracks: deduped.length, last_synced: now, is_public: false, source })
      .select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'Failed to create library record');
    libraryId = data.id;
  }

  // Incremental re-sync (keyed on the canonical artist|title). Earlier this was a
  // destructive delete-all + reinsert, which churned every track UUID (breaking
  // Rekordbox crates), reset play_count, and forced full re-enrichment on every
  // import. We diff instead: brand-new tracks are inserted, tracks that vanished
  // from the source are SOFT-removed (in_library=false, so history/crates survive),
  // and matched tracks keep their UUID, play_count, and enrichment untouched. This
  // makes repeated syncing safe and is the groundwork for any automatic sync.

  // Fetch ALL existing rows, paginated past Supabase's 1000-row page cap (the cap
  // is exactly why the old code avoided diffing — handle it explicitly here).
  const existingByKey = new Map<string, { id: string; inLibrary: boolean }>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('serato_tracks')
      .select('id, artist, title, in_library')
      .eq('library_id', libraryId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      existingByKey.set(trackKey(r.artist ?? '', r.title ?? ''), { id: r.id, inLibrary: r.in_library });
    }
    if (!data || data.length < PAGE) break;
  }

  // Maps each track's canonical key → its stable serato_tracks UUID (existing rows
  // keep theirs; new rows get one on insert) so Rekordbox playlist membership
  // resolves to real row ids — and now survives re-syncs.
  const keyToId = new Map<string, string>();
  const toInsert: LibraryTrack[] = [];
  const reactivateIds: string[] = [];   // previously soft-removed, present again → restore
  let unchanged = 0;

  for (const t of deduped) {
    const key = trackKey(t.artist ?? '', t.title ?? '');
    const ex = existingByKey.get(key);
    if (ex) {
      keyToId.set(key, ex.id);
      if (ex.inLibrary) unchanged++;
      else reactivateIds.push(ex.id);
    } else {
      toInsert.push(t);
    }
  }

  // Active rows whose key is no longer in the source → soft-remove.
  const incomingKeys = new Set(deduped.map(t => trackKey(t.artist ?? '', t.title ?? '')));
  const removeIds: string[] = [];
  for (const [key, ex] of existingByKey) {
    if (ex.inLibrary && !incomingKeys.has(key)) removeIds.push(ex.id);
  }

  const rowFor = (t: LibraryTrack) => ({
    library_id: libraryId,
    artist: t.artist || null, title: t.title || null,
    bpm: t.bpm || null, key: t.key || null, genre: t.genre || null,
    year: t.year || null, file_path: t.filePath || null,
    play_count: 0, in_library: true,
  });

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const { data, error } = await admin
      .from('serato_tracks')
      .insert(toInsert.slice(i, i + BATCH).map(rowFor))
      .select('id, artist, title');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) keyToId.set(trackKey(r.artist ?? '', r.title ?? ''), r.id);
  }

  // Flip in_library for returned / departed tracks, chunked to keep .in() lists
  // (and the request URL) well under Supabase limits.
  const ID_CHUNK = 300;
  const setInLibrary = async (ids: string[], value: boolean) => {
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { error } = await admin
        .from('serato_tracks')
        .update({ in_library: value })
        .in('id', ids.slice(i, i + ID_CHUNK));
      if (error) throw new Error(error.message);
    }
  };
  await setInLibrary(reactivateIds, true);
  await setInLibrary(removeIds, false);

  // Persist Rekordbox playlists as crates keyed on real (now stable) track UUIDs.
  // Only touch crates when playlists are supplied, so a Serato re-sync never wipes
  // them; rebuilding from the fresh playlist data also prunes any removed tracks.
  if (playlists?.length) {
    await admin.from('serato_crates').delete().eq('library_id', libraryId);
    const crateRows = playlists
      .map(p => {
        const ids = p.trackKeys.map(k => keyToId.get(k)).filter((id): id is string => !!id);
        return { library_id: libraryId, crate_name: p.name, track_count: ids.length, track_ids: ids };
      })
      .filter(c => c.track_ids.length > 0);
    for (let i = 0; i < crateRows.length; i += BATCH) {
      const { error } = await admin.from('serato_crates').insert(crateRows.slice(i, i + BATCH));
      if (error) throw new Error(error.message);
    }
  }

  return {
    libraryId,
    trackCount: deduped.length,
    added: toInsert.length + reactivateIds.length,
    removed: removeIds.length,
    unchanged,
  };
}
