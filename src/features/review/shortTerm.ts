import type { Settings } from '@/types/domain';
import type { ShortTermTask } from '@/types/domain';
import { MINUTE_MS, toLocalDayKey } from '@/utils/date';

export interface IntervalValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Validate configured reinforcement intervals: every value must be a positive
 * finite number of minutes and strictly increasing (taskbook §3.4).
 */
export function validateIntervals(minutes: number[]): IntervalValidation {
  if (!Array.isArray(minutes) || minutes.length === 0) {
    return { ok: false, reason: '至少需要一个强化间隔。' };
  }
  let previous = 0;
  for (const value of minutes) {
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, reason: `间隔必须是正数：${value}` };
    }
    if (value <= previous) {
      return { ok: false, reason: '间隔必须严格递增且不重复。' };
    }
    previous = value;
  }
  return { ok: true };
}

/** Clamp/normalise intervals, falling back to the defaults when invalid. */
export function normalizeIntervals(minutes: number[], fallback = [10, 30, 120, 240]): number[] {
  if (!validateIntervals(minutes).ok) return [...fallback];
  return [...minutes];
}

export function offsetMsForStep(minutes: number[], stepIndex: number): number {
  const safe = normalizeIntervals(minutes);
  const idx = Math.min(Math.max(stepIndex, 0), safe.length - 1);
  return (safe[idx] as number) * MINUTE_MS;
}

/**
 * The number of extra reinforcement reviews allowed today, given the max and
 * the count already performed. First-try and post-hint retry are excluded by
 * design (they increment `todayExtraReviewCount` only on reinforcement).
 */
export function remainingExtraReviews(count: number, max: number): number {
  return Math.max(0, max - count);
}

export function canEnqueueExtra(count: number, max: number): boolean {
  return count < max;
}

export function shortTermTaskKey(
  vocabularyId: string,
  stepIndex: number,
  localDayKey: string,
): string {
  return `st|${vocabularyId}|${stepIndex}|${localDayKey}`;
}

/**
 * Cross-day handling (taskbook §3.4 rule 5): tasks whose due date fell on a
 * previous day are NOT all fired at once. They are re-anchored relative to
 * `now` starting at the first interval and spaced by the configured steps, so
 * the user gets a gentle catch-up rather than a burst.
 */
export function rescheduleCrossDayTasks(
  tasks: ShortTermTask[],
  intervalsMinutes: number[],
  now: number,
): Array<{ task: ShortTermTask; dueAt: number }> {
  const today = toLocalDayKey(now);
  const overdueByDay = tasks
    .filter((t) => t.status === 'pending' && t.localDayKey !== today)
    .sort((a, b) => a.dueAt - b.dueAt);

  return overdueByDay.map((task, order) => {
    const stepOffset = offsetMsForStep(intervalsMinutes, order);
    return { task, dueAt: now + Math.max(MINUTE_MS, stepOffset) };
  });
}

/**
 * Clock-jump safety: never return a due time in the past relative to `now`
 * when scheduling forwards; this prevents negative intervals.
 */
export function safeForwardDue(from: number, offsetMs: number): number {
  return from + Math.max(0, offsetMs);
}

export function intervalsFromSettings(settings: Settings): number[] {
  return normalizeIntervals(settings.shortTermIntervals);
}
