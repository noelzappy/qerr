// node --test   (typography capabilities of looks: decorative swashes and more sizes of type in a hierarchy)
//
//   1. a swash validates only on a straight display headline (or a fitted headline set by lines or as a block), at most one per composition;
//   2. hostile values in every swash field are refused with short messages that never echo them, and the kit refuses them itself;
//   3. the markup carries only fixed names, a word number and a palette name; hostile headline words reach the page escaped;
//   4. the swash check (checks.mjs swashProblems) refuses a stroke that touches another word or leaves the page;
//   5. in Chrome: a swash is drawn against the measured word and the page passes; a swash that runs into other words is refused; a page
//      with four sizes passes with levels and is refused without.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseLook, validateLook } from './lib/design/look.mjs';
import { tokensFromLook } from './lib/design/directions/look-tokens.mjs';
import { renderPostWithLook, shippedLooks } from './lib/design/directions/index.mjs';
import { makeContext } from './lib/design/directions/kit.mjs';
import { explainPostProblems, swashProblems } from './lib/design/checks.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const RETAIL = JSON.parse(fs.readFileSync(path.join(HERE, 'testlib', 'looks', 'retail.sample.json'), 'utf8'));
const brand = loadBrand();
const PAYLOADS = ['red;background:url(//evil.example/x)', '</style><script>window.__pwn=1</script>', 'javascript:alert(1)', '"><img src=x onerror=alert(1)>', 'x'.repeat(5000)];
const AT = (x, y, w, h) => ({ px: { x, y, w, h } });
const SWASH = { shape: 'tail', word: 'last', colour: 'accent' };

function lookWith(headline = {}, extra = []) {
  const l = clone(RETAIL);
  l.id = 'typed'; l.name = 'Typed'; l.origin = 'copy:own:typed';
  l.compositions = [{
    kind: 'statement', name: 'Statement', describe: 'A headline with a swash.', ground: 'paper', calm: { maxShare: 0.8 },
    fields: { headline: { required: true, max: 70 } },
    elements: [Object.fromEntries(Object.entries({ type: 'text', field: 'headline', style: 'display', size: 110, place: AT(64, 300, 900, 500), swash: SWASH, ...headline }).filter(([, v]) => v !== undefined)), ...clone(extra)],
  }];
  return l;
}
const problems = (l) => validateLook(l, 'look', {});
const valid = (l, what) => assert.deepEqual(problems(l), [], what);
const refused = (l, re, what) => {
  const p = problems(l);
  assert.ok(p.length > 0, `${what}: refused`);
  if (re) assert.ok(p.some((m) => re.test(m)), `${what}: ${p.join(' | ')}`);
  for (const m of p) {
    assert.ok(m.length <= 200 && !/[\u0000-\u001f<>]/.test(m), `${what}: a clean message`);
    for (const x of PAYLOADS) assert.ok(!m.includes(x.slice(0, 20)), `${what}: the payload came back`);
  }
};
const draw = (l, spec = {}) => renderPostWithLook(l, { template: 'post', name: 'typed', kind: 'statement', variant: 0, headline: 'Small batches, *roasted slowly.*', ...spec }, { size: SIZES.feed, brand, image: () => '', imageSize: () => null });

test('a swash validates on a straight display headline; every shape, word and weight is accepted', () => {
  valid(lookWith(), 'the default');
  for (const shape of ['underline', 'swoosh', 'tail', 'loop']) for (const word of ['first', 'last', 'phrase', 1, 12]) valid(lookWith({ swash: { shape, word, colour: 'primary', weight: 'bold', overlap: true } }), `${shape} ${word}`);
  valid(lookWith({ swash: { shape: 'loop' } }), 'only the shape');
  // a fitted headline by lines or as a block
  const fitted = (mode, more = {}) => lookWith({}, []).compositions[0].elements[0] && (() => { const l = lookWith(); l.compositions[0].elements = [{ type: 'fitted-stack', field: 'headline', mode, place: AT(64, 300, 900, 500), swash: SWASH, ...more }]; return l; })();
  valid(fitted('lines', { cap: 200, floor: 80 }), 'fitted by lines');
  valid(fitted('block', { sizes: [140, 120] }), 'fitted as a block');
  refused(fitted('fill', { cap: 200, floor: 80 }), /not in fill mode/, 'fill mode stretches the ink');
});

test('a swash is refused where it cannot be drawn straight against a headline word', () => {
  refused(lookWith({ field: 'headline', style: 'body', size: undefined }), /display type/, 'body text');
  refused((() => { const l = lookWith(); l.compositions[0].fields.sub = { max: 100 }; l.compositions[0].elements.push({ type: 'text', field: 'sub', style: 'body', place: AT(64, 900, 600, 100), swash: SWASH }); return l; })(), /whole headline or quote/, 'a sub line');
  refused(lookWith({ part: 'phrase' }), /whole headline/, 'part of the headline');
  refused(lookWith({ rot: 3 }), /turned line/, 'a turned headline');
  refused((() => { const l = lookWith({ swash: undefined }); l.compositions[0].elements = [{ type: 'box', place: AT(64, 300, 900, 500), rot: 4, children: [{ type: 'text', field: 'headline', style: 'display', size: 110, swash: SWASH }] }]; return l; })(), /box it is in is turned/, 'in a turned box');
  refused((() => { const l = lookWith(); l.compositions[0].fields.label = { max: 28 }; l.compositions[0].elements.push({ type: 'text', field: 'label', style: 'label', place: AT(64, 100, 600, 60) }); l.compositions[0].elements[0].swash = SWASH; l.compositions[0].elements.push({ type: 'text', field: 'headline', part: 'phrase', style: 'display', size: 80, place: AT(64, 900, 900, 200), swash: SWASH }); return l; })(), /swash/, 'two swashes');
});

test('hostile swash values are refused with clean messages, and the kit refuses them itself', () => {
  const bad = [...PAYLOADS, NaN, Infinity, -1, 0, 13, 1.5, null, true, [], {}, { __proto__: { x: 1 } }, '__proto__', 'constructor'];
  for (const v of bad) {
    refused(lookWith({ swash: { ...SWASH, shape: v } }), /swash/, `shape ${String(v).slice(0, 20)}`);
    refused(lookWith({ swash: { ...SWASH, word: v } }), /swash/, `word ${String(v).slice(0, 20)}`);
    refused(lookWith({ swash: { ...SWASH, colour: v } }), /swash/, `colour ${String(v).slice(0, 20)}`);
    refused(lookWith({ swash: { ...SWASH, weight: v } }), /swash/, `weight ${String(v).slice(0, 20)}`);
    if (typeof v !== 'boolean') refused(lookWith({ swash: { ...SWASH, overlap: v } }), /swash/, `overlap ${String(v).slice(0, 20)}`);
  }
  refused(lookWith({ swash: { ...SWASH, colour: '#ff0000' } }), /swash\.colour/, 'a hex colour');
  refused(lookWith({ swash: { ...SWASH, path: 'M0 0' } }), /swash/, 'an extra key (a path)');
  refused(lookWith({ swash: 'tail' }), /swash/, 'a bare string');
  refused(lookWith({ swash: { word: 'last' } }), /swash/, 'no shape');
  // the kit holds the same line for code that calls it directly
  const c = makeContext({ spec: { headline: 'Hi there' }, brand, tokens: shippedTokens(), direction: 'x', kind: 'statement', variant: 0, comp: {}, size: SIZES.feed });
  for (const s of [{ shape: 'x' }, { shape: 'tail', word: 0 }, { shape: 'tail', word: '1"><b' }, { shape: 'tail', colour: 'red;x' }, { shape: 'tail', weight: 'huge' }, { shape: 'tail', overlap: 'yes' }, 'tail', [1]])
    assert.throws(() => c.display({ html: c.fmt('headline'), size: 100, x: 0, y: 0, swash: s }), /design kit: (swash|"red;x" is not a palette colour)/, JSON.stringify(s));
});
// the tokens of a real look, as the interpreter makes them
const shippedTokens = () => tokensFromLook(normaliseLook(lookWith()), brand);

test('the swash markup carries only fixed names, a word number and a palette name; hostile words stay escaped', () => {
  const body = draw(lookWith({ swash: { shape: 'loop', word: 3, colour: 'primary', weight: 'fine', overlap: true } })).body;
  assert.match(body, / data-swash="loop" data-swash-word="3" data-swash-weight="fine" data-swash-ink="primary" data-swash-over/);
  const plain = draw(lookWith()).body;
  assert.match(plain, / data-swash="tail" data-swash-word="last" data-swash-weight="medium" data-swash-ink="accent" /);
  for (const x of PAYLOADS.slice(0, 4)) {
    const b = draw(lookWith(), { headline: x.slice(0, 60) }).body;
    assert.ok(!b.includes('<script') && !b.includes('<img'), `escaped: ${x.slice(0, 20)}`);
  }
});

test('the swash check: a stroke touching another word, or leaving the page, refuses the page', () => {
  const word = (x0, y0, x1, y1, o = {}) => ({ x0, y0, x1, y1, text: 'w', host: 0, target: false, ...o });
  const sw = (dots, o = {}) => ({ host: 0, over: false, word: 'slowly', dots, box: { x0: 100, y0: 500, x1: 600, y1: 600 }, ...o });
  const along = [[100, 560, 110, 570], [300, 580, 310, 590], [590, 560, 600, 570]];
  assert.deepEqual(swashProblems(null), []);
  assert.deepEqual(swashProblems({ W: 1080, H: 1350, swashes: [sw(along)], words: [word(100, 400, 600, 575, { target: true, text: 'slowly' })] }), [], 'its own word is allowed');
  const hit = swashProblems({ W: 1080, H: 1350, swashes: [sw(along)], words: [word(280, 585, 420, 640, { text: 'next', host: -1 })] });
  assert.deepEqual(hit.map((p) => [p.kind, p.text, p.own]), [['swash', 'next', false]]);
  assert.match(explainPostProblems(hit), /the swash against "slowly" runs into other text \("next"\)/);
  // another word of the same headline: refused unless overlap is set on purpose
  const own = { W: 1080, H: 1350, words: [word(280, 585, 420, 640, { text: 'batches' })] };
  assert.equal(swashProblems({ ...own, swashes: [sw(along)] }).length, 1);
  assert.deepEqual(swashProblems({ ...own, swashes: [sw(along, { over: true })] }), [], 'overlap lets it cross its own headline');
  assert.equal(swashProblems({ W: 1080, H: 1350, swashes: [sw(along, { over: true })], words: [word(280, 585, 420, 640, { host: -1 })] }).length, 1, 'but never other text');
  // touching by a pixel is not a collision; off the page is
  assert.deepEqual(swashProblems({ W: 1080, H: 1350, swashes: [sw(along)], words: [word(310, 580, 400, 590)] }), []);
  assert.match(explainPostProblems(swashProblems({ W: 1080, H: 1350, swashes: [sw(along, { box: { x0: -4, y0: 500, x1: 600, y1: 600 } })], words: [] })), /runs off the page/);
});

// ---- in Chrome ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-type-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(tmp, 'design.lock') }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const bloomWith = (edit = () => {}) => { const l = clone(shippedLooks().bloom); l.origin = 'copy:shipped:bloom'; edit(l); return l; };
const render = (look, design) => renderImage(browser, { ...brand, looks: [look], style: { ...brand.style, direction: look.id } }, { spec: normaliseDesign({ template: 'post', name: 'typed', ...design }), sizeName: 'feed', outFile: path.join(tmp, `${design.kind}.png`) }, { tmpDir: tmp });
const MOON = { kind: 'statement', variant: 0, label: 'The roastery', headline: 'Small batches, *roasted slowly.*', sub: 'Twelve kilos at a time, tasted at every stage and packed within days.' };

test('in Chrome: the Moon swash is drawn against the last word and passes every check; one that runs into words is refused', { skip }, async () => {
  const ok = await render(bloomWith(), MOON);
  assert.equal(ok.post.id, 'bloom/statement/0');
  for (const shape of ['underline', 'swoosh', 'loop']) await render(bloomWith((l) => { l.compositions[0].elements[3].children[0].swash = { shape, word: 'last', colour: 'primary' }; }), MOON);
  await assert.rejects(render(bloomWith((l) => { l.compositions[0].elements[3].children[0].swash = { shape: 'tail', word: 'first', colour: 'primary' }; }), MOON), /the swash against "Small" runs into another word of the headline \("batches"\)/);
  // with overlap the same swash may cross its own headline
  await render(bloomWith((l) => { l.compositions[0].elements[3].children[0].swash = { shape: 'tail', word: 'first', colour: 'primary', overlap: true }; }), MOON);
});

test('in Chrome: the bloom Price card sets four sizes (badge, label, headline, sub) and passes; without levels it is refused', { skip }, async () => {
  const card = shippedLooks().bloom.compositions.findIndex((c) => c.name === 'Price card');
  assert.ok(card >= 0, 'the Price card is shipped');
  const variant = shippedLooks().bloom.compositions.filter((c) => c.kind === 'offer').findIndex((c) => c.name === 'Price card');
  const design = { kind: 'offer', variant, label: 'The house blend', headline: 'Ember No. 1, our *everyday* house blend', tag: '£9.50', sub: 'Chocolate, hazelnut and orange peel. 250 g.', image: 'design/assets/demo/object-jar.jpg' };
  const ok = await render(bloomWith(), design);
  assert.equal(ok.post.name, 'Price card');
  await assert.rejects(render(bloomWith((l) => { delete l.compositions[card].levels; }), design), /sets type in 4 sizes|levels/);
});

test('the bloom Price card asks for its picture, and without one draws no empty frame', async () => {
  const look = { ...clone(shippedLooks().bloom), origin: 'copy:shipped:bloom' };
  const card = look.compositions.find((c) => c.name === 'Price card');
  assert.equal(card.fields.image.required, true, 'the design asks for a picture');
  assert.ok(!JSON.stringify(card.elements).includes('"keyline"'), 'no outline stands in for a missing picture');
  const variant = look.compositions.filter((c) => c.kind === 'offer').indexOf(card);
  const body = renderPostWithLook(look, { template: 'post', name: 'p', kind: 'offer', variant, headline: 'Half', tag: '-50%' }, { size: SIZES.feed, brand, image: () => '', imageSize: () => null }).body;
  assert.ok(!/k-keyline|k-photo/.test(body), 'nothing of a frame is drawn without the picture');
});

test('in Chrome: without its picture the Price card draws its words and badge only, and still passes every check', { skip }, async () => {
  const variant = shippedLooks().bloom.compositions.filter((c) => c.kind === 'offer').findIndex((c) => c.name === 'Price card');
  const r = await render(bloomWith(), { kind: 'offer', variant, label: 'The house blend', headline: 'Ember No. 1, our *everyday* house blend', tag: '£9.50', sub: 'Chocolate, hazelnut and orange peel. 250 g.' });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.post.name, 'Price card');
});
