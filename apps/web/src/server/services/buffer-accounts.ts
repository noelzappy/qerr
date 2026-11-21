// What the rest of the app needs from stored Buffer accounts: the engine-shaped config, clients, key expiry and the
// key check (which also lists the organisations and channels the key can reach).
import type { BufferAccount } from '@prisma/client';
import { z } from 'zod';
import { decrypt, encrypt, last4 } from '../crypto.js';
import type { Deps } from '../deps.js';
import { bufferEngine, type EngineClient } from '../engine/buffer.js';
import { badRequest, conflict } from '../http.js';

export interface EngineAccount {
  name: string;
  apiKey: string;
  organizationId: string;
  captionLimits: Record<string, number>;
}

export interface AccountsConfig {
  accounts: EngineAccount[];
  routing: Record<string, { account: string; channelId: string | null }>;
}

const captionLimitsOf = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) if (typeof v === 'number') out[k] = v;
  }
  return out;
};

// The same shape as the engine's loadAccountsConfig, built from the database. Keys are decrypted here and nowhere else;
// never log or return the result.
export async function loadAccountsConfig(deps: Pick<Deps, 'prisma' | 'config'>): Promise<AccountsConfig> {
  const [rows, routes] = await Promise.all([
    deps.prisma.bufferAccount.findMany({ orderBy: { name: 'asc' } }),
    deps.prisma.channelRoute.findMany({ include: { account: { select: { name: true } } } }),
  ]);
  const accounts = rows.map((a) => ({
    name: a.name,
    apiKey: decrypt(a.keyCipher, deps.config.keyring),
    organizationId: a.organizationId ?? '',
    captionLimits: captionLimitsOf(a.captionLimits),
  }));
  const routing: AccountsConfig['routing'] = {};
  for (const r of routes) routing[r.network] = { account: r.account.name, channelId: r.channelId || null };
  return { accounts, routing };
}

// One engine client per account, going through deps.fetchImpl so tests can fake Buffer.
export async function clientsFor(deps: Pick<Deps, 'fetchImpl'>, cfg: AccountsConfig): Promise<Map<string, EngineClient>> {
  const engine = await bufferEngine();
  return new Map(cfg.accounts.map((a) => [a.name, engine.createClient({ apiKey: a.apiKey, fetchImpl: deps.fetchImpl })]));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 7;

export function expiryInfo(keyExpiresAt: Date | null, now: Date): { daysLeft: number | null; expired: boolean; expiryWarning: boolean } {
  if (!keyExpiresAt) return { daysLeft: null, expired: false, expiryWarning: false };
  const daysLeft = Math.ceil((keyExpiresAt.getTime() - now.getTime()) / DAY_MS);
  return { daysLeft, expired: keyExpiresAt.getTime() <= now.getTime(), expiryWarning: daysLeft <= EXPIRY_WARNING_DAYS };
}

// What a page may see of an account: never the key or its cipher text.
export function publicAccount(a: BufferAccount, now: Date) {
  return {
    id: a.id,
    name: a.name,
    keyLast4: a.keyLast4,
    keyExpiresAt: a.keyExpiresAt,
    ...expiryInfo(a.keyExpiresAt, now),
    organizationId: a.organizationId,
    captionLimits: captionLimitsOf(a.captionLimits),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export interface ChannelInfo {
  id: string;
  name: string;
  displayName: string | null;
  service: string;
  network: string | null;
  organizationId: string;
  isQueuePaused: boolean;
}
export interface CheckResult {
  ok: boolean;
  organizations: Array<{ id: string; name: string }>;
  channels: ChannelInfo[];
  error?: string;
  status?: number;
  // True when several organisations exist and none is chosen, so every organisation's channels were listed.
  allOrganizations?: boolean;
}

// Same queries as the engine's `check` command (lib/schema.mjs). Never throws: a failure is reported in the result,
// with the key and any bearer token masked.
export async function checkAccount(deps: Pick<Deps, 'fetchImpl' | 'config'>, account: EngineAccount): Promise<CheckResult> {
  const engine = await bufferEngine();
  const client = engine.createClient({ apiKey: account.apiKey, fetchImpl: deps.fetchImpl, timeoutMs: 15_000, maxRetries429: 1 });
  const mask = (text: string) => engine.maskSecrets(text, [account.apiKey]);
  try {
    const acct = await client.gql('query { account { organizations { id name } } }');
    const organizations: Array<{ id: string; name: string }> = (acct?.account?.organizations ?? []).map((o: any) => ({ id: String(o.id), name: String(o.name ?? '') }));
    const wanted = account.organizationId ? organizations.filter((o) => o.id === account.organizationId) : organizations;
    const channels: ChannelInfo[] = [];
    for (const org of wanted) {
      const data = await client.gql(`query { channels(input: { organizationId: ${JSON.stringify(org.id)} }) { id name displayName service isQueuePaused } }`);
      for (const c of data?.channels ?? []) {
        channels.push({
          id: String(c.id), name: String(c.name ?? ''), displayName: c.displayName ?? null, service: String(c.service ?? ''),
          network: engine.networkOf(c.service), organizationId: org.id, isQueuePaused: !!c.isQueuePaused,
        });
      }
    }
    return { ok: true, organizations, channels, allOrganizations: !account.organizationId && organizations.length > 1 };
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return { ok: false, organizations: [], channels: [], error: mask(String(err.message ?? 'The check failed')).slice(0, 400), ...(typeof err.status === 'number' ? { status: err.status } : {}) };
  }
}

// ---- Creating an account: used by the admin page's route and by the one-time seed (seed.ts) ----------------------

const apiKeySchema = z.string().trim().min(8, 'The Buffer key looks too short').max(500).regex(/^\S+$/, 'The Buffer key cannot contain spaces');
export const expirySchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()]).nullable();
export const captionLimitsSchema = z.record(z.string(), z.number().int().min(1).max(1_000_000));

export const createBufferAccountSchema = z.object({
  name: z.string().trim(),
  apiKey: apiKeySchema,
  keyExpiresAt: expirySchema.optional(),
  organizationId: z.string().trim().max(200).nullable().optional(),
  captionLimits: captionLimitsSchema.optional(),
}).strict();

// The engine's own account name and network rules, as the admin page applies them.
export async function checkAccountInput(body: { name?: string; captionLimits?: Record<string, number> }): Promise<void> {
  const engine = await bufferEngine();
  if (body.name !== undefined && !engine.isValidAccountName(body.name)) {
    throw badRequest('The request is not valid', [{ path: 'name', message: 'Use letters, digits, _ and -, up to 32 characters' }]);
  }
  for (const n of Object.keys(body.captionLimits ?? {})) {
    if (!engine.networks.includes(n)) throw badRequest('The request is not valid', [{ path: `captionLimits.${n}`, message: `Unknown network. Use ${engine.networks.join(', ')}` }]);
  }
}

export const toDate = (v: string | null | undefined): Date | null | undefined => (v === undefined ? undefined : v === null ? null : new Date(v));

// Validates, refuses a name already taken, and stores the key encrypted. The caller writes the audit entry.
export async function createBufferAccount(deps: Pick<Deps, 'prisma' | 'config'>, body: z.infer<typeof createBufferAccountSchema>): Promise<BufferAccount> {
  await checkAccountInput(body);
  if (await deps.prisma.bufferAccount.findUnique({ where: { name: body.name } })) throw conflict('An account with this name already exists');
  return deps.prisma.bufferAccount.create({
    data: {
      name: body.name,
      keyCipher: encrypt(body.apiKey, deps.config.keyring),
      keyVersion: deps.config.keyring.currentVersion,
      keyLast4: last4(body.apiKey),
      keyExpiresAt: toDate(body.keyExpiresAt) ?? null,
      organizationId: body.organizationId || null,
      captionLimits: body.captionLimits ?? {},
    },
  });
}
