// What the AI reported when it drafted a batch, said plainly. The report counts posts that were delivered, drafts the checks
// threw out and, when the AI could not replace them, how many posts are missing.

export interface DraftReport {
  requested?: number;
  delivered?: number;
  rejected?: Array<{ id: string | null; reasons: string[] }>;
  messages?: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The big number, not "image text (big)".
const FIELD_WORDS: Record<string, string> = {
  big: 'the big number', headline: 'the headline', sub: 'the sub line', label: 'the label', stat: 'the figure', quote: 'the quotation',
  eyebrow: 'the small label above the headline', body: 'the body text', title: 'the title', caption: 'the caption',
};

// One reason in words a person can read: the post key (the AI repeats it at the start) is dropped, "image text (big)" becomes
// "the big number", and the engine's own reason is kept after it.
export function plainReason(reason: string, postKey?: string | null): string {
  let text = reason.trim();
  const prefix = postKey ? new RegExp(`^(?:post\\s+)?${postKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:\\-]\\s*`, 'i') : null;
  for (let i = 0; i < 3 && prefix && prefix.test(text); i++) text = text.replace(prefix, '');
  text = text.replace(/\bimage text \(([\w ]+)\)/gi, (_m, field: string) => FIELD_WORDS[field.toLowerCase()] ?? `the ${field} text`);
  text = text.replace(/\bcaption (?=has|contains)/i, 'the caption ').replace(/\b(instagram|linkedin|facebook|x) caption\b/gi, (_m, n: string) => `the ${n === 'x' ? 'X' : n[0]!.toUpperCase() + n.slice(1)} caption`);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface DraftSummary {
  // "6 of 6 posts drafted."
  headline: string;
  // "1 draft was thrown out by the checks and written again." or "1 could not be made to pass the checks."
  followUp: string | null;
  // The reasons, one per line, for the "Why" disclosure.
  why: string[];
}

export function draftSummary(notes: DraftReport): DraftSummary {
  const requested = notes.requested ?? 0;
  const delivered = notes.delivered ?? 0;
  const rejected = notes.rejected ?? [];
  const missing = Math.max(0, requested - delivered);
  const headline = requested ? `${delivered} of ${requested} posts drafted.` : `${plural(delivered, 'post', 'posts')} drafted.`;
  let followUp: string | null = null;
  if (missing > 0) followUp = `${missing} could not be made to pass the checks.`;
  else if (rejected.length > 0) followUp = `${plural(rejected.length, 'draft was', 'drafts were')} thrown out by the checks and written again.`;
  const why = rejected.flatMap((r) => r.reasons.map((x) => {
    const reason = plainReason(x, r.id);
    return r.id ? `${r.id}: ${reason}` : reason;
  }));
  return { headline, followUp, why };
}

// Messages from the AI that only repeat the headline are left out; the rest are technical and go under "Details".
export const detailMessages = (notes: DraftReport): string[] => (notes.messages ?? []).filter((m) => !/requested posts passed the checks/i.test(m));
