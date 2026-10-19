import { db } from '../database';
import { SCHEDULER_VERSION } from '../defaults';
import type { FsrsCardSnapshot, LearningState, LearningStatus } from '@/types/domain';
import { toLocalDayKey } from '@/utils/date';

export function createNewLearningState(vocabularyId: string, now = Date.now()): LearningState {
  return {
    vocabularyId,
    status: 'new',
    reps: 0,
    lapses: 0,
    currentLearningStep: 0,
    todayExtraReviewCount: 0,
    localDayKey: toLocalDayKey(now),
    schedulerVersion: SCHEDULER_VERSION,
    updatedAt: now,
  };
}

export interface LearningStatePatch {
  status?: LearningStatus;
  firstSeenAt?: number;
  lastReviewedAt?: number;
  dueAt?: number;
  stability?: number;
  difficulty?: number;
  reps?: number;
  lapses?: number;
  currentLearningStep?: number;
  todayExtraReviewCount?: number;
  localDayKey?: string;
  lastReviewResult?: 'remember' | 'forget';
  fsrsState?: FsrsCardSnapshot;
  schedulerVersion?: string;
}

export const learningStateRepo = {
  async get(vocabularyId: string): Promise<LearningState | undefined> {
    return db.learningStates.get(vocabularyId);
  },

  async list(): Promise<LearningState[]> {
    return db.learningStates.toArray();
  },

  async ensure(vocabularyId: string, now = Date.now()): Promise<LearningState> {
    const existing = await db.learningStates.get(vocabularyId);
    if (existing) return existing;
    const created = createNewLearningState(vocabularyId, now);
    await db.learningStates.put(created);
    return created;
  },

  async patch(
    vocabularyId: string,
    patch: LearningStatePatch,
    now = Date.now(),
  ): Promise<LearningState> {
    const current = await this.ensure(vocabularyId, now);
    const next: LearningState = { ...current, ...patch, updatedAt: now };
    await db.learningStates.put(next);
    return next;
  },

  /**
   * Roll the per-day reinforcement counter forward when the local day changes.
   */
  async rollDayIfNeeded(vocabularyId: string, now = Date.now()): Promise<LearningState> {
    const current = await this.ensure(vocabularyId, now);
    const today = toLocalDayKey(now);
    if (current.localDayKey === today) return current;
    const next: LearningState = {
      ...current,
      localDayKey: today,
      todayExtraReviewCount: 0,
      currentLearningStep: 0,
      updatedAt: now,
    };
    await db.learningStates.put(next);
    return next;
  },

  /** Increment today's reinforcement count, refusing to exceed `max`. */
  async tryIncrementExtraCount(
    vocabularyId: string,
    max: number,
    now = Date.now(),
  ): Promise<{ state: LearningState; allowed: boolean }> {
    const current = await this.rollDayIfNeeded(vocabularyId, now);
    if (current.todayExtraReviewCount >= max) {
      return { state: current, allowed: false };
    }
    const next: LearningState = {
      ...current,
      todayExtraReviewCount: current.todayExtraReviewCount + 1,
      updatedAt: now,
    };
    await db.learningStates.put(next);
    return { state: next, allowed: true };
  },

  async remove(vocabularyId: string): Promise<void> {
    await db.learningStates.delete(vocabularyId);
  },
};
