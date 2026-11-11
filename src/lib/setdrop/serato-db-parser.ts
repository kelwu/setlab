import { LibraryTrack } from '@/lib/agents/types';
import { toCamelot } from './key-utils';
import { stripBom, tagString16, tagString8, walkSeratoTags } from '@/lib/cues/serato/tags';

// Parses Serato's `database V2`. Works on a plain Uint8Array (Node's Buffer is a
// subclass), so the same parser runs on the server upload route and in the
// browser for the Serato → Rekordbox converter.

// A real file path always contains a slash or backslash and is <2KB
function looksLikePath(s: string): boolean {
  return s.length > 3 && s.length < 2000 && (s.includes('/') || s.includes('\\'));
}

function parseOtrk(payload: Uint8Array): { filePath?: string; title?: string; artist?: string; bpmStr?: string; key?: string; genre?: string; yearStr?: string } {
  const tags = walkSeratoTags(payload);
  const str16 = (name: string) => tagString16(tags, name);
  const str8 = (name: string) => tagString8(tags, name);

  // pfil/tpth/ptrk are UTF-16 BE; fall back to UTF-8 for older databases.
  // looksLikePath rejects garbled decodings (no slash = not a path).
  const pathCandidates = ['tpth', 'ptrk', 'pfil'].flatMap(tag => [str16(tag), str8(tag)]);
  const filePath = pathCandidates.find(c => c && looksLikePath(c));

  // Serato's year tag has varied across DB versions; try known candidates and
  // pick the first value that contains a 4-digit year (rather than betting on one).
  const yearCandidates = ['ttyr', 'tyer', 'tyr', 'ttyer']
    .flatMap(tag => [str16(tag), str8(tag)]);
  const yearStr = yearCandidates.find(c => c && /\d{4}/.test(c));

  return {
    filePath,
    title:   str16('tsng') ?? str8('tsng'),
    artist:  str16('tart') ?? str8('tart'),
    bpmStr:  str16('tbpm') ?? str8('tbpm'),
    key:     str16('tkey') ?? str8('tkey'),
    genre:   str16('tgen') ?? str8('tgen'),
    yearStr,
  };
}

export interface ParseSeratoDatabaseResult {
  tracks: LibraryTrack[];
  count: number;
}

export function parseSeratoDatabase(buffer: Uint8Array): ParseSeratoDatabaseResult {
  const topTags = walkSeratoTags(stripBom(buffer));
  const otrkList = topTags.get('otrk') ?? [];

  const tracks: LibraryTrack[] = [];
  for (let i = 0; i < otrkList.length; i++) {
    const { filePath, title, artist, bpmStr, key, genre, yearStr } = parseOtrk(otrkList[i]);
    if (!artist && !title) continue;
    const yearParsed = yearStr ? parseInt(yearStr.match(/\d{4}/)?.[0] ?? '', 10) : undefined;
    tracks.push({
      id: `db-${i}`,
      artist: artist ?? '',
      title:  title  ?? '',
      bpm:    parseFloat(bpmStr ?? '0') || 0,
      key:    toCamelot(key ?? ''),
      genre:  genre  ?? undefined,
      year:   yearParsed && yearParsed > 1900 && yearParsed < 2100 ? yearParsed : undefined,
      filePath: filePath ?? undefined,
      isWishlist: false,
      lastfmTags: [],
      enrichmentSource: 'serato',
    });
  }

  if (tracks.length === 0) {
    throw new Error('No tracks found — is this a Serato database V2 file?');
  }

  return { tracks, count: tracks.length };
}
