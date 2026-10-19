import { describe, it, expect, beforeEach } from 'vitest';
import { createDefaultSettings } from '@/db/defaults';
import { learningStateRepo, shortTermTaskRepo, vocabularyRepo } from '@/db/repositories';
import { buildDailyQueue } from '@/features/review/queue';
import { resetDb } from '../helpers/db';

const NOW = new Date('2026-05-01T12:00:00').getTime();

beforeEach(async () => {
  await resetDb();
});

describe('daily queue building (§4.4, §12.1.8-9)', () => {
  it('prioritises short-term, then long-term, then new words', async () => {
    const settings = createDefaultSettings(NOW);
    const newWord = await vocabularyRepo.create({ word: 'apple' }, NOW - 5000);
    const dueWord = await vocabularyRepo.create({ word: 'banana' }, NOW - 4000);
    const stWord = await vocabularyRepo.create({ word: 'cherry' }, NOW - 3000);

    await learningStateRepo.patch(dueWord.id, { status: 'review', dueAt: NOW - 1000, reps: 3 }, NOW);
    await learningStateRepo.patch(stWord.id, { status: 'learning' }, NOW);
    await shortTermTaskRepo.create({
      vocabularyId: stWord.id,
      stepIndex: 0,
      dueAt: NOW - 1000,
      localDayKey: '2026-05-01',
      idempotencyKey: 'st|cherry|0|2026-05-01',
      createdAt: NOW,
    });

    const queue = await buildDailyQueue({ now: NOW, settings });
    expect(queue.all.map((r) => r.vocabularyId)).toEqual([stWord.id, dueWord.id, newWord.id]);
  });

  it('excludes suspended and deleted words (§12.1.9)', async () => {
    const settings = createDefaultSettings(NOW);
    const suspended = await vocabularyRepo.create({ word: 'suspended-word' });
    const deleted = await vocabularyRepo.create({ word: 'deleted-word' });
    await vocabularyRepo.suspend(suspended.id);
    await vocabularyRepo.softDelete(deleted.id);

    const queue = await buildDailyQueue({ now: NOW, settings });
    const ids = queue.all.map((r) => r.vocabularyId);
    expect(ids).not.toContain(suspended.id);
    expect(ids).not.toContain(deleted.id);
  });

  it('does not re-select a word already scheduled in the future (§12.1.8)', async () => {
    const settings = createDefaultSettings(NOW);
    const done = await vocabularyRepo.create({ word: 'done-word' });
    await learningStateRepo.patch(
      done.id,
      { status: 'review', dueAt: NOW + 86_400_000, firstSeenAt: NOW, reps: 1 },
      NOW,
    );
    const queue = await buildDailyQueue({ now: NOW, settings });
    expect(queue.all.map((r) => r.vocabularyId)).not.toContain(done.id);
  });

  it('respects the daily new-word limit', async () => {
    const settings = { ...createDefaultSettings(NOW), dailyNewWordLimit: 2 };
    for (let i = 0; i < 5; i += 1) {
      await vocabularyRepo.create({ word: `word-${i}` }, NOW + i);
    }
    const queue = await buildDailyQueue({ now: NOW, settings });
    expect(queue.newWords).toHaveLength(2);
  });
});

describe('word appearance order (§4.4)', () => {
  it('keeps created order in sequential mode', async () => {
    const settings = { ...createDefaultSettings(NOW), wordOrder: 'sequential' as const };
    const created = [];
    for (let i = 0; i < 4; i += 1) created.push(await vocabularyRepo.create({ word: `seq-${i}` }, NOW + i));

    const queue = await buildDailyQueue({ now: NOW, settings });
    expect(queue.newWords.map((r) => r.vocabularyId)).toEqual(created.map((v) => v.id));
  });

  it('shuffles new words with no pattern while preserving the set', async () => {
    const base = { ...createDefaultSettings(NOW), wordOrder: 'shuffle' as const };
    const created = [];
    for (let i = 0; i < 5; i += 1) created.push(await vocabularyRepo.create({ word: `shuf-${i}` }, NOW + i));
    const ids = created.map((v) => v.id);

    const sequential = await buildDailyQueue({ now: NOW, settings: { ...base, wordOrder: 'sequential' } });
    const shuffled = await buildDailyQueue({ now: NOW, settings: base, rng: () => 0 });
    const shuffledIds = shuffled.newWords.map((r) => r.vocabularyId);

    expect([...shuffledIds].sort()).toEqual([...ids].sort());
    expect(shuffledIds).not.toEqual(sequential.newWords.map((r) => r.vocabularyId));
    expect(shuffledIds).toEqual([...ids].slice(1).concat(ids[0]!));
  });

  it('preserves priority blocks when shuffling', async () => {
    const settings = { ...createDefaultSettings(NOW), wordOrder: 'shuffle' as const };
    const stWord = await vocabularyRepo.create({ word: 'st' }, NOW - 3000);
    const dueWord = await vocabularyRepo.create({ word: 'due' }, NOW - 2000);
    await vocabularyRepo.create({ word: 'new-a' }, NOW - 1000);
    await vocabularyRepo.create({ word: 'new-b' }, NOW);
    await learningStateRepo.patch(dueWord.id, { status: 'review', dueAt: NOW - 1000, reps: 3 }, NOW);
    await shortTermTaskRepo.create({
      vocabularyId: stWord.id,
      stepIndex: 0,
      dueAt: NOW - 1000,
      localDayKey: '2026-05-01',
      idempotencyKey: 'st|st|0|2026-05-01',
      createdAt: NOW,
    });

    const queue = await buildDailyQueue({ now: NOW, settings, rng: () => 0 });
    const kinds = queue.all.map((r) => r.kind);
    expect(kinds[0]).toBe('short-term');
    expect(kinds[1]).toBe('long-term');
    expect(kinds.slice(2).every((k) => k === 'new')).toBe(true);
  });
});
