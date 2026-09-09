// Explicit / clean-version detection from track titles.
//
// We have no explicit-content metadata on library tracks — Serato doesn't store a
// flag — so this is a TITLE HEURISTIC. DJ edits are conventionally marked in the
// title, e.g. "Song (Dirty)", "Song (Clean)", "Song (Radio Edit)".

const EXPLICIT_MARKER = /\(dirty\)|\[dirty\]|dirty (?:version|edit|mix)|\bexplicit\b/i;
const CLEAN_MARKER = /\(clean\)|\[clean\]|clean (?:edit|version)|\bradio edit\b/i;

/** True when the title is explicitly marked as a dirty / explicit version. */
export function isExplicitTitle(title: string): boolean {
  return EXPLICIT_MARKER.test(title ?? '');
}

/** True when the title is explicitly marked as a clean / radio edit. */
export function isCleanMarkedTitle(title: string): boolean {
  return CLEAN_MARKER.test(title ?? '');
}

/**
 * Whether a track passes a clean-only filter. Two modes, because the right
 * strictness differs by surface:
 *
 *  - 'block' (setlist generator): keep everything EXCEPT titles marked
 *    dirty/explicit. A full auto-generated set spans 40-70 tracks and most DJ
 *    libraries leave the majority of titles unmarked — an allowlist would collapse
 *    the pool and fail generation, so we only drop the known-explicit versions.
 *    The selector prompt already prefers clean/radio edits for corporate crowds;
 *    this makes "no explicit" a hard guarantee on top of that.
 *
 *  - 'allow' (crate builder): keep ONLY titles marked clean/radio-edit. Stricter,
 *    for a hand-curated dig where the DJ wants a verified-clean crate. (The crate
 *    route implements this inline today; kept here so the semantics are documented
 *    in one place.)
 */
export function passesCleanFilter(title: string, mode: 'block' | 'allow'): boolean {
  if (isExplicitTitle(title)) return false;
  return mode === 'allow' ? isCleanMarkedTitle(title) : true;
}
