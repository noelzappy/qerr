// The layout editor's model (Settings, Layouts): how each part of a layout's JSON is read into what the editor shows and written
// back, which controls a block gets (from the engine's catalogue, layoutCatalogue().pages), and what in a layout the editor could
// not show. The editor keeps the layout itself as its state and changes one part at a time through these functions, so a part it
// does not touch keeps its exact JSON; toModel and fromModel put every part through the same functions, and the tests check that
// every starter and every built-in layout a brand may copy comes back deep-equal and that nothing in them is left unshown
// (src/web-layout-model.spec.ts). Nothing here decides what is valid: the engine's validator does, and its verdict is shown as
// people edit.
import {
  cellOf, marginsOf, rectOf,
  type Block, type Catalogue, type ChoiceValue, type Edge, type FieldRule, type Grid, type GroundCase, type Layout, type Margins, type Needs,
  type OptionSpec, type PageBlockSpec, type PageCatalogue, type Px, type Slot, type When,
} from './layout-types';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];
export const LAYOUT_KEYS = ['id', 'name', 'description', 'page', 'ground', 'accent', 'texture', 'fields', 'canvas', 'blocks'];
const GRID_KEYS = ['columns', 'rows', 'margin', 'gutter', 'rowGutter'];

// ---- the page kind and its catalogue ----

export const pageKind = (l: Pick<Layout, 'page'>): string => (typeof l.page === 'string' ? l.page : 'grid');
export const pageCatalogue = (cat: Catalogue, l: Pick<Layout, 'page'>): PageCatalogue | null => cat.pages[pageKind(l)] ?? null;
export const specFor = (cat: Catalogue, l: Pick<Layout, 'page'>, type: string): PageBlockSpec | null => pageCatalogue(cat, l)?.blocks[type] ?? null;
export const sizesOf = (l: Pick<Layout, 'canvas'>): string[] => (isObj(l.canvas) ? Object.keys(l.canvas) : []);
export const isBuiltPage = (l: Pick<Layout, 'page'>) => pageKind(l) !== 'grid';

// Whether a block has what an option or a binding needs (its option values with their defaults, or a key given).
export function needsMet(b: Block, needs: Needs | undefined, spec: PageBlockSpec | null): boolean {
  if (!needs) return true;
  return Object.entries(needs).every(([k, v]) => (v === true ? b[k] !== undefined : (b[k] ?? spec?.defaults[k]) === v));
}

// ---- conditions ("when") ----

// A condition as the editor holds it: each clause at most once, all of them must hold. A choice keeps whether its values were
// written as a list, so ["ledger"] and "ledger" both come back as they were.
export interface Choice { field: string; op: 'is' | 'not'; values: ChoiceValue[]; list: boolean }
export interface Condition { present?: string; absent?: string; page?: string; choice?: Choice }
export type ClauseKind = 'present' | 'absent' | 'page' | 'choice';
export const CLAUSES: ClauseKind[] = ['present', 'absent', 'page', 'choice'];
const scalar = (v: unknown): v is ChoiceValue => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

// rest: what of the JSON the condition model cannot hold (paths under "when"); empty for every condition the engine accepts.
export function readWhen(w: unknown): { cond: Condition; rest: string[] } {
  const cond: Condition = {}, rest: string[] = [];
  if (w === undefined) return { cond, rest };
  if (!isObj(w) || !Object.keys(w).length) return { cond, rest: ['when'] };
  for (const [k, v] of Object.entries(w)) {
    if (k === 'present' || k === 'absent' || k === 'page') { if (typeof v === 'string') cond[k] = v; else rest.push(`when.${k}`); }
    else if (!['field', 'is', 'not'].includes(k)) rest.push(`when.${k}`);
  }
  if (w.field !== undefined || w.is !== undefined || w.not !== undefined) {
    const op = w.is !== undefined ? 'is' : 'not', raw = w[op];
    if (typeof w.field === 'string' && (w.is === undefined) !== (w.not === undefined) && (scalar(raw) || (Array.isArray(raw) && raw.every(scalar)))) {
      cond.choice = { field: w.field, op, values: Array.isArray(raw) ? [...raw] : [raw as ChoiceValue], list: Array.isArray(raw) };
    } else rest.push('when.field');
  }
  return { cond, rest };
}

export function writeWhen(c: Condition): When | undefined {
  const w: When = {};
  if (c.present !== undefined) w.present = c.present;
  if (c.absent !== undefined) w.absent = c.absent;
  if (c.page !== undefined) w.page = c.page;
  if (c.choice) { w.field = c.choice.field; w[c.choice.op] = c.choice.list || c.choice.values.length !== 1 ? [...c.choice.values] : c.choice.values[0]; }
  return Object.keys(w).length ? w : undefined;
}

export const clauseKinds = (c: Condition): ClauseKind[] => CLAUSES.filter((k) => c[k] !== undefined);

// A new clause, from what the page offers: the first declared field, the first carousel page, the first choice.
export function newClause(kind: ClauseKind, c: Condition, page: PageCatalogue, declared: string[]): Condition {
  if (kind === 'present' || kind === 'absent') {
    const other = kind === 'present' ? c.absent : c.present;
    return { ...c, [kind]: declared.find((f) => f !== other) ?? declared[0] ?? 'headline' };
  }
  if (kind === 'page') return { ...c, page: page.conditions.pages[0] ?? 'single' };
  const [field, spec] = Object.entries(page.conditions.choices)[0] ?? ['artefact', { values: ['ledger'] }];
  return { ...c, choice: { field, op: 'is', values: [spec.values[0]], list: false } };
}
export function dropClause(kind: ClauseKind, c: Condition): Condition { const next = { ...c }; delete next[kind]; return next; }

export const PAGE_WORDS: Record<string, string> = { first: 'on the first page of a carousel', later: 'on a later page of a carousel', single: 'on a single post (not a carousel)' };
export const CHOICE_WORDS: Record<string, string> = { artefact: "the artefact's type", register: 'the artefact has a register card' };
const orList = (v: ChoiceValue[]) => (v.length > 1 ? `${v.slice(0, -1).join(', ')} or ${v[v.length - 1]}` : String(v[0] ?? ''));
function choiceWords(ch: Choice): string {
  if (ch.field === 'register') {
    const yes = ch.op === 'is' ? ch.values.includes(true) : !ch.values.includes(true), no = ch.op === 'is' ? ch.values.includes(false) : !ch.values.includes(false);
    return yes && no ? 'with or without a register card' : yes ? 'the artefact has a register card' : 'the artefact has no register card';
  }
  if (ch.field === 'artefact') return `the artefact is ${ch.op === 'not' ? 'not ' : ''}a ${orList(ch.values)}`;
  return `${ch.field} is ${ch.op === 'not' ? 'not ' : ''}${orList(ch.values)}`;
}
// A condition in words: "sub is filled and on a single post".
export function conditionWords(c: Condition): string {
  const parts: string[] = [];
  if (c.present !== undefined) parts.push(`${c.present} is filled`);
  if (c.absent !== undefined) parts.push(`${c.absent} is empty`);
  if (c.page !== undefined) parts.push(PAGE_WORDS[c.page] ?? `on a ${c.page} page`);
  if (c.choice) parts.push(choiceWords(c.choice));
  return parts.join(' and ');
}
export const whenWords = (w: unknown) => conditionWords(readWhen(w).cond);

// ---- the page colour ("ground"): one ground, or cases each with a condition, the last without ----

export interface GroundCaseModel { cond: Condition | null; ground: unknown }
export type GroundModel = { kind: 'default' } | { kind: 'one'; ground: unknown } | { kind: 'cases'; cases: GroundCaseModel[] };

export function readGround(g: unknown): { model: GroundModel; rest: string[] } {
  if (g === undefined) return { model: { kind: 'default' }, rest: [] };
  if (!Array.isArray(g)) return { model: { kind: 'one', ground: g }, rest: typeof g === 'string' ? [] : ['ground'] };
  const rest: string[] = [];
  const cases = g.map((c, i): GroundCaseModel => {
    if (!isObj(c)) { rest.push(`ground[${i}]`); return { cond: null, ground: c }; }
    for (const k of Object.keys(c)) if (k !== 'when' && k !== 'ground') rest.push(`ground[${i}].${k}`);
    if (typeof c.ground !== 'string') rest.push(`ground[${i}].ground`);
    if (c.when === undefined) return { cond: null, ground: c.ground };
    const r = readWhen(c.when);
    rest.push(...r.rest.map((p) => `ground[${i}].${p}`));
    return { cond: r.cond, ground: c.ground };
  });
  return { model: { kind: 'cases', cases }, rest };
}

export function writeGround(m: GroundModel): string | GroundCase[] | undefined {
  if (m.kind === 'default') return undefined;
  if (m.kind === 'one') return m.ground as string;
  return m.cases.map((c) => { const when = c.cond ? writeWhen(c.cond) : undefined; return (when ? { when, ground: c.ground } : { ground: c.ground }) as GroundCase; });
}

// The ground a layout would start from as one colour (the cases' fallback), and the cases a single colour turns into.
export function groundToCases(l: Layout, page: PageCatalogue): GroundModel {
  const one = typeof l.ground === 'string' ? l.ground : 'series';
  const declared = Object.keys(l.fields ?? {});
  return { kind: 'cases', cases: [{ cond: newClause('present', {}, page, declared), ground: one === 'dark' ? 'light' : 'dark' }, { cond: null, ground: one }] };
}
export function casesToOne(m: GroundModel): GroundModel {
  if (m.kind !== 'cases') return m;
  return { kind: 'one', ground: m.cases[m.cases.length - 1]?.ground ?? 'series' };
}

// ---- where a block sits: grid cells ("slot") or page pixels ("px"), one for every size or one per size ----

export type PlaceBy = 'slot' | 'px' | 'none';
export const placeBy = (b: Block): PlaceBy => (b.slot !== undefined ? 'slot' : b.px !== undefined ? 'px' : 'none');
const isSlot = (s: unknown): s is Slot => isObj(s) && 'col' in s;
const isPx = (p: unknown): p is Px => isObj(p) && 'x' in p;
// One place for every size (the single-object form) rather than one per size.
export const samePlace = (b: Block): boolean => (placeBy(b) === 'slot' ? isSlot(b.slot) : placeBy(b) === 'px' ? isPx(b.px) : true);
export function slotOn(b: Block, size: string): Slot | null { return isSlot(b.slot) ? b.slot : isObj(b.slot) && isSlot(b.slot[size]) ? b.slot[size] as Slot : null; }
export function pxOn(b: Block, size: string): Px | null { return isPx(b.px) ? b.px : isObj(b.px) && isPx(b.px[size]) ? b.px[size] as Px : null; }

// The block with its place on one size set (or on every size, when it has one place for all).
export function withPlace(b: Block, by: 'slot' | 'px', size: string, rect: Slot | Px, sizes: string[]): Block {
  const key = by, other = by === 'slot' ? 'px' : 'slot';
  const { [other]: _drop, ...rest } = b;
  const cur = b[key], one = by === 'slot' ? isSlot(cur) : isPx(cur);
  if (cur === undefined ? sizes.length <= 1 : one) return { ...rest, [key]: rect } as Block;
  const per: Record<string, Slot | Px> = {};
  for (const z of sizes) { const r = by === 'slot' ? slotOn(b, z) : pxOn(b, z); per[z] = r ?? rect; }
  per[size] = rect;
  return { ...rest, [key]: per } as Block;
}

// One place for every size (from the size being edited), or one per size (each a copy).
export function withSamePlace(b: Block, same: boolean, size: string, sizes: string[]): Block {
  const by = placeBy(b);
  if (by === 'none') return b;
  const at = (z: string) => (by === 'slot' ? slotOn(b, z) : pxOn(b, z));
  if (same) { const r = at(size) ?? at(sizes[0]); return r ? { ...b, [by]: { ...r } } : b; }
  const r = at(size);
  return r ? { ...b, [by]: Object.fromEntries(sizes.map((z) => [z, { ...(at(z) ?? r) }])) } : b;
}

// A slot's cells as page pixels (its inner rectangle, rounded), and pixels as the cells they cover most.
export function slotToPx(g: Grid, page: { w: number; h: number }, s: Slot): Px {
  const r = rectOf(g, page, s);
  const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
  return { x, y, w: Math.max(1, Math.min(page.w - x, Math.round(r.w))), h: Math.max(1, Math.min(page.h - y, Math.round(r.h))) };
}
export function pxToSlot(g: Grid, page: { w: number; h: number }, p: Px): Slot {
  const c = cellOf(g, page), clamp = (v: number, hi: number) => Math.min(hi, Math.max(1, v));
  const col = clamp(Math.round((p.x - c.m.left) / (c.w + c.gx)) + 1, g.columns), row = clamp(Math.round((p.y - c.m.top) / (c.h + c.gy)) + 1, g.rows);
  const col2 = clamp(Math.round((p.x + p.w - c.m.left + c.gx) / (c.w + c.gx)), g.columns), row2 = clamp(Math.round((p.y + p.h - c.m.top + c.gy) / (c.h + c.gy)), g.rows);
  return { col, row, width: Math.max(1, col2 - col + 1), height: Math.max(1, row2 - row + 1) };
}

// Placed by cells or by pixels on every size, converted from what it had.
export function placeAs(b: Block, by: 'slot' | 'px', l: Layout, cat: Catalogue): Block {
  if (placeBy(b) === by) return b;
  const sizes = sizesOf(l);
  const { slot: _s, px: _p, bleed: _b, ...rest } = b;
  const conv = (z: string): Slot | Px => {
    const g = l.canvas[z], page = cat.sizes[z] ?? { w: 1080, h: 1350 };
    if (by === 'px') { const s = slotOn(b, z); return s ? slotToPx(g, page, s) : { x: Math.round(page.w / 4), y: Math.round(page.h / 3), w: Math.round(page.w / 2), h: Math.round(page.h / 6) }; }
    const p = pxOn(b, z);
    return p ? pxToSlot(g, page, p) : { col: 1, row: 1, width: Math.min(4, g.columns), height: 1 };
  };
  const same = samePlace(b) && placeBy(b) !== 'none';
  return { ...rest, [by]: same || sizes.length <= 1 ? conv(sizes[0]) : Object.fromEntries(sizes.map((z) => [z, conv(z)])) } as Block;
}

// The page edges a slot touches on every size (where a block may bleed).
export function edgesTouched(b: Block, l: Layout): Edge[] {
  return EDGES.filter((e) => sizesOf(l).every((z) => {
    const s = slotOn(b, z), g = l.canvas[z];
    if (!s || !g) return false;
    return e === 'top' ? s.row === 1 : e === 'left' ? s.col === 1 : e === 'bottom' ? s.row + s.height - 1 === g.rows : s.col + s.width - 1 === g.columns;
  }));
}

// A block the page runs the full width to its bottom edge: only its top is the block's own.
export const isFullWidth = (b: Block, spec: PageBlockSpec | null) => !!spec?.fullWidth && Object.entries(spec.fullWidth).every(([k, v]) => (b[k] ?? spec.defaults[k]) === v);
export const fullWidthPx = (top: number, page: { w: number; h: number }): Px => { const y = Math.min(page.h - 1, Math.max(0, Math.round(top))); return { x: 0, y, w: page.w, h: page.h - y }; };

// ---- what a block's settings are shown with ----

export type Control =
  | { kind: 'place'; by: Array<'slot' | 'px'> }
  | { kind: 'bleed'; edges: Edge[] }
  | { kind: 'field'; fields: string[] }
  | { kind: 'words'; fields: string[]; sources: string[]; max: number }
  | { kind: 'binding'; key: string; fields: string[] }
  | { kind: 'option'; key: string; spec: OptionSpec }
  | { kind: 'when' }
  | { kind: 'children'; types: string[] };

// The controls of one block (or one slab child), in the order the editor shows them; [] for a block type the page does not draw.
export function blockControls(b: Block, l: Layout, cat: Catalogue, child = false): Control[] {
  const page = pageCatalogue(cat, l), spec = specFor(cat, l, b.type);
  if (!page || !spec) return [];
  const out: Control[] = [];
  if (!child && !spec.chrome) out.push({ kind: 'place', by: page.place });
  if (!child && spec.bleed && placeBy(b) === 'slot' && needsMet(b, spec.bleed.needs, spec)) out.push({ kind: 'bleed', edges: spec.bleed.edges });
  const words = spec.bindings.text || spec.bindings.source;
  if (words) out.push({ kind: 'words', fields: spec.fields, sources: spec.bindings.source?.values ?? [], max: spec.bindings.text?.max ?? 40 });
  else if (spec.kinds.length) out.push({ kind: 'field', fields: spec.fields });
  for (const [key, bind] of Object.entries(spec.bindings)) {
    if (key === 'text' || key === 'source' || (child && !bind.child) || !needsMet(b, bind.needs, spec)) continue;
    out.push({ kind: 'binding', key, fields: bind.fields ?? [] });
  }
  for (const [key, o] of Object.entries(spec.options)) {
    if (child && !spec.childOptions.includes(key)) continue;
    if (needsMet(b, o.needs, spec)) out.push({ kind: 'option', key, spec: o });
  }
  if (!child) out.push({ kind: 'when' });
  if (spec.children) out.push({ kind: 'children', types: spec.children });
  return out;
}

export function controlKeys(c: Control): string[] {
  switch (c.kind) {
    case 'place': return c.by;
    case 'bleed': return ['bleed'];
    case 'field': return ['field'];
    case 'words': return ['field', 'text', 'source'];
    case 'binding': return [c.key];
    case 'option': return [c.key];
    case 'when': return ['when'];
    case 'children': return ['children'];
  }
}

// After a change: settings whose need is no longer met are left out (a phone's tilt, a sub line's width without the sub line,
// a framed photo's bleed), so the block keeps only what the editor shows.
export function tidyBlock(b: Block, spec: PageBlockSpec | null): Block {
  if (!spec) return b;
  const next: Block = { ...b };
  let changed = true;
  while (changed) {
    changed = false;
    for (const [k, o] of Object.entries(spec.options)) if (next[k] !== undefined && o.needs && !needsMet(next, o.needs, spec)) { delete next[k]; changed = true; }
    for (const [k, v] of Object.entries(spec.bindings)) if (next[k] !== undefined && v.needs && !needsMet(next, v.needs, spec)) { delete next[k]; changed = true; }
  }
  if (next.bleed !== undefined && spec.bleed && !needsMet(next, spec.bleed.needs, spec)) delete next.bleed;
  return next;
}

// ---- what the editor could not show ----

const optionShown = (o: OptionSpec, v: unknown) => (o.type === 'enum' ? o.values.includes(v as string | number) || (typeof v === 'string' && !!o.aliases && Object.hasOwn(o.aliases, v))
  : o.type === 'bool' ? typeof v === 'boolean' : Number.isFinite(v));

function placeRest(b: Block, sizes: string[], where: string): string[] {
  const out: string[] = [];
  if (b.slot !== undefined && b.px !== undefined) out.push(`${where}.px`);
  for (const key of ['slot', 'px'] as const) {
    const v = b[key];
    if (v === undefined) continue;
    const parts = key === 'slot' ? ['col', 'row', 'width', 'height'] : ['x', 'y', 'w', 'h'];
    const one = (r: unknown, w: string) => { if (!isObj(r)) out.push(w); else for (const k of Object.keys(r)) if (!parts.includes(k) || !Number.isFinite(r[k])) out.push(`${w}.${k}`); };
    if (!isObj(v)) out.push(`${where}.${key}`);
    else if (parts[0] in v) one(v, `${where}.${key}`);
    else for (const [z, r] of Object.entries(v)) { if (!sizes.includes(z)) out.push(`${where}.${key}.${z}`); else one(r, `${where}.${key}.${z}`); }
  }
  return out;
}

function blockRest(b: unknown, l: Layout, cat: Catalogue, where: string, child: boolean): string[] {
  if (!isObj(b) || typeof b.type !== 'string') return [where];
  const blk = b as Block, spec = specFor(cat, l, blk.type);
  if (!spec) return [where];
  const controls = blockControls(blk, l, cat, child);
  const keys = new Set(['type', ...controls.flatMap(controlKeys)]);
  const out: string[] = [];
  for (const k of Object.keys(blk)) if (!keys.has(k)) out.push(`${where}.${k}`);
  for (const c of controls) {
    if (c.kind === 'option' && blk[c.key] !== undefined && !optionShown(c.spec, blk[c.key])) out.push(`${where}.${c.key}`);
    if (c.kind === 'bleed' && blk.bleed !== undefined && (!Array.isArray(blk.bleed) || blk.bleed.some((e) => !c.edges.includes(e)))) out.push(`${where}.bleed`);
    if ((c.kind === 'field' || c.kind === 'binding' || c.kind === 'words') && typeof blk[c.kind === 'binding' ? c.key : 'field'] !== 'string' && blk[c.kind === 'binding' ? c.key : 'field'] !== undefined) out.push(`${where}.${c.kind === 'binding' ? c.key : 'field'}`);
    if (c.kind === 'words' && blk.text !== undefined && typeof blk.text !== 'string') out.push(`${where}.text`);
    if (c.kind === 'words' && blk.source !== undefined && !c.sources.includes(blk.source)) out.push(`${where}.source`);
    if (c.kind === 'when') out.push(...readWhen(blk.when).rest.map((p) => `${where}.${p}`));
    if (c.kind === 'place') out.push(...placeRest(blk, sizesOf(l), where));
    if (c.kind === 'children' && blk.children !== undefined) {
      if (!Array.isArray(blk.children)) out.push(`${where}.children`);
      else blk.children.forEach((ch, i) => { out.push(...(isObj(ch) && c.types.includes(String(ch.type)) ? blockRest(ch, l, cat, `${where}.children[${i}]`, true) : [`${where}.children[${i}]`])); });
    }
  }
  return out;
}

// Every setting of a layout the visual editor could not show (as paths like "blocks[2].tilt"): [] for every layout the engine
// accepts for a brand. The editor lists them, so nothing in the JSON is ever hidden from the person editing.
export function uncovered(l: unknown, cat: Catalogue): string[] {
  if (!isObj(l)) return ['the layout'];
  const layout = l as unknown as Layout, out: string[] = [];
  for (const k of Object.keys(l)) if (!LAYOUT_KEYS.includes(k)) out.push(k);
  for (const k of ['id', 'name', 'description', 'accent', 'texture'] as const) if (l[k] !== undefined && typeof l[k] !== 'string') out.push(k);
  if (l.accent !== undefined && !cat.layout.accents.includes(l.accent as string)) out.push('accent');
  if (l.texture !== undefined && !cat.textures.includes(l.texture as string)) out.push('texture');
  const page = pageCatalogue(cat, layout);
  if (!page) return [...out, 'page'];
  const g = readGround(l.ground);
  out.push(...g.rest);
  const grounds = [...page.grounds, ...Object.keys(cat.groundAliases)];
  const shownGround = (v: unknown) => typeof v === 'string' && grounds.includes(v);
  if (g.model.kind === 'one' && !shownGround(g.model.ground)) out.push('ground');
  if (g.model.kind === 'cases') g.model.cases.forEach((c, i) => { if (!shownGround(c.ground)) out.push(`ground[${i}].ground`); });
  if (!isObj(l.fields)) out.push('fields');
  else for (const [name, rule] of Object.entries(l.fields)) {
    const F = cat.fields[name];
    if (!F || !isObj(rule)) { out.push(`fields.${name}`); continue; }
    for (const [k, v] of Object.entries(rule)) {
      const ok = k === 'required' ? typeof v === 'boolean' : k === 'types' ? !!F.rules.types && Array.isArray(v) && v.every((t) => F.rules.types!.includes(t)) : (k === 'min' || k === 'max') && !!F.rules[k as 'min' | 'max'] && Number.isFinite(v);
      if (!ok) out.push(`fields.${name}.${k}`);
    }
  }
  if (!isObj(l.canvas)) out.push('canvas');
  else for (const [z, grid] of Object.entries(l.canvas)) {
    if (!page.sizes.includes(z) || !isObj(grid)) { out.push(`canvas.${z}`); continue; }
    for (const [k, v] of Object.entries(grid)) {
      const ok = GRID_KEYS.includes(k) && (k === 'margin' ? Number.isFinite(v) || (isObj(v) && Object.keys(v).every((e) => EDGES.includes(e as Edge) && Number.isFinite(v[e]))) : Number.isFinite(v));
      if (!ok) out.push(`canvas.${z}.${k}`);
    }
  }
  if (!Array.isArray(l.blocks)) out.push('blocks');
  else l.blocks.forEach((b, i) => out.push(...blockRest(b, layout, cat, `blocks[${i}]`, false)));
  return out;
}

// Whether the editor can open a layout at all (else the JSON stays the place to fix it).
export function editableShape(l: unknown): string | null {
  if (!isObj(l)) return 'The JSON must be one layout object';
  if (!isObj(l.fields)) return 'The layout needs "fields", an object (like { "headline": {} })';
  if (!isObj(l.canvas) || !Object.keys(l.canvas).length || !Object.values(l.canvas).every((g) => isObj(g) && Number.isFinite(g.columns) && Number.isFinite(g.rows))) return 'The layout needs "canvas" with a grid of columns and rows for at least one size';
  if (!Array.isArray(l.blocks) || !l.blocks.every((b) => isObj(b) && typeof b.type === 'string')) return 'The layout needs "blocks", a list of blocks each with a "type"';
  return null;
}

// ---- the whole layout, through every part's reader and writer ----

export interface BlockModel { block: Block; cond: Condition | null; place: { by: PlaceBy; same: boolean }; children: BlockModel[] | null }
export interface LayoutModel { layout: Layout; ground: GroundModel; blocks: BlockModel[] }

const blockModel = (b: Block): BlockModel => ({
  block: b, cond: b.when === undefined ? null : readWhen(b.when).cond, place: { by: placeBy(b), same: samePlace(b) },
  children: Array.isArray(b.children) ? b.children.map(blockModel) : null,
});
export function toModel(l: Layout): LayoutModel { return { layout: l, ground: readGround(l.ground).model, blocks: (l.blocks ?? []).map(blockModel) }; }

function writeBlock(m: BlockModel): Block {
  const out: Block = { ...m.block };
  const w = m.cond ? writeWhen(m.cond) : undefined;
  if (w) out.when = w; else delete out.when;
  for (const key of ['slot', 'px'] as const) {
    const v = m.block[key];
    if (v === undefined) continue;
    out[key] = (m.place.same ? { ...(v as object) } : Object.fromEntries(Object.entries(v as object).map(([z, r]) => [z, { ...(r as object) }]))) as never;
  }
  if (m.children) out.children = m.children.map(writeBlock);
  return out;
}
export function fromModel(m: LayoutModel): Layout {
  const out: Layout = { ...m.layout, fields: structuredClone(m.layout.fields), canvas: structuredClone(m.layout.canvas), blocks: m.blocks.map(writeBlock) };
  const g = writeGround(m.ground);
  if (g === undefined) delete out.ground; else out.ground = g;
  return out;
}

// ---- fields ----

// The fields the blocks show (a block's field or its type's own, a label's field, a window title, a flowing sub line).
export function fieldsShown(l: Layout, cat: Catalogue): string[] {
  const out: string[] = [];
  const walk = (b: Block) => {
    const spec = specFor(cat, l, b.type);
    if (b.type === 'label') { if (typeof b.field === 'string') out.push(b.field); }
    else if (spec?.kinds.length) out.push(String(b.field ?? spec.field));
    for (const k of ['titleField', 'subField']) if (typeof b[k] === 'string') out.push(b[k] as string);
    (b.children ?? []).forEach(walk);
  };
  (l.blocks ?? []).forEach(walk);
  return out;
}
export const withField = (l: Layout, name: string, rule: FieldRule = {}): Layout => (l.fields[name] ? l : { ...l, fields: { ...l.fields, [name]: rule } });

// ---- sizes ----

// A size added (its grid from the size being edited, its margins at least the new size's own minimums; each block's per-size
// place copied, pixels scaled to the new page) or removed (its grid and per-size places dropped).
export function withSize(l: Layout, z: string, on: boolean, from: string, cat: Catalogue): Layout {
  const canvas = { ...l.canvas };
  if (!on) {
    delete canvas[z];
    const drop = (b: Block): Block => {
      const out = { ...b };
      for (const key of ['slot', 'px'] as const) if (isObj(b[key]) && !(key === 'slot' ? isSlot(b[key]) : isPx(b[key]))) { const per = { ...(b[key] as Json) }; delete per[z]; out[key] = per as never; }
      return out;
    };
    return { ...l, canvas, blocks: l.blocks.map(drop) };
  }
  const src = l.canvas[from] ?? Object.values(l.canvas)[0];
  const min = cat.sizes[z].minMargins, m = marginsOf(src.margin);
  canvas[z] = { ...src, margin: Object.fromEntries(EDGES.map((e) => [e, Math.max(m[e], min[e])])) as Margins };
  const A = cat.sizes[from] ?? cat.sizes.feed, B = cat.sizes[z];
  const add = (b: Block): Block => {
    const out = { ...b };
    if (isObj(b.slot) && !isSlot(b.slot)) { const s = slotOn(b, from); if (s) out.slot = { ...(b.slot as Record<string, Slot>), [z]: { ...s } }; }
    if (isObj(b.px) && !isPx(b.px)) {
      const p = pxOn(b, from);
      if (p) {
        const x = Math.round((p.x / A.w) * B.w), y = Math.round((p.y / A.h) * B.h);
        out.px = { ...(b.px as Record<string, Px>), [z]: { x, y, w: Math.max(1, Math.min(B.w - x, Math.round((p.w / A.w) * B.w))), h: Math.max(1, Math.min(B.h - y, Math.round((p.h / A.h) * B.h))) } };
      }
    }
    return out;
  };
  return { ...l, canvas, blocks: l.blocks.map(add) };
}


// ---- the kind of page ----

// The layout moved to another kind of page: the blocks that page draws, with the options it takes there, placed as it places
// them (a built-in page in pixels at the feed size, its chrome by the page); what it does not draw is left out and named.
export function convertPage(l: Layout, to: string, cat: Catalogue): { layout: Layout; dropped: string[] } {
  const target = cat.pages[to];
  if (!target || to === pageKind(l)) return { layout: l, dropped: [] };
  const dropped: string[] = [];
  const next: Layout = { ...l, page: to === 'grid' ? (l.page === undefined ? undefined : 'grid') : to };
  if (next.page === undefined) delete next.page;
  const sizes = sizesOf(l).filter((z) => target.sizes.includes(z));
  const keep = sizes.length ? sizes : [target.sizes[0]];
  next.canvas = Object.fromEntries(keep.map((z) => [z, l.canvas[z] ?? Object.values(l.canvas)[0]]));
  const spec = (t: string) => target.blocks[t] ?? null;
  const fit = (b: Block, child: boolean): Block | null => {
    const s = spec(b.type);
    if (!s || (child && !s.child)) { dropped.push(b.type); return null; }
    const out: Block = { type: b.type };
    for (const k of ['field', 'text', 'source']) if (b[k] !== undefined) out[k] = b[k];
    for (const [k, v] of Object.entries(b)) {
      if (k in s.options && (!child || s.childOptions.includes(k))) {
        const o = s.options[k];
        if (o.type !== 'enum' || o.values.includes(v as string | number) || (typeof v === 'string' && o.aliases && Object.hasOwn(o.aliases, v))) out[k] = v;
      }
      if (k in s.bindings && k !== 'text' && k !== 'source' && (!child || s.bindings[k].child)) out[k] = v;
    }
    if (!child && b.when !== undefined) {
      const c = readWhen(b.when).cond;
      if (c.choice && !(c.choice.field in target.conditions.choices)) delete c.choice;
      const w = writeWhen(c);
      if (w) out.when = w;
    }
    if (!child && !s.chrome) {
      if (target.place.includes('slot') && b.slot !== undefined) { out.slot = b.slot; if (s.bleed && b.bleed) out.bleed = b.bleed; }
      else {
        const z = keep[0], page = cat.sizes[z];
        const p = pxOn(b, z) ?? (slotOn(b, z) && l.canvas[z] ? slotToPx(l.canvas[z], page, slotOn(b, z)!) : { x: 80, y: 600, w: page.w - 160, h: 200 });
        out.px = isFullWidth(out, s) ? fullWidthPx(p.y, page) : p;
      }
    }
    if (s.children) out.children = (b.children ?? []).map((c) => fit(c, true)).filter((c): c is Block => !!c).filter((c) => s.children!.includes(c.type));
    return tidyBlock(out, s);
  };
  next.blocks = l.blocks.map((b) => fit(b, false)).filter((b): b is Block => !!b);
  // the page colour: a photo ground only where the page has one; conditions on a choice the page does not test are left out
  const g = readGround(l.ground).model;
  const groundOk = (v: unknown) => typeof v === 'string' && (target.grounds.includes(v) || Object.hasOwn(cat.groundAliases, v));
  if (g.kind === 'one' && !groundOk(g.ground)) next.ground = 'series';
  if (g.kind === 'cases') {
    const cases = g.cases.map((c) => { const cond = c.cond ? { ...c.cond } : null; if (cond?.choice && !(cond.choice.field in target.conditions.choices)) delete cond.choice; return { cond: cond && clauseKinds(cond).length ? cond : c.cond ? {} : null, ground: groundOk(c.ground) ? c.ground : 'series' }; });
    next.ground = writeGround({ kind: 'cases', cases: cases.filter((c, i) => i === cases.length - 1 || (c.cond && clauseKinds(c.cond).length)) });
  }
  // a field no block shows any more is left out
  const shown = new Set(fieldsShown(next, cat));
  next.fields = Object.fromEntries(Object.entries(l.fields).filter(([f]) => shown.has(f)));
  return { layout: next, dropped: [...new Set(dropped)] };
}

// ---- "sketch as if": which blocks a post would draw, and on which page colour ----

export interface Scenario { empty: string[]; page: string; choices: Record<string, ChoiceValue | undefined> }

// The conditions a layout uses (its blocks' and its ground cases'), to offer only the switches that change something.
export function conditionsUsed(l: Layout): Condition[] {
  const out: Condition[] = [];
  for (const b of l.blocks ?? []) if (b.when !== undefined) out.push(readWhen(b.when).cond);
  const g = readGround(l.ground).model;
  if (g.kind === 'cases') for (const c of g.cases) if (c.cond) out.push(c.cond);
  return out;
}
// The words a preview fills every field with (the engine's sample artefact is a register card, unless the field asks for another).
export function defaultScenario(l: Layout): Scenario {
  const types = l.fields?.artefact?.types;
  return { empty: [], page: 'single', choices: { artefact: !types || types.includes('register') ? 'register' : types[0], register: false } };
}
export function holds(w: unknown, sc: Scenario, l: Layout, cat: Catalogue): boolean {
  if (w === undefined) return true;
  const { cond } = readWhen(w);
  const filled = (f: string) => !!l.fields?.[f] && !sc.empty.includes(f);
  if (cond.present !== undefined && !filled(cond.present)) return false;
  if (cond.absent !== undefined && filled(cond.absent)) return false;
  if (cond.page !== undefined && cond.page !== sc.page) return false;
  if (cond.choice) {
    const declared = pageCatalogue(cat, l)?.conditions.choices[cond.choice.field]?.declared ?? false;
    const v = declared && !filled(cond.choice.field) ? undefined : sc.choices[cond.choice.field];
    const hit = v !== undefined && cond.choice.values.includes(v);
    if (cond.choice.op === 'is' ? !hit : hit) return false;
  }
  return true;
}
export function groundIn(l: Layout, sc: Scenario, cat: Catalogue): string {
  const g = readGround(l.ground).model;
  const v = g.kind === 'default' ? 'series' : g.kind === 'one' ? g.ground : g.cases.find((c) => holds(c.cond ? writeWhen(c.cond) : undefined, sc, l, cat))?.ground;
  return typeof v === 'string' ? (cat.groundAliases[v] ?? v) : 'series';
}
