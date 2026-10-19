import { describe, it, expect } from 'vitest';
import {
  MockDictionaryProvider,
  MockFailingProvider,
  MockNoExampleProvider,
  firstExampleSentence,
} from '@/services/dictionary/mock';

describe('mock dictionary provider (§12.5.8)', () => {
  it('returns a clearly labelled mock entry', async () => {
    const provider = new MockDictionaryProvider();
    const result = await provider.lookup('negotiate');
    expect(result.found).toBe(true);
    expect(result.entry?.source).toBe('mock');
    expect(result.entry?.provider).toBe('mock');
    expect(result.entry?.licenseNote).toContain('MOCK');
    expect(result.entry?.examples.length).toBeGreaterThan(0);
  });

  it('can be configured to return no examples', async () => {
    const provider = new MockNoExampleProvider();
    const result = await provider.lookup('negotiate');
    expect(result.found).toBe(true);
    expect(result.entry?.examples).toHaveLength(0);
  });

  it('simulates a failure without throwing', async () => {
    const provider = new MockFailingProvider('boom');
    const result = await provider.lookup('anything');
    expect(result.found).toBe(false);
    expect(result.error?.kind).toBe('server');
    expect(result.error?.retryable).toBe(true);
  });

  it('extracts a first sentence as a fallback hint', () => {
    expect(firstExampleSentence('First sentence. Second one.')).toBe('First sentence.');
    expect(firstExampleSentence(undefined, 'fallback')).toBe('fallback');
  });
});
