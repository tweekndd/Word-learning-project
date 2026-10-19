import { describe, it, expect } from 'vitest';
import {
  canEnqueueExtra,
  normalizeIntervals,
  offsetMsForStep,
  remainingExtraReviews,
  rescheduleCrossDayTasks,
  safeForwardDue,
  shortTermTaskKey,
  validateIntervals,
} from '@/features/review/shortTerm';
import type { ShortTermTask } from '@/types/domain';

describe('short-term queue (§12.2)', () => {
  it('validates positive, increasing intervals', () => {
    expect(validateIntervals([10, 30, 120]).ok).toBe(true);
    expect(validateIntervals([]).ok).toBe(false);
    expect(validateIntervals([0, 30]).ok).toBe(false);
    expect(validateIntervals([30, 10]).ok).toBe(false);
    expect(validateIntervals([10, 10]).ok).toBe(false);
    expect(validateIntervals([-5]).ok).toBe(false);
    expect(validateIntervals([Number.NaN]).ok).toBe(false);
  });

  it('falls back to defaults for invalid intervals', () => {
    expect(normalizeIntervals([0, -1])).toEqual([10, 30, 120, 240]);
  });

  it('computes the step offset in milliseconds and clamps the index', () => {
    expect(offsetMsForStep([10, 30], 0)).toBe(10 * 60_000);
    expect(offsetMsForStep([10, 30], 1)).toBe(30 * 60_000);
    expect(offsetMsForStep([10, 30], 9)).toBe(30 * 60_000);
  });

  it('caps extra reviews at the configured maximum', () => {
    expect(remainingExtraReviews(0, 5)).toBe(5);
    expect(remainingExtraReviews(5, 5)).toBe(0);
    expect(canEnqueueExtra(4, 5)).toBe(true);
    expect(canEnqueueExtra(5, 5)).toBe(false);
  });

  it('builds stable idempotency keys', () => {
    expect(shortTermTaskKey('v1', 2, '2026-01-01')).toBe('st|v1|2|2026-01-01');
  });

  it('reschedules cross-day overdue tasks spread over time, not all at once', () => {
    const now = new Date('2026-02-01T09:00:00').getTime();
    const tasks: ShortTermTask[] = [1, 2, 3].map((i) => ({
      id: `t${i}`,
      vocabularyId: `v${i}`,
      stepIndex: 0,
      dueAt: new Date('2026-01-31T09:00:00').getTime(),
      status: 'pending',
      createdAt: 0,
      attemptCount: 0,
      localDayKey: '2026-01-31',
      idempotencyKey: `k${i}`,
    }));
    const result = rescheduleCrossDayTasks(tasks, [10, 30, 120], now);
    expect(result).toHaveLength(3);
    const dueTimes = result.map((r) => r.dueAt);
    expect(dueTimes[0]).toBe(now + 10 * 60_000);
    expect(dueTimes[1]).toBe(now + 30 * 60_000);
    expect(dueTimes[2]).toBe(now + 120 * 60_000);
    // strictly increasing → no burst
    expect(dueTimes[0]! < dueTimes[1]!).toBe(true);
    expect(dueTimes[1]! < dueTimes[2]!).toBe(true);
  });

  it('never schedules in the past (no negative interval, §12.2.9)', () => {
    const now = 1_000_000;
    expect(safeForwardDue(now, -500)).toBe(now);
    expect(safeForwardDue(now, 500)).toBe(now + 500);
  });
});
