// Serves the built web app from dist/web, with history fallback so /batches/123 opens the app.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { appRoot } from './engine/root.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function webDir(): string {
  return path.join(appRoot() ?? process.cwd(), 'dist', 'web');
}

export function spaHandler(dir: string = webDir()): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
    const urlPath = decodeURIComponent(new URL(c.req.url).pathname);
    if (urlPath === '/api' || urlPath.startsWith('/api/') || urlPath === '/healthz') return next();
    const rel = path.normalize(urlPath).replace(/^([/\\])+/, '');
    const file = path.join(dir, rel);
    if (file !== dir && !file.startsWith(dir + path.sep)) return c.json({ error: 'Not found' }, 404);

    const send = async (target: string, immutable: boolean) => {
      const body = await fs.readFile(target);
      return new Response(new Uint8Array(body), {
        headers: {
          'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream',
          'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        },
      });
    };
    try {
      const stat = await fs.stat(file);
      if (stat.isFile()) return await send(file, urlPath.startsWith('/assets/'));
    } catch { /* not a file: fall through */ }
    // A missing file with an extension is a real 404; a page path gets the app.
    if (path.extname(urlPath)) return c.json({ error: 'Not found' }, 404);
    try {
      return await send(path.join(dir, 'index.html'), false);
    } catch {
      return c.json({ error: 'The web app has not been built. Run "npm run build".' }, 404);
    }
  };
}
