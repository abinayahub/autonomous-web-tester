/**
 * Sensitive-data masking for anything that leaves the worker: logs, run events,
 * DOM snapshots, AI prompts and reports.
 */

export const MASK = '••••••••';

const SENSITIVE_KEY = /pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|session|credential|otp|pin|cvv|card/i;

const PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g, `Bearer ${MASK}`],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, MASK], // JWT
  [/\b(?:\d[ -]?){13,19}\b/g, MASK], // card-like numbers
  [/\b(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}\b/g, MASK], // common API key shapes
  [/([?&](?:token|key|password|secret|session|auth)[^=&]*=)[^&#\s]+/gi, `$1${MASK}`],
];

export interface MaskOptions {
  /** Exact values that must never appear (e.g. the decrypted test password). */
  secrets?: readonly string[];
}

export function maskText(input: string, opts: MaskOptions = {}): string {
  let out = input;
  for (const secret of opts.secrets ?? []) {
    if (secret && secret.length >= 3) out = out.split(secret).join(MASK);
  }
  for (const [re, replacement] of PATTERNS) out = out.replace(re, replacement);
  return out;
}

/** Deep-masks an object: sensitive keys are replaced wholesale, strings are pattern-masked. */
export function maskObject<T>(value: T, opts: MaskOptions = {}): T {
  const walk = (v: unknown, key?: string): unknown => {
    if (key && SENSITIVE_KEY.test(key) && v !== null && v !== undefined && typeof v !== 'object') return MASK;
    if (typeof v === 'string') return maskText(v, opts);
    if (Array.isArray(v)) return v.map((item) => walk(item));
    if (v && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
      return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val, k)]));
    }
    return v;
  };
  return walk(value) as T;
}

/** CSS selectors masked (blacked out) in every screenshot via Playwright's `mask` option. */
export const SCREENSHOT_MASK_SELECTORS = [
  'input[type="password"]',
  'input[autocomplete="current-password"]',
  'input[autocomplete="new-password"]',
  'input[autocomplete="cc-number"]',
  'input[autocomplete="one-time-code"]',
  '[data-awt-mask]',
] as const;
