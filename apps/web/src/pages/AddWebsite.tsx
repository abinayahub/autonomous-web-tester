import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Building2, CheckCircle2, Globe, KeyRound, Loader2, Plus, Save, Server, ShieldCheck, Trash2, Wifi, XCircle } from 'lucide-react';
import { EmptyState, Notice, useToast } from '../components/feedback';
import { Checkbox, Field, Input, OptionCard, PasswordInput } from '../components/forms';
import { Button, ButtonLink, Card, CardHeader, PageHeader } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { AUTH_INFO, ENVIRONMENT_INFO } from '../lib/catalog';
import { newId, useData, useStore } from '../lib/store';
import { ENVIRONMENTS, type AuthType, type CredentialMeta, type Environment } from '../lib/types';

interface CredDraft {
  key: string;
  roleName: string;
  username: string;
  secret: string;
  loginUrl: string;
  headerName: string;
  hadSecret: boolean;
}

interface TargetCheck {
  reachable: boolean;
  statusCode?: number;
  title?: string;
  responseTimeMs?: number;
  finalUrl?: string;
  requestedUrl: string;
  redirects: Array<{ to: string; statusCode: number }>;
  error?: string;
}

const draft = (roleName = '', c?: CredentialMeta): CredDraft => ({
  key: newId('c'),
  roleName: c?.roleName ?? roleName,
  username: c?.username ?? '',
  secret: '',
  loginUrl: c?.loginUrl ?? '',
  headerName: c?.headerName ?? 'Authorization',
  hadSecret: c?.secretProvided ?? false,
});

function urlError(v: string): string | undefined {
  if (!v.trim()) return 'Website URL is required';
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Use an http:// or https:// URL';
    if (u.username || u.password) return 'Remove credentials from the URL — add them under Authentication';
    return undefined;
  } catch {
    return 'Enter a full URL, e.g. https://staging.example.com';
  }
}

function SectionNumber({ n }: { n: number }) {
  return <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{n}</span>;
}

export function AddWebsite() {
  const { id } = useParams();
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const existing = id ? data.project(id) : undefined;
  const editing = !!id;

  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [env, setEnv] = useState<Environment>(existing?.environment ?? store.preferences.defaultEnvironment);
  const [authType, setAuthType] = useState<AuthType>(existing?.authType ?? 'NONE');
  const [creds, setCreds] = useState<CredDraft[]>(() => (existing?.credentials.length ? existing.credentials.map((c) => draft('', c)) : [draft('customer')]));
  const [authorized, setAuthorized] = useState(editing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<TargetCheck>();
  const [checkError, setCheckError] = useState<string>();

  if (editing && (!existing || existing.demo)) {
    return (
      <Card>
        <EmptyState icon={Globe} title={existing?.demo ? 'Demo projects are read-only' : 'Project not found'} action={<ButtonLink to="/projects" icon={ArrowLeft}>Back to projects</ButtonLink>} />
      </Card>
    );
  }

  const update = (key: string, patch: Partial<CredDraft>) => setCreds((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const parsedUrl = (() => { try { return new URL(url.trim()); } catch { return undefined; } })();
  const host = parsedUrl?.hostname;

  async function runCheck() {
    const err = urlError(url);
    if (err) return setErrors((e) => ({ ...e, url: err }));
    setChecking(true);
    setCheck(undefined);
    setCheckError(undefined);
    try {
      setCheck(await api<TargetCheck>('/targets/check', { method: 'POST', body: { url: url.trim() } }));
    } catch (e) {
      setCheckError(e instanceof ApiError ? e.message : 'Connectivity check failed');
    } finally {
      setChecking(false);
    }
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Website name is required';
    const ue = urlError(url);
    if (ue) e.url = ue;
    if (authType !== 'NONE') {
      const seen = new Set<string>();
      creds.forEach((c, i) => {
        if (authType === 'FORM') {
          if (!c.roleName.trim()) e[`c${i}.role`] = 'Role name is required';
          else if (seen.has(c.roleName.trim().toLowerCase())) e[`c${i}.role`] = 'Each role must be unique';
          seen.add(c.roleName.trim().toLowerCase());
          if (c.loginUrl.trim()) {
            try {
              const lu = new URL(c.loginUrl.trim());
              if (host && lu.hostname !== host) e[`c${i}.loginUrl`] = `Must be on ${host}`;
            } catch {
              e[`c${i}.loginUrl`] = 'Enter a full URL';
            }
          }
        }
        if (authType !== 'TOKEN' && !c.username.trim()) e[`c${i}.username`] = 'Username is required';
        if (authType === 'TOKEN' && !c.headerName.trim()) e[`c${i}.header`] = 'Header name is required';
        if (!c.secret && !c.hadSecret) e[`c${i}.secret`] = authType === 'TOKEN' ? 'Token is required' : 'Password is required';
      });
    }
    if (!authorized) e.authorized = 'You must confirm you are authorized to test this website';
    return e;
  }

  function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast({ kind: 'error', title: 'Please fix the highlighted fields' });
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const list = authType === 'NONE' ? [] : (authType === 'FORM' ? creds : creds.slice(0, 1));
    const credentials: CredentialMeta[] = list.map((c) => ({
      id: c.key,
      roleName: authType === 'FORM' ? c.roleName.trim() : authType === 'BASIC' ? 'basic' : 'token',
      username: authType === 'TOKEN' ? '' : c.username.trim(),
      loginUrl: authType === 'FORM' && c.loginUrl.trim() ? c.loginUrl.trim() : undefined,
      headerName: authType === 'TOKEN' ? c.headerName.trim() : undefined,
      secretProvided: !!c.secret || c.hadSecret,
    }));
    // Secrets (c.secret) are intentionally dropped here — never stored in the browser.
    setCreds((cs) => cs.map((c) => ({ ...c, secret: '' })));
    const payload = { name: name.trim(), url: new URL(url.trim()).href.replace(/\/$/, ''), environment: env, authType, credentials, authorizationConfirmedAt: existing?.authorizationConfirmedAt ?? new Date().toISOString() };
    if (editing && existing) {
      store.updateProject(existing.id, payload);
      toast({ kind: 'success', title: 'Project updated', body: payload.name });
      navigate(`/projects/${existing.id}`);
    } else {
      const p = store.addProject(payload);
      toast({ kind: 'success', title: 'Project saved', body: 'Next, choose which tests to run.' });
      navigate(`/projects/${p.id}/configure`);
    }
  }

  const credFields = authType !== 'NONE' && (
    <div className="space-y-4">
      {(authType === 'FORM' ? creds : creds.slice(0, 1)).map((c, i) => (
        <fieldset key={c.key} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <legend className="sr-only">Credential {i + 1}</legend>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{authType === 'FORM' ? `Test account ${i + 1}` : authType === 'BASIC' ? 'Basic auth credentials' : 'Request header'}</p>
            {authType === 'FORM' && creds.length > 1 && (
              <Button size="sm" variant="ghost" icon={Trash2} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => setCreds((cs) => cs.filter((x) => x.key !== c.key))}>Remove</Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {authType === 'FORM' && (
              <>
                <Field label="Role name" htmlFor={`${c.key}-role`} required error={errors[`c${i}.role`]} hint="e.g. customer, admin">
                  <Input id={`${c.key}-role`} value={c.roleName} onChange={(e) => update(c.key, { roleName: e.target.value })} aria-invalid={!!errors[`c${i}.role`]} />
                </Field>
                <Field label="Login page URL" optional htmlFor={`${c.key}-login`} error={errors[`c${i}.loginUrl`]} hint="Auto-detected when empty">
                  <Input id={`${c.key}-login`} type="url" placeholder={parsedUrl ? `${parsedUrl.origin}/login` : 'https://…/login'} value={c.loginUrl} onChange={(e) => update(c.key, { loginUrl: e.target.value })} aria-invalid={!!errors[`c${i}.loginUrl`]} />
                </Field>
              </>
            )}
            {authType === 'TOKEN' ? (
              <Field label="Header name" htmlFor={`${c.key}-header`} required error={errors[`c${i}.header`]}>
                <Input id={`${c.key}-header`} value={c.headerName} onChange={(e) => update(c.key, { headerName: e.target.value })} aria-invalid={!!errors[`c${i}.header`]} />
              </Field>
            ) : (
              <Field label="Username / email" htmlFor={`${c.key}-user`} required error={errors[`c${i}.username`]}>
                <Input id={`${c.key}-user`} autoComplete="off" value={c.username} onChange={(e) => update(c.key, { username: e.target.value })} aria-invalid={!!errors[`c${i}.username`]} />
              </Field>
            )}
            <Field label={authType === 'TOKEN' ? 'Token value' : 'Password'} htmlFor={`${c.key}-secret`} required={!c.hadSecret} error={errors[`c${i}.secret`]} hint={c.hadSecret ? 'Previously provided — leave blank to keep' : undefined}>
              <PasswordInput id={`${c.key}-secret`} autoComplete="new-password" placeholder={authType === 'TOKEN' ? 'Bearer …' : ''} value={c.secret} onChange={(e) => update(c.key, { secret: e.target.value })} aria-invalid={!!errors[`c${i}.secret`]} />
            </Field>
          </div>
        </fieldset>
      ))}
      {authType === 'FORM' && creds.length < 10 && (
        <Button variant="subtle" icon={Plus} onClick={() => setCreds((cs) => [...cs, draft()])}>Add another role</Button>
      )}
      <Notice kind="info" className="text-xs" title="How credentials are handled">
        Use dedicated test accounts only. In this frontend preview, passwords and tokens are <strong>never saved</strong> — only the role and username are kept. The backend will encrypt secrets with AES-256-GCM, and password fields are masked in every screenshot.
      </Notice>
    </div>
  );

  return (
    <>
      <Link to={editing ? `/projects/${id}` : '/projects'} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="size-4" /> {editing ? 'Back to project' : 'Projects'}</Link>
      <PageHeader title={editing ? `Edit ${existing?.name}` : 'Add website'} description="Set up a website you own or have written permission to test." />

      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={<span className="flex items-center gap-3"><SectionNumber n={1} /> Website details</span>} />
            <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
              <Field label="Website name" htmlFor="name" required error={errors.name}>
                <Input id="name" icon={Building2} placeholder="e.g. Acme Store (staging)" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
              </Field>
              <Field label="Website URL" htmlFor="url" required error={errors.url} hint="Testing stays on this host — external links are never followed.">
                <div className="flex gap-2">
                  <Input id="url" type="url" icon={Globe} placeholder="https://staging.example.com" value={url} onChange={(e) => { setUrl(e.target.value); setCheck(undefined); setCheckError(undefined); }} aria-invalid={!!errors.url} className="min-w-0" />
                  <Button onClick={runCheck} loading={checking} disabled={!url.trim()} icon={Wifi} title="Check that the site responds">Check</Button>
                </div>
              </Field>
              {(check || checkError) && (
                <div className="sm:col-span-2">
                  {check ? (
                    <Notice kind={check.reachable ? 'success' : 'error'} title={check.reachable ? `Reachable — HTTP ${check.statusCode} in ${check.responseTimeMs} ms` : `Not reachable${check.statusCode ? ` — HTTP ${check.statusCode}` : ''}`}>
                      {check.title && <>Page title: <strong>{check.title}</strong>. </>}
                      {check.redirects.length > 0 && <>Redirected to {check.finalUrl}. </>}
                      {check.error}
                      <span className="mt-1 block text-xs opacity-75">A single live HTTP request from the local API — a connectivity check, not a test result.</span>
                    </Notice>
                  ) : (
                    <Notice kind="warn" title="Couldn't run the connectivity check">{checkError}</Notice>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="flex items-center gap-3"><SectionNumber n={2} /> Test environment</span>} />
            <div role="radiogroup" aria-label="Test environment" className="stagger grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
              {ENVIRONMENTS.map((e) => (
                <OptionCard key={e} selected={env === e} onSelect={() => setEnv(e)} icon={Server} title={ENVIRONMENT_INFO[e].label} description={ENVIRONMENT_INFO[e].description} />
              ))}
            </div>
            {env === 'PRODUCTION' && (
              <div className="px-5 pb-5">
                <Notice kind="warn" title="Testing a live production site">Forms may be submitted on real systems. Prefer staging; risky actions will always pause for your approval.</Notice>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title={<span className="flex items-center gap-3"><SectionNumber n={3} /> Authentication</span>} description="Give test logins so logged-in and role-specific pages are discovered." />
            <div className="space-y-5 p-5">
              <div role="radiogroup" aria-label="Authentication type" className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(AUTH_INFO) as AuthType[]).map((a) => (
                  <OptionCard key={a} selected={authType === a} onSelect={() => setAuthType(a)} icon={AUTH_INFO[a].icon} title={AUTH_INFO[a].label} description={AUTH_INFO[a].description} />
                ))}
              </div>
              {credFields}
            </div>
          </Card>

          <Card>
            <CardHeader title={<span className="flex items-center gap-3"><SectionNumber n={4} /> Authorization</span>} />
            <div className="p-5">
              <Checkbox
                checked={authorized}
                onChange={setAuthorized}
                label="I own this website or have written permission to test it"
                description="Automated testing clicks buttons and submits forms. Destructive actions always require your approval first."
              />
              {errors.authorized && <p className="anim-msg mt-2 text-xs font-medium text-rose-600" aria-invalid="true">{errors.authorized}</p>}
            </div>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader title="Summary" />
            <dl className="space-y-3 p-5 text-sm">
              {[
                ['Name', name.trim() || '—'],
                ['URL', url.trim() || '—'],
                ['Environment', ENVIRONMENT_INFO[env].label],
                ['Authentication', AUTH_INFO[authType].label],
                ['Test accounts', authType === 'NONE' ? 'None' : authType === 'FORM' ? `${creds.length} role${creds.length === 1 ? '' : 's'}` : '1'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="min-w-0 truncate text-right font-medium text-slate-800">{v}</dd></div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Authorization</dt>
                <dd key={String(authorized)} className="anim-fade flex items-center gap-1 font-medium">{authorized ? <><CheckCircle2 className="size-4 text-emerald-600" /> Confirmed</> : <><XCircle className="size-4 text-slate-400" /> Required</>}</dd>
              </div>
              {check && <div className="flex items-center justify-between gap-3"><dt className="text-slate-500">Connectivity</dt><dd className="flex items-center gap-1 font-medium">{check.reachable ? <><CheckCircle2 className="size-4 text-emerald-600" /> HTTP {check.statusCode}</> : <><XCircle className="size-4 text-rose-500" /> Failed</>}</dd></div>}
              {checking && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="size-4 animate-spin" /> Checking…</div>}
            </dl>
            <div className="space-y-2 border-t border-slate-100 p-5">
              <Button type="submit" variant="primary" size="lg" icon={Save} className="w-full">{editing ? 'Save changes' : 'Save project'}</Button>
              <ButtonLink to={editing ? `/projects/${id}` : '/projects'} className="w-full">Cancel</ButtonLink>
              <p className="flex items-start gap-1.5 pt-1 text-xs text-slate-500"><ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-600" /> Saved in this browser until the backend is connected.</p>
            </div>
          </Card>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-400"><KeyRound className="size-3.5" /> Secrets are never stored in the browser</p>
        </aside>
      </form>
    </>
  );
}
