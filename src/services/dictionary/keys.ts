/**
 * Client wrapper around the dev proxy's runtime key-management endpoints.
 *
 * The access key NEVER lives in the browser: the Settings page sends it to the
 * local proxy, which stores it server-side and injects it into Collins requests
 * (see server/index.mjs and docs/DECISIONS.md D-004/D-005).
 */

export interface CollinsKeyStatus {
  /** Whether the local proxy responded at all. */
  reachable: boolean;
  /** Whether the proxy currently has a key it can use. */
  configured: boolean;
  source: 'env' | 'file' | 'none' | 'unknown';
}

export interface CollinsKeyTestResult {
  ok: boolean;
  status?: number;
  errorCode?: string;
  message: string;
}

export interface CollinsKeyServiceOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = '/api/collins';

export function validateAccessKey(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const value = raw.trim();
  if (!value) return { ok: false, reason: '请输入 API Key' };
  if (value.length < 8) return { ok: false, reason: 'API Key 过短' };
  if (value.length > 200) return { ok: false, reason: 'API Key 过长' };
  if (/[\s\r\n]/.test(value)) return { ok: false, reason: 'API Key 不能包含空白字符' };
  return { ok: true, value };
}

async function messageFromResponse(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { errorMessage?: string };
    return body?.errorMessage || fallback;
  } catch {
    return fallback;
  }
}

export class CollinsKeyService {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CollinsKeyServiceOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl =
      options.fetchImpl ??
      (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : (undefined as unknown as typeof fetch));
  }

  async status(): Promise<CollinsKeyStatus> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/health`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return { reachable: false, configured: false, source: 'unknown' };
      const body = (await res.json()) as { configured?: boolean; source?: CollinsKeyStatus['source'] };
      return {
        reachable: true,
        configured: body.configured === true,
        source: body.source ?? (body.configured ? 'env' : 'none'),
      };
    } catch {
      return { reachable: false, configured: false, source: 'unknown' };
    }
  }

  async save(accessKey: string): Promise<void> {
    const check = validateAccessKey(accessKey);
    if (!check.ok) throw new Error(check.reason);
    const res = await this.fetchImpl(`${this.baseUrl}/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ accessKey: check.value }),
    });
    if (!res.ok) {
      throw new Error(await messageFromResponse(res, `保存失败（HTTP ${res.status}）`));
    }
  }

  async clear(): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/key`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(await messageFromResponse(res, `清除失败（HTTP ${res.status}）`));
    }
  }

  async test(dictionaryCode = 'british'): Promise<CollinsKeyTestResult> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ dictionaryCode }),
      });
      const body = (await res.json()) as { ok?: boolean; status?: number; errorCode?: string; message?: string };
      if (body?.ok) {
        return { ok: true, status: body.status, message: '连接成功，API Key 可用' };
      }
      return {
        ok: false,
        status: body?.status,
        errorCode: body?.errorCode,
        message: body?.message || `测试失败（HTTP ${res.status}）`,
      };
    } catch {
      return { ok: false, message: '无法连接到本地代理，请使用 npm run dev:all 启动' };
    }
  }
}

export function createCollinsKeyService(options?: CollinsKeyServiceOptions): CollinsKeyService {
  return new CollinsKeyService(options);
}
