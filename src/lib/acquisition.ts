// "How did you hear about SetLab?" — the answer options and the first-touch
// attribution cookie. Shared by the client prompt, the API route, and the
// middleware that captures first touch.

export const HEARD_ABOUT_OPTIONS = [
  { value: 'ai_assistant', label: 'ChatGPT or another AI' },
  { value: 'google', label: 'Google search' },
  { value: 'friend_dj', label: 'A friend or another DJ' },
  { value: 'reddit', label: 'Reddit' },
  { value: 'discord_forum', label: 'Discord or a DJ forum' },
  { value: 'social_video', label: 'YouTube, Instagram or TikTok' },
  { value: 'other', label: 'Other' },
] as const;

export type HeardAboutValue = (typeof HEARD_ABOUT_OPTIONS)[number]['value'];
/** Stored when the user dismisses the prompt, so we can see the response rate. */
export const HEARD_ABOUT_SKIPPED = 'skipped';

export function isHeardAboutValue(v: unknown): v is HeardAboutValue {
  return typeof v === 'string' && HEARD_ABOUT_OPTIONS.some(o => o.value === v);
}

export const HEARD_ABOUT_OTHER_MAX = 200;

/** Only ask accounts this new; older users never see the prompt. */
export const HEARD_ABOUT_MAX_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ─── First touch ───────────────────────────────────────────────────────────
// Set once by the middleware on a visitor's first page view and never
// overwritten, so it reflects how they first arrived (not the OAuth bounce).

export const FIRST_TOUCH_COOKIE = 'sl_ft';
export const FIRST_TOUCH_MAX_AGE_S = 90 * 24 * 60 * 60;

export interface FirstTouch {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** Hostname of an external referrer, e.g. "chatgpt.com". Never the full URL. */
  referrer?: string;
  /** Path of the first page viewed, without the query string. */
  landing_path?: string;
  captured_at?: string;
}

const MAX_FIELD = 120;

function clean(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, MAX_FIELD);
  return s ? s : undefined;
}

/** Builds the first-touch record for a request. */
export function buildFirstTouch(url: URL, referer: string | null, now = new Date()): FirstTouch {
  let referrer: string | undefined;
  if (referer) {
    try {
      const host = new URL(referer).hostname;
      if (host && host !== url.hostname) referrer = clean(host);
    } catch { /* malformed Referer header — ignore */ }
  }
  return {
    utm_source: clean(url.searchParams.get('utm_source')),
    utm_medium: clean(url.searchParams.get('utm_medium')),
    utm_campaign: clean(url.searchParams.get('utm_campaign')),
    referrer,
    landing_path: clean(url.pathname),
    captured_at: now.toISOString(),
  };
}

/** Parses the cookie value back into a FirstTouch, keeping only known string fields. */
export function parseFirstTouch(raw: string | undefined): FirstTouch | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object') return null;
    const ft: FirstTouch = {
      utm_source: clean(obj.utm_source),
      utm_medium: clean(obj.utm_medium),
      utm_campaign: clean(obj.utm_campaign),
      referrer: clean(obj.referrer),
      landing_path: clean(obj.landing_path),
      captured_at: clean(obj.captured_at),
    };
    for (const k of Object.keys(ft) as (keyof FirstTouch)[]) if (ft[k] === undefined) delete ft[k];
    return Object.keys(ft).length ? ft : null;
  } catch {
    return null;
  }
}
