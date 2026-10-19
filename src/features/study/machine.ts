import type { FsrsRating } from '@/types/domain';
import { mapRecallToRating } from '@/services/scheduler/rating';

export const STUDY_STATES = [
  'WORD_FRONT',
  'HINT_SENTENCE',
  'ANSWER_REVEAL',
  'SHORT_TERM_QUEUED',
  'SHORT_TERM_REVIEW',
  'LONG_TERM_REVIEW',
  'COMPLETED_TODAY',
  'SUSPENDED',
  'ERROR_RECOVERY',
] as const;

export type StudyState = (typeof STUDY_STATES)[number];

export const FRONT_STATES: StudyState[] = ['WORD_FRONT', 'SHORT_TERM_REVIEW', 'LONG_TERM_REVIEW'];

export type SessionKind = 'new' | 'long-term' | 'short-term' | 'manual';

export type Recall = 'remember' | 'forget';

export interface StudyContext {
  kind: SessionKind;
  vocabularyId: string;
  word: string;
  /** Whether a hint sentence is available (a dictionary example). */
  hasHint: boolean;
  /** Short-term reinforcement step index (0-based). */
  stepIndex: number;
  /** Id of the short-term task driving this presentation, if any. */
  taskId?: string;
  initialRecall: Recall | null;
  hintShown: boolean;
  finalRecall: Recall | null;
  explicitEasy: boolean;
  startedAt: number;
  revealedAt?: number;
  /** Increments per presentation; feeds the idempotency key. */
  attempt: number;
}

export type StudyEvent =
  | { type: 'RECALL_REMEMBER' }
  | { type: 'RECALL_FORGET' }
  | { type: 'CONFIRM_REVEAL' }
  | { type: 'SET_EASY'; easy: boolean }
  | { type: 'SUSPEND' }
  | { type: 'RESUME' }
  | { type: 'RECOVER'; state?: StudyState };

export type StudyEffect =
  | { type: 'SHOW_HINT' }
  | { type: 'REVEAL_ANSWER' }
  | { type: 'PERSIST_RESULT'; result: StudyResult };

export interface StudyResult {
  kind: SessionKind;
  vocabularyId: string;
  stepIndex: number;
  taskId?: string;
  initialRecall: Recall;
  hintShown: boolean;
  finalRecall: Recall;
  /** null for reinforcement (short-term) presentations. */
  rating: FsrsRating | null;
  /** Terminal short-term state: task completed (success) vs advanced (failure). */
  shortTermOutcome?: 'success' | 'failure' | 'cap-reached';
  /** Whether to create a new same-day reinforcement task. */
  queueShortTerm: boolean;
  /** Whether to remove remaining reminder tasks (short-term success). */
  clearShortTerm: boolean;
  attempt: number;
}

export interface StudyTransition {
  state: StudyState;
  context: StudyContext;
  effects: StudyEffect[];
  /** False when the event was ignored (disabled button / duplicate). */
  changed: boolean;
}

export function createInitialContext(input: {
  kind: SessionKind;
  vocabularyId: string;
  word: string;
  hasHint: boolean;
  stepIndex?: number;
  taskId?: string;
  now: number;
}): StudyContext {
  return {
    kind: input.kind,
    vocabularyId: input.vocabularyId,
    word: input.word,
    hasHint: input.hasHint,
    stepIndex: input.stepIndex ?? 0,
    taskId: input.taskId,
    initialRecall: null,
    hintShown: false,
    finalRecall: null,
    explicitEasy: false,
    startedAt: input.now,
    attempt: 1,
  };
}

export function initialStateForKind(kind: SessionKind): StudyState {
  switch (kind) {
    case 'short-term':
      return 'SHORT_TERM_REVIEW';
    case 'long-term':
      return 'LONG_TERM_REVIEW';
    case 'new':
    case 'manual':
      return 'WORD_FRONT';
  }
}

function isFront(state: StudyState): boolean {
  return FRONT_STATES.includes(state);
}

function ignore(state: StudyState, context: StudyContext): StudyTransition {
  return { state, context, effects: [], changed: false };
}

export function reduce(
  state: StudyState,
  context: StudyContext,
  event: StudyEvent,
  now: number,
): StudyTransition {
  switch (event.type) {
    case 'SUSPEND': {
      if (state === 'SUSPENDED') return ignore(state, context);
      return { state: 'SUSPENDED', context, effects: [], changed: true };
    }
    case 'RESUME': {
      if (state !== 'SUSPENDED') return ignore(state, context);
      const resumed = initialStateForKind(context.kind);
      return {
        state: context.hintShown ? 'HINT_SENTENCE' : resumed,
        context,
        effects: [],
        changed: true,
      };
    }
    case 'RECOVER': {
      return { state: event.state ?? state, context, effects: [], changed: true };
    }
    case 'SET_EASY': {
      if (state !== 'ANSWER_REVEAL') return ignore(state, context);
      return { state, context: { ...context, explicitEasy: event.easy }, effects: [], changed: true };
    }
    case 'RECALL_REMEMBER':
    case 'RECALL_FORGET': {
      const recall: Recall = event.type === 'RECALL_REMEMBER' ? 'remember' : 'forget';
      if (isFront(state)) {
        if (recall === 'remember') {
          return {
            state: 'ANSWER_REVEAL',
            context: {
              ...context,
              initialRecall: 'remember',
              finalRecall: 'remember',
              revealedAt: now,
            },
            effects: [{ type: 'REVEAL_ANSWER' }],
            changed: true,
          };
        }
        return {
          state: 'HINT_SENTENCE',
          context: { ...context, initialRecall: 'forget', hintShown: true },
          effects: [{ type: 'SHOW_HINT' }],
          changed: true,
        };
      }
      if (state === 'HINT_SENTENCE') {
        return {
          state: 'ANSWER_REVEAL',
          context: { ...context, finalRecall: recall, revealedAt: now },
          effects: [{ type: 'REVEAL_ANSWER' }],
          changed: true,
        };
      }
      // Answer reveal / terminal states ignore recall events: the shortcut and
      // button must not bypass the state machine (taskbook §3.5, §12.1.7).
      return ignore(state, context);
    }
    case 'CONFIRM_REVEAL': {
      if (state !== 'ANSWER_REVEAL') return ignore(state, context);
      return confirmReveal(state, context, now);
    }
  }
}

function confirmReveal(
  state: StudyState,
  context: StudyContext,
  now: number,
): StudyTransition {
  void state;
  const initialRecall = context.initialRecall ?? 'forget';
  const finalRecall = context.finalRecall ?? 'forget';
  const isShortTerm = context.kind === 'short-term';

  if (isShortTerm) {
    const success = finalRecall === 'remember';
    const result: StudyResult = {
      kind: context.kind,
      vocabularyId: context.vocabularyId,
      stepIndex: context.stepIndex,
      taskId: context.taskId,
      initialRecall,
      hintShown: context.hintShown,
      finalRecall,
      rating: null,
      shortTermOutcome: success ? 'success' : 'failure',
      queueShortTerm: !success,
      clearShortTerm: success,
      attempt: context.attempt,
    };
    return {
      state: success ? 'COMPLETED_TODAY' : 'SHORT_TERM_QUEUED',
      context: { ...context, revealedAt: context.revealedAt ?? now },
      effects: [{ type: 'PERSIST_RESULT', result }],
      changed: true,
    };
  }

  const rating = mapRecallToRating({
    initialRecall,
    hintShown: context.hintShown,
    finalRecall,
    explicitEasy: context.explicitEasy,
  });
  const queueShortTerm = finalRecall === 'forget';
  const result: StudyResult = {
    kind: context.kind,
    vocabularyId: context.vocabularyId,
    stepIndex: context.stepIndex,
    taskId: context.taskId,
    initialRecall,
    hintShown: context.hintShown,
    finalRecall,
    rating,
    queueShortTerm,
    clearShortTerm: false,
    attempt: context.attempt,
  };
  return {
    state: queueShortTerm ? 'SHORT_TERM_QUEUED' : 'COMPLETED_TODAY',
    context: { ...context, revealedAt: context.revealedAt ?? now },
    effects: [{ type: 'PERSIST_RESULT', result }],
    changed: true,
  };
}

export function isTerminal(state: StudyState): boolean {
  return state === 'COMPLETED_TODAY' || state === 'SHORT_TERM_QUEUED';
}
