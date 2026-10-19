import type { ReviewLog, DailySession, LearningState, Vocabulary } from '@/types/domain';
import { toLocalDayKey } from '@/utils/date';

export interface RecallRates {
  firstAnswerCount: number;
  firstRecallSuccessCount: number;
  firstRecallSuccessRate: number | null;
  hintDecisionCount: number;
  postHintSuccessCount: number;
  postHintSuccessRate: number | null;
}

/**
 * Metric definitions (taskbook §10.2):
 *  - firstRecallSuccessRate = direct "remember" answers / all first answers.
 *    "Seeing the answer" is never a success.
 *  - postHintSuccessRate = successes after entering the hint / hint decisions.
 */
export function computeRecallRates(logs: ReviewLog[]): RecallRates {
  let firstAnswerCount = 0;
  let firstRecallSuccessCount = 0;
  let hintDecisionCount = 0;
  let postHintSuccessCount = 0;

  for (const log of logs) {
    if (log.initialRecall !== null) {
      firstAnswerCount += 1;
      if (log.initialRecall === 'remember') firstRecallSuccessCount += 1;
    }
    if (log.hintShown) {
      hintDecisionCount += 1;
      if (log.finalRecall === 'remember') postHintSuccessCount += 1;
    }
  }

  return {
    firstAnswerCount,
    firstRecallSuccessCount,
    firstRecallSuccessRate:
      firstAnswerCount === 0 ? null : firstRecallSuccessCount / firstAnswerCount,
    hintDecisionCount,
    postHintSuccessCount,
    postHintSuccessRate:
      hintDecisionCount === 0 ? null : postHintSuccessCount / hintDecisionCount,
  };
}

export interface ReviewCounts {
  newWords: number;
  longTerm: number;
  shortTerm: number;
  manual: number;
  failures: number;
  successes: number;
}

export function countReviews(logs: ReviewLog[]): ReviewCounts {
  const counts: ReviewCounts = {
    newWords: 0,
    longTerm: 0,
    shortTerm: 0,
    manual: 0,
    failures: 0,
    successes: 0,
  };
  for (const log of logs) {
    if (log.reviewType === 'new') counts.newWords += 1;
    else if (log.reviewType === 'long-term') counts.longTerm += 1;
    else if (log.reviewType === 'short-term') counts.shortTerm += 1;
    else counts.manual += 1;
    if (log.finalRecall === 'forget') counts.failures += 1;
    if (log.finalRecall === 'remember') counts.successes += 1;
  }
  return counts;
}

export interface TrendPoint {
  dayKey: string;
  newWords: number;
  longTerm: number;
  shortTerm: number;
  failures: number;
}

export function computeTrend(logs: ReviewLog[], days: number, now: number): TrendPoint[] {
  const points = new Map<string, TrendPoint>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = toLocalDayKey(now - i * 86_400_000);
    points.set(key, { dayKey: key, newWords: 0, longTerm: 0, shortTerm: 0, failures: 0 });
  }
  for (const log of logs) {
    const point = points.get(log.localDayKey);
    if (!point) continue;
    if (log.reviewType === 'new') point.newWords += 1;
    else if (log.reviewType === 'long-term') point.longTerm += 1;
    else if (log.reviewType === 'short-term') point.shortTerm += 1;
    if (log.finalRecall === 'forget') point.failures += 1;
  }
  return [...points.values()];
}

export interface DueCounts {
  dueShortTerm: number;
  dueLongTerm: number;
  overdue: number;
}

export function computeDueCounts(
  states: LearningState[],
  shortTermDue: number,
  now: number,
): DueCounts {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  let dueLongTerm = 0;
  let overdue = 0;
  for (const s of states) {
    if (s.dueAt !== undefined && s.dueAt !== null && s.dueAt <= now && s.status !== 'new' && s.status !== 'suspended') {
      dueLongTerm += 1;
      if (s.dueAt < startOfToday.getTime()) overdue += 1;
    }
  }
  const dueShortTerm = shortTermDue;
  return { dueShortTerm, dueLongTerm, overdue };
}

export interface DifficultWord {
  vocabularyId: string;
  word: string;
  lapses: number;
  firstRecallSuccessRate: number | null;
  lastFailedAt: number | null;
  totalReviews: number;
  dueAt: number | null;
}

/**
 * Rank difficult words by a single, explainable key: lapses descending, then
 * most recent failure. No composite black-box score (taskbook §10.3).
 */
export function rankDifficultWords(
  states: LearningState[],
  vocabulary: Vocabulary[],
  logs: ReviewLog[],
  limit = 50,
): DifficultWord[] {
  const vocabById = new Map(vocabulary.map((v) => [v.id, v]));
  const logsByVocab = new Map<string, ReviewLog[]>();
  for (const log of logs) {
    const list = logsByVocab.get(log.vocabularyId) ?? [];
    list.push(log);
    logsByVocab.set(log.vocabularyId, list);
  }

  return states
    .filter((s) => s.lapses > 0 && vocabById.has(s.vocabularyId))
    .map((s) => {
      const vocab = vocabById.get(s.vocabularyId)!;
      const logsForWord = logsByVocab.get(s.vocabularyId) ?? [];
      const failures = logsForWord.filter((l) => l.finalRecall === 'forget');
      const rates = computeRecallRates(logsForWord);
      return {
        vocabularyId: s.vocabularyId,
        word: vocab.word,
        lapses: s.lapses,
        firstRecallSuccessRate: rates.firstRecallSuccessRate,
        lastFailedAt: failures.length > 0 ? Math.max(...failures.map((l) => l.timestamp)) : null,
        totalReviews: logsForWord.length,
        dueAt: s.dueAt ?? null,
      };
    })
    .sort((a, b) => {
      if (b.lapses !== a.lapses) return b.lapses - a.lapses;
      return (b.lastFailedAt ?? 0) - (a.lastFailedAt ?? 0);
    })
    .slice(0, limit);
}

export interface WordSummary {
  totalReviews: number;
  longTermReviews: number;
  shortTermReviews: number;
  lapses: number;
  lastReviewedAt: number | null;
  dueAt: number | null;
  firstRecallSuccessRate: number | null;
  postHintSuccessRate: number | null;
}

export function summarizeWord(state: LearningState | undefined, logs: ReviewLog[]): WordSummary {
  const rates = computeRecallRates(logs);
  const counts = countReviews(logs);
  return {
    totalReviews: logs.length,
    longTermReviews: counts.longTerm,
    shortTermReviews: counts.shortTerm,
    lapses: state?.lapses ?? counts.failures,
    lastReviewedAt: state?.lastReviewedAt ?? null,
    dueAt: state?.dueAt ?? null,
    firstRecallSuccessRate: rates.firstRecallSuccessRate,
    postHintSuccessRate: rates.postHintSuccessRate,
  };
}

export function summarizeDay(session: DailySession | undefined): {
  newWords: number;
  longTerm: number;
  shortTerm: number;
  failures: number;
  successRate: number | null;
  activeSeconds: number;
} {
  if (!session) {
    return { newWords: 0, longTerm: 0, shortTerm: 0, failures: 0, successRate: null, activeSeconds: 0 };
  }
  const attempts = session.successfulRecalls + session.failedAttempts;
  return {
    newWords: session.newWordsSeen,
    longTerm: session.longTermReviews,
    shortTerm: session.shortTermReviews,
    failures: session.failedAttempts,
    successRate: attempts === 0 ? null : session.successfulRecalls / attempts,
    activeSeconds: session.activeSeconds,
  };
}
