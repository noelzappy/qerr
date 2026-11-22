import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { brandInfo, readBrandInfo } from './brand.js';
import { createTestApp, testConfig, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(async () => { await t.close(); });

describe('the brand pack in the web app', () => {
  it('GET /api/app answers without a session with the app name and the brand\'s name, website, time zone and series', async () => {
    const res = await t.app.request('/api/app');
    expect(res.status).toBe(200);
    const body = await res.json() as { appName: string; brand: { name: string; website: string; timezone: string; series: Array<{ key: string; name: string }>; logo: string | null } };
    const b = brandInfo();
    expect(body.appName).toBe('Qerr');
    expect(body.brand).toEqual({ name: b.name, website: b.website, timezone: b.timezone, series: b.series, logo: expect.stringMatching(/^\/brand\/logo-mark\.png\?v=/) });
    expect(body.brand.series.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/logos\/|brands\/|#[0-9A-Fa-f]{6}/);
  });

  it('serves the brand\'s logo mark as a PNG', async () => {
    const res = await t.app.request('/brand/logo-mark.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  it('APP_NAME and MAIL_FROM_NAME override the names taken from the brand', () => {
    expect(testConfig().appName).toBe('Qerr');
    expect(testConfig().mailFromName).toBe(brandInfo().name);
    const named = testConfig({ APP_NAME: 'Studio hub', MAIL_FROM_NAME: 'Studio' });
    expect(named.appName).toBe('Studio hub');
    expect(named.mailFromName).toBe('Studio');
  });

  it('reads a brand file: series in order, an unknown time zone falls back to UTC, a logo outside the repository is ignored', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-brand-'));
    try {
      const file = path.join(dir, 'brand.json');
      fs.writeFileSync(file, JSON.stringify({ name: 'Studio', website: 'studio.example', tagline: 'Hello.', timezone: 'Mars/Base', series: { b: { name: 'Bee' }, a: {} }, logos: { mark: '/etc/passwd.png' } }));
      expect(readBrandInfo(file)).toEqual({ name: 'Studio', website: 'studio.example', tagline: 'Hello.', timezone: 'UTC', country: null, series: [{ key: 'b', name: 'Bee' }, { key: 'a', name: 'a' }], logoMarkFile: null, money: null });
      fs.writeFileSync(file, '{nope');
      expect(() => readBrandInfo(file)).toThrow(/could not be read .*Set BRAND_DIR/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
