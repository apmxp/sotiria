/**
 * Wellbeing server functions.
 * - Child functions: identity comes ONLY from the validated HttpOnly child session (requireChild).
 *   They use the service-role client, so every query is explicitly filtered by that child's id/family.
 * - Parent functions: Supabase auth + parent mode; queries run as the parent under RLS.
 *   Parents have no database access to mood_entries, and nothing here ever selects it for them.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { requireChild, requireParentMode } from './identity.server';
import { buildSnapshot, currentDay, DEFAULT_GOAL_MINUTES, MOOD_VALUES, REFLECTION_MAX, SCREEN_CATEGORIES, toRecurrence, type Snapshot } from './wellbeing-db';
import { addDays, dayKey } from './dates';

const uuid = z.string().uuid();
const HISTORY_DAYS = 28;
const fail = (message: string, error?: unknown): never => { if (error) console.error(message, error); throw new Error(message); };
async function admin() { return (await import('@/integrations/supabase/client.server')).supabaseAdmin; }
const since = () => addDays(dayKey(new Date()), -HISTORY_DAYS);

/* ---------------- Child (session cookie) ---------------- */

async function loadChildSnapshot(child: Awaited<ReturnType<typeof requireChild>>): Promise<Snapshot> {
  const db = await admin(); const from = since();
  const [goal, logs, breaks, lessons, acts, routines, moods, prefs] = await Promise.all([
    db.from('screen_time_goals').select('daily_limit_minutes').eq('child_id', child.id).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    db.from('screen_time_logs').select('id,usage_date,category,duration_minutes,app_name').eq('child_id', child.id).gte('usage_date', from).order('created_at'),
    db.from('break_logs').select('completed_on').eq('child_id', child.id).gte('completed_on', from),
    db.from('lesson_progress').select('lessons!inner(key)').eq('child_id', child.id).not('completed_at', 'is', null),
    db.from('activity_completions').select('completed_on,activities!inner(key)').eq('child_id', child.id).order('completed_at', { ascending: false }).limit(200),
    db.from('family_routines').select('id,name,scheduled_time,recurrence,is_active').eq('family_id', child.family_id).order('scheduled_time'),
    db.from('mood_entries').select('entry_date,mood,reflection').eq('child_id', child.id).order('entry_date', { ascending: false }).limit(60),
    db.from('child_profiles').select('preferences').eq('id', child.id).single(),
  ]);
  const err = goal.error || logs.error || breaks.error || lessons.error || acts.error || routines.error || moods.error || prefs.error;
  if (err) fail('Your space could not be loaded. Please try again.', err);
  const ids = (routines.data ?? []).map(r => r.id);
  const completions = ids.length ? await db.from('routine_completions').select('routine_id,completion_date').in('routine_id', ids).or(`child_id.eq.${child.id},child_id.is.null`).gte('completion_date', from) : { data: [], error: null };
  if (completions.error) fail('Your space could not be loaded.', completions.error);
  return buildSnapshot({
    goalMinutes: goal.data?.daily_limit_minutes ?? null, logs: logs.data ?? [], breaks: breaks.data ?? [],
    lessons: (lessons.data ?? []).map(l => ({ key: (l.lessons as unknown as { key: string }).key })),
    activities: (acts.data ?? []).map(a => ({ key: (a.activities as unknown as { key: string }).key, completed_on: a.completed_on })),
    routines: routines.data ?? [], completions: completions.data ?? [], moods: moods.data ?? [],
    childPrefs: (prefs.data?.preferences ?? {}) as Record<string, unknown>,
  });
}

export const getChildSpace = createServerFn({ method: 'POST' }).handler(async () => {
  const child = await requireChild();
  return { child, snapshot: await loadChildSnapshot(child) };
});

const entryFields = { category: z.enum(SCREEN_CATEGORIES), minutes: z.number().int().min(1).max(1440), appName: z.string().trim().max(60).optional() };

export const addScreenTime = createServerFn({ method: 'POST' }).inputValidator(z.object({ date: currentDay, ...entryFields })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const { data: row, error } = await db.from('screen_time_logs').insert({ child_id: child.id, usage_date: data.date, category: data.category, duration_minutes: data.minutes, app_name: data.appName || null, source: 'manual' }).select('id').single();
  if (error) fail('Your screen time could not be saved.', error); return { id: row!.id };
});
export const updateScreenTime = createServerFn({ method: 'POST' }).inputValidator(z.object({ id: uuid, ...entryFields })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const { data: rows, error } = await db.from('screen_time_logs').update({ category: data.category, duration_minutes: data.minutes, app_name: data.appName || null }).eq('id', data.id).eq('child_id', child.id).select('id');
  if (error) fail('Your screen time could not be updated.', error); if (!rows?.length) fail('This entry is not available.'); return { ok: true };
});
export const deleteScreenTime = createServerFn({ method: 'POST' }).inputValidator(z.object({ id: uuid })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const { data: rows, error } = await db.from('screen_time_logs').delete().eq('id', data.id).eq('child_id', child.id).select('id');
  if (error) fail('This entry could not be removed.', error); if (!rows?.length) fail('This entry is not available.'); return { ok: true };
});

export const recordBreak = createServerFn({ method: 'POST' }).inputValidator(z.object({ date: currentDay })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const { error } = await db.from('break_logs').insert({ child_id: child.id, completed_on: data.date }); if (error) fail('Your break could not be saved.', error); return { ok: true };
});
export const undoLastBreak = createServerFn({ method: 'POST' }).inputValidator(z.object({ date: currentDay })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const last = await db.from('break_logs').select('id').eq('child_id', child.id).eq('completed_on', data.date).order('completed_at', { ascending: false }).limit(1).maybeSingle();
  if (last.error) fail('Please try again.', last.error); if (!last.data) return { ok: true };
  const { error } = await db.from('break_logs').delete().eq('id', last.data.id).eq('child_id', child.id); if (error) fail('Please try again.', error); return { ok: true };
});

export const saveChildMood = createServerFn({ method: 'POST' }).inputValidator(z.object({ date: currentDay, mood: z.enum(MOOD_VALUES), reflection: z.string().max(REFLECTION_MAX).optional() })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const row: { child_id: string; entry_date: string; mood: string; reflection?: string } = { child_id: child.id, entry_date: data.date, mood: data.mood };
  if (data.reflection !== undefined) row.reflection = data.reflection.trim();
  const { error } = await db.from('mood_entries').upsert(row, { onConflict: 'child_id,entry_date' }); if (error) fail('Your check-in could not be saved.', error); return { ok: true };
});
export const deleteChildMood = createServerFn({ method: 'POST' }).inputValidator(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const { error } = await db.from('mood_entries').delete().eq('child_id', child.id).eq('entry_date', data.date); if (error) fail('Your check-in could not be deleted.', error); return { ok: true };
});

export const saveLessonProgress = createServerFn({ method: 'POST' }).inputValidator(z.object({ lessonKey: z.string().regex(/^[a-z0-9-]{1,40}$/), correct: z.boolean() })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const lesson = await db.from('lessons').select('id').eq('key', data.lessonKey).eq('is_published', true).maybeSingle();
  if (lesson.error || !lesson.data) fail('This lesson is not available.', lesson.error);
  const existing = await db.from('lesson_progress').select('completed_at,quiz_passed').eq('child_id', child.id).eq('lesson_id', lesson.data!.id).maybeSingle();
  if (existing.error) fail('Your progress could not be saved.', existing.error);
  const passed = data.correct || !!existing.data?.quiz_passed;
  const { error } = await db.from('lesson_progress').upsert({ child_id: child.id, lesson_id: lesson.data!.id, quiz_score: data.correct ? 100 : 0, quiz_passed: passed, completed_at: existing.data?.completed_at ?? (data.correct ? new Date().toISOString() : null) }, { onConflict: 'child_id,lesson_id' });
  if (error) fail('Your progress could not be saved.', error); return { ok: true };
});

export const completeChildActivity = createServerFn({ method: 'POST' }).inputValidator(z.object({ activityKey: z.string().regex(/^[a-z0-9-]{1,40}$/), date: currentDay, reflection: z.string().trim().max(500).optional() })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const activity = await db.from('activities').select('id').eq('key', data.activityKey).eq('is_published', true).maybeSingle();
  if (activity.error || !activity.data) fail('This activity is not available.', activity.error);
  const { error } = await db.from('activity_completions').upsert({ child_id: child.id, activity_id: activity.data!.id, completed_on: data.date, optional_reflection: data.reflection || null }, { onConflict: 'child_id,activity_id,completed_on', ignoreDuplicates: true });
  if (error) fail('Your activity could not be saved.', error); return { ok: true };
});

export const completeChildRoutine = createServerFn({ method: 'POST' }).inputValidator(z.object({ routineId: uuid, date: currentDay, done: z.boolean() })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const routine = await db.from('family_routines').select('id').eq('id', data.routineId).eq('family_id', child.family_id).eq('is_active', true).maybeSingle();
  if (routine.error || !routine.data) fail('This routine is not available.', routine.error);
  const result = data.done
    ? await db.from('routine_completions').upsert({ routine_id: data.routineId, child_id: child.id, completion_date: data.date }, { onConflict: 'routine_id,child_id,completion_date', ignoreDuplicates: true })
    : await db.from('routine_completions').delete().eq('routine_id', data.routineId).eq('child_id', child.id).eq('completion_date', data.date);
  if (result.error) fail('This routine could not be updated.', result.error); return { ok: true };
});

export const saveChildPreferences = createServerFn({ method: 'POST' }).inputValidator(z.object({ breakReminders: z.boolean().optional(), childNotifications: z.boolean().optional() })).handler(async ({ data }) => {
  const child = await requireChild(); const db = await admin();
  const current = await db.from('child_profiles').select('preferences').eq('id', child.id).single(); if (current.error) fail('Your settings could not be saved.', current.error);
  const { error } = await db.from('child_profiles').update({ preferences: { ...(current.data!.preferences as Record<string, unknown>), ...data } }).eq('id', child.id);
  if (error) fail('Your settings could not be saved.', error); return { ok: true };
});

/* ---------------- Parent (Supabase auth, RLS) ---------------- */

export const getParentSnapshot = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ childId: uuid })).handler(async ({ data, context }): Promise<Snapshot> => {
  requireParentMode(); const db = context.supabase; const from = since();
  const allowed = await db.rpc('is_child_parent', { p_child: data.childId });
  if (allowed.error || !allowed.data) fail('This child profile is not available.', allowed.error);
  const profileDb = await admin();
  const child = await profileDb.from('child_profiles').select('id,family_id,preferences').eq('id', data.childId).maybeSingle();
  if (child.error || !child.data) fail('This child profile is not available.', child.error);
  const c = child.data!;
  const [goal, logs, breaks, lessons, acts, routines, profile] = await Promise.all([
    db.from('screen_time_goals').select('daily_limit_minutes').eq('child_id', c.id).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
    db.from('screen_time_logs').select('id,usage_date,category,duration_minutes,app_name').eq('child_id', c.id).gte('usage_date', from),
    db.from('break_logs').select('completed_on').eq('child_id', c.id).gte('completed_on', from),
    db.from('lesson_progress').select('lessons!inner(key)').eq('child_id', c.id).not('completed_at', 'is', null),
    db.from('activity_completions').select('completed_on,activities!inner(key)').eq('child_id', c.id).order('completed_at', { ascending: false }).limit(200),
    db.from('family_routines').select('id,name,scheduled_time,recurrence,is_active').eq('family_id', c.family_id).order('scheduled_time'),
    db.from('profiles').select('preferences').eq('id', context.userId).single(),
  ]);
  const err = goal.error || logs.error || breaks.error || lessons.error || acts.error || routines.error || profile.error;
  if (err) fail('Your family overview could not be loaded.', err);
  const ids = (routines.data ?? []).map(r => r.id);
  const completions = ids.length ? await db.from('routine_completions').select('routine_id,completion_date').in('routine_id', ids).or(`child_id.eq.${c.id},child_id.is.null`).gte('completion_date', from) : { data: [], error: null };
  if (completions.error) fail('Your family overview could not be loaded.', completions.error);
  // Explicit projection: no mood rows are ever requested for a parent.
  return buildSnapshot({
    goalMinutes: goal.data?.daily_limit_minutes ?? null, logs: logs.data ?? [], breaks: breaks.data ?? [],
    lessons: (lessons.data ?? []).map(l => ({ key: (l.lessons as unknown as { key: string }).key })),
    activities: (acts.data ?? []).map(a => ({ key: (a.activities as unknown as { key: string }).key, completed_on: a.completed_on })),
    routines: routines.data ?? [], completions: completions.data ?? [],
    childPrefs: (c.preferences ?? {}) as Record<string, unknown>, parentPrefs: (profile.data?.preferences ?? {}) as Record<string, unknown>,
  });
});

export const setScreenTimeGoal = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ childId: uuid, hours: z.number().min(0.5).max(24) })).handler(async ({ data, context }) => {
  requireParentMode();
  const { error } = await context.supabase.from('screen_time_goals').insert({ child_id: data.childId, daily_limit_minutes: Math.round(data.hours * 60), created_by: context.userId });
  if (error) fail('The goal could not be saved.', error); return { ok: true };
});

const routineInput = z.object({ familyId: uuid, id: uuid.optional(), name: z.string().trim().min(1).max(80), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), days: z.enum(['Every day', 'Weekdays', 'Weekends']) });
export const saveFamilyRoutine = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(routineInput).handler(async ({ data, context }) => {
  requireParentMode(); const fields = { name: data.name, scheduled_time: data.time, recurrence: toRecurrence(data.days), days_of_week: [] as number[] };
  const result = data.id
    ? await context.supabase.from('family_routines').update(fields).eq('id', data.id).eq('family_id', data.familyId).select('id')
    : await context.supabase.from('family_routines').insert({ ...fields, family_id: data.familyId, created_by: context.userId }).select('id');
  if (result.error) fail('This routine could not be saved.', result.error); if (!result.data?.length) fail('This routine is not available.'); return { id: result.data![0]!.id };
});
export const deleteFamilyRoutine = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: uuid })).handler(async ({ data, context }) => {
  requireParentMode(); const { data: rows, error } = await context.supabase.from('family_routines').delete().eq('id', data.id).select('id');
  if (error) fail('This routine could not be deleted.', error); if (!rows?.length) fail('This routine is not available.'); return { ok: true };
});
export const toggleFamilyRoutine = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ routineId: uuid, date: currentDay, done: z.boolean() })).handler(async ({ data, context }) => {
  requireParentMode(); const db = context.supabase;
  const result = data.done
    ? await db.from('routine_completions').upsert({ routine_id: data.routineId, child_id: null, completion_date: data.date }, { onConflict: 'routine_id,child_id,completion_date', ignoreDuplicates: true })
    : await db.from('routine_completions').delete().eq('routine_id', data.routineId).is('child_id', null).eq('completion_date', data.date);
  if (result.error) fail('This routine could not be updated.', result.error); return { ok: true };
});

export const saveParentPreferences = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ weeklySummary: z.boolean().optional(), consent: z.boolean().optional() })).handler(async ({ data, context }) => {
  requireParentMode();
  const current = await context.supabase.from('profiles').select('preferences').eq('id', context.userId).single(); if (current.error) fail('Your settings could not be saved.', current.error);
  const { error } = await context.supabase.from('profiles').update({ preferences: { ...(current.data!.preferences as Record<string, unknown>), ...data } }).eq('id', context.userId);
  if (error) fail('Your settings could not be saved.', error); return { ok: true };
});
export const setChildBreakReminders = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ childId: uuid, breakReminders: z.boolean() })).handler(async ({ data, context }) => {
  requireParentMode();
  const allowed = await context.supabase.rpc('is_child_parent', { p_child: data.childId });
  if (allowed.error || !allowed.data) fail('This child profile is not available.', allowed.error);
  const db = await admin();
  const current = await db.from('child_profiles').select('preferences').eq('id', data.childId).single(); if (current.error) fail('Settings could not be saved.', current.error);
  const { error } = await db.from('child_profiles').update({ preferences: { ...(current.data!.preferences as Record<string, unknown>), breakReminders: data.breakReminders } }).eq('id', data.childId);
  if (error) fail('Settings could not be saved.', error); return { ok: true };
});

export { DEFAULT_GOAL_MINUTES };
