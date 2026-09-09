'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { SD, CROWD_TYPES, LINEUP_SLOTS, DURATION_OPTS, DECADES, LIBRARY_TRACKS } from '@/lib/setdrop/constants';
import { GeneratedSetlist } from '@/lib/agents/types';
import { SDButton, GenreCombobox, GenrePillSelector, SDInput, AgentProgress, PageHeader } from './shared';
import { trackEvent } from '@/lib/analytics';
import { superFamily } from '@/lib/setdrop/genre';
import { CURATE_HEADROOM, classifyReadiness, targetTrackCount, type ReadinessResult } from '@/lib/setdrop/readiness';
import * as Sentry from '@sentry/nextjs';

// Axis context that defines the candidate pool. Mirrors the server-side axes on
// SetlistInput (genre / era / artist / playlist).
interface PoolCtx { primaryGenre: string; eras: number[]; artists: string[]; playlistName?: string }

/** Human phrase for the active pool axes, e.g. "pop from the 2000s", "tracks by
 *  Drake". Client mirror of pipeline.ts `poolDescription`. */
function poolLabelClient(ctx: PoolCtx): string {
  const decades = [...new Set(ctx.eras)].sort((a, b) => a - b).map(d => `${d}s`);
  const eraStr = decades.length
    ? (decades.length === 1 ? `the ${decades[0]}` : `the ${decades.slice(0, -1).join(', ')} & ${decades[decades.length - 1]}`)
    : '';
  const artistStr = ctx.artists.length
    ? (ctx.artists.length === 1 ? ctx.artists[0] : `${ctx.artists.slice(0, -1).join(', ')} & ${ctx.artists[ctx.artists.length - 1]}`)
    : '';
  const segs: string[] = [];
  if (ctx.primaryGenre) segs.push(ctx.primaryGenre);
  if (artistStr) segs.push(`${ctx.primaryGenre ? '' : 'tracks '}by ${artistStr}`.trim());
  if (eraStr) segs.push(`from ${eraStr}`);
  if (ctx.playlistName) segs.push(`${segs.length ? 'within ' : ''}"${ctx.playlistName}" playlist`);
  return segs.join(' ').trim() || 'your library';
}

// Presentation for the pre-gen "set readiness" hint — turns a ReadinessResult into
// a colored dot + honest, headroom-framed copy (mirrors the backend's phrasing so
// the pre-gen hint and the post-gen notes agree). Returns null when there's nothing
// to show (unknown status / no result yet).
function readinessView(
  r: ReadinessResult | null,
  ctx: PoolCtx,
  durationLabel: string,
): { fg: string; bg: string; border: string; text: string } | null {
  if (!r || r.status === 'unknown') return null;
  const { counts, target, threshold, status } = r;
  const { primaryGenre, eras, artists, playlistName } = ctx;
  const genreActive = !!primaryGenre;
  const eraActive = eras.length > 0;
  const sf = genreActive ? superFamily(primaryGenre) : 'other'; // 'electronic' | 'open-format' | 'other'
  const adjWord = sf === 'other' ? 'related' : sf;
  const tones = {
    red:   { fg: SD.danger,  bg: SD.dangerDim,  border: `${SD.danger}33` },
    amber: { fg: SD.warning, bg: SD.warningDim, border: `${SD.warning}33` },
    green: { fg: SD.success, bg: SD.successDim, border: `${SD.success}33` },
  } as const;

  // Playlist mode: the curated playlist IS the pool. Copy is about its size vs the
  // set length (optionally noting that other axes narrow it).
  if (playlistName) {
    const otherAxes = genreActive || eraActive || artists.length > 0;
    const n = counts.usable;
    const noun = `track${n === 1 ? '' : 's'}`;
    const where = otherAxes ? `match your filters in "${playlistName}"` : `in "${playlistName}"`;
    const text = status === 'red'
      ? `Only ${n} ${noun} ${where} — below the ~${target} needed to fill ${durationLabel}. ${otherAxes ? 'Loosen a filter' : 'Add more tracks to the playlist'}, or shorten the set.`
      : status === 'amber'
        ? `${n} ${noun} ${where} for a ~${target}-track set — it'll work, but there's little room to vary the set next time.`
        : `${n} ${noun} ${where} — plenty of room to build a ~${target}-track set.`;
    return { ...tones[status], text };
  }

  // Artist-anchored + thin pool: generation auto-fills from Last.fm similar artists,
  // so set that expectation instead of a dead-end RED. (Readiness itself doesn't call
  // Last.fm — it's a cheap debounced check — so this is the honest forward-looking copy.)
  if (artists.length && counts.usable < target) {
    const n = counts.usable;
    const anchorLabel = artists.length === 1
      ? artists[0]
      : `${artists.slice(0, -1).join(', ')} & ${artists[artists.length - 1]}`;
    return { ...tones.amber, text: `Only ${n} track${n === 1 ? '' : 's'} by ${anchorLabel} in your library — SetLab will fill the rest with similar artists.` };
  }

  const label = poolLabelClient({ primaryGenre, eras, artists });
  let text: string;
  if (status === 'red') {
    const floorHit = genreActive && sf !== 'other' && counts.superFamily < threshold;
    const n = floorHit ? counts.superFamily : counts.usable;
    text = `Only ${n} track${n === 1 ? '' : 's'} match ${label} — below the ~${target} needed to fill ${durationLabel}. Loosen a filter or shorten the set.`;
  } else if (status === 'amber') {
    if (counts.usable < target * CURATE_HEADROOM) {
      text = `${counts.usable} tracks match ${label} for a ~${target}-track set — it'll work, but you'll use almost all of them, leaving little to swap or vary next time.`;
    } else if (eraActive && counts.withYear < target * CURATE_HEADROOM) {
      text = `Only ${counts.withYear} of your matched tracks have release-year data — this era filter may come up short. Re-sync your library for year metadata, or add a genre.`;
    } else if (genreActive) {
      text = `You have ${counts.exact} true ${primaryGenre} track${counts.exact === 1 ? '' : 's'} — this set will lean on adjacent ${adjWord} genres. More ${primaryGenre} = a truer set.`;
    } else {
      text = `${counts.usable} tracks match ${label} for a ~${target}-track set — it'll work, but with little room to vary next time.`;
    }
  } else {
    text = `${counts.usable} tracks match ${label} for a ~${target}-track set — plenty of room to curate.`;
  }
  return { ...tones[status], text };
}

export function SetlistBuilder() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState<{ tier: string; reason: string; limit?: number } | null>(null);

  const [mixName, setMixName] = useState('');
  const [primaryGenre, setPrimaryGenre] = useState('');
  const [secondaryGenre, setSecondaryGenre] = useState('');
  // Era + artist pool axes (combinable with genre/playlist — see poolLabelClient).
  const [eras, setEras] = useState<number[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [artistInput, setArtistInput] = useState('');
  const [vibe, setVibe] = useState('');
  const [crowd, setCrowd] = useState('');
  const [duration, setDuration] = useState('');
  const [slot, setSlot] = useState('');

  const [arcPoints, setArcPoints] = useState([3, 6, 9, 7, 4]);
  const arcLabels = ['Intro','Buildup','Peak','Sustain','Cooldown'];
  const arcPresets: Record<string, number[]> = {
    'Slow Burn': [2, 4, 7, 8, 5],
    'Peak Hour': [5, 7, 9, 9, 6],
    'Warm Down': [7, 6, 5, 4, 2],
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const [seedSearch, setSeedSearch] = useState('');
  const [soundcloudUrl, setSoundcloudUrl] = useState('');
  const [wordplay, setWordplay] = useState('');
  const [venueName, setVenueName] = useState('');
  const [cleanOnly, setCleanOnly] = useState(false);

  const [libraryCount, setLibraryCount] = useState<number | null>(null);
  const [libraryTracks, setLibraryTracks] = useState<{ artist: string; title: string; bpm: number; key: string }[]>([]);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // Imported Rekordbox playlists (crates). When present, the DJ can build a set
  // scoped to one of them; sourcePlaylist=null means "whole library, genre-filtered".
  const [playlists, setPlaylists] = useState<{ name: string; count: number }[]>([]);
  const [sourcePlaylist, setSourcePlaylist] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createClient();
    void Promise.resolve(
      supabase.from('serato_crates').select('crate_name, track_count')
    ).then(({ data }) => {
      if (!data?.length) return;
      setPlaylists(
        data
          .filter((c): c is { crate_name: string; track_count: number } => !!c.crate_name)
          .map(c => ({ name: c.crate_name, count: c.track_count ?? 0 }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    }).catch(() => {});
  }, []);
  useEffect(() => {
    // Try localStorage first (legacy — may not be populated after new upload flow)
    try {
      const raw = localStorage.getItem('sd_library');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setLibraryCount(parsed.length);
          setLibraryTracks(parsed.map((t: { artist: string; title: string; bpm: number; key: string }) => ({
            artist: t.artist, title: t.title, bpm: t.bpm, key: t.key,
          })));
          return;
        }
      }
    } catch { /* ignore */ }

    // Fallback: fetch real count from Supabase (populated by the new upload flow)
    const supabase = createClient();
    void Promise.resolve(
      supabase.from('serato_libraries').select('total_tracks').single()
    ).then(({ data }) => {
      if (data?.total_tracks) setLibraryCount(data.total_tracks);
    }).catch(() => {});
  }, []);

  // Live "set readiness": as the DJ picks genre + duration, check whether their
  // library has enough tracks (with curation headroom) for that set — BEFORE they
  // spend a generation. Skipped in demo mode (no real library). Debounced + aborted
  // so rapid genre/duration changes don't race.
  useEffect(() => {
    // Playlist mode: we already know the pool size (the crate's count), so judge
    // readiness locally — no API round-trip, and genre is irrelevant here.
    if (sourcePlaylist) {
      const pl = playlists.find(p => p.name === sourcePlaylist);
      if (!pl || !duration) { setReadiness(null); return; }
      const target = targetTrackCount(parseInt(duration) || 60, primaryGenre || undefined);
      setReadiness(classifyReadiness(
        { exact: pl.count, family: 0, adjacent: 0, superFamily: pl.count, usable: pl.count, withYear: pl.count, poolTotal: pl.count },
        target, true,
      ));
      return;
    }
    const hasAxis = !!(primaryGenre || eras.length || artists.length);
    if (!hasAxis || !duration || !libraryCount) { setReadiness(null); return; }
    const durationMinutes = parseInt(duration) || 60;
    const ctrl = new AbortController();
    setReadinessLoading(true);
    const timer = setTimeout(() => {
      fetch('/api/library/set-readiness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryGenre: primaryGenre || undefined,
          secondaryGenre: secondaryGenre || undefined,
          eras: eras.length ? eras : undefined,
          artists: artists.length ? artists : undefined,
          durationMinutes,
        }),
        signal: ctrl.signal,
      })
        .then(r => (r.ok ? (r.json() as Promise<ReadinessResult>) : null))
        .then(res => { if (res) setReadiness(res); })
        .catch(() => { /* aborted or network error — keep prior state */ })
        .finally(() => setReadinessLoading(false));
    }, 400);
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [sourcePlaylist, playlists, primaryGenre, secondaryGenre, eras, artists, duration, libraryCount]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('sd_builder_prefill');
      if (!raw) return;
      sessionStorage.removeItem('sd_builder_prefill');
      const p = JSON.parse(raw) as Record<string, unknown>;
      if (typeof p.primaryGenre === 'string') setPrimaryGenre(p.primaryGenre);
      if (typeof p.secondaryGenre === 'string') setSecondaryGenre(p.secondaryGenre);
      if (Array.isArray(p.eras)) setEras(p.eras.filter((x): x is number => typeof x === 'number'));
      if (Array.isArray(p.artists)) setArtists(p.artists.filter((x): x is string => typeof x === 'string'));
      if (typeof p.crowdContext === 'string') setCrowd(p.crowdContext);
      if (typeof p.durationMinutes === 'number') setDuration(String(p.durationMinutes));
      if (typeof p.lineupSlot === 'string') setSlot(p.lineupSlot);
      if (typeof p.mixName === 'string') setMixName(p.mixName);
      if (typeof p.vibe === 'string') setVibe(p.vibe);
      if (typeof p.venueName === 'string') setVenueName(p.venueName);
      if (Array.isArray(p.arcPoints) && p.arcPoints.length === 5) setArcPoints(p.arcPoints as number[]);
      if (typeof p.seedSearch === 'string') setSeedSearch(p.seedSearch);
      if (typeof p.soundcloudUrl === 'string') setSoundcloudUrl(p.soundcloudUrl);
      if (typeof p.wordplay === 'string') setWordplay(p.wordplay);
    } catch { /* ignore */ }
  }, []);

  const GEN_STEPS = [
    'Analyzing your library...',
    'Gathering gig intel...',
    'Architecting the set structure...',
    'Selecting and sequencing tracks...',
    'Reviewing transitions and flow...',
  ];

  const handleArcMouseDown = (i: number, e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = i;
  };
  const handleArcMouseMove = (e: React.MouseEvent) => {
    if (dragging.current === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const raw = (e.clientY - rect.top) / rect.height;
    const energy = Math.max(0, Math.min(10, Math.round(10 - raw * 10)));
    setArcPoints(prev => prev.map((p, i) => i === dragging.current ? energy : p));
  };
  const handleArcMouseUp = () => { dragging.current = null; };

  const handleArcTouchStart = (i: number, e: React.TouchEvent) => {
    e.preventDefault();
    dragging.current = i;
  };
  const handleArcTouchMove = (e: React.TouchEvent) => {
    if (dragging.current === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const touch = e.touches[0];
    const rect = svg.getBoundingClientRect();
    const raw = (touch.clientY - rect.top) / rect.height;
    const energy = Math.max(0, Math.min(10, Math.round(10 - raw * 10)));
    setArcPoints(prev => prev.map((p, i) => i === dragging.current ? energy : p));
  };
  const handleArcTouchEnd = () => { dragging.current = null; };

  const runGeneration = async () => {
    setGenerating(true);
    setGenStep(0);
    setGenError(null);
    setRateLimited(null);

    const durationMinutes = parseInt(duration) || 60;
    trackEvent.setGenerationStarted(primaryGenre || 'unknown', durationMinutes);

    const requestBody = JSON.stringify({
      input: {
        name: mixName || 'Untitled Set',
        primaryGenre: primaryGenre || undefined,
        secondaryGenre: secondaryGenre || undefined,
        eras: eras.length ? eras : undefined,
        artists: artists.length ? artists : undefined,
        vibe: vibe || undefined,
        crowdContext: crowd,
        durationMinutes,
        energyArc: {
          intro: arcPoints[0], buildup: arcPoints[1], peak: arcPoints[2],
          sustain: arcPoints[3], cooldown: arcPoints[4],
        },
        lineupSlot: slot,
        sourcePlaylist: sourcePlaylist || undefined,
        seedTracks: seedSearch ? [seedSearch] : undefined,
        wordplayTheme: wordplay || undefined,
        venueContext: venueName || undefined,
        cleanOnly: cleanOnly || undefined,
      },
    });
    const doGenerateFetch = () => fetch('/api/generate-setlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
    });

    let res: Response;
    try {
      try {
        res = await doGenerateFetch();
      } catch (firstErr) {
        // A single connection-level failure (deploy switchover, a flaky mobile
        // moment) shouldn't dump the DJ to an error screen for an expensive action.
        // Retry the connect ONCE after a short backoff before surfacing it. The
        // request hasn't been read yet, so this only re-attempts the connection.
        Sentry.captureException(firstErr, { tags: { flow: 'generate-setlist', phase: 'fetch-retry' } });
        await new Promise(r => setTimeout(r, 900));
        res = await doGenerateFetch();
      }
    } catch (err) {
      setGenerating(false);
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setGenError(`Network error — check your connection and try again. (${detail})`);
      Sentry.captureException(err, { tags: { flow: 'generate-setlist', phase: 'fetch' } });
      trackEvent.setGenerationFailed('network', primaryGenre || undefined);
      return;
    }

    if (res.status === 429) {
      const data = await res.json().catch(() => ({ tier: 'free', error: 'daily_limit' })) as { tier: string; error?: string; limit?: number };
      setGenerating(false);
      setRateLimited({ tier: data.tier, reason: data.error ?? 'daily_limit', limit: data.limit });
      trackEvent.setGenerationFailed('rate_limited', primaryGenre || undefined);
      return;
    }

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setGenerating(false);
      setGenError(data.error || `HTTP ${res.status}`);
      trackEvent.setGenerationFailed('http_error', primaryGenre || undefined);
      return;
    }

    // Read SSE stream — progress events update the UI in real time
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalSetlist: GeneratedSetlist | null = null;
    let excludedCount = 0;
    let libraryTracksUsed = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() ?? '';
        for (const msg of messages) {
          if (!msg.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(msg.slice(6)) as
              | { type: 'step'; step: number; message: string }
              | { type: 'complete'; setlist: GeneratedSetlist; excludedCount: number; libraryTracksUsed: number }
              | { type: 'error'; message: string };
            if (event.type === 'step') {
              setGenStep(event.step);
            } else if (event.type === 'complete') {
              finalSetlist = event.setlist;
              excludedCount = event.excludedCount;
              libraryTracksUsed = event.libraryTracksUsed;
              setGenStep(GEN_STEPS.length);
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input') throw e;
          }
        }
      }
    } catch (err) {
      setGenerating(false);
      setGenError(err instanceof Error ? err.message : 'Generation failed. Check your ANTHROPIC_API_KEY.');
      Sentry.captureException(err, { tags: { flow: 'generate-setlist', phase: 'stream' } });
      trackEvent.setGenerationFailed('stream_error', primaryGenre || undefined);
      return;
    }

    if (!finalSetlist) {
      setGenerating(false);
      setGenError('Generation completed but no setlist was returned.');
      trackEvent.setGenerationFailed('empty_response', primaryGenre || undefined);
      return;
    }

    if (!finalSetlist.tracks?.length) {
      setGenerating(false);
      setGenError('No tracks were selected — the AI response may have been truncated. Please try again.');
      trackEvent.setGenerationFailed('truncated', primaryGenre || undefined);
      return;
    }

    // Persist to Supabase if authenticated
    let savedId: string | undefined;
    let savedSlug: string | undefined;
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const crowdVal = crowd.toLowerCase().replace(' ', '-') as
          'club' | 'lounge' | 'wedding' | 'festival' | 'house-party' | 'radio' | 'corporate';
        const slotVal = slot.toLowerCase() as 'opener' | 'middle' | 'headliner' | 'closing';
        const base = (finalSetlist.shareSlug || finalSetlist.name)
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        savedSlug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
        const { data: saved } = await supabase.from('setlists').insert({
          user_id: user.id,
          name: finalSetlist.name,
          primary_genre: primaryGenre || null,
          secondary_genre: secondaryGenre || null,
          crowd_context: crowdVal,
          duration_minutes: durationMinutes as 30 | 60 | 90 | 120 | 180,
          lineup_slot: slotVal,
          energy_arc: { intro: arcPoints[0], buildup: arcPoints[1], peak: arcPoints[2], sustain: arcPoints[3], cooldown: arcPoints[4] },
          is_public: false,
          share_url: savedSlug,
          tracks_json: finalSetlist.tracks,
          review_notes: finalSetlist.reviewNotes || null,
        }).select('id').single();
        savedId = saved?.id;
      }
    } catch { /* non-fatal */ }

    // Email the user a link to their set (non-blocking)
    if (savedId) {
      fetch('/api/setlist/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setlistId: savedId }),
      }).catch(() => {});
    }

    trackEvent.setGenerated(
      primaryGenre || 'unknown',
      finalSetlist.tracks.length,
      durationMinutes as number,
    );

    setTimeout(() => {
      sessionStorage.setItem('sd_current_setlist', JSON.stringify({
        ...finalSetlist,
        dbId: savedId,
        dbSlug: savedSlug,
        generatedAt: new Date().toISOString(),
        excludedCount,
        libraryTracksUsed,
        input: {
          primaryGenre: primaryGenre || undefined, secondaryGenre: secondaryGenre || undefined,
          eras: eras.length ? eras : undefined, artists: artists.length ? artists : undefined,
          crowdContext: crowd,
          durationMinutes, lineupSlot: slot,
          mixName: mixName || undefined, vibe: vibe || undefined, venueName: venueName || undefined,
          arcPoints, seedSearch: seedSearch || undefined,
          soundcloudUrl: soundcloudUrl || undefined, wordplay: wordplay || undefined,
        },
      }));
      router.push('/output');
    }, 400);
  };

  // Commit any text still sitting in the artist input into a chip. The chip is only
  // added on Enter/comma, so a DJ who types an artist and clicks Continue would
  // otherwise lose it (and fail the "at least one axis" gate). Flush on blur + Continue.
  const commitArtistInput = () => {
    const name = artistInput.trim().replace(/,$/, '').trim();
    setArtistInput('');
    if (name && !artists.some(x => x.toLowerCase() === name.toLowerCase())) {
      setArtists(prev => [...prev, name]);
    }
  };

  const stepValid = (s: number) => {
    // The pool must be defined by at least one axis: genre, era, artist, or playlist.
    // A typed-but-not-yet-added artist counts (it's committed when advancing).
    if (s === 1) {
      const hasAxis = !!(sourcePlaylist || primaryGenre || eras.length || artists.length || artistInput.trim());
      return hasAxis && !!crowd && !!duration && !!slot;
    }
    return true;
  };

  function StepIndicator() {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:48 }}>
        {[1,2,3].map((n, i) => (
          <React.Fragment key={n}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{
                width:32, height:32, borderRadius:'50%',
                display:'flex', alignItems:'center', justifyContent:'center',
                background: step > n ? SD.accentDim : step === n ? SD.accent : SD.surface2,
                border:`1px solid ${step >= n ? SD.accent : SD.border}`,
                transition:'all .2s',
              }}>
                {step > n
                  ? <span style={{ color:SD.accent, fontSize:13 }}>✓</span>
                  : <span style={{ fontFamily:SD.mono, fontSize:13,
                      color: step === n ? '#000' : SD.textMuted }}>{n}</span>
                }
              </div>
              <span style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:1.5,
                textTransform:'uppercase', color: step === n ? SD.accent : SD.textMuted }}>
                {['Gig Context','Energy Arc','Seeds'][i]}
              </span>
            </div>
            {i < 2 && (
              <div style={{ flex:1, height:1, marginBottom:24,
                background: step > n+1 ? SD.accent : step > n ? `linear-gradient(90deg,${SD.accent},${SD.border})` : SD.border,
                margin:'0 8px 24px',
              }}/>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  function ArcBuilder() {
    const W = 560, H = 220, px = 48, py = 24;
    const cw = W - px*2, ch = H - py*2;
    const n = arcPoints.length;
    const pts = arcPoints.map((e, i) => [px + (i/(n-1))*cw, py + ch - (e/10)*ch]);
    const d = pts.reduce((a, p, i) => {
      if (i === 0) return `M${p[0]},${p[1]}`;
      const pr = pts[i-1], cx = (pr[0]+p[0])/2;
      return a + ` C${cx},${pr[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
    }, '');
    const fill = d + ` L${pts[n-1][0]},${py+ch} L${px},${py+ch}Z`;
    return (
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ display:'block', cursor: dragging.current !== null ? 'ns-resize' : 'default', userSelect:'none', touchAction:'none' }}
        onMouseMove={handleArcMouseMove}
        onMouseUp={handleArcMouseUp}
        onMouseLeave={handleArcMouseUp}
        onTouchMove={handleArcTouchMove}
        onTouchEnd={handleArcTouchEnd}>
        <defs>
          <linearGradient id="builderArcFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SD.accent} stopOpacity="0.2"/>
            <stop offset="100%" stopColor={SD.accent} stopOpacity="0.01"/>
          </linearGradient>
        </defs>
        {[0,2,4,6,8,10].map(v => {
          const y = py + ch - (v/10)*ch;
          return (
            <g key={v}>
              <line x1={px} y1={y} x2={px+cw} y2={y} stroke={SD.border} strokeWidth={.5}/>
              <text x={px-8} y={y+4} textAnchor="end" fill={SD.textMuted}
                fontSize={9} fontFamily="var(--font-mono),monospace">{v}</text>
            </g>
          );
        })}
        <path d={fill} fill="url(#builderArcFill)"/>
        <path d={d} fill="none" stroke={SD.accent} strokeWidth={2}/>
        {pts.map((pt, i) => (
          <g key={i} style={{ cursor:'ns-resize' }} onMouseDown={e => handleArcMouseDown(i, e)} onTouchStart={e => handleArcTouchStart(i, e)}>
            <circle cx={pt[0]} cy={pt[1]} r={10} fill="transparent"/>
            <circle cx={pt[0]} cy={pt[1]} r={5} fill={SD.accent} stroke={SD.bg} strokeWidth={2}/>
            <text x={pt[0]} y={py+ch+16} textAnchor="middle"
              fill={SD.textSec} fontSize={9} fontFamily="var(--font-mono),monospace">
              {arcLabels[i]}
            </text>
            <text x={pt[0]} y={pt[1]-10} textAnchor="middle"
              fill={SD.accent} fontSize={9} fontFamily="var(--font-mono),monospace">{arcPoints[i]}</text>
          </g>
        ))}
      </svg>
    );
  }

  const fieldStyle: React.CSSProperties = { display:'flex', flexDirection:'column', gap:6 };
  const labelStyle: React.CSSProperties = { fontFamily:SD.mono, fontSize:12, color:SD.textSec,
    letterSpacing:2, textTransform:'uppercase' };

  if (rateLimited) {
    return (
      <div style={{ background:SD.bg, minHeight:'100vh', paddingTop:56,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div className="sd-pad-x" style={{ maxWidth:480, width:'100%', padding:'0 40px', textAlign:'center', animation:'sdFadeUp 0.5s ease both' }}>
          <div style={{ fontFamily:SD.display, fontSize:40, letterSpacing:4, color:SD.accent, marginBottom:8 }}>
            DAILY LIMIT REACHED
          </div>
          <div style={{ fontFamily:SD.body, fontSize:15, color:SD.textSec, lineHeight:1.8, marginBottom:32 }}>
            {rateLimited.reason === 'cost_limit'
              ? "You've hit today's usage limit — it resets tomorrow."
              : `You've hit today's generation limit${rateLimited.limit ? ` (${rateLimited.limit}/day)` : ''} — it resets tomorrow.`}{' '}
            Generating sets is free and unlimited on Pro, with no daily limits.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <SDButton onClick={() => router.push('/account')} style={{ fontSize:13, padding:'14px 40px' }}>
              Upgrade to Pro
            </SDButton>
            <SDButton ghost onClick={() => { setRateLimited(null); setGenerating(false); }}
              style={{ fontSize:13, padding:'10px 24px' }}>
              ← Back to Builder
            </SDButton>
          </div>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div style={{ background:SD.bg, minHeight:'100vh', paddingTop:56,
        display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div className="sd-pad-x" style={{ maxWidth:480, width:'100%', padding:'0 40px', animation:'sdFadeUp 0.5s ease both' }}>
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div style={{ fontFamily:SD.display, fontSize:56, letterSpacing:4,
              color:SD.text, marginBottom:8 }}>BUILDING</div>
            <div style={{ fontFamily:SD.display, fontSize:56, letterSpacing:4, color:SD.accent }}>YOUR SET</div>
            <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec, marginTop:16 }}>
              {mixName || 'New Set'} · {primaryGenre || 'Mixed'} · {duration || '60 min'}
            </div>
          </div>
          <AgentProgress steps={GEN_STEPS} currentStep={genStep} />
          <div style={{ marginTop:48, height:2, background:SD.surface2, borderRadius:2, overflow:'hidden' }}>
            <div style={{
              height:'100%', background:SD.accent, borderRadius:2,
              width:'100%',
              transform:`scaleX(${genStep / GEN_STEPS.length})`,
              transformOrigin:'left',
              transition:'transform 4s ease',
            }}/>
          </div>
          <div style={{ marginTop:20, fontFamily:SD.mono, fontSize:SD.t11, color:SD.textMuted, textAlign:'center', lineHeight:1.7 }}>
            This takes about 30–60 seconds.<br/>
            We&apos;ll email you a link when it&apos;s ready — just stay on this tab.
          </div>
          {genError && (
            <div style={{ marginTop:32, background:SD.redDim, border:`1px solid ${SD.red}44`,
              borderRadius:3, padding:'16px 20px', fontFamily:SD.mono, fontSize:12, color:SD.red,
              lineHeight:1.6 }}>
              ⚠ {genError}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background:SD.bg, minHeight:'100vh', paddingTop:56, color:SD.text }}>
      <div className="sd-pad-x sd-inner-pad" style={{ maxWidth:800, margin:'0 auto', padding:'48px 40px', animation:'sdFadeUp 0.5s ease both' }}>
        <PageHeader eyebrow="Setlist Builder" title="PLAN YOUR SET" subtitle="An ordered set for one gig — sequenced start to finish, with transitions and an energy arc." />

        {/* Library status banner */}
        <div style={{ marginBottom:24, padding:'12px 16px', borderRadius:3,
          background: libraryCount ? SD.greenDim : SD.surface,
          border:`1px solid ${libraryCount ? `${SD.green}33` : SD.border}`,
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
              background: libraryCount ? SD.green : SD.textMuted, display:'inline-block',
              boxShadow: libraryCount ? `0 0 6px ${SD.green}` : 'none' }}/>
            <span style={{ fontFamily:SD.mono, fontSize:12, color: libraryCount ? SD.text : SD.textMuted }}>
              {libraryCount
                ? `Building from your library — ${libraryCount.toLocaleString()} tracks`
                : 'No library uploaded — will use demo tracks'}
            </span>
          </div>
          <span onClick={() => router.push('/library')} style={{
            fontFamily:SD.mono, fontSize:12, letterSpacing:1.5, textTransform:'uppercase',
            color:SD.accent, cursor:'pointer', textDecoration:'underline',
          }}>
            {libraryCount ? 'Manage Library' : 'Upload CSV →'}
          </span>
        </div>

        <StepIndicator />

        {/* Step 1 */}
        {step === 1 && (
          <div style={{ display:'flex', flexDirection:'column', gap:32 }}>
            <div className="sd-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <SDInput label="Mix Name" value={mixName} onChange={setMixName}
                placeholder="e.g. Friday Night Affair" />
              <SDInput label="Venue Name (optional — Gig Intel)" value={venueName}
                onChange={setVenueName} placeholder="e.g. Fabric, London" />
            </div>
            {playlists.length > 0 && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Track Source</label>
                <div style={{ display:'flex', borderRadius:3, overflow:'hidden', border:`1px solid ${SD.border}` }}>
                  {([['library','Whole Library'],['playlist','From a Playlist']] as const).map(([mode, label], i) => {
                    const active = mode === 'playlist' ? !!sourcePlaylist : !sourcePlaylist;
                    return (
                      <button key={mode} type="button"
                        onClick={() => setSourcePlaylist(mode === 'playlist' ? (sourcePlaylist ?? playlists[0]?.name ?? null) : null)}
                        style={{
                          flex:1, fontFamily:SD.mono, fontSize:13, letterSpacing:.5,
                          border:'none', borderLeft: i > 0 ? `1px solid ${SD.border}` : 'none',
                          background: active ? SD.accent : SD.surface2,
                          color: active ? '#000' : SD.textSec,
                          padding:'9px 4px', cursor:'pointer', transition:'all .12s',
                        }}>{label}</button>
                    );
                  })}
                </div>
                {sourcePlaylist && (
                  <select value={sourcePlaylist} onChange={e => setSourcePlaylist(e.target.value)}
                    style={{
                      marginTop:10, width:'100%', fontFamily:SD.mono, fontSize:13,
                      background:SD.surface2, color:SD.text, border:`1px solid ${SD.border}`,
                      borderRadius:3, padding:'9px 10px', cursor:'pointer',
                    }}>
                    {playlists.map(p => (
                      <option key={p.name} value={p.name}>{p.name} ({p.count} track{p.count === 1 ? '' : 's'})</option>
                    ))}
                  </select>
                )}
                <p style={{ fontFamily:SD.mono, fontSize:11, lineHeight:1.6, color:SD.textMuted, margin:'8px 0 0' }}>
                  {sourcePlaylist
                    ? `SetDrop arranges a set within your "${sourcePlaylist}" playlist. Add a genre, era, or artist below to narrow it further.`
                    : 'SetDrop picks from your whole library. Define the pool with any combination of genre, era, and artist below.'}
                </p>
              </div>
            )}
            {/* Pool definition — genre / era / artist are all optional and combine (AND).
                At least one axis (or a playlist above) is required to continue. */}
            {(() => {
              const hasAxis = !!(sourcePlaylist || primaryGenre || eras.length || artists.length || artistInput.trim());
              return (
                <p style={{ fontFamily:SD.mono, fontSize:11, lineHeight:1.6,
                  color: hasAxis ? SD.textMuted : SD.accent, margin:'0 0 -8px' }}>
                  Define your pool by any combination below — genre, era, and/or artist.
                  {hasAxis ? '' : ' Pick at least one to continue.'}
                </p>
              );
            })()}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Primary Genre <span style={{ color:SD.textMuted, fontWeight:400 }}>(optional)</span>
              </label>
              <GenreCombobox value={primaryGenre} onChange={setPrimaryGenre} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Secondary Genre (optional)</label>
              <GenreCombobox value={secondaryGenre} onChange={setSecondaryGenre} placeholder="Search or type a genre (optional)…" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Era (optional)</label>
              <GenrePillSelector
                selected={eras.map(d => `${d}s`)}
                onChange={label => {
                  const d = parseInt(label, 10);
                  setEras(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
                }}
                genres={DECADES} />
              <p style={{ fontFamily:SD.mono, fontSize:11, lineHeight:1.6, color:SD.textMuted, margin:'8px 0 0' }}>
                Limits the set to tracks released in the selected decade(s). Tracks without a
                release year are skipped — Serato libraries carry year data far more often than Rekordbox.
              </p>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Artist (optional) — build the set around specific artists</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                {artists.map(a => (
                  <span key={a} style={{
                    fontFamily:SD.mono, fontSize:11, letterSpacing:1,
                    background:SD.surface3, border:`1px solid ${SD.borderMid}`,
                    borderRadius:3, padding:'4px 9px', color:SD.textSec,
                    display:'flex', alignItems:'center', gap:6,
                  }}>
                    {a}
                    <button type="button" onClick={() => setArtists(prev => prev.filter(x => x !== a))}
                      style={{ background:'none', border:'none', cursor:'pointer', color:SD.textMuted, padding:0, lineHeight:1 }}>
                      ✕
                    </button>
                  </span>
                ))}
                <input type="text" value={artistInput}
                  onChange={e => setArtistInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && artistInput.trim()) {
                      e.preventDefault();
                      commitArtistInput();
                    }
                  }}
                  onBlur={commitArtistInput}
                  placeholder="Type an artist, press Enter…"
                  style={{
                    flex:1, minWidth:180, background:SD.surface2, border:`1px solid ${SD.border}`,
                    borderRadius:3, color:SD.text, fontFamily:SD.mono, fontSize:13, padding:'9px 10px',
                  }} />
              </div>
            </div>
            <SDInput label="Vibe / Mood (optional)" value={vibe} onChange={setVibe}
              placeholder={`e.g. "dark and introspective" or "feel-good summer energy"`} />
            <div style={fieldStyle}>
              <label style={labelStyle}>Crowd Context <span style={{ color:SD.accent }}>*</span></label>
              <GenrePillSelector selected={crowd}
                onChange={g => setCrowd(g === crowd ? '' : g)} genres={CROWD_TYPES} />
            </div>
            <div className="sd-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Set Duration <span style={{ color:SD.accent }}>*</span></label>
                <div style={{ display:'flex', gap:0, borderRadius:3, overflow:'hidden',
                  border:`1px solid ${SD.border}` }}>
                  {DURATION_OPTS.map((d, i) => (
                    <button key={d} onClick={() => setDuration(d)} style={{
                      flex:1, fontFamily:SD.mono, fontSize:13, letterSpacing:.5,
                      border:'none', borderLeft: i > 0 ? `1px solid ${SD.border}` : 'none',
                      background: duration === d ? SD.accent : SD.surface2,
                      color: duration === d ? '#000' : SD.textSec,
                      padding:'9px 4px', cursor:'pointer', transition:'all .12s',
                    }}>{d}</button>
                  ))}
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Lineup Slot <span style={{ color:SD.accent }}>*</span></label>
                <GenrePillSelector selected={slot}
                  onChange={g => setSlot(g === slot ? '' : g)} genres={LINEUP_SLOTS} />
              </div>
            </div>

            {/* Set readiness — honest pre-gen signal on whether the library can
                support this genre + duration with room to curate. Warn, never block. */}
            {(readiness || readinessLoading) && (() => {
              const rv = readinessView(readiness, { primaryGenre, eras, artists, playlistName: sourcePlaylist || undefined }, duration || 'the set');
              if (!rv && !readinessLoading) return null;
              return (
                <div style={{
                  padding:'11px 14px', borderRadius:3,
                  background: rv ? rv.bg : SD.surface,
                  border:`1px solid ${rv ? rv.border : SD.border}`,
                  display:'flex', alignItems:'flex-start', gap:9,
                }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, marginTop:5,
                    display:'inline-block', background: rv ? rv.fg : SD.textMuted,
                    boxShadow: rv ? `0 0 6px ${rv.fg}` : 'none' }} />
                  <span style={{ fontFamily:SD.mono, fontSize:12, lineHeight:1.6,
                    color: rv ? SD.text : SD.textMuted }}>
                    {rv ? rv.text : 'Checking library readiness…'}
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div style={{ display:'flex', flexDirection:'column', gap:32 }}>
            <div>
              <div style={{ fontFamily:SD.body, fontSize:14, color:SD.textSec,
                lineHeight:1.8, marginBottom:24 }}>
                Drag the control points to shape your energy arc. Each point represents a phase of your set.
              </div>
              <div style={{ display:'flex', gap:10, marginBottom:28 }}>
                {Object.entries(arcPresets).map(([label, vals]) => (
                  <button key={label} onClick={() => setArcPoints(vals)} style={{
                    fontFamily:SD.mono, fontSize:12, letterSpacing:1, textTransform:'uppercase',
                    padding:'6px 16px', borderRadius:100, border:`1px solid ${SD.border}`,
                    background:'transparent', color:SD.textSec, cursor:'pointer', transition:'all .12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = SD.accent; e.currentTarget.style.color = SD.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = SD.border; e.currentTarget.style.color = SD.textSec; }}
                  >{label}</button>
                ))}
              </div>
            </div>
            <div style={{ background:SD.surface, border:`1px solid ${SD.border}`,
              borderRadius:4, padding:'24px 24px 16px', overflow:'hidden' }}>
              <ArcBuilder />
            </div>
            <div className="sd-grid-5" style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
              {arcLabels.map((label, i) => (
                <div key={label} style={{ background:SD.surface, border:`1px solid ${SD.border}`,
                  borderRadius:3, padding:'16px 12px', textAlign:'center' }}>
                  <div style={{ fontFamily:SD.display, fontSize:36, letterSpacing:2,
                    color:SD.accent, lineHeight:1 }}>{arcPoints[i]}</div>
                  <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted,
                    letterSpacing:1.5, textTransform:'uppercase', marginTop:4 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div style={{ display:'flex', flexDirection:'column', gap:28 }}>
            <div style={{ fontFamily:SD.body, fontSize:14, color:SD.textSec, lineHeight:1.8 }}>
              Optional seeds help the AI ground your set in specific directions.
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Seed Track (optional) — a song your set must include</label>
              <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted, lineHeight:1.6 }}>
                Pin a track you know you want to play — the AI is guaranteed to place it in the set and builds the flow around it. Search your library by artist or title.
              </div>
              <div style={{ position:'relative' }}>
                <SDInput value={seedSearch} onChange={setSeedSearch}
                  placeholder="Search by artist or title..." />
                {seedSearch && (
                  <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:10,
                    background:SD.surface2, border:`1px solid ${SD.border}`,
                    borderTop:'none', borderRadius:'0 0 3px 3px', overflow:'auto', maxHeight:480 }}>
                    {(libraryTracks.length ? libraryTracks : LIBRARY_TRACKS)
                      .filter(t => `${t.artist} ${t.title}`.toLowerCase().includes(seedSearch.toLowerCase()))
                      .slice(0, 20)
                      .map((t, i) => (
                        <div key={i} onClick={() => setSeedSearch(`${t.artist} — ${t.title}`)}
                          style={{ padding:'12px 16px', cursor:'pointer',
                            borderBottom:`1px solid ${SD.border}`, transition:'background .1s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = SD.surface3)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.text }}>
                            {t.artist} — {t.title}
                          </div>
                          <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent, marginTop:2 }}>
                            {t.bpm ? `${t.bpm} BPM` : ''}{t.key ? ` · ${t.key}` : ''}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <SDInput label="SoundCloud URL (optional)" value={soundcloudUrl} onChange={setSoundcloudUrl}
              placeholder="https://soundcloud.com/artist/track" />
            <SDInput label="Wordplay Word (optional — hip hop)" value={wordplay} onChange={setWordplay}
              placeholder={`e.g. "tonight", "money", "fly" — AI will find lyrical transitions`} />
            <div style={fieldStyle}>
              <label style={labelStyle}>Clean Only (optional)</label>
              <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted, lineHeight:1.6 }}>
                Excludes tracks marked explicit/dirty in your library — keep corporate, wedding, and radio sets safe.
              </div>
              <button onClick={() => setCleanOnly(v => !v)} style={{
                alignSelf:'flex-start', fontFamily:SD.mono, fontSize:SD.t11, letterSpacing:1.5,
                textTransform:'uppercase', cursor:'pointer',
                background: cleanOnly ? SD.accentDim : SD.surface2,
                color: cleanOnly ? SD.accent : SD.textMuted,
                border:`1px solid ${cleanOnly ? SD.accent + '66' : SD.border}`,
                borderRadius:SD.r2, padding:'8px 14px', whiteSpace:'nowrap', transition:'all .15s',
              }}>{cleanOnly ? '✓ Clean only' : 'Any version'}</button>
            </div>
            <div style={{ background:SD.surface, border:`1px solid ${SD.border}`,
              borderRadius:3, padding:'20px 24px' }}>
              <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent,
                letterSpacing:2, textTransform:'uppercase', marginBottom:12 }}>Set Summary</div>
              <div className="sd-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {([
                  ['Pool', poolLabelClient({ primaryGenre: primaryGenre + (secondaryGenre ? ` / ${secondaryGenre}` : ''), eras, artists, playlistName: sourcePlaylist || undefined })],
                  ['Crowd', crowd],
                  ['Duration', duration],
                  ['Slot', slot],
                  ['Vibe', vibe || '—'],
                  ['Venue', venueName || '—'],
                  ['Arc', arcPoints.join(' → ')],
                  ['Seed', seedSearch || '—'],
                  ['Clean', cleanOnly ? 'Explicit excluded' : '—'],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} style={{ marginBottom:6 }}>
                    <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted,
                      letterSpacing:1.5, textTransform:'uppercase' }}>{k}: </span>
                    <span style={{ fontFamily:SD.mono, fontSize:13, color:SD.text }}>{v || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {genError && (
          <div style={{ marginTop:24, background:SD.redDim, border:`1px solid ${SD.red}44`,
            borderRadius:3, padding:'14px 20px', fontFamily:SD.mono, fontSize:12, color:SD.red,
            lineHeight:1.6 }}>
            ⚠ {genError}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
          marginTop:24, paddingTop:32, borderTop:`1px solid ${SD.border}` }}>
          {step > 1
            ? <SDButton ghost onClick={() => setStep(s => s-1)}>← Back</SDButton>
            : <span/>
          }
          {step < 3
            ? <SDButton onClick={() => { if (step === 1) commitArtistInput(); setStep(s => s+1); }} disabled={!stepValid(step)}>Continue →</SDButton>
            : <SDButton onClick={runGeneration} style={{ fontSize:14, padding:'14px 40px' }}>Drop the Set</SDButton>
          }
        </div>
      </div>
    </div>
  );
}
