import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyLoopsWebhook, SUPPRESSING_EVENTS } from '@/lib/email/loops-webhook';

// Loops calls this when someone unsubscribes, a send hard-bounces, or a recipient reports
// spam. We record the person in email_suppressions so the re-engagement cron never emails
// them again. (The cron also checks Loops live; this makes the record immediate.)
export async function POST(req: NextRequest) {
  const secret = process.env.LOOPS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[loops-webhook] LOOPS_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  // The signature covers the exact bytes sent, so read the raw body before parsing.
  const rawBody = await req.text();
  const valid = verifyLoopsWebhook({
    rawBody,
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
    secret,
  });
  if (!valid) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

  let payload: { eventName?: string; contactIdentity?: { email?: string | null } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const reason = payload.eventName ? SUPPRESSING_EVENTS[payload.eventName] : undefined;
  const email = payload.contactIdentity?.email?.trim().toLowerCase();
  // Events we don't act on (opens, clicks, test events...) still get a 2xx so Loops doesn't retry.
  if (!reason || !email) return NextResponse.json({ ok: true, ignored: true });

  try {
    const admin = createAdminClient();
    // Escape LIKE wildcards so an address containing _ or % can't match someone else.
    const pattern = email.replace(/[\\%_]/g, c => `\\${c}`);
    const { data: user, error: findErr } = await admin
      .from('users')
      .select('id, email')
      .ilike('email', pattern)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);
    // Not a SetLab user (e.g. a newsletter-only contact): nothing to record.
    if (!user) return NextResponse.json({ ok: true, user: false });

    const { error } = await admin
      .from('email_suppressions')
      .upsert({ user_id: user.id, email: user.email, reason });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, suppressed: true });
  } catch (e) {
    // Non-2xx makes Loops retry (up to 8 times over ~28h), which is what we want here.
    console.error('[loops-webhook] failed', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
