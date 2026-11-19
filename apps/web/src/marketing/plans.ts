/**
 * Subscription plans shown on the landing and pricing pages.
 *
 * Prices and limits are deliberately left unset (`null`) until they are decided — the page then shows
 * "To be announced" / "Set at launch" instead of a number. To publish real values, fill them in here;
 * nothing else needs to change.
 */

export type Billing = 'monthly' | 'yearly';

export interface PlanLimit {
  label: string;
  /** null = not decided yet. Use Infinity for "Unlimited". */
  value: number | null;
  unit?: string;
  /** Optional wording that replaces the formatted value. */
  text?: string;
}

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  /** Price per month in `currency`. null = to be announced. 0 = free. */
  price: { monthly: number | null; yearly: number | null };
  status: 'available' | 'launch';
  highlighted?: boolean;
  limits: PlanLimit[];
  features: string[];
  cta: { label: string; to: string; signedInLabel?: string; signedInTo?: string };
}

export const PRICING = {
  currency: 'USD',
  /** Shown on the "Yearly" toggle, e.g. "Save 20%". null hides the badge. */
  yearlyBadge: null as string | null,
};

const limits = (pages: number | null, projects: number | null, runs: number | null, seats: number | null): PlanLimit[] => [
  { label: 'Pages per run', value: pages },
  { label: 'Projects', value: projects },
  { label: 'Test runs', value: runs, unit: '/ month' },
  { label: 'Team seats', value: seats },
];

export const PLANS: Plan[] = [
  {
    id: 'early',
    name: 'Early access',
    tagline: 'Explore the full workspace while the testing engine is in development.',
    price: { monthly: 0, yearly: 0 },
    status: 'available',
    limits: [
      { label: 'Automated runs', value: null, text: 'Not available yet' },
      { label: 'Payment details', value: null, text: 'Not required' },
    ],
    features: ['Add websites with a live reachability check', 'Configure checks, viewports and test accounts', 'Interactive demo with sample results'],
    cta: { label: 'Create free account', to: '/signup', signedInLabel: 'Open your dashboard', signedInTo: '/dashboard' },
  },
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For a single website and an individual developer.',
    price: { monthly: null, yearly: null },
    status: 'launch',
    limits: limits(null, null, null, null),
    features: ['Automated test runs', 'Screenshot evidence', 'Issue reports with reproduction steps'],
    cta: { label: 'Join early access', to: '/signup' },
  },
  {
    id: 'team',
    name: 'Team',
    tagline: 'For product teams testing several websites together.',
    price: { monthly: null, yearly: null },
    status: 'launch',
    highlighted: true,
    limits: limits(null, null, null, null),
    features: ['Everything in Starter', 'Shared projects and issues', 'Logged-in testing with test accounts', 'PDF & Excel report export (planned)'],
    cta: { label: 'Join early access', to: '/signup' },
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'For agencies and organisations with many sites.',
    price: { monthly: null, yearly: null },
    status: 'launch',
    limits: limits(null, null, null, null),
    features: ['Everything in Team', 'Higher usage limits', 'Priority support'],
    cta: { label: 'Talk to us', to: '/contact?topic=business' },
  },
];

export function formatLimit(l: PlanLimit) {
  if (l.text) return l.text;
  if (l.value === null) return 'Set at launch';
  if (l.value === Infinity) return 'Unlimited';
  return `${l.value.toLocaleString()}${l.unit ? ` ${l.unit}` : ''}`;
}
