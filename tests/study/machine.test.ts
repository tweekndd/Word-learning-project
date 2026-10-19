import { describe, it, expect } from 'vitest';
import {
  createInitialContext,
  initialStateForKind,
  reduce,
  type SessionKind,
  type StudyContext,
  type StudyEvent,
  type StudyState,
  type StudyTransition,
} from '@/features/study/machine';

function run(kind: SessionKind, events: StudyEvent[], hasHint = true) {
  let state: StudyState = initialStateForKind(kind);
  let context: StudyContext = createInitialContext({
    kind,
    vocabularyId: 'v1',
    word: 'negotiate',
    hasHint,
    now: 1000,
  });
  const transitions: StudyTransition[] = [];
  for (const event of events) {
    const t = reduce(state, context, event, 2000);
    transitions.push(t);
    state = t.state;
    context = t.context;
  }
  return { state, context, transitions };
}

describe('study state machine (§12.1)', () => {
  it('new word: direct remember → reveal → confirm → completed', () => {
    const { state, context, transitions } = run('new', [
      { type: 'RECALL_REMEMBER' },
      { type: 'CONFIRM_REVEAL' },
    ]);
    expect(transitions[0]?.state).toBe('ANSWER_REVEAL');
    expect(state).toBe('COMPLETED_TODAY');
    const persist = transitions[1]?.effects.find((e) => e.type === 'PERSIST_RESULT');
    expect(persist?.type).toBe('PERSIST_RESULT');
    if (persist?.type === 'PERSIST_RESULT') {
      expect(persist.result.rating).toBe('good');
      expect(persist.result.queueShortTerm).toBe(false);
    }
    expect(context.finalRecall).toBe('remember');
  });

  it('new word: forget → hint → remember → reveal → confirm → completed (Hard)', () => {
    const { state, transitions } = run('new', [
      { type: 'RECALL_FORGET' },
      { type: 'RECALL_REMEMBER' },
      { type: 'CONFIRM_REVEAL' },
    ]);
    expect(transitions[0]?.state).toBe('HINT_SENTENCE');
    expect(state).toBe('COMPLETED_TODAY');
    const persist = transitions[2]?.effects.find((e) => e.type === 'PERSIST_RESULT');
    if (persist?.type === 'PERSIST_RESULT') {
      expect(persist.result.rating).toBe('hard');
      expect(persist.result.hintShown).toBe(true);
      expect(persist.result.queueShortTerm).toBe(false);
    }
  });

  it('new word: forget → hint → forget → reveal → confirm → queued (Again)', () => {
    const { state, transitions } = run('new', [
      { type: 'RECALL_FORGET' },
      { type: 'RECALL_FORGET' },
      { type: 'CONFIRM_REVEAL' },
    ]);
    expect(state).toBe('SHORT_TERM_QUEUED');
    const persist = transitions[2]?.effects.find((e) => e.type === 'PERSIST_RESULT');
    if (persist?.type === 'PERSIST_RESULT') {
      expect(persist.result.rating).toBe('again');
      expect(persist.result.queueShortTerm).toBe(true);
    }
  });

  it('no example still allows the second decision (§12.1.4)', () => {
    const { state } = run(
      'new',
      [{ type: 'RECALL_FORGET' }, { type: 'RECALL_REMEMBER' }, { type: 'CONFIRM_REVEAL' }],
      false,
    );
    expect(state).toBe('COMPLETED_TODAY');
  });

  it('explicit easy produces Easy rating', () => {
    const { transitions } = run('new', [
      { type: 'RECALL_REMEMBER' },
      { type: 'SET_EASY', easy: true },
      { type: 'CONFIRM_REVEAL' },
    ]);
    const persist = transitions[2]?.effects.find((e) => e.type === 'PERSIST_RESULT');
    if (persist?.type === 'PERSIST_RESULT') expect(persist.result.rating).toBe('easy');
  });

  it('long-term review uses the same hint flow but is labelled long-term', () => {
    const { transitions, state } = run('long-term', [
      { type: 'RECALL_FORGET' },
      { type: 'RECALL_REMEMBER' },
      { type: 'CONFIRM_REVEAL' },
    ]);
    expect(state).toBe('COMPLETED_TODAY');
    const persist = transitions[2]?.effects.find((e) => e.type === 'PERSIST_RESULT');
    if (persist?.type === 'PERSIST_RESULT') {
      expect(persist.result.kind).toBe('long-term');
      expect(persist.result.rating).toBe('hard');
    }
  });

  it('short-term success completes and clears remaining tasks', () => {
    const { state, transitions } = run('short-term', [
      { type: 'RECALL_REMEMBER' },
      { type: 'CONFIRM_REVEAL' },
    ]);
    expect(state).toBe('COMPLETED_TODAY');
    const persist = transitions[1]?.effects.find((e) => e.type === 'PERSIST_RESULT');
    if (persist?.type === 'PERSIST_RESULT') {
      expect(persist.result.rating).toBeNull();
      expect(persist.result.shortTermOutcome).toBe('success');
      expect(persist.result.clearShortTerm).toBe(true);
    }
  });

  it('short-term failure queues another step', () => {
    const { state, transitions } = run('short-term', [
      { type: 'RECALL_FORGET' },
      { type: 'RECALL_FORGET' },
      { type: 'CONFIRM_REVEAL' },
    ]);
    expect(state).toBe('SHORT_TERM_QUEUED');
    const persist = transitions[2]?.effects.find((e) => e.type === 'PERSIST_RESULT');
    if (persist?.type === 'PERSIST_RESULT') {
      expect(persist.result.shortTermOutcome).toBe('failure');
      expect(persist.result.rating).toBeNull();
    }
  });

  it('second recall event while in ANSWER_REVEAL is ignored (double-click safety, §12.1.6-7)', () => {
    const { transitions } = run('new', [
      { type: 'RECALL_REMEMBER' },
      { type: 'RECALL_REMEMBER' },
      { type: 'RECALL_FORGET' },
    ]);
    expect(transitions[1]?.changed).toBe(false);
    expect(transitions[2]?.changed).toBe(false);
    expect(transitions[1]?.effects).toHaveLength(0);
  });

  it('CONFIRM while still on the front is ignored (no bypassing, §12.1.7)', () => {
    const { transitions } = run('new', [{ type: 'CONFIRM_REVEAL' }]);
    expect(transitions[0]?.changed).toBe(false);
    expect(transitions[0]?.state).toBe('WORD_FRONT');
  });

  it('suspend and resume preserve the front state', () => {
    const suspended = run('new', [{ type: 'SUSPEND' }]);
    expect(suspended.state).toBe('SUSPENDED');
    const resumed = run('new', [{ type: 'SUSPEND' }, { type: 'RESUME' }]);
    expect(resumed.state).toBe('WORD_FRONT');
  });

  it('resume during answer-reveal restores answer-reveal (§12.1.5)', () => {
    const { state } = run('new', [
      { type: 'RECALL_REMEMBER' },
      { type: 'RESUME' },
    ]);
    expect(state).toBe('ANSWER_REVEAL');
  });
});
