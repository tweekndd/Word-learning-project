import { describe, it, expect, vi } from 'vitest';
import { CollinsKeyService, validateAccessKey } from '@/services/dictionary/keys';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const KEY = 'a'.repeat(64);

describe('Collins key management (§5.4)', () => {
  it('validates key format locally before any request', () => {
    expect(validateAccessKey('').ok).toBe(false);
    expect(validateAccessKey('short').ok).toBe(false);
    expect(validateAccessKey('has space in it here').ok).toBe(false);
    const good = validateAccessKey(`  ${KEY}  `);
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value).toBe(KEY);
  });

  it('reads the proxy status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, configured: true, source: 'file' }));
    const service = new CollinsKeyService({ baseUrl: '/api/collins', fetchImpl });
    const status = await service.status();
    expect(status).toEqual({ reachable: true, configured: true, source: 'file' });
  });

  it('reports the proxy as unreachable when the request fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });
    const service = new CollinsKeyService({ baseUrl: '/api/collins', fetchImpl });
    const status = await service.status();
    expect(status.reachable).toBe(false);
    expect(status.configured).toBe(false);
  });

  it('saves the key without exposing it anywhere else', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { accessKey: string };
      expect(body.accessKey).toBe(KEY);
      return jsonResponse({ ok: true, configured: true, source: 'file' });
    });
    const service = new CollinsKeyService({ baseUrl: '/api/collins', fetchImpl });
    await service.save(` ${KEY} `);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid key without calling the network', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const service = new CollinsKeyService({ baseUrl: '/api/collins', fetchImpl });
    await expect(service.save('bad key')).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a successful connection test', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true, status: 200 }));
    const service = new CollinsKeyService({ baseUrl: '/api/collins', fetchImpl });
    const result = await service.test('british');
    expect(result.ok).toBe(true);
  });

  it('surfaces an unsuccessful connection test with a message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: false, status: 401, errorCode: 'unauthorized', message: 'API Key 无效或未获授权' }),
    );
    const service = new CollinsKeyService({ baseUrl: '/api/collins', fetchImpl });
    const result = await service.test('british');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('无效');
  });

  it('reports a network failure when the proxy is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('down');
    });
    const service = new CollinsKeyService({ baseUrl: '/api/collins', fetchImpl });
    const result = await service.test('british');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('本地代理');
  });
});
