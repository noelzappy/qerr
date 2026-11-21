// Serves the local storage driver's files. Only mounted work happens when the driver is 'local'; otherwise these 404.
import { Hono } from 'hono';
import type { Deps } from '../deps.js';
import type { LocalStorage } from '../storage/local.js';
import { assertSafeKey, StorageError } from '../storage/types.js';

const isLocal = (s: Deps['storage']): s is LocalStorage => s.kind === 'local';

export function localStorageRoutes(deps: Deps): Hono {
  const app = new Hono();

  async function serve(key: string) {
    try {
      assertSafeKey(key);
    } catch {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
    const storage = deps.storage;
    try {
      const head = await storage.headObject(key);
      if (!head.exists) throw new StorageError('Object not found', 'not_found');
      const body = await storage.getObject(key);
      return new Response(new Uint8Array(body), {
        headers: {
          'content-type': head.contentType ?? 'application/octet-stream',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; sandbox",
          'cache-control': 'private, max-age=60',
        },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }
  }

  // /api/_local-storage/<key>?exp=&sig=
  app.get('/api/_local-storage/*', async (c) => {
    const storage = deps.storage;
    if (!isLocal(storage)) return c.json({ error: 'Not found' }, 404);
    const key = decodeURIComponent(c.req.path.replace(/^\/api\/_local-storage\//, ''));
    const exp = Number(c.req.query('exp'));
    const sig = c.req.query('sig') ?? '';
    if (!storage.verify(key, exp, sig)) return c.json({ error: 'This link has expired or is not valid' }, 403);
    return await serve(key);
  });

  // /_local-public/<key>: only keys under the public prefix
  app.get('/_local-public/*', async (c) => {
    const storage = deps.storage;
    if (!isLocal(storage)) return c.json({ error: 'Not found' }, 404);
    const key = decodeURIComponent(c.req.path.replace(/^\/_local-public\//, ''));
    if (!storage.isPublicKey(key)) return c.json({ error: 'Not found' }, 404);
    return await serve(key);
  });

  return app;
}
