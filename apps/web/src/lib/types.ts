// Frontend domain model. Enum values mirror packages/shared/src/enums.ts so the backend can plug in later.

export type Environment = 'PRODUCTION' | 'STAGING' | 'TEST' | 'LOCAL';
export type AuthType = 'NONE' | 'FORM' | 'BASIC' | 'TOKEN';
export type ModuleId = 'UI_LAYOUT' | 'RESPONSIVE' | 'BUTTON' | 'NAVIGATION' | 'FORM' | 'PASSWORD' | 'FUNCTIONAL' | 'CONSOLE_NETWORK';
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type IssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'FIXED' | 'FALSE_POSITIVE' | 'WONT_FIX';
export type Classification = 'CONFIRMED' | 'FLAKY' | 'NEEDS_REVIEW';
export type RunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'FAILED';
export type ProjectStatus = 'NOT_TESTED' | 'TESTING' | 'PASSED' | 'ISSUES_FOUND' | 'FAILED';
export type DeviceClass = 'DESKTOP' | 'TABLET' | 'MOBILE';
export type ViewportId = 'desktop-1920' | 'desktop-1280' | 'tablet-768' | 'mobile-375';

export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
export const ISSUE_STATUSES: IssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'FIXED', 'FALSE_POSITIVE', 'WONT_FIX'];
export const ENVIRONMENTS: Environment[] = ['PRODUCTION', 'STAGING', 'TEST', 'LOCAL'];

/** Credential metadata only. Secrets are never kept in the browser. */
export interface CredentialMeta {
  id: string;
  roleName: string;
  username: string;
  loginUrl?: string;
  /** For TOKEN auth: header name, e.g. "Authorization". */
  headerName?: string;
  /** True when a secret was entered in the form (it is discarded — the backend will encrypt and store it). */
  secretProvided: boolean;
}

export interface Project {
  id: string;
  name: string;
  url: string;
  environment: Environment;
  authType: AuthType;
  credentials: CredentialMeta[];
  authorizationConfirmedAt: string;
  createdAt: string;
  demo?: boolean;
  /** PostgreSQL project id once a real run has been started for this website. */
  remoteProjectId?: string;
}

export interface TestConfig {
  modules: ModuleId[];
  viewports: ViewportId[];
  maxPages: number;
  maxDepth: number;
  /** Always true — risky actions need human approval. Shown locked in the UI. */
  requireApproval: true;
  updatedAt?: string;
}

export interface Run {
  id: string;
  projectId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  pagesDiscovered: number;
  testsPassed: number;
  testsFailed: number;
  testsFlaky: number;
  issuesFound: number;
  modules: ModuleId[];
  demo?: boolean;
}

export interface Issue {
  id: string;
  key: string;
  projectId: string;
  runId: string;
  title: string;
  description: string;
  pageName: string;
  pageUrl: string;
  module: ModuleId;
  severity: Severity;
  status: IssueStatus;
  classification: Classification;
  expected: string;
  actual: string;
  steps: string[];
  device: DeviceClass;
  viewport: ViewportId;
  browser: string;
  element?: string;
  screenshotIds: string[];
  detectedAt: string;
  demo?: boolean;
}

export type ScreenshotKind = 'ISSUE' | 'BEFORE' | 'AFTER' | 'PAGE';

export interface Screenshot {
  id: string;
  projectId: string;
  runId: string;
  issueId?: string;
  /** Before/after screenshots share a pairId. */
  pairId?: string;
  kind: ScreenshotKind;
  label: string;
  pageName: string;
  pageUrl: string;
  device: DeviceClass;
  width: number;
  height: number;
  src: string;
  capturedAt: string;
  demo?: boolean;
}

export interface Activity {
  id: string;
  at: string;
  kind: 'RUN_COMPLETED' | 'RUN_STARTED' | 'RUN_STOPPED' | 'ISSUE_FOUND' | 'PROJECT_CREATED' | 'CONFIG_SAVED';
  message: string;
  projectId?: string;
  link?: string;
  demo?: boolean;
}

export interface Profile {
  name: string;
  email: string;
  jobTitle: string;
  timezone: string;
}

export interface Preferences {
  demoMode: boolean;
  defaultEnvironment: Environment;
  defaultModules: ModuleId[];
  dateFormat: 'relative' | 'absolute';
  compactTables: boolean;
  notifyOnComplete: boolean;
  notifyOnCritical: boolean;
}

export type AiProvider = 'none' | 'anthropic' | 'openai' | 'openai-compatible';

/** API key is intentionally absent — it is never stored in the browser. */
export interface AiConfig {
  provider: AiProvider;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  fastModel: string;
  maxTokensPerRun: number;
  visionReview: boolean;
}

export interface SecuritySettings {
  sessionTimeoutMin: number;
  maskSecretsInScreenshots: true;
  blockExternalDomains: true;
}
