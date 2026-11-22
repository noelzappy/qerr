// What the AI reported when it drafted a batch, said plainly. The report counts posts that were delivered, drafts the checks
// threw out and, when the AI could not replace them, how many posts are missing.

export interface DraftReport {
  requested?: number;
  delivered?: number;
  rejected?: Array<{ id: string | null; reasons: string[] }>;
  messages?: string[];
  // How many posts carry a picture, and how many usable photos the vault offered the AI.
  pictures?: { posts?: number; of?: number; usablePhotos?: number };
  seasonal?: { occasions?: Array<{ name: string; date?: string; end?: string; source?: string }>; used?: Array<{ postId: string; occasion: string }> };
  tools?: { calls?: number; searches?: Array<{ tool: string; query: string; results: number }>; foundOnTheWeb?: Array<{ title: string; sourceUrl: string; citedBy?: string[] }> };
}

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The "Seasonal" note: each occasion the draft was given, with its date and the posts planned around it. Empty without occasions.
export function seasonalLines(notes: DraftReport): string[] {
  const s = notes.seasonal;
  if (!s?.occasions?.length) return [];
  return s.occasions.map((o) => {
    const posts = (s.used ?? []).filter((u) => u.occasion === o.name).map((u) => u.postId);
    const when = o.date ? ` (${o.end ? `${shortDay(o.date)} – ${shortDay(o.end)}` : shortDay(o.date)})` : '';
    return `${o.name}${when}${o.source ? ', from the web' : ''}: ${posts.length ? `${posts.join(', ')}` : 'no post'}`;
  });
}

// What the drafting tools did, in a line or two, and each fact found on the web (saved unconfirmed in Facts).
export function toolLines(notes: DraftReport): string[] {
  const t = notes.tools;
  if (!t) return [];
  const searches = t.searches ?? [];
  const vault = searches.filter((x) => x.tool === 'search_facts').length, web = searches.filter((x) => x.tool === 'search_web').length;
  return [
    ...(searches.length ? [`Searched ${[vault ? `the facts ${vault === 1 ? 'once' : `${vault} times`}` : '', web ? `the web ${web === 1 ? 'once' : `${web} times`}` : ''].filter(Boolean).join(' and ')}: ${searches.map((x) => `"${x.query}"`).join(', ')}`] : []),
    ...(t.foundOnTheWeb ?? []).map((f) => `Found on the web, waiting in Facts to be confirmed: ${f.title} (${f.sourceUrl})${f.citedBy?.length ? `, used by ${f.citedBy.join(', ')}` : ''}`),
  ];
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

// When fewer than half the posts carry a picture, one plain line says so and what to do, shown with the note (not under "Details"):
// a vault with fewer usable photos than posts asks for more photos; a vault with enough says the drafts did not use them.
export function pictureNote(notes: DraftReport): string | null {
  const p = notes.pictures;
  if (!p || typeof p.posts !== 'number' || typeof p.of !== 'number' || !p.of || p.posts * 2 >= p.of) return null;
  const photos = typeof p.usablePhotos === 'number' ? p.usablePhotos : 0;
  const count = `Only ${p.posts} of ${p.of} posts ${p.posts === 1 ? 'has' : 'have'} a picture`;
  return photos < p.of
    ? `${count}: confirm more photos in Pictures (with their rights settled) to get richer posts.`
    : `${count}, though ${photos} photos are ready in Pictures: add one to a post, or ask the AI again.`;
}

// Messages from the AI that only repeat the headline (or the picture line above) are left out; the rest are technical and go under "Details".
export const detailMessages = (notes: DraftReport): string[] => (notes.messages ?? []).filter((m) => !/requested posts passed the checks/i.test(m) && !(notes.pictures && /posts have a picture/i.test(m)));
