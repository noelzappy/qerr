// node --test   (layouts as data: the layout validator, design blocks for a layout, hostile values, the page it makes; two real
// renders need Google Chrome)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './lib/core.mjs';
import { loadBrand, loadSeries, validateBrand } from './lib/design/brand.mjs';
import { validateBatchDesigns } from './lib/design/batch.mjs';
import { explainProblems, findLayoutProblems } from './lib/design/checks.mjs';
import { findChrome } from './lib/design/chrome.mjs';
import { DesignError } from './lib/design/errors.mjs';
import {
  BLOCKS, BLOCK_TYPES, FIELDS, MIN_MARGINS, cellOf, findLayout, layoutCatalogue, layoutDesignProblems, layoutUsesPhone, loadLayouts,
  normaliseLayoutDesign, sampleDesign, slotRect, validateLayout, validateLayouts,
} from './lib/design/layout.mjs';
import { frameOf, layoutFit, renderLayout } from './lib/design/layout-render.mjs';
import { STARTER_LAYOUTS, starterCopy } from './lib/design/layout-starters.mjs';
import { buildPage } from './lib/design/page.mjs';
import { SIZES, SIZE_NAMES } from './lib/design/sizes.mjs';
import { designBlockProblems, renderDesignBlock } from './lib/design-render.mjs';

const brand = loadBrand();
const SERIES = loadSeries();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const at = (col, row, width, height) => ({ col, row, width, height });
const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };

// A small valid layout to change one thing at a time.
const base = () => ({
  id: 'demo', name: 'Demo', description: 'A test layout.',
  fields: { headline: { required: true, max: 80 }, sub: { max: 120 }, image: { required: true } },
  canvas: { feed: structuredClone(GRID) },
  blocks: [
    { type: 'photo', slot: at(1, 1, 12, 12), bleed: ['top', 'left', 'right'] },
    { type: 'headline', slot: at(1, 13, 12, 5), size: 84 },
    { type: 'sub', slot: at(1, 18, 12, 4) },
    { type: 'logo', slot: at(1, 24, 6, 1), valign: 'bottom' },
    { type: 'website', slot: at(7, 24, 6, 1), align: 'right', valign: 'bottom' },
  ],
});
const mod = (f) => { const l = base(); f(l); return validateLayout(l); };
const design = (o = {}) => ({ template: 'layout', layout: 'demo', headline: 'Hello', image: 'design/assets/demo/object-jar.jpg', ...o });
const dp = (d, layouts = [base()]) => layoutDesignProblems(d, 'design', { layouts, series: SERIES });

test('a valid layout passes, and so does every starting point', () => {
  assert.deepEqual(validateLayout(base()), []);
  assert.deepEqual(validateLayouts(STARTER_LAYOUTS), []);
  for (const l of STARTER_LAYOUTS) assert.deepEqual(layoutDesignProblems(sampleDesign(l), 'd', { layouts: STARTER_LAYOUTS, series: SERIES }), [], l.id);
  assert.equal(starterCopy('text', { newId: 'mine', name: 'Mine' }).id, 'mine');
  assert.equal(starterCopy('nope'), null);
  assert.notEqual(starterCopy('text').blocks, STARTER_LAYOUTS[0].blocks, 'a copy, not the original');
  // every block type has at least one starter or test using it, and the catalogue lists exactly the block types and fields
  const cat = layoutCatalogue();
  assert.deepEqual(Object.keys(cat.blocks), BLOCK_TYPES);
  assert.deepEqual(Object.keys(cat.fields), Object.keys(FIELDS));
  assert.deepEqual(Object.keys(cat.sizes), SIZE_NAMES);
  assert.deepEqual(cat.blocks.headline.options.align, { type: 'enum', values: ['left', 'center', 'right'], default: 'left' });
});

test('the layout itself: id, name, description, ground, accent, texture and unknown settings', () => {
  assert.match(validateLayout(null)[0], /must be an object/);
  assert.match(validateLayout([])[0], /must be an object/);
  for (const id of ['', 'Has Caps', '-lead', 'a'.repeat(41), 'x"><script>', 'a b', 5, undefined, '../x']) assert.ok(has(mod((l) => { l.id = id; }), 'id must be lowercase'), String(id));
  assert.ok(has(mod((l) => { delete l.name; }), 'name must be one line'));
  assert.ok(has(mod((l) => { l.name = 'a\nb'; }), 'name must be one line'));
  assert.ok(has(mod((l) => { l.name = 'x'.repeat(41); }), 'name must be one line'));
  assert.ok(has(mod((l) => { l.description = 'x'.repeat(301); }), 'description must be'));
  assert.ok(has(mod((l) => { l.description = 5; }), 'description must be'));
  assert.ok(has(mod((l) => { l.ground = 'red'; }), 'ground must be series or one of'));
  assert.ok(has(mod((l) => { l.ground = 'var(--x)'; }), 'ground must be'));
  assert.deepEqual(mod((l) => { l.ground = 'deep'; l.accent = 'colour'; l.texture = 'lines'; }), []);
  assert.deepEqual(mod((l) => { l.ground = 'series'; l.accent = 'series'; l.texture = 'none'; }), []);
  assert.deepEqual(mod((l) => { l.ground = 'mint'; l.accent = 'none'; l.texture = 'auto'; }), [], 'an older ground name is read as the neutral one');
  assert.deepEqual(mod((l) => { l.texture = 'grid'; }), []);
  assert.ok(has(mod((l) => { l.accent = 'bold'; }), 'accent must be'));
  assert.ok(has(mod((l) => { l.texture = 'stripes'; }), 'texture must be'));
  assert.ok(has(mod((l) => { l.css = 'body{}'; }), '"css" is not a known setting'));
  assert.ok(has(mod((l) => { l.html = '<b>'; }), '"html" is not a known setting'));
});

test('fields: known names only, lengths and counts in bounds, each shown by one block', () => {
  assert.ok(has(mod((l) => { l.fields = {}; }), 'fields must name at least one field'));
  assert.ok(has(mod((l) => { l.fields = []; }), 'fields must name at least one field'));
  assert.ok(has(mod((l) => { l.fields.colour = {}; }), 'fields.colour is not a known field'));
  assert.ok(has(mod((l) => { l.fields.headline = true; }), 'fields.headline must be an object'));
  assert.ok(has(mod((l) => { l.fields.headline.required = 'yes'; }), 'required must be true or false'));
  assert.ok(has(mod((l) => { l.fields.headline.max = 221; }), 'max must be a whole number of characters from 1 to 220'));
  assert.ok(has(mod((l) => { l.fields.headline.max = 0; }), 'max must be'));
  assert.ok(has(mod((l) => { l.fields.headline.max = 1.5; }), 'max must be'));
  assert.ok(has(mod((l) => { l.fields.headline.min = 1; }), '"min" is not a known setting'));
  assert.ok(has(mod((l) => { l.fields.image.max = 3; }), '"max" is not a known setting'));
  const stats = (f) => mod((l) => { l.fields.stats = f; l.blocks[2] = { type: 'stats', slot: at(1, 18, 12, 4) }; delete l.fields.sub; });
  assert.deepEqual(stats({ min: 1, max: 3 }), []);
  assert.ok(has(stats({ max: 4 }), 'max must be a whole number from 1 to 3'));
  assert.ok(has(stats({ min: 3, max: 2 }), 'min is more than max'));
  assert.ok(has(stats({ min: -1 }), 'min must be'));
  const art = (f) => mod((l) => { l.fields.artefact = f; l.blocks[2] = { type: 'artefact', slot: at(1, 18, 12, 4) }; delete l.fields.sub; });
  assert.deepEqual(art({ types: ['ledger', 'register'] }), []);
  assert.ok(has(art({ types: ['chart'] }), 'types must be a list from'));
  assert.ok(has(art({ types: [] }), 'types must be a list from'));
  // a declared field nobody shows, a block showing an undeclared field, the wrong kind, a field shown twice
  assert.ok(has(mod((l) => { l.fields.quote = {}; }), 'fields.quote is declared but no block shows it'));
  assert.ok(has(mod((l) => { l.blocks[2].field = 'quote'; }), '"quote" is not in the layout\'s fields'));
  assert.ok(has(mod((l) => { l.blocks[2].field = 'image'; }), 'a sub cannot show "image"'));
  assert.ok(has(mod((l) => { l.blocks[2].field = 'nope'; }), 'field must be one of'));
  assert.ok(has(mod((l) => { l.blocks[2].field = 'headline'; delete l.fields.sub; }), '"headline" is shown by more than one block'));
  assert.ok(has(mod((l) => { l.blocks[3].field = 'headline'; }), 'a logo shows no field'));
});

test('canvas and grid: known sizes, bounded numbers, the minimum margins, usable cells', () => {
  assert.ok(has(mod((l) => { l.canvas = {}; }), 'canvas must have a grid'));
  assert.ok(has(mod((l) => { l.canvas.poster = GRID; }), 'unknown size "poster"'));
  const g = (f) => mod((l) => { f(l.canvas.feed); });
  for (const [k, v] of [['columns', 0], ['columns', 25], ['columns', 2.5], ['columns', '12'], ['rows', 0], ['rows', 37], ['rows', null]]) assert.ok(has(g((x) => { x[k] = v; }), `canvas.feed.${k} must be a whole number`), `${k}=${v}`);
  assert.ok(has(g((x) => { x.gutter = 81; }), 'gutter must be a whole number of pixels from 0 to 80'));
  assert.ok(has(g((x) => { x.rowGutter = -1; }), 'rowGutter must be'));
  assert.ok(has(g((x) => { x.margin = '70px'; }), 'margin must be a whole number of pixels'));
  assert.ok(has(g((x) => { x.margin = { top: 56, right: 70, bottom: 56 }; }), 'margin must be'));
  assert.ok(has(g((x) => { x.margin = { top: 56, right: 70, bottom: 56, left: 70, centre: 1 }; }), 'margin must be'));
  assert.ok(has(g((x) => { x.margin = 601; }), 'margin must be'));
  assert.ok(has(g((x) => { x.margin.left = 10; }), 'margin.left is 10 px; a feed page needs at least 48 px'));
  assert.ok(has(g((x) => { x.padding = 4; }), '"padding" is not a known setting'));
  assert.ok(has(g((x) => { x.columns = 24; x.gutter = 80; }), 'the cells are'));
  // a story keeps clear of the interface at the top and the bottom
  const story = mod((l) => { l.canvas.story = { ...GRID, margin: { top: 100, right: 60, bottom: 100, left: 60 } }; });
  assert.ok(has(story, 'margin.top is 100 px; a story page needs at least 250 px') && has(story, 'story interface'));
  assert.deepEqual(mod((l) => { l.canvas.story = { ...GRID, margin: { ...MIN_MARGINS.story } }; }), []);
  assert.deepEqual(mod((l) => { l.canvas.feed.margin = 70; }), []);
});

test('blocks: known types and options from fixed lists, slots inside the grid, no overlaps', () => {
  assert.ok(has(mod((l) => { l.blocks = []; }), 'blocks must be a list of 1 to 24'));
  assert.ok(has(mod((l) => { l.blocks = Array.from({ length: 25 }, () => ({ type: 'spacer', slot: at(1, 1, 1, 1) })); }), 'blocks must be a list of 1 to 24'));
  assert.ok(has(mod((l) => { l.blocks.push('headline'); }), 'blocks[5] must be an object'));
  assert.ok(has(mod((l) => { l.blocks[1].type = 'html'; }), 'type must be one of headline, sub'));
  assert.ok(has(mod((l) => { l.blocks[1].type = 'iframe'; }), 'got "iframe"'));
  assert.ok(has(mod((l) => { l.blocks[1].style = 'color:red'; }), 'style must be one of editorial, poster'));
  assert.ok(has(mod((l) => { l.blocks[1].size = 85; }), 'size must be one of 56, 64'));
  assert.ok(has(mod((l) => { l.blocks[1].size = '84'; }), 'size must be one of'));
  assert.ok(has(mod((l) => { l.blocks[1].align = 'justify'; }), 'align must be one of left, center, right'));
  assert.ok(has(mod((l) => { l.blocks[1].valign = 'baseline'; }), 'valign must be one of'));
  assert.ok(has(mod((l) => { l.blocks[1].onclick = 'x'; }), '"onclick" is not a known setting'));
  assert.ok(has(mod((l) => { l.blocks[1].color = '#f00'; }), '"color" is not a known setting'));
  assert.ok(has(mod((l) => { l.blocks[1].x = 10; }), '"x" is not a known setting'));
  assert.ok(has(mod((l) => { l.blocks[3].variant = 'giant'; }), 'variant must be one of auto, full, solid, pill, mark'));
  assert.ok(has(mod((l) => { l.blocks[0].frame = 'polaroid'; }), 'frame must be one of'));
  assert.ok(has(mod((l) => { l.blocks.push({ type: 'decoration', kind: 'video', slot: at(1, 1, 1, 1) }); }), 'kind must be one of rule, panel'));
  assert.ok(has(mod((l) => { l.blocks.push({ type: 'stats', slot: at(1, 22, 12, 2), rules: 'yes' }); l.fields.stats = {}; }), 'rules must be true or false'));
  // slots
  assert.ok(has(mod((l) => { delete l.blocks[1].slot; }), 'slot is required'));
  assert.ok(has(mod((l) => { l.blocks[1].slot = '1 / 1 / 2 / 2'; }), 'slot is required'));
  assert.ok(has(mod((l) => { l.blocks[1].slot = at(0, 13, 12, 5); }), 'slot.col must be a whole number from 1 to 12'));
  assert.ok(has(mod((l) => { l.blocks[1].slot = at(2, 13, 12, 5); }), 'columns 2 to 13 run past the grid'));
  assert.ok(has(mod((l) => { l.blocks[1].slot = at(1, 22, 12, 5); }), 'rows 22 to 26 run past the grid'));
  assert.ok(has(mod((l) => { l.blocks[1].slot = { ...at(1, 13, 12, 5), z: 9 }; }), '"z" is not a known setting'));
  assert.ok(has(mod((l) => { l.blocks[1].slot = at(1, 13, 12.5, 5); }), 'slot.width must be'));
  // per-size slots: every size of the layout, and no other
  const two = (slot) => mod((l) => { l.canvas.square = { ...GRID, rows: 18 }; for (const b of l.blocks) b.slot = { feed: b.slot, square: { ...b.slot, row: Math.min(b.slot.row, 18 - b.slot.height + 1) } }; slot(l); });
  assert.ok(has(two((l) => { delete l.blocks[1].slot.square; }), 'slot has no slot for square'));
  assert.ok(has(two((l) => { l.blocks[1].slot.story = at(1, 1, 1, 1); }), 'slot has "story", which is not a size of this layout'));
  // overlaps (decorations may lie under anything)
  assert.ok(has(mod((l) => { l.blocks[2].slot = at(1, 15, 12, 4); }), 'blocks[1] (headline) and blocks[2] (sub) overlap on the feed grid'));
  assert.ok(has(mod((l) => { l.blocks[1].slot = at(1, 10, 12, 5); }), 'blocks[0] (photo) and blocks[1] (headline) overlap'));
  assert.deepEqual(mod((l) => { l.blocks.push({ type: 'decoration', kind: 'dots', slot: at(1, 1, 12, 24) }); }), []);
  // the tint panel: a block lies wholly on it or wholly off it
  assert.deepEqual(mod((l) => { l.blocks.push({ type: 'decoration', kind: 'panel', slot: at(1, 18, 12, 7), bleed: ['left', 'right', 'bottom'] }); }), []);
  assert.ok(has(mod((l) => { l.blocks.push({ type: 'decoration', kind: 'panel', slot: at(1, 20, 12, 5) }); }), 'blocks[2] (sub) lies across the edge of the panel'));
  // at least one text
  assert.ok(has(validateLayout({ id: 'x', name: 'X', fields: { image: {} }, canvas: { feed: GRID }, blocks: [{ type: 'photo', slot: at(1, 1, 12, 24) }] }), 'needs at least one block of text'));
});

test('bleed: only photos, slabs and decorations, only to the page edges their slot touches', () => {
  assert.deepEqual(mod((l) => { l.blocks[0].bleed = ['top', 'left', 'right']; }), []);
  assert.ok(has(mod((l) => { l.blocks[0].bleed = ['bottom']; }), 'does not touch the bottom edge of the feed grid'));
  assert.ok(has(mod((l) => { l.blocks[0].bleed = ['top', 'top']; }), 'bleed must be a list of page edges'));
  assert.ok(has(mod((l) => { l.blocks[0].bleed = 'all'; }), 'bleed must be a list'));
  assert.ok(has(mod((l) => { l.blocks[0].bleed = ['outside']; }), 'bleed must be a list'));
  assert.ok(has(mod((l) => { l.blocks[0].frame = 'card'; }), 'a framed photo cannot bleed'));
  assert.ok(has(mod((l) => { l.blocks[1].bleed = ['left']; }), '"bleed" is not a known setting'));
  assert.ok(has(mod((l) => { l.blocks[3].bleed = ['bottom']; }), '"bleed" is not a known setting'));
});

// ---- the format as the built-in templates need it: pixel rectangles, conditions, ground cases, page kinds, chrome ----

// A poster page and an editorial page in the shape of the built-in number and text templates, to change one thing at a time.
const poster = () => ({
  id: 'p', name: 'Poster', page: 'poster', ground: [{ when: { present: 'image' }, ground: 'photo' }, { ground: 'cool' }],
  fields: { big: { required: true }, line: {}, stats: { min: 0 }, image: {} },
  canvas: { feed: { columns: 12, rows: 15, margin: 80, gutter: 40 } },
  blocks: [
    { type: 'photo', px: { x: 0, y: 616, w: 1080, h: 734 }, photoTop: true },
    { type: 'bar' },
    { type: 'figure', field: 'big', size: 168, px: { x: 80, y: 140, w: 920, h: 180 } },
    { type: 'sub', field: 'line', px: { x: 80, y: 336, w: 900, h: 92 } },
    { type: 'stats', px: { x: 80, y: 448, w: 920, h: 150 } },
  ],
});
const editorial = () => ({
  id: 'e', name: 'Editorial', page: 'editorial',
  fields: { headline: { required: true }, sub: {} },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'decoration', kind: 'panel', px: { x: 0, y: 990, w: 1080, h: 360 } },
    { type: 'runhead' },
    { type: 'headline', size: 112, specSize: true, px: { x: 70, y: 154, w: 940, h: 800 } },
    { type: 'sub', px: { x: 70, y: 1036, w: 620, h: 220 } },
    { type: 'footer' },
  ],
});
const modP = (f) => { const l = poster(); f(l); return validateLayout(l); };
const modE = (f) => { const l = editorial(); f(l); return validateLayout(l); };

test('px: a block may sit at a pixel rectangle instead of grid cells, whole numbers inside the page', () => {
  assert.deepEqual(mod((l) => { l.blocks[1] = { type: 'headline', px: { x: 70, y: 680, w: 940, h: 240 } }; }), []);
  assert.deepEqual(mod((l) => { l.blocks[1] = { type: 'headline', px: { feed: { x: 70, y: 680, w: 940, h: 240 } } }; }), [], 'one per size');
  const px = (p) => mod((l) => { l.blocks[1] = { type: 'headline', px: p }; });
  assert.ok(has(px({ x: 70.5, y: 700, w: 940, h: 240 }), 'px.x must be a whole number of pixels'));
  assert.ok(has(px({ x: -1, y: 700, w: 940, h: 240 }), 'px.x must be a whole number of pixels from 0 to 1079'));
  assert.ok(has(px({ x: 70, y: 700, w: 0, h: 240 }), 'px.w must be a whole number of pixels from 1 to 1080'));
  assert.ok(has(px({ x: 600, y: 700, w: 940, h: 240 }), 'x + w is 1540, past the feed page\'s width'));
  assert.ok(has(px({ x: 70, y: 1200, w: 940, h: 240 }), 'y + h is 1440, past the feed page\'s height'));
  assert.ok(has(px({ x: '70', y: 700, w: 940, h: 240 }), 'px.x must be'));
  assert.ok(has(px({ x: 70, y: 700, w: 940, h: 240, z: 1 }), '"z" is not a known setting'));
  assert.ok(has(px('70 700 940 240'), 'px must be { "x", "y", "w", "h" }'));
  assert.ok(has(px({ story: { x: 70, y: 700, w: 940, h: 240 } }), 'px has "story", which is not a size of this layout'));
  assert.ok(has(px({ square: { x: 70, y: 700, w: 940, h: 240 } }), 'px has no rectangle for feed'));
  // text keeps inside the size's minimum margins; a photo may run to the edge
  assert.ok(has(px({ x: 10, y: 700, w: 940, h: 240 }), 'keeps inside the feed page\'s minimum margins'));
  assert.deepEqual(mod((l) => { l.blocks[0] = { type: 'photo', px: { x: 0, y: 0, w: 1080, h: 600 } }; }), []);
  // a slot or a px rectangle, not both; no bleed on a px rectangle (it is already in page pixels)
  assert.ok(has(mod((l) => { l.blocks[1].px = { x: 70, y: 700, w: 940, h: 240 }; }), 'give a slot (grid cells) or px (page pixels), not both'));
  assert.ok(has(mod((l) => { l.blocks[0] = { type: 'photo', px: { x: 0, y: 0, w: 1080, h: 600 }, bleed: ['top'] }; }), 'a px rectangle is already in page pixels'));
  // px rectangles take part in the overlap and panel checks like slots
  assert.ok(has(mod((l) => { l.blocks[1] = { type: 'headline', px: { x: 70, y: 300, w: 940, h: 240 } }; }), 'blocks[0] (photo) and blocks[1] (headline) overlap'));
  assert.ok(has(mod((l) => { l.blocks.push({ type: 'decoration', kind: 'panel', px: { x: 0, y: 1000, w: 1080, h: 350 } }); }), 'blocks[2] (sub) lies across the edge of the panel'));
  // a block inside a slab has no rectangle of its own
  assert.ok(has(mod((l) => { l.fields.myth = {}; l.blocks.push({ type: 'slab', slot: at(1, 22, 12, 2), children: [{ type: 'headline', field: 'myth', px: { x: 70, y: 70, w: 100, h: 100 } }] }); }), 'has no slot of its own'));
});

test('when: a block drawn only when a field is filled or empty, or on some pages of a carousel', () => {
  const w = (when, extra = (l) => l) => mod((l) => { l.blocks[2].when = when; extra(l); });
  for (const when of [{ present: 'sub' }, { absent: 'sub' }, { page: 'first' }, { page: 'later' }, { page: 'single' }, { present: 'sub', page: 'first' }]) assert.deepEqual(w(when), [], JSON.stringify(when));
  assert.ok(has(w({}), 'when must be an object like'));
  assert.ok(has(w('sub'), 'when must be an object like'));
  assert.ok(has(w({ present: 'quote' }), '"quote" is not in the layout\'s fields'));
  assert.ok(has(w({ present: 'nope' }), 'when.present must be one of'));
  assert.ok(has(w({ present: 'sub', absent: 'sub' }), 'a field cannot be both present and absent'));
  assert.ok(has(w({ page: 'third' }), 'when.page must be one of single, first, later'));
  assert.ok(has(w({ if: 'sub' }), '"if" is not a known setting'));
  // two blocks that are never drawn together may show the same field, and may share space; otherwise they may not
  const pair = (a, b) => mod((l) => { l.blocks[1].when = a; l.blocks.push({ type: 'headline', slot: at(1, 13, 12, 5), size: 112, when: b }); });
  assert.deepEqual(pair({ present: 'sub' }, { absent: 'sub' }), []);
  assert.deepEqual(pair({ page: 'first' }, { page: 'later' }), []);
  assert.ok(has(pair({ present: 'sub' }, { present: 'sub' }), '"headline" is shown by more than one block'));
  assert.ok(has(pair({ page: 'first' }, undefined), 'overlap on the feed grid'));
  assert.ok(has(mod((l) => { l.fields.myth = {}; l.blocks.push({ type: 'slab', slot: at(1, 22, 12, 2), children: [{ type: 'headline', field: 'myth', when: { page: 'first' } }] }); }), 'a block inside a slab has no condition of its own'));
});

test('ground cases: the first whose condition holds, the last without one; photo on poster pages only', () => {
  assert.deepEqual(validateLayout(poster()), []);
  assert.deepEqual(mod((l) => { l.ground = [{ when: { present: 'sub' }, ground: 'deep' }, { ground: 'series' }]; }), []);
  assert.ok(has(mod((l) => { l.ground = [{ when: { present: 'sub' }, ground: 'deep' }]; }), 'the last case has no "when"'));
  assert.ok(has(mod((l) => { l.ground = [{ ground: 'deep' }, { ground: 'light' }]; }), 'needs a "when" (only the last case has none)'));
  assert.ok(has(mod((l) => { l.ground = []; }), 'a list of 1 to 4 cases'));
  assert.ok(has(mod((l) => { l.ground = Array.from({ length: 5 }, () => ({ when: { present: 'sub' }, ground: 'deep' })); }), 'a list of 1 to 4 cases'));
  assert.ok(has(mod((l) => { l.ground = [{ when: { present: 'sub' }, ground: 'red' }, { ground: 'light' }]; }), 'ground[0].ground must be series or one of'));
  assert.ok(has(mod((l) => { l.ground = [{ when: { present: 'quote' }, ground: 'deep' }, { ground: 'light' }]; }), '"quote" is not in the layout\'s fields'));
  assert.ok(has(mod((l) => { l.ground = [{ when: { present: 'sub' }, ground: 'deep', css: 'x' }, { ground: 'light' }]; }), '"css" is not a known setting'));
  assert.ok(has(mod((l) => { l.ground = 'photo'; }), 'ground must be series or one of'), 'a grid page has no photo ground');
  assert.ok(has(modP((l) => { delete l.fields.image; l.blocks.shift(); }), 'a photo ground needs the image field'));
});

test('page kinds: the built-in templates\' poster and editorial pages, their chrome and what each block honours there', () => {
  assert.deepEqual(validateLayout(editorial()), []);
  assert.ok(has(modP((l) => { l.page = 'magazine'; }), 'page must be one of grid, poster, editorial'));
  // chrome: no slot, on its own page only, never on a grid page (nor offered to the editor or the AI)
  assert.ok(has(mod((l) => { l.blocks.push({ type: 'bar' }); }), 'a bar block belongs to poster pages'));
  assert.ok(has(modE((l) => { l.blocks.push({ type: 'bar' }); }), 'a bar block belongs to poster pages'));
  assert.ok(has(modP((l) => { l.blocks.push({ type: 'footer' }); }), 'a footer block belongs to editorial pages'));
  assert.ok(has(modP((l) => { l.blocks[1].px = { x: 80, y: 60, w: 920, h: 40 }; }), 'a bar has no slot: the page places it'));
  assert.ok(has(modE((l) => { l.blocks[1].rule = 'yes'; }), 'rule must be true or false'));
  assert.deepEqual(modE((l) => { l.blocks[1].rule = false; }), []);
  for (const t of ['bar', 'runhead', 'footer']) assert.ok(!BLOCK_TYPES.includes(t) && !(t in layoutCatalogue().blocks), t);
  for (const o of ['specSize', 'photoTop']) assert.ok(!Object.values(layoutCatalogue().blocks).some((b) => o in b.options), o);
  assert.ok(has(mod((l) => { l.blocks[1].specSize = true; }), 'specSize is used on poster and editorial pages only'));
  assert.ok(has(mod((l) => { l.blocks[0].photoTop = true; }), 'photoTop is used on poster pages only'));
  // a block a page has no drawing for, and options its drawing does not honour, are refused
  assert.ok(has(modP((l) => { l.fields.items = {}; l.blocks.push({ type: 'list', px: { x: 80, y: 1000, w: 400, h: 100 } }); }), 'a poster page does not draw a list block'));
  assert.ok(has(modE((l) => { l.fields.big = {}; l.blocks.push({ type: 'figure', px: { x: 70, y: 600, w: 400, h: 100 } }); }), 'an editorial page does not draw a figure block'));
  assert.ok(has(modP((l) => { l.blocks[3].size = 36; }), 'size is not used on a poster page'));
  assert.ok(has(modE((l) => { l.blocks[3].valign = 'bottom'; }), 'valign is not used on an editorial page'));
  assert.ok(has(modP((l) => { l.fields.headline = {}; l.blocks.push({ type: 'headline', specSize: true, px: { x: 80, y: 1000, w: 920, h: 200 } }); }), 'specSize is not used on a poster page'));
  assert.ok(has(modP((l) => { l.blocks[4].direction = 'column'; }), 'direction is not used on a poster page'));
  assert.ok(has(modP((l) => { l.blocks.push({ type: 'decoration', kind: 'dots', px: { x: 0, y: 0, w: 10, h: 10 } }); }), 'a poster page draws the decorations rule, glow, map only'));
  // the poster photo and the editorial panel run the full width to the bottom edge, from a px rectangle
  assert.ok(has(modP((l) => { l.blocks[0].px = { x: 0, y: 616, w: 1080, h: 700 }; }), 'the photo runs the full width to the bottom edge'));
  assert.ok(has(modP((l) => { l.blocks[0].px = { x: 80, y: 616, w: 1000, h: 734 }; }), 'the photo runs the full width'));
  assert.ok(has(modP((l) => { delete l.blocks[0].px; l.blocks[0].slot = at(1, 9, 12, 7); }), 'the photo takes a "px" rectangle'));
  assert.ok(has(modP((l) => { l.blocks[0].frame = 'card'; }), 'frame is not used on a poster page'));
  assert.ok(has(modE((l) => { l.blocks[0].px = { x: 0, y: 990, w: 1080, h: 300 }; }), 'the panel runs the full width to the bottom edge'));
  // the editorial text keeps clear of the panel's edge, as on a grid page
  assert.ok(has(modE((l) => { l.blocks[2].px.h = 860; }), 'blocks[2] (headline) lies across the edge of the panel'));
});

test('hostile values in the new settings are refused before they could reach a page', () => {
  for (const h of HOSTILE) {
    const errs = [
      modP((l) => { l.page = h; }), modP((l) => { l.ground = [{ when: { present: 'image' }, ground: h }, { ground: 'cool' }]; }), modP((l) => { l.ground = [{ when: { present: h }, ground: 'deep' }, { ground: 'cool' }]; }),
      modP((l) => { l.blocks[2].px = { x: h, y: 140, w: 920, h: 180 }; }), modP((l) => { l.blocks[2].px = { [h]: { x: 80, y: 140, w: 920, h: 180 } }; }), modP((l) => { l.blocks[2].when = { page: h }; }),
      modP((l) => { l.blocks[2].when = { absent: h }; }), modP((l) => { l.blocks[2].shrink = h; }), modP((l) => { l.blocks[0].photoTop = h; }), modE((l) => { l.blocks[2].specSize = h; }),
      modE((l) => { l.blocks[1].rule = h; }), modE((l) => { l.blocks[4][h] = 1; }), modP((l) => { l.blocks.push({ type: h }); }),
    ];
    errs.forEach((e, i) => assert.ok(e.length > 0, `${i}: ${h}`));
    for (const e of errs.flat()) assert.ok(!e.includes('<script>window'), e);
  }
  // a type that names a property every object has is not a block type
  for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) assert.ok(has(mod((l) => { l.blocks[1].type = t; }), 'type must be one of'), t);
});

test('the page: conditions, ground cases and the shrink option on a grid page', () => {
  const S = SIZES.feed;
  const page = (l, spec, extra = {}) => renderLayout({ template: 'layout', layout: l.id, ...spec }, { size: S, brand, layouts: [l], image: () => PIXEL, imageSize: () => ({ w: 1800, h: 1800 }), ...extra });
  const l = base();
  l.blocks[2].when = { present: 'sub' };
  l.blocks.push({ type: 'label', text: 'Swipe', slot: at(1, 22, 6, 1), when: { page: 'first' } });
  l.ground = [{ when: { present: 'sub' }, ground: 'deep' }, { ground: 'warm' }];
  assert.deepEqual(validateLayout(l), []);
  const plain = page(l, { headline: 'H', image: 'a.jpg' });
  assert.ok(!plain.body.includes('Swipe') && plain.body.includes('--bg:var(--g-warm)'));
  const withSub = page(l, { headline: 'H', sub: 'S', image: 'a.jpg' }, { counter: { n: 1, total: 3 } });
  assert.ok(withSub.body.includes('>Swipe<') && withSub.body.includes('--bg:var(--g-deep)') && withSub.body.includes('>S</div>'));
  assert.ok(!page(l, { headline: 'H', sub: 'S', image: 'a.jpg' }, { counter: { n: 2, total: 3 } }).body.includes('>Swipe<'));
  assert.ok(page(l, { headline: 'H', sub: 'S', image: 'a.jpg', ground: 'light' }).body.includes('--bg:var(--g-light)'), 'the spec\'s ground still wins');
  // shrink: false keeps a headline out of the fit loop's scale
  assert.match(page(base(), { headline: 'H', image: 'a.jpg' }).body, /font-size:calc\(84px\*var\(--hs,1\)/);
  const fixed = base(); fixed.blocks[1].shrink = false;
  assert.match(page(fixed, { headline: 'H', image: 'a.jpg' }).body, /class="h ly-h" data-role="headline" style="font-size:84px"/);
});

test('labels, slabs and screens: their own rules', () => {
  const lab = (o) => mod((l) => { l.blocks.push({ type: 'label', slot: at(1, 22, 12, 1), ...o }); });
  assert.deepEqual(lab({ text: 'Myth' }), []);
  assert.deepEqual(lab({ source: 'series' }), []);
  assert.deepEqual(lab({ source: 'folio', style: 'tag', tone: 'accent' }), []);
  assert.ok(has(lab({}), 'a label needs exactly one of field'));
  assert.ok(has(lab({ text: 'a', source: 'brand' }), 'a label needs exactly one of'));
  assert.ok(has(lab({ text: 'a\nb' }), 'text must be one line of up to 40'));
  assert.ok(has(lab({ text: 'x'.repeat(41) }), 'text must be one line'));
  assert.ok(has(lab({ text: '' }), 'text must be one line'));
  assert.ok(has(lab({ source: 'url' }), 'source must be one of series, brand, folio'));
  assert.ok(has(lab({ field: 'headline' }), 'a label cannot show "headline"'));
  const slab = (o, children) => mod((l) => { l.fields.myth = {}; l.blocks.push({ type: 'slab', slot: at(1, 22, 12, 2), ...o, children }); });
  assert.deepEqual(slab({ ground: 'deep', radius: 'slab', shadow: true, padding: 24, gap: 12 }, [{ type: 'label', text: 'Myth', style: 'tag' }, { type: 'headline', field: 'myth', size: 56 }]), []);
  assert.ok(has(slab({ ground: 'purple' }, [{ type: 'headline', field: 'myth' }]), 'ground must be one of'));
  assert.ok(has(slab({ padding: 50 }, [{ type: 'headline', field: 'myth' }]), 'padding must be one of'));
  assert.ok(has(slab({}, [{ type: 'photo' }]), 'a photo cannot go inside a slab'));
  assert.ok(has(slab({}, [{ type: 'slab' }]), 'a slab cannot go inside a slab'));
  assert.ok(has(slab({}, [{ type: 'headline', field: 'myth', slot: at(1, 1, 1, 1) }]), 'has no slot of its own'));
  assert.ok(has(slab({}, [{ type: 'headline', field: 'myth', valign: 'top' }]), 'has no valign'));
  assert.ok(has(slab({}, Array.from({ length: 7 }, () => ({ type: 'website' }))), 'children must be a list of up to 6'));
  assert.ok(has(slab({}, 'text'), 'children must be a list'));
  assert.ok(has(slab({}, [{ type: 'headline', field: 'myth' }, { type: 'sub', field: 'myth' }]), '"myth" is shown by more than one block'));
  const scr = (o, fields = {}) => mod((l) => { Object.assign(l.fields, fields); l.blocks[0] = { type: 'screen', slot: at(1, 1, 12, 12), ...o }; });
  assert.deepEqual(scr({}), []);
  assert.deepEqual(scr({ device: 'desktop', tilt: true, framed: false, titleField: 'title' }, { title: {} }), []);
  assert.ok(has(scr({ titleField: 'title' }, { title: {} }), 'titleField is only used with "device": "desktop"'));
  assert.ok(has(scr({ tilt: true }), 'tilt is only used with "device": "desktop"'));
  assert.ok(has(scr({ device: 'desktop', fit: 'crop' }), 'fit is only used with "device": "phone"'));
  assert.ok(has(scr({ device: 'desktop', titleField: 'title' }), '"title" is not in the layout\'s fields'));
  assert.ok(has(scr({ device: 'tablet' }), 'device must be one of phone, desktop'));
  assert.ok(has(scr({ bleed: ['top'] }), '"bleed" is not a known setting'));
  assert.ok(layoutUsesPhone({ blocks: [{ type: 'screen' }] }) && !layoutUsesPhone({ blocks: [{ type: 'screen', device: 'desktop' }] }));
});

test('a list of layouts: a list, at most 40, ids unique', () => {
  assert.deepEqual(validateLayouts(undefined), []);
  assert.deepEqual(validateLayouts([]), []);
  assert.ok(has(validateLayouts({}), 'must be a list of up to 40'));
  assert.ok(has(validateLayouts(Array.from({ length: 41 }, (_, i) => ({ ...base(), id: `l${i}` }))), 'must be a list of up to 40'));
  assert.ok(has(validateLayouts([base(), base()]), 'the id "demo" is used by more than one layout'));
  assert.ok(has(validateLayouts([base(), { ...base(), id: 'b', blocks: 'x' }]), 'brand.json: layouts[1] "b": blocks must be a list'));
  assert.throws(() => findLayout('nope', [base()]), /layout "nope" is not one of the brand's layouts \(demo\)/);
  assert.throws(() => findLayout('demo', [{ ...base(), blocks: [] }]), /the brand's layout "demo" is not valid/);
  assert.throws(() => findLayout('demo', 'not a list'), /it has none/);
  assert.equal(findLayout('demo', [base()]).id, 'demo');
  // the brand file's "layouts" are checked by validateBrand like every other brand value
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'brands', 'demo', 'brand.json'), 'utf8'));
  assert.deepEqual(validateBrand({ ...raw, layouts: STARTER_LAYOUTS }), []);
  assert.ok(has(validateBrand({ ...raw, layouts: [{ ...base(), blocks: [{ type: 'html', slot: at(1, 1, 1, 1) }] }] }), 'brand.json: layouts[0] "demo": blocks[0].type must be one of'));
  assert.ok(has(validateBrand({ ...raw, layouts: 'x' }), 'brand.json: layouts must be a list'));
});

test('a design block for a layout is checked against the layout\'s declared fields', () => {
  assert.deepEqual(dp(design()), []);
  assert.deepEqual(dp(design({ sub: 'Sub', series: 'explainers', label: 'Mine', ground: 'deep', accent: 'colour', focal: '60% 40%', zoom: 1.5, name: 'p-1', sizes: ['feed'], networkSizes: { linkedin: 'feed' } })), []);
  assert.ok(has(dp(design({ headline: undefined })), 'headline is required by this layout'));
  assert.ok(has(dp(design({ image: undefined })), 'image is required by this layout'));
  assert.ok(has(dp(design({ headline: 'x'.repeat(81) })), 'headline is 81 characters; this layout takes up to 80'));
  assert.ok(has(dp(design({ sub: 'x'.repeat(121) })), 'sub is 121 characters; this layout takes up to 120'));
  assert.ok(has(dp(design({ headline: ['x'] })), 'headline must be a non-empty text'));
  assert.ok(has(dp(design({ headline: '   ' })), 'headline must be a non-empty text'));
  assert.ok(has(dp(design({ quote: 'x' })), 'quote is not used by layout "demo" (it takes headline, sub, image, focal, zoom)'));
  assert.ok(has(dp(design({ html: '<b>x</b>' })), 'html is not used by layout "demo"'));
  assert.ok(has(dp(design({ image: 'x.svg' })), 'must be .jpg'));
  assert.ok(has(dp(design({ image: 'javascript:alert(1)' })), 'must be .jpg'));
  assert.ok(has(dp(design({ image: 5 })), 'image must be a file path'));
  assert.ok(has(dp(design({ focal: '50% 50%;background:url(x)' })), 'focal must look like'));
  assert.ok(has(dp(design({ focal: { feed: '50% 50%' } })), 'focal must look like'));
  assert.ok(has(dp(design({ zoom: 4 })), 'zoom must be a number from 1 to 3'));
  assert.ok(has(dp(design({ zoom: '2' })), 'zoom must be'));
  assert.ok(has(dp(design({ sizes: ['story'] })), 'is drawn for feed only (not story)'));
  assert.ok(has(dp(design({ sizes: ['huge'] })), 'sizes must be from'));
  assert.ok(has(dp(design({ series: 'nope' })), 'series "nope" is not in brand.json'));
  assert.ok(has(dp(design({ series: 'Bad Key' })), 'series must be a key'));
  assert.ok(has(dp(design({ ground: 'photo' })), 'ground must be one of'));
  assert.ok(has(dp(design({ accent: 'loud' })), 'accent must be one of'));
  assert.ok(has(dp(design({ label: 'a\nb' })), 'label must be one line'));
  assert.ok(has(dp(design({ name: '../x' })), 'name must use lowercase'));
  assert.ok(has(dp(design({ networkSizes: { myspace: 'feed' } })), 'unknown network'));
  assert.ok(has(dp(design({ networkSizes: { linkedin: 'wide' } })), 'is not in sizes'));
  // the layout: named, known and valid
  assert.match(dp(design({ layout: undefined }))[0], /layout must name one of the brand's layouts/);
  assert.match(dp(design({ layout: '"><script>' }))[0], /layout must name one of the brand's layouts/);
  assert.match(dp(design({ layout: 'other' }))[0], /layout "other" is not one of the brand's layouts \(demo\)/);
  assert.match(dp(design(), [])[0], /it has none/);
  assert.match(dp(design(), [{ ...base(), canvas: {} }])[0], /the brand's layout "demo" is not valid/);
  assert.match(dp({ template: 'text' })[0], /template must be "layout"/);
  assert.match(dp(null)[0], /must be an object/);
  // a layout without a feed size needs sizes named
  const storyOnly = { ...base(), id: 'tall', canvas: { story: { ...GRID, margin: MIN_MARGINS.story } } };
  assert.ok(has(dp(design({ layout: 'tall' }), [storyOnly]), 'has no feed size; set sizes to story'));
  assert.deepEqual(dp(design({ layout: 'tall', sizes: ['story'] }), [storyOnly]), []);
  assert.deepEqual(normaliseLayoutDesign(design({ layout: 'tall', sizes: 'story' }), [storyOnly]).sizes, ['story']);
});

test('lists, figures and artefacts in a layout design use the built-in checks and the layout\'s counts', () => {
  const L = { id: 'figs', name: 'Figures', fields: { big: { required: true, max: 12 }, stats: { min: 2, max: 2 }, items: { max: 3 }, artefact: { types: ['register', 'ledger'] } }, canvas: { feed: GRID },
    blocks: [{ type: 'figure', slot: at(1, 1, 12, 3) }, { type: 'stats', slot: at(1, 4, 12, 3) }, { type: 'list', slot: at(1, 7, 12, 4) }, { type: 'artefact', slot: at(1, 11, 12, 14) }] };
  assert.deepEqual(validateLayout(L), []);
  const d = (o) => layoutDesignProblems({ template: 'layout', layout: 'figs', big: '14.8M+', stats: ['1|a', ['2', 'b']], ...o }, 'd', { layouts: [L] });
  assert.deepEqual(d({}), []);
  assert.ok(has(d({ big: 'x'.repeat(13) }), 'big is 13 characters; this layout takes up to 12'));
  assert.ok(has(d({ big: 'a\nb' }), 'big must be one line'));
  assert.ok(has(d({ stats: ['1|a'] }), 'stats needs 2 to 2 entries'));
  assert.ok(has(d({ stats: undefined }), 'stats is required by this layout'));
  assert.ok(has(d({ stats: ['1|a', 'no label'] }), 'stats[1] must look like "number|label"'));
  assert.ok(has(d({ stats: ['1|a', ['2', { b: 1 }]] }), 'stats[1] must look like'));
  assert.ok(has(d({ stats: ['1|a', `2|${'x'.repeat(61)}`] }), 'stats[1] is too long'));
  assert.deepEqual(d({ items: ['One', 'Two'] }), []);
  assert.ok(has(d({ items: ['1', '2', '3', '4'] }), 'items must be a list of 1 to 3'));
  assert.ok(has(d({ items: [] }), 'items must be a list'));
  assert.ok(has(d({ items: ['x'.repeat(49)] }), 'items[0] is 49 characters'));
  assert.ok(has(d({ items: ['a\nb'] }), 'items[0] must be one line'));
  assert.ok(has(d({ items: [5] }), 'items[0] must be a non-empty text'));
  assert.deepEqual(d({ artefact: { type: 'register', title: 'Where', rows: [['Rent', '400']] } }), []);
  assert.ok(has(d({ artefact: { type: 'passbook', days: 31 } }), 'takes an artefact of type register or ledger'));
  assert.ok(has(d({ artefact: { type: 'register', rows: [] } }), 'rows needs 1 to 6'));
  assert.ok(has(d({ artefact: { type: 'ledger', columns: [{ label: 'a' }] } }), 'columns needs 2 to 5'));
  assert.ok(has(d({ artefact: 'ledger' }), 'artefact must be an object'));
  assert.deepEqual(normaliseLayoutDesign({ template: 'layout', layout: 'figs', big: '1', stats: ['1|a', '2|b'] }, [L]).stats, [['1', 'a'], ['2', 'b']]);
});

test('design blocks in a batch and through the render entry point', () => {
  const posts = [{ id: 'a', design: design() }, { id: 'b', design: design({ headline: undefined }) }, { id: 'c', design: { template: 'text', headline: 'x' } }];
  const errs = validateBatchDesigns(posts, { series: SERIES, layouts: [base()] });
  assert.deepEqual(errs, ['post b: design: headline is required by this layout']);
  // designBlockProblems reads the brand's layouts unless it is given some (the demo brand has none)
  assert.deepEqual(loadLayouts(), []);
  assert.match(designBlockProblems(design())[0], /it has none/);
  assert.deepEqual(designBlockProblems(design(), { layouts: [base()] }), []);
});

test('geometry: cells, slots and bleed are computed from the grid; the fit check keeps the layout\'s margins', () => {
  const l = base(), c = cellOf(l.canvas.feed, 'feed');
  assert.equal(c.w, (1080 - 140 - 11 * 20) / 12);
  assert.equal(c.h, (1350 - 112) / 24);
  const r = slotRect(l, { slot: at(2, 3, 2, 1) }, 'feed');
  assert.deepEqual({ x: r.x, y: r.y, w: r.w, h: r.h }, { x: 70 + c.w + 20, y: 56 + 2 * c.h, w: 2 * c.w + 20, h: c.h });
  const b = slotRect(l, l.blocks[0], 'feed');
  assert.deepEqual({ x: b.x, y: b.y, w: b.w }, { x: 0, y: 0, w: 1080 });
  assert.equal(b.h, 56 + 12 * c.h);
  assert.deepEqual(b.inner, { x: 70, y: 56, w: 940, h: 12 * c.h });
  const bottom = slotRect(l, { slot: at(1, 20, 12, 5), bleed: ['bottom', 'right'] }, 'feed');
  assert.equal(bottom.y + bottom.h, 1350);
  assert.equal(bottom.x + bottom.w, 1080);
  const fit = layoutFit(l, 'feed');
  assert.deepEqual([fit.pad, fit.top, fit.bottom, fit.w, fit.h], [64, 50, 50, 1080, 1350]);
});

test('the slot check: text that runs out of its slot is a problem; the explanation names the slot', () => {
  const S = { ...SIZES.feed, pad: 64, top: 50, bottom: 50 };
  const m = (rect, cell, extra = {}) => ({ W: 1080, H: 1350, roles: [{ role: 'sub', rects: [rect], text: 'Hello', overX: 0, size: 32, min: 30, nested: false, onpanel: false, inAvoid: [], cell, ...extra }], avoid: [], objs: [], imgs: [], footer: null, panel: null, logo: null });
  const cell = { x0: 70, y0: 600, x1: 1010, y1: 700 };
  assert.deepEqual(findLayoutProblems(m({ x0: 70, y0: 610, x1: 900, y1: 690 }, cell), S), []);
  const down = findLayoutProblems(m({ x0: 70, y0: 610, x1: 900, y1: 760 }, cell), S);
  assert.equal(down.length, 1);
  assert.equal(down[0].kind, 'cell');
  assert.equal(down[0].edge, 'bottom');
  assert.match(explainProblems(down, 'feed'), /the sub line \("Hello"\) runs \d+ px out of the bottom of its slot/);
  assert.equal(findLayoutProblems(m({ x0: 60, y0: 610, x1: 900, y1: 690 }, cell), S).filter((p) => p.kind === 'cell')[0].edge, 'left');
  assert.deepEqual(findLayoutProblems(m({ x0: 66, y0: 610, x1: 900, y1: 690 }, cell), S), [], 'a few px of optical overhang is allowed');
  // pages without slots are judged as before
  assert.deepEqual(findLayoutProblems(m({ x0: 70, y0: 610, x1: 900, y1: 760 }, null), S), []);
  // a layout's bottom margin is the text's limit when there is no footer
  const low = findLayoutProblems(m({ x0: 70, y0: 1290, x1: 900, y1: 1340 }, null), S);
  assert.ok(low.some((p) => p.kind === 'outside' && p.edge === 'bottom'));
});

// ---- the page a layout makes ----

const ctxFor = (layouts, size = 'feed', extra = {}) => ({ size: SIZES[size], brand, layouts, image: () => PIXEL, imageSize: () => ({ w: 1640, h: 1025 }), ...extra });
const pageOf = (spec, layouts, size, extra) => buildPage({ brand, size: SIZES[size ?? 'feed'], ...renderLayout({ focalCss: '50% 50%', ...spec }, ctxFor(layouts, size, extra)) });

test('the page: ground, accent and series follow the spec, then the layout, then the series', () => {
  assert.deepEqual(frameOf({}, base(), brand), { ground: 'light', accent: 'muted', dark: false, label: brand.name });
  assert.deepEqual(frameOf({ series: 'explainers' }, base(), brand), { ground: brand.series.explainers.ground, accent: brand.series.explainers.accent, dark: brand.darkGrounds.includes(brand.series.explainers.ground), label: brand.series.explainers.name });
  assert.deepEqual(frameOf({ series: 'explainers' }, { ...base(), ground: 'deep', accent: 'weight' }, brand).ground, 'deep');
  assert.equal(frameOf({ series: 'explainers' }, { ...base(), accent: 'weight' }, brand).accent, 'weight');
  assert.equal(frameOf({ ground: 'mint', series: 'explainers', label: 'Mine' }, { ...base(), ground: 'deep' }, brand).ground, 'cool', 'older names are read as the neutral ones');
  assert.equal(frameOf({ ground: 'ink' }, base(), brand).dark, true);
  // the brand's own colours decide which grounds are dark, and its accent device applies when neither the post nor the layout sets one
  const lightDeep = { ...brand, grounds: { ...brand.grounds, deep: '#F0F0F0' }, darkGrounds: brand.darkGrounds.filter((g) => g !== 'deep') };
  assert.equal(frameOf({ ground: 'deep' }, base(), lightDeep).dark, false);
  const device = { ...brand, style: { ...brand.style, type: { ...brand.style.type, accent: 'none' } } };
  assert.equal(frameOf({}, base(), device).accent, 'none');
  assert.equal(frameOf({}, { ...base(), accent: 'colour' }, device).accent, 'colour');
  assert.equal(frameOf({ label: 'Mine' }, base(), brand).label, 'Mine');
  assert.throws(() => frameOf({ series: 'nope' }, base(), brand), DesignError);
  const html = pageOf({ ...design(), ground: 'deep' }, [base()]);
  assert.match(html, /<body class="acc-muted dark" data-editorial="1" data-layout="1">/);
  // texture auto: the brand's decoration for a dark editorial page (dots in the demo brand); none: nothing
  assert.match(html, /class="cv lyt dots" style="--bg:var\(--g-deep\)"/);
  assert.match(pageOf(design(), [{ ...base(), texture: 'none', ground: 'deep' }]), /class="cv lyt" style/);
  assert.match(pageOf(design(), [{ ...base(), texture: 'grid' }]), /class="cv lyt grid" style/);
  assert.match(pageOf(design(), [base()]), /class="cv lyt" style="--bg:var\(--g-light\)"/);
  assert.ok(html.includes('.ly-cell{'), 'the layout stylesheet is on the page');
});

test('the page: an invalid or unknown layout is refused at render time too (defence in depth)', () => {
  assert.throws(() => renderLayout(design(), ctxFor([{ ...base(), blocks: [{ type: 'html', slot: at(1, 1, 1, 1) }] }])), DesignError);
  assert.throws(() => renderLayout(design(), ctxFor([])), /not one of the brand's layouts/);
  assert.throws(() => renderLayout(design({ layout: 'demo' }), ctxFor([base()], 'story')), /has no story size/);
  // the brand's own layouts are used when the context names none
  assert.throws(() => renderLayout(design(), { ...ctxFor(undefined), brand: { ...brand, layouts: [] } }), /it has none/);
  assert.ok(renderLayout({ ...design(), focalCss: '50% 50%' }, { ...ctxFor(undefined), brand: { ...brand, layouts: [base()] } }).body.includes('Hello'));
});

test('the page: an artefact that does not fit its slot, or a slab padded shut, is refused with the sizes', () => {
  const L = { id: 'art', name: 'Art', fields: { headline: {}, artefact: {} }, canvas: { feed: GRID }, blocks: [{ type: 'headline', slot: at(1, 1, 12, 4) }, { type: 'artefact', slot: at(1, 5, 6, 4) }] };
  assert.deepEqual(validateLayout(L), []);
  const ledger = { type: 'ledger', columns: [{ label: 'Day' }, { label: 'Paid', align: 'end' }], rows: [['01', '10.00']] };
  assert.throws(() => renderLayout({ template: 'layout', layout: 'art', artefact: ledger }, ctxFor([L])), /the ledger needs a slot of at least 940 x \d+ px; its slot is \d+ x \d+ px/);
  assert.throws(() => renderLayout({ template: 'layout', layout: 'art', artefact: { type: 'passbook' } }, ctxFor([L])), /the passbook page needs a slot/);
  const big = { ...L, blocks: [L.blocks[0], { type: 'artefact', slot: at(1, 5, 12, 20) }] };
  for (const a of [ledger, { type: 'passbook', days: 30, ticked: 4 }, { type: 'register', title: 'T', rows: [['a', '1']] }, { type: 'passbook', register: { title: 'T', rows: [['a', '1']] } }]) {
    assert.match(renderLayout({ template: 'layout', layout: 'art', artefact: a }, ctxFor([big])).body, /class="obj card"/);
  }
  const shut = { id: 's', name: 'S', fields: { headline: {} }, canvas: { feed: GRID }, blocks: [{ type: 'slab', slot: at(1, 1, 2, 1), padding: 64, children: [{ type: 'headline' }] }] };
  assert.deepEqual(validateLayout(shut), []);
  assert.throws(() => renderLayout({ template: 'layout', layout: 's', headline: 'x' }, ctxFor([shut])), /leaves no room for its text/);
});

test('the page: a map decoration without a brand map is left off with a warning', () => {
  const L = { id: 'm', name: 'M', fields: { headline: {} }, canvas: { feed: GRID }, blocks: [{ type: 'decoration', kind: 'map', slot: at(7, 1, 6, 10) }, { type: 'headline', slot: at(1, 12, 12, 4) }] };
  const out = renderLayout({ template: 'layout', layout: 'm', headline: 'x' }, { ...ctxFor([L]), brand: { ...brand, map: null } });
  assert.match(out.warnings[0], /no dot map/);
  assert.ok(!out.body.includes('class="fig map"'));
  if (brand.map) assert.ok(renderLayout({ template: 'layout', layout: 'm', headline: 'x' }, ctxFor([L])).body.includes('class="fig map"'));
});

// ---- hostile values: in the layout's own words and in every field of a design, they stay text ----

const HOSTILE = [
  '"><script>window.__pwn=1</script>',
  '</style><script>window.__pwn=2</script>',
  '<img src=x onerror="window.__pwn=3">',
  "';alert(1);//",
  '</div><svg onload=window.__pwn=4>',
  'javascript:alert(5)',
  '`${window.__pwn=6}`',
  'url(http://evil.example/x.png)',
];
const SAFE_ATTRS = new Set(['lang', 'style', 'data-family', 'charset', 'http-equiv', 'content', 'nonce', 'class', 'src', 'alt', 'viewBox', 'aria-hidden', 'data-user', 'data-name', 'data-fit', 'data-avoid', 'data-role', 'data-mono', 'data-editorial', 'data-layout', 'data-min', 'data-phone', 'data-obj', 'data-bleed', 'data-cell', 'aria-label', 'role', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'text-anchor', 'id', 'width', 'height', 'viewbox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'opacity']);
function attributeNames(html) {
  const names = [];
  const body = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '<script>').replace(/<style>[\s\S]*?<\/style>/g, '<style>');
  for (const m of body.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g)) {
    for (const a of m[2].matchAll(/\s+([^\s"'>\/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g)) names.push(a[1]);
  }
  return names;
}

// One layout that uses every block type and every text field, so every path to the page is exercised.
const everything = (h = 'Label', { screen = false } = {}) => ({
  id: 'all', name: `NAME-MARK ${h}`.slice(0, 40).replace(/[\r\n]/g, ' '), description: `DESC-MARK ${h}`.slice(0, 300),
  fields: { headline: {}, sub: {}, line: {}, quote: {}, big: {}, label: {}, eyebrow: {}, note: {}, title: {}, stats: {}, items: {}, image: {}, artefact: {}, myth: {}, factLead: {}, fact: {} },
  canvas: { feed: GRID },
  blocks: [
    { type: 'decoration', kind: 'dots', slot: at(1, 1, 12, 24), bleed: ['top', 'left', 'right', 'bottom'] },
    { type: 'decoration', kind: 'glow', slot: at(1, 1, 6, 6) },
    { type: 'decoration', kind: 'texture', slot: at(7, 1, 6, 6) },
    { type: 'decoration', kind: 'rule', slot: at(1, 7, 12, 1) },
    { type: 'decoration', kind: 'panel', slot: at(1, 20, 12, 5) },
    { type: 'label', text: h.slice(0, 40).replace(/[\r\n]/g, ' ') || 'x', style: 'tag', slot: at(1, 1, 4, 1) },
    { type: 'label', field: 'label', slot: at(5, 1, 4, 1), tone: 'accent' },
    { type: 'label', field: 'eyebrow', style: 'plain', slot: at(9, 1, 4, 1) },
    { type: 'headline', slot: at(1, 2, 6, 3), style: 'poster' },
    { type: 'sub', slot: at(7, 2, 6, 3) },
    { type: 'figure', slot: at(1, 5, 6, 2) },
    { type: 'sub', field: 'line', slot: at(7, 5, 6, 2) },
    { type: 'stats', slot: at(1, 8, 6, 2), rules: true, direction: 'column' },
    { type: 'list', slot: at(7, 8, 3, 2), style: 'pills' },
    screen ? { type: 'spacer', slot: at(10, 8, 3, 2) } : { type: 'photo', slot: at(10, 8, 3, 2), frame: 'raised' },
    { type: 'slab', ground: 'deep', slot: at(1, 10, 6, 4), radius: 'card', shadow: true, children: [{ type: 'label', field: 'note' }, { type: 'headline', field: 'myth' }, { type: 'website' }, { type: 'logo' }] },
    { type: 'slab', ground: 'card', slot: at(7, 10, 6, 4), children: [{ type: 'headline', field: 'factLead' }, { type: 'sub', field: 'fact' }, { type: 'logo', variant: 'solid' }] },
    { type: 'headline', field: 'quote', slot: at(1, 14, 12, 2) },
    { type: 'artefact', slot: at(1, 16, 12, 4) },
    screen ? { type: 'screen', slot: at(1, 21, 6, 3), device: 'desktop', titleField: 'title', tilt: true } : { type: 'label', field: 'title', slot: at(1, 21, 6, 3) },
    { type: 'logo', slot: at(7, 21, 3, 1), variant: 'mark' },
    { type: 'website', slot: at(10, 21, 3, 1) },
    { type: 'label', source: 'folio', slot: at(7, 22, 6, 1) },
    { type: 'spacer', slot: at(7, 23, 6, 2) },
  ],
});
const hostileSpec = (h) => ({
  template: 'layout', layout: 'all', image: h, headline: h, sub: h, line: h, quote: h, big: h, label: h, eyebrow: h, note: h, title: h, myth: h, factLead: h, fact: h,
  stats: [[h, h], [h, h]], items: [h, h], artefact: { type: 'register', title: h.slice(0, 26), rows: [[h.slice(0, 17), h.slice(0, 8)]] },
  focalCss: `50% 50%;background:url(${h})`,
});

test('hostile text in the layout\'s own words and in every field of a design stays inert', () => {
  assert.deepEqual(validateLayout(everything()), []);
  assert.deepEqual(validateLayout(everything('Label', { screen: true })), []);
  for (const used of BLOCK_TYPES) assert.ok([...everything().blocks, ...everything('x', { screen: true }).blocks].some((b) => b.type === used), `the hostile layouts use ${used}`);
  for (const screen of [false, true]) {
  const run = (h, size = 'feed') => {
    const L = everything(h, { screen });
    return buildPage({ brand, size: SIZES[size], ...renderLayout(hostileSpec(h), { size: SIZES[size], brand, layouts: [L], counter: { n: 2, total: 5 }, image: () => PIXEL, imageSize: () => ({ w: 1640, h: 1025 }) }) });
  };
  const baseHtml = run('Label');
  for (const h of HOSTILE) {
    const html = run(h);
    assert.equal((html.match(/<script/gi) ?? []).length, 1, h); // only the runtime script
    assert.equal((html.match(/<\/style>/g) ?? []).length, (baseHtml.match(/<\/style>/g) ?? []).length, h);
    assert.equal((html.match(/<img/g) ?? []).length, (baseHtml.match(/<img/g) ?? []).length, h);
    assert.equal((html.match(/<svg/g) ?? []).length, (baseHtml.match(/<svg/g) ?? []).length, h);
    assert.equal((html.match(/<text/g) ?? []).length, (baseHtml.match(/<text/g) ?? []).length, h);
    assert.equal((html.match(/<div/g) ?? []).length, (baseHtml.match(/<div/g) ?? []).length, h);
    assert.deepEqual(attributeNames(html).filter((a) => /^on/i.test(a)), [], h);
    assert.deepEqual([...new Set(attributeNames(html))].filter((a) => !SAFE_ATTRS.has(a)), [], h);
    for (const st of html.match(/ style="[^"]*"/g) ?? []) assert.ok(!/url\(|http|expression|javascript/.test(st), `${h}: ${st}`);
    assert.ok(!html.includes('object-position:50% 50%;background'), h);
    // the layout's name and description never reach the page
    assert.ok(!html.includes('NAME-MARK') && !html.includes('DESC-MARK'), h);
  }
  }
});

test('hostile values in a layout are refused by the validator before they could reach a page', () => {
  for (const h of HOSTILE) {
    const errs = [
      mod((l) => { l.id = h; }), mod((l) => { l.ground = h; }), mod((l) => { l.blocks[1].size = h; }), mod((l) => { l.blocks[1].align = h; }),
      mod((l) => { l.blocks[1].type = h; }), mod((l) => { l.blocks[1].field = h; }), mod((l) => { l.canvas.feed.margin = h; }), mod((l) => { l.blocks[1].slot = { col: h, row: 1, width: 1, height: 1 }; }),
      mod((l) => { l.blocks.push({ type: 'slab', slot: at(1, 22, 12, 1), ground: h, children: [] }); }), mod((l) => { l.blocks.push({ type: 'decoration', slot: at(1, 1, 1, 1), kind: h }); }),
      mod((l) => { l.fields[h] = {}; }), mod((l) => { l.blocks[1][h] = 1; }),
    ];
    errs.forEach((e, i) => assert.ok(e.length > 0, `${i}: ${h}`));
    // messages quote at most a short, JSON-escaped piece of the value
    for (const e of errs.flat()) assert.ok(!e.includes('<script>window'), e);
  }
});

test('extra stylesheets come only from the engine\'s fixed list', () => {
  const S = SIZES.feed;
  const plain = buildPage({ brand, size: S, body: '' });
  const withSheet = buildPage({ brand, size: S, body: '', sheet: 'layout' });
  const count = (h) => (h.match(/<style>/g) ?? []).length;
  assert.equal(count(withSheet), count(plain) + 1);
  for (const sheet of ['body{background:url(http://evil)}', '__proto__', 'constructor', 'toString', '../brand.css']) assert.equal(count(buildPage({ brand, size: S, body: '', sheet })), count(plain), sheet);
  assert.ok(!/url\(|@import|http/i.test(fs.readFileSync(path.join(ROOT, 'packages', 'engine', 'design', 'layout.css'), 'utf8')), 'the layout stylesheet loads nothing');
});

test('the layout stylesheet holds no literal colours, fonts or sizes of a brand', () => {
  const css = fs.readFileSync(path.join(ROOT, 'packages', 'engine', 'design', 'layout.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(css), 'no hex colours');
  for (const f of css.match(/font-family:[^;}]*/g) ?? []) assert.match(f, /^font-family:var\(--\w+\)(,var\(--\w+\))*,(sans-serif|monospace)$/, 'fonts only from the brand\'s variables');
});

// ---- real renders: the same checks as for the built-in templates ----

const chrome = findChrome() ? false : 'Google Chrome not found';
test('real render: a starting point with the demo brand passes every check', { skip: chrome }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-layout-'));
  try {
    const l = STARTER_LAYOUTS.find((x) => x.id === 'myth-fact');
    const r = await renderDesignBlock({ design: { ...sampleDesign(l), series: 'explainers' }, layouts: STARTER_LAYOUTS, postId: 'layout', outDir: out });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.files.length, 1);
    assert.equal(r.files[0].w, 1080);
    assert.equal(r.files[0].h, 1350);
    assert.deepEqual(r.warnings, []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('real render: a sub line too long for its slot is refused, naming the slot', { skip: chrome }, async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-layout-'));
  try {
    const L = { id: 'tight', name: 'Tight', fields: { headline: {}, sub: {} }, canvas: { feed: GRID }, blocks: [{ type: 'headline', slot: at(1, 1, 12, 4) }, { type: 'sub', slot: at(1, 6, 6, 1) }] };
    const r = await renderDesignBlock({ design: { template: 'layout', layout: 'tight', headline: 'Short', sub: 'A sub line that is far too long for one small row of the grid, so it must run out of it.' }, layouts: [L], postId: 'tight', outDir: out });
    assert.equal(r.ok, false);
    assert.match(r.error, /the sub line \("A sub line that is far too long.*"\) runs \d+ px out of the bottom of its slot/);
    assert.deepEqual(fs.readdirSync(out), []);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
