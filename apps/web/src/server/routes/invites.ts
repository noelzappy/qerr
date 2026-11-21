// Public: look up an invite by its token and accept it. Accepting creates the account (with Better Auth's own
// user and password-hash code); nobody else can create one, because public sign-up is off.
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../auth.js';
import type { AppEnv, Deps } from '../deps.js';
import { conflict, HttpError, readJson } from '../http.js';
import { hashToken, inviteState } from './invite-tokens.js';

const acceptBody = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1, 'Enter a name').max(100),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`).max(MAX_PASSWORD_LENGTH),
});

const REASON: Record<string, string> = {
  expired: 'This invitation has expired. Ask an admin for a new one.',
  revoked: 'This invitation was withdrawn. Ask an admin for a new one.',
  accepted: 'This invitation has already been used. Sign in instead.',
};

export function inviteRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  async function find(token: string) {
    const invite = await deps.prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!invite) throw new HttpError(404, 'This invitation link is not valid');
    const state = inviteState(invite, deps.now());
    if (state !== 'open') throw new HttpError(410, REASON[state]!);
    return invite;
  }

  app.get('/:token', async (c) => {
    const invite = await find(c.req.param('token'));
    return c.json({ email: invite.email, role: invite.role, expiresAt: invite.expiresAt });
  });

  app.post('/accept', async (c) => {
    const body = await readJson(c, acceptBody);
    const invite = await find(body.token);
    // Claim the invite first: of two simultaneous accepts only one updates a row.
    const claim = await deps.prisma.invite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: deps.now() } },
      data: { acceptedAt: deps.now() },
    });
    if (claim.count !== 1) throw new HttpError(410, REASON.accepted!);
    const ctx = await deps.auth.$context;
    try {
      if (await ctx.internalAdapter.findUserByEmail(invite.email)) throw conflict('Someone with this email already has an account');
      const hash = await ctx.password.hash(body.password);
      const user = await ctx.internalAdapter.createUser({ email: invite.email, name: body.name, emailVerified: true, role: invite.role, disabled: false }, { method: 'email-password' });
      await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash });
      await audit(deps, { id: user.id, email: user.email }, 'invite.accept', 'invite', invite.id, { role: invite.role });
      return c.json({ ok: true, email: user.email }, 201);
    } catch (err) {
      // Hand the invite back so the person can try again.
      await deps.prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: null } }).catch(() => {});
      throw err;
    }
  });

  return app;
}
