import { db } from '../database';
import type { ShortTermTask, ShortTermTaskStatus } from '@/types/domain';
import { uuid } from '@/utils/id';

export interface CreateShortTermTaskInput {
  vocabularyId: string;
  stepIndex: number;
  dueAt: number;
  localDayKey: string;
  /** Stable per vocabulary+step+day so duplicate enqueue is impossible. */
  idempotencyKey: string;
  createdAt?: number;
}

export const shortTermTaskRepo = {
  async get(id: string): Promise<ShortTermTask | undefined> {
    return db.shortTermTasks.get(id);
  },

  /**
   * Create a task unless an identical one already exists. Returns the task and
   * whether it was newly created (taskbook §3.4 rule 6, §7.3).
   */
  async create(input: CreateShortTermTaskInput): Promise<{ task: ShortTermTask; created: boolean }> {
    const existingKey = await db.shortTermTasks
      .where('idempotencyKey')
      .equals(input.idempotencyKey)
      .first();
    if (existingKey && existingKey.status !== 'cancelled') {
      return { task: existingKey, created: false };
    }

    const activeSameStep = await db.shortTermTasks
      .where('[vocabularyId+status]')
      .equals([input.vocabularyId, 'pending'])
      .filter((t) => t.stepIndex === input.stepIndex)
      .first();
    if (activeSameStep) {
      return { task: activeSameStep, created: false };
    }

    const task: ShortTermTask = {
      id: uuid(),
      vocabularyId: input.vocabularyId,
      stepIndex: input.stepIndex,
      dueAt: input.dueAt,
      status: 'pending',
      createdAt: input.createdAt ?? Date.now(),
      attemptCount: 0,
      localDayKey: input.localDayKey,
      idempotencyKey: input.idempotencyKey,
    };
    try {
      await db.shortTermTasks.add(task);
      return { task, created: true };
    } catch (err) {
      const winner = await db.shortTermTasks
        .where('idempotencyKey')
        .equals(input.idempotencyKey)
        .first();
      if (winner) return { task: winner, created: false };
      throw err;
    }
  },

  async pending(): Promise<ShortTermTask[]> {
    return db.shortTermTasks.where('status').equals('pending').toArray();
  },

  async pendingDue(now: number): Promise<ShortTermTask[]> {
    return db.shortTermTasks
      .where('status')
      .equals('pending')
      .filter((t) => t.dueAt <= now)
      .toArray();
  },

  async pendingForVocabulary(vocabularyId: string): Promise<ShortTermTask[]> {
    return db.shortTermTasks
      .where('[vocabularyId+status]')
      .equals([vocabularyId, 'pending'])
      .toArray();
  },

  async pendingCount(): Promise<number> {
    return db.shortTermTasks.where('status').equals('pending').count();
  },

  async setStatus(id: string, status: ShortTermTaskStatus, now = Date.now()): Promise<void> {
    const patch: Partial<ShortTermTask> = { status };
    if (status === 'completed') patch.completedAt = now;
    await db.shortTermTasks.update(id, patch);
  },

  async incrementAttempt(id: string): Promise<void> {
    const task = await db.shortTermTasks.get(id);
    if (!task) return;
    await db.shortTermTasks.update(id, { attemptCount: task.attemptCount + 1 });
  },

  async cancelPendingForVocabulary(vocabularyId: string): Promise<number> {
    const pending = await this.pendingForVocabulary(vocabularyId);
    await Promise.all(pending.map((t) => this.setStatus(t.id, 'cancelled')));
    return pending.length;
  },

  async cancelAllPending(): Promise<number> {
    const pending = await this.pending();
    await Promise.all(pending.map((t) => this.setStatus(t.id, 'cancelled')));
    return pending.length;
  },

  async nextPendingForVocabulary(vocabularyId: string): Promise<ShortTermTask | undefined> {
    const pending = await this.pendingForVocabulary(vocabularyId);
    return pending.sort((a, b) => a.dueAt - b.dueAt)[0];
  },
};
