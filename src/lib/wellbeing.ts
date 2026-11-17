/**
 * Sotiría business rules: derived values (selectors), state changes (pure transitions),
 * the privacy-safe parent projection, and saved-data validation.
 * Every page reads from here so child and parent views always agree.
 */
import { activities, lessons, moods as moodValues, routineDayOptions, sampleCategorySplit, type DemoState, type Mood, type Routine, type RoutineDays, type ScreenCategory, type ScreenEntry } from '@/data/demo';
import { addDays, lastDays, weekday, weekdayLabel } from '@/lib/dates';

export const GOAL_MIN = 0.5;
export const GOAL_MAX = 24;
export const USAGE_MAX = 24;
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------- Screen time ---------- */

export function usageOn(state: DemoState, date: string) { return state.usageLog[date] ?? 0; }
export function hasUsage(state: DemoState, date: string) { return Object.prototype.hasOwnProperty.call(state.usageLog, date); }

export function screenBalance(usage: number, goal: number) {
  return { remaining: round1(Math.max(0, goal - usage)), percentage: goal > 0 ? Math.min(100, Math.max(0, usage / goal * 100)) : 0 };
}

export interface DayUsage { date: string; day: string; hours: number; recorded: boolean; isToday: boolean; withinGoal: boolean }

export function weekSeries(state: DemoState, today: string): DayUsage[] {
  return lastDays(today, 7).map(date => {
    const hours = round1(usageOn(state, date));
    return { date, day: weekdayLabel(date), hours, recorded: hasUsage(state, date), isToday: date === today, withinGoal: hours <= state.goal };
  });
}

function averageOf(state: DemoState, dates: string[]) {
  const recorded = dates.filter(date => hasUsage(state, date));
  if (!recorded.length) return null;
  return recorded.reduce((sum, date) => sum + usageOn(state, date), 0) / recorded.length;
}

/** Average over days that have a value; trend compares with the 7 days before. */
export function weeklyStats(state: DemoState, today: string) {
  const thisWeek = lastDays(today, 7);
  const previousWeek = lastDays(addDays(today, -7), 7);
  const average = averageOf(state, thisWeek);
  const previous = averageOf(state, previousWeek);
  const trend = average !== null && previous ? Math.round((average - previous) / previous * 100) : null;
  const recordedDays = thisWeek.filter(date => hasUsage(state, date));
  const daysWithinGoal = recordedDays.filter(date => usageOn(state, date) <= state.goal).length;
  return { average: average === null ? null : round1(average), trend, daysWithinGoal, recordedDays: recordedDays.length };
}

/** Illustrative split of a daily total, used only for sample days without entries. */
export function categorySplit(hours: number) {
  return sampleCategorySplit.map(({ label, share }) => ({ label, share, minutes: Math.round(hours * 60 * share) }));
}

export function entriesOn(state: DemoState, date: string) { return (state.screenEntries ?? []).filter(e => e.date === date); }

/** A category breakdown is available only when detailed entries reconcile with the daily total. */
export function daySplit(state: DemoState, date: string) {
  const entries = entriesOn(state, date);
  const total = entries.reduce((sum, e) => sum + e.minutes, 0);
  if (!entries.length || total !== Math.round(usageOn(state, date) * 60)) return { real: false, items: [] };
  return { real: true, items: sampleCategorySplit.map(({ label }) => { const minutes = entries.filter(e => e.category === label).reduce((sum, e) => sum + e.minutes, 0); return { label, minutes, share: total ? minutes / total : 0 }; }) };
}

/* ---------- Learning ---------- */

export const badgeRules: { name: string; hint: string; earned: (state: DemoState) => boolean }[] = [
  { name: 'Safety Explorer', hint: 'Explore your first lesson', earned: s => s.lessons.length >= 1 },
  { name: 'Privacy Protector', hint: 'Finish “Your information is yours”', earned: s => s.lessons.includes('privacy') },
  { name: 'Scam Spotter', hint: 'Finish “Spot a suspicious message”', earned: s => s.lessons.includes('messages') },
  { name: 'Kindness Champion', hint: 'Finish “Kindness goes a long way”', earned: s => s.lessons.includes('kindness') },
  { name: 'Smart Clicker', hint: 'Explore all six lessons', earned: s => lessons.every(l => s.lessons.includes(l.id)) },
];

export function lessonProgress(state: DemoState) {
  const completed = lessons.filter(l => state.lessons.includes(l.id)).length;
  return {
    completed,
    total: lessons.length,
    percent: Math.round(completed / lessons.length * 100),
    quizzes: completed,
    badges: badgeRules.map(rule => ({ name: rule.name, hint: rule.hint, earned: rule.earned(state) })),
    next: lessons.find(l => !state.lessons.includes(l.id)) ?? null,
  };
}

/* ---------- Offline activities ---------- */

export function activityHistory(state: DemoState) {
  return [...state.activityLog]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap(entry => {
      const activity = activities.find(a => a.id === entry.id);
      return activity ? [{ id: entry.id, date: entry.date, title: activity.title, category: activity.category, minutes: activity.minutes }] : [];
    });
}

export function activitiesInLastDays(state: DemoState, today: string, days = 7) {
  const from = addDays(today, -(days - 1));
  return activityHistory(state).filter(entry => entry.date >= from && entry.date <= today);
}

export function offlineMinutesOn(state: DemoState, date: string) {
  return activityHistory(state).filter(entry => entry.date === date).reduce((sum, entry) => sum + entry.minutes, 0);
}

export function activityStatus(state: DemoState, id: string, today: string) {
  const entries = state.activityLog.filter(entry => entry.id === id);
  return { doneToday: entries.some(entry => entry.date === today), timesDone: entries.length };
}

/* ---------- Breaks ---------- */

export function breaksOn(state: DemoState, date: string) { return state.breakLog.filter(d => d === date).length; }
export function breaksInLastDays(state: DemoState, today: string, days = 7) {
  const from = addDays(today, -(days - 1));
  return state.breakLog.filter(d => d >= from && d <= today).length;
}

/* ---------- Routines ---------- */

export function isRoutineDue(routine: Pick<Routine, 'days'>, date: string) {
  const day = weekday(date);
  const weekend = day === 0 || day === 6;
  return routine.days === 'Every day' || (routine.days === 'Weekends' ? weekend : !weekend);
}

export function routineProgress(state: DemoState, today: string) {
  const due = state.routines.filter(r => isRoutineDue(r, today));
  const done = due.filter(r => r.completedOn.includes(today)).length;
  return { due: due.length, done, percent: due.length ? Math.round(done / due.length * 100) : 0 };
}

export function routineWeekCount(routine: Routine, today: string) {
  const from = addDays(today, -6);
  return routine.completedOn.filter(d => d >= from && d <= today).length;
}

/* ---------- Privacy-safe parent projection ---------- */

/**
 * Everything a parent view or export may see. Built field by field from an explicit
 * allow-list: mood check-ins and reflections are never copied into it.
 */
export function parentSummary(state: DemoState, today: string) {
  const usage = round1(usageOn(state, today));
  const learning = lessonProgress(state);
  const recentActivities = activitiesInLastDays(state, today);
  return {
    childName: state.name,
    parentName: state.parentName,
    goal: state.goal,
    today: { date: today, usage, recorded: hasUsage(state, today), ...screenBalance(usage, state.goal) },
    todaySplit: daySplit(state, today),
    week: weekSeries(state, today),
    weekly: weeklyStats(state, today),
    learning: { completed: learning.completed, total: learning.total, percent: learning.percent, explored: lessons.filter(l => state.lessons.includes(l.id)).map(l => l.title) },
    offline: {
      thisWeek: recentActivities.length,
      minutesThisWeek: recentActivities.reduce((sum, a) => sum + a.minutes, 0),
      recent: recentActivities.slice(0, 5).map(({ title, category, date, minutes }) => ({ title, category, date, minutes })),
    },
    breaks: { reminders: state.breakReminders, today: breaksOn(state, today), thisWeek: breaksInLastDays(state, today) },
    routines: state.routines.map(r => ({ id: r.id, name: r.name, time: r.time, days: r.days, dueToday: isRoutineDue(r, today), doneToday: r.completedOn.includes(today), thisWeek: routineWeekCount(r, today) })),
    routineProgress: routineProgress(state, today),
    settings: { weeklySummary: state.weeklySummary, breakReminders: state.breakReminders, consent: state.consent },
  };
}
export type ParentSummary = ReturnType<typeof parentSummary>;

export const exportIncludes = ['Daily screen-time totals for the last 7 days', 'Your agreed daily goal', 'Online safety lessons explored', 'Offline activities completed this week', 'Breaks taken and family routines'];
export const exportExcludes = ['Mood check-ins', 'Private reflections and journal notes'];

export function buildFamilyReport(summary: ParentSummary, generatedAt: string) {
  return {
    report: 'Sotiría family report',
    generatedAt,
    notice: 'Screen-time figures are entered manually by the child. Sotiría does not measure device usage automatically.',
    privacy: 'Mood check-ins and private reflections are never included in Sotiría reports.',
    child: summary.childName,
    agreedDailyGoalHours: summary.goal,
    today: { hours: summary.today.usage, entered: summary.today.recorded, remainingHours: summary.today.remaining, byCategoryMinutes: summary.todaySplit.real ? Object.fromEntries(summary.todaySplit.items.map(i => [i.label, i.minutes])) : null },
    week: summary.week.map(({ date, day, hours, recorded, withinGoal }) => ({ date, day, hours, recorded, withinGoal })),
    weeklyAverageHours: summary.weekly.average,
    trendVsPreviousWeekPercent: summary.weekly.trend,
    learning: summary.learning,
    offlineActivities: summary.offline,
    breaks: summary.breaks,
    routines: summary.routines.map(({ name, time, days, doneToday, thisWeek }) => ({ name, time, days, doneToday, completionsThisWeek: thisWeek })),
  };
}

/* ---------- State transitions (pure) ---------- */

export function recordUsage(state: DemoState, date: string, hours: number): DemoState {
  return { ...state, usageLog: { ...state.usageLog, [date]: round1(Math.min(USAGE_MAX, Math.max(0, hours))) } };
}

export const ENTRY_MAX_MINUTES = 1440;
export function isValidEntryMinutes(minutes: number) { return Number.isInteger(minutes) && minutes >= 1 && minutes <= ENTRY_MAX_MINUTES; }

function withDayTotal(state: DemoState, entries: ScreenEntry[], date: string): DemoState {
  const usageLog = { ...state.usageLog };
  const minutes = entries.filter(e => e.date === date).reduce((sum, e) => sum + e.minutes, 0);
  if (minutes > 0) usageLog[date] = round1(minutes / 60); else delete usageLog[date];
  return { ...state, screenEntries: entries, usageLog };
}

export function addScreenEntry(state: DemoState, entry: ScreenEntry): DemoState {
  if (!isValidEntryMinutes(entry.minutes)) return state;
  return withDayTotal(state, [...(state.screenEntries ?? []), entry], entry.date);
}

export function updateScreenEntry(state: DemoState, id: string, patch: { category: ScreenCategory; minutes: number; appName: string }): DemoState {
  const existing = (state.screenEntries ?? []).find(e => e.id === id);
  if (!existing || !isValidEntryMinutes(patch.minutes)) return state;
  return withDayTotal(state, (state.screenEntries ?? []).map(e => e.id === id ? { ...e, ...patch } : e), existing.date);
}

export function deleteScreenEntry(state: DemoState, id: string): DemoState {
  const existing = (state.screenEntries ?? []).find(e => e.id === id);
  if (!existing) return state;
  return withDayTotal(state, (state.screenEntries ?? []).filter(e => e.id !== id), existing.date);
}

export function isValidGoal(goal: number) { return Number.isFinite(goal) && goal >= GOAL_MIN && goal <= GOAL_MAX; }
export function isValidUsage(hours: number) { return Number.isFinite(hours) && hours >= 0 && hours <= USAGE_MAX; }

export function setGoal(state: DemoState, goal: number): DemoState {
  return isValidGoal(goal) ? { ...state, goal: round1(goal) } : state;
}

/** Saves today's mood. Leaving `reflection` undefined keeps any reflection already written today. */
export function saveMood(state: DemoState, date: string, mood: Mood, reflection?: string): DemoState {
  const existing = state.moods.find(m => m.date === date);
  if (!moodValues.includes(mood)) return state;
  const text = (reflection ?? existing?.reflection ?? '').slice(0, 2000);
  return { ...state, moods: [{ date, mood, reflection: text }, ...state.moods.filter(m => m.date !== date)].sort((a, b) => b.date.localeCompare(a.date)) };
}

export function deleteMood(state: DemoState, date: string): DemoState {
  return { ...state, moods: state.moods.filter(m => m.date !== date) };
}

export function completeLesson(state: DemoState, id: string): DemoState {
  if (state.lessons.includes(id) || !lessons.some(l => l.id === id)) return state;
  return { ...state, lessons: [...state.lessons, id] };
}

/** Records an activity once per day; doing it again another day adds to the history. */
export function completeActivity(state: DemoState, id: string, date: string): DemoState {
  if (!activities.some(a => a.id === id) || state.activityLog.some(e => e.id === id && e.date === date)) return state;
  return { ...state, activityLog: [{ id, date }, ...state.activityLog] };
}

export function logBreak(state: DemoState, date: string): DemoState {
  return { ...state, breakLog: [...state.breakLog, date] };
}

export function undoBreak(state: DemoState, date: string): DemoState {
  const index = state.breakLog.lastIndexOf(date);
  if (index < 0) return state;
  return { ...state, breakLog: state.breakLog.filter((_, i) => i !== index) };
}

export function toggleRoutine(state: DemoState, id: string, date: string, done: boolean): DemoState {
  return { ...state, routines: state.routines.map(r => r.id !== id ? r : { ...r, completedOn: done ? [...new Set([...r.completedOn, date])] : r.completedOn.filter(d => d !== date) }) };
}

export interface RoutineInput { id?: string | undefined; name: string; time: string; days: RoutineDays }

export function saveRoutine(state: DemoState, input: RoutineInput, newId: string): DemoState {
  const name = input.name.trim().slice(0, 80);
  if (!name || !/^\d{2}:\d{2}$/.test(input.time) || !routineDayOptions.includes(input.days)) return state;
  if (input.id && state.routines.some(r => r.id === input.id)) {
    return { ...state, routines: state.routines.map(r => r.id === input.id ? { ...r, name, time: input.time, days: input.days } : r) };
  }
  return { ...state, routines: [...state.routines, { id: newId, name, time: input.time, days: input.days, completedOn: [] }] };
}

export function deleteRoutine(state: DemoState, id: string): DemoState {
  return { ...state, routines: state.routines.filter(r => r.id !== id) };
}

/* ---------- Saved-data validation ---------- */

export function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return s['version'] === 2 && typeof s['name'] === 'string' && typeof s['goal'] === 'number' && isValidGoal(s['goal'])
    && !!s['usageLog'] && typeof s['usageLog'] === 'object' && Array.isArray(s['moods']) && Array.isArray(s['lessons'])
    && Array.isArray(s['activityLog']) && Array.isArray(s['breakLog']) && Array.isArray(s['routines'])
    && (s['routines'] as unknown[]).every(r => !!r && typeof r === 'object' && Array.isArray((r as Routine).completedOn));
}
