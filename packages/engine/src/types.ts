import type { NetworkPolicy } from '@awt/crypto';
import type { TestModule } from '@awt/db';
import type { ViewportProfile } from '@awt/shared';
import type { Environment, GuardedBrowser, PageSignals } from './browser.js';
import type { Recorder } from './recorder.js';

export interface TestCredential {
  role: string;
  username: string;
  password: string;
  loginUrl?: string;
  /** Optional proof of a successful sign-in: CSS selector or visible text (e.g. "#user-menu" or "Welcome back"). */
  successIndicator?: string;
}

/** A verified signed-in session: cookies + localStorage (storageState) and sessionStorage, restored in every context. */
export interface AuthSession {
  role: string;
  landing: string;
  storageState: { cookies: unknown[]; origins: unknown[] };
  /** origin → sessionStorage entries (tokens kept in memory only; never logged or stored). */
  sessionStorage: Record<string, Record<string, string>>;
  successIndicator?: string;
  /**
   * Same-site API endpoint (path) that answered 401/403 before sign-in and 2xx after it, e.g. /api/auth/me.
   * Proves the session is still valid on every signed-in page — no reliance on a "Log out" link.
   */
  probePath?: string;
  /** Page the site opened right after sign-in (the role's dashboard). */
  dashboardUrl: string;
  /** How the selected role was confirmed for this account. */
  roleCheck: RoleCheck;
}

export interface RoleCheck {
  status: 'confirmed' | 'unverified';
  how: string;
}

export interface RunSettings {
  runId: string;
  projectId: string;
  projectName: string;
  baseUrl: string;
  allowedHosts: string[];
  excludedPaths: string[];
  environment: Environment;
  maxPages: number;
  maxDepth: number;
  modules: Set<TestModule>;
  viewports: ViewportProfile[];
  timeLimitMs: number;
  rps: number;
  storageRoot: string;
  network: NetworkPolicy;
  credentials: TestCredential[];
  /** Pages that get interaction tests (buttons/forms) and multi-viewport layout checks. */
  interactionPageLimit: number;
}

// Shapes returned by window.__awt.inventory()
export interface LinkInfo { href: string; raw: string; text: string; selector: string; visible: boolean; inNav: boolean; inFooter: boolean; target: string; rel: string; download: boolean; hashTarget: boolean | null; hash: string }
export interface ButtonInfo { selector: string; tag: string; text: string; type: string; role: string; disabled: boolean; inForm: boolean; isFormSubmit: boolean; ariaExpanded: string | null; dataRoute: string; hasOnclick: boolean; inChrome: boolean; inNav: boolean; box: { x: number; y: number; w: number; h: number } }
export interface FieldInfo { selector: string; tag: string; type: string; name: string; id: string; label: string; placeholder: string; autocomplete: string; required: boolean; minLength: number | null; maxLength: number | null; min: string | null; max: string | null; pattern: string | null; visible: boolean; disabled: boolean; readOnly: boolean; describedBy: string; options: string[] | null }
export interface FormInfo { selector: string; action: string; method: string; noValidate: boolean; text: string; id: string; name: string; fields: FieldInfo[]; submitSelector: string; submitText: string }
export interface ImageInfo { selector: string; src: string; hasAlt: boolean; alt: string | null; broken: boolean; visible: boolean; decorative: boolean }
export interface Inventory {
  url: string; title: string; metaDescription: string | null; lang: string; h1: string[]; bodyText: string; hasPassword: boolean;
  links: LinkInfo[]; buttons: ButtonInfo[]; forms: FormInfo[]; images: ImageInfo[];
  inputsNoLabel: Array<{ selector: string; type: string; name: string }>; buttonsNoName: Array<{ selector: string; tag: string }>; domSize: number;
}

export interface CrawledPage {
  id: string;
  requestedUrl: string;
  url: string;
  normalizedUrl: string;
  title: string;
  status?: number;
  depth: number;
  loadTimeMs: number;
  inv: Inventory;
  signals: PageSignals;
  requiresAuth: boolean;
  /** Credential role this page was reached with (undefined = anonymous). */
  role?: string;
  redirectChain?: string[];
}

export interface RunCtx {
  s: RunSettings;
  rec: Recorder;
  gb: GuardedBrowser;
  signal: AbortSignal;
  log: (m: string) => void;
  deadline: number;
  pages: CrawledPage[];
  /** Verified session per credential role. */
  sessions: Map<string, AuthSession>;
  stage: (stage: Stage, message: string, data?: Record<string, unknown>) => Promise<void>;
  checkpoint: () => void;
  timeLeft: () => number;
}

export type Stage = 'connecting' | 'discovering' | 'navigation' | 'technical' | 'buttons' | 'forms' | 'responsive' | 'authenticated' | 'screenshots' | 'report' | 'done';
