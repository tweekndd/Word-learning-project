import { db } from '../database';
import type { ReviewLog } from '@/types/domain';

export interface AppendReviewLogInput {
  vocabularyId: string;
  sessionId?: string;
  timestamp: number;
  localDayKey: string;
  reviewType: ReviewLog['reviewType'];
  schedulerType: ReviewLog['schedulerType'];
  stage: string;
  initialRecall: ReviewLog['initialRecall'];
  hintShown: boolean;
  finalRecall: ReviewLog['finalRecall'];
  fsrsRating?: ReviewLog['fsrsRating'];
  answerRevealed: boolean;
  elapsedMs?: number;
  scheduledDueAt?: number;
  idempotencyKey: string;
  id: string;
}

export const reviewLogRepo = {
  /**
   * Idempotent append. If a log with the same idempotencyKey already exists it
   * is returned unchanged, so double clicks / retries never duplicate a write
   * (taskbook §7.2).
   */
  async append(input: AppendReviewLogInput): Promise<{ log: ReviewLog; created: boolean }> {
    const existing = await db.reviewLogs.where('idempotencyKey').equals(input.idempotencyKey).first();
    if (existing) {
      return { log: existing, created: false };
    }
    const log: ReviewLog = {
      id: input.id,
      vocabularyId: input.vocabularyId,
      sessionId: input.sessionId,
      timestamp: input.timestamp,
      localDayKey: input.localDayKey,
      reviewType: input.reviewType,
      schedulerType: input.schedulerType,
      stage: input.stage,
      initialRecall: input.initialRecall,
      hintShown: input.hintShown,
      finalRecall: input.finalRecall,
      fsrsRating: input.fsrsRating,
      answerRevealed: input.answerRevealed,
      elapsedMs: input.elapsedMs,
      scheduledDueAt: input.scheduledDueAt,
      idempotencyKey: input.idempotencyKey,
    };
    try {
      await db.reviewLogs.add(log);
      return { log, created: true };
    } catch (err) {
      // Unique index race: another write won, return the winner.
      const winner = await db.reviewLogs
        .where('idempotencyKey')
        .equals(input.idempotencyKey)
        .first();
      if (winner) return { log: winner, created: false };
      throw err;
    }
  },

  async byVocabulary(vocabularyId: string): Promise<ReviewLog[]> {
    return db.reviewLogs.where('vocabularyId').equals(vocabularyId).sortBy('timestamp');
  },

  async all(): Promise<ReviewLog[]> {
    return db.reviewLogs.toArray();
  },

  async inRange(from: number, to: number): Promise<ReviewLog[]> {
    return db.reviewLogs.where('timestamp').between(from, to, true, true).toArray();
  },

  async forDay(localDayKey: string): Promise<ReviewLog[]> {
    return db.reviewLogs.where('localDayKey').equals(localDayKey).toArray();
  },

  async count(): Promise<number> {
    return db.reviewLogs.count();
  },
};
