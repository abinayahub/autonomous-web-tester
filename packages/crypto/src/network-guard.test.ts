import { beforeEach, describe, expect, it } from 'vitest';
import { checkUrlSafety, clearNetworkGuardCache, isPrivateAddress, parseAllowPrivate } from './network-guard.js';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.18.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1',
    '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2001:db8::1', 'ff02::1', 'not-an-ip',
  ])('blocks %s', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) =>
    expect(isPrivateAddress(ip)).toBe(false));
});

describe('checkUrlSafety', () => {
  beforeEach(() => clearNetworkGuardCache());
  const dns = (map: Record<string, string[]>) => async (h: string) => {
    if (!map[h]) throw Object.assign(new Error('nx'), { code: 'ENOTFOUND' });
    return map[h]!;
  };

  it('rejects bad schemes, credentials, metadata and internal names', async () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com', 'http://user:pw@example.com', 'http://metadata.google.internal/', 'http://localhost/', 'http://printer.local/']) {
      expect((await checkUrlSafety(u, {}, dns({}))).ok).toBe(false);
    }
  });
  it('rejects IP literals in private ranges (incl. decimal-free IPv6 forms)', async () => {
    for (const u of ['http://169.254.169.254/latest/meta-data', 'http://[::1]:8080/', 'http://10.0.0.5/', 'http://[::ffff:127.0.0.1]/']) {
      expect(await checkUrlSafety(u, {}, dns({}))).toMatchObject({ ok: false });
    }
  });
  it('rejects hostnames that resolve to any private address (DNS rebinding style)', async () => {
    const r = await checkUrlSafety('https://evil.example/', {}, dns({ 'evil.example': ['93.184.216.34', '127.0.0.1'] }));
    expect(r).toMatchObject({ ok: false });
  });
  it('allows public hosts', async () => {
    expect(await checkUrlSafety('https://shop.example/', {}, dns({ 'shop.example': ['93.184.216.34'] }))).toEqual({ ok: true, addresses: ['93.184.216.34'] });
  });
  it('allow-list exception is exact host:port only', async () => {
    const policy = { allowPrivate: parseAllowPrivate(' localhost:4500 ') };
    const local = dns({ localhost: ['127.0.0.1'] });
    expect((await checkUrlSafety('http://localhost:4500/x', policy, local)).ok).toBe(true);
    expect((await checkUrlSafety('http://localhost:4000/api', policy, local)).ok).toBe(false);
    expect((await checkUrlSafety('http://127.0.0.1:4500/', policy, local)).ok).toBe(false);
  });
});
