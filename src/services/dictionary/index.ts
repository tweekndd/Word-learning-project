export { MockDictionaryProvider, MockNoExampleProvider, MockFailingProvider, buildMockEntry, MOCK_PROVIDER_NOTE, firstExampleSentence } from './mock';
export { CollinsDictionaryProvider, type CollinsProviderConfig } from './collins';
export {
  CachedDictionaryProvider,
  memoryCacheStore,
  cacheKey,
  type DictionaryCacheStore,
} from './cache';
export { DictionaryService, createDictionaryService, type DictionaryResult } from './service';
export {
  CollinsKeyService,
  createCollinsKeyService,
  validateAccessKey,
  type CollinsKeyStatus,
  type CollinsKeyTestResult,
} from './keys';
export { DictionaryRequestError, classifyStatus, notConfigured } from './errors';
export { extractCollinsContent } from './collinsExtract';
