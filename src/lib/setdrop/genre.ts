import { GENRE_GROUPS } from './constants';

// Genre-similarity model for setlist selection. The core boundary is the SUPER-FAMILY
// (electronic vs open-format): a Trance/House/Techno gig must never pull R&B/Hip-Hop,
// and vice-versa. Within the same super-family we rank exact > family > adjacent.
// Reuses GENRE_GROUPS (constants.ts) as the fine-family + token source.

export type SuperFamily = 'electronic' | 'open-format' | 'other';
export type GenreTier = 'exact' | 'family' | 'adjacent' | 'unknown' | 'off';

function clean(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')          // strip parentheticals e.g. "Trance (Main Floor)"
    .replace(/[^a-z0-9&/' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Messy raw genre strings → a canonical token (already cleaned). Seeded from the real
// library data + analyze-gaps' alias map. Targets are tokens present in GENRE_GROUPS
// (or the catch-alls below), so token→super-family lookup is exact (no substring traps).
const ALIAS: Record<string, string> = {
  'hip hop': 'hip-hop', 'hiphop': 'hip-hop', 'rap': 'hip-hop', 'hip hop/rap': 'hip-hop',
  'hip-hop / r&b': 'hip-hop', 'hip-hop/r&b': 'hip-hop', 'hip hop / r&b': 'hip-hop', 'hip hop/r&b': 'hip-hop',
  'rap / hip-hop': 'hip-hop', 'rap/hip-hop': 'hip-hop',
  'rnb': 'r&b', 'r & b': 'r&b', 'r and b': 'r&b', 'rhythm and blues': 'r&b', 'soul': 'r&b', 'r&b / soul': 'r&b',
  'dance commercial/mainstream club': 'dance', 'dance / pop': 'dance', 'dance music': 'dance', 'dance commercial mainstream club': 'dance',
  'electronic / dance': 'edm', 'electronic/dance': 'edm', 'electronic dance music': 'edm', 'mainstage': 'edm', 'electronic': 'edm',
  'house music': 'house', 'soulful house': 'house', "funky / groove / jackin' house": 'house',
  'jackin house': 'house', "jackin' house": 'house', 'funky house': 'house', 'funky / groove / jackin house': 'house',
  'nu disco': 'nu-disco', 'nu disco / disco': 'nu-disco',
  'trance main floor': 'trance', 'trance / main floor': 'trance',
  'drum and bass': 'drum & bass', 'dnb': 'drum & bass', 'd&b': 'drum & bass',
  'afro beats': 'afrobeats', 'afropop': 'afro pop', 'afrobeat': 'afrobeats',
  'latin / reggaeton': 'reggaeton', 'latin/reggaeton': 'reggaeton', 'latin music': 'latin',
  'top 40': 'pop', 'pop music': 'pop',
};
const canonToken = (raw: string): string => {
  const c = clean(raw);
  return ALIAS[c] ?? c;
};

const ELECTRONIC_FAMILIES = new Set(['House', 'Techno', 'Electronic Bass', 'UK / Garage', 'Trance / Hard']);

// canonical token → family label, and → super-family, both built from GENRE_GROUPS
const TOKEN_FAMILY: Record<string, string> = {};
const TOKEN_SUPER: Record<string, SuperFamily> = {};
for (const grp of GENRE_GROUPS) {
  const sf: SuperFamily = ELECTRONIC_FAMILIES.has(grp.label) ? 'electronic' : 'open-format';
  for (const g of grp.genres) {
    // Key by canonToken, not clean(): lookups go through canonToken, and ALIAS
    // rewrites some cleaned names ("nu disco" → "nu-disco"). Keyed by clean(),
    // Nu-Disco never matched, classified as 'other', and passesGenreGate's
    // "unclassified gig genre → don't filter" branch let EVERY genre into a
    // Nu-Disco set (hip-hop, R&B, reggae).
    const c = canonToken(g);
    if (!(c in TOKEN_FAMILY)) TOKEN_FAMILY[c] = grp.label;          // keep first family
    if (!(c in TOKEN_SUPER) || sf === 'electronic') TOKEN_SUPER[c] = sf; // electronic wins for dual-listed (e.g. Afro House)
  }
}
// Electronic catch-alls that aren't fine genres in GENRE_GROUPS:
for (const t of ['dance', 'edm']) TOKEN_SUPER[t] = 'electronic';

// Word-boundary keyword fallback for messy strings not resolved by token lookup.
// Electronic checked first; \b boundaries stop 'dance' from matching 'dancehall'.
const EKW = ['house', 'techno', 'trance', 'dnb', 'drum & bass', 'garage', 'dubstep', 'electro', 'edm', 'minimal', 'progressive', 'hardstyle', 'psytrance', 'rave', 'dance'];
const OKW = ['hip hop', 'hip-hop', 'rap', 'r&b', 'rnb', 'soul', 'trap', 'drill', 'phonk', 'afrobeats', 'afrobeat', 'amapiano', 'dancehall', 'reggae', 'reggaeton', 'latin', 'moombahton', 'pop', 'funk'];
const wb = (kw: string, hay: string) => new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(hay);

export function superFamily(raw: string, tags: string[] = []): SuperFamily {
  const tok = canonToken(raw);
  if (TOKEN_SUPER[tok]) return TOKEN_SUPER[tok];
  for (const t of tags) { const tt = canonToken(t); if (TOKEN_SUPER[tt]) return TOKEN_SUPER[tt]; }
  const hay = [clean(raw), ...tags.map(clean)].filter(Boolean).join(' ');
  if (!hay) return 'other';
  if (EKW.some(k => wb(k, hay))) return 'electronic';
  if (OKW.some(k => wb(k, hay))) return 'open-format';
  return 'other';
}

function familyOf(raw: string, tags: string[] = []): string | null {
  const direct = TOKEN_FAMILY[canonToken(raw)];
  if (direct) return direct;
  for (const t of tags) { const f = TOKEN_FAMILY[canonToken(t)]; if (f) return f; }
  return null;
}

// How relevant a track is to the requested gig genre. Cross super-family = 'off'
// (excluded upstream). No genre + no tags = 'unknown' (kept only as low-priority
// fallback — where the old empty-string bug wrongly awarded a full match).
export function genreRelevance(gigGenre: string, trackGenre: string, tags: string[] = []): { tier: GenreTier; score: number } {
  const hasSignal = !!clean(trackGenre) || tags.some(t => !!clean(t));
  if (!hasSignal) return { tier: 'unknown', score: 0 };

  const gSuper = superFamily(gigGenre);
  const tSuper = superFamily(trackGenre, tags);
  if (gSuper !== 'other' && tSuper !== 'other' && gSuper !== tSuper) {
    return { tier: 'off', score: -1 };
  }

  const gTok = canonToken(gigGenre);
  const tTok = canonToken(trackGenre) || tags.map(canonToken).find(t => TOKEN_FAMILY[t]) || '';
  if (gTok && tTok && gTok === tTok) return { tier: 'exact', score: 4 };

  const gFam = familyOf(gigGenre);
  const tFam = familyOf(trackGenre, tags);
  if (gFam && tFam && gFam === tFam) return { tier: 'family', score: 3 };

  return { tier: 'adjacent', score: 2 };
}

// Disco-lineage genres that legitimately serve BOTH super-families — they bridge
// the electronic dance world and the open-format/party world, so they must never
// be judged out-of-bounds for either an electronic or an open-format gig. (Plain
// "Disco" classifies as open-format and Freestyle/Hi-NRG as 'other', yet all three
// belong in a disco-house or nu-disco set.)
const BRIDGE_GENRES = new Set([
  'disco', 'italo disco', 'italo', 'freestyle', 'hi nrg', 'nu-disco', 'disco house',
]);

function isBridgeGenre(raw: string, tags: string[] = []): boolean {
  if (BRIDGE_GENRES.has(canonToken(raw))) return true;
  return tags.some(t => BRIDGE_GENRES.has(canonToken(t)));
}

// SQL candidate fetch for a genre-defined gig: ILIKE substrings that cover the
// gig's whole super-family plus the disco-lineage bridges — i.e. roughly everything
// passesGenreGate could admit by tag. Single words only (no spaces/commas, so they
// drop straight into a PostgREST or() filter); '_' is ILIKE's one-char wildcard so
// 'r_b' matches "R&B" and 'nu_disco' matches both "Nu Disco" and "Nu-Disco". Over-
// matching is fine (the gate filters precisely afterwards); under-matching is what
// starved the pool before. Returns null for an unclassified ('other') gig genre.
const SUPER_FETCH: Record<Exclude<SuperFamily, 'other'>, string[]> = {
  electronic: [
    'house', 'techno', 'trance', 'garage', 'dubstep', 'electro', 'dance', 'edm',
    'minimal', 'progressive', 'hardstyle', 'hardcore', 'psy', 'rave', 'dnb', 'drum',
    'bass', 'jungle', 'breaks', 'breakbeat', 'grime', 'club', 'funky', '2_step', 'ukg',
  ],
  'open-format': [
    'hip', 'rap', 'r_b', 'rnb', 'soul', 'trap', 'drill', 'phonk', 'afro', 'amapiano',
    'dancehall', 'reggae', 'latin', 'moombahton', 'pop', 'funk', 'soca', 'cumbia',
    'salsa', 'bachata', 'merengue', 'urban', 'swing', 'top', 'gqom', 'kompa', 'dembow',
  ],
};
const BRIDGE_FETCH = ['disco', 'freestyle', 'nrg', 'italo'];

export function genreFetchPatterns(gigGenre: string): string[] | null {
  const sf = superFamily(gigGenre);
  if (sf === 'other') return null;
  return [...SUPER_FETCH[sf], ...BRIDGE_FETCH];
}

// The single genre-membership gate: is a candidate track in-bounds for a
// genre-defined gig? Use this EVERYWHERE a candidate pool or readiness count is
// filtered by genre — it is the source of truth that keeps the crate builder, the
// setlist pool, and the readiness signal from drifting apart.
//
// Why not just check genreRelevance().score >= 0? Because genreRelevance scores a
// genre it doesn't recognise ('other' super-family: Rock, Country…) as a soft
// "adjacent" (2), so a score gate leaks them into an electronic set (the
// Bon-Jovi-in-a-house-crate bug). This gate admits: an exact/family token match; a
// same-known-super-family track; a disco-lineage bridge; or — as a fallback so a
// thinly-tagged library still has a pool — a track with NO genre signal at all
// (tier 'unknown'). Everything else, including 'off' and soft-'adjacent' 'other'
// genres, is rejected.
//
// allowUnknown (default true) governs that untagged fallback. The setlist pool and
// readiness count keep it on (better a low-priority fallback than an empty pool).
// The crate-builder FILL turns it off — it must never pad a genre crate with tracks
// whose genre it can't confirm.
export function passesGenreGate(
  gigGenre: string, trackGenre: string, tags: string[] = [],
  opts: { allowUnknown?: boolean } = {},
): boolean {
  const { allowUnknown = true } = opts;
  const rel = genreRelevance(gigGenre, trackGenre, tags);
  if (rel.tier === 'exact' || rel.tier === 'family') return true;
  if (rel.tier === 'unknown') return allowUnknown;  // no genre signal — fallback, caller's choice
  const gSuper = superFamily(gigGenre);
  if (gSuper === 'other') return true;              // gig genre itself unclassified — don't over-filter
  if (isBridgeGenre(trackGenre, tags)) return true; // disco lineage serves any super-family
  // tier 'adjacent' or 'off': keep only within the same known super-family.
  return superFamily(trackGenre, tags) === gSuper;
}
