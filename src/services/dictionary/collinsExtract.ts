import { htmlToText, stripHtml } from '@/utils/sanitize';
import type { DictionaryExample } from '@/types/dictionary';

/**
 * Collins returns entry bodies as HTML strings (verified in
 * `API Developer Documentation 0.4.pdf`). There is no typed meaning object, so
 * we do a conservative best-effort extraction purely for display and for the
 * single-sentence hint. This never fabricates content: it only re-shapes what
 * the API actually returned.
 */

export interface ExtractedCollinsContent {
  englishDefinition?: string;
  examples: DictionaryExample[];
  /** Plain text of the whole entry, sanitised. */
  plainText: string;
}

const EXAMPLE_HINTS = [/example/i, /e\.g\./i, /for example/i, /例句/];

export function extractCollinsContent(html: string | undefined): ExtractedCollinsContent {
  if (!html) return { examples: [], plainText: '' };
  const safe = stripHtml(html);
  const plainText = htmlToText(safe);

  const paragraphs = splitBlocks(safe);
  const definition = paragraphs.find((p) => p.length > 0 && !isExample(p));

  const examples: DictionaryExample[] = [];
  for (const block of paragraphs) {
    if (isExample(block) && block.length > 4) {
      examples.push({ english: block });
    }
  }

  // Fallback: sentences that look like examples because they quote usage.
  if (examples.length === 0) {
    const sentences = plainText.match(/[^.!?]+[.!?]/g) ?? [];
    for (const s of sentences) {
      const trimmed = s.trim();
      if (trimmed.length > 12 && adjustedScore(trimmed) > 0) {
        examples.push({ english: trimmed });
      }
      if (examples.length >= 3) break;
    }
  }

  return { englishDefinition: definition, examples, plainText };
}

function isExample(block: string): boolean {
  return EXAMPLE_HINTS.some((re) => re.test(block));
}

function adjustedScore(sentence: string): number {
  // Prefer longer, sentence-like examples.
  const words = sentence.split(/\s+/).length;
  return words >= 4 ? words : 0;
}

function splitBlocks(html: string): string[] {
  return html
    .split(/<\/(?:p|div|li|h[1-6]|span|br)>|<br\s*\/?>/i)
    .map((chunk) => htmlToText(chunk).replace(/\s+/g, ' ').trim())
    .filter((chunk) => chunk.length > 0);
}
