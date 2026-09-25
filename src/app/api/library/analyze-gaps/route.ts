import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { recordUsage, recordCost, usageFrom, type CallUsage } from '@/lib/api-usage';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';

export const maxDuration = 300;

const MODEL = 'claude-sonnet-5';

const BPM_BUCKETS = [
  { label: '60–79', min: 60, max: 79 },
  { label: '80–99', min: 80, max: 99 },
  { label: '100–109', min: 100, max: 109 },
  { label: '110–119', min: 110, max: 119 },
  { label: '120–127', min: 120, max: 127 },
  { label: '128–134', min: 128, max: 134 },
  { label: '135+', min: 135, max: 999 },
];

interface RawGap {
  genre: string;
  bpmRange: string;
  currentCount: number;
  severity: 'high' | 'medium' | 'low';
}

export interface GapRecommendation {
  artist: string;
  title: string;
  bpm: number;
  reason: string;
  beatportSearchUrl: string;
}

export interface EmergingArtist {
  artist: string;
  reason: string;
  beatportSearchUrl: string;
}

export interface EnergyInsight {
  genre: string;
  message: string;
  severity: 'high' | 'medium';
}

export interface LibraryGap {
  genre: string;
  bpmRange: string;
  currentCount: number;
  severity: 'high' | 'medium' | 'low';
  recommendations: GapRecommendation[];
  emergingArtists?: EmergingArtist[];
}

// ─── Sub-genre resolution via lastfm tags ────────────────────────────────────

const SUB_GENRE_MATCHERS: { tag: string; subGenre: string }[] = [
  { tag: 'tech house',        subGenre: 'Tech House' },
  { tag: 'deep house',        subGenre: 'Deep House' },
  { tag: 'afro house',        subGenre: 'Afro House' },
  { tag: 'progressive house', subGenre: 'Progressive House' },
  { tag: 'disco house',       subGenre: 'Disco House' },
  { tag: 'melodic techno',    subGenre: 'Melodic House & Techno' },
  { tag: 'melodic house',     subGenre: 'Melodic House & Techno' },
  { tag: 'minimal techno',    subGenre: 'Minimal Techno' },
  { tag: 'industrial techno', subGenre: 'Industrial Techno' },
  { tag: 'trap',              subGenre: 'Trap' },
  { tag: 'drill',             subGenre: 'Drill' },
  { tag: 'boom bap',          subGenre: 'Boom Bap' },
  { tag: 'reggaeton',         subGenre: 'Reggaeton' },
  { tag: 'drum and bass',     subGenre: 'Drum & Bass' },
  { tag: 'dnb',               subGenre: 'Drum & Bass' },
];

const GENRE_ALIASES: Record<string, string> = {
  // Hip Hop variants
  'hip-hop': 'Hip Hop', 'hiphop': 'Hip Hop', 'hip hop music': 'Hip Hop',
  'hip-hop / r&b': 'Hip Hop', 'hip-hop/r&b': 'Hip Hop', 'hip hop / r&b': 'Hip Hop',
  'hip hop/r&b': 'Hip Hop', 'rap': 'Hip Hop', 'rap / hip-hop': 'Hip Hop',
  // R&B variants
  'r&b': 'R&B', 'rnb': 'R&B', 'r & b': 'R&B', 'rhythm and blues': 'R&B', 'rhythm & blues': 'R&B',
  'r&b / soul': 'R&B', 'soul': 'R&B',
  // Electronic / Dance catch-alls → EDM
  'electronic / dance': 'EDM', 'electronic/dance': 'EDM', 'electronic dance music': 'EDM',
  'edm': 'EDM', 'dance / electronic': 'EDM',
  // Dance → Dance
  'dance commercial/mainstream club': 'Dance', 'dance / pop': 'Dance Pop',
  'dance pop': 'Dance Pop', 'dance music': 'Dance',
  // House variants
  'tech house': 'Tech House', 'techhouse': 'Tech House',
  'deep house': 'Deep House', 'deephouse': 'Deep House',
  'deep tech house': 'Deep House',
  'afro house': 'Afro House', 'afrohouse': 'Afro House',
  'house music': 'House', 'soulful house': 'House',
  'latin house': 'Latin House', 'col house': 'Col House',
  'future house': 'Future House', 'bass house': 'Bass House',
  'tribal house': 'Tribal House', 'electro house': 'Electro House',
  // Latin variants
  'latin / reggaeton': 'Latin', 'latin/reggaeton': 'Latin',
  'latin music': 'Latin', 'latin pop': 'Latin Pop',
  // Drum & Bass
  'drum and bass': 'Drum & Bass', 'd&b': 'Drum & Bass', 'dnb': 'Drum & Bass',
  // Afro
  'afrobeats': 'Afrobeats', 'afro beats': 'Afrobeats', 'afropop': 'Afrobeats',
  'afrobeat': 'Afrobeats',
  // Misc
  'trap music': 'Trap', 'uk drill': 'UK Drill',
  'pop music': 'Pop', 'top 40': 'Pop',
  'nu disco': 'Nu Disco', 'mainstage': 'EDM',
  'electro': 'Electro', 'future bass': 'Future Bass',
  'moombahton': 'Moombahton', 'reggae': 'Reggae', 'dancehall': 'Dancehall',
  'rock': 'Rock', 'blues': 'Blues', 'other': 'Other',
};

function normalizeGenre(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Unknown';
  const lower = trimmed.toLowerCase();
  if (GENRE_ALIASES[lower]) return GENRE_ALIASES[lower];
  // Title-case fallback (handles "tech House" → "Tech House")
  return trimmed.replace(/\b\w/g, c => c.toUpperCase());
}

function resolveSubGenre(genre: string, tags: string[]): string {
  for (const { tag, subGenre } of SUB_GENRE_MATCHERS) {
    if (tags.includes(tag)) return subGenre;
  }
  return normalizeGenre(genre ?? '');
}

// Genres excluded from gap detection entirely — too vague to give useful recs
const DETECTION_SKIP = new Set(['Unknown', 'Other', 'Dance', 'Pop', 'EDM']);

// ─── BPM gap detection ───────────────────────────────────────────────────────

function detectGaps(tracks: Array<{ bpm: number | null; genre: string }>): RawGap[] {
  const byGenre: Record<string, number[]> = {};
  for (const t of tracks) {
    if (!t.bpm || t.bpm < 60 || t.bpm > 220) continue;
    if (DETECTION_SKIP.has(t.genre)) continue;
    (byGenre[t.genre] ??= []).push(Math.round(t.bpm));
  }

  const gaps: RawGap[] = [];

  for (const [genre, bpms] of Object.entries(byGenre)) {
    if (bpms.length < 25) continue;

    const sorted = [...bpms].sort((a, b) => a - b);
    const p5  = sorted[Math.floor(sorted.length * 0.05)];
    const p95 = sorted[Math.min(Math.ceil(sorted.length * 0.95), sorted.length - 1)];

    const tier = ENERGY_TIERS[genre];
    const rangeMin = tier ? Math.min(p5,  tier.warmupMax - 10) : p5;
    const rangeMax = tier ? Math.max(p95, tier.peakMin   + 10) : p95;

    const activeBuckets = BPM_BUCKETS.filter(b => b.max >= rangeMin && b.min <= rangeMax);
    if (activeBuckets.length < 2) continue;

    const counts = activeBuckets.map(b => ({
      ...b,
      count: bpms.filter(bpm => bpm >= b.min && bpm <= b.max).length,
    }));

    // Base avgDensity only on tracks within the active range — out-of-range
    // outliers inflated the old calculation and raised the gap threshold
    const tracksInRange = counts.reduce((s, b) => s + b.count, 0);
    const avgDensity = tracksInRange / activeBuckets.length;
    if (avgDensity < 5) continue;

    for (const bucket of counts) {
      if (bucket.count < avgDensity * 0.5) {
        gaps.push({
          genre,
          bpmRange: bucket.label,
          currentCount: bucket.count,
          severity:
            bucket.count === 0                  ? 'high'
            : bucket.count < avgDensity * 0.15 ? 'high'
            : bucket.count < avgDensity * 0.35 ? 'medium'
            : 'low',
        });
      }
    }
  }

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => order[a.severity] - order[b.severity]);
  return gaps.slice(0, 6);
}

// ─── Energy gap detection ────────────────────────────────────────────────────

const ENERGY_TIERS: Record<string, { warmupMax: number; peakMin: number }> = {
  'House':                  { warmupMax: 120, peakMin: 128 },
  'Tech House':             { warmupMax: 122, peakMin: 130 },
  'Deep House':             { warmupMax: 118, peakMin: 124 },
  'Afro House':             { warmupMax: 120, peakMin: 126 },
  'Progressive House':      { warmupMax: 122, peakMin: 128 },
  'Disco House':            { warmupMax: 118, peakMin: 124 },
  'Melodic House & Techno': { warmupMax: 120, peakMin: 126 },
  'Techno':                 { warmupMax: 128, peakMin: 138 },
  'Minimal Techno':         { warmupMax: 126, peakMin: 136 },
  'Industrial Techno':      { warmupMax: 130, peakMin: 140 },
  'Drum & Bass':            { warmupMax: 165, peakMin: 175 },
  'Hip Hop':                { warmupMax: 85,  peakMin: 100 },
  'Trap':                   { warmupMax: 75,  peakMin: 90  },
  'Drill':                  { warmupMax: 70,  peakMin: 85  },
  'Boom Bap':               { warmupMax: 90,  peakMin: 105 },
  'Afrobeats':              { warmupMax: 100, peakMin: 115 },
  'Reggaeton':              { warmupMax: 85,  peakMin: 100 },
};

const DEFAULT_TIERS = { warmupMax: 100, peakMin: 120 };

function detectEnergyGaps(tracks: Array<{ bpm: number | null; genre: string }>): EnergyInsight[] {
  const byGenre: Record<string, number[]> = {};
  for (const t of tracks) {
    if (!t.bpm || t.bpm < 60 || t.bpm > 220) continue;
    (byGenre[t.genre] ??= []).push(Math.round(t.bpm));
  }

  const insights: EnergyInsight[] = [];
  for (const [genre, bpms] of Object.entries(byGenre)) {
    if (bpms.length < 15) continue;
    const { warmupMax, peakMin } = ENERGY_TIERS[genre] ?? DEFAULT_TIERS;
    const warmupPct = bpms.filter(b => b <= warmupMax).length / bpms.length;
    const peakPct   = bpms.filter(b => b >= peakMin).length   / bpms.length;

    if (peakPct >= 0.70 && warmupPct < 0.10) {
      insights.push({
        genre,
        message: `${Math.round(peakPct * 100)}% peak-energy ${genre} tracks — only ${Math.round(warmupPct * 100)}% warmup material`,
        severity: warmupPct < 0.03 ? 'high' : 'medium',
      });
    } else if (warmupPct >= 0.70 && peakPct < 0.10) {
      insights.push({
        genre,
        message: `${genre} library skews slow — only ${Math.round(peakPct * 100)}% peak-energy tracks`,
        severity: 'medium',
      });
    }
  }
  return insights.slice(0, 3);
}

// ─── AI tools ────────────────────────────────────────────────────────────────

const GAP_TOOL: Anthropic.Tool = {
  name: 'report_library_gaps',
  description: 'Report DJ library gaps with specific track recommendations.',
  input_schema: {
    type: 'object',
    required: ['gaps'],
    properties: {
      gaps: {
        type: 'array',
        items: {
          type: 'object',
          required: ['genre', 'bpmRange', 'currentCount', 'severity', 'recommendations'],
          properties: {
            genre: { type: 'string' },
            bpmRange: { type: 'string' },
            currentCount: { type: 'number' },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            recommendations: {
              type: 'array',
              items: {
                type: 'object',
                required: ['artist', 'title', 'bpm', 'reason', 'beatportSearchUrl'],
                properties: {
                  artist: { type: 'string' },
                  title: { type: 'string' },
                  bpm: { type: 'number' },
                  reason: { type: 'string' },
                  beatportSearchUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

const EMERGING_TOOL: Anthropic.Tool = {
  name: 'report_emerging_artists',
  description: 'Report currently rising/emerging DJ artists per genre.',
  input_schema: {
    type: 'object',
    required: ['results'],
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          required: ['genre', 'artists'],
          properties: {
            genre: { type: 'string' },
            artists: {
              type: 'array',
              items: {
                type: 'object',
                required: ['artist', 'reason', 'beatportSearchUrl'],
                properties: {
                  artist: { type: 'string' },
                  reason: { type: 'string' },
                  beatportSearchUrl: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ─── System prompts ───────────────────────────────────────────────────────────

const GAP_SYSTEM = `You are a DJ library gap analyst. You receive a list of BPM/genre gaps in a DJ's library.

For each gap, recommend 3 specific real tracks that would fill it — tracks a professional DJ would know and that are available on Beatport or DJcity. Use your knowledge of well-regarded tracks in the genre and BPM range. Prioritise tracks released in the last 3 years but include classics if they best fit the range.

Genre guidance:
- House / Tech House / Afro House → well-known house records in the BPM range
- Techno / Minimal → techno tracks at the correct BPM
- Hip Hop / Trap / Drill → DJ-friendly hip hop edits or originals
- R&B / Soul → R&B tracks that work in a DJ set
- Latin / Reggaeton → Latin tracks at the correct tempo
- Pop / Top 40 → DJ-friendly pop edits
- Afrobeats → Afrobeats records in the range
- EDM / Big Room → festival-ready tracks at the BPM

Call report_library_gaps with all gaps filled in. Include 3 recommendations per gap.
For beatportSearchUrl use: https://www.beatport.com/search?q=ARTIST+TITLE (URL-encode, replace spaces with +).`;

const EMERGING_SYSTEM = `You are a DJ trend scout. Find emerging artists gaining momentum in DJ circles — breakthrough acts, rising artists getting chart placements, new names earning support from established DJs. Prioritise artists who have released in the last 12 months and are gaining traction.`;

// ─── AI fetch functions ───────────────────────────────────────────────────────

async function fetchBpmGapRecs(rawGaps: RawGap[], onUsage?: (u: CallUsage) => void): Promise<LibraryGap[]> {
  const anthropic = getAnthropic();
  const userMsg = `Library gaps:\n${JSON.stringify(rawGaps, null, 2)}\n\nRecommend 3 tracks per gap and call report_library_gaps.`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: GAP_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
    tools: [GAP_TOOL],
    tool_choice: { type: 'tool', name: 'report_library_gaps' },
    thinking: { type: 'disabled' as const },
  }, { timeout: 120_000, maxRetries: 0 });
  onUsage?.(usageFrom(MODEL, msg));

  const block = msg.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
  );
  if (!block) return [];
  return (block.input as { gaps: LibraryGap[] }).gaps ?? [];
}

async function fetchEmergingArtists(
  genres: string[],
  libraryArtists: Set<string>,
  onUsage?: (u: CallUsage) => void,
): Promise<Map<string, EmergingArtist[]>> {
  if (!genres.length) return new Map();

  const anthropic = getAnthropic();
  const userMsg = `Find 3 emerging/rising DJ artists in each of these genres gaining traction in 2026: ${genres.join(', ')}. Focus on breakthrough acts with releases in the last 12 months, not established headliners. Call report_emerging_artists with your findings.`;

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: EMERGING_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
    tools: [EMERGING_TOOL],
    tool_choice: { type: 'tool', name: 'report_emerging_artists' },
    thinking: { type: 'disabled' as const },
  }, { timeout: 120_000, maxRetries: 0 });
  onUsage?.(usageFrom(MODEL, msg));

  const block = msg.content.find(
    (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
  );
  const results = (block?.input as { results: { genre: string; artists: EmergingArtist[] }[] })?.results ?? [];

  const map = new Map<string, EmergingArtist[]>();
  for (const r of results) {
    const filtered = r.artists
      .filter(a => !libraryArtists.has(a.artist.toLowerCase().trim()))
      .slice(0, 3);
    map.set(r.genre, filtered);
  }
  return map;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { banned } = await recordUsage(user.id, 'analyze-gaps');
    if (banned) return NextResponse.json({ error: 'account_suspended' }, { status: 403 });

    const admin = createAdminClient();

    const { data: library } = await admin
      .from('serato_libraries')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!library) return NextResponse.json({ error: 'No library found' }, { status: 404 });

    const PAGE = 1000;
    const rawTracks: Array<{ bpm: number | null; genre: string | null; artist: string | null; lastfm_tags: unknown }> = [];
    let from = 0;
    while (true) {
      const { data: page } = await admin
        .from('serato_tracks')
        .select('bpm, genre, artist, lastfm_tags')
        .eq('library_id', library.id)
        .eq('in_library', true)
        .range(from, from + PAGE - 1);
      if (!page?.length) break;
      rawTracks.push(...page);
      if (page.length < PAGE) break;
      from += PAGE;
    }

    if (!rawTracks.length) return NextResponse.json({ error: 'Library is empty' }, { status: 404 });

    // Apply sub-genre resolution using lastfm_tags
    const tracks = rawTracks.map(t => ({
      bpm: t.bpm,
      genre: resolveSubGenre(t.genre ?? '', (t.lastfm_tags as string[] | null) ?? []),
    }));

    const libraryArtists = new Set(
      rawTracks
        .map(t => ((t.artist as string | null) ?? '').toLowerCase().trim())
        .filter(Boolean),
    );

    const rawGaps = detectGaps(tracks);
    const energyInsights = detectEnergyGaps(tracks);
    // Count only genres with ≥5 tracks and exclude catch-all buckets
    const EXCLUDED_GENRES = new Set(['Unknown', 'Other', 'EDM', 'Dance', 'Pop']);
    const genreCountMap: Record<string, number> = {};
    for (const t of tracks) { if (t.genre) genreCountMap[t.genre] = (genreCountMap[t.genre] ?? 0) + 1; }
    const genresAnalyzed = Object.entries(genreCountMap)
      .filter(([g, n]) => n >= 25 && !EXCLUDED_GENRES.has(g)).length;
    const meta = { tracksAnalyzed: tracks.length, genresAnalyzed };

    if (!rawGaps.length) {
      return NextResponse.json({ gaps: [], energyInsights, meta });
    }

    const gapGenres = [...new Set(rawGaps.map(g => g.genre))].slice(0, 3);

    const usages: CallUsage[] = [];
    const pushUsage = (u: CallUsage) => usages.push(u);
    const [gapsWithRecs, emergingMap] = await Promise.all([
      fetchBpmGapRecs(rawGaps, pushUsage).catch(err => {
        console.error('[analyze-gaps] fetchBpmGapRecs failed:', err instanceof Error ? err.message : err);
        return rawGaps.map(g => ({ ...g, recommendations: [] as GapRecommendation[] }));
      }),
      fetchEmergingArtists(gapGenres, libraryArtists, pushUsage).catch(() => new Map<string, EmergingArtist[]>()),
    ]);
    await recordCost(user.id, 'analyze-gaps', usages);

    const enrichedGaps = (gapsWithRecs ?? []).map(gap => ({
      ...gap,
      emergingArtists: emergingMap.get(gap.genre) ?? [],
    }));

    return NextResponse.json({ gaps: enrichedGaps, energyInsights, meta });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[analyze-gaps]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
