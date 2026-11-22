// node --test   (design directions and the `post` template: the brand's direction, the post's design block, the composition registry,
// hostile words through every composition, the variant choice, the font library, the new checks and the fit-to-width headline. The
// renders at the end need Google Chrome and are skipped without it.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, brandFile } from './lib/core.mjs';
import { STYLE_DEFAULTS, DIRECTIONS, POST_KINDS } from './lib/design/tokens.mjs';
import { loadBrand, loadDirection, resolveStyle, styleProblems, validateBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { POST_LIMITS, explainFitLines, explainPostFit, explainPostProblems, findPostProblems, shorterLength } from './lib/design/checks.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { allCompositions, chooseVariant, compositionsFor, fontNeeds, registryProblems, renderPost, DIRECTION_TOKENS, REGISTRY } from './lib/design/directions/index.mjs';
import { Markup, emphasisParts, grainUri, m, makeContext, rootCss } from './lib/design/directions/kit.mjs';
import { ACCENT_TYPE_MAX_SHIFT, contrast, onColour, palette, paletteFacts, textSafe } from './lib/design/directions/colour.mjs';
import { fontFacesFor, fontLibrary, inRange, libraryProblems } from './lib/design/font-library.mjs';
import { buildPage } from './lib/design/page.mjs';
import { POST_FIELDS, POST_ITEMS, POST_REQUIRED } from './lib/design/post-spec.mjs';
import { preparePage, renderImage } from './lib/design/render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseDesign, validateDesign } from './lib/design/spec.mjs';
import { designBlockProblems } from './lib/design-render.mjs';
import { esc } from './design/templates/common.mjs';
import { HOSTILE, NORMAL, PALETTES, PICS, STRESS, paletteBrand, retailSpec } from './testlib/retail-copy.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brandWith = (direction, extra = {}) => { const b = loadBrand(); return { ...b, ...extra, style: { ...b.style, ...(direction ? { direction } : {}) } }; };
const has = (errs, frag) => errs.some((e) => e.includes(frag));
// A design with every field a post can have, drawn from `fill`.
const full = (kind, fill = (f) => `${f} words`) => ({
  template: 'post', kind, label: fill('label'), headline: fill('headline'), sub: fill('sub'), big: fill('big'), unit: fill('unit'), items: [fill('item one'), fill('item two')],
  quote: fill('quote'), by: fill('by'), meta: fill('meta'), tag: fill('tag'), image: 'design/assets/demo/object-jar.jpg',
});
const ctxFor = (b) => ({ size: SIZES.feed, brand: b, image: () => PIXEL, imageSize: () => ({ w: 100, h: 100 }) });

// ---- the brand's direction ----
test('brand.json style.direction is one of the fixed list, and absent means none (the defaults are unchanged)', () => {
  assert.deepEqual(DIRECTIONS, ['editorial', 'swiss', 'retail']);
  for (const d of DIRECTIONS) assert.deepEqual(validateBrand({ ...RAW, style: { direction: d } }), [], d);
  for (const bad of ['brutalist', 'Editorial', '', 5, null, ['swiss'], 'swiss";}</style><script>']) {
    const errs = validateBrand({ ...RAW, style: { direction: bad } });
    assert.ok(has(errs, 'style.direction must be one of editorial, swiss, retail'), JSON.stringify(bad));
  }
  assert.deepEqual(styleProblems({ direction: 'swiss', surface: 'flat' }), []);
  assert.deepEqual(resolveStyle(undefined), JSON.parse(JSON.stringify(STYLE_DEFAULTS)));
  assert.deepEqual(resolveStyle({ surface: 'flat' }).direction, undefined);
  assert.equal(resolveStyle({ direction: 'retail' }).direction, 'retail');
  assert.equal(loadDirection(), null, 'the demo pack names no direction');
});

// ---- the post design block ----
test('a post design: kinds, required fields, limits, unknown keys, variant, feed only, and no direction', () => {
  const ok = (d, o) => validateDesign({ template: 'post', ...d }, 'p', { direction: 'swiss', ...o });
  const cases = {
    statement: { headline: 'A line' }, figure: { big: '74%' }, list: { headline: 'Three', items: ['a', 'b'] }, quote: { quote: 'Said' },
    photo: { image: 'a.jpg', headline: 'Look' }, event: { headline: 'Night', meta: '12 Dec' }, offer: { headline: 'Half', tag: '-50%' },
  };
  assert.deepEqual(Object.keys(cases), POST_KINDS);
  for (const [kind, f] of Object.entries(cases)) {
    assert.deepEqual(ok({ kind, ...f }), [], kind);
    for (const need of POST_REQUIRED[kind]) { const { [need]: _, ...rest } = f; assert.ok(has(ok({ kind, ...rest }), `a ${kind} post needs ${need}`), `${kind} without ${need}`); }
  }
  assert.ok(has(ok({ kind: 'poster', headline: 'x' }), 'kind must be one of'));
  assert.ok(has(ok({ headline: 'x' }), 'kind must be one of'));
  // limits, counted on what is seen (asterisks and line breaks do not count)
  for (const [f, { max }] of Object.entries(POST_FIELDS)) {
    assert.deepEqual(ok({ kind: 'statement', headline: 'x', [f]: 'a'.repeat(max) }, {}).filter((e) => e.includes(`${f} is`)), [], `${f} at its limit`);
    assert.ok(has(ok({ kind: 'statement', headline: 'x', [f]: 'a'.repeat(max + 1) }), `${f} is ${max + 1} characters; the most is ${max}`), f);
  }
  assert.deepEqual(ok({ kind: 'statement', headline: `*${'a'.repeat(70)}*` }), []);
  assert.ok(has(ok({ kind: 'statement', headline: 'x', label: 'two\nlines' }), 'label must be one line'));
  assert.ok(has(ok({ kind: 'list', headline: 'x', items: ['one'] }), `items must be a list of ${POST_ITEMS.min} to ${POST_ITEMS.max}`));
  assert.ok(has(ok({ kind: 'list', headline: 'x', items: ['a', 'b', 'c', 'd', 'e', 'f'] }), 'items must be a list'));
  assert.ok(has(ok({ kind: 'list', headline: 'x', items: ['a', 'b'.repeat(45)] }), 'items[1] is 45 characters; the most is 44'));
  assert.ok(has(ok({ kind: 'list', headline: 'x', items: ['a', 7] }), 'items[1] must be a non-empty text'));
  // unknown keys are refused, naming the field
  const odd = ok({ kind: 'statement', headline: 'x', colour: 'red', 'on"click': 1 });
  assert.ok(has(odd, '"colour" is not a field of a post') && has(odd, '"on"click" is not a field of a post'), odd.join('|'));
  assert.ok(has(ok({ kind: 'statement', headline: 'x', layout: 'a' }), '"layout" is not a field of a post'));
  // the variant, the picture, the focal point and the zoom
  for (const v of [0, 1, 9]) assert.deepEqual(ok({ kind: 'statement', headline: 'x', variant: v }), []);
  for (const v of [-1, 10, 1.5, '0', null, NaN]) assert.ok(has(ok({ kind: 'statement', headline: 'x', variant: v }), 'variant must be a whole number from 0 to 9'), String(v));
  assert.ok(has(ok({ kind: 'photo', headline: 'x', image: 'a.svg' }), 'must be .jpg') && has(ok({ kind: 'photo', headline: 'x', image: 5 }), 'image must be a file path'));
  assert.ok(has(ok({ kind: 'photo', headline: 'x', image: 'a.jpg', focal: '50%;x' }), 'focal must look like') && has(ok({ kind: 'photo', headline: 'x', image: 'a.jpg', zoom: 4 }), 'zoom must be a number from 1 to 3'));
  assert.deepEqual(ok({ kind: 'photo', headline: 'x', image: 'a.jpg', focal: { x: 0.2, y: 0.8 }, zoom: 1.5, name: 'a-b', sizes: ['feed'] }), []);
  // feed only
  assert.ok(has(ok({ kind: 'statement', headline: 'x', sizes: ['square'] }), 'post is made for the feed format (1080x1350) only'));
  // no direction: refused, with the way out
  const none = validateDesign({ template: 'post', kind: 'statement', headline: 'x' }, 'p', { direction: null });
  assert.ok(has(none, 'this brand has none; set style.direction in brand.json to one of editorial, swiss, retail'), none.join('|'));
  assert.deepEqual(validateDesign({ template: 'post', kind: 'statement', headline: 'x' }, 'p'), [], 'without a brand to ask, only the design is judged');
  assert.ok(has(designBlockProblems({ template: 'post', kind: 'statement', headline: 'x' }), 'design direction'), 'the demo pack has no direction');
  // a carousel may be made of post pages (judged against the look when a brand is given; see test-design-post-carousel.mjs),
  // but post pages and the older templates never mix, and the older templates are as they were
  assert.deepEqual(validateDesign({ template: 'carousel', pages: [{ template: 'post', kind: 'statement', headline: 'x' }, { template: 'post', kind: 'statement', headline: 'x' }] }, 'c'), []);
  assert.ok(validateDesign({ template: 'carousel', pages: [{ template: 'post', kind: 'statement', headline: 'x' }, { template: 'closing' }] }, 'c').length);
  assert.deepEqual(validateDesign({ template: 'photo', image: 'a.jpg', headline: 'x' }, 'p'), []);
  assert.deepEqual(normaliseDesign({ template: 'post', kind: 'statement', headline: 'x' }).sizes, ['feed']);
});

// ---- the registry, the variant choice, the fonts ----
test('the registry is consistent, every direction has tokens, and a composition can be added by listing it', () => {
  assert.deepEqual(registryProblems(), []);
  for (const d of DIRECTIONS) {
    assert.ok(DIRECTION_TOKENS[d].margin && DIRECTION_TOKENS[d].grid.cols && DIRECTION_TOKENS[d].fonts.display && typeof DIRECTION_TOKENS[d].folio === 'function', d);
    assert.ok(compositionsFor(d, 'statement').length >= 1, `${d} has a statement composition`);
  }
  assert.deepEqual(compositionsFor('nope', 'statement'), []);
  assert.deepEqual(compositionsFor('swiss', '__proto__'), []);
  assert.deepEqual(allCompositions().filter((c) => c.variant === 0 && c.kind === 'statement').map((c) => c.comp.id).sort(), ['editorial/statement/0', 'retail/statement/0', 'swiss/statement/0']);
});

test('the variant a post gets when it names none is stable, depends on its words, and spreads over the variants', () => {
  const spec = (h) => ({ kind: 'statement', headline: h, name: 'n' });
  assert.equal(chooseVariant(spec('x'), 1), 0);
  assert.equal(chooseVariant(spec('x'), 3), chooseVariant(spec('x'), 3));
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(chooseVariant(spec(`headline ${i}`), 3));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.equal(chooseVariant({ ...spec('x'), variant: 2 }, 3), chooseVariant(spec('x'), 3), 'the variant field itself is not part of the seed');
  // a named variant the direction does not have is refused, and says how many it has
  const b = brandWith('swiss');
  assert.throws(() => renderPost({ template: 'post', kind: 'statement', headline: 'x', variant: 7 }, ctxFor(b)), (e) => e instanceof DesignError && /swiss direction has \d+ statement variants? \(0 to \d+\), not 7/.test(e.message));
  assert.throws(() => renderPost({ template: 'post', kind: 'statement', headline: 'x' }, ctxFor(brandWith(null))), (e) => e instanceof DesignError && /has none: set style.direction/.test(e.message));
});

test('the font library lists real files, and a page embeds only the files it uses', () => {
  assert.deepEqual(libraryProblems(), []);
  assert.deepEqual(fontLibrary().map((f) => f.family).sort(), ['Anton', 'Archivo', 'Fraunces', 'Hanken Grotesk', 'Inter', 'JetBrains Mono', 'Source Serif 4']);
  assert.ok(inRange('U+0000-00FF, U+0131', 0x41) && inRange('U+0000-00FF, U+0131', 0x131) && !inRange('U+0000-00FF, U+0131', 0x141) && inRange('U+00??', 0xAB));
  const only = (needs, text) => fontFacesFor(needs, text).files.map((f) => f.file);
  assert.deepEqual(only([{ family: 'Fraunces', style: 'normal', weights: [300] }], 'Coffee'), ['fraunces-v38-normal-latin.woff2']);
  assert.deepEqual(only([{ family: 'Fraunces', style: 'italic', weights: [300] }], 'Coffee'), ['fraunces-v38-italic-latin.woff2']);
  assert.deepEqual(only([{ family: 'Fraunces', style: 'normal', weights: [300] }], 'Łódź').sort(), ['fraunces-v38-normal-latin-ext.woff2', 'fraunces-v38-normal-latin.woff2']);
  assert.throws(() => fontFacesFor([{ family: 'Source Serif 4', style: 'italic', weights: [600] }]), /no file for the weights 600/);
  assert.throws(() => fontFacesFor([{ family: 'Comic Sans', weights: [400] }]), /no family/);
  const css = fontFacesFor([{ family: 'Archivo', weights: [900] }], 'x').css;
  assert.match(css, /font-family:"VF Archivo";src:url\("data:font\/woff2;base64,/);
  assert.match(css, /font-stretch:62% 125%/);
  // whole pages
  const files = (direction, kind = 'statement') => renderPost({ template: 'post', kind, headline: 'Coffee', sub: 'plain', label: 'Hi' }, ctxFor(brandWith(direction))).post.fonts.map((f) => f.family);
  assert.deepEqual([...new Set(files('swiss'))].sort(), ['Hanken Grotesk', 'JetBrains Mono']);
  assert.deepEqual([...new Set(files('editorial'))].sort(), ['Fraunces', 'Inter', 'Source Serif 4']);
  assert.deepEqual([...new Set(files('retail'))], ['Archivo']);
  const page = renderPost({ template: 'post', kind: 'statement', headline: 'Coffee' }, ctxFor(brandWith('swiss')));
  assert.ok(!page.css.includes('VF Fraunces') && !page.css.includes('VF Archivo') && !page.css.includes('latin-ext'));
  assert.ok(page.post.fonts.every((f) => f.subset === 'latin'));
  assert.ok(renderPost({ template: 'post', kind: 'statement', headline: 'Łódź' }, ctxFor(brandWith('swiss'))).post.fonts.some((f) => f.subset === 'latin-ext'));
});

test('a brand with its own display or label font keeps it; the direction supplies the rest', () => {
  const own = { font: { ...loadBrand().font, display: 'Brand Display' } };
  const b = brandWith('editorial', own);
  const needs = fontNeeds(DIRECTION_TOKENS.editorial, compositionsFor('editorial', 'statement')[0], b);
  assert.ok(!needs.some((n) => n.family === 'Fraunces'), 'no Fraunces when the brand brought a display font');
  assert.ok(needs.some((n) => n.family === 'Source Serif 4'));
  const root = rootCss({ palette: palette(b), tokens: DIRECTION_TOKENS.editorial, brand: b, grain: grainUri() });
  assert.match(root, /--f-display:var\(--display\),'VF Fraunces'/);
  assert.match(root, /--f-text:'VF Source Serif 4'/);
  assert.ok(!root.includes('"'), 'nothing in the root style can end its attribute');
});

test('the palette is worked out from the brand: type on the field reaches the brand\'s own contrast target', () => {
  for (const b of [brandWith('swiss'), brandWith('retail', { accents: { ...loadBrand().accents, primary: '#7ec8e3' } }), brandWith('editorial', { accents: { ...loadBrand().accents, primary: '#f4d35e', gold: '#f4d35e' } })]) {
    const p = palette(b, 7);
    assert.ok(contrast(p.field, p.onField) >= 7, `${p.field} / ${p.onField}`);
    assert.ok(contrast(p.paper, p.accentText) >= 4.5, 'the accent that carries type reads on paper');
    assert.ok(contrast(p.paper, p.body) >= 7);
    // the contract: palette() holds colour roles ONLY, every one a string that is a hex or an rgba colour ...
    for (const [k, v] of Object.entries(p)) { assert.equal(typeof v, 'string', `palette().${k} is a colour string`); assert.match(v, /^(#[0-9a-f]{6}|rgba\([\d.,]+\))$/i, k); }
    // ... and the non-colour facts are a separate, small, documented set with their own types
    const facts = paletteFacts(b);
    assert.deepEqual(Object.keys(facts).sort(), ['accentInk', 'accentShift']);
    assert.equal(typeof facts.accentInk, 'boolean');
    assert.ok(typeof facts.accentShift === 'number' && Number.isFinite(facts.accentShift) && facts.accentShift >= 0);
    assert.equal(facts.accentInk, facts.accentShift > ACCENT_TYPE_MAX_SHIFT, 'accentInk follows the shift limit');
    if (facts.accentInk) assert.equal(p.accentType, p.ink, 'an accent that cannot carry type leaves the type in the ink');
  }
});

// ---- hostile words ----
const ALLOWED_ATTRS = /^(class|style|data-[a-z-]+|aria-hidden|aria-label|src|alt|role)$/;
function attributeNames(html) {
  const names = [];
  for (const mt of html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g)) {
    for (const a of mt[2].matchAll(/\s+([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g)) names.push(a[1]);
  }
  return names;
}
const TAGS = new Set(['div', 'span', 'i', 'em', 'b', 'img', 'br', 'script']);

test('hostile words in every field of every composition end up inert: escaped text only, no new tag, no new attribute', () => {
  assert.ok(allCompositions().length >= 3);
  for (const { direction, kind, comp } of allCompositions()) {
    for (const h of HOSTILE) {
      const spec = full(kind, () => h);
      const out = renderPost(spec, ctxFor(brandWith(direction)));
      const html = buildPage({ brand: brandWith(direction), size: SIZES.feed, ...out });
      const where = `${comp.id} / ${h}`;
      const body = out.body;
      assert.ok(!/<script|<svg|<style|<iframe|<object/i.test(body.replace(/<i class="k-gr"><\/i>/g, '')), `${where}: a tag came from the words`);
      for (const t of body.matchAll(/<([a-zA-Z][\w-]*)/g)) assert.ok(TAGS.has(t[1]), `${where}: <${t[1]}>`);
      for (const a of attributeNames(body)) assert.ok(ALLOWED_ATTRS.test(a), `${where}: attribute ${a}`);
      // the only script in the page is the engine's runtime, under a nonce
      assert.equal((html.match(/<script/g) ?? []).length, 1, where);
    }
  }
});

test('hostile pictures, labels and names: the picture path and the brand name are escaped wherever they are written', () => {
  const b = { ...brandWith('editorial'), name: '"><img src=x onerror=1> Acme' };
  for (const direction of DIRECTIONS) {
    const bb = { ...b, style: { ...b.style, direction } };
    const out = renderPost({ ...full('statement'), image: '"><script>alert(1)</script>.jpg' }, { ...ctxFor(bb) });
    assert.ok(!out.body.includes('"><script>') && !out.body.includes('"><img'), direction);
    assert.ok(!/<img src=x/.test(out.body) && !out.css.includes('<script'));
  }
});

test('Markup: a builder takes escaped words only, never a plain string', () => {
  const b = brandWith('swiss'), c = makeContext({ spec: { headline: 'x', image: 'a.jpg' }, brand: b, tokens: DIRECTION_TOKENS.swiss, direction: 'swiss', kind: 'statement', variant: 0, comp: {}, size: SIZES.feed, image: () => PIXEL });
  assert.throws(() => c.type({ role: 'sub', html: '<b>raw</b>', x: 1, y: 1, size: 20 }), /must be Markup/);
  assert.throws(() => c.type({ role: 'sub', html: new Markup('<b>trusted</b>'), x: NaN, y: 1, size: 20 }), /finite number/);
  assert.throws(() => c.type({ role: 'sub', html: m`ok`, x: 1, y: 1, size: 20, colour: 'red;background:url(x)' }), /not a palette colour/);
  assert.throws(() => c.type({ role: 'sub', html: m`ok`, x: 1, y: 1, size: 20, variant: 'a" onload="x' }), /not a variant/);
  // no builder takes a free style, class or attribute string any more
  for (const [k, v] of [['cls', 'a" onload="x'], ['extra', 'background:url(x)'], ['attrs', 'onclick="x"']]) assert.throws(() => c.type({ role: 'sub', html: m`ok`, x: 1, y: 1, size: 20, [k]: v }), new RegExp(`takes no "${k}"`), k);
  assert.throws(() => c.box({ x: 0, y: 0, w: 1, h: 1, extra: 'x:y' }, ''), /takes no "extra"/);
  assert.throws(() => c.type({ role: 'evil', html: m`ok`, x: 1, y: 1, size: 20 }), /role/);
  assert.throws(() => c.photo({ x: 0, y: 0, w: 1, h: 1, treat: ['evil'] }), /./);
  assert.equal(String(m`a ${'<b>'} ${new Markup('<i>')}`), 'a &lt;b&gt; <i>');
  assert.equal(String(c.text('headline')), 'x');
  assert.equal(c.chars('headline'), 1);
  assert.match(c.type({ role: 'sub', text: '<x>', x: 1, y: 2, size: 20 }), />&lt;x&gt;<\/div>$/);
});

test('post pages carry no logo and no website by default; a brand that set style.logo to a corner gets its logo there', () => {
  const spec = { template: 'post', kind: 'statement', headline: 'x' };
  assert.ok(!renderPost(spec, ctxFor(brandWith('swiss'))).body.includes('k-logo'));
  assert.ok(!renderPost(spec, ctxFor(brandWith('swiss'))).body.includes('acmesavings.example'));
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    const b = brandWith('swiss'); b.style = { ...b.style, logo: corner };
    const body = renderPost(spec, ctxFor(b)).body;
    assert.match(body, /class="abs k-logo" data-avoid/, corner);
    assert.match(body, corner.endsWith('right') ? /k-logo" data-avoid style="right:64px/ : /k-logo" data-avoid style="left:64px/);
  }
});

test('a post is drawn from its own sheets only: the kit and its direction, after the brand', () => {
  for (const d of DIRECTIONS) {
    const b = brandWith(d), out = renderPost({ template: 'post', kind: 'statement', headline: 'x' }, ctxFor(b));
    assert.deepEqual(out.sheet, ['kit', d]);
    const html = buildPage({ brand: b, size: SIZES.feed, ...out });
    assert.ok(html.includes('.k-wm-fade') && html.includes(`.d-${d}`), d);
    for (const other of DIRECTIONS.filter((x) => x !== d)) assert.ok(!html.includes(`.d-${other} `), `${d} page has ${other}'s sheet`);
    assert.match(html, /Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-/);
  }
  // a page without a direction is built exactly as before
  const plain = buildPage({ brand: brandWith(null), size: SIZES.feed, body: '<i></i>' });
  assert.ok(!plain.includes('.k-wm-fade'));
});

// ---- the new checks (pure) ----
const metrics = (o = {}) => ({ W: 1080, H: 1350, hs: 1, texts: [], empty: { share: 0.2, x0: 0, y0: 0, x1: 100, y1: 100 }, blocks: [], calm: null, ...o });
const T = (role, size, o = {}) => ({ role, size, rects: [], fit: false, text: role, ...o });
const GRID = { lefts: [64, 144.67, 225.33], rights: [128.67, 209.33], centre: 540 };

test('check: emptiness (the largest uncovered rectangle, unless a calm area is declared)', () => {
  assert.deepEqual(findPostProblems(metrics({ empty: { share: 0.44, x0: 0, y0: 0, x1: 1, y1: 1 } })), []);
  const bad = findPostProblems(metrics({ empty: { share: 0.5, x0: 0, y0: 200, x1: 900, y1: 900 } }));
  assert.deepEqual(bad.map((p) => p.kind), ['empty']);
  assert.match(explainPostProblems(bad), /an empty area covers 50% of the page \(at most 45% is allowed here\)/);
  assert.deepEqual(findPostProblems(metrics({ empty: { share: 0.5, x0: 0, y0: 0, x1: 1, y1: 1 }, calm: 0.6 })), [], 'a declared calm area allows more');
  assert.equal(findPostProblems(metrics({ empty: { share: 0.7, x0: 0, y0: 0, x1: 1, y1: 1 }, calm: 0.6 })).length, 1, 'but not more than it declared');
  assert.equal(findPostProblems(metrics({ empty: { share: 0.46, x0: 0, y0: 0, x1: 1, y1: 1 }, calm: 0.3 })).length, 1, 'a calm area never lowers the limit below 45%');
  assert.equal(POST_LIMITS.emptyShare, 0.45);
});

test('check: scale (the headline is at least 2.6 times the body text), judged at the size it was designed for', () => {
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 104), T('sub', 40)] })), []);
  const bad = findPostProblems(metrics({ texts: [T('headline', 104), T('sub', 41)] }));
  assert.deepEqual(bad.map((p) => p.kind), ['scale']);
  assert.match(explainPostProblems(bad), /headline is 104 px against 41 px of body text, 2\.54 times \(it needs at least 2\.6\)/);
  assert.deepEqual(findPostProblems(metrics({ texts: [T('stat', 400), T('sub', 34)] })), [], 'a big numeral is a headline');
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 104)] })), [], 'no body text: nothing to compare');
  assert.deepEqual(findPostProblems(metrics({ texts: [T('sub', 34), T('label', 20)] })), [], 'no headline: nothing to compare');
  // shrunk by the fit loop (hs 0.82): the designed size counts, not the shrunk one
  assert.deepEqual(findPostProblems(metrics({ hs: 0.82, texts: [T('headline', 104 * 0.82), T('sub', 40)] })), []);
  // a fitted headline's lines are not scaled by hs and the smallest line counts
  assert.equal(findPostProblems(metrics({ texts: [T('headline', 94, { fit: true }), T('sub', 36)] })).length, 0);
  assert.equal(findPostProblems(metrics({ texts: [T('headline', 94, { fit: true }), T('sub', 36)], hs: 0.5 })).length, 0);
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 94, { fit: true }), T('sub', 36), T('item', 60)] })).map((p) => p.kind), [], 'list items are not body text');
});

test('check: levels (at most three sizes of type, within 2 px; a fitted headline is one level)', () => {
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 120), T('sub', 34), T('label', 20)] })), []);
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 120), T('sub', 34), T('label', 20), T('label', 21.5), T('sub', 35)] })), [], 'sizes within 2 px are one level');
  const bad = findPostProblems(metrics({ texts: [T('headline', 120), T('sub', 34), T('label', 20), T('label', 26)] }));
  assert.deepEqual(bad.map((p) => p.kind), ['levels']);
  assert.match(explainPostProblems(bad), /sets type in 4 sizes \(20, 26, 34, 120\); at most 3 levels are allowed/);
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 200, { fit: true }), T('headline', 150, { fit: true }), T('sub', 34), T('label', 20)] })), [], 'every fitted line is one level');
  assert.equal(findPostProblems(metrics({ texts: [T('headline', 200, { fit: true }), T('sub', 34), T('label', 20), T('meta', 26)] })).length, 1);
});

test('check: a design that allows four or five sizes is held to a hierarchy (each step clearly apart, the headline the largest)', () => {
  const four = { max: 4, ratio: 1.25 };
  // a price badge, a label, a headline and a sub: four sizes, each well apart, the headline on top
  const page = [T('headline', 128), T('label', 76, { text: '€49' }), T('sub', 34), T('label', 24)];
  assert.deepEqual(findPostProblems(metrics({ texts: page })).map((p) => p.kind), ['levels'], 'without the setting four sizes are refused');
  assert.deepEqual(findPostProblems(metrics({ texts: page, levels: four })), [], 'with it they pass');
  // a random scatter still fails: two sizes too close together
  const scatter = findPostProblems(metrics({ texts: [T('headline', 128), T('label', 40), T('sub', 34), T('label', 24)], levels: four }));
  assert.deepEqual(scatter.map((p) => p.kind), ['steps']);
  assert.match(explainPostProblems(scatter), /34 px and 40 px are only 1\.18 times apart \(this design needs each size at least 1\.25 times/);
  // five sizes where four are allowed
  const five = findPostProblems(metrics({ texts: [T('headline', 200), T('label', 120), T('sub', 60), T('label', 40), T('label', 24)], levels: four }));
  assert.deepEqual(five.map((p) => p.kind), ['levels']);
  assert.match(explainPostProblems(five), /sets type in 5 sizes \(24, 40, 60, 120, 200\); at most 4 levels are allowed/);
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 200), T('label', 120), T('sub', 60), T('label', 40), T('label', 24)], levels: { max: 5, ratio: 1.25 } })), []);
  // the headline must stay the largest: a badge as big as the headline fails, and so does one bigger
  const rival = findPostProblems(metrics({ texts: [T('headline', 120), T('label', 160, { text: 'SALE' }), T('sub', 34), T('label', 24)], levels: four }));
  assert.ok(rival.some((p) => p.kind === 'dominant'));
  assert.match(explainPostProblems(rival), /the headline \(120 px\) is not the largest type: "SALE" is set at 160 px/);
  assert.ok(findPostProblems(metrics({ texts: [T('headline', 120), T('label', 119), T('sub', 34)], levels: four })).some((p) => p.kind === 'dominant'), 'within 2 px is as large');
  // a fitted headline is one level at its smallest line; it is judged against the next size like any other
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 180, { fit: true, fitEl: 0 }), T('headline', 140, { fit: true, fitEl: 0 }), T('label', 90), T('sub', 34), T('label', 24)], levels: four })), []);
  assert.deepEqual(findPostProblems(metrics({ texts: [T('headline', 180, { fit: true, fitEl: 0 }), T('headline', 100, { fit: true, fitEl: 0 }), T('label', 90), T('sub', 34), T('label', 24)], levels: four })).map((p) => p.kind), ['steps'], 'its smallest line (100) is too close to the badge (90)');
  // the ratio is the design's own
  assert.deepEqual(findPostProblems(metrics({ texts: page, levels: { max: 4, ratio: 1.5 } })).map((p) => p.kind), ['steps'], '34 to 24 is 1.42, under 1.5');
  // values the page could not have been given fall back to the rule of three (never a looser rule)
  for (const lv of [{ max: 9, ratio: 1.25 }, { max: 4, ratio: 0.5 }, { max: 4, ratio: NaN }, { max: 4.5, ratio: 1.3 }, { max: 3, ratio: 1.3 }, 'x', null])
    assert.deepEqual(findPostProblems(metrics({ texts: page, levels: lv })).map((p) => p.kind), ['levels'], JSON.stringify(lv));
});

test('check: grid (every text block sits on the margin or a column line, within 2 px, unless skipped)', () => {
  const blk = (x0, o = {}) => ({ role: 'sub', mode: 'left', x0, x1: x0 + 200, text: 'hello', ...o });
  assert.deepEqual(findPostProblems(metrics({ blocks: [blk(64), blk(145.9), blk(225.33 - 2)] }), { grid: GRID }), []);
  const bad = findPostProblems(metrics({ blocks: [blk(64), blk(100, { role: 'headline', text: 'Off the grid' })] }), { grid: GRID });
  assert.deepEqual(bad.map((p) => p.kind), ['grid']);
  assert.match(explainPostProblems(bad, { id: 'x/y/0' }), /\(x\/y\/0\): the headline "Off the grid" starts at x 100, which is not on the margin or a column line \(nearest 64\)/);
  assert.deepEqual(findPostProblems(metrics({ blocks: [blk(100, { mode: 'skip' })] }), { grid: GRID }), [], 'a rotated or sticker element is skipped');
  assert.deepEqual(findPostProblems(metrics({ blocks: [blk(0, { mode: 'right', x1: 209.33 + 1 })] }), { grid: GRID }), [], 'right-aligned text is held by its right edge');
  assert.equal(findPostProblems(metrics({ blocks: [blk(0, { mode: 'right', x1: 300 })] }), { grid: GRID }).length, 1);
  assert.deepEqual(findPostProblems(metrics({ blocks: [{ role: 'label', mode: 'center', x0: 440, x1: 641, text: 'c' }] }), { grid: GRID }), [], 'centred text is held by its centre');
  assert.equal(findPostProblems(metrics({ blocks: [blk(100)] })).length, 0, 'no grid given: not checked');
});

// ---- in Chrome ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-dir-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const render = (direction, design, o = {}) => renderImage(browser, brandWith(direction, o.brand), { spec: normaliseDesign(design), sizeName: 'feed', outFile: path.join(tmp, `${direction}-${design.kind}.png`) }, { tmpDir: tmp });

test('every composition renders and passes every check (fit, contrast, pixel size, emptiness, scale, levels, grid)', { skip }, async () => {
  const words = { statement: { label: 'The Roastery Notes', headline: 'A coffee worth *waiting for.*', sub: 'Small batches, roasted on Thursdays and gone by the weekend.' } };
  for (const { direction, kind, variant, comp } of allCompositions()) {
    // only the fields the composition draws (a field it does not draw is left out with a warning, which is not what is tested here)
    // (a text over its field's limit is not a valid post, so the placeholders are cut to it)
    const given = Object.fromEntries(Object.entries(words[kind] ?? full(kind)).filter(([f]) => comp.fields.includes(f)).map(([f, v]) => [f, typeof v === 'string' && POST_FIELDS[f] ? v.slice(0, POST_FIELDS[f].max) : v]));
    const spec = { template: 'post', kind, variant, ...given, name: 'sample' };
    const r = await render(direction, spec);
    assert.deepEqual(r.warnings, [], comp.id);
    assert.ok(r.notes.some((n) => n.includes(comp.id)), comp.id);
    assert.equal(r.post.id, comp.id);
    assert.ok(fs.statSync(r.file).size > 5000);
  }
});

test('a post without a direction is refused with the way out', { skip }, async () => {
  await assert.rejects(render(null, { template: 'post', kind: 'statement', headline: 'x' }), (e) => e instanceof DesignError && /has none: set style.direction/.test(e.message));
});

// A page of our own to measure: the checks' numbers come from the browser.
async function measured(direction, body, { calm } = {}) {
  const b = brandWith(direction), out = renderPost({ template: 'post', kind: 'statement', headline: 'x' }, ctxFor(b));
  const html = buildPage({ brand: b, size: SIZES.feed, body: `<div class="cv post d-${direction}"${calm ? ` data-calm="${calm}"` : ''} style="--bg:var(--c-paper)">${body}</div>`, sheet: out.sheet, css: out.css });
  const page = await browser.page(1080, 1350);
  try { await page.setContent(html); await page.evaluate('window.__ds.ready({})'); await page.evaluate('window.__ds.fitLines()'); return await page.evaluate('window.__ds.postMetrics()'); } finally { await page.close(); }
}
const txt = (role, x, y, size, text, extra = '') => `<div class="abs" data-role="${role}" data-grid="left" style="left:${x}px;top:${y}px;font-size:${size}px;line-height:1.1;white-space:nowrap${extra}">${text}</div>`;

test('in the browser: emptiness is the largest rectangle nothing covers, and a filled device or a picture covers it', { skip }, async () => {
  const small = await measured('swiss', txt('label', 64, 64, 20, 'A label'));
  assert.ok(small.empty.share > 0.9, `almost all empty: ${small.empty.share}`);
  assert.ok(findPostProblems(small).some((p) => p.kind === 'empty'));
  const filled = await measured('swiss', `${txt('label', 64, 64, 20, 'A label')}<i class="abs" data-fill style="left:0;top:100px;width:1080px;height:640px;background:red"></i><i class="abs" data-fill style="left:0;top:760px;width:1080px;height:300px"></i>`);
  assert.ok(filled.empty.share < 0.25, `covered by filled devices: ${filled.empty.share}`);
  assert.deepEqual(findPostProblems(filled).filter((p) => p.kind === 'empty'), []);
  const calm = await measured('swiss', txt('label', 64, 64, 20, 'A label') + txt('label', 64, 1000, 20, 'Foot'), { calm: 0.9 });
  assert.equal(calm.calm, 0.9);
  assert.deepEqual(findPostProblems(calm).filter((p) => p.kind === 'empty'), [], 'a calm area of up to 90% is allowed');
});

test('in the browser: scale, levels and the grid are read from the rendered type', { skip }, async () => {
  const g = makeContext({ spec: {}, brand: brandWith('swiss'), tokens: DIRECTION_TOKENS.swiss, direction: 'swiss', kind: 'statement', variant: 0, comp: {}, size: SIZES.feed, image: () => PIXEL }).gridLines();
  const good = await measured('swiss', txt('headline', 64, 100, 110, 'Big') + txt('sub', 64, 400, 40, 'Body') + txt('label', 64, 600, 20, 'Label'));
  assert.deepEqual(findPostProblems(good, { grid: g }).filter((p) => p.kind !== 'empty'), []);
  const scale = await measured('swiss', txt('headline', 64, 100, 100, 'Big') + txt('sub', 64, 400, 60, 'Body'));
  assert.ok(findPostProblems(scale, { grid: g }).some((p) => p.kind === 'scale'));
  const levels = await measured('swiss', txt('headline', 64, 100, 120, 'Big') + txt('sub', 64, 400, 34, 'Body') + txt('label', 64, 600, 20, 'Label') + txt('label', 64, 700, 28, 'Another'));
  assert.ok(findPostProblems(levels, { grid: g }).some((p) => p.kind === 'levels'));
  const off = await measured('swiss', txt('headline', 64, 100, 120, 'Big') + txt('sub', 77, 400, 34, 'Off grid'));
  assert.ok(findPostProblems(off, { grid: g }).some((p) => p.kind === 'grid' && p.text === 'Off grid'));
  const skipped = await measured('swiss', txt('headline', 64, 100, 120, 'Big') + `<div class="abs" data-role="label" data-grid="skip" style="left:77px;top:500px;font-size:20px">Sticker</div>`);
  assert.deepEqual(findPostProblems(skipped, { grid: g }).filter((p) => p.kind === 'grid'), []);
  const hidden = await measured('swiss', txt('headline', 64, 100, 120, 'Big') + `<div class="abs" data-deco style="left:77px;top:500px;font-size:300px">texture</div>`);
  assert.deepEqual(findPostProblems(hidden, { grid: g }).filter((p) => p.kind === 'levels'), [], 'a texture (data-deco) is not type');
});

test('fit-to-width: every line of a headline fills the measure (up to its cap), and too long a headline is refused with a length', { skip }, async () => {
  const b = brandWith('retail'), spec = { template: 'post', kind: 'statement', headline: 'Roasted slowly *and sold quickly*', label: 'x', variant: 0 };
  const prep = preparePage(b, { spec: normaliseDesign(spec), sizeName: 'feed' });
  const page = await browser.page(1080, 1350);
  try {
    await page.setContent(buildPage({ brand: b, size: SIZES.feed, ...prep.out }));
    await page.evaluate('window.__ds.ready({})');
    const fit = await page.evaluate('window.__ds.fitLines()');
    assert.equal(fit.length, 1);
    assert.ok(fit[0].ok && fit[0].lines >= 2, JSON.stringify(fit[0]));
    const lines = await page.evaluate('JSON.stringify([...document.querySelectorAll(".fl-line .fl-in")].map((e) => ({ w: e.getBoundingClientRect().width, size: parseFloat(getComputedStyle(e).fontSize) })))');
    const W = 1080 - 56 - 56;
    for (const { w, size } of JSON.parse(lines)) {
      assert.ok(w <= W + 1, `a line must not pass the measure: ${w}`);
      assert.ok(w >= W * 0.985 || size >= 229.9, `a line fills the measure or sits at its cap: ${w} px at ${size}`);
    }
    // the emphasis phrase is wrapped for the highlight bar and keeps its role
    assert.ok(Number(await page.evaluate('document.querySelectorAll(".fl-line .k-hl em[data-role=accent]").length')) >= 1);
  } finally { await page.close(); }
  await assert.rejects(render('retail', { template: 'post', kind: 'statement', variant: 0, headline: 'Supercalifragilisticexpialidocious', name: 'x' }),
    (e) => e instanceof DesignError && /Shorten the headline to about \d+ characters \(it is 34\)/.test(e.message), 'a word too long for the smallest size');
});

test('fit policy: a headline may shrink to 82% of its designed size, and beyond that the render is refused with a length', { skip }, async () => {
  await assert.rejects(render('editorial', { template: 'post', kind: 'statement', headline: 'Supercalifragilisticexpialidocious', name: 'x' }),
    (e) => e instanceof DesignError && /smallest size allowed \(82% of the designed size\)/.test(e.message) && /Shorten the headline to about \d+ characters \(it is 34\)/.test(e.message), 'refused');
  // a long but ordinary headline is shrunk (not refused) and says so
  const r = await render('editorial', { template: 'post', kind: 'statement', headline: 'Unassuming and *thoroughly roasted* coffee for slow mornings', name: 'y' });
  assert.ok(r.notes.some((n) => /headline set at \d+% of the designed size to fit/.test(n)) || r.warnings.length === 0);
});

// ======== retail: the nine compositions (ported from the owner-approved prototype) ========
const RETAIL = allCompositions().filter((c) => c.direction === 'retail');
const visibleLen = (v) => [...String(v).replace(/\*/g, '').replace(/\\n|\n/g, '')].length;

test('retail: all nine compositions are registered, in the prototype\'s order, each with a budget for every field it draws', () => {
  assert.deepEqual(RETAIL.map((c) => c.comp.id), ['retail/statement/0', 'retail/statement/1', 'retail/figure/0', 'retail/list/0', 'retail/quote/0', 'retail/photo/0', 'retail/photo/1', 'retail/event/0', 'retail/offer/0']);
  assert.deepEqual(RETAIL.map((c) => c.comp.name), ['Stack', 'Mantra', 'Price tag', 'Blocks', 'Shout', 'Frame pop', 'Seam', 'Poster band', 'Sticker']);
  for (const { comp } of RETAIL) {
    for (const f of comp.fields) if (f !== 'image') assert.ok(comp.words[f] > 0, `${comp.id} has a budget for ${f}`);
    // the budget is at least the prototype's longest copy that holds, and never more than the post's own limit
    for (const [f, v] of Object.entries(STRESS[comp.id])) {
      if (f === 'items') { for (const it of v) assert.ok(visibleLen(it) <= comp.words.items, `${comp.id} item`); continue; }
      assert.ok(visibleLen(v) <= comp.words[f], `${comp.id}: the prototype's stress ${f} (${visibleLen(v)}) is within its budget (${comp.words[f]})`);
      assert.ok(comp.words[f] <= POST_FIELDS[f].max, `${comp.id}: the ${f} budget is within the field's limit`);
    }
  }
  assert.deepEqual(registryProblems(), []);
});

test('retail: the on-colour of a field is whichever of light and dark measures better on it', () => {
  for (const [name, P] of Object.entries(PALETTES)) {
    assert.equal(onColour(P.primary, P.light, P.ink), P.light, `${name}: light type on the field`);
    assert.equal(onColour(P.gold, P.light, P.ink), P.ink, `${name}: dark type on the sticker colour`);
    assert.equal(onColour(P.light, P.light, P.ink), P.ink, `${name}: dark type on a light field`);
    assert.equal(onColour(P.ink, P.light, P.ink), P.light, `${name}: light type on a dark field`);
    const p = palette(paletteBrand(P), 7);
    assert.ok(contrast(p.field, p.onField) >= 7 && contrast(p.gold, p.onAccent) >= 4.5, `${name}: the type on the field and on the sticker reads`);
    assert.ok(contrast(p.paper, p.fieldText) >= 4.5, `${name}: the field as type on paper is text-safe`);
    for (const k of ['fieldDeep', 'paperWarm', 'lightTint', 'fieldText']) assert.match(p[k], /^#[0-9a-f]{6}$/i, k);
    assert.ok(contrast(p.fieldDeep, p.onField) > contrast(p.field, p.onField), `${name}: the deep field is darker than the field (light type reads better on it)`);
  }
  // a light and a dark field in one go: the choice follows the measure, not the name of the colour
  assert.equal(onColour('#fafafa', '#ffffff', '#111111'), '#111111');
  assert.equal(onColour('#101010', '#ffffff', '#111111'), '#ffffff');
  // a text-safe version: a colour that already reads is kept; one that does not is moved toward the ink until it does
  assert.equal(textSafe('#222222', '#ffffff', '#000000', 4.5), '#222222');
  const moved = textSafe('#F6C344', '#F7EFE3', '#22140D', 4.5);
  assert.notEqual(moved, '#F6C344');
  assert.ok(contrast(moved, '#F7EFE3') >= 4.5);
});

test('retail: a composition may decline content (accepts), and the next variant of the kind is drawn; the Mantra takes a first part of up to 22 characters', () => {
  assert.deepEqual(emphasisParts('Small batches. *No shortcuts.*'), { pre: 'Small batches.', phrase: 'No shortcuts.', post: '' });
  assert.deepEqual(emphasisParts('No emphasis here'), { pre: 'No emphasis here', phrase: '', post: '' });
  const b = brandWith('retail'), draw = (headline, variant = 1) => renderPost({ template: 'post', kind: 'statement', variant, headline }, ctxFor(b));
  const ok = draw('Nothing leaves early. *Not until it is right.*');            // 21 characters before the emphasis
  assert.equal(ok.post.id, 'retail/statement/1');
  assert.equal(ok.post.fellBackFrom, undefined);
  const edge = draw('Twenty two characters! *Yes.*');                          // exactly 22
  assert.equal(edge.post.id, 'retail/statement/1');
  const over = draw('Twenty three characters. *Yes.*');                        // 23
  assert.equal(over.post.id, 'retail/statement/0', 'the Stack takes it');
  assert.equal(over.post.fellBackFrom, 'retail/statement/1');
  assert.equal(over.post.variant, 0);
  assert.equal(draw('A headline with no emphasis that is long').post.id, 'retail/statement/0', 'no emphasis: the whole headline is the first part');
  assert.equal(draw('Short enough *to take*', 0).post.id, 'retail/statement/0', 'a Stack asked for stays a Stack');
  // the same rule, generic: a declining composition hands over to the next variant (wrapping round); none accepting is refused
  const list = REGISTRY.retail.event, saved = [...list];
  try {
    const yes = { ...list[0], id: 'retail/event/1', accepts: () => true }, no = { ...list[0], id: 'retail/event/0', accepts: () => false };
    list.splice(0, list.length, no, yes);
    const spec = { template: 'post', kind: 'event', variant: 0, headline: 'x', meta: '1 Jan', image: 'a.jpg' };
    assert.equal(renderPost(spec, ctxFor(b)).post.id, 'retail/event/1');
    list.splice(0, list.length, no, { ...yes, accepts: () => false });
    assert.throws(() => renderPost(spec, ctxFor(b)), (e) => e instanceof DesignError && /no event composition of the retail direction can draw these words/.test(e.message));
    list.splice(0, list.length, { ...list[0], accepts: 'nope' });
    assert.ok(registryProblems().some((p) => /accepts must be a function/.test(p)));
  } finally { list.splice(0, list.length, ...saved); }
  assert.deepEqual(registryProblems(), []);
});

test('retail: hostile words in every field of the nine compositions end up inert', () => {
  for (const { comp, kind } of RETAIL) {
    for (const h of HOSTILE) {
      const out = renderPost({ ...full(kind, () => h), variant: Number(comp.id.split('/')[2]) }, ctxFor(brandWith('retail')));
      const body = out.body;
      assert.ok(!/<script|<svg|<style|<iframe|<object/i.test(body), `${comp.id} / ${h}: a tag came from the words`);
      for (const t of body.matchAll(/<([a-zA-Z][\w-]*)/g)) assert.ok(TAGS.has(t[1]), `${comp.id}: <${t[1]}>`);
      for (const a of attributeNames(body)) assert.ok(ALLOWED_ATTRS.test(a), `${comp.id}: attribute ${a}`);
    }
  }
});

test('retail: every composition draws the prototype\'s copy with both of its brands\' colours and passes every check, with no warning', { skip }, async () => {
  for (const [name, P] of Object.entries(PALETTES)) {
    for (const { comp } of RETAIL) {
      const r = await render('retail', retailSpec(comp, NORMAL[comp.id]), { brand: paletteBrand(P) });
      assert.deepEqual(r.warnings, [], `${name} ${comp.id}`);
      assert.equal(r.post.id, comp.id);
      assert.ok(fs.statSync(r.file).size > 5000);
    }
  }
});

test('retail: every composition holds the prototype\'s longest copy (its budget), shrinking no more than to 82%', { skip }, async () => {
  for (const { comp } of RETAIL) {
    const r = await render('retail', retailSpec(comp, STRESS[comp.id]), { brand: paletteBrand(PALETTES.A) });
    assert.deepEqual(r.warnings, [], comp.id);
    for (const n of r.notes) { const k = /headline set at (\d+)%/.exec(n); if (k) assert.ok(Number(k[1]) >= 82, `${comp.id}: ${n}`); }
  }
});

test('retail: too long a headline is refused with the length that would hold, for the fitted pages and for the stepped ones', { skip }, async () => {
  const about = /Shorten the headline to about \d+ characters \(it is \d+\)/;
  // the Stack: a word too wide for the smallest line
  await assert.rejects(render('retail', { template: 'post', kind: 'statement', variant: 0, headline: 'Supercalifragilisticexpialidocious', name: 'x' }), (e) => e instanceof DesignError && about.test(e.message));
  // the Mantra: a solid phrase that would need a line under its floor (a Mantra asked for, its first part short)
  await assert.rejects(render('retail', { template: 'post', kind: 'statement', variant: 1, headline: 'Small batches. *No shortcuts, no corners cut, no compromise, no exceptions at all.*', name: 'x' }), (e) => e instanceof DesignError && about.test(e.message));
  // the Sticker (a stepped headline): the fit loop shrinks to 82%, then refuses (a word wider than the page at that size)
  await assert.rejects(render('retail', { template: 'post', kind: 'offer', headline: 'Supercalifragilisticexpialidocious *and more*', tag: '\u00A35', image: PICS.offer, name: 'x' }), (e) => e instanceof DesignError && /smallest size allowed \(82% of the designed size\)/.test(e.message) && about.test(e.message));
});

test('retail: when the Poster band\'s headline takes three lines the sub is left out, and the page says so', { skip }, async () => {
  const comp = RETAIL.find((c) => c.comp.id === 'retail/event/0').comp;
  const two = await render('retail', retailSpec(comp, NORMAL[comp.id]));
  assert.ok(!two.notes.some((n) => /sub line was left out/.test(n)), 'two lines: the sub stays');
  const three = await render('retail', retailSpec(comp, { ...NORMAL[comp.id], headline: 'Spring pantry market: *come and stock up.*' }), { brand: paletteBrand(PALETTES.B) });
  assert.ok(three.notes.some((n) => /sub line was left out because the headline takes 3 lines or more/.test(n)));
  assert.deepEqual(three.warnings, []);
});

test('retail: a fitted numeral and a turned page are measured straight, so a turned line fills its measure and is read on its own pixels', { skip }, async () => {
  const b = paletteBrand(PALETTES.A), comp = RETAIL.find((c) => c.comp.id === 'retail/figure/0').comp;
  const prep = preparePage({ ...brandWith('retail'), ...b, style: { ...loadBrand().style, direction: 'retail' } }, { spec: normaliseDesign(retailSpec(comp, NORMAL[comp.id])), sizeName: 'feed' });
  const page = await browser.page(1080, 1350);
  try {
    await page.setContent(buildPage({ brand: { ...brandWith('retail'), ...b }, size: SIZES.feed, ...prep.out }));
    await page.evaluate('window.__ds.ready({})');
    const fit = await page.evaluate('window.__ds.fitLines()');
    assert.ok(fit[0].ok && fit[0].lines === 1);
    // while measured the wrapper was straight; afterwards it is turned back
    assert.match(await page.evaluate('document.querySelector("[data-unrot]").style.transform'), /rotate\(-3deg\)/);
    const w = Number(await page.evaluate('(() => { const w = document.querySelector("[data-unrot]"), t = w.style.transform; w.style.transform = "none"; const x = document.querySelector(".fl-in").getBoundingClientRect().width; w.style.transform = t; return x; })()'));
    assert.ok(w <= 920 + 1 && w >= 920 * 0.97, `the numeral fills its measure (920 px): ${w}`);
    // a turned text is read as slices along its direction, not as the box round it
    const m = await page.evaluate('window.__ds.measure()');
    const num = m.roles.find((r) => r.role === 'headline');
    assert.ok(num.rects.length > 1, 'a turned line is read in slices');
  } finally { await page.close(); }
});

test('retail: markup-looking text in meta is escaped in every branch of the Poster band (no date, one token, two tokens, a date)', () => {
  const metas = ['<img src=x onerror=1> · 6pm · <b>Place</b>', '<img src=x onerror=1>', '<b>12</b> <i>Dec</i> · <img src=x onerror=1>', '12 Dec · <b>Place</b> · <script>alert(1)</script>', 'Sat 12 December · <svg onload=1>', '"><img src=x onerror=1>'];
  for (const meta of metas) {
    const out = renderPost({ template: 'post', kind: 'event', variant: 0, headline: 'x', meta, image: 'a.jpg' }, ctxFor(brandWith('retail')));
    assert.ok(!/<script|<svg|<style|<b>|<i>|onerror=1>/i.test(out.body.replace(/<img [^>]*data-user[^>]*>/g, '')), `${meta}: markup came from meta`);
    for (const t of out.body.matchAll(/<([a-zA-Z][\w-]*)/g)) assert.ok(TAGS.has(t[1]), `${meta}: <${t[1]}>`);
    for (const a of attributeNames(out.body)) assert.ok(ALLOWED_ATTRS.test(a), `${meta}: attribute ${a}`);
    assert.ok(!/<img[^>]*onerror/i.test(out.body), `${meta}: an element took an attribute from meta`);
  }
  // the kit's date reader builds every piece from the raw text: a date is read, anything else is kept as one escaped piece
  const c = makeContext({ spec: { meta: '12 December · <b>x</b>' }, brand: brandWith('retail'), tokens: DIRECTION_TOKENS.retail, direction: 'retail', kind: 'event', variant: 0, comp: {}, size: SIZES.feed, image: () => PIXEL });
  const d = c.dateParts();
  assert.deepEqual([String(d.day), String(d.month), d.count], ['12', 'Dec', 2]);
  assert.equal(String(d.line), '12 December · &lt;b&gt;x&lt;/b&gt;');
  assert.ok(d.day instanceof Markup && d.line instanceof Markup);
  const odd = makeContext({ spec: { meta: '<b>12</b> Dec' }, brand: brandWith('retail'), tokens: DIRECTION_TOKENS.retail, direction: 'retail', kind: 'event', variant: 0, comp: {}, size: SIZES.feed, image: () => PIXEL }).dateParts();
  assert.equal(odd.day, null);
  assert.equal(String(odd.first), '&lt;b&gt;12&lt;/b&gt; Dec');
});

// ---- contrast.display: the target for large display type on post pages ----
import { LARGE_DISPLAY_PX, displayTarget, postContrastNeed } from './lib/design/checks.mjs';
test('contrast.display: default 4.5, a brand value from 3 to 7, validated; 3:1 is the floor', () => {
  const base = loadBrand();
  assert.equal(displayTarget(base), 4.5);
  assert.equal(displayTarget({ contrast: { display: 6 } }), 6);
  assert.equal(displayTarget({ contrast: { display: 2.9 } }), 4.5, 'a value outside the range is never used');
  const raw = RAW;
  const withDisplay = (display) => validateBrand({ ...raw, contrast: { ...raw.contrast, display } }).filter((e) => /contrast\.display/.test(e));
  for (const ok of [3, 4.5, 7]) assert.deepEqual(withDisplay(ok), [], String(ok));
  for (const bad of [2.9, 7.1, '4.5', NaN, null]) assert.equal(withDisplay(bad).length, 1, String(bad));
  assert.deepEqual(validateBrand(raw).filter((e) => /contrast\.display/.test(e)), [], 'leaving it out is fine');
});

test('contrast.display: judged by the rendered size (64 px and a weight of 400), not by the role alone', () => {
  const b = { contrast: { headline: 7, accent: 4.5, sub: 7, label: 4.5, display: 4.5 } };
  assert.equal(LARGE_DISPLAY_PX, 64);
  assert.equal(postContrastNeed(b, 'headline', { size: 64, weight: 700 }), 4.5);
  assert.equal(postContrastNeed(b, 'headline', { size: 63, weight: 700 }), 7, 'a headline shrunk under 64 px meets the stricter target');
  assert.equal(postContrastNeed(b, 'headline', { size: 200, weight: 300 }), 7, 'a light weight is not display type');
  assert.equal(postContrastNeed(b, 'sub', { size: 90, weight: 700 }), 7, 'body roles keep their target');
  assert.equal(postContrastNeed({ contrast: { ...b.contrast, display: 7 } }, 'headline', { size: 100, weight: 900 }), 7);
  assert.equal(postContrastNeed(b, 'label', { size: 70, weight: 600 }), 4.5);
});

test('contrast.display: the palette keeps the brand field when light or ink reads on it at the target, and deepens it otherwise', () => {
  const bright = paletteBrand(PALETTES.A);
  assert.ok(contrast('#FFFFFF', PALETTES.A.primary) >= 4.5 || contrast(PALETTES.A.ink, PALETTES.A.primary) >= 4.5);
  assert.equal(palette(bright, 4.5).field.toLowerCase(), PALETTES.A.primary.toLowerCase(), 'the bright field is kept at 4.5');
  assert.notEqual(palette(bright, 7).field.toLowerCase(), PALETTES.A.primary.toLowerCase(), 'at 7 it is deepened as before');
  assert.ok(contrast(palette(bright, 7).field, palette(bright, 7).onField) >= 7);
  const demo = loadBrand();
  assert.equal(palette({ ...demo, ...bright }, 4.5).field.toLowerCase(), PALETTES.A.primary.toLowerCase());
  // a low-contrast accent never becomes small text: the accent type role is moved or replaced by the ink, whatever the target
  const pale = paletteBrand({ name: 'Pale', light: '#F5F0E6', ink: '#2A2418', primary: '#9C3B16', gold: '#EADFC0', deep: '#9A7B2E' });
  for (const need of [3, 4.5, 7]) assert.ok(contrast(palette(pale, need).accentType, palette(pale, need).paper) >= 4.5, `accent type at ${need}`);
});

test('edge check: text whose ink meets or crosses the edge of a block or rule is refused, text clear of it is not', () => {
  const m = (ink, shape, extra = {}) => metrics({ inks: [{ role: 'headline', text: 'Word', ...ink }], shapes: [{ x0: 100, y0: 100, x1: 600, y1: 400, ...shape }], ...extra });
  const edge = (p) => p.filter((x) => x.kind === 'edge');
  assert.equal(edge(findPostProblems(m({ x0: 120, y0: 395, x1: 300, y1: 460 }))).length, 1, 'ink crossing the foot of a block');
  assert.equal(edge(findPostProblems(m({ x0: 120, y0: 405, x1: 300, y1: 460 }))).length, 1, 'ink 5 px under a block');
  assert.equal(edge(findPostProblems(m({ x0: 120, y0: 420, x1: 300, y1: 480 }))).length, 0, 'a gutter clear of it');
  assert.equal(edge(findPostProblems(m({ x0: 120, y0: 310, x1: 300, y1: 395 }))).length, 1, 'text sitting on its block\'s foot');
  assert.equal(edge(findPostProblems(m({ x0: 120, y0: 150, x1: 300, y1: 350 }))).length, 0, 'text inset in its block');
  assert.equal(edge(findPostProblems(m({ x0: 90, y0: 150, x1: 300, y1: 350 }))).length, 0, 'a side bearing may stand a little out of a block');
  assert.equal(edge(findPostProblems(m({ x0: 120, y0: 405, x1: 300, y1: 460, frame: '0' }))).length, 0, 'text and a shape in different frames are not compared');
  assert.match(explainPostProblems(findPostProblems(m({ x0: 120, y0: 395, x1: 300, y1: 460 }))), /runs into the edge of a block or rule/);
});

test('a refusal never asks to shorten words to the length they already have', () => {
  assert.equal(shorterLength(9, 9), 8);
  assert.equal(shorterLength(12, 9), 8);
  assert.equal(shorterLength(5, 9), 5);
  assert.equal(shorterLength(3, 1), null);
  const tag = explainFitLines({ lines: 2, min: 40, floor: 44, h: 110, est: 9, chars: 9 }, 'tag');
  assert.match(tag, /Shorten the tag to about 8 characters \(it is 9\)/);
  assert.doesNotMatch(explainFitLines({ lines: 1, min: 40, floor: 44, h: 110, est: 4, chars: 1 }, 'tag'), /about/);
  const head = explainPostFit([{ kind: 'wide', role: 'headline', text: 'Seven', px: 2 }], { chars: 6, fraction: 0.99 });
  assert.match(head, /about 5 characters \(it is 6\)/);
});
