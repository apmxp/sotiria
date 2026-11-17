/**
 * Client-safe mapping between database rows and the in-app wellbeing model.
 * Shared by server functions (building snapshots) and tests.
 */
import { z } from 'zod';
import type { DemoState, MoodEntry, Routine, RoutineDays, ScreenEntry } from '@/data/demo';

export const SCREEN_CATEGORIES = ['Learning', 'Videos', 'Games', 'Other'] as const;
export const MOOD_VALUES = ['Joyful', 'Calm', 'Curious', 'Tired', 'Sad', 'Frustrated'] as const;
export const REFLECTION_MAX = 2000;
export const DEFAULT_GOAL_MINUTES = 180;
export const DAILY_TOTAL_NOTE_PREFIX = 'sotiria:daily-total:';

const recurrenceByDays: Record<RoutineDays, string> = { 'Every day': 'daily', Weekdays: 'weekdays', Weekends: 'weekends' };
export function toRecurrence(days: RoutineDays) { return recurrenceByDays[days]; }
export function fromRecurrence(recurrence: string): RoutineDays { return recurrence === 'weekdays' ? 'Weekdays' : recurrence === 'weekends' ? 'Weekends' : 'Every day'; }

export const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Accepts the client's local day only when it is within a day and a half of server time (timezones). */
export function isCurrentDay(value: string, now = Date.now()) {
  const t = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(t) && Math.abs(t - now) <= 36 * 3600_000;
}
export const currentDay = day.refine(v => isCurrentDay(v), 'Please check your device date and try again.');

/** The wellbeing data a snapshot may carry. Parent snapshots always have `moods: []`. */
export type Snapshot = Pick<DemoState, 'goal' | 'usageLog' | 'screenEntries' | 'moods' | 'lessons' | 'activityLog' | 'breakLog' | 'routines' | 'breakReminders' | 'childNotifications' | 'weeklySummary' | 'consent'>;

interface Rows {
  goalMinutes: number | null;
  logs: { id: string; usage_date: string; category: string; duration_minutes: number; app_name: string | null; notes?: string | null }[];
  breaks: { completed_on: string }[];
  lessons: { key: string }[];
  activities: { key: string; completed_on: string }[];
  routines: { id: string; name: string; scheduled_time: string; recurrence: string; is_active: boolean }[];
  completions: { routine_id: string; completion_date: string }[];
  moods?: { entry_date: string; mood: string; reflection: string }[];
  childPrefs: Record<string, unknown>;
  parentPrefs?: Record<string, unknown>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback;

export function buildSnapshot(rows: Rows): Snapshot {
  const totalOverrides = new Map<string, number>();
  const detailedLogs = rows.logs.filter(log => {
    const note = log.notes;
    if (typeof note !== 'string' || !note.startsWith(DAILY_TOTAL_NOTE_PREFIX)) return true;
    const minutes = Number(note.slice(DAILY_TOTAL_NOTE_PREFIX.length));
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return true;
    totalOverrides.set(log.usage_date, minutes);
    return false;
  });
  const screenEntries: ScreenEntry[] = detailedLogs.map(l => ({ id: l.id, date: l.usage_date, category: l.category as ScreenEntry['category'], minutes: l.duration_minutes, appName: l.app_name ?? '' }));
  const usageLog: Record<string, number> = {};
  for (const e of screenEntries) usageLog[e.date] = (usageLog[e.date] ?? 0) + e.minutes;
  for (const k of Object.keys(usageLog)) usageLog[k] = round1((usageLog[k] ?? 0) / 60);
  for (const [date, minutes] of totalOverrides) usageLog[date] = round1(minutes / 60);
  const routines: Routine[] = rows.routines.filter(r => r.is_active).map(r => ({
    id: r.id, name: r.name, time: r.scheduled_time.slice(0, 5), days: fromRecurrence(r.recurrence),
    completedOn: [...new Set(rows.completions.filter(c => c.routine_id === r.id).map(c => c.completion_date))],
  }));
  const moods: MoodEntry[] = (rows.moods ?? []).map(m => ({ date: m.entry_date, mood: m.mood as MoodEntry['mood'], reflection: m.reflection }));
  return {
    goal: round1((rows.goalMinutes ?? DEFAULT_GOAL_MINUTES) / 60),
    usageLog, screenEntries, moods,
    lessons: rows.lessons.map(l => l.key),
    activityLog: rows.activities.map(a => ({ id: a.key, date: a.completed_on })),
    breakLog: rows.breaks.map(b => b.completed_on),
    routines,
    breakReminders: bool(rows.childPrefs['breakReminders'], true),
    childNotifications: bool(rows.childPrefs['childNotifications'], true),
    weeklySummary: bool(rows.parentPrefs?.['weeklySummary'], true),
    consent: bool(rows.parentPrefs?.['consent'], false),
  };
}
