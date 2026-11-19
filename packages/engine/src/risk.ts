/**
 * Risk classification for interactive elements and forms. Destructive or financial actions are never performed;
 * the engine records them as BLOCKED test cases (not issues).
 */
export type Risk = 'SAFE' | 'MUTATING' | 'DESTRUCTIVE';

const DESTRUCTIVE = /\b(delete|remove|destroy|erase|deactivate|close (my )?account|cancel (my )?(account|subscription|order|plan|membership)|terminate|revoke|wipe|purge|discard|reset (all|data|account))\b/i;
const FINANCIAL = /\b(pay|payment|purchase|buy( now)?|check ?out|place (an )?order|confirm (order|purchase|payment)|complete (order|purchase)|donate|transfer|send money|withdraw|add (a )?card|upgrade (now|plan)|start (paid )?subscription)\b/i;
const SESSION = /\b(log ?out|sign ?out|log off|sign off)\b/i;
const MUTATING = /\b(save|submit|send|post|publish|create|add|update|apply|confirm|approve|reject|invite|share|subscribe|register|sign ?up|upload|import|export|book|reserve|order)\b/i;

export function classifyAction(label: string, extra = ''): { risk: Risk; reason?: string } {
  const t = `${label} ${extra}`.replace(/\s+/g, ' ').trim();
  if (DESTRUCTIVE.test(t)) return { risk: 'DESTRUCTIVE', reason: `Destructive action ("${t.match(DESTRUCTIVE)![0]}") — never performed` };
  if (FINANCIAL.test(t)) return { risk: 'DESTRUCTIVE', reason: `Financial action ("${t.match(FINANCIAL)![0]}") — never performed` };
  if (SESSION.test(t)) return { risk: 'DESTRUCTIVE', reason: 'Ends the session — not clicked during testing' };
  if (MUTATING.test(t)) return { risk: 'MUTATING', reason: `May change data ("${t.match(MUTATING)![0]}")` };
  return { risk: 'SAFE' };
}

const PAYMENT_FIELD = /\b(cc-|card|cvv|cvc|iban|account.?number|routing|sort.?code|expir|security.?code)/i;

export function isPaymentField(f: { name: string; autocomplete: string; label: string; id: string }): boolean {
  return PAYMENT_FIELD.test(`${f.name} ${f.autocomplete} ${f.label} ${f.id}`);
}
