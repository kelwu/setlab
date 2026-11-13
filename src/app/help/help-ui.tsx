import { BRAND } from '@/lib/brand';
import type { HelpImage } from '@/lib/setdrop/help-guides';

// Self-contained tokens (mirrors the privacy page) so /help works for logged-out
// visitors too — the support chat links anonymous users straight here.
export const S = {
  bg: '#0A0A0A', surface: '#141414', surface2: '#1A1A1A', surface3: '#222222',
  border: 'rgba(255,255,255,0.07)', borderMid: 'rgba(255,255,255,0.12)',
  accent: '#F5A623', accentDim: 'rgba(245,166,35,0.10)',
  text: '#F0F0F0', textSec: '#ADADAD', textMuted: '#8A8A8A',
  mono: 'var(--font-mono), monospace', display: 'var(--font-display), sans-serif',
  body: 'var(--font-body), sans-serif',
};

/** Top bar shared by the index and every guide. */
export function HelpTopBar({ back = '/help', backLabel = '← All guides' }: { back?: string; backLabel?: string }) {
  return (
    <div style={{
      padding: '20px 40px', borderBottom: `1px solid ${S.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <a href="/" style={{ fontFamily: S.display, fontSize: 22, letterSpacing: 3, color: S.text, textDecoration: 'none' }}>
        {BRAND.logoLeft}<span style={{ color: S.accent }}>{BRAND.logoRight}</span>
      </a>
      <a href={back} style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted, textDecoration: 'none', letterSpacing: 1 }}>
        {backLabel}
      </a>
    </div>
  );
}

/** Renders the screenshot for a step. Until a real asset exists it shows a
 *  labeled placeholder describing exactly what image belongs there. */
export function StepImage({ image }: { image: HelpImage }) {
  const ready = image.src && !image.pending;

  if (ready) {
    return (
      <figure style={{ margin: '16px 0 0' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt={image.alt}
          style={{ width: '100%', borderRadius: 8, border: `1px solid ${S.border}`, display: 'block' }}
        />
        {image.caption && (
          <figcaption style={{ fontFamily: S.mono, fontSize: 11, color: S.textMuted, marginTop: 8, letterSpacing: 0.3 }}>
            {image.caption}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <div style={{
      margin: '16px 0 0', borderRadius: 8, border: `1px dashed ${S.borderMid}`,
      background: S.surface2, padding: '28px 24px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
    }}>
      <span style={{
        fontFamily: S.mono, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        color: S.accent, background: S.accentDim, border: `1px solid ${S.accent}44`,
        borderRadius: 3, padding: '2px 8px',
      }}>
        Screenshot pending
      </span>
      <span style={{ fontFamily: S.mono, fontSize: 12, color: S.textSec, lineHeight: 1.6, maxWidth: 460 }}>
        {image.alt}
      </span>
    </div>
  );
}
