import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Clock3, Heart, ShieldCheck, Sprout, Palette, Check, LockKeyhole, Coffee, Award, BookOpen, Search, CheckCircle2, CalendarDays, Trash2, Undo2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDemo } from '@/components/demo-provider';
import { activities, avatarOptions, lessons, type Mood } from '@/data/demo';
import { activitiesInLastDays, activityHistory, activityStatus, breaksOn, categorySplit, hasUsage, isRoutineDue, isValidUsage, lessonProgress, offlineMinutesOn, USAGE_MAX, usageOn, weekSeries } from '@/lib/wellbeing';
import { dayOfMonth, friendlyDate, lastDays, weekdayLabel } from '@/lib/dates';
import { useDraft } from '@/hooks/use-draft';
import { PageHeading, Panel, ScreenSummary, MoodSelector, Progress, GoalControl, ResetDemoButton, iconMap, moodIcons } from './common';
import { AppLayout } from './layout';
import { UsageChart, categoryChartData, weekChartData } from './charts';
import { PrivacyColumns } from './privacy';
import drawing from '@/assets/dream-world.jpg';
import { toast } from 'sonner';

type Lesson = (typeof lessons)[number];
type Activity = (typeof activities)[number];

function FamilyRoutinesToday() {
  const { state, today, toggleRoutine } = useDemo();
  const due = state.routines.filter(r => isRoutineDue(r, today));
  return (
    <Panel title="Family routines today" icon={CalendarDays}>
      {due.length ? due.map(r => {
        const done = r.completedOn.includes(today);
        return (
          <label className="routine-row cursor-pointer" key={r.id}>
            <Checkbox checked={done} onCheckedChange={checked => { toggleRoutine(r.id, checked === true); if (checked === true) toast.success('A little family moment, done together.'); }} aria-label={`Mark ${r.name} as done today`} />
            <div className="min-w-0"><h3 className="break-words">{r.name}</h3><p>{r.time} · {done ? 'Done today' : 'Still to enjoy'}</p></div>
            <span />
          </label>
        );
      }) : <p className="empty-state">No family routines planned for today. Enjoy a free day!</p>}
    </Panel>
  );
}

export function ChildDashboard() {
  const { state, today, saveMood } = useDemo();
  const todayMood = state.moods.find(m => m.date === today)?.mood;
  const learning = lessonProgress(state);
  const usage = usageOn(state, today);
  const offlineMinutes = offlineMinutesOn(state, today);
  const offlineHours = Math.round(offlineMinutes / 6) / 10;
  const total = Math.max(usage + offlineHours, 0.1);
  const weekActivities = activitiesInLastDays(state, today).length;
  return (
    <AppLayout role="child">
      <PageHeading title={`Hello, ${state.name}!`} subtitle="Ready for a balanced day? Let’s make a little room for what you love." />
      <div className="dashboard-grid">
        <Panel title="A little balance for today" icon={Clock3}>
          <ScreenSummary />
          <Button asChild variant="link" className="mt-3 px-0"><Link to="/child/screen-time">{hasUsage(state, today) ? 'See my screen time' : 'Add today’s screen time'} <ArrowRight /></Link></Button>
        </Panel>
        <Panel title="How are you feeling today?" icon={Heart}>
          <p className="panel-subtitle">Every feeling belongs here. Take a little moment for yourself.</p>
          <MoodSelector selected={todayMood} onSelect={mood => { saveMood(mood); toast.success('Your check-in is saved. Thank you for sharing with yourself.'); }} />
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Just for you. Your feelings never appear in the parent view.</p>
          <Button asChild variant="link" className="mt-3 px-0"><Link to="/child/mood">{todayMood ? 'Add a reflection in my journal' : 'My mood journal'} <ArrowRight /></Link></Button>
        </Panel>
        <section className="panel recommendation">
          <div className="recommendation-copy">
            <span className="tag"><Palette className="size-3" /> TODAY'S LITTLE ADVENTURE</span>
            <h2>Draw your<br />dream world.</h2>
            <p>A blank page. A few colors.<br />A whole world of possibilities.</p>
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5" />20 minutes · Creativity</div>
            <Button asChild variant="wellbeing"><Link to="/child/activities">Find an activity <ArrowRight /></Link></Button>
          </div>
          <img src={drawing} alt="A girl drawing a colorful world in her sketchbook" width="1024" height="768" />
        </section>
        <Panel title="Your online safety journey" icon={ShieldCheck}>
          <div className="flex items-center gap-4"><div className="lesson-icon mb-0"><ShieldCheck /></div><div><h3 className="small-heading">Growing safer, one lesson at a time.</h3><p className="panel-subtitle mt-2">You’ve explored {learning.completed} of {learning.total} lessons.</p></div></div>
          <Progress value={learning.percent} label="Online safety lessons explored" />
          <div className="mb-5 flex justify-between text-xs text-muted-foreground"><span>{learning.completed} lessons completed</span><span>{learning.percent}%</span></div>
          <Button asChild variant="outline"><Link to="/child/online-safety">{learning.next ? 'Continue Learning' : 'Explore lessons again'} <ArrowRight /></Link></Button>
        </Panel>
        <Panel title="A day with a bit of everything" icon={Sprout} className="balance-panel">
          <div className="balance-grid">
            <div>
              <div className="flex justify-between text-sm"><span>Digital adventures</span><strong>{usage} hours</strong></div>
              <Progress value={usage / total * 100} label="Share of today spent on screens" />
              <div className="flex justify-between text-sm"><span>Offline discoveries</span><strong>{offlineMinutes ? `${offlineMinutes} min` : 'Not yet today'}</strong></div>
              <Progress value={offlineHours / total * 100} teal label="Share of today spent on offline activities" />
            </div>
            <div className="flex items-center gap-5">
              <div className="feature-icon mb-0 shrink-0 bg-mint text-accent-foreground"><Sprout /></div>
              <div><h3 className="small-heading">There’s a whole world beyond the screen.</h3><p className="panel-subtitle mt-2">You’ve completed {weekActivities} offline {weekActivities === 1 ? 'activity' : 'activities'} this week. Keep following your curiosity!</p></div>
            </div>
          </div>
        </Panel>
        <div className="balance-panel"><FamilyRoutinesToday /></div>
      </div>
    </AppLayout>
  );
}

export function ScreenTimePage() {
  const { state, today, recordUsage, update, logBreak, undoBreak } = useDemo();
  const [view, setView] = useState<'day' | 'week'>('week');
  const [selected, setSelected] = useState<string>();
  const todayUsage = usageOn(state, today);
  const [usage, setUsage] = useDraft<number | ''>(hasUsage(state, today) ? todayUsage : '');
  const week = weekSeries(state, today);
  const split = categorySplit(todayUsage);
  const breaksToday = breaksOn(state, today);
  const picked = week.find(d => d.date === selected);
  return (
    <AppLayout role="child">
      <PageHeading title="My screen time" subtitle="Understand your digital day. Find a balance that feels right." />
      <div className="content-grid">
        <div className="stack">
          <Panel title="Today, at a glance" icon={Clock3}><ScreenSummary /></Panel>
          <Panel title={view === 'week' ? 'Your digital week' : 'Your day, by type'} action={<div className="segmented" role="group" aria-label="Chart view"><Button variant="ghost" size="sm" aria-pressed={view === 'day'} className={view === 'day' ? 'selected' : ''} onClick={() => setView('day')}>Today</Button><Button variant="ghost" size="sm" aria-pressed={view === 'week'} className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')}>This week</Button></div>}>
            {view === 'week'
              ? <UsageChart label="Screen time this week" data={weekChartData(week, state.name)} goal={state.goal} selectedKey={selected} onSelect={key => setSelected(key === selected ? undefined : key)} />
              : todayUsage > 0 ? <UsageChart label="Today's screen time by type" data={categoryChartData(split)} /> : <p className="empty-state">Add today’s screen time to see your day by type.</p>}
            <div className="balance-legend mt-5"><span><i className="legend-dot" />Screen time</span>{view === 'week' && <span><i className="legend-dot teal" />Family goal · {state.goal}h</span>}</div>
            {view === 'week' && <p className="panel-subtitle mt-3">{picked ? `${friendlyDate(picked.date, today)}: ${picked.recorded ? `${picked.hours} hours · ${picked.withinGoal ? 'within your goal' : 'a little over your goal'}` : 'not added yet'}.` : 'Tap a bar to see that day.'} Earlier days are sample data · today is what you enter.</p>}
          </Panel>
          <Panel title="A little of everything" icon={Palette}>
            {todayUsage > 0 ? split.map(item => <div key={item.label}><div className="flex justify-between text-xs"><span>{item.label}</span><strong>{item.minutes} min</strong></div><Progress value={item.share * 100} label={`${item.label} share of today`} /></div>) : <p className="panel-subtitle">Nothing to split yet — add today’s total first.</p>}
            <p className="panel-subtitle">An illustrative split of the total you entered. Sotiría doesn’t look inside your apps.</p>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Add your own screen time" icon={Clock3}>
            <p className="panel-subtitle">This demo doesn’t track devices. You can enter today’s total yourself.</p>
            <form onSubmit={e => { e.preventDefault(); const value = Number(usage); if (usage === '' || !isValidUsage(value)) { toast.error(`Enter a total between 0 and ${USAGE_MAX} hours.`); return; } recordUsage(value); toast.success('Today’s screen time is saved.'); }}>
              <label className="field">Total today (hours)<input type="number" inputMode="decimal" min="0" max={USAGE_MAX} step="0.1" value={usage} placeholder="e.g. 1.5" onChange={e => setUsage(e.target.value === '' ? '' : Number(e.target.value))} required /><small>Your family sees this total, never what you watched or played.</small></label>
              <Button type="submit" variant="outline">Save screen time</Button>
            </form>
          </Panel>
          <Panel title="A goal to grow with" icon={Sprout}><GoalControl /></Panel>
          <Panel title="Time for a little pause?" icon={Coffee}>
            <p className="panel-subtitle">Stretch your shoulders, look out of a window, or get a glass of water.</p>
            <div className="setting-row"><div><h3>Break reminders</h3><p>A gentle nudge every 25 minutes while Sotiría is open.</p></div><Switch checked={state.breakReminders} onCheckedChange={breakReminders => update({ breakReminders })} aria-label="Break reminders" /></div>
            <p className="mt-4 text-sm"><strong>{breaksToday}</strong> {breaksToday === 1 ? 'break' : 'breaks'} taken today</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { logBreak(); toast.success('A little pause can make a big difference.'); }}><Coffee />I took a break</Button>
              {breaksToday > 0 && <Button variant="ghost" onClick={() => { undoBreak(); toast('Last break removed.'); }}><Undo2 />Undo</Button>}
            </div>
          </Panel>
        </div>
      </div>
    </AppLayout>
  );
}

export function MoodPage() {
  const { state, today, saveMood, deleteMood } = useDemo();
  const entry = state.moods.find(m => m.date === today);
  const [selected, setSelected] = useDraft<Mood | undefined>(entry?.mood);
  const [reflection, setReflection] = useDraft(entry?.reflection ?? '');
  const [deleteDate, setDeleteDate] = useState<string>();
  return (
    <AppLayout role="child">
      <PageHeading title="A moment for you" subtitle="Every feeling is part of your story. You can check in whenever you like." />
      <div className="content-grid">
        <div className="stack">
          <Panel title="How are you feeling today?" icon={Heart}>
            <MoodSelector selected={selected} onSelect={setSelected} />
            {selected ? <>
              <label className="field">Would you like to tell us a little more?<textarea value={reflection} onChange={e => setReflection(e.target.value)} placeholder="Write anything you’d like to remember about today…" maxLength={2000} /><small>This is optional. You can save just your feeling. {reflection.length}/2000</small></label>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => { saveMood(selected, reflection.trim()); toast.success('Your check-in is saved. Thank you for sharing with yourself.'); }} variant="hero">Save my check-in <Check /></Button>
                <Button variant="ghost" onClick={() => { saveMood(selected, ''); setReflection(''); toast.success('Your feeling is saved, without a note.'); }}>Save without a note</Button>
              </div>
            </> : <p className="panel-subtitle">Choose a feeling to begin. There’s no right or wrong answer.</p>}
            <p className="positive-note"><LockKeyhole className="size-4 shrink-0" />Your feelings and notes never appear in the parent view or reports. They’re saved only in this browser, so use a device you trust.</p>
          </Panel>
          <Panel title="Your feelings this week" icon={CalendarDays}>
            <div className="calendar-grid">{lastDays(today, 7).map(date => { const item = state.moods.find(m => m.date === date); const Icon = item ? moodIcons[item.mood] : Heart; return <div className="calendar-day" key={date} title={item?.mood || 'No check-in'} aria-label={`${weekdayLabel(date)} ${dayOfMonth(date)}: ${item?.mood || 'no check-in'}`}><span>{weekdayLabel(date)}</span><Icon className={item ? '' : 'opacity-30'} /><span>{dayOfMonth(date)}</span></div>; })}</div>
          </Panel>
          <Panel title="Your recent check-ins">
            {state.moods.length ? state.moods.slice(0, 8).map(item => { const Icon = moodIcons[item.mood]; return <div className="history-row" key={item.date}><span className="mood-face shrink-0"><Icon /></span><div className="min-w-0 flex-1"><strong>{item.mood} <span className="ml-2 text-xs font-normal text-muted-foreground">{friendlyDate(item.date, today)}</span></strong>{item.reflection && <p className="break-words">{item.reflection}</p>}</div><Button variant="ghost" size="icon" aria-label={`Delete check-in from ${friendlyDate(item.date, today)}`} title="Delete check-in" onClick={() => setDeleteDate(item.date)}><Trash2 /></Button></div>; }) : <p className="panel-subtitle">Your story starts whenever you’re ready. There’s no rush.</p>}
          </Panel>
        </div>
        <div className="stack">
          <Panel title="A little care goes a long way" icon={Sprout}>
            <p className="panel-subtitle">Here are a few things you could try. Choose whatever feels right for you.</p>
            <ul className="check-list"><li><Coffee /> Take a short break</li><li><Heart /> Talk with someone you trust</li><li><Palette /> Try something creative</li><li><Sprout /> Spend a little time outdoors</li></ul>
            <Button asChild variant="wellbeing"><Link to="/child/activities">Find a little adventure <ArrowRight /></Link></Button>
          </Panel>
          <Panel title="You don’t have to do it alone" icon={Heart}><p className="panel-subtitle">If a feeling is hard to sit with, talk to a parent, teacher, or another adult you trust. Asking for a little help is always okay.</p></Panel>
        </div>
      </div>
      <Dialog open={!!deleteDate} onOpenChange={open => !open && setDeleteDate(undefined)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this check-in?</DialogTitle><DialogDescription>Your feeling and any note for this day will be removed from this browser.</DialogDescription></DialogHeader>
          <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setDeleteDate(undefined)}>Keep it</Button><Button variant="destructive" onClick={() => { if (deleteDate) deleteMood(deleteDate); setDeleteDate(undefined); toast.success('Check-in deleted.'); }}>Delete check-in</Button></div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export function SafetyPage() {
  const { state, completeLesson } = useDemo();
  const learning = lessonProgress(state);
  const [active, setActive] = useState<Lesson | null>(null);
  const [answer, setAnswer] = useState<number>();
  const [step, setStep] = useState<'read' | 'quiz' | 'done'>('read');
  const open = (lesson: Lesson) => { setActive(lesson); setAnswer(undefined); setStep('read'); };
  const nextLesson = active ? lessons.find(l => l.id !== active.id && !state.lessons.includes(l.id)) : undefined;
  return (
    <AppLayout role="child">
      <PageHeading title="A smarter, safer digital world" subtitle="Learn to be smart and safe online. Curiosity is your superpower." />
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Panel title="Your learning journey" icon={BookOpen}>
          <div className="flex justify-between text-sm"><span>{learning.completed} of {learning.total} lessons explored</span><strong>{learning.percent}%</strong></div>
          <Progress value={learning.percent} label="Lessons explored" />
          <p className="panel-subtitle">{learning.quizzes} {learning.quizzes === 1 ? 'quiz' : 'quizzes'} completed. At your own pace, one discovery at a time.</p>
        </Panel>
        <Panel title="Little milestones" icon={Award}>
          <div className="flex flex-wrap gap-2">{learning.badges.map(badge => <span className={`tag ${badge.earned ? '' : 'badge-locked'}`} key={badge.name} title={badge.earned ? 'Earned' : badge.hint}><Award className="size-3.5" />{badge.name}{!badge.earned && <span className="sr-only"> (not yet earned: {badge.hint})</span>}</span>)}</div>
          <p className="panel-subtitle mt-4">{learning.badges.filter(b => b.earned).length} of {learning.badges.length} milestones earned.{learning.badges.find(b => !b.earned) ? ` Next: ${learning.badges.find(b => !b.earned)?.hint}.` : ' You’ve earned them all!'}</p>
        </Panel>
      </div>
      <div className="card-grid">
        {lessons.map(lesson => {
          const Icon = iconMap[lesson.icon] || ShieldCheck;
          const completed = state.lessons.includes(lesson.id);
          return <Panel key={lesson.id} className="lesson-card"><div className="lesson-icon"><Icon /></div><span className="tag mb-3">{lesson.category}</span><h2>{lesson.title}</h2><p>{lesson.description}</p><div className="card-meta"><span><Clock3 />{lesson.minutes} min</span><span>{completed ? <><CheckCircle2 />Explored</> : 'Ready to discover'}</span></div><Button variant={completed ? 'outline' : 'hero'} onClick={() => open(lesson)}>{completed ? 'Explore again' : 'Start Lesson'} <ArrowRight /></Button></Panel>;
        })}
      </div>
      <p className="positive-note mt-6"><Heart className="size-4 shrink-0" />If something online makes you uncomfortable, you can always talk to a trusted adult.</p>
      <Dialog open={!!active} onOpenChange={isOpen => !isOpen && setActive(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{active?.title}</DialogTitle><DialogDescription>{active?.category} · {step === 'read' ? 'Step 1 of 2: read' : step === 'quiz' ? 'Step 2 of 2: quick question' : 'Lesson complete'}</DialogDescription></DialogHeader>
          {active && <div className="modal-body">
            {step === 'done' ? <>
              <Award className="size-12 text-primary" />
              <h3 className="small-heading">A new discovery, well done!</h3>
              <p>You explored “{active.title}”. Keep this little lesson with you.</p>
              <div className="flex flex-wrap gap-3">{nextLesson && <Button onClick={() => open(nextLesson)}>Next lesson: {nextLesson.title} <ArrowRight /></Button>}<Button variant="outline" onClick={() => setActive(null)}>Back to learning</Button></div>
            </> : step === 'read' ? <>
              <p>{active.content}</p>
              <Button onClick={() => setStep('quiz')}>Try a quick question <ArrowRight /></Button>
            </> : <>
              <h3 className="small-heading">{active.question}</h3>
              <div className="grid gap-2" role="radiogroup" aria-label="Answers">{active.answers.map((text, index) => <Button key={text} role="radio" aria-checked={answer === index} variant={answer === index ? 'secondary' : 'outline'} className="quiz-option" onClick={() => setAnswer(index)}>{text}</Button>)}</div>
              {answer !== undefined && <div className="positive-note block" aria-live="polite"><strong>{answer === active.correct ? 'That’s a thoughtful choice!' : 'Let’s think about that together. Try another answer.'}</strong><p className="mt-2">{active.explanation}</p></div>}
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" onClick={() => setStep('read')}>Back to the lesson</Button>
                {answer === active.correct && <Button onClick={() => { const isNew = !state.lessons.includes(active.id); completeLesson(active.id); setStep('done'); toast.success(isNew ? 'Lesson completed. You’re growing your online confidence.' : 'Nice refresher! This lesson was already explored.'); }}>Complete Lesson <Check /></Button>}
              </div>
            </>}
          </div>}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export function ActivitiesPage() {
  const { state, today, completeActivity } = useDemo();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [duration, setDuration] = useState('any');
  const [difficulty, setDifficulty] = useState('any');
  const [active, setActive] = useState<Activity | null>(null);
  const categories = ['All', ...new Set(activities.map(a => a.category))];
  const query = search.trim().toLowerCase();
  const filtered = activities.filter(a => (category === 'All' || a.category === category) && (!query || `${a.title} ${a.description} ${a.category}`.toLowerCase().includes(query)) && (duration === 'any' || a.minutes <= Number(duration)) && (difficulty === 'any' || a.difficulty === difficulty));
  const filtersOn = category !== 'All' || !!query || duration !== 'any' || difficulty !== 'any';
  const clearFilters = () => { setCategory('All'); setSearch(''); setDuration('any'); setDifficulty('any'); };
  const history = activityHistory(state).slice(0, 6);
  const weekCount = activitiesInLastDays(state, today).length;
  const activeStatus = active ? activityStatus(state, active.id, today) : null;
  return (
    <AppLayout role="child">
      <PageHeading title="A whole world beyond the screen" subtitle="Discover something fun, follow your curiosity, and make a little magic." action={<span className="tag"><CheckCircle2 className="size-3.5" />{weekCount} completed this week</span>} />
      <section className="panel recommendation mb-6">
        <div className="recommendation-copy"><span className="tag">TODAY'S LITTLE ADVENTURE</span><h2>Dream it. Draw it.<br />Make it your own.</h2><p>Create a world full of your favorite things. All you need is paper and a little imagination.</p><Button variant="wellbeing" onClick={() => setActive(activities[0] ?? null)}>Start Activity <ArrowRight /></Button></div>
        <img src={drawing} alt="A child drawing her imaginary world in a garden" width="1024" height="768" />
      </section>
      <div className="filter-bar">
        <div className="search-field"><Search aria-hidden="true" /><input className="filter-input" type="search" aria-label="Search activities" placeholder="Find your next little adventure…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <select className="filter-input" aria-label="Filter by duration" value={duration} onChange={e => setDuration(e.target.value)}><option value="any">Any duration</option><option value="15">15 min or less</option><option value="30">30 min or less</option></select>
        <select className="filter-input" aria-label="Filter by difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)}><option value="any">Any difficulty</option><option>Easy</option><option>Medium</option></select>
      </div>
      <div className="category-tabs" role="group" aria-label="Activity categories">{categories.map(c => <Button variant={category === c ? 'secondary' : 'ghost'} size="sm" key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</Button>)}</div>
      <p className="mb-4 text-xs text-muted-foreground" aria-live="polite">{filtered.length} {filtered.length === 1 ? 'adventure' : 'adventures'} found{filtersOn && <> · <button type="button" className="font-semibold text-primary" onClick={clearFilters}>Clear filters</button></>}</p>
      <div className="card-grid">
        {filtered.map(activity => {
          const Icon = iconMap[activity.icon] || Palette;
          const status = activityStatus(state, activity.id, today);
          return <section className="panel activity-card" key={activity.id}><div className="activity-art">{activity.id === 'draw' ? <img src={drawing} alt="" width="1024" height="768" loading="lazy" /> : <Icon aria-hidden="true" />}</div><div className="activity-card-body"><span className="tag mb-3">{activity.category}</span><h2>{activity.title}</h2><p>{activity.description}</p><div className="card-meta"><span><Clock3 />{activity.minutes} min</span><span>{activity.difficulty} · {status.doneToday ? 'Done today' : status.timesDone ? `Done ${status.timesDone}×` : 'Ready to try'}</span></div><Button variant={status.doneToday ? 'outline' : 'hero'} onClick={() => setActive(activity)}>{status.doneToday ? 'View Activity' : status.timesDone ? 'Do it again' : 'Start Activity'} <ArrowRight /></Button></div></section>;
        })}
        {!filtered.length && <div className="empty-state"><p>No adventures found. Try another search or category.</p><Button variant="outline" className="mt-4" onClick={clearFilters}>Show all activities</Button></div>}
      </div>
      <Panel title="Your adventure history" icon={History} className="mt-6">
        {history.length ? history.map(item => <div className="history-row" key={`${item.id}-${item.date}`}><CheckCircle2 className="size-5 shrink-0 text-accent-foreground" /><div className="min-w-0"><strong>{item.title}</strong><p>{friendlyDate(item.date, today)} · {item.minutes} min · {item.category}</p></div></div>) : <p className="panel-subtitle">Your first adventure is waiting. Pick anything that sounds fun!</p>}
        <p className="panel-subtitle mt-3">Your family can see which activities you completed — it’s something to celebrate together.</p>
      </Panel>
      <Dialog open={!!active} onOpenChange={open => !open && setActive(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{active?.title}</DialogTitle><DialogDescription>{active?.minutes} min · {active?.difficulty} · {active?.category}</DialogDescription></DialogHeader>
          {active && activeStatus && <div className="modal-body">
            <p><strong>What you’ll need:</strong> {active.materials}</p>
            {active.supervision && <div className="positive-note"><ShieldCheck className="size-5 shrink-0" />Do this activity with a trusted adult. Ask for help with cooking, tools, or outdoor exploring.</div>}
            <ol className="ml-5 list-decimal space-y-3">{active.steps.map(step => <li key={step}>{step}</li>)}</ol>
            {activeStatus.doneToday
              ? <Button variant="secondary" onClick={() => setActive(null)}>Completed today · Close <Check /></Button>
              : <Button variant="wellbeing" onClick={() => { completeActivity(active.id); toast.success('A little adventure completed. Look what you discovered!'); setActive(null); }}>I completed this activity <Check /></Button>}
          </div>}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

export function ChildSettingsPage() {
  const { state, update } = useDemo();
  return (
    <AppLayout role="child">
      <PageHeading title="My little settings" subtitle="Make this space feel like yours." />
      <div className="content-grid">
        <div className="stack">
          <Panel title="About me" icon={Heart}>
            <div className="profile-row"><span className="avatar" aria-hidden="true">{state.avatar}</span><div><p className="font-extrabold">{state.name}</p><p className="text-xs text-muted-foreground">Want a new nickname or picture? Ask your grown-up to change it for you.</p></div></div>
          </Panel>
          <Panel title="Gentle nudges" icon={Coffee}>
            <div className="setting-row"><div><h3>Break reminders</h3><p>A little nudge every 25 minutes to step away and stretch. Your parent can change this too.</p></div><Switch checked={state.breakReminders} onCheckedChange={breakReminders => update({ breakReminders })} aria-label="Break reminders" /></div>
            <div className="setting-row"><div><h3>Little updates</h3><p>Kind reminders in the bell at the top of the page.</p></div><Switch checked={state.childNotifications} onCheckedChange={childNotifications => update({ childNotifications })} aria-label="Little updates" /></div>
          </Panel>
        </div>
        <div className="stack">
          <Panel title="Your privacy" icon={LockKeyhole}>
            <p className="panel-subtitle">Sotiría is built on trust: no hidden tracking, and your feelings stay yours.</p>
            <PrivacyColumns audience="child" />
            <p className="positive-note"><LockKeyhole className="size-4 shrink-0" />Your check-ins and notes stay in this space and clear when you leave it.</p>
          </Panel>
          <Panel title="Start fresh" icon={Sprout}>
            <p className="panel-subtitle mb-4">Reset to the original sample data. Your check-ins and progress in this space will be cleared.</p>
            <ResetDemoButton />
          </Panel>
        </div>
      </div>
    </AppLayout>
  );
}
