type TimestampLike = { toDate(): Date } | null | undefined;

const dateFmt = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' });

/** 一覧用: 今日なら時刻、昨日なら「昨日」、それ以外は日付 */
export function formatRelativeDate(t: TimestampLike, now = new Date()): string {
  if (!t) return '';
  const d = t.toDate();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return `今日 ${timeFmt.format(d)}`;
  if (diffDays === 1) return '昨日';
  return dateFmt.format(d);
}

export function formatDateTime(t: TimestampLike): string {
  if (!t) return '';
  const d = t.toDate();
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`;
}
