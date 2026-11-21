// First start: if there are no users and no open invite, create an admin invite for BOOTSTRAP_ADMIN_EMAIL and log
// its link. This is the one place a link is logged, because nobody can sign in yet to be shown it. When mail is set
// up the invite is also emailed, like any other invite; a failed send only leaves the logged link.
import type { Deps } from './deps.js';
import { audit } from './audit.js';
import { createInvite } from './routes/invite-tokens.js';
import { linkEmail } from './mail.js';
import type { LogFn } from './log.js';

export async function bootstrapAdmin(deps: Pick<Deps, 'prisma' | 'config' | 'now'> & Partial<Pick<Deps, 'mailer'>>, log: LogFn): Promise<'created' | 'skipped'> {
  const email = deps.config.bootstrapAdminEmail;
  if (!email) return 'skipped';
  if ((await deps.prisma.user.count()) > 0) return 'skipped';
  const open = await deps.prisma.invite.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: deps.now() } } });
  if (open > 0) return 'skipped';
  const { invite, link } = await createInvite(deps, { email, role: 'admin', createdById: null });
  await audit(deps, null, 'invite.create', 'invite', invite.id, { email, role: 'admin', bootstrap: true });
  log('bootstrap.admin_invite', { email, link, expiresAt: invite.expiresAt.toISOString() });
  if (deps.mailer?.enabled) {
    try {
      await deps.mailer.send({
        to: email,
        subject: `You are invited to the ${deps.config.appName}`,
        ...linkEmail({ intro: `You have been invited to the ${deps.config.appName} as an admin. Set your password within 7 days.`, link, linkLabel: 'Set up your account' }),
      });
      log('bootstrap.admin_invite_emailed', { email });
    } catch (e) {
      log('bootstrap.admin_invite_email_failed', { email, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return 'created';
}
