import { db } from '../database';
import type { DailySession } from '@/types/domain';
import { uuid } from '@/utils/id';
import { toLocalDayKey } from '@/utils/date';

export const dailySessionRepo = {
  async getForDay(localDayKey: string): Promise<DailySession | undefined> {
    return db.dailySessions.where('localDayKey').equals(localDayKey).first();
  },

  async ensureForDay(now = Date.now()): Promise<DailySession> {
    const key = toLocalDayKey(now);
    const existing = await this.getForDay(key);
    if (existing) return existing;
    const session: DailySession = {
      id: uuid(),
      localDayKey: key,
      startedAt: now,
      newWordsSeen: 0,
      longTermReviews: 0,
      shortTermReviews: 0,
      failedAttempts: 0,
      successfulRecalls: 0,
      activeSeconds: 0,
    };
    try {
      await db.dailySessions.add(session);
      return session;
    } catch {
      const winner = await this.getForDay(key);
      if (winner) return winner;
      throw new Error('无法创建每日会话');
    }
  },

  async patch(localDayKey: string, patch: Partial<DailySession>): Promise<void> {
    const existing = await this.getForDay(localDayKey);
    if (!existing) return;
    await db.dailySessions.put({ ...existing, ...patch, id: existing.id, localDayKey });
  },

  async increment(
    localDayKey: string,
    delta: Partial<
      Pick<
        DailySession,
        | 'newWordsSeen'
        | 'longTermReviews'
        | 'shortTermReviews'
        | 'failedAttempts'
        | 'successfulRecalls'
        | 'activeSeconds'
      >
    >,
  ): Promise<void> {
    await db.dailySessions
      .where('localDayKey')
      .equals(localDayKey)
      .modify((s) => {
        s.newWordsSeen += delta.newWordsSeen ?? 0;
        s.longTermReviews += delta.longTermReviews ?? 0;
        s.shortTermReviews += delta.shortTermReviews ?? 0;
        s.failedAttempts += delta.failedAttempts ?? 0;
        s.successfulRecalls += delta.successfulRecalls ?? 0;
        s.activeSeconds += delta.activeSeconds ?? 0;
      });
  },

  async recent(days: number, now = Date.now()): Promise<DailySession[]> {
    const result: DailySession[] = [];
    for (let i = 0; i < days; i += 1) {
      const key = toLocalDayKey(now - i * 86_400_000);
      const s = await this.getForDay(key);
      if (s) result.push(s);
    }
    return result.reverse();
  },

  async all(): Promise<DailySession[]> {
    return db.dailySessions.orderBy('startedAt').toArray();
  },
};
