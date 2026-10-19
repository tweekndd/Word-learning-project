/**
 * Normalisation rules for duplicate detection. Documented per taskbook §6.2:
 * - trim surrounding whitespace
 * - Unicode NFKC normalisation
 * - case-insensitive
 * We deliberately do NOT strip internal punctuation or hyphens, to avoid
 * over-merging distinct phrases ("long-term" vs "long term" stay separate).
 */
export function normalizeWord(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** ECDICT-style strip key: alphanumeric only, lowercase (for fuzzy matching). */
export function stripWord(raw: string): string {
  return Array.from(raw)
    .filter((ch) => /[\p{L}\p{N}]/u.test(ch))
    .join('')
    .toLowerCase();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function isProbablyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
