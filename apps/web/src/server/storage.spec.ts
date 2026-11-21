import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalStorage } from './storage/local.js';
import { createMemoryStorage } from './storage/memory.js';
import { assertSafeKey, StorageError, type Storage } from './storage/types.js';
import { createTestApp, type TestApp } from './testing.js';

describe.each([
  ['memory', () => createMemoryStorage()],
  ['local', () => createLocalStorage({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'desk-store-')), appUrl: 'http://localhost:3000', secret: 'a-secret' })],
])('%s storage', (_name, make) => {
  it('puts, heads, gets and deletes', async () => {
    const s: Storage = make();
    await s.putObject('vault/a/photo.png', Buffer.from('hello'), 'image/png');
    expect(await s.headObject('vault/a/photo.png')).toMatchObject({ exists: true, size: 5, contentType: 'image/png' });
    expect((await s.getObject('vault/a/photo.png')).toString()).toBe('hello');
    await s.deleteObject('vault/a/photo.png');
    expect((await s.headObject('vault/a/photo.png')).exists).toBe(false);
    await expect(s.getObject('vault/a/photo.png')).rejects.toBeInstanceOf(StorageError);
    await s.deleteObject('vault/a/photo.png'); // deleting a missing object is fine
  });

  it('refuses keys that climb out or are not relative', async () => {
    const s: Storage = make();
    for (const bad of ['../x', 'a/../../x', '/abs', 'a//b', 'a\\b', '']) {
      await expect(s.putObject(bad, Buffer.from('x'), 'text/plain')).rejects.toBeInstanceOf(StorageError);
    }
    expect(() => assertSafeKey('renders/b1/post-1.png')).not.toThrow();
  });

  it('gives a public url under the public base', () => {
    const s: Storage = make();
    expect(s.publicUrl('public/a b.png')).toMatch(/^https?:\/\/.+\/public\/a(%20| )b\.png$/);
    expect(s.publicConfig.prefix).toBe('public/');
  });
});

describe('local storage served by the app', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('serves private files only through a valid, unexpired signed link', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-store-'));
    const local = createLocalStorage({ dir, appUrl: 'http://localhost:3000', secret: 'k', now: t.now });
    const app = (await import('./app.js')).createAppAndDeps({ ...t.deps, storage: local }).app;
    await local.putObject('vault/secret.txt', Buffer.from('private body'), 'text/plain');
    await local.putObject('public/open.txt', Buffer.from('open body'), 'text/plain');

    const url = new URL(await local.presignGet('vault/secret.txt', 60));
    const ok = await app.request(url.pathname + url.search);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('private body');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');

    expect((await app.request(url.pathname)).status).toBe(403);
    expect((await app.request(`${url.pathname}?exp=${url.searchParams.get('exp')}&sig=bad`)).status).toBe(403);
    // a valid signature for one key does not open another
    expect((await app.request(url.pathname.replace('secret.txt', 'other.txt') + url.search)).status).toBe(403);
    const expired = new URL(await createLocalStorage({ dir, appUrl: 'http://localhost:3000', secret: 'k', now: () => new Date(Date.now() - 3_600_000) }).presignGet('vault/secret.txt', 60));
    expect((await app.request(expired.pathname + expired.search)).status).toBe(403);

    expect(await (await app.request('/_local-public/public/open.txt')).text()).toBe('open body');
    expect((await app.request('/_local-public/vault/secret.txt')).status).toBe(404);
    expect((await app.request('/_local-public/public/..%2fvault%2fsecret.txt')).status).toBe(404);
  });
});

describe('S3 storage signed URLs', () => {
  it('signs a GET URL for a private key at the injected time', async () => {
    const { createS3Storage } = await import('./storage/s3.js');
    const env = {
      S3_ENDPOINT: 'https://fsn1.your-objectstorage.com', S3_REGION: 'fsn1', S3_BUCKET: 'misc',
      S3_ACCESS_KEY_ID: 'AKTEST', S3_SECRET_ACCESS_KEY: 'secret', S3_PUBLIC_BASE_URL: 'https://misc.fsn1.your-objectstorage.com', S3_PREFIX: 'xpfh/app/public/',
    };
    const at = new Date('2026-11-20T10:00:00Z');
    const s3 = await createS3Storage(env, (() => { throw new Error('no network in this test'); }) as unknown as typeof fetch, () => at);
    const url = new URL(await s3.presignGet('renders/abc/b1/01-post/feed.jpg', 300));
    expect(url.pathname).toContain('renders/abc/b1/01-post/feed.jpg');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261120T100000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });
});
