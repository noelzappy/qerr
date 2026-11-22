// The shipped studio look as data (lib/design/looks/studio.look.json): an editorial product-studio feed (a tight bold grotesk on red, black
// or cream, a coloured final word, numbered rows on thin rules, report covers, a job post with a drawn phone, speaker cards with a two-colour
// footer, an application post with a corner ribbon). Pure checks, no Chrome, apart from the last test (test-design-look-equivalence.mjs
// draws every composition through every check in three colour sets).
// Run: node --test test-design-look-studio.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateLook, lookBrief } from './lib/design/look.mjs';
import { renderPostWithLook, shippedLooks } from './lib/design/directions/index.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';
import { NORMAL, STRESS, MINIMAL } from './testlib/studio-copy.mjs';
import { paletteBrand } from './testlib/retail-copy.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/studio.look.json', import.meta.url), 'utf8'));
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };
const comp = (kind, i = 0) => look.compositions.filter((c) => c.kind === kind)[i];
const typesOf = (c) => { const t = []; walkEls(c.elements, (e) => t.push(e.type)); return t; };

test('the studio look loads, names itself and is registered as a shipped look', () => {
  assert.equal(look.id, 'studio');
  assert.equal(look.name, 'Studio');
  assert.equal(look.origin, 'shipped');
  assert.equal(look.compositions.length, 17);
  assert.equal(shippedLooks().studio.id, 'studio');
  assert.ok(look.description.length > 40 && look.description.length <= 300);
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'studio', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 3, figure: 2, list: 3, quote: 2, photo: 3, event: 2, offer: 2 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

test('it names no colour, url, path or markup, and its colours are the brand\'s roles: one accent on red, black and cream pages', () => {
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
  assert.equal(look.colour.logic, 'one-accent');
  assert.deepEqual(new Set(look.compositions.map((c) => c.ground)), new Set(['field', 'dark', 'paper']));
  assert.equal(look.fonts.display.family, 'Inter');
  assert.ok(look.type.display.track <= -0.04, 'tight headlines');
});

test('the series devices: the logo top left, the web address and Swipe at the foot of every page that has room', () => {
  assert.equal(look.logo.default, 'top-left');
  for (const c of look.compositions) {
    let swipe = 0;
    walkEls(c.elements, (e) => { if (e.type === 'text' && e.source === 'swipe') { swipe++; assert.equal(e.align, 'right'); assert.equal(e.place.anchor.bottom, 64); } });
    if (c.kind !== 'event' || c.name !== 'Speaker card') assert.equal(swipe, 1, `${c.kind}/${c.name}`);
  }
});

test('the reference devices are there: numbered rows on rules, the red line and second line, the light job title and phone, the speaker footer, the ribbon', () => {
  const rows = comp('list', 0).elements.flatMap((e) => (e.children ?? [e])).find((e) => e.type === 'rows');
  assert.equal(rows.number, '01'); assert.equal(rows.rule, 'hair'); assert.equal(rows.ruleColour, 'rule-dark');
  const cover = comp('statement', 1);
  const kids = cover.elements[0].children;
  assert.equal(kids[0].type, 'block'); assert.equal(kids[0].colour, 'primary');
  assert.deepEqual(kids.filter((e) => e.field === 'headline').map((e) => e.part), ['pre', 'phrase']);
  assert.equal(kids.find((e) => e.part === 'phrase').ink, 'accent-dark');
  const job = comp('list', 1);
  let title; walkEls(job.elements, (e) => { if (e.field === 'headline') title = e; });
  assert.equal(title.weight, 300);
  assert.ok(typesOf(job).includes('keyline'), 'the drawn phone');
  const card = comp('event', 0);
  assert.deepEqual(card.elements.filter((e) => e.type === 'box' && e.fill).map((e) => e.fill), ['primary', 'gold'], 'a two-colour footer');
  assert.ok(typesOf(card).includes('info-rows') && typesOf(card).includes('photo'));
  const app = comp('offer', 0);
  assert.equal(app.ground, 'paper');
  assert.ok(typesOf(app).includes('ribbon'));
  assert.equal(app.elements.find((e) => e.type === 'button').fill, 'gold', 'the date on a yellow pill');
  let pills = 0; for (const c of look.compositions) walkEls(c.elements, (e) => { if (e.pills) { pills++; assert.equal(e.pills.fill, 'gold'); } });
  assert.ok(pills >= 2, 'yellow highlight pills on headlines');
});

test('the test copy names every composition (sample, stress, minimal)', () => {
  const want = [], seen = {};
  for (const c of look.compositions) { const i = seen[c.kind] ?? 0; seen[c.kind] = i + 1; want.push(`studio/${c.kind}/${i}`); }
  for (const set of [NORMAL, STRESS, MINIMAL]) assert.deepEqual(Object.keys(set).sort(), want.sort());
});

// "Swipe" is drawn only on a carousel page that has a page after it: never on a single post, never on the last page.
const brand = () => { const b = loadBrand(); return { ...b, looks: [{ ...look, origin: 'copy:shipped:studio' }], style: { ...b.style, direction: 'studio' } }; };
const draw = (extra) => renderPostWithLook({ ...look, origin: 'copy:shipped:studio' }, { template: 'post', kind: 'statement', variant: 2, name: 'swipe', headline: 'Build *it.*' }, { size: SIZES.feed, brand: brand(), image: () => '', imageSize: () => null, ...extra }, { shipped: false }).body;
test('Swipe and its arrow show on a carousel page with a next page only', () => {
  const swipe = /Swipe <svg class="k-ic"/;
  assert.match(draw({ counter: { n: 1, total: 3 } }), swipe);
  assert.match(draw({ counter: { n: 2, total: 3 } }), swipe);
  assert.doesNotMatch(draw({ counter: { n: 3, total: 3 } }), /Swipe/);
  assert.doesNotMatch(draw({}), /Swipe/);
  assert.doesNotMatch(draw({ folio: { n: 1, total: 12 } }), /Swipe/, 'a place in a batch is not a carousel');
});

test('a pill keeps the punctuation right after it on its line', () => {
  const body = renderPostWithLook({ ...look, origin: 'copy:shipped:studio' }, { template: 'post', kind: 'statement', variant: 0, name: 'p', headline: 'Bring us [[a sketch]], we plan it' }, { size: SIZES.feed, brand: brand(), image: () => '', imageSize: () => null }, { shipped: false }).body;
  assert.match(body, /<span class="k-pl-stop"><span class="k-pl k-pl-soft k-pl-end"[^>]*><span class="k-pl-t" data-role="accent">a sketch<\/span><\/span><span class="k-pl-p">,<\/span><\/span>/);
});

test('the logo takes the ink of the page it sits on, also when a dark page turned light for a brand whose colour does not read on its dark', () => {
  // Pale Mill: its red does not read on its dark ground, so the one-accent pages on the dark ground are drawn on the cream paper instead
  const pale = { ...brand(), ...paletteBrand({ name: 'Pale Mill', light: '#F5F0E6', ink: '#2A2418', primary: '#9C3B16', gold: '#EADFC0', deep: '#9A7B2E' }) };
  const at = (b, kind, variant) => renderPostWithLook({ ...look, origin: 'copy:shipped:studio' }, { template: 'post', kind, variant, name: 'l', ...NORMAL[`studio/${kind}/${variant}`], image: 'design/assets/demo/object-jar.jpg' }, { size: SIZES.feed, brand: b, image: () => 'data:image/png;base64,iVBORw0KGgo=', imageSize: () => ({ w: 800, h: 600 }) }, { shipped: false }).body;
  const ground = (body) => /--bg:var\(--c-([a-z-]+)\)/.exec(body)[1];
  const logo = (body) => /<div class="abs k-logo"[^>]*>(<span class="[^"]*"|<img)/.exec(body)?.[1];
  for (const [kind, variant] of [['photo', 1], ['photo', 2], ['statement', 1], ['quote', 0]]) {
    const flipped = at(pale, kind, variant);
    assert.equal(ground(flipped), 'paper', `${kind}/${variant}: the dark page turned light`);
    assert.equal(logo(flipped), '<img', `${kind}/${variant}: the full-colour logo on the light page, not the light wordmark`);
  }
  // a page that stays on a colour keeps the light wordmark
  const red = at(pale, 'photo', 0);
  assert.equal(ground(red), 'field');
  assert.match(logo(red), /^<span class="logo-inv ly-logo"$/);
});

test('rows take their number and rule colours from the look; the ribbon is two clipped boxes across the corner', () => {
  const at = (kind, variant) => renderPostWithLook({ ...look, origin: 'copy:shipped:studio' }, { template: 'post', kind, variant, name: 'r', ...NORMAL[`studio/${kind}/${variant}`] }, { size: SIZES.feed, brand: brand(), image: () => '', imageSize: () => null }, { shipped: false }).body;
  const rows = at('list', 0);
  assert.match(rows, /background:var\(--c-rule-dark\)/, 'rules in the dark-page rule colour');
  assert.ok((rows.match(/color:var\(--c-muted-dark\)[^"]*"[^>]*>0[1-4]</g) ?? []).length === 4, 'four numbers in the dark-page grey');
  const app = at('offer', 0);
  const clips = app.match(/clip-path:polygon\([^)]*\)/g) ?? [];
  assert.equal(clips.length, 2, 'the band and its stripe');
  assert.match(clips[0], /^clip-path:polygon\(\d+px 0px,\d+px 0px,\d+px \d+px,\d+px \d+px\)$/);
});

const chrome = findChrome();
test('a carousel\'s first page with Swipe and the corner ribbon pass every check', { skip: chrome ? false : 'Google Chrome was not found' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-studio-'));
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    for (const [kind, variant] of [['list', 0], ['offer', 0]]) {
      const spec = { template: 'post', kind, variant, name: 'studio-check', ...NORMAL[`studio/${kind}/${variant}`] };
      await renderImage(browser, brand(), { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${kind}.png`), counter: { n: 1, total: 4 } }, { tmpDir: tmp });
    }
  } finally { browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});
