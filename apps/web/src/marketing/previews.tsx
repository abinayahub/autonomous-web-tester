import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import {
  AlertTriangle,
  BarChart3,
  Bug,
  Camera,
  Check,
  Compass,
  FileText,
  Images,
  LayoutDashboard,
  ListChecks,
  Lock,
  Monitor,
  RotateCcw,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react';
import { cx } from '../components/ui';
import { DEMO_ISSUES, DEMO_SCREENSHOTS } from '../lib/demo';
import { AppFrame, EASE, PreviewBadge } from './kit';

/**
 * Marketing mockups. All values are illustrative sample data (fictional .example sites) and every mockup is labelled.
 * Contents animate with opacity / width / colour / counts so the demo still plays when reduced motion is on;
 * movement (scanner beam, parallax, slide-ins) is only added when motion is allowed.
 */

const PASS = 'text-[#4f6b45]';

type Sev = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
const SEV: Record<Sev, { label: string; dot: string }> = {
  CRITICAL: { label: 'Critical', dot: 'bg-terra' },
  HIGH: { label: 'High', dot: 'bg-[#dd9a6c]' },
  MEDIUM: { label: 'Medium', dot: 'bg-[#d4b46a]' },
  LOW: { label: 'Low', dot: 'bg-sage' },
  INFO: { label: 'Info', dot: 'bg-stone/50' },
};

export function SevPill({ s }: { s: Sev }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-coal/10 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-coal/80">
      <span className={cx('size-1.5 rounded-full', SEV[s].dot)} />
      {SEV[s].label}
    </span>
  );
}

/** Counts from 0 to `to` once when `run` becomes true. Not motion, so it also runs with reduced motion. */
export function useCountUp(to: number, run: boolean, ms = 1400, delay = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      setV(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, to, ms, delay]);
  return v;
}

/** Counts up once when scrolled into view. */
export function CountUp({ to, decimals = 0, suffix = '', ms = 1600, delay = 0, className }: { to: number; decimals?: number; suffix?: string; ms?: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const v = useCountUp(to, seen, ms, delay);
  return <span ref={ref} className={cx('tabular-nums', className)}>{v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

/** Number that glides smoothly to each new value. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, { duration: 0.7, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) });
    from.current = value;
    return () => controls.stop();
  }, [value]);
  return <span className={className}>{shown.toLocaleString()}</span>;
}

/** Image that unveils top-to-bottom once it scrolls into view, then zooms very slightly on hover. */
export function RevealImage({ src, alt, className, delay = 0 }: { src: string; alt: string; className?: string; delay?: number }) {
  return (
    <div className="overflow-hidden">
      <motion.img
        src={src}
        alt={alt}
        className={cx('aspect-[16/10] w-full object-cover object-top transition-transform duration-700 ease-out group-hover/img:scale-[1.03]', className)}
        initial={{ clipPath: 'inset(0 0 100% 0)', opacity: 0.4 }}
        whileInView={{ clipPath: 'inset(0 0 0% 0)', opacity: 1 }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={{ duration: 1, ease: EASE, delay }}
      />
    </div>
  );
}

const shotSrc = (id: string) => DEMO_SCREENSHOTS.find((s) => s.id === id)?.src;

// ── Hero: a simulated test run ──────────────────────────────────

const PAGES = ['/', '/products', '/products/headphones', '/cart', '/signup', '/account/orders'];
const CHECKS: Array<{ m: string; ok: boolean; note: string }> = [
  { m: 'Navigation', ok: true, note: '12 links followed' },
  { m: 'Layout', ok: true, note: '4 viewports' },
  { m: 'Forms', ok: true, note: 'rules enforced' },
  { m: 'Buttons', ok: false, note: '“Add to cart” no effect' },
];
/** Delay (ms) before each phase. 1–6: pages discovered; 7–10: checks; 11: issue; 12: evidence; 13–14: done. */
const PHASE_MS = [900, 600, 480, 480, 480, 480, 480, 620, 540, 540, 640, 700, 900, 900];
const LAST = PHASE_MS.length;
const progressFor = (ph: number) => (ph <= 0 ? 0 : ph >= LAST ? 100 : Math.round((ph / (LAST - 1)) * 92));

function useTimeline(start: boolean) {
  const [phase, setPhase] = useState(0);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (!start || phase >= LAST) return;
    const t = setTimeout(() => setPhase((p) => p + 1), PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [start, phase, run]);
  const replay = useCallback(() => { setPhase(0); setRun((r) => r + 1); }, []);
  return { phase, replay };
}

/** Wireframe of the site under test; regions are outlined as they're scanned. */
function MockSite({ phase }: { phase: number }) {
  const reduce = useReducedMotion();
  const done = phase >= LAST;
  const box = (on: boolean, bad = false) => cx('pointer-events-none absolute rounded-[5px] border-[1.5px] transition-opacity duration-500', on ? 'opacity-100' : 'opacity-0', bad ? 'border-terra bg-terra/10' : 'border-[#7f9672] bg-sage/15');
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/80 bg-white/70 p-3 shadow-[inset_0_1px_0_white]">
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-1.5"><span className="size-3 rounded-[4px] bg-forest" /><span className="h-1.5 w-12 rounded-full bg-coal/30" /></div>
        <div className="flex gap-1.5">{[10, 8, 9].map((w, i) => <span key={i} className="h-1.5 rounded-full bg-coal/15" style={{ width: w * 3 }} />)}</div>
        <span className={box(phase >= 2)} style={{ inset: -4 }} />
      </div>
      <div className="relative mt-3 rounded-lg bg-[#efece3] p-3">
        <span className="block h-2 w-3/4 rounded-full bg-coal/30" />
        <span className="mt-1.5 block h-2 w-1/2 rounded-full bg-coal/20" />
        <span className="mt-3 inline-block rounded-full bg-forest px-2.5 py-1 text-[8px] font-semibold text-ivory">Shop now</span>
        <span className={box(phase >= 4)} style={{ inset: -3 }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {['Headphones', 'Watch', 'Speaker'].map((n, i) => (
          <div key={n} className="relative rounded-lg border border-coal/[0.08] bg-white p-1.5">
            <div className="h-8 rounded-md bg-[#efece3]" />
            <p className="mt-1 truncate text-[8px] font-semibold text-coal/70">{n}</p>
            <span className={cx('mt-1 block rounded-full px-1 py-0.5 text-center text-[7px] font-semibold transition-colors duration-500', i === 0 && phase >= 10 ? 'bg-terra text-white' : 'bg-forest/85 text-ivory')}>Add to cart</span>
            <span className={box(phase >= 6 + i && !(i === 0 && phase >= 10))} style={{ inset: -3 }} />
            {i === 0 && <span className={box(phase >= 10, true)} style={{ inset: -3 }} />}
          </div>
        ))}
      </div>
      {/* Scanner beam — movement, so only rendered when motion is allowed. */}
      {!reduce && phase >= 1 && !done && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-14"
          initial={{ top: '-18%', opacity: 0 }}
          animate={{ top: ['-18%', '100%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.6, ease: [0.45, 0, 0.55, 1], times: [0, 0.12, 0.88, 1], repeat: Infinity, repeatDelay: 1.2 }}
        >
          <div className="h-full bg-gradient-to-b from-transparent via-sage/15 to-sage/30" />
          <div className="h-px bg-[#7f9672]" />
        </motion.div>
      )}
      <p className="mt-2.5 flex items-center gap-1.5 text-[9px] text-stone"><Lock className="size-2.5" />shop.northwind.example · sample site</p>
    </div>
  );
}

export function HeroPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const { phase, replay } = useTimeline(seen);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const yA = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 30, reduce ? 0 : -30]);
  const yB = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : -20, reduce ? 0 : 24]);
  const pct = progressFor(phase);
  const pagesFound = Math.min(PAGES.length, Math.max(0, phase));
  const checksShown = Math.min(CHECKS.length, Math.max(0, phase - 6));
  const passed = [0, 38, 74, 112, 149, 187, 226, 268, 301, 335, 371, 371, 371, 412, 412][Math.min(phase, LAST)]!;
  const failed = phase >= 10 ? 1 : 0;
  const done = phase >= LAST;
  const shot = shotSrc('demo-shot-1042-after');
  const status = phase === 0 ? 'Connecting…' : done ? 'Run complete' : phase < 7 ? 'Discovering pages' : phase < 11 ? 'Running checks' : 'Collecting evidence';

  return (
    <div ref={ref} className="relative">
      <AppFrame
        title={<span className="flex items-center gap-1.5"><Lock className="size-3" />app · Live test run</span>}
      >
        <div className="p-4 sm:p-5">
          {/* status + progress */}
          <div className="flex items-center gap-2.5">
            <span className="relative inline-grid size-2 shrink-0 place-items-center" aria-hidden>
              <span className={cx('size-2 rounded-full transition-colors duration-500', done ? 'bg-[#6f8a62]' : 'bg-terra')} />
              {!done && phase > 0 && (
                <motion.span className="absolute inset-0 rounded-full border border-terra" initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 2.8 }} transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.3 }} />
              )}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={status} className="mr-auto truncate text-[13px] font-semibold text-coal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>{status}</motion.p>
            </AnimatePresence>
            <span className="hidden items-center gap-1 text-stone sm:flex" aria-label="Viewports: desktop, tablet, mobile">
              <Monitor className="size-3.5" /><Tablet className="size-3.5" /><Smartphone className="size-3.5" />
            </span>
            <span className="w-9 text-right font-mono text-[12px] tabular-nums text-coal">{pct}%</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-forest/[0.08]">
            <motion.div className={cx('relative h-full overflow-hidden rounded-full transition-colors duration-700', done ? 'bg-[#6f8a62]' : 'bg-terra')} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: EASE }}>
              {!done && phase > 0 && (
                <motion.span aria-hidden className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/70 to-transparent" initial={{ left: '-30%', opacity: 0.4 }} animate={{ left: '110%', opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.3 }} />
              )}
            </motion.div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1.08fr_1fr]">
            <MockSite phase={phase} />
            <div className="flex min-w-0 flex-col">
              <div className="grid grid-cols-3 gap-2 text-center">
                {([['Pages', pagesFound, 'text-coal'], ['Passed', passed, PASS], ['Failed', failed, failed ? 'text-terra' : 'text-coal']] as const).map(([l, v, c]) => (
                  <div key={l} className={cx('rounded-lg border bg-white/60 py-2 transition-colors duration-500', l === 'Failed' && failed ? 'border-terra/30 bg-terra/[0.06]' : 'border-white/80')}>
                    <p className={cx('font-display text-base font-bold tabular-nums transition-colors duration-500', c)}><AnimatedNumber value={v} /></p>
                    <p className="text-[9px] uppercase tracking-wider text-stone">{l}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone"><Compass className="size-3" />Discovered pages</p>
              <ul className="mt-1.5 space-y-1 font-mono text-[10.5px]">
                {PAGES.map((p, i) => (
                  <li key={p} className={cx('flex items-center gap-1.5 truncate transition-[opacity,filter] duration-500', i < pagesFound ? 'opacity-100 blur-0' : 'opacity-0 blur-[2px]')}>
                    <span className={cx('size-1 rounded-full', i === pagesFound - 1 && !done ? 'bg-terra' : 'bg-forest/40')} />
                    <span className="truncate text-coal/75">{p}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1 border-t border-forest/10 pt-3">
                {CHECKS.map((c, i) => (
                  <li key={c.m} className={cx('-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[11px] transition-[opacity,background-color] duration-500', i < checksShown ? 'opacity-100' : 'opacity-0', !c.ok && i < checksShown && 'bg-terra/[0.08]')}>
                    {c.ok ? <Check className={cx('size-3.5', PASS)} /> : <X className="size-3.5 text-terra" />}
                    <span className="w-16 font-semibold text-coal">{c.m}</span>
                    <span className={cx('truncate', c.ok ? 'text-stone' : 'text-terra')}>{c.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </AppFrame>

      {/* Layered glass cards that overlap the window's edges (stacked below it on small screens). */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:mt-0 lg:block">
        <motion.div style={{ y: yA }} className="lg:absolute lg:-bottom-12 lg:-left-10 lg:w-[290px]">
          <motion.div
            className="glass flex gap-3 rounded-xl border-l-[3px] border-l-terra p-3"
            initial={false}
            animate={{ opacity: phase >= 11 ? 1 : 0, filter: phase >= 11 ? 'blur(0px)' : 'blur(6px)', y: phase >= 11 ? 0 : 12 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-terra" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-terra">UI issue detected · Critical</p>
              <p className="mt-0.5 text-[12px] font-semibold leading-snug text-coal">“Add to cart” button does nothing</p>
              <p className="mt-0.5 text-[10px] text-stone">/products/headphones · reproduced 3 of 3</p>
            </div>
          </motion.div>
        </motion.div>
        <motion.div style={{ y: yB }} className="lg:absolute lg:-right-10 lg:-top-12 lg:w-[226px]">
          <motion.div
            className="glass flex items-center gap-2.5 rounded-xl p-2"
            initial={false}
            animate={{ opacity: phase >= 12 ? 1 : 0, filter: phase >= 12 ? 'blur(0px)' : 'blur(6px)', y: phase >= 12 ? 0 : -12 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            {shot && <img src={shot} alt="" className="h-11 w-[72px] shrink-0 rounded-md border border-white object-cover object-top" />}
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-forest"><Camera className="size-3" />Evidence captured</p>
              <p className="truncate text-[10px] text-stone">Failing element highlighted</p>
            </div>
          </motion.div>
        </motion.div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 lg:mt-16 lg:pl-[270px]">
        <PreviewBadge label="Simulated run · sample data" />
        <button onClick={replay} disabled={!done} className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-opacity duration-300', done ? 'text-coal opacity-100 hover:bg-white/60 hover:text-terra' : 'pointer-events-none opacity-0')}>
          <RotateCcw className="size-3.5" />Replay
        </button>
      </div>
    </div>
  );
}

// ── Product preview: how results are presented ─────────────────

const RUN_ISSUES = DEMO_ISSUES.filter((i) => i.projectId === 'demo-northwind' && i.classification === 'CONFIRMED').slice(0, 5);
const MODULE_ROWS: Array<[string, number, number]> = [
  ['Navigation', 118, 1],
  ['Buttons', 96, 3],
  ['Forms', 64, 2],
  ['Layout', 102, 4],
  ['Responsive', 72, 5],
];
const SEV_SPLIT: Array<[Sev, number]> = [['CRITICAL', 2], ['HIGH', 4], ['MEDIUM', 5], ['LOW', 4]];
const NAV = [
  { icon: LayoutDashboard, t: 'Overview' },
  { icon: Bug, t: 'Issues', active: true },
  { icon: Images, t: 'Screenshots' },
  { icon: FileText, t: 'Reports' },
];

export function ResultsDashboard() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.25 });
  const [sel, setSel] = useState(RUN_ISSUES[0]?.id);
  const issue = RUN_ISSUES.find((i) => i.id === sel) ?? RUN_ISSUES[0];
  const sevTotal = SEV_SPLIT.reduce((a, [, n]) => a + n, 0);
  const grow = (w: number, delay: number) => ({ initial: { width: 0 }, animate: { width: seen ? `${w}%` : 0 }, transition: { duration: 1.1, ease: EASE, delay } });
  return (
    <div ref={ref}>
      <AppFrame className="bg-white/70" title={<span className="flex items-center gap-1.5"><Lock className="size-3" />app · Northwind Shop · Run results</span>}>
        <div className="grid grid-cols-1 lg:grid-cols-[190px_1fr]">
          {/* sidebar */}
          <aside className="hidden border-r border-white/70 bg-white/25 p-4 lg:block">
            <p className="px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-stone">Workspace</p>
            <ul className="mt-3 space-y-1">
              {NAV.map((n) => (
                <li key={n.t} className={cx('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] font-medium', n.active ? 'bg-forest text-ivory' : 'text-coal/70')}>
                  <n.icon className="size-3.5" />{n.t}
                  {n.active && <span className="ml-auto rounded-full bg-terra px-1.5 text-[10px] font-semibold text-white">15</span>}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-xl border border-white/80 bg-white/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone">Run #7</p>
              <p className="mt-1 text-[11px] text-coal">14 pages · 4 viewports</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#4f6b45]"><Check className="size-3" />Completed</p>
            </div>
          </aside>

          <div className="min-w-0 p-4 sm:p-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {([['Pages tested', 14, 0, '', 'text-coal'], ['Checks passed', 452, 0, '', PASS], ['Checks failed', 15, 0, '', 'text-terra'], ['Pass rate', 96.8, 1, '%', 'text-forest']] as const).map(([l, v, d, s, c], i) => (
                <div key={l} className="rounded-xl border border-white/80 bg-white/55 p-3.5 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-[0_16px_30px_-22px_rgba(32,55,45,0.6)]">
                  <p className="text-[11px] text-stone">{l}</p>
                  <p className={cx('mt-1 font-display text-2xl font-bold tracking-tight', c)}><CountUp to={v} decimals={d} suffix={s} delay={i * 120} /></p>
                </div>
              ))}
            </div>

            {/* charts */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr]">
              <div className="rounded-xl border border-white/80 bg-white/55 p-4">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-coal"><BarChart3 className="size-3.5 text-stone" />Checks by module</p>
                <ul className="mt-3 space-y-2.5">
                  {MODULE_ROWS.map(([m, ok, bad], i) => {
                    const max = 123;
                    return (
                      <li key={m} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-[11px]">
                        <span className="text-stone">{m}</span>
                        <span className="flex h-2 overflow-hidden rounded-full bg-forest/[0.07]">
                          <motion.span className="h-full bg-forest/80" {...grow((ok / max) * 100, 0.15 + i * 0.08)} />
                          <motion.span className="h-full bg-terra" {...grow((bad / max) * 100, 0.7 + i * 0.08)} />
                        </span>
                        <span className="text-right tabular-nums text-coal">{ok}<span className="text-terra"> /{bad}</span></span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 flex items-center gap-3 text-[10px] text-stone"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-forest/80" />Passed</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-terra" />Failed</span></p>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/55 p-4">
                <p className="text-[12px] font-semibold text-coal">Open issues by severity</p>
                <div className="mt-4 flex h-3 gap-0.5 overflow-hidden rounded-full">
                  {SEV_SPLIT.map(([s, n], i) => (
                    <motion.span key={s} className={cx('h-full first:rounded-l-full last:rounded-r-full', SEV[s].dot)} initial={{ width: 0 }} animate={{ width: seen ? `${(n / sevTotal) * 100}%` : 0 }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 + i * 0.15 }} />
                  ))}
                </div>
                <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  {SEV_SPLIT.map(([s, n]) => (
                    <li key={s} className="flex items-center gap-1.5"><span className={cx('size-2 rounded-full', SEV[s].dot)} /><span className="text-stone">{SEV[s].label}</span><span className="ml-auto font-semibold tabular-nums text-coal">{n}</span></li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-forest/10 pt-3 text-[11px] text-stone">Confirmed issues only. Flaky and needs-review findings are listed separately.</p>
              </div>
            </div>

            {/* issues + evidence */}
            <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.1fr]">
              <div className="rounded-xl border border-white/80 bg-white/55 p-2">
                <p className="flex items-center gap-1.5 px-2 pb-2 pt-1.5 text-[12px] font-semibold text-coal"><ListChecks className="size-3.5 text-stone" />Confirmed issues <span className="font-normal text-stone">· select one</span></p>
                <ul className="space-y-1">
                  {RUN_ISSUES.map((i, n) => {
                    const on = i.id === issue?.id;
                    return (
                      <motion.li key={i.id} initial={{ opacity: 0 }} animate={{ opacity: seen ? 1 : 0 }} transition={{ duration: 0.5, delay: 0.4 + n * 0.12 }}>
                        <button onClick={() => setSel(i.id)} aria-pressed={on} className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-300', on ? 'bg-forest text-ivory' : 'hover:bg-white/80')}>
                          <span className={cx('font-mono text-[10px]', on ? 'text-sage' : 'text-stone')}>{i.key.replace('DEMO', 'SAMPLE')}</span>
                          <span className={cx('min-w-0 flex-1 truncate text-[12px] font-medium', on ? 'text-ivory' : 'text-coal')}>{i.title}</span>
                          <SevPill s={i.severity} />
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
              {issue && (
                <div className="rounded-xl border border-white/80 bg-white/70 p-3">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={issue.id} initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(6px)' }} transition={{ duration: 0.3 }}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold leading-snug text-coal">{issue.title}</p>
                        <span className="shrink-0 rounded-full bg-sage/40 px-2 py-0.5 text-[10px] font-semibold text-forest">Confirmed</span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-stone">{issue.pageName} · {issue.device.toLowerCase()}</p>
                      {shotSrc(issue.screenshotIds[0]!) && (
                        <figure className="mt-2.5 overflow-hidden rounded-lg border border-coal/10">
                          <img src={shotSrc(issue.screenshotIds[0]!)} alt={`Sample screenshot: ${issue.title}`} className="aspect-[16/8] w-full object-cover object-top" />
                        </figure>
                      )}
                      <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg bg-[#eef1ea] p-2"><p className="text-[9px] font-semibold uppercase tracking-wider text-[#4f6b45]">Expected</p><p className="mt-0.5 line-clamp-2 text-coal/80">{issue.expected}</p></div>
                        <div className="rounded-lg bg-terra/[0.08] p-2"><p className="text-[9px] font-semibold uppercase tracking-wider text-terra">Actual</p><p className="mt-0.5 line-clamp-2 text-coal/80">{issue.actual}</p></div>
                      </div>
                      <ol className="mt-2.5 space-y-0.5 text-[11px] text-coal/75">
                        {issue.steps.slice(0, 3).map((s, n) => <li key={n} className="flex gap-2"><span className="font-mono text-stone">{n + 1}.</span><span className="truncate">{s}</span></li>)}
                      </ol>
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        </div>
      </AppFrame>
    </div>
  );
}
