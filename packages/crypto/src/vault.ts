import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // NIST-recommended nonce size for GCM
const TAG_BYTES = 16;

export interface EncryptedValue {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export interface KeyRing {
  /** Version used for new encryptions. */
  current: number;
  /** All known keys by version (supports rotation: old ciphertexts stay decryptable). */
  keys: Map<number, Buffer>;
}

export function parseHexKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('Encryption key must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function createKeyRing(currentVersion: number, keys: Record<number, string>): KeyRing {
  const map = new Map<number, Buffer>();
  for (const [v, hex] of Object.entries(keys)) map.set(Number(v), parseHexKey(hex));
  if (!map.has(currentVersion)) throw new Error(`Key ring has no key for current version ${currentVersion}`);
  return { current: currentVersion, keys: map };
}

/**
 * Encrypts a secret with AES-256-GCM.
 * `context` is bound as Additional Authenticated Data (e.g. "credential:<id>:password"),
 * so a ciphertext copied onto another row fails to decrypt.
 */
export function encryptSecret(ring: KeyRing, plaintext: string, context: string): EncryptedValue {
  const key = ring.keys.get(ring.current)!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: ring.current };
}

export function decryptSecret(ring: KeyRing, value: EncryptedValue, context: string): string {
  const key = ring.keys.get(value.keyVersion);
  if (!key) throw new Error(`No key available for version ${value.keyVersion}`);
  const decipher = createDecipheriv(ALGORITHM, key, value.iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(value.authTag);
  return Buffer.concat([decipher.update(value.ciphertext), decipher.final()]).toString('utf8');
}

export function generateKeyHex(): string {
  return randomBytes(32).toString('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AAD context for a stored test credential; the API (encrypt) and the engine (decrypt) must use the same value. */
export function credentialAad(projectId: string, roleName: string, field: 'username' | 'password'): string {
  return `credential:${projectId}:${roleName.trim().toLowerCase()}:${field}`;
}
