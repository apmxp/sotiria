import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useIdentity } from '@/components/identity-provider';
import { toast } from 'sonner';
import { createSampleState, moods as moodValues, type DemoState, type Mood, type ScreenCategory } from '@/data/demo';
import { dayKey } from '@/lib/dates';
import * as rules from '@/lib/wellbeing';
import * as api from '@/lib/wellbeing.functions';
import type { Snapshot } from '@/lib/wellbeing-db';

const STORAGE_KEY = 'sotiria-demo-v2';
const LEGACY_KEYS = ['sotiria-demo-v1'];

/** Settings and profile fields that may be patched directly. */
type EditableFields = Pick<DemoState, 'breakReminders' | 'childNotifications' | 'weeklySummary' | 'consent' | 'lastRole'>;
export interface ScreenEntryInput { category: ScreenCategory; minutes: number; appName: string }

interface DemoContextValue {
  state: DemoState;
  today: string;
  ready: boolean;
  /** True in signed-in spaces, where everything is saved to the family's account. */
  live: boolean;
  update: (patch: Partial<EditableFields>) => void;
  addScreenEntry: (input: ScreenEntryInput) => void;
  updateScreenEntry: (id: string, input: ScreenEntryInput) => void;
  deleteScreenEntry: (id: string) => void;
  recordUsage: (hours: number) => void;
  setGoal: (goal: number) => void;
  saveMood: (mood: Mood, reflection?: string) => void;
  deleteMood: (date: string) => void;
  completeLesson: (id: string, correct?: boolean) => void;
  completeActivity: (id: string) => void;
  logBreak: () => void;
  undoBreak: () => void;
  toggleRoutine: (id: string, done: boolean) => void;
  saveRoutine: (input: rules.RoutineInput) => void;
  deleteRoutine: (id: string) => void;
  reset: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function readSaved(): DemoState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!rules.isDemoState(parsed)) return null;
  return { ...createSampleState(), ...parsed, moods: parsed.moods.filter(m => moodValues.includes(m.mood)) };
}

/** Identity prefix for a scope: changing it (sign-in, sign-out, child switch) drops cached private data. */
export function identityKey(scope: string) {
  if (scope.startsWith('child:')) return scope;
  if (scope.startsWith('parent:')) return scope.split(':').slice(0, 2).join(':');
  return 'public';
}

/** A signed-in space starts empty: no sample history is mixed into real family data. */
function emptyState(): DemoState {
  return { ...createSampleState(), usageLog: {}, screenEntries: [], moods: [], lessons: [], activityLog: [], breakLog: [], routines: [] };
}

/**
 * Wellbeing data provider.
 * - Public pages: the browser-local demo archive (sample family only).
 * - Child space: loaded from and saved to the database through child-session server functions.
 * - Parent space: a mood-free snapshot loaded under the parent's own access rules.
 */
export function DemoProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const { scope } = identity;
  const isPublic = scope === 'public';
  const isChild = scope.startsWith('child:') && !scope.endsWith('loading');
  const parentChildId = scope.startsWith('parent:') && !scope.includes('loading') ? scope.split(':')[2] : undefined;
  const isParent = !!parentChildId && parentChildId !== 'none';
  const isParentSpace = scope.startsWith('parent:');
  const familyId = identity.familyData?.family?.id;
  const [archive, setArchive] = useState<DemoState>(() => createSampleState());
  const [today, setToday] = useState(() => dayKey());
  const [hydrated, setHydrated] = useState(false);
  const cache = useQueryClient();
  const currentIdentity = useRef(identityKey(scope));

  const childSpace = useServerFn(api.getChildSpace);
  const parentSnapshot = useServerFn(api.getParentSnapshot);
  const fns = {
    addScreen: useServerFn(api.addScreenTime), updateScreen: useServerFn(api.updateScreenTime), deleteScreen: useServerFn(api.deleteScreenTime),
    recordUsage: useServerFn(api.recordChildUsage),
    recordBreak: useServerFn(api.recordBreak), undoBreak: useServerFn(api.undoLastBreak),
    saveMood: useServerFn(api.saveChildMood), deleteMood: useServerFn(api.deleteChildMood),
    lesson: useServerFn(api.saveLessonProgress), activity: useServerFn(api.completeChildActivity),
    childRoutine: useServerFn(api.completeChildRoutine), childPrefs: useServerFn(api.saveChildPreferences),
    goal: useServerFn(api.setScreenTimeGoal), saveRoutine: useServerFn(api.saveFamilyRoutine), deleteRoutine: useServerFn(api.deleteFamilyRoutine),
    parentRoutine: useServerFn(api.toggleFamilyRoutine), parentPrefs: useServerFn(api.saveParentPreferences), childBreaks: useServerFn(api.setChildBreakReminders),
  };

  const queryKey = useMemo(() => ['wellbeing', scope] as const, [scope]);
  const snapshot = useQuery<Snapshot>({
    queryKey,
    queryFn: async () => isChild ? (await childSpace()).snapshot : parentSnapshot({ data: { childId: parentChildId! } }),
    enabled: isChild || isParent,
    ...(isChild && identity.childSnapshot ? { initialData: identity.childSnapshot } : {}),
    staleTime: 15_000,
    retry: 1,
  });

  useEffect(() => {
    try {
      LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
      const saved = readSaved();
      if (saved) setArchive(saved);
    } catch { /* keep fresh sample data */ }
    setToday(dayKey());
    setHydrated(true);
    const refreshDay = () => setToday(dayKey());
    const timer = window.setInterval(refreshDay, 60_000);
    window.addEventListener('focus', refreshDay);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refreshDay); };
  }, []);

  // Identity change: drop every cached wellbeing snapshot so the next identity never sees the previous one's data.
  useEffect(() => {
    const key = identityKey(scope);
    if (key !== currentIdentity.current) {
      const previous = currentIdentity.current;
      currentIdentity.current = key;
      if (previous !== 'child:loading' || !scope.startsWith('child:')) cache.removeQueries({ queryKey: ['wellbeing'] });
    }
  }, [scope, cache]);

  useEffect(() => {
    if (!hydrated || !isPublic) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(archive)); } catch { toast.error('This browser could not save your demo changes.'); }
  }, [archive, hydrated, isPublic]);

  const base = useMemo<DemoState>(() => isPublic ? archive : { ...emptyState(), ...(snapshot.data ?? {}) }, [isPublic, archive, snapshot.data]);
  const state = useMemo<DemoState>(() => {
    if (isPublic) return base;
    if (identity.child) return { ...base, name: identity.child.display_name, avatar: identity.child.avatar };
    const family = identity.familyData;
    const childrenList = Array.isArray(family?.children) ? (family.children as Array<{ id: string; display_name: string; avatar: string }>) : [];
    const chosen = childrenList.find(c => c.id === parentChildId);
    return { ...base, parentName: family?.profile.display_name ?? base.parentName, ...(chosen ? { name: chosen.display_name, avatar: chosen.avatar } : { name: 'your child' }) };
  }, [base, isPublic, identity.child, identity.familyData, parentChildId]);
  const ready = hydrated && !scope.includes('loading') && (
    isPublic ||
    (isParentSpace && !isParent) ||
    !snapshot.isLoading
  );

  /** Applies the change locally right away, saves it, then reloads the saved truth (or rolls back on failure). */
  const run = useCallback((local: (prev: DemoState) => DemoState, save?: () => Promise<unknown>, failure = 'That could not be saved. Please try again.') => {
    if (isPublic) { setArchive(prev => local(prev)); return; }
    if (!save) return;
    const previous = cache.getQueryData<Snapshot>(queryKey);
    if (previous) cache.setQueryData<Snapshot>(queryKey, local({ ...emptyState(), ...previous }));
    save().catch((error: unknown) => {
      if (previous) cache.setQueryData(queryKey, previous);
      toast.error(error instanceof Error && error.message ? error.message : failure);
    }).finally(() => { void cache.invalidateQueries({ queryKey }); });
  }, [isPublic, cache, queryKey]);

  const value = useMemo<DemoContextValue>(() => {
    const asChild = <T,>(fn: () => Promise<T>) => isChild ? fn : undefined;
    const asParent = <T,>(fn: () => Promise<T>) => isParent ? fn : undefined;
    return {
      state, today, ready, live: !isPublic,
      update: patch => {
        const childPatch = { ...(patch.breakReminders !== undefined ? { breakReminders: patch.breakReminders } : {}), ...(patch.childNotifications !== undefined ? { childNotifications: patch.childNotifications } : {}) };
        const parentPatch = { ...(patch.weeklySummary !== undefined ? { weeklySummary: patch.weeklySummary } : {}), ...(patch.consent !== undefined ? { consent: patch.consent } : {}) };
        run(prev => ({ ...prev, ...patch }), isChild ? () => fns.childPrefs({ data: childPatch }) : isParent ? async () => {
          if (Object.keys(parentPatch).length) await fns.parentPrefs({ data: parentPatch });
          if (patch.breakReminders !== undefined) await fns.childBreaks({ data: { childId: parentChildId!, breakReminders: patch.breakReminders } });
        } : undefined, 'Your settings could not be saved.');
      },
      addScreenEntry: input => run(prev => rules.addScreenEntry(prev, { id: crypto.randomUUID(), date: today, ...input }), asChild(() => fns.addScreen({ data: { date: today, category: input.category, minutes: input.minutes, ...(input.appName.trim() ? { appName: input.appName.trim() } : {}) } }))),
      updateScreenEntry: (id, input) => run(prev => rules.updateScreenEntry(prev, id, input), asChild(() => fns.updateScreen({ data: { id, category: input.category, minutes: input.minutes, ...(input.appName.trim() ? { appName: input.appName.trim() } : {}) } }))),
      deleteScreenEntry: id => run(prev => rules.deleteScreenEntry(prev, id), asChild(() => fns.deleteScreen({ data: { id } }))),
      recordUsage: hours => run(prev => rules.recordUsage(prev, today, hours), asChild(() => fns.recordUsage({ data: { date: today, hours } }))),
      setGoal: goal => run(prev => rules.setGoal(prev, goal), asParent(() => fns.goal({ data: { childId: parentChildId!, hours: goal } }))),
      saveMood: (mood, reflection) => run(prev => rules.saveMood(prev, today, mood, reflection), asChild(() => fns.saveMood({ data: { date: today, mood, ...(reflection !== undefined ? { reflection } : {}) } }))),
      deleteMood: date => run(prev => rules.deleteMood(prev, date), asChild(() => fns.deleteMood({ data: { date } }))),
      completeLesson: (id, correct = true) => run(prev => correct ? rules.completeLesson(prev, id) : prev, asChild(() => fns.lesson({ data: { lessonKey: id, correct } }))),
      completeActivity: id => run(prev => rules.completeActivity(prev, id, today), asChild(() => fns.activity({ data: { activityKey: id, date: today } }))),
      logBreak: () => run(prev => rules.logBreak(prev, today), asChild(() => fns.recordBreak({ data: { date: today } }))),
      undoBreak: () => run(prev => rules.undoBreak(prev, today), asChild(() => fns.undoBreak({ data: { date: today } }))),
      toggleRoutine: (id, done) => run(prev => rules.toggleRoutine(prev, id, today, done),
        isChild ? () => fns.childRoutine({ data: { routineId: id, date: today, done } }) : isParent ? () => fns.parentRoutine({ data: { routineId: id, date: today, done } }) : undefined),
      saveRoutine: input => run(prev => rules.saveRoutine(prev, input, crypto.randomUUID()), isParent && familyId ? () => fns.saveRoutine({ data: { familyId, ...(input.id ? { id: input.id } : {}), name: input.name, time: input.time, days: input.days } }) : undefined),
      deleteRoutine: id => run(prev => rules.deleteRoutine(prev, id), asParent(() => fns.deleteRoutine({ data: { id } }))),
      reset: () => { if (!isPublic) return; setArchive(createSampleState(dayKey())); toast.success('Sample data reset to a fresh start.'); },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, today, ready, run, isPublic, isChild, isParent, parentChildId, familyId]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('DemoProvider is required');
  return context;
}

/**
 * Parent screens use this instead of useDemo: they receive only the privacy-safe
 * summary (no moods or reflections) plus the actions a parent may take.
 */
export function useParentView() {
  const { state, today, ready, live, update, setGoal, toggleRoutine, saveRoutine, deleteRoutine, reset } = useDemo();
  const summary = useMemo(() => rules.parentSummary(state, today), [state, today]);
  return { summary, today, ready, live, update, setGoal, toggleRoutine, saveRoutine, deleteRoutine, reset };
}
