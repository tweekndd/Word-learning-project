import { db } from '@/db/database';
import { learningStateRepo, vocabularyRepo } from '@/db/repositories';
import type { Settings, Vocabulary } from '@/types/domain';
import { toLocalDayKey } from '@/utils/date';
import type { QueueItemRef } from '../study/sessionStorage';
import { shortTermTaskRepo } from '@/db/repositories';

export interface BuildQueueOptions {
  now: number;
  settings: Settings;
  includeDifficult?: boolean;
  /** Cap the total queue length (UI paging). */
  maxItems?: number;
  /** Injectable randomness for tests; defaults to Math.random. */
  rng?: () => number;
}

export interface DailyQueue {
  shortTerm: QueueItemRef[];
  longTerm: QueueItemRef[];
  newWords: QueueItemRef[];
  difficult: QueueItemRef[];
  all: QueueItemRef[];
}

function isActive(vocab: Vocabulary | undefined): vocab is Vocabulary {
  return !!vocab && vocab.deletedAt === undefined && vocab.suspendedAt === undefined;
}

async function activeVocabularyMap(ids: string[]): Promise<Map<string, Vocabulary>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.vocabulary.bulkGet(unique);
  const map = new Map<string, Vocabulary>();
  rows.forEach((row) => {
    if (isActive(row)) map.set(row.id, row);
  });
  return map;
}

/**
 * Build today's queue following the priority order in taskbook §4.4:
 *   1. due short-term reinforcement
 *   2. due long-term reviews
 *   3. new words (respecting the daily limit)
 *   4. optional difficult-word practice
 * Suspended/deleted words are excluded everywhere.
 */
export async function buildDailyQueue(options: BuildQueueOptions): Promise<DailyQueue> {
  const { now, settings } = options;
  const today = toLocalDayKey(now);
  const order = (items: QueueItemRef[]): QueueItemRef[] =>
    settings.wordOrder === 'shuffle' ? shuffle(items, options.rng ?? Math.random) : items;

  const dueShortTerm = (await shortTermTaskRepo.pendingDue(now)).sort((a, b) => a.dueAt - b.dueAt);

  const states = await learningStateRepo.list();
  const dueLongTerm = states
    .filter(
      (s) =>
        s.status !== 'suspended' &&
        s.status !== 'new' &&
        s.dueAt !== undefined &&
        s.dueAt !== null &&
        s.dueAt <= now,
    )
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));

  const newStates = states.filter((s) => s.status === 'new');
  const statedIds = new Set(states.map((s) => s.vocabularyId));

  // Vocabulary rows without a LearningState are treated as new words so that a
  // word can never become invisible to the scheduler.
  const stateless = (await db.vocabulary.toArray()).filter(
    (v) => isActive(v) && !statedIds.has(v.id),
  );
  for (const v of stateless) {
    newStates.push({
      vocabularyId: v.id,
      status: 'new',
      reps: 0,
      lapses: 0,
      currentLearningStep: 0,
      todayExtraReviewCount: 0,
      localDayKey: today,
      schedulerVersion: '',
      updatedAt: v.updatedAt,
    });
  }

  const vocabMap = await activeVocabularyMap([
    ...dueShortTerm.map((t) => t.vocabularyId),
    ...dueLongTerm.map((s) => s.vocabularyId),
    ...newStates.map((s) => s.vocabularyId),
  ]);

  const shortTerm: QueueItemRef[] = order(
    dueShortTerm
      .filter((t) => vocabMap.has(t.vocabularyId))
      .map((t) => ({
        vocabularyId: t.vocabularyId,
        kind: 'short-term',
        stepIndex: t.stepIndex,
        taskId: t.id,
      })),
  );

  const longTermLimit = settings.dailyReviewLimit ?? Number.POSITIVE_INFINITY;
  const longTerm: QueueItemRef[] = order(
    dueLongTerm
      .filter((s) => vocabMap.has(s.vocabularyId))
      .slice(0, longTermLimit)
      .map((s) => ({ vocabularyId: s.vocabularyId, kind: 'long-term', stepIndex: 0 })),
  );

  const newSeenToday = states.filter(
    (s) => s.firstSeenAt !== undefined && toLocalDayKey(s.firstSeenAt) === today,
  ).length;
  const remainingNew = Math.max(0, settings.dailyNewWordLimit - newSeenToday);

  const newWords: QueueItemRef[] = order(
    newStates
      .filter((s) => vocabMap.has(s.vocabularyId))
      .sort((a, b) => {
        const va = vocabMap.get(a.vocabularyId);
        const vb = vocabMap.get(b.vocabularyId);
        return (va?.createdAt ?? 0) - (vb?.createdAt ?? 0);
      })
      .slice(0, remainingNew)
      .map((s) => ({ vocabularyId: s.vocabularyId, kind: 'new', stepIndex: 0 })),
  );

  let difficult: QueueItemRef[] = [];
  if (options.includeDifficult) {
    difficult = order(await buildDifficultRefs(vocabMap, states));
  }

  const all = dedupeRefs([...shortTerm, ...longTerm, ...newWords, ...difficult]);
  const capped = options.maxItems ? all.slice(0, options.maxItems) : all;

  return {
    shortTerm,
    longTerm,
    newWords,
    difficult,
    all: capped,
  };
}

/** Fisher–Yates shuffle on a copy; leaves the input untouched. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function dedupeRefs(refs: QueueItemRef[]): QueueItemRef[] {
  const seen = new Set<string>();
  const result: QueueItemRef[] = [];
  for (const ref of refs) {
    // A word may legitimately appear once as short-term and once as long-term
    // in different sessions, but within one queue we keep the highest priority.
    const key = ref.vocabularyId;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

async function buildDifficultRefs(
  vocabMap: Map<string, Vocabulary>,
  states: Awaited<ReturnType<typeof learningStateRepo.list>>,
): Promise<QueueItemRef[]> {
  return states
    .filter((s) => s.lapses > 0 && vocabMap.has(s.vocabularyId))
    .sort((a, b) => b.lapses - a.lapses)
    .map((s) => ({ vocabularyId: s.vocabularyId, kind: 'long-term', stepIndex: 0 }));
}

/** Ensure a new word gets a LearningState row. */
export async function ensureLearningState(vocabularyId: string, now: number): Promise<void> {
  const vocab = await vocabularyRepo.getById(vocabularyId);
  if (!vocab) throw new Error(`词条不存在: ${vocabularyId}`);
  await learningStateRepo.ensure(vocabularyId, now);
}
