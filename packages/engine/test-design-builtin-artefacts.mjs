// node --test   (the artefact group of the built-in templates as layouts, lib/design/builtin/artefacts.mjs: ledger, passbook and a
// text page with an artefact are drawn from their layouts, and the page is exactly the one their function (artefactPage) drew,
// for every artefact type, headline size, with and without a sub line, every ground and accent, carousel pages, hostile text and
// stray keys; and the artefact block's "from" option on the editorial page. No Chrome: the pixel comparison is
// testlib/template-baseline.mjs, see testlib/CONVERTING.md.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand } from './lib/design/brand.mjs';
import { builtinLayoutFor } from './lib/design/builtin-layouts.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { BLOCK_TYPES, layoutCatalogue, validateLayout, whenHolds } from './lib/design/layout.mjs';
import { renderLayoutWith } from './lib/design/layout-render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { LEGACY_FNS, TEMPLATE_FNS } from './design/templates/index.mjs';
import { markupFixture } from './testlib/markup-fixture.mjs';
import { STYLES } from './testlib/template-baseline.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const demo = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brands = Object.fromEntries(Object.entries(STYLES).map(([k, style]) => [k, style ? { ...demo, ...normaliseBrand({ ...RAW, style }) } : demo]));
const ctxOf = (brand, counter) => ({ size: SIZES.feed, brand, counter, image: () => PIXEL, imageSize: () => ({ w: 1800, h: 1800 }) });
const parts = (o) => ({ body: o.body, bodyClass: o.bodyClass ?? '', bodyAttrs: o.bodyAttrs ?? '', sheet: o.sheet ?? '', warnings: o.warnings ?? [] });
// The pages are checked against the hashes recorded from the template functions (testlib/markup-fixture.mjs).
const fx = markupFixture('artefacts');
const draw = (t, spec, ctx) => {
  const page = parts(TEMPLATE_FNS[t](spec, ctx));
  assert.deepEqual(page, parts(LEGACY_FNS[t](spec, ctx)), `${t}: the layout's page is the function's`);
  return page;
};
const refusal = (t, spec, ctx) => {
  let a, b;
  try { TEMPLATE_FNS[t](spec, ctx); } catch (e) { a = e; }
  try { LEGACY_FNS[t](spec, ctx); } catch (e) { b = e; }
  assert.ok(a instanceof DesignError && b instanceof DesignError, `${JSON.stringify(spec).slice(0, 120)}: ${a} / ${b}`);
  assert.equal(a.message, b.message);
  return `DesignError: ${a.message}`;
};
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const HOSTILE = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', '*a* \\n b', '`${x}`'];

const COLS = [{ label: 'Day' }, { label: 'Paid in', align: 'end' }, { label: 'Balance', align: 'end' }];
const ROWS = [['01', '10.00', '10.00'], ['02', '12.50', '22.50'], ['03', '', '22.50'], ['04', '10.00', '32.50']];
const LEDGER = { columns: COLS, rows: ROWS, mark: [{ row: 3, col: 2 }] };
const REGISTER = { title: 'Where it went', rows: [['Rent', '400.00'], ['Food', '120.50'], ['Savings', '80.00']], mark: 2 };
const rows = (k) => Array.from({ length: k }, (_, i) => [String(i + 1).padStart(2, '0'), i % 3 ? '10.00' : '']);
const regRows = (k) => Array.from({ length: k }, (_, i) => [`Line ${i + 1}`, i % 2 ? '12.50' : '']);

// Every kind of artefact page, as a template and its fields (the headline and sub line are added below).
const KINDS = {
  ledger: { template: 'ledger', ...LEDGER, notes: ['Figures in euros', 'Updated daily'] },
  'ledger-plain': { template: 'ledger', columns: COLS.slice(0, 2), rows: ROWS.map((r) => r.slice(0, 2)) },
  passbook: { template: 'passbook', days: 30, ticked: 12, today: 13 },
  'passbook-bare': { template: 'passbook' },
  'passbook-register': { template: 'passbook', days: 28, ticked: 9, today: 10, tick: 'gold', register: REGISTER },
  'text-ledger': { template: 'text', artefact: { type: 'ledger', ...LEDGER, notes: ['Figures in euros'] } },
  'text-register': { template: 'text', artefact: { type: 'register', ...REGISTER } },
  'text-passbook': { template: 'text', artefact: { type: 'passbook', days: 31, ticked: 17, today: 18, tick: 'gold' } },
  'text-passbook-register': { template: 'text', artefact: { type: 'passbook', days: 29, register: { title: 'Card', rows: regRows(6), mark: 0 } } },
};
const IDS = { ledger: 'ledger', 'ledger-plain': 'ledger', passbook: 'passbook', 'passbook-bare': 'passbook', 'passbook-register': 'passbook-register', 'text-ledger': 'text-ledger', 'text-register': 'text-register', 'text-passbook': 'text-passbook', 'text-passbook-register': 'text-passbook-register' };

// The page drawn from the layout and by the function, for the spec as the renderer sees it.
const styleOf = (brand) => Object.keys(brands).find((k) => brands[k] === brand);
function same(s, brand = demo, counter, what = JSON.stringify(s).slice(0, 160)) {
  assert.deepEqual(validateDesign(s), [], what);
  const spec = forSize(normaliseDesign(s), 'feed');
  assert.ok(builtinLayoutFor(spec, counter), `${what}: drawn from a layout`);
  fx.check({ s, style: styleOf(brand), counter }, draw(s.template, spec, ctxOf(brand, counter)), what);
}

test('each artefact page is drawn from its own layout, and every one of them is a valid layout', () => {
  for (const [k, s] of Object.entries(KINDS)) {
    const l = builtinLayoutFor({ headline: 'h', ...s });
    assert.equal(l?.id, IDS[k], k);
    assert.deepEqual(validateLayout(l), [], k);
  }
  // a text page without an artefact is the editorial group's; an artefact of no known type is left to the function
  assert.equal(builtinLayoutFor({ template: 'text', headline: 'h' }).id, 'text');
  for (const artefact of [{ type: 'nope' }, 'ledger', ['ledger'], 7, true]) assert.equal(builtinLayoutFor({ template: 'text', headline: 'h', artefact }), null, JSON.stringify(artefact));
});

test('the same page as the function at every headline size, with and without a sub line, every style and carousel page', () => {
  for (const [style, brand] of Object.entries(brands)) {
    for (const [k, base] of Object.entries(KINDS)) {
      for (const size of [undefined, 70, 84, 112]) {
        for (const sub of [undefined, 'One clear line, *in bold* where it counts.']) {
          for (const counter of [undefined, { n: 1, total: 3 }, { n: 2, total: 3 }]) {
            same({ ...base, headline: 'The week *on record.*', ...(sub ? { sub } : {}), ...(size ? { size } : {}) }, brand, counter, `${style} ${k} ${size} ${!!sub} ${JSON.stringify(counter)}`);
          }
        }
      }
    }
  }
});

test('the same page for every ground, accent, series, label, running head and decoration', () => {
  for (const [k, base] of Object.entries(KINDS)) {
    for (const ground of [undefined, 'light', 'soft', 'cool', 'warm', 'dark', 'deep', 'white', 'tint', 'mint', 'gold-pale', 'ink']) {
      for (const accent of [undefined, 'muted', 'colour', 'weight', 'none']) {
        same({ ...base, headline: 'a *b*', ground, accent }, demo, undefined, `${k} ${ground} ${accent}`);
      }
    }
    for (const series of Object.keys(RAW.series ?? {})) same({ ...base, headline: 'a *b*', sub: 's', series, label: 'Own label', headRight: 'Issue 4', dots: false }, brands.outline, undefined, `${k} ${series}`);
  }
});

test('the same page for every length of ledger, register card and month, and every mark', () => {
  for (let k = 1; k <= 10; k++) {
    same({ template: 'ledger', headline: 'h', sub: 's', columns: COLS.slice(0, 2), rows: rows(k), mark: [{ row: k - 1, col: 1 }, { row: 0, col: 0 }] });
    same({ template: 'text', headline: 'h', size: 112, artefact: { type: 'ledger', columns: COLS.slice(0, 2), rows: rows(k), notes: ['one', 'two'] } });
  }
  for (let k = 1; k <= 6; k++) {
    same({ template: 'text', headline: 'h', sub: 's', artefact: { type: 'register', title: 'T', rows: regRows(k), mark: k - 1 } });
    same({ template: 'passbook', headline: 'h', register: { rows: regRows(k) } });
  }
  for (const days of [28, 29, 30, 31]) {
    for (const ticked of [0, 1, days]) {
      same({ template: 'passbook', headline: 'h', days, ticked, today: Math.max(1, ticked), tick: ticked % 2 ? 'gold' : 'ink' });
      same({ template: 'text', headline: 'h', sub: 's', size: 70, artefact: { type: 'passbook', days, ticked, register: REGISTER } });
    }
  }
  // the widest ledger the sheet takes (the type shrinks)
  same({ template: 'ledger', headline: 'h', columns: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }, { label: 'E', align: 'end' }], rows: [['abcdefghijklmn', 'abcdefghij', 'abcdefghij', 'abcdefgh', '1234567.00']] });
});

test('the same page, and nothing raw, with hostile text in every field', () => {
  for (const h of HOSTILE) {
    const t = h.slice(0, 16), n = h.slice(0, 8);
    const specs = [
      { template: 'ledger', headline: h, sub: h, label: h.slice(0, 40), headRight: h.slice(0, 30), columns: [{ label: t }, { label: t, align: 'end' }], rows: [[t, t], ['', t]], notes: [h, h], mark: [{ row: 0, col: 1 }] },
      { template: 'passbook', headline: h, sub: h, label: h.slice(0, 40), register: { title: h.slice(0, 26), rows: [[h.slice(0, 17), n], [t, '']], mark: 0 } },
      { template: 'passbook', headline: h, headRight: h.slice(0, 30) },
      { template: 'text', headline: h, sub: h, artefact: { type: 'ledger', columns: [{ label: t }, { label: t }], rows: [[t, t]], notes: [h] } },
      { template: 'text', headline: h, artefact: { type: 'register', title: h.slice(0, 26), rows: [[h.slice(0, 17), n]] } },
      { template: 'text', headline: h, sub: h, size: 70, artefact: { type: 'passbook', register: { title: h.slice(0, 26), rows: [[t, n]] } } },
    ];
    for (const s of specs) {
      for (const [style, brand] of Object.entries(brands)) for (const counter of [undefined, { n: 1, total: 2 }]) same(s, brand, counter, `${style} ${JSON.stringify(s).slice(0, 100)}`);
      const { body } = TEMPLATE_FNS[s.template](forSize(normaliseDesign(s), 'feed'), ctxOf(demo));
      for (const raw of ['<script', '<img src=x', '</style>', '`']) assert.ok(!body.includes(raw), `${raw} in ${JSON.stringify(s).slice(0, 80)}`);
    }
  }
});

test('stray keys the validator lets through change nothing: the register drawn is the one the template draws', () => {
  // a text page's passbook without a register card, with a register at the top level (the text template ignores it)
  same({ template: 'text', headline: 'h', register: REGISTER, artefact: { type: 'passbook', days: 30 } });
  same({ template: 'text', headline: 'h', sub: 's', register: REGISTER, artefact: { type: 'passbook' } });
  assert.equal(builtinLayoutFor({ template: 'text', headline: 'h', register: REGISTER, artefact: { type: 'passbook' } }).id, 'text-passbook');
  // a passbook page with an artefact (the passbook template ignores it), with and without its own register card
  same({ template: 'passbook', headline: 'h', artefact: { type: 'passbook', register: REGISTER } });
  same({ template: 'passbook', headline: 'h', register: REGISTER, artefact: { type: 'passbook' } });
  assert.equal(builtinLayoutFor({ template: 'passbook', headline: 'h', artefact: { type: 'passbook', register: REGISTER } }).id, 'passbook');
  // a ledger or a register card that carries a register, and a ledger template given an artefact
  same({ template: 'text', headline: 'h', artefact: { type: 'ledger', ...LEDGER, register: REGISTER } });
  same({ template: 'text', headline: 'h', artefact: { type: 'register', ...REGISTER, register: REGISTER } });
  same({ template: 'ledger', headline: 'h', ...LEDGER, artefact: { type: 'register', ...REGISTER }, days: 3, register: REGISTER });
  // the condition on a register card, for a spec without a template, still reads both places (the shared tests rely on it)
  assert.ok(whenHolds({ field: 'register', is: true }, { register: REGISTER }) && whenHolds({ field: 'register', is: true }, { artefact: { register: REGISTER } }));
  assert.ok(whenHolds({ field: 'register', is: false }, { template: 'passbook', artefact: { register: REGISTER } }));
  assert.ok(whenHolds({ field: 'register', is: false }, { template: 'text', register: REGISTER, artefact: { type: 'passbook' } }));
});

test('an artefact page refuses what its function refused, with the same words', () => {
  for (const s of [{ series: 'nope' }, { ground: 'photo' }, { ground: 'purple' }]) {
    for (const base of Object.values(KINDS)) {
      const spec = forSize(normaliseDesign({ ...base, headline: 'h', ...s }), 'feed');
      fx.check({ refused: { ...base, ...s } }, refusal(base.template, spec, ctxOf(demo)), JSON.stringify(s));
    }
  }
});

// ---- the artefact block on the editorial page, and its "from" option ----
const page = (art = {}, extra = {}) => ({
  id: 'a', name: 'Artefact', page: 'editorial',
  fields: { headline: { required: true }, artefact: {} },
  canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } },
  blocks: [
    { type: 'decoration', kind: 'panel', px: { x: 0, y: 600, w: 1080, h: 750 } },
    { type: 'runhead' },
    { type: 'headline', size: 84, px: { x: 70, y: 154, w: 900, h: 300 } },
    { type: 'artefact', px: { x: 70, y: 644, w: 940, h: 546 }, ...art },
    { type: 'footer' },
  ],
  ...extra,
});

test('the artefact block takes "from" on the editorial page only, from its fixed list', () => {
  for (const from of ['field', 'ledger', 'passbook']) assert.deepEqual(validateLayout(page({ from })), [], from);
  for (const from of ['nope', '', 1, true, null, {}, ['ledger'], ...HOSTILE, '__proto__', 'constructor']) assert.ok(has(validateLayout(page({ from })), '.from must be one of field, ledger, passbook'), JSON.stringify(from));
  // align and valign are a grid page's: the editorial page places the cards from the rectangle's top-left
  assert.ok(has(validateLayout(page({ align: 'center' })), 'align is not used on an editorial page'));
  // a grid page has no "from" (its artefact is always the field), and a poster page draws no artefact
  const grid = { id: 'g', name: 'Grid', fields: { headline: {}, artefact: {} }, canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } }, blocks: [{ type: 'headline', slot: { col: 1, row: 1, width: 12, height: 3 } }, { type: 'artefact', from: 'ledger', slot: { col: 1, row: 5, width: 12, height: 10 } }] };
  assert.ok(has(validateLayout(grid), '.from is used on editorial pages only'));
  assert.ok(has(validateLayout(page({}, { page: 'poster', blocks: [{ type: 'headline', px: { x: 80, y: 170, w: 920, h: 300 } }, { type: 'artefact', px: { x: 80, y: 600, w: 920, h: 600 } }] })), 'a poster page does not draw a artefact block'));
  // the editor and the AI are not offered it
  assert.ok(BLOCK_TYPES.includes('artefact'));
  assert.equal(layoutCatalogue().blocks.artefact.options.from, undefined);
});

test('the artefact drawing: the field or the spec itself, cards from the rectangle, notes on or off the panel', () => {
  const spec = { headline: 'h', artefact: { type: 'register', ...REGISTER }, ...LEDGER, notes: ['n1'], days: 30, register: REGISTER };
  const draw = (art, s = spec, extra) => renderLayoutWith(page(art, extra), s, ctxOf(demo)).body;
  assert.match(draw({}), /<div class="obj card" data-obj data-avoid style="left:70px;top:644px;width:444px;height:\d+px"><svg class="fig"/);
  assert.match(draw({ from: 'ledger' }), /left:70px;top:644px;width:940px;height:\d+px.*data-onpanel>n1<\/span>/s);
  // a passbook page with its register card: the passbook the rectangle's height, the card at its top-right
  assert.match(draw({ from: 'passbook' }), /left:70px;top:644px;width:410px;height:546px.*left:566px;top:644px;width:444px/s);
  assert.match(draw({ from: 'passbook' }, { ...spec, register: undefined }), /left:70px;top:644px;width:940px;height:546px/);
  // off the panel, a ledger's notes are not marked as on it
  const off = draw({ from: 'ledger', px: { x: 70, y: 600, w: 940, h: 700 } }, spec, { blocks: [{ type: 'runhead' }, { type: 'headline', size: 84, px: { x: 70, y: 154, w: 900, h: 300 } }, { type: 'artefact', from: 'ledger', px: { x: 70, y: 600, w: 940, h: 700 } }, { type: 'footer' }] });
  assert.ok(off.includes('>n1</span>') && !off.includes('data-onpanel'));
  // no artefact (or not an object): nothing drawn; a hostile "from" that slipped past the validator reads the field
  for (const artefact of [undefined, 'ledger', 7, ['x'], null]) assert.ok(!draw({}, { headline: 'h', artefact }).includes('obj card'), JSON.stringify(artefact));
  assert.match(draw({ from: '__proto__' }), /width:444px/);
});

test('the markup fixture holds every case these tests draw, and only those', () => fx.done());
