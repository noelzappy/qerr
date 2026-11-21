// Stored AI settings, opened for the code that calls the AI. Only getAiConfig decrypts; nothing here is returned to a page.
import { decrypt } from '../crypto.js';
import type { Deps } from '../deps.js';
import type { CreateAiOptions } from '../ai.js';
import { logger } from '../log.js';

export const SETTING_BUDGET = 'monthlyBudgetUsd';
export const SETTING_TOPICS = 'researchTopics';
export const SETTING_RESEARCH_LAST_RUN = 'researchLastRunAt';

// The calendar month (UTC) that `now` falls in, as [start, next month's start).
export function monthRange(now: Date): { start: Date; end: Date } {
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

export async function getSetting<T>(deps: Pick<Deps, 'prisma'>, key: string, fallback: T): Promise<T> {
  const row = await deps.prisma.appSetting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function setSetting(deps: Pick<Deps, 'prisma'>, key: string, value: unknown): Promise<void> {
  await deps.prisma.appSetting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}

// Month-to-date spend: the sum of the cost of every call logged this month. Calls whose cost is unknown add nothing.
export async function spentThisMonth(deps: Pick<Deps, 'prisma' | 'now'>): Promise<number> {
  const { start, end } = monthRange(deps.now());
  const sum = await deps.prisma.aiCall.aggregate({ _sum: { costUsd: true }, where: { at: { gte: start, lt: end } } });
  return sum._sum.costUsd ?? 0;
}

// How many calls this month have no cost estimate (no prices set for the model), so the budget cannot count them.
export async function unpricedCallsThisMonth(deps: Pick<Deps, 'prisma' | 'now'>): Promise<number> {
  const { start, end } = monthRange(deps.now());
  return deps.prisma.aiCall.count({ where: { at: { gte: start, lt: end }, kind: 'llm', ok: true, costUsd: null } });
}

export type AiConfig = CreateAiOptions & { providers: NonNullable<CreateAiOptions['providers']>; budget: { monthlyLimitUsd: number; spentUsd: number }; flush(): Promise<void> };

export interface AiRunContext { runId?: string; actorId?: string | null }

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// The shape the AI package's createAI(...) takes (docs/ai.md), keys decrypted. Only enabled providers are passed.
// The budget is always passed: with no budget saved the limit is 0, so nothing is spent until an admin sets one.
// `log` saves one ai_calls row per call the library reports (its cost is what month-to-date spend adds up); await
// `flush()` after the calls so the last row is saved.
export async function getAiConfig(deps: Pick<Deps, 'prisma' | 'config' | 'now'>, run: AiRunContext = {}): Promise<AiConfig> {
  const [providers, search, limit, spent] = await Promise.all([
    deps.prisma.aiProvider.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' } }),
    deps.prisma.searchSetting.findUnique({ where: { id: 'search' } }),
    getSetting<unknown>(deps, SETTING_BUDGET, 0),
    spentThisMonth(deps),
  ]);
  const pending: Promise<void>[] = [];
  return {
    providers: providers.map((p) => ({
      id: p.id, kind: p.kind as 'anthropic' | 'openai-compatible', baseUrl: p.baseUrl, model: p.model,
      apiKey: decrypt(p.keyCipher, deps.config.keyring), tasks: [...p.tasks],
      ...(p.inputPricePerMTok !== null && p.outputPricePerMTok !== null ? { prices: { [p.model]: { inputPerMTok: p.inputPricePerMTok, outputPerMTok: p.outputPricePerMTok } } } : {}),
    })),
    search: search ? { kind: search.kind as 'brave' | 'tavily' | 'exa', apiKey: decrypt(search.keyCipher, deps.config.keyring) } : null,
    budget: { monthlyLimitUsd: typeof limit === 'number' ? limit : 0, spentUsd: spent },
    log: (record) => {
      const at = typeof record.at === 'string' && !Number.isNaN(Date.parse(record.at)) ? new Date(record.at) : deps.now();
      const row = {
        at, kind: typeof record.kind === 'string' ? record.kind.slice(0, 20) : 'llm',
        task: typeof record.task === 'string' ? record.task.slice(0, 20) : null,
        provider: typeof record.provider === 'string' ? record.provider.slice(0, 80) : null,
        model: typeof record.model === 'string' ? record.model.slice(0, 120) : null,
        tokensIn: finite(record.tokensIn), tokensOut: finite(record.tokensOut),
        costUsd: finite(record.costUsd ?? record.cost),
        durationMs: finite(record.ms), ok: record.ok !== false,
        error: typeof record.error === 'string' ? record.error.slice(0, 500) : null,
        runId: run.runId ?? null, actorId: run.actorId ?? null,
      };
      pending.push(deps.prisma.aiCall.create({ data: row }).then(() => undefined, (e) => logger.error('ai.call_not_saved', { message: String((e as Error).message).slice(0, 200) })));
    },
    flush: async () => { await Promise.all(pending); },
  };
}
