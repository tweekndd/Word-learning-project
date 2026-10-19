import { describe, it, expect } from 'vitest';
import {
  computeRecallRates,
  computeTrend,
  countReviews,
  rankDifficultWords,
  summarizeWord,
} from '@/services/stats/stats';
import type { LearningState, ReviewLog, Vocabulary } from '@/types/domain';

function log(partial: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: Math.random().toString(36),
    vocabularyId: 'v1',
    timestamp: 0,
    localDayKey: '2026-01-01',
    reviewType: 'new',
    schedulerType: 'long-term',
    stage: 'initial',
    initialRecall: 'remember',
    hintShown: false,
    finalRecall: 'remember',
    answerRevealed: true,
    idempotencyKey: Math.random().toString(36),
    ...partial,
  };
}

describe('statistics definitions (§10.2, §12.2.7)', () => {
  it('never counts "seeing the answer" as a successful recall', () => {
    const logs = [
      log({ initialRecall: 'remember', finalRecall: 'remember', hintShown: false }),
      log({ initialRecall: 'forget', hintShown: true, finalRecall: 'remember' }),
      log({ initialRecall: 'forget', hintShown: true, finalRecall: 'forget' }),
    ];
    const rates = computeRecallRates(logs);
    expect(rates.firstAnswerCount).toBe(3);
    expect(rates.firstRecallSuccessCount).toBe(1);
    expect(rates.firstRecallSuccessRate).toBeCloseTo(1 / 3);
    expect(rates.hintDecisionCount).toBe(2);
    expect(rates.postHintSuccessCount).toBe(1);
    expect(rates.postHintSuccessRate).toBeCloseTo(0.5);
  });

  it('separates short-term and long-term review counts', () => {
    const logs = [
      log({ reviewType: 'new' }),
      log({ reviewType: 'long-term' }),
      log({ reviewType: 'short-term' }),
      log({ reviewType: 'short-term' }),
    ];
    const counts = countReviews(logs);
    expect(counts.newWords).toBe(1);
    expect(counts.longTerm).toBe(1);
    expect(counts.shortTerm).toBe(2);
  });

  it('computes a 7-day trend keyed by local day', () => {
    const now = new Date('2026-01-07T12:00:00').getTime();
    const logs = [
      log({ localDayKey: '2026-01-07', reviewType: 'new' }),
      log({ localDayKey: '2026-01-06', reviewType: 'long-term', finalRecall: 'forget' }),
    ];
    const trend = computeTrend(logs, 7, now);
    expect(trend).toHaveLength(7);
    expect(trend.at(-1)?.dayKey).toBe('2026-01-07');
    expect(trend.at(-1)?.newWords).toBe(1);
    expect(trend.at(-2)?.longTerm).toBe(1);
    expect(trend.at(-2)?.failures).toBe(1);
  });

  it('ranks difficult words by lapses then recency', () => {
    const states: LearningState[] = [
      { vocabularyId: 'a', status: 'review', reps: 3, lapses: 2, currentLearningStep: 0, todayExtraReviewCount: 0, localDayKey: '2026-01-01', schedulerVersion: 'x', updatedAt: 0 },
      { vocabularyId: 'b', status: 'review', reps: 5, lapses: 4, currentLearningStep: 0, todayExtraReviewCount: 0, localDayKey: '2026-01-01', schedulerVersion: 'x', updatedAt: 0 },
    ];
    const vocab: Vocabulary[] = ['a', 'b'].map((id) => ({
      id,
      word: id,
      normalizedWord: id,
      tags: [],
      createdAt: 0,
      updatedAt: 0,
    }));
    const logs = [log({ vocabularyId: 'a', finalRecall: 'forget', timestamp: 100 })];
    const ranked = rankDifficultWords(states, vocab, logs);
    expect(ranked.map((r) => r.vocabularyId)).toEqual(['b', 'a']);
  });

  it('summarizes a single word', () => {
    const summary = summarizeWord(undefined, [
      log(),
      log({ hintShown: true, initialRecall: 'forget', finalRecall: 'forget', reviewType: 'short-term' }),
    ]);
    expect(summary.totalReviews).toBe(2);
    expect(summary.shortTermReviews).toBe(1);
    expect(summary.lapses).toBe(1);
  });
});
