import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  Bug,
  Camera,
  Check,
  Compass,
  FileText,
  FormInput,
  Globe,
  History,
  ListOrdered,
  Lock,
  MousePointerClick,
  Navigation,
  Plus,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '../components/ui';
import { useStore } from '../lib/store';
import { DEMO_SCREENSHOTS } from '../lib/demo';
import { Container, EASE, Label, MLink, PreviewBadge, Reveal, SectionHeading, Serif, Stagger, StaggerItem, stagger } from './kit';
import { CountUp, HeroPreview, ResultsDashboard, RevealImage, SevPill } from './previews';
import { PLANS, PRICING, formatLimit, type Billing, type Plan } from './plans';

/** Where the primary CTA leads: the app if signed in, otherwise sign-up. */
export function useStartHref() {
  const { session } = useStore();
  return session ? '/dashboard' : '/signup';
}

function Section({ id, children, className, dark }: { id?: string; children: ReactNode; className?: string; dark?: boolean }) {
  return <section id={id} className={cx('relative scroll-mt-24 py-24 lg:py-32', dark && 'bg-forest text-ivory', className)}>{children}</section>;
}

/** Small status tag that is honest about what is live today. */
function Status({ kind }: { kind: 'live' | 'dev' | 'partial' }) {
  const m = {
    live: { t: 'Available now', c: 'bg-sage/45 text-forest' },
    partial: { t: 'Workspace ready · engine in development', c: 'bg-forest/[0.07] text-forest/80' },
    dev: { t: 'In development', c: 'bg-terra/10 text-terra' },
  }[kind];
  return <span className={cx('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', m.c)}>{m.t}</span>;
}

/**
 * Slow, soft colour fields behind a section. They breathe in opacity (kept with reduced motion, it's not movement)
 * and drift a little only when motion is allowed.
 */
export function Aurora({ className, tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const reduce = useReducedMotion();
  const blobs = tone === 'light'
    ? [
        { c: 'bg-sage/45', pos: 'left-[-10%] top-[-10%] size-[520px]', d: 11, x: 60, y: 40 },
        { c: 'bg-terra/20', pos: 'right-[-8%] top-[18%] size-[460px]', d: 13, x: -50, y: 50 },
        { c: 'bg-[#d9d3c2]/70', pos: 'bottom-[-20%] left-[30%] size-[540px]', d: 15, x: 40, y: -40 },
      ]
    : [
        { c: 'bg-sage/25', pos: 'left-[-12%] top-[-20%] size-[560px]', d: 12, x: 60, y: 40 },
        { c: 'bg-terra/20', pos: 'right-[-10%] bottom-[-25%] size-[520px]', d: 14, x: -60, y: -30 },
      ];
  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0 -z-10 overflow-hidden', tone === 'light' && '[mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]', className)}>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cx('absolute rounded-full blur-[90px]', b.c, b.pos)}
          initial={{ opacity: 0.55 }}
          animate={{ opacity: [0.55, 1, 0.55], x: reduce ? 0 : [0, b.x, 0], y: reduce ? 0 : [0, b.y, 0] }}
          transition={{ duration: b.d, ease: 'easeInOut', repeat: Infinity, delay: i * 1.5 }}
        />
      ))}
    </div>
  );
}

// ═══ Hero ═══════════════════════════════════════════════════════

const line = {
  hidden: { opacity: 0, y: '55%', clipPath: 'inset(0 0 100% 0)', filter: 'blur(8px)' },
  show: { opacity: 1, y: '0%', clipPath: 'inset(0 0 -20% 0)', filter: 'blur(0px)', transition: { duration: 1.05, ease: EASE } },
};
const item = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.85, ease: EASE } },
};

const HERO_STATS: Array<{ to: number; suffix?: string; prefix?: string; label: string }> = [
  { to: 8, label: 'test modules' },
  { to: 4, label: 'viewports per page' },
  { to: 256, prefix: 'AES-', label: 'credential encryption' },
  { to: 0, label: 'test scripts to write' },
];

export function Hero() {
  const start = useStartHref();
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const gridY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 80]);
  const fade = useTransform(scrollYProgress, [0, 0.9], [1, 0.35]);
  return (
    <section ref={ref} className="relative isolate overflow-hidden pb-24 pt-10 sm:pt-14 lg:pb-32 lg:pt-16">
      <Aurora />
      <motion.div
        style={{ y: gridY, opacity: fade }}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [background-image:linear-gradient(rgba(32,55,45,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(32,55,45,0.06)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_60%_30%,black_20%,transparent_70%)]"
      />

      <Container className="grid grid-cols-1 items-center gap-16 lg:grid-cols-12 lg:gap-10">
        <motion.div className="lg:col-span-6" variants={stagger(0.12, 0.1)} initial="hidden" animate="show">
          <motion.p variants={item} className="glass inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-xs font-medium text-coal">
            <span className="rounded-full bg-forest px-2.5 py-0.5 text-[11px] font-semibold text-ivory">Early access</span>
            Autonomous website testing
          </motion.p>

          <h1 className="mt-8 font-display font-bold tracking-[-0.045em] text-coal">
            <span className="sr-only">Test Your Website. Automatically. Find Issues Before Your Users Do.</span>
            <span aria-hidden className="block text-[42px] leading-[1.02] sm:text-[58px] lg:text-[50px] xl:text-[62px]">
              <motion.span variants={line} className="block">Test Your Website.</motion.span>
              <motion.span variants={line} className="block pb-1">
                <Serif className="text-terra">Automatically.</Serif>
              </motion.span>
            </span>
            <motion.span aria-hidden variants={line} className="mt-4 block max-w-[17ch] text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-forest sm:text-[30px] xl:text-[32px]">
              Find Issues Before Your{' '}
              <span className="relative inline-block whitespace-nowrap">
                <motion.span aria-hidden className="absolute inset-x-[-0.06em] bottom-[0.06em] -z-10 h-[0.38em] rounded-sm bg-sage/60" initial={{ clipPath: 'inset(0 100% 0 0)' }} animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], delay: 1.5 }} />
                Users Do.
              </span>
            </motion.span>
          </h1>

          <motion.p variants={item} className="mt-7 max-w-[34rem] text-[17px] leading-relaxed text-stone">
            Autonomous Web Tester explores your website, tests pages, buttons, forms and navigation, and generates detailed bug reports with screenshots and reproduction steps.
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-col gap-3 sm:flex-row">
            <MLink to={start} size="lg">Start Testing <ArrowRight className="size-4" /></MLink>
            <MLink to="/#how-it-works" size="lg" variant="glass">See How It Works</MLink>
          </motion.div>

          <motion.dl variants={item} className="mt-11 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-forest/10 pt-7 sm:grid-cols-4">
            {HERO_STATS.map((s, i) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-display text-2xl font-bold tracking-tight text-forest">{s.prefix}<CountUp to={s.to} delay={900 + i * 150} /></dd>
                <dd className="mt-0.5 text-xs leading-snug text-stone">{s.label}</dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>

        <motion.div
          className="min-w-0 lg:col-span-6 lg:pl-4 xl:pl-8"
          initial={{ opacity: 0, x: 60, filter: 'blur(14px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ duration: 1.3, ease: EASE, delay: 0.45 }}
        >
          <HeroPreview />
        </motion.div>
      </Container>
    </section>
  );
}

// ═══ How it works — three steps ════════════════════════════════

const STEPS: Array<{ icon: LucideIcon; t: string; d: string; visual: ReactNode }> = [
  {
    icon: Globe, t: 'Enter your website URL', d: 'Add a website you own or have permission to test. A live check confirms it’s reachable.',
    visual: (
      <div className="space-y-2 text-[11px]">
        <div className="flex items-center gap-2 truncate rounded-lg border border-white bg-white/80 px-3 py-2 font-mono text-coal"><Globe className="size-3 shrink-0 text-stone" />https://staging.yoursite.example</div>
        <div className="flex items-center gap-2 rounded-lg border border-white bg-white/60 px-3 py-2 text-coal"><Check className="size-3.5 text-[#4f6b45]" />I’m authorized to test this site</div>
      </div>
    ),
  },
  {
    icon: ScanSearch, t: 'The tester explores and tests', d: 'It discovers pages and checks navigation, buttons, forms and layouts on desktop, tablet and mobile.',
    visual: (
      <div className="space-y-1.5 text-[11px]">
        {[['Pages discovered', true], ['Navigation & buttons checked', true], ['Testing forms…', false]].map(([t, ok]) => (
          <div key={t as string} className="flex items-center gap-2 rounded-lg border border-white bg-white/70 px-3 py-1.5 text-coal">{ok ? <Check className="size-3.5 text-[#4f6b45]" /> : <span className="size-1.5 animate-pulse rounded-full bg-terra" />}{t as string}</div>
        ))}
      </div>
    ),
  },
  {
    icon: FileText, t: 'Review screenshots and bug reports', d: 'Every confirmed issue comes with a screenshot, severity, expected vs actual and steps to reproduce.',
    visual: (
      <div className="rounded-lg border border-white border-l-[3px] border-l-terra bg-white/80 p-3 text-[11px]">
        <div className="flex items-center gap-2"><SevPill s="HIGH" /><span className="font-mono text-[10px] text-stone">SAMPLE-1043</span></div>
        <p className="mt-1.5 font-semibold text-coal">Banner overlaps the call-to-action</p>
        <p className="mt-0.5 flex items-center gap-1 text-stone"><Camera className="size-3" />Screenshot · 3 steps to reproduce</p>
      </div>
    ),
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });
  return (
    <Section id="how-it-works" className="overflow-hidden">
      <Container>
        <SectionHeading center n="01" eyebrow="How it works" title={<>From a URL to a bug report in <Serif className="text-terra">three steps.</Serif></>} description="No test scripts to write. You tell it which website to test; the platform does the exploring." />
        <div ref={ref} className="relative mt-16">
          <div className="absolute left-[16%] right-[16%] top-7 hidden h-px bg-forest/10 lg:block" aria-hidden>
            <motion.div className="h-full bg-gradient-to-r from-sage via-forest to-terra" initial={{ width: 0 }} animate={seen ? { width: '100%' } : {}} transition={{ duration: 2.4, ease: EASE, delay: 0.3 }} />
          </div>
          <ol className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.t}
                className="group relative flex flex-col items-center text-center"
                initial={{ opacity: 0, y: 36, filter: 'blur(8px)' }}
                animate={seen ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
                transition={{ duration: 0.9, ease: EASE, delay: 0.2 + i * 0.55 }}
              >
                <motion.span
                  className="relative z-10 grid size-14 place-items-center rounded-full border-4 border-paper"
                  initial={{ backgroundColor: '#ffffff', color: '#222822' }}
                  animate={seen ? { backgroundColor: i === 2 ? '#c96f4a' : '#20372d', color: '#f5f3ed' } : {}}
                  transition={{ duration: 0.6, delay: 0.6 + i * 0.6 }}
                >
                  <s.icon className="size-5" />
                </motion.span>
                <div className="glass glass-sheen mt-6 flex w-full flex-1 flex-col rounded-2xl p-6 text-left transition-[transform,box-shadow] duration-500 ease-out group-hover:-translate-y-1.5 group-hover:shadow-[inset_0_1px_0_white,0_36px_60px_-30px_rgba(32,55,45,0.45)]">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-terra">Step {i + 1}</p>
                  <h3 className="mt-2 font-display text-xl font-bold tracking-tight text-coal">{s.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-stone">{s.d}</p>
                  <div className="mt-auto pt-6">{s.visual}</div>
                </div>
              </motion.li>
            ))}
          </ol>
          <Reveal className="mt-10 text-center text-sm text-stone">
            Steps 2 and 3 run on the testing engine, which is in active development. Try them today in the <Link to="/demo" className="link-underline font-semibold text-coal">interactive demo</Link> with sample data.
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}

// ═══ Core features ══════════════════════════════════════════════

const FEATURES: Array<{ icon: LucideIcon; t: string; d: string; s: 'live' | 'dev' | 'partial'; core: boolean }> = [
  { icon: Compass, t: 'Automatic Page Discovery', d: 'Finds pages by following links, menus, sitemaps and app routes — including pages behind a login — within the domains you approve.', s: 'dev', core: true },
  { icon: MousePointerClick, t: 'UI Interaction Testing', d: 'Clicks safe buttons and controls and checks that something observable happens. Risky actions wait for your approval.', s: 'dev', core: true },
  { icon: FormInput, t: 'Form Validation', d: 'Submits valid and invalid input to confirm required fields, formats and password rules are enforced.', s: 'dev', core: true },
  { icon: Navigation, t: 'Navigation Testing', d: 'Follows links and menus to catch broken links, error pages, missing anchors and redirect loops.', s: 'dev', core: true },
  { icon: Camera, t: 'Screenshot Evidence', d: 'Every confirmed issue carries a screenshot with the failing element highlighted. Password fields are masked.', s: 'dev', core: true },
  { icon: Bug, t: 'Detailed Bug Reports', d: 'Severity, page, device, expected vs actual and steps to reproduce — kept separate from flaky or unconfirmed findings.', s: 'partial', core: true },
  { icon: Smartphone, t: 'Responsive Layout Testing', d: 'Checks pages on desktop, tablet and mobile for overflow, overlaps and clipped content.', s: 'dev', core: false },
  { icon: History, t: 'Testing History', d: 'A dashboard of past runs, issues and screenshots. PDF and Excel export is planned.', s: 'partial', core: false },
];

export function Features({ heading = true, all = false }: { heading?: boolean; all?: boolean }) {
  const list = all ? FEATURES : FEATURES.filter((f) => f.core);
  return (
    <Section id="features" className="isolate overflow-hidden">
      <Aurora className="opacity-70" />
      <Container>
        {heading && <SectionHeading n="02" eyebrow="Core features" title={<>Everything it checks, <Serif className="text-terra">with proof.</Serif></>} description="The essentials of automated website testing. The testing engine is in active development — each feature shows its current status." />}
        <Stagger gap={0.09} className={cx('grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3', heading && 'mt-14', all && 'xl:grid-cols-4')}>
          {list.map((f, i) => (
            <StaggerItem key={f.t} className="group h-full">
              <div className="glass glass-sheen flex h-full flex-col rounded-2xl p-7 transition-[transform,box-shadow,background-color] duration-500 ease-out hover:-translate-y-2 hover:bg-white/70 hover:shadow-[inset_0_1px_0_white,0_40px_70px_-34px_rgba(32,55,45,0.5)]">
                <div className="flex items-start justify-between">
                  <span className="grid size-12 place-items-center rounded-xl bg-forest/[0.07] text-forest transition-[background-color,color] duration-500 group-hover:bg-forest group-hover:text-ivory"><f.icon className="size-5" /></span>
                  <span className="font-mono text-xs text-forest/30 transition-colors duration-500 group-hover:text-terra">0{i + 1}</span>
                </div>
                <h3 className="mt-7 font-display text-xl font-bold tracking-tight text-coal">{f.t}</h3>
                <p className="mt-2.5 flex-1 text-[15px] leading-relaxed text-stone">{f.d}</p>
                <div className="mt-6 flex items-center justify-between">
                  <Status kind={f.s} />
                  <span aria-hidden className="h-px w-0 bg-terra transition-[width] duration-500 group-hover:w-10" />
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

// ═══ Product preview ═══════════════════════════════════════════

const CALLOUTS: Array<{ icon: LucideIcon; t: string; d: string }> = [
  { icon: BadgeCheck, t: 'Confirmed means reproduced', d: 'Issues are re-run before they count. Flaky and AI-only findings stay separate.' },
  { icon: Camera, t: 'Evidence on every issue', d: 'Screenshots with the failing element highlighted and secrets masked.' },
  { icon: ListOrdered, t: 'Steps anyone can follow', d: 'Expected vs actual and exact reproduction steps, ready for your tracker.' },
];

export function ProductPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const radius = useTransform(scrollYProgress, [0, 1], [72, 32]);
  const inset = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['4%', '0%']);
  return (
    <section id="product" className="relative scroll-mt-24 pb-24 pt-4 lg:pb-32">
      <Container>
        <div ref={ref} className="relative isolate">
          {/* Forest stage that widens and softens its corners as it scrolls in */}
          <motion.div aria-hidden style={{ borderRadius: radius, left: inset, right: inset }} className="absolute inset-y-0 -z-10 overflow-hidden bg-forest lg:bottom-[22%]">
            <Aurora tone="dark" />
            <div className="absolute inset-0 [background-image:radial-gradient(rgba(245,243,237,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
          </motion.div>
          <div className="px-5 pt-16 sm:px-10 lg:px-14 lg:pt-20">
            <SectionHeading dark n="03" eyebrow="Product preview" title={<>Results you can <Serif className="text-sage">act on.</Serif></>} description="Each run ends in a dashboard of what was tested, what failed and why — with the evidence attached. Click an issue to inspect it." />
            <Reveal y={60} className="mt-12 pb-10 lg:pb-0">
              <ResultsDashboard />
              <div className="mt-3 flex justify-end"><PreviewBadge label="Product preview · sample data from a fictional website" className="text-ivory/60 lg:text-stone" /></div>
            </Reveal>
          </div>
        </div>
        <Stagger gap={0.12} className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {CALLOUTS.map((c) => (
            <StaggerItem key={c.t} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-forest text-sage"><c.icon className="size-5" /></span>
              <div>
                <p className="font-display font-bold text-coal">{c.t}</p>
                <p className="mt-1 text-sm leading-relaxed text-stone">{c.d}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

// ═══ Results & evidence (used on /features) ════════════════════

const ANNOTATIONS = [
  ['Reproduced', 'Re-run before it counts as confirmed.'],
  ['Screenshot', 'The failing element is highlighted; secrets are masked.'],
  ['Steps to reproduce', 'Exactly what the tester did, in order.'],
  ['Expected vs actual', 'Measured signals, not opinions.'],
] as const;

export function Evidence() {
  const before = DEMO_SCREENSHOTS.find((s) => s.id === 'demo-shot-1042-before')?.src;
  const after = DEMO_SCREENSHOTS.find((s) => s.id === 'demo-shot-1042-after')?.src;
  return (
    <Section dark className="isolate overflow-hidden">
      <Aurora tone="dark" />
      <Container>
        <SectionHeading dark eyebrow="Results & evidence" title={<>Every issue is designed to arrive with <Serif className="text-sage">proof.</Serif></>} description="A confirmed issue is something the tester reproduced and can show you. Anything less is labelled for what it is." />
        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <Reveal className="lg:col-span-8">
            <div className="overflow-hidden rounded-2xl bg-ivory text-coal">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-coal/10 px-5 py-3">
                <div className="flex items-center gap-3"><span className="font-mono text-xs text-stone">SAMPLE-1042</span><SevPill s="CRITICAL" /><span className="rounded-full bg-sage/50 px-2 py-0.5 text-[10px] font-semibold text-forest">Confirmed</span></div>
                <span className="text-xs text-stone">Buttons · /products/headphones · desktop</span>
              </div>
              <div className="p-5">
                <p className="font-display text-xl font-bold">“Add to cart” button does nothing</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[[before, 'Before click'], [after, 'After click']].map(([src, l]) => src && (
                    <figure key={l} className="group/img overflow-hidden rounded-lg border border-coal/10">
                      <figcaption className="border-b border-coal/10 bg-white/70 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-stone">{l}</figcaption>
                      <RevealImage src={src} alt={`Illustration: product page ${l?.toLowerCase()}`} delay={l === 'After click' ? 0.25 : 0} />
                    </figure>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                  <div><p className="font-mono text-[10px] uppercase tracking-wider text-stone">Steps</p><ol className="mt-1 list-decimal space-y-0.5 pl-4 text-coal/80"><li>Open /products/headphones</li><li>Click “Add to cart”</li><li>Check the cart count</li></ol></div>
                  <div><p className="font-mono text-[10px] uppercase tracking-wider text-stone">Expected</p><p className="mt-1 text-coal/80">Cart count becomes 1.</p></div>
                  <div><p className="font-mono text-[10px] uppercase tracking-wider text-stone">Actual</p><p className="mt-1 text-coal/80">No request, no DOM change; count stayed 0.</p></div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-ivory/45">Sample issue from a fictional website.</p>
          </Reveal>
          <div className="lg:col-span-4">
            <Stagger as="ol" gap={0.2} className="space-y-6">
              {ANNOTATIONS.map(([t, d], i) => (
                <StaggerItem as="li" key={t} className="flex gap-4">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-sage/50 font-mono text-xs text-sage">{i + 1}</span>
                  <div><p className="font-display font-semibold text-ivory">{t}</p><p className="mt-1 text-sm text-ivory/60">{d}</p></div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </Container>
    </Section>
  );
}

// ═══ Security (used on /features) ══════════════════════════════

export function Security() {
  const items = [
    { icon: Lock, t: 'Encrypted credentials', d: 'Test passwords and tokens are encrypted with AES-256-GCM and masked in screenshots and logs. In today’s preview, passwords aren’t saved at all.' },
    { icon: Globe, t: 'Authorized domains only', d: 'You confirm authorization per website, and the tester is restricted to the domains you approve.' },
    { icon: ShieldCheck, t: 'Approval before risky actions', d: 'Buttons that could delete data, place orders or change accounts wait for a person.' },
    { icon: BadgeCheck, t: 'Evidence-based reporting', d: '“Confirmed” means reproduced with a screenshot. Flaky and AI-only findings stay separate.' },
  ];
  return (
    <Section id="security">
      <Container>
        <SectionHeading eyebrow="Security & trust" title={<>Safe on the sites you <Serif className="text-terra">care about.</Serif></>} description="These safeguards are part of the platform’s design." />
        <Stagger className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((s) => (
            <StaggerItem key={s.t} className="glass group rounded-2xl p-6 transition-transform duration-500 hover:-translate-y-1.5">
              <s.icon className="size-5 text-terra" />
              <h3 className="mt-5 font-display text-lg font-semibold text-coal">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone">{s.d}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

// ═══ Pricing — configurable plans, no invented prices ═════════

function priceView(p: Plan, billing: Billing) {
  const v = p.price[billing];
  const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: PRICING.currency, maximumFractionDigits: 0 }).format(n);
  if (v === 0) return { big: 'Free', small: p.status === 'available' ? 'during early access' : '' };
  if (v === null) return { big: 'To be announced', small: billing === 'yearly' ? 'Yearly price published at launch' : 'Monthly price published at launch' };
  return { big: money(v), small: billing === 'yearly' ? 'per month, billed yearly' : 'per month' };
}

function PlanCard({ p, billing }: { p: Plan; billing: Billing }) {
  const { session } = useStore();
  const dark = !!p.highlighted;
  const pv = priceView(p, billing);
  const to = session && p.cta.signedInTo ? p.cta.signedInTo : p.cta.to;
  const label = session && p.cta.signedInLabel ? p.cta.signedInLabel : p.cta.label;
  return (
    <div className={cx('group relative flex h-full flex-col rounded-2xl p-7 transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-2', dark ? 'bg-forest text-ivory shadow-[0_40px_70px_-34px_rgba(32,55,45,0.8)]' : 'glass glass-sheen hover:shadow-[inset_0_1px_0_white,0_40px_70px_-34px_rgba(32,55,45,0.45)]')}>
      {dark && <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"><div className="absolute -right-16 -top-16 size-48 rounded-full bg-sage/25 blur-3xl" /></div>}
      <div className="relative flex items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{p.name}</h3>
        <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-semibold', p.status === 'available' ? 'bg-sage/50 text-forest' : dark ? 'bg-white/10 text-ivory/80' : 'bg-terra/10 text-terra')}>{p.status === 'available' ? 'Available now' : 'At launch'}</span>
      </div>
      <p className={cx('relative mt-2 min-h-[3em] text-sm leading-relaxed', dark ? 'text-ivory/65' : 'text-stone')}>{p.tagline}</p>
      <div className="relative mt-6 min-h-[76px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={billing + pv.big} initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(6px)' }} transition={{ duration: 0.3 }}>
            <p className={cx('font-display font-bold tracking-tight', pv.big.length > 8 ? 'text-[26px] leading-tight' : 'text-5xl')}>{pv.big}</p>
            {pv.small && <p className={cx('mt-1 text-xs', dark ? 'text-ivory/55' : 'text-stone')}>{pv.small}</p>}
          </motion.div>
        </AnimatePresence>
      </div>
      <dl className={cx('relative mt-6 space-y-2 border-y py-4 text-[13px]', dark ? 'border-white/10' : 'border-forest/10')}>
        {p.limits.map((l) => (
          <div key={l.label} className="flex items-center justify-between gap-3">
            <dt className={dark ? 'text-ivory/60' : 'text-stone'}>{l.label}</dt>
            <dd className="font-semibold">{formatLimit(l)}</dd>
          </div>
        ))}
      </dl>
      <ul className="relative mt-5 flex-1 space-y-2.5">
        {p.features.map((f) => <li key={f} className="flex gap-2.5 text-sm"><Check className={cx('mt-0.5 size-4 shrink-0', dark ? 'text-sage' : 'text-[#4f6b45]')} />{f}</li>)}
      </ul>
      <MLink to={to} size="lg" variant={dark ? 'light' : p.status === 'available' ? 'primary' : 'secondary'} className="relative mt-8 w-full">{label} <ArrowRight className="size-4" /></MLink>
    </div>
  );
}

export function Pricing({ heading = true }: { heading?: boolean }) {
  const [billing, setBilling] = useState<Billing>('monthly');
  return (
    <Section id="pricing" className="isolate overflow-hidden">
      <Aurora className="opacity-60" />
      <Container>
        {heading && <SectionHeading center n="04" eyebrow="Pricing" title={<>Simple plans, <Serif className="text-terra">honest limits.</Serif></>} description="Early access is free today. Paid plans open with the testing engine — prices and usage limits will be published then." />}
        <Reveal className={cx('flex flex-col items-center gap-2', heading ? 'mt-10' : 'mt-2')}>
          <div role="radiogroup" aria-label="Billing period" className="glass relative inline-flex rounded-full p-1">
            {(['monthly', 'yearly'] as const).map((b) => (
              <button key={b} role="radio" aria-checked={billing === b} onClick={() => setBilling(b)} className={cx('relative z-10 inline-flex h-9 items-center gap-2 rounded-full px-5 text-sm font-semibold capitalize transition-colors duration-300', billing === b ? 'text-ivory' : 'text-coal/70 hover:text-coal')}>
                {billing === b && <motion.span layoutId="billing-pill" className="absolute inset-0 -z-10 rounded-full bg-forest" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                {b}
                {b === 'yearly' && PRICING.yearlyBadge && <span className="rounded-full bg-terra px-1.5 text-[10px] text-white">{PRICING.yearlyBadge}</span>}
              </button>
            ))}
          </div>
        </Reveal>
        <Stagger gap={0.1} className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => <StaggerItem key={p.id} className="h-full"><PlanCard p={p} billing={billing} /></StaggerItem>)}
        </Stagger>
        <Reveal className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-stone">
          Paid plan contents are planned and may change before launch. There is no checkout yet and nothing is charged. Questions about plans? <Link to="/contact?topic=business" className="link-underline font-semibold text-coal">Contact us</Link>.
        </Reveal>
      </Container>
    </Section>
  );
}

// ═══ FAQ — answers reflect what exists today ══════════════════

const FAQS = [
  { q: 'What does Autonomous Web Tester do?', a: 'It automatically tests websites you own or are authorized to test. It discovers pages, checks navigation, buttons, forms and layouts, and reports issues with screenshots and reproduction steps. It’s in early access: the web workspace is available now, and the automated testing engine is in active development.' },
  { q: 'How does the testing work?', a: 'You add a website and confirm you’re authorized to test it. The testing engine discovers pages through links, menus, sitemaps and app routes, checks them on desktop, tablet and mobile, and only marks an issue as confirmed when it can reproduce it with a screenshot. You can walk through this flow today in the interactive demo, which uses sample data.' },
  { q: 'Which websites can I test?', a: 'Only websites you own or have written permission to test. You confirm authorization for each website, and testing is restricted to the domains you approve. We recommend testing a staging environment.' },
  { q: 'Do I need to provide login credentials?', a: 'No — they’re optional and only needed for pages behind a login. Use dedicated test accounts, never real customer accounts. In the current preview, passwords are not saved at all; only the role and username are kept.' },
  { q: 'How is my data kept secure?', a: 'Once stored on the server, test passwords and tokens are encrypted with AES-256-GCM and masked in screenshots and logs. The tester stays within the domains you approve, and actions that could change data — deleting, ordering, changing accounts — wait for a person’s approval.' },
  { q: 'How are results presented?', a: 'In your workspace: a run summary, a list of issues with severity and status, and an issue view with screenshots, steps to reproduce and expected vs actual. Confirmed, flaky and AI-only findings are shown separately. Today these screens show sample data.' },
  { q: 'What subscription plans are available?', a: 'Right now there’s free early access with no payment details. Paid plans with monthly and yearly billing, prices and usage limits will be published when the testing engine launches.' },
  { q: 'Can I cancel my subscription?', a: 'There are no paid subscriptions yet, so there’s nothing to cancel and you won’t be charged. Cancellation terms will be published together with the paid plans.' },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <Label n="05">FAQ</Label>
          <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.035em] text-coal sm:text-5xl">Questions, <Serif className="text-terra">answered.</Serif></h2>
          <p className="mt-4 text-stone">Something else? <Link to="/contact" className="link-underline font-semibold text-coal">Contact us</Link>.</p>
        </Reveal>
        <Stagger gap={0.06} className="space-y-3 lg:col-span-8">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <StaggerItem key={f.q} className={cx('rounded-2xl transition-[background-color,box-shadow] duration-500', isOpen ? 'glass' : 'border border-forest/10 hover:bg-white/50')}>
                <h3>
                  <button onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} aria-controls={`faq-${i}`} id={`faq-q-${i}`} className="group flex w-full items-center justify-between gap-6 px-6 py-5 text-left font-display text-[17px] font-semibold text-coal">
                    <span className="transition-colors group-hover:text-forest">{f.q}</span>
                    <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.3, ease: EASE }} className={cx('grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-300', isOpen ? 'bg-forest text-ivory' : 'bg-forest/[0.06] text-forest')}><Plus className="size-4" /></motion.span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
                      <p className="max-w-2xl px-6 pb-6 text-[15px] leading-relaxed text-stone">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </StaggerItem>
            );
          })}
        </Stagger>
      </Container>
    </Section>
  );
}
