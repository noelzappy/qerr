// The views that look across batches, mounted at /api/overview: the home page (counts, what is up next, the setup steps),
// the publishing calendar and the channel list in the sidebar. Read only; everyone signed in may read them.
import { Hono } from 'hono';
import { z } from 'zod';
import type { Post } from '@prisma/client';
import { brandInfo } from '../brand.js';
import type { AppEnv, Deps } from '../deps.js';
import { readQuery } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { getSetting, SETTING_BUDGET, spentThisMonth } from '../services/ai-config.js';
import { NETWORK_NAMES } from '../services/batches.js';
import { postSummary } from '../services/post-view.js';
import { splitNetworks } from '../services/post-model.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const calendarQuery = z.object({
  from: z.string().regex(DATE),
  to: z.string().regex(DATE),
  network: z.enum(NETWORK_NAMES).optional(),
}).strict();

// Today's date where the brand is, as YYYY-MM-DD.
export function todayIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type PostWithBatch = Post & { batch: { id: string; title: string; status: string; timezone: string; defaultNetworks: string[] }; deliveries: Array<{ network: string; mode: string; status: string; bufferStatus: string | null }> };

// The networks a post goes to: its batch's networks without the ones it skips.
const networksOf = (p: PostWithBatch) => { const { skip } = splitNetworks(p.networks); return p.batch.defaultNetworks.filter((n) => !skip.includes(n)); };

async function item(deps: Deps, p: PostWithBatch) {
  return {
    ...(await postSummary(deps, p)),
    batch: { id: p.batch.id, title: p.batch.title, status: p.batch.status, timezone: p.batch.timezone },
    networks: networksOf(p),
    deliveries: p.deliveries.map((d) => ({ network: d.network, mode: d.mode, status: d.status, bufferStatus: d.bufferStatus })),
  };
}

const include = {
  batch: { select: { id: true, title: true, status: true, timezone: true, defaultNetworks: true } },
  deliveries: { select: { network: true, mode: true, status: true, bufferStatus: true } },
} as const;

export function overviewRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  app.get('/calendar', async (c) => {
    const q = readQuery(c, calendarQuery);
    const span = (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000;
    if (!(span >= 0 && span <= 62)) return c.json({ error: 'Ask for at most 62 days at a time, from before to' }, 400);
    const posts = await deps.prisma.post.findMany({
      where: { status: { not: 'removed' }, date: { gte: q.from, lte: q.to }, ...(q.network ? { batch: { defaultNetworks: { has: q.network } } } : {}) },
      include, orderBy: [{ date: 'asc' }, { time: 'asc' }, { position: 'asc' }], take: 500,
    }) as PostWithBatch[];
    const list = q.network ? posts.filter((p) => networksOf(p).includes(q.network!)) : posts;
    return c.json({ posts: await Promise.all(list.map((p) => item(deps, p))) });
  });

  app.get('/channels', async (c) => {
    const today = todayIn(brandInfo().timezone, deps.now());
    const [routes, upcoming] = await Promise.all([
      deps.prisma.channelRoute.findMany({ select: { network: true, channelName: true } }),
      deps.prisma.post.findMany({ where: { status: { not: 'removed' }, date: { gte: today } }, select: { date: true, networks: true, batch: { select: { defaultNetworks: true } } } }),
    ]);
    const counts = new Map<string, number>();
    for (const p of upcoming) for (const n of networksOf(p as unknown as PostWithBatch)) counts.set(n, (counts.get(n) ?? 0) + 1);
    return c.json({
      upcoming: upcoming.length,
      // The date of the next planned post, for the calendar's "go there"
      next: upcoming.reduce<string | null>((min, p) => (min === null || p.date < min ? p.date : min), null),
      channels: NETWORK_NAMES.map((network) => {
        const r = routes.find((x) => x.network === network);
        return { network, connected: !!r, channelName: r?.channelName ?? null, upcoming: counts.get(network) ?? 0 };
      }),
    });
  });

  app.get('/home', async (c) => {
    const user = c.get('user');
    const now = deps.now();
    const today = todayIn(brandInfo().timezone, now);
    const weekEnd = addDays(today, 6);
    const [upNext, weekCount, awaiting, upcomingCount, failed] = await Promise.all([
      deps.prisma.post.findMany({ where: { status: { not: 'removed' }, date: { gte: today } }, include, orderBy: [{ date: 'asc' }, { time: 'asc' }, { position: 'asc' }], take: 6 }) as Promise<PostWithBatch[]>,
      deps.prisma.post.count({ where: { status: { not: 'removed' }, date: { gte: today, lte: weekEnd } } }),
      deps.prisma.post.count({ where: { status: 'draft', batch: { status: { in: ['draft', 'in_review'] } } } }),
      deps.prisma.post.count({ where: { status: { not: 'removed' }, date: { gte: today } } }),
      deps.prisma.delivery.count({ where: { OR: [{ status: { in: ['failed', 'unknown'] } }, { bufferStatus: 'failed' }] } }),
    ]);
    const isAdmin = user.role === 'admin';
    let setup: Array<{ key: string; title: string; detail: string; to: string; done: boolean }> = [];
    let spend: { spentUsd: number; monthlyBudgetUsd: number | null } | null = null;
    if (isAdmin) {
      const [brand, accounts, routes, providers, vault, users, invites, batches, budget, spent] = await Promise.all([
        deps.prisma.brandProfile.findUnique({ where: { id: 'brand' }, select: { logoFullKey: true, logoMarkKey: true } }),
        deps.prisma.bufferAccount.count(),
        deps.prisma.channelRoute.count(),
        deps.prisma.aiProvider.count({ where: { enabled: true } }),
        deps.prisma.vaultItem.count({ where: { deletedAt: null, status: 'confirmed' } }),
        deps.prisma.user.count({ where: { disabled: false } }),
        deps.prisma.invite.count(),
        deps.prisma.batch.count(),
        getSetting<unknown>(deps, SETTING_BUDGET, null),
        spentThisMonth(deps),
      ]);
      spend = { spentUsd: spent, monthlyBudgetUsd: typeof budget === 'number' ? budget : null };
      setup = [
        { key: 'brand', title: 'Set up your brand', detail: 'Name, colours, voice and the look of your posts.', to: '/settings/brand', done: !!brand },
        { key: 'logo', title: 'Upload your logo', detail: 'Posts carry your logo; images are made once it is here.', to: '/settings/brand#logos', done: !!brand?.logoFullKey && !!brand.logoMarkKey },
        { key: 'buffer', title: 'Connect Buffer', detail: 'Add the API key of the Buffer account that holds your channels.', to: '/settings/accounts', done: accounts > 0 },
        { key: 'channels', title: 'Choose your channels', detail: 'Pick the channel each network posts to.', to: '/settings/channels', done: routes > 0 },
        { key: 'ai', title: 'Add an AI provider', detail: 'A model drafts posts from your facts and describes your design references.', to: '/settings/ai', done: providers > 0 && typeof budget === 'number' && budget > 0 },
        { key: 'vault', title: 'Add your facts', detail: 'Confirmed facts, figures and photos are all the AI may use.', to: '/vault', done: vault > 0 },
        { key: 'team', title: 'Invite your team', detail: 'Editors draft and review; admins also change settings.', to: '/settings/team', done: users > 1 || invites > 0 },
        { key: 'batch', title: 'Plan your first posts', detail: 'Draft a month of posts with AI or start a batch by hand.', to: '/create', done: batches > 0 },
      ];
    }
    return c.json({
      today,
      counts: { thisWeek: weekCount, awaitingApproval: awaiting, upcoming: upcomingCount, deliveryProblems: failed },
      upNext: await Promise.all(upNext.map((p) => item(deps, p))),
      setup,
      spend,
    });
  });

  return app;
}
