import type { BrowserContext, Page } from 'playwright';
import { newPageContext } from '../crawl.js';
import { classifyAction, isPaymentField } from '../risk.js';
import type { CrawledPage, FieldInfo, FormInfo, RunCtx } from '../types.js';
import { pathOf } from '../url.js';
import { openPage, pass, quote, report } from './common.js';

type Kind = 'email' | 'phone' | 'password' | 'confirm' | 'number' | 'url' | 'date' | 'name' | 'message' | 'checkbox' | 'radio' | 'select' | 'file' | 'search' | 'text';

function kindOf(f: FieldInfo): Kind {
  const t = `${f.name} ${f.id} ${f.label} ${f.placeholder} ${f.autocomplete}`.toLowerCase();
  if (f.type === 'checkbox') return 'checkbox';
  if (f.type === 'radio') return 'radio';
  if (f.tag === 'select') return 'select';
  if (f.type === 'file') return 'file';
  if (f.type === 'password') return /confirm|repeat|again|re-?enter|verify|retype/.test(t) ? 'confirm' : 'password';
  if (f.type === 'email' || /e-?mail/.test(t)) return 'email';
  if (f.type === 'tel' || /phone|mobile|\btel\b|cell/.test(t)) return 'phone';
  if (f.type === 'number' || f.type === 'range') return 'number';
  if (f.type === 'url') return 'url';
  if (/^(date|datetime-local|month|week|time)$/.test(f.type)) return 'date';
  if (f.type === 'search' || /^(q|query|search|s)$/.test(f.name)) return 'search';
  if (f.tag === 'textarea' || /message|comment|description|details|enquiry|inquiry/.test(t)) return 'message';
  if (/name/.test(t)) return 'name';
  return 'text';
}

const STRONG_PASSWORD = 'AwtTest#2026pass';

function validValue(f: FieldInfo, kind: Kind, tag: string): string | undefined {
  const fit = (v: string) => {
    let out = v;
    if (f.minLength && out.length < f.minLength) out = out.padEnd(f.minLength, 'x');
    if (f.maxLength && out.length > f.maxLength) out = out.slice(0, f.maxLength);
    if (f.pattern) {
      try {
        if (!new RegExp(`^(?:${f.pattern})$`, 'u').test(out)) return undefined; // can't satisfy a custom pattern safely
      } catch {
        return undefined;
      }
    }
    return out;
  };
  switch (kind) {
    case 'email': return fit(`awt.test+${tag}@example.com`);
    case 'phone': return fit('5550100123');
    case 'password':
    case 'confirm': return fit(STRONG_PASSWORD);
    case 'number': {
      const min = f.min !== null && f.min !== '' ? Number(f.min) : undefined;
      const max = f.max !== null && f.max !== '' ? Number(f.max) : undefined;
      return String(min ?? (max !== undefined ? Math.min(1, max) : 1));
    }
    case 'url': return fit('https://example.com');
    case 'date': return f.type === 'datetime-local' ? '2026-01-15T10:00' : f.type === 'time' ? '10:00' : f.type === 'month' ? '2026-01' : f.type === 'week' ? '2026-W03' : '2026-01-15';
    case 'message': return fit('Automated test from Autonomous Web Tester — please ignore.');
    case 'name': return fit('AWT Test');
    case 'search': return 'test';
    case 'text': return fit('AWT test value');
    default: return '';
  }
}

interface Obs {
  submitted: boolean;
  blocked: boolean;
  status?: number;
  urlChanged: boolean;
  url: string;
  errors: string[];
  invalid: Array<{ selector: string; message: string; ariaInvalid: boolean }>;
  successText: boolean;
  responses: Array<{ method: string; url: string; status: number }>;
}

type Values = Map<string, string | null>; // selector → value (null = leave empty)

async function fillForm(page: Page, form: FormInfo, kinds: Map<string, Kind>, values: Values, tag: string) {
  const radios = new Set<string>();
  for (const f of form.fields) {
    if (!f.visible || f.disabled || f.readOnly) continue;
    const kind = kinds.get(f.selector)!;
    const loc = page.locator(f.selector).first();
    const v = values.has(f.selector) ? values.get(f.selector)! : validValue(f, kind, tag);
    try {
      if (kind === 'checkbox') {
        if (v !== null) await loc.setChecked(true, { timeout: 3_000 });
      } else if (kind === 'radio') {
        if (v !== null && !radios.has(f.name)) {
          await loc.check({ timeout: 3_000 });
          radios.add(f.name);
        }
      } else if (kind === 'select') {
        const opt = (f.options ?? []).find((o) => o);
        if (v !== null && opt) await loc.selectOption(opt, { timeout: 3_000 });
      } else if (kind === 'file') {
        // never upload files
      } else {
        await loc.fill(v ?? '', { timeout: 3_000 });
      }
    } catch {
      /* field not interactable — leave as is */
    }
  }
}

async function submitAndObserve(ctx: RunCtx, page: Page, form: FormInfo): Promise<Obs> {
  const startUrl = page.url();
  const beforeText = ((await page.evaluate('document.body ? document.body.innerText : ""').catch(() => '')) as string).toLowerCase();
  const responses: Obs['responses'] = [];
  const onResp = (r: import('playwright').Response) => {
    const req = r.request();
    if ((req.method() !== 'GET' && ctx.gb.isSameSite(req.url())) || (req.isNavigationRequest() && req.frame() === page.mainFrame())) {
      responses.push({ method: req.method(), url: req.url(), status: r.status() });
    }
  };
  page.on('response', onResp);
  const netIdx = ctx.gb.net.length;
  try {
    if (form.submitSelector) await page.locator(form.submitSelector).first().click({ timeout: 4_000 });
    else await page.locator(`${form.selector} input:not([type=hidden]):not([type=checkbox]):not([type=radio])`).last().press('Enter', { timeout: 4_000 });
  } catch {
    /* handled by the observation below */
  }
  await Promise.race([page.waitForEvent('framenavigated', { timeout: 4_000 }).catch(() => undefined), page.waitForTimeout(2_500)]);
  await page.waitForLoadState('load', { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  page.off('response', onResp);
  const blocked = ctx.gb.net.slice(netIdx).some((r) => r.blocked && r.method !== 'GET');
  const errors = ((await page.evaluate('window.__awt ? window.__awt.errorsVisible() : []').catch(() => [])) as string[]);
  const invalid = ((await page.evaluate('window.__awt ? window.__awt.invalidFields() : []').catch(() => [])) as Obs['invalid']).filter((i) => i.message || i.ariaInvalid);
  const afterText = ((await page.evaluate('document.body ? document.body.innerText : ""').catch(() => '')) as string).toLowerCase();
  const success = /thank|success|received|has been sent|message sent|we('|’)ll be in touch|account (has been )?created|welcome|registered|signed up/.exec(afterText);
  const nonGet = responses.filter((r) => r.method !== 'GET');
  const url = page.url();
  const urlChanged = url.split('#')[0] !== startUrl.split('#')[0];
  return {
    submitted: nonGet.length > 0 || blocked || (form.method === 'get' && urlChanged),
    blocked, status: nonGet.at(-1)?.status ?? responses.at(-1)?.status, urlChanged, url, errors, invalid,
    successText: !!success && !beforeText.includes(success[0]), responses,
  };
}

type Verdict = 'rejected-client' | 'rejected-server' | 'accepted' | 'blocked' | 'no-feedback' | 'unclear';
function judge(o: Obs): Verdict {
  if (!o.submitted) return o.errors.length || o.invalid.length ? 'rejected-client' : 'no-feedback';
  if (o.blocked) return 'blocked';
  // After a submission the page may be a fresh (empty, hence ':invalid') form — only real error messages count.
  if ((o.status ?? 200) >= 400 || o.errors.length || o.invalid.some((i) => i.ariaInvalid)) return 'rejected-server';
  if (o.successText || o.urlChanged) return 'accepted';
  return 'unclear';
}

const LOGIN_TEXT = /\b(log ?in|sign ?in)\b/i;
/** Buttons that usually open a form (modal or inline): "Edit Profile", "Change Password", "New document", "Upload"… */
const OPENS_FORM = /\b(edit|change|update|new|create|add|upload|write|compose|reply|comment|contact|request|apply|invite|feedback|register|enquire|inquire)\b/i;
/** A signed-in form that changes the test account itself — never sent to the server, in any environment. */
const ACCOUNT_FORM = /\b(password|passcode|profile|account|e-?mail|username|login id|security|settings|two.?factor|2fa)\b/i;
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface Opener { selector: string; text: string }
interface FormTarget { form: FormInfo; opener?: Opener }

/** Opens the page and, for a form behind a button, clicks the button and waits for the form. */
async function openFormPage(bctx: BrowserContext, url: string, t: FormTarget) {
  const opened = await openPage(bctx, url);
  if (t.opener) {
    await opened.page.locator(t.opener.selector).first().click({ timeout: 4_000 }).catch(() => undefined);
    await opened.page.locator(t.form.selector).first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  }
  return opened;
}

/**
 * Finds forms that only appear after clicking a button (modals, inline editors). Read-only: data-changing requests
 * are blocked while looking, and destructive / sign-out controls are never clicked.
 */
async function formsBehindButtons(ctx: RunCtx, bctx: BrowserContext, p: CrawledPage, tried: Set<string>): Promise<FormTarget[]> {
  const known = new Set(p.inv.forms.map((f) => f.selector));
  const openers = p.inv.buttons
    .filter((b) => !b.disabled && !b.inForm && !b.inNav && b.text && b.text.length <= 40 && OPENS_FORM.test(b.text) && !LOGIN_TEXT.test(b.text))
    .filter((b) => classifyAction(b.text).risk !== 'DESTRUCTIVE' && !tried.has(b.text.toLowerCase()))
    .slice(0, 6);
  const out: FormTarget[] = [];
  for (const b of openers) {
    tried.add(b.text.toLowerCase());
    ctx.checkpoint();
    if (ctx.timeLeft() < 90_000) break;
    const { page } = await openPage(bctx, p.url);
    await page.route('**/*', (r) => (MUTATING_METHODS.has(r.request().method().toUpperCase()) ? r.abort('blockedbyclient') : r.fallback()));
    try {
      const before = page.url();
      await page.locator(b.selector).first().click({ timeout: 4_000 }).catch(() => undefined);
      await page.waitForTimeout(1_000);
      if (page.url().split('#')[0] !== before.split('#')[0]) continue; // navigation, not a form (the crawler handles routes)
      const inv = (await page.evaluate('window.__awt.inventory()').catch(() => null)) as { forms: FormInfo[] } | null;
      const form = inv?.forms.find((f) => !known.has(f.selector) && f.fields.some((x) => x.visible && !x.disabled));
      if (form) {
        out.push({ form, opener: { selector: b.selector, text: b.text } });
        ctx.log(`form behind button "${b.text}" on ${pathOf(p.url)}`);
      }
    } finally {
      await page.close().catch(() => undefined);
    }
  }
  return out;
}

/** Validation testing for every distinct form: empty required fields, invalid email/phone, number bounds, password rules. */
export async function checkForms(ctx: RunCtx, pages: CrawledPage[], role?: string) {
  const { bctx } = await newPageContext(ctx, role);
  const seen = new Set<string>();
  const triedOpeners = new Set<string>();
  const runTag = ctx.s.runId.slice(0, 6);
  let n = 0;
  try {
    for (const p of pages) {
      if ((p.status ?? 200) >= 400) continue;
      const targets: FormTarget[] = [...p.inv.forms.map((form) => ({ form })), ...(await formsBehindButtons(ctx, bctx, p, triedOpeners))];
      for (const target of targets) {
        const { form, opener } = target;
        ctx.checkpoint();
        if (ctx.timeLeft() < 60_000) return;
        const visible = form.fields.filter((f) => f.visible && !f.disabled);
        const sig = `${form.action}|${form.method}|${visible.map((f) => f.name || f.type).sort().join(',')}`;
        if (seen.has(sig) || !visible.length) continue;
        seen.add(sig);
        const formName = `${form.submitText || form.name || form.id || 'form'}${opener ? ` (opened with ${quote(opener.text, 30)})` : ''} on ${pathOf(p.url)}`;
        // Signed in: a form that changes the test account (password, profile, e-mail…) is never sent to the server.
        const fieldText = form.fields.map((f) => `${f.type} ${f.name} ${f.id} ${f.label} ${f.placeholder}`).join(' ');
        const accountForm = !!role && (form.fields.some((f) => f.type === 'password') || ACCOUNT_FORM.test(`${opener?.text ?? ''} ${form.submitText} ${fieldText} ${pathOf(p.url)}`));
        const kinds = new Map(form.fields.map((f) => [f.selector, kindOf(f)] as const));
        const passwords = visible.filter((f) => kinds.get(f.selector) === 'password');
        const isLogin = passwords.length === 1 && !visible.some((f) => kinds.get(f.selector) === 'confirm') && visible.filter((f) => !['checkbox', 'radio'].includes(kinds.get(f.selector)!)).length <= 2 && (LOGIN_TEXT.test(`${form.submitText} ${form.action} ${p.url}`));
        const risk = classifyAction(form.submitText, `${new URL(form.action || p.url).pathname.replace(/[/_-]+/g, ' ')}`);
        if (visible.some((f) => isPaymentField(f)) || risk.risk === 'DESTRUCTIVE') {
          await pass(ctx, { module: 'FORM', name: `Form ${formName}`, pageId: p.id, status: 'BLOCKED', observations: { reason: risk.reason ?? 'Payment form — never submitted' } });
          continue;
        }
        if (isLogin) {
          await pass(ctx, { module: 'FORM', name: `Form ${formName}`, pageId: p.id, status: 'SKIPPED', observations: { reason: 'Sign-in form — used by authenticated testing, not validation-tested' } });
          continue;
        }
        const isSignup = passwords.length >= 1;
        const modulePw = isSignup ? 'PASSWORD' : 'FORM';
        const scenario = async (label: string, override: Values) => {
          n++;
          const { page } = await openFormPage(bctx, p.url, target);
          let held = 0;
          if (accountForm) {
            await page.route('**/*', (r) => {
              if (!MUTATING_METHODS.has(r.request().method().toUpperCase())) return r.fallback();
              held++;
              return r.abort('blockedbyclient');
            });
          }
          await fillForm(page, form, kinds, override, `${runTag}${n}`);
          const obs = await submitAndObserve(ctx, page, form);
          if (held) Object.assign(obs, { submitted: true, blocked: true });
          return { page, obs, verdict: judge(obs) };
        };
        const steps = (desc: string) => [`Open ${p.url}${role ? ` signed in as "${role}"` : ''}`, ...(opener ? [`Click ${quote(opener.text)}`] : []), `Fill the form ${quote(form.submitText || 'form')} with valid test data, ${desc}`, `Click ${quote(form.submitText || 'Submit')}`, 'Observe the response'];
        const fieldName = (f: FieldInfo) => f.label || f.name || f.type;

        // A rule-breaking value must be rejected.
        const expectReject = async (o: { label: string; module: 'FORM' | 'PASSWORD'; override: Values; field: FieldInfo; title: string; category: string; severity: 'HIGH' | 'MEDIUM'; desc: string; input: Record<string, string>; recommendation: string }) => {
          const { page, obs, verdict } = await scenario(o.label, o.override);
          const name = `${o.label} — ${formName}`;
          try {
            const signals = { verdict, ...obs, input: o.input };
            if (verdict === 'accepted') {
              await report(ctx, {
                module: o.module, category: o.category, severity: o.severity, classification: 'CONFIRMED', testName: name, pageRec: p, page,
                title: o.title, description: `${o.desc} The server responded with HTTP ${obs.status ?? 200}${obs.successText ? ' and a success message' : ''}${obs.urlChanged ? ` and moved to ${pathOf(obs.url)}` : ''}; no validation error was shown.`,
                expected: 'The form rejects the value and shows a clear validation message next to the field.', actual: `Accepted (HTTP ${obs.status ?? 200}${obs.urlChanged ? `, redirected to ${pathOf(obs.url)}` : ''}).`,
                steps: steps(`but enter ${Object.entries(o.input).map(([k, v]) => `${k} = "${v}"`).join(', ')}`), signals, groupKey: `${sig}|${o.label}`,
                element: { type: 'input', selector: o.field.selector, text: fieldName(o.field) }, inputData: o.input, recommendation: o.recommendation,
              });
            } else if (verdict === 'blocked' || verdict === 'unclear') {
              await report(ctx, {
                module: o.module, category: o.category, severity: 'MEDIUM', classification: 'NEEDS_REVIEW', testName: name, pageRec: p, page, target: page.locator(o.field.selector).first(),
                title: `${o.title} (not verified on the server)`,
                description: `${o.desc} The browser did not stop the submission and showed no validation message. ${verdict === 'blocked' ? `The request was blocked by the safety policy (${accountForm ? 'this form changes the signed-in test account' : 'production site'}), so the server response could not be checked.` : 'The server answered without a clear success or error message.'}`,
                expected: 'The value is rejected with a validation message.', actual: verdict === 'blocked' ? 'Submitted by the browser (request blocked by the testing safety policy).' : `HTTP ${obs.status ?? '?'}; no visible error or confirmation.`,
                steps: steps(`but enter ${Object.entries(o.input).map(([k, v]) => `${k} = "${v}"`).join(', ')}`), signals, groupKey: `${sig}|${o.label}`,
                element: { type: 'input', selector: o.field.selector, text: fieldName(o.field) }, inputData: o.input, recommendation: o.recommendation,
              });
            } else {
              await pass(ctx, { module: o.module, name, pageId: p.id, observations: signals, inputData: o.input });
            }
          } finally {
            await page.close();
          }
        };

        // 1. Empty required fields
        const required = visible.filter((f) => f.required && !['checkbox', 'radio', 'file'].includes(kinds.get(f.selector)!));
        if (required.length) {
          await expectReject({
            label: 'Empty required fields', module: 'FORM', field: required[0]!, category: 'Missing required-field validation', severity: 'HIGH',
            override: new Map(required.map((f) => [f.selector, null])), input: Object.fromEntries(required.map((f) => [fieldName(f), ''])),
            title: `${quote(form.submitText || 'Form', 30)} on ${pathOf(p.url)} accepts empty required fields`,
            desc: `All required fields (${required.map(fieldName).join(', ')}) were left empty and the form was submitted.`,
            recommendation: 'Validate required fields on the server and in the browser (required attribute or JS) and show an error for each empty field.',
          });
        }
        // 2. Invalid email
        for (const f of visible.filter((x) => kinds.get(x.selector) === 'email').slice(0, 1)) {
          await expectReject({
            label: 'Invalid email', module: 'FORM', field: f, category: 'Invalid email accepted', severity: 'MEDIUM',
            override: new Map([[f.selector, 'not-an-email']]), input: { [fieldName(f)]: 'not-an-email' },
            title: `${quote(fieldName(f), 30)} on ${pathOf(p.url)} accepts an invalid email address`,
            desc: `The email field was filled with "not-an-email" (no @ or domain); every other field had valid test data.`,
            recommendation: 'Use type="email" and validate the address format on the server; show "Enter a valid email address".',
          });
        }
        // 3. Invalid phone
        for (const f of visible.filter((x) => kinds.get(x.selector) === 'phone').slice(0, 1)) {
          await expectReject({
            label: 'Letters in phone number', module: 'FORM', field: f, category: 'Invalid phone accepted', severity: 'MEDIUM',
            override: new Map([[f.selector, 'abcdefghij']]), input: { [fieldName(f)]: 'abcdefghij' },
            title: `${quote(fieldName(f), 30)} on ${pathOf(p.url)} accepts letters as a phone number`,
            desc: 'The phone field was filled with "abcdefghij"; every other field had valid test data.',
            recommendation: 'Validate phone numbers (digits, spaces, +, -, parentheses) on the server and use type="tel" with a pattern in the browser.',
          });
        }
        // 4. Number bounds
        for (const f of visible.filter((x) => kinds.get(x.selector) === 'number' && x.max !== null && x.max !== '').slice(0, 1)) {
          const over = String(Number(f.max) + 1);
          await expectReject({
            label: 'Number above maximum', module: 'FORM', field: f, category: 'Out-of-range number accepted', severity: 'MEDIUM',
            override: new Map([[f.selector, over]]), input: { [fieldName(f)]: over },
            title: `${quote(fieldName(f), 30)} accepts ${over} although its maximum is ${f.max}`, desc: `The number field declares max=${f.max}; ${over} was entered.`,
            recommendation: 'Enforce the range on the server as well as with min/max attributes.',
          });
        }
        // 5. Password rules (sign-up / change-password forms)
        if (isSignup) {
          // Change-password forms: the rules apply to the NEW password, not "current password".
          const pwText = (f: FieldInfo) => `${f.name} ${f.id} ${f.label} ${f.placeholder} ${f.autocomplete}`;
          const pw = passwords.find((f) => /new/i.test(pwText(f))) ?? passwords.find((f) => !/current|old|existing/i.test(pwText(f))) ?? passwords[0]!;
          const confirm = visible.find((f) => kinds.get(f.selector) === 'confirm');
          const rulesShown = !!(pw.minLength || pw.pattern || /(at least|minimum|min\.?)\s*\d+|\d+\+?\s*(characters|chars)|upper ?case|lower ?case|number|digit|symbol|special character/i.test(`${pw.describedBy} ${form.text}`));
          if (!rulesShown) {
            const { page } = await openFormPage(bctx, p.url, target);
            await report(ctx, {
              module: 'PASSWORD', category: 'Password rules not shown', severity: 'LOW', classification: 'CONFIRMED', testName: `Password requirements — ${formName}`, pageRec: p, page, target: page.locator(pw.selector).first(),
              title: `No password requirements are shown on ${pathOf(p.url)}`, description: 'The password field has no visible hint, minlength or pattern describing what makes a valid password.',
              expected: 'Requirements (length, character types) are shown before the user submits.', actual: 'No requirements are displayed or declared.',
              steps: [`Open ${p.url}`, ...(opener ? [`Click ${quote(opener.text)}`] : []), 'Look at the password field'], signals: { minLength: pw.minLength, pattern: pw.pattern, describedBy: pw.describedBy }, groupKey: `${sig}|pw-rules`,
              element: { type: 'input', selector: pw.selector, text: fieldName(pw) }, recommendation: 'Show the password rules next to the field (and enforce them on the server).',
            });
            await page.close();
          }
          const weak = new Map<string, string | null>([[pw.selector, '123']]);
          if (confirm) weak.set(confirm.selector, '123');
          await expectReject({
            label: 'Weak password', module: 'PASSWORD', field: pw, category: 'Weak password accepted', severity: 'HIGH', override: weak, input: { [fieldName(pw)]: '123' },
            title: `Weak password "123" is accepted on ${pathOf(p.url)}`, desc: 'A three-character numeric password ("123") was entered (and confirmed); other fields had valid test data.',
            recommendation: 'Enforce a minimum length (≥ 8–12) and check against common/breached passwords on the server.',
          });
          if (confirm) {
            await expectReject({
              label: 'Password confirmation mismatch', module: 'PASSWORD', field: confirm, category: 'Password mismatch not detected', severity: 'HIGH',
              override: new Map([[pw.selector, STRONG_PASSWORD], [confirm.selector, 'Different#2026pass']]), input: { [fieldName(pw)]: STRONG_PASSWORD, [fieldName(confirm)]: 'Different#2026pass' },
              title: `Password confirmation mismatch is not detected on ${pathOf(p.url)}`, desc: 'The password and confirmation fields were given two different strong passwords.',
              recommendation: 'Compare the two fields on the server (and in the browser) and show "Passwords do not match".',
            });
          }
        }
        // 6. Valid submission — only where data-changing requests are allowed (non-production), never for account forms.
        if (accountForm) {
          await pass(ctx, { module: 'FORM', name: `Valid submission — ${formName}`, pageId: p.id, status: 'BLOCKED', observations: { reason: `Changes the signed-in test account ("${role}") — never submitted` } });
        } else if (ctx.s.environment !== 'PRODUCTION') {
          const { page, obs, verdict } = await scenario('Valid data', new Map());
          try {
            if (obs.submitted && (obs.status ?? 0) >= 500) {
              await report(ctx, {
                module: modulePw === 'PASSWORD' ? 'FORM' : 'FORM', category: 'Form submission fails', severity: 'HIGH', classification: 'CONFIRMED', testName: `Valid submission — ${formName}`, pageRec: p, page,
                title: `Submitting ${quote(form.submitText || 'the form', 30)} with valid data fails (HTTP ${obs.status})`, description: 'The form was filled with valid test data and submitted; the server answered with an error.',
                expected: 'The submission succeeds with a confirmation.', actual: `HTTP ${obs.status}`, steps: steps('using only valid values'), signals: { verdict, ...obs }, groupKey: `${sig}|valid`,
                recommendation: 'Check the server logs for this endpoint and fix the error.',
              });
            } else {
              await pass(ctx, { module: 'FORM', name: `Valid submission — ${formName}`, pageId: p.id, status: verdict === 'accepted' || verdict === 'rejected-server' || verdict === 'rejected-client' ? 'PASSED' : 'BLOCKED', observations: { verdict, ...obs } });
            }
          } finally {
            await page.close();
          }
        }
        await ctx.stage('forms', `Tested form ${quote(form.submitText || 'form', 30)} on ${pathOf(p.url)}`, { forms: seen.size });
      }
    }
  } finally {
    await bctx.close().catch(() => undefined);
  }
}

export type { BrowserContext };
