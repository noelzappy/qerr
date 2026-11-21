// One-time seed for a new deployment, run on start-up right after bootstrapAdmin. Two independent switches:
//
//   (vault)              the brand pack's vault.json (BRAND_DIR; the owner's confirmed facts) is imported automatically on a start where the
//                        vault has never held an item, together with its research topics when none are saved.
//                        SEED_VAULT=0 turns this off. Once an item exists, or the import has run, it never runs again
//                        (a marker setting records it, so deleting items later does not bring the seed back).
//   SEED_SECRETS_B64     base64 of a JSON object { bufferAccounts, routing, aiProviders, search?, aiMonthlyBudgetUsd? },
//                        made on the owner's machine by scripts/make-seed-secrets.mjs, so keys never pass through chat or git.
//
// Every part only fills what is empty, so a second start with the same environment changes nothing. Keys go through the
// same service functions the admin pages use (encrypted with APP_ENCRYPTION_KEY). Nothing here logs, audits or returns
// a key: logs carry counts, names and field paths, never values.
import fs from 'node:fs';
import { z } from 'zod';
import { audit, type AuditActor } from './audit.js';
import type { Deps } from './deps.js';
import { engineImport } from './engine/root.js';
import { HttpError } from './http.js';
import { describeError, type LogFn } from './log.js';
import { SETTING_BUDGET, SETTING_TOPICS, setSetting } from './services/ai-config.js';
import { budgetSchema, createAiProvider, providerCreateSchema, saveSearchSetting, searchSchema } from './services/ai-settings.js';
import { createBufferAccount, createBufferAccountSchema } from './services/buffer-accounts.js';
import { networkOrThrow, saveChannelRoute } from './services/routing.js';
import { VAULT_KINDS } from './services/vault.js';

const SETTING_VAULT_SEEDED = 'seedVaultImportedAt';
const SYSTEM: AuditActor = { id: null, email: 'system' };
const CONFIRMED_BY = "seed (the brand pack's vault.json)";

export interface SeedCounts {
  vault: number;
  researchTopics: number;
  bufferAccounts: number;
  routes: number;
  aiProviders: number;
  search: number;
  budget: number;
}

export interface SeedEnv {
  SEED_VAULT?: string;
  SEED_SECRETS_B64?: string;
  // A search key set directly in the environment is taken once, when no search provider is saved yet.
  BRAVE_SEARCH_API_KEY?: string;
  TAVILY_API_KEY?: string;
  EXA_API_KEY?: string;
}

// The brand pack's vault.json (see BRAND_DIR in the engine's core.mjs).
export async function defaultVaultFile(): Promise<string> {
  const core = await engineImport<{ brandFile(name: string): string }>('core');
  return core.brandFile('vault.json');
}

// ---- Vault ----------------------------------------------------------------------------------------------------

const day = z.union([z.iso.datetime({ offset: true }), z.iso.date()]).transform((v) => new Date(v));
const seedItem = z.object({
  // The seed file says "product"; the app's name for it is "product_note".
  kind: z.enum([...VAULT_KINDS, 'product']).transform((k) => (k === 'product' ? 'product_note' : k) as (typeof VAULT_KINDS)[number]),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20_000).default(''),
  sourceUrl: z.string().trim().max(2000).refine((v) => /^https?:\/\//i.test(v) && URL.canParse(v)).optional(),
  sourceNote: z.string().max(20_000).optional(),
  status: z.enum(['confirmed', 'unconfirmed']),
  validFrom: day.optional(),
  validUntil: day.optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]).transform((t) => [...new Set(t)]),
}).strict();
const seedFile = z.object({
  note: z.string().optional(),
  vault: z.array(seedItem).min(1),
  research: z.object({ topics: z.array(z.string().trim().min(1).max(200)).max(50) }).strict().optional(),
}).strict();

// Field names and problem codes only: a zod message could quote part of an offending value.
const fieldsOf = (prefix: string, error: z.ZodError): Array<{ field: string; problem: string }> =>
  error.issues.slice(0, 10).map((i) => ({ field: [prefix, ...i.path].filter((x) => x !== '').join('.'), problem: i.code }));

async function seedVault(deps: Pick<Deps, 'prisma' | 'now'>, file: string, log: LogFn, counts: SeedCounts): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    log('seed.invalid', { part: 'vault', field: 'seed file', problem: 'cannot be read as JSON' });
    return;
  }
  const parsed = seedFile.safeParse(raw);
  if (!parsed.success) {
    for (const f of fieldsOf('', parsed.error)) log('seed.invalid', { part: 'vault', ...f });
    return;
  }
  const { vault, research } = parsed.data;

  if (await deps.prisma.appSetting.findUnique({ where: { key: SETTING_VAULT_SEEDED } })) return;
  if ((await deps.prisma.vaultItem.count()) === 0) {
    const now = deps.now();
    // One transaction: a failure leaves the vault empty, so the next start tries again from the top.
    const created = await deps.prisma.$transaction(async (tx) => {
      const rows = [];
      for (const i of vault) {
        const confirmed = i.status === 'confirmed';
        // Created confirmed on purpose: the owner confirmed these facts. There is no human user to record as confirmer,
        // so confirmedById stays null and the audit entry says who vouched (see CONFIRMED_BY).
        rows.push(await tx.vaultItem.create({
          data: {
            kind: i.kind, title: i.title, body: i.body, sourceUrl: i.sourceUrl ?? null, sourceNotes: i.sourceNote ?? null,
            status: i.status, confirmedById: null, confirmedAt: confirmed ? now : null,
            validFrom: i.validFrom ?? null, validUntil: i.validUntil ?? null, tags: i.tags, createdById: null,
          },
        }));
      }
      for (const r of rows) {
        await audit({ prisma: tx as Deps['prisma'] }, SYSTEM, 'seed.vault_import', 'vault_item', r.id, {
          kind: r.kind, title: r.title, status: r.status, ...(r.status === 'confirmed' ? { confirmedBy: CONFIRMED_BY } : {}),
        });
      }
      return rows;
    });
    counts.vault = created.length;
  }

  // Topics only when none were ever saved; an admin who cleared them on purpose keeps the empty list.
  if (research && research.topics.length && !(await deps.prisma.appSetting.findUnique({ where: { key: SETTING_TOPICS } }))) {
    const topics = [...new Set(research.topics)];
    await setSetting(deps, SETTING_TOPICS, topics);
    await audit(deps, SYSTEM, 'seed.research_topics', 'app_setting', SETTING_TOPICS, { count: topics.length });
    counts.researchTopics = topics.length;
  }
  await setSetting(deps, SETTING_VAULT_SEEDED, deps.now().toISOString());
}

// ---- Secrets --------------------------------------------------------------------------------------------------

const seedRoute = z.object({
  network: z.string().trim(),
  account: z.string().trim().min(1),
  channelId: z.string().trim().min(1).max(200),
  channelName: z.string().trim().max(200).optional(),
}).strict();
const seedProvider = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  kind: z.string(),
  baseUrl: z.string().optional(),
  model: z.string(),
  apiKey: z.string(),
  tasks: z.array(z.string()),
  priceInPerMTok: z.number().optional(),
  priceOutPerMTok: z.number().optional(),
}).strict();
const seedSecrets = z.object({
  bufferAccounts: z.array(z.unknown()).optional(),
  routing: z.array(z.unknown()).optional(),
  aiProviders: z.array(z.unknown()).optional(),
  search: z.unknown().optional(),
  aiMonthlyBudgetUsd: z.unknown().optional(),
}).strict();

type Plan = { secrets: string[] };

// Reports a service refusal (an HttpError whose details name fields) without any value.
function refusalFields(prefix: string, e: unknown): Array<{ field: string; problem: string }> {
  if (e instanceof HttpError) {
    const details = Array.isArray(e.details) ? (e.details as Array<{ path?: string; message?: string }>) : [];
    if (details.length) return details.map((d) => ({ field: [prefix, d.path].filter(Boolean).join('.'), problem: String(d.message ?? e.message).slice(0, 200) }));
    return [{ field: prefix, problem: e.message.slice(0, 200) }];
  }
  return [];
}

async function seedSecretsPart(deps: Pick<Deps, 'prisma' | 'config' | 'now'>, b64: string, log: LogFn, counts: SeedCounts, plan: Plan): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf8'));
  } catch {
    log('seed.invalid', { part: 'secrets', field: 'SEED_SECRETS_B64', problem: 'not base64 of a JSON object' });
    return;
  }
  const top = seedSecrets.safeParse(raw);
  if (!top.success) {
    for (const f of fieldsOf('secrets', top.error)) log('seed.invalid', { part: 'secrets', ...f });
    return;
  }
  const data = top.data;
  // Remember every key so an unexpected error message can be scrubbed before it is logged.
  const collect = (v: unknown) => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k === 'apiKey' && typeof x === 'string') plan.secrets.push(x); };
  [...(data.bufferAccounts ?? []), ...(data.aiProviders ?? []), data.search].forEach(collect);

  const guard = async (part: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (e) { log('seed.failed', { part, error: describeError(e, plan.secrets) }); }
  };

  // Buffer accounts
  await guard('bufferAccounts', async () => {
    for (const [i, item] of (data.bufferAccounts ?? []).entries()) {
      const p = createBufferAccountSchema.safeParse(item);
      if (!p.success) { for (const f of fieldsOf(`bufferAccounts.${i}`, p.error)) log('seed.invalid', { part: 'bufferAccounts', ...f }); continue; }
      if (await deps.prisma.bufferAccount.findUnique({ where: { name: p.data.name } })) continue;
      try {
        const row = await createBufferAccount(deps, p.data);
        await audit(deps, SYSTEM, 'buffer_account.create', 'buffer_account', row.id, { name: row.name, keyChanged: true, keyExpiresAt: row.keyExpiresAt, organizationId: row.organizationId, captionLimits: row.captionLimits, seed: true });
        counts.bufferAccounts += 1;
      } catch (e) {
        const fields = refusalFields(`bufferAccounts.${i}`, e);
        if (!fields.length) throw e;
        for (const f of fields) log('seed.invalid', { part: 'bufferAccounts', ...f });
      }
    }
  });

  // Routing: only networks with no route yet, only to an account that exists now.
  await guard('routing', async () => {
    for (const [i, item] of (data.routing ?? []).entries()) {
      const p = seedRoute.safeParse(item);
      if (!p.success) { for (const f of fieldsOf(`routing.${i}`, p.error)) log('seed.invalid', { part: 'routing', ...f }); continue; }
      try {
        await networkOrThrow(p.data.network);
      } catch (e) {
        for (const f of refusalFields(`routing.${i}`, e)) log('seed.invalid', { part: 'routing', ...f });
        continue;
      }
      const account = await deps.prisma.bufferAccount.findUnique({ where: { name: p.data.account } });
      if (!account) { log('seed.invalid', { part: 'routing', field: `routing.${i}.account`, problem: 'no Buffer account has this name' }); continue; }
      if (await deps.prisma.channelRoute.findUnique({ where: { network: p.data.network } })) continue;
      const channelName = p.data.channelName ?? null;
      await saveChannelRoute(deps, { network: p.data.network, accountId: account.id, channelId: p.data.channelId, channelName });
      await audit(deps, SYSTEM, 'routing.set', 'channel_route', p.data.network, { network: p.data.network, account: account.name, channelId: p.data.channelId, channelName, verified: null, seed: true });
      counts.routes += 1;
    }
  });

  // AI providers: only when none exist at all.
  await guard('aiProviders', async () => {
    const list = data.aiProviders ?? [];
    if (!list.length || (await deps.prisma.aiProvider.count()) > 0) return;
    const ready: Array<z.infer<typeof providerCreateSchema>> = [];
    for (const [i, item] of list.entries()) {
      const s = seedProvider.safeParse(item);
      if (!s.success) { for (const f of fieldsOf(`aiProviders.${i}`, s.error)) log('seed.invalid', { part: 'aiProviders', ...f }); continue; }
      const { priceInPerMTok, priceOutPerMTok, name, ...rest } = s.data;
      const mapped = providerCreateSchema.safeParse({
        ...rest, name: name ?? `${rest.kind === 'anthropic' ? 'Anthropic' : 'AI provider'} ${rest.model}`.slice(0, 60),
        ...(priceInPerMTok !== undefined ? { inputPricePerMTok: priceInPerMTok } : {}),
        ...(priceOutPerMTok !== undefined ? { outputPricePerMTok: priceOutPerMTok } : {}),
      });
      if (!mapped.success) { for (const f of fieldsOf(`aiProviders.${i}`, mapped.error)) log('seed.invalid', { part: 'aiProviders', ...f }); continue; }
      ready.push(mapped.data);
    }
    for (const [i, body] of ready.entries()) {
      try {
        const row = await createAiProvider(deps, body);
        await audit(deps, SYSTEM, 'ai_provider.create', 'ai_provider', row.id, { name: row.name, kind: row.kind, baseUrl: row.baseUrl, model: row.model, tasks: row.tasks, enabled: row.enabled, keyChanged: true, seed: true });
        counts.aiProviders += 1;
      } catch (e) {
        const fields = refusalFields(`aiProviders.${i}`, e);
        if (!fields.length) throw e;
        for (const f of fields) log('seed.invalid', { part: 'aiProviders', ...f });
      }
    }
  });

  // Search: only when none is set.
  await guard('search', async () => {
    if (data.search === undefined || (await deps.prisma.searchSetting.findUnique({ where: { id: 'search' } }))) return;
    const p = searchSchema.safeParse(data.search);
    if (!p.success) { for (const f of fieldsOf('search', p.error)) log('seed.invalid', { part: 'search', ...f }); return; }
    try {
      const { row } = await saveSearchSetting(deps, p.data);
      await audit(deps, SYSTEM, 'search_setting.update', 'search_setting', 'search', { kind: row.kind, keyChanged: true, seed: true });
      counts.search += 1;
    } catch (e) {
      const fields = refusalFields('search', e);
      if (!fields.length) throw e;
      for (const f of fields) log('seed.invalid', { part: 'search', ...f });
    }
  });

  // Budget: only when none is saved.
  await guard('aiMonthlyBudgetUsd', async () => {
    if (data.aiMonthlyBudgetUsd === undefined || (await deps.prisma.appSetting.findUnique({ where: { key: SETTING_BUDGET } }))) return;
    const p = budgetSchema.safeParse({ monthlyBudgetUsd: data.aiMonthlyBudgetUsd });
    if (!p.success) { log('seed.invalid', { part: 'aiMonthlyBudgetUsd', field: 'aiMonthlyBudgetUsd', problem: p.error.issues[0]?.code ?? 'invalid' }); return; }
    await setSetting(deps, SETTING_BUDGET, p.data.monthlyBudgetUsd);
    await audit(deps, SYSTEM, 'ai_budget.update', 'app_setting', SETTING_BUDGET, { from: null, to: p.data.monthlyBudgetUsd, seed: true });
    counts.budget += 1;
  });
}

// ---- Entry point ----------------------------------------------------------------------------------------------

export async function runSeed(
  deps: Pick<Deps, 'prisma' | 'config' | 'now'>,
  env: SeedEnv,
  log: LogFn,
  options: { vaultFile?: string } = {},
): Promise<SeedCounts | null> {
  const wantVault = env.SEED_VAULT !== '0';
  const secretsB64 = env.SEED_SECRETS_B64?.trim();
  const envSearch = ([['brave', env.BRAVE_SEARCH_API_KEY], ['tavily', env.TAVILY_API_KEY], ['exa', env.EXA_API_KEY]] as const).find(([, k]) => k?.trim());
  if (!wantVault && !secretsB64 && !envSearch) return null;

  const counts: SeedCounts = { vault: 0, researchTopics: 0, bufferAccounts: 0, routes: 0, aiProviders: 0, search: 0, budget: 0 };
  const plan: Plan = { secrets: [] };
  if (wantVault) {
    try { await seedVault(deps, options.vaultFile ?? (await defaultVaultFile()), log, counts); } catch (e) { log('seed.failed', { part: 'vault', error: describeError(e) }); }
  }
  if (secretsB64) {
    try { await seedSecretsPart(deps, secretsB64, log, counts, plan); } catch (e) { log('seed.failed', { part: 'secrets', error: describeError(e, plan.secrets) }); }
  }
  if (envSearch && !(await deps.prisma.searchSetting.findUnique({ where: { id: 'search' } }))) {
    const key = envSearch[1]!.trim();
    try {
      const p = searchSchema.safeParse({ kind: envSearch[0], apiKey: key });
      if (!p.success) log('seed.invalid', { part: 'search', field: 'apiKey', problem: p.error.issues[0]?.code ?? 'invalid' });
      else {
        const { row } = await saveSearchSetting(deps, p.data);
        await audit(deps, SYSTEM, 'search_setting.update', 'search_setting', 'search', { kind: row.kind, keyChanged: true, seed: true, from: 'environment' });
        counts.search += 1;
      }
    } catch (e) { log('seed.failed', { part: 'search', error: describeError(e, [key]) }); }
  }
  // A plain start with nothing to do stays silent.
  if (!secretsB64 && Object.values(counts).every((n) => n === 0)) return counts;
  log('seed.done', { ...counts });
  if (secretsB64) log('seed.remove_env', { message: 'The seed has run. Remove SEED_SECRETS_B64 from the environment so the encoded keys do not stay there (a second start changes nothing).' });
  return counts;
}
