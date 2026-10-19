import { describe, it, expect, beforeEach } from 'vitest';
import { db, DB_VERSION } from '@/db/database';
import { learningStateRepo, reviewLogRepo, vocabularyRepo } from '@/db/repositories';
import { buildBackup, parseBackup, restoreBackup, serializeBackup } from '@/services/backup';
import { resetDb } from '../helpers/db';

beforeEach(async () => {
  await resetDb();
});

async function seed() {
  const vocab = await vocabularyRepo.create({ word: 'leverage', userMeanings: '杠杆' });
  await learningStateRepo.patch(vocab.id, { status: 'review', reps: 2 }, 1000);
  await reviewLogRepo.append({
    id: 'log-1',
    vocabularyId: vocab.id,
    timestamp: 1000,
    localDayKey: '2026-01-01',
    reviewType: 'new',
    schedulerType: 'long-term',
    stage: 'initial',
    initialRecall: 'remember',
    hintShown: false,
    finalRecall: 'remember',
    answerRevealed: true,
    idempotencyKey: 'seed-1',
  });
  return vocab;
}

describe('backup & restore (§12.4.6-8)', () => {
  it('exports a backup with the required fields', async () => {
    await seed();
    const backup = await buildBackup();
    expect(backup.schemaVersion).toBe(DB_VERSION);
    expect(backup.appVersion).toBeDefined();
    expect(backup.exportedAt).toBeGreaterThan(0);
    expect(backup.vocabulary).toHaveLength(1);
    expect(backup.learningStates).toHaveLength(1);
    expect(backup.reviewLogs).toHaveLength(1);
    expect(backup.settings).toBeDefined();
  });

  it('rejects malformed JSON and unsupported schema versions without touching data', async () => {
    await seed();
    expect(parseBackup('{not json').ok).toBe(false);

    const future = serializeBackup({
      schemaVersion: DB_VERSION + 5,
      appVersion: '9',
      exportedAt: 0,
      settings: {} as never,
      vocabulary: [],
      learningStates: [],
      reviewLogs: [],
      dailySessions: [],
      tags: [],
    });
    const check = parseBackup(future);
    expect(check.ok).toBe(false);
    expect(check.error).toContain('schemaVersion');
    // Data untouched.
    expect(await vocabularyRepo.count()).toBe(1);
  });

  it('round-trips counts through replace restore', async () => {
    await seed();
    const backup = await buildBackup({ includeDictionaryCache: true });
    const text = serializeBackup(backup);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);

    await resetDb();
    const result = await restoreBackup(parsed.backup!, { mode: 'replace' });
    expect(result.counts.vocabulary).toBe(1);
    expect(await vocabularyRepo.count()).toBe(1);
    expect(await db.reviewLogs.count()).toBe(1);
    expect((await vocabularyRepo.findByWord('leverage'))?.userMeanings).toBe('杠杆');
  });

  it('treats imported HTML as data, never as executable content', async () => {
    await seed();
    const backup = await buildBackup();
    backup.vocabulary[0]!.notes = '<script>alert(1)</script>';
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    await restoreBackup(parsed.backup!, { mode: 'replace' });
    const stored = await db.vocabulary.get(backup.vocabulary[0]!.id);
    expect(stored?.notes).toBe('<script>alert(1)</script>');
  });

  it('produces a pre-restore safety backup', async () => {
    await seed();
    const backup = await buildBackup();
    const result = await restoreBackup(backup, { mode: 'merge' });
    expect(result.backupBeforeRestore.vocabulary.length).toBe(1);
  });

  it('accepts legacy backups that predate the wordOrder field', async () => {
    await seed();
    const backup = await buildBackup();
    const legacy = JSON.parse(serializeBackup(backup)) as Record<string, unknown>;
    delete (legacy.settings as Record<string, unknown>).wordOrder;

    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.ok).toBe(true);
    expect(parsed.backup?.settings.wordOrder).toBe('sequential');
  });
});
