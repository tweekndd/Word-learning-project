import { describe, it, expect } from 'vitest';
import { State } from 'ts-fsrs';
import {
  createNewCardSnapshot,
  isValidSnapshot,
  sanitizeParams,
  schedule,
} from '@/services/scheduler/fsrs';

const NOW = new Date('2026-03-01T08:00:00Z').getTime();

describe('FSRS adapter (§12.3)', () => {
  it('is deterministic for the same card, rating and reference time', () => {
    const card = createNewCardSnapshot(NOW);
    const a = schedule({ card, rating: 'good', now: NOW });
    const b = schedule({ card, rating: 'good', now: NOW });
    expect(a.dueAt).toBe(b.dueAt);
    expect(a.stability).toBe(b.stability);
    expect(a.difficulty).toBe(b.difficulty);
    expect(a.state).toBe(b.state);
  });

  it('moves a new Good card out of the New state with a future due date', () => {
    const result = schedule({ card: null, rating: 'good', now: NOW });
    expect(result.state).not.toBe(State.New);
    expect(result.dueAt).toBeGreaterThan(NOW);
    expect(result.stability).toBeGreaterThan(0);
  });

  it('Again keeps the card in learning/relearning and schedules soon', () => {
    const result = schedule({ card: null, rating: 'again', now: NOW });
    expect([State.Learning, State.Relearning]).toContain(result.state);
    expect(result.dueAt).toBeGreaterThanOrEqual(NOW);
  });

  it('Easy schedules further out than Hard for the same card', () => {
    const card = createNewCardSnapshot(NOW);
    const hard = schedule({ card, rating: 'hard', now: NOW });
    const easy = schedule({ card, rating: 'easy', now: NOW });
    expect(easy.scheduledDays).toBeGreaterThanOrEqual(hard.scheduledDays);
  });

  it('sanitizes unsafe parameters', () => {
    expect(sanitizeParams({ requestRetention: 5, maximumInterval: -1, enableFuzz: true })).toEqual({
      requestRetention: 0.99,
      maximumInterval: 1,
      enableFuzz: true,
    });
    expect(sanitizeParams({ requestRetention: Number.NaN, maximumInterval: Number.NaN, enableFuzz: false }).requestRetention).toBe(0.9);
  });

  it('validates snapshots and rejects invalid stability/difficulty (§12.3.6)', () => {
    const valid = createNewCardSnapshot(NOW);
    expect(isValidSnapshot(valid)).toBe(true);
    expect(isValidSnapshot({ ...valid, stability: -1 })).toBe(false);
    expect(isValidSnapshot({ ...valid, difficulty: 99 })).toBe(false);
    expect(isValidSnapshot({ ...valid, stability: Number.NaN })).toBe(false);
    expect(isValidSnapshot(null)).toBe(false);
    expect(isValidSnapshot(undefined)).toBe(false);
  });
});
