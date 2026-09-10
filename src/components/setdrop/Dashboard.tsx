'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { SD } from '@/lib/setdrop/constants';
import { SDButton, PageHeader, Card, CardHeader, Tabs, Badge, EmptyState, LoadingState } from './shared';
import { WhatsNewModal } from './WhatsNewModal';

interface LibraryStats {
  totalTracks: number;
  lastSynced: string | null;
}

interface RecentSet {
  id: string;
  name: string;
  genre: string;
  date: string;
  createdAtRaw: string;
  duration: string;
  trackCount: number;
}

interface WishlistItem {
  id: string;
  artist: string;
  title: string;
  bpm: number | null;
  key: string | null;
  beatportSearchUrl: string | null;
}

interface GigEntry {
  id: string;
  gigName: string;
  gigDate: string;
  venue: string | null;
  playedAt: string;
}

interface WishlistCandidate {
  artist: string;
  title: string;
  bpm: number | null;
  beatportSearchUrl: string;
}

interface GapRecommendation extends WishlistCandidate {
  bpm: number;
  reason: string;
}

interface TrendingTrack {
  artist: string;
  title: string;
  bpm?: number;
  inLibrary: boolean;
  artworkUrl?: string;
  beatportSearchUrl: string;
}

interface TrendingGenreResult {
  genre: string;
  tracks: TrendingTrack[];
  fetchedAt: string;
}

interface EmergingArtist {
  artist: string;
  reason: string;
  beatportSearchUrl: string;
}

interface EnergyInsight {
  genre: string;
  message: string;
  severity: 'high' | 'medium';
}

interface LibraryGap {
  genre: string;
  bpmRange: string;
  currentCount: number;
  severity: 'high' | 'medium' | 'low';
  recommendations: GapRecommendation[];
  emergingArtists?: EmergingArtist[];
}

export function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [libraryStats, setLibraryStats] = useState<LibraryStats | null>(null);
  const [recentSets, setRecentSets] = useState<RecentSet[] | null>(null);
  const [gigHistory, setGigHistory] = useState<GigEntry[] | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[] | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('sd_onboarding_done') === '1';
  });
  const [trendingData, setTrendingData] = useState<TrendingGenreResult[] | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [gapReport, setGapReport] = useState<LibraryGap[] | null>(null);
  const [gapMeta, setGapMeta] = useState<{ tracksAnalyzed: number; genresAnalyzed: number } | null>(null);
  const [energyInsights, setEnergyInsights] = useState<EnergyInsight[]>([]);
  const [gapError, setGapError] = useState<string | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [addedToWishlist, setAddedToWishlist] = useState<Set<string>>(new Set());
  const [discoverTab, setDiscoverTab] = useState<'trending' | 'gaps'>('trending');

  useEffect(() => {
    if (searchParams.get('new_user') === '1') {
      trackEvent.signUp('google');
      router.replace('/dashboard');
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setUserEmail(user.email ?? null);

      const [libraryRes, setsRes, gigsRes, wishlistRes] = await Promise.all([
        supabase
          .from('serato_libraries')
          .select('total_tracks, last_synced')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('setlists')
          .select('id, name, primary_genre, secondary_genre, crowd_context, duration_minutes, created_at, tracks_json')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('gig_history')
          .select('id, gig_name, gig_date, venue, played_at')
          .eq('user_id', user.id)
          .order('gig_date', { ascending: false })
          .limit(10),
        supabase
          .from('wishlist_tracks')
          .select('id, artist, title, bpm, key, beatport_search_url')
          .eq('user_id', user.id)
          .eq('status', 'wishlist')
          .order('added_at', { ascending: false })
          .limit(5),
      ]);

      if (libraryRes.data) {
        setLibraryStats({
          totalTracks: libraryRes.data.total_tracks,
          lastSynced: libraryRes.data.last_synced,
        });
      }

      if (setsRes.data) {
        setRecentSets(setsRes.data.map(s => {
          const trackCount = Array.isArray(s.tracks_json) ? (s.tracks_json as unknown[]).length : 0;
          const genre = [s.primary_genre, s.secondary_genre].filter(Boolean).join(' / ') || '—';
          const date = new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const duration = s.duration_minutes ? `${s.duration_minutes} min` : '—';
          return { id: s.id, name: s.name, genre, date, createdAtRaw: s.created_at, duration, trackCount };
        }));
      }

      setWishlistItems((wishlistRes.data ?? []).map(w => ({
        id: w.id,
        artist: w.artist ?? '',
        title: w.title ?? '',
        bpm: w.bpm ?? null,
        key: w.key ?? null,
        beatportSearchUrl: w.beatport_search_url ?? null,
      })));

      if (gigsRes.data) {
        setGigHistory(gigsRes.data.map(g => ({
          id: g.id,
          gigName: g.gig_name,
          gigDate: g.gig_date,
          venue: g.venue ?? null,
          playedAt: g.played_at,
        })));
      } else {
        setGigHistory([]);
      }
    });
  }, []);

  async function loadTrending() {
    setTrendingLoading(true);
    setTrendingError(null);
    try {
      const res = await fetch('/api/dashboard/trending-charts');
      // No library yet (404) is not an error — show the neutral empty/upload state.
      if (res.status === 404) { setTrendingData([]); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string })) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const data = await res.json() as { results?: TrendingGenreResult[]; error?: string };
      if (data.error) throw new Error(data.error);
      setTrendingData(data.results ?? []);
    } catch (err) {
      console.error('[trending]', err);
      setTrendingError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setTrendingLoading(false);
    }
  }

  useEffect(() => { loadTrending(); }, []);

  async function analyzeLibrary() {
    setGapLoading(true);
    setGapError(null);
    try {
      const res = await fetch('/api/library/analyze-gaps');
      const data = await res.json() as { gaps?: LibraryGap[]; energyInsights?: EnergyInsight[]; meta?: { tracksAnalyzed: number; genresAnalyzed: number }; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Server error ${res.status}`);
      setGapReport(data.gaps ?? []);
      setEnergyInsights(data.energyInsights ?? []);
      setGapMeta(data.meta ?? null);
    } catch (err) {
      console.error('[analyzeLibrary]', err);
      setGapError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setGapLoading(false);
    }
  }

  async function addToWishlist(candidate: WishlistCandidate) {
    const key = `${candidate.artist}|${candidate.title}`;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('wishlist_tracks').insert({
      user_id: user.id,
      artist: candidate.artist,
      title: candidate.title,
      bpm: candidate.bpm,
      beatport_search_url: candidate.beatportSearchUrl,
      status: 'wishlist',
      enrichment_source: 'manual',
    });
    if (!error) {
      setAddedToWishlist(prev => new Set([...prev, key]));
      setWishlistItems(prev =>
        prev ? [...prev, { id: key, artist: candidate.artist, title: candidate.title, bpm: candidate.bpm, key: null, beatportSearchUrl: candidate.beatportSearchUrl }] : prev
      );
    }
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'GOOD MORNING';
    if (h < 18) return 'GOOD AFTERNOON';
    return 'GOOD EVENING';
  };

  const djName = userEmail ? userEmail.split('@')[0].toUpperCase() : 'DJ';


  function genreGradient(genre: string): string {
    const g = genre.toLowerCase();
    if (g.includes('hip hop') || g.includes('trap') || g.includes('drill') || g.includes('rap') || g.includes('boom bap'))
      return 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)';
    if (g.includes('r&b') || g.includes('rnb') || g.includes('soul'))
      return 'linear-gradient(135deg, #f43f5e 0%, #ec4899 100%)';
    if (g.includes('latin') || g.includes('reggaeton') || g.includes('cumbia') || g.includes('salsa'))
      return 'linear-gradient(135deg, #10b981 0%, #0891b2 100%)';
    if (g.includes('afrobeat') || g.includes('afropop') || g.includes('dancehall'))
      return 'linear-gradient(135deg, #eab308 0%, #f97316 100%)';
    if (g.includes('techno') || g.includes('minimal') || g.includes('industrial'))
      return 'linear-gradient(135deg, #06b6d4 0%, #4f46e5 100%)';
    if (g.includes('drum') || g.includes('dnb') || g.includes('jungle') || g.includes('d&b'))
      return 'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)';
    if (g.includes('pop') || g.includes('top 40'))
      return 'linear-gradient(135deg, #ec4899 0%, #7c3aed 100%)';
    if (g.includes('edm') || g.includes('big room') || g.includes('electro'))
      return 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)';
    if (g.includes('trance') || g.includes('uplifting'))
      return 'linear-gradient(135deg, #a78bfa 0%, #38bdf8 100%)';
    // House, Tech House, Afro House, etc.
    return 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)';
  }

  const trendingFlat = trendingData
    ? trendingData
        .flatMap(r => r.tracks.map(t => ({ ...t, genre: r.genre })))
        .sort((a, b) => Number(!!a.inLibrary) - Number(!!b.inLibrary))
        .slice(0, 6)
    : [];
  const trendingMissingCount = trendingFlat.filter(t => !t.inLibrary).length;

  return (
    <div style={{ background:SD.bg, minHeight:'100vh', paddingTop:56, color:SD.text }}>
      {/* Release-notes popup — once per user, skipped for brand-new signups */}
      {searchParams.get('new_user') !== '1' && <WhatsNewModal />}
      <div className="sd-pad-x sd-inner-pad" style={{ maxWidth:1280, margin:'0 auto', padding:'48px 40px', animation:'sdFadeUp 0.5s ease both' }}>

        <PageHeader
          eyebrow="Dashboard"
          title={`${greeting()}, ${djName}`}
          actions={
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <SDButton ghost onClick={() => router.push('/id')} style={{ fontSize:13, padding:'13px 24px' }}>
                ID a Track
              </SDButton>
              <SDButton onClick={() => router.push('/builder')} style={{ fontSize:13, padding:'13px 32px' }}>
                + Plan New Set
              </SDButton>
            </div>
          }
        />

        {/* Onboarding — shown until library uploaded + first set built */}
        {!onboardingDismissed && (libraryStats === null || (recentSets !== null && recentSets.length === 0)) && (
          <div style={{ background:SD.surface, border:`1px solid ${SD.borderMid}`,
            borderRadius:4, padding:'24px 28px', marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:SD.mono, fontSize:12, letterSpacing:2,
                  color:SD.accent, textTransform:'uppercase', marginBottom:6 }}>Get Started</div>
                <div style={{ fontFamily:SD.body, fontSize:15, color:SD.text }}>
                  Two steps to your first AI-generated set
                </div>
              </div>
              <button onClick={() => { setOnboardingDismissed(true); localStorage.setItem('sd_onboarding_done','1'); }}
                style={{ background:'none', border:'none', cursor:'pointer',
                  fontFamily:SD.mono, fontSize:12, color:SD.textMuted, padding:'2px 6px' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { n:1, done: libraryStats !== null, label:'Upload your library', sub:'Import your Serato DB, Rekordbox XML, or add tracks manually to your wishlist', page:'library', cta:'Upload Library' },
                { n:2, done: recentSets !== null && recentSets.length > 0, label:'Plan your first set', sub:'Tell the AI your gig — crowd, slot, duration — and it sequences an ordered set', page:'builder', cta:'Plan Set' },
              ].map(step => (
                <div key={step.n} style={{ display:'flex', alignItems:'center', gap:16,
                  padding:'14px 18px', background:SD.bg,
                  border:`1px solid ${step.done ? SD.green+'44' : SD.border}`,
                  borderRadius:3 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0,
                    background: step.done ? SD.greenDim : SD.surface2,
                    border:`1px solid ${step.done ? SD.green+'66' : SD.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:SD.mono, fontSize:13,
                    color: step.done ? SD.green : SD.textMuted }}>
                    {step.done ? '✓' : step.n}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SD.mono, fontSize:12, fontWeight:600,
                      color: step.done ? SD.textSec : SD.text, marginBottom:2,
                      textDecoration: step.done ? 'line-through' : 'none' }}>{step.label}</div>
                    <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted }}>{step.sub}</div>
                  </div>
                  {!step.done && (
                    <SDButton ghost onClick={() => router.push('/' + step.page)}
                      style={{ fontSize:12, padding:'6px 14px', flexShrink:0 }}>
                      {step.cta}
                    </SDButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Set vs Crate — the Set Builder is the flagship, so it leads as a larger
            hero card (2fr); the Crate is a genuine but clearly secondary utility
            (1fr). Demote, don't bury: crates stay one click away as a "dig-from-it
            later" tool and a feeder for sets. sd-grid-2 collapses both to 1fr on mobile. */}
        <div className="sd-grid-2" style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:16, alignItems:'stretch' }}>
          {/* Primary — Plan a Set (flagship hero) */}
          <div onClick={() => router.push('/builder')}
            style={{ background:SD.surface, border:`1px solid ${SD.border}`, borderRadius:4,
              padding:'26px 28px', cursor:'pointer', transition:'border-color .15s, background .15s',
              display:'flex', flexDirection:'column', gap:14 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = SD.accent; e.currentTarget.style.background = SD.surface2; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = SD.border; e.currentTarget.style.background = SD.surface; }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:26, color:SD.accent, lineHeight:1 }}>≣</span>
              <span style={{ fontFamily:SD.display, fontSize:34, letterSpacing:2, color:SD.text, lineHeight:1 }}>PLAN A SET</span>
            </div>
            <div style={{ fontFamily:SD.body, fontSize:14, color:SD.textSec, lineHeight:1.6, flex:1 }}>
              An ordered set for one gig — sequenced start to finish, with transitions and an energy arc, tuned to your crowd and slot.
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {['energy arc','harmonic mixing','do-not-repeat'].map(c => (
                <span key={c} style={{ fontFamily:SD.mono, fontSize:10, letterSpacing:.5, color:SD.textSec,
                  background:SD.surface2, border:`1px solid ${SD.border}`, borderRadius:100, padding:'4px 10px' }}>{c}</span>
              ))}
            </div>
            <span style={{ alignSelf:'flex-start', fontFamily:SD.mono, fontSize:12, letterSpacing:1, textTransform:'uppercase',
              background:SD.accent, color:'#000', borderRadius:3, padding:'11px 22px' }}>Plan a Set →</span>
          </div>

          {/* Secondary — Build a Crate (utility) */}
          <div onClick={() => router.push('/crates')}
            style={{ background:SD.surface, border:`1px solid ${SD.border}`, borderRadius:4,
              padding:'22px 20px', cursor:'pointer', transition:'border-color .15s, background .15s',
              display:'flex', flexDirection:'column', gap:10 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = SD.borderMid; e.currentTarget.style.background = SD.surface2; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = SD.border; e.currentTarget.style.background = SD.surface; }}>
            <span style={{ fontSize:20, color:SD.textMuted, lineHeight:1 }}>▦</span>
            <span style={{ fontFamily:SD.display, fontSize:20, letterSpacing:2, color:SD.textSec }}>BUILD A CRATE</span>
            <div style={{ fontFamily:SD.body, fontSize:12, color:SD.textMuted, lineHeight:1.6, flex:1 }}>
              A reusable bin of tracks by vibe — prep now, dig from it later.
            </div>
            <span style={{ alignSelf:'flex-start', fontFamily:SD.mono, fontSize:12, letterSpacing:1, textTransform:'uppercase',
              background:'transparent', color:SD.textSec, border:`1px solid ${SD.border}`, borderRadius:3, padding:'9px 14px' }}>Build a crate →</span>
          </div>
        </div>

        {/* Status strip */}
        <div style={{ background:SD.surface, border:`1px solid ${SD.border}`, borderRadius:4,
          padding:'16px 24px', marginBottom:16,
          display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          {libraryStats ? (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
                {[
                  { value: libraryStats.totalTracks.toLocaleString(), label: 'tracks', green: true },
                  { value: String(wishlistItems?.length ?? 0), label: 'wishlist' },
                  { value: String(recentSets?.filter(s => {
                      const d = new Date(s.createdAtRaw), now = new Date();
                      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    }).length ?? 0), label: 'sets this month' },
                ].map(({ value, label, green }) => (
                  <div key={label} style={{ display:'flex', alignItems:'baseline', gap:5 }}>
                    {green && <span style={{ width:6, height:6, borderRadius:'50%', background:SD.green,
                      display:'inline-block', boxShadow:`0 0 6px ${SD.green}`, marginBottom:2 }}/>}
                    <span style={{ fontFamily:SD.display, fontSize:28, letterSpacing:2,
                      color:SD.text, lineHeight:1 }}>{value}</span>
                    <span style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted,
                      letterSpacing:1, textTransform:'uppercase' }}>{label}</span>
                  </div>
                ))}
                {libraryStats.lastSynced && (
                  <span style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted, letterSpacing:.5 }}>
                    Synced {new Date(libraryStats.lastSynced).toLocaleDateString('en-US', { month:'short', day:'numeric' })}
                  </span>
                )}
              </div>
              <SDButton ghost onClick={() => router.push('/library')} style={{ fontSize:11, padding:'5px 12px' }}>
                Manage Library
              </SDButton>
            </>
          ) : (
            <>
              <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>No library connected yet</span>
              <SDButton ghost onClick={() => router.push('/library')} style={{ fontSize:11, padding:'5px 12px' }}>
                Upload Library
              </SDButton>
            </>
          )}
        </div>

        {/* Next Gig widget */}
        {gigHistory !== null && (() => {
          const nextGig = gigHistory.find(g => new Date(g.gigDate) >= new Date()) ?? null;
          const daysUntil = nextGig
            ? Math.ceil((new Date(nextGig.gigDate).getTime() - Date.now()) / 86400000)
            : null;
          return (
            <div style={{ background:SD.surface, border:`1px solid ${nextGig ? SD.borderMid : SD.border}`,
              borderRadius:4, padding:'14px 24px', marginBottom:16,
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
              {nextGig && daysUntil !== null ? (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                    <div style={{ textAlign:'center', minWidth:44 }}>
                      <div style={{ fontFamily:SD.display, fontSize:28, letterSpacing:2, lineHeight:1,
                        color: daysUntil <= 7 ? SD.accent : SD.text }}>
                        {daysUntil}
                      </div>
                      <div style={{ fontFamily:SD.mono, fontSize:9, color:SD.textMuted,
                        letterSpacing:1.5, textTransform:'uppercase', marginTop:2 }}>
                        {daysUntil === 1 ? 'day' : 'days'}
                      </div>
                    </div>
                    <div style={{ width:1, height:32, background:SD.border }} />
                    <div>
                      <div style={{ fontFamily:SD.mono, fontSize:13, fontWeight:600, color:SD.text }}>
                        {nextGig.gigName}
                      </div>
                      {nextGig.venue && (
                        <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec, marginTop:2 }}>
                          {nextGig.venue}
                        </div>
                      )}
                    </div>
                  </div>
                  <SDButton onClick={() => router.push('/builder')} style={{ fontSize:12, padding:'8px 18px', flexShrink:0 }}>
                    Build Set
                  </SDButton>
                </>
              ) : (
                <>
                  <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>No upcoming gigs logged</span>
                  <SDButton ghost onClick={() => router.push('/history')} style={{ fontSize:11, padding:'5px 12px' }}>
                    Log Next Gig
                  </SDButton>
                </>
              )}
            </div>
          );
        })()}

        {/* Discover — tabbed Trending + Library Gaps */}
        <Card style={{ marginBottom:16 }}>
          <Tabs
            tabs={[{ id: 'trending', label: 'Trending' }, { id: 'gaps', label: 'Library Gaps' }]}
            value={discoverTab}
            onChange={(id) => setDiscoverTab(id as 'trending' | 'gaps')}
            action={
              discoverTab === 'trending' && trendingData && trendingData.length > 0
                ? (() => {
                    const oldest = trendingData.reduce((a, b) => a.fetchedAt < b.fetchedAt ? a : b).fetchedAt;
                    const diffH = Math.round((Date.now() - new Date(oldest).getTime()) / 3600000);
                    return (
                      <span style={{ fontFamily: SD.mono, fontSize: 11, color: SD.textMuted }}>
                        {diffH < 1 ? 'Just updated' : `Updated ${diffH}h ago`}
                      </span>
                    );
                  })()
                : discoverTab === 'gaps'
                ? (
                    <SDButton ghost onClick={analyzeLibrary} disabled={gapLoading || !libraryStats}
                      style={{ fontSize: 12, padding: '5px 12px' }}>
                      {gapLoading ? 'Analyzing...' : 'Analyze Library'}
                    </SDButton>
                  )
                : null
            }
          />

          <div style={{ padding:'20px 24px' }}>
            {discoverTab === 'trending' && (
              trendingLoading ? (
                <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>Finding what&apos;s trending in your genres...</div>
              ) : trendingError ? (
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.danger }}>{trendingError}</span>
                  <SDButton ghost onClick={loadTrending} style={{ fontSize:11, padding:'4px 10px' }}>Retry</SDButton>
                </div>
              ) : !trendingData || trendingData.length === 0 ? (
                <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted }}>
                  {libraryStats ? 'No chart data available for your genres yet.' : 'Upload your library to see trending tracks in your genres.'}
                </div>
              ) : (
                  <>
                    <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted, marginBottom:12, letterSpacing:1 }}>
                      {trendingMissingCount > 0
                        ? `${trendingMissingCount} track${trendingMissingCount > 1 ? 's' : ''} trending in your genres not in your library`
                        : 'You have all the top trending tracks in your library'}
                    </div>
                    <div className="sd-no-scrollbar" style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:4, alignItems:'stretch' }}>
                      {trendingFlat.map((track, ti) => {
                        const wKey = `${track.artist}|${track.title}`;
                        const added = addedToWishlist.has(wKey);
                        const grad = genreGradient(track.genre);
                        return (
                          <div key={ti} style={{ width:152, flexShrink:0, background:SD.surface,
                            border:`1px solid ${track.inLibrary ? SD.green + '33' : SD.border}`, borderRadius:4, overflow:'hidden' }}>
                            <div style={{ height:72, background:grad, position:'relative', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                              {track.artworkUrl && (
                                <img src={track.artworkUrl} alt={track.title}
                                  style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }} />
                              )}
                              <span style={{ position:'relative', zIndex:1, fontFamily:SD.display, fontSize:30, fontWeight:700,
                                color:'rgba(255,255,255,0.3)', letterSpacing:2 }}>{ti + 1}</span>
                              {track.inLibrary && (
                                <span style={{ position:'absolute', top:6, right:6, zIndex:2, fontFamily:SD.mono, fontSize:9,
                                  letterSpacing:1, padding:'2px 5px', borderRadius:2,
                                  background:SD.greenDim, border:`1px solid ${SD.green}33`, color:SD.green }}>IN LIB</span>
                              )}
                            </div>
                            <div style={{ padding:'9px 9px 7px' }}>
                              <div style={{ fontFamily:SD.mono, fontSize:10, color:SD.textMuted, marginBottom:3, letterSpacing:1, textTransform:'uppercase' }}>{track.genre}</div>
                              <div style={{ fontFamily:SD.mono, fontSize:11, fontWeight:600, color:SD.text,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:2 }}>
                                {track.title}
                              </div>
                              <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textSec,
                                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:6 }}>
                                {track.artist}
                              </div>
                              {track.inLibrary ? (
                                <div style={{ width:'100%', background:SD.greenDim, border:`1px solid ${SD.green}33`,
                                  borderRadius:2, fontFamily:SD.mono, fontSize:10, color:SD.green, padding:'4px 0', textAlign:'center' }}>
                                  ✓ In Library
                                </div>
                              ) : (
                                <button
                                  onClick={() => addToWishlist({ artist:track.artist, title:track.title, bpm:track.bpm ?? null, beatportSearchUrl:track.beatportSearchUrl })}
                                  disabled={added}
                                  style={{ width:'100%', background:added ? SD.surface2 : SD.accentDim,
                                    border:`1px solid ${added ? SD.border : SD.accent+'44'}`,
                                    borderRadius:2, fontFamily:SD.mono, fontSize:10,
                                    color:added ? SD.textMuted : SD.accent, padding:'4px 0', cursor:added ? 'default' : 'pointer' }}>
                                  {added ? '✓ Added' : '+ Wishlist'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )
            )}

            {discoverTab === 'gaps' && (
              gapLoading ? (
                <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textMuted }}>Scanning your library and searching for trending tracks...</div>
              ) : gapError ? (
                <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.danger }}>Error: {gapError}</div>
              ) : gapReport === null ? (
                <div style={{ fontFamily:SD.body, fontSize:13, color:SD.textMuted }}>
                  {libraryStats ? 'Find BPM and genre gaps in your library — get specific track recommendations to fill them.' : 'Upload your library to unlock Library Intelligence.'}
                </div>
              ) : gapReport.length === 0 ? (
                <div>
                  <div style={{ fontFamily:SD.mono, fontSize:13, color:SD.textSec }}>No significant gaps detected. Your library looks well-rounded.</div>
                  {gapMeta && <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted, marginTop:6 }}>Analyzed {gapMeta.tracksAnalyzed.toLocaleString()} tracks across {gapMeta.genresAnalyzed} genres.</div>}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
                  {gapMeta && <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted }}>Analyzed {gapMeta.tracksAnalyzed.toLocaleString()} tracks across {gapMeta.genresAnalyzed} genres</div>}

                  {/* Energy insights */}
                  {energyInsights.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {energyInsights.map((insight, i) => (
                        <div key={i} style={{
                          display:'flex', alignItems:'center', gap:8,
                          padding:'8px 12px',
                          background: insight.severity === 'high' ? SD.dangerDim : SD.warningDim,
                          border: `1px solid ${insight.severity === 'high' ? SD.danger : SD.warning}33`,
                          borderRadius: SD.r2,
                        }}>
                          <span style={{ fontFamily:SD.mono, fontSize:10, fontWeight:700, letterSpacing:'0.06em',
                            color: insight.severity === 'high' ? SD.danger : SD.warning, flexShrink:0 }}>
                            ENERGY
                          </span>
                          <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.text }}>{insight.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* BPM gaps */}
                  {gapReport.map((gap, gi) => {
                    const sevVariant: 'danger' | 'warning' | 'default' =
                      gap.severity === 'high' ? 'danger' : gap.severity === 'medium' ? 'warning' : 'default';
                    return (
                      <div key={gi}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                          <Badge variant={sevVariant}>{gap.severity}</Badge>
                          <span style={{ fontFamily:SD.mono, fontSize:13, fontWeight:600, color:SD.text }}>{gap.genre}</span>
                          <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>{gap.bpmRange} BPM</span>
                          <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted }}>({gap.currentCount} {gap.currentCount === 1 ? 'track' : 'tracks'})</span>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {(gap.recommendations ?? []).map((rec, ri) => {
                            const wKey = `${rec.artist}|${rec.title}`;
                            const added = addedToWishlist.has(wKey);
                            return (
                              <div key={ri} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                gap:12, padding:'10px 14px', background:SD.bg, border:`1px solid ${SD.border}`, borderRadius:3 }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontFamily:SD.mono, fontSize:12, fontWeight:600, color:SD.text,
                                    whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    {rec.artist} — {rec.title}
                                  </div>
                                  <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted, marginTop:2 }}>
                                    {rec.bpm} BPM · {rec.reason}
                                  </div>
                                </div>
                                <SDButton ghost onClick={() => addToWishlist(rec)} disabled={added}
                                  style={{ fontSize:11, padding:'4px 10px', flexShrink:0, opacity:added ? 0.5 : 1 }}>
                                  {added ? '✓ Added' : '+ Wishlist'}
                                </SDButton>
                              </div>
                            );
                          })}
                        </div>

                        {/* Emerging artists in this genre */}
                        {gap.emergingArtists && gap.emergingArtists.length > 0 && (
                          <div style={{ marginTop:12 }}>
                            <div style={{ fontFamily:SD.mono, fontSize:10, fontWeight:700, letterSpacing:'0.06em',
                              color:SD.textMuted, marginBottom:6, textTransform:'uppercase' }}>
                              Rising in this genre
                            </div>
                            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                              {(gap.emergingArtists ?? []).map((ea, eai) => (
                                <div key={eai} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                                  gap:12, padding:'8px 12px', background:SD.bg, border:`1px solid ${SD.border}`, borderRadius:SD.r2 }}>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontFamily:SD.mono, fontSize:12, fontWeight:600, color:SD.text }}>{ea.artist}</div>
                                    <div style={{ fontFamily:SD.mono, fontSize:11, color:SD.textMuted, marginTop:1,
                                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ea.reason}</div>
                                  </div>
                                  <a href={ea.beatportSearchUrl} target="_blank" rel="noopener noreferrer"
                                    style={{ fontFamily:SD.mono, fontSize:11, color:SD.accent, textDecoration:'none',
                                      flexShrink:0, whiteSpace:'nowrap' }}>
                                    Search ↗
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </Card>

        {/* Action row: Recent Sets + Wishlist */}
        <div className="sd-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
          <Card>
            <CardHeader title="Recent Setlists" action={
              <SDButton ghost onClick={() => router.push('/history')} style={{ fontSize:12, padding:'5px 12px' }}>
                View All
              </SDButton>
            }/>
            <div style={{ padding:'16px' }}>
              {recentSets === null ? (
                <LoadingState />
              ) : recentSets.length === 0 ? (
                <EmptyState
                  title="No sets yet"
                  cta={<SDButton onClick={() => router.push('/builder')} style={{ fontSize:12 }}>Build Your First Set</SDButton>}
                />
              ) : recentSets.map(s => (
                <div key={s.id} onClick={() => router.push('/history')}
                  style={{ padding:'18px 16px', marginBottom:8, background:SD.bg,
                    border:`1px solid ${SD.border}`, borderRadius:3, cursor:'pointer', transition:'border-color .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = SD.borderMid)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = SD.border)}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                    <div>
                      <div style={{ fontFamily:SD.mono, fontSize:13, fontWeight:600, color:SD.text, marginBottom:6 }}>{s.name}</div>
                      <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>{s.genre}</div>
                    </div>
                    <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, flexShrink:0 }}>{s.date}</span>
                  </div>
                  <div style={{ display:'flex', gap:16, marginTop:14 }}>
                    {s.trackCount > 0 && <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>{s.trackCount} tracks</span>}
                    <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>{s.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Wishlist — Download Queue" action={
              <SDButton ghost onClick={() => router.push('/library')} style={{ fontSize:12, padding:'5px 12px' }}>
                View All
              </SDButton>
            }/>
            <div style={{ padding:'16px' }}>
              {wishlistItems === null ? (
                <LoadingState />
              ) : wishlistItems.length === 0 ? (
                <EmptyState
                  title="No wishlist tracks yet"
                  cta={<SDButton ghost onClick={() => router.push('/library')} style={{ fontSize:12 }}>Add Tracks</SDButton>}
                />
              ) : wishlistItems.map((t, i) => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', gap:14,
                  padding:'12px 8px', borderBottom: i < wishlistItems.length - 1 ? `1px solid ${SD.border}` : 'none' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SD.mono, fontSize:12, fontWeight:600,
                      color:SD.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {t.artist} — {t.title}
                    </div>
                    <div style={{ display:'flex', gap:10, marginTop:3 }}>
                      {t.bpm && <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent }}>{t.bpm} BPM</span>}
                      {t.key && <span style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>{t.key}</span>}
                    </div>
                  </div>
                  {t.beatportSearchUrl && (
                    <a href={t.beatportSearchUrl} target="_blank" rel="noreferrer"
                      style={{ fontFamily:SD.mono, fontSize:12, color:SD.accent,
                        background:SD.accentDim, border:`1px solid ${SD.accent}33`,
                        borderRadius:2, padding:'3px 8px', whiteSpace:'nowrap',
                        textDecoration:'none', flexShrink:0 }}>
                      Beatport ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Gig History — past gigs only, condensed */}
        {gigHistory !== null && gigHistory.filter(g => new Date(g.gigDate) < new Date()).length > 0 && (
          <Card style={{ marginBottom:16 }}>
            <CardHeader title="Gig History" action={
              <SDButton ghost onClick={() => router.push('/history')} style={{ fontSize:12, padding:'5px 12px' }}>View All</SDButton>
            }/>
            <div style={{ padding:'16px' }}>
              {gigHistory.filter(g => new Date(g.gigDate) < new Date()).slice(0, 5).map((g, i, arr) => (
                <div key={g.id} onClick={() => router.push(`/gigs/${g.id}`)}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'14px 8px', borderBottom: i < arr.length - 1 ? `1px solid ${SD.border}` : 'none',
                    gap:16, cursor:'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = SD.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:SD.mono, fontSize:12, fontWeight:600, color:SD.text, marginBottom:3,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{g.gigName}</div>
                    {g.venue && <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textSec }}>{g.venue}</div>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ fontFamily:SD.mono, fontSize:12, color:SD.textMuted, flexShrink:0 }}>
                      {new Date(g.gigDate).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                    </div>
                    <div style={{ fontFamily:SD.mono, fontSize:10, color:SD.accent, letterSpacing:1 }}>REFLECT →</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
}
