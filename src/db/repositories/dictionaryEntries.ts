import { db } from '../database';
import type { DictionaryEntry } from '@/types/domain';
import { uuid } from '@/utils/id';
import { DICTIONARY_SCHEMA_VERSION, type DictionaryEntryDto } from '@/types/dictionary';

export interface SaveDictionaryEntryInput {
  vocabularyId: string;
  provider: string;
  providerEntryId?: string;
  data: DictionaryEntryDto;
  fetchedAt: number;
  expiresAt?: number;
}

export const dictionaryEntryRepo = {
  async getForVocabulary(
    vocabularyId: string,
    provider?: string,
  ): Promise<DictionaryEntry | undefined> {
    const all = await db.dictionaryEntries
      .where('vocabularyId')
      .equals(vocabularyId)
      .toArray();
    if (provider) return all.find((e) => e.provider === provider);
    return all.sort((a, b) => b.fetchedAt - a.fetchedAt)[0];
  },

  async save(input: SaveDictionaryEntryInput): Promise<DictionaryEntry> {
    const existing = await db.dictionaryEntries
      .where('[vocabularyId+provider]')
      .equals([input.vocabularyId, input.provider])
      .first();
    const row: DictionaryEntry = {
      id: existing?.id ?? uuid(),
      vocabularyId: input.vocabularyId,
      provider: input.provider,
      providerEntryId: input.providerEntryId,
      data: input.data,
      fetchedAt: input.fetchedAt,
      expiresAt: input.expiresAt,
      schemaVersion: DICTIONARY_SCHEMA_VERSION,
    };
    await db.dictionaryEntries.put(row);
    return row;
  },

  async removeForVocabulary(vocabularyId: string): Promise<void> {
    await db.dictionaryEntries.where('vocabularyId').equals(vocabularyId).delete();
  },

  async count(): Promise<number> {
    return db.dictionaryEntries.count();
  },

  async all(): Promise<DictionaryEntry[]> {
    return db.dictionaryEntries.toArray();
  },
};
