import {
  AlignHorizontalJustifyCenter,
  FormInput,
  KeyRound,
  Link2,
  Monitor,
  MousePointerClick,
  Smartphone,
  Tablet,
  Route,
  TerminalSquare,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { AuthType, DeviceClass, Environment, ModuleId, ViewportId } from './types';

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  short: string;
  description: string;
  checks: string[];
  icon: LucideIcon;
}

export const MODULES: ModuleInfo[] = [
  {
    id: 'UI_LAYOUT',
    name: 'UI & alignment',
    short: 'UI',
    description: 'Detects overlapping, misaligned and clipped elements, inconsistent spacing and broken images.',
    checks: ['Element overlap & clipping', 'Alignment and spacing consistency', 'Broken or distorted images'],
    icon: AlignHorizontalJustifyCenter,
  },
  {
    id: 'RESPONSIVE',
    name: 'Responsive',
    short: 'Responsive',
    description: 'Renders every page on desktop, tablet and mobile viewports and looks for layout breakage.',
    checks: ['Horizontal overflow', 'Viewport-only overlap', 'Touch target size'],
    icon: Smartphone,
  },
  {
    id: 'BUTTON',
    name: 'Buttons & links',
    short: 'Buttons',
    description: 'Clicks every safe button and link and verifies that something observable happens.',
    checks: ['Dead buttons (no effect)', 'Broken links (4xx/5xx)', 'Missing anchors'],
    icon: MousePointerClick,
  },
  {
    id: 'NAVIGATION',
    name: 'Navigation',
    short: 'Navigation',
    description: 'Follows menus, dropdowns and SPA routes to verify that navigation reaches the right page.',
    checks: ['Wrong redirects & redirect loops', 'Soft 404 pages', 'Menu & dropdown reachability'],
    icon: Route,
  },
  {
    id: 'FORM',
    name: 'Form validation',
    short: 'Forms',
    description: 'Submits valid and invalid input to verify required fields, formats and error messages.',
    checks: ['Invalid email/phone accepted', 'Required field enforcement', 'Error message visibility'],
    icon: FormInput,
  },
  {
    id: 'PASSWORD',
    name: 'Password security',
    short: 'Passwords',
    description: 'Checks sign-up and change-password flows for weak-password acceptance and missing rules.',
    checks: ['Weak passwords accepted', 'Password rules shown', 'Confirmation mismatch'],
    icon: KeyRound,
  },
  {
    id: 'FUNCTIONAL',
    name: 'Functional',
    short: 'Functional',
    description: 'Exercises end-to-end user journeys such as search, add-to-cart and checkout.',
    checks: ['Core user journeys', 'State changes after actions', 'Logged-in role access'],
    icon: Workflow,
  },
  {
    id: 'CONSOLE_NETWORK',
    name: 'Console & network errors',
    short: 'Console',
    description: 'Captures JavaScript exceptions, console errors and failed network requests on every page.',
    checks: ['Uncaught JS exceptions', 'Failed requests (4xx/5xx)', 'Mixed content'],
    icon: TerminalSquare,
  },
];

export const moduleInfo = (id: ModuleId): ModuleInfo => MODULES.find((m) => m.id === id) ?? MODULES[0]!;
export const ALL_MODULES = MODULES.map((m) => m.id);

export const VIEWPORTS: Array<{ id: ViewportId; label: string; size: string; device: DeviceClass; icon: LucideIcon }> = [
  { id: 'desktop-1920', label: 'Desktop large', size: '1920 × 1080', device: 'DESKTOP', icon: Monitor },
  { id: 'desktop-1280', label: 'Desktop', size: '1280 × 800', device: 'DESKTOP', icon: Monitor },
  { id: 'tablet-768', label: 'Tablet', size: '768 × 1024', device: 'TABLET', icon: Tablet },
  { id: 'mobile-375', label: 'Mobile', size: '375 × 812', device: 'MOBILE', icon: Smartphone },
];

export const ENVIRONMENT_INFO: Record<Environment, { label: string; description: string }> = {
  PRODUCTION: { label: 'Production', description: 'Live site. Mutating actions always require approval.' },
  STAGING: { label: 'Staging', description: 'Pre-release copy of production. Recommended.' },
  TEST: { label: 'Test / QA', description: 'Dedicated QA environment with test data.' },
  LOCAL: { label: 'Local', description: 'Running on your machine, e.g. localhost.' },
};

export const AUTH_INFO: Record<AuthType, { label: string; description: string; icon: LucideIcon }> = {
  NONE: { label: 'No login', description: 'Test public pages only.', icon: Link2 },
  FORM: { label: 'Login form', description: 'Username & password on a sign-in page. One account per role.', icon: FormInput },
  BASIC: { label: 'HTTP Basic auth', description: 'Browser-level username & password prompt.', icon: KeyRound },
  TOKEN: { label: 'Token / header', description: 'Bearer token or API key sent as a request header.', icon: TerminalSquare },
};
