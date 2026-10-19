import Dexie, { type Table } from 'dexie';
import type {
  DailySession,
  DictionaryEntry,
  LearningState,
  MetaRecord,
  ReviewLog,
  Settings,
  ShortTermTask,
  Vocabulary,
} from '@/types/domain';

export const DB_NAME = 'word-pocket';
export const DB_VERSION = 1;

export class WordPocketDb extends Dexie {
  vocabulary!: Table<Vocabulary, string>;
  dictionaryEntries!: Table<DictionaryEntry, string>;
  learningStates!: Table<LearningState, string>;
  reviewLogs!: Table<ReviewLog, string>;
  shortTermTasks!: Table<ShortTermTask, string>;
  dailySessions!: Table<DailySession, string>;
  settings!: Table<Settings, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(DB_VERSION).stores({
      vocabulary: 'id, normalizedWord, updatedAt, deletedAt, suspendedAt, *tags',
      dictionaryEntries: 'id, vocabularyId, provider, [vocabularyId+provider], fetchedAt',
      learningStates: 'vocabularyId, status, dueAt, localDayKey, updatedAt',
      reviewLogs:
        'id, vocabularyId, timestamp, localDayKey, reviewType, idempotencyKey, [vocabularyId+timestamp]',
      shortTermTasks:
        'id, vocabularyId, dueAt, status, localDayKey, idempotencyKey, [vocabularyId+status]',
      dailySessions: 'id, &localDayKey, startedAt',
      settings: 'id',
      meta: 'key',
    });
  }
}

export const db = new WordPocketDb();

/**
 * Runs a Dexie transaction across the given tables. Any thrown error aborts
 * the whole transaction so a half-written import/restore cannot persist
 * (taskbook §6.1, §6.4).
 */
export function runTransaction<T>(
  tables: Table<unknown, unknown>[],
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction('rw', tables, fn);
}
