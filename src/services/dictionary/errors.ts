import type { DictionaryError, DictionaryErrorKind } from '@/types/dictionary';
import { redactSecrets } from '@/utils/sanitize';

export class DictionaryRequestError extends Error {
  readonly kind: DictionaryErrorKind;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(kind: DictionaryErrorKind, message: string, status?: number) {
    super(redactSecrets(message));
    this.name = 'DictionaryRequestError';
    this.kind = kind;
    this.status = status;
    this.retryable = kind === 'rate-limited' || kind === 'server' || kind === 'timeout' || kind === 'network';
  }

  toDto(): DictionaryError {
    return {
      kind: this.kind,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
    };
  }
}

export function classifyStatus(status: number): DictionaryErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server';
  return 'bad-response';
}

export function notConfigured(): DictionaryRequestError {
  return new DictionaryRequestError(
    'not-configured',
    '词典服务未配置（缺少访问密钥或代理）。',
  );
}
