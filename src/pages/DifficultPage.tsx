import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, EmptyState, Spinner } from '@/components/ui';
import { db } from '@/db/database';
import { learningStateRepo, reviewLogRepo } from '@/db/repositories';
import { rankDifficultWords, type DifficultWord } from '@/services/stats/stats';
import { formatDateTime, formatPercent } from '@/utils/format';

export function DifficultPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DifficultWord[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [states, vocabulary, logs] = await Promise.all([
        learningStateRepo.list(),
        db.vocabulary.toArray(),
        reviewLogRepo.all(),
      ]);
      const ranked = rankDifficultWords(states, vocabulary, logs, 100);
      if (!cancelled) {
        setRows(ranked);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="计算困难词…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">困难词</h1>
      <p className="text-xs text-content-muted">
        排序依据：遗忘次数（lapses）从高到低，其次为最近失败时间。可解释、单一排序。
      </p>

      {rows.length === 0 ? (
        <EmptyState title="还没有困难词" description="当你出现回忆失败后，这里会列出需要重点关注的词。" />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-content-muted">
              <tr>
                <th className="p-2">单词</th>
                <th className="p-2">遗忘次数</th>
                <th className="p-2">首次成功率</th>
                <th className="p-2">最近失败</th>
                <th className="p-2">复习次数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.vocabularyId}>
                  <td className="p-2 font-medium">
                    <Link to="/vocabulary" className="underline-offset-2 hover:underline">
                      {row.word}
                    </Link>
                  </td>
                  <td className="p-2">
                    <Badge tone="danger">{row.lapses}</Badge>
                  </td>
                  <td className="p-2">{formatPercent(row.firstRecallSuccessRate)}</td>
                  <td className="p-2 text-xs text-content-muted">
                    {row.lastFailedAt ? formatDateTime(row.lastFailedAt) : '—'}
                  </td>
                  <td className="p-2">{row.totalReviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
