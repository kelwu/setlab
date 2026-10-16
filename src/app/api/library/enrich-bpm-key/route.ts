import { NextResponse } from 'next/server';
import { getAnthropic } from '@/lib/anthropic';
import { jsonrepair } from 'jsonrepair';
import { createClient } from '@/lib/supabase/server';
import { recordCost, usageFrom, type CallUsage } from '@/lib/api-usage';
import { GENRES } from '@/lib/setdrop/constants';

export const maxDuration = 300;

const MODEL = 'claude-sonnet-5';

// Snap Claude's genre answer to the canonical GENRE_GROUPS casing so it maps cleanly
// through superFamily()/passesGenreGate(); keep a sensible out-of-vocab answer as-is.
const GENRE_CANON = new Map(GENRES.map(g => [g.toLowerCase(), g]));
function canonicalGenre(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return GENRE_CANON.get(t.toLowerCase()) ?? t;
}

type MetaResult = { id: string; bpm: number | null; key: string | null; genre: string | null };

async function lookupMeta(
  tracks: Array<{ id: string; artist: string; title: string }>,
  onUsage?: (u: CallUsage) => void,
): Promise<MetaResult[]> {
  const anthropic = getAnthropic();

  const list = tracks.map((t, i) => `${i + 1}. "${t.title}" by ${t.artist}`).join('\n');

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    messages: [{
      role: 'user',
      content: `For each track, provide:
- "bpm": beats per minute as a number
- "key": musical key in Camelot Wheel notation (e.g. "8A", "11B")
- "genre": the single best-fitting genre, chosen from the list below

Pick the closest genre from this list:
${GENRES.join(', ')}

Use your knowledge — give your best estimate even if uncertain. Do not leave any field null.

Tracks:
${list}

Return ONLY a JSON array with one object per track in order:
[{"bpm": 128, "key": "8A", "genre": "House"}, {"bpm": 95, "key": "2B", "genre": "Hip-Hop"}, ...]`,
    }],
    thinking: { type: 'disabled' as const },
  }, { timeout: 120_000, maxRetries: 0 });
  onUsage?.(usageFrom(MODEL, msg));

  const text = msg.content.find(b => b.type === 'text')?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return tracks.map(t => ({ id: t.id, bpm: null, key: null, genre: null }));

  try {
    const results = JSON.parse(jsonrepair(match[0])) as Array<{ bpm: number; key: string; genre: string }>;
    return tracks.map((t, i) => ({
      id: t.id,
      bpm: typeof results[i]?.bpm === 'number' ? results[i].bpm : null,
      key: typeof results[i]?.key === 'string' ? results[i].key : null,
      genre: canonicalGenre(results[i]?.genre),
    }));
  } catch {
    return tracks.map(t => ({ id: t.id, bpm: null, key: null, genre: null }));
  }
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const BATCH = 10;
  let enriched = 0;
  const usages: CallUsage[] = [];
  const pushUsage = (u: CallUsage) => usages.push(u);

  // Wishlist tracks missing BPM, key, or genre — cap at 50 to bound Anthropic spend
  const { data: wishlistTracks } = await supabase
    .from('wishlist_tracks')
    .select('id, artist, title, bpm, key, genre')
    .eq('user_id', user.id)
    .or('bpm.is.null,key.is.null,genre.is.null')
    .limit(50);

  const wishlistToEnrich = (wishlistTracks ?? []).filter(t => !t.bpm || !t.key || !t.genre);

  for (let i = 0; i < wishlistToEnrich.length; i += BATCH) {
    const batch = wishlistToEnrich.slice(i, i + BATCH);
    const results = await lookupMeta(
      batch.map(t => ({ id: t.id, artist: t.artist ?? '', title: t.title ?? '' })),
      pushUsage,
    );
    await Promise.all(results.map(async (r) => {
      const orig = batch.find(t => t.id === r.id);
      if (!orig) return;
      const update: Record<string, number | string> = {};
      if (r.bpm !== null && !orig.bpm) update.bpm = r.bpm;
      if (r.key !== null && !orig.key) update.key = r.key;
      if (r.genre !== null && !orig.genre) update.genre = r.genre;
      if (Object.keys(update).length) {
        await supabase.from('wishlist_tracks').update(update).eq('id', r.id);
        enriched++;
      }
    }));
  }

  // Library tracks (serato_tracks) missing BPM, key, or genre — mainly Rekordbox imports.
  // Rekordbox collections commonly carry BPM+key but NO genre, so genre.is.null is the
  // condition that actually fires enrichment for an otherwise-complete library.
  const { data: library } = await supabase
    .from('serato_libraries')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (library) {
    const { data: libTracks } = await supabase
      .from('serato_tracks')
      .select('id, artist, title, bpm, key, genre')
      .eq('library_id', library.id)
      .or('bpm.is.null,bpm.eq.0,key.is.null,genre.is.null')
      .limit(50);

    const libToEnrich = (libTracks ?? []).filter(t => !t.bpm || !t.key || !t.genre);

    for (let i = 0; i < libToEnrich.length; i += BATCH) {
      const batch = libToEnrich.slice(i, i + BATCH);
      const results = await lookupMeta(
        batch.map(t => ({ id: t.id, artist: t.artist ?? '', title: t.title ?? '' })),
        pushUsage,
      );
      await Promise.all(results.map(async (r) => {
        const orig = batch.find(t => t.id === r.id);
        if (!orig) return;
        const update: Record<string, number | string> = {};
        if (r.bpm !== null && !orig.bpm) update.bpm = r.bpm;
        if (r.key !== null && !orig.key) update.key = r.key;
        if (r.genre !== null && !orig.genre) update.genre = r.genre;
        if (Object.keys(update).length) {
          await supabase.from('serato_tracks').update(update).eq('id', r.id);
          enriched++;
        }
      }));
    }
  }

  await recordCost(user.id, 'enrich-bpm-key', usages);
  return NextResponse.json({ enriched });
}
