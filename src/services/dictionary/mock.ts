import type { DictionaryEntryDto, DictionaryLookupResult, DictionaryProvider } from '@/types/dictionary';
import { htmlToText } from '@/utils/sanitize';

export const MOCK_PROVIDER_NOTE =
  'MOCK 数据（开发/测试用），并非柯林斯或其他真实词典内容。';

/**
 * Deterministic mock provider. Used by tests and as the default before the
 * Collins key is configured. Every entry is explicitly labelled `mock`.
 */
export class MockDictionaryProvider implements DictionaryProvider {
  readonly name = 'mock';

  async lookup(word: string): Promise<DictionaryLookupResult> {
    const clean = word.trim();
    if (!clean) {
      return { found: false, error: { kind: 'not-found', message: '空单词', retryable: false } };
    }
    const entry = buildMockEntry(clean);
    return { found: true, entry };
  }
}

export function buildMockEntry(word: string): DictionaryEntryDto {
  const lower = word.toLowerCase();
  const example = `This is a mock example sentence using "${word}".`;
  const secondExample = `Another mock sentence to demonstrate "${lower}" in context.`;
  return {
    word,
    phonetic: `/ˈ${lower.slice(0, 3) || 'mɒk'}/`,
    partsOfSpeech: [
      {
        partOfSpeech: 'n.',
        senses: [
          {
            partOfSpeech: 'n.',
            englishDefinition: `Mock English definition for "${word}".`,
            chineseMeaning: `【MOCK】"${word}" 的占位中文释义`,
            examples: [
              { english: example, chineseTranslation: '【MOCK】示例句翻译（占位）' },
              { english: secondExample },
            ],
          },
        ],
      },
    ],
    chineseMeanings: [`【MOCK】"${word}" 的中文占位释义`],
    englishDefinition: `Mock English definition for "${word}".`,
    examples: [{ english: example, chineseTranslation: '【MOCK】示例句翻译（占位）' }],
    source: 'mock',
    provider: 'mock',
    sourceEntryId: `mock:${lower}`,
    fetchedAt: Date.now(),
    licenseNote: MOCK_PROVIDER_NOTE,
    cacheVersion: 1,
  };
}

/** A mock provider that returns no example sentences (for §12.1.4 tests). */
export class MockNoExampleProvider implements DictionaryProvider {
  readonly name = 'mock';

  async lookup(word: string): Promise<DictionaryLookupResult> {
    const entry = buildMockEntry(word);
    entry.examples = [];
    entry.partsOfSpeech = entry.partsOfSpeech.map((pos) => ({
      ...pos,
      senses: pos.senses.map((s) => ({ ...s, examples: [] })),
    }));
    return { found: true, entry };
  }
}

/** A mock provider that simulates a hard failure. */
export class MockFailingProvider implements DictionaryProvider {
  readonly name = 'mock';

  constructor(private readonly message = '模拟词典服务不可用') {}

  async lookup(_word: string): Promise<DictionaryLookupResult> {
    return {
      found: false,
      error: { kind: 'server', message: this.message, retryable: true },
    };
  }
}

/** Best-effort extraction of a hint sentence from arbitrary text. */
export function firstExampleSentence(text: string | undefined, fallback?: string): string | undefined {
  if (!text) return fallback;
  const plain = htmlToText(text).replace(/\s+/g, ' ').trim();
  if (!plain) return fallback;
  const match = plain.match(/[^.!?]+[.!?]/);
  return (match?.[0] ?? plain).trim();
}
