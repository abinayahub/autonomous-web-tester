import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Bell, Bot, Check, Laptop, Lock, LogOut, Palette, Save, ShieldCheck, Sparkles, Trash2, User } from 'lucide-react';
import { Modal, Notice, useToast } from '../components/feedback';
import { Checkbox, Field, Input, OptionCard, PasswordInput, Select, Tabs, Toggle } from '../components/forms';
import { Avatar, Badge, Button, Card, CardHeader, PageHeader, cx } from '../components/ui';
import { api } from '../lib/api';
import { ALL_MODULES, ENVIRONMENT_INFO, MODULES } from '../lib/catalog';
import { formatDate } from '../lib/format';
import { useStore } from '../lib/store';
import { ENVIRONMENTS, type AiConfig, type AiProvider, type Environment, type Profile } from '../lib/types';

type Tab = 'profile' | 'preferences' | 'ai' | 'security';

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 border-b border-slate-100 px-5 py-6 last:border-0 md:grid-cols-[220px_1fr] md:gap-8">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}

const TIMEZONES = Array.from(new Set([Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney']));

function ProfileTab() {
  const store = useStore();
  const toast = useToast();
  const [p, setP] = useState<Profile>(store.profile);
  const [err, setErr] = useState<string>();
  const dirty = JSON.stringify(p) !== JSON.stringify(store.profile);
  function save(e: FormEvent) {
    e.preventDefault();
    if (!p.name.trim()) return setErr('Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return setErr('Enter a valid email');
    setErr(undefined);
    store.setProfile({ ...p, name: p.name.trim(), email: p.email.trim() });
    toast({ kind: 'success', title: 'Profile saved' });
  }
  return (
    <form onSubmit={save} noValidate>
      <SettingsSection title="Your profile" description="Shown in the workspace and on reports you export.">
        <div className="flex items-center gap-4">
          <Avatar name={p.name || p.email || '?'} size="lg" />
          <div className="text-sm">
            <p className="font-semibold text-slate-900">{p.name || 'Your name'}</p>
            <p className="text-slate-500">Avatar uses your initials</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="pf-name" required><Input id="pf-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="pf-email" required><Input id="pf-email" type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} /></Field>
          <Field label="Job title" htmlFor="pf-title"><Input id="pf-title" value={p.jobTitle} onChange={(e) => setP({ ...p, jobTitle: e.target.value })} /></Field>
          <Field label="Time zone" htmlFor="pf-tz">
            <Select id="pf-tz" value={p.timezone} onChange={(e) => setP({ ...p, timezone: e.target.value })}>{TIMEZONES.map((t) => <option key={t}>{t}</option>)}</Select>
          </Field>
        </div>
        {err && <p className="text-sm font-medium text-rose-600">{err}</p>}
        <div className="flex gap-2">
          <Button type="submit" variant="primary" icon={Save} disabled={!dirty}>Save profile</Button>
          {dirty && <Button onClick={() => setP(store.profile)}>Discard</Button>}
        </div>
      </SettingsSection>
    </form>
  );
}

function PreferencesTab() {
  const store = useStore();
  const pr = store.preferences;
  const set = store.setPreferences;
  return (
    <>
      <SettingsSection title="Demo data" description="Fill the app with clearly labelled sample projects, runs and issues to explore the interface.">
        <Toggle checked={pr.demoMode} onChange={(v) => set({ demoMode: v })} label="Show demonstration data" description="Every sample item is tagged DEMO and a banner stays visible. Your own projects are unaffected." />
      </SettingsSection>
      <SettingsSection title="New project defaults" description="Pre-selected when you add a website.">
        <Field label="Default environment" htmlFor="pref-env" className="max-w-xs">
          <Select id="pref-env" value={pr.defaultEnvironment} onChange={(e) => set({ defaultEnvironment: e.target.value as Environment })}>
            {ENVIRONMENTS.map((e) => <option key={e} value={e}>{ENVIRONMENT_INFO[e].label}</option>)}
          </Select>
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Default testing modules</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {MODULES.map((m) => (
              <Checkbox
                key={m.id}
                checked={pr.defaultModules.includes(m.id)}
                onChange={(v) => set({ defaultModules: v ? ALL_MODULES.filter((x) => x === m.id || pr.defaultModules.includes(x)) : pr.defaultModules.filter((x) => x !== m.id) })}
                label={`${m.name} testing`}
              />
            ))}
          </div>
        </div>
      </SettingsSection>
      <SettingsSection title="Notifications" description="Email delivery activates when the backend is connected.">
        <Toggle checked={pr.notifyOnComplete} onChange={(v) => set({ notifyOnComplete: v })} label="Test run completed" description="Summary with pass rate and new issues." />
        <Toggle checked={pr.notifyOnCritical} onChange={(v) => set({ notifyOnCritical: v })} label="Critical issue found" description="Immediately, while the run continues." />
      </SettingsSection>
    </>
  );
}

const PROVIDERS: Array<{ id: AiProvider; label: string; description: string }> = [
  { id: 'none', label: 'Disabled', description: 'Deterministic checks only. No AI review.' },
  { id: 'anthropic', label: 'Anthropic', description: 'Claude models via the Anthropic API.' },
  { id: 'openai', label: 'OpenAI', description: 'Models via the OpenAI API.' },
  { id: 'openai-compatible', label: 'OpenAI-compatible', description: 'Any endpoint implementing the OpenAI API (self-hosted, gateways).' },
];

function AiTab() {
  const store = useStore();
  const toast = useToast();
  const [a, setA] = useState<AiConfig>(store.ai);
  const [apiKey, setApiKey] = useState('');
  const [server, setServer] = useState<{ provider: string; configured: boolean } | 'unreachable'>();
  useEffect(() => {
    api<{ ai: { provider: string; configured: boolean } }>('/health').then((h) => setServer(h.ai)).catch(() => setServer('unreachable'));
  }, []);
  const enabled = a.provider !== 'none';
  const dirty = JSON.stringify(a) !== JSON.stringify(store.ai) || apiKey.length > 0;
  return (
    <>
      <SettingsSection title="Provider" description="AI assists with page understanding and visual review. Findings it makes alone are always marked “Needs review”.">
        <div role="radiogroup" aria-label="AI provider" className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <OptionCard key={p.id} selected={a.provider === p.id} onSelect={() => setA({ ...a, provider: p.id })} icon={p.id === 'none' ? Bot : Sparkles} title={p.label} description={p.description} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Server configuration (.env):</span>
          {server === undefined ? <span>checking…</span> : server === 'unreachable' ? <Badge tone="gray">API not running</Badge> : server.configured ? <Badge tone="green" icon={Check}>{server.provider}</Badge> : <Badge tone="gray">Not configured (AI_PROVIDER=none)</Badge>}
        </div>
      </SettingsSection>
      {enabled && (
        <SettingsSection title="Connection & models" description="Model names are configuration — nothing is hard-coded.">
          {a.provider === 'openai-compatible' && (
            <Field label="Base URL" htmlFor="ai-base" required><Input id="ai-base" type="url" placeholder="https://llm.internal.example/v1" value={a.baseUrl} onChange={(e) => setA({ ...a, baseUrl: e.target.value })} /></Field>
          )}
          <Field label="API key" htmlFor="ai-key" required={a.provider !== 'openai-compatible'} hint="Never stored in the browser. The backend will keep it encrypted.">
            <PasswordInput id="ai-key" autoComplete="off" placeholder="Paste key — not saved in this preview" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Text model" htmlFor="ai-text" required><Input id="ai-text" placeholder="model id" value={a.textModel} onChange={(e) => setA({ ...a, textModel: e.target.value })} /></Field>
            <Field label="Vision model" htmlFor="ai-vision" optional><Input id="ai-vision" placeholder="model id" value={a.visionModel} onChange={(e) => setA({ ...a, visionModel: e.target.value })} /></Field>
            <Field label="Fast model" htmlFor="ai-fast" optional><Input id="ai-fast" placeholder="model id" value={a.fastModel} onChange={(e) => setA({ ...a, fastModel: e.target.value })} /></Field>
          </div>
        </SettingsSection>
      )}
      {enabled && (
        <SettingsSection title="Usage limits">
          <Field label="Max tokens per run" htmlFor="ai-tokens" className="max-w-xs" hint="The run stops using AI when this budget is reached.">
            <Input id="ai-tokens" type="number" min={1000} step={10000} value={a.maxTokensPerRun} onChange={(e) => setA({ ...a, maxTokensPerRun: Math.max(1000, Number(e.target.value) || 1000) })} />
          </Field>
          <Toggle checked={a.visionReview} onChange={(v) => setA({ ...a, visionReview: v })} label="Visual review of screenshots" description="AI looks for layout problems deterministic checks can't catch. Results are marked “Needs review”." />
        </SettingsSection>
      )}
      <div className="flex flex-wrap gap-2 px-5 py-4">
        <Button
          variant="primary"
          icon={Save}
          disabled={!dirty}
          onClick={() => {
            store.setAi(a);
            setApiKey('');
            toast({ kind: 'success', title: 'AI settings saved', body: apiKey ? 'The API key was not stored — it will be saved by the backend.' : undefined });
          }}
        >
          Save AI settings
        </Button>
        {enabled && <Button onClick={() => toast({ kind: 'info', title: 'Connection test needs the backend', body: 'Provider calls are made server-side, never from the browser.' })}>Test connection</Button>}
      </div>
    </>
  );
}

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

function SecurityTab() {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErr, setPwErr] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);
  const st = strength(pw.next);
  return (
    <>
      <SettingsSection title="Change password" description="At least 12 characters with mixed case, a number and a symbol.">
        <form
          noValidate
          className="max-w-md space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!pw.current) return setPwErr('Enter your current password');
            if (st < 4) return setPwErr('New password does not meet the requirements');
            if (pw.next !== pw.confirm) return setPwErr('Passwords do not match');
            setPwErr(undefined);
            setPw({ current: '', next: '', confirm: '' });
            toast({ kind: 'info', title: 'Password change needs the backend', body: 'Authentication is not connected yet — nothing was changed or stored.' });
          }}
        >
          <Field label="Current password" htmlFor="pw-cur"><PasswordInput id="pw-cur" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" htmlFor="pw-new">
            <PasswordInput id="pw-new" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            {pw.next && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full', i < st ? (st < 2 ? 'bg-rose-500' : st < 4 ? 'bg-amber-400' : 'bg-emerald-500') : 'bg-slate-200')} />)}</div>
                <span className="w-14 text-right text-xs font-medium text-slate-600">{['Weak', 'Weak', 'Fair', 'Good', 'Strong'][st]}</span>
              </div>
            )}
          </Field>
          <Field label="Confirm new password" htmlFor="pw-conf"><PasswordInput id="pw-conf" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          {pwErr && <p className="text-sm font-medium text-rose-600">{pwErr}</p>}
          <Button type="submit" variant="primary" icon={Lock}>Update password</Button>
        </form>
      </SettingsSection>
      <SettingsSection title="Sessions" description="Where you're signed in.">
        <Field label="Automatic sign-out after inactivity" htmlFor="sec-timeout" className="max-w-xs">
          <Select id="sec-timeout" value={store.security.sessionTimeoutMin} onChange={(e) => store.setSecurity({ sessionTimeoutMin: Number(e.target.value) })}>
            {[15, 30, 60, 240, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option>)}
          </Select>
        </Field>
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
          <span className="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-500"><Laptop className="size-[18px]" /></span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-slate-900">This browser <Badge tone="green" className="ml-1">Current</Badge></p>
            <p className="text-xs text-slate-500">Signed in {formatDate(store.session?.signedInAt)}</p>
          </div>
          <Button size="sm" icon={LogOut} onClick={() => { store.signOut(); navigate('/login'); }}>Sign out</Button>
        </div>
      </SettingsSection>
      <SettingsSection title="Testing safeguards" description="Always on. These protect the sites you test.">
        <ul className="space-y-2.5">
          {['Testing never leaves the authorized domain', 'Risky actions (delete, purchase, account changes) need your approval', 'Password, card and OTP fields are masked in every screenshot', 'Credentials are encrypted at rest (AES-256-GCM) and never shown again'].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-sm text-slate-700"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />{t}</li>
          ))}
        </ul>
      </SettingsSection>
      <SettingsSection title="Local data" description="Projects and settings saved in this browser.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50/40 p-4">
          <div className="text-sm">
            <p className="font-medium text-slate-900">Clear all local data</p>
            <p className="text-xs text-slate-500">Removes {store.projects.length} project{store.projects.length === 1 ? '' : 's'}, configurations and preferences. Your profile is kept.</p>
          </div>
          <Button variant="danger" icon={Trash2} onClick={() => setConfirmReset(true)}>Clear data</Button>
        </div>
      </SettingsSection>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        size="sm"
        title="Clear all local data?"
        description="This removes your projects, test configurations and preferences from this browser. It can't be undone."
        footer={<><Button onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" icon={Trash2} onClick={() => { store.resetLocalData(); setConfirmReset(false); toast({ kind: 'success', title: 'Local data cleared' }); }}>Clear data</Button></>}
      />
    </>
  );
}

export function Settings() {
  const [params, setParams] = useSearchParams();
  const tab = (['profile', 'preferences', 'ai', 'security'].includes(params.get('tab') ?? '') ? params.get('tab') : 'profile') as Tab;
  const meta: Record<Tab, { title: string; description: string; icon: typeof User }> = {
    profile: { title: 'Profile', description: 'Your personal details', icon: User },
    preferences: { title: 'Application preferences', description: 'Defaults, display and notifications', icon: Palette },
    ai: { title: 'AI provider', description: 'Model provider used for AI-assisted review', icon: Sparkles },
    security: { title: 'Security', description: 'Password, sessions and safeguards', icon: ShieldCheck },
  };
  const m = meta[tab];
  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, application preferences, AI configuration and security." />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        items={[
          { value: 'profile', label: 'Profile', icon: User },
          { value: 'preferences', label: 'Preferences', icon: Bell },
          { value: 'ai', label: 'AI provider', icon: Sparkles },
          { value: 'security', label: 'Security', icon: Lock },
        ]}
      />
      <Card>
        <CardHeader title={m.title} description={m.description} icon={m.icon} />
        {/* Keyed by tab so each panel's sections stagger in when switching */}
        <div key={tab} className="stagger">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'ai' && <AiTab />}
          {tab === 'security' && <SecurityTab />}
        </div>
      </Card>
      {tab === 'ai' && <Notice kind="info" className="mt-4 text-xs">Settings here are a preview saved in this browser. The live engine reads its AI configuration from the server's .env until per-project settings are connected.</Notice>}
    </>
  );
}

