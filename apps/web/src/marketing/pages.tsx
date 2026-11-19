import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Compass, Loader2, Mail, Send } from 'lucide-react';
import { cx } from '../components/ui';
import { useStore } from '../lib/store';
import { Container, Label, MLink, Reveal } from './kit';
import { Evidence, FAQ, Features, Hero, HowItWorks, Pricing, ProductPreview, Security } from './sections';

export function Landing() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <ProductPreview />
      <Pricing />
      <FAQ />
    </>
  );
}

function PageHero({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <section className="pb-8 pt-16 sm:pt-24">
      <Container>
        <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className="lg:col-span-7">
            <Label>{eyebrow}</Label>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-coal text-balance sm:text-6xl">{title}</h1>
          </div>
          <p className="text-[17px] leading-relaxed text-stone lg:col-span-4 lg:col-start-9 lg:pb-2">{text}</p>
        </Reveal>
      </Container>
    </section>
  );
}

export function FeaturesPage() {
  return (
    <>
      <PageHero eyebrow="Features" title="What Autonomous Web Tester checks." text="Page discovery, navigation, buttons, forms, responsive layouts and evidence-backed reporting. Each feature shows its current status — the testing engine is in active development." />
      <Features heading={false} all />
      <HowItWorks />
      <Evidence />
      <Security />
    </>
  );
}

export function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Plans and pricing" text="Early access is free and needs no payment details. Paid plans, prices and usage limits will be published when the testing engine launches." />
      <Pricing heading={false} />
      <FAQ />
    </>
  );
}

const TOPICS = { general: 'General question', business: 'Business plan / sales', support: 'Support', partnership: 'Agency partnership' } as const;

export function ContactPage() {
  const [params] = useSearchParams();
  const initial = (params.get('topic') ?? 'general') as keyof typeof TOPICS;
  const [form, setForm] = useState({ name: '', email: '', company: '', topic: initial in TOPICS ? initial : 'general', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  useEffect(() => setForm((f) => ({ ...f, topic: initial in TOPICS ? initial : 'general' })), [initial]);
  const input = 'block w-full rounded-md border border-coal/15 bg-white px-4 py-3 text-sm text-coal placeholder:text-stone transition focus:border-ember focus:outline-none focus:ring-4 focus:ring-ember/10 aria-[invalid=true]:border-[#a4483a]';
  function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!form.name.trim()) er.name = 'Please enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) er.email = 'Please enter a valid email';
    if (form.message.trim().length < 10) er.message = 'Please write at least 10 characters';
    setErrors(er);
    if (!Object.keys(er).length) setSent(true);
  }
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to us" text="Questions about early access, the Business plan or using Autonomous Web Tester with your team? Send us a message." />
      <section className="pb-24 pt-8">
        <Container className="max-w-2xl">
          <Reveal className="glass rounded-2xl p-6 sm:p-10">
            {sent ? (
              <div className="py-6 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-ember/10 text-ember"><Mail className="size-5" /></span>
                <h2 className="mt-4 font-display text-xl font-semibold text-coal">Message delivery isn’t connected yet</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-stone">This is the early-access preview, so your message was <strong className="text-coal">not sent</strong> and nothing was stored. Message delivery arrives with the backend.</p>
                <button onClick={() => setSent(false)} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ember hover:text-coal"><ArrowLeft className="size-4" /> Back to the form</button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {([['name', 'Name', 'text', 'name'], ['email', 'Work email', 'email', 'email']] as const).map(([k, l, t, ac]) => (
                  <label key={k} className="block">
                    <span className="mb-1.5 block text-sm font-medium text-coal">{l}</span>
                    <input type={t} autoComplete={ac} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} aria-invalid={!!errors[k]} className={input} />
                    {errors[k] && <span className="mt-1 block text-xs font-medium text-[#a4483a]">{errors[k]}</span>}
                  </label>
                ))}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-coal">Company <span className="text-stone">(optional)</span></span>
                  <input autoComplete="organization" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className={input} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-coal">Topic</span>
                  <select value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value as keyof typeof TOPICS })} className={cx(input, 'appearance-none')}>
                    {Object.entries(TOPICS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-sm font-medium text-coal">Message</span>
                  <textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} aria-invalid={!!errors.message} className={input} />
                  {errors.message && <span className="mt-1 block text-xs font-medium text-[#a4483a]">{errors.message}</span>}
                </label>
                <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-stone">Early-access preview: messages aren’t delivered yet.</p>
                  <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-forest px-5 text-sm font-semibold text-ivory transition-colors hover:bg-forest-2"><Send className="size-4" /> Send message</button>
                </div>
              </form>
            )}
          </Reveal>
        </Container>
      </section>
    </>
  );
}

/** One click into the app with clearly labelled demonstration data. */
export function DemoEntry() {
  const store = useStore();
  const navigate = useNavigate();
  useEffect(() => {
    if (!store.session) store.startDemo();
    else store.setPreferences({ demoMode: true });
    const t = setTimeout(() => navigate('/dashboard', { replace: true }), 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on entry
  }, []);
  return (
    <div data-surface="light" className="grid min-h-screen place-items-center bg-paper px-6 text-center">
      <div>
        <Loader2 className="mx-auto size-8 animate-spin text-ember" />
        <p className="mt-4 font-display font-semibold text-coal">Opening the interactive demo…</p>
        <p className="mt-1 text-sm text-stone">Sample data from fictional websites — clearly labelled DEMO throughout.</p>
      </div>
    </div>
  );
}

export function PublicNotFound() {
  return (
    <section className="py-32">
      <Container className="max-w-xl text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-md border border-coal/15 bg-white text-ember"><Compass className="size-6" /></span>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-coal">Page not found</h1>
        <p className="mt-3 text-stone">The page you’re looking for doesn’t exist or has moved.</p>
        <div className="mt-8 flex justify-center gap-3">
          <MLink to="/">Go to homepage</MLink>
          <MLink to="/dashboard" variant="secondary">Open the app</MLink>
        </div>
        <p className="mt-6 text-xs text-stone">Looking for a project page? <Link to="/projects" className="font-medium text-ember hover:underline">Browse projects</Link></p>
      </Container>
    </section>
  );
}
