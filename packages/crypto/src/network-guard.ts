/**
 * SSRF guard: decides whether the engine (or the API's connectivity check) may contact a URL.
 *
 * Blocks: non-http(s) schemes, embedded credentials, cloud-metadata hostnames, and any host that is — or resolves to —
 * a loopback, private, link-local, CGNAT, multicast, reserved or documentation address (IPv4 and IPv6, incl. IPv4-mapped).
 * Every address a hostname resolves to must be public, so a DNS answer mixing public and private IPs is refused.
 *
 * Local development exception: `allowPrivate` lists exact "host:port" (or "host") entries that may be private,
 * e.g. the bundled Acme Store fixture at "localhost:4500". It is empty unless the operator sets it.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface NetworkPolicy {
  /** Exact "host:port" or "host" entries allowed even though they are private (development fixtures only). */
  allowPrivate?: readonly string[];
}

export type GuardResult = { ok: true; addresses: string[] } | { ok: false; reason: string };

const METADATA_HOSTS = new Set([
  'metadata', 'metadata.google.internal', 'metadata.goog', 'instance-data', 'instance-data.ec2.internal',
  'metadata.azure.com', 'kubernetes.default', 'kubernetes.default.svc',
]);

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
function inV4(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/') as [string, string];
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}
const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24',
  '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
  '224.0.0.0/4', '240.0.0.0/4', '255.255.255.255/32',
];

/** Expands an IPv6 address to 8 hextets. */
function expandV6(ip: string): number[] | undefined {
  let s = ip.toLowerCase().split('%')[0]!;
  // Embedded IPv4 tail (::ffff:1.2.3.4)
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const n = v4ToInt(v4[1]!);
    s = s.slice(0, -v4[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split('::') as [string, string | undefined];
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : [];
  const fill = tail !== undefined ? 8 - h.length - t.length : 0;
  const parts = [...h, ...Array(Math.max(0, fill)).fill('0'), ...t].map((x) => parseInt(x || '0', 16));
  return parts.length === 8 && parts.every((n) => Number.isFinite(n) && n >= 0 && n <= 0xffff) ? parts : undefined;
}

/** True if the IP must never be contacted (not globally routable). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return BLOCKED_V4.some((c) => inV4(ip, c));
  if (kind !== 6) return true; // not an IP at all → refuse
  const p = expandV6(ip);
  if (!p) return true;
  const toV4 = (hi: number, lo: number) => `${hi >>> 8}.${hi & 0xff}.${lo >>> 8}.${lo & 0xff}`;
  if (p.every((x) => x === 0)) return true; // ::
  if (p.slice(0, 7).every((x) => x === 0) && p[7] === 1) return true; // ::1
  if (p.slice(0, 5).every((x) => x === 0) && p[5] === 0xffff) return isPrivateAddress(toV4(p[6]!, p[7]!)); // ::ffff:a.b.c.d
  if (p.slice(0, 6).every((x) => x === 0)) return true; // deprecated IPv4-compatible
  if (p[0] === 0x64 && p[1] === 0xff9b && p.slice(2, 6).every((x) => x === 0)) return isPrivateAddress(toV4(p[6]!, p[7]!)); // NAT64
  if ((p[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((p[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((p[0]! & 0xff00) === 0xff00) return true; // multicast
  if (p[0] === 0x2001 && p[1] === 0x0db8) return true; // documentation
  if (p[0] === 0x2002) return isPrivateAddress(toV4(p[1]!, p[2]!)); // 6to4 wrapping a private v4
  return false;
}

const defaultPort = (u: URL) => u.port || (u.protocol === 'https:' ? '443' : '80');

function privateAllowed(u: URL, policy?: NetworkPolicy): boolean {
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (policy?.allowPrivate ?? []).some((e) => {
    const entry = e.trim().toLowerCase();
    return entry === `${host}:${defaultPort(u)}` || entry === host;
  });
}

/** Parses the operator's allow-list env value, e.g. "localhost:4500, 127.0.0.1:4500". */
export function parseAllowPrivate(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

const cache = new Map<string, { at: number; result: GuardResult }>();
const CACHE_MS = 60_000;

/**
 * Validates scheme + host (resolving DNS). Results are cached for a minute per host:port.
 * `resolve` is injectable for tests.
 */
export async function checkUrlSafety(
  raw: string,
  policy?: NetworkPolicy,
  resolve: (host: string) => Promise<string[]> = async (h) => (await lookup(h, { all: true, verbatim: true })).map((a) => a.address),
): Promise<GuardResult> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'Not a valid URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: `Scheme ${u.protocol} is not allowed` };
  if (u.username || u.password) return { ok: false, reason: 'URLs with embedded credentials are not allowed' };
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return { ok: false, reason: 'Missing host' };
  const allowedPrivate = privateAllowed(u, policy);
  if (!allowedPrivate && (METADATA_HOSTS.has(host) || host.endsWith('.internal') || host.endsWith('.local') || host === 'localhost' || host.endsWith('.localhost'))) {
    return { ok: false, reason: `Host ${host} is an internal or metadata address` };
  }
  const key = `${host}:${defaultPort(u)}:${allowedPrivate ? 'p' : ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  let result: GuardResult;
  if (isIP(host)) {
    result = !allowedPrivate && isPrivateAddress(host) ? { ok: false, reason: `${host} is a private or reserved address` } : { ok: true, addresses: [host] };
  } else {
    try {
      const addrs = await resolve(host);
      if (!addrs.length) result = { ok: false, reason: `${host} did not resolve` };
      else {
        const bad = addrs.find((a) => isPrivateAddress(a));
        result = bad && !allowedPrivate ? { ok: false, reason: `${host} resolves to a private or reserved address (${bad})` } : { ok: true, addresses: addrs };
      }
    } catch (e) {
      result = { ok: false, reason: `DNS lookup failed for ${host}: ${(e as NodeJS.ErrnoException).code ?? (e as Error).message}` };
    }
  }
  cache.set(key, { at: Date.now(), result });
  return result;
}

export function clearNetworkGuardCache() {
  cache.clear();
}
