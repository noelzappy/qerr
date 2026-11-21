// Admin only: AI providers, the search service, the monthly budget and the research topics. Keys are stored
// encrypted and never returned; pages see the last four characters. Mounted at /api/settings.
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import { encrypt, last4 } from '../crypto.js';
import type { AppEnv, Deps } from '../deps.js';
import { badRequest, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { enqueueTracked } from '../services/activity.js';
import { getSetting, SETTING_BUDGET, SETTING_TOPICS, setSetting, spentThisMonth, unpricedCallsThisMonth } from '../services/ai-config.js';
import { aiKeySchema, budgetSchema, createAiProvider, priceSchema, providerCreateSchema, providerKindSchema, resolveBaseUrl, saveMonthlyBudget, saveSearchSetting, searchSchema, tasksSchema } from '../services/ai-settings.js';

const key = aiKeySchema;
const tasks = tasksSchema;
const kind = providerKindSchema;
const price = priceSchema;

const providerPatch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  kind: kind.optional(),
  baseUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  // Blank keeps the stored key.
  apiKey: z.string().trim().max(500).optional(),
  tasks: tasks.optional(),
  enabled: z.boolean().optional(),
  inputPricePerMTok: price.nullish(),
  outputPricePerMTok: price.nullish(),
}).strict();

const searchBody = searchSchema;
const budgetBody = budgetSchema;
const topicsBody = z.object({ topics: z.array(z.string().trim().min(1).max(200)).max(50) }).strict();

const publicProvider = (p: { id: string; name: string; kind: string; baseUrl: string; model: string; keyLast4: string; tasks: string[]; enabled: boolean; inputPricePerMTok: number | null; outputPricePerMTok: number | null; updatedAt: Date }) => ({
  id: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, model: p.model, keyLast4: p.keyLast4, tasks: p.tasks, enabled: p.enabled,
  inputPricePerMTok: p.inputPricePerMTok, outputPricePerMTok: p.outputPricePerMTok, updatedAt: p.updatedAt,
});

export function aiSettingsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));

  const resolveUrl = resolveBaseUrl;

  app.get('/ai', async (c) => {
    const [providers, search, budget, spent, unpriced, topics] = await Promise.all([
      deps.prisma.aiProvider.findMany({ orderBy: { createdAt: 'asc' } }),
      deps.prisma.searchSetting.findUnique({ where: { id: 'search' } }),
      getSetting<unknown>(deps, SETTING_BUDGET, null),
      spentThisMonth(deps),
      unpricedCallsThisMonth(deps),
      getSetting<unknown>(deps, SETTING_TOPICS, []),
    ]);
    return c.json({
      providers: providers.map(publicProvider),
      search: search ? { kind: search.kind, keyLast4: search.keyLast4, updatedAt: search.updatedAt } : null,
      budget: { monthlyBudgetUsd: typeof budget === 'number' ? budget : null, spentUsd: spent, unpricedCalls: unpriced, month: deps.now().toISOString().slice(0, 7) },
      topics: Array.isArray(topics) ? topics : [],
    });
  });

  app.post('/ai/providers', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, providerCreateSchema);
    const row = await createAiProvider(deps, body);
    const baseUrl = row.baseUrl;
    await audit(deps, actor, 'ai_provider.create', 'ai_provider', row.id, { name: row.name, kind: row.kind, baseUrl, model: row.model, tasks: row.tasks, enabled: row.enabled, keyChanged: true });
    return c.json({ provider: publicProvider(row) }, 201);
  });

  app.patch('/ai/providers/:id', async (c) => {
    const actor = c.get('user');
    const existing = await deps.prisma.aiProvider.findUnique({ where: { id: c.req.param('id') } });
    if (!existing) throw notFound('Provider not found');
    const body = await readJson(c, providerPatch);
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    for (const f of ['name', 'model', 'tasks', 'enabled'] as const) if (body[f] !== undefined) { data[f] = body[f]; changed.push(f); }
    if (body.inputPricePerMTok !== undefined || body.outputPricePerMTok !== undefined) {
      const input = body.inputPricePerMTok === undefined ? existing.inputPricePerMTok : body.inputPricePerMTok;
      const output = body.outputPricePerMTok === undefined ? existing.outputPricePerMTok : body.outputPricePerMTok;
      if ((input === null) !== (output === null)) throw badRequest('The request is not valid', [{ path: 'inputPricePerMTok', message: 'Set both prices or neither' }]);
      data.inputPricePerMTok = input;
      data.outputPricePerMTok = output;
      changed.push('prices');
    }
    const newKind = body.kind ?? existing.kind;
    if (body.kind !== undefined) { data.kind = body.kind; changed.push('kind'); }
    if (body.baseUrl !== undefined || body.kind !== undefined) {
      data.baseUrl = resolveUrl(newKind, body.baseUrl ?? existing.baseUrl);
      changed.push('baseUrl');
    }
    const keyChanged = !!body.apiKey;
    if (body.apiKey) {
      if (!key.safeParse(body.apiKey).success) throw badRequest('The request is not valid', [{ path: 'apiKey', message: 'The key looks wrong' }]);
      Object.assign(data, { keyCipher: encrypt(body.apiKey, deps.config.keyring), keyVersion: deps.config.keyring.currentVersion, keyLast4: last4(body.apiKey) });
    }
    const row = changed.length || keyChanged ? await deps.prisma.aiProvider.update({ where: { id: existing.id }, data }) : existing;
    await audit(deps, actor, 'ai_provider.update', 'ai_provider', row.id, { name: row.name, changed, ...(keyChanged ? { keyChanged: true } : {}) });
    return c.json({ provider: publicProvider(row) });
  });

  app.delete('/ai/providers/:id', async (c) => {
    const actor = c.get('user');
    const existing = await deps.prisma.aiProvider.findUnique({ where: { id: c.req.param('id') } });
    if (!existing) throw notFound('Provider not found');
    await deps.prisma.aiProvider.delete({ where: { id: existing.id } });
    await audit(deps, actor, 'ai_provider.delete', 'ai_provider', existing.id, { name: existing.name });
    return c.json({ ok: true });
  });

  app.put('/ai/search', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, searchBody);
    const { row, keyChanged } = await saveSearchSetting(deps, body);
    await audit(deps, actor, 'search_setting.update', 'search_setting', 'search', { kind: row.kind, ...(keyChanged ? { keyChanged: true } : {}) });
    return c.json({ search: { kind: row.kind, keyLast4: row.keyLast4, updatedAt: row.updatedAt } });
  });

  app.put('/ai/budget', async (c) => {
    const actor = c.get('user');
    const { monthlyBudgetUsd } = await readJson(c, budgetBody);
    const before = await getSetting<unknown>(deps, SETTING_BUDGET, null);
    await saveMonthlyBudget(deps, monthlyBudgetUsd);
    await audit(deps, actor, 'ai_budget.update', 'app_setting', SETTING_BUDGET, { from: typeof before === 'number' ? before : null, to: monthlyBudgetUsd });
    return c.json({ budget: { monthlyBudgetUsd, spentUsd: await spentThisMonth(deps) } });
  });

  app.put('/research/topics', async (c) => {
    const actor = c.get('user');
    const { topics } = await readJson(c, topicsBody);
    const clean = [...new Set(topics)];
    await setSetting(deps, SETTING_TOPICS, clean);
    await audit(deps, actor, 'research_topics.update', 'app_setting', SETTING_TOPICS, { count: clean.length });
    return c.json({ topics: clean });
  });

  // Queues a research run now. The job reads topics, providers and the budget itself; the payload holds no secrets.
  app.post('/research/run', async (c) => {
    const actor = c.get('user');
    const { jobId, activityId } = await enqueueTracked(deps, 'research-run', { actorId: actor.id }, { singletonKey: 'research-run' }, { title: 'Research run', actorId: actor.id });
    await audit(deps, actor, 'research.run_requested', 'research', null, { queued: jobId !== null });
    return c.json({ queued: jobId !== null, alreadyQueued: jobId === null, activityId }, 202);
  });

  return app;
}
