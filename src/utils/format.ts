import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';
import { zhCN } from 'date-fns/locale';

export function formatDateTime(epoch: number): string {
  return format(new Date(epoch), 'yyyy-MM-dd HH:mm');
}

export function formatDate(epoch: number): string {
  return format(new Date(epoch), 'yyyy-MM-dd');
}

export function formatDue(epoch: number, now = Date.now()): string {
  const date = new Date(epoch);
  if (epoch <= now) return '已到期';
  if (isToday(date)) return `今天 ${format(date, 'HH:mm')}`;
  if (isYesterday(date)) return `昨天 ${format(date, 'HH:mm')}`;
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: zhCN });
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours} 小时 ${rem} 分`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}
