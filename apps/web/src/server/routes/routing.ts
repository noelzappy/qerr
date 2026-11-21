// Which Buffer account and channel each network posts to. Everyone signed in can read it; only admins change it.
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import type { AppEnv, Deps } from '../deps.js';
import { bufferEngine } from '../engine/buffer.js';
import { notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { expiryInfo } from '../services/buffer-accounts.js';
import { networkOrThrow, saveChannelRoute } from '../services/routing.js';
import { allChannels, cachedCheck } from '../services/channels.js';

const putBody = z.object({
  network: z.string().trim(),
  accountId: z.string().trim().min(1).max(100),
  channelId: z.string().trim().min(1).max(200),
  channelName: z.string().trim().max(200).nullable().optional(),
}).strict();

export function routingRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  // One entry per network, routed or not. `stale` lists what is wrong: an expired or soon-expiring key, or (when the
  // account's channels were fetched in the last minute) a channel the account no longer holds.
  app.get('/', async (c) => {
    const engine = await bufferEngine();
    const routes = await deps.prisma.channelRoute.findMany({ include: { account: true } });
    const byNetwork = new Map(routes.map((r) => [r.network, r]));
    const now = deps.now();
    const out = engine.networks.map((network) => {
      const r = byNetwork.get(network);
      if (!r) return { network, route: null };
      const info = expiryInfo(r.account.keyExpiresAt, now);
      const cached = cachedCheck(deps, r.account);
      const channelMissing = cached?.ok ? !cached.channels.some((ch) => ch.id === r.channelId) : null;
      return {
        network,
        route: {
          accountId: r.accountId, accountName: r.account.name, channelId: r.channelId, channelName: r.channelName, updatedAt: r.updatedAt,
          stale: { keyExpired: info.expired, expiryWarning: info.expiryWarning, daysLeft: info.daysLeft, channelMissing },
        },
      };
    });
    return c.json({ routing: out });
  });

  // Every account's channels, for the routing pickers. Cached for 60 seconds; ?refresh=1 asks Buffer again.
  app.get('/channels', requireRole('admin'), async (c) => {
    const rows = await allChannels(deps, c.req.query('refresh') === '1');
    return c.json({
      accounts: rows.map((r) => ({
        accountId: r.accountId, accountName: r.accountName, ok: r.ok, ...(r.error ? { error: r.error } : {}),
        organizations: r.organizations, channels: r.channels,
      })),
    });
  });

  app.put('/', requireRole('admin'), async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, putBody);
    const network = await networkOrThrow(body.network);
    const account = await deps.prisma.bufferAccount.findUnique({ where: { id: body.accountId } });
    if (!account) throw notFound('Buffer account not found');
    // Accepted as given; `verified` says whether a recent channel list confirms it (null when none was fetched).
    const cached = cachedCheck(deps, account);
    const verified = cached?.ok ? cached.channels.some((ch) => ch.id === body.channelId) : null;
    const channelName = body.channelName ?? cached?.channels.find((ch) => ch.id === body.channelId)?.name ?? null;
    const before = await deps.prisma.channelRoute.findUnique({ where: { network }, include: { account: { select: { name: true } } } });
    const row = await saveChannelRoute(deps, { network, accountId: account.id, channelId: body.channelId, channelName });
    await audit(deps, actor, 'routing.set', 'channel_route', network, {
      network, account: account.name, channelId: body.channelId, channelName, verified,
      ...(before ? { previousAccount: before.account.name, previousChannelId: before.channelId } : {}),
    });
    return c.json({ route: { network, accountId: row.accountId, accountName: account.name, channelId: row.channelId, channelName: row.channelName, updatedAt: row.updatedAt, verified } });
  });

  app.delete('/:network', requireRole('admin'), async (c) => {
    const actor = c.get('user');
    const network = await networkOrThrow(c.req.param('network'));
    const before = await deps.prisma.channelRoute.findUnique({ where: { network }, include: { account: { select: { name: true } } } });
    if (!before) throw notFound('No route is set for this network');
    await deps.prisma.channelRoute.delete({ where: { network } });
    await audit(deps, actor, 'routing.clear', 'channel_route', network, { network, account: before.account.name, channelId: before.channelId });
    return c.json({ ok: true });
  });

  return app;
}
