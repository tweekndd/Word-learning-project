import { z } from 'zod';
import type {
  DailySession,
  DictionaryEntry,
  LearningState,
  ReviewLog,
  Settings,
  ShortTermTask,
  Vocabulary,
} from './domain';

const finiteNumber = z.number().finite();

export const vocabularySchema = z.object({
  id: z.string().min(1),
  word: z.string().min(1).max(500),
  normalizedWord: z.string().min(1).max(500),
  phonetic: z.string().max(500).optional(),
  userMeanings: z.string().max(20000).optional(),
  tags: z.array(z.string().max(100)).max(100),
  notes: z.string().max(20000).optional(),
  source: z.string().max(500).optional(),
  createdAt: finiteNumber,
  updatedAt: finiteNumber,
  deletedAt: finiteNumber.optional(),
  suspendedAt: finiteNumber.optional(),
});

export const fsrsSnapshotSchema = z.object({
  state: z.number().int().min(0).max(3),
  due: finiteNumber,
  stability: finiteNumber,
  difficulty: finiteNumber,
  elapsed_days: finiteNumber,
  scheduled_days: finiteNumber,
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  learning_steps: z.number().int().min(0),
  last_review: finiteNumber.optional(),
});

export const learningStateSchema = z.object({
  vocabularyId: z.string().min(1),
  status: z.enum(['new', 'learning', 'review', 'relearning', 'suspended']),
  firstSeenAt: finiteNumber.optional(),
  lastReviewedAt: finiteNumber.optional(),
  dueAt: finiteNumber.optional(),
  stability: finiteNumber.optional(),
  difficulty: finiteNumber.optional(),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  currentLearningStep: z.number().int().min(0),
  todayExtraReviewCount: z.number().int().min(0),
  localDayKey: z.string(),
  schedulerVersion: z.string(),
  lastReviewResult: z.enum(['remember', 'forget']).optional(),
  fsrsState: fsrsSnapshotSchema.optional(),
  updatedAt: finiteNumber,
});

export const reviewLogSchema = z.object({
  id: z.string().min(1),
  vocabularyId: z.string().min(1),
  sessionId: z.string().optional(),
  timestamp: finiteNumber,
  localDayKey: z.string(),
  reviewType: z.enum(['new', 'short-term', 'long-term', 'manual']),
  schedulerType: z.enum(['short-term', 'long-term', 'none']),
  stage: z.string(),
  initialRecall: z.enum(['remember', 'forget']).nullable(),
  hintShown: z.boolean(),
  finalRecall: z.enum(['remember', 'forget']).nullable(),
  fsrsRating: z.enum(['again', 'hard', 'good', 'easy']).optional(),
  answerRevealed: z.boolean(),
  elapsedMs: finiteNumber.optional(),
  scheduledDueAt: finiteNumber.optional(),
  idempotencyKey: z.string(),
});

export const shortTermTaskSchema = z.object({
  id: z.string().min(1),
  vocabularyId: z.string().min(1),
  stepIndex: z.number().int().min(0),
  dueAt: finiteNumber,
  status: z.enum(['pending', 'completed', 'cancelled']),
  createdAt: finiteNumber,
  completedAt: finiteNumber.optional(),
  attemptCount: z.number().int().min(0),
  localDayKey: z.string(),
  idempotencyKey: z.string(),
});

export const dailySessionSchema = z.object({
  id: z.string().min(1),
  localDayKey: z.string(),
  startedAt: finiteNumber,
  endedAt: finiteNumber.optional(),
  newWordsSeen: z.number().int().min(0),
  longTermReviews: z.number().int().min(0),
  shortTermReviews: z.number().int().min(0),
  failedAttempts: z.number().int().min(0),
  successfulRecalls: z.number().int().min(0),
  activeSeconds: z.number().int().min(0),
});

export const dictionaryEntrySchema = z.object({
  id: z.string().min(1),
  vocabularyId: z.string().min(1),
  provider: z.string().min(1),
  providerEntryId: z.string().optional(),
  data: z.unknown(),
  fetchedAt: finiteNumber,
  expiresAt: finiteNumber.optional(),
  schemaVersion: z.number().int().min(0),
});

export const settingsSchema = z.object({
  id: z.literal('app'),
  dailyNewWordLimit: z.number().int().min(0).max(10000),
  dailyReviewLimit: z.number().int().min(0).max(100000).nullable(),
  dailyGoal: z.number().int().min(0).max(10000),
  shortTermIntervals: z.array(finiteNumber.positive()).min(1),
  maxExtraReviewsPerWord: z.number().int().min(0).max(100),
  theme: z.enum(['light', 'dark', 'system']),
  layoutMode: z.enum(['compact', 'standard', 'management']),
  fontScale: finiteNumber.min(0.5).max(3),
  keyboardShortcutsEnabled: z.boolean(),
  timezoneMode: z.literal('device'),
  wordOrder: z.enum(['sequential', 'shuffle']).default('sequential'),
  fsrsParameters: z.object({
    requestRetention: finiteNumber.min(0.7).max(0.99),
    maximumInterval: finiteNumber.min(1).max(36500),
    enableFuzz: z.boolean(),
  }),
  dictionaryProviderConfig: z.object({
    provider: z.enum(['mock', 'collins']),
    dictionaryCode: z.string().max(64),
    useProxy: z.boolean(),
  }),
  updatedAt: finiteNumber,
});

export const backupSchema = z.object({
  schemaVersion: z.number().int().min(1),
  appVersion: z.string(),
  exportedAt: finiteNumber,
  settings: settingsSchema,
  vocabulary: z.array(vocabularySchema),
  dictionaryCache: z.array(dictionaryEntrySchema).optional(),
  learningStates: z.array(learningStateSchema),
  reviewLogs: z.array(reviewLogSchema),
  shortTermTasks: z.array(shortTermTaskSchema).optional(),
  dailySessions: z.array(dailySessionSchema),
  tags: z.array(z.string()),
});

export type BackupSchemaInput = z.infer<typeof backupSchema>;

/** Explicit backup shape backed by the domain types (used after validation). */
export interface BackupFile {
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  settings: Settings;
  vocabulary: Vocabulary[];
  dictionaryCache?: DictionaryEntry[];
  learningStates: LearningState[];
  reviewLogs: ReviewLog[];
  shortTermTasks?: ShortTermTask[];
  dailySessions: DailySession[];
  tags: string[];
}
