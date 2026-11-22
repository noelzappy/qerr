// node --test   (no Chrome: a picture taped on at an angle, a paper texture, round icon badges, bold emphasis and icons in round badges in a
// headline, as bounded look capabilities)
//
//   1. each piece validates, survives normaliseLook and draws markup that holds only palette roles, fixed classes and checked numbers;
//   2. hostile values in every new field are refused with short messages that never echo them;
//   3. the kit builders refuse out-of-range numbers, unknown names and free strings themselves;
//   4. hostile words in a headline with bold emphasis and badged icons reach the page only as escaped text.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseLook, validateLook } from './lib/design/look.mjs';
import { renderPostWithLook } from './lib/design/directions/index.mjs';
import { COLOUR_NAMES, makeContext } from './lib/design/directions/kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const RETAIL = JSON.parse(fs.readFileSync(path.join(HERE, 'testlib', 'looks', 'retail.sample.json'), 'utf8'));
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brand = loadBrand();
const PAYLOADS = ['red;background:url(//evil.example/x)', '</style><script>window.__pwn=1</script>', 'javascript:alert(1)', '"><img src=x onerror=alert(1)>', 'url(data:text/html,x)', 'x'.repeat(5000)];
const AT = (x, y, w, h) => ({ px: { x, y, w, h } });

// A look with one figure composition (a figure may show a picture) holding the given elements beside a big figure and a headline.
function lookWith(elements, { headline = {} } = {}) {
  const l = clone(RETAIL);
  l.id = 'paste'; l.name = 'Paste'; l.origin = 'copy:own:paste';
  l.colour.grounds = ['paper', 'field', 'soft'];
  l.photo.treat = [];
  l.fonts.text = { source: 'library', family: 'Hanken Grotesk', weights: [500, 600] };
  l.compositions = [{
    kind: 'figure', name: 'Figure', describe: 'A figure with the pieces under test.', ground: 'paper', calm: { maxShare: 0.8 },
    fields: { big: { required: true, max: 8 }, headline: { max: 70 }, ...(elements.some((e) => e.type === 'taped-photo') ? { image: {} } : {}) },
    elements: [
      { type: 'text', field: 'big', style: 'numeral', size: 200, place: AT(60, 60, 600, 220) },
      { type: 'text', field: 'headline', style: 'display', size: 60, font: 'text', weight: 500, emphasis: 'bold', icons: { colour: 'on-field', badge: 'field' }, place: AT(60, 300, 900, 200), ...headline },
      ...clone(elements),
    ],
  }];
  return l;
}
const TAPED = { type: 'taped-photo', place: AT(140, 600, 800, 560), rot: -3, keyline: 4, tapeOn: 'diagonal', tapeColour: 'muted', tapeLength: 150, tapeWidth: 44 };
const PAPER = { type: 'paper-texture', place: { inset: 'page' }, strength: 0.3 };
const BADGE = { type: 'icon-badge', icon: 'heart', size: 72, fill: 'gold', ink: 'on-accent', place: { px: { x: 700, y: 120 } } };
const problems = (l) => validateLook(l, 'look', {});
const renormal = (l) => { const n = clone(normaliseLook(l)); n.compositions = n.compositions.map(({ id, calm, accepts, fit, ...c }) => c); return n; };
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
const draw = (l, spec = {}) => renderPostWithLook(l, { template: 'post', name: 'paste', kind: 'figure', variant: 0, big: '80%', headline: 'Most said {{heart}} *time.*', image: 'design/assets/demo/object-jar.jpg', ...spec }, { size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 800, h: 600 }) });

// ==================================================================================================== 1. valid, normalised, drawn
test('each piece validates, and its normalised form validates again', () => {
  for (const [i, els] of [[TAPED], [{ ...TAPED, mount: 14, fill: 'paper', tapeOn: 'all', treat: ['grey'], shadow: 'lift' }], [PAPER], [{ ...PAPER, grain: 'coarse', strength: 0.6 }], [BADGE], [{ ...BADGE, ring: { w: 4, colour: 'paper' }, shadow: 'soft', rot: -8 }], [TAPED, PAPER, BADGE]].entries()) {
    valid(lookWith(els), `case ${i}`);
    valid(renormal(lookWith(els)), `case ${i} normalised`);
  }
  // a badge flows in a row beside the figure
  const l = lookWith([]);
  l.compositions[0].elements[0] = { type: 'box', place: AT(60, 60, 900, 220), flow: 'row', align: 'center', gap: 16, children: [{ type: 'text', field: 'big', style: 'numeral', size: 200 }, { type: 'icon-badge', icon: 'check', size: 64, fill: 'field', ink: 'on-field' }] };
  valid(l, 'a badge in a row');
});

test('a taped picture is a turned box holding the checked picture, its line and strips of tape from fixed classes', () => {
  const r = draw(lookWith([TAPED]));
  const box = /<div class="abs k-box" data-el="(\d+)" data-tilt="-3" data-grid="skip" style="left:140px;top:600px;width:800px;height:560px;transform:rotate\(-3deg\)">(.*?)<\/div><\/div>/s.exec(r.body);
  assert.ok(box, 'a turned box at the place');
  assert.match(box[2], /<div class="abs ph k-photo" data-el="[\d.]+" style="left:0px;top:0px;width:800px;height:560px"><img data-user data-name="design\/assets\/demo\/object-jar.jpg" data-fit="cover" src="data:image\/png;base64,iVBORw0KGgo="/);
  const tapes = [...r.body.matchAll(/<i class="abs k-tape" aria-hidden="true" data-el="[\d.]+" data-deco style="([^"]*)"><\/i>/g)].map((m) => m[1]);
  assert.deepEqual(tapes, ['left:-75px;top:-22px;width:150px;height:44px;background:var(--c-muted);transform:rotate(-45deg)', 'left:725px;top:538px;width:150px;height:44px;background:var(--c-muted);transform:rotate(-45deg)']);
  assert.match(r.body, /class="abs k-keyline" aria-hidden="true" data-el="[\d.]+" data-fill style="left:0px;top:0px;width:800px;height:560px;border:4px solid var\(--c-ink\)"/);
  // every corner set has its own count
  for (const [tapeOn, n] of [['diagonal', 2], ['other-diagonal', 2], ['top', 2], ['all', 4]]) assert.equal([...draw(lookWith([{ ...TAPED, tapeOn }])).body.matchAll(/k-tape/g)].length, n, tapeOn);
  // a mount: the picture sits inside a paper border
  const m = draw(lookWith([{ ...TAPED, mount: 20, fill: 'paper' }])).body;
  assert.match(m, /data-fill data-tilt="-3" data-grid="skip" style="left:140px;top:600px;width:800px;height:560px;background:var\(--c-paper\);transform:rotate\(-3deg\)"/);
  assert.match(m, /class="abs ph k-photo" data-el="[\d.]+" style="left:20px;top:20px;width:760px;height:520px"/);
  // no picture, no taped picture
  assert.doesNotMatch(draw(lookWith([TAPED]), { image: undefined }).body, /k-tape|k-photo/);
});

test('a paper texture and an icon badge are decoration from fixed classes, palette roles and checked numbers', () => {
  const p = draw(lookWith([PAPER])).body;
  assert.match(p, /<i class="abs k-paper" aria-hidden="true" data-el="\d+" data-deco style="left:0px;top:0px;width:1080px;height:1350px;opacity:0.3"><\/i>/);
  assert.match(draw(lookWith([{ ...PAPER, grain: 'coarse' }])).body, /class="abs k-paper k-paper-c"/);
  const b = draw(lookWith([BADGE])).body;
  assert.match(b, /<div class="abs k-box" data-el="\d+" data-fill data-grid="skip" style="left:700px;top:120px;width:72px;height:72px;background:var\(--c-gold\);border-radius:999px;display:flex;flex-direction:row;justify-content:center;align-items:center"><i class="k-badge-i" aria-hidden="true" data-deco style="font-size:42px"><svg class="k-ic" viewBox="0 0 24 24" aria-hidden="true" data-deco style="fill:var\(--c-on-accent\)"><path d="[^"]*"\/><\/svg><\/i><\/div>/);
});

test('bold emphasis and icons in round badges in a headline: fixed classes and palette roles', () => {
  const r = draw(lookWith([]));
  assert.match(r.body, /class="abs k-t k-display k-em-b"[^>]*style="[^"]*font-family:var\(--f-text\)/, 'the headline in the text font, its emphasis bold');
  assert.match(r.body, /Most said <span class="k-icb" style="background:var\(--c-field\)"><svg class="k-ic" viewBox="0 0 24 24" aria-hidden="true" data-deco style="fill:var\(--c-on-field\)"><path d="[^"]*"\/><\/svg><\/span> <em data-role="accent">time.<\/em>/);
  // without a badge the icon is plain
  assert.doesNotMatch(draw(lookWith([], { headline: { icons: { colour: 'ink' } } })).body, /k-icb/);
});

// ==================================================================================================== 2. hostile values
test('hostile values in every new field are refused, plainly', () => {
  const t = (o) => lookWith([{ ...TAPED, ...o }]), p = (o) => lookWith([{ ...PAPER, ...o }]), b = (o) => lookWith([{ ...BADGE, ...o }]);
  const cases = [
    // taped picture
    [t({ mount: 41 }), /mount/, 'a mount over 40'], [t({ mount: -1 }), /mount/, 'a negative mount'], [t({ mount: 2.5 }), /mount/, 'a mount of half pixels'],
    [t({ mount: 300 }), /mount/, 'a mount that leaves no picture'], [t({ fill: 'paper' }), /mount/, 'a mount colour without a mount'],
    [t({ keyline: 9 }), /keyline/, 'a line over 8'], [t({ keylineColour: '#000000' }), /colour role|palette|role/, 'a hex line'],
    [t({ tapeOn: 'everywhere' }), /tapeOn/, 'unknown corners'], [t({ tapeColour: 'red;background:url(x)' }), /tapeColour/, 'a payload tape colour'],
    [t({ tapeLength: 59 }), /tapeLength/, 'short tape'], [t({ tapeLength: 261 }), /tapeLength/, 'long tape'], [t({ tapeWidth: 81 }), /tapeWidth/, 'wide tape'],
    [t({ treat: ['blur'] }), /treat/, 'an unknown treatment'], [t({ rot: 16 }), /rot|turn/, 'a turn over 15'], [t({ place: { anchor: { left: 0, top: 600 } } }), /width and a height/, 'no size'],
    [t({ origin: 'left top' }), /origin/, 'an origin it does not take'], [t({ corners: 'top' }), /corners/, 'the radius corners'],
    // paper texture
    [p({ strength: 0.61 }), /strength/, 'too strong'], [p({ strength: 0.01 }), /strength/, 'too faint'], [p({ strength: '0.3' }), /strength/, 'strength as text'],
    [p({ grain: 'url(x)' }), /grain/, 'a payload grain'], [p({ fill: 'paper' }), /fill/, 'a fill it does not take'],
    // icon badge
    [b({ icon: 'skull' }), /icon/, 'an unknown icon'], [b({ icon: '<svg onload=x>' }), /icon/, 'a payload icon'], [b({ size: 23 }), /size/, 'too small'], [b({ size: 301 }), /size/, 'too big'],
    [b({ fill: 'url(x)' }), /fill/, 'a payload fill'], [b({ shadow: 'hard' }), /soft shadow/, 'a hard shadow'], [b({ ink: 'gold', fill: 'gold' }), /does not read/, 'ink that does not read on its fill'],
    // the headline's marks
    [lookWith([], { headline: { icons: { badge: '#00ff00' } } }), /badge/, 'a hex badge'], [lookWith([], { headline: { icons: { badge: PAYLOADS[0] } } }), /badge/, 'a payload badge'],
    [lookWith([], { headline: { emphasis: 'heavy' } }), /emphasis/, 'an unknown emphasis'],
  ];
  for (const [l, re, what] of cases) refused(l, re, what);
  for (const x of PAYLOADS) refused(lookWith([{ ...TAPED, tapeOn: x }]), null, `tapeOn ${x.slice(0, 12)}`);
});

// ==================================================================================================== 3. the kit refuses by itself
test('the kit builders refuse out-of-range numbers, unknown names and free strings', () => {
  const c = makeContext({ spec: { template: 'post', kind: 'figure', big: '1', headline: 'a {{heart}} b' }, brand, tokens: { margin: { top: 60, right: 60, bottom: 60, left: 60 }, grid: { cols: 6, gutter: 24 }, type: { display: { lead: 1, track: 0, weight: 400 }, body: { size: 32, lead: 40, weight: 500 }, label: { size: 24 } }, fonts: {} }, size: SIZES.feed, image: () => PIXEL, imageSize: () => ({ w: 1, h: 1 }) });
  assert.match(c.tape({ cx: 10, cy: 10, w: 100, h: 40, rot: -45, colour: 'muted' }), /class="abs k-tape"/);
  assert.throws(() => c.tape({ cx: 10, cy: 10, w: 100, h: 40, rot: 61 }), /at most 60 degrees/);
  assert.throws(() => c.tape({ cx: 10, cy: 10, w: 100, h: 40, colour: 'red' }), /palette colour/);
  assert.throws(() => c.tape({ cx: NaN, cy: 10, w: 100, h: 40 }), /finite/);
  assert.throws(() => c.tape({ cx: 10, cy: 10, w: 100, h: 40, extra: 'x' }), /free style/);
  assert.throws(() => c.paper({ x: 0, y: 0, w: 10, h: 10, strength: 0.9 }), /0.05 to 0.6/);
  assert.throws(() => c.paper({ x: 0, y: 0, w: 10, h: 10, grain: 'url(x)' }), /fine or coarse/);
  assert.throws(() => c.paper({ x: 0, y: 0, w: 10, h: 10, cls: 'evil' }), /free class/);
  assert.throws(() => c.badge({ x: 0, y: 0, size: 400, icon: 'heart' }), /24 to 300/);
  assert.throws(() => c.badge({ x: 0, y: 0, size: 60, icon: 'skull' }), /engine's icons/);
  assert.throws(() => c.badge({ x: 0, y: 0, size: 60, icon: 'heart', fill: 'javascript:x' }), /palette colour/);
  // a badge colour in a headline's marks is a palette role, checked by the kit too
  assert.throws(() => c.fmt('headline', { icons: { badge: 'red' } }), /palette colour/);
  assert.match(String(c.fmt('headline', { icons: { badge: 'field' } })), /<span class="k-icb" style="background:var\(--c-field\)">/);
  for (const name of COLOUR_NAMES) assert.match(c.tape({ cx: 0, cy: 0, w: 60, h: 20, colour: name }), new RegExp(`background:var\\(--c-${name}\\)`));
});

// ==================================================================================================== 4. hostile words
test('hostile words in a bold, badged headline reach the page only as escaped text', () => {
  for (const x of PAYLOADS.slice(0, 5)) {
    const r = draw(lookWith([TAPED, PAPER, BADGE]), { headline: `${x.slice(0, 30)} {{heart}} *${x.slice(0, 20)}*`.slice(0, 70), big: '<b>1</b>' });
    assert.doesNotMatch(r.body, /<script|<img src=x|<b>1/);
    const tags = [...r.body.matchAll(/<[^>]*>/g)].map((t) => t[0]).join('');
    assert.doesNotMatch(tags, /url\(\/\/evil|onerror|javascript:/);
  }
});
