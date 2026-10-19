import { describe, it, expect, vi } from 'vitest';
import {
  CachedDictionaryProvider,
  cacheKey,
  memoryCacheStore,
} from '@/services/dictionary/cache';
import { buildMockEntry } from '@/services/dictionary/mock';
import type { DictionaryLookupResult, DictionaryProvider } from '@/types/dictionary';

function providerReturning(result: DictionaryLookupResult, spy = vi.fn()): DictionaryProvider & { calls: number } {
  const p: DictionaryProvider & { calls: number } = {
    name: 'mock',
    calls: 0,
    async lookup() {
      p.calls += 1;
      spy();
      return result;
    },
  };
  return p;
}

describe('cached dictionary provider (§12.5.4-5)', () => {
  it('serves a cache hit without calling the remote', async () => {
    const entry = buildMockEntry('car');
    const remote = providerReturning({ found: true, entry });
    const cached = new CachedDictionaryProvider(remote, memoryCacheStore());
    const first = await cached.lookup('car');
    const second = await cached.lookup('car');
    expect(first.found).toBe(true);
    expect(second.found).toBe(true);
    expect(remote.calls).toBe(1);
  });

  it('keeps the old cache when a refresh fails', async () => {
    const entry = buildMockEntry('car');
    let fail = false;
    const remote: DictionaryProvider = {
      name: 'mock',
      async lookup() {
        if (fail) return { found: false, error: { kind: 'server', message: 'down', retryable: true } };
        return { found: true, entry };
      },
    };
    const cached = new CachedDictionaryProvider(remote, memoryCacheStore(), { forceRefresh: false });
    await cached.lookup('car');
    fail = true;
    // Force a refresh that fails.
    const forced = new CachedDictionaryProvider(remote, memoryCacheStore());
    void forced;
    const withRefresh = new CachedDictionaryProvider(
      remote,
      (() => {
        const store = memoryCacheStore();
        store.set(cacheKey('mock', 'car'), entry);
        return store;
      })(),
      { forceRefresh: true },
    );
    const result = await withRefresh.lookup('car');
    expect(result.found).toBe(true);
    expect(result.entry?.word).toBe('car');
  });

  it('uses the normalized word as the cache key', () => {
    expect(cacheKey('collins', '  Negotiate ')).toBe('collins:negotiate');
  });
});
