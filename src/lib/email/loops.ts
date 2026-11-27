const LOOPS_API = 'https://app.loops.so/api/v1';

function headers() {
  return {
    Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

export async function loopsCreateContact(email: string) {
  if (!process.env.LOOPS_API_KEY) return;
  await fetch(`${LOOPS_API}/contacts/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, source: 'setlab-signup' }),
  }).catch(() => {});
}

export async function loopsSendEvent(
  email: string,
  eventName: string,
  data?: Record<string, string | number>,
) {
  if (!process.env.LOOPS_API_KEY) return;
  await fetch(`${LOOPS_API}/events/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, eventName, ...data }),
  }).catch(() => {});
}

// Upsert contact properties in Loops (subscriptionTier, libraryImported,
// setlistsGenerated, signedUpAt, …). These feed segmentation for lifecycle /
// conversion campaigns — they do NOT send anything themselves. Always call
// fire-and-forget (no await) so it can never block the user response.
export async function updateLoopsContact(
  email: string,
  properties: Record<string, string | number | boolean>,
): Promise<void> {
  if (!process.env.LOOPS_API_KEY) return;
  try {
    await fetch(`${LOOPS_API}/contacts/update`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ email, ...properties }),
    });
  } catch {
    console.error('[Loops] contact update failed silently');
  }
}

export type LoopsContactStatus = 'subscribed' | 'unsubscribed' | 'no_contact' | 'error';

/**
 * Whether Loops will deliver campaign/workflow email to this address. `subscribed`
 * is false once the person has unsubscribed. 'error' means we could not tell, and
 * callers must treat that as "do not send".
 */
export async function loopsContactStatus(email: string): Promise<LoopsContactStatus> {
  // Failures are logged with a reason only (never the email or key) so a run where every
  // lookup fails can be diagnosed from the runtime logs.
  if (!process.env.LOOPS_API_KEY) {
    console.error('[Loops] contact lookup failed: LOOPS_API_KEY is not set');
    return 'error';
  }
  try {
    // Loops allows about 10 requests a second. On a 429, wait and retry a few times
    // before giving up (which still fails closed).
    let res = await fetch(`${LOOPS_API}/contacts/find?email=${encodeURIComponent(email)}`, {
      headers: headers(),
    });
    for (let attempt = 0; res.status === 429 && attempt < 4; attempt++) {
      const retryAfter = Number(res.headers?.get?.('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 500 * (attempt + 1);
      await new Promise(r => setTimeout(r, waitMs));
      res = await fetch(`${LOOPS_API}/contacts/find?email=${encodeURIComponent(email)}`, {
        headers: headers(),
      });
    }
    if (!res.ok) {
      console.error(`[Loops] contact lookup failed: HTTP ${res.status}`);
      return 'error';
    }
    const body = (await res.json()) as { subscribed?: boolean }[];
    if (!Array.isArray(body) || body.length === 0) return 'no_contact';
    return body[0].subscribed === false ? 'unsubscribed' : 'subscribed';
  } catch (e) {
    console.error('[Loops] contact lookup failed:', e instanceof Error ? e.message : 'unknown error');
    return 'error';
  }
}

/**
 * Send an event and report whether Loops accepted it. Unlike loopsSendEvent this does
 * not swallow failures, so callers can undo bookkeeping when nothing was sent.
 * `eventProperties` are usable inside the email; `contactProperties` are top-level fields that
 * update the contact (workflow branches can only filter on these). Both must exist in Loops first. The idempotency key makes a retried request within 24h a no-op (409).
 */
export async function loopsSendEventStrict(
  email: string,
  eventName: string,
  opts: {
    eventProperties?: Record<string, string | number | boolean>;
    /** Set on the contact before the workflow runs, so workflow branches/filters can read them. */
    contactProperties?: Record<string, string | number | boolean>;
    idempotencyKey?: string;
  } = {},
): Promise<boolean> {
  if (!process.env.LOOPS_API_KEY) return false;
  try {
    const res = await fetch(`${LOOPS_API}/events/send`, {
      method: 'POST',
      headers: {
        ...headers(),
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: JSON.stringify({ email, eventName, eventProperties: opts.eventProperties, ...opts.contactProperties }),
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}
