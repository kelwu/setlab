import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { loopsSendEvent } from '@/lib/email/loops';
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

    const [libs, sets, exps, log] = await Promise.all([
      fetchAll<{ user_id: string }>(admin, 'serato_libraries', 'user_id', q => q.gt('total_tracks', 0)),
      fetchAll<{ user_id: string }>(admin, 'setlists', 'user_id'),
      fetchAll<{ user_id: string }>(admin, 'exports', 'user_id'),
      fetchAll<{ user_id: string; sent_at: string }>(admin, 're_engagement_log', 'user_id, sent_at'),
    ]);
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
      };
      return decide(c);
    });

    const eligible = decisions.filter(d => !d.skip && d.stage);
    const summary = {
      cap: MAX_SENDS,
      dormantEligible: eligible.length,
      byStage: Object.fromEntries(
        Object.keys(STAGE_EVENT).map(s => [s, eligible.filter(d => d.stage === s).length]),
      ),
      skipped: {
        capped: decisions.filter(d => d.skip === 'capped').length,
        tooSoon: decisions.filter(d => d.skip === 'too_soon').length,
      },
    };

    if (dryRun) return NextResponse.json({ dryRun: true, sendEnabled, ...summary });

    let sent = 0;
    for (const d of eligible.slice(0, MAX_PER_RUN)) {
      // Log first. If the log write fails we skip the send, so a broken log can
      // never turn into the same person being emailed every day.
      const { error } = await admin
        .from('re_engagement_log')
        .insert({ user_id: d.userId, sent_at: new Date().toISOString(), stage: d.stage });
      if (error) {
        console.error('[re-engagement] log insert failed, skipping send', error.message);
        continue;
      }
      await loopsSendEvent(d.email, STAGE_EVENT[d.stage]);
      sent++;
    }
    return NextResponse.json({ sent, ...summary });
  } catch (e) {
    console.error('[re-engagement] failed', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
