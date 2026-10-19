import { db } from '../database';
import type { Vocabulary } from '@/types/domain';
import { uuid } from '@/utils/id';
import { normalizeWord } from '@/utils/text';

export interface CreateVocabularyInput {
  word: string;
  phonetic?: string;
  userMeanings?: string;
  tags?: string[];
  notes?: string;
  source?: string;
}

export interface VocabularyFilter {
  search?: string;
  tag?: string;
  includeDeleted?: boolean;
  includeSuspended?: boolean;
  suspendedOnly?: boolean;
}

export const vocabularyRepo = {
  async getById(id: string): Promise<Vocabulary | undefined> {
    return db.vocabulary.get(id);
  },

  async getByNormalizedWord(normalizedWord: string): Promise<Vocabulary | undefined> {
    return db.vocabulary.where('normalizedWord').equals(normalizedWord).first();
  },

  async findByWord(word: string): Promise<Vocabulary | undefined> {
    return this.getByNormalizedWord(normalizeWord(word));
  },

  async list(filter: VocabularyFilter = {}): Promise<Vocabulary[]> {
    let rows = await db.vocabulary.orderBy('updatedAt').reverse().toArray();

    if (!filter.includeDeleted) {
      rows = rows.filter((r) => r.deletedAt === undefined);
    }
    if (filter.suspendedOnly) {
      rows = rows.filter((r) => r.suspendedAt !== undefined);
    } else if (!filter.includeSuspended) {
      rows = rows.filter((r) => r.suspendedAt === undefined);
    }
    if (filter.tag) {
      rows = rows.filter((r) => r.tags.includes(filter.tag as string));
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.word.toLowerCase().includes(q) ||
          (r.notes?.toLowerCase().includes(q) ?? false) ||
          (r.userMeanings?.toLowerCase().includes(q) ?? false),
      );
    }
    return rows;
  },

  async count(includeDeleted = false): Promise<number> {
    if (includeDeleted) return db.vocabulary.count();
    return db.vocabulary.filter((v) => v.deletedAt === undefined).count();
  },

  async allTags(): Promise<string[]> {
    const set = new Set<string>();
    await db.vocabulary.each((v) => {
      if (v.deletedAt === undefined) v.tags.forEach((t) => set.add(t));
    });
    return [...set].sort();
  },

  async create(input: CreateVocabularyInput, now = Date.now()): Promise<Vocabulary> {
    const row: Vocabulary = {
      id: uuid(),
      word: input.word.trim(),
      normalizedWord: normalizeWord(input.word),
      phonetic: input.phonetic,
      userMeanings: input.userMeanings,
      tags: input.tags ?? [],
      notes: input.notes,
      source: input.source,
      createdAt: now,
      updatedAt: now,
    };
    await db.vocabulary.add(row);
    return row;
  },

  async bulkCreate(rows: Vocabulary[]): Promise<void> {
    await db.vocabulary.bulkAdd(rows);
  },

  async update(
    id: string,
    patch: Partial<Pick<Vocabulary, 'word' | 'phonetic' | 'userMeanings' | 'tags' | 'notes' | 'source'>>,
    now = Date.now(),
  ): Promise<void> {
    const update: Partial<Vocabulary> = { ...patch, updatedAt: now };
    if (patch.word !== undefined) {
      update.normalizedWord = normalizeWord(patch.word);
      update.word = patch.word.trim();
    }
    await db.vocabulary.update(id, update);
  },

  async softDelete(id: string, now = Date.now()): Promise<void> {
    await db.vocabulary.update(id, { deletedAt: now, updatedAt: now });
  },

  async restore(id: string, now = Date.now()): Promise<void> {
    const row = await db.vocabulary.get(id);
    if (!row) return;
    const { deletedAt: _deletedAt, ...rest } = row;
    void _deletedAt;
    await db.vocabulary.put({ ...rest, updatedAt: now });
  },

  async suspend(id: string, now = Date.now()): Promise<void> {
    await db.vocabulary.update(id, { suspendedAt: now, updatedAt: now });
  },

  async resume(id: string, now = Date.now()): Promise<void> {
    const row = await db.vocabulary.get(id);
    if (!row) return;
    const { suspendedAt: _suspendedAt, ...rest } = row;
    void _suspendedAt;
    await db.vocabulary.put({ ...rest, updatedAt: now });
  },
};
