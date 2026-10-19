import { db } from '@/db/database';
import { settingsRepo, shortTermTaskRepo } from '@/db/repositories';
import { META_KEYS } from '@/db/defaults';
import { isClockJumpBackwards, toLocalDayKey } from '@/utils/date';
import { intervalsFromSettings, rescheduleCrossDayTasks } from '@/features/review/shortTerm';

export interface ReconcileReport {
  rescheduled: number;
  clockJumpDetected: boolean;
}

/**
 * Startup reconciliation (taskbook §3.4 rule 5, §4.5, §12.2.8-9):
 *  - detect a large backward clock jump and avoid generating negative
 *    intervals or a burst of tasks,
 *  - re-anchor cross-day overdue reinforcement tasks instead of firing them all
 *    at once.
 */
export async function reconcileOnStartup(now: number): Promise<ReconcileReport> {
  const settings = await settingsRepo.get(now);
  const previousRow = await db.meta.get(META_KEYS.lastActiveAt);
  const previous = typeof previousRow?.value === 'number' ? previousRow.value : 0;
  const clockJumpDetected = previous > 0 && isClockJumpBackwards(previous, now);

  let rescheduled = 0;
  if (!clockJumpDetected) {
    const pending = await shortTermTaskRepo.pending();
    const overdue = rescheduleCrossDayTasks(
      pending,
      intervalsFromSettings(settings),
      now,
    );
    for (const { task, dueAt } of overdue) {
      await shortTermTaskRepo.setStatus(task.id, 'pending');
      await db.shortTermTasks.update(task.id, {
        dueAt: Math.max(now + 60_000, dueAt),
        localDayKey: toLocalDayKey(now),
      });
      rescheduled += 1;
    }
  }

  await db.meta.put({ key: META_KEYS.lastActiveAt, value: now });
  if (clockJumpDetected) {
    await db.meta.put({
      key: 'lastClockJump',
      value: { detectedAt: now, previous },
    });
  }

  return { rescheduled, clockJumpDetected };
}
