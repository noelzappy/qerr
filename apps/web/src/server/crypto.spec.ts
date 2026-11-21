import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoError, createKeyring, decrypt, encrypt, keyVersionOf, last4, needsRotation, parseOldKeys } from './crypto.js';

const k1 = randomBytes(32).toString('base64');
const k2 = randomBytes(32).toString('base64');
const ring1 = createKeyring({ version: 1, key: k1 });

describe('encrypt and decrypt', () => {
  it('round-trips text, including empty and non-ASCII values', () => {
    for (const plain of ['sk-live-abcdefghijklmnop', '', 'the region ₵ éè \u{1F600}', 'x'.repeat(10_000)]) {
      expect(decrypt(encrypt(plain, ring1), ring1)).toBe(plain);
    }
  });

  it('writes v<version>.<nonce>.<ciphertext> with a 12-byte nonce', () => {
    const stored = encrypt('secret-value-1234', ring1);
    const [v, nonce, body] = stored.split('.');
    expect(v).toBe('v1');
    expect(Buffer.from(nonce!, 'base64')).toHaveLength(12);
    expect(Buffer.from(body!, 'base64').length).toBe('secret-value-1234'.length + 16);
    expect(stored).not.toContain('secret-value-1234');
  });

  it('uses a fresh nonce every time, so the same value never encrypts the same way twice', () => {
    const seen = new Set<string>();
    const nonces = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = encrypt('same value', ring1);
      seen.add(s);
      nonces.add(s.split('.')[1]!);
    }
    expect(seen.size).toBe(200);
    expect(nonces.size).toBe(200);
  });

  it('detects a changed ciphertext, nonce or tag', () => {
    const stored = encrypt('secret-value-1234', ring1);
    const [v, nonce, body] = stored.split('.') as [string, string, string];
    const flip = (b64: string, at: number) => {
      const buf = Buffer.from(b64, 'base64');
      buf[at] = buf[at]! ^ 1;
      return buf.toString('base64');
    };
    expect(() => decrypt(`${v}.${nonce}.${flip(body, 0)}`, ring1)).toThrow(CryptoError);
    expect(() => decrypt(`${v}.${nonce}.${flip(body, Buffer.from(body, 'base64').length - 1)}`, ring1)).toThrow(CryptoError);
    expect(() => decrypt(`${v}.${flip(nonce, 3)}.${body}`, ring1)).toThrow(CryptoError);
  });

  it('refuses a value written under another key', () => {
    const stored = encrypt('secret-value-1234', ring1);
    const other = createKeyring({ version: 1, key: k2 });
    expect(() => decrypt(stored, other)).toThrow(/could not be decrypted/);
  });

  it('refuses malformed values', () => {
    for (const bad of ['', 'plain text', 'v1.abc', 'v1..', 'vX.AAAA.AAAA', 'v1.AAAAAAAAAAAAAAAA.AAAA']) {
      expect(() => decrypt(bad, ring1)).toThrow(CryptoError);
    }
  });

  it('never puts the secret, the key or the stored value in an error message', () => {
    const secret = 'sk-live-very-secret-9999';
    const stored = encrypt(secret, ring1);
    const wrong = createKeyring({ version: 1, key: k2 });
    const tampered = `${stored.slice(0, -4)}AAAA`;
    for (const attempt of [() => decrypt(stored, wrong), () => decrypt(tampered, ring1), () => decrypt(`v9.${stored.split('.').slice(1).join('.')}`, ring1)]) {
      let message = '';
      try { attempt(); } catch (e) { message = String((e as Error).message); }
      expect(message).not.toBe('');
      expect(message).not.toContain(secret);
      expect(message).not.toContain(k1);
      expect(message).not.toContain(k2);
      expect(message).not.toContain(stored);
    }
  });
});

describe('key versions and rotation', () => {
  it('opens old values with the old key and writes new values with the current one', () => {
    const old = encrypt('old secret value', ring1);
    const ring2 = createKeyring({ version: 2, key: k2 }, [{ version: 1, key: k1 }]);
    expect(keyVersionOf(old)).toBe(1);
    expect(decrypt(old, ring2)).toBe('old secret value');
    expect(needsRotation(old, ring2)).toBe(true);
    const fresh = encrypt('old secret value', ring2);
    expect(keyVersionOf(fresh)).toBe(2);
    expect(needsRotation(fresh, ring2)).toBe(false);
    expect(decrypt(fresh, ring2)).toBe('old secret value');
  });

  it('says clearly when the key for a version has been removed', () => {
    const old = encrypt('x'.repeat(20), ring1);
    const ring2 = createKeyring({ version: 2, key: k2 });
    expect(() => decrypt(old, ring2)).toThrow(/No encryption key for version 1/);
  });

  it('rejects keys of the wrong length and duplicate versions', () => {
    expect(() => createKeyring({ version: 1, key: Buffer.alloc(16).toString('base64') })).toThrow(/32 bytes/);
    expect(() => createKeyring({ version: 1, key: k1 }, [{ version: 1, key: k2 }])).toThrow(/twice/);
    expect(() => createKeyring({ version: 0, key: k1 })).toThrow(/key version/);
  });

  it('parses the old-key list', () => {
    expect(parseOldKeys(undefined)).toEqual([]);
    expect(parseOldKeys(`1:${k1}, 2:${k2}`)).toEqual([{ version: 1, key: k1 }, { version: 2, key: k2 }]);
    expect(() => parseOldKeys('nonsense')).toThrow(/APP_ENCRYPTION_KEY_OLD/);
  });
});

describe('last4', () => {
  it('shows the last four characters of a long secret', () => {
    expect(last4('sk-abcdefghijklmnop1234')).toBe('1234');
    expect(last4('  abcdefghijkl9876 \n')).toBe('9876');
  });
  it('shows nothing useful for a short secret', () => {
    expect(last4('abc123')).toBe('****');
    expect(last4('')).toBe('****');
  });
});
