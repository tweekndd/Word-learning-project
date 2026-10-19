import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/app/AppProvider';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useStudySession } from '@/features/study/useStudySession';
import { DictionaryAnswer } from '@/features/study/DictionaryAnswer';
import type { StudyEvent } from '@/features/study/machine';

function useShortcuts(enabled: boolean, dispatch: (e: StudyEvent) => void, state: string) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const front = state === 'WORD_FRONT' || state === 'SHORT_TERM_REVIEW' || state === 'LONG_TERM_REVIEW';
      const hint = state === 'HINT_SENTENCE';
      if (e.key === '1' && (front || hint)) {
        e.preventDefault();
        dispatch({ type: 'RECALL_REMEMBER' });
      } else if (e.key === '2' && (front || hint)) {
        e.preventDefault();
        dispatch({ type: 'RECALL_FORGET' });
      } else if (e.key === ' ' && state === 'ANSWER_REVEAL') {
        e.preventDefault();
        dispatch({ type: 'CONFIRM_REVEAL' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, dispatch, state]);
}

export function StudyPage() {
  const { settings } = useApp();
  const session = useStudySession();
  const { state, context, card, busy, dispatch } = session;

  useShortcuts(settings.keyboardShortcutsEnabled, dispatch, state);

  if (session.loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="正在准备今日任务…" />
      </div>
    );
  }

  if (session.queueSize === 0) {
    return (
      <EmptyState
        title="还没有可学习的单词"
        description="先导入你自己的 CSV 词库，然后开始学习。"
        action={
          <Link to="/vocabulary" className="underline">
            前往导入词库
          </Link>
        }
      />
    );
  }

  if (session.allDone) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-8 text-center">
        <h1 className="text-xl font-semibold">今日任务已完成 🎉</h1>
        <p className="text-sm text-content-muted">
          共处理 {session.queueSize} 张卡片。可以查看统计，或练习困难词。
        </p>
        <div className="flex justify-center gap-2">
          <Link to="/difficult">
            <Button variant="secondary">练习困难词</Button>
          </Link>
          <Link to="/stats">
            <Button variant="secondary">查看统计</Button>
          </Link>
          <Button variant="ghost" onClick={session.reload}>
            重新加载队列
          </Button>
        </div>
      </div>
    );
  }

  if (!card || !context) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="加载卡片…" />
      </div>
    );
  }

  const front = state === 'WORD_FRONT' || state === 'SHORT_TERM_REVIEW' || state === 'LONG_TERM_REVIEW';
  const total = session.queueSize;
  const progress = total > 0 ? context.stepIndex + 1 : 1;
  void progress;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-content-muted">
        <span>
          今日进度：{session.queueIndex + 1} / {total}
        </span>
        <div className="flex items-center gap-2">
          {card.sourceLabel && (
            <Badge tone={card.entry?.source === 'mock' ? 'mock' : 'neutral'}>{card.sourceLabel}</Badge>
          )}
          {context.kind === 'new' && <Badge tone="accent">新词</Badge>}
          {context.kind === 'long-term' && <Badge tone="warning">长期复习</Badge>}
          {context.kind === 'short-term' && <Badge tone="success">当天强化</Badge>}
        </div>
      </div>

      <Card className="flex min-h-[8rem] flex-col items-center justify-center gap-2 py-8 text-center">
        <p className="break-words px-2 text-3xl font-bold leading-tight" data-testid="study-word">
          {card.vocabulary.word}
        </p>
        {settings.layoutMode !== 'compact' && card.entry?.phonetic && (
          <p className="text-sm text-content-muted">{card.entry.phonetic}</p>
        )}
      </Card>

      {front && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            variant="success"
            disabled={busy}
            onClick={() => dispatch({ type: 'RECALL_REMEMBER' })}
          >
            记得 {settings.keyboardShortcutsEnabled && <span className="text-xs opacity-70">(1)</span>}
          </Button>
          <Button
            size="lg"
            variant="danger"
            disabled={busy}
            onClick={() => dispatch({ type: 'RECALL_FORGET' })}
          >
            不记得 {settings.keyboardShortcutsEnabled && <span className="text-xs opacity-70">(2)</span>}
          </Button>
        </div>
      )}

      {state === 'HINT_SENTENCE' && (
        <Card className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-content-muted">语境提示（例句）</p>
            {card.hint ? (
              <p className="break-words text-base leading-relaxed" data-testid="hint-sentence">
                {card.hint}
              </p>
            ) : (
              <p className="text-sm text-content-muted" data-testid="no-hint">
                暂无可用例句
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              variant="success"
              disabled={busy}
              onClick={() => dispatch({ type: 'RECALL_REMEMBER' })}
            >
              记得 {settings.keyboardShortcutsEnabled && <span className="text-xs opacity-70">(1)</span>}
            </Button>
            <Button
              size="lg"
              variant="danger"
              disabled={busy}
              onClick={() => dispatch({ type: 'RECALL_FORGET' })}
            >
              不记得 {settings.keyboardShortcutsEnabled && <span className="text-xs opacity-70">(2)</span>}
            </Button>
          </div>
        </Card>
      )}

      {state === 'ANSWER_REVEAL' && (
        <Card className="space-y-3">
          {card.dictLoading ? (
            <Spinner label="加载词典内容…" />
          ) : (
            <DictionaryAnswer
              entry={card.entry}
              dictError={card.dictError}
              vocabulary={card.vocabulary}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <label className="flex items-center gap-2 text-xs text-content-muted">
              <input
                type="checkbox"
                checked={context.explicitEasy}
                onChange={(e) => dispatch({ type: 'SET_EASY', easy: e.target.checked })}
              />
              非常轻松（可选，影响长期评分）
            </label>
            <Button
              variant="primary"
              size="lg"
              disabled={busy}
              onClick={() => dispatch({ type: 'CONFIRM_REVEAL' })}
            >
              看完了，继续 {settings.keyboardShortcutsEnabled && <span className="text-xs opacity-70">(空格)</span>}
            </Button>
          </div>
        </Card>
      )}

      {(state === 'SHORT_TERM_QUEUED' || state === 'COMPLETED_TODAY') && (
        <Card className="space-y-3 text-center">
          <p className="text-sm">
            {state === 'SHORT_TERM_QUEUED'
              ? '已加入当天强化队列，稍后会再次出现。'
              : '本词今日学习完成。'}
          </p>
          <Button variant="primary" onClick={session.next}>
            下一个
          </Button>
        </Card>
      )}

      {settings.layoutMode !== 'compact' && (
        <p className="text-center text-xs text-content-muted">
          快捷键：1 记得 · 2 不记得 · 空格 看完继续
        </p>
      )}
    </div>
  );
}
