import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { HELP_GUIDES } from '@/lib/setdrop/help-guides';
import { S, HelpTopBar } from './help-ui';

export const metadata: Metadata = {
  title: `Help & Guides — ${BRAND.name}`,
  description: `Step-by-step visual guides for ${BRAND.name}: import your library, plan a set, and build a crate.`,
};

export default function HelpIndexPage() {
  return (
    <div style={{ background: S.bg, minHeight: '100vh', color: S.text }}>
      <HelpTopBar back="/" backLabel="← Back to app" />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 40px 120px' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontFamily: S.mono, fontSize: 12, color: S.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
          }}>
            Help &amp; Guides
          </div>
          <h1 style={{
            fontFamily: S.display, fontSize: 'clamp(48px,7vw,80px)',
            letterSpacing: 4, margin: '0 0 16px', lineHeight: 0.95, color: S.text,
          }}>
            HOW SETLAB WORKS
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textSec, lineHeight: 1.8, margin: 0 }}>
            Short, visual walkthroughs of the three things you&apos;ll do most. Start with importing your
            library — everything else builds on it.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {HELP_GUIDES.map((g) => (
            <a
              key={g.slug}
              href={`/help/${g.slug}`}
              style={{
                display: 'block', textDecoration: 'none',
                background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8,
                padding: '22px 24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <span style={{ fontFamily: S.display, fontSize: 22, letterSpacing: 2, color: S.text }}>
                  {g.title}
                </span>
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.textMuted, whiteSpace: 'nowrap', letterSpacing: 0.5 }}>
                  {g.minutes} min read
                </span>
              </div>
              <div style={{ fontFamily: S.body, fontSize: 14, color: S.textSec, lineHeight: 1.55, marginBottom: 12 }}>
                {g.summary}
              </div>
              <span style={{ fontFamily: S.mono, fontSize: 12, letterSpacing: 1, color: S.accent, textTransform: 'uppercase' }}>
                Read guide →
              </span>
            </a>
          ))}
        </div>

        <p style={{ fontFamily: S.mono, fontSize: 12, color: S.textMuted, lineHeight: 1.8, marginTop: 40 }}>
          Moving from Serato to Rekordbox? The{' '}
          <Link href="/serato-to-rekordbox" style={{ color: S.accent, textDecoration: 'none' }}>Serato to Rekordbox converter</Link>{' '}
          brings your hot cues, loops and crates across for free.
        </p>

        <p style={{ fontFamily: S.mono, fontSize: 12, color: S.textMuted, lineHeight: 1.8, marginTop: 16 }}>
          Still stuck? Tap the chat bubble in the app, or email{' '}
          <a href="mailto:kelcwu@gmail.com" style={{ color: S.accent, textDecoration: 'none' }}>kelcwu@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
