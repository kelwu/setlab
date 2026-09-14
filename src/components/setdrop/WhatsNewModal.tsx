'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SD } from '@/lib/setdrop/constants';

// Bump VERSION whenever the items below change — a user who has dismissed an older
// version will see the modal again for the new one (localStorage stores the last
// version seen). Keep items DJ-facing: the benefit, not the internals.
const VERSION = '2026-09';
const STORAGE_KEY = 'sd_whatsnew_seen';

const ITEMS: { title: string; desc: string }[] = [
  { title: '3-hour sets', desc: 'Set length now goes up to 180 minutes — for the long corporate, wedding, and residency slots.' },
  { title: 'Clean-only sets', desc: 'One toggle keeps a set corporate- and radio-safe by leaving explicit versions out of the pool.' },
  { title: 'Corporate-aware sets', desc: 'For corporate, wedding, radio, and lounge crowds, the builder now steers clear of tracks whose subject matter isn’t right for the room — not just the explicit versions.' },
  { title: 'Smarter library re-sync', desc: 'Re-importing your library now updates only what changed, so your crates and track data stay intact.' },
  { title: 'Full-detail exports', desc: 'Sets exported to Serato and Rekordbox now carry complete track info — BPM, key, artist, and genre.' },
];

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== VERSION) setOpen(true);
    } catch { /* localStorage blocked — just don't show */ }
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, VERSION); } catch { /* ignore */ }
    setOpen(false);
  }, []);

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="What's new in SetLab"
      onClick={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'sdFadeUp 0.25s ease both',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto',
          background: SD.surface, border: `1px solid ${SD.borderMid}`,
          borderTop: `2px solid ${SD.accent}`, borderRadius: SD.r3,
          padding: '28px 28px 24px', position: 'relative',
        }}
      >
        {/* Close */}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            position: 'absolute', right: 14, top: 12,
            background: 'none', border: 'none', cursor: 'pointer',
            color: SD.textMuted, fontSize: 18, lineHeight: 1, padding: 6,
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{
          fontFamily: SD.mono, fontSize: SD.t10, letterSpacing: 2,
          textTransform: 'uppercase', color: SD.accent, marginBottom: 8,
        }}>
          New in SetLab
        </div>
        <div style={{
          fontFamily: SD.display, fontSize: SD.t20, letterSpacing: 2,
          color: SD.text, marginBottom: 22,
        }}>
          WHAT&rsquo;S NEW
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 26 }}>
          {ITEMS.map(item => (
            <div key={item.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, marginTop: 6, width: 6, height: 6, borderRadius: '50%',
                background: SD.accent,
              }} />
              <div>
                <div style={{
                  fontFamily: SD.mono, fontSize: SD.t12, color: SD.text,
                  fontWeight: 600, marginBottom: 3,
                }}>
                  {item.title}
                </div>
                <div style={{
                  fontFamily: SD.body, fontSize: SD.t12, color: SD.textSec, lineHeight: 1.6,
                }}>
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          style={{
            width: '100%', fontFamily: SD.mono, fontSize: SD.t12, letterSpacing: 1.5,
            textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
            background: SD.accent, color: '#000', border: 'none',
            borderRadius: SD.r2, padding: '12px 20px',
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
