import { db } from '@/db/database';
import { learningStateRepo, vocabularyRepo } from '@/db/repositories';
import type { Vocabulary } from '@/types/domain';
import { normalizeWord } from '@/utils/text';
import { uuid } from '@/utils/id';
import type { ParsedCsv } from './csv';
import { readField, splitTags, type FieldMapping } from './mapping';

export const MAX_WORD_LENGTH = 200;

export type DedupPolicy = 'skip' | 'update-user-fields' | 'import-as-new';

export interface ImportItem {
  rowNumber: number;
  word: string;
  normalizedWord: string;
  phonetic?: string;
  meanings?: string;
  tags: string[];
  notes?: string;
  source?: string;
}

export interface ImportRowIssue {
  rowNumber: number;
  field: string;
  reason: string;
  value?: string;
}

export interface ImportPreview {
  totalRows: number;
  validCount: number;
  duplicateInFileCount: number;
  errorCount: number;
  items: ImportItem[];
  duplicates: ImportItem[];
  errors: ImportRowIssue[];
}

// eslint-disable-next-line no-control-regex -- intentionally reject control chars in imported words
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export function buildImportPreview(parsed: ParsedCsv, mapping: FieldMapping): ImportPreview {
  const items: ImportItem[] = [];
  const errors: ImportRowIssue[] = [];
  const duplicates: ImportItem[] = [];
  const seen = new Map<string, number>();

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2; // +1 header, +1 to be 1-based
    const rawWord = readField(row, mapping, 'word');
    if (!rawWord) {
      errors.push({ rowNumber, field: 'word', reason: '缺少单词' });
      return;
    }
    if (rawWord.length > MAX_WORD_LENGTH) {
      errors.push({
        rowNumber,
        field: 'word',
        reason: `单词长度超过 ${MAX_WORD_LENGTH}`,
        value: rawWord.slice(0, 40) + '…',
      });
      return;
    }
    if (CONTROL_CHARS.test(rawWord)) {
      errors.push({ rowNumber, field: 'word', reason: '包含非法控制字符', value: rawWord.slice(0, 40) });
      return;
    }

    const normalized = normalizeWord(rawWord);
    const item: ImportItem = {
      rowNumber,
      word: rawWord,
      normalizedWord: normalized,
      phonetic: readField(row, mapping, 'phonetic'),
      meanings: readField(row, mapping, 'meanings'),
      tags: splitTags(readField(row, mapping, 'tags')),
      notes: readField(row, mapping, 'notes'),
      source: readField(row, mapping, 'source'),
    };

    if (seen.has(normalized)) {
      duplicates.push(item);
      return;
    }
    seen.set(normalized, rowNumber);
    items.push(item);
  });

  for (const err of parsed.errors) {
    errors.push({ rowNumber: err.row, field: 'csv', reason: err.message });
  }

  return {
    totalRows: parsed.rows.length,
    validCount: items.length,
    duplicateInFileCount: duplicates.length,
    errorCount: errors.length,
    items,
    duplicates,
    errors,
  };
}

export interface ApplyImportResult {
  created: number;
  updated: number;
  skipped: number;
  learningStatesCreated: number;
}

export interface ApplyImportOptions {
  policy: DedupPolicy;
  now?: number;
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Apply a previewed import inside one transaction. Any failure aborts the
 * whole import so no half-written batch is left behind (taskbook §6.1).
 * Existing dictionary cache and learning state are never touched by a plain
 * vocabulary overwrite (taskbook §6.2).
 */
export async function applyImport(
  preview: ImportPreview,
  options: ApplyImportOptions,
): Promise<ApplyImportResult> {
  const now = options.now ?? Date.now();
  const { policy } = options;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let learningStatesCreated = 0;

  await db.transaction('rw', [db.vocabulary, db.learningStates], async () => {
    const chunkSize = 200;
    for (let i = 0; i < preview.items.length; i += chunkSize) {
      const chunk = preview.items.slice(i, i + chunkSize);
      for (const item of chunk) {
        const existing = await vocabularyRepo.getByNormalizedWord(item.normalizedWord);
        if (existing && existing.deletedAt === undefined) {
          if (policy === 'skip') {
            skipped += 1;
            continue;
          }
          if (policy === 'update-user-fields') {
            await vocabularyRepo.update(
              existing.id,
              {
                ...(item.phonetic ? { phonetic: item.phonetic } : {}),
                ...(item.meanings ? { userMeanings: item.meanings } : {}),
                ...(item.notes ? { notes: item.notes } : {}),
                ...(item.tags.length > 0 ? { tags: item.tags } : {}),
              },
              now,
            );
            updated += 1;
            continue;
          }
          // import-as-new falls through to creation.
        }

        const row: Vocabulary = {
          id: uuid(),
          word: item.word,
          normalizedWord: item.normalizedWord,
          phonetic: item.phonetic,
          userMeanings: item.meanings,
          tags: item.tags,
          notes: item.notes,
          source: item.source,
          createdAt: now,
          updatedAt: now,
        };
        await db.vocabulary.add(row);
        await learningStateRepo.ensure(row.id, now);
        created += 1;
        learningStatesCreated += 1;
      }
      options.onProgress?.(Math.min(i + chunkSize, preview.items.length), preview.items.length);
    }
  });

  return { created, updated, skipped, learningStatesCreated };
}

/** Build a downloadable error report CSV body. */
export function buildErrorReport(preview: ImportPreview): string {
  const lines = ['row,field,reason,value'];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  for (const err of preview.errors) {
    lines.push([String(err.rowNumber), escape(err.field), escape(err.reason), escape(err.value ?? '')].join(','));
  }
  for (const dup of preview.duplicates) {
    lines.push(
      [String(dup.rowNumber), 'word', escape('文件内重复，已跳过'), escape(dup.word)].join(','),
    );
  }
  return lines.join('\n');
}
