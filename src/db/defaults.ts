import type { Settings } from '@/types/domain';

export const DEFAULT_SHORT_TERM_INTERVALS_MINUTES = [10, 30, 120, 240];

export const DEFAULT_MAX_EXTRA_REVIEWS = 5;

export const SCHEDULER_VERSION = 'ts-fsrs@5';

export function createDefaultSettings(now = Date.now()): Settings {
  return {
    id: 'app',
    dailyNewWordLimit: 20,
    dailyReviewLimit: null,
    dailyGoal: 30,
    shortTermIntervals: [...DEFAULT_SHORT_TERM_INTERVALS_MINUTES],
    maxExtraReviewsPerWord: DEFAULT_MAX_EXTRA_REVIEWS,
    theme: 'system',
    layoutMode: 'standard',
    fontScale: 1,
    keyboardShortcutsEnabled: true,
    timezoneMode: 'device',
    wordOrder: 'sequential',
    fsrsParameters: {
      requestRetention: 0.9,
      maximumInterval: 36500,
      enableFuzz: false,
    },
    dictionaryProviderConfig: {
      provider: 'mock',
      dictionaryCode: 'british',
      useProxy: true,
    },
    updatedAt: now,
  };
}

export const META_KEYS = {
  lastActiveAt: 'lastActiveAt',
  schemaVersion: 'schemaVersion',
  lastBackupAt: 'lastBackupAt',
} as const;
