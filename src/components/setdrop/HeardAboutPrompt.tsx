'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SD } from '@/lib/setdrop/constants';
import { trackEvent } from '@/lib/analytics';
import {
  HEARD_ABOUT_MAX_ACCOUNT_AGE_MS,
  HEARD_ABOUT_OPTIONS,
  HEARD_ABOUT_OTHER_MAX,
  type HeardAboutValue,
} from '@/lib/acquisition';

// A small, skippable card asking new users "How did you hear about SetLab?".
// It appears a few seconds after a new account's first app page loads, never
// blocks anything, and asks once: the answer (or a skip) is saved server-side,
// and localStorage keeps it from reappearing if that save fails.
const DONE_KEY = 'sd_heard_about_done';
const SHOW_DELAY_MS = 3000;

function markDone() {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* ignore */ }
}

export function HeardAboutPrompt() {
  const [open, setOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(DONE_KEY) === '1') return; } catch { return; }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user || cancelled) return;
      const age = Date.now() - new Date(user.created_at).getTime();
      if (!(age >= 0 && age < HEARD_ABOUT_MAX_ACCOUNT_AGE_MS)) return;

      // If the column doesn't exist yet (migration not applied) this errors
      // and we simply never show the prompt.
      const { data, error } = await supabase
        .from('users')
        .select('heard_about_at')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled || error || !data) return;
      if (data.heard_about_at) { markDone(); return; }

      timer = setTimeout(() => { if (!cancelled) setOpen(true); }, SHOW_DELAY_MS);
    });

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  function save(payload: { answer: HeardAboutValue; other?: string } | { skipped: true }) {
    markDone();
    fetch('/api/account/heard-about', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* best effort */ });
  }

  function choose(value: HeardAboutValue) {
    if (value === 'other') { setOtherOpen(true); return; }
    trackEvent.heardAbout(value);
    save({ answer: value });
    finish();
  }

  function submitOther() {
    trackEvent.heardAbout('other');
    save({ answer: 'other', other: otherText.trim().slice(0, HEARD_ABOUT_OTHER_MAX) });
    finish();
  }

  function skip() {
    trackEvent.heardAbout('skipped');
    save({ skipped: true });
    setOpen(false);
  }

  function finish() {
    setThanks(true);
    setTimeout(() => setOpen(false), 1600);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="How did you hear about SetLab?"
      className="sd-heard-card"
      style={{
        position: 'fixed', left: 20, bottom: 20, zIndex: 990,
        width: 320, maxWidth: 'calc(100vw - 104px)',
        background: SD.surface2, border: `1px solid ${SD.borderMid}`, borderRadius: SD.r4,
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)', padding: '16px 16px 14px',
        fontFamily: SD.body, color: SD.text, animation: 'sdFadeUp 0.25s ease both',
      }}
    >
      {thanks ? (
        <div style={{ fontSize: 14, padding: '6px 0' }}>Thanks, that really helps.</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>How did you hear about SetLab?</div>
              <div style={{ fontSize: 12, color: SD.textMuted, marginTop: 4 }}>Optional, one tap.</div>
            </div>
            <button
              onClick={skip}
              aria-label="Skip"
              style={{
                background: 'none', border: 'none', color: SD.textMuted, cursor: 'pointer',
                fontSize: 20, lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          </div>

          {otherOpen ? (
            <form
              onSubmit={e => { e.preventDefault(); submitOther(); }}
              style={{ marginTop: 12, display: 'flex', gap: 8 }}
            >
              <input
                autoFocus
                value={otherText}
                onChange={e => setOtherText(e.target.value)}
                maxLength={HEARD_ABOUT_OTHER_MAX}
                placeholder="Where was it?"
                style={{
                  flex: 1, minWidth: 0, background: SD.surface3, border: `1px solid ${SD.borderMid}`,
                  borderRadius: SD.r2, color: SD.text, fontFamily: SD.body, fontSize: 13, padding: '8px 10px',
                }}
              />
              <button
                type="submit"
                style={{
                  background: SD.accent, color: '#000', border: 'none', borderRadius: SD.r2,
                  fontFamily: SD.mono, fontSize: 11, letterSpacing: 1, padding: '0 12px', cursor: 'pointer',
                }}
              >
                SEND
              </button>
            </form>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {HEARD_ABOUT_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => choose(o.value)}
                  style={{
                    background: SD.surface3, border: `1px solid ${SD.borderMid}`, borderRadius: 999,
                    color: SD.textSec, fontFamily: SD.body, fontSize: 12, padding: '6px 10px', cursor: 'pointer',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
