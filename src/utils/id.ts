let counter = 0;

/**
 * RFC4122-ish id without external deps. Uses crypto.randomUUID when available
 * and falls back to a time + counter scheme for jsdom/older environments.
 */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${counter.toString(16)}-${rand}`;
}

/**
 * Deterministic idempotency key. Same inputs always produce the same key so a
 * double click or a retried write collides instead of duplicating a log row.
 */
export function idempotencyKey(...parts: Array<string | number>): string {
  return parts.map((p) => String(p)).join('|');
}
