import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  learningStateRepo,
  reviewLogRepo,
  shortTermTaskRepo,
  vocabularyRepo,
} from '@/db/repositories';
import { resetDb } from '../helpers/db';

beforeEach(async () => {
  await resetDb();
});

describe('vocabulary repository (§12.4.1)', () => {
  it('creates, reads, updates and soft-deletes', async () => {
    const created = await vocabularyRepo.create({ word: 'Negotiate', tags: ['business'] });
    expect(created.normalizedWord).toBe('negotiate');

    const found = await vocabularyRepo.findByWord('negotiate');
    expect(found?.id).toBe(created.id);

    await vocabularyRepo.update(created.id, { userMeanings: '谈判' });
    expect((await vocabularyRepo.getById(created.id))?.userMeanings).toBe('谈判');

    await vocabularyRepo.softDelete(created.id);
    expect(await vocabularyRepo.count()).toBe(0);
    expect(await vocabularyRepo.count(true)).toBe(1);
  });

  it('normalises duplicate detection (case-insensitive, NFKC)', async () => {
    await vocabularyRepo.create({ word: 'Ｃar' });
    const found = await vocabularyRepo.findByWord('car');
    expect(found).not.toBeUndefined();
  });
});

describe('review log idempotency (§12.1.6, §12.4.3)', () => {
  it('ignores a duplicate idempotency key', async () => {
    const vocab = await vocabularyRepo.create({ word: 'invoice' });
    const base = {
      vocabularyId: vocab.id,
      timestamp: 1000,
      localDayKey: '2026-01-01',
      reviewType: 'new' as const,
      schedulerType: 'long-term' as const,
      stage: 'initial',
      initialRecall: 'remember' as const,
      hintShown: false,
      finalRecall: 'remember' as const,
      answerRevealed: true,
      idempotencyKey: 'fixed-key',
    };
    const a = await reviewLogRepo.append({ ...base, id: 'a' });
    const b = await reviewLogRepo.append({ ...base, id: 'b' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(await reviewLogRepo.count()).toBe(1);
  });
});

describe('short-term task dedupe (§12.2.2)', () => {
  it('does not create the same step twice', async () => {
    const vocab = await vocabularyRepo.create({ word: 'deadline' });
    const input = {
      vocabularyId: vocab.id,
      stepIndex: 0,
      dueAt: 5000,
      localDayKey: '2026-01-01',
      idempotencyKey: 'st|d|0|2026-01-01',
    };
    const first = await shortTermTaskRepo.create(input);
    const second = await shortTermTaskRepo.create(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(await shortTermTaskRepo.pendingCount()).toBe(1);
  });
});

describe('extra review cap (§12.2.3, §12.4.10)', () => {
  it('never exceeds the configured maximum', async () => {
    const vocab = await vocabularyRepo.create({ word: 'budget' });
    for (let i = 0; i < 5; i += 1) {
      const r = await learningStateRepo.tryIncrementExtraCount(vocab.id, 5, 1000);
      expect(r.allowed).toBe(true);
    }
    const sixth = await learningStateRepo.tryIncrementExtraCount(vocab.id, 5, 1000);
    expect(sixth.allowed).toBe(false);
    expect(sixth.state.todayExtraReviewCount).toBe(5);
  });

  it('resets the counter on a new local day', async () => {
    const vocab = await vocabularyRepo.create({ word: 'revenue' });
    await learningStateRepo.tryIncrementExtraCount(vocab.id, 5, new Date('2026-01-01T10:00').getTime());
    const next = await learningStateRepo.rollDayIfNeeded(vocab.id, new Date('2026-01-02T10:00').getTime());
    expect(next.todayExtraReviewCount).toBe(0);
    expect(next.localDayKey).toBe('2026-01-02');
  });
});

describe('transaction rollback (§12.4.2)', () => {
  it('rolls back all writes when a transaction throws', async () => {
    await expect(
      db.transaction('rw', [db.vocabulary, db.learningStates], async () => {
        await db.vocabulary.add({
          id: 'v-rollback',
          word: 'rollback',
          normalizedWord: 'rollback',
          tags: [],
          createdAt: 0,
          updatedAt: 0,
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.vocabulary.get('v-rollback')).toBeUndefined();
  });
});
