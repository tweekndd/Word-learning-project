import { db, DB_VERSION } from './database';
import { createDefaultSettings, META_KEYS } from './defaults';

/**
 * Dexie migration strategy.
 *
 * Each future schema change must add a new `db.version(n).stores({...})
 * .upgrade(...)` block inside a dedicated function so that:
 *   - upgrades are additive and never drop user data,
 *   - a failure keeps the previous DB intact (Dexie aborts the upgrade
 *     transaction), and
 *   - the app surfaces a recovery prompt instead of clearing storage.
 *
 * v1 is the initial schema; there is nothing to migrate yet.
 */
export async function runMigrations(): Promise<void> {
  await db.open();
  await ensureSingletonRows();
}

async function ensureSingletonRows(): Promise<void> {
  await db.transaction('rw', db.settings, db.meta, async () => {
    const settings = await db.settings.get('app');
    if (!settings) {
      await db.settings.put(createDefaultSettings());
    }
    const schema = await db.meta.get(META_KEYS.schemaVersion);
    if (!schema) {
      await db.meta.put({ key: META_KEYS.schemaVersion, value: DB_VERSION });
    }
  });
}

export interface MigrationCheck {
  ok: boolean;
  reason?: string;
  backupVersion?: number;
  supportedVersion: number;
}

/**
 * Validate a JSON backup's schemaVersion before importing. An unknown/newer
 * version is rejected with a clear message and the current DB is untouched
 * (taskbook §6.4, §7.2).
 */
export function checkBackupSchemaVersion(version: unknown): MigrationCheck {
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return {
      ok: false,
      reason: '备份文件缺少有效的 schemaVersion 字段。',
      supportedVersion: DB_VERSION,
    };
  }
  if (version > DB_VERSION) {
    return {
      ok: false,
      reason: `备份 schemaVersion ${version} 高于当前支持的 ${DB_VERSION}，请升级应用后再导入。`,
      backupVersion: version,
      supportedVersion: DB_VERSION,
    };
  }
  return { ok: true, backupVersion: version, supportedVersion: DB_VERSION };
}
