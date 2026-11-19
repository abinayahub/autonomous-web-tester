import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { AnimatePresence, MotionConfig, motion, useScroll, useSpring } from 'motion/react';
import { ArrowRight, Mail, Menu, X } from 'lucide-react';
import { cx } from '../components/ui';
import { useStore } from '../lib/store';
import { Container, EASE, Logo, MLink, Serif } from './kit';
import { useStartHref } from './sections';

const NAV = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
];

/** Scrolls to #hash targets after route changes (and to top otherwise). */
function useHashScroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return () => clearTimeout(t);
  }, [pathname, hash]);
}

/** Which landing section is currently in the middle of the viewport. */
function useActiveSection(enabled: boolean) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setActive(null); return; }
    const els = NAV.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    const onScroll = () => { if (window.scrollY < 300) setActive(null); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, [enabled]);
  return active;
}

/** Reading-progress hairline along the bottom of the nav pill. */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  return (
    <span aria-hidden className="pointer-events-none absolute inset-x-6 -bottom-px h-px overflow-hidden">
      <motion.span style={{ scaleX }} className="block h-full origin-left bg-gradient-to-r from-sage via-forest to-terra" />
    </span>
  );
}

function Navbar() {
  const { session } = useStore();
  const [scrolled, setScrolled] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { pathname, hash } = useLocation();
  const active = useActiveSection(pathname === '/');
  useEffect(() => setMobile(false), [pathname, hash]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobile]);
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE }}
        className={cx(
          'relative mx-auto max-w-6xl rounded-full transition-[background-color,box-shadow,border-color] duration-500',
          scrolled || mobile ? 'glass' : 'border border-white/50 bg-white/30 backdrop-blur-md',
        )}
      >
        <div className="flex h-14 items-center gap-6 pl-4 pr-2 sm:pl-5">
          <Logo />
          <nav aria-label="Main" className="mx-auto hidden items-center gap-1 lg:flex">
            {NAV.map((n) => {
              const on = active === n.id;
              return (
                <Link key={n.id} to={`/#${n.id}`} aria-current={on ? 'location' : undefined} className={cx('relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300', on ? 'text-ivory' : 'text-coal/70 hover:text-coal')}>
                  {on && <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-forest" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto hidden items-center gap-1 lg:ml-0 lg:flex">
            {session ? (
              <MLink to="/dashboard">Open dashboard <ArrowRight className="size-4" /></MLink>
            ) : (
              <>
                <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-coal/70 transition-colors hover:bg-white/60 hover:text-coal">Login</Link>
                <MLink to="/signup">Get Started <ArrowRight className="size-4" /></MLink>
              </>
            )}
          </div>
          <button onClick={() => setMobile((m) => !m)} className="ml-auto grid size-10 place-items-center rounded-full text-coal hover:bg-white/60 lg:hidden" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile}>
            {mobile ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        <ScrollProgress />
      </motion.div>
      <AnimatePresence>
        {mobile && (
          <motion.div
            initial={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
            transition={{ duration: 0.3, ease: EASE }}
            className="glass mx-auto mt-2 max-h-[calc(100dvh-6rem)] max-w-6xl overflow-y-auto rounded-3xl p-5 lg:hidden"
          >
            {NAV.map((n, i) => (
              <motion.div key={n.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 + i * 0.04, duration: 0.3 }}>
                <Link to={`/#${n.id}`} className="block border-b border-forest/10 py-3.5 font-display text-lg font-semibold text-coal">{n.label}</Link>
              </motion.div>
            ))}
            <div className="grid grid-cols-1 gap-3 pt-5 sm:grid-cols-2">
              {session ? (
                <MLink to="/dashboard" size="lg">Open dashboard</MLink>
              ) : (
                <>
                  <MLink to="/login" size="lg" variant="secondary">Login</MLink>
                  <MLink to="/signup" size="lg">Get Started</MLink>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function EarlyAccessBar() {
  return (
    <div className="bg-forest px-4 py-2 text-center text-xs text-ivory/75">
      <span className="font-semibold text-sage">Early access</span> — the app is ready to explore; the autonomous testing engine is in active development.{' '}
      <Link to="/demo" className="link-underline font-semibold text-ivory">Try the demo</Link>
    </div>
  );
}

function Footer() {
  const start = useStartHref();
  const cols = [
    { t: 'Product', links: [['Features', '/#features'], ['How It Works', '/#how-it-works'], ['Product preview', '/#product'], ['Pricing', '/#pricing'], ['Interactive demo', '/demo']] },
    { t: 'Resources', links: [['All features', '/features'], ['Security', '/features#security'], ['Pricing details', '/pricing'], ['FAQ', '/#faq']] },
    { t: 'Account', links: [['Login', '/login'], ['Create account', '/signup'], ['Forgot password', '/forgot-password']] },
  ];
  return (
    <footer className="relative isolate overflow-hidden rounded-t-[40px] bg-forest text-ivory">
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 -z-10 size-[520px] rounded-full bg-sage/15 blur-[100px]" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 right-[-10%] -z-10 size-[520px] rounded-full bg-terra/15 blur-[100px]" />
      <Container className="pt-20">
        <div className="glass-dark flex flex-col gap-6 rounded-3xl p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Find issues before your <Serif className="text-sage">users do.</Serif></h2>
            <p className="mt-2 text-sm text-ivory/60">Free during early access — no payment details required.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <MLink to={start} size="lg" variant="light">Start Testing <ArrowRight className="size-4" /></MLink>
            <MLink to="/demo" size="lg" variant="outlineLight">Try the demo</MLink>
          </div>
        </div>
      </Container>
      <Container className="grid grid-cols-1 gap-12 py-16 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Logo light />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-ivory/60">Autonomous website testing that discovers pages, verifies interactions and reports issues with evidence.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-8">
          {cols.map((c) => (
            <div key={c.t}>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-sage">{c.t}</p>
              <ul className="mt-5 space-y-3">
                {c.links.map(([l, to]) => <li key={l}><Link to={to!} className="link-underline text-sm text-ivory/75 transition-colors hover:text-ivory">{l}</Link></li>)}
              </ul>
            </div>
          ))}
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-sage">Contact</p>
            <ul className="mt-5 space-y-3">
              <li><Link to="/contact" className="link-underline inline-flex items-center gap-1.5 text-sm text-ivory/75 hover:text-ivory"><Mail className="size-3.5" />Contact us</Link></li>
              <li><Link to="/contact?topic=support" className="link-underline text-sm text-ivory/75 hover:text-ivory">Support</Link></li>
              <li><Link to="/contact?topic=business" className="link-underline text-sm text-ivory/75 hover:text-ivory">Sales</Link></li>
            </ul>
          </div>
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-6 text-xs text-ivory/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Autonomous Web Tester. All rights reserved.</p>
          <p>Only test websites you own or have written permission to test.</p>
        </Container>
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  useHashScroll();
  const { pathname } = useLocation();
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'Autonomous website testing', '/features': 'Features', '/pricing': 'Pricing', '/contact': 'Contact' };
    document.title = `${titles[pathname] ?? 'Page not found'} · Autonomous Web Tester`;
  }, [pathname]);
  return (
    <MotionConfig reducedMotion="user">
      <div data-surface="light" className="theme-editorial grain min-h-screen bg-paper font-sans text-coal antialiased">
        <EarlyAccessBar />
        <Navbar />
        <main className="-mt-[68px] pt-[68px]">
          <Outlet />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
