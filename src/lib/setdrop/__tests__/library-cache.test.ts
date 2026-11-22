import { describe, expect, it } from 'vitest';
import {
  LEGACY_LIBRARY_CACHE_KEY,
  clearLibraryCaches,
  dropOtherLibraryCaches,
  libraryCacheKey,
  readLibraryCache,
  writeLibraryCache,
} from '../library-cache';

function memoryStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    keys: () => Array.from(m.keys()).sort(),
  };
}

const tracks = [{ artist: 'A', title: 'One' }, { artist: 'B', title: 'Two' }];

describe('library cache', () => {
  it('reads back only the same account\'s library', () => {
    const store = memoryStore();
    writeLibraryCache('user-a', tracks, store);
    expect(readLibraryCache('user-a', store)).toEqual(tracks);
    expect(readLibraryCache('user-b', store)).toBeNull();
  });

  it('never serves the old unscoped cache to anyone', () => {
    const store = memoryStore({ [LEGACY_LIBRARY_CACHE_KEY]: JSON.stringify(tracks) });
    expect(readLibraryCache('brand-new-user', store)).toBeNull();
  });

  it('drops the legacy key and other accounts\' caches, keeping the signed-in user\'s', () => {
    const store = memoryStore({
      [LEGACY_LIBRARY_CACHE_KEY]: '[]',
      [libraryCacheKey('user-a')]: JSON.stringify(tracks),
      [libraryCacheKey('user-b')]: JSON.stringify(tracks),
      sd_import_software: 'xml',
    });
    dropOtherLibraryCaches('user-b', store);
    expect(store.keys()).toEqual(['sd_import_software', libraryCacheKey('user-b')]);
  });

  it('writing an empty library removes that account\'s entry', () => {
    const store = memoryStore();
    writeLibraryCache('user-a', tracks, store);
    writeLibraryCache('user-a', [], store);
    expect(store.keys()).toEqual([]);
  });

  it('sign-out clears every cached library but leaves other settings', () => {
    const store = memoryStore({
      [LEGACY_LIBRARY_CACHE_KEY]: '[]',
      [libraryCacheKey('user-a')]: '[]',
      sd_onboarding_done: '1',
    });
    clearLibraryCaches(store);
    expect(store.keys()).toEqual(['sd_onboarding_done']);
  });

  it('treats corrupt or empty entries as no cache', () => {
    const store = memoryStore({ [libraryCacheKey('u')]: '{not json' });
    expect(readLibraryCache('u', store)).toBeNull();
    store.setItem(libraryCacheKey('u'), '[]');
    expect(readLibraryCache('u', store)).toBeNull();
  });

  it('does nothing without storage', () => {
    expect(readLibraryCache('u', null)).toBeNull();
    expect(() => { writeLibraryCache('u', tracks, null); clearLibraryCaches(null); dropOtherLibraryCaches('u', null); }).not.toThrow();
  });
});
