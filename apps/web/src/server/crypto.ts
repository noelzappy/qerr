// AES-256-GCM for secrets stored in the database (Buffer keys, AI keys).
//
// Stored form: 'v<keyVersion>.<nonce base64>.<ciphertext+tag base64>'. A fresh 12-byte nonce is drawn for every value.
// The key version lets a new key be introduced: new values use the current version, old values still open with their
// own version's key until they are re-saved. Errors never contain the plaintext, the key or the stored value.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface Keyring {
  currentVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

function decodeKey(value: string | Buffer): Buffer {
  const key = typeof value === 'string' ? Buffer.from(value.trim(), 'base64') : value;
  if (key.length !== KEY_BYTES) throw new CryptoError(`An encryption key must be ${KEY_BYTES} bytes (base64 of 32 random bytes)`);
  return key;
}

// current: the key new values are encrypted with; old: keys that earlier values may still use.
export function createKeyring(current: { version: number; key: string | Buffer }, old: Array<{ version: number; key: string | Buffer }> = []): Keyring {
  const keys = new Map<number, Buffer>();
  for (const entry of [...old, current]) {
    if (!Number.isInteger(entry.version) || entry.version < 1) throw new CryptoError('A key version must be a whole number from 1');
    if (keys.has(entry.version)) throw new CryptoError(`Key version ${entry.version} is listed twice`);
    keys.set(entry.version, decodeKey(entry.key));
  }
  return { currentVersion: current.version, keys };
}

// APP_ENCRYPTION_KEY_OLD is 'version:base64,version:base64'.
export function parseOldKeys(value: string | undefined): Array<{ version: number; key: string }> {
  if (!value?.trim()) return [];
  return value.split(',').map((part) => {
    const [version, key] = part.trim().split(':');
    if (!version || !key || !/^\d+$/.test(version)) throw new CryptoError('APP_ENCRYPTION_KEY_OLD must look like 1:base64key,2:base64key');
    return { version: Number(version), key };
  });
}

export function encrypt(plain: string, keyring: Keyring): string {
  const key = keyring.keys.get(keyring.currentVersion);
  if (!key) throw new CryptoError('The current encryption key is not in the key ring');
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `v${keyring.currentVersion}.${nonce.toString('base64')}.${body.toString('base64')}`;
}

const FORMAT = /^v(\d+)\.([A-Za-z0-9+/]+={0,2})\.([A-Za-z0-9+/]+={0,2})$/;

function parse(stored: string): { version: number; nonce: Buffer; body: Buffer } {
  const m = FORMAT.exec(stored);
  if (!m) throw new CryptoError('The stored secret is not in a readable format');
  const nonce = Buffer.from(m[2]!, 'base64');
  const body = Buffer.from(m[3]!, 'base64');
  if (nonce.length !== NONCE_BYTES || body.length < TAG_BYTES) throw new CryptoError('The stored secret is not in a readable format');
  return { version: Number(m[1]), nonce, body };
}

// The key version a stored value was encrypted with (null when it cannot be read).
export function keyVersionOf(stored: string): number | null {
  const m = FORMAT.exec(stored);
  return m ? Number(m[1]) : null;
}

export function decrypt(stored: string, keyring: Keyring): string {
  const { version, nonce, body } = parse(stored);
  const key = keyring.keys.get(version);
  if (!key) throw new CryptoError(`No encryption key for version ${version}; the key may have been removed`);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
    return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString('utf8');
  } catch {
    throw new CryptoError('The stored secret could not be decrypted: it was changed, or the encryption key is wrong');
  }
}

// True when the value was written with an older key than the current one and should be re-saved.
export const needsRotation = (stored: string, keyring: Keyring): boolean => keyVersionOf(stored) !== keyring.currentVersion;

// What the pages may show of a secret. Short secrets show nothing, so the last four never give away half of one.
export function last4(plain: string): string {
  const s = plain.trim();
  return s.length >= 12 ? s.slice(-4) : '****';
}
