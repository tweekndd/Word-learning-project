import { Rating } from 'ts-fsrs';
import type { FsrsRating } from '@/types/domain';

export interface RecallOutcome {
  initialRecall: 'remember' | 'forget';
  hintShown: boolean;
  finalRecall: 'remember' | 'forget';
  /** Set only when the user explicitly chose "非常轻松". */
  explicitEasy?: boolean;
}

/**
 * Single source of truth for mapping a user's recall result to an FSRS rating
 * (taskbook §4.2, §4.3). The answer-reveal / confirm-read step is deliberately
 * NOT an input here — it can never produce a rating.
 */
export function mapRecallToRating(outcome: RecallOutcome): FsrsRating {
  const { hintShown, finalRecall, explicitEasy } = outcome;

  if (finalRecall === 'forget') return 'again';
  if (explicitEasy) return 'easy';
  if (hintShown) return 'hard';
  return 'good';
}

export function toTsFsrsRating(rating: FsrsRating): Rating {
  switch (rating) {
    case 'again':
      return Rating.Again;
    case 'hard':
      return Rating.Hard;
    case 'good':
      return Rating.Good;
    case 'easy':
      return Rating.Easy;
  }
}

export function fromTsFsrsRating(rating: Rating): FsrsRating {
  switch (rating) {
    case Rating.Again:
      return 'again';
    case Rating.Hard:
      return 'hard';
    case Rating.Good:
      return 'good';
    case Rating.Easy:
      return 'easy';
    default:
      throw new Error(`不支持的 FSRS 评分: ${rating}`);
  }
}

export const ALL_RATINGS: FsrsRating[] = ['again', 'hard', 'good', 'easy'];
