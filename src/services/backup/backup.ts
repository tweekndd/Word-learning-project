import { db, DB_VERSION } from '@/db/database';
import { dictionaryEntryRepo, settingsRepo } from '@/db/repositories';
import type { Settings } from '@/types/domain';
import { backupSchema, type BackupFile } from '@/types/schemas';
import { checkBackupSchemaVersion } from '@/db/migrations';
import { META_KEYS } from '@/db/defaults';
import { uuid } from '@/utils/id';

export const BACKUP_APP_VERSION = '0.1.0';

export interface ExportOptions {
  includeDictionaryCache?: boolean;
  now?: number;
}

export async function buildBackup(options: ExportOptions = {}): Promise<BackupFile> {
  const now = options.now ?? Date.now();
  const settings = await settingsRepo.get(now);
  const vocabulary = await db.vocabulary.toArray();
  const learningStates = await db.learningStates.toArray();
  const reviewLogs = await db.reviewLogs.toArray();
  const shortTermTasks = await db.shortTermTasks.toArray();
  const dailySessions = await db.dailySessions.toArray();
  const dictionaryCache = options.includeDictionaryCache
    ? await dictionaryEntryRepo.all()
    : undefined;

  const tags = [...new Set(vocabulary.flatMap((v) => v.tags))].sort();

  const backup: BackupFile = {
    schemaVersion: DB_VERSION,
    appVersion: BACKUP_APP_VERSION,
    exportedAt: now,
    settings,
    vocabulary,
    learningStates,
    reviewLogs,
    shortTermTasks,
    dailySessions,
    tags,
    ...(dictionaryCache ? { dictionaryCache } : {}),
  };
  return backup;
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export interface ParseBackupResult {
  ok: boolean;
  backup?: BackupFile;
  error?: string;
}

export function parseBackup(text: string): ParseBackupResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是有效的 JSON。' };
  }
  const versionCheck = checkBackupSchemaVersion((json as { schemaVersion?: unknown })?.schemaVersion);
  if (!versionCheck.ok) return { ok: false, error: versionCheck.reason };

  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: `备份字段校验失败：${first?.path.join('.') ?? ''} ${first?.message ?? ''}`.trim(),
    };
  }
  return { ok: true, backup: parsed.data as unknown as BackupFile };
}

export interface RestoreOptions {
  mode: 'merge' | 'replace';
  now?: number;
}

export interface RestoreCounts {
  vocabulary: number;
  learningStates: number;
  reviewLogs: number;
  shortTermTasks: number;
  dailySessions: number;
  dictionaryEntries: number;
}

export interface RestoreResult {
  counts: RestoreCounts;
  backupBeforeRestore: BackupFile;
}

/**
 * Restore from a validated backup. Before replacing, a backup of the current
 * data is created so the operation is reversible (taskbook §6.4 step 4). All
 * writes happen in one transaction; failures roll back.
 */
export async function restoreBackup(
  backup: BackupFile,
  options: RestoreOptions,
): Promise<RestoreResult> {
  const now = options.now ?? Date.now();
  const backupBeforeRestore = await buildBackup({ includeDictionaryCache: true, now });

  await db.transaction(
    'rw',
    [
      db.vocabulary,
      db.learningStates,
      db.reviewLogs,
      db.shortTermTasks,
      db.dailySessions,
      db.dictionaryEntries,
      db.settings,
      db.meta,
    ],
    async () => {
      if (options.mode === 'replace') {
        await Promise.all([
          db.vocabulary.clear(),
          db.learningStates.clear(),
          db.reviewLogs.clear(),
          db.shortTermTasks.clear(),
          db.dailySessions.clear(),
          db.dictionaryEntries.clear(),
        ]);
      }

      const vocabulary = dedupeById(backup.vocabulary);
      const existingVocab = new Set((await db.vocabulary.toArray()).map((v) => v.id));
      const toAddVocab = vocabulary.filter((v) => !existingVocab.has(v.id));

      const learningStates = backup.learningStates;
      const reviewLogs = backup.reviewLogs;
      const shortTermTasks = backup.shortTermTasks ?? [];
      const dailySessions = backup.dailySessions;
      const dictionaryCache = backup.dictionaryCache ?? [];

      if (toAddVocab.length > 0) await db.vocabulary.bulkPut(toAddVocab);

      const validVocabIds = new Set((await db.vocabulary.toArray()).map((v) => v.id));
      await db.learningStates.bulkPut(learningStates.filter((s) => validVocabIds.has(s.vocabularyId)));
      await db.reviewLogs.bulkPut(reviewLogs.filter((r) => validVocabIds.has(r.vocabularyId)));
      await db.shortTermTasks.bulkPut(shortTermTasks.filter((t) => validVocabIds.has(t.vocabularyId)));
      await db.dailySessions.bulkPut(dedupeById(dailySessions));
      if (dictionaryCache.length > 0) {
        await db.dictionaryEntries.bulkPut(dictionaryCache.filter((d) => validVocabIds.has(d.vocabularyId)));
      }

      await db.settings.put(sanitizeSettings(backup.settings));
      await db.meta.put({ key: META_KEYS.schemaVersion, value: DB_VERSION });
    },
  );

  return {
    counts: {
      vocabulary: backup.vocabulary.length,
      learningStates: backup.learningStates.length,
      reviewLogs: backup.reviewLogs.length,
      shortTermTasks: backup.shortTermTasks?.length ?? 0,
      dailySessions: backup.dailySessions.length,
      dictionaryEntries: backup.dictionaryCache?.length ?? 0,
    },
    backupBeforeRestore,
  };
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  rows.forEach((row) => map.set(row.id, row));
  return [...map.values()];
}

function sanitizeSettings(settings: Settings): Settings {
  // Guard against malformed intervals from a hand-edited backup.
  const intervals = settings.shortTermIntervals.filter((n) => Number.isFinite(n) && n > 0);
  return {
    ...settings,
    id: 'app',
    shortTermIntervals: intervals.length > 0 ? intervals : [10, 30, 120, 240],
  };
}

/** Persist current data to a downloadable file name. */
export function backupFileName(now = Date.now()): string {
  const d = new Date(now);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `word-pocket-backup-${stamp}.json`;
}

export function newTempId(): string {
  return uuid();
}
