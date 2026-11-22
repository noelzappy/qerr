// Does a post's image make sense to someone who never reads its caption? A few cheap, fixed checks for the worst cases the owner
// saw: a figure with nothing saying what it counts ("1,200+ / members"), a label that names no topic ("The numbers") and a headline
// that leans on a pronoun with nothing to point at ("..., it only reads"). Each problem is a sentence the model can act on; the
// drafting flow sends it back like every other reason. They are deliberately narrow: a fixed word list and the first words of a
// clause, never a judgement of style, so a good post is not turned away.
import { seenText } from '@qerr/engine/design/post-spec';

// Labels that name no topic: a reader learns nothing from them. Compared whole, case and end punctuation aside.
export const GENERIC_LABELS = Object.freeze([
  'numbers', 'the numbers', 'by the numbers', 'in numbers', 'figures', 'the figures', 'stats', 'statistics', 'data', 'facts', 'fact',
  'the facts', 'update', 'updates', 'an update', 'info', 'information', 'news', 'note', 'notes', 'fyi', 'did you know', 'today',
  'announcement', 'post', 'general',
]);
// Units that, alone, do not say what is counted or where ("1,200+ members": members of what?).
export const GENERIC_UNITS = Object.freeze([
  'members', 'people', 'users', 'customers', 'clients', 'groups', 'clubs', 'accounts', 'items', 'things', 'units', 'times', 'total',
  'count', 'number', 'numbers', 'figure', 'figures', 'percent', 'per cent', 'followers', 'downloads', 'sales', 'orders', 'records',
  'entries', 'transactions', 'payments', 'stats', 'so far', 'and counting', 'more', 'plus',
]);
// Words that only point back at something: as the subject of a headline they need a subject the image does not give.
const ALWAYS_PRONOUN = new Set(['it', "it's", 'it’s', 'its', 'they', "they're", 'they’re', 'them', 'he', 'she', "he's", "she's"]);
// "this", "that", "these", "those" are fine before a noun ("This Friday, coffee on us"), not before a verb with nothing named ("This changes everything").
const POINTERS = new Set(['this', 'that', 'these', 'those']);
const POINTER_VERBS = new Set(['is', 'are', 'was', 'were', 'means', 'matters', 'changes', 'counts', 'works', 'helps', 'does', 'do', 'will', 'can', 'says', 'adds', 'stays', 'keeps', 'makes']);

const plain = (v) => seenText(v).replace(/■/g, ' ').replace(/\s+/g, ' ').trim();
const norm = (v) => plain(v).toLowerCase().replace(/[.!?:;,…]+$/u, '').trim();
const words = (s) => s.toLowerCase().split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}’']+|[^\p{L}\p{N}’']+$/gu, '')).filter(Boolean);

// The first clause of a headline (or a later short one) that leans on a pronoun with no subject in the image text, or null.
export function pronounLean(headline) {
  if (typeof headline !== 'string') return null;
  const clauses = plain(headline).split(/[,;:.!?—–]|\s-\s/).map((c) => c.trim()).filter(Boolean);
  for (const [i, c] of clauses.entries()) {
    const w = words(c);
    if (!w.length) continue;
    const leads = ALWAYS_PRONOUN.has(w[0]) || (POINTERS.has(w[0]) && (w.length === 1 || POINTER_VERBS.has(w[1])));
    // the opening clause leans on it outright; a later clause only when it is a short tail ("..., it only reads") that names nothing else
    if (leads && (i === 0 || w.length <= 3)) return c;
  }
  return null;
}

// What a page of a post shows, in words: the problems of one post page. offers(field): whether its design draws that field.
function pageProblems(d, { offers, inSeries, cover, where }) {
  const out = [];
  const at = where ? `${where}: ` : '';
  const has = (f) => typeof d[f] === 'string' && plain(d[f]).length > 0;
  if (has('label') && !inSeries && GENERIC_LABELS.includes(norm(d.label))) {
    out.push(`${at}the label "${plain(d.label).slice(0, 28)}" names no topic; say what the post is about in 1 or 2 words (for example "Our members", "Free plan", "Ask the assistant")`);
  }
  if (d.kind === 'figure') {
    if (!has('sub') && offers('sub')) out.push(`${at}a figure needs a sub: one sentence saying what is counted, for whom or where, and why it matters to the reader, so the image makes sense without the caption`);
    if (has('unit') && !has('sub') && !has('headline') && GENERIC_UNITS.includes(norm(d.unit))) out.push(`${at}the unit "${plain(d.unit)}" alone does not say what is counted; name it (for example "people saving in groups", not "members") and add a sub that gives the context`);
    if (!has('unit') && !has('sub') && !has('headline')) out.push(`${at}a figure with neither unit nor sub is a bare number; say what it counts`);
  }
  // a sub that says the headline's point again ("..., *by looking*" / "... questions are settled by looking.") explains nothing new
  if (has('headline') && has('sub')) {
    const flat = (s) => ` ${plain(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
    for (const m of String(d.headline).matchAll(/\*([^*]+)\*/g)) {
      const phrase = flat(m[1]);
      if (phrase.trim().split(' ').length >= 2 && phrase.trim().length >= 8 && flat(d.sub).includes(phrase)) {
        out.push(`${at}the sub repeats the headline's phrase "${m[1].trim().slice(0, 40)}"; let the sub add what the headline does not say (whose it is, what it means, why it matters)`);
      }
    }
  }
  if (cover && has('headline')) {
    const lean = pronounLean(d.headline);
    if (lean) out.push(`${at}the headline leans on a pronoun ("${lean.slice(0, 40)}") with nothing in the image saying what it is; name the subject in the headline (for example "The assistant answers questions, it never moves money", not "it only reads")`);
  }
  return out;
}

// The stand-alone problems of a `post` design, or of each post page of a carousel (the pronoun check only on the cover, whose
// headline is read first; the pages after it are read in order). brief(kind): the kind's brief from direction.mjs ({ fields, variants? }),
// or null. inSeries: the post fills a named series, whose label is the app's series mark.
export function standAloneProblems(design, { brief = () => null, inSeries = false } = {}) {
  if (!design || typeof design !== 'object') return [];
  const one = (d, cover, where) => {
    if (d?.template !== 'post') return [];
    const b = brief(d.kind);
    const variant = d.variant !== undefined && b?.variants ? b.variants[d.variant] : undefined;
    const offers = (f) => Boolean(variant ? variant.fields?.[f] : b?.fields?.[f]);
    return pageProblems(d, { offers, inSeries, cover, where });
  };
  if (design.template === 'carousel' && Array.isArray(design.pages)) return design.pages.flatMap((p, i) => one(p, i === 0, `carousel page ${i + 1}`));
  return one(design, true, '');
}
