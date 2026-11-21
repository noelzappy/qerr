// Better Auth, configured for an invite-only team tool:
//  - email and password only; public sign-up is switched off (users appear only by accepting an invite, see routes/invites.ts);
//  - two roles (admin, editor) and a `disabled` flag kept on the user row;
//  - a disabled user can neither sign in nor keep using a session (the session hook here, and requireUser per request);
//  - sessions live in the database; the cookie is httpOnly, sameSite lax, and secure in production.
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import type { Mailer } from './mail.js';
import { audit } from './audit.js';
import { linkEmail } from './mail.js';
import { CLIENT_IP_HEADER } from './middleware.js';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
const SELF_RESET_TTL_SECONDS = 60 * 60;
export const ADMIN_RESET_TTL_SECONDS = 24 * 60 * 60;

export interface AuthInput {
  prisma: PrismaClient;
  config: AppConfig;
  mailer: Mailer;
}

export const resetLink = (config: AppConfig, token: string) => `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;

export function createAuth({ prisma, config, mailer }: AuthInput) {
  return betterAuth({
    appName: config.appName,
    baseURL: config.appUrl,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      resetPasswordTokenExpiresIn: SELF_RESET_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // Without SMTP nothing is sent and the caller still gets the same answer; an admin makes a link from the users page.
      sendResetPassword: async ({ user, token }) => {
        if (!mailer.enabled) return;
        await mailer.send({
          to: user.email,
          toName: user.name,
          subject: `Reset your ${config.appName} password`,
          ...linkEmail({
            greeting: `Hello ${user.name},`,
            intro: 'Someone asked to reset the password for this account. If it was you, use this link within one hour.',
            link: resetLink(config, token),
            linkLabel: 'Choose a new password',
            outro: 'If it was not you, ignore this email: your password has not changed.',
          }),
        });
      },
      onPasswordReset: async ({ user }) => {
        await audit({ prisma }, { id: user.id, email: user.email }, 'user.password_reset', 'user', user.id, {});
      },
    },
    user: {
      additionalFields: {
        // input: false means no request can set these; only server code can.
        role: { type: 'string', required: false, defaultValue: 'editor', input: false },
        disabled: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    advanced: {
      useSecureCookies: config.isProduction,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: config.isProduction },
      // Only the header our middleware sets from the trusted proxy hop (see trustedClientIp). Never x-forwarded-for:
      // its first entry is whatever the caller sent.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    // Our own buckets (rate-limit.ts, applied in app.ts) are the strict ones; this is Better Auth's broader per-address
    // guard, kept looser than ours on the sign-in and reset paths so it never answers first.
    rateLimit: {
      enabled: config.rateLimitEnabled,
      window: 60,
      max: 120,
      customRules: {
        '/sign-in/email': { window: 60, max: 60 },
        '/request-password-reset': { window: 60, max: 60 },
        '/reset-password': { window: 60, max: 60 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { disabled: true } });
            if (!user || user.disabled) throw new APIError('FORBIDDEN', { message: 'This account is disabled. Ask an admin.' });
          },
        },
      },
    },
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
