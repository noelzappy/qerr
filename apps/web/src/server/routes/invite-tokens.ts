// Creating invites and reading them back by token. The token is shown once; only its sha256 is stored.
import { createHash, randomBytes } from 'node:crypto';
import type { Invite } from '@prisma/client';
import type { Deps, Role } from '../deps.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const inviteLink = (config: Deps['config'], token: string) => `${config.appUrl}/accept-invite?token=${encodeURIComponent(token)}`;

export async function createInvite(
  deps: Pick<Deps, 'prisma' | 'config' | 'now'>,
  input: { email: string; role: Role; createdById: string | null },
): Promise<{ invite: Invite; token: string; link: string }> {
  const token = randomBytes(32).toString('base64url');
  const invite = await deps.prisma.invite.create({
    data: {
      email: input.email.trim().toLowerCase(),
      role: input.role,
      tokenHash: hashToken(token),
      expiresAt: new Date(deps.now().getTime() + INVITE_TTL_MS),
      createdById: input.createdById,
    },
  });
  return { invite, token, link: inviteLink(deps.config, token) };
}

export type InviteState = 'open' | 'accepted' | 'revoked' | 'expired';

export const inviteState = (invite: Pick<Invite, 'acceptedAt' | 'revokedAt' | 'expiresAt'>, now: Date): InviteState =>
  invite.acceptedAt ? 'accepted' : invite.revokedAt ? 'revoked' : invite.expiresAt <= now ? 'expired' : 'open';

// Never includes the token hash.
export const publicInvite = (invite: Invite, now: Date) => ({
  id: invite.id,
  email: invite.email,
  role: invite.role,
  state: inviteState(invite, now),
  expiresAt: invite.expiresAt,
  createdAt: invite.createdAt,
  acceptedAt: invite.acceptedAt,
  revokedAt: invite.revokedAt,
});
