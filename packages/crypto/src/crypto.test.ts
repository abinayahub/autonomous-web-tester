import { describe, expect, it } from 'vitest';
import {
  createKeyRing,
  decryptSecret,
  encryptSecret,
  generateKeyHex,
  isHostAllowed,
  isUrlAllowed,
  isValidDomainPattern,
  maskObject,
  maskText,
  MASK,
} from './index.js';

describe('credential vault (AES-256-GCM)', () => {
  const ring = createKeyRing(1, { 1: generateKeyHex() });

  it('round-trips a secret', () => {
    const enc = encryptSecret(ring, 'S3cret!pass', 'credential:abc:password');
    expect(enc.ciphertext.toString('utf8')).not.toContain('S3cret');
    expect(decryptSecret(ring, enc, 'credential:abc:password')).toBe('S3cret!pass');
  });

  it('uses a fresh IV every time', () => {
    const a = encryptSecret(ring, 'same', 'ctx');
    const b = encryptSecret(ring, 'same', 'ctx');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('rejects a ciphertext moved to another context (AAD binding)', () => {
    const enc = encryptSecret(ring, 'secret', 'credential:A:password');
    expect(() => decryptSecret(ring, enc, 'credential:B:password')).toThrow();
  });

  it('rejects tampered ciphertext', () => {
    const enc = encryptSecret(ring, 'secret', 'ctx');
    enc.ciphertext[0] = enc.ciphertext[0]! ^ 0xff;
    expect(() => decryptSecret(ring, enc, 'ctx')).toThrow();
  });

  it('supports key rotation', () => {
    const k1 = generateKeyHex();
    const old = createKeyRing(1, { 1: k1 });
    const enc = encryptSecret(old, 'legacy', 'ctx');
    const rotated = createKeyRing(2, { 1: k1, 2: generateKeyHex() });
    expect(decryptSecret(rotated, enc, 'ctx')).toBe('legacy');
    expect(encryptSecret(rotated, 'new', 'ctx').keyVersion).toBe(2);
  });
});

describe('sensitive-data masking', () => {
  it('masks known secrets and token shapes', () => {
    const out = maskText('login with hunter22 and Bearer abc.def.ghi ?token=xyz&x=1', { secrets: ['hunter22'] });
    expect(out).not.toContain('hunter22');
    expect(out).not.toContain('abc.def.ghi');
    expect(out).not.toContain('xyz');
    expect(out).toContain('x=1');
  });

  it('masks sensitive keys deeply', () => {
    const out = maskObject({ user: 'qa@test.com', password: 'p', nested: { apiKey: 'k', list: [{ token: 't' }] } });
    expect(out).toEqual({ user: 'qa@test.com', password: MASK, nested: { apiKey: MASK, list: [{ token: MASK }] } });
  });
});

describe('authorized-domain guard', () => {
  const allowed = ['example.com', '*.app.example.com', 'localhost'];
  it('allows exact and wildcard hosts', () => {
    expect(isHostAllowed('EXAMPLE.com', allowed)).toBe(true);
    expect(isHostAllowed('a.app.example.com', allowed)).toBe(true);
    expect(isUrlAllowed('http://localhost:4500/x', allowed)).toBe(true);
  });
  it('blocks look-alikes and other domains', () => {
    expect(isHostAllowed('evil-example.com', allowed)).toBe(false);
    expect(isHostAllowed('example.com.evil.io', allowed)).toBe(false);
    expect(isHostAllowed('app.example.com', allowed)).toBe(false); // wildcard = sub-domains only
    expect(isUrlAllowed('javascript:alert(1)', allowed)).toBe(false);
    expect(isUrlAllowed('https://user:pw@example.com/', allowed)).toBe(false);
  });
  it('validates patterns', () => {
    expect(isValidDomainPattern('*.example.com')).toBe(true);
    expect(isValidDomainPattern('localhost')).toBe(true);
    expect(isValidDomainPattern('http://example.com')).toBe(false);
    expect(isValidDomainPattern('*')).toBe(false);
  });
});
