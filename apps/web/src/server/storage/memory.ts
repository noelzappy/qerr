// An in-memory driver for tests: no disk, no network. presignGet returns a recognisable fake URL.
import { assertSafeKey, StorageError, type Storage } from './types.js';

export function createMemoryStorage(options: { prefix?: string; publicBaseUrl?: string } = {}): Storage & { objects: Map<string, { body: Buffer; contentType: string }> } {
  const prefix = options.prefix ?? 'public/';
  const publicBaseUrl = (options.publicBaseUrl ?? 'https://storage.test/bucket').replace(/\/+$/, '');
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    kind: 'memory',
    objects,
    publicConfig: { prefix, publicBaseUrl },
    async putObject(key, body, contentType) {
      assertSafeKey(key);
      objects.set(key, { body: Buffer.from(body), contentType });
    },
    async headObject(key) {
      const o = objects.get(key);
      return o ? { exists: true, size: o.body.length, contentType: o.contentType } : { exists: false };
    },
    async getObject(key) {
      const o = objects.get(key);
      if (!o) throw new StorageError('Object not found', 'not_found');
      return Buffer.from(o.body);
    },
    async deleteObject(key) {
      objects.delete(key);
    },
    async presignGet(key, ttlSeconds) {
      assertSafeKey(key);
      return `${publicBaseUrl}/${key}?signed=1&ttl=${ttlSeconds}`;
    },
    publicUrl(key) {
      assertSafeKey(key);
      return `${publicBaseUrl}/${key}`;
    },
  };
}
