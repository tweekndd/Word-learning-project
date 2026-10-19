import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Spinner } from '@/components/ui';
import { db } from '@/db/database';
import { dailySessionRepo, learningStateRepo, shortTermTaskRepo } from '@/db/repositories';
import {
  computeDueCounts,
  computeRecallRates,
  computeTrend,
  countReviews,
  type DueCounts,
  type RecallRates,
  type ReviewCounts,
  type TrendPoint,
} from '@/services/stats/stats';
import type { DailySession } from '@/types/domain';
import { formatDuration, formatPercent } from '@/utils/format';
import { toLocalDayKey } from '@/utils/date';

export function StatsPage() {
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState<DailySession | undefined>();
  const [ratesAll, setRatesAll] = useState<RecallRates | null>(null);
  const [countsAll, setCountsAll] = useState<ReviewCounts | null>(null);
  const [trend7, setTrend7] = useState<TrendPoint[]>([]);
  const [trend30, setTrend30] = useState<TrendPoint[]>([]);
  const [due, setDue] = useState<DueCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = Date.now();
      const logs = await db.reviewLogs.toArray();
      const states = await learningStateRepo.list();
      const stDue = await shortTermTaskRepo.pendingDue(now);
      const sessions = await dailySessionRepo.all();
      if (cancelled) return;
      setToday(sessions.find((s) => s.localDayKey === toLocalDayKey(now)));
      setRatesAll(computeRecallRates(logs));
      setCountsAll(countReviews(logs));
      setTrend7(computeTrend(logs, 7, now));
      setTrend30(computeTrend(logs, 30, now));
      setDue(computeDueCounts(states, stDue.length, now));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner label="计算统计…" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-lg font-semibold">统计</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold">今日</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="新词" value={today?.newWordsSeen ?? 0} />
          <Stat label="长期复习" value={today?.longTermReviews ?? 0} />
          <Stat label="当天强化" value={today?.shortTermReviews ?? 0} />
          <Stat label="失败次数" value={today?.failedAttempts ?? 0} />
        </div>
        <p className="mt-2 text-xs text-content-muted">
          今日学习活跃时长：{formatDuration(today?.activeSeconds ?? 0)}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">回忆质量（累计）</h2>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="首次回忆成功率" value={formatPercent(ratesAll?.firstRecallSuccessRate ?? null)} />
          <Stat label="提示后成功率" value={formatPercent(ratesAll?.postHintSuccessRate ?? null)} />
        </div>
        <p className="mt-2 text-xs text-content-muted">
          首次成功率 = 直接“记得” / 首次回答次数；提示后成功率 = 提示后成功 / 进入提示的判断次数。
          “看过答案”不计入成功。
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">复习构成（累计）</h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="新词" value={countsAll?.newWords ?? 0} />
          <Stat label="长期复习" value={countsAll?.longTerm ?? 0} />
          <Stat label="短时强化" value={countsAll?.shortTerm ?? 0} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">到期任务</h2>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="到期长期" value={due?.dueLongTerm ?? 0} />
          <Stat label="到期强化" value={due?.dueShortTerm ?? 0} />
          <Stat label="逾期" value={due?.overdue ?? 0} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">近 7 天趋势</h2>
        <TrendChart points={trend7} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">近 30 天趋势</h2>
        <TrendChart points={trend30} />
      </section>

      <p className="text-xs text-content-muted">
        困难词排名见 <Link to="/difficult" className="underline">困难词页</Link>。
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="py-3 text-center">
      <p className="text-xl font-semibold">{value}</p>
      <p className="text-xs text-content-muted">{label}</p>
    </Card>
  );
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.newWords + p.longTerm + p.shortTerm));
  return (
    <Card>
      <div className="flex items-end gap-1" role="img" aria-label="每日复习量趋势">
        {points.map((p) => {
          const total = p.newWords + p.longTerm + p.shortTerm;
          const height = Math.round((total / max) * 80);
          return (
            <div key={p.dayKey} className="flex flex-1 flex-col items-center gap-1" title={`${p.dayKey}: ${total}`}>
              <div className="flex h-20 w-full flex-col justify-end">
                <div
                  className="w-full rounded-t bg-accent/30"
                  style={{ height: `${Math.max(2, height)}px` }}
                  aria-hidden
                />
              </div>
              <span className="text-[9px] text-content-muted">{p.dayKey.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-3 text-[11px] text-content-muted">
        <span>蓝柱：当日复习总数（新词+长期+强化）</span>
        <span>最后一天失败 {points.at(-1)?.failures ?? 0} 次</span>
      </div>
    </Card>
  );
}
