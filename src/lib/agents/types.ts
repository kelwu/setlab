// Shared types for the 5-agent setlist pipeline

export interface SetlistInput {
  name: string;
  // The candidate-track pool is defined by any combination (AND) of the axes
  // below: genre, era, artist, playlist. Each is optional; at least one must be
  // present (validated at the route + UI). None of them being required is the
  // whole point of the multi-axis model.
  primaryGenre?: string;
  secondaryGenre?: string;
  eras?: number[];            // decade-start years to include, e.g. [2000, 2010] = 2000s+2010s
  artists?: string[];         // anchor artists — pool is limited to tracks by these (substring match)
  similarArtists?: string[];  // Last.fm similar artists used to top up a thin anchor pool (set server-side, ranked)
  vibe?: string;
  crowdContext: string;
  durationMinutes: number;
  energyArc: {
    intro: number;
    buildup: number;
    peak: number;
    sustain: number;
    cooldown: number;
  };
  lineupSlot: string;
  sourcePlaylist?: string;    // when set, pool = this Rekordbox playlist; other axes narrow within it
  seedTracks?: string[];
  soundcloudUrl?: string;
  wordplayTheme?: string;
  venueContext?: string;
  recentlyPlayed?: string[];  // "Artist — Title" strings to avoid (do-not-repeat)
  cleanOnly?: boolean;        // corporate/radio: hard-exclude tracks marked explicit/dirty
}

export interface LibraryTrack {
  id: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  genre?: string;
  year?: number;
  filePath?: string;           // Full path as exported by Serato (used for .crate export)
  // Mood/energy signals from Last.fm tags (replaces Spotify audio features)
  lastfmTags?: string[];       // e.g. ["afrobeats", "feel-good", "summer", "danceable"]
  // Serato analysis data (available for tracks already in library)
  seratoEnergy?: number;       // 0-10 scale from Serato's own analysis
  // Source metadata
  enrichmentSource?: 'beatport' | 'serato' | 'rekordbox' | 'lastfm' | 'manual' | 'pending';
  isWishlist: boolean;
  beatportUrl?: string;
  beatportSearchUrl?: string;
  bpmSupremeSearchUrl?: string;
  traxsourceSearchUrl?: string;
  djcitySearchUrl?: string;
}

// Agent 1 output
export interface LibraryProfile {
  totalTracks: number;
  genreDistribution: Record<string, number>;
  bpmRange: { min: number; max: number; avg: number };
  energySpread: { low: number; mid: number; high: number };
  topArtists: string[];
  keyDistribution: Record<string, number>;
  wishlistCount: number;
  strengths: string[];
  gaps: string[];
}

// Agent 2 output
export interface GigIntelReport {
  venueName?: string;
  crowdProfile: string;
  trendingGenres: string[];
  recommendedBpmRange: { min: number; max: number };
  avoidArtists: string[];
  contextNotes: string;
}

// Agent 3 output
export interface SetBlueprint {
  totalTracks: number;
  phases: Array<{
    name: string;
    trackCount: number;
    energyTarget: number;
    bpmRange: { min: number; max: number };
    genreGuidance: string;
  }>;
  transitionStrategy: string;
  openerHeadlinerNotes: string;
}

// Agent 4 output — ordered track selection
export interface SelectedTrack extends LibraryTrack {
  position: number;
  phase: string;
  energyLevel: number;
  selectionReason: string;
  transitionNotes: string;
  harmonicMixingNotes: string;
  wordplayConnection?: string;
  isWishlistTrack: boolean;
}

// Agent 5 output — final reviewed setlist
export interface SetlistTrack {
  position: number;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  energyLevel: number;
  whyThisTrack: string;
  transitionNotes: string;
  harmonicMixingNotes: string;
  wordplayConnection?: string;
  isWishlistTrack: boolean;
  beatportUrl?: string;
  bpmSupremeSearchUrl?: string;
  traxsourceSearchUrl?: string;
  djcitySearchUrl?: string;
  // Persisted resolved store data — merged into tracks_json the first time a set
  // is viewed post-generation (see SetlistOutput), so admin / public / history
  // render the same purchase links + confidence the owner saw. Optional: absent
  // on freshly generated tracks and on sets saved before this was added.
  bpmSupremeUrl?: string;
  bpmSupremeFound?: boolean;
  traxsourceUrl?: string;
  traxsourceFound?: boolean;
  djcityUrl?: string;
  djcityFound?: boolean;
}

export interface GeneratedSetlist {
  name: string;
  tracks: SetlistTrack[];
  reviewNotes: string;
  shareSlug: string;
  dbId?: string;
  dbSlug?: string;
  generatedAt?: string;
  excludedCount?: number;
  libraryTracksUsed?: number;
  input?: {
    primaryGenre?: string;
    secondaryGenre?: string;
    eras?: number[];
    artists?: string[];
    crowdContext: string;
    durationMinutes: number;
    lineupSlot: string;
    mixName?: string;
    vibe?: string;
    venueName?: string;
    arcPoints?: number[];
    seedSearch?: string;
    soundcloudUrl?: string;
    wordplay?: string;
  };
}
