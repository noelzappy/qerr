import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { audit, isSecretName, REDACTED, scrub } from './audit.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

describe('scrub', () => {
  it('replaces anything named like a secret, at any depth', () => {
    const out = scrub({
      email: 'a@b.co', key: 'k1', apiKey: 'k2', accessKey: 'k3', secret: 's', clientSecret: 's2', password: 'p', newPassword: 'p2',
      token: 't', accessToken: 't2', keyCipher: 'c', authorization: 'Bearer x',
      nested: { list: [{ apiKey: 'deep' }], ok: 1 },
    }) as Record<string, any>;
    expect(out.email).toBe('a@b.co');
    for (const k of ['key', 'apiKey', 'accessKey', 'secret', 'clientSecret', 'password', 'newPassword', 'token', 'accessToken', 'keyCipher', 'authorization']) expect(out[k]).toBe(REDACTED);
    expect(out.nested.list[0].apiKey).toBe(REDACTED);
    expect(out.nested.ok).toBe(1);
    expect(JSON.stringify(out)).not.toMatch(/"k1"|"k2"|deep|Bearer/);
  });

  it('keeps identifiers and the last four characters', () => {
    expect(isSecretName('keyLast4')).toBe(false);
    expect(isSecretName('keyVersion')).toBe(false);
    expect(isSecretName('postKey')).toBe(false);
    expect(isSecretName('fileKey')).toBe(false);
    expect(isSecretName('name')).toBe(false);
  });

  it('copes with dates, long strings and cycles of depth', () => {
    const deep: any = {};
    let cur = deep;
    for (let i = 0; i < 20; i++) { cur.next = {}; cur = cur.next; }
    expect(() => scrub({ deep })).not.toThrow();
    expect((scrub({ s: 'x'.repeat(5000) }) as any).s.length).toBeLessThan(2100);
    expect((scrub({ d: new Date('2026-11-20T10:00:00Z') }) as any).d).toBe('2026-11-20T10:00:00.000Z');
  });
});

describe('audit entries', () => {
  it('stores what happened and never a secret passed by a careless caller', async () => {
    await audit(t.deps, { id: 'u1', email: 'a@b.co' }, 'buffer_account.create', 'buffer_account', 'b1', { name: 'main', apiKey: 'sk-should-not-appear', keyLast4: '1234' });
    const row = await t.prisma.auditLog.findFirstOrThrow();
    expect(row).toMatchObject({ actorId: 'u1', actorEmail: 'a@b.co', action: 'buffer_account.create', entity: 'buffer_account', entityId: 'b1' });
    expect(JSON.stringify(row.detail)).not.toContain('sk-should-not-appear');
    expect(row.detail).toMatchObject({ name: 'main', apiKey: REDACTED, keyLast4: '1234' });
  });

  it('are written for invites, roles and resets, without links or tokens', async () => {
    const admin = await t.createUser('admin');
    const other = await t.createUser('admin');
    const a = t.api(await t.signIn(admin));
    const inv = await a.post('/api/users/invites', { email: 'new@example.test', role: 'editor' });
    const token = new URL(inv.body.link).searchParams.get('token')!;
    await a.patch(`/api/users/${other.id}/role`, { role: 'editor' });
    const reset = await a.post(`/api/users/${other.id}/reset-link`, {});
    await a.post(`/api/users/${other.id}/disable`);
    await t.api().post('/api/invites/accept', { token, name: 'New', password: 'a long enough password' });

    const actions = (await t.prisma.auditLog.findMany({ orderBy: { at: 'asc' } })).map((r) => r.action);
    expect(actions).toEqual(['invite.create', 'user.role_change', 'user.reset_link', 'user.disable', 'invite.accept']);
    const all = JSON.stringify(await t.prisma.auditLog.findMany());
    expect(all).not.toContain(token);
    expect(all).not.toContain(new URL(reset.body.link).searchParams.get('token')!);
    expect(all).not.toContain('a long enough password');
    expect(all).not.toContain('accept-invite');
    const first = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'invite.create' } });
    expect(first.actorEmail).toBe(admin.email);
  });

  it('can be read by an admin, page by page and filtered', async () => {
    const admin = await t.createUser('admin');
    const a = t.api(await t.signIn(admin));
    for (let i = 0; i < 5; i++) await audit(t.deps, admin, 'thing.happen', 'thing', String(i));
    await audit(t.deps, admin, 'other.happen');
    const page = await a.get('/api/audit?pageSize=2&page=2');
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 2, pageSize: 2, total: 6 });
    expect(page.body.items).toHaveLength(2);
    const filtered = await a.get('/api/audit?action=thing.');
    expect(filtered.body.total).toBe(5);
    expect((await a.get('/api/audit?pageSize=1000')).status).toBe(400);
  });
});
