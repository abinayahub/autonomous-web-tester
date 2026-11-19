import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Activity,
  Bug,
  ChevronDown,
  FolderKanban,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Radar,
  FileBarChart,
  Search,
  Settings,
  SlidersHorizontal,
  User,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useLiveRun } from '../lib/live';
import { useData, useStore } from '../lib/store';
import { Toggle } from './forms';
import { Logo } from '../marketing/kit';
import { Avatar, DemoTag, Kbd, cx } from './ui';
import { useApi } from '../lib/api';
import { EASE_OUT, PageReveal, popover } from './motion';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
}

export const NAV_GROUPS: Array<{ title?: string; items: NavItem[] }> = [
  { items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dashboard' }] },
  {
    title: 'Testing',
    items: [
      { to: '/projects', label: 'Projects', icon: FolderKanban, match: (p) => p === '/projects' || (/^\/projects\/[^/]+/.test(p) && !p.startsWith('/projects/new') && !p.endsWith('/configure')) },
      { to: '/projects/new', label: 'Add Website', icon: PlusCircle, match: (p) => p.startsWith('/projects/new') || p.endsWith('/edit') },
      { to: '/configure', label: 'Test Configuration', icon: SlidersHorizontal, match: (p) => p.startsWith('/configure') || p.endsWith('/configure') },
      { to: '/live', label: 'Live Testing', icon: Radar },
    ],
  },
  {
    title: 'Results',
    items: [
      { to: '/issues', label: 'Issues', icon: Bug },
      { to: '/screenshots', label: 'Screenshots', icon: Images },
      { to: '/reports', label: 'Reports', icon: FileBarChart },
    ],
  },
];
const SETTINGS: NavItem = { to: '/settings', label: 'Settings', icon: Settings };
const ALL_NAV = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS];

function isActive(item: NavItem, path: string) {
  if (item.match) return item.match(path);
  return path === item.to || path.startsWith(`${item.to}/`);
}

function NavEntry({ item, path, onNavigate, badge, layoutGroup }: { item: NavItem; path: string; onNavigate?: () => void; badge?: React.ReactNode; layoutGroup: string }) {
  const active = isActive(item, path);
  return (
    <NavLink
      to={item.to}
      end
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-300',
        active ? 'text-ivory' : 'text-ivory/60 hover:bg-white/[0.06] hover:text-ivory',
      )}
    >
      {active && (
        <motion.span layoutId={'nav-active-' + layoutGroup} className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" transition={{ type: 'spring', stiffness: 420, damping: 36 }} aria-hidden>
          <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-brand-300" />
        </motion.span>
      )}
      <item.icon className={cx('relative size-[18px] shrink-0 transition-[color,transform] duration-300 ease-out group-hover:scale-110 group-active:scale-95', active ? 'text-brand-300' : 'text-ivory/45 group-hover:-rotate-6 group-hover:text-ivory/80')} />
      <span className={cx('relative flex-1 truncate transition-transform duration-300 ease-out', !active && 'group-hover:translate-x-0.5')}>{item.label}</span>
      {badge && <span className="relative">{badge}</span>}
    </NavLink>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { run } = useLiveRun();
  const data = useData();
  const openIssues = data.issues.filter((i) => i.status === 'OPEN' && i.classification === 'CONFIRMED').length;
  const running = run?.status === 'RUNNING' || run?.status === 'STOPPING';
  const badgeFor = (to: string) => {
    if (to === '/live' && running) return <span className="flex items-center gap-1 text-[10px] font-semibold uppercase text-brand-300"><span className="size-1.5 rounded-full bg-brand-300 animate-pulse-soft" />Live</span>;
    if (to === '/issues' && openIssues > 0) return <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold tabular-nums text-white">{openIssues}</span>;
    return undefined;
  };
  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden bg-forest">
      <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 -z-10 size-72 rounded-full bg-sage/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-24 -z-10 size-72 rounded-full bg-terra/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgba(245,243,237,0.06)_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="px-5 pb-7 pt-5">
        <Logo to="/dashboard" light onClick={onNavigate} />
      </div>
      <nav aria-label="Main" className="stagger flex-1 space-y-6 overflow-y-auto px-3" style={{ '--stagger-step': '70ms', '--stagger-delay': '80ms' } as React.CSSProperties}>
        {NAV_GROUPS.map((g, i) => (
          <div key={i}>
            {g.title && <p className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-brand-300/80">{g.title}</p>}
            <div className="space-y-0.5">
              {g.items.map((item) => <NavEntry key={item.to} item={item} path={pathname} onNavigate={onNavigate} badge={badgeFor(item.to)} layoutGroup={onNavigate ? 'm' : 'd'} />)}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-white/10 p-3">
        <NavEntry item={SETTINGS} path={pathname} onNavigate={onNavigate} layoutGroup={onNavigate ? 'm' : 'd'} />
        <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3 text-xs text-ivory/60">
          <EngineStatus />
        </div>
      </div>
    </div>
  );
}

/** Live backend status from /api/capabilities (refreshed every 30 s). */
function EngineStatus() {
  const caps = useApi<{ canStartRuns: boolean; reasons: string[]; workers: number }>('/capabilities', 30_000);
  const ok = caps.data?.canStartRuns;
  return (
    <>
      <p className="flex items-center gap-1.5 font-medium text-ivory/85">
        <Activity className={cx('size-3.5', ok ? 'text-brand-300' : 'text-terra')} /> {caps.loading && !caps.data ? 'Checking testing engine…' : ok ? 'Testing engine ready' : 'Testing unavailable'}
      </p>
      <p className="mt-1 leading-relaxed">
        {caps.error ? caps.error.message : ok ? `${caps.data!.workers} worker${caps.data!.workers === 1 ? '' : 's'} online · PostgreSQL connected` : caps.data?.reasons[0] ?? ''}
      </p>
    </>
  );
}

function GlobalSearch() {
  const data = useData();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const projects = data.projects
      .filter((p) => `${p.name} ${p.url}`.toLowerCase().includes(term))
      .slice(0, 4)
      .map((p) => ({ key: p.id, to: `/projects/${p.id}`, title: p.name, sub: p.url, kind: 'Project', demo: p.demo }));
    const issues = data.issues
      .filter((i) => `${i.key} ${i.title} ${i.pageName}`.toLowerCase().includes(term))
      .slice(0, 5)
      .map((i) => ({ key: i.id, to: `/issues/${i.id}`, title: i.title, sub: `${i.key} · ${i.pageName}`, kind: 'Issue', demo: i.demo }));
    const pages = ALL_NAV.filter((n) => n.label.toLowerCase().includes(term)).map((n) => ({ key: n.to, to: n.to, title: n.label, sub: 'Go to page', kind: 'Page', demo: false }));
    return [...pages, ...projects, ...issues];
  }, [q, data.projects, data.issues]);

  const go = (to: string) => {
    navigate(to);
    setQ('');
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="group/search relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 transition-colors duration-200 group-focus-within/search:text-brand-600" />
      <input
        ref={ref}
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) go(results[0].to); if (e.key === 'Escape') ref.current?.blur(); }}
        placeholder="Search projects, issues, pages…"
        aria-label="Search"
        className="h-9.5 w-full rounded-full border-0 bg-white/60 pl-9 pr-12 text-sm text-slate-900 ring-1 ring-inset ring-slate-300/70 transition placeholder:text-slate-400 hover:bg-white/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 focus:shadow-[0_0_0_4px_rgba(165,180,154,0.3)]"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 sm:block"><Kbd>/</Kbd></span>
      <AnimatePresence>
      {open && q.trim() && (
        <motion.div variants={popover} initial="hidden" animate="show" exit="exit" style={{ transformOrigin: 'top center' }} className="app-glass absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No matches for "{q}"</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1.5">
              {results.map((r) => (
                <li key={`${r.kind}-${r.key}`}>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.to)} className="anim-line flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-brand-50/70">
                    <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wide text-slate-400">{r.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">{r.title}{r.demo && <DemoTag />}</span>
                      <span className="block truncate text-xs text-slate-500">{r.sub}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const store = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const name = store.profile.name || store.session?.name || 'User';
  const email = store.profile.email || store.session?.email || '';
  const item = 'group/item flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-brand-50/70 [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:translate-x-0.5';
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-full p-1 pr-2.5 transition-colors hover:bg-white/70">
        <Avatar name={name} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium text-slate-700 md:block">{name}</span>
        <ChevronDown className={cx('hidden size-4 text-slate-400 transition-transform duration-300 ease-out md:block', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
      {open && (
        <motion.div role="menu" variants={popover} initial="hidden" animate="show" exit="exit" style={{ transformOrigin: 'top right' }} className="app-glass absolute right-0 top-full z-40 mt-2 w-60 rounded-2xl p-1.5">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <div className="my-1 border-t border-slate-200/70" />
          <button role="menuitem" className={item} onClick={() => { setOpen(false); navigate('/settings?tab=profile'); }}><User className="size-4 text-slate-400" /> Profile</button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); navigate('/settings'); }}><Settings className="size-4 text-slate-400" /> Settings</button>
          <div className="my-1 border-t border-slate-200/70" />
          <button role="menuitem" className={cx(item, 'text-rose-600 hover:bg-rose-50')} onClick={() => { store.signOut(); navigate('/login'); }}><LogOut className="size-4" /> Sign out</button>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function DemoSwitch() {
  const store = useStore();
  return (
    <div className="flex items-center gap-2 rounded-full px-2 py-1.5" title="Fill the app with clearly labelled sample data to preview the UI">
      <span className="hidden text-xs font-medium text-slate-600 sm:inline">Demo data</span>
      <Toggle size="sm" checked={store.preferences.demoMode} onChange={(v) => store.setPreferences({ demoMode: v })} />
    </div>
  );
}

function DemoBanner() {
  const store = useStore();
  if (!store.preferences.demoMode) return null;
  return (
    <div className="anim-fade flex items-center justify-center gap-x-3 gap-y-1 bg-amber-300 px-4 py-1.5 text-center text-xs font-medium text-amber-950 max-sm:flex-wrap">
      <span><strong>Demo data is on.</strong> Items tagged DEMO are sample data for previewing the interface — they are not real test results.</span>
      <button onClick={() => store.setPreferences({ demoMode: false })} className="rounded-full bg-amber-950/10 px-2.5 py-0.5 font-semibold transition-colors hover:bg-amber-950/20">Turn off</button>
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const current = ALL_NAV.find((n) => isActive(n, pathname));

  useEffect(() => {
    setMobileOpen(false);
    // Jump (not smooth-scroll) to the top on navigation so the new page's entrance is what moves.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  useEffect(() => {
    document.title = `${current?.label ?? 'Home'} · Autonomous Web Tester`;
  }, [current]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative isolate min-h-screen">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-ivory">
        <div className="absolute -right-40 -top-40 size-[560px] rounded-full bg-sage/20 blur-[110px]" />
        <div className="absolute -bottom-48 left-1/4 size-[520px] rounded-full bg-terra/[0.07] blur-[110px]" />
      </div>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar />
      </aside>
      <AnimatePresence>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <motion.div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
          <motion.div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl" initial={{ x: '-100%', opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: '-100%', opacity: 0 }} transition={{ duration: 0.32, ease: EASE_OUT }}>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-5 rounded-full p-1.5 text-ivory/60 transition-[color,background-color,transform] duration-200 hover:rotate-90 hover:bg-white/10 hover:text-ivory" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      <div className="flex min-h-screen flex-col lg:pl-64">
        <div className="sticky top-0 z-20">
          <DemoBanner />
          <header className="flex h-16 items-center gap-3 border-b border-slate-200/70 bg-ivory/70 px-4 shadow-[0_8px_24px_-20px_rgba(32,55,45,0.35)] backdrop-blur-xl sm:px-6">
            <button onClick={() => setMobileOpen(true)} className="-ml-1 rounded-full p-2 text-slate-600 transition-colors hover:bg-white/70 lg:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <DemoSwitch />
              <span className="mx-1 hidden h-6 w-px bg-slate-300/70 sm:block" />
              <UserMenu />
            </div>
          </header>
        </div>
        <motion.main
          key={pathname}
          // Opacity only: a transform or filter here would trap fixed overlays (modals, lightbox) inside <main>.
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <PageReveal>
            <Outlet />
          </PageReveal>
        </motion.main>
      </div>
    </div>
    </MotionConfig>
  );
}

export function RequireAuth() {
  const store = useStore();
  const location = useLocation();
  if (!store.session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <AppLayout />;
}
