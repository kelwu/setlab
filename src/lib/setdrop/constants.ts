export const SD = {
  // ─── Surfaces ────────────────────────────────────────────────────────────
  bg: '#0A0A0A',
  surface: '#141414',
  surface2: '#1A1A1A',
  surface3: '#222222',
  border: 'rgba(255,255,255,0.07)',
  borderMid: 'rgba(255,255,255,0.12)',

  // ─── Brand / accent ──────────────────────────────────────────────────────
  // Use accent for PRIMARY ACTIONS and wishlist-related UI only.
  // Do not use as default text color or generic decoration.
  accent: '#F5A623',
  accentDim: 'rgba(245,166,35,0.12)',
  accentHover: '#FFBA45',

  // ─── Text ────────────────────────────────────────────────────────────────
  text: '#F0F0F0',
  textSec: '#ADADAD',
  textMuted: '#909090',

  // ─── Semantic colors (use these by intent, not by color name) ────────────
  // success: library health, "synced", "in library", confirmation states
  success: '#22C55E',
  successDim: 'rgba(34,197,94,0.13)',
  // warning: yellow flags, "limited match", caution
  warning: '#EAB308',
  warningDim: 'rgba(234,179,8,0.13)',
  // danger: errors, destructive actions, "not found"
  danger: '#EF4444',
  dangerDim: 'rgba(239,68,68,0.13)',
  // info: secondary state, neutral notifications
  info: '#3B82F6',
  infoDim: 'rgba(59,130,246,0.13)',

  // ─── Legacy color aliases (kept for back-compat; prefer semantic names) ──
  green: '#22C55E',
  greenDim: 'rgba(34,197,94,0.13)',
  yellow: '#EAB308',
  yellowDim: 'rgba(234,179,8,0.13)',
  red: '#EF4444',
  redDim: 'rgba(239,68,68,0.13)',

  // ─── Spacing scale (use sN tokens instead of magic numbers) ──────────────
  s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32, s8: 48, s9: 64,

  // ─── Type scale ──────────────────────────────────────────────────────────
  // t10: micro labels, eyebrows
  // t11: small mono labels, badges
  // t12: standard mono body text, default UI
  // t13: emphasized mono / small headings within cards
  // t14: nav links, buttons
  // t16: card titles, larger labels
  // t20: section headings (small)
  // t28: medium display (status strip numbers, gig countdown)
  // t40: large display (Track ID page H1)
  // t52: hero display (Dashboard greeting)
  // t72: extra-large display (large stat numbers, special use)
  t10: 10, t11: 11, t12: 12, t13: 13, t14: 14, t16: 16, t20: 20, t28: 28, t40: 40, t52: 52, t72: 72,

  // ─── Border radius scale ─────────────────────────────────────────────────
  // r1: badges, pills, tightest corners
  // r2: small cards, buttons inside cards
  // r3: standard cards, surface containers
  // r4: featured cards, modals
  r1: 2, r2: 3, r3: 4, r4: 6,

  // ─── Fonts ───────────────────────────────────────────────────────────────
  mono: "var(--font-mono), monospace",
  display: "var(--font-display), sans-serif",
  body: "var(--font-body), sans-serif",
} as const;

export const GENRE_GROUPS: { label: string; genres: string[] }[] = [
  { label: 'House', genres: ['House', 'Deep House', 'Tech House', 'Afro House', 'Progressive House', 'Melodic House', 'Disco House', 'Nu-Disco', 'Electro House', 'Future House', 'Tropical House', 'Bass House', 'Indie Dance', 'Organic House'] },
  { label: 'Techno', genres: ['Techno', 'Minimal Techno', 'Melodic Techno', 'Industrial Techno', 'Peak-Time Techno', 'Hypnotic Techno'] },
  { label: 'Electronic Bass', genres: ['Drum & Bass', 'Liquid DnB', 'Jungle', 'Dubstep', 'Brostep', 'Future Bass', 'Breaks', 'Breakbeat', 'Electro', 'Jersey Club', 'Footwork', 'Juke', 'UK Bass', 'Grime'] },
  { label: 'UK / Garage', genres: ['UK Garage', '2-Step', 'Speed Garage', 'UK Funky', 'Bassline'] },
  { label: 'Trance / Hard', genres: ['Trance', 'Progressive Trance', 'Uplifting Trance', 'Psytrance', 'Hardstyle', 'Hardcore', 'Hard Techno', 'Rave'] },
  { label: 'Hip-Hop / Urban', genres: ['Hip-Hop', 'Old School Hip-Hop', 'Boom Bap', 'Trap', 'Drill', 'UK Drill', 'Phonk', 'R&B', 'Neo Soul', 'Afroswing'] },
  { label: 'Afro / Global', genres: ['Afrobeats', 'Afro Pop', 'Afro House', 'Amapiano', 'Gqom', 'Kwaito', 'Baile Funk', 'Kuduro', 'Highlife', 'Coupe Décalé', 'Azonto'] },
  { label: 'Dancehall / Caribbean', genres: ['Dancehall', 'Reggae', 'Reggae Dancehall', 'Soca', 'Kompa', 'Dembow'] },
  { label: 'Latin', genres: ['Reggaeton', 'Cumbia', 'Salsa', 'Bachata', 'Merengue', 'Moombahton', 'Latin Pop', 'Perreo', 'Latin Trap'] },
  { label: 'Pop / Other', genres: ['Pop', 'Disco', 'Funk', 'Soul', 'Jazz', 'Ballroom', 'Synthwave', 'K-Pop', 'Indie', 'Electronic Pop', 'Ambient', 'Chillout', 'Lo-Fi'] },
];

export const GENRES = GENRE_GROUPS.flatMap(g => g.genres);
export const CROWD_TYPES = ['Club','Lounge','Wedding','Festival','House Party','Radio','Corporate'] as const;
// Formal / theme-sensitive crowds: a "clean" (bleeped/radio) edit isn't enough —
// the SUBJECT MATTER must also suit a professional/family/broadcast room. Drives
// the selector's theme-appropriateness steer + the honest review-note caveat
// (see pipeline.ts). Case-insensitive membership; compare via .toLowerCase().
export const THEME_SENSITIVE_CROWDS = ['Corporate','Wedding','Radio','Lounge'] as const;

/** Whether a crowd-context string is a formal / theme-sensitive room. */
export function isThemeSensitiveCrowd(crowdContext?: string): boolean {
  const c = (crowdContext ?? '').toLowerCase().trim();
  return THEME_SENSITIVE_CROWDS.some(t => t.toLowerCase() === c);
}
export const LINEUP_SLOTS = ['Opener','Middle','Headliner','Closing'] as const;
export const DURATION_OPTS = ['30 min','60 min','90 min','120 min','180 min'] as const;
// Era axis: decade labels for the pool selector. parseInt(label) yields the
// decade-start year stored on SetlistInput.eras (e.g. "2000s" → 2000).
export const DECADES = ['1980s','1990s','2000s','2010s','2020s'] as const;

export type ConfidenceStatus = 'green' | 'yellow' | 'red';

export interface TrackStores {
  beatport: ConfidenceStatus;
  bpmSupreme: ConfidenceStatus;
  traxsource: ConfidenceStatus;
  djcity: ConfidenceStatus;
}

export interface SampleTrack {
  pos: number;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  energy: number;
  wishlist: boolean;
  wordplay: string | null;
  why: string;
  transition: string;
  stores: TrackStores;
  storeUrls?: Partial<Record<keyof TrackStores, string>>;
  genre?: string;
}

const ELECTRONIC_GENRES = new Set(['house', 'tech house', 'disco house', 'techno', 'drum & bass', 'dnb', 'trance', 'edm', 'electronic', 'dance', 'garage', 'uk garage', 'dubstep', 'ambient']);
const URBAN_GENRES = new Set(['hip hop', 'r&b', 'afrobeats', 'afrobeat', 'dancehall', 'latin', 'reggaeton', 'trap', 'grime']);

export function orderedStores(genre?: string): (keyof TrackStores)[] {
  const g = (genre ?? '').toLowerCase();
  if (ELECTRONIC_GENRES.has(g)) return ['beatport', 'traxsource', 'bpmSupreme', 'djcity'];
  if (URBAN_GENRES.has(g))      return ['djcity', 'bpmSupreme', 'traxsource', 'beatport'];
  return ['beatport', 'bpmSupreme', 'traxsource', 'djcity'];
}

export const SAMPLE_TRACKS: SampleTrack[] = [
  { pos:1, artist:'Burna Boy', title:'Last Last', bpm:107, key:'4A', energy:3,
    wishlist:false, wordplay:null,
    why:'Perfect opener — familiar Afrobeats groove that eases the crowd in without showing your hand. Mid-tempo, emotionally resonant.',
    transition:'Blend on 8-bar loop. BPM match with pitch lock. Let the outro breathe.',
    stores:{ beatport:'green', bpmSupreme:'green', traxsource:'yellow', djcity:'green' }},
  { pos:2, artist:'Wizkid', title:'Essence (feat. Tems)', bpm:112, key:'4B', energy:4,
    wishlist:false, wordplay:null,
    why:'Key-compatible (4A → 4B), +5 BPM step-up maintains momentum. Emotional vocal keeps the early crowd engaged.',
    transition:'Low-pass filter exit, cut clean at 4-bar phrase. Gain match critical here.',
    stores:{ beatport:'green', bpmSupreme:'green', traxsource:'green', djcity:'green' }},
  { pos:3, artist:'Drake', title:'Rich Flex', bpm:138, key:'11B', energy:6,
    wishlist:true, wordplay:null,
    why:'Energy jump — the set shifts gears here. Crowd recogniser, creates a room-wide moment. Download before gig.',
    transition:'Filter swap at the break. Chop the intro.',
    stores:{ beatport:'yellow', bpmSupreme:'green', traxsource:'red', djcity:'green' }},
  { pos:4, artist:'Adekunle Gold', title:'Okay (feat. Wale)', bpm:120, key:'9A', energy:6,
    wishlist:false, wordplay:null,
    why:'Hip hop / Afrobeats crossover keeps both audiences locked. Sustains the energy peak with melodic relief.',
    transition:'BPM match, transition on chorus drop. Key change managed with brief filter.',
    stores:{ beatport:'green', bpmSupreme:'yellow', traxsource:'green', djcity:'green' }},
  { pos:5, artist:'4B & Chris Lorenzo', title:'Baddadan', bpm:128, key:'8B', energy:9,
    wishlist:false, wordplay:null,
    why:'Peak energy moment. The breakdown-to-drop lands after the R&B wave — dance floor reset. Absolute weapon.',
    transition:'Bass cut risers, delay throw on the vocal, big drop.',
    stores:{ beatport:'green', bpmSupreme:'yellow', traxsource:'green', djcity:'yellow' }},
  { pos:6, artist:'Tems', title:'Free Mind', bpm:124, key:'6A', energy:7,
    wishlist:false, wordplay:null,
    why:'Sustain phase — Tems holds the room after the peak. Crowd favourite, emotional height at a slightly lower intensity.',
    transition:'BPM match, swap on intro. Smooth.',
    stores:{ beatport:'yellow', bpmSupreme:'green', traxsource:'yellow', djcity:'green' }},
  { pos:7, artist:'DJ Snake', title:'Taki Taki (feat. Ozuna)', bpm:130, key:'5B', energy:7,
    wishlist:true, wordplay:null,
    why:'Latin pivot broadens the genre palette mid-set. Cross-cultural crowd moment. Download before gig.',
    transition:'Echo throw on the vocal exit, swap at 4-bar phrase.',
    stores:{ beatport:'green', bpmSupreme:'green', traxsource:'green', djcity:'green' }},
  { pos:8, artist:'Davido', title:'Fall', bpm:103, key:'3A', energy:4,
    wishlist:false, wordplay:null,
    why:'Cooldown begins. Slow, familiar, melodic. Lets the crowd breathe after the sustained peak.',
    transition:'Low-pass filter, gradual tempo reduction over 16 bars.',
    stores:{ beatport:'red', bpmSupreme:'yellow', traxsource:'green', djcity:'green' }},
];

export const LIBRARY_TRACKS: SampleTrack[] = [
  ...SAMPLE_TRACKS,
  { pos:9, artist:'Afrobeats All Stars', title:'Feeling', bpm:112, key:'4B', energy:5, wishlist:false, wordplay:null, why:'', transition:'', stores:{beatport:'green',bpmSupreme:'green',traxsource:'green',djcity:'green'} },
  { pos:10, artist:'Kizz Daniel', title:'Cough (Odo)', bpm:108, key:'2A', energy:4, wishlist:false, wordplay:null, why:'', transition:'', stores:{beatport:'green',bpmSupreme:'yellow',traxsource:'green',djcity:'green'} },
  { pos:11, artist:'Ayra Starr', title:'Rush', bpm:115, key:'7B', energy:5, wishlist:true, wordplay:null, why:'', transition:'', stores:{beatport:'yellow',bpmSupreme:'green',traxsource:'yellow',djcity:'green'} },
  { pos:12, artist:'Rema', title:'Calm Down', bpm:106, key:'1A', energy:4, wishlist:false, wordplay:null, why:'', transition:'', stores:{beatport:'green',bpmSupreme:'green',traxsource:'green',djcity:'green'} },
  { pos:13, artist:'Omah Lay', title:'Soso', bpm:118, key:'8A', energy:5, wishlist:false, wordplay:null, why:'', transition:'', stores:{beatport:'yellow',bpmSupreme:'green',traxsource:'green',djcity:'green'} },
  { pos:14, artist:'Fireboy DML', title:'Peru', bpm:126, key:'10B', energy:6, wishlist:true, wordplay:null, why:'', transition:'', stores:{beatport:'green',bpmSupreme:'yellow',traxsource:'red',djcity:'green'} },
  { pos:15, artist:'Asake', title:'Organise', bpm:133, key:'6B', energy:7, wishlist:false, wordplay:null, why:'', transition:'', stores:{beatport:'green',bpmSupreme:'green',traxsource:'yellow',djcity:'green'} },
];

export type PageId = 'landing' | 'dashboard' | 'builder' | 'output' | 'library' | 'share' | 'history';
