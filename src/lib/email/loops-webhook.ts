import crypto from 'crypto';

const TOLERANCE_SECONDS = 300;

/**
 * Verify a Loops webhook (Standard Webhooks style). Signed content is
 * `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256 with the secret's
 * base64-decoded key (after stripping "whsec_"), base64-encoded. The signature header is a
 * space-separated list of "v1,<base64>" entries; any matching v1 entry is valid (during a
 * secret roll Loops sends both).
 */
export function verifyLoopsWebhook(opts: {
  rawBody: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const { rawBody, id, timestamp, signature, secret } = opts;
  if (!id || !timestamp || !signature || !secret) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  return signature.split(' ').some(entry => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const buf = Buffer.from(value);
    return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
  });
}

/** Webhook events that mean "stop emailing this person", and the reason we record. */
export const SUPPRESSING_EVENTS: Record<string, string> = {
  'contact.unsubscribed': 'unsubscribed',
  'email.unsubscribed': 'unsubscribed',
  'email.hardBounced': 'hard_bounce',
  'email.spamReported': 'spam_report',
};
