import type {
  DictionaryEntryDto,
  DictionaryLookupResult,
  DictionaryProvider,
  DictionaryTopic,
} from '@/types/dictionary';
import { DictionaryRequestError, classifyStatus, notConfigured } from './errors';
import { extractCollinsContent } from './collinsExtract';
import { stripHtml } from '@/utils/sanitize';

export interface CollinsProviderConfig {
  /** Base URL of the local proxy (default `/api/collins`). Never the raw host:
   *  the access key lives server-side only. */
  baseUrl?: string;
  dictionaryCode?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Set to true to hit api.collinsdictionary.com directly (tests only). */
  direct?: boolean;
  accessKey?: string;
}

interface CollinsEntryResponse {
  dictionaryCode?: string;
  format?: string;
  entryContent?: string;
  content?: string;
  entryId?: string;
  entryLabel?: string;
  entryUrl?: string;
  topics?: Array<{ topicId?: string; topicLabel?: string; topicUrl?: string }>;
}

interface CollinsDidYouMeanResponse {
  dictionaryCode?: string;
  searchTerm?: string;
  suggestions?: string[];
}

interface CollinsPronunciation {
  dictionaryCode?: string;
  entryId?: string;
  lang?: string;
  pronunciationUrl?: string;
  url?: string;
}

const DEFAULT_BASE = '/api/collins';
const DIRECT_BASE = 'https://api.collinsdictionary.com/api/v1';

export class CollinsDictionaryProvider implements DictionaryProvider {
  readonly name = 'collins';
  private readonly baseUrl: string;
  private readonly dictionaryCode: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CollinsProviderConfig = {}) {
    const direct = config.direct === true;
    this.baseUrl = config.baseUrl ?? (direct ? DIRECT_BASE : DEFAULT_BASE);
    this.dictionaryCode = config.dictionaryCode ?? 'british';
    this.timeoutMs = config.timeoutMs ?? 8000;
    this.fetchImpl =
      config.fetchImpl ??
      (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as unknown as typeof fetch));
    if (direct) {
      this.directKey = config.accessKey ?? '';
    }
  }

  private directKey = '';

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.baseUrl === DIRECT_BASE) {
      if (!this.directKey) throw notConfigured();
      headers.accessKey = this.directKey;
    }
    return headers;
  }

  async lookup(word: string): Promise<DictionaryLookupResult> {
    const clean = word.trim();
    if (!clean) {
      return { found: false, error: { kind: 'not-found', message: '空单词', retryable: false } };
    }
    if (this.baseUrl === DEFAULT_BASE && !this.fetchImpl) {
      return { found: false, error: notConfigured().toDto() };
    }

    try {
      const entry = await this.fetchEntry(clean);
      if (!entry) {
        const suggestions = await this.fetchSuggestions(clean).catch(() => []);
        return { found: false, suggestions };
      }
      const dto = await this.toDto(entry, clean);
      return { found: true, entry: dto };
    } catch (err) {
      if (err instanceof DictionaryRequestError) {
        return { found: false, error: err.toDto() };
      }
      return {
        found: false,
        error: { kind: 'bad-response', message: '词典响应解析失败', retryable: false },
      };
    }
  }

  private async fetchEntry(word: string): Promise<CollinsEntryResponse | null> {
    const path = `${this.baseUrl}/dictionaries/${encodeURIComponent(
      this.dictionaryCode,
    )}/search/first?q=${encodeURIComponent(word)}&format=html`;
    const data = await this.request<CollinsEntryResponse>(path);
    if (!data || (!data.entryContent && !data.content)) return null;
    return data;
  }

  private async fetchSuggestions(word: string): Promise<string[]> {
    const path = `${this.baseUrl}/dictionaries/${encodeURIComponent(
      this.dictionaryCode,
    )}/search/didyoumean?q=${encodeURIComponent(word)}&entrynumber=5`;
    const data = await this.request<CollinsDidYouMeanResponse>(path);
    return data?.suggestions ?? [];
  }

  private async fetchPronunciations(entryId: string): Promise<string | undefined> {
    try {
      const path = `${this.baseUrl}/dictionaries/${encodeURIComponent(
        this.dictionaryCode,
      )}/entries/${encodeURIComponent(entryId)}/pronunciations?lang=en`;
      const data = await this.request<CollinsPronunciation[] | { pronunciations?: CollinsPronunciation[] }>(
        path,
      );
      const list = Array.isArray(data) ? data : (data?.pronunciations ?? []);
      return list.find((p) => p.pronunciationUrl || p.url)?.pronunciationUrl ?? list[0]?.url;
    } catch {
      return undefined;
    }
  }

  private async request<T>(path: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(path, { headers: this.headers(), signal: controller.signal });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new DictionaryRequestError(
        aborted ? 'timeout' : 'network',
        aborted ? '词典请求超时' : '无法连接到词典服务',
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new DictionaryRequestError(
        classifyStatus(response.status),
        `词典服务返回 ${response.status}`,
        response.status,
      );
    }

    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new DictionaryRequestError('bad-response', '词典返回了无法解析的内容');
    }
  }

  private async toDto(entry: CollinsEntryResponse, word: string): Promise<DictionaryEntryDto> {
    const html = entry.entryContent ?? entry.content ?? '';
    const extracted = extractCollinsContent(html);
    const entryId = entry.entryId;
    const audioUrl = entryId ? await this.fetchPronunciations(entryId) : undefined;
    const topics: DictionaryTopic[] = (entry.topics ?? []).map((t) => ({
      topicId: t.topicId,
      topicLabel: t.topicLabel ?? '',
      topicUrl: t.topicUrl,
    }));

    return {
      word: entry.entryLabel ?? word,
      partsOfSpeech: [],
      chineseMeanings: [],
      englishDefinition: extracted.englishDefinition,
      examples: extracted.examples,
      source: 'collins',
      provider: 'collins',
      sourceEntryId: entryId,
      sourceUrl: entry.entryUrl,
      audioUrl,
      rawHtml: stripHtml(html),
      fetchedAt: Date.now(),
      licenseNote:
        '内容来自 CollinsDictionary API，受其许可条款约束；未提供中文释义。',
      cacheVersion: 1,
      topics,
    };
  }
}
