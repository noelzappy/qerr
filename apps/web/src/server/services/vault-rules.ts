// What makes a vault item usable in an approved post. Pure functions: batch approval imports these.
// Reasons are plain sentences meant to be shown next to the item.
export const DEFAULT_STALE_FIGURE_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const FILE_KINDS = ['photo', 'screen'];

export interface VaultRuleItem {
  kind: string;
  title?: string | null;
  status: string;
  fileKey?: string | null;
  licence?: string | null;
  peoplePresent?: boolean | null;
  consentRecorded?: boolean | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  recordedAt?: Date | null;
  createdAt?: Date | null;
  deletedAt?: Date | null;
}

export interface StaleInfo { stale: boolean; staleReason: string | null }

const day = (d: Date) => d.toISOString().slice(0, 10);

// A figure goes stale after validUntil, or when its date (validFrom, else recordedAt, else created) is older than the
// stale-figure window. Any other kind is stale only when it has a validUntil that has passed.
export function staleInfo(item: VaultRuleItem, now: Date = new Date(), staleFigureDays: number = DEFAULT_STALE_FIGURE_DAYS): StaleInfo {
  if (item.validUntil && item.validUntil.getTime() < now.getTime()) {
    return { stale: true, staleReason: `This was only valid until ${day(item.validUntil)}` };
  }
  if (item.kind === 'figure') {
    const base = item.validFrom ?? item.recordedAt ?? item.createdAt ?? null;
    if (base && now.getTime() - base.getTime() > staleFigureDays * DAY_MS) {
      return { stale: true, staleReason: `This figure is dated ${day(base)}, more than ${staleFigureDays} days ago. Check it is still right` };
    }
  }
  return { stale: false, staleReason: null };
}

// Why a photo or screen cannot go in an approved post. Other kinds have no rights rules.
export function rightsProblems(item: VaultRuleItem): string[] {
  if (!FILE_KINDS.includes(item.kind)) return [];
  const out: string[] = [];
  const name = item.title ? `"${item.title}"` : 'This item';
  if (!item.fileKey) out.push(`${name} has no file uploaded`);
  if (!item.licence) out.push(`${name} has no licence recorded. Say whether it is your own, licensed, or still to be confirmed`);
  else if (item.licence === 'rights_to_confirm') out.push(`${name} is marked "rights to confirm". Confirm who owns it before using it`);
  if (item.peoplePresent && !item.consentRecorded) out.push(`${name} shows people and no consent is recorded`);
  return out;
}

// Why the facts in an item cannot be relied on yet: not confirmed by a person, removed, or out of date.
export function sourceProblems(item: VaultRuleItem, options: { now?: Date; staleFigureDays?: number } = {}): string[] {
  const out: string[] = [];
  const name = item.title ? `"${item.title}"` : 'This item';
  if (item.deletedAt) out.push(`${name} was deleted from the vault`);
  if (item.status !== 'confirmed') out.push(`${name} has not been confirmed by a person`);
  const s = staleInfo(item, options.now, options.staleFigureDays);
  if (s.stale) out.push(`${name}: ${s.staleReason}`);
  return out;
}
