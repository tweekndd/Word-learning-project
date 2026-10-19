import { db } from '@/db/database';
import type { StudyContext, StudyState } from './machine';

export interface QueueItemRef {
  vocabularyId: string;
  kind: 'new' | 'long-term' | 'short-term';
  stepIndex: number;
  taskId?: string;
}

export interface PersistedStudySession {
  state: StudyState;
  context: StudyContext;
  queue: QueueItemRef[];
  cursor: number;
  updatedAt: number;
}

const KEY = 'activeStudySession';
const LS_KEY = 'word-pocket:activeStudySession';

/**
 * The active session is written to localStorage synchronously AND to the DB.
 * localStorage is a fast, synchronous mirror so a page refresh (or crash)
 * immediately after an answer cannot lose the restored screen state
 * (taskbook §3.3 "答案揭示规则", §12.1.5). The DB copy is the durable record.
 */
export const studySessionStore = {
  async load(): Promise<PersistedStudySession | undefined> {
    const fromLs = readLocal();
    if (fromLs) return fromLs;
    try {
      const row = await db.meta.get(KEY);
      return row?.value as PersistedStudySession | undefined;
    } catch {
      return undefined;
    }
  },

  async save(session: PersistedStudySession): Promise<void> {
    const payload: PersistedStudySession = { ...session, updatedAt: Date.now() };
    writeLocal(payload);
    try {
      await db.meta.put({ key: KEY, value: payload });
    } catch {
      // The localStorage mirror already protects the session.
    }
  },

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    await db.meta.delete(KEY);
  },
};

function writeLocal(session: PersistedStudySession): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(session));
  } catch {
    /* storage may be unavailable/private mode */
  }
}

function readLocal(): PersistedStudySession | undefined {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedStudySession;
  } catch {
    return undefined;
  }
}
