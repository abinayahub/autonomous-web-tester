import { describe, expect, it } from 'vitest';
import { assertEvidenceContract, type Finding } from './index.js';

const base: Finding = {
  module: 'BUTTON',
  classification: 'CONFIRMED',
  category: 'dead-button',
  severity: 'MEDIUM',
  title: 'Button does nothing',
  expected: 'An action occurs',
  actual: 'No DOM, network or navigation change',
  steps: ['Open /', 'Click "Subscribe"'],
  pageUrl: 'http://localhost:4500/',
  signals: { domMutations: 0, networkRequests: 0 },
  evidence: [{ artifactId: 'a1', kind: 'ELEMENT_SCREENSHOT' }],
};

describe('evidence contract', () => {
  it('accepts a confirmed finding with screenshot + signals', () => {
    expect(() => assertEvidenceContract(base)).not.toThrow();
  });
  it('rejects a confirmed finding without a screenshot', () => {
    expect(() => assertEvidenceContract({ ...base, evidence: [{ artifactId: 'a', kind: 'CONSOLE_LOG' }] })).toThrow(/screenshot/);
  });
  it('rejects a confirmed finding without signals', () => {
    expect(() => assertEvidenceContract({ ...base, signals: {} })).toThrow(/signals/);
  });
  it('does not apply to NEEDS_REVIEW observations', () => {
    expect(() => assertEvidenceContract({ ...base, classification: 'NEEDS_REVIEW', evidence: [], signals: {} })).not.toThrow();
  });
});
