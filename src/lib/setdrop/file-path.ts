// A track's file_path only points at a real, exportable file when it ends in a
// known audio/video extension. Rekordbox's streaming integrations (SoundCloud,
// TIDAL, Beatport LINK, etc.) store references like "/soundcloud:tracks:12345" —
// no extension, no local file — so they can't be written into a Serato .crate or
// Rekordbox playlist as something the DJ software can actually load. We detect and
// skip them on export (and warn the user) instead of emitting broken entries.
const LOCAL_FILE_EXT = /\.(mp3|m4a|aac|alac|wav|aiff?|flac|ogg|opus|wma|mp4|m4v|mov)$/i;

export function isLocalFilePath(path?: string | null): boolean {
  return !!path && LOCAL_FILE_EXT.test(path.trim());
}
