import { isHostAllowed } from '@awt/crypto';

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|msclkid|mc_[a-z]+|_ga|ref)$/i;

/**
 * Canonical form used for de-duplication: http(s) only, no fragment, lower-case host, no default port,
 * tracking parameters removed, remaining parameters sorted, trailing slash removed (except the root).
 */
export function normalizeUrl(raw: string, base?: string): string | undefined {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  u.hash = '';
  u.username = '';
  u.password = '';
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.href;
}

export interface Scope {
  allowedHosts: string[];
  excludedPaths: string[];
}

/** True if the URL belongs to the authorized site and is not excluded. */
export function inScope(url: string, scope: Scope): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (!isHostAllowed(u.hostname, scope.allowedHosts)) return false;
  return !scope.excludedPaths.some((p) => p && (u.pathname === p || u.pathname.startsWith(p.endsWith('/') ? p : `${p}/`)));
}

/** Files that are not web pages — links to them are checked but not crawled as pages. */
export const NON_PAGE = /\.(pdf|zip|gz|rar|7z|exe|dmg|msi|apk|jpe?g|png|gif|webp|svg|ico|mp4|mp3|wav|avi|mov|webm|docx?|xlsx?|pptx?|csv|xml|json|txt|woff2?|ttf|css|js)$/i;

/** Human-friendly page name from a URL path: "/products/laptops" → "Products / Laptops". */
export function pageNameFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    if (!p) return 'Home';
    return p.split('/').filter(Boolean).map((s) => decodeURIComponent(s).replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())).join(' / ');
  } catch {
    return url;
  }
}

export const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
};
