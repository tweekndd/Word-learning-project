export type Id = string;

export type LearningStatus =
  | 'new'
  | 'learning'
  | 'review'
  | 'relearning'
  | 'suspended';

export type LayoutMode = 'compact' | 'standard' | 'management';

export type ThemeMode = 'light' | 'dark' | 'system';

export type TimezoneMode = 'device';

/** Order in which words appear within each queue block.
 *  - `sequential`: by due time / import order (default).
 *  - `shuffle`: uniformly random, no pattern. */
export type WordOrder = 'sequential' | 'shuffle';

export type ReviewType = 'new' | 'short-term' | 'long-term' | 'manual';

export type SchedulerType = 'short-term' | 'long-term' | 'none';

export type InitialRecall = 'remember' | 'forget' | null;

export type FinalRecall = 'remember' | 'forget' | null;

export type FsrsRating = 'again' | 'hard' | 'good' | 'easy';

export type ShortTermTaskStatus = 'pending' | 'completed' | 'cancelled';

export interface Vocabulary {
  id: Id;
  word: string;
  normalizedWord: string;
  phonetic?: string;
  userMeanings?: string;
  tags: string[];
  notes?: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  suspendedAt?: number;
}

/**
 * Cached dictionary payload for a vocabulary item. `data` is the unified DTO,
 * `provider` identifies where it came from so the UI can label the source and
 * never misattribute content.
 */
export interface DictionaryEntry {
  id: Id;
  vocabularyId: Id;
  provider: string;
  providerEntryId?: string;
  data: unknown;
  fetchedAt: number;
  expiresAt?: number;
  schemaVersion: number;
}

export interface LearningState {
  vocabularyId: Id;
  status: LearningStatus;
  firstSeenAt?: number;
  lastReviewedAt?: number;
  dueAt?: number;
  stability?: number;
  difficulty?: number;
  reps: number;
  lapses: number;
  currentLearningStep: number;
  todayExtraReviewCount: number;
  localDayKey: string;
  schedulerVersion: string;
  lastReviewResult?: 'remember' | 'forget';
  /** Serialised ts-fsrs card (state/last_review/elapsed_days/…). */
  fsrsState?: FsrsCardSnapshot;
  updatedAt: number;
}

export interface FsrsCardSnapshot {
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  last_review?: number;
}

export interface ReviewLog {
  id: Id;
  vocabularyId: Id;
  sessionId?: Id;
  timestamp: number;
  localDayKey: string;
  reviewType: ReviewType;
  schedulerType: SchedulerType;
  stage: string;
  initialRecall: InitialRecall;
  hintShown: boolean;
  finalRecall: FinalRecall;
  fsrsRating?: FsrsRating;
  answerRevealed: boolean;
  elapsedMs?: number;
  scheduledDueAt?: number;
  idempotencyKey: string;
}

export interface ShortTermTask {
  id: Id;
  vocabularyId: Id;
  stepIndex: number;
  dueAt: number;
  status: ShortTermTaskStatus;
  createdAt: number;
  completedAt?: number;
  attemptCount: number;
  localDayKey: string;
  idempotencyKey: string;
}

export interface DailySession {
  id: Id;
  localDayKey: string;
  startedAt: number;
  endedAt?: number;
  newWordsSeen: number;
  longTermReviews: number;
  shortTermReviews: number;
  failedAttempts: number;
  successfulRecalls: number;
  activeSeconds: number;
}

export interface FsrsParametersConfig {
  requestRetention: number;
  maximumInterval: number;
  enableFuzz: boolean;
}

export interface DictionaryProviderConfig {
  provider: 'mock' | 'collins';
  /** Only non-secret settings live here. Keys are never persisted. */
  dictionaryCode: string;
  useProxy: boolean;
}

export interface Settings {
  id: 'app';
  dailyNewWordLimit: number;
  dailyReviewLimit: number | null;
  dailyGoal: number;
  shortTermIntervals: number[];
  maxExtraReviewsPerWord: number;
  theme: ThemeMode;
  layoutMode: LayoutMode;
  fontScale: number;
  keyboardShortcutsEnabled: boolean;
  timezoneMode: TimezoneMode;
  wordOrder: WordOrder;
  fsrsParameters: FsrsParametersConfig;
  dictionaryProviderConfig: DictionaryProviderConfig;
  updatedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
