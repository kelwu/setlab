import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Terms of Service — ${BRAND.name}`,
  description: `The terms for using ${BRAND.name}.`,
};

const S = {
  bg: '#0A0A0A', border: 'rgba(255,255,255,0.07)',
  accent: '#F5A623', text: '#F0F0F0', textSec: '#8A8A8A', textMuted: '#4A4A4A',
  mono: 'var(--font-mono), monospace', display: 'var(--font-display), sans-serif',
};

const CONTACT = 'kelcwu@gmail.com';

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: S.display, fontSize: 28, letterSpacing: 2,
      color: S.text, margin: '48px 0 16px', lineHeight: 1 }}>
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textSec,
      lineHeight: 1.8, margin: '0 0 16px' }}>
      {children}
    </p>
  );
}

function UL({ items }: { items: React.ReactNode[] }) {
  return (
    <ul style={{ margin: '0 0 16px', paddingLeft: 24 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontFamily: S.mono, fontSize: 13, color: S.textSec,
          lineHeight: 1.8, marginBottom: 6 }}>{item}</li>
      ))}
    </ul>
  );
}

const Mail = () => (
  <a href={`mailto:${CONTACT}`} style={{ color: S.accent, textDecoration: 'none' }}>{CONTACT}</a>
);

export default function TermsPage() {
  const B = BRAND.name;
  return (
    <div style={{ background: S.bg, minHeight: '100vh', color: S.text }}>
      <div style={{ padding: '20px 40px', borderBottom: `1px solid ${S.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ fontFamily: S.display, fontSize: 22, letterSpacing: 3,
          color: S.text, textDecoration: 'none' }}>
          {BRAND.logoLeft}<span style={{ color: S.accent }}>{BRAND.logoRight}</span>
        </Link>
        <Link href="/" style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          textDecoration: 'none', letterSpacing: 1 }}>← Back to app</Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 40px 120px' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, color: S.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
            Last updated: November 12, 2026
          </div>
          <h1 style={{ fontFamily: S.display, fontSize: 'clamp(48px,7vw,80px)',
            letterSpacing: 4, margin: '0 0 16px', lineHeight: .95, color: S.text }}>
            TERMS OF SERVICE
          </h1>
          <P>
            These terms are an agreement between you and Kel Wu, who operates {B} ({BRAND.domain}).
            By creating an account or using {B}, you agree to them. If you don&apos;t agree, please don&apos;t
            use {B}. How we handle your data is covered separately in our{' '}
            <Link href="/privacy" style={{ color: S.accent, textDecoration: 'none' }}>Privacy Policy</Link>.
          </P>
        </div>

        <div style={{ height: 1, background: S.border, marginBottom: 8 }} />

        <H2>1. Who Can Use {B}</H2>
        <P>
          You must be at least 18 years old to use {B}. You&apos;re responsible for your account, for keeping
          your login secure, and for everything done with it. Tell us at <Mail /> if you think someone else
          has accessed it.
        </P>

        <H2>2. What {B} Does</H2>
        <P>
          {B} helps DJs prepare: it imports your Serato or Rekordbox library information, uses AI to
          suggest setlists and crates, identifies tracks, and exports playlists and crates for your DJ
          software. It also converts a Serato library — tracks, hot cues, loops, colors and crates — into a
          Rekordbox XML file.
        </P>
        <P>
          {B} is a tool to support your own preparation. You decide what you play; always check exports
          and conversions in your DJ software before relying on them at a gig.
        </P>

        <H2>3. The Serato → Rekordbox Converter</H2>
        <UL items={[
          <>The converter is free for anyone with a {B} account and runs in your web browser. It reads your
            Serato database, crate files and the cue tags inside your music files on your computer.</>,
          <>{B} never uploads your audio and never changes, moves or re-encodes your music files. The only
            thing it creates is the XML file you download.</>,
          <><strong style={{ color: S.text }}>Back up before importing.</strong> Importing the XML changes
            your Rekordbox collection, and can replace hot cues on tracks that are already there. Back up
            your Rekordbox library first (File → Library → Backup Library). You&apos;re responsible for your
            backups.</>,
          <>We work hard to place every cue precisely, including correcting the known timing differences
            between how Serato and Rekordbox read MP3 files, but we can&apos;t guarantee every cue, loop,
            color or crate will convert exactly for every file. Check important tracks before a gig.</>,
          <>In this version only MP3 files carry cues; other formats move across without them.</>,
        ]} />

        <H2>4. Your Content</H2>
        <P>
          Your library information, cues, setlists and anything else you add stay yours. You give us
          permission to store and process them only to run {B} for you — for example, to generate setlists,
          export files, and keep your data available across devices. Make sure you have the right to use
          the music in your library; {B} doesn&apos;t provide, host or license music.
        </P>
        <P>
          If you make a setlist public, anyone with its link can see it, as described in the Privacy Policy.
        </P>

        <H2>5. AI-Generated Suggestions</H2>
        <P>
          Setlists, transition notes and other suggestions are generated by AI (Claude by Anthropic) from
          your library and the details you give. They can be wrong — for example, a track&apos;s BPM, key,
          genre or clean/explicit status can be mis-tagged. Treat them as suggestions and review them before
          you play.
        </P>

        <H2>6. Acceptable Use</H2>
        <P>Please don&apos;t:</P>
        <UL items={[
          'Break the law, or infringe anyone else’s rights, using SetLab',
          'Try to access other people’s accounts or data, or get around usage limits, plan restrictions or security measures',
          'Overload, scrape, reverse engineer or resell SetLab, or use automated tools against it beyond normal personal use',
          'Upload anything malicious or anything you don’t have the right to share',
        ]} />
        <P>We may suspend or close accounts that do these things.</P>

        <H2>7. Pro Subscription &amp; Billing</H2>
        <UL items={[
          <>{B} Pro is a monthly subscription, billed in advance through Stripe at the price shown when you
            subscribe. It renews automatically each month until you cancel.</>,
          <>You can cancel anytime from your Account page (Manage Billing). Cancelling stops future
            renewals; you keep Pro until the end of the month you&apos;ve already paid for.</>,
          <><strong style={{ color: S.text }}>Payments are non-refundable</strong>, including for partly used
            months, except where the law requires otherwise.</>,
          <>We may change Pro&apos;s price or features. If the price changes, we&apos;ll tell you before your
            next renewal at the new price, and you can cancel before then.</>,
          <>Free features and limits (such as the number of exports per month) may change over time.</>,
        ]} />

        <H2>8. Third-Party Products</H2>
        <P>
          {B} is independent and is not affiliated with, endorsed by or sponsored by Serato, AlphaTheta /
          Pioneer DJ (makers of Rekordbox), or any other DJ software company. Serato, Rekordbox and other
          product names are trademarks of their owners and are used only to describe compatibility. Changes
          those companies make to their software or file formats can affect how {B} works with them.
        </P>

        <H2>9. Availability &amp; Changes</H2>
        <P>
          We aim to keep {B} running smoothly but can&apos;t promise it will always be available or error-free.
          We may add, change or remove features. If we ever shut {B} down, we&apos;ll give reasonable notice
          where we can so you can export your setlists.
        </P>

        <H2>10. Disclaimer</H2>
        <P>
          {B} is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind,
          express or implied, including warranties of merchantability, fitness for a particular purpose,
          accuracy and non-infringement, to the fullest extent the law allows.
        </P>

        <H2>11. Limitation of Liability</H2>
        <P>
          To the fullest extent the law allows, Kel Wu and {B} are not liable for any indirect, incidental,
          special, consequential or punitive damages, or for lost profits, lost data (including DJ library
          data, cues or playlists), lost bookings or gig-related losses, arising from your use of {B}. Our
          total liability for any claim relating to {B} is limited to the amount you paid us in the 12
          months before the claim, or US$50 if you haven&apos;t paid us anything.
        </P>

        <H2>12. Ending Your Use</H2>
        <P>
          You can stop using {B} and delete your account anytime from the Account page. We may suspend or
          end your access if you break these terms or if we need to for legal or security reasons. Sections
          4, 10, 11 and 13 continue to apply after your account ends.
        </P>

        <H2>13. Governing Law</H2>
        <P>
          These terms are governed by the laws of the State of California, USA, without regard to its
          conflict-of-law rules. Any dispute will be resolved in the state or federal courts located in
          California, and you and we agree to those courts&apos; jurisdiction.
        </P>

        <H2>14. Changes to These Terms</H2>
        <P>
          When we change these terms, we&apos;ll update the &ldquo;Last updated&rdquo; date above and, for
          significant changes, let you know by email or in the app. Continuing to use {B} after a change
          means you accept the updated terms.
        </P>

        <H2>15. Contact</H2>
        <P>Questions about these terms: <Mail /></P>

        <div style={{ height: 1, background: S.border, margin: '48px 0 32px' }} />
        <P>
          <span style={{ color: S.textMuted }}>
            {B} is operated by Kel Wu ·{' '}
            <a href={`mailto:${CONTACT}`} style={{ color: S.textMuted, textDecoration: 'none' }}>{CONTACT}</a>
          </span>
        </P>
      </div>
    </div>
  );
}
