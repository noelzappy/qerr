// node --test   (the look interpreter's security properties, no Chrome: a look is DATA and the words of a post are untrusted, so whatever the
// words say they reach the page only as escaped text, and nothing of a look or of a post reaches a tag, an attribute, a class or a style except
// through fixed tables. Drawn here: both sample looks and a purpose-built look that uses every text binding the schema allows, from hostile copy.)
//
//   1. hostile text through every binding of the two sample looks;      2. the same through every binding of a purpose-built look;
//   3. the interpreter's source writes no HTML of its own but one tag;   4. an invalid look is refused before anything is drawn;
//   5. the classes and attribute names are fixed sets;                   6. the memo is content-addressed and a look cannot be changed after it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { validateLook } from './lib/design/look.mjs';
import { ELEMENT_TYPES, FORMATS, PHOTO_SHAPES, PHOTO_TREATS, SOURCES, SPLIT_SEPARATORS, STICKER_SHAPES } from './lib/design/look-elements.mjs';
import { renderPost, renderPostWithLook, resolveLook } from './lib/design/directions/index.mjs';
import { COLOUR_NAMES } from './lib/design/directions/kit.mjs';
import { HOSTILE as RETAIL_HOSTILE } from './testlib/retail-copy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(HERE, 'testlib', 'looks', f), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const RETAIL = readJson('retail.sample.json'), SWISS = readJson('swiss.sample.json');
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const IMAGE = 'design/assets/demo/object-jar.jpg';
const baseBrand = loadBrand();
const ctxFor = (brand = baseBrand) => ({ size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 100, h: 100 }) });
const brandNamed = (name) => ({ ...baseBrand, name });
const HOSTILE = [...RETAIL_HOSTILE, '{{x}}', '&lt;b&gt;', '*<b>x</b>* \\n <i>y</i>', 'a · b · c'];

// ---- what a page may hold: the allow-lists every drawn body is held to ----
// The tags the kit writes (kit.mjs: div, span, i, em, img, br, and svg, path, text, textPath for the seal). Nothing else, never script, style, a, iframe.
const ALLOWED_TAGS = new Set(['div', 'span', 'i', 'em', 'img', 'br', 'svg', 'path', 'text', 'textPath']);
// The attributes by name: every data-* (inert, written by the kit from numbers and fixed words) and these. No on* handler, no href but the seal's own "#k-seal-path".
const ALLOWED_ATTRS = new Set(['class', 'style', 'src', 'alt', 'id', 'href', 'width', 'height', 'viewBox', 'd', 'fill', 'role', 'aria-hidden', 'aria-label', 'textLength', 'lengthAdjust']);
// The class names. Each family says where it comes from (kit.mjs unless noted; kit.css holds the rules of all but NO_RULE).
const ALLOWED_CLASSES = new Set([
  'cv', 'post', 'k-look',                                                                                  // the page root (index.mjs draw: "cv post k-look")
  'abs', 'k-flow', 'ph',                                                                                   // place: absolute, or in a flow; a picture frame
  'k-t', 'k-run', 'k-display', 'k-fit', 'k-fb', 'k-echo', 'k-dfont', 'k-hl', 'k-vlabel', 'k-vdown',       // text builders (type, run, display, fitLines, fitBlock/fitFill, echoStack, highlight, verticalLabel)
  'k-em-i', 'k-em-a', 'k-em-n',                                                                            // EMPH: italic, accent, none
  'k-v-fill', 'k-tilt',                                                                                    // KIT_VARIANTS: fill, tilt (a look's tokens carry no variants of their own)
  'k-box', 'k-block', 'k-rule', 'k-frame', 'k-keyline', 'k-glyph', 'k-scope', 'k-scrim', 'k-seal',        // box, block, rule, frame, keyline, glyph, scope, scrim, seal
  'k-shape', 'k-shape-circle', 'k-shape-pill', 'k-shape-tile', 'k-shape-stamp', 'k-sticker',             // shape(): "k-shape k-shape-<shape>", the old sticker
  'k-photo', 'k-grey', 'k-multiply', 'k-grain', 'k-punch', 'k-mul', 'k-gr', 'k-printmat',                 // photo(): "k-<treat>" per PHOTO_TREATS, the multiply and grain layers, print()
  'k-numeral', 'k-numeral-n', 'k-numeral-u', 'k-fnum', 'k-fnum-n', 'k-fnum-u',                            // numeral(), fitNumeral()
  'k-wm', 'k-wm-row', 'k-wm-fade',                                                                         // wordmarkPattern()
  'k-logo', 'logo-inv', 'ly-logo',                                                                         // logoHtml(), only when the brand switched its logo on
  'k-grad', 'k-overlay', 'k-graphic', 'k-tinted',                                                          // gradient(), overlay(), graphic() and a recoloured graphic
]);
// The classes with no rule in kit.css: the page and picture classes live in other sheets (cv, ph, post), the rest are hooks the runtime or the checks read.
const NO_RULE = new Set(['cv', 'k-multiply', 'k-grain', 'k-em-n', 'k-shape-circle', 'k-shape-pill', 'k-shape-tile', 'k-numeral-n', 'k-numeral-u', 'logo-inv', 'ly-logo']);

// ---- the grammar of every inline style: a fixed set of properties, each with a value of a fixed shape ----
// Copied from test-design-retail-markup.mjs (GRAMMAR) and extended with what the data path adds: the stretch alignments, a hard text shadow, the echo
// box's --k-ol, the page's hugging and trimmed text (margin in em), the seam's slanted edge, the wordmark fade mask, the arch and circle pictures.
const NUM = '-?\\d+(?:\\.\\d+)?', PXV = `${NUM}px`, NAME = `(?:${COLOUR_NAMES.join('|')})`, VAR = `var\\(--c-${NAME}\\)`;
const SHADOW = `(?:0 0 0 ${PXV} ${VAR}|${PXV} ${PXV} 0 ${VAR})`;
const GRAMMAR = {
  left: `(?:0|${PXV})`, top: `(?:0|${PXV})`, right: PXV, bottom: PXV, width: PXV, height: PXV, 'min-height': `(?:0|${PXV})`, 'margin-left': PXV, 'margin-top': `-?${NUM}(?:px|em)`, 'margin-bottom': `-?${NUM}(?:px|em)`, gap: PXV, inset: '0',
  padding: `${PXV}(?: ${PXV}){0,3}`, 'border-radius': `(?:${PXV}|50%|999px|${PXV} ${PXV} 0 0)`, border: `${PXV} (?:solid|dashed) ${VAR}`,
  'font-size': `(?:${PXV}|calc\\(${NUM}px\\*var\\(--hs,1\\)\\*var\\(--h-scale,1\\)\\))`, 'font-family': 'var\\(--f-(?:display|text|label|mono)\\)', 'font-weight': NUM, 'line-height': NUM, 'letter-spacing': `${NUM}em`,
  color: VAR, background: VAR, 'box-shadow': `${SHADOW}(?:,${SHADOW})*(?: inset)?`, 'text-shadow': `${PXV} ${PXV} 0 ${VAR}`,
  transform: `rotate\\(${NUM}deg\\)(?: skewX\\(${NUM}deg\\))?`, 'transform-origin': `(?:center|left bottom|left top|right bottom|right top|${NUM}% ${NUM}%)`,
  'clip-path': `polygon\\((?:${NUM}(?:px)? ${NUM}(?:px)?(?:,${NUM}(?:%|px)? ${NUM}(?:%|px)?){3}|0 ${PXV},100% 0,100% 100%,0 100%)\\)`,
  display: '(?:block|flex|none|inline-block)', position: 'absolute', 'flex-direction': '(?:column|row)', 'justify-content': '(?:center|flex-end|flex-start|space-between)',
  'align-items': '(?:center|flex-start|flex-end|stretch)', 'align-self': '(?:stretch|flex-start|flex-end|center)',
  flex: `(?:none|${NUM} 1 0)`, 'text-align': '(?:left|center|right)', 'text-transform': 'uppercase', 'white-space': 'nowrap', 'object-position': `${NUM}% ${NUM}%`,
  'font-style': 'italic', 'font-variant-numeric': '(?:lining-nums|oldstyle-nums)', opacity: NUM, 'z-index': '\\d+',
  '-webkit-mask-image': `linear-gradient\\(to bottom,#000 ${NUM}%,transparent 100%\\)`, 'mask-image': `linear-gradient\\(to bottom,#000 ${NUM}%,transparent 100%\\)`,
  '--k-ol': PXV,
  // the seal's ring and its round text (svg): a border, the box model, the overflow of the svg and the fill of its text
  'box-sizing': 'border-box', overflow: 'visible', fill: VAR,
};
// gradients (palette roles at fixed percentages, a whole-degree angle or one of nine points), a mirrored graphic and a recoloured one's drop shadow
const STOP = `${VAR} \\d{1,3}%`, GRAD_AT = '(?:center|top|bottom|left|right|left top|right top|left bottom|right bottom)';
GRAMMAR.background = `(?:${VAR}|linear-gradient\\(\\d{1,3}deg,${STOP}(?:,${STOP}){1,2}\\)|radial-gradient\\((?:circle|ellipse) at ${GRAD_AT},${STOP}(?:,${STOP}){1,2}\\))`;
GRAMMAR.transform = `(?:rotate\\(${NUM}deg\\)(?: skewX\\(${NUM}deg\\)| scaleX\\(-1\\))?|scaleX\\(-1\\))`;
GRAMMAR.filter = `drop-shadow\\(${PXV} 0 0 ${VAR}\\)`;
const RULES = Object.fromEntries(Object.entries(GRAMMAR).map(([k, v]) => [k, new RegExp(`^${v}$`)]));
const FONT_TOKEN = /^(?:'[A-Za-z0-9 ]{1,40}'|[A-Za-z-]{1,20})$/;
const fontStackOk = (v) => { const rest = v.replace(/^var\(--(?:display|label|font|mono)\),/, ''); return rest !== '' && rest.split(',').every((t) => FONT_TOKEN.test(t)); };
// the page's root: custom properties only: the background, the palette, the four font stacks, the grain and the look's own numbers
const ROOT_PROPS = [
  [/^--bg$/, (v) => new RegExp(`^var\\(--c-${NAME}\\)$`).test(v)],
  [/^--c-[a-z-]+$/, (v) => /^(#[0-9a-f]{6}|rgba\(\d+,\d+,\d+,[\d.]+\))$/i.test(v)],
  [/^--f-(display|text|label|mono)$/, fontStackOk],
  [/^--k-grain$/, (v) => v === 'url(GRAIN)'],
  [/^--k-dstretch$/, (v) => new RegExp(`^${NUM}%$`).test(v)],
  [/^--k-dcase$/, (v) => v === 'uppercase' || v === 'none'],
  [/^--k-(dword|hl-top|hl-h|hl-pr|hl-pl)$/, (v) => new RegExp(`^${NUM}em$`).test(v)],
  [/^--k-hl-tilt$/, (v) => new RegExp(`^${NUM}deg$`).test(v)],
];
const splitDecls = (style) => style.split(';').filter(Boolean).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i), d.slice(i + 1)]; });
// every problem with the style attributes of a body (empty when all are in the grammar)
const styleProblems = (body) => {
  const bad = [];
  for (const m of body.matchAll(/ style="([^"]*)"/g)) {
    const style = m[1];
    if (style.startsWith('--bg:')) {
      for (const [prop, val] of splitDecls(style.replace(/url\(data:image\/svg\+xml,[%0-9A-Za-z._~-]*\)/, 'url(GRAIN)'))) if (!ROOT_PROPS.some(([p, ok]) => p.test(prop) && ok(val))) bad.push(`root ${prop}: ${val.slice(0, 60)}`);
    } else if (style.startsWith('inset:0;--c-')) { // the one-accent scope: palette names set to a #rrggbb worked out from the brand
      for (const [prop, val] of splitDecls(style)) if (!(prop === 'inset' && val === '0') && !(new RegExp(`^--c-${NAME}$`).test(prop) && /^#[0-9a-f]{6}$/i.test(val))) bad.push(`scope ${prop}: ${val.slice(0, 60)}`);
    } else {
      for (const [prop, val] of splitDecls(style)) {
        if (!Object.hasOwn(RULES, prop)) bad.push(`property ${prop}`);
        else if (!RULES[prop].test(val)) bad.push(`${prop}: ${val.slice(0, 60)}`);
      }
    }
  }
  return bad;
};

// ---- reading a body ----
const TAG_SYNTAX = /^<\/?([A-Za-z][\w-]*)((?:\s+[^\s"'<>/=]+(?:="[^"<>]*")?)*)\s*\/?>$/;
const tagsOf = (body) => [...body.matchAll(/<[^>]*>/g)].map((t) => t[0]);
const textOf = (body) => body.replace(/<[^>]*>/g, '');
const VALUE_OK = /^[A-Za-z0-9 ._,:%/#()+=-]*$/; // an attribute value other than style: words, numbers and a few marks, never a quote, angle bracket, semicolon or $
const classesOf = (body) => [...body.matchAll(/ class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean));
// Every property of a drawn body: tags, text, attributes, classes, styles and what the tags hold. `where` names the case in a failure.
function bodyProblems(body, where) {
  const bad = [], tags = tagsOf(body);
  if (/[<>]/.test(textOf(body))) bad.push(`${where}: text content holds a raw angle bracket (unescaped markup)`);
  for (const tag of tags) {
    const m = TAG_SYNTAX.exec(tag);
    if (!m) { bad.push(`${where}: a tag that does not parse: ${tag.slice(0, 80)}`); continue; }
    if (tag.startsWith('</')) { if (!ALLOWED_TAGS.has(m[1])) bad.push(`${where}: closing tag ${m[1]}`); continue; }
    if (!ALLOWED_TAGS.has(m[1])) bad.push(`${where}: tag <${m[1]}> is not allowed`);
    const seen = new Set();
    for (const a of m[2].matchAll(/\s+([^\s"'<>/=]+)(?:="([^"]*)")?/g)) {
      const [, name, value = ''] = a;
      if (seen.has(name)) bad.push(`${where}: attribute ${name} twice on <${m[1]}>`);
      seen.add(name);
      if (!ALLOWED_ATTRS.has(name) && !/^data-[a-z0-9]+$/.test(name)) bad.push(`${where}: attribute ${name} is not allowed`);
      if (name === 'style') continue;
      if (name !== 'src' && !VALUE_OK.test(value)) bad.push(`${where}: attribute ${name} holds an unexpected character: ${value.slice(0, 60)}`);
      if (/alert|javascript|evil|pwn/i.test(value)) bad.push(`${where}: attribute ${name} carries a payload: ${value.slice(0, 60)}`);
      if (name === 'src' && value !== PIXEL) bad.push(`${where}: an image source other than the checked data: URI`);
      if (name === 'href' && value !== '#k-seal-path') bad.push(`${where}: href ${value.slice(0, 40)}`);
      if (name === 'data-name' && value !== IMAGE) bad.push(`${where}: data-name ${value.slice(0, 40)}`);
    }
  }
  // no url, expression, import or script reference in any tag, apart from the grain and the checked picture
  const joined = tags.join('').replace(/--k-grain:url\(data:image\/svg\+xml,[%0-9A-Za-z._~-]*\)/g, '').replace(/ src="data:image\/png;base64,[^"]*"/g, '');
  if (/url\(|expression|javascript:|@import|<script|onerror|onload/i.test(joined)) bad.push(`${where}: a url, script or handler reference in a tag`);
  for (const c of classesOf(body)) if (!ALLOWED_CLASSES.has(c)) bad.push(`${where}: class ${c} is not in the fixed set`);
  for (const p of styleProblems(body)) bad.push(`${where}: style ${p}`);
  return bad;
}

// ---- building posts ----
const FIELD_TEXTS = ['label', 'headline', 'sub', 'big', 'unit', 'quote', 'by', 'meta', 'tag'];
const GRAPHIC_REF = '0f8fad5b-d9cb-469f-a165-70867728950e';
const specOf = (kind, variant, texts) => ({ template: 'post', kind, variant, name: 'look-render-test', ...texts, items: [texts.headline ?? 'x', texts.headline ?? 'x'], image: IMAGE, graphics: [{ ref: GRAPHIC_REF, image: IMAGE, tintable: true }] });
const allTexts = (h) => Object.fromEntries(FIELD_TEXTS.map((f) => [f, h]));
// per kind, the composition list in order: { kind, variant, name }
const listOf = (look) => { const per = {}; return look.compositions.map((cp) => ({ kind: cp.kind, name: cp.name, variant: (per[cp.kind] = (per[cp.kind] ?? -1) + 1) })); };
const BENIGN = { label: 'L0 · L1 / L2 | L3 – L4', headline: 'HEAD *PHRASE* TAIL', sub: 'SUBWORDS', big: '12', unit: 'kg', quote: 'QUOTEWORDS', by: 'B0 · B1 / B2 | B3', meta: '12 Dec · 6pm · The roastery', tag: 'TAG' };
// the copies a composition is drawn from: benign, and for each hostile string every field (a), and a short hostile beginning before the emphasis (b)
function copies() {
  const out = [{ id: 'benign', texts: BENIGN, items: ['IA', 'IB', 'IC'], brand: baseBrand }];
  for (const h of HOSTILE) {
    out.push({ id: `a:${h.slice(0, 14)}`, texts: allTexts(h), items: [h, h], brand: brandNamed(h) });
    out.push({ id: `b:${h.slice(0, 14)}`, texts: { ...allTexts(h), headline: `${h.slice(0, 12)} *${h}*` }, items: [h, h], brand: brandNamed(h.slice(0, 12)) });
  }
  return out;
}
const COPIES = copies();
// Draws every composition of a look from every copy; returns { drawn: Set of composition ids, refused: number }, failing on any problem of any body.
function drawAll(look, opts, label) {
  const drawn = new Set();
  let n = 0;
  for (const { kind, variant, name } of listOf(look)) {
    for (const copy of COPIES) {
      const spec = { ...specOf(kind, variant, copy.texts), items: copy.items };
      let r;
      try { r = renderPostWithLook(look, spec, ctxFor(copy.brand), opts); } catch (e) {
        // a composition may decline words it cannot draw; when none of the kind accepts them the post is refused, plainly
        assert.ok(e instanceof DesignError && /can draw these words/.test(e.message), `${label} ${kind}/${variant} ${copy.id}: ${e.message}`);
        continue;
      }
      assert.deepEqual(bodyProblems(r.body, `${label} ${kind}/${variant} "${name}" ${copy.id}`), []);
      drawn.add(r.post.id);
      n++;
    }
  }
  return { drawn, n };
}

// ====================================================================================================================
// 1. hostile text through every binding of the two sample looks
// ====================================================================================================================
for (const [name, look] of [['retail', RETAIL], ['swiss', SWISS]]) {
  test(`${name} sample look: hostile text in every field and the brand name draws only escaped text, allowed tags, attributes, classes and styles`, () => {
    const { drawn, n } = drawAll(look, { shipped: true }, name);
    const ids = listOf(look).map(({ kind, variant }) => `${name}/${kind}/${variant}`);
    assert.deepEqual([...drawn].sort(), [...ids].sort(), 'every composition was drawn by at least one copy');
    assert.ok(n >= ids.length * 10, `${n} bodies were read`);
  });
}
test('the body checker itself refuses what it should', () => {
  const ok = '<div class="cv post k-look" style="--bg:var(--c-paper);--c-paper:#FFFFFF"><span class="k-t abs" data-el="0" style="left:0;top:10px">x &lt;b&gt;</span></div>';
  assert.deepEqual(bodyProblems(ok, 'ok'), []);
  const BAD = [
    ['<div>"><script>x</script></div>', /not allowed/], ['<div>a<b>c</div>', /not allowed/], ['<div class="evil"></div>', /fixed set/], ['<div onclick="x"></div>', /not allowed/], ['<div onerror=x></div>', /does not parse/],
    ['<div>a > b</div>', /raw angle/], ['<div style="color:red"></div>', /style/], ['<div style="background:url(x)"></div>', /(style|url)/], ['<img src="http://evil.example/x.png">', /(src|image source)/], ['<div data-x="a;b"></div>', /unexpected character/],
    ['<div data-x="javascript:alert(1)"></div>', /payload/], ['<a href="#x"></a>', /not allowed/], ['<div style="--bg:var(--c-paper);--k-x:1"></div>', /root/], ['<div style="inset:0;--c-ink:red"></div>', /scope/],
    ['<div style="--bg:var(--c-paper);--f-display:expression(1)"></div>', /root/], ['<div style="left:1px;left:2px;"  class="abs abs" class="k-t"></div>', /twice/], ['<div style="transform:rotate(1deg) scale(3)"></div>', /style/], ['<div style="left:1px;evil:1"></div>', /property/],
  ];
  for (const [body, re] of BAD) assert.ok(bodyProblems(body, 'bad').some((p) => re.test(p)), `${body} -> ${bodyProblems(body, 'bad').join(' | ')}`);
});

// ====================================================================================================================
// 2. hostile text through EVERY binding of a purpose-built look
// ====================================================================================================================
const T = (field, extra = {}, place) => ({ type: 'text', field, ...(place ? { place } : {}), ...extra });
const G = (col, span, row, rowSpan, alignY) => ({ grid: { col, span, row, rowSpan, ...(alignY ? { alignY } : {}) } });
// The look-level sections are the retail sample's (fonts, type, colour, devices, photo, logo, dials); the page grid has rows and a top row, and the
// swiss sample's label row is borrowed, so that the top label row and rows on the grid can be used. The compositions are written here, for the bindings:
// field with part pre/phrase/post; split (every separator, pick 0 to 3 and rest); format (date-dd.mm, day, month, pad2, roman); source brand, folio,
// index; ladder; a fixed size; stickers (field with fit, hug, ladder, textSize, text items); rows over items and over meta parts with keys; numerals with
// a unit (sizes, and cap with min); mantra rows; a fitted headline in lines, fill and block mode; band and seam with children and a sticker slot; the
// top label row; the brand-name pattern; scrim; punched hole; glyph; every picture shape with treatment and tint; frame, keyline, block, rule.
function bindingLook() {
  const look = clone(RETAIL);
  look.id = 'binding-test'; look.name = 'Binding test'; look.origin = 'copy:own:binding-test';
  look.canvas.feed.grid = { cols: 12, gutter: 16, rows: 8, head: 72 };
  look.devices.metaRow = clone(SWISS.devices.metaRow);
  look.colour.grounds = ['paper', 'field', 'dark', 'accent', 'soft'];
  const c = [];
  // ---- statement ----
  c.push({ kind: 'statement', name: 'Parts', describe: 'Every part of the headline, every split of the label, every source and format.', ground: [{ when: { present: 'label' }, ground: 'soft' }, { ground: 'paper' }],
    fields: { label: { max: 28 }, headline: { required: true, max: 70 }, sub: { max: 140 } },
    elements: [
      { type: 'meta-row', tone: 'ink' },
      T('headline', { style: 'display', size: 90, part: 'pre' }, G(1, 12, 2, 1)),
      T('headline', { style: 'display', size: 90, part: 'phrase', emphasis: 'accent' }, G(1, 12, 3, 1)),
      T('headline', { style: 'display', size: 90, part: 'post', emphasis: 'italic' }, G(1, 12, 4, 1)),
      T('label', { style: 'label', split: { sep: '·', pick: 0 } }, G(1, 3, 5, 1)),
      T('label', { style: 'label', split: { sep: '/', pick: 1 } }, G(4, 3, 5, 1)),
      T('label', { style: 'label', split: { sep: '|', pick: 'rest' } }, G(7, 3, 5, 1)),
      T('label', { style: 'label', split: { sep: '–', pick: 3 } }, G(10, 3, 5, 1)),
      T('sub', { style: 'body', ladder: { by: 'sub', steps: [[60, 34], [140, 28]], maxLines: 3 } }, G(1, 12, 6, 2)),
      { type: 'text', source: 'brand', style: 'label', track: 0.1, weight: 800, lead: 1.3, font: 'label', place: G(1, 4, 8, 1) },
      { type: 'text', source: 'folio', style: 'label', place: G(5, 2, 8, 1) },
      { type: 'text', source: 'folio', format: 'pad2', style: 'label', place: G(7, 2, 8, 1) },
      { type: 'text', source: 'index', format: 'roman', style: 'label', place: G(9, 2, 8, 1) },
      { type: 'text', source: 'site', style: 'label', place: G(11, 2, 8, 1) },
    ] });

  c.push({ kind: 'statement', name: 'Lines', describe: 'A fitted headline by lines, a sticker fitted to the label, a rule, a dot, a mark and a keyline.', ground: 'field', accepts: [{ field: 'headline', part: 'pre', maxChars: 70 }], calm: { maxShare: 0.6 },
    fields: { label: { max: 28 }, headline: { required: true, max: 70 }, sub: { max: 140 } },
    elements: [
      { type: 'fitted-stack', field: 'headline', mode: 'lines', cap: 200, floor: 80, maxLines: 4, emphasis: 'bar', ink: 'on-field', place: G(1, 12, 2, 4) },
      { type: 'sticker', shape: 'circle', size: 250, place: { px: { x: 760, y: 700 } }, rot: 'sticker', ring: { w: 6, colour: 'paper' }, shadow: 'hard', field: 'label', fit: { cap: 60, floor: 20, w: 190, h: 150, maxLines: 3 }, when: { present: 'label' } },
      T('sub', { style: 'body', ink: 'on-field' }, G(1, 8, 7, 2)),
      { type: 'rule', weight: 'heavy', colour: 'on-field', place: { px: { x: 56, y: 1200, w: 968 } } },
      { type: 'block', radius: 'full', colour: 'gold', place: { px: { x: 56, y: 1220, w: 22, h: 22 } } },
      { type: 'glyph', glyph: '&', size: 300, colour: 'gold', place: { px: { x: 700, y: 900 } }, textShadow: { x: 4, y: 4, colour: 'ink' } },
      { type: 'block', colour: 'accent', skew: 4, rot: 'block', place: { px: { x: 56, y: 1150, w: 300, h: 20 } } },
      { type: 'keyline', weight: 2, colour: 'on-field', radius: 12, place: { px: { x: 40, y: 40, w: 1000, h: 1270 } } },
    ] });
  c.push({ kind: 'statement', name: 'Fill', describe: 'A headline filling its box, a hugging pill fitted to the label, text with a letter shadow.', ground: 'dark',
    fields: { label: { max: 28 }, headline: { required: true, max: 70 }, sub: { max: 140 } },
    elements: [
      { type: 'fitted-stack', field: 'headline', mode: 'fill', cap: 220, floor: 60, maxLines: 6, gapEm: 0.2, valign: 'bottom', align: 'center', ink: 'white', place: G(1, 12, 2, 5) },
      { type: 'sticker', shape: 'pill', w: 'hug', minW: 120, maxW: 600, h: 90, field: 'label', fit: { cap: 40, floor: 20, maxLines: 1, h: 60 }, place: { px: { x: 56, y: 140 } }, fill: 'gold', ink: 'on-accent' },
      T('sub', { style: 'body', ink: 'white', textShadow: 'hard' }, G(1, 10, 7, 2)),
    ] });
  // ---- figure ----
  c.push({ kind: 'figure', name: 'Numeral', describe: 'A figure with its unit under it (cap and min), a repeated headline, a label and a sub.', ground: 'field', fit: { pad: 56, top: 56, bottom: 56 },
    fields: { label: { max: 28 }, headline: { max: 70 }, big: { required: true, max: 8 }, unit: { max: 24 }, sub: { max: 140 } },
    elements: [
      T('label', { style: 'label', ink: 'on-field' }, G(1, 8, 2, 1)),
      { type: 'numeral', field: 'big', cap: 420, min: 150, unit: { field: 'unit', style: 'label', at: 'under' }, baselineAt: 'margin', ink: 'on-field', place: { px: { x: 56, y: 300, w: 968, h: 500 } }, textShadow: 'hard' },
      { type: 'mantra-rows', field: 'headline', cap: 160, floor: 40, rmin: 2, rmax: 4, outline: 3, ink: 'on-field', place: { px: { x: 56, y: 820, w: 968, h: 300 } }, when: { present: 'headline' } },
      T('sub', { style: 'body', ink: 'on-field' }, G(1, 10, 8, 1)),
    ] });
  c.push({ kind: 'figure', name: 'Numeral grid', describe: 'A figure on the grid (sizes), the same figure again as a two-digit and a roman number, a headline that steps down.', ground: 'paper',
    fields: { label: { max: 28 }, headline: { max: 70 }, big: { required: true, max: 8 }, unit: { max: 24 } },
    elements: [
      { type: 'meta-row', tone: 'ink' },
      { type: 'numeral', field: 'big', sizes: [320, 280, 240], unit: { field: 'unit', style: 'body', at: 'top-right' }, baselineAt: 'page', place: G(1, 12, 2, 5) },
      T('big', { style: 'label', format: 'pad2' }, G(1, 3, 7, 1)),
      T('big', { style: 'label', format: 'roman' }, G(4, 3, 7, 1)),
      T('headline', { style: 'display', ladder: { by: 'headline', steps: [[30, 36], [70, 30]], maxLines: 3 }, emphasis: 'none' }, G(1, 12, 8, 1)),
    ] });
  // ---- list ----
  c.push({ kind: 'list', name: 'Tiles', describe: 'A fitted headline in block mode, numbered rows on tiles with alternating fills and turns.', ground: 'field',
    fields: { label: { max: 28 }, headline: { required: true, max: 44 }, items: { required: true, max: 5 } },
    elements: [{ type: 'box', place: { inset: 'page' }, flow: 'column', align: 'stretch', children: [
      { type: 'box', flow: 'column', gap: 18, pad: [56, 56, 44, 56], align: 'stretch', children: [
        T('label', { style: 'label', ink: 'on-field' }),
        { type: 'fitted-stack', field: 'headline', mode: 'block', sizes: [140, 120, 100], maxLines: 3, ink: 'on-field', h: 300 },
      ] },
      { type: 'block', h: 14, colour: 'gold' },
      { type: 'rows', each: 'items', number: '1', numberStyle: 'display', numberSize: 46, numberTile: { size: 88, fill: 'gold', ink: 'on-accent', shadow: 6 }, textStyle: 'item', altFill: ['paper', 'light-tint'], altRot: [-4, 3], gap: 36, pad: [0, 56, 0, 56], rowMinH: 150, ink: 'ink', grow: 1 },
    ] }] });
  c.push({ kind: 'list', name: 'Roman', describe: 'Rows numbered in roman, ruled, the first number in the accent.', ground: 'paper',
    fields: { headline: { required: true, max: 70 }, sub: { max: 140 }, items: { required: true, max: 5 } },
    elements: [
      T('headline', { style: 'display', size: 46, emphasis: 'bar' }, G(1, 12, 2, 2)),
      T('sub', { style: 'body' }, G(1, 12, 4, 1)),
      { type: 'rows', each: 'items', number: 'roman', numberStyle: 'label', numberSpan: 2, textStyle: 'item', rule: 'heavy', firstAccent: true, valign: 'top', gap: 8, place: G(1, 12, 5, 4) },
    ] });
  // ---- quote ----
  c.push({ kind: 'quote', name: 'Block quote', describe: 'A fitted quote in block mode, a mark, the attribution split at a dot.', ground: 'dark',
    fields: { label: { max: 28 }, quote: { required: true, max: 160 }, by: { max: 40 } },
    elements: [
      { type: 'glyph', glyph: '“', size: 400, colour: 'gold', place: { px: { x: 56, y: 60 } } },
      { type: 'fitted-stack', field: 'quote', mode: 'block', sizes: [96, 84, 72], maxLines: 5, ink: 'white', place: G(1, 12, 3, 4) },
      T('by', { style: 'label', ink: 'white', split: { sep: '·', pick: 0 } }, G(1, 6, 7, 1)),
      T('by', { style: 'label', ink: 'white', split: { sep: '/', pick: 'rest' } }, G(7, 6, 7, 1)),
      T('label', { style: 'label', ink: 'white', vertical: 'up' }, { px: { x: 20, y: 700 } }),
      { type: 'text', word: 'Myth', style: 'label', ink: 'white', place: G(1, 6, 8, 1) },
    ] });
  c.push({ kind: 'quote', name: 'Ladder quote', describe: 'A quote that steps down its size, a by line and a label.', ground: 'soft',
    fields: { label: { max: 28 }, quote: { required: true, max: 160 }, by: { max: 40 } },
    elements: [
      T('quote', { style: 'display', ladder: { by: 'quote', steps: [[60, 96], [110, 80], [160, 64]], maxLines: 6, maxH: 800 }, emphasis: 'italic' }, G(1, 12, 2, 5)),
      T('by', { style: 'label', split: { sep: '|', pick: 1 }, align: 'right' }, G(1, 12, 7, 1)),
      T('label', { style: 'label', split: { sep: '·', pick: 2 }, upper: true, nowrap: true }, G(1, 12, 8, 1)),
      T('label', { style: 'label', vertical: 'down' }, { px: { x: 1040, y: 100 } }),
    ] });
  // ---- photo ----
  c.push({ kind: 'photo', name: 'Scrim', describe: 'A rectangle picture with grey and multiply treatment, a scrim, a headline on a filled box, a sticker that steps down.', ground: 'dark',
    fields: { image: { required: true }, label: { max: 28 }, headline: { required: true, max: 68 }, sub: { max: 120 }, tag: { max: 16 } },
    elements: [
      { type: 'photo', place: { inset: 'page' }, shape: 'rect', treat: ['grey', 'multiply'], tint: 'primary', bleed: { edges: ['left', 'right', 'top', 'bottom'], by: 0.05 } },
      { type: 'scrim', place: { anchor: { left: 0, right: 0, bottom: 0, h: 600 } }, need: 4.5, floor: 0.5, cap: 0.9, fade: 80, colour: 'ink' },
      { type: 'overlay', place: { inset: 'page' }, colour: 'ink', from: 'flat', need: 4.5, floor: 0.3, cap: 0.8 },
      { type: 'wordmark-pattern', place: { px: { x: 0, y: 0, w: 1080, h: 400 } }, size: 80, altItalic: true, fade: true, fadeFrom: 40, colour: 'white' },
      { type: 'box', place: { anchor: { left: 'margin', right: 'margin', bottom: 60 } }, fill: 'ink', ink: 'white', pad: 40, flow: 'column', gap: 16, align: 'stretch', rot: 'block', origin: 'left bottom', border: { w: 3, colour: 'gold', style: 'dashed' }, radius: 24, children: [
        T('label', { style: 'label', ink: 'white' }),
        T('headline', { style: 'display', size: 100, emphasis: 'accent', ink: 'white' }),
        T('sub', { style: 'body', ink: 'white', when: { present: 'sub' }, dropWhenTight: true, before: 10, w: 760 }),
      ] },
      { type: 'sticker', shape: 'circle', size: 240, place: { px: { x: 780, y: 80 } }, field: 'tag', ladder: { by: 'tag', steps: [[6, 36], [16, 28]], maxLines: 2, maxH: 160 }, when: { present: 'tag' } },
    ] });
  c.push({ kind: 'photo', name: 'Circle', describe: 'A circular picture with grain and punch, a punched hole, a stamp, a keyline.', ground: 'paper',
    fields: { image: { required: true }, headline: { required: true, max: 68 }, sub: { max: 120 }, tag: { max: 16 } },
    elements: [
      { type: 'photo', place: { px: { x: 220, y: 100, w: 640, h: 640 } }, shape: 'circle', treat: ['grain', 'punch'], keyline: 3, rot: 'card', shadow: { x: 8, y: 8, colour: 'ink' }, ring: { w: 4, colour: 'paper' } },
      { type: 'punch-hole', place: { px: { x: 60, y: 60 } }, size: 60, fill: 'field-deep', ring: { w: 8, colour: 'paper' } },
      T('headline', { style: 'display', size: 96, emphasis: 'tilt-bar' }, G(1, 12, 6, 2)),
      T('sub', { style: 'body' }, G(1, 12, 8, 1)),
      { type: 'sticker', shape: 'stamp', size: 200, place: { px: { x: 800, y: 760 } }, field: 'tag', textSize: 40, rot: 'sticker', fill: 'gold', ink: 'on-accent', when: { present: 'tag' } },
    ] });
  c.push({ kind: 'photo', name: 'Seam', describe: 'The page cut by a slanted edge, a picture above and the words below with a sticker on the edge.', ground: 'paper',
    fields: { image: { required: true }, headline: { required: true, max: 68 }, sub: { max: 120 }, tag: { max: 16 } },
    elements: [
      { type: 'seam', leftY: 820, rightY: 560, edge: 12, upper: 'photo', lower: 'field', edgeFill: 'paper', gap: 40, ink: 'on-field',
        children: [T('headline', { style: 'display', size: 90, emphasis: 'accent' }), T('sub', { style: 'body', when: { present: 'sub' } })],
        sticker: { type: 'sticker', shape: 'circle', size: 200, place: { anchor: { right: 60, top: -100 } }, field: 'tag', textSize: 44 } },
    ] });
  // ---- event ----
  c.push({ kind: 'event', name: 'Rows', describe: 'A rounded picture, the parts of the line in labelled rows.', ground: 'paper',
    fields: { image: {}, headline: { required: true, max: 70 }, meta: { required: true, max: 40 }, tag: { max: 16 } },
    elements: [
      { type: 'photo', place: G(1, 12, 2, 3), shape: 'rounded', radius: 40, treat: ['grain'], keyline: 2 },
      T('headline', { style: 'display', size: 90 }, G(1, 12, 5, 2)),
      { type: 'rows', each: 'meta-parts', number: 'none', keys: ['Date', 'Time', 'Place'], textStyle: 'label', gap: 16, rule: 'hair', place: G(1, 12, 7, 2) },
      { type: 'sticker', shape: 'pill', size: 200, place: { px: { x: 800, y: 40 } }, field: 'tag', textSize: 36, when: { present: 'tag' } },
    ] });
  c.push({ kind: 'event', name: 'Date numeral', describe: 'The date as a big numeral, split parts of the line and a label as its unit.', ground: 'field',
    fields: { image: {}, label: { max: 28 }, headline: { required: true, max: 70 }, meta: { required: true, max: 40 } },
    elements: [
      { type: 'photo', place: { px: { x: 560, y: 60, w: 460, h: 540 } }, shape: 'arch' },
      { type: 'numeral', field: 'meta', format: 'date-dd.mm', cap: 260, min: 100, unit: { field: 'label', style: 'label', at: 'bar' }, place: { px: { x: 56, y: 60, w: 480, h: 300 } }, ink: 'on-field' },
      T('headline', { style: 'display', size: 90, ink: 'on-field' }, G(1, 12, 5, 2)),
      T('meta', { style: 'label', ink: 'on-field', split: { sep: '·', pick: 1 } }, G(1, 6, 7, 1)),
      T('meta', { style: 'label', ink: 'on-field', split: { sep: '·', pick: 'rest' } }, G(7, 6, 7, 1)),
    ] });
  c.push({ kind: 'event', name: 'Card', describe: 'A card picture, the day and the month as figures.', ground: 'soft',
    fields: { image: {}, headline: { required: true, max: 70 }, meta: { required: true, max: 40 } },
    elements: [
      { type: 'photo', place: { px: { x: 60, y: 60, w: 600, h: 700 } }, shape: 'card', border: 14, tint: 'gold', rot: 'card', treat: ['multiply'] },
      T('meta', { style: 'numeral', size: 220, format: 'day' }, { px: { x: 700, y: 60 } }),
      T('meta', { style: 'display', size: 90, format: 'month', upper: true }, { px: { x: 700, y: 330 } }),
      T('meta', { style: 'label', format: 'not-date' }, { px: { x: 700, y: 430 } }),
      T('meta', { style: 'label', format: 'date-dd.mm' }, { px: { x: 700, y: 480 } }),
      T('headline', { style: 'display', size: 90 }, G(1, 12, 6, 2)),
    ] });
  // ---- offer ----
  c.push({ kind: 'offer', name: 'Print', describe: 'A framed print, a tile sticker holding text items, a circle that steps down, headline and sub.', ground: 'paper',
    fields: { image: {}, headline: { required: true, max: 70 }, tag: { required: true, max: 16 }, sub: { max: 140 }, unit: { max: 24 } },
    elements: [
      { type: 'photo', place: { px: { x: 60, y: 60, w: 700, h: 700 } }, shape: 'print', border: 28, keyline: 2, treat: ['grey'] },
      { type: 'sticker', shape: 'tile', size: 220, place: { px: { x: 780, y: 200 } }, children: [T('tag', { style: 'display', size: 36 }), T('unit', { style: 'label', size: 36 })] },
      T('headline', { style: 'display', ladder: { by: 'headline', steps: [[30, 90], [70, 70]], maxLines: 3 } }, G(1, 12, 6, 2)),
      T('sub', { style: 'body' }, G(1, 12, 8, 1)),
    ] });
  c.push({ kind: 'offer', name: 'Band', describe: 'A turned band holding the price and the headline, a brand name pattern, a hole and a frame.', ground: 'field', fit: 'frame',
    fields: { image: {}, headline: { required: true, max: 70 }, tag: { required: true, max: 16 }, sub: { max: 140 } },
    elements: [
      { type: 'photo', place: { px: { x: 820, y: 60, w: 200, h: 150 } }, shape: 'oval' },
      { type: 'wordmark-pattern', place: { inset: 'page' }, size: 90, colour: 'on-field', fade: true },
      { type: 'gradient', gradient: { kind: 'linear', stops: ['field', 'field-deep', 'dark'], angle: 160, mid: 40 }, place: { anchor: { left: 0, right: 0, bottom: 0, h: 500 } }, z: 1 },
      { type: 'band', y: 300, h: 500, fill: 'paper', ink: 'ink', rot: 'band', origin: 'center', pad: [40, 140, 40, 140], shadow: 'hard', z: 2, children: [
        T('tag', { style: 'display', size: 200 }), T('headline', { style: 'display', size: 90 }),
      ] },
      T('sub', { style: 'body', ink: 'on-field' }, G(1, 10, 7, 2)),
      { type: 'punch-hole', place: { px: { x: 500, y: 40 } }, size: 50 },
      { type: 'frame' },
    ] });
  c.push({ kind: 'offer', name: 'Stickers', describe: 'A hugging pill on the price, a stamp on the unit, a seal on the label, a filled headline.', ground: 'accent',
    fields: { image: {}, label: { max: 28 }, headline: { required: true, max: 70 }, tag: { required: true, max: 16 }, unit: { max: 24 } },
    elements: [
      { type: 'photo', place: { px: { x: 700, y: 1080, w: 320, h: 120 } }, shape: 'pill' },
      { type: 'fitted-stack', field: 'headline', mode: 'fill', cap: 200, floor: 60, maxLines: 5, ink: 'ink', place: G(1, 12, 2, 4) },
      { type: 'sticker', shape: 'pill', w: 'hug', minW: 100, maxW: 500, h: 100, field: 'tag', fit: { cap: 36, floor: 20, maxLines: 1, h: 60 }, place: { px: { x: 56, y: 800 } }, fill: 'ink', ink: 'white' },
      { type: 'sticker', shape: 'stamp', size: 220, field: 'unit', textSize: 36, place: { px: { x: 700, y: 800 } }, rot: 'sticker', fill: 'paper', ink: 'ink' },
      { type: 'sticker', shape: 'seal', size: 180, field: 'label', place: { px: { x: 400, y: 1000 } }, ink: 'ink' },
      { type: 'rule', weight: 4, colour: 'ink', place: { px: { x: 56, y: 1250, w: 968 } } },
      { type: 'graphic', ref: GRAPHIC_REF, at: 'bottom-right', size: 's', rot: -4, flip: true, tint: 'paper', z: 1 },
      { type: 'box', place: { px: { x: 56, y: 1100, w: 300, h: 100 } }, gradient: { kind: 'radial', stops: ['paper', 'soft'], at: 'left top', shape: 'circle' } },
    ] });
  look.compositions = c;
  return clone(look);
}

const BINDING = bindingLook();
test('the purpose-built look is valid and uses every binding the schema allows', () => {
  assert.deepEqual(validateLook(BINDING, 'look', { shipped: false }), []);
  assert.equal(BINDING.compositions.length, 18);
  const perKind = {};
  for (const cp of BINDING.compositions) perKind[cp.kind] = (perKind[cp.kind] ?? 0) + 1;
  assert.deepEqual(perKind, { statement: 3, figure: 2, list: 2, quote: 2, photo: 3, event: 3, offer: 3 });
  // a walk of the compositions: what the look uses
  const els = [], texts = [];
  const walk = (list) => { for (const e of list) { els.push(e); if (e.type === 'text') texts.push(e); walk([...(e.children ?? []), ...(e.sticker ? [e.sticker] : [])]); } };
  BINDING.compositions.forEach((cp) => { walk(cp.elements); assert.ok(cp.elements.length <= 40); });
  const types = new Set(els.map((e) => e.type));
  assert.deepEqual(ELEMENT_TYPES.filter((t) => !types.has(t)), [], 'every element type');
  assert.deepEqual(new Set(texts.filter((t) => t.split).map((t) => t.split.sep)), new Set(SPLIT_SEPARATORS), 'every separator');
  assert.deepEqual([...new Set(texts.filter((t) => t.split).map((t) => String(t.split.pick)))].sort(), ['0', '1', '2', '3', 'rest']);
  assert.deepEqual(new Set([...els, ...texts].filter((e) => e.format).map((e) => e.format)), new Set(FORMATS), 'every format');
  assert.deepEqual(new Set(texts.filter((t) => t.part).map((t) => t.part)), new Set(['pre', 'phrase', 'post']));
  assert.deepEqual(new Set(texts.filter((t) => t.source).map((t) => t.source)), new Set(SOURCES), 'every source');
  assert.ok(texts.some((t) => t.word), 'a fixed word');
  assert.deepEqual(new Set(els.filter((e) => e.type === 'photo').map((e) => e.shape)), new Set(PHOTO_SHAPES), 'every picture shape');
  assert.deepEqual(new Set(els.filter((e) => e.type === 'photo').flatMap((e) => e.treat ?? [])), new Set(PHOTO_TREATS));
  assert.deepEqual(new Set(els.filter((e) => e.type === 'sticker').map((e) => e.shape)), new Set(STICKER_SHAPES));
  assert.deepEqual(new Set(els.filter((e) => e.type === 'fitted-stack').map((e) => e.mode)), new Set(['lines', 'fill', 'block']));
  assert.deepEqual(new Set(els.filter((e) => e.type === 'rows').map((e) => e.each)), new Set(['items', 'meta-parts']));
  assert.ok(els.some((e) => e.type === 'numeral' && e.sizes) && els.some((e) => e.type === 'numeral' && e.cap), 'both numeral forms');
  assert.ok(els.some((e) => e.type === 'sticker' && e.w === 'hug') && els.some((e) => e.type === 'sticker' && e.ladder) && els.some((e) => e.type === 'sticker' && e.children) && els.some((e) => e.type === 'sticker' && e.textSize));
  assert.ok(els.some((e) => e.type === 'seam' && e.sticker) && els.some((e) => e.type === 'band' && e.children?.length));
});

test('the purpose-built look draws every binding (benign words show up where each binding puts them)', () => {
  const brand = brandNamed('BRANDNAME');
  const drawnBody = (kind, variant, texts = BENIGN, items = ['IA', 'IB', 'IC']) => renderPostWithLook(BINDING, { ...specOf(kind, variant, texts), items }, ctxFor(brand), { shipped: false }).body;
  const has = (body, token) => new RegExp(`>${token}<`).test(body);
  let body = drawnBody('statement', 0);
  for (const t of ['HEAD', 'PHRASE', 'TAIL', 'L0', 'L2 \\| L3 – L4', 'SUBWORDS', 'BRANDNAME', 'acmesavings\\.example']) assert.ok(has(body, t), `statement 0: ${t}`);
  // a folio only from a real place (the post's place in a batch): without one there is none, never a number made up from the words
  assert.doesNotMatch(body, />\d\d</, 'no folio without a place');
  const placed = renderPostWithLook(BINDING, { ...specOf('statement', 0, BENIGN), items: ['IA', 'IB', 'IC'] }, { ...ctxFor(brand), folio: { n: 7, total: 12 } }, { shipped: false }).body;
  assert.match(placed, />07</, 'the folio as two digits, from the batch place');
  assert.ok(has(drawnBody('quote', 0), 'Myth'), 'quote 0: a fixed word');
  body = drawnBody('figure', 1);
  for (const t of ['12', 'XII', 'kg']) assert.ok(has(body, t), `figure 1: ${t}`);
  body = drawnBody('event', 1);
  assert.ok(has(body, '12\\.12') && has(body, '6pm') && has(body, '6pm · The roastery'), 'event 1: a date numeral and the split parts');
  body = drawnBody('event', 2);
  assert.ok(has(body, '12') && has(body, 'Dec') && has(body, '12\\.12'), 'event 2: day, month and dd.mm');
  body = drawnBody('event', 0);
  for (const t of ['Date', 'Time', 'Place', '12 Dec', '6pm', 'The roastery']) assert.ok(has(body, t), `event 0: ${t}`);
  body = drawnBody('list', 0);
  assert.ok(has(body, 'IA') && has(body, 'IC') && has(body, '1') && has(body, '3'), 'list 0: numbered rows');
  body = drawnBody('list', 1);
  assert.ok(has(body, 'I') && has(body, 'III') && has(body, 'IB'), 'list 1: roman numbers');
  body = drawnBody('quote', 0);
  assert.ok(has(body, 'B0') && has(body, 'B2 \\| B3') && has(body, 'QUOTEWORDS'), 'quote 0');
  assert.ok(has(drawnBody('quote', 1), 'B3'), 'quote 1: a split by |');
  assert.ok(has(drawnBody('offer', 0), 'TAG') && has(drawnBody('offer', 0), 'kg'), 'offer 0: text items inside a tile sticker');
  assert.ok(has(drawnBody('offer', 2), 'TAG') && has(drawnBody('offer', 2), 'kg'), 'offer 2: stickers');
  assert.ok(/>HEAD/.test(drawnBody('photo', 2)), 'photo 2: the seam holds its words');
  // the brand name reaches the page as text in the seal's path text, the pattern and the label row
  assert.match(drawnBody('offer', 2), /<textPath[^>]*>BRANDNAME/);
  assert.match(drawnBody('offer', 1), /BRANDNAME — BRANDNAME/);
});

test('the purpose-built look, drawn from hostile text in every field, item and the brand name, passes every body check', () => {
  const { drawn, n } = drawAll(BINDING, { shipped: false }, 'binding');
  // the look's own accepts rule (statement 1: the part before the emphasis) never declines a copy here, so every composition is drawn
  assert.equal(drawn.size, 18, [...drawn].join(', '));
  assert.ok(n >= 18 * 20, `${n} bodies were read`);
});

test('the purpose-built look draws every class family and every element the data path can write', () => {
  const seen = new Set();
  for (const { kind, variant } of listOf(BINDING)) classesOf(renderPostWithLook(BINDING, { ...specOf(kind, variant, BENIGN), items: ['IA', 'IB', 'IC'] }, ctxFor(), { shipped: false }).body).forEach((c) => seen.add(c));
  const need = ['k-em-i', 'k-em-a', 'k-grey', 'k-multiply', 'k-grain', 'k-punch', 'k-mul', 'k-gr', 'k-shape-circle', 'k-shape-pill', 'k-shape-tile', 'k-shape-stamp', 'k-seal', 'k-printmat', 'k-wm-fade', 'k-vdown', 'k-vlabel',
    'k-echo', 'k-fb', 'k-fit', 'k-fnum', 'k-numeral', 'k-hl', 'k-v-fill', 'k-scrim', 'k-frame', 'k-glyph', 'k-keyline', 'k-rule', 'k-block', 'k-run', 'k-dfont'];
  assert.deepEqual(need.filter((c) => !seen.has(c)), []);
  assert.deepEqual([...seen].filter((c) => !ALLOWED_CLASSES.has(c)), []);
});

test('the same holds when a font role is the brand\'s own (the root then carries var(--display) stacks) and for the one-accent colour logic', () => {
  const look = clone(BINDING);
  look.fonts.display = { source: 'brand', role: 'display' };
  look.fonts.label = { source: 'brand', role: 'sans' };
  assert.deepEqual(validateLook(look, 'look', { shipped: false }), []);
  const root = renderPostWithLook(look, { ...specOf('statement', 0, BENIGN) }, ctxFor(), { shipped: false }).body;
  assert.match(root, /--f-display:var\(--display\),/);
  assert.deepEqual(bodyProblems(root, 'brand font'), []);
  // the swiss sample is one-accent: its page holds a scope with worked-out colours
  const swiss = renderPostWithLook(SWISS, specOf('photo', 0, BENIGN), ctxFor(), { shipped: true }).body;
  assert.match(swiss, /class="abs k-scope" style="inset:0;--c-accent-type:#[0-9A-Fa-f]{6}/);
  assert.deepEqual(bodyProblems(swiss, 'swiss scope'), []);
});

// a real bug the looks above had to avoid: the validator takes a sticker's fit with only cap and floor, and the interpreter then writes the box's width and
// height from the look's fit.w and fit.h, which are not there (design kit: w must be a finite number (got undefined))
test('a sticker whose fit gives no w or h is either refused by the validator or drawn (never a bare kit error)', () => {
  for (const [what, edit] of [['no w', (fit) => { delete fit.w; }], ['no h', (fit) => { delete fit.h; }], ['neither', (fit) => { delete fit.w; delete fit.h; }]]) {
    const look = clone(RETAIL);
    const st = look.compositions.find((c) => c.kind === 'photo').elements.find((e) => e.type === 'sticker');
    edit(st.fit);
    if (validateLook(look, 'look', { shipped: true }).length) continue; // refused up front: fine
    assert.doesNotThrow(() => renderPostWithLook(look, specOf('photo', 0, BENIGN), ctxFor(), { shipped: true }), `fit with ${what}`);
  }
});

// ====================================================================================================================
// 3. the words are Markup: the interpreter writes no HTML of its own
// ====================================================================================================================
// A small scanner of JavaScript source: drops comments and returns the template literals (tag, static text with ${} where a value goes), the quoted strings and the code left.
function scanSource(src) {
  const templates = [], strings = [];
  let i = 0, code = '';
  const regexAllowed = () => /(?:^|[(,=:[!&|?{};+\-*%<>~^])\s*$/.test(code);
  function template() {
    const tag = /([A-Za-z_$][\w$.]*)$/.exec(code)?.[1] ?? null;
    let text = '', hasValue = false;
    i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { text += src.slice(i, i + 2); i += 2; } else if (src[i] === '$' && src[i + 1] === '{') { i += 2; hasValue = true; text += '${}'; run(true); } else text += src[i++];
    }
    i++;
    templates.push({ tag, text, hasValue });
    code += '``';
  }
  function run(inValue) {
    let depth = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
      if (ch === "'" || ch === '"') { let j = i + 1; while (src[j] !== ch) j += src[j] === '\\' ? 2 : 1; strings.push(src.slice(i + 1, j)); code += `${ch}${ch}`; i = j + 1; continue; }
      if (ch === '`') { template(); continue; }
      if (ch === '/' && regexAllowed()) { let j = i + 1, cls = false; while (src[j] !== '/' || cls) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; } i = j + 1; while (/[a-z]/.test(src[i] ?? '')) i++; code += '/re/'; continue; }
      if (ch === '{') depth++;
      if (ch === '}') { if (inValue && depth === 0) { i++; return; } depth--; }
      code += ch; i++;
    }
  }
  run(false);
  return { templates, strings, code };
}
const DIRECTIONS_DIR = path.join(HERE, 'lib', 'design', 'directions');
const INTERPRETER_FILES = ['interpret.mjs', ...fs.readdirSync(path.join(DIRECTIONS_DIR, 'primitives')).filter((f) => f.endsWith('.mjs')).sort().map((f) => `primitives/${f}`)];
test('the interpreter and its primitives write no HTML of their own: the one tag is the emphasis of the repeated headline', () => {
  assert.ok(INTERPRETER_FILES.length >= 11, INTERPRETER_FILES.join(', '));
  const found = [], strings = [], markupCalls = [], dangerous = [], untagged = [];
  for (const f of INTERPRETER_FILES) {
    const { templates, strings: strs, code } = scanSource(fs.readFileSync(path.join(DIRECTIONS_DIR, f), 'utf8'));
    for (const t of templates) {
      if (t.text.includes('<')) found.push({ file: f, tag: t.tag, text: t.text });
      if (t.text.includes('<') && t.hasValue && t.tag !== 'c.m') untagged.push({ file: f, text: t.text });
    }
    for (const s of strs) if (s.includes('<')) strings.push({ file: f, text: s });
    for (const m of code.matchAll(/[\w$.]*\bmarkup\s*\(|new\s+Markup\b|\.innerHTML|\binsertAdjacentHTML|\beval\s*\(|new\s+Function\b|\bString\.raw\b|\bdocument\./g)) (/markup\s*\(/.test(m[0]) && !/new/.test(m[0]) ? markupCalls : dangerous).push({ file: f, what: m[0] });
  }
  // pinned: template literals holding a "<" (a tag): only m`<em data-role="accent">${solid}</em>`, whose value is escaped by m
  assert.deepEqual(found, [{ file: 'primitives/mantra-rows.mjs', tag: 'c.m', text: '<em data-role="accent">${}</em>' }]);
  assert.deepEqual(untagged, [], 'a template with markup and a value that is not the escaping m tag');
  assert.deepEqual(strings, [], 'no quoted string holds a tag');
  assert.deepEqual(dangerous, []);
  // pinned: c.markup (no escaping) is called once, on the parts of a split, which c.parts has already escaped one by one
  assert.deepEqual(markupCalls, [{ file: 'interpret.mjs', what: 'c.markup(' }]);
  assert.match(fs.readFileSync(path.join(DIRECTIONS_DIR, 'interpret.mjs'), 'utf8'), /const parts = c\.parts\(f, el\.split\.sep\);[\s\S]{0,300}c\.markup\(pick\.map\(String\)\.join\(' · '\)\)/);
});
test('the source scanner finds what it should', () => {
  const r = scanSource("const a = c.m`<b>${x}</b>`; // `<i>${y}</i>`\nconst b = '<u>' + `<s>${`<q>`}</s>`; /* `<z>` */ const re = /<p>`/g;");
  assert.deepEqual(r.templates.map((t) => [t.tag, t.text]), [['c.m', '<b>${}</b>'], [null, '<q>'], [null, '<s>${}</s>']]);
  assert.deepEqual(r.strings, ['<u>']);
});
test('the kit refuses a plain string where Markup goes, so a raw spec value cannot reach the page', async () => {
  const { makeContext } = await import('./lib/design/directions/kit.mjs');
  const { tokensFromLook } = await import('./lib/design/directions/look-tokens.mjs');
  const r = resolveLook(RETAIL, { shipped: true });
  const c = makeContext({ spec: specOf('statement', 0, BENIGN), brand: baseBrand, tokens: tokensFromLook(r.look, baseBrand), direction: 'retail', kind: 'statement', variant: 0, comp: r.comps.statement[0], size: SIZES.feed, image: () => PIXEL, imageSize: () => ({ w: 1, h: 1 }) });
  for (const html of ['<script>x</script>', 'plain']) {
    assert.throws(() => c.type({ html, role: 'sub', size: 20, x: 0, y: 0, w: 100 }), /must be Markup/);
    assert.throws(() => c.run({ html, role: 'sub', size: 20 }), /must be Markup/);
    assert.throws(() => c.fitLines({ html, w: 100, h: 100, cap: 50, floor: 20, x: 0, y: 0 }), /must be Markup/);
  }
  for (const k of ['extra', 'cls', 'attrs']) assert.throws(() => c.box({ x: 0, y: 0, w: 1, h: 1, [k]: 'x' }, ''), /takes no/);
  assert.equal(String(c.text('headline')), 'HEAD *PHRASE* TAIL');
  assert.equal(String(c.m`${'<b>"x"</b>'}`), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});

// ====================================================================================================================
// 4. validation first
// ====================================================================================================================
// a valid look that is a copy (origin copy:shipped:retail), as a brand carries it
const copyOfRetail = () => { const l = clone(RETAIL); l.origin = 'copy:shipped:retail'; return l; };
const probe = () => specOf('statement', 0, { headline: 'Probe *words*' });
const PAYLOADS = ['red;background:url(x)', '#ff0000', '<script>alert(1)</script>'];
function refused(look, label, opts = { shipped: false }) {
  const problems = validateLook(look, 'look', opts);
  assert.ok(problems.length > 0, `${label}: the validator accepted it`);
  const r = resolveLook(look, opts);
  assert.ok(r.problems.length > 0 && r.comps === undefined && r.look === undefined, `${label}: resolveLook handed a look on`);
  let err;
  try { renderPostWithLook(look, probe(), ctxFor(), opts); } catch (e) { err = e; }
  assert.ok(err instanceof DesignError, `${label}: ${err?.constructor?.name} ${err?.message}`);
  assert.ok(err.message.startsWith('this look cannot be drawn: '), `${label}: ${err.message}`); // the interpreter was never reached: its errors do not say this
  assert.ok(err.message.includes(problems[0]), `${label}: the first validator problem is in the message`);
  assert.ok(err.message.length <= 600, `${label}: ${err.message.length} characters`);
  for (const p of PAYLOADS) assert.ok(!err.message.includes(p), `${label}: the message echoes a payload`);
  assert.ok(!/[<>]/.test(err.message), `${label}: the message holds an angle bracket`);
  return err;
}
const mutate = (fn) => { const l = copyOfRetail(); fn(l); return l; };
const firstOf = (kind, look) => look.compositions.find((c) => c.kind === kind);
const boxOf = (look) => firstOf('photo', look).elements.find((e) => e.type === 'box');
const stickerOf = (look) => firstOf('photo', look).elements.find((e) => e.type === 'sticker');

test('validation first: an unknown key anywhere refuses the look, and nothing is drawn', () => {
  const cases = {
    'render at the top': (l) => { l.render = 'x'; }, 'cls at the top': (l) => { l.cls = 'evil'; }, 'extra in a section': (l) => { l.devices.extra = 1; }, 'attrs in a composition': (l) => { l.compositions[0].attrs = { onclick: 'x' }; },
    'render in a composition': (l) => { l.compositions[1].render = 'function(){}'; }, 'cls on an element': (l) => { l.compositions[0].elements[0].cls = 'evil'; }, 'extra on an element': (l) => { l.compositions[0].elements[0].extra = 'x'; },
    'attrs on a child': (l) => { boxOf(l).children[0].attrs = { onclick: 'x' }; },
    'style on an element': (l) => { l.compositions[0].elements[0].style = 'color:red'; }, 'class on an element': (l) => { l.compositions[0].elements[0].class = 'x'; }, 'html on a text': (l) => { boxOf(l).children[0].html = '<b>'; },
    'unknown key in a place': (l) => { firstOf('photo', l).elements[0].place.extra = 1; }, 'unknown key in a field spec': (l) => { firstOf('photo', l).fields.headline.html = 'x'; }, 'unknown section': (l) => { l.scripts = []; },
    'unknown key in fonts': (l) => { l.fonts.display.url = 'http://evil.example/f.woff'; },
  };
  for (const [label, edit] of Object.entries(cases)) refused(mutate(edit), label);
  // keys that name the prototype, as own keys: at the top, in a section, in a composition, on an element and in a place
  const where = { top: (l) => l, section: (l) => l.devices, composition: (l) => l.compositions[0], element: (l) => l.compositions[0].elements[0], place: (l) => firstOf('photo', l).elements[0].place };
  for (const [label, pick] of Object.entries(where)) {
    for (const key of ['__proto__', 'constructor', 'prototype', 'render']) {
      const look = copyOfRetail();
      Object.defineProperty(pick(look), key, { value: key === '__proto__' ? { polluted: true } : 'x', enumerable: true, configurable: true, writable: true });
      refused(look, `${key} in ${label}`);
    }
  }
  // the same from text, as a look arrives from a file
  refused(JSON.parse(JSON.stringify(copyOfRetail()).replace('"schema":1', '"schema":1,"__proto__":{"polluted":true}')), 'parsed __proto__');
  refused(JSON.parse(JSON.stringify(copyOfRetail()).replace('"schema":1', '"schema":1,"constructor":{"prototype":{"x":1}}')), 'parsed constructor');
  assert.equal({}.polluted, undefined);
});

test('validation first: a hex colour, or a payload, where a role, an enum or a number goes refuses the look', () => {
  const PAY = 'red;background:url(x)';
  const cases = {
    'hex as a fill': (l) => { boxOf(l).fill = '#ff0000'; }, 'hex as an ink': (l) => { boxOf(l).ink = '#fff'; },
    'hex as a block colour': (l) => { l.compositions.find((c) => c.elements.some((e) => e.type === 'block')).elements.find((e) => e.type === 'block').colour = '#00ff00'; },
    'hex as a frame colour': (l) => { firstOf('photo', l).elements.find((e) => e.type === 'frame').colour = '#123456'; }, 'hex as the shadow colour': (l) => { l.devices.shadow.colour = '#000000'; },
    'rgb as a ring colour': (l) => { stickerOf(l).ring.colour = 'rgb(1,2,3)'; },
    'payload as a role': (l) => { boxOf(l).fill = PAY; }, 'payload as a shadow colour': (l) => { l.devices.shadow.colour = PAY; },
    'payload as an enum': (l) => { firstOf('photo', l).elements[0].shape = PAY; }, 'payload as a style': (l) => { boxOf(l).children[0].style = PAY; },
    'payload as an emphasis': (l) => { boxOf(l).children[0].emphasis = '"><script>alert(1)</script>'; },
    'payload as a ground': (l) => { l.compositions[0].ground = PAY; }, 'payload as a font': (l) => { l.fonts.display.family = PAY; },
    'payload as a number': (l) => { stickerOf(l).size = PAY; }, 'payload as a length': (l) => { boxOf(l).place.anchor.bottom = PAY; },
    'string as a number': (l) => { stickerOf(l).size = '250'; }, 'string as a margin': (l) => { l.canvas.feed.margin.top = '56px'; },
    'NaN': (l) => { stickerOf(l).size = NaN; }, 'Infinity': (l) => { stickerOf(l).size = Infinity; },
    '-Infinity': (l) => { l.devices.frame.t = -Infinity; }, 'too large': (l) => { stickerOf(l).size = 1e9; }, 'negative': (l) => { l.devices.frame.t = -5; },
    'fraction as a whole number': (l) => { l.devices.frame.t = 70.5; }, 'angle out of range': (l) => { boxOf(l).rot = 90; }, 'angle as payload': (l) => { boxOf(l).rot = 'red;x'; },
    'array as a number': (l) => { l.devices.frame.t = [70]; }, 'object as a role': (l) => { boxOf(l).fill = { toString: 'x' }; }, 'null as a role': (l) => { boxOf(l).fill = null; },
    'bool as a number': (l) => { l.devices.frame.t = true; }, 'wrong schema': (l) => { l.schema = 2; }, 'id as payload': (l) => { l.id = '"><script>'; },
    'origin as payload': (l) => { l.origin = `copy:shipped:${PAY}`; }, 'name with a control character': (l) => { l.name = 'a\nb'; },
  };
  for (const [label, edit] of Object.entries(cases)) refused(mutate(edit), label);
});

test('validation first: too many nodes, too deep a tree, an element type that does not exist', () => {
  const rules = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ type: 'rule', place: { px: { x: 0, y: (from + i) * 3 + 1, w: 10 } } }));
  // 41 elements in a composition (the most is 40)
  refused(mutate((l) => { const c = firstOf('photo', l); c.elements = [c.elements[0], ...rules(40)]; assert.equal(c.elements.length, 41); }), '41 nodes');
  const forty = mutate((l) => { const c = firstOf('photo', l); c.elements = [c.elements[0], ...rules(39)]; assert.equal(c.elements.length, 40); });
  assert.ok(!validateLook(forty, 'look', { shipped: false }).some((p) => /at most 40/.test(p)), 'forty nodes is the limit, not more');
  // depth 5 (the most is 4): box in box in box in box in box
  refused(mutate((l) => { const c = firstOf('photo', l); let node = { type: 'text', field: 'headline', style: 'display', size: 60 }; for (let i = 0; i < 5; i++) node = { type: 'box', ...(i === 4 ? { place: { inset: 'frame' } } : {}), flow: 'column', children: [node] }; c.elements = [c.elements[0], node]; }), 'depth 5');
  for (const type of ['script', 'iframe', 'img', 'html', 'constructor', '__proto__', '"><script>x</script>', 'text ', 'TEXT']) {
    refused(mutate((l) => { firstOf('photo', l).elements.push({ type, place: { inset: 'page' } }); }), `element type ${type.slice(0, 12)}`);
  }
  refused(mutate((l) => { firstOf('photo', l).elements.push({ place: { inset: 'page' } }); }), 'no element type');
  refused(mutate((l) => { firstOf('photo', l).elements.push('text'); }), 'an element that is a string');
  refused(mutate((l) => { l.compositions.push(...Array.from({ length: 21 }, () => clone(l.compositions[0]))); }), 'too many compositions');
});

test('validation first: origin "shipped" is the engine\'s own; the brand path refuses it and draws a valid copy', () => {
  assert.equal(RETAIL.origin, 'shipped');
  refused(clone(RETAIL), 'origin shipped without shipped');
  assert.ok(renderPostWithLook(clone(RETAIL), probe(), ctxFor(), { shipped: true }).body, 'with shipped it draws');
  assert.throws(() => renderPostWithLook(clone(RETAIL), probe(), ctxFor()), /this look cannot be drawn: .*origin/);
  // through renderPost: brand.looks = [look] and style.direction = look.id
  const brandWith = (look) => ({ ...baseBrand, style: { ...baseBrand.style, direction: look.id }, looks: [look] });
  const copy = copyOfRetail();
  assert.equal(copy.origin, 'copy:shipped:retail');
  assert.throws(() => renderPost(probe(), ctxFor(brandWith(clone(RETAIL)))), (e) => e instanceof DesignError && e.message.startsWith('this look cannot be drawn: ') && /origin/.test(e.message));
  const out = renderPost(probe(), ctxFor(brandWith(copy)));
  assert.ok(typeof out.body === 'string' && out.post.id === 'retail/statement/0', JSON.stringify(out.post));
  assert.deepEqual(bodyProblems(out.body, 'brand path'), []);
  for (const origin of ['shipped ', 'Shipped', 'copy:shipped:', 'copy:other:x', 'copy:own:../x', '', null, 5]) refused(mutate((l) => { l.origin = origin; }), `origin ${String(origin)}`);
  // a bad look in brand.looks is refused with the same error
  const bad = copyOfRetail(); bad.compositions[0].extra = 1;
  assert.throws(() => renderPost(probe(), ctxFor(brandWith(bad))), (e) => e instanceof DesignError && e.message.startsWith('this look cannot be drawn: '));
});

// ====================================================================================================================
// 5. class and attribute names are fixed sets, derived from the enum tables
// ====================================================================================================================
test('the class set is tied to the enum tables and to kit.css; the attribute names of a drawn page are the allowed ones', () => {
  const css = fs.readFileSync(path.join(HERE, 'design', 'directions', 'kit.css'), 'utf8');
  for (const c of ALLOWED_CLASSES) if (!NO_RULE.has(c) && c !== 'ph' && c !== 'post') assert.ok(new RegExp(`\\.${c}(?![\\w-])`).test(css), `${c} has no rule in kit.css`);
  for (const t of PHOTO_TREATS) assert.ok(ALLOWED_CLASSES.has(`k-${t}`), `treatment ${t}`);
  for (const s of STICKER_SHAPES.filter((x) => x !== 'seal')) assert.ok(ALLOWED_CLASSES.has(`k-shape-${s}`), `shape ${s}`);
  assert.ok(ALLOWED_CLASSES.has('k-seal'));
  for (const e of ['i', 'a', 'n']) assert.ok(ALLOWED_CLASSES.has(`k-em-${e}`));
  assert.ok(ALLOWED_CLASSES.has('k-tilt') && ALLOWED_CLASSES.has('k-v-fill'));
  // and the set is closed: a class that no table gives is refused by the body checker
  for (const c of ['k-shape-seal', 'k-em-x', 'k-evil', 'x', 'k-photo-evil', 'K-T']) assert.ok(bodyProblems(`<div class="${c}"></div>`, 'x').some((p) => /fixed set/.test(p)), c);
  const names = new Set();
  for (const { kind, variant } of listOf(BINDING)) for (const t of tagsOf(renderPostWithLook(BINDING, { ...specOf(kind, variant, BENIGN), items: ['IA', 'IB', 'IC'] }, ctxFor(), { shipped: false }).body)) for (const a of t.matchAll(/\s+([^\s"'<>/=]+)=/g)) names.add(a[1]);
  assert.deepEqual([...names].filter((n) => !ALLOWED_ATTRS.has(n) && !/^data-[a-z0-9]+$/.test(n)), []);
  for (const n of ['class', 'style', 'data-el', 'viewBox', 'textLength', 'src', 'alt']) assert.ok(names.has(n), `${n} was drawn`);
  assert.ok(![...names].some((n) => /^on/i.test(n)));
});

// ====================================================================================================================
// 6. memo and purity
// ====================================================================================================================
test('resolveLook is content-addressed: the same look twice gives the same body, and brands with different looks of one id never meet', () => {
  const spec = specOf('statement', 0, BENIGN); // retail statement 0 is "Stack"
  const A = copyOfRetail(), B = copyOfRetail();
  B.compositions.find((c) => c.kind === 'statement' && c.name === 'Stack').elements.find((e) => e.type === 'block').colour = 'accent'; // a different look with the same id
  assert.equal(A.id, B.id);
  const draw = (look) => renderPostWithLook(look, spec, ctxFor(), { shipped: false }).body;
  const a1 = draw(A), b1 = draw(B), a2 = draw(A), b2 = draw(B);
  assert.equal(a1, a2); assert.equal(b1, b2); assert.notEqual(a1, b1);
  assert.equal(draw(clone(A)), a1, 'a copy of the same content is the same look');
  // through two brands, in the order A, B, A
  const brandWith = (look) => ({ ...baseBrand, style: { ...baseBrand.style, direction: look.id }, looks: [look] });
  const viaBrand = (look) => renderPost(spec, ctxFor(brandWith(look))).body;
  const x1 = viaBrand(A), y1 = viaBrand(B), x2 = viaBrand(A);
  assert.equal(x1, x2); assert.notEqual(x1, y1); assert.equal(x1, a1); assert.equal(y1, b1);
  // shipped and brand are different keys: the same content is refused as a brand's look and drawn as a shipped one, in either order
  assert.ok(resolveLook(RETAIL, { shipped: false }).problems.length > 0);
  assert.ok(resolveLook(RETAIL, { shipped: true }).problems.length === 0, 'the refusal did not poison the shipped entry');
  assert.ok(resolveLook(RETAIL, { shipped: false }).problems.length > 0, 'the shipped entry did not open the brand path');
  // a refused look stays refused (the memo holds problems too)
  const bad = copyOfRetail(); bad.compositions[0].extra = 1;
  for (let i = 0; i < 3; i++) assert.ok(resolveLook(bad).problems.length > 0);
});

test('a look cannot be changed after it is resolved: mutating the original or the resolved look does not change a later draw of the same content', () => {
  const spec = specOf('statement', 0, BENIGN);
  const original = copyOfRetail(), pristine = clone(original);
  const draw = (look) => renderPostWithLook(look, spec, ctxFor(), { shipped: false }).body;
  const before = draw(original);
  const r = resolveLook(original, { shipped: false });
  // mutate what the caller passed in
  const stack = original.compositions.find((c) => c.name === 'Stack');
  stack.elements[0].gap = 99; stack.name = 'Changed'; original.devices.shadow.x = 3; original.type.display.lead = 1.1; original.fonts.display.weights.push(100);
  assert.equal(draw(clone(pristine)), before, 'mutating the input after resolveLook changed what the same content draws');
  // mutate what resolveLook returned (frozen, or a copy nobody else holds)
  const edits = [(l) => { l.compositions[0].elements[0].fill = 'ink'; }, (l) => { l.type.display.lead = 0.5; }, (l) => { l.devices.rule.hair = 4; }, (l) => { l.compositions.length = 0; }, (l) => { l.canvas.feed.margin.top = 200; }];
  for (const edit of edits) { try { edit(r.look); } catch { /* frozen: refused */ } }
  for (const list of Object.values(r.comps)) for (const comp of list) { try { comp.data.elements[0].fill = 'ink'; comp.data.elements.length = 0; } catch { /* frozen */ } }
  assert.equal(draw(clone(pristine)), before, 'mutating the resolved look changed what the same content draws');
});

// resolveLook hands the same resolved object to every caller of the same content: the look inside it is frozen, but the composition objects built from it (comps) must
// not be changeable either, or one caller's change would reach every brand that carries the same look
test('the compositions resolveLook builds cannot be changed by a caller either (the memo is shared)', () => {
  const spec = specOf('statement', 0, BENIGN);
  const look = copyOfRetail();
  const draw = () => renderPostWithLook(clone(look), spec, ctxFor(), { shipped: false }).body;
  const before = draw();
  const comp = resolveLook(look, { shipped: false }).comps.statement[0];
  for (const edit of [() => { comp.groundOf = () => 'dark'; }, () => { comp.ground = 'dark'; }, () => { comp.accepts = () => false; }, () => { comp.fitSpec = 'frame'; }, () => { comp.calm = { maxShare: 0.8 }; }, () => { comp.words.headline = 1; }, () => { comp.fields.push('x'); }]) {
    try { edit(); } catch { /* frozen: refused */ }
  }
  assert.equal(draw(), before);
});
