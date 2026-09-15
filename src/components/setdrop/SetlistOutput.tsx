'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SD, SAMPLE_TRACKS } from '@/lib/setdrop/constants';
import { GeneratedSetlist, SetlistTrack, LibraryTrack } from '@/lib/agents/types';
import { buildCrate, downloadCrate } from '@/lib/setdrop/serato-crate';
import { buildRekordboxXml, downloadRekordboxXml, buildM3u, downloadM3u } from '@/lib/setdrop/rekordbox-export';
import { createClient } from '@/lib/supabase/client';
import { SDButton } from './shared';
import { SetView, toDisplayTracks, type ResolvedUrls } from './SetView';
import { ImportInstructions, type ImportPlatform } from './ImportInstructions';
import { BRAND } from '@/lib/brand';
import { gateExport } from '@/lib/setdrop/export-gate';

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findLibraryTrack(artist: string, title: string, library: LibraryTrack[]): LibraryTrack | undefined {
  const na = normalize(artist);
  const nt = normalize(title);
  const exact = library.find(l => normalize(l.artist) === na && normalize(l.title) === nt);
  if (exact) return exact;
  return library.find(l => {
    const la = normalize(l.artist);
    const lt = normalize(l.title);
    const artistMatch = la === na || la.startsWith(na) || na.startsWith(la);
    const titleMatch = lt === nt || lt.startsWith(nt) || nt.startsWith(lt);
    return artistMatch && titleMatch;
  });
}

function matchFilePaths(tracks: SetlistTrack[], library: LibraryTrack[]): { paths: string[]; matched: number } {
  const paths: string[] = [];
  for (const t of tracks) {
    const found = findLibraryTrack(t.artist, t.title, library);
    if (found?.filePath) paths.push(found.filePath);
  }
  return { paths, matched: paths.length };
}

// Merge the async-resolved store URLs + confidence into the saved tracks so a
// set persists what the owner saw. Only wishlist tracks carry the extra pools;
// non-wishlist keep just beatportUrl. Undefined fields are left off.
function mergeResolvedIntoTracks(
  tracks: SetlistTrack[],
  map: Record<number, ResolvedUrls>,
): SetlistTrack[] {
  return tracks.map((t, i) => {
    const r = map[t.position || i + 1];
    if (!r) return t;
    return {
      ...t,
      beatportUrl: r.beatportUrl ?? t.beatportUrl,
      bpmSupremeUrl: r.bpmSupremeUrl,
      bpmSupremeFound: r.bpmSupremeFound,
      traxsourceUrl: r.traxsourceUrl,
      traxsourceFound: r.traxsourceFound,
      djcityUrl: r.djcityUrl,
      djcityFound: r.djcityFound,
    };
  });
}

export function SetlistOutput() {
  const router = useRouter();
  const [setlist, setSetlist] = useState<GeneratedSetlist | null>(null);
  const [copied, setCopied] = useState(false);
  const [badgeCopied, setBadgeCopied] = useState<'html' | 'md' | null>(null);
  const [resolvedUrls, setResolvedUrls] = useState<Record<number, ResolvedUrls>>({});
  const [resolving, setResolving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sd_current_setlist');
      if (!raw) return;
      const parsed = JSON.parse(raw) as GeneratedSetlist;
      setSetlist(parsed);
      if (parsed.tracks?.length) {
        setResolving(true);
        fetch('/api/setlist/resolve-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tracks: parsed.tracks.map((t, i) => ({
              position: t.position || i + 1,
              artist: t.artist,
              title: t.title,
              isWishlist: t.isWishlistTrack,
            })),
          }),
        })
          .then(r => r.json())
          .then((data: { resolved?: Array<ResolvedUrls & { position: number }> }) => {
            const map: Record<number, ResolvedUrls> = {};
            for (const r of data.resolved ?? []) {
              const { position, ...urls } = r;
              map[position] = urls;
            }
            setResolvedUrls(map);

            // Persist the resolved links back onto the saved set so admin, the
            // public share page, and history render exactly what the owner sees.
            // Fire-and-forget + owner-only (RLS): never blocks the view, and the
            // resolve already ran client-side so there's no added generation cost.
            if (parsed.dbId && data.resolved?.length) {
              const merged = mergeResolvedIntoTracks(parsed.tracks, map);
              const supabase = createClient();
              supabase.from('setlists').update({ tracks_json: merged }).eq('id', parsed.dbId)
                .then(() => {
                  // Keep session copy in sync so a reload shows the persisted links.
                  try {
                    sessionStorage.setItem('sd_current_setlist', JSON.stringify({ ...parsed, tracks: merged }));
                  } catch { /* ignore quota/serialization */ }
                });
            }
          })
          .catch(() => { /* silent — search URLs remain */ })
          .finally(() => setResolving(false));
      }
    } catch { /* ignore corrupted data */ }
  }, []);
  const [showRegen, setShowRegen] = useState(false);
  const [regenNote, setRegenNote] = useState('');
  const [crateStatus, setCrateStatus] = useState<string | null>(null);
  const [importGuide, setImportGuide] = useState<{ platform: ImportPlatform; matched: number; total: number } | null>(null);
  const [libraryOnly, setLibraryOnly] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [making, setMaking] = useState(false);
  const [publishedFlash, setPublishedFlash] = useState(false);
  const [showGigForm, setShowGigForm] = useState(false);
  const [gigVenue, setGigVenue] = useState('');
  const [gigDate, setGigDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loggingGig, setLoggingGig] = useState(false);
  const [gigLogged, setGigLogged] = useState(false);

  const handleLogGig = async () => {
    if (!setlist?.dbId) return;
    setLoggingGig(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      await supabase.from('gig_history').insert({
        user_id: user.id,
        setlist_id: setlist.dbId,
        gig_name: setlist.name,
        gig_date: gigDate,
        venue: gigVenue.trim() || null,
      });
      setGigLogged(true);
      setShowGigForm(false);
    } finally {
      setLoggingGig(false);
    }
  };

  const shareUrl = setlist?.dbSlug && typeof window !== 'undefined'
    ? `${window.location.origin}/set/${setlist.dbSlug}`
    : null;

  const handleMakePublic = async () => {
    if (!setlist?.dbId || !shareUrl) return;
    setMaking(true);
    try {
      const supabase = createClient();
      await supabase.from('setlists').update({ is_public: true }).eq('id', setlist.dbId);
      setIsPublic(true);
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setPublishedFlash(true);
      setTimeout(() => setCopied(false), 3000);
      setTimeout(() => setPublishedFlash(false), 8000);
    } finally {
      setMaking(false);
    }
  };

  const getLibrary = (): LibraryTrack[] => {
    try {
      const raw = localStorage.getItem('sd_library');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };

  const handleExportCrate = async () => {
    if (!setlist) return;
    setImportGuide(null);
    let library = getLibrary();

    // If localStorage is empty or stale (no file paths), fetch fresh from Supabase
    if (!library.length || !library.some(t => t.filePath)) {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: lib } = await supabase.from('serato_libraries').select('id').eq('user_id', user.id).single();
          if (lib) {
            const PAGE = 1000;
            let offset = 0;
            const allRows: LibraryTrack[] = [];
            while (true) {
              const { data: page } = await supabase
                .from('serato_tracks')
                .select('id, artist, title, bpm, key, genre, file_path')
                .eq('library_id', lib.id)
                .order('artist')
                .range(offset, offset + PAGE - 1);
              if (!page?.length) break;
              allRows.push(...page.map(t => ({
                id: t.id, artist: t.artist ?? '', title: t.title ?? '',
                bpm: t.bpm ?? 0, key: t.key ?? '', genre: t.genre ?? undefined,
                filePath: t.file_path ?? undefined, isWishlist: false,
              })));
              if (page.length < PAGE) break;
              offset += PAGE;
            }
            if (allRows.length) {
              library = allRows;
              localStorage.setItem('sd_library', JSON.stringify(library));
            }
          }
        }
      } catch { /* fall through with what we have */ }
    }

    if (!library.length) { setCrateStatus('Upload your Serato library first so we can match file paths.'); return; }
    const tracks = libraryOnly ? setlist.tracks.filter(t => !t.isWishlistTrack) : setlist.tracks;
    const { paths, matched } = matchFilePaths(tracks, library);
    if (!paths.length) {
      const anyFound = tracks.some(t => library.find(l =>
        l.artist.toLowerCase() === t.artist.toLowerCase() && l.title.toLowerCase() === t.title.toLowerCase()
      ));
      setCrateStatus(anyFound
        ? 'Tracks found but no file paths — re-upload your Serato DB V2 file to restore export.'
        : 'No tracks matched. Re-upload your Serato DB V2 file.');
      return;
    }
    const gate = await gateExport('setlist', setlist.dbId ?? setlist.shareSlug, 'serato-crate');
    if (!gate.ok) { setCrateStatus(gate.message ?? 'Export limit reached'); return; }
    const data = buildCrate(paths);
    downloadCrate(data, setlist.name);
    setCrateStatus(null);
    setImportGuide({ platform: 'serato', matched, total: tracks.length });
  };

  const handleExportRekordbox = async () => {
    if (!setlist) return;
    setImportGuide(null);
    let library = getLibrary();

    // If localStorage is empty or stale, fetch fresh from Supabase
    if (!library.length || !library.some(t => t.filePath)) {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: lib } = await supabase.from('serato_libraries').select('id').eq('user_id', user.id).single();
          if (lib) {
            const PAGE = 1000;
            let offset = 0;
            const allRows: LibraryTrack[] = [];
            while (true) {
              const { data: page } = await supabase
                .from('serato_tracks')
                .select('id, artist, title, bpm, key, genre, file_path')
                .eq('library_id', lib.id)
                .order('artist')
                .range(offset, offset + PAGE - 1);
              if (!page?.length) break;
              allRows.push(...page.map(t => ({
                id: t.id, artist: t.artist ?? '', title: t.title ?? '',
                bpm: t.bpm ?? 0, key: t.key ?? '', genre: t.genre ?? undefined,
                filePath: t.file_path ?? undefined, isWishlist: false,
              })));
              if (page.length < PAGE) break;
              offset += PAGE;
            }
            if (allRows.length) {
              library = allRows;
              localStorage.setItem('sd_library', JSON.stringify(library));
            }
          }
        }
      } catch { /* fall through with what we have */ }
    }

    if (!library.length) { setCrateStatus('Upload your library first so we can match file paths.'); return; }
    const tracks = libraryOnly ? setlist.tracks.filter(t => !t.isWishlistTrack) : setlist.tracks;
    const { xml, matched } = buildRekordboxXml(setlist.name, tracks, library);
    if (!matched) { setCrateStatus('No tracks matched. Re-upload your library file in the Library tab.'); return; }
    const gate = await gateExport('setlist', setlist.dbId ?? setlist.shareSlug, 'rekordbox-xml');
    if (!gate.ok) { setCrateStatus(gate.message ?? 'Export limit reached'); return; }
    downloadRekordboxXml(xml, setlist.name);
    setCrateStatus(null);
    setImportGuide({ platform: 'rekordbox-xml', matched, total: setlist.tracks.length });
  };

  const handleExportM3u = async () => {
    if (!setlist) return;
    setImportGuide(null);
    let library = getLibrary();

    if (!library.length || !library.some(t => t.filePath)) {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: lib } = await supabase.from('serato_libraries').select('id').eq('user_id', user.id).single();
          if (lib) {
            const PAGE = 1000;
            let offset = 0;
            const allRows: LibraryTrack[] = [];
            while (true) {
              const { data: page } = await supabase
                .from('serato_tracks')
                .select('id, artist, title, bpm, key, genre, file_path')
                .eq('library_id', lib.id)
                .order('artist')
                .range(offset, offset + PAGE - 1);
              if (!page?.length) break;
              allRows.push(...page.map(t => ({
                id: t.id, artist: t.artist ?? '', title: t.title ?? '',
                bpm: t.bpm ?? 0, key: t.key ?? '', genre: t.genre ?? undefined,
                filePath: t.file_path ?? undefined, isWishlist: false,
              })));
              if (page.length < PAGE) break;
              offset += PAGE;
            }
            if (allRows.length) {
              library = allRows;
              localStorage.setItem('sd_library', JSON.stringify(library));
            }
          }
        }
      } catch { /* fall through */ }
    }

    if (!library.length) { setCrateStatus('Upload your library first so we can match file paths.'); return; }
    const tracks = libraryOnly ? setlist.tracks.filter(t => !t.isWishlistTrack) : setlist.tracks;
    const { m3u, matched } = buildM3u(setlist.name, tracks, library);
    if (!matched) { setCrateStatus('No tracks matched. Re-upload your library file in the Library tab.'); return; }
    const gate = await gateExport('setlist', setlist.dbId ?? setlist.shareSlug, 'm3u');
    if (!gate.ok) { setCrateStatus(gate.message ?? 'Export limit reached'); return; }
    downloadM3u(m3u, setlist.name);
    setCrateStatus(null);
    setImportGuide({ platform: 'rekordbox-m3u', matched, total: setlist.tracks.length });
  };

  const displayTracks = setlist
    ? toDisplayTracks(setlist.tracks, resolvedUrls, setlist.input?.primaryGenre)
    : SAMPLE_TRACKS;
  const handleRename = async (newName: string) => {
    const trimmed = newName.trim();
    setRenaming(false);
    if (!trimmed || !setlist) return;
    const updated = { ...setlist, name: trimmed };
    setSetlist(updated);
    sessionStorage.setItem('sd_current_setlist', JSON.stringify(updated));
    if (setlist.dbId) {
      const supabase = createClient();
      await supabase.from('setlists').update({ name: trimmed }).eq('id', setlist.dbId);
    }
  };

  const setlistName = setlist?.name ?? 'Friday Night Affair';
  const inp = setlist?.input;
  // Pool descriptor across the active axes (genre / era / artist) — genre may be
  // absent for era- or artist-defined sets.
  const genreLabel = inp
    ? ([
        inp.primaryGenre ? `${inp.primaryGenre}${inp.secondaryGenre ? ` / ${inp.secondaryGenre}` : ''}` : '',
        (inp.artists ?? []).join(', '),
        (inp.eras ?? []).map(d => `${d}s`).join(', '),
      ].filter(Boolean).join(' · ') || 'Mixed')
    : 'Afrobeats / Hip Hop';
  const crowdLabel = inp?.crowdContext ?? 'Club';
  const durationLabel = inp ? `${inp.durationMinutes} min` : '90 min';
  const slotLabel = inp?.lineupSlot ?? 'Headliner';
  const dateLabel = setlist?.generatedAt
    ? new Date(setlist.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Set Info rows for the shared SetView sidebar.
  const setInfo: [string, string][] = [
    ['Pool', genreLabel],
    ['Crowd', crowdLabel],
    ['Slot', slotLabel],
    ...(setlist?.libraryTracksUsed ? [['Library', `${setlist.libraryTracksUsed} tracks`] as [string, string]] : []),
    ...(setlist?.excludedCount ? [['Excluded', `${setlist.excludedCount} recent`] as [string, string]] : []),
  ];

  return (
    <div style={{ background:SD.bg, minHeight:'100vh', paddingTop:56, color:SD.text }}>
      <div className="sd-pad-x sd-inner-pad" style={{ maxWidth:1280, margin:'0 auto', padding:'48px 40px', animation:'sdFadeUp 0.5s ease both' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between',
          gap:24, flexWrap:'wrap', marginBottom:40 }}>
          <div>
            <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted,
              letterSpacing:2, textTransform:'uppercase', marginBottom:8 }}>Generated Set</div>
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => handleRename(renameValue)}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(renameValue); if (e.key === 'Escape') setRenaming(false); }}
                style={{ fontFamily:SD.display, fontSize:52, letterSpacing:4, color:SD.text,
                  background:'transparent', border:'none', borderBottom:`2px solid ${SD.accent}`,
                  outline:'none', padding:'0 2px', margin:'0 0 8px', lineHeight:1,
                  width: Math.max(200, renameValue.length * 32) }}
              />
            ) : (
              <h1
                title="Click to rename"
                onClick={() => { setRenaming(true); setRenameValue(setlistName); }}
                style={{ fontFamily:SD.display, fontSize:52, letterSpacing:4,
                  margin:'0 0 8px', color:SD.text, lineHeight:1, cursor:'text' }}
              >{setlistName.toUpperCase()}</h1>
            )}
            <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
              {[genreLabel, crowdLabel, durationLabel, slotLabel, dateLabel].map((v, i) => (
                <span key={i} style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec }}>
                  {i > 0 && <span style={{ color:SD.textMuted, marginRight:16 }}>·</span>}
                  {v}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-start' }}>
            <SDButton ghost onClick={() => setShowRegen(!showRegen)} style={{ fontSize:12, padding:'8px 16px' }}>
              Regenerate
            </SDButton>
            <SDButton ghost onClick={() => {
              const header = [
                setlistName,
                [genreLabel, crowdLabel, durationLabel, slotLabel].filter(Boolean).join(' · '),
              ].join('\n');
              const lines = displayTracks.map(t =>
                `${String(t.pos).padStart(2, '0')}  ${t.artist} — ${t.title}  [${t.bpm} BPM · ${t.key}]`
              );
              navigator.clipboard.writeText([header, '', ...lines, '', `Generated by ${BRAND.name} · ${BRAND.domain}`].join('\n'));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }} style={{ fontSize:12, padding:'8px 16px' }}>
              {copied ? '✓ Copied' : 'Copy List'}
            </SDButton>
            <SDButton ghost onClick={async () => {
              if (!shareUrl) return;
              if (!isPublic) {
                await handleMakePublic();
              } else {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
              }
            }} style={{ fontSize:12, padding:'8px 16px' }}>
              {copied ? '✓ Link Copied' : 'Share'}
            </SDButton>
            <SDButton style={{ fontSize:13, padding:'10px 24px' }} onClick={handleExportCrate}>
              Export Serato Crate
            </SDButton>
            <SDButton style={{ fontSize:13, padding:'10px 24px' }} onClick={handleExportM3u}>
              Export Rekordbox M3U
            </SDButton>
            <SDButton ghost style={{ fontSize:12, padding:'10px 16px' }} onClick={handleExportRekordbox}>
              XML
            </SDButton>
          </div>
        </div>

        {/* Library-only export toggle */}
        {setlist && setlist.tracks.some(t => t.isWishlistTrack) && (
          <div style={{ marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
            <button
              onClick={() => setLibraryOnly(v => !v)}
              style={{
                width:36, height:20, borderRadius:10, border:'none', cursor:'pointer', padding:2,
                background: libraryOnly ? SD.accent : SD.surface2,
                transition:'background .15s', position:'relative', flexShrink:0,
              }}>
              <span style={{
                display:'block', width:16, height:16, borderRadius:'50%',
                background: libraryOnly ? '#000' : SD.textMuted,
                transform: libraryOnly ? 'translateX(16px)' : 'translateX(0)',
                transition:'transform .15s',
              }}/>
            </button>
            <span style={{ fontFamily:SD.mono, fontSize:13, color: libraryOnly ? SD.text : SD.textSec }}>
              Export library tracks only
            </span>
            <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>
              ({setlist.tracks.filter(t => !t.isWishlistTrack).length} tracks — hides{' '}
              {setlist.tracks.filter(t => t.isWishlistTrack).length} wishlist tracks not yet purchased)
            </span>
          </div>
        )}

        {crateStatus && (
          <div style={{
            marginBottom: 20, padding: '12px 16px',
            background: crateStatus.startsWith('Downloaded') ? SD.greenDim : SD.accentDim,
            border: `1px solid ${crateStatus.startsWith('Downloaded') ? SD.green + '44' : SD.accent + '44'}`,
            borderRadius: 3, fontFamily: SD.mono, fontSize: 13,
            color: crateStatus.startsWith('Downloaded') ? SD.green : SD.accent,
          }}>
            {crateStatus}
          </div>
        )}

        {importGuide && (
          <ImportInstructions
            platform={importGuide.platform}
            name={setlist?.name ?? 'Your set'}
            matched={importGuide.matched}
            total={importGuide.total}
            kind="set"
            onDismiss={() => setImportGuide(null)}
          />
        )}

        {showRegen && (
          <div style={{ background:SD.surface, border:`1px solid ${SD.border}`,
            borderRadius:4, padding:'20px 24px', marginBottom:24,
            display:'flex', gap:12, alignItems:'center' }}>
            <input
              value={regenNote} onChange={e => setRegenNote(e.target.value)}
              placeholder={`e.g. "Make it darker", "More Afrobeats", "Slow down the peak"`}
              style={{ flex:1, background:SD.bg, border:`1px solid ${SD.border}`,
                borderRadius:3, padding:'10px 14px', color:SD.text,
                fontFamily:SD.mono, fontSize:12, outline:'none' }}
              onFocus={e => (e.target.style.borderColor = SD.accent)}
              onBlur={e => (e.target.style.borderColor = SD.border)}
            />
            <SDButton onClick={() => {
              if (setlist?.input) {
                sessionStorage.setItem('sd_builder_prefill', JSON.stringify(setlist.input));
              }
              setShowRegen(false);
              router.push('/builder');
            }}>Rebuild</SDButton>
          </div>
        )}

        <SetView
          tracks={displayTracks}
          reviewNotes={setlist?.reviewNotes}
          durationLabel={durationLabel}
          setInfo={setInfo}
          resolving={resolving}
          sidebarExtra={<>
            <div style={{ background:SD.surface, border:`1px solid ${SD.border}`,
              borderRadius:4, padding:'18px 20px' }}>
              <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:2,
                color:SD.textMuted, textTransform:'uppercase', marginBottom:12 }}>Share</div>
              {shareUrl ? (
                <>
                  <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent,
                    background:SD.accentDim, border:`1px solid ${SD.accent}33`,
                    borderRadius:3, padding:'10px 12px', wordBreak:'break-all' }}>
                    {shareUrl.replace(/^https?:\/\//, '')}
                  </div>
                  <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8 }}>
                    {isPublic ? (
                      <SDButton ghost full
                        onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                        style={{ fontSize:12 }}>
                        {copied ? '✓ Link Copied' : 'Copy Link'}
                      </SDButton>
                    ) : (
                      <SDButton ghost full onClick={handleMakePublic}
                        style={{ fontSize:12, opacity: making ? 0.6 : 1 }}>
                        {making ? 'Publishing...' : 'Make Public + Copy Link'}
                      </SDButton>
                    )}
                    {publishedFlash && (
                      <div style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        gap:8, padding:'8px 12px',
                        background:SD.successDim, border:`1px solid ${SD.success}44`,
                        borderRadius:SD.r2,
                      }}>
                        <span style={{ fontFamily:SD.mono, fontSize:11, color:SD.success, letterSpacing:.5 }}>
                          ✓ Live on Explore
                        </span>
                        <span onClick={() => router.push('/explore?highlight=' + (setlist?.dbSlug ?? ''))}
                          style={{ fontFamily:SD.mono, fontSize:11, color:SD.success, cursor:'pointer',
                            textDecoration:'underline', letterSpacing:.5 }}>
                          View →
                        </span>
                      </div>
                    )}
                    {setlist?.dbSlug && (
                      <SDButton ghost full onClick={() => router.push('/set/' + setlist.dbSlug)} style={{ fontSize:12 }}>
                        Preview ↗
                      </SDButton>
                    )}
                  </div>
                  <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${SD.border}` }}>
                    <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted,
                      letterSpacing:1.5, textTransform:'uppercase', marginBottom:10 }}>Badge</div>
                    <img src="/badge.svg" alt={`Built with ${BRAND.name}`} height={24}
                      style={{ display:'block', marginBottom:10 }} />
                    <div style={{ display:'flex', gap:6 }}>
                      {(['html', 'md'] as const).map(fmt => {
                        const origin = typeof window !== 'undefined' ? window.location.origin : `https://${BRAND.domain}`;
                        const link = setlist?.dbSlug ? `${origin}/set/${setlist.dbSlug}` : origin;
                        const badgeUrl = `${origin}/badge.svg`;
                        const snippet = fmt === 'html'
                          ? `<a href="${link}"><img src="${badgeUrl}" alt="Built with ${BRAND.name}" height="24"></a>`
                          : `[![Built with ${BRAND.name}](${badgeUrl})](${link})`;
                        return (
                          <button key={fmt} onClick={() => {
                            navigator.clipboard.writeText(snippet);
                            setBadgeCopied(fmt);
                            setTimeout(() => setBadgeCopied(null), 2000);
                          }} style={{
                            flex:1, fontFamily:SD.mono, fontSize:11, letterSpacing:1,
                            textTransform:'uppercase', padding:'6px 0',
                            background: badgeCopied === fmt ? SD.accentDim : 'transparent',
                            border:`1px solid ${badgeCopied === fmt ? SD.accent : SD.border}`,
                            borderRadius:2, cursor:'pointer',
                            color: badgeCopied === fmt ? SD.accent : SD.textMuted,
                            transition:'all .15s',
                          }}>
                            {badgeCopied === fmt ? '✓' : fmt.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : setlist ? (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted, lineHeight:1.7 }}>
                    Sign in to save and share this set.
                  </div>
                  <SDButton ghost full href="/login" style={{ fontSize:12 }}>
                    Sign In to Save
                  </SDButton>
                </div>
              ) : (
                <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted }}>
                  Generate a setlist to get a share link.
                </div>
              )}
            </div>

            {setlist?.dbId && (
              <div style={{ background:SD.surface, border:`1px solid ${SD.border}`,
                borderRadius:4, padding:'18px 20px' }}>
                <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:2,
                  color:SD.textMuted, textTransform:'uppercase', marginBottom:12 }}>Gig Log</div>
                {gigLogged ? (
                  <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.green }}>✓ Gig logged</div>
                ) : showGigForm ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <input
                      type="date"
                      value={gigDate}
                      onChange={e => setGigDate(e.target.value)}
                      style={{ background:SD.bg, border:`1px solid ${SD.border}`, borderRadius:3,
                        padding:'8px 12px', color:SD.text, fontFamily:SD.mono, fontSize:13,
                        outline:'none', width:'100%', boxSizing:'border-box' }}
                    />
                    <input
                      value={gigVenue}
                      onChange={e => setGigVenue(e.target.value)}
                      placeholder="Venue (optional)"
                      style={{ background:SD.bg, border:`1px solid ${SD.border}`, borderRadius:3,
                        padding:'8px 12px', color:SD.text, fontFamily:SD.mono, fontSize:13,
                        outline:'none', width:'100%', boxSizing:'border-box' }}
                      onFocus={e => (e.target.style.borderColor = SD.accent)}
                      onBlur={e => (e.target.style.borderColor = SD.border)}
                    />
                    <div style={{ display:'flex', gap:8 }}>
                      <SDButton onClick={handleLogGig} style={{ flex:1, fontSize:12, opacity: loggingGig ? 0.6 : 1 }}>
                        {loggingGig ? 'Logging...' : 'Log Gig'}
                      </SDButton>
                      <SDButton ghost onClick={() => setShowGigForm(false)} style={{ fontSize:12, padding:'8px 12px' }}>
                        Cancel
                      </SDButton>
                    </div>
                  </div>
                ) : (
                  <SDButton ghost full onClick={() => setShowGigForm(true)} style={{ fontSize:12 }}>
                    Mark as Played
                  </SDButton>
                )}
              </div>
            )}
          </>}
        />
      </div>
    </div>
  );
}
