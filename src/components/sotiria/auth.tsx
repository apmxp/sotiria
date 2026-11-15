import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Heart, KeyRound, LockKeyhole, MailCheck, ShieldCheck, Sprout, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useIdentity } from '@/components/identity-provider';
import { listPickerChildren, unlockParent, verifyChildPin } from '@/lib/identity.functions';
import { PublicLayout } from './layout';

const MIN_PASSWORD = 8;

function AuthCard({ tag, title, subtitle, children, hideAccount = false }: { tag: string; title: string; subtitle: string; children: ReactNode; hideAccount?: boolean }) {
  return (
    <PublicLayout hideAccount={hideAccount}>
      <main className="auth-page">
        <section className="panel auth-card">
          <span className="tag mb-4"><Sprout className="size-3.5" /> {tag}</span>
          <h1>{title}</h1>
          <p className="panel-subtitle mt-2">{subtitle}</p>
          {children}
        </section>
      </main>
    </PublicLayout>
  );
}

export function LoginPage() {
  const navigate = useNavigate(); const cache = useQueryClient();
  const { user } = useIdentity();
  const unlock = useServerFn(unlockParent);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (user?.email) setEmail(current => current || user.email || ''); }, [user]);
  const submit = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.error(/confirm/i.test(error.message) ? 'Please confirm your email first — check your inbox for the link.' : 'That email and password don’t match. Please try again.');
        return;
      }
      // Signing in on this device also closes any open child space and its PIN picker.
      await unlock({ data: { password } });
      await cache.cancelQueries(); cache.clear();
      toast.success('Welcome back! Your family space is ready.');
      await navigate({ to: '/parent/dashboard' });
    } catch {
      toast.error('Something went wrong signing you in. Please try again.');
    } finally { setBusy(false); setPassword(''); }
  };
  return (
    <AuthCard tag="PARENT LOGIN" title="Welcome back." subtitle={user ? 'Enter your password to open the parent space on this device.' : 'Sign in to your family space.'}>
      <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="field">Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field">Password<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}><Users /> {busy ? 'Signing in…' : 'Log in'}</Button>
      </form>
      <p className="mt-4 text-sm"><Link to="/forgot-password" className="font-semibold text-primary">Forgot your password?</Link></p>
      <p className="positive-note mt-6"><Heart className="size-4 shrink-0" />Are you a child? <Link to="/child-login" className="font-semibold text-primary">Go to your space</Link></p>
      <p className="mt-6 text-sm text-muted-foreground">New here? <Link to="/signup" className="font-semibold text-primary">Create a parent account</Link></p>
    </AuthCard>
  );
}

export function SignupPage() {
  const [name, setName] = useState(''); const [familyName, setFamilyName] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [sentTo, setSentTo] = useState<string>();
  const submit = async () => {
    if (password.length < MIN_PASSWORD) { toast.error(`Use at least ${MIN_PASSWORD} characters for your password.`); return; }
    setBusy(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/login`, data: { display_name: name.trim(), family_name: familyName.trim() } } });
    setBusy(false); setPassword('');
    if (error) { toast.error(/password/i.test(error.message) ? 'Please choose a stronger password.' : 'Your account could not be created. Please check your details.'); return; }
    setSentTo(email.trim());
  };
  if (sentTo) return (
    <AuthCard tag="CHECK YOUR EMAIL" title="One more step." subtitle={`We sent a confirmation link to ${sentTo}. Open it to activate your account, then log in to set up your family.`}>
      <p className="positive-note mt-6"><MailCheck className="size-4 shrink-0" />Can’t find it? Check your spam folder. The link opens Sotiría in this browser.</p>
      <Button asChild variant="outline" className="mt-6"><Link to="/login">Go to log in <ArrowRight /></Link></Button>
    </AuthCard>
  );
  return (
    <AuthCard tag="PARENT SIGNUP" title="Start your journey." subtitle="Create a parent account. You’ll add your children’s nicknames and PINs after you confirm your email.">
      <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="field">Your first name<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} placeholder="Sam" autoComplete="given-name" /></label>
        <label className="field">Family name<input required maxLength={80} value={familyName} onChange={e => setFamilyName(e.target.value)} placeholder="The Rivera family" /><small>Only shown inside your family space.</small></label>
        <label className="field">Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field">Password<input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /><small>At least {MIN_PASSWORD} characters.</small></label>
        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create my account'} <ArrowRight /></Button>
      </form>
      <p className="positive-note mt-6"><ShieldCheck className="size-4 shrink-0" />Children never need an email. They use a nickname and a PIN you set.</p>
      <p className="mt-6 text-sm text-muted-foreground">Already have an account? <Link to="/login" className="font-semibold text-primary">Log in</Link></p>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) { toast.error('We couldn’t send the link right now. Please try again in a moment.'); return; }
    setSent(true);
  };
  return (
    <AuthCard tag="PASSWORD HELP" title="Forgot your password?" subtitle={sent ? 'If an account exists for that email, a reset link is on its way.' : 'Enter your email and we’ll send you a link to choose a new password.'}>
      {!sent && <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="field">Email<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}><KeyRound /> {busy ? 'Sending…' : 'Send reset link'}</Button>
      </form>}
      <p className="mt-6 text-sm"><Link to="/login" className="font-semibold text-primary"><ArrowLeft className="inline size-4" /> Back to log in</Link></p>
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const fromLink = window.location.hash.includes('type=recovery') || new URLSearchParams(window.location.search).has('code');
    const { data } = supabase.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') setStatus('ready'); });
    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data: s }) => setStatus(current => current === 'ready' ? current : fromLink && s.session ? 'ready' : 'invalid'));
    }, 800);
    return () => { data.subscription.unsubscribe(); window.clearTimeout(timer); };
  }, []);
  const submit = async () => {
    if (password.length < MIN_PASSWORD) { toast.error(`Use at least ${MIN_PASSWORD} characters.`); return; }
    if (password !== confirm) { toast.error('The two passwords don’t match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error('Your password could not be updated. Please request a new link.'); return; }
    await supabase.auth.signOut();
    toast.success('Your password is updated. Please log in.');
    await navigate({ to: '/login', replace: true });
  };
  return (
    <AuthCard tag="NEW PASSWORD" title="Choose a new password." subtitle={status === 'invalid' ? 'This reset link is invalid or has expired.' : 'Pick something you haven’t used before.'}>
      {status === 'checking' && <p className="mt-6" role="status">Checking your link…</p>}
      {status === 'invalid' && <Button asChild variant="outline" className="mt-6"><Link to="/forgot-password">Request a new link</Link></Button>}
      {status === 'ready' && <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="field">New password<input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="field">Confirm new password<input type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}><LockKeyhole /> {busy ? 'Saving…' : 'Save new password'}</Button>
      </form>}
    </AuthCard>
  );
}

export function ChildLoginPage() {
  const navigate = useNavigate(); const cache = useQueryClient();
  const list = useServerFn(listPickerChildren); const verify = useServerFn(verifyChildPin);
  const profiles = useQuery({ queryKey: ['child-picker'], queryFn: () => list(), staleTime: 0 });
  const [chosen, setChosen] = useState<{ id: string; display_name: string; avatar: string }>();
  const [pinValue, setPin] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string>();
  const submit = async () => {
    if (!chosen) return;
    setBusy(true); setMessage(undefined);
    try {
      const result = await verify({ data: { childId: chosen.id, pin: pinValue } });
      if (!result.ok) { setMessage(result.reason === 'locked' ? 'Too many tries. Please take a break and try again in 15 minutes, or ask your grown-up.' : 'That PIN didn’t match. Try again.'); return; }
      await cache.cancelQueries(); cache.clear();
      await navigate({ to: '/child/dashboard' });
    } catch { setMessage('Your space could not be opened. Please try again.'); }
    finally { setBusy(false); setPin(''); }
  };
  return (
    <AuthCard hideAccount tag="CHILD SPACE" title={chosen ? `Hi, ${chosen.display_name}!` : 'Who’s here today?'} subtitle={chosen ? 'Enter your six-digit PIN.' : 'Choose your picture to open your space.'}>
      {profiles.isLoading && <p className="mt-6" role="status">Getting your profiles…</p>}
      {profiles.isError && <p className="mt-6" role="alert">Your profiles could not be loaded. Please try again.</p>}
      {profiles.data && !profiles.data.length && <>
        <p className="positive-note mt-6"><Heart className="size-4 shrink-0" />This device isn’t open for a child space yet. Ask your grown-up to open it from their family space.</p>
        <Button asChild variant="outline" className="mt-6"><Link to="/login">Grown-up log in</Link></Button>
      </>}
      {profiles.data && profiles.data.length > 0 && !chosen && <div className="profile-picker mt-6" role="group" aria-label="Choose your profile">
        {profiles.data.map(p => <button key={p.id} type="button" className="profile-choice" onClick={() => { setChosen(p); setMessage(undefined); }} aria-label={`I’m ${p.display_name}`}><span className="profile-choice-avatar" aria-hidden="true">{p.avatar}</span><span>{p.display_name}</span></button>)}
      </div>}
      {chosen && <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="field">PIN<input type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6}" maxLength={6} value={pinValue} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
        {message && <p role="alert" className="text-sm font-semibold text-destructive">{message}</p>}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => { setChosen(undefined); setPin(''); setMessage(undefined); }}><ArrowLeft /> Not me</Button>
          <Button type="submit" variant="hero" disabled={busy || pinValue.length !== 6}>{busy ? 'Opening…' : 'Open my space'} <ArrowRight /></Button>
        </div>
      </form>}
      {!(profiles.data && !profiles.data.length) && <p className="mt-6 text-sm text-muted-foreground">Grown-up? <Link to="/login" className="font-semibold text-primary">Parent log in</Link></p>}
    </AuthCard>
  );
}
