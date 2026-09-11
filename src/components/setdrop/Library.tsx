'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand';
import { SD, LIBRARY_TRACKS, SampleTrack, ConfidenceStatus } from '@/lib/setdrop/constants';
import { trackEvent, type LibraryUploadFailReason } from '@/lib/analytics';
import { LibraryTrack, SetlistTrack } from '@/lib/agents/types';
import { parseRekordboxLibrary, type RekordboxPlaylist } from '@/lib/setdrop/rekordbox-parser';
import { buildCrate, downloadCrate } from '@/lib/setdrop/serato-crate';
import { buildRekordboxXml, buildM3u, downloadRekordboxXml, downloadM3u } from '@/lib/setdrop/rekordbox-export';
import { SDButton, SDInput, ConfidenceBadge, EnergyDot, Tabs } from './shared';

// ─── Crate types ──────────────────────────────────────────────────────────────

interface CrateTrack {
  id: string;
  artist: string;
  title: string;
  bpm: number | null;
  key: string | null;
  genre: string | null;
  filePath: string | null;
}

interface CrateEntry {
  id: string;
  name: string;
  prompt: string;
  trackCount: number;
  createdAt: string;
}

interface ActiveCrate extends CrateEntry {
  tracks: CrateTrack[];
  moodNotes: string;
}


function toDisplayTrack(t: LibraryTrack, idx: number): SampleTrack {
  return {
    pos: idx + 1,
    artist: t.artist,
    title: t.title,
    bpm: t.bpm,
    key: t.key || '—',
    energy: t.seratoEnergy ?? 5,
    wishlist: t.isWishlist,
    wordplay: null,
    why: '',
    transition: '',
    stores: { beatport: 'yellow', bpmSupreme: 'yellow', traxsource: 'yellow', djcity: 'yellow' },
    genre: t.genre,
  };
}

// ─── Store URL Builder ───────────────────────────────────────────────────────

function buildStoreUrls(artist: string, title: string) {
  const q = encodeURIComponent(`${artist} ${title}`);
  return {
    beatport_search_url: `https://www.beatport.com/search/tracks?q=${q}`,
    bpm_supreme_search_url: `https://www.bpmsupreme.com/search?q=${q}`,
    traxsource_search_url: `https://www.traxsource.com/search?term=${q}`,
    djcity_search_url: `https://www.djcity.com/search?q=${q}`,
  };
}

// ─── Library Row ─────────────────────────────────────────────────────────────

const LibraryRow = React.memo(function LibraryRow({ track, tab, idx, onDelete, tags }: {
  track: SampleTrack; tab: string; idx: number; onDelete?: () => void; tags?: string[];
}) {
  const [hov, setHov] = useState(false);
  const statusColor = track.wishlist
    ? { bg:SD.accentDim, border:`${SD.accent}44`, text:SD.accent, label:'Wishlist' }
    : { bg:SD.greenDim, border:`${SD.green}44`, text:SD.green, label:'In Library' };
  const cols = tab === 'wishlist' ? '32px 1fr 64px 48px 64px 1fr 80px' : '32px 1fr 64px 48px 64px 80px 80px';

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position:'relative',
        display:'grid', gridTemplateColumns:cols,
        gap:12, padding:'13px 16px',
        background: hov ? SD.surface : 'transparent',
        borderBottom:`1px solid ${SD.border}`,
        transition:'background .12s', alignItems:'center',
      }}>
      <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>
        {String(track.pos).padStart(2,'0')}
      </span>
      <div style={{ minWidth:0 }}>
        <div style={{ fontFamily:SD.mono, fontSize:14, fontWeight:600, color:SD.text,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{track.artist}</div>
        <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{track.title}</div>
        {hov && tags && tags.length > 0 && (
          <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
            {tags.slice(0, 5).map(tag => (
              <span key={tag} style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:.5,
                color:SD.textMuted, background:SD.surface2,
                border:`1px solid ${SD.border}`, borderRadius:2,
                padding:'1px 5px', textTransform:'lowercase' }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
      <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.accent }}>{track.bpm || '—'}</span>
      <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec }}>{track.key}</span>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <EnergyDot energy={track.energy} size={7} />
        <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>{track.energy}</span>
      </div>
      {tab === 'wishlist' ? (
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {(Object.entries(track.stores) as [string, ConfidenceStatus][]).slice(0, 3).map(([s, v]) => (
            <ConfidenceBadge key={s} status={v}
              label={s==='bpmSupreme'?'BPM':s[0].toUpperCase()+s.slice(1)} />
          ))}
        </div>
      ) : (
        <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>
          {`Mar ${(idx % 28) + 1} 2026`}
        </span>
      )}
      {tab === 'wishlist' ? (
        <span style={{ fontFamily:SD.mono, fontSize:13, letterSpacing:.5, textTransform:'uppercase',
          padding:'3px 8px', borderRadius:2, background:statusColor.bg,
          border:`1px solid ${statusColor.border}`, color:statusColor.text, whiteSpace:'nowrap' }}>
          {statusColor.label}
        </span>
      ) : (
        <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>
          {(idx * 7 + 3) % 40}
        </span>
      )}
      {onDelete && hov && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
            background:'transparent', border:'none', cursor:'pointer',
            fontFamily:SD.mono, fontSize:14, color:SD.textMuted, lineHeight:1,
            padding:'4px 6px', borderRadius:2,
          }}
          title="Remove from wishlist"
        >✕</button>
      )}
    </div>
  );
});

// ─── Upload Zone ─────────────────────────────────────────────────────────────

type UploadMode = 'db' | 'rekordbox';

// Carries which import throw site failed so the caller can log a precise,
// low-cardinality funnel reason instead of one generic bucket.
class ImportError extends Error {
  constructor(public reason: LibraryUploadFailReason, message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const SERATO_BLUE = '#1F6BFF';
const SERATO_BLUE_DIM = 'rgba(31,107,255,0.10)';
const SERATO_BLUE_BORDER = 'rgba(31,107,255,0.35)';

function UploadZone({
  onFile, dragOver, setDragOver, parseError, uploadMode, setUploadMode,
}: {
  onFile: (f: File) => void;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  parseError: string | null;
  uploadMode: UploadMode;
  setUploadMode: (m: UploadMode) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Detect OS to show the exact `_Serato_` folder path — the #1 import friction is
  // DJs not finding an extension-less file in a folder they've never opened. Set in
  // an effect (navigator is client-only) to avoid a hydration mismatch.
  const [os, setOs] = useState<'mac' | 'windows' | 'other'>('other');
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Mac/i.test(ua)) setOs('mac');
    else if (/Win/i.test(ua)) setOs('windows');
  }, []);
  const seratoPath = os === 'mac'
    ? '~/Music/_Serato_/'
    : os === 'windows'
      ? 'C:\\Users\\<you>\\Music\\_Serato_\\'
      : 'in your Music folder';

  // Fire once when the import screen appears — BEFORE the user picks a file — so
  // the funnel can measure the pre-file-pick drop (landed on import but never
  // selected a library file), the largest and previously-invisible leak.
  useEffect(() => {
    trackEvent.libraryImportViewed(uploadMode === 'db' ? 'serato' : 'rekordbox');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const accept = uploadMode === 'db' ? '*' : '.xml,application/xml,text/xml';
  const dropLabel = uploadMode === 'db' ? 'DROP DATABASE V2 HERE' : 'DROP REKORDBOX XML HERE';
  const helpLink = (
    <a
      href="/help/import"
      onClick={(e) => e.stopPropagation()}
      style={{ color: SD.accent, textDecoration: 'none', borderBottom: `1px solid ${SD.accent}55` }}
    >
      the step-by-step import guide →
    </a>
  );
  const instructions = uploadMode === 'db' ? (
    <>
      Open your <span style={{ color:SD.textSec }}>_Serato_</span> folder{' '}
      (<span style={{ color:SD.textSec }}>{seratoPath}</span>) and pick the{' '}
      <span style={{ color:SD.accent }}>database V2</span> file — it has <strong>no file extension</strong>.<br/>
      Drag it here, or click to browse.<br/>
      <span style={{ fontSize:12 }}>New to this? See {helpLink}</span>
    </>
  ) : (
    <>
      In Rekordbox, go to <span style={{ color:SD.textSec }}>File → Export Collection in xml format</span><br/>
      then drag the <span style={{ color:SD.accent }}>rekordbox.xml</span> file here, or click to browse.<br/>
      <span style={{ fontSize:12 }}>New to this? See {helpLink}</span>
    </>
  );

  return (
    <div style={{ marginBottom:28 }}>
      {/* Brand selector cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
        {/* Serato card */}
        <button
          onClick={() => setUploadMode('db')}
          style={{
            background: uploadMode === 'db' ? SERATO_BLUE_DIM : SD.surface2,
            border: uploadMode === 'db' ? `2px solid ${SERATO_BLUE}` : `2px solid ${SERATO_BLUE_BORDER}`,
            borderRadius:4, padding:'20px 16px', cursor:'pointer',
            textAlign:'center', transition:'all .15s',
          }}
          onMouseEnter={e => { if (uploadMode !== 'db') e.currentTarget.style.borderColor = SERATO_BLUE; }}
          onMouseLeave={e => { if (uploadMode !== 'db') e.currentTarget.style.borderColor = SERATO_BLUE_BORDER; }}
        >
          <div style={{
            fontFamily:SD.display, fontSize:22, letterSpacing:3,
            color: SERATO_BLUE, marginBottom:6,
          }}>SERATO</div>
          <div style={{ fontFamily:SD.mono, fontSize:13, letterSpacing:2, color: uploadMode === 'db' ? SERATO_BLUE : SD.textMuted }}>
            DB V2
          </div>
        </button>

        {/* Rekordbox card */}
        <button
          onClick={() => setUploadMode('rekordbox')}
          style={{
            background: uploadMode === 'rekordbox' ? 'rgba(255,255,255,0.05)' : SD.surface2,
            border: uploadMode === 'rekordbox' ? `2px solid ${SD.text}` : `2px solid ${SD.borderMid}`,
            borderRadius:4, padding:'20px 16px', cursor:'pointer',
            textAlign:'center', transition:'all .15s',
          }}
          onMouseEnter={e => { if (uploadMode !== 'rekordbox') e.currentTarget.style.borderColor = SD.textSec; }}
          onMouseLeave={e => { if (uploadMode !== 'rekordbox') e.currentTarget.style.borderColor = SD.borderMid; }}
        >
          <div style={{
            fontFamily:SD.display, fontSize:22, letterSpacing:3,
            color: uploadMode === 'rekordbox' ? SD.text : SD.textSec, marginBottom:6,
          }}>REKORDBOX</div>
          <div style={{ fontFamily:SD.mono, fontSize:13, letterSpacing:2, color: uploadMode === 'rekordbox' ? SD.textSec : SD.textMuted }}>
            XML
          </div>
        </button>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        style={{
          border:`2px dashed ${dragOver ? SD.accent : SD.borderMid}`,
          borderRadius:4, padding:'40px 32px', textAlign:'center', cursor:'pointer',
          background: dragOver ? SD.accentDim : SD.surface,
          transition:'all .15s',
        }}>
        <div style={{ fontFamily:SD.display, fontSize:32, letterSpacing:3,
          color: dragOver ? SD.accent : SD.textMuted, marginBottom:12 }}>
          {dropLabel}
        </div>
        <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted, marginBottom:16, lineHeight:1.9 }}>
          {instructions}
        </div>
        <SDButton ghost style={{ fontSize:12, padding:'8px 20px' }}>Choose File</SDButton>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          style={{ display:'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </div>
      {parseError && (
        <div style={{ marginTop:12, padding:'12px 16px', background:SD.dangerDim,
          border:`1px solid ${SD.danger}4D`, borderRadius:SD.r2,
          fontFamily:SD.mono, fontSize:13, color:SD.danger }}>
          {parseError}
        </div>
      )}
    </div>
  );
}

// ─── Stage Tracker ────────────────────────────────────────────────────────────

type UploadStage = 'idle' | 'parse' | 'save' | 'enrich' | 'done';

function StageSpinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14"
      style={{ animation: 'sdSpin 0.75s linear infinite', display: 'block', color: SD.accent }}>
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeDasharray="22 9" strokeLinecap="round"/>
    </svg>
  );
}

function StageTracker({ stage, parsedCount, uploadMode, syncStats }: {
  stage: Exclude<UploadStage, 'idle'>;
  parsedCount: number | null;
  uploadMode: UploadMode;
  syncStats: { added: number; removed: number; unchanged: number } | null;
}) {
  const stageOrder: UploadStage[] = ['parse', 'save', 'enrich', 'done'];
  const currentIdx = stageOrder.indexOf(stage);

  function status(id: UploadStage): 'pending' | 'active' | 'done' {
    const idx = stageOrder.indexOf(id);
    if (stage === 'done') return 'done';
    if (idx < currentIdx) return 'done';
    if (idx === currentIdx) return 'active';
    return 'pending';
  }

  const rows: { id: UploadStage; label: string; detail: () => string }[] = [
    {
      id: 'parse',
      label: 'PARSE',
      detail: () => {
        const s = status('parse');
        if (s === 'active') return uploadMode === 'db' ? 'Reading Database V2...' : 'Reading Rekordbox XML...';
        if (s === 'done' && parsedCount !== null) return `${parsedCount.toLocaleString()} tracks found`;
        return 'Complete';
      },
    },
    {
      id: 'save',
      label: 'SAVE',
      detail: () => {
        const s = status('save');
        if (s === 'pending') return 'Pending';
        if (s === 'active') return 'Syncing library...';
        if (s === 'done' && syncStats) {
          const parts = [];
          if (syncStats.added) parts.push(`${syncStats.added} new`);
          if (syncStats.removed) parts.push(`${syncStats.removed} removed`);
          if (syncStats.unchanged) parts.push(`${syncStats.unchanged} unchanged`);
          return parts.length ? parts.join(', ') : 'Saved to cloud';
        }
        return 'Saved to cloud';
      },
    },
    {
      id: 'enrich',
      label: 'ENRICH',
      detail: () => {
        const s = status('enrich');
        if (s === 'pending') return 'Pending';
        if (s === 'active') return 'Fetching Last.fm tags...';
        return 'Running in background';
      },
    },
  ];

  return (
    <div style={{
      marginBottom: 28, border: `1px solid ${SD.border}`, borderRadius: 4,
      background: SD.surface, overflow: 'hidden',
    }}>
      <div style={{
        padding: '24px 32px 20px',
        borderBottom: `1px solid ${SD.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontFamily: SD.mono, fontSize: 12, letterSpacing: 2, color: SD.textMuted,
            textTransform: 'uppercase', marginBottom: 6 }}>
            {uploadMode === 'db' ? 'Serato DB V2' : 'Rekordbox XML'}
          </div>
          <div style={{ fontFamily: SD.display, fontSize: 28, letterSpacing: 3, color: SD.text }}>
            {stage === 'done' ? 'IMPORT COMPLETE' : 'IMPORTING LIBRARY'}
          </div>
        </div>
        {stage === 'done' && (
          <div style={{ width: 40, height: 40, borderRadius: '50%',
            background: SD.greenDim, border: `1px solid ${SD.green}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SD.mono, fontSize: 18, color: SD.green }}>✓</div>
        )}
      </div>

      <div style={{ padding: '8px 0' }}>
        {rows.map((row, i) => {
          const s = status(row.id);
          const isLast = i === rows.length - 1;
          return (
            <div key={row.id} style={{
              display: 'grid', gridTemplateColumns: '48px 110px 1fr',
              alignItems: 'center', gap: 0,
              padding: '14px 32px',
              borderBottom: isLast ? 'none' : `1px solid ${SD.border}`,
              background: s === 'active' ? `rgba(245,166,35,0.04)` : 'transparent',
              transition: 'background .3s',
            }}>
              {/* Icon */}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {s === 'done' ? (
                  <span style={{ fontFamily: SD.mono, fontSize: 14, color: SD.green }}>✓</span>
                ) : s === 'active' ? (
                  <StageSpinner />
                ) : (
                  <span style={{ width: 6, height: 6, borderRadius: '50%',
                    background: SD.border, display: 'inline-block' }}/>
                )}
              </div>
              {/* Label */}
              <span style={{
                fontFamily: SD.display, fontSize: 16, letterSpacing: 2,
                color: s === 'pending' ? SD.textMuted : s === 'active' ? SD.accent : SD.text,
                transition: 'color .3s',
              }}>
                {row.label}
              </span>
              {/* Detail */}
              <span style={{
                fontFamily: SD.mono, fontSize: 12,
                color: s === 'pending' ? SD.textMuted : s === 'active' ? SD.textSec : SD.textSec,
                transition: 'color .3s',
              }}>
                {row.detail()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Library Screen ───────────────────────────────────────────────────────────


async function loadLibraryFromSupabase(): Promise<LibraryTrack[] | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const seratoTracks: LibraryTrack[] = [];

  const { data: library } = await supabase
    .from('serato_libraries')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (library) {
    // Paginate — PostgREST default cap is 1000 rows
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data: page } = await supabase
        .from('serato_tracks')
        .select('id, artist, title, bpm, key, genre, file_path, lastfm_tags')
        .eq('library_id', library.id)
        .eq('in_library', true)
        .order('artist')
        .range(offset, offset + PAGE - 1);
      if (!page?.length) break;
      seratoTracks.push(...page.map(t => ({
        id: t.id,
        artist: t.artist ?? '',
        title: t.title ?? '',
        bpm: t.bpm ?? 0,
        key: t.key ?? '',
        genre: t.genre ?? undefined,
        filePath: t.file_path ?? undefined,
        isWishlist: false,
        lastfmTags: t.lastfm_tags ?? [],
        enrichmentSource: 'serato' as const,
      })));
      if (page.length < PAGE) break;
      offset += PAGE;
    }
  }

  const { data: wishlistRows } = await supabase
    .from('wishlist_tracks')
    .select('id, artist, title, bpm, key, genre, beatport_search_url, bpm_supreme_search_url, traxsource_search_url, djcity_search_url, lastfm_tags')
    .eq('user_id', user.id)
    .eq('status', 'wishlist')
    .order('added_at', { ascending: false });

  const wishlistTracks: LibraryTrack[] = (wishlistRows ?? []).map(w => ({
    id: w.id,
    artist: w.artist ?? '',
    title: w.title ?? '',
    bpm: w.bpm ?? 0,
    key: w.key ?? '',
    genre: w.genre ?? undefined,
    isWishlist: true,
    lastfmTags: Array.isArray(w.lastfm_tags) ? (w.lastfm_tags as string[]) : [],
    enrichmentSource: 'manual' as const,
    beatportSearchUrl: w.beatport_search_url ?? undefined,
    bpmSupremeSearchUrl: w.bpm_supreme_search_url ?? undefined,
    traxsourceSearchUrl: w.traxsource_search_url ?? undefined,
    djcitySearchUrl: w.djcity_search_url ?? undefined,
  }));

  if (!seratoTracks.length && !wishlistTracks.length) return null;
  return [...seratoTracks, ...wishlistTracks];
}

export function Library() {
  const router = useRouter();
  const [tab, setTab] = useState('library');
  const [search, setSearch] = useState('');
  const [bpmMin, setBpmMin] = useState('');
  const [bpmMax, setBpmMax] = useState('');
  const [uploadedTracks, setUploadedTracks] = useState<LibraryTrack[] | null>(null);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [parsedCount, setParsedCount] = useState<number | null>(null);
  const [uploadMode, setUploadMode] = useState<UploadMode>('db');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addArtist, setAddArtist] = useState('');
  const [addTitle, setAddTitle] = useState('');
  const [addBpm, setAddBpm] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addGenre, setAddGenre] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [urlLookupLoading, setUrlLookupLoading] = useState(false);
  const [urlSource, setUrlSource] = useState<'beatport' | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [syncStats, setSyncStats] = useState<{ added: number; removed: number; unchanged: number } | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichingBpmKey, setEnrichingBpmKey] = useState(false);
  const [wordplayWord, setWordplayWord] = useState('');
  const [wordplayLoading, setWordplayLoading] = useState(false);
  const [wordplayResults, setWordplayResults] = useState<{
    matches: Array<{ trackId: string; artist: string; title: string; lyricContext: string; position: string }>;
    pairs: Array<{ fromId: string; fromArtist: string; fromTitle: string; fromBpm: number; toId: string; toArtist: string; toTitle: string; toBpm: number; bridge: string; bpmDiff: number; keysCompatible: boolean }>;
  } | null>(null);
  const [wordplayError, setWordplayError] = useState<string | null>(null);
  const [cratesList, setCratesList] = useState<CrateEntry[] | null>(null);
  const [cratesLoading, setCratesLoading] = useState(false);
  const [cratePrompt, setCratePrompt] = useState('');
  const [crateTargetCount, setCrateTargetCount] = useState(20);
  const [crateGenerating, setCrateGenerating] = useState(false);
  const [crateError, setCrateError] = useState<string | null>(null);
  const [activeCrate, setActiveCrate] = useState<ActiveCrate | null>(null);

  useEffect(() => {
    // Try Supabase first, fall back to localStorage
    loadLibraryFromSupabase().then(tracks => {
      if (tracks) {
        setUploadedTracks(tracks);
        localStorage.setItem('sd_library', JSON.stringify(tracks));
      } else {
        try {
          const raw = localStorage.getItem('sd_library');
          if (raw) setUploadedTracks(JSON.parse(raw));
        } catch { /* ignore corrupted data */ }
      }
    }).finally(() => setLibraryLoaded(true));
  }, []);

  const triggerEnrichment = () => {
    setEnriching(true);
    fetch('/api/library/enrich-lastfm', { method: 'POST' })
      .then(() => setEnriching(false))
      .catch(() => setEnriching(false));
  };

  const triggerBpmKeyEnrichment = async () => {
    setEnrichingBpmKey(true);
    try {
      await fetch('/api/library/enrich-bpm-key', { method: 'POST' });
      const tracks = await loadLibraryFromSupabase();
      if (tracks) { setUploadedTracks(tracks); localStorage.setItem('sd_library', JSON.stringify(tracks)); }
    } catch { /* non-fatal */ } finally {
      setEnrichingBpmKey(false);
    }
  };

  const finishUpload = () => {
    trackEvent.libraryUploaded(uploadMode === 'db' ? 'serato' : 'rekordbox');
    setUploadStage('enrich');
    fetch('/api/library/enrich-lastfm', { method: 'POST' }).catch(() => {});
    setTimeout(() => {
      setUploadStage('done');
      setTimeout(() => { setUploadStage('idle'); setShowUpload(false); }, 2000);
    }, 2000);
  };

  const handleFile = (file: File) => {
    setParseError(null);
    setParsedCount(null);
    const software = uploadMode === 'db' ? 'serato' : 'rekordbox';
    trackEvent.libraryUploadStarted(software);
    if (uploadMode === 'db') {
      setUploadStage('parse');
      // Upload file directly to Supabase Storage to bypass Vercel's 4.5MB function payload limit,
      // then pass only the storage path to parse-db for server-side processing.
      (async () => {
        // Step 1: get a signed upload token from the server
        const urlRes = await fetch('/api/library/upload-url', { method: 'POST' });
        if (!urlRes.ok) throw new ImportError('upload_init', `Upload init failed (HTTP ${urlRes.status})`);
        const { token, path: storagePath } = await urlRes.json() as { token: string; path: string };

        // Step 2: upload file directly to Supabase Storage (no Vercel function payload involved)
        const { error: uploadError } = await createClient().storage
          .from('library-uploads')
          .uploadToSignedUrl(storagePath, token, file, { contentType: 'application/octet-stream' });
        if (uploadError) throw new ImportError('storage_upload', `Storage upload failed: ${uploadError.message}`);

        // Step 3: parse + save server-side (returns only {count, stats} — no large JSON payload)
        return fetch('/api/library/parse-db', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath }),
        });
      })()
        .then(async res => {
          const body = await res.json().catch(() => ({})) as { error?: string };
          // parse-db does parse+save in one route, so a 500 here is attributed to
          // parse_throw (the dominant server failure — unsupported DB format).
          if (!res.ok) throw new ImportError('parse_throw', body.error ?? `Parse step failed (HTTP ${res.status})`);
          return body;
        })
        .then(async (data: { error?: string; count?: number; stats?: { added: number; removed: number; unchanged: number } }) => {
          if (data.error) throw new ImportError('parse_throw', `Parse error: ${data.error}`);
          // A "successful" parse that finds 0 tracks means the wrong file — surface
          // it as a real error instead of a silent empty library.
          if (!data.count) throw new ImportError('empty_parse', "We couldn't find any tracks in that file. Make sure you picked the Serato 'database V2' file (no extension) from your _Serato_ folder.");
          setParsedCount(data.count);
          setSyncStats(data.stats ?? { added: 0, removed: 0, unchanged: 0 });
          // Reload from Supabase for display — avoids storing a huge array in memory or localStorage
          setUploadStage('save');
          const loaded = await loadLibraryFromSupabase();
          if (loaded) setUploadedTracks(loaded);
          finishUpload();
        })
        .catch(err => {
          setUploadStage('idle');
          setParseError(err instanceof Error ? err.message : 'Failed to upload library');
          trackEvent.libraryUploadFailed('serato', err instanceof ImportError ? err.reason : 'parse_throw');
        });
    } else {
      setUploadStage('parse');
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          let tracks: LibraryTrack[];
          let playlists: RekordboxPlaylist[];
          try {
            ({ tracks, playlists } = parseRekordboxLibrary(text));
          } catch (parseErr) {
            throw new ImportError('parse_throw', parseErr instanceof Error ? parseErr.message : 'Failed to parse Rekordbox XML');
          }
          // 0 tracks means the wrong export — surface it instead of a silent empty save.
          if (!tracks.length) throw new ImportError('empty_parse', "We couldn't find any tracks in that XML. In Rekordbox, use File → Export Collection in xml format and pick that file.");
          setParsedCount(tracks.length);
          setUploadStage('save');

          // Upload tracks JSON to Supabase Storage to bypass Vercel 4.5MB payload limit
          const urlRes = await fetch('/api/library/upload-url', { method: 'POST' });
          if (!urlRes.ok) throw new ImportError('upload_init', `Upload init failed (HTTP ${urlRes.status})`);
          const { token, path: storagePath } = await urlRes.json() as { token: string; path: string };

          const jsonBlob = new Blob([JSON.stringify({ tracks, playlists })], { type: 'application/octet-stream' });
          const { error: uploadError } = await createClient().storage
            .from('library-uploads')
            .uploadToSignedUrl(storagePath, token, jsonBlob, { contentType: 'application/octet-stream' });
          if (uploadError) throw new ImportError('storage_upload', `Upload failed: ${uploadError.message}`);

          const res = await fetch('/api/library/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePath, source: 'rekordbox' }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({})) as { error?: string };
            throw new ImportError('save_error', err.error ?? `Library save failed (${res.status})`);
          }
          const data = await res.json() as { added?: number; removed?: number; unchanged?: number };
          setSyncStats({ added: data.added ?? 0, removed: data.removed ?? 0, unchanged: data.unchanged ?? 0 });

          const loaded = await loadLibraryFromSupabase();
          if (loaded) setUploadedTracks(loaded);
          finishUpload();
        } catch (err) {
          setUploadStage('idle');
          setParseError(err instanceof Error ? err.message : 'Failed to parse Rekordbox XML');
          trackEvent.libraryUploadFailed('rekordbox', err instanceof ImportError ? err.reason : 'parse_throw');
        }
      };
      reader.readAsText(file);
    }
  };

  const clearLibrary = async () => {
    localStorage.removeItem('sd_library');
    setUploadedTracks(null);
    setShowUpload(false);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: library } = await supabase
        .from('serato_libraries')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (library) {
        await supabase.from('serato_crates').delete().eq('library_id', library.id);
        await supabase.from('serato_tracks').delete().eq('library_id', library.id);
        await supabase.from('serato_libraries').delete().eq('id', library.id);
      }
    }
  };

  const handleUrlLookup = async (url: string) => {
    if (!url.includes('beatport.com/track/')) return;
    setUrlLookupLoading(true);
    setUrlSource(null);
    try {
      const res = await fetch('/api/wishlist/lookup-beatport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as { artist?: string; title?: string; bpm?: number; key?: string; genre?: string; error?: string };
      if (data.error || !data.artist) return;
      if (data.artist) setAddArtist(data.artist);
      if (data.title) setAddTitle(data.title);
      if (data.bpm) setAddBpm(String(data.bpm));
      if (data.key) setAddKey(data.key);
      if (data.genre) setAddGenre(data.genre);
      setUrlSource('beatport');
    } catch { /* ignore */ } finally {
      setUrlLookupLoading(false);
    }
  };

  const handleAddWishlist = async () => {
    if (!addArtist.trim() || !addTitle.trim()) {
      setAddError('Artist and title are required.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      const urls = buildStoreUrls(addArtist.trim(), addTitle.trim());
      const { error } = await supabase.from('wishlist_tracks').insert({
        user_id: user.id,
        artist: addArtist.trim(),
        title: addTitle.trim(),
        bpm: addBpm ? parseFloat(addBpm) : null,
        key: addKey.trim() || null,
        genre: addGenre.trim() || null,
        status: 'wishlist',
        enrichment_source: 'manual',
        ...urls,
      });
      if (error) throw error;
      setAddArtist(''); setAddTitle(''); setAddBpm(''); setAddKey(''); setAddGenre('');
      setAddUrl(''); setUrlSource(null);
      setShowAddForm(false);
      const tracks = await loadLibraryFromSupabase();
      if (tracks) { setUploadedTracks(tracks); localStorage.setItem('sd_library', JSON.stringify(tracks)); }
      fetch('/api/library/enrich-lastfm', { method: 'POST' }).catch(() => {});
      fetch('/api/library/enrich-bpm-key', { method: 'POST' }).then(async () => {
        const updated = await loadLibraryFromSupabase();
        if (updated) { setUploadedTracks(updated); localStorage.setItem('sd_library', JSON.stringify(updated)); }
      }).catch(() => {});
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add track');
    } finally {
      setAdding(false);
    }
  };

  const handleWordplaySearch = async () => {
    if (!wordplayWord.trim()) return;
    setWordplayLoading(true);
    setWordplayError(null);
    setWordplayResults(null);
    try {
      const library = (uploadedTracks ?? []).filter(t => !t.isWishlist);
      const tracks = library.map(t => ({ id: t.id, artist: t.artist, title: t.title, bpm: t.bpm, key: t.key ?? '' }));
      const res = await fetch('/api/wordplay/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordplayWord.trim(), tracks }),
      });
      const data = await res.json() as typeof wordplayResults & { error?: string };
      if (data.error) throw new Error(data.error);
      setWordplayResults(data);
    } catch (err) {
      setWordplayError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setWordplayLoading(false);
    }
  };

  const loadCrates = async () => {
    setCratesLoading(true);
    try {
      const res = await fetch('/api/crates');
      const data = await res.json() as { crates?: CrateEntry[]; error?: string };
      if (data.error) throw new Error(data.error);
      setCratesList(data.crates ?? []);
    } catch (err) {
      setCrateError(err instanceof Error ? err.message : 'Failed to load crates');
    } finally {
      setCratesLoading(false);
    }
  };

  const handleGenerateCrate = async () => {
    if (!cratePrompt.trim()) return;
    setCrateGenerating(true);
    setCrateError(null);
    try {
      const res = await fetch('/api/crates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: cratePrompt.trim(), targetCount: crateTargetCount }),
      });
      const data = await res.json() as { crate?: ActiveCrate; error?: string };
      if (data.error) throw new Error(data.error);
      if (data.crate) {
        setActiveCrate(data.crate);
        setCratePrompt('');
        setCratesList(prev => prev
          ? [{ id: data.crate!.id, name: data.crate!.name, prompt: data.crate!.prompt, trackCount: data.crate!.tracks.length, createdAt: data.crate!.createdAt }, ...prev]
          : null
        );
      }
    } catch (err) {
      setCrateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setCrateGenerating(false);
    }
  };

  const handleDeleteCrate = async (id: string) => {
    await fetch('/api/crates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setCratesList(prev => (prev ?? []).filter(c => c.id !== id));
    if (activeCrate?.id === id) setActiveCrate(null);
  };

  const handleLoadCrateDetail = async (entry: CrateEntry) => {
    const res = await fetch('/api/crates');
    const data = await res.json() as { crates?: Array<CrateEntry & { tracks: CrateTrack[] }> };
    const full = (data.crates ?? []).find(c => c.id === entry.id);
    if (full) setActiveCrate({ ...full, moodNotes: '' });
  };

  const exportCrateSerato = (crate: ActiveCrate) => {
    const paths = crate.tracks.map(t => t.filePath).filter((p): p is string => Boolean(p));
    if (!paths.length) { alert('No file paths — library enrichment may be needed.'); return; }
    downloadCrate(buildCrate(paths), crate.name);
  };

  const exportCrateRekordbox = (crate: ActiveCrate) => {
    const pseudoSetlist: SetlistTrack[] = crate.tracks.map((t, i) => ({
      position: i + 1, artist: t.artist, title: t.title, bpm: t.bpm ?? 0, key: t.key ?? '',
      energyLevel: 5, whyThisTrack: '', transitionNotes: '', harmonicMixingNotes: '', isWishlistTrack: false,
    }));
    const pseudoLibrary: LibraryTrack[] = crate.tracks.map(t => ({
      id: t.id, artist: t.artist, title: t.title, bpm: t.bpm ?? 0, key: t.key ?? '',
      genre: t.genre ?? undefined, filePath: t.filePath ?? undefined, isWishlist: false,
    }));
    const { xml } = buildRekordboxXml(crate.name, pseudoSetlist, pseudoLibrary);
    downloadRekordboxXml(xml, crate.name);
  };

  const exportCrateM3u = (crate: ActiveCrate) => {
    const pseudoSetlist: SetlistTrack[] = crate.tracks.map((t, i) => ({
      position: i + 1, artist: t.artist, title: t.title, bpm: t.bpm ?? 0, key: t.key ?? '',
      energyLevel: 5, whyThisTrack: '', transitionNotes: '', harmonicMixingNotes: '', isWishlistTrack: false,
    }));
    const pseudoLibrary: LibraryTrack[] = crate.tracks.map(t => ({
      id: t.id, artist: t.artist, title: t.title, bpm: t.bpm ?? 0, key: t.key ?? '',
      genre: t.genre ?? undefined, filePath: t.filePath ?? undefined, isWishlist: false,
    }));
    const { m3u } = buildM3u(crate.name, pseudoSetlist, pseudoLibrary);
    downloadM3u(m3u, crate.name);
  };

  const handleDeleteWishlist = async (id: string) => {
    const supabase = createClient();
    await supabase.from('wishlist_tracks').delete().eq('id', id);
    const tracks = await loadLibraryFromSupabase();
    if (tracks) {
      setUploadedTracks(tracks);
      localStorage.setItem('sd_library', JSON.stringify(tracks));
    } else {
      const remaining = (uploadedTracks ?? []).filter(t => t.id !== id);
      setUploadedTracks(remaining.length ? remaining : null);
      localStorage.setItem('sd_library', JSON.stringify(remaining));
    }
  };

  const allTracks: SampleTrack[] = useMemo(
    () => uploadedTracks ? uploadedTracks.map(toDisplayTrack) : LIBRARY_TRACKS,
    [uploadedTracks]
  );

  const wishlistTracks = useMemo(() => allTracks.filter(t => t.wishlist), [allTracks]);

  const filteredRaw: LibraryTrack[] = useMemo(() => {
    const q = search.toLowerCase();
    return (uploadedTracks ?? []).filter(t => {
      const matchSearch = !q || `${t.artist} ${t.title}`.toLowerCase().includes(q);
      const matchBpm = (!bpmMin || t.bpm >= parseInt(bpmMin)) && (!bpmMax || t.bpm <= parseInt(bpmMax));
      if (tab === 'wishlist') return t.isWishlist && matchSearch && matchBpm;
      return matchSearch && matchBpm;
    });
  }, [uploadedTracks, search, bpmMin, bpmMax, tab]);

  const filtered: SampleTrack[] = useMemo(() => {
    if (uploadedTracks) return filteredRaw.map(toDisplayTrack);
    const q = search.toLowerCase();
    return allTracks.filter(t => {
      const matchSearch = !q || `${t.artist} ${t.title}`.toLowerCase().includes(q);
      const matchBpm = (!bpmMin || t.bpm >= parseInt(bpmMin)) && (!bpmMax || t.bpm <= parseInt(bpmMax));
      if (tab === 'wishlist') return t.wishlist && matchSearch && matchBpm;
      return matchSearch && matchBpm;
    });
  }, [uploadedTracks, filteredRaw, allTracks, search, bpmMin, bpmMax, tab]);

  const cols = tab === 'wishlist' ? '32px 1fr 64px 48px 64px 1fr 80px' : '32px 1fr 64px 48px 64px 80px 80px';
  const headers = ['#','Track','BPM','Key','Energy',
    tab === 'wishlist' ? 'Stores' : 'Date Added',
    tab === 'wishlist' ? 'Status' : 'Plays',
  ];

  return (
    <div style={{ background:SD.bg, minHeight:'100vh', paddingTop:56, color:SD.text }}>
      <div className="sd-pad-x sd-inner-pad" style={{ maxWidth:1100, margin:'0 auto', padding:'48px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom:28, display:'flex', alignItems:'flex-end',
          justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted,
              letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>Music Library</div>
            <h1 style={{ fontFamily:SD.display, fontSize:52, letterSpacing:4,
              margin:0, color:SD.text, lineHeight:1 }}>YOUR LIBRARY</h1>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {uploadedTracks ? (
              <>
                {(() => {
                  const busy = uploadStage !== 'idle' && uploadStage !== 'done';
                  const dotColor = busy ? SD.accent : enriching ? SD.textSec : SD.green;
                  const label = busy
                    ? (uploadStage === 'parse' ? 'Reading file...' : uploadStage === 'save' ? 'Saving to cloud...' : 'Enriching tags...')
                    : enriching ? 'Refreshing tags...' : `${uploadedTracks.length.toLocaleString()} tracks loaded`;
                  return (
                    <span style={{ fontFamily:SD.mono, fontSize:12, color:dotColor,
                      display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:6, height:6, borderRadius:'50%',
                        background:dotColor, display:'inline-block',
                        boxShadow:`0 0 6px ${dotColor}` }}/>
                      {label}
                    </span>
                  );
                })()}
                <SDButton ghost onClick={triggerEnrichment} disabled={enriching || uploadStage !== 'idle'}
                  style={{ fontSize:13, padding:'6px 12px', color:SD.textMuted }}>
                  {enriching ? 'Enriching...' : 'Refresh Tags'}
                </SDButton>
                <SDButton ghost onClick={() => setShowUpload(!showUpload)}
                  style={{ fontSize:12, padding:'7px 14px' }}>Replace Library</SDButton>
                <SDButton ghost danger onClick={clearLibrary}
                  style={{ fontSize:12, padding:'7px 14px', color:SD.textMuted }}>Clear</SDButton>
              </>
            ) : (
              <SDButton ghost onClick={() => setShowUpload(!showUpload)}
                style={{ fontSize:12, padding:'9px 18px' }}>
                + Upload Library
              </SDButton>
            )}
          </div>
        </div>

        {/* Stage tracker — shown while file is being processed */}
        {uploadStage !== 'idle' && (
          <StageTracker
            stage={uploadStage}
            parsedCount={parsedCount}
            uploadMode={uploadMode}
            syncStats={syncStats}
          />
        )}

        {/* Loading state — shown while the initial library fetch is in flight */}
        {uploadStage === 'idle' && !libraryLoaded && tab === 'library' && (
          <div style={{ padding:'80px 0', textAlign:'center',
            fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>
            Loading your library...
          </div>
        )}

        {/* Upload zone — shown when toggled OR when load completed and there's no library, hidden during upload */}
        {uploadStage === 'idle' && libraryLoaded && (showUpload || (!uploadedTracks && tab === 'library')) && (
          <UploadZone
            onFile={handleFile}
            dragOver={dragOver}
            setDragOver={setDragOver}
            parseError={parseError}
            uploadMode={uploadMode}
            setUploadMode={setUploadMode}
          />
        )}

        {/* Tabs */}
        <div style={{ marginBottom:28 }}>
          <Tabs
            tabs={[
              { id: 'library', label: 'In Library', count: allTracks.length, subtitle: 'your full catalog' },
              { id: 'wishlist', label: 'Wishlist', count: wishlistTracks.length, subtitle: 'tracks to download' },
              { id: 'wordplay', label: 'Wordplay', subtitle: 'lyrical connections' },
              { id: 'crates', label: 'Crates', subtitle: 'AI-grouped by vibe' },
            ]}
            value={tab}
            onChange={(id) => {
              setTab(id);
              if (id === 'crates' && cratesList === null) loadCrates();
            }}
          />
        </div>

        {/* Filters — hidden on Wordplay and Crates tabs */}
        <div style={{ display: tab === 'wordplay' || tab === 'crates' ? 'none' : 'flex', gap:12, marginBottom:20, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:1, minWidth:240 }}>
            <SDInput value={search} onChange={setSearch}
              placeholder={tab === 'library' ? 'Search artist or title...' : 'Search wishlist...'} />
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <SDInput value={bpmMin} onChange={setBpmMin} placeholder="BPM min" style={{ width:80 }} />
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>—</span>
            <SDInput value={bpmMax} onChange={setBpmMax} placeholder="BPM max" style={{ width:80 }} />
          </div>
          {(search || bpmMin || bpmMax) && (
            <SDButton ghost onClick={() => { setSearch(''); setBpmMin(''); setBpmMax(''); }}
              style={{ fontSize:12, padding:'9px 14px' }}>Clear</SDButton>
          )}
        </div>

        {tab !== 'wordplay' && tab !== 'crates' && (
          <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, marginBottom:12 }}>
            {filtered.length} track{filtered.length !== 1 ? 's' : ''}{(search || bpmMin || bpmMax) ? ' matching filters' : ''}
            {uploadedTracks && <span style={{ color:SD.accent, marginLeft:8 }}>· Your Library</span>}
          </div>
        )}

        {/* Add to wishlist form */}
        {tab === 'wishlist' && (
          <div style={{ marginBottom:16 }}>
            {!showAddForm ? (
              <SDButton ghost onClick={() => setShowAddForm(true)}
                style={{ fontSize:12, padding:'8px 16px' }}>+ Add Track to Wishlist</SDButton>
            ) : (
              <div style={{ background:SD.surface, border:`1px solid ${SD.border}`,
                borderRadius:4, padding:'20px 24px' }}>
                <div style={{ fontFamily:SD.mono, fontSize:13, letterSpacing:2,
                  color:SD.textMuted, textTransform:'uppercase', marginBottom:16 }}>
                  Add Track to Wishlist
                </div>
                <div style={{ marginBottom:10, position:'relative' }}>
                  <SDInput
                    value={addUrl}
                    onChange={v => { setAddUrl(v); handleUrlLookup(v); }}
                    placeholder="Paste Beatport URL to auto-fill, or type manually below..."
                  />
                  {urlLookupLoading && (
                    <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                      fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>Looking up...</span>
                  )}
                  {urlSource === 'beatport' && !urlLookupLoading && (
                    <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                      fontFamily:SD.mono, fontSize:12, color:SD.green }}>✓ from Beatport</span>
                  )}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  <SDInput value={addArtist} onChange={setAddArtist} placeholder="Artist *" />
                  <SDInput value={addTitle} onChange={setAddTitle} placeholder="Title *" />
                  <SDInput value={addBpm} onChange={setAddBpm} placeholder="BPM" />
                  <SDInput value={addKey} onChange={setAddKey} placeholder="Key (e.g. 4A)" />
                </div>
                <div style={{ marginBottom:12 }}>
                  <SDInput value={addGenre} onChange={setAddGenre} placeholder="Genre (optional)" />
                </div>
                {addError && (
                  <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.danger, marginBottom:10 }}>
                    {addError}
                  </div>
                )}
                <div style={{ display:'flex', gap:10 }}>
                  <SDButton onClick={handleAddWishlist} style={{ fontSize:13 }}>
                    {adding ? 'Adding...' : 'Add Track'}
                  </SDButton>
                  <SDButton ghost onClick={() => { setShowAddForm(false); setAddError(null); setAddUrl(''); setUrlSource(null); }}
                    style={{ fontSize:13 }}>Cancel</SDButton>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wordplay Studio */}
        {tab === 'wordplay' && (
          <div>
            <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted, lineHeight:1.8, marginBottom:24 }}>
              Enter a word or phrase. {BRAND.name} will scan your library for tracks that feature it prominently in their lyrics
              and suggest DJ transition pairs — the hip hop technique of bridging songs through matching vocals.
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:32 }}>
              <div style={{ flex:1 }}>
                <input
                  value={wordplayWord}
                  onChange={e => setWordplayWord(e.target.value)}
                  placeholder={`e.g. "tonight", "money", "fly", "all eyes on me"`}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleWordplaySearch(); }}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: SD.surface2, border: `1px solid ${SD.border}`,
                    borderRadius: 3, padding: '10px 14px', color: SD.text,
                    fontFamily: SD.mono, fontSize: 14,
                  }}
                />
              </div>
              <SDButton onClick={handleWordplaySearch}
                style={{ fontSize:13, padding:'10px 28px', opacity: wordplayLoading ? 0.6 : 1,
                  pointerEvents: wordplayLoading ? 'none' : 'auto' }}>
                {wordplayLoading ? 'Searching...' : 'Find Connections'}
              </SDButton>
            </div>

            {wordplayError && (
              <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.danger, marginBottom:24 }}>{wordplayError}</div>
            )}

            {wordplayResults && (
              <div>
                {/* Matched tracks */}
                <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:2, color:SD.textMuted,
                  textTransform:'uppercase', marginBottom:12 }}>
                  Tracks matching &ldquo;{wordplayWord}&rdquo; — {wordplayResults.matches.length} found
                </div>

                {wordplayResults.matches.length === 0 ? (
                  <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted, marginBottom:32,
                    padding:'20px 24px', background:SD.surface, border:`1px solid ${SD.border}`, borderRadius:4 }}>
                    No confident lyrical matches found. Try a different word, or check that your library includes hip hop tracks.
                  </div>
                ) : (
                  <div style={{ marginBottom:32 }}>
                    {wordplayResults.matches.map((m, i) => (
                      <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto',
                        gap:16, padding:'14px 16px', borderBottom:`1px solid ${SD.border}`,
                        alignItems:'start' }}>
                        <div>
                          <div style={{ fontFamily:SD.mono, fontSize:14, fontWeight:600, color:SD.text, marginBottom:4 }}>
                            {m.artist} — <span style={{ color:SD.textSec }}>{m.title}</span>
                          </div>
                          <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>{m.lyricContext}</div>
                        </div>
                        <span style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:1, textTransform:'uppercase',
                          color:SD.accent, background:SD.accentDim, border:`1px solid ${SD.accent}33`,
                          borderRadius:2, padding:'3px 8px', whiteSpace:'nowrap', marginTop:2 }}>
                          {m.position}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggested pairs */}
                {wordplayResults.pairs.length > 0 && (
                  <>
                    <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:2, color:SD.textMuted,
                      textTransform:'uppercase', marginBottom:12 }}>
                      Suggested Transition Pairs — {wordplayResults.pairs.length}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      {wordplayResults.pairs.map((p, i) => (
                        <div key={i} style={{ background:SD.surface, border:`1px solid ${SD.border}`,
                          borderRadius:4, padding:'20px 24px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12, flexWrap:'wrap' }}>
                            <span style={{ fontFamily:SD.mono, fontSize:14, fontWeight:600, color:SD.text }}>
                              {p.fromArtist} — {p.fromTitle}
                            </span>
                            <span style={{ fontFamily:SD.mono, fontSize:16, color:SD.accent }}>→</span>
                            <span style={{ fontFamily:SD.mono, fontSize:14, fontWeight:600, color:SD.text }}>
                              {p.toArtist} — {p.toTitle}
                            </span>
                          </div>
                          <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec,
                            fontStyle:'italic', marginBottom:12, lineHeight:1.6 }}>
                            &ldquo;{p.bridge}&rdquo;
                          </div>
                          <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
                            <span style={{ fontFamily:SD.mono, fontSize:12, color: p.bpmDiff <= 5 ? SD.success : p.bpmDiff <= 10 ? SD.accent : SD.danger }}>
                              {p.fromBpm} → {p.toBpm} BPM ({p.bpmDiff > 0 ? `${p.bpmDiff} diff` : 'same'})
                            </span>
                            <span style={{ fontFamily:SD.mono, fontSize:12,
                              color: p.keysCompatible ? SD.success : SD.textMuted }}>
                              {p.keysCompatible ? '✓ Keys compatible' : '⚠ Key clash — use acapella or loop to mask'}
                            </span>
                            <SDButton
                              ghost
                              style={{ fontSize: 11, padding: '4px 12px', marginLeft: 'auto' }}
                              onClick={() => {
                                sessionStorage.setItem('sd_builder_prefill', JSON.stringify({
                                  seedSearch: `${p.fromArtist} ${p.fromTitle}`,
                                  wordplay: wordplayWord,
                                }));
                                router.push('/builder');
                              }}
                            >
                              Use in Set →
                            </SDButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {!wordplayResults && !wordplayLoading && (
              <div style={{ textAlign:'center', padding:'80px 40px' }}>
                <div style={{ fontFamily:SD.display, fontSize:48, letterSpacing:3, color:SD.textMuted, marginBottom:12 }}>
                  WORDPLAY
                </div>
                <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>
                  {uploadedTracks ? 'Enter a word above to find lyrical connections in your library.' : 'Upload your library first to use Wordplay Studio.'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Crates */}
        {tab === 'crates' && (
          <div>
            {/* Generate form */}
            <div style={{ background:SD.surface, border:`1px solid ${SD.border}`, borderRadius:SD.r3, padding:'20px 24px', marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:2, color:SD.textMuted, textTransform:'uppercase' }}>
                  Generate a Crate
                </div>
                <a href="/crates" style={{
                  fontFamily:SD.mono, fontSize:11, letterSpacing:1.5, textTransform:'uppercase',
                  color:SD.accent, textDecoration:'none',
                }}>Open Crate Builder →</a>
              </div>
              <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, lineHeight:1.7, marginBottom:16 }}>
                Describe the vibe — {BRAND.name} rounds up matching tracks from your library. You decide what to play.
              </div>
              <div style={{ marginBottom:12 }}>
                <input
                  value={cratePrompt}
                  onChange={e => setCratePrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !crateGenerating) handleGenerateCrate(); }}
                  placeholder='e.g. "Friday peak 1am", "Wedding cocktail hour", "Tech house warmup"'
                  style={{
                    width:'100%', boxSizing:'border-box',
                    background:SD.surface2, border:`1px solid ${SD.border}`,
                    borderRadius:SD.r2, padding:'10px 14px', color:SD.text,
                    fontFamily:SD.mono, fontSize:14,
                  }}
                />
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16, flexWrap:'wrap' }}>
                <label style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, display:'flex', alignItems:'center', gap:8 }}>
                  Track count:
                  <input
                    type="number" min={5} max={50} value={crateTargetCount}
                    onChange={e => setCrateTargetCount(Math.min(50, Math.max(5, Number(e.target.value))))}
                    style={{
                      width:64, background:SD.surface2, border:`1px solid ${SD.border}`,
                      borderRadius:SD.r2, padding:'6px 10px', color:SD.text,
                      fontFamily:SD.mono, fontSize:13, textAlign:'center',
                    }}
                  />
                </label>
                <SDButton
                  onClick={handleGenerateCrate}
                  style={{ fontSize:13, opacity: crateGenerating || !cratePrompt.trim() ? 0.5 : 1,
                    pointerEvents: crateGenerating || !cratePrompt.trim() ? 'none' : 'auto' }}
                >
                  {crateGenerating ? 'Generating...' : 'Generate Crate'}
                </SDButton>
              </div>
              {crateError && (
                <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.danger }}>{crateError}</div>
              )}
            </div>

            {/* Active crate preview */}
            {activeCrate && (
              <div style={{ background:SD.surface, border:`1px solid ${SD.borderMid}`, borderRadius:SD.r3, padding:'20px 24px', marginBottom:24 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:16, flexWrap:'wrap' }}>
                  <div>
                    <div style={{ fontFamily:SD.mono, fontSize:16, fontWeight:700, color:SD.text, marginBottom:4 }}>
                      {activeCrate.name}
                    </div>
                    {activeCrate.moodNotes && (
                      <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, fontStyle:'italic' }}>
                        {activeCrate.moodNotes}
                      </div>
                    )}
                    <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted, marginTop:4 }}>
                      {activeCrate.tracks.length} tracks · from &ldquo;{activeCrate.prompt}&rdquo;
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <SDButton ghost onClick={() => exportCrateSerato(activeCrate)} style={{ fontSize:11, padding:'5px 12px' }}>
                      Export .crate
                    </SDButton>
                    <SDButton ghost onClick={() => exportCrateRekordbox(activeCrate)} style={{ fontSize:11, padding:'5px 12px' }}>
                      Rekordbox XML
                    </SDButton>
                    <SDButton ghost onClick={() => exportCrateM3u(activeCrate)} style={{ fontSize:11, padding:'5px 12px' }}>
                      M3U
                    </SDButton>
                    <SDButton ghost onClick={() => setActiveCrate(null)} style={{ fontSize:11, padding:'5px 12px', color:SD.textMuted }}>
                      Close
                    </SDButton>
                  </div>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <div style={{ minWidth:420 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 64px 52px', gap:12,
                      padding:'6px 12px', borderBottom:`1px solid ${SD.border}` }}>
                      {['#','Track','BPM','Key'].map(h => (
                        <span key={h} style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted,
                          letterSpacing:1.5, textTransform:'uppercase' }}>{h}</span>
                      ))}
                    </div>
                    {activeCrate.tracks.map((t, i) => (
                      <div key={t.id} style={{ display:'grid', gridTemplateColumns:'32px 1fr 64px 52px', gap:12,
                        padding:'11px 12px', borderBottom:`1px solid ${SD.border}`, alignItems:'center' }}>
                        <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>{String(i + 1).padStart(2,'0')}</span>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontFamily:SD.mono, fontSize:13, fontWeight:600, color:SD.text,
                            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.artist}</div>
                          <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec,
                            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</div>
                        </div>
                        <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec }}>{t.bpm ?? '—'}</span>
                        <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>{t.key ?? '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Saved crates list */}
            {cratesLoading ? (
              <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>Loading crates...</div>
            ) : cratesList !== null && (
              <div>
                {cratesList.length === 0 && !activeCrate ? (
                  <div style={{ padding:'48px 0' }}>
                    <div style={{ fontFamily:SD.display, fontSize:36, letterSpacing:3, color:SD.textMuted, marginBottom:8 }}>NO CRATES YET</div>
                    <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted, lineHeight:1.8, marginBottom:20 }}>
                      A crate is a focused pocket of tracks from your library built around a moment or vibe.
                      Describe what you need and {BRAND.name} picks the right tracks — export straight to Serato when done.
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      {['"Friday peak 1am"', '"Smooth wedding opener"', '"90s R&B slow jams"', '"Tech house warmup"'].map(ex => (
                        <span key={ex} style={{
                          fontFamily:SD.mono, fontSize:12, color:SD.textMuted,
                          background:SD.surface, border:`1px solid ${SD.border}`,
                          borderRadius:3, padding:'5px 10px',
                        }}>{ex}</span>
                      ))}
                    </div>
                  </div>
                ) : cratesList.length > 0 && (
                  <div>
                    <div style={{ fontFamily:SD.mono, fontSize:11, letterSpacing:2, color:SD.textMuted,
                      textTransform:'uppercase', marginBottom:10 }}>Saved Crates</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {cratesList.map(entry => (
                        <div key={entry.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                          gap:12, padding:'14px 16px', background:SD.surface, border:`1px solid ${SD.border}`,
                          borderRadius:SD.r3 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontFamily:SD.mono, fontSize:13, fontWeight:600, color:SD.text,
                              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{entry.name}</div>
                            <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted, marginTop:2 }}>
                              {entry.trackCount} tracks · &ldquo;{entry.prompt}&rdquo; · {new Date(entry.createdAt).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:6 }}>
                            <SDButton ghost onClick={() => handleLoadCrateDetail(entry)} style={{ fontSize:11, padding:'4px 10px' }}>
                              View
                            </SDButton>
                            <SDButton ghost onClick={() => handleDeleteCrate(entry.id)}
                              style={{ fontSize:11, padding:'4px 10px', color:SD.danger }}>
                              Delete
                            </SDButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rows */}
        {tab !== 'wordplay' && tab !== 'crates' && (filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 40px' }}>
            <div style={{ fontFamily:SD.display, fontSize:48, letterSpacing:3,
              color:SD.textMuted, marginBottom:12 }}>NOTHING HERE</div>
            <div style={{ fontFamily:SD.mono, fontSize:14, color:SD.textMuted }}>
              {tab === 'wishlist'
                ? 'Add tracks you want to buy — they\'ll be included when generating your next set.'
                : 'Upload your Serato or Rekordbox library to see your tracks here.'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
            <div style={{ minWidth:520 }}>
              {/* Table header */}
              <div style={{ display:'grid', gridTemplateColumns:cols, gap:12,
                padding:'8px 16px', borderBottom:`1px solid ${SD.border}` }}>
                {headers.map(h => (
                  <span key={h} style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted,
                    letterSpacing:1.5, textTransform:'uppercase' }}>{h}</span>
                ))}
              </div>
              {filtered.map((t, idx) => (
                <LibraryRow
                  key={`${t.pos}-${idx}`}
                  track={t}
                  tab={tab}
                  idx={idx}
                  tags={filteredRaw[idx]?.lastfmTags}
                  onDelete={tab === 'wishlist' && uploadedTracks ? () => handleDeleteWishlist(filteredRaw[idx].id) : undefined}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Library tab enrichment actions */}
        {tab === 'library' && uploadedTracks && (() => {
          const missingBpmKey = uploadedTracks.filter(t => !t.isWishlist && (!t.bpm || !t.key));
          const untagged = uploadedTracks.filter(t => !t.isWishlist && (!t.lastfmTags || t.lastfmTags.length === 0));
          if (!missingBpmKey.length && !untagged.length) return null;
          return (
            <div style={{ marginTop:24, padding:'16px 20px',
              background:SD.surface, border:`1px solid ${SD.border}`,
              borderRadius:4, display:'flex', alignItems:'center',
              justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec, marginBottom:2 }}>
                  Library enrichment available
                </div>
                <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>
                  {[
                    missingBpmKey.length ? `${missingBpmKey.length} tracks missing BPM/key` : '',
                    untagged.length ? `${untagged.length} tracks without mood tags` : '',
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {untagged.length > 0 && (
                  <SDButton ghost style={{ fontSize:12 }}
                    onClick={triggerEnrichment}
                    disabled={enriching}>
                    {enriching ? 'Fetching Tags...' : `Tag ${untagged.length} Tracks`}
                  </SDButton>
                )}
                {missingBpmKey.length > 0 && (
                  <SDButton ghost style={{ fontSize:12 }}
                    onClick={triggerBpmKeyEnrichment}
                    disabled={enrichingBpmKey}>
                    {enrichingBpmKey ? 'Looking up BPM/Key...' : `Fill ${missingBpmKey.length} Missing BPM/Key`}
                  </SDButton>
                )}
              </div>
            </div>
          );
        })()}

        {/* Wishlist actions */}
        {tab === 'wishlist' && filtered.length > 0 && (() => {
          const withLinks = (uploadedTracks ?? []).filter(t => t.isWishlist && t.beatportSearchUrl);
          const openCount = Math.min(withLinks.length, 5);
          const missingBpmKey = (uploadedTracks ?? []).filter(t => t.isWishlist && (!t.bpm || t.key === '—'));
          return (
            <div style={{ marginTop:24, padding:'20px 24px',
              background:SD.accentDim, border:`1px solid ${SD.accent}33`,
              borderRadius:4, display:'flex', alignItems:'center',
              justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontFamily:SD.mono, fontSize:14, color:SD.text, marginBottom:4 }}>
                  {filtered.filter(t => t.wishlist).length} tracks ready to download
                </div>
                <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>
                  Check store confidence before purchasing.
                </div>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {missingBpmKey.length > 0 && (
                  <SDButton ghost style={{ fontSize:13 }}
                    onClick={triggerBpmKeyEnrichment}
                    disabled={enrichingBpmKey}>
                    {enrichingBpmKey ? 'Looking up BPM & Key...' : `Enrich ${missingBpmKey.length} Track${missingBpmKey.length !== 1 ? 's' : ''}`}
                  </SDButton>
                )}
                {openCount > 0 && (
                  <SDButton style={{ fontSize:13 }} onClick={() => {
                    withLinks.slice(0, 5).forEach(t => window.open(t.beatportSearchUrl, '_blank'));
                  }}>
                    Open {openCount} Beatport Link{openCount !== 1 ? 's' : ''}
                  </SDButton>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
