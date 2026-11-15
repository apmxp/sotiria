import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

export interface ChartDatum { key: string; label: string; hours: number; note: string }

/**
 * Bar chart of hours. Pass `goal` to draw the agreed goal line and `onSelect`
 * to let people tap a bar for details (the selected bar stays highlighted).
 */
export function UsageChart({ data, goal, selectedKey, onSelect, label }: { data: ChartDatum[]; goal?: number | undefined; selectedKey?: string | undefined; onSelect?: ((key: string) => void) | undefined; label: string }) {
  const max = Math.max(4, goal ?? 0, ...data.map(d => d.hours));
  return (
    <div className="chart-wrap" role="img" aria-label={`${label}: ${data.map(d => `${d.label} ${d.hours} hours`).join(', ')}${goal ? `. Goal ${goal} hours.` : ''}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 10, left: -28, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} dy={10} />
          <YAxis axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} domain={[0, Math.ceil(max)]} />
          <Tooltip cursor={{ fill: 'var(--muted)' }} content={({ active, payload }) => {
            const item = payload?.[0]?.payload as ChartDatum | undefined;
            return active && item ? <div className="chart-tooltip"><strong>{item.label}</strong><p>{item.hours} hours · {item.note}</p></div> : null;
          }} />
          {goal !== undefined && <ReferenceLine y={goal} stroke="var(--teal)" strokeDasharray="5 5" />}
          <Bar dataKey="hours" radius={[5, 5, 0, 0]} maxBarSize={34} cursor={onSelect ? 'pointer' : undefined} onClick={(entry: unknown) => { const key = (entry as { payload?: ChartDatum })?.payload?.key; if (key && onSelect) onSelect(key); }}>
            {data.map(d => <Cell key={d.key} fill="var(--primary)" fillOpacity={selectedKey && selectedKey !== d.key ? 0.45 : 1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import type { DayUsage } from '@/lib/wellbeing';
export function weekChartData(week: DayUsage[], childName: string): ChartDatum[] {
  return week.map(d => ({ key: d.date, label: d.isToday ? 'Today' : d.day, hours: d.hours, note: d.isToday ? (d.recorded ? `entered by ${childName}` : 'not added yet') : 'sample data' }));
}
export function categoryChartData(split: { label: string; minutes: number }[]): ChartDatum[] {
  return split.map(c => ({ key: c.label, label: c.label, hours: Math.round(c.minutes / 6) / 10, note: 'illustrative split' }));
}
