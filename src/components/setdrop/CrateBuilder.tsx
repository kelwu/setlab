'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { SD } from '@/lib/setdrop/constants';
import { GenreCombobox, PageHeader } from '@/components/setdrop/shared';
import { buildCrate, downloadCrate } from '@/lib/setdrop/serato-crate';
import {
  buildRekordboxXml,
  buildM3u,
  downloadRekordboxXml,
  downloadM3u,
} from '@/lib/setdrop/rekordbox-export';
import type { SetlistTrack, LibraryTrack } from '@/lib/agents/types';
import type { CrateTrack } from '@/lib/crates/types';
import { gateExport } from '@/lib/setdrop/export-gate';
import { trackEvent } from '@/lib/analytics';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SavedCrate {
  id: string;
  name: string;
  prompt: string;
  trackCount: number;
  tracks: CrateTrack[];
  createdAt: string;
}

interface ActiveCrate {
  id: string;
  name: string;
  prompt: string;
  tracks: CrateTrack[];
  moodNotes: string;
  createdAt: string;
}

// ─── Export helpers ──────────────────────────────────────────────────────────

function toSetlistTrack(t: CrateTrack, i: number): SetlistTrack {
  return {
    position: i + 1,
    artist: t.artist,
    title: t.title,
    bpm: t.bpm ?? 0,
    key: t.key ?? '',
    energyLevel: 5,
    whyThisTrack: '',
    transitionNotes: '',
    harmonicMixingNotes: '',
    isWishlistTrack: false,
  };
}

function toLibraryTrack(t: CrateTrack): LibraryTrack {
  return {
    id: t.id,
    artist: t.artist,
    title: t.title,
    bpm: t.bpm ?? 0,
    key: t.key ?? '',
    genre: t.genre ?? undefined,
    filePath: t.filePath ?? undefined,
    isWishlist: false,
  };
}

// ─── Reusable UI ─────────────────────────────────────────────────────────────

function Btn({
  children, onClick, disabled, small, variant = 'primary',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  variant?: 'primary' | 'ghost' | 'outline';
}) {
  const bg = variant === 'primary' ? (disabled ? '#2A2A2A' : SD.accent) : 'transparent';
  const color = variant === 'primary' ? (disabled ? SD.textMuted : '#000') : SD.textSec;
  const border = variant === 'outline' ? `1px solid ${SD.borderMid}` : 'none';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: SD.mono, fontSize: small ? SD.t11 : SD.t12,
        letterSpacing: 1.5, textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer',
        background: bg, color, border, borderRadius: SD.r2,
        padding: small ? '6px 12px' : '10px 20px',
        transition: 'background .15s, color .15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: SD.mono, fontSize: SD.t10, letterSpacing: 2,
      textTransform: 'uppercase', color: SD.textMuted, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

const PAGE_SIZE = 50;

// ─── Main component ──────────────────────────────────────────────────────────

export function CrateBuilder() {
  const [crateName, setCrateName] = useState('');
  const [genre, setGenre] = useState('');
  const [bpmMin, setBpmMin] = useState('');
  const [bpmMax, setBpmMax] = useState('');
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [excludeArtistInput, setExcludeArtistInput] = useState('');
  const [excludeArtists, setExcludeArtists] = useState<string[]>([]);
  const [cleanOnly, setCleanOnly] = useState(false);
  const [crateSize, setCrateSize] = useState<'auto' | 'custom' | 'all' | 25 | 50 | 100>('auto');
  const [customSize, setCustomSize] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [activeCrate, setActiveCrate] = useState<ActiveCrate | null>(null);
  const [savedCrates, setSavedCrates] = useState<SavedCrate[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [page, setPage] = useState(0);

  const loadCrates = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/crates');
      const json = await res.json() as { crates?: SavedCrate[] };
      setSavedCrates(json.crates ?? []);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadCrates(); }, [loadCrates]);

  const buildFinalPrompt = () => {
    const parts: string[] = [];
    if (genre) parts.push(genre);
    if (bpmMin && bpmMax) parts.push(`${bpmMin}-${bpmMax} BPM`);
    else if (bpmMin) parts.push(`above ${bpmMin} BPM`);
    else if (bpmMax) parts.push(`below ${bpmMax} BPM`);
    if (prompt.trim()) parts.push(prompt.trim());
    return parts.length ? parts.join(', ') : '';
  };

  const handleGenerate = async () => {
    if (!crateName.trim()) {
      setError('Give your crate a name — it becomes the crate name in Serato and the playlist name in Rekordbox.');
      return;
    }
    const finalPrompt = buildFinalPrompt();
    if (!finalPrompt) {
      setError('Add a genre, BPM range, or describe what you want.');
      return;
    }
    setGenerating(true);
    setError(null);
    setWarning(null);
    setPage(0);
    try {
      const body: Record<string, unknown> = { prompt: finalPrompt };
      if (crateName.trim()) body.name = crateName.trim();
      if (genre) body.genre = genre;
      if (bpmMin) body.bpmMin = Number(bpmMin);
      if (bpmMax) body.bpmMax = Number(bpmMax);
      if (yearMin) body.yearMin = Number(yearMin);
      if (yearMax) body.yearMax = Number(yearMax);
      if (excludeArtists.length) body.excludeArtists = excludeArtists;
      if (cleanOnly) body.cleanOnly = true;
      // Size: 'auto' omits targetCount (server reads the prompt / picks a default);
      // 'all' sends 0 (no cap); a preset or custom number sends that count.
      if (crateSize === 'all') body.targetCount = 0;
      else if (crateSize === 'custom') {
        const n = parseInt(customSize, 10);
        if (n > 0) body.targetCount = n;
      } else if (typeof crateSize === 'number') body.targetCount = crateSize;

      const res = await fetch('/api/crates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { crate?: ActiveCrate; error?: string; tier?: string; limit?: number; warning?: string };
      if (res.status === 429) {
        setError(
          json.error === 'cost_limit'
            ? "You've hit today's usage limit — it resets tomorrow. Upgrade to Pro for no daily limits."
            : `You've hit today's generation limit${json.limit ? ` (${json.limit}/day)` : ''} — it resets tomorrow. Upgrade to Pro for no daily limits.`
        );
        return;
      }
      if (!res.ok || !json.crate) {
        setError(json.error ?? 'Generation failed');
        return;
      }
      setActiveCrate(json.crate);
      setWarning(json.warning ?? null);
      trackEvent.crateGenerated(json.crate.tracks.length);
      await loadCrates();
    } catch {
      setError('Network error — check your connection');
    } finally {
      setGenerating(false);
    }
  };

  const handleLoadSaved = (c: SavedCrate) => {
    setActiveCrate({
      id: c.id,
      name: c.name,
      prompt: c.prompt,
      tracks: c.tracks,
      moodNotes: '',
      createdAt: c.createdAt,
    });
    setWarning(null);
    setPage(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/crates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (activeCrate?.id === id) setActiveCrate(null);
    await loadCrates();
  };

  // Export handlers — gate against the monthly export limit before downloading.
  const handleExportSerato = async () => {
    if (!activeCrate) return;
    const paths = activeCrate.tracks.map(t => t.filePath).filter((p): p is string => Boolean(p));
    if (!paths.length) { setError('No file paths available — library may need re-sync'); return; }
    const gate = await gateExport('crate', activeCrate.id, 'serato-crate');
    if (!gate.ok) { setError(gate.message ?? 'Export limit reached'); return; }
    const data = buildCrate(paths);
    downloadCrate(data, activeCrate.name);
  };

  const handleExportRekordbox = async () => {
    if (!activeCrate) return;
    const setlist = activeCrate.tracks.map(toSetlistTrack);
    const library = activeCrate.tracks.map(toLibraryTrack);
    const { xml, matched } = buildRekordboxXml(activeCrate.name, setlist, library);
    if (!matched) { setError('No file paths — library may need re-sync'); return; }
    const gate = await gateExport('crate', activeCrate.id, 'rekordbox-xml');
    if (!gate.ok) { setError(gate.message ?? 'Export limit reached'); return; }
    downloadRekordboxXml(xml, activeCrate.name);
  };

  const handleExportM3u = async () => {
    if (!activeCrate) return;
    const setlist = activeCrate.tracks.map(toSetlistTrack);
    const library = activeCrate.tracks.map(toLibraryTrack);
    const { m3u, matched } = buildM3u(activeCrate.name, setlist, library);
    if (!matched) { setError('No file paths — library may need re-sync'); return; }
    const gate = await gateExport('crate', activeCrate.id, 'm3u');
    if (!gate.ok) { setError(gate.message ?? 'Export limit reached'); return; }
    downloadM3u(m3u, activeCrate.name);
  };

  // Pagination
  const tracks = activeCrate?.tracks ?? [];
  const totalPages = Math.ceil(tracks.length / PAGE_SIZE);
  const pageTracks = tracks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px' }}>

      {/* Header */}
      <PageHeader
        eyebrow="Themed Crate · a supporting tool"
        title="CRATE BUILDER"
        subtitle="The record bag you dig from — a reusable bin of tracks by vibe you prep now and pull from later (including as a source when you plan a set). Describe the crate you want; AI scans your whole library and curates to the size you choose."
      />

      {/* Generator form */}
      <div style={{
        background: SD.surface, border: `1px solid ${SD.border}`,
        borderRadius: SD.r3, padding: 28, marginBottom: 32,
      }}>
        {/* Crate name */}
        <div style={{ marginBottom: 16 }}>
          <Label>Crate Name *</Label>
          <input
            type="text"
            value={crateName}
            onChange={e => setCrateName(e.target.value)}
            placeholder="e.g. 'Friday Peak', 'Summer Afrobeats', 'Tech House Toolkit'…"
            style={{
              width: '100%', background: SD.surface2,
              border: `1px solid ${!crateName.trim() && error ? SD.danger : SD.border}`,
              borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
              fontSize: SD.t12, padding: '8px 12px', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontFamily: SD.mono, fontSize: SD.t10, color: SD.textMuted, marginTop: 5 }}>
            Used as the crate name in Serato and the playlist name in Rekordbox.
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: 16, alignItems: 'end',
          flexWrap: 'wrap',
        }}>
          {/* Genre */}
          <div>
            <Label>Genre (optional)</Label>
            <GenreCombobox value={genre} onChange={setGenre} placeholder="Any genre…" />
          </div>

          {/* BPM min */}
          <div style={{ width: 100 }}>
            <Label>BPM Min</Label>
            <input
              type="number"
              value={bpmMin}
              onChange={e => setBpmMin(e.target.value)}
              placeholder="60"
              style={{
                width: '100%', background: SD.surface2, border: `1px solid ${SD.border}`,
                borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
                fontSize: SD.t12, padding: '8px 10px', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* BPM max */}
          <div style={{ width: 100 }}>
            <Label>BPM Max</Label>
            <input
              type="number"
              value={bpmMax}
              onChange={e => setBpmMax(e.target.value)}
              placeholder="180"
              style={{
                width: '100%', background: SD.surface2, border: `1px solid ${SD.border}`,
                borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
                fontSize: SD.t12, padding: '8px 10px', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Year range + Clean toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '100px 100px 1fr auto', gap: 16, alignItems: 'end', marginTop: 16 }}>
          <div>
            <Label>Year From</Label>
            <input
              type="number"
              value={yearMin}
              onChange={e => setYearMin(e.target.value)}
              placeholder="1990"
              style={{
                width: '100%', background: SD.surface2, border: `1px solid ${SD.border}`,
                borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
                fontSize: SD.t12, padding: '8px 10px', boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <Label>Year To</Label>
            <input
              type="number"
              value={yearMax}
              onChange={e => setYearMax(e.target.value)}
              placeholder="2025"
              style={{
                width: '100%', background: SD.surface2, border: `1px solid ${SD.border}`,
                borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
                fontSize: SD.t12, padding: '8px 10px', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Exclude artists */}
          <div>
            <Label>Exclude Artists</Label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {excludeArtists.map(a => (
                <span key={a} style={{
                  fontFamily: SD.mono, fontSize: SD.t10, letterSpacing: 1,
                  background: SD.surface3, border: `1px solid ${SD.borderMid}`,
                  borderRadius: SD.r1, padding: '3px 8px', color: SD.textSec,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {a}
                  <button onClick={() => setExcludeArtists(prev => prev.filter(x => x !== a))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: SD.textMuted, padding: 0, lineHeight: 1 }}>
                    ✕
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={excludeArtistInput}
                onChange={e => setExcludeArtistInput(e.target.value)}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ',') && excludeArtistInput.trim()) {
                    e.preventDefault();
                    const name = excludeArtistInput.trim().replace(/,$/, '');
                    if (name && !excludeArtists.includes(name)) {
                      setExcludeArtists(prev => [...prev, name]);
                    }
                    setExcludeArtistInput('');
                  }
                }}
                placeholder="Type artist, press Enter…"
                style={{
                  flex: 1, minWidth: 160, background: SD.surface2, border: `1px solid ${SD.border}`,
                  borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
                  fontSize: SD.t12, padding: '8px 10px',
                }}
              />
            </div>
          </div>

          {/* Clean only toggle */}
          <div style={{ paddingBottom: 2 }}>
            <Label>Clean Only</Label>
            <button
              onClick={() => setCleanOnly(v => !v)}
              style={{
                fontFamily: SD.mono, fontSize: SD.t11, letterSpacing: 1.5,
                textTransform: 'uppercase', cursor: 'pointer',
                background: cleanOnly ? SD.accentDim : SD.surface2,
                color: cleanOnly ? SD.accent : SD.textMuted,
                border: `1px solid ${cleanOnly ? SD.accent + '66' : SD.border}`,
                borderRadius: SD.r2, padding: '8px 14px', whiteSpace: 'nowrap',
                transition: 'all .15s',
              }}
            >
              {cleanOnly ? '✓ Clean' : 'Any'}
            </button>
          </div>
        </div>

        {/* Crate size */}
        <div style={{ marginTop: 16 }}>
          <Label>Crate Size</Label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['auto', 25, 50, 100, 'custom', 'all'] as const).map(opt => {
              const active = crateSize === opt;
              const label = opt === 'auto' ? 'Auto'
                : opt === 'custom' ? 'Custom'
                : opt === 'all' ? 'All matches'
                : String(opt);
              return (
                <button
                  key={String(opt)}
                  onClick={() => setCrateSize(opt)}
                  style={{
                    fontFamily: SD.mono, fontSize: SD.t11, letterSpacing: 1.5,
                    textTransform: 'uppercase', cursor: 'pointer',
                    background: active ? SD.accentDim : SD.surface2,
                    color: active ? SD.accent : SD.textMuted,
                    border: `1px solid ${active ? SD.accent + '66' : SD.border}`,
                    borderRadius: SD.r2, padding: '8px 16px', whiteSpace: 'nowrap',
                    transition: 'all .15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
            {crateSize === 'custom' && (
              <input
                type="number"
                min={1}
                value={customSize}
                onChange={e => setCustomSize(e.target.value)}
                placeholder="e.g. 32"
                style={{
                  width: 90, background: SD.surface2, border: `1px solid ${SD.border}`,
                  borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
                  fontSize: SD.t12, padding: '8px 10px', boxSizing: 'border-box',
                }}
              />
            )}
          </div>
          <div style={{ fontFamily: SD.mono, fontSize: SD.t10, color: SD.textMuted, marginTop: 5 }}>
            Pick a size and we&rsquo;ll fill it — if exact-genre matches fall short, we top up from the wider genre family and tell you the split. Auto reads a count from your prompt (e.g. &ldquo;30-track warmup&rdquo;) or picks a sensible size; larger sets sample evenly across the BPM range.
          </div>
        </div>

        {/* Prompt */}
        <div style={{ marginTop: 16 }}>
          <Label>Additional context (optional)</Label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. 'peak hour 2am', 'wedding cocktail hour', 'warmup melodic vibes', 'anything from 2018-2022'…"
            rows={2}
            style={{
              width: '100%', background: SD.surface2, border: `1px solid ${SD.border}`,
              borderRadius: SD.r2, color: SD.text, fontFamily: SD.mono,
              fontSize: SD.t12, padding: '10px 12px', resize: 'vertical',
              boxSizing: 'border-box', lineHeight: 1.6,
            }}
          />
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: error.includes('Upgrade') ? SD.accentDim : SD.dangerDim,
            border: `1px solid ${error.includes('Upgrade') ? SD.accent + '44' : SD.danger + '44'}`,
            borderRadius: SD.r2,
            fontFamily: SD.mono, fontSize: SD.t11,
            color: error.includes('Upgrade') ? SD.accent : SD.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }}>
            <span>{error}</span>
            {error.includes('Upgrade') && (
              <a href="/account" style={{
                fontFamily: SD.mono, fontSize: SD.t11, letterSpacing: 1.5,
                textTransform: 'uppercase', color: SD.accent,
                textDecoration: 'none', whiteSpace: 'nowrap',
                border: `1px solid ${SD.accent}66`, borderRadius: SD.r1, padding: '3px 8px',
              }}>
                Go Pro →
              </a>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <Btn onClick={handleGenerate} disabled={generating}>
            {generating ? 'Building…' : 'Build Crate'}
          </Btn>
          {generating && (
            <span style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.textMuted }}>
              Scanning your library…
            </span>
          )}
        </div>
      </div>

      {/* Active crate results */}
      {activeCrate && (
        <div style={{ marginBottom: 48 }}>
          {/* Crate header */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16, marginBottom: 20,
          }}>
            <div>
              <div style={{
                fontFamily: SD.mono, fontSize: SD.t20, letterSpacing: 2,
                color: SD.text, textTransform: 'uppercase', marginBottom: 4,
              }}>
                {activeCrate.name}
              </div>
              <div style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.textMuted }}>
                {tracks.length} tracks
                {activeCrate.moodNotes && ` · ${activeCrate.moodNotes}`}
              </div>
            </div>

            {/* Export buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Btn small variant="outline" onClick={handleExportSerato}>
                  ↓ Serato .crate
                </Btn>
                <Btn small variant="outline" onClick={handleExportRekordbox}>
                  ↓ Rekordbox XML
                </Btn>
                <Btn small variant="outline" onClick={handleExportM3u}>
                  ↓ M3U
                </Btn>
              </div>
              <div style={{
                fontFamily: SD.mono, fontSize: SD.t10, color: SD.textMuted,
                textAlign: 'right', lineHeight: 1.6,
              }}>
                Serato: drop .crate into Music/_Serato_/Subcrates/
                <br />
                Rekordbox: File → Import → rekordbox xml / m3u playlist
              </div>
            </div>
          </div>

          {/* Thin-match warning */}
          {warning && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: SD.accentDim, border: `1px solid ${SD.accent}44`,
              borderRadius: SD.r2, fontFamily: SD.mono, fontSize: SD.t11, color: SD.accent,
            }}>
              {warning}
            </div>
          )}

          {/* Track bin — a grid of record-tiles, not a spreadsheet. A crate is an
              unordered bin you pull from; the multi-column tile grid + vinyl badge
              reads as "a bag of records", distinct from the setlist's ordered list. */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {pageTracks.map((t, i) => {
              const meta = [
                t.bpm ? `${Math.round(t.bpm)} BPM` : null,
                t.key || null,
                t.year ? String(t.year) : null,
              ].filter(Boolean).join(' · ');
              return (
                <div
                  key={t.id}
                  style={{
                    background: SD.surface, border: `1px solid ${SD.border}`,
                    borderRadius: SD.r3, padding: '12px 14px',
                    display: 'flex', gap: 12, alignItems: 'center', minWidth: 0,
                  }}
                >
                  {/* vinyl badge */}
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: SD.surface3, border: `1px solid ${SD.borderMid}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: SD.mono, fontSize: SD.t11, color: SD.textSec, position: 'relative',
                  }}>
                    <span style={{ position: 'absolute', width: 6, height: 6, borderRadius: '50%', background: SD.accent, opacity: 0.5 }} />
                    <span style={{ position: 'relative' }}>{page * PAGE_SIZE + i + 1}</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontFamily: SD.mono, fontSize: SD.t12, color: SD.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </div>
                    <div style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {t.artist}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: SD.mono, fontSize: SD.t10, color: SD.textMuted, letterSpacing: 0.5 }}>
                        {meta || '—'}
                      </span>
                      {t.genre && (
                        <span style={{
                          fontFamily: SD.mono, fontSize: SD.t10, color: SD.textSec,
                          background: SD.surface2, border: `1px solid ${SD.border}`, borderRadius: SD.r2,
                          padding: '1px 6px', overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', maxWidth: 120,
                        }}>
                          {t.genre}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              justifyContent: 'center', marginTop: 16,
            }}>
              <Btn small variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                ← Prev
              </Btn>
              <span style={{ fontFamily: SD.mono, fontSize: SD.t11, color: SD.textMuted }}>
                {page + 1} / {totalPages}
              </span>
              <Btn small variant="outline" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>
                Next →
              </Btn>
            </div>
          )}
        </div>
      )}

      {/* Saved crates history */}
      <div>
        <div style={{
          fontFamily: SD.mono, fontSize: SD.t13, letterSpacing: 2,
          textTransform: 'uppercase', color: SD.text, marginBottom: 16,
          paddingBottom: 12, borderBottom: `1px solid ${SD.border}`,
        }}>
          Saved Crates
        </div>

        {listLoading ? (
          <div style={{ fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted, padding: '16px 0' }}>
            Loading…
          </div>
        ) : savedCrates.length === 0 ? (
          <div style={{ fontFamily: SD.mono, fontSize: SD.t12, color: SD.textMuted, padding: '16px 0' }}>
            No saved crates yet. Build one above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {savedCrates.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', background: SD.surface,
                  border: `1px solid ${activeCrate?.id === c.id ? SD.accent + '66' : SD.border}`,
                  borderRadius: SD.r2, gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: SD.mono, fontSize: SD.t12, color: SD.text,
                    textTransform: 'uppercase', letterSpacing: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.name}
                  </div>
                  <div style={{ fontFamily: SD.mono, fontSize: SD.t10, color: SD.textMuted, marginTop: 2 }}>
                    {c.trackCount} tracks · {c.prompt}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <Btn small variant="outline" onClick={() => handleLoadSaved(c)}>
                    Load
                  </Btn>
                  <button
                    onClick={() => handleDelete(c.id)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: SD.textMuted, fontFamily: SD.mono, fontSize: SD.t12,
                      padding: '4px 8px', borderRadius: SD.r1,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
