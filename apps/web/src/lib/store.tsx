import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ALL_MODULES } from './catalog';
import { DEMO_ACTIVITY, DEMO_ISSUES, DEMO_PROJECTS, DEMO_RUNS, DEMO_SCREENSHOTS } from './demo';
import { useServerData } from './serverData';
import { linkProjects, toIssue, toReport, toRun, toScreenshot, type ReportItem } from './serverMap';
import type { Activity, AiConfig, Issue, IssueStatus, Preferences, Profile, Project, ProjectStatus, Run, Screenshot, SecuritySettings, TestConfig } from './types';

/**
 * Frontend-only application state (no backend yet).
 * Persisted to localStorage: projects you add, test configurations, settings.
 * NEVER persisted: passwords, tokens, API keys — those will be handled by the backend.
 */

const STORAGE_KEY = 'awt.app.v1';
const SESSION_KEY = 'awt.session.v1';

export interface Session {
  email: string;
  name: string;
  signedInAt: string;
}

interface Persisted {
  projects: Project[];
  configs: Record<string, TestConfig>;
  activity: Activity[];
  profile: Profile;
  preferences: Preferences;
  ai: AiConfig;
  security: SecuritySettings;
  issueStatus: Record<string, IssueStatus>;
}

export const DEFAULT_CONFIG: TestConfig = {
  modules: ALL_MODULES,
  viewports: ['desktop-1280', 'tablet-768', 'mobile-375'],
  maxPages: 200,
  maxDepth: 6,
  requireApproval: true,
};

const DEFAULTS: Persisted = {
  projects: [],
  configs: {},
  activity: [],
  profile: { name: '', email: '', jobTitle: 'QA Engineer', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  preferences: {
    demoMode: false,
    defaultEnvironment: 'STAGING',
    defaultModules: ALL_MODULES,
    dateFormat: 'relative',
    compactTables: false,
    notifyOnComplete: true,
    notifyOnCritical: true,
  },
  ai: { provider: 'none', baseUrl: '', textModel: '', visionModel: '', fastModel: '', maxTokensPerRun: 500_000, visionReview: true },
  security: { sessionTimeoutMin: 60, maskSecretsInScreenshots: true, blockExternalDomains: true },
  issueStatus: {},
};

function readJson<T>(storage: () => Storage, key: string): T | undefined {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function writeJson(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value === undefined) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / blocked) — app keeps working in memory */
  }
}
const local = () => window.localStorage;
const sessionStore = () => window.sessionStorage;

function loadPersisted(): Persisted {
  const saved = readJson<Partial<Persisted>>(local, STORAGE_KEY) ?? {};
  return {
    ...DEFAULTS,
    ...saved,
    profile: { ...DEFAULTS.profile, ...saved.profile },
    preferences: { ...DEFAULTS.preferences, ...saved.preferences },
    ai: { ...DEFAULTS.ai, ...saved.ai },
    security: { ...DEFAULTS.security, ...saved.security },
  };
}

function loadSession(): Session | undefined {
  return readJson<Session>(sessionStore, SESSION_KEY) ?? readJson<Session>(local, SESSION_KEY);
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

interface Store extends Persisted {
  session?: Session;
  signIn: (email: string, remember: boolean, name?: string) => void;
  /** Signs in a temporary demo user for this tab only and turns on labelled demo data. */
  startDemo: () => void;
  signOut: () => void;
  addProject: (p: Omit<Project, 'id' | 'createdAt'>) => Project;
  updateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => void;
  deleteProject: (id: string) => void;
  saveConfig: (projectId: string, cfg: TestConfig) => void;
  setProfile: (p: Partial<Profile>) => void;
  setPreferences: (p: Partial<Preferences>) => void;
  setAi: (a: Partial<AiConfig>) => void;
  setSecurity: (s: Partial<SecuritySettings>) => void;
  setIssueStatus: (id: string, s: IssueStatus) => void;
  logActivity: (a: Omit<Activity, 'id' | 'at'>) => void;
  resetLocalData: () => void;
}

const Ctx = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(loadPersisted);
  const [session, setSession] = useState<Session | undefined>(loadSession);

  useEffect(() => writeJson(local, STORAGE_KEY, state), [state]);

  const patch = useCallback((fn: (s: Persisted) => Persisted) => setState(fn), []);

  const logActivity = useCallback<Store['logActivity']>(
    (a) => patch((s) => ({ ...s, activity: [{ ...a, id: newId('act'), at: new Date().toISOString() }, ...s.activity].slice(0, 100) })),
    [patch],
  );

  const store = useMemo<Store>(
    () => ({
      ...state,
      session,
      signIn(email, remember, given) {
        const name = given?.trim() || state.profile.name || email.split('@')[0]!.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const s: Session = { email, name, signedInAt: new Date().toISOString() };
        writeJson(remember ? local : sessionStore, SESSION_KEY, s);
        writeJson(remember ? sessionStore : local, SESSION_KEY, undefined);
        setSession(s);
        patch((p) => ({ ...p, profile: { ...p.profile, email: p.profile.email || email, name: p.profile.name || name } }));
      },
      startDemo() {
        const s: Session = { email: 'demo@example.com', name: 'Demo user', signedInAt: new Date().toISOString() };
        writeJson(sessionStore, SESSION_KEY, s);
        setSession(s);
        patch((p) => ({ ...p, preferences: { ...p.preferences, demoMode: true } }));
      },
      signOut() {
        writeJson(local, SESSION_KEY, undefined);
        writeJson(sessionStore, SESSION_KEY, undefined);
        setSession(undefined);
      },
      addProject(p) {
        const project: Project = { ...p, id: newId('prj'), createdAt: new Date().toISOString() };
        patch((s) => ({
          ...s,
          projects: [project, ...s.projects],
          configs: { ...s.configs, [project.id]: { ...DEFAULT_CONFIG, modules: s.preferences.defaultModules } },
          activity: [{ id: newId('act'), at: project.createdAt, kind: 'PROJECT_CREATED' as const, message: `${project.name} project created`, projectId: project.id, link: `/projects/${project.id}` }, ...s.activity],
        }));
        return project;
      },
      updateProject(id, p) {
        patch((s) => ({ ...s, projects: s.projects.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
      },
      deleteProject(id) {
        patch((s) => {
          const { [id]: _drop, ...configs } = s.configs;
          return { ...s, projects: s.projects.filter((x) => x.id !== id), configs, activity: s.activity.filter((a) => a.projectId !== id) };
        });
      },
      saveConfig(projectId, cfg) {
        patch((s) => ({ ...s, configs: { ...s.configs, [projectId]: { ...cfg, updatedAt: new Date().toISOString() } } }));
      },
      setProfile: (p) => patch((s) => ({ ...s, profile: { ...s.profile, ...p } })),
      setPreferences: (p) => patch((s) => ({ ...s, preferences: { ...s.preferences, ...p } })),
      setAi: (a) => patch((s) => ({ ...s, ai: { ...s.ai, ...a } })),
      setSecurity: (x) => patch((s) => ({ ...s, security: { ...s.security, ...x } })),
      setIssueStatus: (id, st) => patch((s) => ({ ...s, issueStatus: { ...s.issueStatus, [id]: st } })),
      logActivity,
      resetLocalData() {
        setState({ ...DEFAULTS, profile: state.profile });
      },
    }),
    [state, session, patch, logActivity],
  );

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside AppStoreProvider');
  return s;
}

export interface AppData {
  demo: boolean;
  projects: Project[];
  runs: Run[];
  issues: Issue[];
  screenshots: Screenshot[];
  /** Generated PDF reports (PostgreSQL) for your projects. */
  reports: ReportItem[];
  activity: Activity[];
  /** True once persisted results have been loaded from the API (or failed to load). */
  serverLoaded: boolean;
  /** Why persisted results could not be loaded, if they couldn't. */
  serverError?: string;
  configFor: (projectId: string) => TestConfig;
  project: (id: string | undefined) => Project | undefined;
}

/**
 * Everything the pages display: your projects with their persisted test results from PostgreSQL
 * (runs, issues, screenshots, reports), plus demo data only when Demo mode is on.
 */
export function useData(): AppData {
  const s = useStore();
  const srv = useServerData();
  const demo = s.preferences.demoMode;
  return useMemo(() => {
    const projects = demo ? [...s.projects, ...DEMO_PROJECTS] : s.projects;
    // Real results belong to the browser project with the same website (see linkProjects).
    const link = linkProjects(s.projects, srv.projects);
    const mine = <T,>(rows: T[], pid: (r: T) => string) => rows.filter((r) => link.has(pid(r)));
    const realRuns = mine(srv.runs, (r) => r.project.id).map((r) => toRun(r, link.get(r.project.id)!));
    const realIssues = mine(srv.issues, (i) => i.project.id).map((i) => toIssue(i, link.get(i.project.id)!));
    const realShots = mine(srv.screenshots, (a) => a.run.project.id).map((a) => toScreenshot(a, link.get(a.run.project.id)!));
    const reports = mine(srv.reports, (r) => r.run.project.id).map((r) => toReport(r, link.get(r.run.project.id)!));
    const issues = [...realIssues, ...(demo ? DEMO_ISSUES : [])].map((i) => (s.issueStatus[i.id] ? { ...i, status: s.issueStatus[i.id]! } : i));
    const activity = [...s.activity, ...(demo ? DEMO_ACTIVITY : [])].sort((a, b) => b.at.localeCompare(a.at));
    return {
      demo,
      projects,
      runs: [...realRuns, ...(demo ? DEMO_RUNS : [])],
      issues,
      screenshots: [...realShots, ...(demo ? DEMO_SCREENSHOTS : [])],
      reports,
      activity,
      serverLoaded: srv.loaded,
      serverError: srv.error && !srv.error.isDbNotConfigured ? srv.error.message : undefined,
      configFor: (id) => s.configs[id] ?? { ...DEFAULT_CONFIG, modules: s.preferences.defaultModules },
      project: (id) => projects.find((p) => p.id === id),
    };
  }, [demo, s.projects, s.activity, s.configs, s.issueStatus, s.preferences.defaultModules, srv]);
}

export function projectStats(p: Project, data: Pick<AppData, 'runs' | 'issues'>, testing = false) {
  const runs = data.runs.filter((r) => r.projectId === p.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const latest = runs[0];
  const openIssues = data.issues.filter((i) => i.projectId === p.id && i.status === 'OPEN' && i.classification === 'CONFIRMED').length;
  let status: ProjectStatus = 'NOT_TESTED';
  if (testing) status = 'TESTING';
  else if (latest?.status === 'FAILED') status = 'FAILED';
  else if (latest) status = openIssues > 0 ? 'ISSUES_FOUND' : 'PASSED';
  return { runs, latest, openIssues, status, lastTested: latest?.finishedAt ?? latest?.startedAt };
}
