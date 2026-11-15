import { useEffect, useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Brand } from './common';
import { LayoutDashboard, Clock3, Heart, ShieldCheck, Palette, Settings, BarChart3, CalendarDays, Menu, X, PanelLeft, LogOut, Sprout, Bell, ArrowLeftRight, BellOff } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { useIdentity } from '@/components/identity-provider';
import { useChildSignOut, useParentSignOut } from '@/hooks/use-sign-out';
import { hasUsage, lessonProgress, parentSummary, routineProgress } from '@/lib/wellbeing';
import { toast } from 'sonner';

const childLinks = [{ title: 'Dashboard', path: '/child/dashboard', icon: LayoutDashboard }, { title: 'My Screen Time', path: '/child/screen-time', icon: Clock3 }, { title: 'My Mood', path: '/child/mood', icon: Heart }, { title: 'Online Safety', path: '/child/online-safety', icon: ShieldCheck }, { title: 'Offline Activities', path: '/child/activities', icon: Palette }, { title: 'Settings', path: '/child/settings', icon: Settings }] as const;
const parentLinks = [{ title: 'Overview', path: '/parent/dashboard', icon: LayoutDashboard }, { title: 'Screen-Time Reports', path: '/parent/reports', icon: BarChart3 }, { title: 'Family Routines', path: '/parent/routines', icon: CalendarDays }, { title: 'Settings & Privacy', path: '/parent/settings', icon: Settings }] as const;
const BREAK_REMINDER_MINUTES = 25;

function AccountActions({ mobile, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { user } = useIdentity(); const signOut = useParentSignOut();
  if (mobile) return user ? <><Link to="/parent/dashboard" onClick={onNavigate}>My family</Link><button type="button" className="text-left" onClick={() => { onNavigate?.(); void signOut(); }}>Log out</button></> : <><Link to="/login" onClick={onNavigate}>Log in</Link><Link to="/signup" onClick={onNavigate}>Get Started</Link></>;
  return user
    ? <><Button variant="ghost" onClick={() => void signOut()}>Log out</Button><Button asChild variant="hero"><Link to="/parent/dashboard">My family <span aria-hidden="true">↗</span></Link></Button></>
    : <><Button variant="ghost" asChild><Link to="/login">Log in</Link></Button><Button asChild variant="hero"><Link to="/signup">Get Started <span aria-hidden="true">↗</span></Link></Button></>;
}

export function PublicLayout({ children, hideAccount = false }: { children: ReactNode; hideAccount?: boolean }) { const [open, setOpen] = useState(false); const close = () => setOpen(false); return <><header className="site-nav"><div className="site-container nav-inner"><Brand /><nav id="main-navigation" aria-label="Main navigation" className={`nav-links ${open ? 'mobile-nav-open' : ''}`}><Link to="/" onClick={close}>Home</Link><Link to="/features" onClick={close}>Features</Link><Link to="/how-it-works" onClick={close}>How It Works</Link><Link to="/for-parents" onClick={close}>For Parents</Link>{open && !hideAccount && <AccountActions mobile onNavigate={close} />}</nav><div className="nav-actions">{!hideAccount && <AccountActions />}</div><Button variant="ghost" size="icon" className="mobile-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</Button></div></header>{children}<Footer /></>; }

export function Footer() { return <footer className="site-footer"><div className="site-container"><div className="footer-top"><div><Brand /><p>Grow safely. Live fully.</p></div><nav className="footer-links" aria-label="Footer navigation"><Link to="/features">Features</Link><Link to="/how-it-works">How It Works</Link><Link to="/for-parents">For Parents</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/contact">Contact</Link></nav></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Sotiría. A little balance goes a long way.</span><span>Made with care, for growing minds.</span></div></div></footer>; }

/** Gentle in-app updates built from shared data. Parent items come from the privacy-safe summary only. */
function useUpdates(role: 'child' | 'parent') {
  const { state, today } = useDemo();
  if (role === 'child') {
    const items: { text: string; to: string }[] = [];
    if (!hasUsage(state, today)) items.push({ text: 'Add today’s screen time when you’re ready.', to: '/child/screen-time' });
    if (!state.moods.some(m => m.date === today)) items.push({ text: 'How are you feeling? A check-in is just for you.', to: '/child/mood' });
    const next = lessonProgress(state).next;
    if (next) items.push({ text: `Next lesson: ${next.title}.`, to: '/child/online-safety' });
    const routines = routineProgress(state, today);
    if (routines.due > routines.done) items.push({ text: `${routines.due - routines.done} family routine${routines.due - routines.done === 1 ? '' : 's'} still to enjoy today.`, to: '/child/dashboard' });
    return { enabled: state.childNotifications, items, settings: '/child/settings' as const };
  }
  const summary = parentSummary(state, today);
  const items: { text: string; to: string }[] = [
    { text: summary.today.recorded ? `${summary.childName} added ${summary.today.usage}h of screen time today.` : `${summary.childName} hasn’t added today’s screen time yet.`, to: '/parent/reports' },
    { text: `${summary.offline.thisWeek} offline activities completed this week.`, to: '/parent/dashboard' },
    { text: `${summary.routineProgress.done} of ${summary.routineProgress.due} routines done today.`, to: '/parent/routines' },
  ];
  return { enabled: summary.settings.weeklySummary, items, settings: '/parent/settings' as const };
}

function UpdatesButton({ role }: { role: 'child' | 'parent' }) {
  const { enabled, items, settings } = useUpdates(role);
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={enabled ? `Updates, ${items.length} new` : 'Updates are off'} className="relative">{enabled ? <Bell /> : <BellOff />}{enabled && items.length > 0 && <span className="notice-dot" aria-hidden="true" />}</Button></PopoverTrigger><PopoverContent align="end" className="w-80"><p className="small-heading mb-3">{role === 'child' ? 'Little updates' : 'Family updates'}</p>{!enabled ? <p className="panel-subtitle">Updates are turned off. <Link to={settings} className="font-semibold text-primary" onClick={() => setOpen(false)}>Turn them on in Settings</Link>.</p> : items.length ? <ul className="update-list">{items.map(item => <li key={item.text}><Link to={item.to} onClick={() => setOpen(false)}>{item.text}</Link></li>)}</ul> : <p className="panel-subtitle">You’re all caught up. A fresh day of possibilities awaits.</p>}<p className="mt-3 text-[11px] text-muted-foreground">Demo updates · built from sample and entered data.</p></PopoverContent></Popover>;
}

/** While the child view is open and break reminders are on, nudge every few minutes. */
function useBreakReminder(role: 'child' | 'parent') {
  const { state, ready, logBreak } = useDemo();
  useEffect(() => {
    if (role !== 'child' || !ready || !state.breakReminders) return;
    const timer = window.setInterval(() => toast('Time for a little pause? Stretch, look outside, or grab some water.', { action: { label: 'I took a break', onClick: () => { logBreak(); toast.success('A little pause can make a big difference.'); } }, duration: 15000 }), BREAK_REMINDER_MINUTES * 60_000);
    return () => window.clearInterval(timer);
  }, [role, ready, state.breakReminders, logBreak]);
}

export function AppLayout({ role, children }: { role: 'child' | 'parent'; children: ReactNode }) {
  const { state, ready, update } = useDemo();
  const parentSignOut = useParentSignOut(); const childSignOut = useChildSignOut();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: s => s.location.pathname });
  const links = role === 'child' ? childLinks : parentLinks;
  const activeTitle = links.find(item => item.path === pathname)?.title || 'Sotiría';
  const avatar = role === 'child' ? state.avatar : state.parentName.charAt(0).toUpperCase() || 'P';
  useBreakReminder(role);
  useEffect(() => { if (ready && state.lastRole !== role) update({ lastRole: role }); }, [ready, role, state.lastRole, update]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-sidebar-open' : ''}`}>
    {mobileOpen && <div className="fixed inset-0 z-20 bg-foreground/20" aria-hidden="true" onClick={() => setMobileOpen(false)} />}
    <aside className="app-sidebar" id="app-sidebar"><Brand /><div className="sidebar-caption">{role === 'child' ? 'Your little world' : 'Your family space'}</div><nav aria-label={`${role === 'child' ? 'Child' : 'Parent'} navigation`}>{links.map(({ title, path, icon: Icon }) => <Link to={path} key={path} className="sidebar-link" title={title}><Icon aria-hidden="true" /><span className="sidebar-label">{title}</span></Link>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><Sprout className="size-6" /><strong>Small steps, big possibilities.</strong><p>You don’t have to be perfect. Just keep growing.</p></div>{role === 'child' && <Link className="sidebar-link" to="/login" title="Grown-up controls (needs the parent password)"><ArrowLeftRight aria-hidden="true" /><span className="sidebar-label">Grown-up controls</span></Link>}<div className="profile-row"><span className="avatar" aria-hidden="true">{avatar}</span><div className="min-w-0"><p className="truncate text-xs font-extrabold">{role === 'child' ? state.name : state.parentName}</p><p className="text-[10px] text-muted-foreground">{role === 'child' ? 'My growing journey' : 'Parent account'}</p></div><Button variant="ghost" size="icon" title={role === 'child' ? 'Leave my space' : 'Log out'} aria-label={role === 'child' ? 'Leave my space' : 'Log out'} onClick={() => void (role === 'child' ? childSignOut() : parentSignOut())}><LogOut /></Button></div></div></aside>
    <div className="app-body"><header className="app-topbar"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" aria-label="Toggle navigation" aria-controls="app-sidebar" aria-expanded={mobileOpen || !collapsed} onClick={() => { if (window.innerWidth <= 760) setMobileOpen(!mobileOpen); else setCollapsed(!collapsed); }}><PanelLeft /></Button><span className="topbar-title">{activeTitle}</span></div><div className="topbar-tools"><span className="demo-label" title="Wellbeing charts and activities use sample data that is not saved to your account yet.">Sample wellbeing data</span><UpdatesButton role={role} /><span className="avatar" aria-hidden="true">{avatar}</span></div></header><main className="app-main" id="main-content">{ready ? children : <div className="panel loading-panel" role="status"><Sprout className="size-6 text-primary" />Getting your space ready…</div>}</main></div></div>;
}
