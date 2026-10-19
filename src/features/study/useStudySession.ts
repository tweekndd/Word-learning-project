import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/app/AppProvider';
import { useNotifications } from '@/app/Notifications';
import { vocabularyRepo } from '@/db/repositories';
import { createDictionaryService, type DictionaryResult } from '@/services/dictionary';
import type { DictionaryEntryDto, DictionaryError } from '@/types/dictionary';
import type { Vocabulary } from '@/types/domain';
import { uuid } from '@/utils/id';
import { toLocalDayKey } from '@/utils/date';
import { buildDailyQueue } from '@/features/review/queue';
import {
  createInitialContext,
  initialStateForKind,
  isTerminal,
  reduce,
  type Recall,
  type StudyContext,
  type StudyEffect,
  type StudyEvent,
  type StudyState,
} from './machine';
import { commitStudyResult } from './studyService';
import { studySessionStore, type QueueItemRef } from './sessionStorage';
import { firstExampleSentence } from '@/services/dictionary';

export interface StudyCardData {
  ref: QueueItemRef;
  vocabulary: Vocabulary;
  entry?: DictionaryEntryDto;
  hint?: string;
  dictError?: DictionaryError;
  dictLoading: boolean;
  sourceLabel: string;
}

export interface StudySessionApi {
  loading: boolean;
  busy: boolean;
  state: StudyState;
  context: StudyContext | null;
  card: StudyCardData | null;
  hasHint: boolean;
  queueSize: number;
  queueIndex: number;
  remaining: number;
  allDone: boolean;
  error: string | null;
  answer: Recall | null;
  dispatch: (event: StudyEvent) => void;
  next: () => void;
  reload: () => void;
}

export function useStudySession(enabled = true): StudySessionApi {
  const { settings, ready } = useApp();
  const { notify } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItemRef[]>([]);
  const [cursor, setCursor] = useState(0);
  const [state, setState] = useState<StudyState>('WORD_FRONT');
  const [context, setContext] = useState<StudyContext | null>(null);
  const [card, setCard] = useState<StudyCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const sessionIdRef = useRef<string>(uuid());
  const presentedAtRef = useRef<number>(Date.now());

  const dictionary = useMemo(
    () =>
      createDictionaryService(settings, {
        dictionaryCode: settings.dictionaryProviderConfig.dictionaryCode,
      }),
    [settings],
  );

  const persist = useCallback(
    async (nextState: StudyState, nextContext: StudyContext, nextQueue: QueueItemRef[], nextCursor: number) => {
      await studySessionStore.save({
        state: nextState,
        context: nextContext,
        queue: nextQueue,
        cursor: nextCursor,
        updatedAt: Date.now(),
      });
    },
    [],
  );

  // Initialise: restore an interrupted session or build a fresh queue.
  useEffect(() => {
    if (!ready || !enabled || initialized) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const saved = await studySessionStore.load();
        if (saved && !isTerminal(saved.state)) {
          if (!cancelled) {
            setQueue(saved.queue);
            setCursor(saved.cursor);
            setState(saved.state);
            setContext(saved.context);
            setInitialized(true);
          }
          return;
        }
        const queueResult = await buildDailyQueue({ now: Date.now(), settings });
        if (cancelled) return;
        setQueue(queueResult.all);
        setCursor(0);
        setInitialized(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载学习队列失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, enabled, initialized, settings, reloadToken]);

  // Load the current card (vocabulary + dictionary + hint).
  useEffect(() => {
    if (!initialized) return;
    const ref = queue[cursor];
    if (!ref) {
      setCard(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setCard((prev) =>
        prev && prev.ref.vocabularyId === ref.vocabularyId ? prev : null,
      );
      const vocabulary = await vocabularyRepo.getById(ref.vocabularyId);
      if (!vocabulary || cancelled) return;

      const base: StudyCardData = {
        ref,
        vocabulary,
        dictLoading: true,
        sourceLabel: '',
      };
      if (!cancelled) setCard(base);

      const result = await dictionary.getEntry(vocabulary).catch(
        (err: unknown): DictionaryResult => ({
          found: false,
          fromCache: false,
          error: {
            kind: 'network',
            message: err instanceof Error ? err.message : '词典错误',
            retryable: true,
          },
        }),
      );
      if (cancelled) return;

      const hint =
        result.entry?.examples.find((e) => e.english.trim().length > 0)?.english ??
        (result.entry?.rawHtml ? firstExampleSentence(result.entry.rawHtml) : undefined);

      const sourceLabel = result.entry
        ? result.entry.source === 'mock'
          ? 'MOCK 数据'
          : result.entry.source === 'collins'
            ? 'Collins'
            : result.entry.source
        : '';

      setCard({
        ref,
        vocabulary,
        entry: result.entry,
        hint,
        dictError: result.error,
        dictLoading: false,
        sourceLabel,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [initialized, queue, cursor, dictionary]);

  // When the current card changes and no context is active for it, start its
  // flow. A restored session already carries a context for the same word, so it
  // is preserved across the two-stage card load (base → enriched).
  useEffect(() => {
    if (!initialized || !card) return;
    if (context && context.vocabularyId === card.vocabulary.id) return;
    const kind = card.ref.kind;
    const ctx = createInitialContext({
      kind,
      vocabularyId: card.vocabulary.id,
      word: card.vocabulary.word,
      hasHint: !!card.hint,
      stepIndex: card.ref.stepIndex,
      taskId: card.ref.taskId,
      now: Date.now(),
    });
    setContext(ctx);
    setState(initialStateForKind(kind));
    setError(null);
    presentedAtRef.current = Date.now();
    void persist(initialStateForKind(kind), ctx, queue, cursor);
  }, [initialized, card, context, persist, queue, cursor]);

  const executeEffects = useCallback(
    async (effects: StudyEffect[], ctx: StudyContext) => {
      for (const effect of effects) {
        if (effect.type === 'PERSIST_RESULT') {
          try {
            const outcome = await commitStudyResult(effect.result, ctx, {
              now: Date.now(),
              settings,
              sessionId: sessionIdRef.current,
              presentedAt: presentedAtRef.current,
            });
            if (outcome.duplicate) {
              // Already written; nothing else to do.
            }
          } catch (err) {
            notify(
              'error',
              '保存学习记录失败',
              err instanceof Error ? err.message : '未知错误，请重试。',
            );
            throw err;
          }
        }
      }
    },
    [settings, notify],
  );

  const dispatch = useCallback(
    (event: StudyEvent) => {
      if (!context || busy) return;
      const transition = reduce(state, context, event, Date.now());
      if (!transition.changed) return;

      setState(transition.state);
      setContext(transition.context);
      void persist(transition.state, transition.context, queue, cursor);

      if (transition.effects.length > 0) {
        setBusy(true);
        executeEffects(transition.effects, transition.context)
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }
    },
    [context, busy, state, persist, queue, cursor, executeEffects],
  );

  const next = useCallback(() => {
    setCursor((c) => {
      const nextCursor = c + 1;
      void persist(state, context ?? ({} as StudyContext), queue, nextCursor);
      return nextCursor;
    });
    setContext(null);
    setState('WORD_FRONT');
  }, [persist, state, context, queue]);

  const reload = useCallback(() => {
    setInitialized(false);
    setCursor(0);
    setQueue([]);
    setContext(null);
    setState('WORD_FRONT');
    setLoading(true);
    setReloadToken((t) => t + 1);
  }, []);

  // Applying a new word order rebuilds today's queue with the new ordering.
  const wordOrderRef = useRef(settings.wordOrder);
  useEffect(() => {
    if (!initialized) {
      wordOrderRef.current = settings.wordOrder;
      return;
    }
    if (wordOrderRef.current !== settings.wordOrder) {
      wordOrderRef.current = settings.wordOrder;
      void studySessionStore.clear();
      reload();
    }
  }, [settings.wordOrder, initialized, reload]);

  const remaining = Math.max(0, queue.length - cursor);
  const allDone = initialized && queue.length > 0 && cursor >= queue.length;
  const answer: Recall | null = context?.finalRecall ?? null;

  return {
    loading: loading || !initialized,
    busy,
    state,
    context,
    card,
    hasHint: card?.hint !== undefined,
    queueSize: queue.length,
    queueIndex: cursor,
    remaining,
    allDone,
    error,
    answer,
    dispatch,
    next,
    reload,
  };
}

export { toLocalDayKey };
