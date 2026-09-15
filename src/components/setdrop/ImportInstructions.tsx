'use client';

import React from 'react';
import { SD } from '@/lib/setdrop/constants';

// A persistent, dismissible "how to import" panel shown right after a set/crate
// export. Serato .crate files and Rekordbox XML/M3U are useless to a DJ who
// doesn't know where the file goes — the download itself gives no cue. This turns
// the moment of extraction into a clear, platform-specific set of steps. Shared by
// SetlistOutput and CrateBuilder so both stay in sync. Steps verified against the
// Serato + Rekordbox 7 docs (Sept 2026).
export type ImportPlatform = 'serato' | 'rekordbox-xml' | 'rekordbox-m3u';

// Inline monospace chip for file paths and menu trails, so they stand out from prose.
function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: SD.mono, fontSize: SD.t11, color: SD.text,
      background: SD.surface2, border: `1px solid ${SD.borderMid}`,
      borderRadius: SD.r1, padding: '1px 6px', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

interface Ctx { name: string; kind: 'set' | 'crate'; }

const GUIDES: Record<ImportPlatform, { label: string; steps: (c: Ctx) => React.ReactNode[] }> = {
  serato: {
    label: 'Serato DJ',
    steps: ({ kind }) => [
      <>Open your <strong>Music</strong> folder, then <Mono>_Serato_</Mono> → <Mono>Subcrates</Mono>.<br />
        <span style={{ color: SD.textMuted }}>
          Mac <Mono>~/Music/_Serato_/Subcrates/</Mono> · Windows <Mono>C:\Users\you\Music\_Serato_\Subcrates\</Mono>
        </span></>,
      <>Move the downloaded <strong>.crate</strong> file into that <strong>Subcrates</strong> folder — keep the filename as-is.</>,
      <>Restart <strong>Serato DJ</strong>. Your {kind} appears as a crate in the left panel, with BPM, key, artist and genre filled in.</>,
    ],
  },
  'rekordbox-xml': {
    label: 'rekordbox (XML — full detail)',
    steps: ({ name }) => [
      <>In rekordbox, open <Mono>Preferences → View → Layout</Mono> and tick <strong>rekordbox xml</strong>.</>,
      <>Go to <Mono>Preferences → Advanced → Database</Mono> → under <strong>Imported Library (rekordbox xml)</strong> click <strong>Browse</strong> and pick the downloaded <strong>.xml</strong>.</>,
      <>Click <strong>rekordbox xml</strong> in the left tree, open <strong>Playlists</strong>, and find “{name}”.</>,
      <>Right-click it → <strong>Import Playlist</strong> to copy it into your collection (with BPM, key and genre).</>,
    ],
  },
  'rekordbox-m3u': {
    label: 'rekordbox (M3U — quick)',
    steps: () => [
      <>In rekordbox, open <Mono>File → Import → Import Playlist</Mono>.</>,
      <>Select the downloaded <strong>.m3u</strong> file — it imports as a playlist.</>,
      <span style={{ color: SD.textMuted }}>
        M3U carries the track order only. For BPM, key and genre, use the <strong>XML</strong> export instead.
      </span>,
    ],
  },
};

export function ImportInstructions({
  platform, name, matched, total, kind = 'set', onDismiss,
}: {
  platform: ImportPlatform;
  name: string;
  matched?: number;
  total?: number;
  kind?: 'set' | 'crate';
  onDismiss: () => void;
}) {
  const g = GUIDES[platform];
  const steps = g.steps({ name, kind });
  const hasCounts = typeof matched === 'number' && typeof total === 'number';

  return (
    <div style={{
      marginBottom: 20, position: 'relative',
      background: SD.surface, border: `1px solid ${SD.borderMid}`,
      borderTop: `2px solid ${SD.accent}`, borderRadius: SD.r3,
      padding: '16px 18px 18px',
    }}>
      <button
        onClick={onDismiss} aria-label="Dismiss import instructions"
        style={{
          position: 'absolute', right: 12, top: 10, background: 'none', border: 'none',
          cursor: 'pointer', color: SD.textMuted, fontSize: 16, lineHeight: 1, padding: 4,
        }}
      >
        ✕
      </button>

      {/* Download confirmation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 24 }}>
        <span style={{ color: SD.green, fontSize: SD.t14 }}>✓</span>
        <span style={{ fontFamily: SD.mono, fontSize: SD.t13, color: SD.text }}>
          Downloaded “{name}”{hasCounts ? ` — ${matched}/${total} tracks` : ''}
        </span>
      </div>

      {/* Eyebrow */}
      <div style={{
        fontFamily: SD.mono, fontSize: SD.t10, letterSpacing: 2, textTransform: 'uppercase',
        color: SD.accent, margin: '12px 0',
      }}>
        How to import into {g.label}
      </div>

      {/* Steps */}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((step, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{
              flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
              background: SD.accentDim, border: `1px solid ${SD.accent}44`,
              color: SD.accent, fontFamily: SD.mono, fontSize: SD.t10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1,
            }}>
              {i + 1}
            </span>
            <span style={{ fontFamily: SD.body, fontSize: SD.t12, color: SD.textSec, lineHeight: 1.6 }}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
