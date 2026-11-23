// Per-account browser cache of the DJ's library.
//
// The library lives in Supabase; this cache only lets the app show the last
// known library when Supabase can't be reached. It used to be one unscoped
// `sd_library` key, so on a shared browser a new account picked up whatever
// library the previous account had cached. Every entry is now keyed by user id,
// and anything that isn't the signed-in user's is dropped.

export const LEGACY_LIBRARY_CACHE_KEY = 'sd_library';
const PREFIX = 'sd_library:';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function browserStore(): KeyValueStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // storage blocked
  }
}

export function libraryCacheKey(userId: string): string {
  return PREFIX + userId;
}

function isLibraryKey(key: string): boolean {
  return key === LEGACY_LIBRARY_CACHE_KEY || key.startsWith(PREFIX);
}

/** The signed-in user's cached library, or null if there is none (or it's unreadable). */
export function readLibraryCache<T>(userId: string, store: KeyValueStore | null = browserStore()): T[] | null {
  if (!store || !userId) return null;
  try {
    const raw = store.getItem(libraryCacheKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

/** Save the user's library; an empty list removes their entry. */
export function writeLibraryCache<T>(userId: string, tracks: T[] | null, store: KeyValueStore | null = browserStore()): void {
  if (!store || !userId) return;
  try {
    if (tracks && tracks.length) store.setItem(libraryCacheKey(userId), JSON.stringify(tracks));
    else store.removeItem(libraryCacheKey(userId));
  } catch { /* quota or blocked storage: the cache is optional */ }
}

function libraryKeys(store: KeyValueStore): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && isLibraryKey(k)) keys.push(k);
  }
  return keys;
}

/** Remove the legacy unscoped cache and every other account's cache. */
export function dropOtherLibraryCaches(userId: string, store: KeyValueStore | null = browserStore()): void {
  if (!store) return;
  try {
    const keep = userId ? libraryCacheKey(userId) : null;
    for (const k of libraryKeys(store)) if (k !== keep) store.removeItem(k);
  } catch { /* ignore */ }
}

/** Remove every cached library on this browser (sign-out, Clear). */
export function clearLibraryCaches(store: KeyValueStore | null = browserStore()): void {
  if (!store) return;
  try {
    for (const k of libraryKeys(store)) store.removeItem(k);
  } catch { /* ignore */ }
}
