// Layouts as data: a brand's own compositions, described as blocks placed in slots on a grid. A layout never holds markup,
// CSS or a URL: it is numbers in bounds and names from the fixed lists below, and lib/design/layout-render.mjs turns a checked
// layout and a checked spec into a page with the same helpers, escaping and checks as the built-in templates.
// Pure: no Chrome, no file system (except loadLayouts, which reads brand.json's "layouts" list).
//
// A layout:
//   {
//     "id": "split-photo",                        lowercase letters, digits and -, up to 40 (a design names it: { "template": "layout", "layout": "split-photo" })
//     "name": "Split photo",                      shown in Settings and to the AI; never placed in an image
//     "description": "A photo on top ...",        optional, up to 300 characters, for people and the AI
//     "ground": "series" | a ground name,         the page colour (default: the series' ground, else white)
//     "accent": "series" | an accent style,       how the *accent phrase* of a headline is set
//     "texture": "none" | "dots" | "lines",       the faint dot grid or line texture on the page
//     "fields": { "headline": { "required": true, "max": 90 }, "image": { "required": true }, "stats": { "min": 1, "max": 3 } },
//     "canvas": { "feed": { "columns": 12, "rows": 15, "margin": { "top": 80, "right": 70, "bottom": 70, "left": 70 }, "gutter": 24 } },
//     "blocks": [ { "type": "photo", "slot": { "col": 1, "row": 1, "width": 12, "height": 8 }, "bleed": ["top", "left", "right"] }, ... ]
//   }
//
// The sizes a layout renders at are the keys of its canvas (from lib/design/sizes.mjs). A slot is in grid cells, 1-based, and
// may be given per size ({ "feed": {...}, "story": {...} }). A design block for a layout is checked against the fields the layout
// declares, with their lengths, exactly as the built-in templates check theirs.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, brandFile } from '../core.mjs';
import { ARTEFACT_TYPES, IMAGE_EXT, MAX_STATS, NETWORKS, focalToCss, parseSizes, parseStat, validateDesign } from './spec.mjs';
import { SIZES, SIZE_NAMES } from './sizes.mjs';
import { ACCENT_STYLES, DARK_GROUNDS, GROUND_NAMES, SERIES_KEY } from './tokens.mjs';

export const LAYOUT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const MAX_LAYOUTS = 40;
export const MAX_BLOCKS = 24;
export const MAX_CHILDREN = 6;

// The grid's bounds, and the smallest margins per size: text and logos stay inside the margins (a story keeps clear of the
// Instagram interface at the top and bottom); only a photo, a slab or a decoration may bleed over them to the page edge.
export const GRID_LIMITS = { columns: [1, 24], rows: [1, 36], gutter: [0, 80], margin: [0, 600], minCell: 16 };
export const MIN_MARGINS = {
  feed: { top: 40, right: 48, bottom: 40, left: 48 },
  square: { top: 40, right: 48, bottom: 40, left: 48 },
  wide: { top: 28, right: 36, bottom: 28, left: 36 },
  story: { top: 250, right: 48, bottom: 320, left: 48 },
};
// Type sizes are given for the feed page; the other sizes scale them.
export const TYPE_SCALE = { feed: 1, square: 0.9, story: 1, wide: 0.6 };
const EDGES = ['top', 'right', 'bottom', 'left'];

// The fields a layout may declare. Text: `max` characters (up to `cap`); lists: `min` and `max` entries (up to `cap`).
export const FIELDS = {
  headline: { kind: 'text', cap: 220, max: 120, word: 'the headline (*accent phrase* and \\n line breaks allowed)' },
  sub: { kind: 'text', cap: 220, max: 180, word: 'the sub line' },
  line: { kind: 'text', cap: 120, max: 80, word: 'a line under a big number' },
  quote: { kind: 'text', cap: 220, max: 160, word: 'a quotation' },
  myth: { kind: 'text', cap: 220, max: 120, word: 'the myth' },
  factLead: { kind: 'text', cap: 220, max: 120, word: 'the fact, as a headline' },
  fact: { kind: 'text', cap: 220, max: 180, word: 'the fact explained' },
  big: { kind: 'short', cap: 40, max: 40, word: 'one big figure, like "14.8M+"' },
  label: { kind: 'short', cap: 40, max: 40, word: 'a short label (also replaces the series name)' },
  eyebrow: { kind: 'short', cap: 60, max: 60, word: 'a short line over the headline' },
  note: { kind: 'short', cap: 80, max: 80, word: 'a short note' },
  title: { kind: 'short', cap: 40, max: 40, word: 'a window title' },
  stats: { kind: 'stats', cap: MAX_STATS, max: MAX_STATS, word: 'figures like "3,900+|members"' },
  items: { kind: 'items', cap: 6, max: 4, chars: 48, word: 'short one-line points' },
  image: { kind: 'image', word: 'a photo or a screen capture' },
  artefact: { kind: 'artefact', word: 'a ledger, passbook or register card' },
};
export const FIELD_NAMES = Object.keys(FIELDS);
const TEXTUAL = ['text', 'short'];

// Fixed lists for block options. Sizes are pixels on the feed page.
export const ALIGNS = ['left', 'center', 'right'];
export const VALIGNS = ['top', 'center', 'bottom'];
export const HEADLINE_PX = [56, 64, 68, 70, 76, 84, 88, 96, 104, 112, 120, 136];
export const SUB_PX = [30, 32, 34, 36, 40, 44];
export const FIGURE_PX = [96, 120, 144, 168, 200, 240];
export const STAT_PX = [48, 56, 64, 70, 84];
export const LABEL_PX = [22, 24, 26, 28];
export const LOGO_PX = [24, 28, 32, 34, 40, 48];
export const WEBSITE_PX = [22, 24, 26, 28, 30];
export const PAD_PX = [0, 24, 32, 40, 48, 56, 64];
export const GAP_PX = [0, 12, 16, 24, 28, 32, 40, 48];
export const SLAB_GROUNDS = [...GROUND_NAMES, 'panel', 'card'];
export const LABEL_SOURCES = ['series', 'brand', 'folio'];

const e = (list, def) => ({ t: 'enum', list, def });
const b = (def) => ({ t: 'bool', def });
const ALIGN = e(ALIGNS, 'left');
const VALIGN = e(VALIGNS, 'top');

// Every block type, the field kinds it can show, the field it shows by default and its options (each from a fixed list).
// bleed: photos, slabs and decorations may run over the margins to the page edges their slot touches.
export const BLOCKS = {
  headline: { kinds: TEXTUAL, field: 'headline', child: true, options: { size: e(HEADLINE_PX, 84), style: e(['editorial', 'poster'], 'editorial'), align: ALIGN, valign: VALIGN } },
  sub: { kinds: TEXTUAL, field: 'sub', child: true, options: { size: e(SUB_PX, 32), align: ALIGN, valign: VALIGN } },
  label: { kinds: ['short'], field: null, child: true, options: { style: e(['mono', 'tag', 'plain'], 'mono'), tone: e(['muted', 'accent'], 'muted'), size: e(LABEL_PX, 22), align: ALIGN, valign: VALIGN } },
  figure: { kinds: ['short'], field: 'big', child: true, options: { size: e(FIGURE_PX, 168), style: e(['editorial', 'poster'], 'editorial'), align: ALIGN, valign: VALIGN } },
  stats: { kinds: ['stats'], field: 'stats', child: true, options: { direction: e(['row', 'column'], 'row'), size: e(STAT_PX, 64), rules: b(false), align: ALIGN, valign: VALIGN } },
  list: { kinds: ['items'], field: 'items', child: true, options: { style: e(['checks', 'pills', 'bullets'], 'checks'), align: ALIGN, valign: VALIGN } },
  photo: { kinds: ['image'], field: 'image', options: { frame: e(['none', 'card', 'raised'], 'none') }, bleed: true },
  screen: { kinds: ['image'], field: 'image', options: { device: e(['phone', 'desktop'], 'phone'), fit: e(['contain', 'crop'], 'contain'), glow: b(true), tilt: b(false), framed: b(false), align: e(ALIGNS, 'center'), valign: e(VALIGNS, 'center') } },
  logo: { kinds: [], field: null, child: true, options: { variant: e(['auto', 'full', 'solid', 'mark'], 'auto'), size: e(LOGO_PX, 34), align: ALIGN, valign: VALIGN } },
  website: { kinds: [], field: null, child: true, options: { size: e(WEBSITE_PX, 26), align: ALIGN, valign: VALIGN } },
  slab: { kinds: [], field: null, options: { ground: e(SLAB_GROUNDS, 'panel'), radius: e(['none', 'card', 'slab'], 'none'), shadow: b(false), padding: e(PAD_PX, 48), gap: e(GAP_PX, 24), align: ALIGN, valign: VALIGN }, bleed: true, children: true },
  artefact: { kinds: ['artefact'], field: 'artefact', options: { align: ALIGN, valign: VALIGN } },
  decoration: { kinds: [], field: null, options: { kind: e(['rule', 'panel', 'dots', 'texture', 'glow', 'map'], 'rule') }, bleed: true, under: true },
  spacer: { kinds: [], field: null, options: {} },
};
export const BLOCK_TYPES = Object.keys(BLOCKS);
const BASE_KEYS = ['type', 'slot', 'field'];
const LAYOUT_KEYS = ['id', 'name', 'description', 'ground', 'accent', 'texture', 'fields', 'canvas', 'blocks'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const oneLine = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max && !/[\r\n]/.test(v);
// A value or a key quoted back in a message: short, and without markup characters (messages are plain text, but are shown in
// the web app and given to the AI).
const clip = (s) => String(s).slice(0, 40).replace(/[<>&\u0000-\u001f`]/g, '?');
const show = (v) => clip(JSON.stringify(v) ?? String(v));
const unknownKeys = (o, keys, where, errors) => { for (const k of Object.keys(o)) if (!keys.includes(k)) errors.push(`${where}: "${clip(k)}" is not a known setting (known: ${keys.join(', ')})`); };

// The grid of one size, with every margin resolved.
function gridProblems(g, size, where, errors) {
  if (!isObj(g)) return errors.push(`${where} must be an object like { "columns": 12, "rows": 15, "margin": 70, "gutter": 24 }`);
  unknownKeys(g, ['columns', 'rows', 'margin', 'gutter', 'rowGutter'], where, errors);
  const L = GRID_LIMITS, before = errors.length;
  if (!isInt(g.columns, ...L.columns)) errors.push(`${where}.columns must be a whole number from ${L.columns[0]} to ${L.columns[1]}`);
  if (!isInt(g.rows, ...L.rows)) errors.push(`${where}.rows must be a whole number from ${L.rows[0]} to ${L.rows[1]}`);
  for (const k of ['gutter', 'rowGutter']) if (g[k] !== undefined && !isInt(g[k], ...L.gutter)) errors.push(`${where}.${k} must be a whole number of pixels from ${L.gutter[0]} to ${L.gutter[1]}`);
  const m = marginsOf(g.margin);
  if (!m) errors.push(`${where}.margin must be a whole number of pixels or { "top", "right", "bottom", "left" } (each from ${L.margin[0]} to ${L.margin[1]})`);
  else {
    const min = MIN_MARGINS[size];
    for (const k of EDGES) if (m[k] < min[k]) errors.push(`${where}.margin.${k} is ${m[k]} px; a ${size} page needs at least ${min[k]} px so text stays clear of the edge${size === 'story' ? ' and the story interface' : ''}`);
  }
  if (errors.length > before) return;
  const c = cellOf(g, size);
  if (c.w < L.minCell || c.h < L.minCell) errors.push(`${where}: the cells are ${Math.floor(c.w)} x ${Math.floor(c.h)} px; use fewer columns or rows, smaller margins or a smaller gutter (each cell needs at least ${L.minCell} px)`);
}

function marginsOf(m) {
  const ok = (n) => isInt(n, ...GRID_LIMITS.margin);
  if (ok(m)) return { top: m, right: m, bottom: m, left: m };
  if (!isObj(m) || Object.keys(m).some((k) => !EDGES.includes(k)) || !EDGES.every((k) => ok(m[k]))) return null;
  return { top: m.top, right: m.right, bottom: m.bottom, left: m.left };
}

// The size of one cell of a (checked) grid, in page pixels.
export function cellOf(g, size) {
  const S = SIZES[size], m = marginsOf(g.margin), gx = g.gutter ?? 0, gy = g.rowGutter ?? gx;
  return { w: (S.w - m.left - m.right - (g.columns - 1) * gx) / g.columns, h: (S.h - m.top - m.bottom - (g.rows - 1) * gy) / g.rows, gx, gy, m };
}

// A block's rectangle on the page for one size: the slot's cells, and the page edges it bleeds to.
export function slotRect(layout, block, size) {
  const g = layout.canvas[size], c = cellOf(g, size), s = slotFor(block.slot, size), S = SIZES[size];
  let x = c.m.left + (s.col - 1) * (c.w + c.gx), y = c.m.top + (s.row - 1) * (c.h + c.gy);
  let w = s.width * c.w + (s.width - 1) * c.gx, h = s.height * c.h + (s.height - 1) * c.gy;
  const inner = { x, y, w, h };
  for (const edge of block.bleed ?? []) {
    if (edge === 'top') { h += y; y = 0; }
    if (edge === 'left') { w += x; x = 0; }
    if (edge === 'bottom') h = S.h - y;
    if (edge === 'right') w = S.w - x;
  }
  return { x, y, w, h, inner };
}

const slotFor = (slot, size) => (isObj(slot) && 'col' in slot ? slot : slot?.[size]);

function oneSlotProblems(s, g, where, errors) {
  if (!isObj(s)) return errors.push(`${where} must be { "col": 1, "row": 1, "width": 6, "height": 4 } (in grid cells)`);
  unknownKeys(s, ['col', 'row', 'width', 'height'], where, errors);
  const before = errors.length;
  for (const [k, max] of [['col', g.columns], ['row', g.rows], ['width', g.columns], ['height', g.rows]]) if (!isInt(s[k], 1, max)) errors.push(`${where}.${k} must be a whole number from 1 to ${max}`);
  if (errors.length > before) return;
  if (s.col + s.width - 1 > g.columns) errors.push(`${where}: columns ${s.col} to ${s.col + s.width - 1} run past the grid's ${g.columns} columns`);
  if (s.row + s.height - 1 > g.rows) errors.push(`${where}: rows ${s.row} to ${s.row + s.height - 1} run past the grid's ${g.rows} rows`);
}

function slotProblems(slot, layout, sizes, where, errors) {
  if (isObj(slot) && 'col' in slot) { for (const z of sizes) oneSlotProblems(slot, layout.canvas[z], `${where}.slot`, errors); return; }
  if (!isObj(slot)) return errors.push(`${where}.slot is required: { "col": 1, "row": 1, "width": 6, "height": 4 }, or one per size`);
  for (const k of Object.keys(slot)) if (!sizes.includes(k)) errors.push(`${where}.slot has "${clip(k)}", which is not a size of this layout (${sizes.join(', ')})`);
  for (const z of sizes) {
    if (slot[z] === undefined) errors.push(`${where}.slot has no slot for ${z}`);
    else oneSlotProblems(slot[z], layout.canvas[z], `${where}.slot.${z}`, errors);
  }
}

function optionProblems(block, spec, where, errors) {
  for (const [k, o] of Object.entries(spec.options)) {
    const v = block[k];
    if (v === undefined) continue;
    if (o.t === 'enum' && !o.list.includes(v)) errors.push(`${where}.${k} must be one of ${o.list.join(', ')} (got ${show(v)})`);
    if (o.t === 'bool' && typeof v !== 'boolean') errors.push(`${where}.${k} must be true or false`);
  }
}

// The value of an option with its default filled in.
export const optionOf = (block, k) => block[k] ?? BLOCKS[block.type].options[k]?.def;

// One block (or one child of a slab). Returns the fields it shows.
function blockProblems(blk, layout, sizes, where, errors, { child = false } = {}) {
  if (!isObj(blk)) { errors.push(`${where} must be an object like { "type": "headline", "slot": { ... } }`); return []; }
  const spec = BLOCKS[blk.type];
  if (!spec) { errors.push(`${where}.type must be one of ${BLOCK_TYPES.join(', ')} (got ${show(blk.type)})`); return []; }
  if (child && !spec.child) { errors.push(`${where}: a ${blk.type} cannot go inside a slab (a slab holds ${BLOCK_TYPES.filter((t) => BLOCKS[t].child).join(', ')})`); return []; }
  const keys = [...BASE_KEYS, ...Object.keys(spec.options), ...(spec.bleed ? ['bleed'] : []), ...(spec.children ? ['children'] : []), ...(blk.type === 'label' ? ['text', 'source'] : []), ...(blk.type === 'screen' ? ['titleField'] : [])];
  unknownKeys(blk, keys, where, errors);
  optionProblems(blk, spec, where, errors);
  if (child) {
    if (blk.slot !== undefined) errors.push(`${where}: a block inside a slab has no slot of its own (it flows in the slab)`);
    if (blk.valign !== undefined) errors.push(`${where}: a block inside a slab has no valign (set it on the slab)`);
  } else slotProblems(blk.slot, layout, sizes, where, errors);
  // What it shows: a declared field (by default the block type's own), a fixed text of the layout, or a fixed source.
  const used = [];
  const bind = (name, kinds, label = 'field') => {
    if (typeof name !== 'string' || !FIELDS[name]) return errors.push(`${where}.${label} must be one of ${FIELD_NAMES.filter((f) => kinds.includes(FIELDS[f].kind)).join(', ')} (got ${show(name)})`);
    if (!kinds.includes(FIELDS[name].kind)) return errors.push(`${where}.${label}: a ${blk.type} cannot show "${name}" (it shows ${FIELD_NAMES.filter((f) => kinds.includes(FIELDS[f].kind)).join(', ')})`);
    if (!isObj(layout.fields) || !layout.fields[name]) return errors.push(`${where}.${label}: "${name}" is not in the layout's fields; declare it there first`);
    used.push(name);
  };
  if (blk.type === 'label') {
    const ways = ['field', 'text', 'source'].filter((k) => blk[k] !== undefined);
    if (ways.length !== 1) errors.push(`${where}: a label needs exactly one of field (a declared short text), text (fixed words of the layout) or source (${LABEL_SOURCES.join(', ')})`);
    if (blk.field !== undefined) bind(blk.field, spec.kinds);
    if (blk.text !== undefined && !oneLine(blk.text, 40)) errors.push(`${where}.text must be one line of up to 40 characters`);
    if (blk.source !== undefined && !LABEL_SOURCES.includes(blk.source)) errors.push(`${where}.source must be one of ${LABEL_SOURCES.join(', ')}`);
  } else if (spec.kinds.length) bind(blk.field ?? spec.field, spec.kinds);
  else if (blk.field !== undefined) errors.push(`${where}: a ${blk.type} shows no field (remove field)`);
  if (blk.type === 'screen') {
    if (blk.titleField !== undefined) {
      if (optionOf(blk, 'device') !== 'desktop') errors.push(`${where}.titleField is only used with "device": "desktop"`);
      else bind(blk.titleField, ['short'], 'titleField');
    }
    for (const k of ['tilt', 'framed']) if (blk[k] !== undefined && optionOf(blk, 'device') !== 'desktop') errors.push(`${where}.${k} is only used with "device": "desktop"`);
    if (blk.fit !== undefined && optionOf(blk, 'device') !== 'phone') errors.push(`${where}.fit is only used with "device": "phone"`);
  }
  if (blk.bleed !== undefined) {
    if (!Array.isArray(blk.bleed) || blk.bleed.length > 4 || blk.bleed.some((x) => !EDGES.includes(x)) || new Set(blk.bleed).size !== blk.bleed.length) errors.push(`${where}.bleed must be a list of page edges from ${EDGES.join(', ')}`);
    else if (blk.type === 'photo' && blk.bleed.length && optionOf(blk, 'frame') !== 'none') errors.push(`${where}: a framed photo cannot bleed (use "frame": "none")`);
    else for (const z of sizes) {
      const s = slotFor(blk.slot, z), g = layout.canvas[z];
      if (!isObj(s) || !isInt(s.col, 1, 99) || !isInt(s.width, 1, 99)) continue;
      const touches = { top: s.row === 1, left: s.col === 1, bottom: s.row + s.height - 1 === g.rows, right: s.col + s.width - 1 === g.columns };
      for (const edge of blk.bleed) if (!touches[edge]) errors.push(`${where}.bleed: the slot does not touch the ${edge} edge of the ${z} grid, so it cannot bleed there`);
    }
  }
  if (spec.children) {
    if (blk.children === undefined) blk = { ...blk, children: [] };
    if (!Array.isArray(blk.children) || blk.children.length > MAX_CHILDREN) errors.push(`${where}.children must be a list of up to ${MAX_CHILDREN} blocks`);
    else blk.children.forEach((c, i) => used.push(...blockProblems(c, layout, sizes, `${where}.children[${i}]`, errors, { child: true })));
  }
  return used;
}

const overlaps = (a, b) => a.col < b.col + b.width && b.col < a.col + a.width && a.row < b.row + b.height && b.row < a.row + a.height;
const inside = (a, b) => a.col >= b.col && a.row >= b.row && a.col + a.width <= b.col + b.width && a.row + a.height <= b.row + b.height;

// Every problem with one layout, as plain sentences. Empty when it can be used.
export function validateLayout(l, where = 'layout') {
  const errors = [];
  if (!isObj(l)) return [`${where} must be an object`];
  if (typeof l.id !== 'string' || !LAYOUT_ID.test(l.id)) return [`${where}: id must be lowercase letters, digits and - (up to 40, starting with a letter or digit)`];
  where = `${where} "${l.id}"`;
  unknownKeys(l, LAYOUT_KEYS, where, errors);
  if (!oneLine(l.name, 40)) errors.push(`${where}: name must be one line of up to 40 characters`);
  if (l.description !== undefined && (typeof l.description !== 'string' || l.description.length > 300)) errors.push(`${where}: description must be a text of up to 300 characters`);
  if (l.ground !== undefined && l.ground !== 'series' && !GROUND_NAMES.includes(l.ground)) errors.push(`${where}: ground must be series or one of ${GROUND_NAMES.join(', ')}`);
  if (l.accent !== undefined && l.accent !== 'series' && !ACCENT_STYLES.includes(l.accent)) errors.push(`${where}: accent must be series or one of ${ACCENT_STYLES.join(', ')}`);
  if (l.texture !== undefined && !['none', 'dots', 'lines'].includes(l.texture)) errors.push(`${where}: texture must be none, dots or lines`);
  // fields
  if (!isObj(l.fields) || !Object.keys(l.fields).length) errors.push(`${where}: fields must name at least one field the layout shows, like { "headline": { "required": true } }`);
  else for (const [name, f] of Object.entries(l.fields)) {
    const w = `${where}: fields.${clip(name)}`, F = FIELDS[name];
    if (!F) { errors.push(`${w} is not a known field (known: ${FIELD_NAMES.join(', ')})`); continue; }
    if (!isObj(f)) { errors.push(`${w} must be an object like { "required": true }`); continue; }
    const keys = ['required', ...(TEXTUAL.includes(F.kind) ? ['max'] : []), ...(['stats', 'items'].includes(F.kind) ? ['min', 'max'] : []), ...(F.kind === 'artefact' ? ['types'] : [])];
    unknownKeys(f, keys, w, errors);
    if (f.required !== undefined && typeof f.required !== 'boolean') errors.push(`${w}.required must be true or false`);
    if (TEXTUAL.includes(F.kind) && f.max !== undefined && !isInt(f.max, 1, F.cap)) errors.push(`${w}.max must be a whole number of characters from 1 to ${F.cap}`);
    if (['stats', 'items'].includes(F.kind)) {
      if (f.max !== undefined && !isInt(f.max, 1, F.cap)) errors.push(`${w}.max must be a whole number from 1 to ${F.cap}`);
      if (f.min !== undefined && !isInt(f.min, 0, F.cap)) errors.push(`${w}.min must be a whole number from 0 to ${F.cap}`);
      if (isInt(f.min, 0, F.cap) && isInt(f.max ?? F.max, 1, F.cap) && f.min > (f.max ?? F.max)) errors.push(`${w}: min is more than max`);
    }
    if (F.kind === 'artefact' && f.types !== undefined && (!Array.isArray(f.types) || !f.types.length || f.types.some((t) => !ARTEFACT_TYPES.includes(t)))) errors.push(`${w}.types must be a list from ${ARTEFACT_TYPES.join(', ')}`);
  }
  // canvas
  if (!isObj(l.canvas) || !Object.keys(l.canvas).length) { errors.push(`${where}: canvas must have a grid for at least one size (${SIZE_NAMES.join(', ')})`); return errors; }
  const before = errors.length;
  for (const [size, g] of Object.entries(l.canvas)) {
    if (!SIZE_NAMES.includes(size)) errors.push(`${where}: canvas has an unknown size "${clip(size)}" (sizes: ${SIZE_NAMES.join(', ')})`);
    else gridProblems(g, size, `${where}: canvas.${size}`, errors);
  }
  if (errors.length > before) return errors;
  const sizes = SIZE_NAMES.filter((z) => l.canvas[z]);
  // blocks
  if (!Array.isArray(l.blocks) || !l.blocks.length || l.blocks.length > MAX_BLOCKS) { errors.push(`${where}: blocks must be a list of 1 to ${MAX_BLOCKS} blocks`); return errors; }
  const used = [];
  l.blocks.forEach((blk, i) => used.push(...blockProblems(blk, l, sizes, `${where}: blocks[${i}]`, errors)));
  if (errors.length) return errors;
  const twice = used.filter((f, i) => used.indexOf(f) !== i);
  for (const f of new Set(twice)) errors.push(`${where}: "${f}" is shown by more than one block; show each field once`);
  if (isObj(l.fields)) for (const f of Object.keys(l.fields)) if (FIELDS[f] && !used.includes(f)) errors.push(`${where}: fields.${f} is declared but no block shows it`);
  const shows = (t) => l.blocks.some((x) => x.type === t || (x.children ?? []).some((c) => c.type === t));
  if (!['headline', 'figure', 'sub'].some(shows) && !l.blocks.some((x) => x.type === 'label' || (x.children ?? []).some((c) => c.type === 'label'))) errors.push(`${where}: a layout needs at least one block of text (a headline, figure, sub line or label)`);
  // Blocks may not lie on each other (text never runs over a picture or another text); decorations lie under everything.
  for (const z of sizes) {
    const placed = l.blocks.map((x, i) => ({ i, s: slotFor(x.slot, z), under: BLOCKS[x.type].under })).filter((p) => !p.under);
    for (let a = 0; a < placed.length; a++) for (let c = a + 1; c < placed.length; c++) {
      if (overlaps(placed[a].s, placed[c].s)) errors.push(`${where}: blocks[${placed[a].i}] (${l.blocks[placed[a].i].type}) and blocks[${placed[c].i}] (${l.blocks[placed[c].i].type}) overlap on the ${z} grid; give each its own cells (put text on a colour panel with a slab and its children)`);
    }
    // A block on the tint panel lies wholly on it or wholly off it, never across its edge.
    l.blocks.forEach((p, i) => {
      if (p.type !== 'decoration' || optionOf(p, 'kind') !== 'panel') return;
      const ps = slotFor(p.slot, z);
      placed.forEach((q) => { if (overlaps(q.s, ps) && !inside(q.s, ps)) errors.push(`${where}: blocks[${q.i}] (${l.blocks[q.i].type}) lies across the edge of the panel (blocks[${i}]) on the ${z} grid; put it wholly on the panel or wholly off it`); });
    });
  }
  return errors;
}

// A brand's list of layouts (brand.json "layouts"): each valid, ids unique.
export function validateLayouts(list, where = 'brand.json: layouts') {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > MAX_LAYOUTS) return [`${where} must be a list of up to ${MAX_LAYOUTS} layouts`];
  const errors = list.flatMap((l, i) => validateLayout(l, `${where}[${i}]`));
  const ids = list.map((l) => l?.id).filter((id) => typeof id === 'string');
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errors.push(`${where}: the id "${id}" is used by more than one layout`);
  return errors;
}

// The brand file's layouts as written, without reading fonts or images (used to validate specs and batches). Each is checked
// where it is used.
export function loadLayouts({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  try { const l = JSON.parse(fs.readFileSync(file, 'utf8')).layouts; return Array.isArray(l) ? l : []; } catch { return []; }
}

// The layout a design names, checked. Throws an Error with a plain message when it is missing or not valid.
export function findLayout(id, layouts) {
  const list = Array.isArray(layouts) ? layouts : [];
  const l = list.find((x) => isObj(x) && x.id === id);
  if (!l) throw new Error(`layout "${clip(id)}" is not one of the brand's layouts (${list.filter(isObj).map((x) => x.id).filter((x) => typeof x === 'string').join(', ') || 'it has none'})`);
  const problems = validateLayout(l);
  if (problems.length) throw new Error(`the brand's layout "${l.id}" is not valid: ${problems.join('; ')}`);
  return l;
}

export const layoutSizes = (l) => SIZE_NAMES.filter((z) => l.canvas?.[z]);
export const layoutHasImage = (l) => !!l.fields?.image;
// Whether a layout shows a phone (the renderer then insists on a pre-framed capture).
export const layoutUsesPhone = (l) => (l.blocks ?? []).some((x) => x.type === 'screen' && optionOf(x, 'device') === 'phone');

// The keys a design block for a layout may have besides its fields: the page frame, as for the built-in templates.
const FRAME_KEYS = ['template', 'layout', 'sizes', 'name', 'networkSizes', 'series', 'label', 'ground', 'accent'];

function fieldProblems(d, name, f, where, errors) {
  const F = FIELDS[name], v = d[name], required = f.required === true || (['stats', 'items'].includes(F.kind) && (f.min ?? 0) > 0);
  if (v === undefined) { if (required) errors.push(`${where}: ${name} is required by this layout`); return; }
  if (F.kind === 'text') {
    const max = f.max ?? F.max;
    if (!isStr(v)) errors.push(`${where}: ${name} must be a non-empty text`);
    else if (v.length > max) errors.push(`${where}: ${name} is ${v.length} characters; this layout takes up to ${max}`);
  } else if (F.kind === 'short') {
    const max = f.max ?? F.max;
    if (typeof v !== 'string' || !v.trim()) errors.push(`${where}: ${name} must be a non-empty text`);
    else if (/[\r\n]/.test(v)) errors.push(`${where}: ${name} must be one line`);
    else if (v.length > max) errors.push(`${where}: ${name} is ${v.length} characters; this layout takes up to ${max}`);
  } else if (F.kind === 'stats') {
    const min = f.min ?? 1, max = f.max ?? F.max;
    if (!Array.isArray(v) || v.length < Math.max(1, min) || v.length > max) return errors.push(`${where}: stats needs ${Math.max(1, min)} to ${max} entries like "14.8M+|processed"`);
    v.forEach((s, i) => {
      const p = parseStat(s);
      if (!p) errors.push(`${where}: stats[${i}] must look like "number|label" or ["number", "label"]`);
      else if (p[0].length > 40 || p[1].length > 60) errors.push(`${where}: stats[${i}] is too long (up to 40 characters for the number and 60 for the label)`);
    });
  } else if (F.kind === 'items') {
    const min = f.min ?? 1, max = f.max ?? F.max;
    if (!Array.isArray(v) || v.length < Math.max(1, min) || v.length > max) return errors.push(`${where}: items must be a list of ${Math.max(1, min)} to ${max} short texts`);
    v.forEach((t, i) => {
      if (typeof t !== 'string' || !t.trim()) errors.push(`${where}: items[${i}] must be a non-empty text`);
      else if (/[\r\n]/.test(t)) errors.push(`${where}: items[${i}] must be one line`);
      else if (t.length > F.chars) errors.push(`${where}: items[${i}] is ${t.length} characters; the most is ${F.chars}`);
    });
  } else if (F.kind === 'image') {
    if (!isStr(v)) errors.push(`${where}: image must be a file path`);
    else if (!IMAGE_EXT.includes(path.extname(v).toLowerCase())) errors.push(`${where}: image "${clip(v)}" must be ${IMAGE_EXT.join(' ')}`);
  } else if (F.kind === 'artefact') {
    if (!isObj(v)) return errors.push(`${where}: artefact must be an object like { "type": "ledger", ... }`);
    if (f.types && !f.types.includes(v.type)) return errors.push(`${where}: this layout takes an artefact of type ${f.types.join(' or ')}`);
    // The built-in templates' own artefact checks, run through their public validator (a text page with that artefact).
    errors.push(...validateDesign({ template: 'text', headline: 'x', artefact: v }, where));
  }
}

// Every problem with a design block { template: "layout", layout: "<id>", ...fields }. opts.layouts: the brand's layouts;
// opts.series: its series keys (without them only the key's shape is checked).
export function layoutDesignProblems(d, where = 'design', opts = {}) {
  if (!isObj(d)) return [`${where}: must be an object`];
  if (d.template !== 'layout') return [`${where}: template must be "layout"`];
  if (typeof d.layout !== 'string' || !LAYOUT_ID.test(d.layout)) return [`${where}: layout must name one of the brand's layouts (lowercase letters, digits and -)`];
  let l;
  try { l = findLayout(d.layout, opts.layouts); } catch (err) { return [`${where}: ${err.message}`]; }
  const errors = [], sizes = layoutSizes(l);
  const asked = parseSizes(d.sizes, { errors, where });
  const off = asked.filter((z) => SIZE_NAMES.includes(z) && !sizes.includes(z));
  if (off.length) errors.push(`${where}: layout "${l.id}" is drawn for ${sizes.join(', ')} only (not ${off.join(', ')})`);
  if (d.sizes === undefined && !sizes.includes('feed')) errors.push(`${where}: layout "${l.id}" has no feed size; set sizes to ${sizes.join(', ')}`);
  if (d.name !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(d.name)) errors.push(`${where}: name must use lowercase letters, digits, . _ - only`);
  if (d.networkSizes !== undefined) {
    if (!isObj(d.networkSizes)) errors.push(`${where}: networkSizes must look like { "linkedin": "wide" }`);
    else for (const [n, s] of Object.entries(d.networkSizes)) {
      if (!NETWORKS.includes(n)) errors.push(`${where}: networkSizes has an unknown network "${clip(n)}"`);
      else if (!asked.includes(s)) errors.push(`${where}: networkSizes.${n} is "${show(s)}", which is not in sizes`);
    }
  }
  if (d.series !== undefined) {
    if (typeof d.series !== 'string' || !SERIES_KEY.test(d.series)) errors.push(`${where}: series must be a key from brand.json (lowercase letters, digits and -)`);
    else if (opts.series && !opts.series.includes(d.series)) errors.push(`${where}: series "${d.series}" is not in brand.json (known: ${opts.series.join(', ') || 'none'})`);
  }
  if (d.ground !== undefined && !GROUND_NAMES.includes(d.ground)) errors.push(`${where}: ground must be one of ${GROUND_NAMES.join(', ')}`);
  if (d.accent !== undefined && !ACCENT_STYLES.includes(d.accent)) errors.push(`${where}: accent must be one of ${ACCENT_STYLES.join(', ')}`);
  const own = Object.keys(l.fields);
  const extra = layoutHasImage(l) ? ['focal', 'zoom'] : [];
  if (d.focal !== undefined && layoutHasImage(l) && (isObj(d.focal) && !('x' in d.focal) ? true : focalToCss(d.focal) === null)) errors.push(`${where}: focal must look like "60% 40%", "center", "left top" or { "x": 0.6, "y": 0.4 }`);
  if (d.zoom !== undefined && layoutHasImage(l) && !(typeof d.zoom === 'number' && Number.isFinite(d.zoom) && d.zoom >= 1 && d.zoom <= 3)) errors.push(`${where}: zoom must be a number from 1 to 3`);
  for (const k of Object.keys(d)) {
    if (!FRAME_KEYS.includes(k) && !own.includes(k) && !extra.includes(k)) errors.push(`${where}: ${clip(k)} is not used by layout "${l.id}" (it takes ${[...own, ...extra].join(', ')})`);
  }
  // The label field doubles as the series name override; it is checked like any other short field when declared.
  if (d.label !== undefined && !own.includes('label') && !oneLine(d.label, 40)) errors.push(`${where}: label must be one line of up to 40 characters`);
  for (const [name, f] of Object.entries(l.fields)) fieldProblems(d, name, f, where, errors);
  return errors;
}

// Fills defaults and parses what needs parsing (sizes, stats). Call layoutDesignProblems first.
export function normaliseLayoutDesign(d, layouts) {
  const l = findLayout(d.layout, layouts), sizes = layoutSizes(l);
  const spec = { ...d, sizes: d.sizes === undefined ? (sizes.includes('feed') ? ['feed'] : [sizes[0]]) : parseSizes(d.sizes) };
  if (d.stats) spec.stats = d.stats.map(parseStat);
  return spec;
}

// Sample words for each field, for previews of a layout before any post uses it.
export const SAMPLE = {
  headline: 'Every saving, *on record.*', sub: 'One clear line that says what the post is about, in the brand\'s own voice.', line: 'saved by members this year',
  quote: 'We finally see where every euro goes.', myth: 'Group savings are hard to keep track of.', factLead: 'Every payment is *on the record.*', fact: 'Each member sees the same ledger, updated the moment money moves.',
  big: '14.8M+', label: 'Explainer', eyebrow: 'New this month', note: 'Figures from the last twelve months', title: 'Passbooks',
  stats: [['3,900+', 'members'], ['400+', 'groups']], items: ['Read-only by design', 'Two-person approval', 'Every change logged'],
  image: 'design/assets/demo/object-jar.jpg', artefact: { type: 'register', title: 'Where it went', rows: [['Rent', '400.00'], ['Food', '120.50'], ['Savings', '80.00']], mark: 2 },
};

// A design block that shows every field of a layout with sample words (lists cut to the layout's maximum, texts to its length).
export function sampleDesign(l, { size } = {}) {
  const d = { template: 'layout', layout: l.id };
  for (const [name, f] of Object.entries(l.fields ?? {})) {
    const F = FIELDS[name];
    if (!F) continue;
    let v = structuredClone(SAMPLE[name]);
    if (TEXTUAL.includes(F.kind)) v = v.length > (f.max ?? F.max) ? v.slice(0, f.max ?? F.max).replace(/\*/g, '').trim() : v;
    if (F.kind === 'stats' || F.kind === 'items') v = v.slice(0, f.max ?? F.max);
    if (name === 'image' && l.blocks.some((x) => x.type === 'screen' && optionOf(x, 'device') === 'desktop')) v = 'design/assets/demo/screen-desk.png';
    if (F.kind === 'artefact' && f.types && !f.types.includes('register')) v = f.types[0] === 'passbook' ? { type: 'passbook', days: 31, ticked: 17, today: 18 } : { type: 'ledger', columns: [{ label: 'Day' }, { label: 'Paid', align: 'end' }], rows: [['01', '10.00'], ['02', '12.50'], ['03', '10.00']], mark: [{ row: 1, col: 1 }] };
    d[name] = v;
  }
  if (size) d.sizes = [size];
  else if (!layoutSizes(l).includes('feed')) d.sizes = [layoutSizes(l)[0]];
  return d;
}

// What the layout editor and the AI are told: every block type, its options and the fields, as plain data.
export function layoutCatalogue() {
  return {
    sizes: Object.fromEntries(SIZE_NAMES.map((z) => [z, { w: SIZES[z].w, h: SIZES[z].h, minMargins: MIN_MARGINS[z] }])),
    grid: GRID_LIMITS,
    grounds: GROUND_NAMES, darkGrounds: DARK_GROUNDS, accents: ACCENT_STYLES, textures: ['none', 'dots', 'lines'],
    fields: Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, { ...f }])),
    blocks: Object.fromEntries(Object.entries(BLOCKS).map(([k, s]) => [k, {
      kinds: s.kinds, field: s.field, child: !!s.child, bleed: !!s.bleed, children: !!s.children, under: !!s.under,
      options: Object.fromEntries(Object.entries(s.options).map(([o, v]) => [o, v.t === 'enum' ? { type: 'enum', values: v.list, default: v.def } : { type: 'bool', default: v.def }])),
    }])),
    labelSources: LABEL_SOURCES,
    limits: { layouts: MAX_LAYOUTS, blocks: MAX_BLOCKS, children: MAX_CHILDREN },
  };
}
