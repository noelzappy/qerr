// The design (composition) editor's logic, pure (no React). A design is JSON and stays JSON: `comp` below is one composition of a look,
// `look` its look's settings (canvas, devices, type, colour), `cat` the engine's catalogue (lookCatalogue()). Every function takes the
// objects and returns new ones; nothing is changed in place, and an edit that changes nothing returns the very same object.
//
//   tree          listTree, locate, elementName, summary          the elements as rows, addressed by index paths ("2", "2.0")
//   properties    getProp, setProp, coerceProp, checkProp          read and write one property by catalogue descriptor (never clamped)
//   structure     addElement, duplicateElement, removeElement, restoreElement, reorderElement, moveInto, moveOut
//   geometry      staticRect, sketchRect, rectToPlace, dragRect, applyRect, moveByCells, resizeByCells, setPlaceForm
//   turning       setRotation, nearestAngle, namedAngles
//   fields        shownFields, bindField, pruneFields, setBudget, addField, removeField, readWhen, setWhen, accepts*
//   problems      mapProblems (a server path such as elements[2].children[0].size becomes the element path "2.0")
//
// The paths are the ones the engine puts on the page as data-el: digits and dots, in document order, the children of a box, band or
// seam nested under it. A seam's sticker (its one slot) is addressed as one more child after the seam's own children.
import { clone, joinPath } from './look-model';
import type { Desc, Json, LookCatalogue, Problem } from './look-types';

export type { Json };
export const PAGE = { w: 1080, h: 1350 } as const;
export interface Rect { x: number; y: number; w: number; h: number }
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export interface Edit { comp: Json; path?: string; error?: string }

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const limit = (cat: LookCatalogue, k: string, fallback: number) => cat.limits[k] ?? fallback;
const round = (n: number) => Math.round(n * 1000) / 1000;
const sentence = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

// ================================================================== paths and the tree

export const parsePathEl = (p: string): number[] => (p === '' ? [] : p.split('.').map(Number));
export const joinEl = (base: string, i: number): string => (base ? `${base}.${i}` : String(i));
export const parentOfPath = (p: string): string => p.split('.').slice(0, -1).join('.');
export const depthOfPath = (p: string): number => p.split('.').length;

export interface Loc { el: Json; list: Json[] | null; index: number; parent: Json | null; parentPath: string; slot: boolean; depth: number }

// Where the element at `path` is: the list it is in (null for a seam's slot), its index, its parent.
export function locate(comp: Json, path: string): Loc | null {
  const idx = parsePathEl(path);
  if (!idx.length || idx.some((i) => !Number.isInteger(i) || i < 0)) return null;
  let list: Json[] = Array.isArray(comp.elements) ? (comp.elements as Json[]) : [];
  let parent: Json | null = null;
  let loc: Loc | null = null;
  for (let n = 0; n < idx.length; n++) {
    const i = idx[n]!;
    const parentPath = idx.slice(0, n).join('.');
    if (i < list.length && isObj(list[i])) loc = { el: list[i]!, list, index: i, parent, parentPath, slot: false, depth: n + 1 };
    else if (i === list.length && parent && isObj(parent.sticker)) loc = { el: parent.sticker, list: null, index: i, parent, parentPath, slot: true, depth: n + 1 };
    else return null;
    parent = loc.el;
    list = Array.isArray(parent.children) ? (parent.children as Json[]) : [];
  }
  return loc;
}
export const elementAt = (comp: Json, path: string): Json | null => locate(comp, path)?.el ?? null;

// A copy of comp, changed by fn (which may change the copy as it likes).
function mutate(comp: Json, fn: (c: Json) => void): Json {
  const c = clone(comp);
  fn(c);
  return same(c, comp) ? comp : c;
}
const elementsOf = (c: Json): Json[] => (Array.isArray(c.elements) ? (c.elements as Json[]) : (c.elements = []) as Json[]);

export interface TreeRow { path: string; depth: number; type: string; name: string; el: Json; container: boolean; slot: boolean; placed: boolean; parentPath: string; flows: boolean }
const placeKeys = ['grid', 'px', 'anchor', 'inset'];
export const hasPlace = (el: Json): boolean => isObj(el.place) && placeKeys.some((k) => k in (el.place as Json));

// The elements in document order (back to front), each with its address, plain name and whether it flows in its box.
export function listTree(comp: Json, cat: LookCatalogue | null): TreeRow[] {
  const out: TreeRow[] = [];
  const walk = (list: unknown, base: string, depth: number, parentEl: Json | null) => {
    if (!Array.isArray(list)) return;
    list.forEach((el, i) => {
      if (!isObj(el)) return;
      const path = joinEl(base, i);
      const type = String(el.type);
      const info = cat?.elements[type];
      out.push({ path, depth, type, name: elementName(el, cat), el, container: !!info?.container, slot: false, placed: hasPlace(el), parentPath: base, flows: !!parentEl && !hasPlace(el) && !!info?.flow });
      walk(el.children, path, depth + 1, el);
      if (isObj(el.sticker)) {
        const kids = Array.isArray(el.children) ? el.children.length : 0;
        const sp = joinEl(path, kids), s = el.sticker;
        out.push({ path: sp, depth: depth + 1, type: 'sticker', name: `${elementName(s, cat)} on the edge`, el: s, container: true, slot: true, placed: hasPlace(s), parentPath: path, flows: false });
        walk(s.children, sp, depth + 2, s);
      }
    });
  };
  walk(comp.elements, '', 1, null);
  return out;
}

export const countNodes = (comp: Json): number => listTree(comp, null).length;
export const fieldLabel = (f: string, cat: LookCatalogue | null): string => cat?.fields[f]?.label ?? f.replace(/-/g, ' ');

const SOURCE_NAME: Record<string, string> = { brand: 'Brand name', folio: 'Folio', index: 'List number', site: 'Web address' };
// "Headline", "Sub line", "Picture", "Brand name": the plain name of an element.
export function elementName(el: Json, cat: LookCatalogue | null): string {
  const type = String(el.type);
  const label = cat?.elements[type]?.label ?? type.replace(/-/g, ' ');
  if (type === 'text') {
    if (typeof el.source === 'string') return SOURCE_NAME[el.source] ?? el.source;
    if (typeof el.word === 'string') return `The word ${el.word}`;
    if (typeof el.field === 'string') return fieldLabel(el.field, cat);
    return label;
  }
  if (type === 'fitted-stack' || type === 'mantra-rows') return `${fieldLabel(typeof el.field === 'string' ? el.field : 'headline', cat)}${type === 'mantra-rows' ? ', repeated' : ''}`;
  if (type === 'numeral') return fieldLabel(typeof el.field === 'string' ? el.field : 'big', cat);
  if (type === 'sticker') return typeof el.field === 'string' ? `Sticker: ${fieldLabel(el.field, cat)}` : 'Sticker';
  if (type === 'rows') return el.each === 'meta-parts' ? 'Event rows' : 'List rows';
  return label;
}

// ================================================================== descriptors and values

// '' when `v` suits the descriptor, else one plain sentence. Nothing is ever clamped.
export function checkProp(desc: Desc, v: unknown, cat: LookCatalogue): string {
  const range = () => (isNum(desc.min) && isNum(desc.max) ? `Use ${round(desc.min)} to ${round(desc.max)}` : 'Use a number');
  switch (desc.kind) {
    case 'number':
      if (!isNum(v)) return 'Enter a number';
      if (desc.int && !Number.isInteger(v)) return 'Use a whole number';
      return (isNum(desc.min) && v < desc.min) || (isNum(desc.max) && v > desc.max) ? range() : '';
    case 'enum': return desc.values?.some((x) => x === v) ? '' : 'Choose one of the listed values';
    case 'bool': return typeof v === 'boolean' ? '' : 'Choose on or off';
    case 'role': return typeof v === 'string' && (cat.lists.roles as string[]).includes(v) ? '' : 'Choose one of the brand colours';
    case 'text': return typeof v === 'string' && (!isNum(desc.max) || v.length <= desc.max) ? '' : `Use at most ${desc.max} characters`;
    case 'field': return typeof v === 'string' && (desc as Desc & { of?: unknown }).of && ((desc as unknown as { of: string[] }).of).includes(v) ? '' : 'Choose one of the listed fields';
    case 'length':
      if (typeof v === 'string') return (cat.lists.lengthTokens as string[]).includes(v) ? '' : 'Use a number of pixels or margin, gutter, col, frame, frame+pad';
      return isNum(v) && (!isNum(desc.min) || v >= desc.min) && (!isNum(desc.max) || v <= desc.max) ? '' : range();
    case 'angle':
      if (typeof v === 'string') return (cat.lists.angles as string[]).includes(v) ? '' : 'Choose one of the look\'s angles';
      return isNum(v) && v >= -15 && v <= 15 ? '' : 'Use -15 to 15 degrees';
    case 'list': {
      if (!Array.isArray(v)) return 'Enter a list';
      if (isNum(desc.min) && v.length < desc.min) return `Add at least ${desc.min}`;
      if (isNum(desc.max) && v.length > desc.max) return `Keep at most ${desc.max}`;
      if (desc.unique && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) return 'Each can be used once';
      const of = desc.of as Desc | undefined;
      return of ? v.map((x) => checkProp(of, x, cat)).find(Boolean) ?? '' : '';
    }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== (desc.items?.length ?? 0)) return 'Fill in every value';
      return (desc.items ?? []).map((d, i) => checkProp(d, v[i], cat)).find(Boolean) ?? '';
    }
    case 'object': {
      if (!isObj(v)) return 'Enter the values';
      for (const k of Object.keys(v)) if (!desc.props?.[k]) return `${k} is not a setting here`;
      for (const k of desc.required ?? []) if (v[k] === undefined) return `Give ${desc.props?.[k]?.label ?? k}`;
      for (const [k, d] of Object.entries(desc.props ?? {})) if (v[k] !== undefined) { const m = checkProp(d, v[k], cat); if (m) return m; }
      return '';
    }
    case 'oneOf': {
      const forms = (desc as unknown as { forms: Array<{ is: string; desc: Desc }> }).forms ?? [];
      const form = forms.find((f) => (f.is === 'array' ? Array.isArray(v) : f.is === 'object' ? isObj(v) : f.is === 'boolean' ? typeof v === 'boolean' : typeof v === f.is));
      return form ? checkProp(form.desc, v, cat) : 'Choose one of the forms';
    }
    case 'place': case 'when': case 'children': return '';
    default: return '';
  }
}

// A value typed or picked in a control, made the descriptor's kind; or why it cannot be.
export function coerceProp(desc: Desc, raw: unknown, cat: LookCatalogue): { value: unknown } | { error: string } {
  let v = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (desc.kind === 'number') v = t === '' || !Number.isFinite(Number(t)) ? NaN : Number(t);
    else if (desc.kind === 'enum' && desc.values?.some((x) => typeof x === 'number')) v = desc.values.find((x) => String(x) === t) ?? raw;
    else if (desc.kind === 'length' || desc.kind === 'angle') v = t !== '' && Number.isFinite(Number(t)) ? Number(t) : t;
  }
  const error = checkProp(desc, v, cat);
  return error ? { error } : { value: v };
}

export const descOf = (type: string, name: string, cat: LookCatalogue): Desc | null => cat.elements[type]?.properties[name] ?? null;
export const getProp = (el: Json, name: string): unknown => el[name];
// The properties an element of this type takes, in the catalogue's order, own first.
export function propsOf(type: string, cat: LookCatalogue): Array<[string, Desc & { group?: string }]> {
  return Object.entries(cat.elements[type]?.properties ?? {});
}

// Sets (or, with undefined, removes) one property. A value the descriptor refuses is an error and the design is unchanged.
export function setProp(comp: Json, path: string, name: string, raw: unknown, cat: LookCatalogue, look?: Json): Edit {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  const type = String(loc.el.type);
  if (name === 'type' || !cat.elements[type]) return { comp, error: 'The type of an element is fixed' };
  if (name === 'place') return isObj(raw) ? setPlace(comp, path, raw, cat) : { comp, error: 'Use the place controls to remove or change how it is placed' };
  if (name === 'when') return setWhen(comp, path, isObj(raw) ? readWhen({ when: raw }) : {}, cat);
  if (name === 'children') return { comp, error: 'Pieces are added and moved in the layers' };
  if (name === 'rot') return setRotation(comp, path, raw === '' || raw === null ? undefined : (raw as string | number | undefined), look ?? {}, cat, !look);
  const desc = descOf(type, name, cat);
  if (!desc) return { comp, error: `A ${cat.elements[type]!.label.toLowerCase()} has no setting called ${name}` };
  if (raw === undefined || raw === null || raw === '') {
    if (cat.elements[type]!.required?.includes(name)) return { comp, error: `${desc.label ?? name} is needed` };
    return { comp: mutate(comp, (c) => { delete locate(c, path)!.el[name]; }), path };
  }
  const r = coerceProp(desc, raw, cat);
  if ('error' in r) return { comp, error: r.error };
  return { comp: mutate(comp, (c) => { locate(c, path)!.el[name] = r.value; }), path };
}

// ================================================================== the look's grid and tokens

export interface Grid { m: { top: number; right: number; bottom: number; left: number }; cols: number; gutter: number; rows: number; head: number; colW: number; rowH: number }
export function gridOf(look: Json): Grid | null {
  const feed = (look.canvas as Json | undefined)?.feed as Json | undefined;
  const m = feed?.margin as Json | undefined, g = feed?.grid as Json | undefined;
  if (!isObj(m) || !isObj(g)) return null;
  const { top, right, bottom, left } = m as Record<string, number>;
  const cols = g.cols as number, gutter = g.gutter as number;
  if (![top, right, bottom, left, cols, gutter].every(isNum)) return null;
  const rows = Number.isInteger(g.rows) ? (g.rows as number) : 0, head = isNum(g.head) ? g.head : 0;
  const colW = (PAGE.w - left! - right! - (cols - 1) * gutter) / cols;
  const bodyRows = head > 0 ? rows - 1 : rows;
  const rowH = rows > 0 && bodyRows > 0 ? (PAGE.h - top! - bottom! - (head > 0 ? head + gutter : 0) - (bodyRows - 1) * gutter) / bodyRows : 0;
  return { m: { top: top!, right: right!, bottom: bottom!, left: left! }, cols, gutter, rows, head, colW, rowH };
}
export const colX = (g: Grid, i0: number): number => g.m.left + i0 * (g.colW + g.gutter);
// The top and bottom y of rows `row` .. `row + span - 1` (1-based; with a top row, row 1 is that row).
export function rowSpanOf(g: Grid, row: number, span: number): [number, number] {
  const top = (r: number) => (g.head > 0 ? (r === 1 ? g.m.top : g.m.top + g.head + g.gutter + (r - 2) * (g.rowH + g.gutter)) : g.m.top + (r - 1) * (g.rowH + g.gutter));
  const bottom = (r: number) => (g.head > 0 && r === 1 ? g.m.top + g.head : top(r) + g.rowH);
  return [top(row), bottom(row + span - 1)];
}
const frameOf = (look: Json): { t: number; pad: number } => {
  const f = (look.devices as Json | undefined)?.frame as Json | undefined;
  return { t: isNum(f?.t) ? f!.t as number : 0, pad: isNum(f?.pad) ? f!.pad as number : 0 };
};
const lenPx = (v: unknown, side: 'left' | 'right' | 'top' | 'bottom', look: Json, g: Grid): number => {
  if (isNum(v)) return v;
  const f = frameOf(look);
  return v === 'margin' ? g.m[side] : v === 'gutter' ? g.gutter : v === 'col' ? g.colW : v === 'frame' ? f.t : v === 'frame+pad' ? f.t + f.pad : 0;
};

// ================================================================== rectangles

interface Box { x0: number; y0: number; x1: number; y1: number }
const PAGE_BOX: Box = { x0: 0, y0: 0, x1: PAGE.w, y1: PAGE.h };
const toRect = (b: Box): Rect => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 });
const toBox = (r: Rect): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });

// The rectangle a place gives (page pixels). `mh` is the height of an element whose height the place does not give; null means unknown,
// and then `unknown` is set. Mirrors the engine (look-static.mjs placeRect).
function placeBox(place: Json, base: Box, look: Json, g: Grid, mh: number | null): { box: Box; unknown: boolean } {
  let unknown = false;
  const f = frameOf(look);
  if (typeof place.inset === 'string') {
    if (place.inset === 'page') return { box: { ...PAGE_BOX }, unknown };
    if (place.inset === 'margins') return { box: { x0: g.m.left, y0: g.m.top, x1: PAGE.w - g.m.right, y1: PAGE.h - g.m.bottom }, unknown };
    return { box: { x0: f.t, y0: f.t, x1: PAGE.w - f.t, y1: PAGE.h - f.t }, unknown };
  }
  const bw = base.x1 - base.x0, bh = base.y1 - base.y0;
  const dx = isNum(place.dx) ? place.dx : 0, dy = isNum(place.dy) ? place.dy : 0, minH = isNum(place.minH) ? place.minH : 0;
  if (isObj(place.px)) {
    const p = place.px;
    if (!isNum(p.w) || !isNum(p.h)) unknown = true;
    return { box: { x0: base.x0 + (p.x as number), y0: base.y0 + (p.y as number), x1: base.x0 + (p.x as number) + (isNum(p.w) ? p.w : 0), y1: base.y0 + (p.y as number) + Math.max(isNum(p.h) ? p.h : 0, minH) }, unknown };
  }
  if (isObj(place.anchor)) {
    const a = place.anchor;
    const v = (k: string, side: 'left' | 'right' | 'top' | 'bottom') => (a[k] === undefined ? null : lenPx(a[k], side, look, g));
    const axis = (lo: number | null, hi: number | null, size: number | null, total: number, b0: number, needSize: boolean): [number, number] => {
      if (lo !== null && hi !== null) return [b0 + lo, b0 + total - hi];
      if (size === null && needSize) { unknown = true; size = 0; }
      if (lo !== null) return [b0 + lo, b0 + lo + (size ?? 0)];
      if (hi !== null) return [b0 + total - hi - (size ?? 0), b0 + total - hi];
      if (size !== null) return [b0, b0 + size];
      unknown = true;
      return [b0, b0 + total];
    };
    const [x0, x1] = axis(v('left', 'left'), v('right', 'right'), v('w', 'left'), bw, base.x0, true);
    const ah = v('h', 'top');
    let [y0, y1] = axis(v('top', 'top'), v('bottom', 'bottom'), ah ?? (mh === null ? null : mh), bh, base.y0, true);
    const lack = minH - (y1 - y0);
    if (lack > 0) { if (a.top === undefined && a.bottom !== undefined) y0 = y1 - minH; else y1 = y0 + minH; }
    return { box: { x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy }, unknown };
  }
  const q = isObj(place.grid) ? place.grid : null;
  if (!q) return { box: { ...base }, unknown: true };
  const col = q.col as number, span = q.span as number;
  const x0 = g.m.left + (col - 1) * (g.colW + g.gutter);
  const x1 = place.w !== undefined ? x0 + lenPx(place.w, 'left', look, g) : x0 + span * g.colW + (span - 1) * g.gutter;
  let y0 = g.m.top, y1 = PAGE.h - g.m.bottom;
  if (isNum(q.row) && g.rows > 0) {
    [y0, y1] = rowSpanOf(g, q.row, isNum(q.rowSpan) ? q.rowSpan : 1);
    if (place.h !== undefined) y1 = y0 + lenPx(place.h, 'top', look, g);
  }
  if (place.square === true) {
    const side = x1 - x0;
    if (isNum(q.row) && q.alignY === 'bottom') y0 = y1 - side;
    else if (isNum(q.row) && q.alignY === 'center') { const mid = (y0 + y1) / 2; y0 = mid - side / 2; y1 = mid + side / 2; }
    else y1 = y0 + side;
  }
  if (y1 - y0 < minH) { if (isNum(q.row) && q.alignY === 'bottom') y0 = y1 - minH; else y1 = y0 + minH; }
  return { box: { x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy }, unknown };
}

// A rough height for an element whose place does not give one (for the sketch only).
function guessHeight(el: Json, look: Json): number {
  const t = String(el.type);
  if (t === 'text') {
    const ladder = isObj(el.ladder) && Array.isArray(el.ladder.steps) ? (el.ladder.steps as number[][])[0]?.[1] : undefined;
    const body = ((look.type as Json | undefined)?.body as Json | undefined)?.size;
    return Math.round(((isNum(el.size) ? el.size : ladder ?? (isNum(body) ? body : 36)) as number) * 1.3);
  }
  if (t === 'sticker') return isNum(el.size) ? el.size : isNum(el.h) ? el.h : 120;
  if (t === 'numeral' || t === 'fitted-stack' || t === 'mantra-rows') return isNum(el.cap) ? Math.round(el.cap * 0.9) : Array.isArray(el.sizes) ? Math.round(((el.sizes as number[])[0] ?? 120) * 1.1) : 160;
  if (t === 'box') {
    // a box as tall as what flows in it (as the engine reckons it: look-static minHeight), at least its minH; 200 when it holds nothing yet
    const kids = (Array.isArray(el.children) ? el.children as Json[] : []).filter((k) => isObj(k) && k.place === undefined);
    if (!kids.length) return isNum(el.minH) ? el.minH : 200;
    const padV = isNum(el.pad) ? 2 * el.pad : Array.isArray(el.pad) ? (Number(el.pad[0]) || 0) + (Number(el.pad[2]) || 0) : 0;
    const hs = kids.map((k) => (isNum(k.h) ? k.h : guessHeight(k, look)));
    const body = el.flow === 'row' ? Math.max(...hs) : hs.reduce((a, b) => a + b, 0) + (isNum(el.gap) ? el.gap : 0) * (hs.length - 1);
    return Math.max(isNum(el.minH) ? el.minH : 0, Math.round(body + padV));
  }
  return isNum(el.h) ? el.h : 120;
}

// The rectangle (page pixels) of an element from its place alone, or null when it flows in its box or its size is only known when
// the page is drawn.
export function staticRect(comp: Json, path: string, look: Json): Rect | null {
  const r = rectOf(comp, path, look, false);
  return r && !r.approx ? r.rect : null;
}
// As staticRect, but with a guessed size where the size is not known (marked `approx`); null only for a flow child.
export function sketchRect(comp: Json, path: string, look: Json): { rect: Rect; approx: boolean } | null {
  return rectOf(comp, path, look, true);
}

function rectOf(comp: Json, path: string, look: Json, guess: boolean): { rect: Rect; approx: boolean } | null {
  const loc = locate(comp, path);
  const g = gridOf(look);
  if (!loc || !g) return null;
  const el = loc.el, type = String(el.type);
  if (type === 'frame' || (type === 'seam' && !loc.parent)) return { rect: type === 'seam' ? seamRect(el) : toRect(PAGE_BOX), approx: false };
  if (type === 'meta-row') return { rect: { x: g.m.left, y: g.m.top, w: PAGE.w - g.m.left - g.m.right, h: g.head }, approx: false };
  if (type === 'band' && isNum(el.y) && isNum(el.h)) return { rect: { x: 0, y: el.y, w: PAGE.w, h: el.h }, approx: false };
  let base: Box = { ...PAGE_BOX };
  if (loc.parent) {
    if (loc.slot && String(loc.parent.type) === 'seam') {
      const lo = Math.min(Number(loc.parent.leftY), Number(loc.parent.rightY));
      base = { x0: 0, y0: isNum(lo) ? lo : 0, x1: PAGE.w, y1: PAGE.h };
    } else {
      const pr = rectOf(comp, loc.parentPath, look, guess);
      if (!pr || (pr.approx && !guess)) return null;
      base = toBox(pr.rect);
    }
  }
  if (!isObj(el.place) || !hasPlace(el)) return null;
  const known = placeBox(el.place, base, look, g, null);
  if (!known.unknown) return { rect: toRect(known.box), approx: false };
  if (!guess) return null;
  const est = placeBox(el.place, base, look, g, guessHeight(el, look));
  const b = est.box;
  // unknown widths: take the content width
  if (b.x1 - b.x0 <= 0) b.x1 = Math.min(PAGE.w, b.x0 + 360);
  return { rect: toRect(b), approx: true };
}
function seamRect(el: Json): Rect {
  const lo = Math.min(Number(el.leftY) || 0, Number(el.rightY) || 0);
  return { x: 0, y: lo, w: PAGE.w, h: PAGE.h - lo };
}

// ================================================================== place forms and rectangle to place

export type PlaceForm = 'grid' | 'anchor' | 'px' | 'inset' | 'flow' | 'none';
export function placeForm(el: Json, cat?: LookCatalogue | null): PlaceForm {
  if (cat && cat.elements[String(el.type)]?.placement === 'none') return 'none';
  const p = el.place;
  if (!isObj(p)) return 'flow';
  return isObj(p.grid) ? 'grid' : isObj(p.px) ? 'px' : isObj(p.anchor) ? 'anchor' : typeof p.inset === 'string' ? 'inset' : 'flow';
}
export const PLACE_FORM_WORDS: Record<string, string> = { grid: 'Grid', anchor: 'Anchored', px: 'Free pixels', inset: 'Fills an area', flow: 'In its box' };
// An element in free placement moves by pixels, not cells.
export const isFree = (el: Json): boolean => placeForm(el) === 'px' || placeForm(el) === 'anchor';

const nearest = (target: number, count: number, at: (i: number) => number): number => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < count; i++) { const d = Math.abs(at(i) - target); if (d < bd) { bd = d; best = i; } }
  return best;
};

// The cells (col, span, row, rowSpan) nearest to a rectangle.
function snapCells(rect: Rect, g: Grid, withRows: boolean): { col: number; span: number; row?: number; rowSpan?: number } {
  const x0 = rect.x, x1 = rect.x + rect.w;
  const c0 = nearest(x0, g.cols, (i) => colX(g, i));
  let c1 = nearest(x1, g.cols, (i) => colX(g, i) + g.colW);
  if (c1 < c0) c1 = c0;
  const out: { col: number; span: number; row?: number; rowSpan?: number } = { col: c0 + 1, span: c1 - c0 + 1 };
  if (withRows && g.rows > 0) {
    const r0 = nearest(rect.y, g.rows, (i) => rowSpanOf(g, i + 1, 1)[0]);
    let r1 = nearest(rect.y + rect.h, g.rows, (i) => rowSpanOf(g, i + 1, 1)[1]);
    if (r1 < r0) r1 = r0;
    out.row = r0 + 1; out.rowSpan = r1 - r0 + 1;
  }
  return out;
}

// The place that gives `rect`, in the same form as the element's present place (grid cells snapped to the grid, pixels rounded, anchor
// distances recomputed for the sides it has). An unchanged rectangle returns the present place itself. `to` converts to another form.
export function rectToPlace(el: Json, rect: Rect, look: Json, opts: { current?: Rect | null; to?: PlaceForm } = {}): Json {
  const place = isObj(el.place) ? el.place : {};
  const form = opts.to ?? placeForm(el);
  const g = gridOf(look);
  const cur = opts.current ?? null;
  if (!opts.to && cur && Math.abs(cur.x - rect.x) < 0.5 && Math.abs(cur.y - rect.y) < 0.5 && Math.abs(cur.w - rect.w) < 0.5 && Math.abs(cur.h - rect.h) < 0.5) return place;
  const keep = (p: Json, ...keys: string[]) => { for (const k of keys) if (place[k] !== undefined) p[k] = place[k]; return p; };
  if (form === 'px') {
    const p: Json = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.max(1, Math.round(rect.w)), h: Math.max(1, Math.round(rect.h)) };
    return keep({ px: p }, 'minH', 'dx', 'dy');
  }
  if (form === 'anchor') {
    const a = isObj(place.anchor) && !opts.to ? place.anchor : { left: 0, top: 0, w: 0, h: 0 };
    const out: Json = {};
    const tokenOr = (k: 'left' | 'right' | 'top' | 'bottom', n: number): unknown => {
      const old = a[k];
      return typeof old === 'string' && g && Math.abs(lenPx(old, k, look, g) - n) < 0.5 ? old : Math.round(n);
    };
    const sizeOr = (k: 'w' | 'h', n: number): unknown => {
      const old = a[k];
      return typeof old === 'string' && g && Math.abs(lenPx(old, k === 'w' ? 'left' : 'top', look, g) - n) < 0.5 ? old : Math.max(1, Math.round(n));
    };
    if (a.left !== undefined) out.left = tokenOr('left', rect.x);
    if (a.right !== undefined) out.right = tokenOr('right', PAGE.w - rect.x - rect.w);
    if (a.top !== undefined) out.top = tokenOr('top', rect.y);
    if (a.bottom !== undefined) out.bottom = tokenOr('bottom', PAGE.h - rect.y - rect.h);
    if (a.w !== undefined || (a.left === undefined || a.right === undefined)) out.w = sizeOr('w', rect.w);
    if (a.h !== undefined || (a.top === undefined || a.bottom === undefined)) out.h = sizeOr('h', rect.h);
    return keep({ anchor: out }, 'minH', 'dx', 'dy');
  }
  if (form === 'inset') return { inset: typeof place.inset === 'string' ? place.inset : 'margins' };
  if (form === 'grid' && g) {
    const old = isObj(place.grid) ? place.grid : null;
    const dx = isNum(place.dx) ? place.dx : 0, dy = isNum(place.dy) ? place.dy : 0;
    const resized = !cur || Math.abs(cur.w - rect.w) > 0.5 || Math.abs(cur.h - rect.h) > 0.5;
    const adj: Rect = { x: rect.x - dx, y: rect.y - dy, w: rect.w, h: rect.h };
    // keep the width a modifier gave when only moving: the columns then follow the left edge
    const cells = snapCells(adj, g, !!old?.row || !!opts.to || (old === null && g.rows > 0));
    if (old && !resized && place.w !== undefined) cells.span = old.span as number;
    const grid: Json = { col: Math.min(cells.col, g.cols), span: Math.max(1, Math.min(cells.span, g.cols - cells.col + 1)) };
    if (cells.row !== undefined) { grid.row = cells.row; grid.rowSpan = cells.rowSpan; }
    else if (old?.row !== undefined) { grid.row = old.row; if (old.rowSpan !== undefined) grid.rowSpan = old.rowSpan; }
    if (grid.rowSpan === 1 && old?.rowSpan === undefined) delete grid.rowSpan;
    if (old?.alignY !== undefined) grid.alignY = old.alignY;
    const out: Json = { grid };
    keep(out, 'minH', 'dx', 'dy');
    if (!resized) keep(out, 'w', 'h', 'square');
    return out;
  }
  return place;
}

const MIN_SIDE = 8;
// A rectangle moved or resized by pixels (dx, dy), by a handle; snapped to `step` pixels and kept on the page.
export function dragRect(r: Rect, h: Handle, dx: number, dy: number, step: number | null = 4): Rect {
  const snap = (v: number) => (step ? Math.round(v / step) * step : v);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  if (h === 'move') return { ...r, x: clamp(snap(r.x + dx), -r.w + MIN_SIDE, PAGE.w - MIN_SIDE), y: clamp(snap(r.y + dy), -r.h + MIN_SIDE, PAGE.h - MIN_SIDE) };
  let l = r.x, rt = r.x + r.w, t = r.y, b = r.y + r.h;
  if (h.includes('w')) l = clamp(snap(l + dx), 0, rt - MIN_SIDE);
  if (h.includes('e')) rt = clamp(snap(rt + dx), l + MIN_SIDE, PAGE.w);
  if (h.includes('n')) t = clamp(snap(t + dy), 0, b - MIN_SIDE);
  if (h.includes('s')) b = clamp(snap(b + dy), t + MIN_SIDE, PAGE.h);
  return { x: l, y: t, w: rt - l, h: b - t };
}

// The element's rectangle for dragging: its static one, else the one the page measured (`measured`), else the sketch's.
export function dragBase(comp: Json, path: string, look: Json, measured?: Rect | null): Rect | null {
  return staticRect(comp, path, look) ?? measured ?? sketchRect(comp, path, look)?.rect ?? null;
}

// Gives the element the place of `rect` (in its own form; an element that fills an area becomes a grid or pixel place).
export function applyRect(comp: Json, path: string, rect: Rect, look: Json, cat: LookCatalogue, base?: Rect | null): Edit {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  const form = placeForm(loc.el, cat);
  if (form === 'flow' || form === 'none') return { comp, error: 'It is positioned by its box' };
  const g = gridOf(look);
  const to: PlaceForm | undefined = form === 'inset' ? (g && g.rows > 0 ? 'grid' : 'px') : undefined;
  const place = rectToPlace(loc.el, rect, look, { current: base ?? staticRect(comp, path, look), to });
  return { comp: mutate(comp, (c) => { locate(c, path)!.el.place = place; }), path };
}

// One cell (grid) or `px` pixels (free placement) in a direction.
export function moveByCells(comp: Json, path: string, dc: number, dr: number, look: Json, cat: LookCatalogue, px = 4): Edit {
  const loc = locate(comp, path);
  const g = gridOf(look);
  if (!loc || !g) return { comp, error: 'That element is not there any more' };
  const form = placeForm(loc.el, cat);
  if (form === 'grid') {
    const q = loc.el.place as Json, gr = q.grid as Json;
    const col = Math.min(Math.max(1, (gr.col as number) + dc), Math.max(1, g.cols - (gr.span as number) + 1));
    let row = gr.row as number | undefined;
    if (isNum(row) && g.rows > 0) row = Math.min(Math.max(1, row + dr), Math.max(1, g.rows - (isNum(gr.rowSpan) ? gr.rowSpan : 1) + 1));
    if (col === gr.col && row === gr.row) return { comp, path };
    return { comp: mutate(comp, (c) => { const n = (locate(c, path)!.el.place as Json).grid as Json; n.col = col; if (row !== undefined) n.row = row; }), path };
  }
  const base = dragBase(comp, path, look);
  if (!base) return { comp, error: 'It is positioned by its box' };
  return applyRect(comp, path, dragRect(base, 'move', dc * px, dr * px, px), look, cat);
}
export function resizeByCells(comp: Json, path: string, dw: number, dh: number, look: Json, cat: LookCatalogue, px = 4): Edit {
  const loc = locate(comp, path);
  const g = gridOf(look);
  if (!loc || !g) return { comp, error: 'That element is not there any more' };
  const form = placeForm(loc.el, cat);
  if (form === 'grid') {
    const gr = (loc.el.place as Json).grid as Json;
    const span = Math.min(Math.max(1, (gr.span as number) + dw), g.cols - (gr.col as number) + 1);
    let rowSpan = gr.rowSpan as number | undefined;
    if (isNum(gr.row) && g.rows > 0 && dh !== 0) rowSpan = Math.min(Math.max(1, (rowSpan ?? 1) + dh), g.rows - gr.row + 1);
    if (span === gr.span && rowSpan === gr.rowSpan) return { comp, path };
    return { comp: mutate(comp, (c) => {
      const el = locate(c, path)!.el, n = (el.place as Json).grid as Json;
      n.span = span; if (rowSpan !== undefined && (rowSpan > 1 || n.rowSpan !== undefined)) n.rowSpan = rowSpan;
      delete (el.place as Json).w; delete (el.place as Json).square;
    }), path };
  }
  const base = dragBase(comp, path, look);
  if (!base) return { comp, error: 'It is positioned by its box' };
  const h: Handle = dw !== 0 ? 'e' : 's';
  return applyRect(comp, path, dragRect(base, h, dw * px, dh * px, px), look, cat);
}

// Words for the live readout while dragging: "Columns 5 to 12 · rows 2 to 6", or pixels.
export function placeReadout(el: Json): string {
  const p = isObj(el.place) ? el.place : {};
  if (isObj(p.grid)) {
    const g = p.grid, c1 = (g.col as number) + (g.span as number) - 1;
    const cols = g.span === 1 ? `Column ${g.col}` : `Columns ${g.col}–${c1}`;
    if (!isNum(g.row)) return cols;
    const r1 = g.row + (isNum(g.rowSpan) ? g.rowSpan : 1) - 1;
    return `${cols} · ${r1 === g.row ? `row ${g.row}` : `rows ${g.row}–${r1}`}`;
  }
  if (isObj(p.px)) return `Left ${p.px.x}, top ${p.px.y}${isNum(p.px.w) ? ` · ${p.px.w} × ${p.px.h} px` : ''}`;
  if (isObj(p.anchor)) return Object.entries(p.anchor).map(([k, v]) => `${k} ${v}`).join(' · ');
  if (typeof p.inset === 'string') return `Fills the ${p.inset}`;
  return 'Positioned by its box';
}

// Writes a whole place (one form, with its modifiers), each value checked against the catalogue; an unchanged place changes nothing.
export function setPlace(comp: Json, path: string, place: Json, cat: LookCatalogue): Edit {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  const forms = Object.keys(place).filter((k) => placeKeys.includes(k));
  if (forms.length !== 1) return { comp, error: 'Choose one way of placing it' };
  const formDescs = cat.place?.forms ?? {}, mods = cat.place?.modifiers ?? {};
  for (const [k, v] of Object.entries(place)) {
    const d = formDescs[k] ?? mods[k];
    if (!d) return { comp, error: `${k} is not part of a place` };
    const m = checkProp(d, v, cat);
    if (m) return { comp, error: m };
  }
  if (same(loc.el.place, place)) return { comp, path };
  return { comp: mutate(comp, (c) => { locate(c, path)!.el.place = place; }), path };
}

// Changes the form of an element's place, keeping where it is (as far as the form can say it).
export function setPlaceForm(comp: Json, path: string, form: PlaceForm, look: Json, cat: LookCatalogue): Edit {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  const info = cat.elements[String(loc.el.type)];
  if (info?.placement === 'none') return { comp, error: `A ${info.label.toLowerCase()} has its own geometry and takes no place` };
  const now = placeForm(loc.el, cat);
  if (now === form) return { comp, path };
  if (form === 'flow') {
    if (!loc.parent) return { comp, error: 'Only an element inside a box can flow with its items' };
    if (!info?.flow) return { comp, error: `A ${info?.label.toLowerCase() ?? 'element'} cannot flow in a box` };
    return { comp: mutate(comp, (c) => { const el = locate(c, path)!.el; delete el.place; delete el.z; delete el.bleed; }), path };
  }
  const g = gridOf(look);
  if (!g) return { comp, error: 'The look has no page grid' };
  const rect = sketchRect(comp, path, look)?.rect ?? { x: g.m.left, y: g.m.top, w: PAGE.w / 2, h: 160 };
  if (form === 'grid' && g.rows === 0) { /* columns only */ }
  const place = form === 'inset' ? { inset: 'margins' } : rectToPlace({ ...loc.el, place: {} }, rect, look, { to: form });
  return { comp: mutate(comp, (c) => { const el = locate(c, path)!.el; el.place = place; for (const k of ['grow', 'minH', 'w', 'h', 'before']) if (cat.elements[String(el.type)]?.properties[k]?.group === 'flow') delete el[k]; }), path };
}

// ================================================================== turning

export interface NamedAngle { name: string; deg: number }
export function namedAngles(look: Json, cat: LookCatalogue): NamedAngle[] {
  const a = ((look.devices as Json | undefined)?.angles ?? {}) as Record<string, unknown>;
  return (cat.lists.angles as string[]).map((name) => ({ name, deg: isNum(a[name]) ? (a[name] as number) : 0 }));
}
const tiltOf = (look: Json): number => (isNum((look.dials as Json | undefined)?.tilt) ? ((look.dials as Json).tilt as number) : 1);
// The degrees an angle value turns by (a named angle, times the look's tilt dial; a number as it is, times the dial).
export function angleDegrees(v: unknown, look: Json): number {
  if (isNum(v)) return v * tiltOf(look);
  if (typeof v === 'string') { const a = (look.devices as Json | undefined)?.angles as Json | undefined; return (isNum(a?.[v]) ? (a![v] as number) : 0) * tiltOf(look); }
  return 0;
}
// The look's named angles read as amounts ("3° left", "6° right"), smallest turn first, with the look's tilt dial applied. The
// angle's own name ("sticker", "price") only shows in the tip, and joins the label when two angles turn by the same amount.
// The value stays the name, which is what the design stores.
export function turnOptions(named: NamedAngle[], look: Json): Array<{ value: string; label: string; title: string }> {
  const cap = (n: string) => n.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const rows = named.map((a) => {
    const d = Math.round(angleDegrees(a.name, look) * 10) / 10;
    return { name: a.name, d, text: d === 0 ? 'Straight' : `${Math.abs(d)}° ${d < 0 ? 'left' : 'right'}` };
  }).sort((x, y) => Math.abs(x.d) - Math.abs(y.d) || x.d - y.d);
  return rows.map((r) => ({
    value: r.name,
    label: rows.filter((o) => o.text === r.text).length > 1 ? `${r.text} (${r.name.replace(/-/g, ' ')})` : r.text,
    title: `${cap(r.name)} angle: ${r.text}`,
  }));
}
export const isTurned = (v: unknown, look: Json): boolean => (isNum(v) ? v !== 0 : typeof v === 'string' && angleDegrees(v, look) !== 0);
export function rotatedCount(comp: Json, look: Json): number {
  let n = 0;
  for (const r of listTree(comp, null)) {
    if (r.el.rot !== undefined && isTurned(r.el.rot, look)) n++;
    else if (r.type === 'rows' && Array.isArray(r.el.altRot) && r.el.altRot.some((v) => isTurned(v, look))) n++;
  }
  return n;
}
// The named angle nearest to `deg`, if within `within` degrees.
export function nearestAngle(deg: number, look: Json, cat: LookCatalogue, within = 2.5): NamedAngle | null {
  const t = tiltOf(look) || 1;
  let best: NamedAngle | null = null, bd = within;
  for (const a of namedAngles(look, cat)) { const d = Math.abs(a.deg * t - deg); if (d <= bd) { best = a; bd = d; } }
  return best;
}
const TEXT_LIKE = ['text', 'fitted-stack', 'numeral', 'mantra-rows', 'rows', 'meta-row'];

// Turns an element by a named angle or a number of degrees (-15 to 15), or straight again (undefined). Refuses what the checks refuse:
// more than the allowed number of turned elements, and text turned further than the limit outside a sticker.
export function setRotation(comp: Json, path: string, v: string | number | undefined, look: Json, cat: LookCatalogue, lookless = false): Edit {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  const type = String(loc.el.type);
  if (!cat.elements[type]?.properties.rot) return { comp, error: `A ${cat.elements[type]?.label.toLowerCase() ?? 'element'} cannot be turned` };
  if (v === undefined || v === 0) {
    if (loc.el.rot === undefined) return { comp, path };
    return { comp: mutate(comp, (c) => { delete locate(c, path)!.el.rot; }), path };
  }
  const desc = cat.elements[type]!.properties.rot!;
  const bad = checkProp(desc, typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : v, cat);
  if (bad) return { comp, error: bad };
  const value = typeof v === 'string' && Number.isFinite(Number(v)) ? Number(v) : v;
  if (!lookless) {
    if (loc.el.vertical !== undefined) return { comp, error: 'It runs up or down the page already; it cannot also be turned' };
    const before = loc.el.rot !== undefined && isTurned(loc.el.rot, look);
    if (!before && isTurned(value, look) && rotatedCount(comp, look) >= limit(cat, 'rotated', 3)) return { comp, error: `A design can turn at most ${limit(cat, 'rotated', 3)} pieces` };
    if (TEXT_LIKE.includes(type)) {
      let sum = Math.abs(angleDegrees(value, look)), inSticker = false;
      for (let p = loc.parentPath; p; p = parentOfPath(p)) {
        const a = locate(comp, p);
        if (!a) break;
        if (String(a.el.type) === 'sticker') inSticker = true;
        if (a.el.rot !== undefined) sum += angleDegrees(a.el.rot, look);
      }
      if (!inSticker && Math.abs(sum) > limit(cat, 'textRotation', 8)) return { comp, error: `Text may be turned at most ${limit(cat, 'textRotation', 8)} degrees outside a sticker` };
    }
  }
  return { comp: mutate(comp, (c) => { locate(c, path)!.el.rot = value; }), path };
}

// ================================================================== bindings: fields

// What an element shows: a signature per way of showing a field (the same one twice is a field shown twice).
export interface Binding { field: string; sig: string }
const sig = (f: string, ...rest: Array<string | number | undefined>) => [f, ...rest.map((x) => x ?? '')].join('|');
export function bindingsOf(el: Json, look: Json): Binding[] {
  const type = String(el.type);
  const f = typeof el.field === 'string' ? el.field : undefined;
  switch (type) {
    case 'text': return f === undefined ? [] : [{ field: f, sig: sig(f, (el.part as string) ?? 'all', isObj(el.split) ? `${el.split.sep}${el.split.pick}` : '', (el.format as string) ?? '') }];
    case 'fitted-stack': case 'mantra-rows': return [{ field: f ?? 'headline', sig: sig(f ?? 'headline', 'all') }];
    case 'numeral': return [{ field: f ?? 'big', sig: sig(f ?? 'big', 'numeral', (el.format as string) ?? '') }, ...(isObj(el.unit) ? [{ field: String(el.unit.field), sig: sig(String(el.unit.field), 'unit') }] : [])];
    case 'sticker': return f === undefined ? [] : [{ field: f, sig: sig(f, 'sticker') }];
    case 'photo': return [{ field: 'image', sig: 'image|all' }];
    case 'seam': return el.upper === 'field' ? [] : [{ field: 'image', sig: 'image|all' }];
    case 'rows': return el.each === 'items' ? [{ field: 'items', sig: 'items|rows' }] : [{ field: 'meta', sig: 'meta|rows' }];
    case 'meta-row': return (((look.devices as Json | undefined)?.metaRow as Json | undefined)?.cells as Json[] | undefined ?? []).some((c) => c.source === 'label') ? [{ field: 'label', sig: 'label|all' }] : [];
    // the engine's primitives/info-rows.mjs, button.mjs and photo-row.mjs bindings()
    case 'info-rows': return [{ field: 'info', sig: 'info|rows' }];
    case 'button': return [{ field: f ?? 'cta', sig: sig(f ?? 'cta', 'button') }];
    case 'photo-row': return [{ field: 'gallery', sig: 'gallery|row' }];
    default: return [];
  }
}
export function shownFields(comp: Json, look: Json): string[] {
  const out = new Set<string>();
  for (const r of listTree(comp, null)) for (const b of bindingsOf(r.el, look)) out.add(b.field);
  return [...out];
}
export const declaredFields = (comp: Json): string[] => Object.keys(isObj(comp.fields) ? comp.fields : {});
export const requiredFields = (comp: Json, cat: LookCatalogue): string[] => {
  const kind = String(comp.kind);
  const own = Object.entries(isObj(comp.fields) ? comp.fields : {}).filter(([, v]) => isObj(v) && v.required === true).map(([k]) => k);
  return [...new Set([...(cat.kinds[kind]?.required ?? []), ...own])];
};

export function defaultBudget(field: string, kind: string, cat: LookCatalogue): Json {
  const info = cat.fields[field];
  const out: Json = {};
  if (cat.kinds[kind]?.required.includes(field)) out.required = true;
  if (info?.type === 'items') { out.min = info.min; out.max = info.max; }
  else if (info?.type === 'text' && isNum(info.max)) out.max = info.max;
  return out;
}
const withField = (c: Json, field: string, cat: LookCatalogue) => {
  const fields = isObj(c.fields) ? (c.fields as Json) : (c.fields = {}) as Json;
  if (!isObj(fields[field])) fields[field] = defaultBudget(field, String(c.kind), cat);
};
const kindFields = (comp: Json, cat: LookCatalogue): string[] => cat.kinds[String(comp.kind)]?.fields ?? [];

// Fields declared that no element shows (and the kind does not require): candidates for removal after the person confirms.
export function orphanFields(comp: Json, look: Json, cat: LookCatalogue): string[] {
  const shown = new Set(shownFields(comp, look)), req = new Set(requiredFields(comp, cat));
  return declaredFields(comp).filter((f) => !shown.has(f) && !req.has(f));
}
export function pruneFields(comp: Json, names: string[]): Json {
  if (!names.length) return comp;
  return mutate(comp, (c) => { const f = c.fields as Json; for (const n of names) delete f[n]; });
}

// Binds a text, sticker, headline or figure element to a field of the kind (the field is declared, with the kind's usual budget, when it is
// new). `null` unbinds. The fields no element shows any more are returned as `orphans` for the person to confirm removing.
export function bindField(comp: Json, path: string, field: string | null, look: Json, cat: LookCatalogue): Edit & { orphans: string[] } {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more', orphans: [] };
  const type = String(loc.el.type);
  const desc = descOf(type, 'field', cat);
  const allowed = ((desc as unknown as { of?: string[] } | null)?.of ?? []);
  if (!desc) return { comp, error: 'This element does not show a field', orphans: [] };
  if (field !== null) {
    if (!allowed.includes(field)) return { comp, error: `A ${cat.elements[type]!.label.toLowerCase()} cannot show ${fieldLabel(field, cat).toLowerCase()}`, orphans: [] };
    if (!kindFields(comp, cat).includes(field)) return { comp, error: `${fieldLabel(field, cat)} is not a field of this kind of post`, orphans: [] };
  }
  const next = mutate(comp, (c) => {
    const el = locate(c, path)!.el;
    if (field === null) delete el.field; else { el.field = field; delete el.source; delete el.word; withField(c, field, cat); }
  });
  return { comp: next, path, orphans: orphanFields(next, look, cat) };
}
// Shows the brand name, the folio or the list number instead of a field (a text element).
export function setSource(comp: Json, path: string, source: string | null, look: Json, cat: LookCatalogue): Edit & { orphans: string[] } {
  const loc = locate(comp, path);
  if (!loc || String(loc.el.type) !== 'text') return { comp, error: 'Only text can show a source', orphans: [] };
  const next = mutate(comp, (c) => { const el = locate(c, path)!.el; if (source === null) delete el.source; else { el.source = source; delete el.field; delete el.word; delete el.part; delete el.split; } });
  return { comp: next, path, orphans: orphanFields(next, look, cat) };
}
// Shows one of the catalogue's fixed words (Myth, Fact ...) instead of a field or a source (a text element).
export function setWord(comp: Json, path: string, word: string, look: Json, cat: LookCatalogue): Edit & { orphans: string[] } {
  const loc = locate(comp, path);
  if (!loc || String(loc.el.type) !== 'text') return { comp, error: 'Only text can show a fixed word', orphans: [] };
  const words = (descOf('text', 'word', cat) as unknown as { values?: string[] } | null)?.values ?? [];
  if (!words.includes(word)) return { comp, error: `"${word.slice(0, 20)}" is not one of the fixed words`, orphans: [] };
  const next = mutate(comp, (c) => { const el = locate(c, path)!.el; el.word = word; delete el.field; delete el.source; delete el.part; delete el.split; delete el.format; });
  return { comp: next, path, orphans: orphanFields(next, look, cat) };
}

export interface Budget { required?: boolean; max?: number; min?: number }
// Edits the budget of a field: whether it is needed and its longest text (never more than a post allows).
export function setBudget(comp: Json, field: string, patch: Budget, cat: LookCatalogue): Edit {
  if (!isObj(comp.fields) || !isObj((comp.fields as Json)[field])) return { comp, error: 'That field is not in this design' };
  const info = cat.fields[field];
  if (patch.max !== undefined) {
    const top = info?.type === 'items' ? info.max : info?.max;
    if (info?.type === 'image') return { comp, error: 'A picture has no length' };
    if (!Number.isInteger(patch.max) || patch.max < 1 || (isNum(top) && patch.max > top)) return { comp, error: `Use a whole number from 1 to ${top}` };
  }
  if (patch.min !== undefined && (!Number.isInteger(patch.min) || patch.min < 1 || (info?.type === 'items' && patch.min > (info.max ?? 5)))) return { comp, error: `Use a whole number from 1 to ${info?.max ?? 5}` };
  if (patch.required === false && (cat.kinds[String(comp.kind)]?.required ?? []).includes(field)) return { comp, error: `${fieldLabel(field, cat)} is always needed in a ${String(comp.kind)} post` };
  return { comp: mutate(comp, (c) => {
    const f = (c.fields as Json)[field] as Json;
    if (patch.required !== undefined) { if (patch.required) f.required = true; else delete f.required; }
    if (patch.max !== undefined) f.max = patch.max;
    if (patch.min !== undefined) f.min = patch.min;
  }) };
}
export function addField(comp: Json, field: string, cat: LookCatalogue): Edit {
  if (!kindFields(comp, cat).includes(field)) return { comp, error: `${fieldLabel(field, cat)} is not a field of this kind of post` };
  return { comp: mutate(comp, (c) => withField(c, field, cat)) };
}
export function removeField(comp: Json, field: string, look: Json, cat: LookCatalogue): Edit {
  if (requiredFields(comp, cat).includes(field)) return { comp, error: `${fieldLabel(field, cat)} is needed` };
  if (shownFields(comp, look).includes(field)) return { comp, error: `An element still shows ${fieldLabel(field, cat).toLowerCase()}` };
  return { comp: pruneFields(comp, [field]) };
}

// ---- conditions ----
export interface When { present?: string; absent?: string }
export function readWhen(el: Json): When {
  const w = isObj(el.when) ? el.when : {};
  return { ...(typeof w.present === 'string' ? { present: w.present } : {}), ...(typeof w.absent === 'string' ? { absent: w.absent } : {}) };
}
export function setWhen(comp: Json, path: string, w: When, cat: LookCatalogue): Edit {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  const declared = declaredFields(comp);
  for (const f of [w.present, w.absent]) if (f !== undefined && !declared.includes(f)) return { comp, error: `${fieldLabel(f, cat)} is not a field of this design; add it first` };
  if (w.present !== undefined && w.present === w.absent) return { comp, error: 'A field cannot be both filled and empty' };
  const clean: Json = { ...(w.present !== undefined ? { present: w.present } : {}), ...(w.absent !== undefined ? { absent: w.absent } : {}) };
  return { comp: mutate(comp, (c) => { const el = locate(c, path)!.el; if (Object.keys(clean).length) el.when = clean; else delete el.when; }), path };
}
export function whenText(w: When, cat: LookCatalogue | null): string {
  const bits = [w.present ? `${fieldLabel(w.present, cat)} is filled in` : '', w.absent ? `${fieldLabel(w.absent, cat)} is empty` : ''].filter(Boolean);
  return bits.length ? `Shown only when ${bits.join(' and ')}` : 'Always shown';
}

// ---- accepts: rules on the words a design can draw ----
export type Accept = { field: string; part?: string; maxChars?: number; min?: number; max?: number };
export function acceptsOf(comp: Json): Accept[] { return Array.isArray(comp.accepts) ? (comp.accepts as Accept[]).filter(isObj) as Accept[] : []; }
export function acceptText(a: Accept, cat: LookCatalogue | null): string {
  const f = fieldLabel(a.field, cat).toLowerCase();
  if (a.field === 'items') {
    if (a.min !== undefined && a.max !== undefined) return `Only when there are ${a.min} to ${a.max} list points`;
    return a.min !== undefined ? `Only when there are at least ${a.min} list points` : `Only when there are at most ${a.max ?? '?'} list points`;
  }
  const what = a.part === 'pre' ? `the first part of the ${f}` : a.part === 'phrase' ? `the emphasised phrase of the ${f}` : `the ${f}`;
  return `Only when ${what} is up to ${a.maxChars ?? '?'} characters`;
}
export function checkAccept(a: Accept, comp: Json, cat: LookCatalogue): string {
  if (!declaredFields(comp).includes(a.field)) return `${fieldLabel(a.field, cat)} is not a field of this design`;
  if (a.field === 'items') {
    if (a.min === undefined && a.max === undefined) return 'Give a least or a most';
    for (const v of [a.min, a.max]) if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= (cat.fields.items?.max ?? 5))) return `Use a whole number from 1 to ${cat.fields.items?.max ?? 5}`;
    return a.min !== undefined && a.max !== undefined && a.min > a.max ? 'The least is more than the most' : '';
  }
  if (a.part && a.part !== 'all' && !cat.fields[a.field]?.emphasis) return 'Only the headline has an emphasised phrase';
  const top = cat.fields[a.field]?.max;
  return Number.isInteger(a.maxChars) && (a.maxChars as number) >= 1 && (!isNum(top) || (a.maxChars as number) <= top) ? '' : `Use a whole number of characters from 1 to ${top ?? '?'}`;
}
export function setAccepts(comp: Json, rules: Accept[], cat: LookCatalogue): Edit {
  if (rules.length > limit(cat, 'accepts', 6)) return { comp, error: `At most ${limit(cat, 'accepts', 6)} rules` };
  for (const r of rules) { const m = checkAccept(r, comp, cat); if (m) return { comp, error: m }; }
  return { comp: mutate(comp, (c) => { if (rules.length) c.accepts = rules; else delete c.accepts; }) };
}

// ================================================================== adding, duplicating, removing, ordering

export const FLOW_ONLY = ['grow', 'minH', 'w', 'h', 'before'];
export const TOP_ONLY_PROPS = ['z', 'bleed'];
export const ONE_ONLY = ['rows', 'frame', 'meta-row', 'seam'];

// Why an element of this type cannot be added (to the top, or inside the box at parentPath); '' when it can.
export function whyNotAdd(comp: Json, type: string, cat: LookCatalogue, parentPath = '', look: Json = {}): string {
  const info = cat.elements[type];
  if (!info) return 'Unknown piece';
  const total = countNodes(comp);
  if (total >= limit(cat, 'nodes', 40)) return `A design has at most ${limit(cat, 'nodes', 40)} elements`;
  const tree = listTree(comp, cat);
  if (ONE_ONLY.includes(type) && tree.some((r) => r.type === type)) return `A design has at most one ${info.label.toLowerCase()}`;
  if (parentPath) {
    const p = locate(comp, parentPath);
    if (!p) return 'That box is not there any more';
    if (p.depth + 1 > limit(cat, 'depth', 4)) return `Pieces can be nested ${limit(cat, 'depth', 4)} levels deep at most`;
    const parentInfo = cat.elements[String(p.el.type)];
    if (!parentInfo?.container) return 'That piece holds nothing';
    if (info.placement === 'none') return `A ${info.label.toLowerCase()} goes on the page, not in a box`;
    if (parentInfo.container === 'text' && type !== 'text') return 'A sticker holds text only';
    if (!info.flow && type !== 'text') { /* placed children are allowed for pieces that take a place */ }
  }
  if (type === 'meta-row' && (!(gridOf(look)?.head ?? 0) || !(look.devices as Json | undefined)?.metaRow)) return 'This look has no top label row; set one up in the look\'s settings (Page and Devices)';
  const kind = String(comp.kind), fields = cat.kinds[kind]?.fields ?? [];
  const needs: Record<string, string[]> = { photo: ['image'], numeral: ['big', 'meta'], rows: ['items', 'meta'], 'mantra-rows': ['headline'], 'fitted-stack': ['headline', 'quote'], 'info-rows': ['info'], 'photo-row': ['gallery'], button: ['cta', 'tag', 'label'] };
  if (needs[type] && !needs[type]!.some((f) => fields.includes(f))) return `A ${kind} post has no ${needs[type]!.map((f) => fieldLabel(f, cat).toLowerCase()).join(' or ')} to show`;
  const shown = new Set(shownFields(comp, look));
  if (needs[type] && type !== 'rows' && !needs[type]!.some((f) => fields.includes(f) && !shown.has(f))) return `${needs[type]!.filter((f) => fields.includes(f)).map((f) => fieldLabel(f, cat)).join(' and ')} ${needs[type]!.filter((f) => fields.includes(f)).length > 1 ? 'are' : 'is'} shown already; a design shows each field once`;
  return '';
}

function freeCells(comp: Json, g: Grid, span: number, rowSpan: number): { col: number; row?: number } {
  const taken: Array<[number, number, number, number]> = [];
  for (const r of listTree(comp, null)) {
    if (r.depth !== 1 || !isObj(r.el.place) || !isObj((r.el.place as Json).grid)) continue;
    const q = (r.el.place as Json).grid as Json;
    taken.push([q.col as number, (q.col as number) + (q.span as number) - 1, isNum(q.row) ? q.row : 1, isNum(q.row) ? q.row + (isNum(q.rowSpan) ? q.rowSpan : 1) - 1 : g.rows || 1]);
  }
  const rows = g.rows > 0 ? g.rows : 1, first = g.head > 0 ? 2 : 1;
  for (let row = first; row + rowSpan - 1 <= rows; row++) {
    for (let col = 1; col + span - 1 <= g.cols; col++) {
      if (!taken.some(([c0, c1, r0, r1]) => col <= c1 && col + span - 1 >= c0 && row <= r1 && row + rowSpan - 1 >= r0)) return g.rows > 0 ? { col, row } : { col };
    }
  }
  return g.rows > 0 ? { col: 1, row: first } : { col: 1 };
}

// A place for a new element, at a free spot of the grid (pixels when the look's grid has no rows).
export function newPlace(comp: Json, look: Json, size: { span?: number; rowSpan?: number; w?: number; h?: number } = {}): Json {
  const g = gridOf(look);
  if (!g) return { px: { x: 80, y: 400, w: 400, h: 160 } };
  if (g.rows > 0) {
    const span = Math.min(g.cols, size.span ?? Math.max(2, Math.floor(g.cols / 2))), rowSpan = Math.min(g.rows, size.rowSpan ?? 1);
    const at = freeCells(comp, g, span, rowSpan);
    return { grid: { col: at.col, span, row: at.row, ...(rowSpan > 1 ? { rowSpan } : {}) } };
  }
  const w = Math.round(size.w ?? (PAGE.w - g.m.left - g.m.right) / 2), h = Math.round(size.h ?? 160);
  const known = listTree(comp, null).filter((r) => r.depth === 1).map((r) => staticRect(comp, r.path, look)).filter((r): r is Rect => !!r);
  let y = g.m.top + (g.head > 0 ? g.head + g.gutter : 0);
  while (y + h < PAGE.h - g.m.bottom && known.some((k) => k.y < y + h && k.y + k.h > y && k.x < g.m.left + w && k.x + k.w > g.m.left)) y += h + 24;
  return { px: { x: g.m.left, y: Math.min(y, PAGE.h - g.m.bottom - h), w, h } };
}

const FIELD_STYLE: Record<string, string> = { headline: 'display', quote: 'display', big: 'numeral', label: 'label', meta: 'label', tag: 'label', unit: 'label', by: 'label', sub: 'body' };
// What the catalogue shows for a type, for the library and its help line.
export function libraryGroups(cat: LookCatalogue): Array<{ title: string; types: string[] }> {
  const has = (t: string) => !!cat.elements[t];
  const text = ['text'], pictures = ['photo'], shapes = ['box', 'sticker', 'rule', 'block', 'frame', 'keyline', 'glyph'];
  const special = Object.keys(cat.elements).filter((t) => ![...text, ...pictures, ...shapes].includes(t));
  return [
    { title: 'Text', types: text.filter(has) }, { title: 'Pictures', types: pictures.filter(has) },
    { title: 'Shapes and devices', types: shapes.filter(has) }, { title: 'Special pieces', types: special },
  ].filter((g) => g.types.length);
}
export const oneLine = (help: string): string => { const m = /^[^.]*\./.exec(help); return m ? m[0] : help; };

// A new element of `type` with sensible values from the catalogue, bound to a free field of the kind, placed at a free spot.
export function newElement(comp: Json, type: string, look: Json, cat: LookCatalogue): Json {
  const kind = String(comp.kind), fields = cat.kinds[kind]?.fields ?? [], info = cat.elements[type]!;
  const shown = new Set(shownFields(comp, look));
  const free = (list: string[]) => list.find((f) => fields.includes(f) && !shown.has(f)) ?? list.find((f) => fields.includes(f));
  const maxOf = (f: string) => cat.fields[f]?.max ?? 70;
  const el: Json = { type };
  let size: { span?: number; rowSpan?: number; w?: number; h?: number } = {};
  switch (type) {
    case 'text': {
      const freeText = fields.find((x) => cat.fields[x]?.type === 'text' && !shown.has(x));
      if (!freeText) { el.source = 'brand'; el.style = 'label'; size = { rowSpan: 1 }; break; }
      const f = freeText, style = FIELD_STYLE[f] ?? 'body';
      el.field = f; el.style = style;
      if (style === 'display') el.ladder = { by: f, steps: [[Math.min(30, maxOf(f)), 96], [maxOf(f), 80]].filter((s, i, a) => i === 0 || s[0]! > a[i - 1]![0]!) };
      if (style === 'numeral') el.size = 240;
      size = { rowSpan: style === 'display' ? 2 : 1 };
      break;
    }
    case 'fitted-stack': el.field = free(['headline', 'quote']) ?? 'headline'; el.mode = 'block'; el.sizes = [120, 108, 96]; el.maxLines = 4; size = { span: 99, rowSpan: 3 }; break;
    case 'numeral': { const f = free(['big', 'meta']) ?? 'big'; el.field = f; if (f === 'meta') el.format = 'date-dd.mm'; el.cap = 320; el.min = 120; size = { span: 99, rowSpan: 2 }; break; }
    case 'mantra-rows': el.cap = 140; el.floor = 70; size = { span: 99, rowSpan: 4 }; break;
    case 'rows': el.each = fields.includes('items') ? 'items' : 'meta-parts'; el.number = 'none'; if (el.each === 'meta-parts') el.textSize = 36; size = { span: 99, rowSpan: 3 }; break;
    case 'photo': el.shape = 'rect'; size = { span: 99, rowSpan: 3 }; break;
    case 'sticker': {
      el.shape = 'circle'; el.size = 220;
      // a field nothing shows yet (a second sticker on a shown field would show it twice); else the brand name
      const f = ['tag', 'label', 'unit', 'by'].find((x) => fields.includes(x) && !shown.has(x));
      if (f) el.field = f; else el.children = [{ type: 'text', source: 'brand', style: 'label' }];
      size = { span: 2, rowSpan: 1 }; break;
    }
    case 'box': el.flow = 'column'; size = { span: 99, rowSpan: 2 }; break;
    case 'block': el.colour = 'accent'; size = { span: 1, rowSpan: 1, w: 120, h: 120 }; break;
    case 'rule': size = { span: 99, rowSpan: 1, h: 4 }; break;
    case 'keyline': size = { span: 99, rowSpan: 2 }; break;
    case 'glyph': el.glyph = (cat.lists.glyphs as string[])[0] ?? '“'; el.size = 400; size = { span: 2, rowSpan: 2 }; break;
    case 'seam': el.leftY = 880; el.rightY = 800; el.lower = 'field'; el.upper = fields.includes('image') && !shown.has('image') ? 'photo' : 'field'; break;
    case 'band': el.y = 640; el.h = 160; break;
    case 'wordmark-pattern': el.size = 90; size = { span: 99, rowSpan: 4 }; break;
    case 'scrim': size = { span: 99, rowSpan: 3 }; break;
    case 'frame': if (!(frameOf(look).t > 0)) el.t = 24; break;
    case 'punch-hole': size = { span: 1, rowSpan: 1, w: 44, h: 44 }; break;
    // gradients, colour over a picture, brand graphics (the graphic is chosen in the pane: it names a vault picture)
    case 'gradient': el.gradient = { kind: 'linear', stops: ['field', 'dark'] }; size = { span: 99, rowSpan: 3 }; break;
    case 'overlay': el.colour = 'ink'; el.from = 'bottom'; size = { span: 99, rowSpan: 3 }; break;
    case 'graphic': el.at = 'bottom-right'; el.size = 'm'; break;
    case 'info-rows': el.layout = 'beside'; size = { span: 99, rowSpan: 2, h: 220 }; break;
    case 'button': { const f = free(['cta', 'tag', 'label']); if (f && f !== 'cta') el.field = f; el.shape = 'pill'; el.icon = 'arrow-right'; size = { span: 6, rowSpan: 1, w: 480, h: 110 }; break; }
    case 'photo-row': el.size = 200; el.captions = true; size = { span: 99, rowSpan: 2, h: 260 }; break;
    default: break;
  }
  if (info.placement === 'required') {
    const g = gridOf(look);
    if (size.span === 99 && g) size = { ...size, span: g.cols, w: PAGE.w - g.m.left - g.m.right };
    const place = newPlace(comp, look, size);
    if (isObj(place.px) && type === 'rule') { const p = place.px; p.h = 4; }
    el.place = place;
  }
  return el;
}

// Adds an element of a type, at the end of the list of its parent (or the top), and declares what it shows. Refuses over the limits.
export function addElement(comp: Json, type: string, look: Json, cat: LookCatalogue, parentPath = ''): Edit {
  const why = whyNotAdd(comp, type, cat, parentPath, look);
  if (why) return { comp, error: why };
  let path = '';
  const el = newElement(comp, type, look, cat);
  if (parentPath) { delete el.place; delete el.z; if (!cat.elements[type]!.flow) { el.place = newPlace(comp, look); } }
  const next = mutate(comp, (c) => {
    const list = parentPath ? (() => { const p = locate(c, parentPath)!.el; return (Array.isArray(p.children) ? p.children : (p.children = [])) as Json[]; })() : elementsOf(c);
    list.push(el);
    path = joinEl(parentPath, list.length - 1);
    for (const b of bindingsOf(el, look)) withField(c, b.field, cat);
  });
  return { comp: next, path };
}

function freshPlace(el: Json, comp: Json, look: Json): Json | undefined {
  const g = gridOf(look);
  if (!isObj(el.place) || !g) return undefined;
  const q = el.place;
  if (isObj(q.grid)) {
    const gr = q.grid, span = gr.span as number, rowSpan = isNum(gr.rowSpan) ? gr.rowSpan : 1;
    const at = freeCells(comp, g, span, rowSpan);
    return { ...q, grid: { ...gr, col: at.col, ...(at.row !== undefined && isNum(gr.row) ? { row: at.row } : {}) } };
  }
  if (isObj(q.px)) return { ...q, px: { ...q.px, x: Math.min((q.px.x as number) + 24, PAGE.w - 40), y: Math.min((q.px.y as number) + 24, PAGE.h - 40) } };
  return undefined;
}

// A copy placed just after the original (at a free spot of the grid when it has a place of its own). One rows, seam, frame or top label
// row only, so those cannot be copied.
export function duplicateElement(comp: Json, path: string, look: Json, cat: LookCatalogue): Edit {
  const loc = locate(comp, path);
  if (!loc || loc.slot) return { comp, error: loc?.slot ? 'The sticker on the edge cannot be copied' : 'That element is not there any more' };
  const type = String(loc.el.type);
  const copyNodes = listTree({ elements: [loc.el] }, null).length;
  if (ONE_ONLY.includes(type)) return { comp, error: `A design has at most one ${cat.elements[type]?.label.toLowerCase() ?? type}` };
  if (countNodes(comp) + copyNodes > limit(cat, 'nodes', 40)) return { comp, error: `A design has at most ${limit(cat, 'nodes', 40)} elements` };
  if (JSON.stringify(loc.el).includes('"type":"rows"') || JSON.stringify(loc.el).includes('"type":"seam"')) return { comp, error: 'That holds a piece that can be used once only' };
  let out = '';
  const next = mutate(comp, (c) => {
    const l = locate(c, path)!;
    const copy = clone(l.el);
    const place = freshPlace(copy, c, look);
    if (place) copy.place = place;
    l.list!.splice(l.index + 1, 0, copy);
    out = joinEl(l.parentPath, l.index + 1);
  });
  return { comp: next, path: out };
}

export interface Undo { path: string; parentPath: string; index: number; el: Json; slot: boolean }
// Removes an element (and what it holds). The undo payload puts it back where it was.
export function removeElement(comp: Json, path: string): Edit & { undo?: Undo } {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  if (!loc.slot && !loc.parent && elementsOfLen(comp) <= 1) return { comp, error: 'A design keeps at least one element' };
  const undo: Undo = { path, parentPath: loc.parentPath, index: loc.index, el: clone(loc.el), slot: loc.slot };
  const next = mutate(comp, (c) => {
    const l = locate(c, path)!;
    if (l.slot) delete l.parent!.sticker; else l.list!.splice(l.index, 1);
  });
  return { comp: next, undo };
}
const elementsOfLen = (c: Json) => (Array.isArray(c.elements) ? c.elements.length : 0);
export function restoreElement(comp: Json, undo: Undo): Edit {
  const next = mutate(comp, (c) => {
    if (undo.slot) { const p = locate(c, undo.parentPath); if (p) p.el.sticker = clone(undo.el); return; }
    const list = undo.parentPath ? (() => { const p = locate(c, undo.parentPath); return p ? ((Array.isArray(p.el.children) ? p.el.children : (p.el.children = [])) as Json[]) : elementsOf(c); })() : elementsOf(c);
    list.splice(Math.min(undo.index, list.length), 0, clone(undo.el));
  });
  return { comp: next, path: undo.path };
}

// Moves an element one place back (-1) or forward (+1) within its parent: that is its drawing order.
export function reorderElement(comp: Json, path: string, by: -1 | 1): Edit {
  const loc = locate(comp, path);
  if (!loc) return { comp, error: 'That element is not there any more' };
  if (loc.slot || !loc.list) return { comp, error: 'The sticker on the edge has no order' };
  const to = loc.index + by;
  if (to < 0 || to >= loc.list.length) return { comp, path };
  let out = '';
  const next = mutate(comp, (c) => {
    const l = locate(c, path)!;
    const [x] = l.list!.splice(l.index, 1);
    l.list!.splice(to, 0, x!);
    out = joinEl(l.parentPath, to);
  });
  return { comp: next, path: out };
}
// Moves an element to the given index of its own list (for dragging rows in the layer list).
export function moveToIndex(comp: Json, path: string, to: number): Edit {
  const loc = locate(comp, path);
  if (!loc || !loc.list) return { comp, error: 'That element cannot be moved' };
  const target = Math.max(0, Math.min(loc.list.length - 1, to));
  if (target === loc.index) return { comp, path };
  let out = '';
  const next = mutate(comp, (c) => { const l = locate(c, path)!; const [x] = l.list!.splice(l.index, 1); l.list!.splice(target, 0, x!); out = joinEl(l.parentPath, target); });
  return { comp: next, path: out };
}

// Moves an element into a box (or band, seam, or a sticker for text): it takes the box's flow, so it loses its place and the properties only
// a top element has.
export function moveInto(comp: Json, path: string, boxPath: string, cat: LookCatalogue): Edit {
  const loc = locate(comp, path), box = locate(comp, boxPath);
  if (!loc || !box) return { comp, error: 'That element is not there any more' };
  if (loc.slot) return { comp, error: 'The sticker on the edge stays on the edge' };
  if (path === boxPath || boxPath.startsWith(`${path}.`)) return { comp, error: 'A piece cannot go inside itself' };
  const type = String(loc.el.type), info = cat.elements[type];
  const boxInfo = cat.elements[String(box.el.type)];
  if (!boxInfo?.container) return { comp, error: 'That piece holds nothing' };
  if (info?.placement === 'none') return { comp, error: `A ${info.label.toLowerCase()} goes on the page, not in a box` };
  if (boxInfo.container === 'text' && type !== 'text') return { comp, error: 'A sticker holds text only' };
  if (!info?.flow) return { comp, error: `A ${info?.label.toLowerCase() ?? 'piece'} cannot flow in a box; use a box with room for it` };
  const depth = box.depth + 1 + (listTree({ elements: [loc.el] }, null).reduce((m, r) => Math.max(m, r.depth), 1) - 1);
  if (depth > limit(cat, 'depth', 4)) return { comp, error: `Pieces can be nested ${limit(cat, 'depth', 4)} levels deep at most` };
  let out = '';
  const next = mutate(comp, (c) => {
    const l = locate(c, path)!;
    const el = clone(l.el);
    delete el.place; delete el.z; delete el.bleed;
    l.list!.splice(l.index, 1);
    // the box's path may have shifted when the element came from before it in the same list
    const target = boxPathAfterRemoval(path, boxPath);
    const b = locate(c, target)!.el;
    const kids = (Array.isArray(b.children) ? b.children : (b.children = [])) as Json[];
    kids.push(el);
    out = joinEl(target, kids.length - 1);
  });
  return { comp: next, path: out };
}
function boxPathAfterRemoval(removed: string, box: string): string {
  const r = parsePathEl(removed), b = parsePathEl(box);
  const n = r.length - 1;
  if (b.length > n && r.slice(0, n).every((v, i) => v === b[i]) && b[n]! > r[n]!) b[n] = b[n]! - 1;
  return b.join('.');
}
// Takes an element out of its box and puts it on the page (or the box's own parent) just after the box, in the spot it was drawn in.
export function moveOut(comp: Json, path: string, look: Json, cat: LookCatalogue): Edit {
  const loc = locate(comp, path);
  if (!loc || !loc.parent) return { comp, error: 'It is not inside a box' };
  if (loc.slot) return { comp, error: 'The sticker on the edge stays on the edge' };
  const type = String(loc.el.type);
  const boxLoc = locate(comp, loc.parentPath)!;
  if (boxLoc.slot || !boxLoc.list) return { comp, error: 'It is not inside a box' };
  const rect = sketchRect(comp, path, look)?.rect;
  let out = '';
  const next = mutate(comp, (c) => {
    const l = locate(c, path)!;
    const el = clone(l.el);
    for (const k of FLOW_ONLY) if (cat.elements[type]?.properties[k]?.group === 'flow') delete el[k];
    l.list!.splice(l.index, 1);
    const bl = locate(c, l.parentPath)!;
    if (cat.elements[type]?.placement === 'required') el.place = rect ? rectToPlace({ ...el, place: {} }, rect, look, { to: gridOf(look)!.rows > 0 ? 'grid' : 'px' }) : newPlace(c, look);
    bl.list!.splice(bl.index + 1, 0, el);
    out = joinEl(bl.parentPath, bl.index + 1);
  });
  return { comp: next, path: out };
}
// A seam's one sticker, on its edge.
export function addEdgeSticker(comp: Json, seamPath: string, look: Json, cat: LookCatalogue): Edit {
  const loc = locate(comp, seamPath);
  if (!loc || String(loc.el.type) !== 'seam') return { comp, error: 'Only a slanted split has a sticker on its edge' };
  if (isObj(loc.el.sticker)) return { comp, error: 'It has a sticker already' };
  if (countNodes(comp) >= limit(cat, 'nodes', 40)) return { comp, error: `A design has at most ${limit(cat, 'nodes', 40)} elements` };
  const fields = cat.kinds[String(comp.kind)]?.fields ?? [];
  const f = ['tag', 'label'].find((x) => fields.includes(x));
  const s: Json = { type: 'sticker', shape: 'circle', size: 200, place: { anchor: { right: 80, top: -100 } } };
  if (f) s.field = f; else s.children = [{ type: 'text', source: 'brand', style: 'label' }];
  let out = '';
  const next = mutate(comp, (c) => { const p = locate(c, seamPath)!.el; p.sticker = s; if (f) withField(c, f, cat); out = joinEl(seamPath, Array.isArray(p.children) ? p.children.length : 0); });
  void look;
  return { comp: next, path: out };
}

// ================================================================== plain words

const sizeWord = (n: number): string => (n >= 200 ? 'huge' : n >= 120 ? 'very large' : n >= 80 ? 'large' : n >= 44 ? 'medium' : 'small');
export function firstSize(el: Json, look?: Json): number | null {
  if (isObj(el.ladder) && Array.isArray(el.ladder.steps) && Array.isArray((el.ladder.steps as number[][])[0])) return (el.ladder.steps as number[][])[0]![1] ?? null;
  if (isNum(el.size)) return el.size;
  if (Array.isArray(el.sizes) && isNum((el.sizes as number[])[0])) return (el.sizes as number[])[0]!;
  if (isNum(el.cap)) return el.cap;
  if (String(el.type) === 'text' && look) {
    const t = look.type as Json | undefined;
    const style = typeof el.style === 'string' ? el.style : 'body';
    const s = (t?.[style] as Json | undefined)?.size;
    return isNum(s) ? s : null;
  }
  return null;
}
// "Headline, large, on a paper block, tilted -2 degrees": an element in a sentence.
export function summary(el: Json, cat: LookCatalogue | null, look?: Json): string {
  const type = String(el.type);
  const bits: string[] = [elementName(el, cat)];
  const size = firstSize(el, look);
  if (size !== null && ['text', 'fitted-stack', 'numeral', 'mantra-rows', 'glyph'].includes(type)) bits.push(sizeWord(size));
  if (typeof el.fill === 'string') bits.push(`on a ${el.fill} ${type === 'box' || type === 'band' ? 'block' : 'shape'}`);
  else if (type === 'block' && typeof el.colour === 'string') bits.push(`${el.colour} colour`);
  if (typeof el.shape === 'string' && type !== 'box') bits.push(`${el.shape} shape`);
  if (typeof el.emphasis === 'string' && el.emphasis !== 'none') bits.push(`emphasis: ${el.emphasis.replace(/-/g, ' ')}`);
  if (el.rot !== undefined && el.rot !== 0) {
    const deg = look ? Math.round(angleDegrees(el.rot, look) * 10) / 10 : isNum(el.rot) ? el.rot : null;
    bits.push(deg === null || deg === 0 ? `turned by the ${String(el.rot)} angle` : `tilted ${deg < 0 ? '−' : ''}${Math.abs(deg)}°`);
  }
  const w = readWhen(el);
  if (w.present || w.absent) bits.push(whenText(w, cat).replace(/^Shown only/, 'only'));
  return bits.join(', ');
}

// ================================================================== problems from the server

export interface DesignProblem { message: string; path: string | null; prop: string | null; raw: string }
// "elements[2].children[0].size" (with or without "compositions[3]." in front) names the element "2.0" and the property "size". A seam's
// `sticker` is the child after its own children.
export function pathOfProblem(raw: string, comp?: Json): { path: string | null; prop: string | null } {
  const s = raw.replace(/^compositions\[\d+\]\.?/, '');
  const m = /^elements\[(\d+)\]/.exec(s);
  if (!m) return { path: null, prop: s || null };
  const parts = [Number(m[1])];
  let rest = s.slice(m[0].length);
  for (;;) {
    const c = /^\.children\[(\d+)\]/.exec(rest);
    if (c) { parts.push(Number(c[1])); rest = rest.slice(c[0].length); continue; }
    if (rest.startsWith('.sticker')) {
      const at = parts.join('.');
      const loc = comp ? locate(comp, at) : null;
      parts.push(loc && Array.isArray(loc.el.children) ? loc.el.children.length : 0);
      rest = rest.slice('.sticker'.length);
      continue;
    }
    break;
  }
  return { path: parts.join('.'), prop: rest.replace(/^\./, '') || null };
}
const PROP_WORD = (prop: string | null, type: string | null, cat: LookCatalogue | null): string => {
  if (!prop) return '';
  const head = prop.split('.')[0]!.replace(/\[\d+\]/g, '');
  return (type && cat?.elements[type]?.properties[head]?.label) || head;
};
// Server problems as plain sentences, each with the element it is about.
export function mapProblems(problems: Problem[], comp: Json | null, cat: LookCatalogue | null): DesignProblem[] {
  return problems.map((p) => {
    const raw = p.path && p.path !== 'definition' ? p.path : '';
    const at = pathOfProblem(raw, comp ?? undefined);
    let text = p.message.replace(/^look "[^"]*": /, '');
    // drop the leading path the engine wrote
    text = text.replace(/^compositions\[\d+\]\S*\s*/, '').replace(/^elements\[[^\s]*\s*/, '').replace(/^"([^"]+)" is not a setting/, '"$1" is not a setting');
    const el = at.path && comp ? elementAt(comp, at.path) : null;
    const name = el ? elementName(el, cat) : '';
    const prop = PROP_WORD(at.prop, el ? String(el.type) : null, cat);
    const lead = [name, prop && el ? prop : ''].filter(Boolean).join(': ');
    return { message: sentence(lead ? `${lead}: ${text}` : text), path: at.path, prop: at.prop, raw: p.message };
  });
}

// ================================================================== reset to the original

// The shipped composition a design started as (same kind, same name; else the same position among the kind), or null.
export function findOriginal(shippedDef: Json | null, comp: Json, position: number): Json | null {
  const list = (Array.isArray(shippedDef?.compositions) ? (shippedDef!.compositions as Json[]) : []).filter((c) => c.kind === comp.kind);
  return list.find((c) => c.name === comp.name) ?? list[position] ?? null;
}
export const shippedIdOf = (origin: unknown): string | null => { const m = /^copy:shipped:([a-z0-9-]+)$/.exec(String(origin ?? '')); return m ? m[1]! : null; };

// ================================================================== a design's own settings

export function setTop(comp: Json, key: 'name' | 'describe', v: string, cat: LookCatalogue): Edit {
  const max = key === 'name' ? limit(cat, 'name', 40) : limit(cat, 'description', 300);
  if (v.length > max) return { comp, error: `Use at most ${max} characters` };
  if (key === 'name' && !v.trim()) return { comp, error: 'A design needs a name' };
  return { comp: mutate(comp, (c) => { if (key === 'describe' && !v) delete c.describe; else c[key] = v; }) };
}
export function setGround(comp: Json, ground: string): Edit {
  return { comp: mutate(comp, (c) => { c.ground = ground; }) };
}
export function setCalm(comp: Json, share: number | undefined): Edit {
  if (share === undefined) return { comp: mutate(comp, (c) => { delete c.calm; }) };
  if (!isNum(share) || share < 0.45 || share > 0.8) return { comp, error: 'Use 0.45 to 0.8' };
  return { comp: mutate(comp, (c) => { c.calm = { maxShare: share }; }) };
}
export const joinProp = joinPath;

// ================================================================== ladders

export type LadderStep = [number, number];
export function ladderOf(el: Json): { by: string; steps: LadderStep[] } | null {
  return isObj(el.ladder) && Array.isArray(el.ladder.steps) ? { by: String(el.ladder.by), steps: (el.ladder.steps as LadderStep[]).map((s) => [s[0], s[1]] as LadderStep) } : null;
}
// '' when the steps are in order (shortest text first, sizes not growing) and the last reaches `max` characters.
export function checkLadder(steps: LadderStep[], max: number | undefined, range: [number, number]): string {
  if (!steps.length) return 'Add at least one step';
  for (const [i, s] of steps.entries()) {
    if (!Number.isInteger(s[0]) || s[0] < 1) return 'Characters are whole numbers from 1';
    if (!Number.isInteger(s[1]) || s[1] < range[0] || s[1] > range[1]) return `Sizes go from ${range[0]} to ${range[1]}`;
    if (i > 0 && s[0] <= steps[i - 1]![0]) return 'List the shortest text first: each step covers more characters';
    if (i > 0 && s[1] > steps[i - 1]![1]) return 'Sizes must not grow as the text gets longer';
  }
  if (max !== undefined && steps[steps.length - 1]![0] < max) return `The last step must reach ${max} characters`;
  return '';
}

// ================================================================== colours

const GROUND_ROLE: Record<string, string> = { paper: 'paper', field: 'field', dark: 'dark', accent: 'gold', soft: 'soft', tint: 'light-tint' };
export const GROUND_WORDS: Record<string, string> = { paper: 'Paper', field: 'Colour field', dark: 'Dark', accent: 'Accent', soft: 'Soft', tint: 'Pale tint' };
// The colour roles an element is drawn on: its own fill (a box, band or sticker), else the nearest filled piece it sits in, else the page colour(s).
export function backgroundRoles(comp: Json, path: string, look: Json): string[] {
  for (let p = path; p; p = parentOfPath(p)) {
    const loc = locate(comp, p);
    if (!loc) break;
    const t = String(loc.el.type);
    if (t === 'sticker') return [typeof loc.el.fill === 'string' ? loc.el.fill : (look.colour as Json | undefined)?.sticker === 'primary' ? 'primary' : 'gold'];
    if (typeof loc.el.fill === 'string' && (t === 'box' || t === 'band')) return [loc.el.fill];
    if (t === 'seam') return [String(loc.el.lower ?? 'field')];
  }
  const g = comp.ground;
  const grounds = typeof g === 'string' ? [g] : Array.isArray(g) ? (g as Json[]).map((c) => String(c.ground)) : ['paper'];
  return grounds.map((x) => GROUND_ROLE[x] ?? 'paper');
}
// The inks that read on the element's background (the catalogue's table), or every colour role when `all`.
export function inkChoices(comp: Json, path: string, look: Json, cat: LookCatalogue, all = false): string[] {
  const roles = cat.lists.roles as string[];
  if (all || !cat.inkOn) return roles;
  const lists = backgroundRoles(comp, path, look).map((bg) => cat.inkOn![bg]).filter((l): l is string[] => Array.isArray(l));
  if (!lists.length) return roles;
  return roles.filter((r) => lists.every((l) => l.includes(r)));
}
