import { randomBytes } from 'node:crypto';

// The storage interface the app uses. Drivers: s3 (Hetzner Object Storage), local (a directory) and memory (tests).
export interface StoredObjectInfo {
  exists: boolean;
  size?: number;
  contentType?: string;
}

export interface Storage {
  kind: 'local' | 's3' | 'memory';
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  headObject(key: string): Promise<StoredObjectInfo>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  // A short-lived URL a browser can read a private object from.
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  // The permanent URL of an object under the public prefix (what Buffer is given).
  publicUrl(key: string): string;
  publicConfig: { prefix: string; publicBaseUrl: string };
}

// Private objects (vault/, renders/) sit in a bucket that is publicly readable, so their URL is the only protection:
// a 32-byte random segment (43 base64url characters) is part of every new key, drawn per object at write time. The key
// is stored in the database, so nothing needs to derive it. Keys written before this have no such segment and still work.
export function privateKey(area: 'vault' | 'renders' | 'brand', ...rest: string[]): string {
  return [area, randomBytes(32).toString('base64url'), ...rest].join('/');
}

export class StorageError extends Error {
  constructor(message: string, public code: 'not_found' | 'invalid_key' | 'unavailable' = 'unavailable') {
    super(message);
    this.name = 'StorageError';
  }
}

// Keys are relative, use '/' and never climb out of the area they sit in.
export function assertSafeKey(key: string): void {
  if (!key || key.length > 1024 || key.startsWith('/') || key.includes('\\') || key.includes('\0') || key.split('/').some((p) => p === '' || p === '.' || p === '..')) {
    throw new StorageError('The storage key is not valid', 'invalid_key');
  }
}
