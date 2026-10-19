/**
 * Unified internal dictionary DTO. Every provider maps its raw response into
 * this shape so the rest of the app never depends on a provider's raw format.
 */

export type DictionarySource = 'mock' | 'collins' | 'user' | 'local';

export interface DictionarySense {
  partOfSpeech?: string;
  englishDefinition?: string;
  chineseMeaning?: string;
  examples: DictionaryExample[];
}

export interface DictionaryExample {
  english: string;
  chineseTranslation?: string;
}

export interface DictionaryTopic {
  topicId?: string;
  topicLabel: string;
  topicUrl?: string;
}

export interface DictionaryEntryDto {
  word: string;
  phonetic?: string;
  audioUrl?: string;
  partsOfSpeech: DictionaryPartsOfSpeech[];
  /** Plain text meanings supplied by the user or an explicitly labelled source. */
  chineseMeanings: string[];
  englishDefinition?: string;
  examples: DictionaryExample[];
  source: DictionarySource;
  provider: string;
  sourceEntryId?: string;
  sourceUrl?: string;
  /** Sanitised HTML body (Collins) when the provider returns HTML. */
  rawHtml?: string;
  fetchedAt: number;
  licenseNote?: string;
  cacheVersion: number;
  topics?: DictionaryTopic[];
}

export interface DictionaryPartsOfSpeech {
  partOfSpeech: string;
  senses: DictionarySense[];
}

export interface DictionaryLookupResult {
  found: boolean;
  entry?: DictionaryEntryDto;
  /** Suggestions when the exact word is not found (from didyoumean). */
  suggestions?: string[];
  error?: DictionaryError;
}

export type DictionaryErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'rate-limited'
  | 'server'
  | 'timeout'
  | 'network'
  | 'bad-response'
  | 'not-configured';

export interface DictionaryError {
  kind: DictionaryErrorKind;
  message: string;
  status?: number;
  retryable: boolean;
}

export interface DictionaryProvider {
  readonly name: string;
  lookup(word: string): Promise<DictionaryLookupResult>;
}

export const DICTIONARY_SCHEMA_VERSION = 1;
