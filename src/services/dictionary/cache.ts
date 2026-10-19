import type { DictionaryEntryDto, DictionaryLookupResult, DictionaryProvider } from '@/types/dictionary';
import { normalizeWord } from '@/utils/text';

export interface DictionaryCacheStore {
  get(key: string): DictionaryEntryDto | undefined;
  set(key: string, entry: DictionaryEntryDto): void;
}

export interface CachedProviderOptions {
  /** TTL in ms; expired entries are still returned on refresh failure. */
  ttlMs?: number;
  now?: () => number;
  /** Force a network refresh even when a fresh cache entry exists. */
  forceRefresh?: boolean;
}

export function memoryCacheStore(): DictionaryCacheStore {
  const map = new Map<string, DictionaryEntryDto>();
  return {
    get: (key) => map.get(key),
    set: (key, entry) => void map.set(key, entry),
  };
}

export function cacheKey(provider: string, word: string): string {
  return `${provider}:${normalizeWord(word)}`;
}

/**
 * Cache-first decorator (taskbook §5.5): reads the cache, falls back to the
 * remote provider, and on a failed refresh keeps the previous cached value.
 */
export class CachedDictionaryProvider implements DictionaryProvider {
  readonly name: string;

  constructor(
    private readonly remote: DictionaryProvider,
    private readonly store: DictionaryCacheStore,
    private readonly options: CachedProviderOptions = {},
  ) {
    this.name = remote.name;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private isFresh(entry: DictionaryEntryDto): boolean {
    const ttl = this.options.ttlMs ?? Number.POSITIVE_INFINITY;
    if (ttl === Number.POSITIVE_INFINITY) return true;
    return this.now() - entry.fetchedAt < ttl;
  }

  async lookup(word: string): Promise<DictionaryLookupResult> {
    const key = cacheKey(this.name, word);
    const cached = this.store.get(key);

    if (cached && !this.options.forceRefresh && this.isFresh(cached)) {
      return { found: true, entry: cached };
    }

    const result = await this.remote.lookup(word);
    if (result.found && result.entry) {
      this.store.set(key, result.entry);
      return result;
    }

    // Failed or not found: keep the previous cache when present.
    if (cached) {
      return { found: true, entry: cached, ...(result.suggestions ? { suggestions: result.suggestions } : {}) };
    }
    return result;
  }
}
