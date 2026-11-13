'use client';

// "Include hot cues" for SetLab's Rekordbox XML exports (sets and crates).
// Cues come from the DJ's last /convert scan (track_cues). Carrying them in
// exports is a Pro feature; /api/cues/lookup enforces that server-side, and
// this toggle shows free users what they'd get. Failing to fetch cues never
// blocks an export — it just goes out without them.

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { SD } from '@/lib/setdrop/constants';
import type { LibraryTrack } from '@/lib/agents/types';
import type { ExportCue } from '@/lib/cues/lookup';
import { trackEvent } from '@/lib/analytics';

interface CueSummary { tracksWithCues: number; pro: boolean; source: string | null }

const PREF_KEY = 'sd_export_cues';

export interface CueExportState {
  summary: CueSummary | null;
  include: boolean;
  setInclude: (v: boolean) => void;
  /** Cues keyed by library file path, or undefined when the export goes without. */
  lookup: (tracks: LibraryTrack[]) => Promise<Map<string, ExportCue> | undefined>;
}

export function useCueExport(): CueExportState {
  const [summary, setSummary] = useState<CueSummary | null>(null);
  const [include, setIncludeState] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch('/api/cues/summary')
      .then(r => (r.ok ? r.json() : null))
      .then((j: CueSummary | null) => {
        if (!alive || !j) return;
        try { if (localStorage.getItem(PREF_KEY) === '0') setIncludeState(false); } catch { /* storage blocked */ }
        setSummary(j);
      })
      .catch(() => { /* toggle just stays hidden */ });
    return () => { alive = false; };
  }, []);

  const setInclude = useCallback((v: boolean) => {
    setIncludeState(v);
    try { localStorage.setItem(PREF_KEY, v ? '1' : '0'); } catch { /* storage blocked */ }
  }, []);

  const active = !!summary?.pro && summary.tracksWithCues > 0 && include;

  const lookup = useCallback(async (tracks: LibraryTrack[]) => {
    if (!active || !tracks.length) return undefined;
    try {
      const res = await fetch('/api/cues/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracks: tracks.map(t => ({ filePath: t.filePath ?? '', artist: t.artist, title: t.title })),
        }),
      });
      if (!res.ok) return undefined;
      const j = await res.json() as { pro?: boolean; results?: (ExportCue | null)[] };
      if (!j.pro || !j.results) return undefined;
      const map = new Map<string, ExportCue>();
      j.results.forEach((c, i) => { const p = tracks[i]?.filePath; if (c && p) map.set(p, c); });
      return map;
    } catch {
      return undefined;
    }
  }, [active]);

  return { summary, include, setInclude, lookup };
}

function Switch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', padding: 2, flexShrink: 0,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
        background: on ? SD.accent : SD.surface2, transition: 'background .15s',
      }}>
      <span style={{
        display: 'block', width: 16, height: 16, borderRadius: '50%',
        background: on ? '#000' : SD.textMuted,
        transform: on ? 'translateX(16px)' : 'translateX(0)', transition: 'transform .15s',
      }} />
    </button>
  );
}

export function CueExportToggle({ state, source }: { state: CueExportState; source: 'setlist' | 'crate' }) {
  const { summary, include, setInclude } = state;
  if (!summary) return null;

  if (summary.tracksWithCues === 0) {
    // Only Serato libraries can be read by the converter today.
    if (summary.source !== 'serato') return null;
    return (
      <div style={{ marginBottom: 16, fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted }}>
        Moving to Rekordbox? Your Serato hot cues can travel with the XML export.{' '}
        <Link href="/convert" style={{ color: SD.accent, textDecoration: 'none' }}>
          Read them with the free converter →
        </Link>
      </div>
    );
  }

  const n = summary.tracksWithCues.toLocaleString();
  return (
    <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Switch
        on={summary.pro && include}
        disabled={!summary.pro}
        onClick={() => setInclude(!include)}
        label="Include hot cues in the Rekordbox XML export"
      />
      <span style={{ fontFamily: SD.mono, fontSize: 13, color: summary.pro && include ? SD.text : SD.textSec }}>
        Include hot cues in XML
      </span>
      {!summary.pro && (
        <span style={{
          fontFamily: SD.mono, fontSize: SD.t10, letterSpacing: 1.5, color: SD.accent,
          border: `1px solid ${SD.accent}66`, borderRadius: SD.r1, padding: '1px 6px',
        }}>PRO</span>
      )}
      <span style={{ fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted }}>
        ({n} track{summary.tracksWithCues === 1 ? '' : 's'} with cues from your Serato scan)
      </span>
      {!summary.pro && (
        <a href="/account" onClick={() => trackEvent.upgradeClicked(`cue_export_${source}`)}
          style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.accent, textDecoration: 'none' }}>
          Go Pro →
        </a>
      )}
    </div>
  );
}
