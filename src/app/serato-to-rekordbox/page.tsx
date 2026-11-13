import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';

// Public, static landing page for the free Serato → Rekordbox converter
// (the app itself lives at /convert, behind sign-in). Written for search: one
// clear H1, plain-language answers, and FAQ structured data.

const URL_PATH = '/serato-to-rekordbox';
const TITLE = 'Convert Serato to Rekordbox — Free, With Hot Cues';
const DESCRIPTION =
  'Move your Serato DJ library to Rekordbox in your browser: tracks, hot cues, saved loops, colors, '
  + 'comments and crates as playlists. Cue timing corrected for MP3s. Your music never leaves your computer.';

export const metadata: Metadata = {
  title: `${TITLE} | ${BRAND.name}`,
  description: DESCRIPTION,
  alternates: { canonical: `https://${BRAND.domain}${URL_PATH}` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `https://${BRAND.domain}${URL_PATH}`,
    siteName: BRAND.name,
    type: 'website',
  },
};

const S = {
  bg: '#0A0A0A', surface: '#111111', border: 'rgba(255,255,255,0.07)', borderMid: 'rgba(255,255,255,0.12)',
  accent: '#F5A623', accentDim: 'rgba(245,166,35,0.12)', green: '#22C55E',
  text: '#F0F0F0', textSec: '#8A8A8A', textMuted: '#5A5A5A',
  mono: 'var(--font-mono), monospace', display: 'var(--font-display), sans-serif', body: 'var(--font-body), sans-serif',
};

const MOVES = [
  ['Every track', 'with title, artist, genre, year, BPM and key'],
  ['Hot cues', 'all eight pads, with their names and colors'],
  ['Saved loops', 'as memory loops, so no hot cue is ever displaced (or as hot cues, if you prefer)'],
  ['Track colors', 'matched to the nearest Rekordbox color'],
  ['Comments', 'exactly as you wrote them in Serato'],
  ['Crates', 'as playlists, sub-crates as folders, in one “Serato (SetLab)” folder'],
];

const NOT_YET = [
  'Cues on AIFF, M4A, FLAC and WAV files — those tracks move across without cues for now (MP3 cues move today).',
  'Beatgrids — Rekordbox analyzes each track itself.',
  'Smart crates.',
];

const STEPS = [
  ['Choose your Music folder', 'The one with “_Serato_” inside — or the top of your external drive. SetLab reads your Serato database, crates and the cue tags inside each file, right in the browser.'],
  ['Pick what to move', 'Your whole library or just some crates. Review every track, listen to any cue, and leave out anything you don’t want.'],
  ['Import into Rekordbox', 'Download one Rekordbox XML file and follow the steps shown on screen. Back up your Rekordbox library first.'],
];

const FAQ: [string, string][] = [
  ['Is it really free?',
    `Yes. Converting is free with a ${BRAND.name} account — no trial, no card, no limit on library size.`],
  ['Does my music get uploaded?',
    'No. Your audio never leaves your computer and SetLab never changes, moves or re-encodes your files. Your browser may describe picking a folder as an “upload”, but the files are only read locally. SetLab keeps just the cue details (positions, names, colors) so they can travel with your future SetLab exports.'],
  ['Will my cues land in the right place?',
    'Serato and Rekordbox read the start of many MP3s differently, so a cue copied over as-is can land around 26 ms late — enough to clip a kick. SetLab checks how each MP3 was encoded and corrects the cue only where it’s needed. We measured this in Rekordbox 7 before shipping it.'],
  ['What happens to tracks already in Rekordbox?',
    'Importing to your collection updates them, and hot cues already sitting in the same pads may be replaced. Back up first (File → Library → Backup Library) so you can always go back.'],
  ['Does it work on Mac and Windows?',
    'Yes — it runs in a desktop web browser on either. If your music lives on an external drive, choose the top of that drive.'],
  ['What does SetLab Pro add?',
    `${BRAND.name} also builds setlists and crates from your library with AI. With Pro, your hot cues ride along inside every Rekordbox export of those sets and crates.`],
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: S.mono, fontSize: 12, color: S.accent, letterSpacing: 2,
      textTransform: 'uppercase', marginBottom: 14 }}>{children}</div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: S.display, fontSize: 'clamp(32px,5vw,44px)', letterSpacing: 2,
      color: S.text, margin: '0 0 24px', lineHeight: 1 }}>{children}</h2>
  );
}

const body = { fontFamily: S.body, fontSize: 16, color: S.textSec, lineHeight: 1.7, margin: 0 } as const;

function Cta({ label = 'Convert my library' }: { label?: string }) {
  return (
    <Link href="/convert" style={{
      display: 'inline-block', background: S.accent, color: '#000', textDecoration: 'none',
      fontFamily: S.mono, fontSize: 14, fontWeight: 500, letterSpacing: 1, textTransform: 'uppercase',
      padding: '14px 28px', borderRadius: 3,
    }}>{label}</Link>
  );
}

export default function SeratoToRekordboxPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `${BRAND.name} Serato to Rekordbox converter`,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web browser (macOS, Windows)',
      url: `https://${BRAND.domain}${URL_PATH}`,
      description: DESCRIPTION,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ];

  return (
    <div style={{ background: S.bg, minHeight: '100vh', color: S.text }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="sd-pad-x" style={{ padding: '20px 40px', borderBottom: `1px solid ${S.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <Link href="/" style={{ fontFamily: S.display, fontSize: 22, letterSpacing: 3, color: S.text, textDecoration: 'none' }}>
          {BRAND.logoLeft}<span style={{ color: S.accent }}>{BRAND.logoRight}</span>
        </Link>
        <Link href="/login?redirect=/convert" style={{ fontFamily: S.mono, fontSize: 13, color: S.textSec,
          textDecoration: 'none', letterSpacing: 1 }}>Log in</Link>
      </header>

      <main className="sd-pad-x" style={{ maxWidth: 880, margin: '0 auto', padding: '72px 40px 120px' }}>
        {/* Hero */}
        <section style={{ marginBottom: 88 }}>
          <Eyebrow>Serato → Rekordbox converter</Eyebrow>
          <h1 style={{ fontFamily: S.display, fontSize: 'clamp(44px,8vw,84px)', letterSpacing: 3,
            margin: '0 0 24px', lineHeight: 0.95 }}>
            Move your Serato library to Rekordbox — <span style={{ color: S.accent }}>hot cues and all</span>
          </h1>
          <p style={{ ...body, fontSize: 18, maxWidth: 640, marginBottom: 32 }}>
            Tracks, hot cues, saved loops, colors, comments and crates, in one Rekordbox file. It runs in your
            browser, your music never leaves your computer, and your files are never changed.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Cta />
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.textMuted }}>
              Free with a SetLab account · no card · whole library
            </span>
          </div>
        </section>

        {/* What moves */}
        <section style={{ marginBottom: 88 }}>
          <Eyebrow>What comes across</Eyebrow>
          <H2>Your prep, not just your playlists</H2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 1,
            background: S.border, border: `1px solid ${S.border}`, borderRadius: 4, overflow: 'hidden' }}>
            {MOVES.map(([h, d]) => (
              <div key={h} style={{ background: S.surface, padding: '20px 22px' }}>
                <div style={{ fontFamily: S.mono, fontSize: 14, color: S.text, marginBottom: 6 }}>
                  <span style={{ color: S.green, marginRight: 8 }}>✓</span>{h}
                </div>
                <div style={{ ...body, fontSize: 14 }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: S.mono, fontSize: 12, color: S.textMuted, letterSpacing: 1.5,
              textTransform: 'uppercase', marginBottom: 10 }}>Not yet</div>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {NOT_YET.map(t => <li key={t} style={{ ...body, fontSize: 14, marginBottom: 6 }}>{t}</li>)}
            </ul>
          </div>
        </section>

        {/* Timing */}
        <section style={{ marginBottom: 88, background: S.accentDim, border: `1px solid ${S.accent}33`,
          borderRadius: 4, padding: '32px 32px' }}>
          <Eyebrow>Cue timing, fixed</Eyebrow>
          <H2>Cues that land on the beat</H2>
          <p style={{ ...body, marginBottom: 14 }}>
            Serato and Rekordbox don’t agree on where many MP3s begin. Copy a cue across as-is and it can play about
            26 milliseconds late — enough to clip the kick you set it on.
          </p>
          <p style={body}>
            {BRAND.name} reads how each MP3 was encoded and shifts the cue only on the files that need it, so it
            sits where you put it in Serato. We measured the difference in Rekordbox 7 before building the fix.
          </p>
        </section>

        {/* How */}
        <section style={{ marginBottom: 88 }}>
          <Eyebrow>How it works</Eyebrow>
          <H2>Three steps, a few minutes</H2>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {STEPS.map(([h, d], i) => (
              <li key={h} style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', border: `1px solid ${S.accent}66`,
                  color: S.accent, fontFamily: S.mono, fontSize: 14, display: 'flex', alignItems: 'center',
                  justifyContent: 'center' }}>{i + 1}</span>
                <div>
                  <div style={{ fontFamily: S.mono, fontSize: 15, color: S.text, marginBottom: 4 }}>{h}</div>
                  <p style={{ ...body, fontSize: 15 }}>{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 36 }}><Cta label="Start converting" /></div>
        </section>

        {/* FAQ */}
        <section style={{ marginBottom: 72 }}>
          <Eyebrow>Questions</Eyebrow>
          <H2>Before you switch</H2>
          <div style={{ borderTop: `1px solid ${S.borderMid}` }}>
            {FAQ.map(([q, a]) => (
              <details key={q} style={{ borderBottom: `1px solid ${S.borderMid}`, padding: '18px 0' }}>
                <summary style={{ fontFamily: S.mono, fontSize: 15, color: S.text, cursor: 'pointer' }}>{q}</summary>
                <p style={{ ...body, fontSize: 15, marginTop: 12 }}>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <p style={{ fontFamily: S.mono, fontSize: 12, color: S.textMuted, lineHeight: 1.7, margin: 0 }}>
          {BRAND.name} is independent and not affiliated with Serato or AlphaTheta. Serato and Rekordbox are trademarks
          of their owners. See the <Link href="/terms" style={{ color: S.textSec }}>Terms</Link> and{' '}
          <Link href="/privacy" style={{ color: S.textSec }}>Privacy Policy</Link>.
        </p>
      </main>
    </div>
  );
}
