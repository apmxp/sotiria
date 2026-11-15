/** Local calendar-day helpers. Days are stored as YYYY-MM-DD strings in the user's timezone. */
function parse(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m || 1) - 1, d || 1);
}

export function dayKey(date: Date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(key: string, amount: number) {
  const date = parse(key);
  date.setDate(date.getDate() + amount);
  return dayKey(date);
}

/** The `count` days ending with `today`, oldest first. */
export function lastDays(today: string, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(today, i - count + 1));
}

export function weekdayLabel(key: string) {
  return parse(key).toLocaleDateString('en-US', { weekday: 'short' });
}

export function dayOfMonth(key: string) {
  return parse(key).getDate();
}

export function friendlyDate(key: string, today: string) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return parse(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key: string) {
  return parse(key).getDay();
}
