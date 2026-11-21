// node --test   (the editorial group of the built-in templates as layouts: cover, stats and photo-story, lib/design/builtin/
// editorial.mjs. Each is drawn from its layout and makes exactly the page its function made (testlib/builtin-markup.json), with
// every field filled, empty and hostile, every ground, accent and option, on single posts and carousel pages; it refuses what the
// function refused, with the
// same words; and the block types and options the group added to the editorial page take only values from their fixed lists.
// No Chrome: the pixel comparison is testlib/template-baseline.mjs, run by hand, see testlib/CONVERTING.md.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand } from './lib/design/brand.mjs';
import { TEMPLATE_FNS, builtinLayoutFor } from './lib/design/builtin-layouts.mjs';
import { LAYOUTS } from './lib/design/builtin/editorial.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { BLOCK_TYPES, PAGES, layoutCatalogue, validateLayout } from './lib/design/layout.mjs';
import { renderLayoutWith } from './lib/design/layout-render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { markupFixture } from './testlib/markup-fixture.mjs';
import { STYLES } from './testlib/template-baseline.mjs';

// The built-in layouts' own format (lib/design/builtin-layouts.mjs validates them so): what is for them only is allowed here;
// test-design-layout-builtin.mjs checks what a brand's own layout may use.
const validateBuiltin = (l, where) => validateLayout(l, where, { builtin: true });
const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const demo = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brands = Object.fromEntries(Object.entries(STYLES).map(([k, style]) => [k, style ? { ...demo, ...normaliseBrand({ ...RAW, style }) } : demo]));
const ctxOf = (brand, counter) => ({ size: SIZES.feed, brand, counter, image: () => PIXEL, imageSize: () => ({ w: 1800, h: 1200 }) });
const parts = (o) => ({ body: o.body, bodyClass: o.bodyClass ?? '', bodyAttrs: o.bodyAttrs ?? '', sheet: o.sheet ?? '', warnings: o.warnings ?? [] });
// The pages are checked against the hashes recorded from the template functions the layouts replaced
// (testlib/markup-fixture.mjs), and so are the refusals' words.
const fx = markupFixture('editorial');
const draw = (t, spec, ctx) => parts(TEMPLATE_FNS[t](spec, ctx));
const refusal = (t, spec, ctx) => {
  let a;
  try { TEMPLATE_FNS[t](spec, ctx); } catch (e) { a = e; }
  assert.ok(a instanceof DesignError, `${JSON.stringify(spec).slice(0, 120)}: ${a}`);
  return `DesignError: ${a.message}`;
};
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const H = ['"><script>window.__pwn=1</script>', '</style><script>x</script>', '<img src=x onerror=alert(1)>', '*a* \\n b', '`${x}`', 'url(http://evil.example/x)'];
const GROUNDS = ['light', 'soft', 'cool', 'warm', 'dark', 'deep', 'white', 'tint', 'mint', 'gold-pale', 'ink'];
const ACCENTS = [undefined, 'muted', 'colour', 'weight', 'none'];
const COUNTERS = [undefined, { n: 1, total: 2 }, { n: 2, total: 2 }, { n: 7, total: 10 }];

// The same page from the layout as from the function (the fixture), for every brand style and counter. The function returned no
// warnings; the layout's must be none either.
function same(s, msg = JSON.stringify(s).slice(0, 140)) {
  const spec = forSize(normaliseDesign(s), 'feed');
  const drawn = [];
  for (const brand of Object.values(brands)) for (const counter of COUNTERS) drawn.push(draw(s.template, spec, ctxOf(brand, counter)));
  fx.check({ s }, drawn, msg);
}

test('cover, stats and photo-story are drawn from their layouts, each variant from its own', () => {
  for (const list of Object.values(LAYOUTS)) for (const v of list) assert.deepEqual(validateBuiltin(v.layout), [], v.layout.id);
  assert.equal(builtinLayoutFor({ template: 'cover', headline: 'h', image: 'a.jpg' }).id, 'cover');
  assert.equal(builtinLayoutFor({ template: 'stats', big: '1' }).id, 'stats');
  assert.equal(builtinLayoutFor({ template: 'photo-story', headline: 'h', image: 'a.jpg' }).id, 'photo-story');
  assert.equal(builtinLayoutFor({ template: 'photo-story', layout: 'panel', headline: 'h', image: 'a.jpg' }).id, 'photo-story');
  assert.equal(builtinLayoutFor({ template: 'photo-story', layout: 'print', headline: 'h', image: 'a.jpg' }).id, 'photo-story-print');
  // a layout photo-story does not take (validateDesign refuses it) matches no variant, and is refused
  for (const layout of ['center', 'side']) {
    assert.equal(builtinLayoutFor({ template: 'photo-story', layout, headline: 'h', image: 'a.jpg' }), null, layout);
    assert.throws(() => TEMPLATE_FNS['photo-story']({ template: 'photo-story', layout, headline: 'h', image: 'a.jpg' }, ctxOf(demo)), DesignError, layout);
    assert.ok(validateDesign({ template: 'photo-story', layout, headline: 'h', image: 'a.jpg' }).length, layout);
  }
});

test('cover: the same page as its function, with every field filled, empty and hostile, every ground, accent and option', () => {
  same({ template: 'cover', headline: 'How a group *saves together.*', sub: 'Five steps.', image: 'a.jpg' });
  same({ template: 'cover', headline: 'h', image: 'a.jpg', series: 'news', headRight: 'Issue 4', label: 'Field notes' });
  same({ template: 'cover', headline: 'h', sub: 's', image: 'a.jpg', focal: '30% 60%', zoom: 1.5 });
  same({ template: 'cover', headline: 'h', image: 'a.jpg', focal: { x: 0.1, y: 0.9 }, zoom: 3, dots: false, ground: 'dark' });
  for (const h of H) same({ template: 'cover', headline: h, sub: h, image: h, label: h.slice(0, 40), headRight: h.slice(0, 30), series: 'explainers' });
  for (const ground of GROUNDS) for (const accent of ACCENTS) same({ template: 'cover', headline: 'a *b*', sub: '*c* d', image: 'a.jpg', ground, accent });
});

test('stats: the same page as its function, with and without a photo, 0 to 3 figures, hostile text, every ground and accent', () => {
  const figures = [[], ['3,900+|members'], ['3,900+|members', '400+|groups'], ['3,900+|members', '400+|groups', '120|towns']];
  for (const stats of figures) {
    for (const image of [undefined, 'a.jpg']) {
      for (const line of [undefined, 'saved by members this year']) {
        same({ template: 'stats', big: '14.8M+', line, stats: stats.length ? stats : undefined, image });
        same({ template: 'stats', big: '*€* 2.4M', line, stats, image, series: 'the-numbers', label: 'In numbers', headRight: 'Week 12' });
      }
    }
  }
  same({ template: 'stats', big: '1', stats: ['1|a', '2|b'], image: 'a.jpg', focal: 'left top', zoom: 2, dots: false });
  for (const h of H) {
    same({ template: 'stats', big: h.slice(0, 40), line: h.slice(0, 80), stats: [[h, h], [h, h], [h, h]], image: h, label: h.slice(0, 40) });
    same({ template: 'stats', big: h.slice(0, 40), line: h.slice(0, 80), stats: [[h, h], [h, h]], headRight: h.slice(0, 30) });
  }
  for (const ground of GROUNDS) for (const accent of ACCENTS) {
    same({ template: 'stats', big: '1 in *3*', line: 'l', stats: ['1|a'], ground, accent });
    same({ template: 'stats', big: '1', stats: ['1|a', '2|b', '3|c'], image: 'a.jpg', ground, accent, series: 'news' });
  }
});

test('photo-story: the same page as its function in both variants, with every field filled, empty and hostile', () => {
  for (const layout of [undefined, 'panel', 'print']) {
    for (const sub of [undefined, 'The collector comes round *every Friday.*']) {
      same({ template: 'photo-story', layout, headline: 'Market day, *together.*', sub, image: 'a.jpg' });
      same({ template: 'photo-story', layout, headline: 'h', sub, image: 'a.jpg', series: 'community', label: 'Field notes', headRight: 'May 2026', focal: '50% 30%', zoom: 1.2 });
    }
    for (const h of H) same({ template: 'photo-story', layout, headline: h, sub: h, image: h, label: h.slice(0, 40), headRight: h.slice(0, 30) });
    for (const ground of GROUNDS) for (const accent of ACCENTS) same({ template: 'photo-story', layout, headline: 'a *b*', image: 'a.jpg', ground, accent, dots: ground === 'dark' ? false : undefined });
  }
});

test('they refuse what their functions refused, with the same words', () => {
  const refused = (s) => {
    fx.check({ refused: s }, refusal(s.template, forSize(normaliseDesign(s), 'feed'), ctxOf(demo)), JSON.stringify(s));
  };
  for (const base of [{ template: 'cover', headline: 'h', image: 'a.jpg' }, { template: 'stats', big: '1' }, { template: 'stats', big: '1', image: 'a.jpg' }, { template: 'photo-story', headline: 'h', image: 'a.jpg' }, { template: 'photo-story', layout: 'print', headline: 'h', image: 'a.jpg' }]) {
    refused({ ...base, series: 'nope' });
    refused({ ...base, ground: 'photo' });
    refused({ ...base, ground: 'purple' });
  }
});

// ---- the block types and options the editorial group added to the editorial page ----
// The fields its blocks show: big for a figure, stats for the figures, image for a photo.
const SHOWS = { figure: ['big', { required: true }], stats: ['stats', { min: 0, max: 3 }], photo: ['image', {}] };
const fieldsOf = (blocks) => Object.fromEntries(blocks.filter((b) => SHOWS[b.type]).map((b) => SHOWS[b.type]));
const page = (blocks, fields = fieldsOf(blocks)) => ({ id: 'e', name: 'E', page: 'editorial', fields, canvas: { feed: { columns: 12, rows: 15, margin: 70, gutter: 20 } }, blocks });
const fig = (o = {}) => ({ type: 'figure', px: { x: 70, y: 140, w: 940, h: 180 }, ...o });
const row = (o = {}) => ({ type: 'stats', px: { x: 70, y: 448, w: 940, h: 150 }, ...o });
const pic = (o = {}) => ({ type: 'photo', px: { x: 0, y: 616, w: 1080, h: 588 }, ...o });
const labels = (o = {}) => ({ type: 'labelrow', px: { x: 70, y: 1220, w: 940, h: 40 }, ...o });
const check = (...blocks) => validateBuiltin(page(blocks));
const drawn = (l, spec, counter) => renderLayoutWith(l, forSize(normaliseDesign(spec), 'feed'), ctxOf(demo, counter)).body;

test('the editorial page draws a photo, a figure, figures and the label row, with options from fixed lists only', () => {
  assert.deepEqual(PAGES.editorial.draws.photo, ['frame']);
  assert.deepEqual(PAGES.editorial.draws.figure, ['size', 'shrink']);
  assert.deepEqual(PAGES.editorial.draws.stats, ['direction', 'size', 'rules', 'shrink']);
  assert.deepEqual(PAGES.editorial.draws.labelrow, []);
  assert.deepEqual(check(fig(), row(), pic(), labels()), []);
  for (const frame of ['none', 'card', 'raised']) assert.deepEqual(check(fig(), pic({ frame })), [], frame);
  assert.deepEqual(check(fig({ size: 240, shrink: false }), row({ direction: 'column', size: 84, rules: true, shrink: false, px: { x: 70, y: 448, w: 940, h: 450 } })), []);
  for (const v of ['"><script>', 'url(x)', 'frame', 1, null, true, {}]) assert.ok(has(check(fig(), pic({ frame: v })), '.frame must be one of none, card, raised'), String(v));
  for (const v of [100, '168', 'calc(1px)', null]) assert.ok(has(check(fig({ size: v })), '.size must be one of'), String(v));
  for (const v of ['grid', '"><b>', 0]) assert.ok(has(check(fig(), row({ direction: v })), '.direction must be one of row, column'), String(v));
  for (const v of ['yes', 1, null]) {
    assert.ok(has(check(fig(), row({ rules: v })), '.rules must be true or false'), String(v));
    assert.ok(has(check(fig({ shrink: v })), '.shrink must be true or false'), String(v));
  }
  // options the editorial page does not honour on these types, and the poster photo's photoTop
  assert.ok(has(check(fig({ style: 'poster' })), '.style is not used on an editorial page'));
  assert.ok(has(check(fig({ align: 'center' })), '.align is not used on an editorial page'));
  assert.ok(has(check(fig(), pic({ photoTop: true })), '.photoTop is used on poster pages only'));
  assert.ok(has(check(fig(), row({ align: 'right' })), '.align is not used on an editorial page'));
  // the label row: no field and no option, a rectangle inside the margins, on editorial pages only
  assert.ok(has(check(fig(), labels({ field: 'big' })), 'a labelrow shows no field'));
  assert.ok(has(check(fig(), labels({ rule: true })), '"rule" is not a known setting'));
  assert.ok(has(check(fig(), labels({ px: { x: 10, y: 1000, w: 940, h: 40 } })), 'keeps inside the feed page\'s minimum margins'));
  assert.ok(has(check(fig(), labels({ px: undefined })), '.slot is required'));
  assert.ok(has(validateBuiltin({ ...page([fig(), labels()]), page: 'poster' }), 'a labelrow block belongs to editorial pages'));
  assert.ok(has(validateBuiltin({ ...page([{ type: 'labelrow', slot: { col: 1, row: 1, width: 12, height: 1 } }, { type: 'figure', slot: { col: 1, row: 3, width: 12, height: 3 } }]), page: undefined }), 'a labelrow block belongs to editorial pages'));
  // the editor and the AI are never offered it
  assert.ok(!BLOCK_TYPES.includes('labelrow') && !('labelrow' in layoutCatalogue().blocks));
  // blocks still may not lie on each other unless their conditions exclude each other
  assert.ok(has(check(fig(), row({ px: { x: 70, y: 448, w: 940, h: 300 } }), pic()), 'overlap'));
  assert.deepEqual(check(fig(), row({ px: { x: 70, y: 448, w: 940, h: 300 }, when: { absent: 'image' } }), pic({ when: { present: 'image' } })), []);
});

test('the added drawings: the figures spread by count, sizes fixed or shrinking, the folio on carousel pages only', () => {
  const l = page([fig({ shrink: false, size: 120 }), row({ direction: 'column', size: 56, px: { x: 70, y: 448, w: 940, h: 600 } }), labels()]);
  const body = drawn(l, { template: 'stats', big: '7', stats: ['1|a', '2|b', '3|c'] });
  assert.ok(body.includes('<div class="abs h big" data-role="stat" style="left:70px;top:140px;width:940px;font-size:120px;line-height:120px">7</div>'));
  // a column a third of its rectangle apart, no rules unless asked, the size's class and a shrinking size
  assert.ok(body.includes('style="left:70px;top:648px;width:940px;"><div class="h s56" data-role="stat" style="font-size:calc(56px*var(--hs,1)*var(--h-scale,1))">2</div>'));
  assert.ok(!body.includes('border-top'));
  assert.ok(body.includes('<div class="abs" style="left:70px;right:70px;top:1220px;display:flex;justify-content:space-between"><span class="lbl" data-role="label">Acme Savings</span></div>'), body);
  assert.ok(!body.includes('01 / 02'));
  assert.ok(drawn(l, { template: 'stats', big: '7' }, { n: 1, total: 2 }).includes('>01 / 02</span></div>'));
  // a row shares its width among the figures, 50 px apart
  const r = page([fig(), row()]);
  assert.ok(drawn(r, { template: 'stats', big: '7', stats: ['1|a'] }).includes('style="left:70px;top:448px;width:940px"><b>1</b><br>a</div>'));
  assert.ok(drawn(r, { template: 'stats', big: '7', stats: ['1|a', '2|b'] }).includes('style="left:565px;top:448px;width:445px"><b>2</b><br>b</div>'));
  // no photo, no figure: nothing drawn
  assert.equal(drawn(page([pic(), fig()]), { template: 'stats', big: '' }).includes('<img'), false);
});

test('a drawing never writes an option or a spec value that is not from its list, even in a layout that skipped validation', () => {
  const bad = '"><script>window.__pwn=1</script>';
  const l = page([fig({ size: bad, shrink: bad }), row({ direction: bad, size: bad, rules: bad, px: { x: 70, y: 448, w: 940, h: 450 } }), pic({ frame: bad }), labels()]);
  for (const counter of [undefined, { n: 2, total: 3 }]) {
    const body = drawn(l, { template: 'stats', big: bad.slice(0, 40), stats: [[bad, bad], [bad, bad]], image: 'a.jpg', label: bad.slice(0, 40) }, counter);
    assert.ok(!body.includes('<script') && !body.includes('pwn=1<'), body);
    // the defaults instead: 168 px, not shrinking (only true turns it on), a row of figures
    assert.ok(body.includes('font-size:168px;line-height:168px') && body.includes('<b>&quot;&gt;&lt;script'), body);
    assert.ok(body.includes('<div class="ph" data-avoid style="left:0px;top:616px;width:1080px;height:588px">'), 'frame none');
  }
});

test('the markup fixture holds every case these tests draw, and only those', () => fx.done());
