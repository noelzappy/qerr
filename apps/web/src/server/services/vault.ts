// Vault items: shared by the routes, the AI jobs and (through vault-rules) batch approval.
import type { VaultItem } from '@prisma/client';
import { audit } from '../audit.js';
import type { Deps } from '../deps.js';
import { DEFAULT_STALE_FIGURE_DAYS, rightsProblems, sourceProblems, staleInfo } from './vault-rules.js';
import { framingOfItem } from './screen-framing.js';

export const VAULT_KINDS = ['fact', 'figure', 'news', 'event', 'product_note', 'story', 'photo', 'screen'] as const;
export const LICENCES = ['own', 'licensed', 'rights_to_confirm'] as const;

export async function staleFigureDays(deps: Pick<Deps, 'prisma'>): Promise<number> {
  const row = await deps.prisma.appSetting.findUnique({ where: { key: 'staleFigureDays' } });
  const v = row?.value;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : DEFAULT_STALE_FIGURE_DAYS;
}

// What a page sees: no storage key; stale computed now; the reasons the item is not yet usable.
export function publicVaultItem(item: VaultItem, now: Date, days: number) {
  const { fileKey, ...rest } = item;
  const s = staleInfo(item, now, days);
  return {
    ...rest,
    hasFile: !!fileKey,
    // a screen: a framed phone capture, a bare phone screenshot (a look's phone design draws the phone round it) or a desktop one; null when unknown
    framing: framingOfItem(item),
    stale: s.stale,
    staleReason: s.staleReason,
    problems: { rights: rightsProblems(item), source: sourceProblems(item, { now, staleFigureDays: days }) },
  };
}

export interface SystemVaultInput {
  kind: (typeof VAULT_KINDS)[number];
  title: string;
  body?: string;
  sourceUrl?: string | null;
  sourceNotes?: string | null;
  recordedAt?: Date | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  tags?: string[];
  createdById?: string | null;
}

// The only way code (research, imports) puts an item in the vault. It is always unconfirmed: only a person signed in
// can confirm, through the confirm route. The input type has no status field on purpose.
export async function createVaultItemFromSystem(deps: Pick<Deps, 'prisma'>, data: SystemVaultInput, actor?: { id?: string | null; email?: string | null } | null): Promise<VaultItem> {
  const item = await deps.prisma.vaultItem.create({
    data: {
      kind: data.kind, title: data.title.slice(0, 200), body: (data.body ?? '').slice(0, 20_000),
      sourceUrl: data.sourceUrl ?? null, sourceNotes: data.sourceNotes ?? null,
      recordedAt: data.recordedAt ?? null, validFrom: data.validFrom ?? null, validUntil: data.validUntil ?? null,
      tags: data.tags ?? [], createdById: data.createdById ?? null,
      status: 'unconfirmed', confirmedById: null, confirmedAt: null,
    },
  });
  await audit(deps, actor ?? null, 'vault.create', 'vault_item', item.id, { kind: item.kind, title: item.title, source: 'system', status: 'unconfirmed' });
  return item;
}
