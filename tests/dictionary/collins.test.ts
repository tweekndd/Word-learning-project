import { describe, it, expect, vi } from 'vitest';
import { CollinsDictionaryProvider } from '@/services/dictionary/collins';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ENTRY = {
  dictionaryCode: 'british',
  format: 'html',
  entryContent:
    '<p>a road vehicle with four wheels</p><span class="example">He parked the car outside.</span>',
  entryId: 'car',
  entryLabel: 'car',
  entryUrl: 'https://www.collinsdictionary.com/dictionary/english/car',
  topics: [{ topicId: 't1', topicLabel: 'Transport', topicUrl: 'https://x' }],
};

describe('Collins provider (§12.5)', () => {
  it('maps a normal response to the internal DTO without fabricating Chinese', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/pronunciations')) {
        return jsonResponse([{ entryId: 'car', lang: 'en', pronunciationUrl: 'https://audio/car.mp3' }]);
      }
      return jsonResponse(ENTRY);
    });
    const provider = new CollinsDictionaryProvider({ baseUrl: '/api/collins', fetchImpl });
    const result = await provider.lookup('car');
    expect(result.found).toBe(true);
    expect(result.entry?.source).toBe('collins');
    expect(result.entry?.sourceEntryId).toBe('car');
    expect(result.entry?.chineseMeanings).toEqual([]);
    expect(result.entry?.englishDefinition).toContain('road vehicle');
    expect(result.entry?.audioUrl).toBe('https://audio/car.mp3');
  });

  it('treats a missing entry body as not found and asks for suggestions', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('didyoumean')) return jsonResponse({ suggestions: ['cat', 'card'] });
      return jsonResponse({ dictionaryCode: 'british', entryLabel: 'car' });
    });
    const provider = new CollinsDictionaryProvider({ baseUrl: '/api/collins', fetchImpl });
    const result = await provider.lookup('carr');
    expect(result.found).toBe(false);
    expect(result.suggestions).toEqual(['cat', 'card']);
  });

  it('maps 401 to unauthorized and does not retry', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errorCode: 'x', errorMessage: 'no' }, 401));
    const provider = new CollinsDictionaryProvider({ baseUrl: '/api/collins', fetchImpl });
    const result = await provider.lookup('car');
    expect(result.error?.kind).toBe('unauthorized');
    expect(result.error?.retryable).toBe(false);
  });

  it('maps 429 and 5xx as retryable', async () => {
    for (const status of [429, 500, 503]) {
      const fetchImpl = vi.fn(async () => jsonResponse({}, status));
      const provider = new CollinsDictionaryProvider({ baseUrl: '/api/collins', fetchImpl });
      const result = await provider.lookup('car');
      expect(result.error?.retryable).toBe(true);
    }
  });

  it('maps aborts to timeout and thrown errors to network', async () => {
    const abortingFetch = vi.fn(async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const timeoutProvider = new CollinsDictionaryProvider({ baseUrl: '/api/collins', fetchImpl: abortingFetch });
    expect((await timeoutProvider.lookup('car')).error?.kind).toBe('timeout');

    const networkFetch = vi.fn(async () => {
      throw new Error('offline');
    });
    const networkProvider = new CollinsDictionaryProvider({ baseUrl: '/api/collins', fetchImpl: networkFetch });
    expect((await networkProvider.lookup('car')).error?.kind).toBe('network');
  });

  it('never sends an access key when using the proxy base URL', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).not.toHaveProperty('accessKey');
      return jsonResponse(ENTRY);
    });
    const provider = new CollinsDictionaryProvider({ baseUrl: '/api/collins', fetchImpl });
    await provider.lookup('car');
    expect(fetchImpl).toHaveBeenCalled();
  });
});
