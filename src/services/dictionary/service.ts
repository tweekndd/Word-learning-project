import { dictionaryEntryRepo } from '@/db/repositories';
import type { DictionaryEntryDto, DictionaryLookupResult, DictionaryProvider } from '@/types/dictionary';
import type { Settings, Vocabulary } from '@/types/domain';
import { MockDictionaryProvider } from './mock';
import { CollinsDictionaryProvider, type CollinsProviderConfig } from './collins';

export interface DictionaryServiceOptions {
  settings: Settings;
  now?: () => number;
  /** Injected for tests; falls back to real providers. */
  providers?: Partial<DictionaryProviders>;
  collinsConfig?: CollinsProviderConfig;
}

export interface DictionaryProviders {
  mock: DictionaryProvider;
  collins: DictionaryProvider;
}

export interface DictionaryResult extends DictionaryLookupResult {
  fromCache: boolean;
}

const COLLINS_TTL_MS = 7 * 86_400_000;

/**
 * High-level dictionary access used by the UI. Owns the DB-backed,
 * vocabulary-scoped cache and the provider selection from settings.
 */
export class DictionaryService {
  private readonly providers: DictionaryProviders;
  private readonly now: () => number;

  constructor(private readonly options: DictionaryServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    this.providers = {
      mock: options.providers?.mock ?? new MockDictionaryProvider(),
      collins:
        options.providers?.collins ??
        new CollinsDictionaryProvider(options.collinsConfig ?? {}),
    };
  }

  get providerName(): string {
    return this.options.settings.dictionaryProviderConfig.provider;
  }

  private activeProvider(): DictionaryProvider {
    return this.providerName === 'collins' ? this.providers.collins : this.providers.mock;
  }

  async getEntry(vocabulary: Vocabulary, opts: { refresh?: boolean } = {}): Promise<DictionaryResult> {
    const provider = this.activeProvider();
    const cached = await dictionaryEntryRepo.getForVocabulary(vocabulary.id, provider.name);

    if (cached && !opts.refresh) {
      const expired = cached.expiresAt !== undefined && cached.expiresAt < this.now();
      if (!expired) {
        return { found: true, entry: cached.data as DictionaryEntryDto, fromCache: true };
      }
    }

    const remote = await provider.lookup(vocabulary.word);

    if (remote.found && remote.entry) {
      await dictionaryEntryRepo.save({
        vocabularyId: vocabulary.id,
        provider: provider.name,
        providerEntryId: remote.entry.sourceEntryId,
        data: remote.entry,
        fetchedAt: this.now(),
        expiresAt: this.now() + COLLINS_TTL_MS,
      });
      return { found: true, entry: remote.entry, fromCache: false, suggestions: remote.suggestions };
    }

    if (cached) {
      // Refresh failed — keep showing the previous cached entry (taskbook §5.5).
      return { found: true, entry: cached.data as DictionaryEntryDto, fromCache: true, error: remote.error };
    }

    return { found: false, error: remote.error, suggestions: remote.suggestions, fromCache: false };
  }

  async getHintSentence(vocabulary: Vocabulary): Promise<string | undefined> {
    const result = await this.getEntry(vocabulary);
    const example = result.entry?.examples.find((e) => e.english.trim().length > 0);
    return example?.english;
  }
}

export function createDictionaryService(settings: Settings, collinsConfig?: CollinsProviderConfig): DictionaryService {
  return new DictionaryService({ settings, collinsConfig });
}
