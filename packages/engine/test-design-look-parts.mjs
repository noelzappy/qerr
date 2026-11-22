// node --test   (no Chrome: words in pills and inline icons in headlines, info blocks, buttons and rows of round pictures, as bounded and validated
// look capabilities. A post's words are untrusted: through every new binding they reach the page only as escaped text; icons come only from the
// engine's own table; pictures only as the checked data: URI the page was given; every count, size, colour and shape is validated.)
//
//   1. the post fields: [[pill]] and {{icon}} marks, info rows, the cta, gallery pictures (post-spec.mjs), hostile values refused, never echoed;
//   2. the look schema: pills and icons on a headline text, the info-rows, button and photo-row primitives, their own rules and ink pairs;
//   3. drawing: a look that uses all of them, from hostile copy, holds only allowed tags, attributes, classes and styles; counts are bounded;
//   4. the brief, the post kinds and the page's picture loading know the new fields.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { DesignError } from './lib/design/errors.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { ICONS, ICON_NAMES, PATH_DATA } from './lib/design/icons.mjs';
import { INFO_KEYS, INLINE, markProblems, postProblems, seenText, withoutMarks } from './lib/design/post-spec.mjs';
import { lookBrief, lookCatalogue, validateLook } from './lib/design/look.mjs';
import { COLOUR_NAMES, emphasisParts } from './lib/design/directions/kit.mjs';
import { postKinds, renderPostWithLook } from './lib/design/directions/index.mjs';
import { preparePage } from './lib/design/render.mjs';
import { validateDesign } from './lib/design/spec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const SWISS = JSON.parse(fs.readFileSync(path.join(HERE, 'testlib', 'looks', 'swiss.sample.json'), 'utf8'));
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brand = loadBrand();
const ctx = (b = brand) => ({ size: SIZES.feed, brand: b, image: () => PIXEL, imageSize: () => ({ w: 600, h: 600 }) });
const HOSTILE = [
  '"><script>window.__pwn=1</script>', '<img src=x onerror="window.__pwn=3">', "';alert(1);//", '</div><svg onload=window.__pwn=4>', 'javascript:alert(5)',
  'url(http://evil.example/x.png)', '`${window.__pwn=6}`', '&lt;b&gt;', '}}{{', ']]', '[[', '{{../../etc/passwd}}', '[[<b>x</b>]]', '{{star" onload="x}}',
];
const post = (extra) => ({ template: 'post', kind: 'event', headline: 'Meet the *roasters*', meta: '12 Dec · 6pm · The roastery', ...extra });
const problems = (extra) => postProblems(post(extra), 'design', { direction: 'swiss' });

// ======================================================================= 1. the post fields
test('icons: a fixed, shipped table of plain path data', () => {
  assert.ok(ICON_NAMES.length >= 12 && ICON_NAMES.length <= 40);
  for (const n of ICON_NAMES) {
    assert.match(n, /^[a-z][a-z-]{0,19}$/);
    assert.match(ICONS[n].d, PATH_DATA, `${n}: path data only`);
    assert.ok(ICONS[n].d.length < 400 && typeof ICONS[n].label === 'string');
  }
  assert.ok(Object.isFrozen(ICONS));
});

test('headline marks: pills of one to three plain words and icons of the fixed set, at most two of each, only in the headline', () => {
  assert.deepEqual(problems({ headline: 'Coffee [[on us]] this *Friday*' }), []);
  assert.deepEqual(problems({ headline: '{{star}} Two [[new]] blends [[out now]] {{arrow-right}}' }), []);
  const bad = [
    ['[[one two three four]] beans', /holds 4 words/], ['[[a]] [[b]] [[c]] beans', /3 pills; the most is 2/], ['[[]] beans', /not closed|empty pill/],
    ['[[all of it]]', /the whole text/], ['[[open beans', /not closed/], ['beans]] here', /not closed/], ['{{star}}{{star}}{{star}} x', /3 icons/],
    ['{{rocket}} launch', /is not one of the icons/], ['*a [[b]] c* d', /holds a pill or an icon/], ['[[*em*]] d', /not closed|cannot hold/],
    ['[[a{{star}}]] d', /not closed|cannot hold/], ['x [[' + 'w'.repeat(30) + ']]', /characters; the most is 24/],
  ];
  for (const [h, why] of bad) assert.ok(problems({ headline: h }).some((p) => why.test(p)), `${h}: ${problems({ headline: h }).join(' | ')}`);
  for (const f of ['sub', 'label', 'tag', 'cta']) assert.ok(problems({ [f]: 'Hi [[there]]' }).some((p) => /takes no \[\[pill\]\]/.test(p)), f);
  assert.ok(problems({ items: ['a {{star}}', 'b'] }).some((p) => /items\[0\] takes no/.test(p)));
  assert.equal(INLINE.pills, 2);
  // what is seen: brackets do not count, an icon counts as two characters
  assert.equal([...seenText('[[on us]] {{star}}')].length, 'on us '.length + 2);
  assert.equal(withoutMarks('{{star}} Two [[new]] blends'), ' Two new blends');
  assert.deepEqual(emphasisParts('{{star}} [[Fresh]] beans *every* day'), { pre: 'Fresh beans', phrase: 'every', post: 'day' });
});

test('hostile marks are refused with messages that never echo the payload', () => {
  for (const h of HOSTILE) {
    const ps = problems({ headline: `Beans ${h}` });
    for (const p of ps) assert.ok(!/<script|onerror|onload|javascript:|evil\.example|passwd/.test(p), `${h}: ${p}`);
  }
  assert.ok(markProblems('x {{star" onload="x}}', 'headline').length > 0);
});

test('info rows: one to four rows, each a fixed label and one line of plain words, each label once', () => {
  assert.deepEqual(problems({ info: [{ key: 'When', value: 'Sat 12 Dec, 6pm' }, { key: 'Book on', value: 'roastery.example' }] }), []);
  const bad = [
    [[], /1 to 4 rows/], [Array.from({ length: 5 }, (_, i) => ({ key: INFO_KEYS[i], value: 'x' })), /1 to 4 rows/], ['When: now', /1 to 4 rows/],
    [[{ key: 'when', value: 'x' }], /key must be one of/], [[{ key: '<script>', value: 'x' }], /key must be one of/], [[{ key: 'When', value: '' }], /non-empty/],
    [[{ key: 'When', value: 'a\nb' }], /one line/], [[{ key: 'When', value: 'x'.repeat(41) }], /41 characters; the most is 40/], [[{ key: 'When', value: '[[x]]' }], /takes no/],
    [[{ key: 'When', value: 'a' }, { key: 'When', value: 'b' }], /used twice/], [[{ key: 'When', value: 'a', style: 'red' }], /not part of an info row/], [['x'], /must be an object/],
    [[{ key: 'When', value: 7 }], /non-empty text/],
  ];
  for (const [info, why] of bad) {
    const ps = problems({ info });
    assert.ok(ps.some((p) => why.test(p)), `${JSON.stringify(info).slice(0, 60)}: ${ps.join(' | ')}`);
    for (const p of ps) assert.ok(!p.includes('<script>'), 'the key is never echoed');
  }
});

test('cta: one line of up to 24 characters', () => {
  assert.deepEqual(problems({ cta: 'Book a seat' }), []);
  assert.ok(problems({ cta: 'x'.repeat(25) }).some((p) => /cta is 25 characters; the most is 24/.test(p)));
  assert.ok(problems({ cta: 'a\nb' }).some((p) => /one line/.test(p)));
  assert.ok(problems({ cta: '' }).some((p) => /non-empty/.test(p)));
});

test('gallery: two to five pictures, image files only, each once, a caption of one line up to 24 characters', () => {
  const pic = (i, extra = {}) => ({ image: `design/assets/photos/p${i}.jpg`, ...extra });
  assert.deepEqual(problems({ gallery: [pic(1, { caption: 'Ama' }), pic(2)] }), []);
  const bad = [
    [[pic(1)], /2 to 5 pictures/], [[1, 2, 3, 4, 5, 6].map((i) => pic(i)), /2 to 5 pictures/], [[pic(1), pic(1)], /used twice/],
    [[pic(1), { image: 'x.svg' }], /must be \.jpg/], [[pic(1), { image: 'javascript:alert(1)' }], /must be \.jpg/], [[pic(1), {}], /file path/],
    [[pic(1), pic(2, { caption: 'x'.repeat(25) })], /25 characters/], [[pic(1), pic(2, { caption: '*x*' })], /takes no/],
    [[pic(1), pic(2, { vaultItemId: 'x' })], /not part of a picture in a row/], [[pic(1), 'a.jpg'], /must be an object/],
  ];
  for (const [g, why] of bad) {
    const ps = problems({ gallery: g });
    assert.ok(ps.some((p) => why.test(p)), `${JSON.stringify(g).slice(0, 80)}: ${ps.join(' | ')}`);
    for (const p of ps) assert.ok(!p.includes('javascript:'), 'a hostile path is not echoed');
  }
  assert.deepEqual(validateDesign(post({ gallery: [pic(1), pic(2)], info: [{ key: 'Where', value: 'Here' }], cta: 'Go' }), 'design', { direction: 'swiss' }), []);
});

// ======================================================================= 2. the look schema
const PX = (x, y, w, h) => ({ px: { x, y, w, h } });
const HEAD = { type: 'text', field: 'headline', style: 'display', size: 96, place: PX(64, 200, 952, 300) };
// (a value given as undefined in `extra` leaves that setting out)
function partsLook(extra = {}) {
  return clone({
    ...clone(SWISS), id: 'parts', origin: 'copy:shipped:swiss', name: 'Parts',
    compositions: [{
      kind: 'event', name: 'Parts', describe: 'A headline with pills and icons, an info block, a button and a row of round pictures.', ground: 'paper',
      fields: { headline: { required: true, max: 60 }, meta: { required: true, max: 40 }, cta: { max: 24 }, info: { max: 4 }, gallery: { min: 2, max: 5 } },
      elements: [
        { ...HEAD, pills: { shape: 'pill', fill: 'accent', ink: 'on-accent' }, icons: { colour: 'accent-type' }, ...(extra.head ?? {}) },
        { type: 'text', field: 'meta', style: 'label', place: PX(64, 140, 952, 40) },
        { type: 'info-rows', place: PX(64, 560, 952, 260), rule: 'hair', valueStyle: 'label', ...(extra.info ?? {}) },
        { type: 'photo-row', place: PX(64, 860, 952, 260), captions: true, ring: { w: 4, colour: 'paper' }, ...(extra.row ?? {}) },
        { type: 'button', place: PX(64, 1160, 952, 110), size: 20, icon: 'arrow-right', fill: 'ink', ink: 'white', ...(extra.button ?? {}) },
        ...(extra.more ?? []),
      ],
    }],
  });
}
const errsOf = (l) => validateLook(l, 'look', {});

test('the look schema: a look using every new capability is valid, and the catalogue offers them', () => {
  assert.deepEqual(errsOf(partsLook()), []);
  const cat = lookCatalogue();
  for (const t of ['info-rows', 'button', 'photo-row']) assert.ok(cat.elements[t], t);
  assert.deepEqual(Object.keys(cat.elements.text.properties.pills.props), ['shape', 'fill', 'ink']);
  assert.ok(cat.elements.text.properties.icons);
  assert.deepEqual(cat.lists.icons, [...ICON_NAMES]);
  assert.deepEqual(cat.lists.infoKeys, INFO_KEYS);
  assert.deepEqual(cat.elements.button.properties.icon.values, ['none', ...ICON_NAMES]);
  assert.deepEqual([cat.fields.info.type, cat.fields.info.min, cat.fields.info.max], ['items', 1, 4]);
  assert.deepEqual([cat.fields.gallery.type, cat.fields.gallery.min, cat.fields.gallery.max], ['items', 2, 5]);
  assert.equal(cat.fields.cta.max, 24);
  assert.ok(cat.kinds.event.fields.includes('gallery') && !cat.kinds.figure.fields.includes('gallery'));
});

test('the look schema: pills and icons only on a whole headline, pill colours from the fill table, ink that reads', () => {
  const says = (l, re, what) => { const e = errsOf(l); assert.ok(e.some((m) => re.test(m)), `${what}: ${e.join(' | ')}`); };
  says(partsLook({ head: { field: 'meta', style: 'label' } }), /draws the marks of a whole headline/, 'pills on another field');
  says(partsLook({ head: { part: 'pre' } }), /draws the marks of a whole headline/, 'pills on a part');
  says(partsLook({ head: { pills: { shape: 'outline', fill: 'accent', ink: 'ink' } } }), /an outline pill has no fill/, 'outline with a fill');
  says(partsLook({ head: { pills: { shape: 'soft', ink: 'ink' } } }), /a soft needs a fill/, 'a soft pill without a fill');
  says(partsLook({ head: { pills: { fill: 'accent', ink: 'white' } } }), /pills: ink white does not read on fill accent/, 'ink on its fill');
  says(partsLook({ head: { pills: { fill: 'rule', ink: 'ink' } } }), /must be a colour a panel can be filled with/, 'a fill that is no panel');
  says(partsLook({ head: { pills: { shape: 'outline', ink: 'white' } } }), /pills: ink white does not read on fill paper/, 'an outline on the page');
  says(partsLook({ head: { pills: { fill: '#ff0000', ink: 'ink' } } }), /colour role/, 'a hex colour');
  says(partsLook({ head: { pills: { fill: 'accent', ink: 'on-accent', shape: 'blob' } } }), /must be one of pill, soft, outline/, 'a free shape');
  says(partsLook({ head: { icons: { colour: 'red;background:url(x)' } } }), /colour role/, 'a style payload');
  says(partsLook({ head: { icons: { svg: '<path d="M0"/>' } } }), /is not a setting/, 'free SVG');
  says(partsLook({ head: { pills: { fill: 'accent', ink: 'on-accent', render: 'x' } } }), /not allowed|is not a setting/, 'a render key');
});

test('the look schema: the primitives\' own rules, counts and inks', () => {
  const says = (l, re, what) => { const e = errsOf(l); assert.ok(e.some((m) => re.test(m)), `${what}: ${e.join(' | ')}`); };
  says(partsLook({ info: { layout: 'stacked', labelSpan: 2 } }), /labelSpan is for labels beside/, 'labelSpan stacked');
  says(partsLook({ info: { maxLines: 3 } }), /maxLines must be a whole number from 1 to 2/, 'three lines');
  says(partsLook({ info: { labelInk: 'white' } }), /ink white does not read on fill paper/, 'an unreadable label');
  says(partsLook({ button: { fill: 'accent', ink: 'white' } }), /ink white does not read on fill accent/, 'button ink');
  says(partsLook({ button: { width: 'full', align: 'center' } }), /align places a hugging button/, 'align on full');
  says(partsLook({ button: { field: 'sub' } }), /must be one of cta, tag, label/, 'a button on the sub line');
  says(partsLook({ button: { icon: 'rocket' } }), /icon must be one of none, arrow-right/, 'an icon not in the set');
  says(partsLook({ button: { size: 90 } }), /size must be a whole number from 20 to 60/, 'a huge button');
  says(partsLook({ row: { overlap: 30, gap: 24 } }), /the gap must be 0/, 'overlap with a gap');
  says(partsLook({ row: { overlap: 30 } }), /cannot go with names under the pictures/, 'overlap with names');
  assert.deepEqual(errsOf(partsLook({ row: { overlap: 30, gap: 0, captions: false } })), [], 'a stacked row with rings');
  says(partsLook({ row: { overlap: 30, gap: 0, ring: undefined, captions: false } }), /needs a ring/, 'overlap without a ring');
  says(partsLook({ row: { size: 500 } }), /size must be a whole number from 80 to 400/, 'a huge circle');
  says(partsLook({ row: { captions: false, captionInk: 'ink' } }), /turn them on/, 'a caption colour without captions');
  says(partsLook({ row: { shadow: 'hard' } }), /soft shadow/, 'a hard shadow on a circle');
  says(partsLook({ row: { treat: ['sepia'] } }), /must be one of grey/, 'a free treatment');
  // the composition's counts are bounded by the post's own
  const fl = (f) => { const l = partsLook(); l.compositions[0].fields = { ...l.compositions[0].fields, ...f }; return l; };
  says(fl({ info: { max: 5 } }), /info\.max must be a whole number from 1 to 4/, 'five info rows');
  says(fl({ gallery: { min: 1 } }), /gallery\.min must be a whole number from 2 to 5/, 'one picture');
  says(fl({ gallery: { max: 6 } }), /from 2 to 5/, 'six pictures');
  says(fl({ cta: { max: 30 } }), /cta\.max must be a whole number of characters from 1 to 24/, 'a long button');
  const undeclared = partsLook(); delete undeclared.compositions[0].fields.gallery;
  says(undeclared, /gallery, which the composition does not declare/, 'a row of pictures the composition does not declare');
  // text over a row of round pictures needs a filled box or a fade
  says(partsLook({ more: [{ type: 'text', field: 'cta', style: 'label', place: PX(64, 900, 400, 40), z: 3 }] }), /lies over a picture/, 'text over the round pictures');
  // the new parts count as type levels
  says(partsLook({ info: { valueStyle: 'body', valueSize: 40 }, button: { size: 30 } }), /sets type in 4 sizes/, 'four levels');
});

// ======================================================================= 3. drawing
const ALLOWED_TAGS = new Set(['div', 'span', 'i', 'em', 'img', 'br', 'svg', 'path', 'text', 'textPath']);
const ALLOWED_ATTRS = new Set(['class', 'style', 'src', 'alt', 'viewBox', 'd', 'aria-hidden', 'aria-label', 'role', 'id', 'href', 'width', 'height', 'fill', 'textLength', 'lengthAdjust']);
const NEW_CLASSES = ['k-pl', 'k-pl-round', 'k-pl-soft', 'k-pl-line', 'k-pl-t', 'k-pl-stop', 'k-pl-end', 'k-pl-p', 'k-ic', 'k-ic-btn', 'k-round'];
const KIT_CSS = fs.readFileSync(path.join(HERE, 'design', 'directions', 'kit.css'), 'utf8');
const NAME = `(?:${COLOUR_NAMES.join('|')})`;
// every declaration of a style outside the page root: a property of this list, a value of numbers, fixed words and palette roles only
const PROPS = new Set(['left', 'top', 'right', 'bottom', 'width', 'height', 'min-height', 'margin-left', 'margin-top', 'gap', 'inset', 'padding', 'border-radius', 'border', 'font-size', 'font-family', 'font-weight',
  'line-height', 'letter-spacing', 'color', 'background', 'box-shadow', 'transform', 'transform-origin', 'display', 'flex-direction', 'justify-content', 'align-items', 'align-self', 'flex', 'text-align',
  'text-transform', 'white-space', 'object-position', 'font-style', 'z-index', 'fill', 'font-variant-numeric', 'box-sizing', 'overflow', 'opacity']);
const VALUE = /^[a-z0-9 .,%()*+-]+$/i;
function bodyProblems(body, where) {
  const bad = [];
  if (/[<>]/.test(body.replace(/<[^>]*>/g, ''))) bad.push(`${where}: a raw angle bracket in the text`);
  for (const tag of body.match(/<[^>]*>/g) ?? []) {
    const m = /^<\/?([A-Za-z][\w-]*)((?:\s+[^\s"'<>/=]+(?:="[^"<>]*")?)*)\s*\/?>$/.exec(tag);
    if (!m) { bad.push(`${where}: a tag that does not parse: ${tag.slice(0, 60)}`); continue; }
    if (!ALLOWED_TAGS.has(m[1])) bad.push(`${where}: tag ${m[1]}`);
    for (const a of m[2].matchAll(/\s+([^\s"'<>/=]+)(?:="([^"]*)")?/g)) {
      const [, name, value = ''] = a;
      if (!ALLOWED_ATTRS.has(name) && !/^data-[a-z0-9]+$/.test(name)) bad.push(`${where}: attribute ${name}`);
      if (/^on/i.test(name)) bad.push(`${where}: a handler ${name}`);
      if (name === 'src' && value !== PIXEL) bad.push(`${where}: an image source other than the checked data: URI`);
      if (name === 'd' && !PATH_DATA.test(value)) bad.push(`${where}: path data that is not the engine's`);
      if (name === 'd' && !ICON_NAMES.some((n) => ICONS[n].d === value) && !/^M [\d.]+ [\d.]+ a /.test(value)) bad.push(`${where}: a path not from the icon table`);
      if (name !== 'style' && name !== 'src' && name !== 'data-name' && /[;"'`<>]|javascript|url\(/i.test(value)) bad.push(`${where}: attribute ${name} holds ${value.slice(0, 40)}`);
      if (name === 'data-name' && /["<>]/.test(value)) bad.push(`${where}: data-name not escaped`);
      if (name === 'style' && !value.startsWith('--bg:')) {
        for (const decl of value.split(';').filter(Boolean)) {
          const i = decl.indexOf(':'), prop = decl.slice(0, i), val = decl.slice(i + 1);
          if (prop.startsWith('--c-') && /^#[0-9a-f]{6}$/i.test(val)) continue; // the one-accent scope (kit scope)
          if (!PROPS.has(prop)) bad.push(`${where}: style property ${prop}`);
          else if (!VALUE.test(val.replace(new RegExp(`var\\(--c-${NAME}\\)`, 'g'), 'C').replace(/var\(--f-(?:display|text|label|mono)\)/g, 'F').replace(/var\(--h(?:s|-scale),1\)/g, '1'))) bad.push(`${where}: ${prop}: ${val.slice(0, 50)}`);
          if (/var\(--c-/.test(val) && /var\(--c-(?![a-z-]+\))/.test(val)) bad.push(`${where}: a broken colour`);
          for (const v of val.matchAll(/var\(--c-([a-z-]+)\)/g)) if (!COLOUR_NAMES.includes(v[1])) bad.push(`${where}: colour ${v[1]}`);
        }
      }
    }
  }
  if (/url\(|expression|javascript:|<script|onerror=|onload=/i.test((body.match(/<[^>]*>/g) ?? []).join('').replace(/--k-grain:url\(data:image\/svg\+xml,[%0-9A-Za-z._~-]*\)/g, '').replace(/ src="data:image\/png;base64,[^"]*"/g, '').replace(/ data-name="[^"]*"/g, ''))) bad.push(`${where}: a url, script or handler in a tag`);
  return bad;
}

const GOOD = { headline: '{{star}} Meet the [[roasters]] this *Friday*', meta: '12 Dec · 6pm · The roastery', cta: 'Book a seat',
  info: [{ key: 'When', value: 'Sat 12 Dec, 6pm' }, { key: 'Where', value: 'The roastery' }, { key: 'Book on', value: 'roastery.example' }],
  gallery: [{ image: 'design/assets/demo/object-jar.jpg', caption: 'Ama' }, { image: 'design/assets/demo/scene-market.jpg', caption: 'Kofi' }, { image: 'design/assets/demo/x.jpg' }] };
const draw = (look, words, b = brand) => renderPostWithLook(look, { template: 'post', kind: 'event', name: 'parts-test', ...words }, ctx(b), { shipped: false });

test('drawing: pills, icons, an info block, a button and round pictures from benign words', () => {
  const { body } = draw(partsLook(), GOOD);
  assert.deepEqual(bodyProblems(body, 'benign'), []);
  assert.match(body, /<span class="k-pl k-pl-round" style="background:var\(--c-accent\);color:var\(--c-on-accent\)"><span class="k-pl-t" data-role="accent">roasters<\/span><\/span>/);
  assert.match(body, /<svg class="k-ic" viewBox="0 0 24 24" aria-hidden="true" data-deco style="fill:var\(--c-accent-type\)"><path d="[^"]+"\/><\/svg>/);
  assert.equal((body.match(/class="k-ic k-ic-btn"/g) ?? []).length, 1, 'the button\'s arrow');
  for (const w of ['>When<', '>Sat 12 Dec, 6pm<', '>Book on<', '>roastery.example<', '>Book a seat<', '>Ama<', '>Kofi<']) assert.ok(body.includes(w), w);
  assert.equal((body.match(/<img data-user data-name="design\/assets\/demo\/[a-z-]+\.jpg" data-fit="cover"/g) ?? []).length, 3, 'three round pictures, each read as a picture');
  assert.equal((body.match(/k-round/g) ?? []).length, 3);
  assert.equal((body.match(/ data-cell/g) ?? []).length, 3 + 1 + 2, 'each info value, the button, each caption in a cell the fit check holds it to');
  assert.ok(!body.includes('[[') && !body.includes('{{'), 'no mark is left in the page');
  // every new class has a rule in the one stylesheet
  for (const k of NEW_CLASSES) assert.ok(KIT_CSS.includes(`.${k}`), k);
  for (const c of body.matchAll(/ class="([^"]*)"/g)) for (const k of c[1].split(/\s+/)) if (k.startsWith('k-pl') || k.startsWith('k-ic') || k === 'k-round') assert.ok(NEW_CLASSES.includes(k), k);
});

test('drawing: a composition without pills or icons shows the pill words plainly and leaves the icons out', () => {
  const l = partsLook(); delete l.compositions[0].elements[0].pills; delete l.compositions[0].elements[0].icons;
  const { body } = draw(l, GOOD);
  assert.ok(body.includes('Meet the roasters this'), 'the words, plain');
  assert.ok(!body.includes('k-pl') && !/<svg class="k-ic"/.test(body) && !body.includes('[[') && !body.includes('{{star}}'));
  // a fitted headline (rebuilt by the page) never carries the marks either
  const f = partsLook(); f.compositions[0].elements[0] = { type: 'fitted-stack', field: 'headline', mode: 'lines', cap: 160, floor: 60, place: PX(64, 200, 952, 300) };
  const fb = draw(f, GOOD).body;
  assert.ok(!fb.includes('k-pl') && !fb.includes('[[') && !fb.includes('{{') && !/<svg class="k-ic"/.test(fb));
});

test('drawing: hostile words in every new binding and the brand name are escaped text only', () => {
  let n = 0;
  for (const h of HOSTILE) {
    for (const words of [
      { ...GOOD, headline: `[[${h}]] ${h} {{star}}` },
      { ...GOOD, headline: `${h.slice(0, 20)} [[x]] {{${h}}}` },
      { ...GOOD, cta: h, info: [{ key: 'When', value: h }, { key: h, value: 'x' }, { key: '__proto__', value: h }], gallery: [{ image: h, caption: h }, { image: `${h}.jpg`, caption: h }] },
    ]) {
      let r;
      try { r = draw(partsLook(), words, { ...brand, name: h }); } catch (e) { assert.ok(e instanceof DesignError, `${h}: ${e.message}`); continue; }
      assert.deepEqual(bodyProblems(r.body, h.slice(0, 20)), []);
      assert.ok(!r.body.includes('>__proto__<') && !r.body.includes(`>${h}<`) || !/[<>"]/.test(h), 'a key outside the list is never drawn; markup is escaped');
      n++;
    }
  }
  assert.ok(n >= HOSTILE.length * 2, `drew ${n}`);
});

test('drawing: counts are bounded whatever reaches the page (at most four info rows of known labels, five pictures)', () => {
  const many = { ...GOOD, info: [...INFO_KEYS.map((key) => ({ key, value: key.toLowerCase() })), { key: 'Evil', value: 'x' }], gallery: Array.from({ length: 9 }, (_, i) => ({ image: `design/assets/p${i}.jpg`, caption: `N${i}` })) };
  const { body } = draw(partsLook(), many);
  assert.equal((body.match(/k-round/g) ?? []).length, 5);
  assert.equal((body.match(/data-role="meta"/g) ?? []).length, 1 + 4, 'the meta line and four info values');
  assert.ok(!body.includes('>Evil<'));
  // fewer than drawn: two pictures share the row's width, each at most the size
  const two = draw(partsLook({ row: { size: 180 } }), { ...GOOD, gallery: GOOD.gallery.slice(0, 2) }).body;
  assert.equal((two.match(/width:180px;height:180px;border-radius:50%/g) ?? []).length, 2);
  // too narrow a place for the pictures is a refusal, never a squashed row
  assert.throws(() => draw(partsLook({ row: { place: PX(64, 860, 200, 260) } }), { ...GOOD, gallery: [...GOOD.gallery, { image: 'a.jpg' }, { image: 'b.jpg' }] }), DesignError);
});

// ======================================================================= 4. brief, post kinds and picture loading
test('the brief and the post kinds carry the new fields and their counts', () => {
  const l = partsLook();
  const brief = lookBrief(l);
  assert.deepEqual(brief.kinds.event.variants[0].fields.info, { required: false, max: 4 });
  assert.deepEqual(brief.kinds.event.variants[0].fields.gallery, { required: false, max: 5, min: 2 });
  assert.deepEqual(brief.kinds.event.variants[0].fields.cta, { required: false, max: 24 });
  const kinds = postKinds({ ...brand, looks: [l], style: { ...brand.style, direction: 'parts' } });
  assert.deepEqual(kinds.event.fields.info, { min: 1, max: 4, chars: 40 });
  assert.deepEqual(kinds.event.fields.gallery, { min: 2, max: 5, chars: 24 });
  // a post is held to the look's own counts
  const narrow = partsLook(); narrow.compositions[0].fields.gallery = { min: 2, max: 3 };
  const ps = postProblems(post({ gallery: [1, 2, 3, 4].map((i) => ({ image: `a${i}.jpg` })) }), 'design', { brief: lookBrief(narrow) });
  assert.ok(ps.some((p) => /draws 2 to 3 pictures in a row, not 4/.test(p)), ps.join(' | '));
});

test('the page reads every picture of a row through the same checks as the post\'s picture', () => {
  const job = (gallery) => ({ spec: { template: 'post', kind: 'event', headline: 'x', meta: 'y', gallery, sizes: ['feed'] }, sizeName: 'feed' });
  for (const bad of ['../../../etc/passwd.jpg', '/etc/hosts.jpg', 'design/assets/demo/missing.jpg', 'design/assets/demo/object-jar.svg']) {
    assert.throws(() => preparePage(brand, job([{ image: 'design/assets/demo/object-jar.jpg' }, { image: bad }])), DesignError, bad);
  }
});
