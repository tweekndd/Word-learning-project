import { db } from '../database';
import { createDefaultSettings } from '../defaults';
import type { Settings } from '@/types/domain';

export const settingsRepo = {
  async get(now = Date.now()): Promise<Settings> {
    const existing = await db.settings.get('app');
    // Merge over defaults so settings created by an older build gain any newly
    // added fields (e.g. wordOrder) without a schema migration.
    if (existing) return { ...createDefaultSettings(now), ...existing, id: 'app' };
    const created = createDefaultSettings(now);
    await db.settings.put(created);
    return created;
  },

  async update(patch: Partial<Settings>, now = Date.now()): Promise<Settings> {
    const current = await this.get(now);
    const next: Settings = { ...current, ...patch, id: 'app', updatedAt: now };
    await db.settings.put(next);
    return next;
  },

  async replace(settings: Settings): Promise<void> {
    await db.settings.put({ ...settings, id: 'app' });
  },
};
