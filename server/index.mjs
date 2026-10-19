#!/usr/bin/env node
/**
 * Development-only Collins Dictionary API proxy.
 *
 * Why: the browser must never hold the access key (taskbook §5.4). This proxy
 * injects the `accessKey` header server-side, pins the upstream host, validates
 * input, caps response size and timeouts, and never logs the key.
 *
 * The Settings page can also set/test the key at runtime via:
 *   GET    /api/collins/health  -> { ok, configured, source }
 *   POST   /api/collins/key     -> { accessKey }   (saved to a gitignored file)
 *   DELETE /api/collins/key     -> clears the runtime key
 *   POST   /api/collins/test    -> { dictionaryCode } performs a real lookup
 *
 * It is NOT production hardened — see docs/DECISIONS.md D-005.
 */
import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = resolve(here, '..', '.collins-key');

function loadEnv() {
  const envPath = resolve(here, '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const HOST = process.env.COLLINS_PROXY_HOST || '127.0.0.1';
const PORT = Number(process.env.COLLINS_PROXY_PORT || 8787);
const UPSTREAM_HOST = 'api.collinsdictionary.com';
const UPSTREAM_PATH = '/api/v1';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 16 * 1024;
const TIMEOUT_MS = 10000;

const ALLOWED_PREFIXES = ['/api/collins/dictionaries'];

function readPersistedKey() {
  try {
    if (!existsSync(KEY_FILE)) return '';
    return readFileSync(KEY_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

const envKey = process.env.COLLINS_API_KEY || '';
const fileKey = envKey ? '' : readPersistedKey();
let activeKey = envKey || fileKey || '';
let keySource = envKey ? 'env' : fileKey ? 'file' : 'none';

function persistKey(value) {
  if (value) writeFileSync(KEY_FILE, `${value}\n`, { mode: 0o600 });
  else if (existsSync(KEY_FILE)) unlinkSync(KEY_FILE);
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

function isValidKey(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200 && !/[\s\r\n]/.test(value);
}

function isValidDictionaryCode(code) {
  return typeof code === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(code);
}

function readBody(req, callback) {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      req.destroy();
      callback(null, 'too_large');
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => callback(Buffer.concat(chunks).toString('utf8')));
  req.on('error', () => callback(null, 'error'));
}

/** Issue an upstream GET with the given key. `finish` is called exactly once. */
function upstreamGet(target, key, finish) {
  let settled = false;
  const once = (status, text, errorCode) => {
    if (settled) return;
    settled = true;
    finish(status, text, errorCode);
  };

  const upstream = httpsRequest(
    {
      host: UPSTREAM_HOST,
      path: target,
      method: 'GET',
      timeout: TIMEOUT_MS,
      headers: {
        Accept: 'application/json',
        accessKey: key,
        'User-Agent': 'word-pocket-dev-proxy',
      },
    },
    (upstreamRes) => {
      let size = 0;
      const chunks = [];
      upstreamRes.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          upstreamRes.destroy();
          once(502, '', 'too_large');
          return;
        }
        chunks.push(chunk);
      });
      upstreamRes.on('end', () => once(upstreamRes.statusCode ?? 502, Buffer.concat(chunks).toString('utf8')));
    },
  );

  upstream.on('timeout', () => {
    upstream.destroy();
    once(504, '', 'timeout');
  });
  upstream.on('error', (err) => once(502, '', `upstream_error:${err.code ?? 'error'}`));
  upstream.end();
}

function handleSetKey(req, res) {
  readBody(req, (text, err) => {
    if (err) {
      send(res, 400, { errorCode: err, errorMessage: '请求体无效' });
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(text || '{}');
    } catch {
      send(res, 400, { errorCode: 'bad_json', errorMessage: '无法解析请求体' });
      return;
    }
    const accessKey = typeof parsed.accessKey === 'string' ? parsed.accessKey.trim() : '';
    if (!isValidKey(accessKey)) {
      send(res, 400, { errorCode: 'invalid_key', errorMessage: 'API Key 无效（长度 8-200，且不含空白）' });
      return;
    }
    activeKey = accessKey;
    keySource = 'file';
    try {
      persistKey(accessKey);
    } catch {
      // Still usable for this process even if the write fails.
    }
    send(res, 200, { ok: true, configured: true, source: keySource });
  });
}

function handleClearKey(req, res) {
  activeKey = '';
  keySource = 'none';
  try {
    persistKey('');
  } catch {
    /* ignore */
  }
  send(res, 200, { ok: true, configured: false, source: 'none' });
}

function handleTestKey(req, res) {
  readBody(req, (text) => {
    let code = 'british';
    try {
      const parsed = JSON.parse(text || '{}');
      if (isValidDictionaryCode(parsed.dictionaryCode)) code = parsed.dictionaryCode;
    } catch {
      /* use default */
    }
    if (!activeKey) {
      send(res, 200, { ok: false, errorCode: 'not_configured', message: '尚未保存 API Key' });
      return;
    }
    const target = `${UPSTREAM_PATH}/dictionaries/${encodeURIComponent(code)}/search/first?q=hello&format=html`;
    upstreamGet(target, activeKey, (status, _text, errorCode) => {
      if (status >= 200 && status < 400) {
        send(res, 200, { ok: true, status });
      } else {
        const message =
          status === 401 || status === 403
            ? 'API Key 无效或未获授权'
            : status === 429
              ? '请求过于频繁（429）'
              : errorCode === 'timeout'
                ? '上游请求超时'
                : `上游返回 ${status}`;
        send(res, 200, { ok: false, status, errorCode: errorCode ?? 'upstream', message });
      }
    });
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === '/api/collins/health') {
    if (req.method !== 'GET') {
      send(res, 405, { errorCode: 'method_not_allowed', errorMessage: '仅支持 GET' });
      return;
    }
    send(res, 200, { ok: true, configured: activeKey.length > 0, source: keySource });
    return;
  }

  if (path === '/api/collins/key') {
    if (req.method === 'POST') return handleSetKey(req, res);
    if (req.method === 'DELETE') return handleClearKey(req, res);
    send(res, 405, { errorCode: 'method_not_allowed', errorMessage: '仅支持 POST/DELETE' });
    return;
  }

  if (path === '/api/collins/test') {
    if (req.method !== 'POST') {
      send(res, 405, { errorCode: 'method_not_allowed', errorMessage: '仅支持 POST' });
      return;
    }
    return handleTestKey(req, res);
  }

  if (req.method !== 'GET') {
    send(res, 405, { errorCode: 'method_not_allowed', errorMessage: '仅支持 GET' });
    return;
  }

  if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
    send(res, 400, { errorCode: 'bad_request', errorMessage: '不支持的路径' });
    return;
  }

  if (!activeKey) {
    send(res, 503, {
      errorCode: 'not_configured',
      errorMessage: '服务端未配置 COLLINS_API_KEY',
    });
    return;
  }

  // Validate the dictionary code and any q/entryId values to avoid proxying
  // arbitrary content (SSRF guard).
  const relative = path.replace(/^\/api\/collins/, '');
  if (!/^\/dictionaries\/[a-zA-Z][a-zA-Z0-9_-]{0,31}\//.test(relative)) {
    send(res, 400, { errorCode: 'bad_request', errorMessage: '无效的词典路径' });
    return;
  }
  const q = url.searchParams.get('q');
  if (q && (q.length > 100 || /[\r\n]/.test(q))) {
    send(res, 400, { errorCode: 'bad_request', errorMessage: '无效的查询词' });
    return;
  }

  const target = `${UPSTREAM_PATH}${relative}${url.search}`;
  upstreamGet(target, activeKey, (status, text, errorCode) => {
    if (errorCode && !text) {
      send(res, status, { errorCode, errorMessage: `上游请求失败: ${errorCode}` });
      return;
    }
    // Pass through JSON; never log the key or full headers.
    console.log(`[collins-proxy] ${status} /api/collins${relative.split('?')[0]}`);
    send(res, status, text || '{}');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[collins-proxy] listening on http://${HOST}:${PORT} (key ${activeKey ? `已配置:${keySource}` : '未配置'})`);
});
