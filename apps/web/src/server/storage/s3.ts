// Hetzner Object Storage (any S3-compatible bucket) through the engine's own client.
// The engine module @qerr/engine/storage/s3 signs requests (SigV4) with node:crypto only; this wrapper adds read and delete
// by reusing its exported signRequest, and signed URLs through @qerr/engine/storage/presign when that module is present.
import { engineHas, engineImport } from '../engine/root.js';
import { StorageError, assertSafeKey, type Storage } from './types.js';

interface S3Config {
  endpoint: string; region: string; bucket: string; publicBaseUrl: string; prefix: string;
  accessKeyId: string; secretAccessKey: string; pathStyle: boolean;
}
interface S3Module {
  loadS3Config(env: Record<string, string | undefined>): S3Config;
  createS3(o: { config: S3Config; fetchImpl?: typeof fetch; now?: () => Date }): {
    objectUrl(key: string): string;
    putObject(key: string, body: Buffer, contentType: string): Promise<unknown>;
    headObject(key: string): Promise<{ exists: boolean; size?: number; contentType?: string }>;
  };
  publicUrl(config: S3Config, key: string): string;
  signRequest(o: { method: string; url: string; headers?: Record<string, string>; payloadHash?: string; accessKeyId: string; secretAccessKey: string; region: string; amzDate?: string }): { headers: Record<string, string> };
  amzDateOf(date?: Date): string;
}
interface PresignModule {
  presignGetUrl(o: { config: S3Config; key: string; expiresSeconds: number; now?: Date }): string;
}

export async function createS3Storage(env: Record<string, string>, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<Storage> {
  const s3mod = await engineImport<S3Module>('storage/s3');
  const config = s3mod.loadS3Config(env);
  const client = s3mod.createS3({ config, fetchImpl, now });

  // Signed GET and DELETE; the engine client only puts and heads.
  async function signedCall(method: 'GET' | 'DELETE', key: string): Promise<Response> {
    const url = client.objectUrl(key);
    const { headers } = s3mod.signRequest({
      method, url, accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: config.region, amzDate: s3mod.amzDateOf(now()),
    });
    delete headers.host;
    return fetchImpl(url, { method, headers, signal: AbortSignal.timeout(120_000) });
  }

  return {
    kind: 's3',
    publicConfig: { prefix: config.prefix, publicBaseUrl: config.publicBaseUrl },
    async putObject(key, body, contentType) {
      assertSafeKey(key);
      await client.putObject(key, body, contentType);
    },
    async headObject(key) {
      assertSafeKey(key);
      return client.headObject(key);
    },
    async getObject(key) {
      assertSafeKey(key);
      const res = await signedCall('GET', key);
      if (res.status === 404) throw new StorageError('Object not found', 'not_found');
      if (!res.ok) throw new StorageError(`Reading ${key} was refused: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async deleteObject(key) {
      assertSafeKey(key);
      const res = await signedCall('DELETE', key);
      if (!res.ok && res.status !== 404) throw new StorageError(`Deleting ${key} was refused: HTTP ${res.status}`);
    },
    async presignGet(key, ttlSeconds) {
      assertSafeKey(key);
      if (!(await engineHas('storage/presign'))) throw new StorageError('Signed URLs are not available: the engine has no storage/presign module');
      const presign = await engineImport<PresignModule>('storage/presign');
      // The signer takes the moment to sign at, not a clock: passing the clock threw on every call.
      return presign.presignGetUrl({ config, key, expiresSeconds: ttlSeconds, now: now() });
    },
    publicUrl(key) {
      assertSafeKey(key);
      return s3mod.publicUrl(config, key);
    },
  };
}
