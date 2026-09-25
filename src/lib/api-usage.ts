import { createAdminClient } from '@/lib/supabase/server';

/**
 * Records one AI/usage event and reports whether the user is banned.
 *
 * Call at the top of every cost-incurring (AI) route, right after auth:
 *
 *   const { banned } = await recordUsage(user.id, 'analyze-gaps');
 *   if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });
 *
 * It powers the admin cost dashboard and enforces bans. It manages its own
 * service-role client and NEVER throws — a logging/lookup failure must not
 * break the underlying request.
 *
 * @returns `{ banned, isBeta }` — reject with 403 when banned; skip rate
 *          limits when isBeta.
 */
export async function recordUsage(
  userId: string,
  endpoint: string,
): Promise<{ banned: boolean; isBeta: boolean }> {
  try {
    const admin = createAdminClient();
    const usagePromise = admin.from('api_usage').insert({ user_id: userId, endpoint });
    const { data } = await admin
      .from('users')
      .select('is_banned, is_beta')
      .eq('id', userId)
      .maybeSingle();
    await usagePromise;
    const row = data as { is_banned?: boolean; is_beta?: boolean } | null;
    return { banned: row?.is_banned === true, isBeta: row?.is_beta === true };
  } catch {
    return { banned: false, isBeta: false };
  }
}

/**
 * Counts how many times `endpoint` has been recorded for this user since the
 * start of the current (server-local) day. Used for the soft daily generation
 * cap. Uses the service-role client (api_usage is written server-side) and
 * never throws — a lookup failure returns 0 so it fails open.
 */
export async function usageToday(userId: string, endpoint: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await admin
      .from('api_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .gte('created_at', start.toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}

// ─── Cost tracking ──────────────────────────────────────────────────────────
// Per-token USD prices by model + web-search per-search price. Keep in sync with
// https://platform.claude.com/docs/en/pricing and the web search tool ($10/1k).
const TOKEN_PRICE: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5': { in: 2 / 1_000_000, out: 10 / 1_000_000 },
  'claude-sonnet-4-6': { in: 3 / 1_000_000, out: 15 / 1_000_000 },
  'claude-haiku-4-5': { in: 1 / 1_000_000, out: 5 / 1_000_000 },
  'claude-haiku-4-5-20251001': { in: 1 / 1_000_000, out: 5 / 1_000_000 },
};
const DEFAULT_TOKEN_PRICE = { in: 3 / 1_000_000, out: 15 / 1_000_000 }; // assume Sonnet
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

export interface CallUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
}

// Normalizes an Anthropic message's `usage` into a CallUsage. Counts cached
// tokens at full input rate (a slight overestimate; we don't use caching yet).
export function usageFrom(model: string, msg: unknown): CallUsage {
  const u = (msg as { usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    server_tool_use?: { web_search_requests?: number };
  } })?.usage ?? {};
  return {
    model,
    inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
    webSearches: u.server_tool_use?.web_search_requests ?? 0,
  };
}

// Records the estimated USD cost of one or more AI calls to the usage_costs
// ledger. Aggregates a list into one row per endpoint. Never throws.
export async function recordCost(
  userId: string,
  endpoint: string,
  usage: CallUsage | CallUsage[],
): Promise<void> {
  try {
    const calls = Array.isArray(usage) ? usage : [usage];
    if (!calls.length) return;
    let inputTokens = 0, outputTokens = 0, webSearches = 0, cost = 0;
    for (const c of calls) {
      const p = TOKEN_PRICE[c.model] ?? DEFAULT_TOKEN_PRICE;
      inputTokens += c.inputTokens;
      outputTokens += c.outputTokens;
      webSearches += c.webSearches;
      cost += c.inputTokens * p.in + c.outputTokens * p.out + c.webSearches * WEB_SEARCH_USD;
    }
    const admin = createAdminClient();
    await admin.from('usage_costs').insert({
      user_id: userId,
      endpoint,
      model: calls[0].model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      web_searches: webSearches,
      cost_usd: Number(cost.toFixed(6)),
    });
  } catch {
    /* never throw — cost logging must not break the request */
  }
}

// Records the outcome + duration of one AI generation to the generation_events
// ledger — for success, hard failure, AND user-input rejection. usage_costs only
// logs successes, so this is what lets the health-check watchdog see completion
// rate and latency creep. `'rejected'` marks an expected, user-actionable refusal
// (library too thin for the request) — the watchdog excludes it from the failure
// rate. Never throws — monitoring must not break the request.
export async function recordGenerationEvent(
  userId: string | null,
  endpoint: string,
  status: 'success' | 'error' | 'rejected',
  durationMs: number,
  errorReason?: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('generation_events').insert({
      user_id: userId,
      endpoint,
      status,
      duration_ms: Math.max(0, Math.round(durationMs)),
      error_reason: errorReason ? errorReason.slice(0, 500) : null,
    });
  } catch {
    /* never throw — monitoring must not break the request */
  }
}

// Sums this user's estimated cost since the start of the current (server-local)
// day. Powers the per-user daily spend ceiling. Fails open (returns 0).
export async function costToday(userId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { data } = await admin
      .from('usage_costs')
      .select('cost_usd')
      .eq('user_id', userId)
      .gte('created_at', start.toISOString());
    return (data ?? []).reduce((s, r) => s + Number((r as { cost_usd: number }).cost_usd), 0);
  } catch {
    return 0;
  }
}
