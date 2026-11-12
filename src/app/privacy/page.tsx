import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: `Privacy Policy — ${BRAND.name}`,
  description: `How ${BRAND.name} collects, uses, and protects your data.`,
};

const S = {
  bg: '#0A0A0A', surface: '#141414', border: 'rgba(255,255,255,0.07)',
  accent: '#F5A623', text: '#F0F0F0', textSec: '#8A8A8A', textMuted: '#4A4A4A',
  mono: 'var(--font-mono), monospace', display: 'var(--font-display), sans-serif',
};

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

export default function PrivacyPage() {
  return (
    <div style={{ background: S.bg, minHeight: '100vh', color: S.text }}>
      {/* Nav */}
      <div style={{ padding: '20px 40px', borderBottom: `1px solid ${S.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ fontFamily: S.display, fontSize: 22, letterSpacing: 3,
          color: S.text, textDecoration: 'none' }}>
          {BRAND.logoLeft}<span style={{ color: S.accent }}>{BRAND.logoRight}</span>
        </a>
        <a href="/" style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          textDecoration: 'none', letterSpacing: 1 }}>← Back to app</a>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '64px 40px 120px' }}>
        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: S.mono, fontSize: 12, color: S.textMuted,
            letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
            Last updated: November 12, 2026
          </div>
          <h1 style={{ fontFamily: S.display, fontSize: 'clamp(48px,7vw,80px)',
            letterSpacing: 4, margin: '0 0 16px', lineHeight: .95, color: S.text }}>
            PRIVACY POLICY
          </h1>
          <P>
            {BRAND.name} is a tool for DJs. We take your data seriously and keep this policy short and plain.
            If you have questions, email <a href="mailto:kelcwu@gmail.com"
              style={{ color: S.accent, textDecoration: 'none' }}>kelcwu@gmail.com</a>.
          </P>
        </div>

        <div style={{ height: 1, background: S.border, marginBottom: 8 }} />

        {/* 1 */}
        <H2>1. What {BRAND.name} Is</H2>
        <P>
          {BRAND.name} is a web app that helps DJs plan setlists. It imports your Serato or Rekordbox
          library, uses AI (Claude by Anthropic) to generate a sequenced set based on your gig context,
          and exports the result as a Serato <code style={{ color: S.accent }}>.crate</code>, a Rekordbox
          XML file, or an M3U playlist. It also converts a Serato library — tracks, hot cues, loops,
          colours and crates — into a Rekordbox XML file.
        </P>
        <P>
          {BRAND.name} is operated by Kel Wu, an individual developer. Contact:{' '}
          <a href="mailto:kelcwu@gmail.com" style={{ color: S.accent, textDecoration: 'none' }}>
            kelcwu@gmail.com
          </a>
        </P>

        {/* 2 */}
        <H2>2. What Data We Collect</H2>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Account
        </p>
        <UL items={[
          'Email address (used to log in and contact you)',
          'A Supabase-generated user ID (UUID)',
          'Account creation timestamp',
          <>No passwords are stored by {BRAND.name} — Supabase Auth handles credential storage using bcrypt hashing</>,
        ]} />

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Serato Library
        </p>
        <P>
          When you upload your Serato library file, {BRAND.name} extracts and stores per-track metadata:
        </P>
        <UL items={[
          'Artist name',
          'Track title',
          'BPM',
          'Musical key',
          'Genre',
          <>File path (the path on your local machine as stored by Serato — used only to generate .crate files for re-import; {BRAND.name} never accesses your files remotely)</>,
        ]} />
        <P>Audio files are never uploaded. Only the text metadata above is stored.</P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Serato → Rekordbox Converter
        </p>
        <P>
          When you use the converter, you choose a folder on your computer and your browser reads it
          locally. {BRAND.name} reads only the Serato database, your crate files, and the tag data inside
          each music file that holds Serato&apos;s cues. Your audio is never uploaded, and {BRAND.name} never
          changes, moves or re-encodes your music files — the only thing it writes is the XML file you download.
        </P>
        <P>So your cues can travel with later {BRAND.name} exports, we store, per music file:</P>
        <UL items={[
          'The file path (as stored by Serato)',
          'Hot cue and saved loop positions, names and colours, and the track colour',
          'The comment tag text, if the file has one',
          'Technical details needed to place cues correctly: MP3 encoder timing information, sample rate, duration and file size',
          'A change marker (file size and last-modified time) so unchanged files can be skipped next time',
        ]} />
        <P>
          This cue data is deleted when you clear your library or delete your account.
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Generated Setlists
        </p>
        <P>When a setlist is generated, we store:</P>
        <UL items={[
          'Setlist name, genre, crowd context, duration, and lineup slot',
          'Energy arc settings',
          'The ordered list of selected tracks with transition notes and AI annotations',
          'Creation timestamp',
        ]} />
        <P>
          Setlists are private by default. You can publish a setlist to get a public share URL —
          see Section 5 for how that works.
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Track ID (Audio Recognition)
        </p>
        <P>
          When you use Track ID — recording a few seconds of a song through your microphone, or
          uploading an audio file or DJ mix to identify the tracks in it — {BRAND.name} sends that audio
          to ACRCloud, a third-party music-recognition service, to find a match. See Section 4 for details.
        </P>
        <P>
          {BRAND.name} does <strong style={{ color: S.text }}>not</strong> store your audio recordings or
          uploaded files. The audio is forwarded to ACRCloud for recognition and then discarded. We retain
          only the result of each request — the matched track metadata (artist, title, BPM, genre), whether
          a match was found, and a timestamp — so we can show your history and enforce monthly usage limits.
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Subscriptions &amp; Payments
        </p>
        <P>
          {BRAND.name} offers a paid Pro subscription. Payments are processed entirely by Stripe —
          {BRAND.name} never sees or stores your card number. We store only a Stripe customer ID, your
          subscription status and tier, and the current billing period, so we can unlock Pro features and
          generate invoices. See Section 4 for details.
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          What We Do NOT Collect
        </p>
        <UL items={[
          'Your card or bank details (payments are handled entirely by Stripe — see above)',
          'Stored copies of your audio recordings or uploaded files (used for recognition, then discarded — see above)',
          'Your music files themselves (the converter reads cue tags locally; audio never leaves your computer)',
          'Precise location data',
          'Advertising identifiers — we do not run ads or sell data to advertisers',
        ]} />

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Usage Analytics &amp; Error Reports
        </p>
        <P>
          We use Google Analytics to understand how {BRAND.name} is used: pages visited and product
          events such as starting a set, exporting, or converting a library (counts and settings, not the
          contents of your library). Google Analytics sets its own cookies and receives your IP address
          and browser details.
        </P>
        <P>
          We use Sentry to find and fix bugs. When an error happens, Sentry receives technical details
          (browser, page, error message) and may record a short replay of the page leading up to the error.
          Text on screen is masked in these replays, so they show layout and clicks, not your data. See Section 4.
        </P>

        {/* 3 */}
        <H2>3. How We Use Your Data</H2>
        <UL items={[
          'To log you in and keep your session active',
          'To store and retrieve your Serato library across devices',
          'To generate AI setlists using your library and gig parameters',
          'To match setlist tracks to your library for .crate file export',
          'To identify tracks you record or upload via Track ID and add them to your wishlist',
          'To process your Pro subscription, unlock paid features, and generate invoices',
          'To enforce monthly usage limits on metered features like Track ID',
          'To display your setlist history on your dashboard',
          'To convert your Serato library to Rekordbox and include your cues in later exports',
          'To send product email — onboarding tips, feature announcements, and occasional check-ins if you haven’t been back in a while (you can unsubscribe from these at any time)',
          'To measure usage and fix errors (Google Analytics and Sentry)',
        ]} />
        <P>We do not sell your data. We do not share it with third parties except as described in Section 4.</P>

        {/* 4 */}
        <H2>4. Third-Party Services</H2>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Supabase
        </p>
        <P>
          Supabase provides our database and authentication. All user data — accounts, library metadata,
          and setlists — is stored in Supabase on AWS infrastructure in us-east-1. Row-Level Security
          policies ensure each user can only access their own data.{' '}
          <a href="https://supabase.com/privacy" style={{ color: S.accent, textDecoration: 'none' }}>
            Supabase Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Vercel
        </p>
        <P>
          {BRAND.name} is hosted on Vercel. Standard server logs (request metadata, IP addresses) are
          retained per Vercel&apos;s own policy.{' '}
          <a href="https://vercel.com/legal/privacy-policy" style={{ color: S.accent, textDecoration: 'none' }}>
            Vercel Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Anthropic (Claude AI)
        </p>
        <P>
          When you generate a setlist, {BRAND.name} sends your library metadata (artist, title, BPM, key, genre)
          and gig parameters to the Anthropic Claude API. No personally identifying information is included.
          Anthropic does not use API inputs to train its models by default.{' '}
          <a href="https://www.anthropic.com/privacy" style={{ color: S.accent, textDecoration: 'none' }}>
            Anthropic Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          ACRCloud
        </p>
        <P>
          When you use Track ID, the audio you record or upload is sent to ACRCloud for music recognition.
          ACRCloud processes the audio to return a match and does not receive your account information.
          {' '}{BRAND.name} does not retain the audio after recognition.{' '}
          <a href="https://www.acrcloud.com/privacy-policy/" style={{ color: S.accent, textDecoration: 'none' }}>
            ACRCloud Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Stripe
        </p>
        <P>
          Stripe processes all payments for {BRAND.name} Pro. When you subscribe, your card details are
          entered directly with Stripe and never pass through {BRAND.name}&apos;s servers. We receive only a
          Stripe customer ID and your subscription status.{' '}
          <a href="https://stripe.com/privacy" style={{ color: S.accent, textDecoration: 'none' }}>
            Stripe Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Resend
        </p>
        <P>
          {BRAND.name} uses Resend to send transactional email such as invoices. Your email address is
          shared with Resend solely to deliver these messages.{' '}
          <a href="https://resend.com/legal/privacy-policy" style={{ color: S.accent, textDecoration: 'none' }}>
            Resend Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Loops
        </p>
        <P>
          {BRAND.name} uses Loops to send product email: onboarding, feature announcements, and check-ins.
          Loops receives your email address and basic account facts used to choose which emails to send
          (for example, whether you have imported a library or exported a set). Every one of these emails
          has an unsubscribe link.{' '}
          <a href="https://loops.so/privacy" style={{ color: S.accent, textDecoration: 'none' }}>
            Loops Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Google Analytics
        </p>
        <P>
          Google Analytics measures page views and product events. It receives your IP address, browser
          details and the events described in Section 2, and sets cookies to tell visits apart.{' '}
          <a href="https://policies.google.com/privacy" style={{ color: S.accent, textDecoration: 'none' }}>
            Google Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Sentry
        </p>
        <P>
          Sentry collects error reports, and a replay of the page when an error occurs, so we can fix bugs.{' '}
          <a href="https://sentry.io/privacy/" style={{ color: S.accent, textDecoration: 'none' }}>
            Sentry Privacy Policy ↗
          </a>
        </P>

        <p style={{ fontFamily: S.mono, fontSize: 13, color: S.textMuted,
          letterSpacing: 1.5, textTransform: 'uppercase', margin: '24px 0 10px' }}>
          Last.fm
        </p>
        <P>
          To enrich track metadata (such as genre and tags), {BRAND.name} may send an artist and title to
          the Last.fm API. No personally identifying information is included.{' '}
          <a href="https://www.last.fm/legal/privacy" style={{ color: S.accent, textDecoration: 'none' }}>
            Last.fm Privacy Policy ↗
          </a>
        </P>

        {/* 5 */}
        <H2>5. Public Setlists</H2>
        <P>
          Setlists are private by default. If you click &ldquo;Make Public&rdquo; on a setlist, it becomes
          accessible to anyone with the link at <code style={{ color: S.accent }}>{BRAND.domain}/set/[slug]</code>.
          Public setlists show the track list, energy arc, and metadata — no account information is exposed.
          You cannot currently undo a public setlist through the UI; contact{' '}
          <a href="mailto:kelcwu@gmail.com" style={{ color: S.accent, textDecoration: 'none' }}>
            kelcwu@gmail.com
          </a>{' '}to make one private again.
        </P>

        {/* 6 */}
        <H2>6. Cookies</H2>
        <P>
          {BRAND.name} sets one cookie of its own: the Supabase session cookie (prefixed{' '}
          <code style={{ color: S.accent }}>sb-</code>), set when you log in. It is HTTP-only, Secure, and
          SameSite. It expires when you sign out or after the session token expires (~1 hour,
          auto-refreshed while you&apos;re active).
        </P>
        <P>
          Google Analytics sets its own cookies (prefixed <code style={{ color: S.accent }}>_ga</code>) to
          measure usage. No advertising cookies, and we do not sell or share your data for advertising.
        </P>

        {/* 7 */}
        <H2>7. Your Rights</H2>
        <UL items={[
          <>
            <strong style={{ color: S.text }}>Access:</strong> Your library and setlists are visible
            in the app at any time.
          </>,
          <>
            <strong style={{ color: S.text }}>Delete library:</strong> Use the &ldquo;Clear&rdquo; button
            in the Library tab to delete all imported tracks at any time.
          </>,
          <>
            <strong style={{ color: S.text }}>Delete account:</strong> Use the &ldquo;Delete Account&rdquo;
            button in the Account tab to permanently delete your account and all associated data —
            library, setlists, and Track ID history. You can also email{' '}
            <a href="mailto:kelcwu@gmail.com" style={{ color: S.accent, textDecoration: 'none' }}>
              kelcwu@gmail.com
            </a>{' '}
            and we will handle it within 7 days.
          </>,
          <>
            <strong style={{ color: S.text }}>Data portability:</strong> Your generated setlists
            can be exported as Serato .crate files. Contact us if you need a full data export.
          </>,
        ]} />

        {/* 8 */}
        <H2>8. Data Security</H2>
        <P>
          All data is stored in Supabase with Row-Level Security — database policies prevent any user
          from reading another user&apos;s data, even if they have valid credentials. Connections are
          encrypted in transit (TLS). Passwords are hashed by Supabase Auth (bcrypt).
        </P>
        <P>
          {BRAND.name} is a small indie project. While we follow reasonable security practices, no system
          is perfectly secure. Do not store sensitive personal information in setlist names or notes.
        </P>

        {/* 9 */}
        <H2>9. Children&apos;s Privacy</H2>
        <P>
          {BRAND.name} is for people 18 and older (see our{' '}
          <a href="/terms" style={{ color: S.accent, textDecoration: 'none' }}>Terms of Service</a>). We do not
          knowingly collect personal information from anyone under 18. If you believe a minor has provided us
          with personal data, contact us and we will delete it promptly.
        </P>

        {/* 10 */}
        <H2>10. Changes to This Policy</H2>
        <P>
          When we make material changes, we&apos;ll update the &ldquo;Last updated&rdquo; date at the top.
          Continued use of {BRAND.name} after changes means you accept the updated policy.
          For significant changes, we&apos;ll notify users by email if possible.
        </P>

        {/* 11 */}
        <H2>11. Contact</H2>
        <P>
          Questions, deletion requests, or anything else:{' '}
          <a href="mailto:kelcwu@gmail.com" style={{ color: S.accent, textDecoration: 'none' }}>
            kelcwu@gmail.com
          </a>
        </P>

        <div style={{ height: 1, background: S.border, margin: '48px 0 32px' }} />
        <P>
          <span style={{ color: S.textMuted }}>
            {BRAND.name} is operated by Kel Wu · {' '}
            <a href="mailto:kelcwu@gmail.com" style={{ color: S.textMuted, textDecoration: 'none' }}>
              kelcwu@gmail.com
            </a>
          </span>
        </P>
      </div>
    </div>
  );
}
