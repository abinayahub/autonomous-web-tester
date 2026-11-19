import { useEffect, useId, useState, type CSSProperties, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Check, Compass, Eye, EyeOff, Info, Loader2, Lock, Mail, PlayCircle, ShieldCheck, User, type LucideIcon } from 'lucide-react';
import { cx } from '../components/ui';
import { useStore } from '../lib/store';
import { Logo } from '../marketing/kit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Dark form primitives (match the marketing site) ──────────────

const inputCls =
  'block h-11 w-full rounded-xl border border-coal/15 bg-white/85 px-4 text-sm text-coal transition placeholder:text-stone/80 hover:border-coal/30 focus:border-forest focus:bg-white focus:outline-none focus:ring-4 focus:ring-sage/30 aria-[invalid=true]:border-rose-600';

function DarkField({ label, error, hint, children, aside }: { label: string; error?: string; hint?: ReactNode; children: (id: string) => ReactNode; aside?: ReactNode }) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-coal">{label}</label>
        {aside}
      </div>
      {children(id)}
      {error ? <p key={error} className="anim-msg mt-1.5 text-xs font-medium text-rose-700" role="alert">{error}</p> : hint && <p className="mt-1.5 text-xs text-stone">{hint}</p>}
    </div>
  );
}

function DarkInput({ icon: Icon, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon }) {
  return (
    <div className="relative">
      {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />}
      <input {...props} className={cx(inputCls, Icon && 'pl-10')} />
    </div>
  );
}

function DarkPassword(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input {...props} type={show ? 'text' : 'password'} className={cx(inputCls, 'pl-10 pr-11')} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-paper hover:text-coal" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function DarkCheckbox({ checked, onChange, children, invalid }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; invalid?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-invalid={invalid} className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-[#20372d]" />
      <label htmlFor={id} className={cx('cursor-pointer text-sm', invalid ? 'text-rose-700' : 'text-coal')}>{children}</label>
    </div>
  );
}

function SubmitButton({ loading, children }: { loading?: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={loading} aria-busy={loading || undefined} className="btn-motion inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-forest text-[15px] font-semibold text-ivory shadow-[0_10px_24px_-12px_rgba(32,55,45,0.75)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-forest-2 active:scale-[0.98] disabled:opacity-70 [&_svg]:text-sage">
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

function PreviewNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-8 flex gap-3 rounded-2xl border border-coal/10 bg-white/50 p-4 text-xs leading-relaxed text-stone">
      <Info className="mt-0.5 size-4 shrink-0 text-terra" />
      <p><span className="font-semibold text-coal">{title}.</span> {children}</p>
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────

function AuthShell({ children }: { children: ReactNode }) {
  const points = [
    { icon: Compass, title: 'Autonomous discovery', text: 'Finds public, logged-in and role-specific pages.' },
    { icon: BadgeCheck, title: 'Evidence-backed issues', text: 'Only reproducible failures count as confirmed bugs.' },
    { icon: Camera, title: 'Screenshot for every finding', text: 'Highlighted captures plus steps to reproduce.' },
    { icon: ShieldCheck, title: 'Safe by design', text: 'Authorized domains only; asks before risky actions.' },
  ];
  return (
    <div data-surface="light" className="theme-editorial grain grid min-h-screen grid-cols-1 bg-paper font-sans text-coal antialiased lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative isolate hidden overflow-hidden bg-forest p-12 text-ivory lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 -z-10 size-[460px] rounded-full bg-sage/25 blur-[100px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-24 -z-10 size-[420px] rounded-full bg-terra/20 blur-[100px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(rgba(245,243,237,0.07)_1px,transparent_1px)] [background-size:22px_22px]" />
        <Logo light />
        <div className="anim-rise my-auto max-w-lg py-12">
          <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-ivory/55"><span className="text-sage">01</span><span className="h-px w-8 bg-ivory/30" />Autonomous website testing</p>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.02] tracking-[-0.045em] text-balance">
            Your website, <span className="font-serif font-normal italic text-sage">tested</span> automatically. <span className="text-ivory/45">Every detail verified.</span>
          </h1>
          <ul className="stagger mt-12 space-y-2" style={{ '--stagger-delay': '250ms', '--stagger-step': '80ms' } as CSSProperties}>
            {points.map((f) => (
              <li key={f.title} className="glass-dark group flex gap-4 rounded-2xl px-4 py-3.5 transition-[translate] duration-300 ease-out hover:translate-x-1">
                <f.icon className="mt-0.5 size-4 shrink-0 text-sage transition-transform duration-300 group-hover:scale-110" />
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="mt-0.5 block text-[13px] text-ivory/60">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ivory/50">Only test websites you own or have written permission to test.</p>
      </aside>
      <main className="relative isolate flex flex-col overflow-hidden px-5 py-6 sm:px-10">
        <div aria-hidden className="pointer-events-none absolute -right-32 top-1/4 -z-10 size-[420px] rounded-full bg-sage/30 blur-[100px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-0 -z-10 size-[360px] rounded-full bg-terra/10 blur-[100px]" />
        <div className="flex items-center justify-between gap-4">
          <span className="lg:hidden"><Logo /></span>
          <Link to="/" className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-stone transition-colors hover:bg-white/60 hover:text-coal">
            <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Back to</span> website
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="glass anim-rise w-full max-w-md rounded-3xl p-7 sm:p-9">
            <div className="stagger" style={{ '--stagger-delay': '120ms', '--stagger-step': '60ms' } as CSSProperties}>{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

function useAuthTitle(title: string) {
  useEffect(() => { document.title = `${title} · Autonomous Web Tester`; }, [title]);
}

// ── Login ────────────────────────────────────────────────────────

export function Login() {
  useAuthTitle('Sign in');
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';
  const [email, setEmail] = useState(store.profile.email);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  if (store.session && !loading) return <Navigate to={from} replace />;

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address';
    if (password.length < 1) errs.password = 'Enter your password';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    // Frontend preview: no authentication API yet — sign in locally.
    setTimeout(() => {
      store.signIn(email.trim().toLowerCase(), remember);
      setPassword('');
      navigate(from, { replace: true });
    }, 400);
  }

  return (
    <AuthShell>
      <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-coal">Welcome back</h2>
      <p className="mt-2 text-sm text-stone">Sign in to your testing workspace.</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <DarkField label="Email" error={errors.email}>
          {(id) => <DarkInput id={id} type="email" icon={Mail} autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} autoFocus />}
        </DarkField>
        <DarkField label="Password" error={errors.password} aside={<Link to="/forgot-password" className="text-sm font-semibold text-terra transition-colors hover:text-forest">Forgot password?</Link>}>
          {(id) => <DarkPassword id={id} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />}
        </DarkField>
        <DarkCheckbox checked={remember} onChange={setRemember}>Remember me on this device</DarkCheckbox>
        <SubmitButton loading={loading}>Sign in <ArrowRight className="size-4" /></SubmitButton>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-stone"><span className="h-px flex-1 bg-coal/10" />or<span className="h-px flex-1 bg-coal/10" /></div>
      <Link to="/demo" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-coal/15 bg-white/50 text-sm font-semibold text-coal transition-all duration-300 hover:-translate-y-0.5 hover:border-coal/35 hover:bg-white/80">
        <PlayCircle className="size-4 text-terra" /> Explore the demo with sample data
      </Link>
      <p className="mt-6 text-center text-sm text-stone">New here? <Link to="/signup" className="font-semibold text-terra transition-colors hover:text-forest">Create an account</Link></p>
      <PreviewNote title="Early-access preview">Sign-in isn’t connected to a server yet, so any valid email signs you in on this device. Your password is not stored or sent anywhere.</PreviewNote>
    </AuthShell>
  );
}

// ── Sign up ──────────────────────────────────────────────────────

const PLAN_NAMES: Record<string, string> = { starter: 'Starter', professional: 'Professional', business: 'Business' };

export function Signup() {
  useAuthTitle('Create account');
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const plan = PLAN_NAMES[params.get('plan') ?? ''];
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (store.session && !loading) return <Navigate to="/dashboard" replace />;

  const rules = [
    { ok: form.password.length >= 8, t: '8+ characters' },
    { ok: /[A-Z]/.test(form.password) && /[a-z]/.test(form.password), t: 'Upper & lower case' },
    { ok: /\d/.test(form.password), t: 'A number' },
  ];

  function submit(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!form.name.trim()) er.name = 'Enter your name';
    if (!EMAIL_RE.test(form.email.trim())) er.email = 'Enter a valid email address';
    if (!rules.every((r) => r.ok)) er.password = 'Password doesn’t meet the requirements';
    if (!agree) er.agree = 'required';
    setErrors(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    setTimeout(() => {
      store.signIn(form.email.trim().toLowerCase(), true, form.name);
      navigate('/dashboard', { replace: true });
    }, 400);
  }

  return (
    <AuthShell>
      {plan && <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-terra/40 px-3 py-1 text-xs font-semibold text-terra">Selected plan: {plan} · proposed pricing</p>}
      <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-coal">Create your account</h2>
      <p className="mt-2 text-sm text-stone">Start testing the websites you’re authorized to test.</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <DarkField label="Full name" error={errors.name}>
          {(id) => <DarkInput id={id} icon={User} autoComplete="name" placeholder="Jordan Lee" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} autoFocus />}
        </DarkField>
        <DarkField label="Work email" error={errors.email}>
          {(id) => <DarkInput id={id} type="email" icon={Mail} autoComplete="email" placeholder="you@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={!!errors.email} />}
        </DarkField>
        <DarkField label="Password" error={errors.password}>
          {(id) => (
            <>
              <DarkPassword id={id} autoComplete="new-password" placeholder="Create a password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-invalid={!!errors.password} />
              <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                {rules.map((r) => (
                  <li key={r.t} className={cx('flex items-center gap-1.5 text-xs transition-colors', r.ok ? 'text-[#4f6b45]' : 'text-stone')}>
                    <Check className={cx('size-3.5', !r.ok && 'opacity-40')} />{r.t}
                  </li>
                ))}
              </ul>
            </>
          )}
        </DarkField>
        <DarkCheckbox checked={agree} onChange={setAgree} invalid={!!errors.agree}>
          I will only test websites I own or have written permission to test.
        </DarkCheckbox>
        <SubmitButton loading={loading}>Create account <ArrowRight className="size-4" /></SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-stone">Already have an account? <Link to="/login" className="font-semibold text-terra transition-colors hover:text-forest">Sign in</Link></p>
      <PreviewNote title="Early-access preview">Accounts aren’t created on a server yet — this signs you in on this device only. No payment details are collected.</PreviewNote>
    </AuthShell>
  );
}

// ── Forgot password ──────────────────────────────────────────────

export function ForgotPassword() {
  useAuthTitle('Reset password');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  return (
    <AuthShell>
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-stone hover:text-coal"><ArrowLeft className="size-4" /> Back to sign in</Link>
      <span className="mb-5 grid size-11 place-items-center rounded-xl bg-forest text-sage"><Lock className="size-5" /></span>
      <h2 className="font-display text-3xl font-bold tracking-[-0.035em] text-coal">Reset your password</h2>
      <p className="mt-2 text-sm text-stone">Enter your account email and we’ll send you a reset link.</p>
      {sent ? (
        <PreviewNote title="Email delivery isn’t connected yet">In the finished app a reset link will be sent to <strong className="text-coal">{email}</strong>. No email was sent from this preview.</PreviewNote>
      ) : (
        <form
          noValidate
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address');
            setError(undefined);
            setSent(true);
          }}
        >
          <DarkField label="Email" error={error}>
            {(id) => <DarkInput id={id} type="email" icon={Mail} autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} autoFocus />}
          </DarkField>
          <SubmitButton>Send reset link</SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}
