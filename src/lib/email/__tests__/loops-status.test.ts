import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loopsContactStatus } from '../loops';

const reply = (ok: boolean, body: unknown) =>
  vi.fn().mockResolvedValue({ ok, json: async () => body });

beforeEach(() => { process.env.LOOPS_API_KEY = 'test'; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.LOOPS_API_KEY; });

describe('loopsContactStatus', () => {
  it('reports an unsubscribed contact', async () => {
    vi.stubGlobal('fetch', reply(true, [{ email: 'a@b.co', subscribed: false }]));
    expect(await loopsContactStatus('a@b.co')).toBe('unsubscribed');
  });
  it('reports a subscribed contact', async () => {
    vi.stubGlobal('fetch', reply(true, [{ email: 'a@b.co', subscribed: true }]));
    expect(await loopsContactStatus('a@b.co')).toBe('subscribed');
  });
  it('reports no contact for an empty result', async () => {
    vi.stubGlobal('fetch', reply(true, []));
    expect(await loopsContactStatus('a@b.co')).toBe('no_contact');
  });
  it('fails closed on API errors, network errors and a missing key', async () => {
    vi.stubGlobal('fetch', reply(false, {}));
    expect(await loopsContactStatus('a@b.co')).toBe('error');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await loopsContactStatus('a@b.co')).toBe('error');
    delete process.env.LOOPS_API_KEY;
    expect(await loopsContactStatus('a@b.co')).toBe('error');
  });
});
