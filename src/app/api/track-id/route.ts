import { NextRequest, NextResponse, after } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordUsage } from '@/lib/api-usage';
import { identifyAudio } from '@/lib/setdrop/acrcloud';
import { loopsSendEvent } from '@/lib/email/loops';

export const maxDuration = 30;

const FREE_LIMIT = 10;
const PRO_LIMIT = 500;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { banned, isBeta } = await recordUsage(user.id, 'track-id');
    if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });

    const admin = createAdminClient();

    // Quota check
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { count } = await admin
      .from('track_id_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', monthStart);

    const { data: userRow } = await admin
      .from('users')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    const tier = userRow?.subscription_tier ?? 'free';
    const limit = tier === 'pro' ? PRO_LIMIT : FREE_LIMIT;
    const used = count ?? 0;

    if (!isBeta && used >= limit) {
      const nextMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();
      return NextResponse.json({ error: 'quota_exhausted', tier, limit, used, resetsAt: nextMonth }, { status: 429 });
    }

    // Parse audio from multipart body
    const form = await req.formData();
    const audio = form.get('audio') as File | null;
    const source = (form.get('source') as string) ?? 'upload';

    if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    if (audio.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Audio file too large (max 10MB)' }, { status: 400 });
    if (audio.size < 1000) return NextResponse.json({ error: 'Recording too short' }, { status: 400 });

    const buffer = Buffer.from(await audio.arrayBuffer());

    // Identify via ACRCloud
    const result = await identifyAudio(buffer);

    // Log the request (always, even on no-match — it counts toward quota)
    const { data: logRow } = await admin
      .from('track_id_requests')
      .insert({
        user_id: user.id,
        source,
        matched: result.matched,
        candidates_json: result.candidates,
        external_provider: 'acrcloud',
      })
      .select('id')
      .single();

    // Check if top match is already in library or wishlist
    let alreadyInLibrary = false;
    let alreadyInWishlist = false;

    if (result.matched && result.candidates[0]) {
      const top = result.candidates[0];
      const titleLower = top.title.toLowerCase();
      const artistLower = top.artist.toLowerCase();

      const { data: lib } = await admin
        .from('serato_libraries')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (lib) {
        const { count: libCount } = await admin
          .from('serato_tracks')
          .select('id', { count: 'exact', head: true })
          .eq('library_id', lib.id)
          .ilike('title', `%${titleLower}%`)
          .ilike('artist', `%${artistLower}%`);
        alreadyInLibrary = (libCount ?? 0) > 0;
      }

      const { count: wishCount } = await admin
        .from('wishlist_tracks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .ilike('title', `%${titleLower}%`)
        .ilike('artist', `%${artistLower}%`);
      alreadyInWishlist = (wishCount ?? 0) > 0;
    }

    // Warn free users at 8/10 used (2 remaining)
    if (!isBeta && tier === 'free' && used + 1 === 8 && user.email) {
      const loopsEmail = user.email;
      after(() => loopsSendEvent(loopsEmail, 'trackid_quota_warning', { used: 8, limit: FREE_LIMIT }));
    }

    return NextResponse.json({
      requestId: logRow?.id ?? null,
      matched: result.matched,
      candidates: result.candidates,
      alreadyInLibrary,
      alreadyInWishlist,
      quotaUsed: used + 1,
      quotaLimit: limit,
      quotaRemaining: limit - used - 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[track-id]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
