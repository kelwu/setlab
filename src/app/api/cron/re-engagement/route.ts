import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { loopsSendEventStrict, loopsContactStatus } from '@/lib/email/loops';
import { decide, STAGE_EVENT, MAX_SENDS, type Candidate } from '@/lib/email/re-engagement';

export const maxDuration = 60;

// Safety valve per run so a bug or a huge backlog can never blast everyone at once.
const MAX_PER_RUN = 50;

type Admin = ReturnType<typeof createAdminClient>;

/** Page through a table so PostgREST's 1000-row cap can't silently truncate us. */
async function fetchAll<T>(
  admin: Admin,
  table: string,
  columns: string,
  filter?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from(table).select(columns);
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function listAllAuthUsers(admin: Admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

// GET /api/cron/re-engagement            -> sends (max MAX_PER_RUN)
// GET /api/cron/re-engagement?dryRun=1   -> returns who would get what, sends nothing
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Sending is off until RE_ENGAGEMENT_SEND_ENABLED=1 is set in Vercel, which we only do once
  // the stage emails exist and are approved in Loops. Until then the cron only reports.
  const sendEnabled = process.env.RE_ENGAGEMENT_SEND_ENABLED === '1';
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1' || !sendEnabled;

  try {
    const admin = createAdminClient();
    // last_sign_in_at lives on auth.users, not public.users.
    const authUsers = (await listAllAuthUsers(admin)).filter(u => u.email && u.last_sign_in_at);

    const [libs, sets, exps, log, supp] = await Promise.all([
      fetchAll<{ user_id: string }>(admin, 'serato_libraries', 'user_id', q => q.gt('total_tracks', 0)),
      fetchAll<{ user_id: string }>(admin, 'setlists', 'user_id'),
      fetchAll<{ user_id: string }>(admin, 'exports', 'user_id'),
      // Only rows with a stage count toward the cap. Older rows came from the previous cron,
      // whose generic event had no workflow listening in Loops, so no email actually went out.
      fetchAll<{ user_id: string; sent_at: string }>(
        admin, 're_engagement_log', 'user_id, sent_at', q => q.not('stage', 'is', null),
      ),
      fetchAll<{ user_id: string }>(admin, 'email_suppressions', 'user_id'),
    ]);
    const suppressed = new Set(supp.map(r => r.user_id));
    const withLib = new Set(libs.map(r => r.user_id));
    const setCount = new Map<string, number>();
    for (const r of sets) setCount.set(r.user_id, (setCount.get(r.user_id) ?? 0) + 1);
    const withExport = new Set(exps.map(r => r.user_id));
    const sends = new Map<string, string[]>();
    for (const r of log) sends.set(r.user_id, [...(sends.get(r.user_id) ?? []), r.sent_at]);

    const decisions = authUsers.map(u => {
      const c: Candidate = {
        userId: u.id,
        email: u.email!,
        lastSignInAt: u.last_sign_in_at!,
        activity: {
          hasLibrary: withLib.has(u.id),
          setCount: setCount.get(u.id) ?? 0,
          exportCount: withExport.has(u.id) ? 1 : 0,
        },
        priorSends: sends.get(u.id) ?? [],
        suppressed: suppressed.has(u.id),
      };
      return decide(c);
    });

    let eligible = decisions.filter(d => !d.skip && d.stage);

    // Ask Loops about each person we are about to email. Anyone who has unsubscribed is
    // recorded and dropped. If Loops can't tell us, we don't send (fail closed).
    let newlyUnsubscribed = 0;
    let statusErrors = 0;
    let notInLoops = 0;
    const checked: typeof eligible = [];
    for (const d of eligible) {
      const status = await loopsContactStatus(d.email);
      if (status === 'unsubscribed') {
        newlyUnsubscribed++;
        if (!dryRun) {
          await admin
            .from('email_suppressions')
            .upsert({ user_id: d.userId, email: d.email, reason: 'unsubscribed' });
        }
      } else if (status === 'error') {
        statusErrors++;
      } else if (status === 'no_contact') {
        // Loops rejects events for contacts it doesn't have, so there is nothing to send.
        notInLoops++;
      } else {
        checked.push(d);
      }
    }
    eligible = checked;
    const summary = {
      cap: MAX_SENDS,
      dormantEligible: eligible.length,
      byStage: Object.fromEntries(
        Object.keys(STAGE_EVENT).map(s => [s, eligible.filter(d => d.stage === s).length]),
      ),
      skipped: {
        capped: decisions.filter(d => d.skip === 'capped').length,
        tooSoon: decisions.filter(d => d.skip === 'too_soon').length,
        alreadyUnsubscribed: decisions.filter(d => d.skip === 'unsubscribed').length,
        unsubscribedInLoops: newlyUnsubscribed,
        loopsLookupFailed: statusErrors,
        notInLoops,
      },
    };

    if (dryRun) return NextResponse.json({ dryRun: true, sendEnabled, ...summary });

    let sent = 0;
    for (const d of eligible.slice(0, MAX_PER_RUN)) {
      // Log first. If the log write fails we skip the send, so a broken log can
      // never turn into the same person being emailed every day.
      const { data: logRow, error } = await admin
        .from('re_engagement_log')
        .insert({ user_id: d.userId, sent_at: new Date().toISOString(), stage: d.stage })
        .select('id')
        .single();
      if (error || !logRow) {
        console.error('[re-engagement] log insert failed, skipping send', error?.message);
        continue;
      }
      const ok = await loopsSendEventStrict(d.email, STAGE_EVENT[d.stage], {
        eventProperties: { sendNumber: d.sendNumber },
        // Workflow branches can only filter on contact properties, so mirror it there.
        contactProperties: { reEngagementSendNumber: d.sendNumber },
        idempotencyKey: `reengage-${d.userId}-${d.sendNumber}`,
      });
      if (!ok) {
        // Nothing went out, so give the send back instead of burning one of the two.
        await admin.from('re_engagement_log').delete().eq('id', logRow.id);
        console.error('[re-engagement] Loops rejected the event', d.stage);
        continue;
      }
      sent++;
    }
    return NextResponse.json({ sent, ...summary });
  } catch (e) {
    console.error('[re-engagement] failed', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
