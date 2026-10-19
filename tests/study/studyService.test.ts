import { describe, it, expect, beforeEach } from 'vitest';
import { createDefaultSettings } from '@/db/defaults';
import { db } from '@/db/database';
import { learningStateRepo, shortTermTaskRepo, vocabularyRepo } from '@/db/repositories';
import { commitStudyResult } from '@/features/study/studyService';
import { createInitialContext, type StudyResult } from '@/features/study/machine';
import { resetDb } from '../helpers/db';

const NOW = new Date('2026-04-01T10:00:00').getTime();

function makeResult(overrides: Partial<StudyResult>): StudyResult {
  return {
    kind: 'new',
    vocabularyId: overrides.vocabularyId ?? 'v1',
    stepIndex: 0,
    initialRecall: 'remember',
    hintShown: false,
    finalRecall: 'remember',
    rating: 'good',
    queueShortTerm: false,
    clearShortTerm: false,
    attempt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetDb();
});

describe('commitStudyResult (§12.3)', () => {
  it('writes one log and schedules FSRS for a new word', async () => {
    const vocab = await vocabularyRepo.create({ word: 'strategy' });
    const settings = createDefaultSettings(NOW);
    const context = createInitialContext({
      kind: 'new',
      vocabularyId: vocab.id,
      word: vocab.word,
      hasHint: true,
      now: NOW,
    });
    const outcome = await commitStudyResult(
      makeResult({ vocabularyId: vocab.id }),
      context,
      { now: NOW, settings },
    );
    expect(outcome.duplicate).toBe(false);

    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.reviewType).toBe('new');
    expect(logs[0]?.schedulerType).toBe('long-term');
    expect(logs[0]?.fsrsRating).toBe('good');

    const state = await learningStateRepo.get(vocab.id);
    expect(state?.fsrsState).toBeDefined();
    expect(state?.reps).toBe(1);
    expect(state?.dueAt).toBeGreaterThan(NOW);
    expect(await shortTermTaskRepo.pendingCount()).toBe(0);
  });

  it('enqueues a reinforcement task on a failed new word (Again)', async () => {
    const vocab = await vocabularyRepo.create({ word: 'revenue' });
    const settings = createDefaultSettings(NOW);
    const context = createInitialContext({
      kind: 'new',
      vocabularyId: vocab.id,
      word: vocab.word,
      hasHint: false,
      now: NOW,
    });
    await commitStudyResult(
      makeResult({
        vocabularyId: vocab.id,
        initialRecall: 'forget',
        hintShown: true,
        finalRecall: 'forget',
        rating: 'again',
        queueShortTerm: true,
      }),
      context,
      { now: NOW, settings },
    );
    const tasks = await shortTermTaskRepo.pendingForVocabulary(vocab.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.stepIndex).toBe(0);
    expect((await learningStateRepo.get(vocab.id))?.lapses).toBe(1);
  });

  it('is idempotent for a duplicate confirmation (§12.1.6)', async () => {
    const vocab = await vocabularyRepo.create({ word: 'budget' });
    const settings = createDefaultSettings(NOW);
    const context = createInitialContext({
      kind: 'new',
      vocabularyId: vocab.id,
      word: vocab.word,
      hasHint: true,
      now: NOW,
    });
    const result = makeResult({ vocabularyId: vocab.id });
    await commitStudyResult(result, context, { now: NOW, settings });
    const second = await commitStudyResult(result, context, { now: NOW, settings });
    expect(second.duplicate).toBe(true);
    expect(await db.reviewLogs.count()).toBe(1);
  });

  it('short-term reinforcement never touches FSRS state (§12.3.2, §12.3.4)', async () => {
    const vocab = await vocabularyRepo.create({ word: 'consignment' });
    const settings = createDefaultSettings(NOW);
    // First: a new-word failure to create the FSRS card + task.
    const newCtx = createInitialContext({
      kind: 'new',
      vocabularyId: vocab.id,
      word: vocab.word,
      hasHint: true,
      now: NOW,
    });
    await commitStudyResult(
      makeResult({
        vocabularyId: vocab.id,
        finalRecall: 'forget',
        rating: 'again',
        queueShortTerm: true,
      }),
      newCtx,
      { now: NOW, settings },
    );
    const before = await learningStateRepo.get(vocab.id);
    const task = (await shortTermTaskRepo.pendingForVocabulary(vocab.id))[0]!;

    const stCtx = createInitialContext({
      kind: 'short-term',
      vocabularyId: vocab.id,
      word: vocab.word,
      hasHint: true,
      stepIndex: task.stepIndex,
      taskId: task.id,
      now: NOW + 1000,
    });
    await commitStudyResult(
      makeResult({
        vocabularyId: vocab.id,
        kind: 'short-term',
        rating: null,
        finalRecall: 'remember',
        shortTermOutcome: 'success',
        clearShortTerm: true,
        attempt: 1,
      }),
      stCtx,
      { now: NOW + 1000, settings },
    );

    const after = await learningStateRepo.get(vocab.id);
    expect(after?.fsrsState).toEqual(before?.fsrsState);
    expect(after?.reps).toBe(before?.reps);
    expect(await shortTermTaskRepo.pendingCount()).toBe(0);

    const logs = await db.reviewLogs.toArray();
    expect(logs.some((l) => l.reviewType === 'short-term' && l.schedulerType === 'short-term')).toBe(true);
  });

  it('advances the reinforcement step on failure and enforces the cap', async () => {
    const vocab = await vocabularyRepo.create({ word: 'warehouse' });
    const settings = { ...createDefaultSettings(NOW), shortTermIntervals: [10, 20], maxExtraReviewsPerWord: 2 };
    // new failure → step 0
    const newCtx = createInitialContext({ kind: 'new', vocabularyId: vocab.id, word: vocab.word, hasHint: true, now: NOW });
    await commitStudyResult(
      makeResult({ vocabularyId: vocab.id, finalRecall: 'forget', rating: 'again', queueShortTerm: true }),
      newCtx,
      { now: NOW, settings },
    );
    let tasks = await shortTermTaskRepo.pendingForVocabulary(vocab.id);
    expect(tasks[0]?.stepIndex).toBe(0);

    // fail step 0 → step 1
    const step0 = tasks[0]!;
    await commitStudyResult(
      makeResult({
        vocabularyId: vocab.id,
        kind: 'short-term',
        rating: null,
        stepIndex: 0,
        taskId: step0.id,
        finalRecall: 'forget',
        shortTermOutcome: 'failure',
        queueShortTerm: true,
        attempt: 1,
      }),
      createInitialContext({ kind: 'short-term', vocabularyId: vocab.id, word: vocab.word, hasHint: true, stepIndex: 0, taskId: step0.id, now: NOW }),
      { now: NOW + 1, settings },
    );
    tasks = await shortTermTaskRepo.pendingForVocabulary(vocab.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.stepIndex).toBe(1);

    // fail step 1 → cap reached, no more tasks
    const step1 = tasks[0]!;
    await commitStudyResult(
      makeResult({
        vocabularyId: vocab.id,
        kind: 'short-term',
        rating: null,
        stepIndex: 1,
        taskId: step1.id,
        finalRecall: 'forget',
        shortTermOutcome: 'failure',
        queueShortTerm: true,
        attempt: 1,
      }),
      createInitialContext({ kind: 'short-term', vocabularyId: vocab.id, word: vocab.word, hasHint: true, stepIndex: 1, taskId: step1.id, now: NOW }),
      { now: NOW + 2, settings },
    );
    expect(await shortTermTaskRepo.pendingCount()).toBe(0);
    const state = await learningStateRepo.get(vocab.id);
    expect(state?.todayExtraReviewCount).toBeLessThanOrEqual(2);
  });
});
