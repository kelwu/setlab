import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyLoopsWebhook, SUPPRESSING_EVENTS } from '../loops-webhook';

const keyBytes = Buffer.from('super-secret-key-material-1234567');
const secret = `whsec_${keyBytes.toString('base64')}`;
const NOW = 1_800_000_000;

function sign(id: string, ts: string, body: string, key = keyBytes) {
  return crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}

const body = '{"eventName":"contact.unsubscribed","contactIdentity":{"email":"a@b.co"}}';

function check(over: Partial<Parameters<typeof verifyLoopsWebhook>[0]> = {}) {
  const id = 'msg_1';
  const timestamp = String(NOW);
  return verifyLoopsWebhook({
    rawBody: body, id, timestamp, secret, nowSeconds: NOW,
    signature: `v1,${sign(id, timestamp, body)}`,
    ...over,
  });
}

describe('verifyLoopsWebhook', () => {
  it('accepts a correctly signed request', () => {
    expect(check()).toBe(true);
  });
  it('accepts when any v1 entry matches (secret roll sends two)', () => {
    const good = sign('msg_1', String(NOW), body);
    expect(check({ signature: `v1,AAAA v1,${good}` })).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(check({ rawBody: body.replace('a@b.co', 'x@y.co') })).toBe(false);
  });
  it('rejects a signature made with the wrong secret', () => {
    const bad = sign('msg_1', String(NOW), body, Buffer.from('another-key'));
    expect(check({ signature: `v1,${bad}` })).toBe(false);
  });
  it('rejects stale and future timestamps', () => {
    const ts = String(NOW - 301);
    expect(check({ timestamp: ts, signature: `v1,${sign('msg_1', ts, body)}` })).toBe(false);
    const fut = String(NOW + 301);
    expect(check({ timestamp: fut, signature: `v1,${sign('msg_1', fut, body)}` })).toBe(false);
  });
  it('rejects missing headers, non-v1 versions and a missing secret', () => {
    expect(check({ id: null })).toBe(false);
    expect(check({ timestamp: null })).toBe(false);
    expect(check({ signature: null })).toBe(false);
    expect(check({ secret: '' })).toBe(false);
    expect(check({ signature: `v2,${sign('msg_1', String(NOW), body)}` })).toBe(false);
  });
  it('rejects a non-numeric timestamp', () => {
    expect(check({ timestamp: 'abc' })).toBe(false);
  });
});

describe('SUPPRESSING_EVENTS', () => {
  it('covers unsubscribes, hard bounces and spam reports only', () => {
    expect(Object.keys(SUPPRESSING_EVENTS).sort()).toEqual(
      ['contact.unsubscribed', 'email.hardBounced', 'email.spamReported', 'email.unsubscribed'],
    );
  });
});
