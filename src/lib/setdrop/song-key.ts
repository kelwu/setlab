// "Same song" detection for DJ-pool libraries.
//
// A DJ library routinely holds several versions of one song — "(Clean Extended)",
// "(Dirty Extended)", "(Intro Clean)", "(Extended Mix)" — each a separate track
// with its own id. To the set builder they must count as ONE song, or a set can
// open and close on the same record. songKey() collapses those versions while
// keeping genuinely different records apart: a different remix/edit (the remixer's
// name survives) or a different artist is a different key.

// Words that only describe a DJ-pool version of the same recording. A bracketed
// group made up entirely of these is stripped; any other word (a remixer's name,
// "Remix", "Dub", "Acapella", "Instrumental") keeps the group, so remixes and DJ
// tools stay distinct.
const VERSION_WORDS = new Set([
  'clean', 'dirty', 'explicit', 'extended', 'ext', 'intro', 'outro', 'original',
  'mix', 'radio', 'edit', 'short', 'quick', 'hit', 'main', 'version', 'club',
  'hype', 'snip', 'cut', 'remastered', 'remaster', 'single', 'album', 'full',
  'length', 'clap', 'in', 'out', 'and',
]);

function norm(s: string): string {
  return (s ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isVersionOnly(group: string): boolean {
  const words = norm(group).split(' ').filter(Boolean);
  return words.length > 0 && words.every(w => VERSION_WORDS.has(w) || /^\d+$/.test(w));
}

/** Title with featured-artist credits and pure version labels removed. */
export function baseTitle(title: string): string {
  let t = title ?? '';
  // Featured credits in brackets: "(feat. X)", "[ft. Y]".
  t = t.replace(/[([]\s*(?:feat\.?|ft\.?|featuring)\s[^)\]]*[)\]]/gi, ' ');
  // Bracketed groups that are only version words.
  t = t.replace(/[([]([^)\]]*)[)\]]/g, (m, inner: string) => (isVersionOnly(inner) ? ' ' : m));
  // Unbracketed featured credits: "Push It feat. Mason feat. X (Extended Mix)".
  t = t.replace(/\s(?:feat\.?|ft\.?|featuring)\s[^([]*/gi, ' ');
  // Trailing " - Extended Mix" / " - Clean" style suffixes.
  t = t.replace(/\s[-–—]\s([^-–—]+)$/, (m, tail: string) => (isVersionOnly(tail) ? ' ' : m));
  return norm(t);
}

/** Order-insensitive artist set: "HUGEL, Imael Angel & Ultra Nate" == "Ultra Nate, Hugel, Imael Angel". */
export function artistKey(artist: string): string {
  const parts = (artist ?? '')
    .replace(/\b(?:feat|ft|featuring)\b\.?/gi, ',')
    .split(/\s*(?:,|&|\+|\/|;|\bx\b|\bvs\b\.?|\band\b)\s*/i)
    .map(norm)
    .filter(Boolean);
  return [...new Set(parts)].sort().join('|');
}

/** One key per song across its DJ-pool versions. */
export function songKey(artist: string, title: string): string {
  return `${artistKey(artist)}::${baseTitle(title)}`;
}

/** The version words present in a title, e.g. {clean, extended} for "(Clean Extended)". */
export function versionWords(title: string): Set<string> {
  const out = new Set<string>();
  for (const m of (title ?? '').matchAll(/[([]([^)\]]*)[)\]]/g)) {
    if (!isVersionOnly(m[1])) continue;
    for (const w of norm(m[1]).split(' ')) if (VERSION_WORDS.has(w)) out.add(w);
  }
  return out;
}
