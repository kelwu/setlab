import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordUsage } from '@/lib/api-usage';
import { PLANS } from '@/lib/stripe';

export const maxDuration = 15;

// Gates a setlist/crate export against the monthly export limit and records it.
// The limit counts DISTINCT sets/crates exported per calendar month — re-exporting
// the same item, or grabbing it in another format, does not consume another export.
// This is a soft gate: the export builders run client-side, so this deters normal
// users and drives upgrades rather than being tamper-proof.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { banned, isBeta } = await recordUsage(user.id, 'exports-log');
    if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });

    const body = await req.json() as {
      sourceType?: 'setlist' | 'crate';
      sourceId?: string;
      format?: string;
    };
    const sourceType = body.sourceType;
    const sourceId = (body.sourceId ?? '').trim();
    const format = (body.format ?? 'unknown').trim().slice(0, 32);
    if ((sourceType !== 'setlist' && sourceType !== 'crate') || !sourceId) {
      return NextResponse.json({ error: 'sourceType and sourceId are required' }, { status: 400 });
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();
    const tier = (userRow?.subscription_tier ?? 'free') as 'free' | 'pro';
    const limit = PLANS[tier].exportLimit; // number | null (null = unlimited)

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const admin = createAdminClient();
    const { data: rows } = await admin
      .from('exports')
      .select('source_type, source_id')
      .eq('user_id', user.id)
      .gte('created_at', monthStart);

    const distinct = new Set((rows ?? []).map(r => `${r.source_type}:${r.source_id}`));
    const alreadyCounted = distinct.has(`${sourceType}:${sourceId}`);
    const used = distinct.size;

    // Block only a brand-new item that would exceed the limit.
    if (limit != null && !isBeta && !alreadyCounted && used >= limit) {
      return NextResponse.json(
        { error: 'export_limit', tier, limit, used, resetsAt },
        { status: 429 },
      );
    }

    await admin.from('exports').insert({
      user_id: user.id,
      source_type: sourceType,
      source_id: sourceId,
      format,
    });

    return NextResponse.json({
      allowed: true,
      tier,
      // Beta testers bypass the limit, so report them as unlimited too.
      limit: isBeta ? null : limit,
      used: alreadyCounted ? used : used + 1,
      // False for a re-export of an item already counted this month (free).
      counted: !alreadyCounted,
      resetsAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[exports/log]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
