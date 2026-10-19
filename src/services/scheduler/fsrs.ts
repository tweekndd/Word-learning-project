import { createEmptyCard, fsrs, State, type Card, type FSRSParameters, type Grade } from 'ts-fsrs';
import type { FsrsCardSnapshot, FsrsParametersConfig, FsrsRating } from '@/types/domain';
import { toTsFsrsRating } from './rating';

export const S_MIN = 0.01;
export const S_MAX = 36500;
export const D_MIN = 1;
export const D_MAX = 10;

export interface ScheduleInput {
  /** Previous FSRS card snapshot, or null for a brand new card. */
  card: FsrsCardSnapshot | null;
  rating: FsrsRating;
  now: number;
  params?: FsrsParametersConfig;
}

export interface ScheduleResult {
  card: FsrsCardSnapshot;
  dueAt: number;
  stability: number;
  difficulty: number;
  state: number;
  scheduledDays: number;
  elapsedDays: number;
}

const DEFAULT_PARAMS: FsrsParametersConfig = {
  requestRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: false,
};

/**
 * Validate and clamp FSRS parameters into safe ranges (taskbook §4.2, §4.4).
 */
export function sanitizeParams(config?: FsrsParametersConfig): FsrsParametersConfig {
  const merged = { ...DEFAULT_PARAMS, ...(config ?? {}) };
  const requestRetention = clampNumber(merged.requestRetention, 0.7, 0.99, 0.9);
  const maximumInterval = Math.round(clampNumber(merged.maximumInterval, 1, 36500, 36500));
  return {
    requestRetention,
    maximumInterval,
    // Fuzz makes results non-deterministic. It stays opt-in; default off so that
    // equal (state, rating, now) always yields equal scheduling (taskbook §4.2).
    enableFuzz: merged.enableFuzz === true,
  };
}

function toFsrsParameters(config: FsrsParametersConfig): Partial<FSRSParameters> {
  return {
    request_retention: config.requestRetention,
    maximum_interval: config.maximumInterval,
    enable_fuzz: config.enableFuzz,
  };
}

export function snapshotFromCard(card: Card): FsrsCardSnapshot {
  return {
    state: card.state,
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    last_review: card.last_review?.getTime(),
  };
}

export function cardFromSnapshot(snapshot: FsrsCardSnapshot): Card {
  const card: Card = {
    due: new Date(snapshot.due),
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    elapsed_days: snapshot.elapsed_days,
    scheduled_days: snapshot.scheduled_days,
    learning_steps: snapshot.learning_steps,
    reps: snapshot.reps,
    lapses: snapshot.lapses,
    state: snapshot.state as State,
  };
  if (snapshot.last_review !== undefined) {
    card.last_review = new Date(snapshot.last_review);
  }
  return card;
}

export function createNewCardSnapshot(now: number): FsrsCardSnapshot {
  return snapshotFromCard(createEmptyCard(new Date(now)));
}

/**
 * Compute the next FSRS card state. This is a pure, deterministic function of
 * (card, rating, now, params) — the scheduler version is captured by callers
 * separately.
 */
export function schedule(input: ScheduleInput): ScheduleResult {
  const params = sanitizeParams(input.params);
  const scheduler = fsrs(toFsrsParameters(params));
  const baseCard = input.card ? cardFromSnapshot(input.card) : createEmptyCard(new Date(input.now));
  const { card } = scheduler.next(
    baseCard,
    new Date(input.now),
    toTsFsrsRating(input.rating) as Grade,
  );
  const snapshot = snapshotFromCard(card);
  return {
    card: snapshot,
    dueAt: snapshot.due,
    stability: snapshot.stability,
    difficulty: snapshot.difficulty,
    state: snapshot.state,
    scheduledDays: snapshot.scheduled_days,
    elapsedDays: snapshot.elapsed_days,
  };
}

/**
 * Validate a stored FSRS snapshot. Returns false for out-of-range or
 * non-finite stability/difficulty so the caller can rebuild the card instead
 * of feeding garbage into the scheduler (taskbook §7.3).
 */
export function isValidSnapshot(snapshot: FsrsCardSnapshot | undefined | null): boolean {
  if (!snapshot) return false;
  const { stability, difficulty, due, state } = snapshot;
  if (!Number.isFinite(due)) return false;
  if (!Number.isInteger(state) || state < State.New || state > State.Relearning) return false;
  // A never-reviewed (New) card legitimately has zero stability/difficulty.
  if (state === State.New) {
    return (
      Number.isFinite(stability) &&
      stability >= 0 &&
      stability <= S_MAX &&
      Number.isFinite(difficulty) &&
      difficulty >= 0 &&
      difficulty <= D_MAX
    );
  }
  if (!Number.isFinite(stability) || stability < S_MIN || stability > S_MAX) return false;
  if (!Number.isFinite(difficulty) || difficulty < D_MIN || difficulty > D_MAX) return false;
  return true;
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
