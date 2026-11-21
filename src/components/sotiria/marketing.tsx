import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ArrowRight, Play, ShieldCheck, Heart, Sprout, Check, Users, Compass, Smartphone, Download } from 'lucide-react';
import hero from '@/assets/balanced-world.jpg';
import drawing from '@/assets/dream-world.jpg';
import { FeatureGrid } from './common';
import { PublicLayout } from './layout';
export function HomePage() { return <PublicLayout><main><section className="hero"><img src={hero} alt="Children drawing, reading, and flying a paper airplane together in a peaceful park" width="1920" height="1024" className="hero-image" fetchPriority="high" /><div className="site-container hero-content"><div className="eyebrow"><Sprout /> A little balance. A brighter world.</div><h1>Your digital world,<br />in <span>balance.</span></h1><p className="hero-copy">Discover healthier digital habits, understand your feelings, stay safe online, and make room for the things you love offline.</p><div className="hero-buttons"><Button asChild variant="hero" size="lg"><Link to="/signup">Get Started <ArrowRight /></Link></Button><Button asChild variant="outline" size="lg"><Link to="/child/dashboard"><Play /> Explore Sotiría</Link></Button></div><p className="hero-footnote"><ShieldCheck /> A caring space for children aged 8–12 and their families.</p></div></section><section className="intro-band"><div className="site-container intro-inner"><span className="intro-item"><Heart /> Built for growing minds</span><span className="intro-item"><ShieldCheck /> Privacy comes first</span><span className="intro-item"><Users /> Better habits, together</span></div></section><FeaturesSection /><HowSection /><ParentSection /><AndroidDownloadSection /><AboutDeveloperSection /><FinalCTA /></main></PublicLayout>; }
export function AboutDeveloperSection() {
  return (
    <section id="about-the-developer" className="section">
      <div className="site-container">
        <div className="section-heading">
          <div className="eyebrow">About the developer</div>
          <h2>Created by Selam Alemayehu Giday</h2>
          <p>
            Selam Alemayehu Giday is the developer and creator of Sotiría, an Android app
            for child digital wellbeing and family screen-time awareness.
          </p>
        </div>
      </div>
    </section>
  );
}
const androidApkDownloadUrl = 'https://github.com/apmxp/sotiria/releases/download/v0.1.0/app-debug.apk';
export function AndroidDownloadSection() {
  return (
    <section className="section steps-band" aria-labelledby="android-download-title">
      <div className="site-container">
        <div className="section-heading">
          <div className="eyebrow"><Smartphone /> Android companion</div>
          <h2 id="android-download-title">Download Sotiría for Android</h2>
          <p>Version v0.1.0 · Install the Android companion and connect it to your family’s Sotiría account.</p>
          <Button asChild variant="hero" size="lg">
            <a href={androidApkDownloadUrl}><Download /> Download APK</a>
          </Button>
          <p className="mt-4 text-sm">Updates to the Android app will be published on this website.</p>
        </div>
        <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background p-6">
          <h3 className="mb-3 text-lg font-semibold">Install on Android</h3>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>Download the APK to your Android phone, then open it from Downloads.</li>
            <li>If prompted, allow your browser or file manager to install apps from this source, then tap Install.</li>
            <li>Open Sotiría and pair the phone using the one-time code shown in the parent Family Space.</li>
            <li>Grant Usage Access in Android settings when prompted. This permission is required for screen-time monitoring and syncing.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
export function FeaturesSection() { return <section className="section"><div className="site-container"><div className="section-heading"><div className="eyebrow">Room to explore. Space to grow.</div><h2>Little habits. A world of difference.</h2><p>Five thoughtful ways to help your child feel confident, connected,<br className="hidden sm:block" /> and balanced — on and off the screen.</p></div><FeatureGrid /></div></section>; }
export function HowSection() { return <section className="section steps-band"><div className="site-container"><div className="section-heading"><div className="eyebrow">The journey is simple</div><h2>Growing a little, every day.</h2><p>No pressure. No perfect days. Just small steps in the right direction.</p></div><div className="steps-grid">{[{ title: 'Get to know your digital day', text: 'Discover your screen habits and check in with how you feel.' }, { title: 'Build habits that feel right', text: 'Explore online safety, take thoughtful breaks, and set goals together.' }, { title: 'Make room for real-world joy', text: 'Find a new hobby, go on an adventure, and celebrate your own progress.' }].map((step, index) => <div key={step.title}><div className="step-number">0{index + 1}</div><h3>{step.title}</h3><p>{step.text}</p></div>)}</div></div></section>; }
export function ParentSection() { return <section className="section"><div className="site-container parent-band"><img src={drawing} alt="A child exploring her creativity with a sketchbook outdoors" width="1024" height="768" loading="lazy" /><div><div className="eyebrow"><Users /> For parents, with care</div><h2>A little guidance.<br />A lot of growing together.</h2><p>You don’t need to watch every click to make a difference. Understand your child’s habits and help them find a balance that works for your family.</p><ul className="check-list"><li><Check /> Useful insights, without intrusive monitoring</li><li><Check /> Family goals you can agree on together</li><li><Check /> Ideas for meaningful offline moments</li><li><Check /> Private feelings stay private</li></ul><Button asChild variant="outline" size="lg"><Link to="/parent/dashboard">Explore the parent view <ArrowRight /></Link></Button></div></div></section>; }
export function FinalCTA() { return <section className="cta-band"><div className="site-container"><div className="eyebrow justify-center"><Sprout /> Grow safely. Live fully.</div><h2>Small habits. Healthier digital lives.</h2><p>A brighter, more balanced day starts with one small step.</p><Button asChild variant="hero" size="lg"><Link to="/signup">Start Your Journey <ArrowRight /></Link></Button></div></section>; }
export function MarketingPage({ type }: { type: 'features' | 'how' | 'parents' }) { return <PublicLayout><main>{type === 'features' ? <><FeaturesSection /><HowSection /></> : type === 'how' ? <><HowSection /><FeaturesSection /></> : <><ParentSection /><section className="section steps-band"><div className="site-container"><div className="section-heading"><div className="eyebrow"><Compass /> Guidance, not surveillance</div><h2>Build trust. Find your family’s balance.</h2><p>Agree on routines together, celebrate offline moments, and start thoughtful conversations. Your child’s personal mood reflections never appear in your parent reports.</p></div><div className="flex justify-center"><Button asChild variant="hero" size="lg"><Link to="/parent/dashboard">Try the parent demo <ArrowRight /></Link></Button></div></div></section></>}<FinalCTA /></main></PublicLayout>; }
