// A directory on disk. For local development and tests that need real files. Never used in production.
//
// Private reads go through signed app URLs: /api/_local-storage/<key>?exp=<unix seconds>&sig=<hmac>.
// Public reads (keys under the public prefix) go through /_local-public/<key>, which has no signature, like a public bucket.
import { createHmac, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertSafeKey, StorageError, type Storage } from './types.js';

export interface LocalStorage extends Storage {
  kind: 'local';
  // Checks a signed URL's parts; true only for an unexpired, untampered one.
  verify(key: string, exp: number, sig: string): boolean;
  isPublicKey(key: string): boolean;
}

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

export function createLocalStorage(options: { dir: string; appUrl: string; secret: string; prefix?: string; now?: () => Date }): LocalStorage {
  const root = path.resolve(options.dir);
  const prefix = options.prefix ?? 'public/';
  const appUrl = options.appUrl.replace(/\/+$/, '');
  const now = options.now ?? (() => new Date());

  const fileOf = (key: string): string => {
    assertSafeKey(key);
    if (key.endsWith('.__type')) throw new StorageError('The storage key is not valid', 'invalid_key');
    const file = path.join(root, ...key.split('/'));
    if (!file.startsWith(root + path.sep)) throw new StorageError('The storage key is not valid', 'invalid_key');
    return file;
  };
  const sign = (key: string, exp: number) => createHmac('sha256', options.secret).update(`local-storage\n${key}\n${exp}`).digest('base64url');

  return {
    kind: 'local',
    publicConfig: { prefix, publicBaseUrl: `${appUrl}/_local-public` },
    async putObject(key, body, contentType) {
      const file = fileOf(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, body);
      await fs.writeFile(`${file}.__type`, contentType);
    },
    async headObject(key) {
      const file = fileOf(key);
      try {
        const stat = await fs.stat(file);
        const contentType = await fs.readFile(`${file}.__type`, 'utf8').catch(() => 'application/octet-stream');
        return { exists: true, size: stat.size, contentType };
      } catch {
        return { exists: false };
      }
    },
    async getObject(key) {
      try {
        return await fs.readFile(fileOf(key));
      } catch (e) {
        if (e instanceof StorageError) throw e;
        throw new StorageError('Object not found', 'not_found');
      }
    },
    async deleteObject(key) {
      const file = fileOf(key);
      await fs.rm(file, { force: true });
      await fs.rm(`${file}.__type`, { force: true });
    },
    async presignGet(key, ttlSeconds) {
      assertSafeKey(key);
      const exp = Math.floor(now().getTime() / 1000) + ttlSeconds;
      return `${appUrl}/api/_local-storage/${encodeKey(key)}?exp=${exp}&sig=${sign(key, exp)}`;
    },
    publicUrl(key) {
      assertSafeKey(key);
      return `${appUrl}/_local-public/${encodeKey(key)}`;
    },
    verify(key, exp, sig) {
      if (!Number.isFinite(exp) || exp * 1000 < now().getTime()) return false;
      const expected = Buffer.from(sign(key, exp));
      const given = Buffer.from(sig);
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
    isPublicKey: (key) => key.startsWith(prefix),
  };
}
