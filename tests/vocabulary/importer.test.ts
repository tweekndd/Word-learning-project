import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { learningStateRepo, vocabularyRepo } from '@/db/repositories';
import { parseCsv } from '@/features/vocabulary/csv';
import { detectMapping } from '@/features/vocabulary/mapping';
import { applyImport, buildImportPreview } from '@/features/vocabulary/importer';
import { resetDb } from '../helpers/db';

function previewOf(csv: string) {
  const parsed = parseCsv(csv);
  return buildImportPreview(parsed, detectMapping(parsed.headers));
}

beforeEach(async () => {
  await resetDb();
});

describe('CSV import (§12.4.9-10)', () => {
  it('reports totals and skips in-file duplicates', async () => {
    const preview = previewOf('word,meanings\nCar,汽车\ncar,汽车重复\nBook,书\n,空\n');
    expect(preview.validCount).toBe(2);
    expect(preview.duplicateInFileCount).toBe(1);
    expect(preview.errorCount).toBe(1);
  });

  it('imports valid rows creation-wise and creates learning states', async () => {
    const preview = previewOf('word,meanings,tags\nNegotiate,谈判,business\nInvoice,发票,business\n');
    const result = await applyImport(preview, { policy: 'skip' });
    expect(result.created).toBe(2);
    expect(await vocabularyRepo.count()).toBe(2);
    const states = await learningStateRepo.list();
    expect(states).toHaveLength(2);
  });

  it('applies the skip policy for existing words', async () => {
    await vocabularyRepo.create({ word: 'car' });
    const preview = previewOf('word,meanings\ncar,新释义\n');
    const result = await applyImport(preview, { policy: 'skip' });
    expect(result.skipped).toBe(1);
    expect((await vocabularyRepo.findByWord('car'))?.userMeanings).toBeUndefined();
  });

  it('updates user fields without clearing learning state or cache', async () => {
    const vocab = await vocabularyRepo.create({ word: 'car' });
    await learningStateRepo.patch(vocab.id, { status: 'review', reps: 7 }, 1000);
    await db.dictionaryEntries.put({
      id: 'd1',
      vocabularyId: vocab.id,
      provider: 'mock',
      data: { word: 'car' },
      fetchedAt: 1000,
      schemaVersion: 1,
    });

    const preview = previewOf('word,meanings,notes\ncar,汽车,我的笔记\n');
    const result = await applyImport(preview, { policy: 'update-user-fields' });
    expect(result.updated).toBe(1);

    const updated = await vocabularyRepo.getById(vocab.id);
    expect(updated?.userMeanings).toBe('汽车');
    expect(updated?.notes).toBe('我的笔记');
    expect((await learningStateRepo.get(vocab.id))?.reps).toBe(7);
    expect(await db.dictionaryEntries.count()).toBe(1);
  });

  it('can import a duplicate as an independent entry', async () => {
    await vocabularyRepo.create({ word: 'car' });
    const preview = previewOf('word\ncar\n');
    const result = await applyImport(preview, { policy: 'import-as-new' });
    expect(result.created).toBe(1);
    expect(await vocabularyRepo.count()).toBe(2);
  });
});
