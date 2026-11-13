declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function track(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params);
}

// Fixed, low-cardinality categories for where an import dies. Each maps to a
// distinct throw site in the import flow so the funnel report can tell a
// pre-file-pick bounce from a parser format failure from a save error.
export type LibraryUploadFailReason =
  | 'upload_init'    // couldn't get a signed upload URL from the server
  | 'storage_upload' // direct-to-Storage upload failed
  | 'parse_throw'    // parse-db/parse-xml threw (bad/unsupported file format)
  | 'empty_parse'    // parsed successfully but found 0 tracks (wrong file)
  | 'save_error';    // parse ok, DB save failed

export const trackEvent = {
  // — Signup —
  signupStarted(method: 'email' | 'google') {
    track('signup_started', { method });
  },
  signUp(method: 'email' | 'google') {
    track('sign_up', { method });
  },

  // — Library import — `viewed` fires when the import screen mounts, BEFORE a
  // file is picked, so the funnel can see the pre-file-pick drop (users who
  // land on import but never find/select their library file). started/uploaded/
  // failed then cover the picked-a-file → success/failure legs, with `reason`
  // pinpointing which throw site killed a failed import.
  libraryImportViewed(djSoftware: 'serato' | 'rekordbox') {
    track('library_import_viewed', { dj_software: djSoftware });
  },
  libraryUploadStarted(djSoftware: 'serato' | 'rekordbox') {
    track('library_upload_started', { dj_software: djSoftware });
  },
  libraryUploaded(djSoftware: 'serato' | 'rekordbox') {
    track('library_uploaded', { dj_software: djSoftware });
  },
  libraryUploadFailed(djSoftware: 'serato' | 'rekordbox', reason: LibraryUploadFailReason) {
    track('library_upload_failed', { dj_software: djSoftware, reason });
  },

  // — Set generation — `reason` is a fixed category (not raw error text) to keep
  // cardinality low; 'rate_limited' distinguishes the quota wall from real errors.
  setGenerationStarted(genre: string, durationMinutes: number) {
    track('set_generation_started', { genre, duration_minutes: durationMinutes });
  },
  setGenerated(genre: string, trackCount: number, durationMinutes: number) {
    track('set_generated', {
      genre,
      track_count: trackCount,
      duration_minutes: durationMinutes,
    });
  },
  setGenerationFailed(reason: string, genre?: string) {
    track('set_generation_failed', genre ? { reason, genre } : { reason });
  },

  // — Crate generation —
  crateGenerated(trackCount: number) {
    track('crate_generated', { track_count: trackCount });
  },

  // — Export funnel — export is the paywall; `export_blocked` marks the monthly
  // wall (the upgrade moment), distinct from a real export.
  exportStarted(source: 'setlist' | 'crate', format: string) {
    track('export_started', { source, format });
  },
  exportBlocked(source: 'setlist' | 'crate') {
    track('export_blocked', { source });
  },

  // — Serato → Rekordbox converter (/convert) and cues in exports —
  cueConvertStarted(mode: 'library' | 'crates', tracks: number) {
    track('cue_convert_started', { mode, tracks });
  },
  cueScanCompleted(tracks: number, tracksWithCues: number, cues: number) {
    track('cue_scan_completed', { tracks, tracks_with_cues: tracksWithCues, cues });
  },
  cueScanFailed(reason: string) {
    track('cue_scan_failed', { reason });
  },
  cueConvertDownloaded(tracks: number, tracksWithCues: number, playlists: number) {
    track('cue_convert_downloaded', { tracks, tracks_with_cues: tracksWithCues, playlists });
  },
  cueExportCompleted(source: 'setlist' | 'crate', tracks: number, tracksWithCues: number) {
    track('cue_export_completed', { source, tracks, tracks_with_cues: tracksWithCues });
  },

  // — Upgrade funnel —
  upgradeClicked(source: string) {
    track('upgrade_clicked', { source });
  },
};
