// Admin only: the Buffer accounts (one API key each). Keys are encrypted at rest and never come back out; pages see
// the last four characters and the expiry. The engine's account name and network rules are used as they are.
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import { encrypt, last4 } from '../crypto.js';
import type { AppEnv, Deps } from '../deps.js';
import { badRequest, conflict, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { checkAccountInput, createBufferAccount, createBufferAccountSchema, expirySchema, captionLimitsSchema, publicAccount, toDate } from '../services/buffer-accounts.js';
import { checkAndCache } from '../services/channels.js';

const createBody = createBufferAccountSchema;

const updateBody = z.object({
  name: z.string().trim().optional(),
  // Blank (or missing) keeps the stored key.
  apiKey: z.string().trim().max(500).optional(),
  keyExpiresAt: expirySchema.optional(),
  organizationId: z.string().trim().max(200).nullable().optional(),
  captionLimits: captionLimitsSchema.optional(),
}).strict();

export function bufferAccountsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));

  const find = async (id: string) => {
    const a = await deps.prisma.bufferAccount.findUnique({ where: { id } });
    if (!a) throw notFound('Buffer account not found');
    return a;
  };

  app.get('/', async (c) => {
    const rows = await deps.prisma.bufferAccount.findMany({ orderBy: { name: 'asc' } });
    const now = deps.now();
    return c.json({ accounts: rows.map((a) => publicAccount(a, now)) });
  });

  app.post('/', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, createBody);
    const row = await createBufferAccount(deps, body);
    await audit(deps, actor, 'buffer_account.create', 'buffer_account', row.id, {
      name: row.name, keyChanged: true, keyExpiresAt: row.keyExpiresAt, organizationId: row.organizationId, captionLimits: row.captionLimits,
    });
    return c.json({ account: publicAccount(row, deps.now()) }, 201);
  });

  app.patch('/:id', async (c) => {
    const actor = c.get('user');
    const account = await find(c.req.param('id'));
    const body = await readJson(c, updateBody);
    await checkAccountInput(body);
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    if (body.name !== undefined && body.name !== account.name) {
      if (await deps.prisma.bufferAccount.findUnique({ where: { name: body.name } })) throw conflict('An account with this name already exists');
      // Deliveries record the account by name, so renaming one that has sent posts would orphan that history.
      const used = await deps.prisma.delivery.count({ where: { account: account.name } });
      if (used) throw conflict(`This account has ${used} ${used === 1 ? 'delivery' : 'deliveries'} on record under its name, so it cannot be renamed. Create a new account instead.`);
      data.name = body.name;
      changed.push('name');
    }
    const keyChanged = !!body.apiKey;
    if (body.apiKey) {
      if (body.apiKey.length < 8 || /\s/.test(body.apiKey)) throw badRequest('The request is not valid', [{ path: 'apiKey', message: 'The Buffer key looks wrong' }]);
      Object.assign(data, { keyCipher: encrypt(body.apiKey, deps.config.keyring), keyVersion: deps.config.keyring.currentVersion, keyLast4: last4(body.apiKey) });
      changed.push('apiKey');
    }
    if (body.keyExpiresAt !== undefined) { data.keyExpiresAt = toDate(body.keyExpiresAt); changed.push('keyExpiresAt'); }
    if (body.organizationId !== undefined) { data.organizationId = body.organizationId || null; changed.push('organizationId'); }
    if (body.captionLimits !== undefined) { data.captionLimits = body.captionLimits; changed.push('captionLimits'); }
    const row = changed.length ? await deps.prisma.bufferAccount.update({ where: { id: account.id }, data }) : account;
    if (changed.length) await audit(deps, actor, 'buffer_account.update', 'buffer_account', row.id, { name: row.name, changed: changed.filter((f) => f !== 'apiKey'), ...(keyChanged ? { keyChanged: true } : {}) });
    return c.json({ account: publicAccount(row, deps.now()) });
  });

  app.delete('/:id', async (c) => {
    const actor = c.get('user');
    const account = await find(c.req.param('id'));
    const [routes, deliveries] = await Promise.all([
      deps.prisma.channelRoute.findMany({ where: { accountId: account.id }, select: { network: true } }),
      deps.prisma.delivery.count({ where: { account: account.name } }),
    ]);
    const reasons: string[] = [];
    if (routes.length) reasons.push(`it is the route for ${routes.map((r) => r.network).join(', ')}`);
    if (deliveries) reasons.push(`${deliveries} ${deliveries === 1 ? 'delivery refers' : 'deliveries refer'} to it`);
    if (reasons.length) throw conflict(`This account cannot be deleted: ${reasons.join(' and ')}. ${routes.length ? 'Remove or change the routing first.' : ''}`.trim());
    await deps.prisma.bufferAccount.delete({ where: { id: account.id } });
    await audit(deps, actor, 'buffer_account.delete', 'buffer_account', account.id, { name: account.name });
    return c.json({ ok: true });
  });

  // Tests the stored key against Buffer and lists what it can reach. Always 200: a bad key is an answer, not a fault.
  app.post('/:id/check', async (c) => {
    const actor = c.get('user');
    const account = await find(c.req.param('id'));
    const result = await checkAndCache(deps, account);
    await audit(deps, actor, 'buffer_account.check', 'buffer_account', account.id, {
      name: account.name, ok: result.ok, organizations: result.organizations.length, channels: result.channels.length, ...(result.ok ? {} : { error: result.error }),
    });
    return c.json(result);
  });

  return app;
}
