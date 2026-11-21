// Starting points for a brand's own layouts: compositions like the built-in templates, written as layout data on the grid page
// (lib/design/layout.mjs), and copies of the built-in layouts themselves (builtinCopy). Settings, Layouts offers both to copy and
// change; they are never used by a post as they are. Each one is checked by the same validator as a brand's own
// (test-design-layout.mjs, test-design-layout-builtin.mjs).
import { BUILTIN } from './builtin-layouts.mjs';
import { BLOCKS, BRAND_PAGE_KINDS, SPEC_CHOICES, builtinPageWhy, validateLayout, whenHolds } from './layout.mjs';

// The editorial page's grid: 12 columns and 24 rows of about 52 px inside the reference margins (70 px at the sides, 56 px at
// the top and bottom, where the running head and the footer sit).
const EDITORIAL = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };
const POSTER = { columns: 12, rows: 24, margin: { top: 56, right: 80, bottom: 56, left: 80 }, gutter: 20, rowGutter: 0 };
const at = (col, row, width, height) => ({ col, row, width, height });
const foot = (row = 24) => [
  { type: 'logo', slot: at(1, row, 6, 1), valign: 'bottom', variant: 'auto', size: 32 },
  { type: 'website', slot: at(7, row, 6, 1), align: 'right', valign: 'bottom', size: 24 },
];
const head = () => [
  { type: 'label', source: 'series', slot: at(1, 1, 8, 1), valign: 'center' },
  { type: 'label', source: 'brand', slot: at(9, 1, 4, 1), align: 'right', valign: 'center' },
  { type: 'decoration', kind: 'rule', slot: at(1, 2, 12, 1) },
];

export const STARTER_LAYOUTS = [
  {
    id: 'text', name: 'Headline and panel', description: 'A large headline on the page, the sub line on the tint panel below it, the logo and the website at the foot. Like the built-in text page.',
    fields: { headline: { required: true, max: 90 }, sub: { max: 160 } },
    canvas: { feed: EDITORIAL },
    blocks: [
      ...head(),
      { type: 'headline', slot: at(1, 3, 12, 11), size: 112 },
      { type: 'decoration', kind: 'panel', slot: at(1, 17, 12, 8), bleed: ['left', 'right', 'bottom'] },
      { type: 'sub', slot: at(1, 18, 8, 5) },
      ...foot(),
    ],
  },
  {
    id: 'stats', name: 'Big number', description: 'One big figure, a line under it, up to three supporting figures, and an optional photo across the page. Like the built-in stats page.',
    fields: { big: { required: true }, line: { max: 80 }, stats: { min: 0, max: 3 }, image: {} },
    canvas: { feed: EDITORIAL },
    blocks: [
      ...head(),
      { type: 'figure', slot: at(1, 3, 12, 3), size: 168, valign: 'center' },
      { type: 'sub', field: 'line', slot: at(1, 6, 9, 2) },
      { type: 'stats', slot: at(1, 9, 12, 3), size: 56 },
      { type: 'photo', slot: at(1, 13, 12, 10), bleed: ['left', 'right'] },
      ...foot(),
    ],
  },
  {
    id: 'photo-story', name: 'Photo and story', description: 'A full-bleed photo across the top, then a label, the headline and the sub line. Like the built-in photo story page.',
    fields: { image: { required: true }, headline: { required: true, max: 70 }, sub: { max: 140 } },
    canvas: { feed: EDITORIAL },
    blocks: [
      { type: 'photo', slot: at(1, 1, 12, 13), bleed: ['top', 'left', 'right'] },
      { type: 'label', source: 'series', slot: at(1, 15, 12, 1), valign: 'center' },
      { type: 'headline', slot: at(1, 16, 12, 4), size: 76 },
      { type: 'sub', slot: at(1, 20, 12, 3) },
      ...foot(),
    ],
  },
  {
    id: 'cover', name: 'Framed photo', description: 'A photo with the card radius inside the margins, the headline and the sub line under it. Like the built-in cover page.',
    fields: { image: { required: true }, headline: { required: true, max: 70 }, sub: { max: 120 } },
    canvas: { feed: EDITORIAL },
    blocks: [
      { type: 'label', source: 'series', slot: at(1, 1, 12, 1), valign: 'center' },
      { type: 'photo', frame: 'card', slot: at(1, 2, 12, 13) },
      { type: 'headline', slot: at(1, 16, 12, 4), size: 70 },
      { type: 'sub', slot: at(1, 20, 12, 3) },
      ...foot(),
    ],
  },
  {
    id: 'myth-fact', name: 'Myth and fact', description: 'The myth on a dark slab and the fact on a pale one, on a dark textured page. Like the built-in myth and fact page.',
    ground: 'dark', texture: 'lines', accent: 'colour',
    fields: { myth: { required: true, max: 90 }, factLead: { required: true, max: 90 }, fact: { max: 140 } },
    canvas: { feed: POSTER },
    blocks: [
      { type: 'logo', slot: at(1, 1, 6, 1), valign: 'center', variant: 'auto', size: 34 },
      { type: 'website', slot: at(7, 1, 6, 1), align: 'right', valign: 'center' },
      { type: 'slab', ground: 'deep', radius: 'slab', slot: at(1, 3, 12, 9), valign: 'center', padding: 48, gap: 28, children: [
        { type: 'label', text: 'Myth', style: 'tag', size: 24 },
        { type: 'headline', field: 'myth', style: 'poster', size: 68 },
      ] },
      { type: 'slab', ground: 'cool', radius: 'slab', slot: at(1, 12, 12, 11), valign: 'center', padding: 48, gap: 24, children: [
        { type: 'label', text: 'Fact', style: 'tag', size: 24 },
        { type: 'headline', field: 'factLead', style: 'poster', size: 68 },
        { type: 'sub', field: 'fact' },
      ] },
      { type: 'label', source: 'series', style: 'plain', size: 28, slot: at(5, 24, 8, 1), align: 'right', valign: 'bottom' },
    ],
  },
  {
    id: 'split', name: 'Photo beside text', description: 'A photo filling the left half of the page, edge to edge, and the text in the right half.',
    fields: { image: { required: true }, label: { max: 30 }, headline: { required: true, max: 60 }, sub: { max: 110 } },
    canvas: { feed: { ...EDITORIAL, columns: 12 } },
    blocks: [
      { type: 'photo', slot: at(1, 1, 6, 24), bleed: ['top', 'left', 'bottom'] },
      { type: 'label', field: 'label', slot: at(7, 3, 6, 1), valign: 'center', tone: 'accent' },
      { type: 'headline', slot: at(7, 4, 6, 9), size: 64, valign: 'bottom' },
      { type: 'sub', slot: at(7, 14, 6, 6) },
      { type: 'logo', slot: at(7, 24, 6, 1), valign: 'bottom', variant: 'auto', size: 32 },
    ],
  },
  {
    id: 'quote', name: 'Quotation', description: 'A short quotation set large on a pale ground, with a label above it and the logo at the foot.',
    ground: 'cool', accent: 'colour',
    fields: { quote: { required: true, max: 120 }, label: { max: 40 } },
    canvas: { feed: POSTER, square: { ...POSTER, rows: 18 } },
    blocks: [
      { type: 'label', field: 'label', slot: { feed: at(1, 4, 12, 1), square: at(1, 3, 12, 1) }, valign: 'center' },
      { type: 'headline', field: 'quote', style: 'poster', size: 88, slot: { feed: at(1, 5, 12, 15), square: at(1, 4, 12, 11) } },
      { type: 'logo', slot: { feed: at(1, 24, 6, 1), square: at(1, 18, 6, 1) }, valign: 'bottom', variant: 'solid', size: 34 },
      { type: 'website', slot: { feed: at(7, 24, 6, 1), square: at(7, 18, 6, 1) }, align: 'right', valign: 'bottom' },
    ],
  },
];

// A copy of a starting point under a new id and name, ready to be changed.
export function starterCopy(id, { newId, name } = {}) {
  const s = STARTER_LAYOUTS.find((l) => l.id === id);
  if (!s) return null;
  return { ...structuredClone(s), id: newId ?? s.id, name: name ?? s.name };
}

// ---- the built-in layouts, as a brand may see and copy them ----

// A built-in variant's condition at the registry, in words ("artefact is ledger", "layout is not center, side or print").
const words = (v) => (Array.isArray(v) ? (v.length > 1 ? `${v.slice(0, -1).join(', ')} or ${v[v.length - 1]}` : String(v[0])) : String(v));
export function variantWords(when) {
  if (!when) return null;
  const parts = [];
  if (when.field !== undefined) parts.push(when.is !== undefined ? `${when.field} is ${words(when.is)}` : `${when.field} is not ${words(when.not)}`);
  if (when.present !== undefined) parts.push(`${when.present} is filled`);
  if (when.absent !== undefined) parts.push(`${when.absent} is empty`);
  if (when.page !== undefined) parts.push(`on a ${when.page} page`);
  return parts.join(', ');
}

// Why a built-in layout cannot be copied into a brand's own, or null when it can.
function copyBlocked(layout) {
  const page = layout.page ?? 'grid';
  if (!BRAND_PAGE_KINDS.includes(page)) return `a ${page} page is for the built-in layouts only: ${builtinPageWhy(page)}`;
  const own = (layout.blocks ?? []).find((b) => BLOCKS[b.type]?.builtin);
  if (own) return `its ${own.type} block draws a setting of the built-in template's own designs (the spec's ${own.type}), which a design for a brand's layout does not have`;
  return null;
}

// Every built-in layout but the page covers (they are not post images), in the registry's order: what Settings, Layouts lists.
export function builtinLayouts() {
  const out = [];
  for (const [template, list] of Object.entries(BUILTIN)) {
    if (template === 'pagecover') continue;
    for (const v of list) {
      const blocked = copyBlocked(v.layout);
      out.push({ template, variant: variantWords(v.when), copyable: !blocked, why: blocked, layout: v.layout });
    }
  }
  return out;
}

// A condition settled for a brand's layout: a choice a brand's design cannot set (anything but the artefact and its register
// card) always reads its default there, so the condition either always holds (its choice part goes) or never does (drop).
function settle(when) {
  if (!when || when.field === undefined || SPEC_CHOICES[when.field]?.brand) return { when };
  const holds = whenHolds(when.is !== undefined ? { field: when.field, is: when.is } : { field: when.field, not: when.not }, {});
  if (!holds) return { drop: true };
  const { field: _f, is: _i, not: _n, ...rest } = when;
  return { when: Object.keys(rest).length ? rest : undefined };
}
const withWhen = (o, when) => { const { when: _w, ...rest } = o; return when ? { ...rest, when } : rest; };

// A block without the options that read the built-in templates' own design settings (an artefact drawn "from" the spec is then
// drawn from the layout's artefact field).
function plainBlock(b) {
  const out = { ...b };
  for (const [k, o] of Object.entries(BLOCKS[b.type]?.options ?? {})) if (o.builtin || o.builtinValues?.includes(out[k])) delete out[k];
  if (Array.isArray(b.children)) out.children = b.children.map(plainBlock);
  return out;
}

// A copy of a built-in layout as a brand's own layout under a new id and name, ready to be changed: the same page, blocks and
// rectangles, with every condition on a built-in template's own settings settled to what a brand's design reads (the default
// size, alignment, glow ...), the options that read those settings left out, and the artefact (of the variant's type) taken
// from the layout's artefact field. null when there is no such layout or it cannot be copied (builtinLayouts says why).
export function builtinCopy(id, { newId, name } = {}) {
  const entry = builtinLayouts().find((b) => b.layout.id === id);
  if (!entry || !entry.copyable) return null;
  const src = structuredClone(entry.layout), when = BUILTIN[entry.template].find((v) => v.layout.id === id)?.when;
  const l = { ...src, id: newId ?? `${src.id}-copy`, name: name ?? `${src.name.slice(0, 33)} (copy)` };
  l.blocks = src.blocks.flatMap((b) => { const s = settle(b.when); return s.drop ? [] : [withWhen(plainBlock(b), s.when)]; });
  if (Array.isArray(src.ground)) {
    const cases = [];
    for (const c of src.ground) {
      const s = settle(c.when);
      if (s.drop) continue;
      cases.push(withWhen(c, s.when));
      if (!s.when) break;
    }
    l.ground = cases.length === 1 ? cases[0].ground : cases;
  }
  // the artefact's type: the variant's (a text page's ledger, register card or passbook), or the template's own (from the spec)
  const from = src.blocks.map((b) => b.from).find((f) => f === 'ledger' || f === 'passbook');
  const type = from ?? (when?.field === 'artefact' && typeof when.is === 'string' ? when.is : when?.field === 'register' && when.is === true ? 'passbook' : null);
  if (type && l.fields.artefact) l.fields = { ...l.fields, artefact: { ...l.fields.artefact, types: [type] } };
  return l;
}

// Every copyable built-in layout's copy is a valid brand layout (test-design-layout-builtin.mjs checks it): the problems, if any.
export const builtinCopyProblems = () => builtinLayouts().filter((b) => b.copyable).flatMap((b) => validateLayout(builtinCopy(b.layout.id), `copy of ${b.layout.id}`));
