/**
 * Domain enums shared by API, worker, engine and web.
 * Kept in sync with packages/db/prisma/schema.prisma (verified by a unit test in @awt/db).
 */
export const UserRole = ['ADMIN', 'TESTER', 'VIEWER'] as const;
export type UserRole = (typeof UserRole)[number];

export const EnvironmentType = ['PRODUCTION', 'STAGING', 'TEST', 'LOCAL'] as const;
export type EnvironmentType = (typeof EnvironmentType)[number];

export const RunStatus = ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type RunStatus = (typeof RunStatus)[number];

/** Background job lifecycle (PostgreSQL-backed queue). */
export const JobStatus = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type JobStatus = (typeof JobStatus)[number];

export const DeviceClass = ['DESKTOP', 'TABLET', 'MOBILE'] as const;
export type DeviceClass = (typeof DeviceClass)[number];

export const TestModule = [
  'UI_LAYOUT',
  'RESPONSIVE',
  'IMAGE',
  'BUTTON',
  'NAVIGATION',
  'FORM',
  'PASSWORD',
  'FUNCTIONAL',
  'ACCESSIBILITY',
  'CONSOLE_NETWORK',
] as const;
export type TestModule = (typeof TestModule)[number];

export const TestStatus = ['PASSED', 'FAILED', 'FLAKY', 'SKIPPED', 'ERROR', 'BLOCKED'] as const;
export type TestStatus = (typeof TestStatus)[number];

export const Severity = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type Severity = (typeof Severity)[number];

/**
 * How trustworthy a finding is — the core "no dummy results" contract:
 *  CONFIRMED    – deterministic check failed reproducibly AND has evidence artifacts (screenshot required).
 *  FLAKY        – failed, then passed on retry; reported separately, never counted as a bug.
 *  NEEDS_REVIEW – AI / vision observation without deterministic corroboration.
 */
export const FindingClassification = ['CONFIRMED', 'FLAKY', 'NEEDS_REVIEW'] as const;
export type FindingClassification = (typeof FindingClassification)[number];

export const IssueStatus = ['OPEN', 'ACKNOWLEDGED', 'FALSE_POSITIVE', 'FIXED', 'WONT_FIX'] as const;
export type IssueStatus = (typeof IssueStatus)[number];

export const ElementRisk = ['SAFE', 'MUTATING', 'DESTRUCTIVE', 'UNKNOWN'] as const;
export type ElementRisk = (typeof ElementRisk)[number];

export const ApprovalStatus = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export type ApprovalStatus = (typeof ApprovalStatus)[number];

export const ArtifactType = [
  'PAGE_SCREENSHOT',
  'ELEMENT_SCREENSHOT',
  'DOM_SNAPSHOT',
  'HAR',
  'CONSOLE_LOG',
  'NETWORK_LOG',
  'TRACE',
  'VIDEO',
] as const;
export type ArtifactType = (typeof ArtifactType)[number];

/** How a page was discovered — supports public, authenticated, menu, dropdown and role-based discovery. */
export const DiscoverySource = [
  'SEED',
  'SITEMAP',
  'LINK',
  'NAV_MENU',
  'DROPDOWN',
  'SPA_ROUTE',
  'BUTTON_NAVIGATION',
  'REDIRECT',
] as const;
export type DiscoverySource = (typeof DiscoverySource)[number];

export const AiProvider = ['anthropic', 'openai', 'openai-compatible', 'none'] as const;
export type AiProvider = (typeof AiProvider)[number];
