// Environment, parsed once. Failing here is deliberate: a half-configured server must not start.
import { z } from 'zod';
import { brandInfo } from './brand.js';
import { createKeyring, parseOldKeys, type Keyring } from './crypto.js';

const optional = z.string().trim().optional().transform((v) => (v ? v : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  APP_URL: z.string().url('APP_URL must be a full URL such as https://vesk.example.com'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  APP_ENCRYPTION_KEY: z.string().min(1, 'APP_ENCRYPTION_KEY is required (base64 of 32 random bytes)'),
  APP_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  APP_ENCRYPTION_KEY_OLD: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  MAIL_FROM: optional,
  MAIL_FROM_NAME: optional,
  // The name in page titles, emails and the sign-in page. Default: "Vesk".
  APP_NAME: optional,
  ZEPTOMAIL_API_KEY: optional,
  BOOTSTRAP_ADMIN_EMAIL: optional,
  // Extra origins allowed to make state-changing requests (a dev server, for example). Comma separated.
  TRUSTED_ORIGINS: optional,
  // How many proxies in front of the app append to X-Forwarded-For (Traefik on Dokploy: 1).
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),
  // 'on' | 'off'. Default: on in production, off elsewhere (so local work and most specs are not throttled).
  RATE_LIMIT: z.enum(['on', 'off']).optional(),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('.data/storage'),
  CHROME_PATH: optional,
  // Images drawn at the same time, each in its own Chrome (about 300 to 500 MB of memory each). Raise it on a server with the memory.
  RENDER_CONCURRENCY: z.coerce.number({ message: 'RENDER_CONCURRENCY must be a whole number from 1 to 16' }).int('RENDER_CONCURRENCY must be a whole number from 1 to 16').min(1, 'RENDER_CONCURRENCY must be a whole number from 1 to 16').max(16, 'RENDER_CONCURRENCY must be a whole number from 1 to 16').default(1),
  // Previews that may wait for a free render; one more is refused at once with "busy, try again" (503).
  RENDER_QUEUE_MAX: z.coerce.number({ message: 'RENDER_QUEUE_MAX must be a whole number from 0 to 10000' }).int('RENDER_QUEUE_MAX must be a whole number from 0 to 10000').min(0, 'RENDER_QUEUE_MAX must be a whole number from 0 to 10000').max(10000, 'RENDER_QUEUE_MAX must be a whole number from 0 to 10000').default(50),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  appUrl: string;
  appOrigin: string;
  trustedOrigins: string[];
  trustedProxyHops: number;
  rateLimitEnabled: boolean;
  authSecret: string;
  keyring: Keyring;
  // ZeptoMail is the primary transport; SMTP is the alternative; with neither, the admin page shows links to copy.
  zepto: { apiKey: string; from: string; fromName: string } | null;
  smtp: { host: string; port: number; user?: string; pass?: string; from: string } | null;
  mailFrom: string;
  mailFromName: string;
  appName: string;
  bootstrapAdminEmail?: string;
  storageDriver: 'local' | 's3';
  localStorageDir: string;
  chromePath?: string;
  // RENDER_CONCURRENCY and RENDER_QUEUE_MAX (services/render-limit.ts).
  renderConcurrency: number;
  renderQueueMax: number;
  // The S3_* variables, passed to the engine's loadS3Config. Kept apart so secrets never sit in named fields.
  s3Env: Record<string, string>;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Names and messages only; never the values.
    const lines = parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`The environment is not usable:\n  - ${lines.join('\n  - ')}`);
  }
  const e = parsed.data;
  let keyring: Keyring;
  try {
    keyring = createKeyring({ version: e.APP_ENCRYPTION_KEY_VERSION, key: e.APP_ENCRYPTION_KEY }, parseOldKeys(e.APP_ENCRYPTION_KEY_OLD));
  } catch (err) {
    throw new Error(`The environment is not usable:\n  - APP_ENCRYPTION_KEY: ${(err as Error).message}`);
  }
  const appUrl = e.APP_URL.replace(/\/+$/, '');
  const appOrigin = new URL(appUrl).origin;
  if (e.ZEPTOMAIL_API_KEY && !e.MAIL_FROM) throw new Error('The environment is not usable:\n  - MAIL_FROM: required when ZEPTOMAIL_API_KEY is set (for example noreply@example.com)');
  const mailFrom = e.MAIL_FROM ?? 'no-reply@localhost';
  const mailFromName = e.MAIL_FROM_NAME ?? brandInfo().name;
  const appName = e.APP_NAME ?? 'Vesk';
  const s3Env: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (k.startsWith('S3_') && v) s3Env[k] = v;
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    appUrl,
    appOrigin,
    trustedProxyHops: e.TRUSTED_PROXY_HOPS,
    rateLimitEnabled: (e.RATE_LIMIT ?? (e.NODE_ENV === 'production' ? 'on' : 'off')) === 'on',
    trustedOrigins: [appOrigin, ...(e.TRUSTED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [])],
    authSecret: e.BETTER_AUTH_SECRET,
    keyring,
    // ZeptoMail shows the token with its "Zoho-enczapikey " scheme in front; accept it with or without.
    zepto: e.ZEPTOMAIL_API_KEY ? { apiKey: e.ZEPTOMAIL_API_KEY.trim().replace(/^Zoho-enczapikey\s+/i, ''), from: mailFrom, fromName: mailFromName } : null,
    smtp: e.SMTP_HOST ? { host: e.SMTP_HOST, port: e.SMTP_PORT, user: e.SMTP_USER, pass: e.SMTP_PASS, from: mailFrom } : null,
    mailFrom,
    mailFromName,
    appName,
    bootstrapAdminEmail: e.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase(),
    storageDriver: e.STORAGE_DRIVER,
    localStorageDir: e.LOCAL_STORAGE_DIR,
    chromePath: e.CHROME_PATH,
    renderConcurrency: e.RENDER_CONCURRENCY,
    renderQueueMax: e.RENDER_QUEUE_MAX,
    s3Env,
  };
}
