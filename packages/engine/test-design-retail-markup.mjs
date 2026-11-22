// node --test   (the retail direction's markup: what its builders may write, the addresses of its elements, and the fixture a data version of
// the same compositions will be proven against: the page body of every composition, drawn from sample, stress and minimal copy, in three sets
// of brand colours. The geometry and the measured sizes need Google Chrome and are skipped without it.)
//
// The fixture (testlib/retail-markup.json) holds hashes only, never markup: per case a sha256 of the page body (`markup`, with the element
// addresses data-el, and `markup-noel`, without them) and, for the sample copy, the rectangle of every addressed element rounded to a pixel
// (`geometry`). The body is compared exactly; the only things normalised are volatile ids (see stableMarkup in testlib/markup-fixture.mjs).
// Record it again, on purpose and after looking at the pictures, with:  VESK_RECORD_RETAIL=1 npm test --workspace @vesk/engine
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { buildPage } from './lib/design/page.mjs';
import { allCompositions, renderPost } from './lib/design/directions/index.mjs';
import { COLOUR_NAMES, NUDGE_MAX, makeContext, numberElements } from './lib/design/directions/kit.mjs';
import { DIRECTION_TOKENS } from './lib/design/directions/index.mjs';
import { preparePage } from './lib/design/render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';
import { HOSTILE, MINIMAL, NORMAL, STRESS, paletteBrand, retailSpec } from './testlib/retail-copy.mjs';
import { RETAIL_FIXTURE_FILE, dataFixture, markupFixture, markupHash, stableMarkup } from './testlib/markup-fixture.mjs';
import { postGeometry, sameGeometry } from './testlib/post-geometry.mjs';

const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const RETAIL = allCompositions().filter((c) => c.direction === 'retail').map((c) => c.comp);
const opts = { file: RETAIL_FIXTURE_FILE, recordEnv: 'VESK_RECORD_RETAIL' };
// The three sets of brand colours: the demo brand as it is, and two built here from colour values (a dark field; an accent that is almost the paper).
const COLOURS = {
  demo: {},
  dark: paletteBrand({ name: 'Night Kitchen', light: '#EFEAE0', ink: '#10151F', primary: '#1B2A41', gold: '#F2B84B', deep: '#8A5A00' }),
  pale: paletteBrand({ name: 'Pale Mill', light: '#F5F0E6', ink: '#2A2418', primary: '#9C3B16', gold: '#EADFC0', deep: '#9A7B2E' }),
};
const brandOf = (colours) => { const b = loadBrand(); return { ...b, ...COLOURS[colours], style: { ...b.style, direction: 'retail' } }; };
const ctxFor = (brand) => ({ size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 100, h: 100 }) });
const COPY = { sample: NORMAL, stress: STRESS, minimal: MINIMAL };
const hostileCopy = (comp, h) => Object.fromEntries(Object.entries({ label: h, headline: h, sub: h, big: h, unit: h, items: [h, h], quote: h, by: h, meta: h, tag: h }).filter(([f]) => comp.fields.includes(f)));
const drawn = (comp, copy, colours = 'demo') => renderPost(retailSpec(comp, copy), ctxFor(brandOf(colours)));
const body = (comp, colours) => drawn(comp, NORMAL[comp.id], colours).body;

// ---- the addresses of elements ----
test('numberElements: every marked element gets its index path among the marked children of its nearest marked ancestor', () => {
  const html = '<div data-el class="a"><span>skipped</span><i data-el aria-hidden="true"></i><div data-el><b data-el>t</b><img data-el src="x" alt=""><br></div></div><p data-el>x</p>';
  assert.equal(numberElements(html), '<div data-el="0" class="a"><span>skipped</span><i data-el="0.0" aria-hidden="true"></i><div data-el="0.1"><b data-el="0.1.0">t</b><img data-el="0.1.1" src="x" alt=""><br></div></div><p data-el="1">x</p>');
  // a value that looks like the marker is only a value
  assert.equal(numberElements('<div data-name=" data-el " data-el></div>'), '<div data-name=" data-el " data-el="0"></div>');
  assert.equal(numberElements('<div>no marks</div>'), '<div>no marks</div>');
  assert.throws(() => numberElements('<div data-el></span>'), /not well formed/);
});

test('retail: every element a builder made carries a data-el of digits and dots, unique, in document order, with its parents, and the same for sample and stress copy', () => {
  for (const comp of RETAIL) {
    const lists = {};
    // (a list's addresses depend on how many items it has, so its stress copy is cut to the sample's four)
    const stress = comp.id === 'retail/list/0' ? { ...STRESS[comp.id], items: STRESS[comp.id].items.slice(0, 4) } : STRESS[comp.id];
    for (const [name, copy] of Object.entries({ sample: NORMAL[comp.id], stress })) {
      const body = drawn(comp, copy).body;
      assert.ok(!/ data-el(?=[\s>])/.test(body.replace(/"[^"]*"/g, '""')), `${comp.id}: a bare data-el is left`);
      const els = [...body.matchAll(/ data-el="([^"]*)"/g)].map((m) => m[1]);
      assert.ok(els.length >= 3, `${comp.id}: elements are addressed`);
      lists[name] = els;
      const parts = els.map((e) => { assert.match(e, /^\d+(\.\d+)*$/, `${comp.id}: ${e}`); return e.split('.').map(Number); });
      assert.equal(new Set(els).size, els.length, `${comp.id}: unique`);
      for (let i = 1; i < parts.length; i++) {
        const a = parts[i - 1], b = parts[i];
        let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
        assert.ok(k < b.length && (k >= a.length || b[k] > a[k]) && (k < a.length || true), `${comp.id}: ${els[i - 1]} then ${els[i]} is not document order`);
      }
      for (const e of els) { const up = e.split('.').slice(0, -1).join('.'); if (up) assert.ok(els.includes(up), `${comp.id}: ${e} has no parent ${up}`); }
    }
    assert.deepEqual(lists.sample, lists.stress, `${comp.id}: the addresses do not depend on the words`);
  }
});

// ---- no free CSS, class or attribute from a composition ----
test('retail: no composition passes a free style, class or attribute string to a builder (source and run time)', () => {
  const src = fs.readFileSync(fileURLToPath(new URL('./lib/design/directions/retail/compositions.mjs', import.meta.url)), 'utf8').replace(/\/\/.*$/gm, '');
  assert.deepEqual([...src.matchAll(/\b(extra|cls|attrs)\s*:/g)].map((m) => m[1]), [], 'extra, cls and attrs are gone from the retail compositions');
  const brand = brandOf('demo');
  const c = makeContext({ spec: { headline: 'x' }, brand, tokens: DIRECTION_TOKENS.retail, direction: 'retail', kind: 'statement', variant: 0, comp: {}, size: SIZES.feed, image: () => PIXEL });
  for (const build of [(o) => c.box(o, ''), (o) => c.type({ ...o, html: c.text('headline'), size: 20 }), (o) => c.run({ ...o, text: 'x', size: 20 }), (o) => c.fitLines({ ...o, w: 100, h: 100, cap: 50, floor: 20 }), (o) => c.shape(o, ''), (o) => c.glyph({ ...o, text: 'x', size: 9 })]) {
    for (const k of ['extra', 'cls', 'attrs']) assert.throws(() => build({ [k]: 'x' }), new RegExp(`takes no "${k}"`));
  }
  // the validated replacements: a variant by name, a nudge within bounds, flags and ids
  assert.throws(() => c.box({ variant: 'sticker; x', w: 1 }, ''), /not a variant/);
  assert.match(c.box({ variant: 'sticker', nudge: { x: 6, y: -6 }, flexNone: true, alignSelf: 'stretch', minH: 5 }, ''), /rt-sticker/);
  assert.throws(() => c.box({ nudge: { x: NUDGE_MAX + 1 } }, ''), /within/);
  assert.throws(() => c.box({ nudge: { y: NaN } }, ''), /finite/);
  assert.throws(() => c.box({ nudge: 'margin:0' }, ''), /nudge/);
  assert.throws(() => c.box({ alignSelf: 'baseline; x' }, ''), /alignSelf/);
  assert.throws(() => c.box({ slant: -1 }, ''), /slant/);
  assert.throws(() => c.type({ html: c.text('headline'), size: 20, key: 'a b' }), /key must be an id/);
  assert.throws(() => c.type({ html: c.text('headline'), size: 20, follow: '1x' }), /follow must be an id/);
  assert.throws(() => c.type({ html: c.text('headline'), size: 20, dropSub: { key: 'a', lines: 0 } }), /dropSub/);
  assert.throws(() => c.type({ html: c.text('headline'), steps: [10, 20] }), /descending/);
  assert.throws(() => c.type({ html: c.text('headline'), steps: [20] }), /2 to 8/);
  assert.throws(() => c.type({ html: c.text('headline'), steps: [20, 10], maxLines: 99 }), /maxLines/);
  assert.throws(() => c.type({ html: c.text('headline'), steps: [20, 10], maxH: 'a;b' }), /finite number/);
  assert.match(c.type({ html: c.text('headline'), steps: [20, 10], maxLines: 2, maxH: 'slot', split: true, band: true, key: 'k', follow: 'k', dropSub: { key: 'k', lines: 3 } }), /data-steps="20,10" data-maxlines="2" data-maxh="slot"/);
  assert.throws(() => c.fitLines({ w: 'fit; x', h: 'auto', cap: 5, floor: 1 }), /finite number/);
  assert.throws(() => c.fitLines({ w: 100, h: 'auto', cap: 5, floor: 1, valign: 'top' }), /valign/);
  assert.throws(() => c.fitLines({ w: 100, h: 100, cap: 5, floor: 1, valign: 'center' }), /needs y/);
});

// every inline style a retail page writes: a fixed set of properties, each with a value of a fixed shape
const NUM = '-?\\d+(?:\\.\\d+)?', PXV = `${NUM}px`, NAME = `(?:${COLOUR_NAMES.join('|')})`, VAR = `var\\(--c-${NAME}\\)`;
const SHADOW = `(?:0 0 0 ${PXV} ${VAR}|${PXV} ${PXV} 0 ${VAR})`;
const GRAMMAR = {
  left: PXV, top: PXV, right: PXV, bottom: PXV, width: PXV, height: PXV, 'min-height': `(?:0|${PXV})`, 'margin-left': PXV, 'margin-top': PXV, gap: PXV, inset: '0',
  padding: `${PXV}(?: ${PXV}){0,3}`, 'border-radius': PXV, border: `${PXV} (?:solid|dashed) ${VAR}`,
  'font-size': `(?:${PXV}|calc\\(${NUM}px\\*var\\(--hs,1\\)\\*var\\(--h-scale,1\\)\\))`, 'font-family': 'var\\(--f-(?:display|text|label|mono)\\)', 'font-weight': NUM, 'line-height': NUM, 'letter-spacing': `${NUM}em`,
  color: VAR, background: VAR, 'box-shadow': `${SHADOW}(?:,${SHADOW})*`,
  transform: `rotate\\(${NUM}deg\\)`, 'transform-origin': `(?:center|left bottom|left top|right bottom|right top|${NUM}% ${NUM}%)`,
  'clip-path': `polygon\\(${NUM}(?:px)? ${NUM}(?:px)?(?:,${NUM}(?:%|px)? ${NUM}(?:%|px)?){3}\\)`,
  display: '(?:block|flex|none)', 'flex-direction': '(?:column|row)', 'justify-content': '(?:center|flex-end|flex-start|space-between)', 'align-items': '(?:center|flex-start|flex-end)', 'align-self': '(?:stretch|flex-start|flex-end|center)',
  flex: `(?:none|${NUM} 1 0)`, 'text-align': '(?:left|center|right)', 'text-transform': 'uppercase', 'white-space': 'nowrap', 'object-position': `${NUM}% ${NUM}%`,
};
const RULES = Object.fromEntries(Object.entries(GRAMMAR).map(([k, v]) => [k, new RegExp(`^${v}$`)]));
const styleProblems = (body) => {
  const bad = [];
  for (const m of body.matchAll(/ style="([^"]*)"/g)) {
    if (m[1].startsWith('--bg:')) { rootProblems(m[1], bad); continue; }
    for (const d of m[1].split(';').filter(Boolean)) {
      const i = d.indexOf(':'), prop = d.slice(0, i), val = d.slice(i + 1);
      if (!Object.hasOwn(RULES, prop)) bad.push(`property ${prop}`);
      else if (!RULES[prop].test(val)) bad.push(`${prop}: ${val.slice(0, 60)}`);
    }
  }
  return bad;
};
// the page's root: custom properties only (the background, the palette, the fonts, the grain)
const rootProblems = (style, bad) => {
  for (const d of style.replace(/url\(data:image\/svg\+xml,[%0-9A-Za-z._~-]*\)/, 'url(GRAIN)').split(';').filter(Boolean)) {
    const i = d.indexOf(':'), prop = d.slice(0, i), val = d.slice(i + 1);
    const ok = (prop === '--bg' && new RegExp(`^var\\(--c-${NAME}\\)$`).test(val)) || (/^--c-[a-z-]+$/.test(prop) && /^(#[0-9a-f]{6}|rgba\(\d+,\d+,\d+,[\d.]+\))$/i.test(val))
      || (/^--f-(display|text|label|mono)$/.test(prop) && /^[A-Za-z0-9 ',()_-]+$/.test(val)) || (prop === '--k-grain' && val === 'url(GRAIN)');
    if (!ok) bad.push(`root ${prop}: ${val.slice(0, 60)}`);
  }
};

test('retail: every style attribute of every composition, drawn from sample, stress, minimal and hostile copy, is in the allow-list grammar', () => {
  let styles = 0;
  for (const comp of RETAIL) {
    const copies = [NORMAL[comp.id], STRESS[comp.id], MINIMAL[comp.id], ...HOSTILE.map((h) => hostileCopy(comp, h))];
    for (const copy of copies) {
      for (const colours of ['demo', 'dark', 'pale']) {
        const body = drawn(comp, copy, colours).body;
        assert.deepEqual(styleProblems(body), [], `${comp.id} ${JSON.stringify(copy).slice(0, 50)}`);
        // in the tags (the words are text there, and may say anything): no url or script reference outside the grain and the picture
        const tags = [...body.matchAll(/<[^>]*>/g)].map((t) => t[0]).join('').replace(/--k-grain:url\(data:image\/svg\+xml,[%0-9A-Za-z._~-]*\)/, '').replace(/ src="data:image\/png;base64,[^"]*"/g, '');
        assert.ok(!/url\(|expression|javascript:|@import/i.test(tags), `${comp.id}: a url or a script reference outside the grain and the picture`);
        styles += (body.match(/ style="/g) ?? []).length;
      }
    }
  }
  assert.ok(styles > 1000, `${styles} style attributes were read`);
  // the grammar itself refuses what it should
  for (const bad of [' style="color:red"', ' style="background:url(x)"', ' style="left:1px;background:var(--c-x)"', ' style="font-family:Arial"', ' style="width:calc(1px+2px)"', ' style="left:1px;evil:1"', ' style="transform:rotate(1deg) scale(3)"']) assert.ok(styleProblems(`<div${bad}></div>`).length, bad);
});

// ---- the fixture ----
const CASES = RETAIL.flatMap((comp) => Object.keys(COPY).flatMap((copy) => Object.keys(COLOURS).map((colours) => ({ comp, copy, colours, id: `${comp.id}|${copy}|${colours}` }))));
test('retail fixture: the page body of every composition, in sample, stress and minimal copy and three sets of brand colours, is the recorded one', () => {
  const withEl = markupFixture('markup', opts), noEl = markupFixture('markup-noel', opts);
  assert.equal(CASES.length, 81, '9 compositions x 3 copies x 3 colour sets');
  for (const { comp, copy, colours, id } of CASES) {
    const body = drawn(comp, COPY[copy][comp.id], colours).body;
    withEl.check(id, stableMarkup(body), id);
    noEl.check(id, stableMarkup(body, { noEl: true }), id);
  }
  withEl.done();
  noEl.done();
});

test('retail fixture: the markup of a case depends on the words and the colours, so the fixture can tell cases apart', () => {
  const hashes = new Set(CASES.map(({ comp, copy, colours }) => markupHash(stableMarkup(drawn(comp, COPY[copy][comp.id], colours).body))));
  assert.equal(hashes.size, CASES.length, 'no two cases draw the same page');
  const ids = stableMarkup('<svg><path id="a-1"/><use href="#a-1"/></svg><i style="fill:url(#a-1)" data-el="0.1"></i>');
  assert.equal(ids, '<svg><path id="~"/><use href="#~"/></svg><i style="fill:url(#~)" data-el="0.1"></i>');
  assert.equal(stableMarkup('<i data-el="0.1" id="x"></i>', { noEl: true }), '<i id="~"></i>');
  assert.equal(stableMarkup('<i class="a b" style="left:1px">words</i>'), '<i class="a b" style="left:1px">words</i>', 'nothing but ids is touched');
});

// ---- in Chrome ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-retail-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(tmp, 'design.lock') }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('retail fixture: the geometry of every addressed element of the sample copy, in three sets of brand colours, is the recorded one (within 1 px)', { skip }, async () => {
  const fx = dataFixture('geometry', opts);
  for (const comp of RETAIL) {
    for (const colours of Object.keys(COLOURS)) {
      const id = `${comp.id}|sample|${colours}`;
      const rects = await postGeometry(browser, brandOf(colours), retailSpec(comp, NORMAL[comp.id]));
      assert.ok(rects.length >= 3, id);
      assert.deepEqual(rects.map((r) => r[0]), [...body(comp, colours).matchAll(/ data-el="([^"]*)"/g)].map((m) => m[1]), `${id}: a rectangle for every address, in order`);
      fx.check(id, rects, { same: sameGeometry, message: id });
    }
  }
  fx.done();
});

test('retail: stepped headlines are set at the size the page measures, the prototype\'s for its normal and stress copy; a following numeral takes the same size', { skip }, async () => {
  const steps = async (comp, copy) => {
    const prep = preparePage(brandOf('demo'), { spec: normaliseDesign(retailSpec(comp, copy)), sizeName: 'feed' });
    const page = await browser.page(1080, 1350);
    try {
      await page.setContent(buildPage({ brand: brandOf('demo'), size: SIZES.feed, ...prep.out }));
      await page.evaluate('window.__ds.ready({})');
      await page.evaluate('window.__ds.fitLines()');
      return JSON.parse(await page.evaluate('JSON.stringify([...document.querySelectorAll("[data-step],[data-follow]")].map((e) => [e.dataset.step, e.style.fontSize, e.dataset.follow || ""]))'));
    } finally { await page.close(); }
  };
  const by = (id) => RETAIL.find((c) => c.id === id);
  const want = {
    'retail/list/0': ['140', '126'], 'retail/quote/0': ['164', '92'], 'retail/photo/1': ['113.4', '103.32'], 'retail/event/0': ['116', '104.4'], 'retail/offer/0': ['150', '123'],
  };
  for (const [id, [normal, stress]] of Object.entries(want)) {
    assert.equal((await steps(by(id), NORMAL[id]))[0][0], normal, `${id} normal copy`);
    assert.equal((await steps(by(id), STRESS[id]))[0][0], stress, `${id} stress copy`);
  }
  // a short headline takes the first step (the prototype's tier for a short text)
  assert.equal((await steps(by('retail/offer/0'), MINIMAL['retail/offer/0']))[0][0], '172.5');
  // the poster's date numeral takes the headline's size
  const ev = await steps(by('retail/event/0'), STRESS['retail/event/0']);
  assert.equal(ev.length, 2);
  assert.equal(ev[1][2], 'ev-h');
  assert.equal(ev[1][1], ev[0][1], 'same font size as the headline');
});

test('retail: a fitted line in its flex slot (h: auto) is measured, not estimated: the longer the sub, the less room the headline has', { skip }, async () => {
  const stack = RETAIL.find((c) => c.id === 'retail/statement/0');
  const room = async (copy) => {
    const prep = preparePage(brandOf('demo'), { spec: normaliseDesign(retailSpec(stack, copy)), sizeName: 'feed' });
    const page = await browser.page(1080, 1350);
    try {
      await page.setContent(buildPage({ brand: brandOf('demo'), size: SIZES.feed, ...prep.out }));
      await page.evaluate('window.__ds.ready({})');
      const fit = await page.evaluate('window.__ds.fitLines()');
      const at = JSON.parse(await page.evaluate('JSON.stringify((() => { const f = document.querySelector("[data-fitlines]"), r = f.getBoundingClientRect(), sub = document.querySelector("[data-role=sub]"); return { top: r.top, bottom: r.bottom, subTop: sub ? sub.getBoundingClientRect().top : null, h: f.dataset.h }; })())'));
      return { fit, ...at };
    } finally { await page.close(); }
  };
  const short = await room({ headline: 'Hello *you*', sub: 'One line.' });
  const long = await room({ headline: 'Hello *you*', sub: 'A sub line long enough to take three lines of the stack at its designed measure, so the room for the headline shrinks by what the sub really takes.' });
  assert.equal(short.h, 'auto');
  assert.ok(short.fit[0].ok && long.fit[0].ok);
  assert.ok(long.bottom < short.bottom - 30, `the headline's slot shrank by what the longer sub took: ${short.bottom} to ${long.bottom}`);
  assert.ok(Math.abs(long.subTop - long.bottom - 44) <= 2 || long.subTop - long.bottom >= 44, 'the sub sits 44 px under the headline slot');
});
