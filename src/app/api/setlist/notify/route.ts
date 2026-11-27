import { NextRequest, NextResponse, after } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { BRAND } from '@/lib/brand';
import { loopsSendEvent, updateLoopsContact } from '@/lib/email/loops';

// Free tier's monthly set quota — single source of truth for the warning below.
const FREE_MONTHLY_SET_LIMIT = 3;

export async function POST(req: NextRequest) {
  const { setlistId } = await req.json() as { setlistId?: string };
  if (!setlistId) return NextResponse.json({ error: 'setlistId required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: set } = await supabase
    .from('setlists')
    .select('id, name, primary_genre, secondary_genre, crowd_context, duration_minutes, lineup_slot')
    .eq('id', setlistId)
    .eq('user_id', user.id)
    .single();

  if (!set) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Milestone + quota emails (non-blocking)
  const [{ count: allTimeCount }, { count: monthCount }, { data: userRow }] = await Promise.all([
    supabase.from('setlists').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('setlists').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 3_600_000).toISOString()),
    supabase.from('users').select('subscription_tier').eq('id', user.id).single(),
  ]);

  const tier = userRow?.subscription_tier ?? 'free';

  // Fire-and-forget: keep the contact's running total in Loops (conversion segmentation).
  const loopsEmail = user.email;
  after(() => updateLoopsContact(loopsEmail, { setlistsGenerated: allTimeCount ?? 1 }));

  if ((allTimeCount ?? 0) === 1) {
    after(() => loopsSendEvent(loopsEmail, 'first_setlist', { setName: set.name }));
  } else if (tier === 'free' && (monthCount ?? 0) === FREE_MONTHLY_SET_LIMIT - 1) {
    // Warn one set before the monthly cap — the "1 left, go unlimited" nudge.
    after(() => loopsSendEvent(loopsEmail, 'setlist_quota_warning', {
      used: monthCount ?? FREE_MONTHLY_SET_LIMIT - 1,
      limit: FREE_MONTHLY_SET_LIMIT,
    }));
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true }); // silently skip if Resend not configured

  const genre = [set.primary_genre, set.secondary_genre].filter(Boolean).join(' / ') || 'Mixed';
  const crowd = set.crowd_context
    ? set.crowd_context.charAt(0).toUpperCase() + set.crowd_context.slice(1).replace('-', ' ')
    : '';
  const dur = set.duration_minutes ? `${set.duration_minutes} min` : '';
  const slot = set.lineup_slot
    ? set.lineup_slot.charAt(0).toUpperCase() + set.lineup_slot.slice(1)
    : '';
  const meta = [genre, crowd, dur, slot].filter(Boolean).join(' · ');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://setlab.ai';

  const resend = new Resend(apiKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

  await resend.emails.send({
    from: `${BRAND.name} <${fromEmail}>`,
    to: user.email,
    subject: `Your set "${set.name}" is ready`,
    html: `
      <div style="background:#0A0A0A;padding:48px 0;font-family:monospace">
        <div style="max-width:540px;margin:0 auto;padding:0 24px">

          <div style="font-size:22px;letter-spacing:3px;color:#F0F0F0;margin-bottom:8px">
            ${BRAND.logoLeft}<span style="color:#F5A623">${BRAND.logoRight}</span>
          </div>

          <div style="height:1px;background:rgba(255,255,255,0.07);margin:24px 0"></div>

          <h1 style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8A8A8A;font-weight:400;margin:0 0 8px">
            Your set is ready
          </h1>
          <div style="font-size:32px;letter-spacing:3px;color:#F0F0F0;font-weight:400;margin:0 0 12px;line-height:1.1">
            ${set.name.toUpperCase()}
          </div>
          <div style="font-size:12px;color:#6A6A6A;margin-bottom:36px">
            ${meta}
          </div>

          <a href="${appUrl}/history"
            style="display:inline-block;background:#F5A623;color:#0A0A0A;font-size:13px;
                   letter-spacing:2px;text-transform:uppercase;font-weight:600;
                   padding:14px 36px;border-radius:3px;text-decoration:none">
            View Your Set →
          </a>

          <div style="height:1px;background:rgba(255,255,255,0.07);margin:48px 0 24px"></div>

          <div style="font-size:11px;color:#4A4A4A;line-height:1.6">
            You can find all your sets in <a href="${appUrl}/history" style="color:#6A6A6A">History</a>
            anytime. To share a set, open it and toggle it public.
          </div>

        </div>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
