import { describe, it, expect } from 'vitest';
import { Rating } from 'ts-fsrs';
import {
  ALL_RATINGS,
  fromTsFsrsRating,
  mapRecallToRating,
  toTsFsrsRating,
} from '@/services/scheduler/rating';

describe('rating mapping (§12.3.1)', () => {
  it('direct success → Good', () => {
    expect(
      mapRecallToRating({ initialRecall: 'remember', hintShown: false, finalRecall: 'remember' }),
    ).toBe('good');
  });

  it('after-hint success → Hard', () => {
    expect(
      mapRecallToRating({ initialRecall: 'forget', hintShown: true, finalRecall: 'remember' }),
    ).toBe('hard');
  });

  it('failure → Again (with or without hint)', () => {
    expect(
      mapRecallToRating({ initialRecall: 'remember', hintShown: false, finalRecall: 'forget' }),
    ).toBe('again');
    expect(
      mapRecallToRating({ initialRecall: 'forget', hintShown: true, finalRecall: 'forget' }),
    ).toBe('again');
  });

  it('explicit easy → Easy only when successful', () => {
    expect(
      mapRecallToRating({
        initialRecall: 'remember',
        hintShown: false,
        finalRecall: 'remember',
        explicitEasy: true,
      }),
    ).toBe('easy');
    expect(
      mapRecallToRating({
        initialRecall: 'remember',
        hintShown: false,
        finalRecall: 'forget',
        explicitEasy: true,
      }),
    ).toBe('again');
  });

  it('round-trips through the ts-fsrs enum', () => {
    expect(toTsFsrsRating('again')).toBe(Rating.Again);
    expect(toTsFsrsRating('easy')).toBe(Rating.Easy);
    for (const rating of ALL_RATINGS) {
      expect(fromTsFsrsRating(toTsFsrsRating(rating))).toBe(rating);
    }
  });
});
