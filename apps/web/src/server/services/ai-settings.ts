// Saving AI providers, the search service and the monthly budget. Shared by the settings routes and the one-time seed.
import type { AiProvider, SearchSetting } from '@prisma/client';
import { z } from 'zod';
import { encrypt, last4 } from '../crypto.js';
import type { Deps } from '../deps.js';
import { badRequest } from '../http.js';
import { SETTING_BUDGET, setSetting } from './ai-config.js';

const TASKS = ['draft', 'research', 'rewrite'] as const;
const DEFAULT_ANTHROPIC_URL = 'https://api.anthropic.com';

// https only, except for a model server on this machine. No credentials or fragments in the address.
function checkBaseUrl(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch { throw badRequest('The request is not valid', [{ path: 'baseUrl', message: 'Enter a full address such as https://api.example.com' }]); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) {
    throw badRequest('The request is not valid', [{ path: 'baseUrl', message: 'The address must start with https:// (http:// is only allowed for localhost)' }]);
  }
  if (u.username || u.password || u.hash) throw badRequest('The request is not valid', [{ path: 'baseUrl', message: 'Leave passwords and # parts out of the address' }]);
  return u.toString().replace(/\/+$/, '');
}

export const resolveBaseUrl = (k: string, raw: string | undefined): string => {
  if (!raw) {
    if (k === 'anthropic') return DEFAULT_ANTHROPIC_URL;
    throw badRequest('The request is not valid', [{ path: 'baseUrl', message: 'The address is required for this kind of provider' }]);
  }
  return checkBaseUrl(raw);
};

export const aiKeySchema = z.string().trim().min(8, 'The key looks too short').max(500).regex(/^\S+$/, 'The key cannot contain spaces');
export const tasksSchema = z.array(z.enum(TASKS)).min(1, 'Pick at least one task').transform((t) => [...new Set(t)]);
export const providerKindSchema = z.enum(['anthropic', 'openai-compatible']);

// US dollars per million tokens. Both or neither.
export const priceSchema = z.number().min(0).max(100_000);

export const providerCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: providerKindSchema,
  baseUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().min(1).max(120),
  apiKey: aiKeySchema,
  tasks: tasksSchema,
  enabled: z.boolean().optional(),
  inputPricePerMTok: priceSchema.nullish(),
  outputPricePerMTok: priceSchema.nullish(),
}).strict().refine((b) => (b.inputPricePerMTok == null) === (b.outputPricePerMTok == null), { message: 'Set both prices or neither', path: ['inputPricePerMTok'] });

export const searchSchema = z.object({ kind: z.enum(['brave', 'tavily', 'exa']), apiKey: z.string().trim().max(500).optional() }).strict();
export const budgetSchema = z.object({ monthlyBudgetUsd: z.number().min(0).max(1_000_000) }).strict();

// The caller writes the audit entry.
export function createAiProvider(deps: Pick<Deps, 'prisma' | 'config'>, body: z.infer<typeof providerCreateSchema>): Promise<AiProvider> {
  const baseUrl = resolveBaseUrl(body.kind, body.baseUrl);
  return deps.prisma.aiProvider.create({
    data: {
      name: body.name, kind: body.kind, baseUrl, model: body.model, tasks: body.tasks, enabled: body.enabled ?? true,
      inputPricePerMTok: body.inputPricePerMTok ?? null, outputPricePerMTok: body.outputPricePerMTok ?? null,
      keyCipher: encrypt(body.apiKey, deps.config.keyring), keyVersion: deps.config.keyring.currentVersion, keyLast4: last4(body.apiKey),
    },
  });
}

// First save needs a key; later saves without one only change the kind. The caller writes the audit entry.
export async function saveSearchSetting(deps: Pick<Deps, 'prisma' | 'config'>, body: z.infer<typeof searchSchema>): Promise<{ row: SearchSetting; keyChanged: boolean }> {
  const existing = await deps.prisma.searchSetting.findUnique({ where: { id: 'search' } });
  if (!body.apiKey && !existing) throw badRequest('The request is not valid', [{ path: 'apiKey', message: 'The key is required the first time' }]);
  if (body.apiKey && !aiKeySchema.safeParse(body.apiKey).success) throw badRequest('The request is not valid', [{ path: 'apiKey', message: 'The key looks wrong' }]);
  const secret = body.apiKey
    ? { keyCipher: encrypt(body.apiKey, deps.config.keyring), keyVersion: deps.config.keyring.currentVersion, keyLast4: last4(body.apiKey) }
    : null;
  const row = secret
    ? await deps.prisma.searchSetting.upsert({ where: { id: 'search' }, create: { id: 'search', kind: body.kind, ...secret }, update: { kind: body.kind, ...secret } })
    : await deps.prisma.searchSetting.update({ where: { id: 'search' }, data: { kind: body.kind } });
  return { row, keyChanged: !!secret };
}

export const saveMonthlyBudget = (deps: Pick<Deps, 'prisma'>, monthlyBudgetUsd: number): Promise<void> => setSetting(deps, SETTING_BUDGET, monthlyBudgetUsd);
