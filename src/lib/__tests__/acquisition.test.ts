import { describe, expect, it } from 'vitest';
import { buildFirstTouch, isHeardAboutValue, parseFirstTouch } from '@/lib/acquisition';

describe('buildFirstTouch', () => {
  const now = new Date('2026-11-21T00:00:00Z');

  it('keeps utm params, external referrer host and landing path', () => {
    const ft = buildFirstTouch(
      new URL('https://setlab.ai/convert?utm_source=reddit&utm_medium=post&x=1'),
      'https://www.reddit.com/r/DJs/comments/abc',
      now,
    );
    expect(ft).toEqual({
      utm_source: 'reddit',
      utm_medium: 'post',
      utm_campaign: undefined,
      referrer: 'www.reddit.com',
      landing_path: '/convert',
      captured_at: '2026-11-21T00:00:00.000Z',
    });
  });

  it('drops same-site and malformed referrers', () => {
    expect(buildFirstTouch(new URL('https://setlab.ai/'), 'https://setlab.ai/login', now).referrer).toBeUndefined();
    expect(buildFirstTouch(new URL('https://setlab.ai/'), 'not a url', now).referrer).toBeUndefined();
  });
});

describe('parseFirstTouch', () => {
  it('round-trips and strips unknown or non-string fields', () => {
    const raw = JSON.stringify({ utm_source: 'chatgpt.com', evil: 'x', referrer: 42 });
    expect(parseFirstTouch(raw)).toEqual({ utm_source: 'chatgpt.com' });
  });

  it('returns null for empty or bad input', () => {
    expect(parseFirstTouch(undefined)).toBeNull();
    expect(parseFirstTouch('{')).toBeNull();
    expect(parseFirstTouch('{}')).toBeNull();
  });
});

describe('isHeardAboutValue', () => {
  it('accepts only listed options', () => {
    expect(isHeardAboutValue('ai_assistant')).toBe(true);
    expect(isHeardAboutValue('skipped')).toBe(false);
    expect(isHeardAboutValue('anything')).toBe(false);
  });
});
