import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '@/app/AppProvider';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { buildDailyQueue, type DailyQueue } from '@/features/review/queue';
import { shortTermTaskRepo } from '@/db/repositories';
import { learningStateRepo } from '@/db/repositories';
import type { ShortTermTask, LearningState, Vocabulary } from '@/types/domain';
import { db } from '@/db/database';
import { formatDue } from '@/utils/format';

export function ReviewPage() {
  const { settings, ready } = useApp();
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<DailyQueue | null>(null);
  const [shortTerm, setShortTerm] = useState<ShortTermTask[]>([]);
  const [longTerm, setLongTerm] = useState<Array<{ state: LearningState; vocab?: Vocabulary }>>([]);
  const [overdue, setOverdue] = useState(0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const now = Date.now();
      const built = await buildDailyQueue({ now, settings });
      const st = await shortTermTaskRepo.pendingDue(now);
      const states = await learningStateRepo.list();
      const due = states
        .filter((s) => s.dueAt !== undefined && s.dueAt !== null && s.dueAt <= now && s.status !== 'new' && s.status !== 'suspended')
        .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
      const vocabRows = await db.vocabulary.bulkGet(due.map((s) => s.vocabularyId));
      const lt = due.map((state, i) => ({ state, vocab: vocabRows[i] ?? undefined }));
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const od = due.filter((s) => (s.dueAt ?? now) < startOfToday.getTime()).length;
      if (cancelled) return;
      setQueue(built);
      setShortTerm(st);
      setLongTerm(lt);
      setOverdue(od);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, settings]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="加载复习队列…" />
      </div>
    );
  }

  const total = (queue?.shortTerm.length ?? 0) + (queue?.longTerm.length ?? 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">复习队列</h1>
        <Link to="/study">
          <Button variant="primary">开始学习</Button>
        </Link>
      </div>

      {total === 0 ? (
        <EmptyState title="当前没有到期的复习任务" description="所有任务都在计划中。" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Card className="py-3">
              <p className="text-2xl font-semibold">{queue?.shortTerm.length ?? 0}</p>
              <p className="text-xs text-content-muted">当天强化</p>
            </Card>
            <Card className="py-3">
              <p className="text-2xl font-semibold">{queue?.longTerm.length ?? 0}</p>
              <p className="text-xs text-content-muted">长期复习</p>
            </Card>
            <Card className="py-3">
              <p className="text-2xl font-semibold text-danger">{overdue}</p>
              <p className="text-xs text-content-muted">逾期</p>
            </Card>
          </div>

          {shortTerm.length > 0 && (
            <Card className="space-y-2">
              <h2 className="text-sm font-semibold">当天强化任务</h2>
              <ul className="divide-y divide-line text-sm">
                {shortTerm.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-1.5">
                    <span className="font-mono text-xs text-content-muted">{t.vocabularyId.slice(0, 8)}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone="success">步骤 {t.stepIndex + 1}</Badge>
                      <span className="text-xs text-content-muted">{formatDue(t.dueAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {longTerm.length > 0 && (
            <Card className="space-y-2">
              <h2 className="text-sm font-semibold">长期复习任务</h2>
              <ul className="divide-y divide-line text-sm">
                {longTerm.slice(0, 100).map(({ state, vocab }) => (
                  <li key={state.vocabularyId} className="flex items-center justify-between py-1.5">
                    <span className="break-words">{vocab?.word ?? state.vocabularyId.slice(0, 8)}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone="warning">lapses {state.lapses}</Badge>
                      <span className="text-xs text-content-muted">
                        {state.dueAt ? formatDue(state.dueAt) : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
