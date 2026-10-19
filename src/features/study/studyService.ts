import { db } from '@/db/database';
import {
  dailySessionRepo,
  learningStateRepo,
  reviewLogRepo,
  shortTermTaskRepo,
} from '@/db/repositories';
import { SCHEDULER_VERSION } from '@/db/defaults';
import type { LearningStatus, Settings, ShortTermTask } from '@/types/domain';
import { toLocalDayKey } from '@/utils/date';
import { uuid } from '@/utils/id';
import { schedule, isValidSnapshot } from '@/services/scheduler/fsrs';
import { intervalsFromSettings, shortTermTaskKey, offsetMsForStep } from '@/features/review/shortTerm';
import { State } from 'ts-fsrs';
import type { StudyContext, StudyResult } from './machine';

export interface CommitOptions {
  now: number;
  settings: Settings;
  sessionId?: string;
  /** Wall-clock ms the card was displayed, for elapsedMs. */
  presentedAt?: number;
}

export interface CommitOutcome {
  duplicate: boolean;
  reviewLogId?: string;
  nextTask?: ShortTermTask;
  learningStatus: LearningStatus;
}

function statusFromFsrsState(state: number): LearningStatus {
  switch (state) {
    case State.Learning:
      return 'learning';
    case State.Review:
      return 'review';
    case State.Relearning:
      return 'relearning';
    default:
      return 'learning';
  }
}

/**
 * Persist the outcome of one card presentation in a single transaction.
 *
 * Invariants enforced here (taskbook §3.3, §3.4, §4.2, §7.3):
 *  - a duplicate confirmation collides on `idempotencyKey` and writes nothing;
 *  - short-term reinforcement NEVER updates FSRS card state;
 *  - FSRS scheduling and short-term enqueue happen together;
 *  - `todayExtraReviewCount` never exceeds `maxExtraReviewsPerWord`.
 */
export async function commitStudyResult(
  result: StudyResult,
  context: StudyContext,
  options: CommitOptions,
): Promise<CommitOutcome> {
  const { now, settings } = options;
  const localDayKey = toLocalDayKey(now);
  const idempotencyKey = [
    'review',
    result.vocabularyId,
    result.kind,
    result.taskId ?? result.stepIndex,
    localDayKey,
    result.attempt,
  ].join('|');

  const intervals = intervalsFromSettings(settings);
  const maxExtra = settings.maxExtraReviewsPerWord;

  return db.transaction(
    'rw',
    [db.reviewLogs, db.learningStates, db.shortTermTasks, db.dailySessions],
    async () => {
      const existing = await db.reviewLogs
        .where('idempotencyKey')
        .equals(idempotencyKey)
        .first();
      if (existing) {
        const state = await learningStateRepo.ensure(result.vocabularyId, now);
        return { duplicate: true, learningStatus: state.status };
      }

      const isShortTerm = result.kind === 'short-term';
      let nextTask: ShortTermTask | undefined;
      let status: LearningStatus;

      if (isShortTerm) {
        const base = await learningStateRepo.rollDayIfNeeded(result.vocabularyId, now);
        const performed = base.todayExtraReviewCount + 1;
        status = 'learning';

        let nextStep = result.stepIndex + 1;
        const withinSteps = nextStep < intervals.length;
        const withinCap = performed < maxExtra;

        if (result.shortTermOutcome === 'success') {
          // Success ends the day's reinforcement for this word.
          await shortTermTaskRepo.cancelPendingForVocabulary(result.vocabularyId);
          if (result.taskId) await shortTermTaskRepo.setStatus(result.taskId, 'completed', now);
          status = 'learning';
        } else {
          if (result.taskId) await shortTermTaskRepo.setStatus(result.taskId, 'completed', now);
          if (withinSteps && withinCap) {
            const created = await shortTermTaskRepo.create({
              vocabularyId: result.vocabularyId,
              stepIndex: nextStep,
              dueAt: now + Math.max(60_000, offsetMsForStep(intervals, nextStep)),
              localDayKey,
              idempotencyKey: shortTermTaskKey(result.vocabularyId, nextStep, localDayKey),
              createdAt: now,
            });
            nextTask = created.task;
          } else {
            // Cap reached: hand the word back to long-term relearning.
            status = 'relearning';
            nextStep = result.stepIndex;
          }
        }

        await learningStateRepo.patch(
          result.vocabularyId,
          {
            status,
            lastReviewedAt: now,
            todayExtraReviewCount: Math.min(performed, maxExtra),
            currentLearningStep: nextStep,
            lastReviewResult: result.finalRecall,
            ...(result.shortTermOutcome !== 'success' && !nextTask && !withinSteps
              ? { dueAt: now + 24 * 3_600_000 }
              : {}),
          },
          now,
        );
      } else {
        // New / long-term / manual: run FSRS from the final recall rating.
        const rating = result.rating ?? 'again';
        const base = await learningStateRepo.ensure(result.vocabularyId, now);
        const card = isValidSnapshot(base.fsrsState) ? base.fsrsState! : null;
        const scheduled = schedule({
          card,
          rating,
          now,
          params: settings.fsrsParameters,
        });
        status = statusFromFsrsState(scheduled.state);

        await learningStateRepo.patch(
          result.vocabularyId,
          {
            status,
            firstSeenAt: base.firstSeenAt ?? now,
            lastReviewedAt: now,
            dueAt: scheduled.dueAt,
            stability: scheduled.stability,
            difficulty: scheduled.difficulty,
            reps: base.reps + 1,
            lapses: base.lapses + (rating === 'again' ? 1 : 0),
            fsrsState: scheduled.card,
            schedulerVersion: SCHEDULER_VERSION,
            lastReviewResult: result.finalRecall,
            currentLearningStep: 0,
          },
          now,
        );

        if (result.queueShortTerm) {
          const created = await shortTermTaskRepo.create({
            vocabularyId: result.vocabularyId,
            stepIndex: 0,
            dueAt: now + Math.max(60_000, offsetMsForStep(intervals, 0)),
            localDayKey,
            idempotencyKey: shortTermTaskKey(result.vocabularyId, 0, localDayKey),
            createdAt: now,
          });
          nextTask = created.task;
        }
      }

      await reviewLogRepo.append({
        id: uuid(),
        vocabularyId: result.vocabularyId,
        sessionId: options.sessionId,
        timestamp: now,
        localDayKey,
        reviewType: result.kind === 'manual' ? 'manual' : result.kind,
        schedulerType: isShortTerm ? 'short-term' : 'long-term',
        stage: context.hintShown ? 'post-hint' : 'initial',
        initialRecall: result.initialRecall,
        hintShown: result.hintShown,
        finalRecall: result.finalRecall,
        fsrsRating: result.rating ?? undefined,
        answerRevealed: true,
        elapsedMs: options.presentedAt ? Math.max(0, now - options.presentedAt) : undefined,
        scheduledDueAt: nextTask?.dueAt,
        idempotencyKey,
      });

      // Daily counters.
      await dailySessionRepo.ensureForDay(now);
      await dailySessionRepo.increment(localDayKey, {
        newWordsSeen: result.kind === 'new' ? 1 : 0,
        longTermReviews: result.kind === 'long-term' ? 1 : 0,
        shortTermReviews: isShortTerm ? 1 : 0,
        failedAttempts: result.finalRecall === 'forget' ? 1 : 0,
        successfulRecalls: result.finalRecall === 'remember' ? 1 : 0,
      });

      return { duplicate: false, nextTask, learningStatus: status };
    },
  );
}
