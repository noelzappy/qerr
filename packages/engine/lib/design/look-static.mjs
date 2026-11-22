// Looks as data: the STATIC design checks (no Chrome). They run on a composition that is already well formed (look-validate.mjs) and
// judge what can be judged from the data alone: each required field is shown, once per way of showing it, whichever optional
// fields are filled; at most three type levels (up to five, in a clear hierarchy, where a design's levels allow); ink and fill pairs from a table; at most three turned elements and gentle text
// angles; text over a picture has a filled box or a dark fade under it; an element runs to a page edge only where it touches it.
// The render-time checks (fit, contrast, enlargement, pixel size, the four post checks) still run on the pictures later; these catch
// a look that could never pass them before anything is drawn.
import { ANGLE_NAMES, LIMITS, PAGE, POST_REQUIRED, PRIMITIVES } from './look-elements.mjs';
import { LEVELS } from './look-desc.mjs';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (xs) => xs.join(', ');

// ---- ink on fill ----
// Which ink may stand on which fill: a light fill takes the dark inks, a dark fill the light ones, an accent fill its own on-colour.
// A fill that is not a key here is refused (look-validate.mjs). The measured contrast is still checked when the picture is made.
const ON_LIGHT = ['ink', 'body', 'muted', 'field-text', 'field', 'dark', 'accent-type', 'primary', 'gold-deep'];
const ON_DARK = ['on-field', 'white', 'paper', 'body-field', 'body-dark', 'muted-dark', 'accent-dark', 'gold', 'on-primary', 'soft'];
const ON_MID = ['on-primary', 'white', 'paper'];
const ON_ACCENT = ['on-accent', 'ink', 'dark'];
export const INK_ON = Object.freeze({
  paper: ON_LIGHT, white: ON_LIGHT, soft: ON_LIGHT, 'paper-warm': ON_LIGHT, 'light-tint': ON_LIGHT, 'tint-deep': ON_LIGHT,
  dark: ON_DARK, field: ON_DARK, 'field-deep': ON_DARK, ink: ON_DARK,
  primary: ON_MID, gold: ON_ACCENT, 'gold-deep': [...ON_ACCENT, 'white', 'paper'], accent: ON_ACCENT,
});
export const FILL_ROLES = Object.keys(INK_ON);
// The role a page colour of a composition is drawn in.
const GROUND_ROLE = Object.freeze({ paper: 'paper', field: 'field', dark: 'dark', accent: 'gold', soft: 'soft', tint: 'light-tint' });

// ---- the page grid, resolved ----
export function gridOf(look) {
  const f = look?.canvas?.feed, m = f?.margin, g = f?.grid;
  if (!isObj(m) || !isObj(g) || ![m.top, m.right, m.bottom, m.left, g.cols, g.gutter].every(Number.isFinite)) return null;
  const rows = Number.isInteger(g.rows) ? g.rows : 0, head = Number.isFinite(g.head) ? g.head : 0, gx = g.gutter;
  const colW = (PAGE.w - m.left - m.right - (g.cols - 1) * gx) / g.cols;
  const bodyRows = head > 0 ? rows - 1 : rows;
  const rowH = rows > 0 && bodyRows > 0 ? (PAGE.h - m.top - m.bottom - (head > 0 ? head + gx : 0) - (bodyRows - 1) * gx) / bodyRows : 0;
  return { m, cols: g.cols, gutter: gx, rows, head, colW, rowH };
}
// The top and bottom y of grid rows `row` to `row + span - 1` (1-based; with a top row, row 1 is that row).
export function rowSpanOf(grid, row, span) {
  const top = (r) => (grid.head > 0 ? (r === 1 ? grid.m.top : grid.m.top + grid.head + grid.gutter + (r - 2) * (grid.rowH + grid.gutter)) : grid.m.top + (r - 1) * (grid.rowH + grid.gutter));
  const bottom = (r) => (grid.head > 0 && r === 1 ? grid.m.top + grid.head : top(r) + grid.rowH);
  return [top(row), bottom(row + span - 1)];
}

// ---- type styles and sizes ----
const styleDefault = (el) => (el.field === 'headline' || el.field === 'quote' ? 'display' : el.field === 'big' ? 'numeral' : el.source || el.word || ['label', 'meta', 'tag', 'unit', 'by'].includes(el.field) ? 'label' : 'body');
export const styleOf = (el) => el.style ?? styleDefault(el);
// The size of a style when an element gives none: the look's own (display and numeral have none).
function styleSize(style, look) {
  const t = look.type ?? {};
  return style === 'body' ? t.body?.size : style === 'item' ? t.item?.size ?? t.body?.size : style === 'label' ? t.label?.size : undefined;
}

// ---- what an element shows ----
// Each way of showing a field is a signature (field, part, split, format): the same signature twice is a field shown twice; different
// ones (a date tile and the whole meta line) are different things to show.
const sig = (f, ...rest) => [f, ...rest].join('|');
function bindingsOf(node, look) {
  const el = node.el;
  switch (node.type) {
    case 'text': return el.field === undefined ? [] : [{ field: el.field, sig: sig(el.field, el.part ?? 'all', el.split ? `${el.split.sep}${el.split.pick}` : '', el.format ?? '') }];
    case 'fitted-stack': case 'mantra-rows': return [{ field: el.field ?? 'headline', sig: sig(el.field ?? 'headline', 'all') }];
    case 'numeral': return [{ field: el.field ?? 'big', sig: sig(el.field ?? 'big', 'numeral', el.format ?? '') }, ...(el.unit ? [{ field: el.unit.field, sig: sig(el.unit.field, 'unit') }] : [])];
    case 'sticker': return el.field === undefined ? [] : [{ field: el.field, sig: sig(el.field, 'sticker') }];
    case 'photo': return [{ field: 'image', sig: 'image|all' }];
    case 'seam': return el.upper === 'field' ? [] : [{ field: 'image', sig: 'image|all' }];
    case 'rows': return el.each === 'items' ? [{ field: 'items', sig: 'items|rows' }] : [{ field: 'meta', sig: 'meta|rows' }];
    case 'meta-row': return (look.devices?.metaRow?.cells ?? []).some((c) => c.source === 'label') ? [{ field: 'label', sig: 'label|all' }] : [];
    default: return typeof PRIMITIVES[node.type]?.bindings === 'function' ? PRIMITIVES[node.type].bindings(el) : [];
  }
}
// Types whose bindings are not checked against the declared fields by their own descriptor.
const BIND_CHECKED_HERE = ['photo', 'seam', 'rows', 'meta-row', 'info-rows', 'photo-row', 'avatar'];
// A primitive that is a picture (text over it needs a filled box or a fade), by its module's `picture` flag.
const isPicture = (n) => n.type === 'photo' || (n.type === 'seam' && n.el.upper !== 'field') || PRIMITIVES[n.type]?.picture === true;

// ---- geometry (feed pixels) ----
// The least height an element can take (one line of its smallest size; a box: its padding and what flows in it). An element whose
// height is not given is judged to cover at least this much from the edge it is anchored to.
function minHeight(el, look) {
  const kids = (Array.isArray(el.children) ? el.children : []).filter((k) => k.place === undefined);
  const padV = typeof el.pad === 'number' ? 2 * el.pad : Array.isArray(el.pad) ? el.pad[0] + el.pad[2] : 0;
  switch (el.type) {
    case 'text': return el.ladder ? el.ladder.steps[el.ladder.steps.length - 1][1] : el.size ?? styleSize(styleOf(el), look) ?? 24;
    case 'fitted-stack': case 'mantra-rows': return el.floor ?? el.sizes?.[el.sizes.length - 1] ?? 40;
    case 'numeral': return el.min ?? el.sizes?.[el.sizes.length - 1] ?? 60;
    case 'rows': return Math.max(el.rowMinH ?? 0, el.textSize ?? styleSize(el.textStyle ?? 'item', look) ?? 30);
    case 'sticker': return el.size ?? el.h ?? 40;
    case 'rule': return typeof el.weight === 'number' ? el.weight : 1;
    case 'box': case 'band': {
      const hs = kids.map((k) => (typeof k.h === 'number' ? k.h : minHeight(k, look)));
      const body = el.flow === 'row' ? Math.max(0, ...hs) : hs.reduce((a, b) => a + b, 0) + (el.gap ?? 0) * Math.max(0, hs.length - 1);
      return padV + body;
    }
    default: return typeof el.h === 'number' ? el.h : 0;
  }
}
const lenPx = (v, side, look, g) => {
  if (typeof v === 'number') return v;
  const f = look.devices?.frame ?? {};
  return v === 'margin' ? g.m[side] ?? g.m.left : v === 'gutter' ? g.gutter : v === 'col' ? g.colW : v === 'frame' ? f.t ?? 0 : v === 'frame+pad' ? (f.t ?? 0) + (f.pad ?? 0) : 0;
};
const PAGE_RECT = { x0: 0, y0: 0, x1: PAGE.w, y1: PAGE.h };
// The rectangle a place gives (x0, y0, x1, y1); an unknown size is no extent from the edge it is anchored to (so only what is certain is judged).
export function placeRect(place, base, look, g, mh = 0) {
  const f = look.devices?.frame ?? {};
  if (place.inset !== undefined) {
    if (place.inset === 'page') return { ...PAGE_RECT };
    if (place.inset === 'margins') return { x0: g.m.left, y0: g.m.top, x1: PAGE.w - g.m.right, y1: PAGE.h - g.m.bottom };
    const t = f.t ?? 0;
    return { x0: t, y0: t, x1: PAGE.w - t, y1: PAGE.h - t };
  }
  const bw = base.x1 - base.x0, bh = base.y1 - base.y0;
  if (place.px) {
    const p = place.px;
    return { x0: base.x0 + p.x, y0: base.y0 + p.y, x1: base.x0 + p.x + (p.w ?? 0), y1: base.y0 + p.y + Math.max(p.h ?? mh, place.minH ?? 0) };
  }
  if (place.anchor) {
    const a = place.anchor, v = (k, side) => (a[k] === undefined ? null : lenPx(a[k], side, look, g));
    const axis = (lo, hi, size, total, b0) => {
      if (lo !== null && hi !== null) return [b0 + lo, b0 + total - hi];
      if (lo !== null) return [b0 + lo, b0 + lo + (size ?? 0)];
      if (hi !== null) return [b0 + total - hi - (size ?? 0), b0 + total - hi];
      return size !== null ? [b0, b0 + size] : [b0, b0 + total];
    };
    const [x0, x1] = axis(v('left', 'left'), v('right', 'right'), v('w', 'left'), bw, base.x0);
    let [y0, y1] = axis(v('top', 'top'), v('bottom', 'bottom'), v('h', 'top') ?? mh, bh, base.y0);
    const lack = (place.minH ?? 0) - (y1 - y0);
    if (lack > 0) { if (a.top === undefined && a.bottom !== undefined) y0 = y1 - (place.minH ?? 0); else y1 = y0 + (place.minH ?? 0); }
    return { x0: x0 + (place.dx ?? 0), y0: y0 + (place.dy ?? 0), x1: x1 + (place.dx ?? 0), y1: y1 + (place.dy ?? 0) };
  }
  const p = place.grid, minH = place.minH ?? 0;
  const x0 = g.m.left + (p.col - 1) * (g.colW + g.gutter), x1 = place.w !== undefined ? x0 + lenPx(place.w, 'left', look, g) : x0 + p.span * g.colW + (p.span - 1) * g.gutter;
  let y0 = g.m.top, y1 = PAGE.h - g.m.bottom;
  if (p.row !== undefined) {
    [y0, y1] = rowSpanOf(g, p.row, p.rowSpan ?? 1);
    if (place.h !== undefined) y1 = y0 + lenPx(place.h, 'top', look, g);
    else if (p.alignY) { if (p.alignY === 'top') y1 = y0 + mh; else if (p.alignY === 'bottom') y0 = y1 - mh; else { const mid = (y0 + y1) / 2; y0 = mid - mh / 2; y1 = mid + mh / 2; } }
  }
  if (place.square) {
    // as tall as wide: at the foot of its rows with alignY bottom, centred with center, else at the top
    const side = x1 - x0;
    if (p.row !== undefined && p.alignY === 'bottom') y0 = y1 - side;
    else if (p.row !== undefined && p.alignY === 'center') { const mid = (y0 + y1) / 2; y0 = mid - side / 2; y1 = mid + side / 2; }
    else y1 = y0 + side;
  }
  if (y1 - y0 < minH) { if (p.row !== undefined && p.alignY === 'bottom') y0 = y1 - minH; else y1 = y0 + minH; }
  return { x0: x0 + (place.dx ?? 0), y0: y0 + (place.dy ?? 0), x1: x1 + (place.dx ?? 0), y1: y1 + (place.dy ?? 0) };
}
function rectOf(node, look, g, cache) {
  if (cache.has(node)) return cache.get(node);
  const el = node.el;
  let r;
  if (node.type === 'frame' || node.type === 'seam') r = { ...PAGE_RECT };
  else if (node.type === 'meta-row') r = { x0: g.m.left, y0: g.m.top, x1: PAGE.w - g.m.right, y1: g.m.top + g.head };
  else if (node.type === 'band') r = { x0: 0, y0: el.y, x1: PAGE.w, y1: el.y + el.h };
  else if (node.parent?.type === 'seam') {
    // a seam's sticker is placed from the seam's top edge; its other items flow in the colour below the edge
    const [lo, hi] = [Math.min(node.parent.el.leftY, node.parent.el.rightY), Math.max(node.parent.el.leftY, node.parent.el.rightY)];
    r = node.slot && el.place ? placeRect(el.place, { x0: 0, y0: lo, x1: PAGE.w, y1: PAGE.h }, look, g, minHeight(el, look)) : { x0: 0, y0: hi, x1: PAGE.w, y1: PAGE.h };
  } else if (el.place) r = placeRect(el.place, node.parent ? rectOf(node.parent, look, g, cache) : PAGE_RECT, look, g, minHeight(el, look));
  else r = node.parent ? rectOf(node.parent, look, g, cache) : { ...PAGE_RECT };
  cache.set(node, r);
  return r;
}
const TOL = 0.5;
const axisOverlap = (a0, a1, b0, b1) => (a1 - a0 < 1e-6 ? a0 >= b0 - TOL && a0 <= b1 + TOL : Math.min(a1, b1) - Math.max(a0, b0) > TOL);
const overlaps = (a, b) => axisOverlap(a.x0, a.x1, b.x0, b.x1) && axisOverlap(a.y0, a.y1, b.y0, b.y1);
const contains = (b, t) => t.x0 >= b.x0 - 1 && t.x1 <= b.x1 + 1 && t.y0 >= b.y0 - 1 && t.y1 <= b.y1 + 1;
const topOf = (n) => { while (n.parent) n = n.parent; return n; };
const keyOf = (n) => (n.el.z ?? 0) * 1000 + n.order;

// ---- angles ----
const angleOf = (v, look) => (typeof v === 'number' ? v : (look.devices?.angles?.[v] ?? 0)) * (look.dials?.tilt ?? 1);
const isTurned = (v, look) => (typeof v === 'number' ? v !== 0 : ANGLE_NAMES.includes(v) && (look.devices?.angles?.[v] ?? 0) !== 0);

// Whether an element reaches the page edge `edge` by where it is placed.
function touches(node, edge, g) {
  const p = node.el.place;
  if (!p || node.parent) return false;
  if (p.inset) return p.inset !== 'frame';
  if (p.px) {
    const x = p.px;
    return edge === 'left' ? x.x <= 0 : edge === 'top' ? x.y <= 0 : edge === 'right' ? x.w !== undefined && x.x + x.w >= PAGE.w : x.h !== undefined && x.y + x.h >= PAGE.h;
  }
  if (p.anchor) { const v = p.anchor[edge]; return v === 0 || v === 'margin'; }
  const q = p.grid;
  return edge === 'left' ? q.col === 1 : edge === 'right' ? q.col + q.span - 1 === g.cols : edge === 'top' ? q.row === undefined || q.row === 1 : q.row === undefined || q.row + (q.rowSpan ?? 1) - 1 === g.rows;
}

const TEXT_TYPES = ['text', 'fitted-stack', 'numeral', 'mantra-rows', 'rows', 'meta-row', 'info-rows'];

// The type sizes a node sets (px) and whether it is a fitted headline.
function sizesOf(node, look) {
  const el = node.el, out = { sizes: [], fitted: false, heads: [] };
  const add = (s) => { if (Number.isFinite(s)) out.sizes.push(s); };
  if (node.type === 'text') {
    const z = el.ladder ? el.ladder.steps[0][1] : el.size ?? styleSize(styleOf(el), look);
    add(z);
    if (['headline', 'quote', 'big'].includes(el.field) && Number.isFinite(z)) out.heads.push(z);
  }
  else if (['fitted-stack', 'mantra-rows'].includes(node.type)) out.fitted = true;
  else if (node.type === 'numeral') { out.fitted = true; if (el.unit) add(styleSize(el.unit.style ?? 'label', look)); }
  else if (node.type === 'sticker' && el.field !== undefined) add(el.ladder ? el.ladder.steps[0][1] : el.fit?.cap ?? el.textSize ?? Math.round((el.size ?? el.h ?? 100) / 5));
  else if (node.type === 'rows') {
    add(el.textSize ?? styleSize(el.textStyle ?? 'item', look));
    if ((el.number ?? 'none') !== 'none') add(el.numberSize ?? styleSize(el.numberStyle ?? 'label', look));
  } else if (node.type === 'meta-row') add(look.type?.label?.size);
  else if (typeof PRIMITIVES[node.type]?.sizes === 'function') for (const s of PRIMITIVES[node.type].sizes(el, look)) add(s);
  return out;
}
const levelGroups = (sizes) => {
  const s = [...sizes].sort((a, b) => a - b), groups = [];
  for (const z of s) { const g = groups[groups.length - 1]; if (!g || z - g[g.length - 1] > 2) groups.push([z]); else g.push(z); }
  return groups;
};
const levelCount = (sizes) => levelGroups(sizes).length;
// The levels a composition allows: { max, ratio } (three and no ratio rule unless the design says more).
export const levelsOf = (comp) => (isObj(comp?.levels) && Number.isInteger(comp.levels.max) ? { max: comp.levels.max, ratio: comp.levels.ratio ?? LEVELS.ratio } : { max: LIMITS.typeLevels, ratio: null });
// The hierarchy of known sizes when a design allows more than three: each level at least `ratio` times the next smaller one, and the
// headline's size above every other text. sizes: every known size; heads: the headline's (and the quote's). -> a problem sentence or null.
export function hierarchyProblem(sizes, heads, ratio) {
  const groups = levelGroups(sizes);
  for (let i = 1; i < groups.length; i++) {
    const lo = Math.max(...groups[i - 1]), hi = Math.min(...groups[i]), r = hi / lo;
    if (r < ratio - 0.005) return `sets type at ${Math.round(lo)} px and ${Math.round(hi)} px, only ${r.toFixed(2)} times apart; with more than ${LEVELS.min} sizes each must be at least ${ratio} times the next smaller one`;
  }
  if (heads.length) {
    const h = Math.min(...heads), other = sizes.filter((z) => !heads.includes(z));
    const top = other.length ? Math.max(...other) : null;
    if (top !== null && top > h - 2) return `sets a text at ${Math.round(top)} px, as large as the headline (${Math.round(h)} px) or larger; the headline must stay the largest`;
  }
  return null;
}

const hasFill = (n) => (n.el.fill !== undefined && ['box', 'band'].includes(n.type)) || hasGradient(n);
// a box filled with a gradient: every one of its colours is a fill its text must read on
const hasGradient = (n) => n.type === 'box' && isObj(n.el.gradient) && Array.isArray(n.el.gradient.stops);
// The role a node is drawn on: the nearest filled ancestor (or the node itself), else the page colour(s).
function backgrounds(node, comp, look) {
  for (let n = node; n; n = n.parent) {
    if (n.type === 'sticker') return [n.el.fill ?? (look.colour?.sticker === 'primary' ? 'primary' : 'gold')];
    if (hasGradient(n)) return [...n.el.gradient.stops];
    // a primitive's own fill (none for one that is drawn bare, such as an icon without its badge)
    if (typeof PRIMITIVES[n.type]?.ownFill === 'function' && PRIMITIVES[n.type].ownFill(n.el) !== undefined) return [PRIMITIVES[n.type].ownFill(n.el)];
    if (hasFill(n)) return [n.el.fill];
    if (n.type === 'seam') return [n.el.lower];
    if (n.type === 'rows' && (n.el.altFill || n.el.fill)) return n.el.altFill ?? [n.el.fill];
  }
  const gs = typeof comp.ground === 'string' ? [comp.ground] : comp.ground.map((c) => c.ground);
  return gs.map((g) => GROUND_ROLE[g]);
}

// The colours of a named shape (its key) a crossing text must read on: a box's fill or gradient, a block's colour, a sticker's fill, a gradient
// area's stops, a badge's fill.
function shapeFills(n, look) {
  const el = n.el;
  if (n.type === 'box') return hasGradient(n) ? [...el.gradient.stops] : el.fill !== undefined ? [el.fill] : [];
  if (n.type === 'block') return [el.colour ?? 'accent'];
  if (n.type === 'sticker') return [el.fill ?? (look.colour?.sticker === 'primary' ? 'primary' : 'gold')];
  if (n.type === 'gradient') return Array.isArray(el.gradient?.stops) ? [...el.gradient.stops] : [];
  if (typeof PRIMITIVES[n.type]?.ownFill === 'function' && PRIMITIVES[n.type].ownFill(el) !== undefined) return [PRIMITIVES[n.type].ownFill(el)];
  return [];
}

export function compositionStaticChecks(comp, nodes, ctx, path, errs, push) {
  const look = ctx.look, g = gridOf(look);
  const at = (node, text) => push(errs, ctx, node.path, text);
  const whole = (text) => push(errs, ctx, path, text);
  const declared = Object.keys(comp.fields);
  const required = new Set([...declared.filter((f) => comp.fields[f].required === true), ...POST_REQUIRED[comp.kind]]);
  const optional = declared.filter((f) => !required.has(f));

  // -- what the elements need of the look --
  for (const n of nodes) {
    if (n.type === 'meta-row' && (!look.devices?.metaRow || !(g?.head > 0))) at(n, 'a top label row needs devices.metaRow and a top row (canvas.feed.grid.head above 0) in the look');
    if (n.type === 'frame' && !(look.devices?.frame?.t > 0) && n.el.t === undefined) at(n, 'the look has no frame thickness (devices.frame.t); give the frame its own thickness (t)');
    if (BIND_CHECKED_HERE.includes(n.type)) {
      for (const b of bindingsOf(n, look)) if (!declared.includes(b.field)) at(n, `shows ${b.field}, which the composition does not declare; add it to the composition's fields first`);
    }
    if (n.type === 'rows' && n.el.each === 'meta-parts' && !declared.includes('meta')) at(n, 'shows the parts of meta, which the composition does not declare');
    if (n.type === 'rows' && n.el.each === 'items' && !declared.includes('items')) at(n, 'shows the list items, which the composition does not declare');
    if (n.type === 'numeral' && n.el.format && ['date-dd.mm', 'day', 'month'].includes(n.el.format) && (n.el.field ?? 'big') !== 'meta') at(n, 'reads a date from the meta field');
    if (n.type === 'text' && ['display', 'numeral'].includes(styleOf(n.el)) && n.el.size === undefined && n.el.ladder === undefined) at(n, `${styleOf(n.el)} type needs a size or a size ladder`);
    if (n.type === 'rows') {
      for (const k of ['numberStyle', 'textStyle']) if (['display', 'numeral'].includes(n.el[k]) && n.el[k === 'numberStyle' ? 'numberSize' : 'textSize'] === undefined) at(n, `${k.slice(0, -5)} in ${n.el[k]} type needs its size (${k === 'numberStyle' ? 'numberSize' : 'textSize'})`);
    }
  }

  // -- each required field shown, whichever optional fields are filled; no way of showing a field twice --
  const whens = nodes.map((n) => n.el.when).filter(Boolean);
  if (Array.isArray(comp.ground)) comp.ground.forEach((c) => c.when && whens.push(c.when));
  const conditioned = [...new Set(whens.flatMap((w) => [w.present, w.absent]).filter((f) => f && optional.includes(f)))];
  const dupSeen = new Set(), missSeen = new Set(), bad = [];
  let maxLevels = 0, maxLevelCombo = '', hierarchy = null;
  const allowed = levelsOf(comp);
  if (conditioned.length > LIMITS.optionalFieldsInConditions) whole(`conditions on ${conditioned.length} optional fields; the most is ${LIMITS.optionalFieldsInConditions}`);
  else {
    for (let mask = 0; mask < 1 << conditioned.length; mask++) {
      const present = new Set([...required, ...optional.filter((f) => !conditioned.includes(f)), ...conditioned.filter((f, i) => mask & (1 << i))]);
      const holds = (w) => !w || ((w.present === undefined || present.has(w.present)) && (w.absent === undefined || !present.has(w.absent)));
      const empty = conditioned.filter((f) => !present.has(f)), combo = empty.length ? ` when ${list(empty)} ${empty.length > 1 ? 'are' : 'is'} empty` : '';
      const active = nodes.filter((n) => { for (let a = n; a; a = a.parent) if (!holds(a.el.when)) return false; return true; });
      const seen = new Map();
      for (const n of active) for (const b of bindingsOf(n, look)) { if (seen.has(b.sig) && !dupSeen.has(b.sig)) { dupSeen.add(b.sig); at(n, `shows ${b.field} in the same way as ${seen.get(b.sig)}; show each field once (or in a different part or format)${combo}`); } seen.set(b.sig, n.path); }
      for (const f of required) if (![...seen.keys()].some((s) => s.startsWith(`${f}|`)) && !missSeen.has(f)) { missSeen.add(f); bad.push(f); whole(`nothing shows the required field ${f}${combo}`); }
      // type levels
      const sizes = [], heads = [], st = { fitted: false };
      for (const n of active) { const s = sizesOf(n, look); sizes.push(...s.sizes); heads.push(...s.heads); st.fitted ||= s.fitted; }
      const lv = levelCount(sizes) + (st.fitted ? 1 : 0);
      if (lv > maxLevels) { maxLevels = lv; maxLevelCombo = combo; }
      // more than three sizes: still a hierarchy (each size clearly apart from the next, the headline the largest)
      if (allowed.ratio !== null && !hierarchy) { const h = hierarchyProblem(sizes, heads, allowed.ratio); if (h) hierarchy = `${h}${combo}`; }
    }
    if (maxLevels > allowed.max) whole(`sets type in ${maxLevels} sizes${maxLevelCombo}; at most ${allowed.max} levels are allowed (a fitted headline counts as one${allowed.max === LIMITS.typeLevels ? '; a design may allow up to 5 with levels' : ''})`);
    if (hierarchy) whole(hierarchy);
  }
  for (const f of declared) if (!nodes.some((n) => bindingsOf(n, look).some((b) => b.field === f))) whole(`declares ${f} but no element shows it`);

  // -- ink on fill --
  const pairProblem = (ink, fill) => (INK_ON[fill] && typeof ink === 'string' && !INK_ON[fill].includes(ink) ? `ink ${ink} does not read on fill ${fill} (use ${list(INK_ON[fill])})` : null);
  for (const n of nodes) {
    const el = n.el;
    if (el.ink !== undefined) {
      const own = n.type === 'text' && el.tiltBar ? ['gold'] : backgrounds(n, comp, look);
      // (words with an outline, overlap.outline, may read by the outline: the outline on the colour, the ink on the outline)
      const ol = isObj(el.overlap) && isObj(el.overlap.outline) ? el.overlap.outline.colour : undefined;
      const byOutline = (bg) => ol !== undefined && INK_ON[ol]?.includes(el.ink) && INK_ON[bg]?.includes(ol);
      for (const bg of own) { const p = pairProblem(el.ink, bg); if (p && !byOutline(bg)) { at(n, `${p}`); break; } }
    }
    if (n.type === 'rows') {
      const t = el.numberTile;
      if (t && t.fill && t.ink) { const p = pairProblem(t.ink, t.fill); if (p) at(n, `numberTile: ${p}`); }
    }
    // a headline's pills: their ink on their fill (an outline pill's ink on what the headline stands on)
    if (n.type === 'text' && isObj(el.pills) && typeof el.pills.ink === 'string') {
      const on = el.pills.fill !== undefined ? [el.pills.fill] : backgrounds(n, comp, look);
      for (const bg of on) { const p = pairProblem(el.pills.ink, bg); if (p) { at(n, `pills: ${p}`); break; } }
    }
    // a primitive's own inks: on its own fill (inkPairs, when the look leaves the ink to it) and on what it stands on (inks)
    const prim = PRIMITIVES[n.type];
    if (prim && typeof prim.inkPairs === 'function' && el.ink === undefined) for (const [ink, fill] of prim.inkPairs(el)) { const p = pairProblem(ink, fill); if (p) at(n, p); }
    if (prim && typeof prim.inks === 'function') {
      const on = backgrounds(n, comp, look);
      for (const ink of prim.inks(el)) for (const bg of on) { const p = pairProblem(ink, bg); if (p) { at(n, p); break; } }
    }
  }

  // -- words that cross a shape's edge on purpose (overlap): the ink must read on the shape AND on what the words stand on outside it, unless
  // an outline carries them (then the outline must read on both and the ink on the outline). The pixels of every part are measured again. --
  for (const n of nodes) {
    const o = n.el.overlap;
    if (!isObj(o) || o.with === 'any-shape') continue;
    const target = nodes.find((x) => x.el.key === o.with);
    if (!target) continue;
    const ink = inkOf(n), fills = shapeFills(target, look), on = [...fills, ...backgrounds(n, comp, look)];
    // on each colour: the ink reads on it, or the outline reads on it and the ink reads on the outline
    const ol = isObj(o.outline) ? o.outline.colour : undefined, inkOnOutline = ol !== undefined && !!ink && !!INK_ON[ol] && INK_ON[ol].includes(ink);
    if (ol !== undefined && ink && INK_ON[ol] && !inkOnOutline) at(n, `its ink ${ink} does not read on its outline ${ol} (use ${list(INK_ON[ol])})`);
    for (const bg of on) {
      if (!INK_ON[bg] || !ink || INK_ON[bg].includes(ink)) continue;
      if (inkOnOutline && INK_ON[bg].includes(ol)) continue;
      at(n, `crosses the edge of shape ${o.with}, so its ink ${ink} must read on ${bg} too (use ${list(INK_ON[bg])}, or an outline that reads on ${bg})`);
      break;
    }
  }

  // -- turned elements --
  // (a primitive with a lean of its own, a device, says so: turned(el))
  const turned = nodes.filter((n) => (n.el.rot !== undefined && isTurned(n.el.rot, look)) || (typeof PRIMITIVES[n.type]?.turned === 'function' && PRIMITIVES[n.type].turned(n.el) && (look.dials?.tilt ?? 1) !== 0));
  const rowsTurned = nodes.filter((n) => n.type === 'rows' && Array.isArray(n.el.altRot) && n.el.altRot.some((v) => isTurned(v, look)));
  if (turned.length + rowsTurned.length > LIMITS.rotated) whole(`turns ${turned.length + rowsTurned.length} elements; at most ${LIMITS.rotated} may be turned`);
  for (const n of nodes) {
    if (!TEXT_TYPES.includes(n.type) || n.el.vertical !== undefined) continue;
    let sum = 0;
    for (let a = n; a; a = a.parent) { if (a.type === 'sticker') { sum = 0; break; } if (a.el.rot !== undefined) sum += angleOf(a.el.rot, look); }
    if (Math.abs(sum) > LIMITS.textRotation) at(n, `its text is turned ${Math.round(Math.abs(sum) * 10) / 10} degrees; text may be turned at most ${LIMITS.textRotation} degrees outside a sticker`);
  }

  // -- run to the page edge --
  for (const n of nodes) {
    const b = n.el.bleed;
    if (!b) continue;
    if (n.parent) { at(n, 'only an element placed on the page can run to its edge'); continue; }
    // drawn only when the place gives left, top, width and height
    const pl = n.el.place, an = pl?.anchor;
    const sized = pl && (pl.inset !== undefined || pl.grid !== undefined || (pl.px && pl.px.w !== undefined && pl.px.h !== undefined)
      || (an && an.left !== undefined && (an.right !== undefined || an.w !== undefined) && an.top !== undefined && (an.bottom !== undefined || an.h !== undefined)));
    if (n.type !== 'numeral' && g) for (const e of b.edges) if (!touches(n, e, g)) at(n, `runs to the ${e} edge, which it does not touch (only an element at that edge, or a numeral, may)`);
    if (!sized) at(n, 'runs to the page edge, so its place must give left, top, width and height (a grid place, inset, px with w and h, or an anchor from the left and top with a width or the right edge)');
  }

  // -- text over a picture --
  if (g) {
    const cache = new Map();
    const photos = nodes.filter(isPicture);
    const backers = nodes.filter((n) => n.type === 'scrim' || n.type === 'overlay' || n.type === 'gradient' || n.type === 'block' || n.type === 'sticker' || hasFill(n) || (typeof PRIMITIVES[n.type]?.ownFill === 'function' && PRIMITIVES[n.type].ownFill(n.el) !== undefined) || (n.type === 'rows' && (n.el.fill || n.el.altFill))).map((n) => ({ n, rect: rectOf(n, look, g, cache), key: keyOf(topOf(n)) }));
    for (const s of nodes.filter((x) => x.type === 'seam')) {
      const y = Math.max(s.el.leftY, s.el.rightY);
      backers.push({ n: s, rect: { x0: 0, y0: y, x1: PAGE.w, y1: PAGE.h }, key: keyOf(s) + 0.5 });
    }
    for (const t of nodes.filter((x) => TEXT_TYPES.includes(x.type))) {
      let ok = false;
      for (let a = t.parent; a; a = a.parent) if (a.type === 'sticker' || a.type === 'seam' || hasFill(a)) ok = true;
      if (ok || (t.type === 'rows' && (t.el.fill || t.el.altFill))) continue;
      const tr = rectOf(t, look, g, cache), tk = keyOf(topOf(t));
      for (const p of photos) {
        const pk = keyOf(topOf(p));
        if (pk >= tk || topOf(p) === topOf(t)) continue;
        if (!overlaps(rectOf(p, look, g, cache), tr)) continue;
        if (!backers.some((b) => b.key > pk - 0.001 && b.key < tk && b.n !== t && contains(b.rect, tr))) { at(t, 'its text lies over a picture with no filled box under it and no dark fade behind it; put it in a filled box or add a dark fade (scrim) between them'); break; }
      }
    }
    inkOnLayers(nodes, look, g, cache, at);
  }
}

// ---- ink on a gradient or a colour over a picture ----
// Text drawn over a gradient area (or a colour laid over a picture) that is below it on the page, and not in a filled box of its own, must read on
// EVERY colour of the gradient (the worst stop decides) and on the overlay's colour. The ink is the text's own, else the nearest box's, else its
// style's (display and figures ink, body and items body, labels muted). The pixels are measured again when the page is made.
const STYLE_INK = { display: 'ink', numeral: 'ink', body: 'body', item: 'body', label: 'muted' };
function inkOf(t) {
  for (let a = t; a; a = a.parent) if (typeof a.el.ink === 'string') return a.el.ink;
  if (t.type === 'text') return STYLE_INK[styleOf(t.el)];
  if (['fitted-stack', 'mantra-rows', 'numeral'].includes(t.type)) return 'ink';
  return null;
}
function inkOnLayers(nodes, look, g, cache, at) {
  const layers = nodes.filter((n) => !n.parent && (n.type === 'gradient' || n.type === 'overlay'));
  if (!layers.length) return;
  for (const t of nodes.filter((x) => TEXT_TYPES.includes(x.type))) {
    let boxed = false;
    for (let a = t.parent; a; a = a.parent) if (a.type === 'sticker' || a.type === 'seam' || hasFill(a)) boxed = true;
    if (boxed) continue;
    const ink = inkOf(t);
    if (!ink) continue;
    const tr = rectOf(t, look, g, cache), tk = keyOf(topOf(t));
    for (const l of layers) {
      if (keyOf(l) >= tk || !overlaps(rectOf(l, look, g, cache), tr)) continue;
      const fills = l.type === 'gradient' ? (Array.isArray(l.el.gradient?.stops) ? l.el.gradient.stops : []) : [l.el.colour ?? 'ink'];
      const worst = fills.find((f) => INK_ON[f] && !INK_ON[f].includes(ink));
      if (worst) { at(t, `its ink ${ink} does not read on ${worst}, ${l.type === 'gradient' ? 'one of the colours of the gradient' : 'the colour over the picture'} under it (use ${list(INK_ON[worst])}, or a colour that reads on every one)`); break; }
    }
  }
}
