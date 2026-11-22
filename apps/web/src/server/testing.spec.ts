import { afterAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './testing.js';

const apps: TestApp[] = [];
afterAll(async () => { for (const a of apps) await a.close(); });

describe('the test helpers', () => {
  it('createTestApp starts from an empty database, whatever an earlier test file left in it', async () => {
    const earlier = await createTestApp();
    apps.push(earlier);
    await earlier.createUser('admin');
    await earlier.prisma.brandProfile.create({ data: { settings: {} } });
    // What the next file sees, before its first test and without calling t.reset().
    const t = await createTestApp();
    apps.push(t);
    expect(await t.prisma.brandProfile.count()).toBe(0);
    expect(await t.prisma.user.count()).toBe(0);
    const res = await t.app.request('/api/app');
    expect(res.status).toBe(200);
    expect((await res.json() as { brand: { logo: string | null } }).brand.logo).toMatch(/^\/brand\/logo-mark\.png\?v=/);
  });
});
