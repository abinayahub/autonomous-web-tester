/**
 * @awt/engine — autonomous testing engine (implemented in Phases 2–5).
 *
 * Phase 0 defines only the contracts every test module must follow, so the
 * evidence rules are fixed before any test logic exists.
 */
import type { DeviceClass, FindingClassification, Severity, TestModule, TestStatus } from '@awt/shared';

/** The crawler and test modules are implemented; the worker runs test-run jobs through executeTestRun(). */
export const ENGINE_READY = true;

export { executeTestRun, TargetError, type ExecuteOptions, type RunSummary } from './run.js';
export { generateReport } from './report.js';
export { BrowserLaunchError, launchChromium } from './launch.js';
export { normalizeUrl, inScope } from './url.js';

export interface EvidenceRef {
  artifactId: string;
  kind: 'PAGE_SCREENSHOT' | 'ELEMENT_SCREENSHOT' | 'DOM_SNAPSHOT' | 'CONSOLE_LOG' | 'NETWORK_LOG' | 'HAR' | 'TRACE' | 'VIDEO';
}

/** A finding produced by a module. Only the engine's IssueBuilder may persist it. */
export interface Finding {
  module: TestModule;
  classification: FindingClassification;
  category: string;
  severity: Severity;
  title: string;
  expected: string;
  actual: string;
  steps: string[];
  pageUrl: string;
  deviceClass?: DeviceClass;
  viewportId?: string;
  /** Measured values that prove the failure (bounding boxes, status codes, mutation counts…). */
  signals: Record<string, unknown>;
  evidence: EvidenceRef[];
}

export interface TestOutcome {
  status: TestStatus;
  attempts: number;
  findings: Finding[];
}

/**
 * Evidence contract: a CONFIRMED finding must carry at least one screenshot
 * and at least one measured signal. Anything else is rejected — never stored as a confirmed issue.
 */
export function assertEvidenceContract(f: Finding): void {
  if (f.classification !== 'CONFIRMED') return;
  const hasScreenshot = f.evidence.some((e) => e.kind === 'PAGE_SCREENSHOT' || e.kind === 'ELEMENT_SCREENSHOT');
  if (!hasScreenshot) throw new Error(`Confirmed finding "${f.title}" has no screenshot evidence`);
  if (Object.keys(f.signals).length === 0) throw new Error(`Confirmed finding "${f.title}" has no measured signals`);
}
