// node --test   (no Chrome: icons drawn on their own as bounded look capabilities, added for the ledger look.)
//   1. the icon table has a padlock and a shield (plain path data, like the rest);
//   2. the icon-badge primitive: one of the engine's icons drawn large, bare or on a badge; its own rules; hostile values refused, never echoed;
//   3. rows with icons: an icon on each row's tile instead of a number (a feature list, an event's date, time and place);
//   4. a figure may carry a tag (a change pill) and a quote a gallery (round pictures); both reach the page only through the kit;
//   5. drawing: only the engine's own path data, sizes in whole pixels, colours as palette roles; nothing of the post reaches an icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { ICONS, ICON_NAMES, PATH_DATA } from './lib/design/icons.mjs';
import { KIND_FIELDS } from './lib/design/look-elements.mjs';
import { lookCatalogue, validateLook } from './lib/design/look.mjs';
import { iconSvg } from './lib/design/directions/kit.mjs';
import { renderPostWithLook } from './lib/design/directions/index.mjs';
import { validateDesign } from './lib/design/spec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const SWISS = JSON.parse(fs.readFileSync(path.join(HERE, 'testlib', 'looks', 'swiss.sample.json'), 'utf8'));
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brand = loadBrand();
const ctx = { size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 600, h: 600 }) };
const PX = (x, y, w, h) => ({ px: { x, y, w, h } });
const HOSTILE = ['"><script>window.__pwn=1</script>', 'javascript:alert(1)', 'url(http://evil.example/x.png)', 'red;background:url(x)', '</style>', '__proto__', 'constructor'];

// a list composition with a badge, a bare icon and rows with icons
function iconLook(extra = {}) {
  return clone({
    ...clone(SWISS), id: 'icons', origin: 'copy:shipped:swiss', name: 'Icons',
    compositions: [{
      kind: 'list', name: 'Icons', describe: 'A badge, a bare icon and the items on rows with an icon on each tile.', ground: 'paper',
      fields: { headline: { required: true, max: 44 }, items: { required: true, min: 2, max: 5 } },
      elements: [
        { type: 'icon-badge', icon: 'shield', size: 80, badge: 160, fill: 'field', ink: 'on-field', place: PX(64, 120, 160, 160), ...(extra.badge ?? {}) },
        { type: 'icon-badge', icon: 'lock', size: 40, shape: 'none', ink: 'field', place: PX(900, 120, 40, 40), ...(extra.bare ?? {}) },
        { type: 'text', field: 'headline', style: 'display', size: 96, place: PX(64, 320, 952, 220) },
        { type: 'rows', each: 'items', number: 'none', icons: ['check', 'lock'], numberTile: { size: 64, fill: 'field', ink: 'on-field', radius: 'full' }, textStyle: 'item', gap: 24, place: PX(64, 600, 952, 600), ...(extra.rows ?? {}) },
      ],
    }],
  });
}
const errsOf = (l) => validateLook(l, 'look', {});
const says = (l, re, what) => { const e = errsOf(l); assert.ok(e.some((x) => re.test(x)), `${what}: ${e.join(' | ')}`); for (const x of e) assert.ok(x.length <= 200 && !/<script|javascript:|evil\.example/.test(x), `${what}: not echoed: ${x}`); };
const draw = (look, words) => renderPostWithLook(look, { template: 'post', kind: 'list', name: 'icons-test', ...words }, ctx, { shipped: false }).body;

test('icons: the table has a padlock and a shield, plain path data like every other', () => {
  for (const n of ['lock', 'shield']) { assert.ok(ICON_NAMES.includes(n)); assert.match(ICONS[n].d, PATH_DATA); }
  assert.match(iconSvg('lock', { size: 48, colour: 'field' }), /^<svg class="k-ic" viewBox="0 0 24 24" aria-hidden="true" data-deco style="width:48px;height:48px;fill:var\(--c-field\)"><path d="[^"<>]+"\/><\/svg>$/);
  for (const size of [7, 601, 2.5, NaN, '48', -1]) assert.throws(() => iconSvg('lock', { size }), /icon size/);
  assert.throws(() => iconSvg('rocket'), /one of the engine/);
  assert.throws(() => iconSvg('lock', { colour: 'red;background:url(x)' }), /not a palette colour/);
});

test('the icon badge and rows with icons are valid look capabilities, listed in the catalogue', () => {
  assert.deepEqual(errsOf(iconLook()), []);
  const cat = lookCatalogue();
  assert.deepEqual(cat.elements['icon-badge'].properties.icon.values, [...ICON_NAMES]);
  assert.deepEqual(cat.elements.rows.properties.icons.of.values, [...ICON_NAMES]);
});

test('the icon badge refuses what it cannot draw, and never echoes hostile values', () => {
  says(iconLook({ badge: { icon: 'rocket' } }), /icon/, 'an icon not in the table');
  for (const h of HOSTILE) says(iconLook({ badge: { icon: h } }), /icon/, `hostile icon ${h.slice(0, 12)}`);
  for (const h of HOSTILE) says(iconLook({ badge: { fill: h } }), /fill/, `hostile fill ${h.slice(0, 12)}`);
  says(iconLook({ badge: { size: 401 } }), /size/, 'too large');
  says(iconLook({ badge: { size: 23 } }), /size/, 'too small');
  says(iconLook({ badge: { size: 'big' } }), /size/, 'a string');
  says(iconLook({ badge: { badge: 80 } }), /larger than the icon/, 'a badge no larger than its icon');
  says(iconLook({ badge: { fill: undefined } }), /needs a fill/, 'a badge without a fill');
  says(iconLook({ badge: { shape: 'star' } }), /shape/, 'a shape not in the list');
  says(iconLook({ bare: { fill: 'field' } }), /an icon alone has none/, 'a bare icon with a fill');
  says(iconLook({ bare: { badge: 80 } }), /an icon alone has none/, 'a bare icon with a badge size');
  says(iconLook({ badge: { ink: 'ink' } }), /does not read on/, 'an ink that does not read on the badge');
  says(iconLook({ badge: { field: 'headline' } }), /field/, 'a badge shows no words');
});

test('rows with icons: a tile to stand on and no numbering', () => {
  says(iconLook({ rows: { number: '1' } }), /set numbering to none/, 'icons and numbers');
  says(iconLook({ rows: { numberTile: undefined } }), /needs a number tile/, 'icons with no tile');
  says(iconLook({ rows: { icons: [] } }), /icons/, 'no icon');
  says(iconLook({ rows: { icons: ['check', 'check', 'check', 'check', 'check', 'check'] } }), /icons/, 'six icons');
  says(iconLook({ rows: { icons: ['check', 'javascript:alert(1)'] } }), /icons/, 'a hostile icon');
  const tileless = iconLook({ rows: { icons: undefined } });
  says(tileless, /needs numbering/, 'a tile still needs numbering or icons');
});

test('drawing: the badge, the bare icon and one icon per row, in turn, from the engine table only', () => {
  const body = draw(iconLook(), { headline: 'Safe by design', items: ['One pot', 'Every payment', 'Reminders'] });
  const svgs = [...body.matchAll(/<svg[^>]*>.*?<\/svg>/g)].map((m) => m[0]);
  assert.equal(svgs.length, 2 + 3, 'a badge, a bare icon and three rows');
  for (const s of svgs) {
    assert.match(s, /^<svg class="k-ic" viewBox="0 0 24 24" aria-hidden="true" data-deco style="width:\d+px;height:\d+px;fill:var\(--c-[a-z-]+\)"><path d="([^"]+)"\/><\/svg>$/);
    assert.ok(ICON_NAMES.some((n) => s.includes(`d="${ICONS[n].d}"`)), 'a path from the table');
  }
  // the rows take the icons in turn: check, lock, check
  const rows = svgs.slice(-3).map((s) => ICON_NAMES.find((n) => s.includes(`d="${ICONS[n].d}"`)));
  assert.deepEqual(rows, ['check', 'lock', 'check']);
  assert.match(body, /width:80px;height:80px;fill:var\(--c-on-field\)/, 'the badge icon at its size, in its ink');
  assert.match(body, /width:160px;height:160px;background:var\(--c-field\)|width:160px;height:160px[^"]*background:var\(--c-field\)/, 'the badge at its size, in its fill');
  // hostile words reach the page only as escaped text, never an icon
  const hostile = draw(iconLook(), { headline: '"><svg onload=alert(1)>{{lock}}', items: ['<script>x</script>', '{{shield}} two'] });
  assert.ok(!/<script|<svg onload/.test(hostile));
  assert.equal((hostile.match(/<svg/g) ?? []).length, 2 + 2, 'a badge, a bare icon and two rows: no icon made from the words');
});

test('a figure takes a tag (a change pill) and a quote a gallery (round pictures)', () => {
  assert.ok(KIND_FIELDS.figure.includes('tag'));
  assert.ok(KIND_FIELDS.quote.includes('gallery'));
  const look = { ...clone(SWISS), id: 'kinds', origin: 'copy:shipped:swiss', name: 'Kinds', compositions: [
    { kind: 'figure', name: 'Pill', describe: 'A figure with a change pill beside it.', ground: 'paper', fields: { big: { required: true, max: 8 }, tag: { max: 12 } },
      elements: [{ type: 'fitted-stack', field: 'big', mode: 'lines', cap: 300, floor: 120, maxLines: 1, place: PX(64, 300, 952, 320) },
        { type: 'button', field: 'tag', icon: 'arrow-up-right', size: 30, fill: 'field', ink: 'on-field', place: PX(64, 700, 952, 80), when: { present: 'tag' } }] },
    { kind: 'quote', name: 'Faces', describe: 'A quotation with round pictures of the people quoted.', ground: 'paper', fields: { quote: { required: true, max: 160 }, gallery: { min: 2, max: 3 } },
      elements: [{ type: 'text', field: 'quote', style: 'display', size: 72, place: PX(64, 200, 952, 600) },
        { type: 'photo-row', size: 120, place: PX(64, 900, 600, 160), when: { present: 'gallery' } }] },
  ] };
  assert.deepEqual(errsOf(look), []);
  const pics = [{ image: 'design/assets/demo/object-jar.jpg' }, { image: 'design/assets/demo/scene-market.jpg' }];
  assert.deepEqual(validateDesign({ template: 'post', kind: 'figure', big: '€2,400', tag: '+12%' }, 'd', { look }), []);
  assert.deepEqual(validateDesign({ template: 'post', kind: 'quote', quote: 'Now we just look.', gallery: pics }, 'd', { look }), []);
  assert.ok(validateDesign({ template: 'post', kind: 'quote', quote: 'x', gallery: pics.slice(0, 1) }, 'd', { look }).some((p) => /pictures/.test(p)), 'one picture is still refused');
  const fig = renderPostWithLook(look, { template: 'post', kind: 'figure', name: 'f', big: '€2,400', tag: '<b>+12%</b>' }, ctx, { shipped: false }).body;
  assert.ok(fig.includes('&lt;b&gt;+12%&lt;/b&gt;') && !fig.includes('<b>+12%'), 'the tag is escaped');
  const q = renderPostWithLook(look, { template: 'post', kind: 'quote', name: 'q', quote: 'Now we just look.', gallery: pics }, ctx, { shipped: false }).body;
  assert.equal((q.match(/k-round/g) ?? []).length, 2, 'two round pictures');
});
