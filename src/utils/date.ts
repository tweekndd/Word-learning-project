import type { TimezoneMode } from '@/types/domain';

/** Local calendar day key `YYYY-MM-DD` for a timestamp. */
export function toLocalDayKey(timestamp: number, _mode: TimezoneMode = 'device'): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a `YYYY-MM-DD` key back to local midnight epoch ms. */
export function dayKeyToLocalMidnight(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
}

export function isSameLocalDay(a: number, b: number): boolean {
  return toLocalDayKey(a) === toLocalDayKey(b);
}

export function endOfLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function startOfLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(timestamp: number, days: number): number {
  const d = new Date(timestamp);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * Detects an implausible backward clock jump (e.g. device time changed). The
 * scheduler uses this to avoid generating negative intervals or a flood of
 * overdue tasks.
 */
export function isClockJumpBackwards(previous: number, current: number): boolean {
  return current < previous && previous - current > 2 * HOUR_MS;
}

export function diffDays(from: number, to: number): number {
  return Math.round((to - from) / DAY_MS);
}
