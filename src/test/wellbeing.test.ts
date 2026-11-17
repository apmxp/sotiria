import { describe, expect, it } from 'vitest';
import { createSampleState } from '@/data/demo';
import { addDays } from '@/lib/dates';
import * as rules from '@/lib/wellbeing';
import { buildSnapshot, DAILY_TOTAL_NOTE_PREFIX } from '@/lib/wellbeing-db';

const today = '2026-11-12'; // a Thursday
const base = () => createSampleState(today);

describe('privacy: parent projection and export', () => {
  it('never contains mood check-ins or reflections', () => {
    let state = rules.saveMood(base(), today, 'Sad', 'SECRET-NOTE about school');
    const summary = rules.parentSummary(state, today);
    const exported = JSON.stringify(rules.buildFamilyReport(summary, '2026-11-12T10:00:00Z'));
    for (const text of [JSON.stringify(summary), exported]) {
      expect(text).not.toContain('SECRET-NOTE');
      expect(text).not.toContain('Reading in the garden felt peaceful');
      expect(text).not.toContain('Sad');
      expect(text).not.toMatch(/"moods?"|"reflection"/);
    }
  });
});

describe('child actions update parent summaries', () => {
  it('manual screen time becomes today in the weekly series and goal progress', () => {
    const state = rules.recordUsage(base(), today, 1.5);
    const summary = rules.parentSummary(state, today);
    expect(summary.today.usage).toBe(1.5);
    expect(summary.today.percentage).toBe(50);
    expect(summary.week.at(-1)).toMatchObject({ date: today, hours: 1.5, recorded: true });
  });

  it('weekly trend compares with the previous 7 days (sample week is about −12%)', () => {
    const stats = rules.weeklyStats(base(), today);
    expect(stats.trend).toBe(-10); // 6 recorded sample days this week vs previous week
    expect(rules.weeklyStats(rules.recordUsage(base(), today, 2), today).trend).toBe(-12);
  });

  it('a new goal is used by every summary', () => {
    const state = rules.setGoal(rules.recordUsage(base(), today, 2), 4);
    const summary = rules.parentSummary(state, today);
    expect(summary.goal).toBe(4);
    expect(summary.today.remaining).toBe(2);
    expect(rules.setGoal(state, 0).goal).toBe(4); // invalid goals are ignored
  });

  it('completing an activity adds to history and the parent weekly count, once per day', () => {
    const before = rules.parentSummary(base(), today).offline.thisWeek;
    let state = rules.completeActivity(base(), 'draw', today);
    state = rules.completeActivity(state, 'draw', today);
    expect(rules.parentSummary(state, today).offline.thisWeek).toBe(before + 1);
    expect(rules.activityHistory(state)[0]).toMatchObject({ id: 'draw', date: today });
  });

  it('completing a lesson raises learning progress and unlocks badges', () => {
    let state = rules.completeLesson(base(), 'footprints');
    state = rules.completeLesson(state, 'click');
    const progress = rules.lessonProgress(state);
    expect(progress.completed).toBe(6);
    expect(progress.badges.find(b => b.name === 'Smart Clicker')?.earned).toBe(true);
    expect(rules.parentSummary(state, today).learning.completed).toBe(6);
  });

  it('routine completion counts only routines planned for today', () => {
    let state = rules.toggleRoutine(base(), 'dinner', today, true);
    const progress = rules.routineProgress(state, today);
    expect(progress.due).toBe(3); // weekend routine is not due on a Thursday
    expect(progress.done).toBe(1);
    state = rules.toggleRoutine(state, 'dinner', today, false);
    expect(rules.routineProgress(state, today).done).toBe(0);
  });

  it('breaks the child logs show up as counts for the parent', () => {
    const state = rules.logBreak(rules.logBreak(base(), today), today);
    const summary = rules.parentSummary(state, today);
    expect(summary.breaks.today).toBe(2);
    expect(summary.breaks.thisWeek).toBe(5);
  });
});

describe('mood saving', () => {
  it('a quick mood pick keeps a reflection already written today', () => {
    let state = rules.saveMood(base(), today, 'Calm', 'my note');
    state = rules.saveMood(state, today, 'Joyful');
    expect(state.moods.find(m => m.date === today)).toEqual({ date: today, mood: 'Joyful', reflection: 'my note' });
  });
});

describe('saved screen-time totals', () => {
  const snapshotFor = (totalMinutes: number, entryMinutes: number[]) => buildSnapshot({
      goalMinutes: null,
      logs: [
        ...entryMinutes.map((minutes, index) => ({ id: `entry-${index}`, usage_date: today, category: index === 0 ? 'Learning' : 'Games', duration_minutes: minutes, app_name: null, notes: null })),
        { id: 'total', usage_date: today, category: 'Other', duration_minutes: Math.max(1, totalMinutes), app_name: null, notes: `${DAILY_TOTAL_NOTE_PREFIX}${totalMinutes}` },
      ],
      breaks: [],
      lessons: [],
      activities: [],
      routines: [],
      completions: [],
      moods: [],
      childPrefs: {},
    });
  const reportFor = (snapshot: ReturnType<typeof snapshotFor>) => {
    const summary = rules.parentSummary({ ...base(), ...snapshot }, today);
    return { summary, report: rules.buildFamilyReport(summary, '2026-11-12T10:00:00Z') };
  };

  it('hides category breakdowns when the saved total is lower than detailed entries', () => {
    const snapshot = snapshotFor(60, [60, 30]);
    const { summary, report } = reportFor(snapshot);

    expect(snapshot.usageLog[today]).toBe(1);
    expect(snapshot.screenEntries).toHaveLength(2);
    expect(summary.todaySplit.real).toBe(false);
    expect(report.today).toMatchObject({ hours: 1, byCategoryMinutes: null });
  });

  it('keeps a zero total authoritative and excludes marker data from parent output', () => {
    const snapshot = snapshotFor(0, [60]);
    const { summary, report } = reportFor(snapshot);

    expect(snapshot.usageLog[today]).toBe(0);
    expect(snapshot.screenEntries).toHaveLength(1);
    expect(summary.todaySplit.real).toBe(false);
    expect(report.today).toMatchObject({ hours: 0, entered: true, byCategoryMinutes: null });
    expect(JSON.stringify({ summary, report })).not.toContain(DAILY_TOTAL_NOTE_PREFIX);
  });

  it('shows detailed categories when they exactly match the saved total', () => {
    const { summary, report } = reportFor(snapshotFor(60, [60]));

    expect(summary.today.usage).toBe(1);
    expect(summary.todaySplit.real).toBe(true);
    expect(report.today.byCategoryMinutes).toEqual({ Learning: 60, Videos: 0, Games: 0, Other: 0 });
  });

  it('hides partial category data when detailed entries are below the saved total', () => {
    const { summary, report } = reportFor(snapshotFor(120, [60]));

    expect(summary.today.usage).toBe(2);
    expect(summary.todaySplit.real).toBe(false);
    expect(report.today.byCategoryMinutes).toBeNull();
  });
});

describe('saved data', () => {
  it('accepts the sample state and rejects old or broken data', () => {
    expect(rules.isDemoState(base())).toBe(true);
    expect(rules.isDemoState({ goal: 3, usage: 2, moods: [], routines: [] })).toBe(false);
    expect(rules.isDemoState({ ...base(), goal: -1 })).toBe(false);
  });

  it('sample dates are relative to today', () => {
    expect(base().moods[0]?.date).toBe(addDays(today, -1));
  });
});
