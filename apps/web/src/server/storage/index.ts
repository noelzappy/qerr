import { createHmac } from 'node:crypto';
import path from 'node:path';
import type { AppConfig } from '../config.js';
import { appRoot } from '../engine/root.js';
import { createLocalStorage } from './local.js';
import { createS3Storage } from './s3.js';
import type { Storage } from './types.js';

export * from './types.js';

export async function createStorage(config: AppConfig, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<Storage> {
  if (config.storageDriver === 's3') return createS3Storage(config.s3Env, fetchImpl, now);
  // The signing secret is derived, not the auth secret itself.
  const secret = createHmac('sha256', config.authSecret).update('local-storage-signing').digest('base64');
  const dir = path.resolve(appRoot() ?? process.cwd(), config.localStorageDir);
  const prefix = config.s3Env.S3_PREFIX?.replace(/^\/+/, '').replace(/\/?$/, '/') || 'public/';
  return createLocalStorage({ dir, appUrl: config.appUrl, secret, prefix, now });
}
