// The app's own icons: every icon and the manifest that web/index.html links to is in web/public (Vite copies that folder
// into the build as it is), the manifest names Qerr, and the server sends each with its own content type.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { spaHandler } from './server/static.js';

const web = path.resolve(import.meta.dirname, '..', 'web');
const pub = path.join(web, 'public');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');
const links = [...html.matchAll(/<link rel="([^"]+)" href="([^"]+)"/g)].map((m) => ({ rel: m[1]!, href: m[2]! }));

describe('the app icons', () => {
  it('links the favicons, the touch icon and the manifest, each a file in web/public', () => {
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toEqual(expect.arrayContaining(['/favicon.svg', '/favicon-16.png', '/favicon-32.png', '/favicon-48.png', '/apple-touch-icon-180.png', '/manifest.webmanifest']));
    for (const { href } of links) expect(fs.existsSync(path.join(pub, href)), href).toBe(true);
    for (const f of ['favicon-16.png', 'favicon-32.png', 'favicon-48.png', 'apple-touch-icon-180.png', 'app-icon-192.png', 'app-icon-512.png']) {
      expect([...fs.readFileSync(path.join(pub, f)).subarray(1, 4)].map((c) => String.fromCharCode(c)).join(''), f).toBe('PNG');
    }
  });

  it('has a manifest named Qerr whose icons are in web/public', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8')) as { name: string; short_name: string; icons: Array<{ src: string; sizes: string }> };
    expect(manifest.name).toBe('Qerr');
    expect(manifest.short_name).toBe('Qerr');
    expect(manifest.icons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
    for (const i of manifest.icons) expect(fs.existsSync(path.join(pub, i.src))).toBe(true);
  });

  it('draws the favicon ring in ink, and in paper when the system is dark', () => {
    const svg = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
    expect(svg).toMatch(/\.ring \{ stroke: #1b1a18; \}/);
    expect(svg).toMatch(/@media \(prefers-color-scheme: dark\) \{ \.ring \{ stroke: #f7f6f2; \} \}/);
    expect(svg).toContain('fill="#e0532f"');
    expect(svg).not.toMatch(/<script|href=/i);
  });

  it('serves the manifest, the svg icon and the wordmark font with their content types', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-icons-'));
    fs.mkdirSync(path.join(dir, 'fonts'));
    fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), '{}');
    fs.writeFileSync(path.join(dir, 'favicon.svg'), '<svg/>');
    fs.writeFileSync(path.join(dir, 'fonts', 'a.woff2'), 'wOF2');
    const app = new Hono().use('*', spaHandler(dir));
    expect((await app.request('/manifest.webmanifest')).headers.get('content-type')).toBe('application/manifest+json');
    expect((await app.request('/favicon.svg')).headers.get('content-type')).toBe('image/svg+xml');
    expect((await app.request('/fonts/a.woff2')).headers.get('content-type')).toBe('font/woff2');
  });
});
