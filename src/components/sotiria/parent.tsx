/**
 * Parent screens. They read only `useParentView().summary` — the privacy-safe projection —
 * so mood check-ins and reflections can never reach these views or the export.
 */
import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Clock3, TrendingDown, TrendingUp, Sprout, Palette, Heart, ShieldCheck, ArrowRight, Plus, Pencil, Trash2, CalendarDays, Download, Check, BookOpen, Coffee, RefreshCw, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useParentView } from '@/components/demo-provider';
import { conversationPrompts, routineDayOptions, type RoutineDays } from '@/data/demo';
import { buildFamilyReport, categorySplit, type ParentSummary } from '@/lib/wellbeing';
import { friendlyDate, dayOfMonth } from '@/lib/dates';
import { useDraft } from '@/hooks/use-draft';
import { AppLayout } from './layout';
import { PageHeading, Panel, Progress, GoalControl, ResetDemoButton } from './common';
import { FamilyManagement, ParentNameForm } from './family';
import { UsageChart, categoryChartData, weekChartData } from './charts';
import { PrivacyColumns } from './privacy';
import { toast } from 'sonner';

function ParentStats({ summary }: { summary: ParentSummary }) {
  const { weekly, today, goal, offline } = summary;
  const Trend = weekly.trend !== null && weekly.trend > 0 ? TrendingUp : TrendingDown;
  const stats = [
    { label: 'Average daily screen time', value: weekly.average === null ? '—' : `${weekly.average}h`, note: `${weekly.daysWithinGoal} of ${weekly.recordedDays} days within goal`, icon: Clock3 },
    { label: 'Weekly screen-time trend', value: weekly.trend === null ? '—' : `${weekly.trend > 0 ? '+' : weekly.trend < 0 ? '−' : ''}${Math.abs(weekly.trend)}%`, note: 'vs. the previous 7 days', icon: Trend },
    { label: 'Daily goal progress', value: today.recorded ? `${Math.round(today.percentage)}%` : '—', note: today.recorded ? `${today.usage}h of ${goal}h agreed goal` : `Not added yet · goal ${goal}h`, icon: Sprout },
    { label: 'Offline activities', value: `${offline.thisWeek}`, note: `${offline.minutesThisWeek} min in the last 7 days`, icon: Palette },
  ];
  return <div className="stats-grid">{stats.map(({ label, value, note, icon: Icon }) => <Panel key={label} className="stat-card"><div className="stat-card-header"><span>{label}</span><Icon className="shrink-0" aria-hidden="true" /></div><strong>{value}</strong><small>{note}</small></Panel>)}</div>;
}

function WeekPanel({ summary, title, action }: { summary: ParentSummary; title: string; action?: ReactNode }) {
  const [selected, setSelected] = useState<string>();
  const picked = summary.week.find(d => d.date === selected);
  return (
    <Panel title={title} action={action}>
      <UsageChart label={`${summary.childName}'s screen time this week`} data={weekChartData(summary.week, summary.childName)} goal={summary.goal} selectedKey={selected} onSelect={key => setSelected(key === selected ? undefined : key)} />
      <div className="balance-legend mt-5"><span><i className="legend-dot" />Screen time</span><span><i className="legend-dot teal" />Agreed family goal · {summary.goal}h</span></div>
      <p className="panel-subtitle mt-3">{picked ? `${friendlyDate(picked.date, summary.today.date)}: ${picked.recorded ? `${picked.hours} hours · ${picked.withinGoal ? 'within the agreed goal' : 'a conversation opportunity'}` : 'not added yet'}. ` : 'Tap a bar for details. '}Earlier days are sample data · today is entered by {summary.childName}.</p>
    </Panel>
  );
}

export function ParentDashboard() {
  const { summary, today } = useParentView();
  const [promptOffset, setPromptOffset] = useState(0);
  const prompt = conversationPrompts[(dayOfMonth(today) + promptOffset) % conversationPrompts.length];
  const habits = [
    { name: 'Offline adventures this week', value: Math.min(100, summary.offline.thisWeek / 7 * 100), label: `${summary.offline.thisWeek} activities` },
    { name: 'Family routines today', value: summary.routineProgress.percent, label: `${summary.routineProgress.done} of ${summary.routineProgress.due}` },
    { name: 'Online safety lessons', value: summary.learning.percent, label: `${summary.learning.completed} of ${summary.learning.total}` },
    { name: 'Breaks taken this week', value: Math.min(100, summary.breaks.thisWeek / 7 * 100), label: summary.breaks.reminders ? `${summary.breaks.thisWeek} · reminders on` : `${summary.breaks.thisWeek} · reminders off` },
  ];
  return (
    <AppLayout role="parent">
      <PageHeading title={`Welcome back, ${summary.parentName}!`} subtitle={`A thoughtful look at ${summary.childName}’s digital wellbeing. Growing together, one day at a time.`} />
      <div className="mb-6"><FamilyManagement /></div>
      <ParentStats summary={summary} />
      <div className="content-grid">
        <div className="stack">
          <WeekPanel summary={summary} title={`${summary.childName}’s digital week`} action={<Button asChild variant="link" size="sm"><Link to="/parent/reports">Full report <ArrowRight /></Link></Button>} />
          <Panel title="Little habits, meaningful progress" icon={Sprout}>
            {habits.map(item => <div key={item.name}><div className="flex justify-between text-xs"><span>{item.name}</span><strong>{item.label}</strong></div><Progress value={item.value} teal label={item.name} /></div>)}
          </Panel>
          <Panel title="Recent offline adventures" icon={Palette}>
            {summary.offline.recent.length ? summary.offline.recent.map(a => <div className="history-row" key={`${a.title}-${a.date}`}><Palette className="size-5 shrink-0 text-primary" aria-hidden="true" /><div><strong>{a.title}</strong><p>{friendlyDate(a.date, today)} · {a.minutes} min · {a.category}</p></div></div>) : <p className="panel-subtitle">No offline activities this week yet. Maybe pick one together?</p>}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="A conversation worth having" icon={Heart}>
            <span className="tag mb-4">TODAY'S GENTLE PROMPT</span>
            <h3 className="small-heading leading-7" aria-live="polite">“{prompt}”</h3>
            <p className="panel-subtitle mt-4">Start with curiosity. Listening to your child’s digital experiences helps build trust and confidence.</p>
            <Button variant="ghost" size="sm" className="mt-3 px-0" onClick={() => setPromptOffset(o => o + 1)}><RefreshCw />Another idea</Button>
            <div className="positive-note">Make a little room to listen, without needing to fix anything.</div>
          </Panel>
          <Panel title="Your family, in rhythm" icon={CalendarDays}>
            {summary.routines.length ? summary.routines.slice(0, 4).map(r => <div className="history-row" key={r.id}>{r.doneToday ? <Check className="size-5 shrink-0 text-accent-foreground" aria-label="Done today" /> : <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden="true" />}<div><strong>{r.name}</strong><p>{r.time} · {r.days} · {!r.dueToday ? 'not today' : r.doneToday ? 'done today' : 'still to do'}</p></div></div>) : <p className="panel-subtitle">No routines yet.</p>}
            <Button variant="link" asChild className="mt-3 px-0"><Link to="/parent/routines">Manage family routines <ArrowRight /></Link></Button>
          </Panel>
          <p className="positive-note"><ShieldCheck className="size-5 shrink-0" />Guidance, not surveillance. {summary.childName}’s mood check-ins and reflections are never shown here.</p>
        </div>
      </div>
    </AppLayout>
  );
}

function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { summary, update } = useParentView();
  const download = () => {
    const report = buildFamilyReport(summary, new Date().toISOString());
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sotiria-family-report-${summary.today.date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onOpenChange(false);
    toast.success('Your family report is downloaded. No moods or reflections are included.');
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Export the family report</DialogTitle><DialogDescription>A JSON file you can keep or share. Here’s exactly what goes in it.</DialogDescription></DialogHeader>
        <div className="modal-body">
          <PrivacyColumns audience="parent" />
          <div className="setting-row"><div><h3>Family data consent</h3><p>Confirm you’ve talked with {summary.childName} about keeping this report.</p></div><Switch checked={summary.settings.consent} onCheckedChange={consent => update({ consent })} aria-label="Family data consent" /></div>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={download} disabled={!summary.settings.consent}><Download />Download report</Button></div>
          {!summary.settings.consent && <p className="text-xs">Turn on family data consent to download.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReportsPage() {
  const { summary, today } = useParentView();
  const [view, setView] = useState<'day' | 'week'>('week');
  const [exportOpen, setExportOpen] = useState(false);
  return (
    <AppLayout role="parent">
      <PageHeading title="A clearer picture of the week" subtitle="Helpful insights to guide your family’s next conversation." action={<Button variant="outline" onClick={() => setExportOpen(true)}><Download />Export report</Button>} />
      <ParentStats summary={summary} />
      {view === 'week'
        ? <WeekPanel summary={summary} title="Screen-time overview" action={<ViewToggle view={view} setView={setView} />} />
        : <Panel title="Today, by type" action={<ViewToggle view={view} setView={setView} />}>{summary.today.usage > 0 ? <UsageChart label="Today's screen time by type" data={categoryChartData(categorySplit(summary.today.usage))} /> : <p className="empty-state">{summary.childName} hasn’t added today’s screen time yet.</p>}<p className="panel-subtitle mt-3">An illustrative split of today’s {summary.today.usage}h total. Sotiría doesn’t look inside apps.</p></Panel>}
      <div className="content-grid mt-6">
        <div className="stack">
          <Panel title="The week at a glance">
            {summary.week.map(day => <div className="stat-line" key={day.date}><span>{friendlyDate(day.date, today)}</span><strong>{day.recorded ? `${day.hours} hours` : 'Not added yet'} <span className="ml-3 text-xs font-normal">{!day.recorded ? '' : day.withinGoal ? 'Within agreed goal' : 'A conversation opportunity'}</span></strong></div>)}
          </Panel>
          <Panel title="Learning and offline time" icon={BookOpen}>
            <div className="stat-line"><span>Online safety lessons explored</span><strong>{summary.learning.completed} of {summary.learning.total}</strong></div>
            <div className="stat-line"><span>Offline activities (7 days)</span><strong>{summary.offline.thisWeek} · {summary.offline.minutesThisWeek} min</strong></div>
            <div className="stat-line"><span>Breaks taken (7 days)</span><strong>{summary.breaks.thisWeek}</strong></div>
            <div className="stat-line"><span>Routines done today</span><strong>{summary.routineProgress.done} of {summary.routineProgress.due}</strong></div>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Keep the conversation open" icon={Heart}><p className="panel-subtitle">Some days have more screen time than others. Ask what your child enjoyed, what they learned, and what they’d like to do offline tomorrow.</p></Panel>
          <Panel title="Privacy by design" icon={ShieldCheck}><p className="panel-subtitle">Reports only include what’s listed below. {summary.childName}’s mood journal is never part of this view or any download.</p><PrivacyColumns audience="parent" /></Panel>
        </div>
      </div>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </AppLayout>
  );
}

function ViewToggle({ view, setView }: { view: 'day' | 'week'; setView: (v: 'day' | 'week') => void }) {
  return <div className="segmented" role="group" aria-label="Chart view"><Button size="sm" variant="ghost" aria-pressed={view === 'day'} className={view === 'day' ? 'selected' : ''} onClick={() => setView('day')}>Today</Button><Button size="sm" variant="ghost" aria-pressed={view === 'week'} className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')}>This week</Button></div>;
}

export function RoutinesPage() {
  const { summary, toggleRoutine, saveRoutine, deleteRoutine } = useParentView();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');
  const [time, setTime] = useState('18:00');
  const [days, setDays] = useState<RoutineDays>('Every day');
  const [deleteId, setDeleteId] = useState<string>();
  const add = () => { setEditing(undefined); setName(''); setTime('18:00'); setDays('Every day'); setOpen(true); };
  const edit = (routine: ParentSummary['routines'][number]) => { setEditing(routine.id); setName(routine.name); setTime(routine.time); setDays(routine.days); setOpen(true); };
  const toDelete = summary.routines.find(r => r.id === deleteId);
  return (
    <AppLayout role="parent">
      <PageHeading title="A rhythm that works for your family" subtitle="Make room for connection. Agree on small, positive routines together." action={<Button variant="hero" onClick={add}><Plus />Add routine</Button>} />
      <div className="content-grid">
        <div className="stack">
          <Panel title="Your family routines" icon={CalendarDays}>
            {summary.routines.length ? summary.routines.map(routine => <div className="routine-row" key={routine.id}>
              <Checkbox checked={routine.doneToday} aria-label={`Mark ${routine.name} as done today`} onCheckedChange={checked => { toggleRoutine(routine.id, checked === true); if (checked === true) toast.success('Another little moment together.'); }} />
              <div className="min-w-0"><h3 className="break-words">{routine.name}</h3><p>{routine.time} · {routine.days} · {routine.dueToday ? (routine.doneToday ? 'Done today' : 'Due today') : 'Not planned today'} · {routine.thisWeek} of last 7 days</p></div>
              <div className="routine-actions"><Button variant="ghost" size="icon" aria-label={`Edit ${routine.name}`} title="Edit routine" onClick={() => edit(routine)}><Pencil /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${routine.name}`} title="Delete routine" onClick={() => setDeleteId(routine.id)}><Trash2 /></Button></div>
            </div>) : <p className="empty-state">Make a little room for your first family routine.</p>}
            <Button variant="link" className="mt-4 px-0" onClick={add}><Plus />Create another little habit</Button>
          </Panel>
          <Panel title="Celebrate the little steps" icon={Sprout}>
            <div className="flex justify-between text-sm"><span>{summary.routineProgress.done} of {summary.routineProgress.due} routines planned for today completed</span><strong>{summary.routineProgress.percent}%</strong></div>
            <Progress value={summary.routineProgress.percent} teal label="Routines completed today" />
            <p className="panel-subtitle">Progress isn’t about perfect days. Every little moment together counts. {summary.childName} can tick routines off too.</p>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Your agreed screen-time goal" icon={Clock3}><GoalControl /></Panel>
          <Panel title="Build the routine together" icon={Heart}><p className="panel-subtitle">Let your child help choose when to put screens aside and what to do instead. A routine you both believe in is easier to enjoy.</p><ul className="check-list"><li><Check /> Start with one small habit</li><li><Check /> Keep room for flexibility</li><li><Check /> Notice effort, not perfection</li></ul></Panel>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit your family routine' : 'A new little family habit'}</DialogTitle><DialogDescription>Choose something you can enjoy and agree on together.</DialogDescription></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (!name.trim()) { toast.error('Please give the routine a name.'); return; } saveRoutine({ id: editing, name, time, days }); setOpen(false); toast.success(editing ? 'Your routine is updated.' : 'A new family routine is ready.'); }}>
            <label className="field">Routine name<input required value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="A walk after dinner" /></label>
            <label className="field">Time<input type="time" required value={time} onChange={e => setTime(e.target.value)} /></label>
            <label className="field">Repeat<select value={days} onChange={e => setDays(e.target.value as RoutineDays)}>{routineDayOptions.map(option => <option key={option}>{option}</option>)}</select></label>
            <Button type="submit">Save routine <Check /></Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(undefined)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove “{toDelete?.name}”?</DialogTitle><DialogDescription>You can always create a new routine that fits your family better.</DialogDescription></DialogHeader>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setDeleteId(undefined)}>Keep routine</Button><Button variant="destructive" onClick={() => { if (deleteId) deleteRoutine(deleteId); setDeleteId(undefined); toast.success('Routine removed.'); }}>Remove routine</Button></div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export function ParentSettingsPage() {
  const { summary, update } = useParentView();
  return (
    <AppLayout role="parent">
      <PageHeading title="Settings & privacy" subtitle="A calm place to shape how Sotiría works for your family." />
      <div className="content-grid">
        <div className="stack">
          <Panel title="Your account" icon={Heart}>
            <ParentNameForm key={summary.parentName} initial={summary.parentName} />
          </Panel>
          <FamilyManagement />
          <Panel title="Family notifications" icon={CalendarDays}>
            <div className="setting-row"><div><h3>Family updates</h3><p>A gentle summary in the bell at the top of the page.</p></div><Switch checked={summary.settings.weeklySummary} onCheckedChange={weeklySummary => update({ weeklySummary })} aria-label="Family updates" /></div>
            <div className="setting-row"><div><h3>Break reminders for {summary.childName}</h3><p>A nudge every 25 minutes while the child view is open. {summary.childName} can change this too.</p></div><Switch checked={summary.settings.breakReminders} onCheckedChange={breakReminders => update({ breakReminders })} aria-label={`Break reminders for ${summary.childName}`} /></div>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Privacy by design" icon={ShieldCheck}>
            <div className="setting-row"><div><h3>Family data consent</h3><p>Required before downloading a family report. In a real account, you’d also confirm how family data is used.</p></div><Switch checked={summary.settings.consent} onCheckedChange={consent => update({ consent })} aria-label="Family data consent" /></div>
            <PrivacyColumns audience="parent" />
            <p className="positive-note"><LockKeyhole className="size-4 shrink-0" />No hidden monitoring: Sotiría never reads messages, browsing, or apps. {summary.childName} enters screen time themselves.</p>
          </Panel>
          <Panel title="Sample wellbeing data" icon={Coffee}>
            <p className="panel-subtitle mb-4">Charts, routines, and reports use sample data while these features are being connected. It isn’t saved to your account and clears when you log out.</p>
            <ResetDemoButton />
          </Panel>
        </div>
      </div>
    </AppLayout>
  );
}
