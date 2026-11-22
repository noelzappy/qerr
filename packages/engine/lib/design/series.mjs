// Named recurring series ("Myth vs fact", "Tip of the week"): a brand's own formats that come back at a cadence, each a kind of post drawn
// by chosen compositions of the active look, with an optional fixed mark ("Tip #{n}") written into one of the post's own fields.
// Pure: no files, no Chrome. The series itself never reaches the render: a post of a series is an ordinary post design whose `label` (or
// `tag`) holds the mark's text, so it passes postProblems like any other words (AGENTS.md rule 11).
//
// A series, as the web app stores it and the AI library reads it:
//   { slug, name, kind, variants: [composition index of the kind, ...] (empty: any), mark?: "Tip #{n}", markField?: "label" | "tag",
//     cadence: "weekly" | "fortnightly" | "monthly", weekday?: 0-6 (0 Monday), nextNumber?: 1-9999 }
// A post of a series carries, at the top of the post (not in its design): "series": { "slug": "tip-of-the-week", "number": 12 }.
import { POST_FIELDS, POST_KINDS } from './post-spec.mjs';

export const SERIES_SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const SERIES_CADENCES = ['weekly', 'fortnightly', 'monthly'];
export const SERIES_MARK_FIELDS = ['label', 'tag'];
export const SERIES_LIMITS = { perBrand: 12, name: 40, variants: 3, number: 9999, mark: 28 };
// The number tokens a mark may hold: {n} as it is ("Tip #12"), {nn} with at least two digits ("No. 07").
const TOKEN = /\{(n|nn)\}/g;
const STEP = { weekly: 7, fortnightly: 14 };
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clip = (v) => String(v).slice(0, 40);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const seen = (v) => [...String(v)].length;

// The mark's text for a number: "Tip #{n}", 12 -> "Tip #12"; {nn} pads to two digits. A mark without a token is the same every time.
export const seriesMark = (mark, n) => String(mark).replace(TOKEN, (_, t) => (t === 'nn' ? String(n).padStart(2, '0') : String(n)));

// Problems of a mark (a list of texts): one line, plain words, at most one number token, and short enough for its field with a four-digit
// number. `room`: the most characters the field is drawn with (default: the field's own limit).
export function markProblems(mark, field = 'label', where = 'series', room) {
  const e = [];
  if (typeof mark !== 'string' || !mark.trim()) return [`${where}: the mark must be a non-empty text`];
  if (mark !== mark.trim()) e.push(`${where}: the mark must not start or end with a space`);
  if (/[\r\n]|\\n/.test(mark)) e.push(`${where}: the mark must be one line`);
  if (mark.includes('*')) e.push(`${where}: the mark takes no *emphasis*`);
  if (/\p{Extended_Pictographic}/u.test(mark)) e.push(`${where}: the mark takes no emoji`);
  const tokens = mark.match(TOKEN) ?? [];
  if (tokens.length > 1) e.push(`${where}: the mark may hold the number once ({n} or {nn})`);
  if (/[{}]/.test(mark.replace(TOKEN, ''))) e.push(`${where}: braces are only for the number, written {n} or {nn}`);
  if (!SERIES_MARK_FIELDS.includes(field)) return [...e, `${where}: the mark goes in one of ${SERIES_MARK_FIELDS.join(', ')}`];
  const max = Math.min(POST_FIELDS[field].max, room ?? Infinity), longest = seen(seriesMark(mark, SERIES_LIMITS.number));
  if (!e.length && longest > max) e.push(`${where}: the mark is ${longest} characters with a four-digit number; the ${field} holds ${max}`);
  return e;
}

// Problems of one series (a list of texts). brief: lookBrief(the active look) when known; then the kind must be one the look draws, every
// chosen composition must exist, and the mark's field must be drawn by the compositions the series uses, within their budget.
export function seriesProblems(s, where = 'series', { brief } = {}) {
  if (!isObj(s)) return [`${where}: must be an object`];
  const e = [];
  if (typeof s.slug !== 'string' || !SERIES_SLUG.test(s.slug)) e.push(`${where}: slug must be lowercase letters, digits and - (up to 40)`);
  if (typeof s.name !== 'string' || !s.name.trim() || seen(s.name) > SERIES_LIMITS.name || /[\r\n]/.test(s.name)) e.push(`${where}: name must be one line of 1 to ${SERIES_LIMITS.name} characters`);
  if (!POST_KINDS.includes(s.kind)) e.push(`${where}: kind must be one of ${POST_KINDS.join(', ')} (got "${clip(s.kind)}")`);
  const variants = s.variants ?? [];
  if (!Array.isArray(variants) || variants.length > SERIES_LIMITS.variants || variants.some((v) => !isInt(v, 0, 9)) || new Set(variants).size !== variants.length) e.push(`${where}: variants must be up to ${SERIES_LIMITS.variants} different composition numbers from 0 to 9`);
  if (!SERIES_CADENCES.includes(s.cadence)) e.push(`${where}: cadence must be one of ${SERIES_CADENCES.join(', ')}`);
  if (s.weekday !== undefined && s.weekday !== null && !isInt(s.weekday, 0, 6)) e.push(`${where}: weekday must be a whole number from 0 (Monday) to 6 (Sunday)`);
  if (s.nextNumber !== undefined && !isInt(s.nextNumber, 1, SERIES_LIMITS.number)) e.push(`${where}: nextNumber must be a whole number from 1 to ${SERIES_LIMITS.number}`);
  const field = s.markField ?? 'label';
  if (s.markField !== undefined && !SERIES_MARK_FIELDS.includes(s.markField)) e.push(`${where}: markField must be one of ${SERIES_MARK_FIELDS.join(', ')}`);
  if (e.length) return e;
  if (!brief) return s.mark === undefined || s.mark === null ? e : markProblems(s.mark, field, where);
  const vs = brief.kinds?.[s.kind]?.variants ?? [], look = clip(brief.name ?? brief.id ?? 'look');
  if (!vs.length) return [`${where}: the ${look} look draws no ${s.kind} post; choose another kind`];
  const missing = variants.filter((v) => v >= vs.length);
  if (missing.length) return [`${where}: the ${look} look has ${vs.length} ${s.kind} design${vs.length === 1 ? '' : 's'}; design ${missing.map((v) => v + 1).join(', ')} is not one of them`];
  if (s.mark === undefined || s.mark === null) return e;
  const used = variants.length ? variants.map((v) => vs[v]) : vs.filter((v) => v.fields?.[field]);
  if (!used.length) return [`${where}: no ${s.kind} design of the ${look} look shows a ${field}, so the mark would not be seen; put it in another field or choose another kind`];
  const blind = used.filter((v) => !v.fields?.[field]);
  if (blind.length) return [`${where}: the ${blind.map((v) => `"${clip(v.name)}"`).join(', ')} design does not show a ${field}, so the mark would not be seen there; choose designs that show it`];
  return markProblems(s.mark, field, where, Math.min(...used.map((v) => v.fields[field].max ?? POST_FIELDS[field].max)));
}

// Problems of a list of a brand's series: each one, at most SERIES_LIMITS.perBrand, and no slug twice.
export function seriesListProblems(list, opts = {}) {
  if (!Array.isArray(list)) return ['series must be a list'];
  const e = list.length > SERIES_LIMITS.perBrand ? [`a brand has at most ${SERIES_LIMITS.perBrand} series`] : [];
  const slugs = new Set();
  list.forEach((s, i) => {
    e.push(...seriesProblems(s, `series ${isObj(s) && typeof s.slug === 'string' ? clip(s.slug) : i + 1}`, opts));
    if (isObj(s) && slugs.has(s.slug)) e.push(`series ${clip(s.slug)}: the slug is used twice`);
    if (isObj(s)) slugs.add(s.slug);
  });
  return e;
}

// The post field a batch uses for the series a post belongs to: { slug, number }. Problems as a list of texts.
export function seriesRefProblems(ref, where = 'post') {
  if (ref === undefined) return [];
  if (!isObj(ref) || typeof ref.slug !== 'string' || !SERIES_SLUG.test(ref.slug)) return [`${where}: series must look like { "slug": "tip-of-the-week", "number": 12 } (a slug of lowercase letters, digits and -)`];
  if (!isInt(ref.number, 1, SERIES_LIMITS.number)) return [`${where}: series.number must be a whole number from 1 to ${SERIES_LIMITS.number}`];
  const extra = Object.keys(ref).filter((k) => k !== 'slug' && k !== 'number');
  return extra.length ? [`${where}: series takes only slug and number (not ${extra.map(clip).join(', ')})`] : [];
}

// ---- planning ----
const day = (iso) => new Date(`${iso}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const weekdayOf = (d) => (d.getUTCDay() + 6) % 7; // 0 Monday
const onOrAfter = (d, wd) => (wd === undefined || wd === null ? d : addDays(d, (wd - weekdayOf(d) + 7) % 7));

// The dates a series falls on within a period { from, to } (YYYY-MM-DD, inclusive): weekly or fortnightly from the first `weekday` on or
// after `from` (or from `from` itself); monthly on the first `weekday` of each month (or the first day of it), never before `from`.
export function seriesDates(s, period) {
  const from = day(period.from), to = day(period.to), out = [];
  if (!(from <= to)) return out;
  if (STEP[s.cadence]) {
    for (let d = onOrAfter(from, s.weekday); d <= to && out.length < 62; d = addDays(d, STEP[s.cadence])) out.push(iso(d));
    return out;
  }
  for (let m = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); m <= to && out.length < 62; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const end = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
    const d = onOrAfter(m < from ? from : m, s.weekday);
    if (d <= end && d <= to) out.push(iso(d));
  }
  return out;
}

// The composition a series post is drawn with: the series' own designs in turn by number; with none chosen and a mark, the look's designs
// of the kind that show the mark's field, in turn (when that is all of them, the engine is left to choose). Undefined: the engine chooses.
export function seriesVariant(s, number, brief) {
  const own = Array.isArray(s.variants) ? s.variants : [];
  if (own.length) return own[(number - 1) % own.length];
  if (!brief || s.mark === undefined || s.mark === null) return undefined;
  const vs = brief.kinds?.[s.kind]?.variants ?? [], field = s.markField ?? 'label';
  const showing = vs.filter((v) => v.fields?.[field]).map((v) => v.index);
  return showing.length && showing.length < vs.length ? showing[(number - 1) % showing.length] : undefined;
}

// The series posts a batch for `period` should hold, at most `count` of them: [{ date, slug, name, kind, number, variant?, markField?,
// mark? (the text) }] in date order, numbered per series from its nextNumber. `dropped`: the slots left out because the batch is smaller.
export function planSeries(list, { period, count, brief } = {}) {
  const all = [];
  (Array.isArray(list) ? list : []).forEach((s, order) => {
    let n = s.nextNumber ?? 1;
    for (const date of seriesDates(s, period)) {
      if (n > SERIES_LIMITS.number) break;
      const variant = seriesVariant(s, n, brief);
      all.push({ date, slug: s.slug, name: s.name, kind: s.kind, number: n, order, ...(variant !== undefined ? { variant } : {}), ...(s.mark ? { markField: s.markField ?? 'label', mark: seriesMark(s.mark, n) } : {}) });
      n++;
    }
  });
  all.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  const keep = Number.isInteger(count) && count >= 0 ? count : all.length;
  const strip = ({ order: _o, ...slot }) => slot;
  // Numbers stay in date order per series: a dropped slot is always the last of its series' run, so numbering has no gaps.
  return { slots: all.slice(0, keep).map(strip), dropped: all.slice(keep).map(strip) };
}

// A post design made part of a series: its kind, the composition the slot names, and the mark in its field. Other words are kept.
export function applySeriesSlot(design, slot) {
  const d = { ...(isObj(design) ? design : {}), template: 'post', kind: slot.kind };
  if (slot.variant !== undefined) d.variant = slot.variant;
  if (slot.mark !== undefined) d[slot.markField ?? 'label'] = slot.mark;
  return d;
}
