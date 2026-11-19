/**
 * Authorized-domain restriction. The engine may only navigate to / send requests
 * toward hosts the project owner explicitly authorized.
 *
 * Patterns: "example.com" (exact host), "*.example.com" (sub-domains only).
 */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

export function isHostAllowed(host: string, allowedPatterns: readonly string[]): boolean {
  const h = normalizeHost(host);
  return allowedPatterns.some((raw) => {
    const p = normalizeHost(raw);
    if (p.startsWith('*.')) {
      const base = p.slice(2);
      return h.endsWith(`.${base}`) && h.length > base.length + 1;
    }
    return h === p;
  });
}

export function isUrlAllowed(url: string, allowedPatterns: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password) return false; // no embedded credentials in URLs
  return isHostAllowed(parsed.hostname, allowedPatterns);
}

/** Validates a user-entered allow-list pattern. */
export function isValidDomainPattern(pattern: string): boolean {
  return /^(\*\.)?(localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}|\d{1,3}(?:\.\d{1,3}){3})$/i.test(pattern.trim());
}
