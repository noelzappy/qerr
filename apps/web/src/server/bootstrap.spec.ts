import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapAdmin } from './bootstrap.js';
import { createTestApp, testConfig, type TestApp } from './testing.js';
import { createFakeMailer } from './mail.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const withEmail = () => ({ prisma: t.prisma, config: testConfig({ BOOTSTRAP_ADMIN_EMAIL: 'Owner@Example.test' }), now: t.now });

describe('bootstrap admin', () => {
  it('creates one admin invite and logs its link once, not on a second start', async () => {
    const lines: Array<{ event: string; fields?: Record<string, unknown> }> = [];
    const log = (event: string, fields?: Record<string, unknown>) => lines.push({ event, fields });
    expect(await bootstrapAdmin(withEmail(), log)).toBe('created');
    expect(await bootstrapAdmin(withEmail(), log)).toBe('skipped');
    expect(lines).toHaveLength(1);
    expect(await t.prisma.invite.count()).toBe(1);
    const link = String(lines[0]!.fields!.link);
    expect(link).toContain('/accept-invite?token=');
    expect(lines[0]!.fields!.email).toBe('owner@example.test');

    // the link really works and makes an admin
    const token = new URL(link).searchParams.get('token')!;
    const res = await t.api().post('/api/invites/accept', { token, name: 'Owner', password: 'a long enough password' });
    expect(res.status).toBe(201);
    const cookies = await t.signIn({ email: 'owner@example.test', password: 'a long enough password' });
    expect((await t.api(cookies).get('/api/me')).body.user.role).toBe('admin');

    // and the link is in no stored record
    const stored = JSON.stringify(await t.prisma.auditLog.findMany()) + JSON.stringify(await t.prisma.invite.findMany());
    expect(stored).not.toContain(token);
  });

  it('emails the invite when mail is set up, and a failed send still leaves the logged link', async () => {
    const mailer = createFakeMailer(true);
    const events: string[] = [];
    expect(await bootstrapAdmin({ ...withEmail(), mailer }, (e) => events.push(e))).toBe('created');
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('owner@example.test');
    expect(mailer.sent[0]!.text).toContain('/accept-invite?token=');
    expect(mailer.sent[0]!.subject).toBe(`You are invited to the ${t.deps.config.appName}`);
    expect(mailer.sent[0]!.text).toContain(`invited to the ${t.deps.config.appName} as an admin`);
    expect(events).toEqual(['bootstrap.admin_invite', 'bootstrap.admin_invite_emailed']);

    await t.reset();
    const failing = createFakeMailer(true); failing.fail = true;
    const ev2: string[] = [];
    expect(await bootstrapAdmin({ ...withEmail(), mailer: failing }, (e) => ev2.push(e))).toBe('created');
    expect(ev2).toEqual(['bootstrap.admin_invite', 'bootstrap.admin_invite_email_failed']);
  });

  it('does nothing once a user exists', async () => {
    await t.createUser('admin');
    const lines: unknown[] = [];
    expect(await bootstrapAdmin(withEmail(), (e) => lines.push(e))).toBe('skipped');
    expect(lines).toHaveLength(0);
    expect(await t.prisma.invite.count()).toBe(0);
  });

  it('does nothing without BOOTSTRAP_ADMIN_EMAIL', async () => {
    expect(await bootstrapAdmin({ prisma: t.prisma, config: testConfig(), now: t.now }, () => { throw new Error('logged'); })).toBe('skipped');
    expect(await t.prisma.invite.count()).toBe(0);
  });

  it('makes a fresh invite when the earlier one has expired', async () => {
    const lines: unknown[] = [];
    await bootstrapAdmin(withEmail(), (e) => lines.push(e));
    await t.prisma.invite.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await bootstrapAdmin(withEmail(), (e) => lines.push(e))).toBe('created');
    expect(lines).toHaveLength(2);
  });
});
