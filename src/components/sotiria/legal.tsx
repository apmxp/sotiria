import { Link } from '@tanstack/react-router';
import { ArrowRight, Heart, LockKeyhole, Mail, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { PublicLayout } from './layout';

export function PrivacyPage() {
  return (
    <PublicLayout>
      <main className="section legal-page">
        <div className="site-container legal-inner">
          <div className="eyebrow"><LockKeyhole /> Privacy comes first</div>
          <h1>Our promise about privacy</h1>
          <p className="legal-lead">Sotiría is built around one simple idea: a child's inner world belongs to them.</p>
          <h2>What this demo stores</h2>
          <p>Everything you see here is sample data saved only in your own browser. Nothing is sent to a server, and closing or resetting the demo removes it. There is no account, no tracking, and no device monitoring.</p>
          <h2>Feelings stay private</h2>
          <p>A child's mood check-ins and written reflections never appear in parent views, reports, or downloads. Parents see screen-time totals, routines, and activity counts — never journal entries.</p>
          <h2>Guidance, not surveillance</h2>
          <p>Sotiría is designed to start conversations, not to watch children. We believe trust grows when families agree on habits together.</p>
          <div className="positive-note mt-8"><ShieldCheck className="size-5 shrink-0" />Questions about privacy? Talk to us through the <Link to="/contact" className="font-semibold text-primary">contact page</Link>.</div>
        </div>
      </main>
    </PublicLayout>
  );
}

export function TermsPage() {
  return (
    <PublicLayout>
      <main className="section legal-page">
        <div className="site-container legal-inner">
          <div className="eyebrow"><Sprout /> A few kind ground rules</div>
          <h1>Terms of use</h1>
          <p className="legal-lead">A short, human summary of how to enjoy this demo.</p>
          <h2>A demonstration, not a product</h2>
          <p>This is an interactive demo with sample data. Screen-time figures, trends, and reports are illustrative and are not connected to any real device.</p>
          <h2>Not medical advice</h2>
          <p>Mood check-ins and wellbeing suggestions are gentle prompts, not professional advice. If a child is struggling, please reach out to a qualified professional or a trusted adult.</p>
          <h2>Enjoy it together</h2>
          <p>Sotiría works best as a shared family experience. Explore the activities, agree on routines, and keep the conversation open.</p>
          <div className="positive-note mt-8"><Heart className="size-5 shrink-0" />Small steps, big possibilities. Thank you for being here.</div>
        </div>
      </main>
    </PublicLayout>
  );
}

export function ContactPage() {
  return (
    <PublicLayout>
      <main className="section legal-page">
        <div className="site-container legal-inner">
          <div className="eyebrow"><Mail /> We’d love to hear from you</div>
          <h1>Say hello.</h1>
          <p className="legal-lead">Questions, ideas, or a story about your family's journey — every message is welcome.</p>
          <section className="panel mt-8">
            <form className="space-y-4" onSubmit={event => { event.preventDefault(); event.currentTarget.reset(); toast.success('Thank you! This is a demo, so your message wasn’t sent anywhere.'); }}>
              <label className="field">Your name<input required maxLength={60} placeholder="Your name" /></label>
              <label className="field">Email<input required type="email" maxLength={120} placeholder="you@example.com" /></label>
              <label className="field">Message<textarea required maxLength={2000} placeholder="Tell us a little about what's on your mind…" /></label>
              <Button type="submit" variant="hero">Send message <ArrowRight /></Button>
              <p className="panel-subtitle">Demo form — messages aren't sent anywhere yet.</p>
            </form>
          </section>
        </div>
      </main>
    </PublicLayout>
  );
}
