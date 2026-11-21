// Admin only: people, roles, invites and reset links.
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import { ADMIN_RESET_TTL_SECONDS, resetLink } from '../auth.js';
import type { AppEnv, Deps } from '../deps.js';
import { conflict, HttpError, notFound, readJson } from '../http.js';
import { linkEmail } from '../mail.js';
import { requireRole, requireUser } from '../middleware.js';
import { createInvite, publicInvite } from './invite-tokens.js';

const roleSchema = z.enum(['admin', 'editor']);
const inviteBody = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: roleSchema });
const roleBody = z.object({ role: roleSchema });
const resetBody = z.object({ send: z.boolean().optional() }).default({});

const publicUser = (u: { id: string; email: string; name: string; role: string; disabled: boolean; createdAt: Date }) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, disabled: u.disabled, createdAt: u.createdAt,
});

export function userRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));

  const enabledAdmins = (excludingId?: string) =>
    deps.prisma.user.count({ where: { role: 'admin', disabled: false, ...(excludingId ? { id: { not: excludingId } } : {}) } });

  app.get('/', async (c) => {
    const users = await deps.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return c.json({ users: users.map(publicUser) });
  });

  // ---- invites (declared before /:id so the literal path wins) ----
  app.get('/invites', async (c) => {
    const invites = await deps.prisma.invite.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const now = deps.now();
    return c.json({ invites: invites.map((i) => publicInvite(i, now)) });
  });

  app.post('/invites', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, inviteBody);
    if (await deps.prisma.user.findUnique({ where: { email: body.email } })) throw conflict('Someone with this email already has an account');
    // One live link per email: an older open invite is withdrawn.
    const older = await deps.prisma.invite.updateMany({
      where: { email: body.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: deps.now() } },
      data: { revokedAt: deps.now() },
    });
    const { invite, link } = await createInvite(deps, { email: body.email, role: body.role, createdById: actor.id });
    let emailed = false;
    let emailFailed = false;
    if (deps.mailer.enabled) {
      try {
        await deps.mailer.send({
          to: body.email,
          subject: `You are invited to the ${deps.config.appName}`,
          ...linkEmail({
            intro: `You have been invited to the ${deps.config.appName} as ${body.role === 'admin' ? 'an admin' : 'an editor'}. Set your password within 7 days.`,
            link,
            linkLabel: 'Set up your account',
          }),
        });
        emailed = true;
      } catch {
        // The invite still exists and the admin gets the link; the page shows "email not sent".
        emailFailed = true;
      }
    }
    // emailed: false with emailFailed: true means mail is set up but the send failed; emailed: false alone means no mail is set up.
    await audit(deps, actor, 'invite.create', 'invite', invite.id, { email: body.email, role: body.role, emailed, emailFailed, replaced: older.count });
    return c.json({ invite: publicInvite(invite, deps.now()), link, emailed, emailFailed }, 201);
  });

  app.delete('/invites/:id', async (c) => {
    const actor = c.get('user');
    const invite = await deps.prisma.invite.findUnique({ where: { id: c.req.param('id') } });
    if (!invite) throw notFound('Invite not found');
    if (invite.acceptedAt) throw conflict('This invite has already been used');
    if (!invite.revokedAt) {
      await deps.prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: deps.now() } });
      await audit(deps, actor, 'invite.revoke', 'invite', invite.id, { email: invite.email });
    }
    return c.json({ ok: true });
  });

  // ---- users ----
  app.patch('/:id/role', async (c) => {
    const actor = c.get('user');
    const { role } = await readJson(c, roleBody);
    const target = await deps.prisma.user.findUnique({ where: { id: c.req.param('id') } });
    if (!target) throw notFound('User not found');
    if (target.role === 'admin' && role !== 'admin' && !target.disabled && (await enabledAdmins(target.id)) === 0) {
      throw conflict('This is the last admin. Make someone else an admin first.');
    }
    const updated = await deps.prisma.user.update({ where: { id: target.id }, data: { role } });
    await audit(deps, actor, 'user.role_change', 'user', target.id, { email: target.email, from: target.role, to: role });
    return c.json({ user: publicUser(updated) });
  });

  app.post('/:id/disable', async (c) => {
    const actor = c.get('user');
    const target = await deps.prisma.user.findUnique({ where: { id: c.req.param('id') } });
    if (!target) throw notFound('User not found');
    if (target.role === 'admin' && !target.disabled && (await enabledAdmins(target.id)) === 0) {
      throw conflict('This is the last admin and cannot be disabled.');
    }
    const updated = await deps.prisma.user.update({ where: { id: target.id }, data: { disabled: true } });
    // End every session now, not at its next check.
    await deps.prisma.session.deleteMany({ where: { userId: target.id } });
    await audit(deps, actor, 'user.disable', 'user', target.id, { email: target.email });
    return c.json({ user: publicUser(updated) });
  });

  app.post('/:id/enable', async (c) => {
    const actor = c.get('user');
    const target = await deps.prisma.user.findUnique({ where: { id: c.req.param('id') } });
    if (!target) throw notFound('User not found');
    const updated = await deps.prisma.user.update({ where: { id: target.id }, data: { disabled: false } });
    await audit(deps, actor, 'user.enable', 'user', target.id, { email: target.email });
    return c.json({ user: publicUser(updated) });
  });

  // A reset link made by an admin, valid for 24 hours. It is a Better Auth reset token, so the normal reset page works.
  app.post('/:id/reset-link', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, resetBody).catch((e) => {
      if (e instanceof HttpError && e.message === 'The request body must be JSON') return {} as z.infer<typeof resetBody>;
      throw e;
    });
    const target = await deps.prisma.user.findUnique({ where: { id: c.req.param('id') } });
    if (!target) throw notFound('User not found');
    const ctx = await deps.auth.$context;
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(deps.now().getTime() + ADMIN_RESET_TTL_SECONDS * 1000);
    await ctx.internalAdapter.createVerificationValue({ value: target.id, identifier: `reset-password:${token}`, expiresAt });
    const link = resetLink(deps.config, token);
    let emailed = false;
    let emailFailed = false;
    if (body.send && deps.mailer.enabled) {
      try {
        await deps.mailer.send({
          to: target.email,
          toName: target.name,
          subject: `Reset your ${deps.config.appName} password`,
          ...linkEmail({
            greeting: `Hello ${target.name},`,
            intro: 'An admin made a password reset link for you. It works for 24 hours.',
            link,
            linkLabel: 'Choose a new password',
          }),
        });
        emailed = true;
      } catch {
        emailFailed = true;
      }
    }
    await audit(deps, actor, 'user.reset_link', 'user', target.id, { email: target.email, emailed, emailFailed });
    return c.json({ link, expiresAt, emailed, emailFailed });
  });

  return app;
}
