// node --test   (no Chrome: gradients, colour over a full picture, brand graphics and cut-outs as bounded look capabilities)
//
//   1. each capability validates, survives normaliseLook and draws markup that holds only palette roles, fixed words and checked numbers;
//   2. hostile values in every new field are refused with short messages that never echo them;
//   3. the static contrast rules: text on a gradient is held to EVERY stop (the worst decides), text on a colour over a picture to that colour;
//   4. graphics reach the page only as the checked data: URI handed over in spec.graphics (ctx.image), never a path, a URL or a raw value;
//   5. the post spec's graphics list and the renderer's file checks (PNG or WebP with transparency) refuse what they must.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseLook, validateLook } from './lib/design/look.mjs';
import { renderPostWithLook } from './lib/design/directions/index.mjs';
import { COLOUR_NAMES, gradientCss } from './lib/design/directions/kit.mjs';
import { graphicsProblems, postProblems } from './lib/design/post-spec.mjs';
import { preparePage } from './lib/design/render.mjs';
import { pngBytes } from './testlib/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const RETAIL = JSON.parse(fs.readFileSync(path.join(HERE, 'testlib', 'looks', 'retail.sample.json'), 'utf8'));
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brand = loadBrand();
const REF = '0f8fad5b-d9cb-469f-a165-70867728950e', REF2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const PAYLOADS = ['red;background:url(//evil.example/x)', '</style><script>window.__pwn=1</script>', 'javascript:alert(1)', '"><img src=x onerror=alert(1)>', 'url(data:text/html,x)', 'x'.repeat(5000)];

// A look with one statement composition holding the given elements (beside a headline) and one photo composition.
const AT = (x, y, w, h) => ({ px: { x, y, w, h } });
function lookWith(elements, { photo = [OVERLAY], headline = {}, ground = 'paper' } = {}) {
  const l = clone(RETAIL);
  l.id = 'capabilities'; l.name = 'Capabilities'; l.origin = 'copy:own:capabilities';
  l.compositions = [
    { kind: 'statement', name: 'Statement', describe: 'A statement with the pieces under test.', ground, fields: { headline: { required: true, max: 70 } },
      elements: [...clone(elements), { type: 'text', field: 'headline', style: 'display', size: 90, place: AT(80, 500, 900, 300), z: 5, ...headline }] },
    { kind: 'photo', name: 'Photo', describe: 'Words over a full picture.', ground: 'field', fields: { image: { required: true }, headline: { required: true, max: 68 } },
      elements: [{ type: 'photo', place: { inset: 'page' } }, ...clone(photo), { type: 'text', field: 'headline', style: 'display', size: 90, ink: 'white', place: AT(80, 1000, 900, 200), z: 5 }] },
  ];
  return l;
}
const problems = (l) => validateLook(l, 'look', {});
// a normalised look with what normaliseLook derives (id, calm, accepts, fit) taken off again: the defaults it filled must still validate
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
const draw = (l, spec, ctx = {}) => renderPostWithLook(l, { template: 'post', name: 'capabilities', variant: 0, headline: 'A plain *headline*', ...spec }, { size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 400, h: 800 }), ...ctx });

const GRAD = { type: 'gradient', gradient: { kind: 'linear', stops: ['paper', 'soft'], angle: 135 }, place: { inset: 'page' } };
const GRAPHIC = { type: 'graphic', ref: REF, at: 'bottom-right', size: 'l', z: 2 };
const OVERLAY = { type: 'overlay', colour: 'ink', from: 'bottom', place: { anchor: { left: 0, right: 0, bottom: 0, h: 700 } }, z: 1 };

// ==================================================================================================== 1. valid, normalised, drawn
test('each capability validates, and its normalised form validates again', () => {
  const cases = [
    [GRAD], [{ ...GRAD, gradient: { kind: 'radial', stops: ['paper', 'soft', 'light-tint'], at: 'left top', shape: 'circle', mid: 30 } }],
    [{ type: 'box', place: AT(60, 60, 500, 300), gradient: { kind: 'linear', stops: ['field', 'dark'] }, ink: 'white', children: [{ type: 'text', field: 'headline', style: 'body' }] }],
    [GRAPHIC], [{ ...GRAPHIC, size: 300, edge: true, dx: -20, dy: 40, flip: true, rot: 6, tint: 'field', at: 'top-left' }],
  ];
  for (const [i, els] of cases.entries()) {
    const l = lookWith(els);
    // a box carries the headline itself
    if (els[0].type === 'box') l.compositions[0].elements = [{ ...clone(els[0]), children: [{ type: 'text', field: 'headline', style: 'display', size: 60 }] }];
    valid(l, `case ${i}`);
    valid(renormal(l), `case ${i} normalised`);
  }
  valid(lookWith([], { photo: [OVERLAY] }), 'an overlay under words over a full picture');
  valid(lookWith([], { photo: [{ ...OVERLAY, from: 'flat', place: { inset: 'page' }, need: 5, floor: 0.4, cap: 0.9 }] }), 'an even overlay');
  valid(renormal(lookWith([], { photo: [{ ...OVERLAY, from: 'flat', place: { inset: 'page' } }] })), 'an even overlay, normalised');
});

// every style declaration a drawn page may hold for the new pieces, by exact shape
const NUM = '-?\\d+(?:\\.\\d+)?', ROLE = `var\\(--c-(?:${COLOUR_NAMES.join('|')})\\)`, STOP = `${ROLE} \\d{1,3}%`;
const NEW_RULES = {
  background: new RegExp(`^(?:${ROLE}|linear-gradient\\(\\d{1,3}deg,${STOP}(?:,${STOP}){1,2}\\)|radial-gradient\\((?:circle|ellipse) at (?:center|top|bottom|left|right|left top|right top|left bottom|right bottom),${STOP}(?:,${STOP}){1,2}\\))$`),
  transform: new RegExp(`^(?:rotate\\(${NUM}deg\\)(?: scaleX\\(-1\\))?|scaleX\\(-1\\))$`),
  filter: new RegExp(`^drop-shadow\\(${NUM}px 0 0 ${ROLE}\\)$`),
  left: new RegExp(`^${NUM}px$`), bottom: new RegExp(`^${NUM}px$`), right: new RegExp(`^${NUM}px$`), top: new RegExp(`^${NUM}px$`), width: new RegExp(`^${NUM}px$`), height: new RegExp(`^${NUM}px$`),
  color: new RegExp(`^${ROLE}$`), 'z-index': /^\d$/, 'border-radius': new RegExp(`^(?:${NUM}px(?: (?:${NUM}px|0)){0,3}|50%|999px 999px 0 0)$`), inset: /^0$/,
};
// the markup of the new pieces: their tags, attributes, classes and styles
function pieceProblems(body) {
  const bad = [];
  for (const m of body.matchAll(/<(div|i|img)\s([^>]*)>/g)) {
    const attrs = m[2];
    if (!/class="[^"]*\bk-(grad|overlay|graphic)\b/.test(attrs) && !/data-graphic/.test(attrs)) continue;
    for (const a of attrs.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) {
      const [, name, value = ''] = a;
      if (!['class', 'style', 'src', 'alt', 'aria-hidden'].includes(name) && !/^data-[a-z]+$/.test(name)) bad.push(`attribute ${name}`);
      if (name === 'src' && value !== PIXEL) bad.push('an image source other than the checked data: URI');
      if (name === 'class') for (const c of value.split(/\s+/)) if (!['abs', 'k-grad', 'k-scrim', 'k-overlay', 'k-graphic', 'k-tinted'].includes(c)) bad.push(`class ${c}`);
      if (name.startsWith('data-') && name !== 'data-name' && !/^[a-z0-9.]*$/.test(value)) bad.push(`${name}="${value.slice(0, 30)}"`);
      if (name === 'style') for (const d of value.split(';').filter(Boolean)) {
        const i = d.indexOf(':'), prop = d.slice(0, i), val = d.slice(i + 1);
        if (!Object.hasOwn(NEW_RULES, prop) || !NEW_RULES[prop].test(val)) bad.push(`style ${prop}: ${val.slice(0, 60)}`);
      }
    }
  }
  const tags = [...body.matchAll(/<[^>]*>/g)].map((t) => t[0]).join('').replace(/--k-grain:url\(data:image\/svg\+xml,[%0-9A-Za-z._~-]*\)/g, '').replace(/ src="data:image\/png;base64,[^"]*"/g, '');
  if (/url\(|expression|javascript:|<script|onerror|onload/i.test(tags)) bad.push('a url, script or handler in a tag');
  return bad;
}

test('a gradient is drawn from palette roles, a fixed angle or point, and nothing else', () => {
  const r = draw(lookWith([GRAD]), { kind: 'statement' });
  assert.match(r.body, /class="abs k-grad" aria-hidden="true" data-el="\d+" data-fill style="left:0px;top:0px;width:1080px;height:1350px;background:linear-gradient\(135deg,var\(--c-paper\) 0%,var\(--c-soft\) 100%\)"/);
  assert.deepEqual(pieceProblems(r.body), []);
  const r2 = draw(lookWith([{ ...GRAD, gradient: { kind: 'radial', stops: ['paper', 'soft', 'light-tint'], at: 'right bottom', shape: 'circle', mid: 30 }, radius: 40, z: 1 }]), { kind: 'statement' });
  assert.match(r2.body, /background:radial-gradient\(circle at right bottom,var\(--c-paper\) 0%,var\(--c-soft\) 30%,var\(--c-light-tint\) 100%\);border-radius:40px;z-index:1/);
  assert.deepEqual(pieceProblems(r2.body), []);
  // a box filled with a gradient
  const l = lookWith([]);
  l.compositions[0].elements = [{ type: 'box', place: AT(60, 60, 900, 600), gradient: { kind: 'linear', stops: ['field', 'dark'], angle: 90 }, ink: 'white', pad: 40, children: [{ type: 'text', field: 'headline', style: 'display', size: 80 }] }];
  const r3 = draw(l, { kind: 'statement' });
  assert.match(r3.body, /class="abs k-box" data-el="0" data-fill style="[^"]*background:linear-gradient\(90deg,var\(--c-field\) 0%,var\(--c-dark\) 100%\)/);
});

test('the kit writes a gradient only from its own tables', () => {
  assert.equal(gradientCss({ kind: 'linear', stops: ['paper', 'ink'] }), 'linear-gradient(180deg,var(--c-paper) 0%,var(--c-ink) 100%)');
  const BAD = [
    null, 'linear-gradient(red,blue)', { kind: 'conic', stops: ['paper', 'ink'] }, { kind: 'linear', stops: ['paper'] }, { kind: 'linear', stops: ['paper', 'ink', 'soft', 'dark'] },
    { kind: 'linear', stops: ['#ff0000', 'ink'] }, { kind: 'linear', stops: ['paper', 'red;background:url(x)'] }, { kind: 'linear', stops: ['paper', 'ink'], angle: '90deg' },
    { kind: 'linear', stops: ['paper', 'ink'], angle: 360 }, { kind: 'linear', stops: ['paper', 'ink'], angle: 12.5 }, { kind: 'linear', stops: ['paper', 'ink', 'soft'], mid: 90 },
    { kind: 'radial', stops: ['paper', 'ink'], at: 'center;x:1' }, { kind: 'radial', stops: ['paper', 'ink'], shape: 'square' }, { kind: 'radial', stops: ['paper', 'ink'], at: '__proto__' },
  ];
  for (const g of BAD) assert.throws(() => gradientCss(g), /design kit/, JSON.stringify(g));
});

test('an overlay is a measured scrim with a fixed mode, colour role and bounded numbers', () => {
  const r = draw(lookWith([], { photo: [OVERLAY] }), { kind: 'photo', image: 'design/assets/demo/object-jar.jpg' });
  assert.match(r.body, /<i class="abs k-scrim k-overlay" aria-hidden="true" data-el="\d+" data-scrim data-mode="bottom" data-need="4.5" data-floor="0.35" data-capa="0.85" data-fade="240" style="left:0px;bottom:0px;width:1080px;height:700px;color:var\(--c-ink\);z-index:1"><\/i>/);
  assert.deepEqual(pieceProblems(r.body), []);
});

// ==================================================================================================== 2. hostile values
test('hostile values in every new field are refused, plainly', () => {
  const g = (gradient, extra = {}) => lookWith([{ ...GRAD, gradient, ...extra }]);
  const gr = (o) => lookWith([{ ...GRAPHIC, ...o }]);
  const ov = (o) => lookWith([], { photo: [{ ...OVERLAY, ...o }] });
  const cases = [
    // gradients
    [g({ kind: 'linear', stops: ['#ff0000', 'paper'] }), /colour role/, 'a hex stop'],
    ...PAYLOADS.map((p) => [g({ kind: 'linear', stops: ['paper', p] }), /colour role/, `a payload stop ${p.slice(0, 10)}`]),
    [g({ kind: 'linear', stops: ['paper'] }), /list of 2 to 3/, 'one stop'],
    [g({ kind: 'linear', stops: ['paper', 'soft', 'ink', 'dark'] }), /list of 2 to 3/, 'four stops'],
    [g({ kind: 'linear', stops: ['paper', 'muted'] }), /panel can be filled/, 'a stop that is not a fill'],
    [g({ kind: 'conic', stops: ['paper', 'soft'] }), /one of linear, radial/, 'another kind'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], angle: 360 }), /0 to 359/, 'angle 360'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], angle: NaN }), null, 'angle NaN'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], angle: '90deg' }), /0 to 359/, 'angle as text'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], angle: 45.5 }), /whole number/, 'a fractional angle'],
    [g({ kind: 'radial', stops: ['paper', 'soft'], at: 'center;background:url(x)' }), /must be one of/, 'a payload point'],
    [g({ kind: 'radial', stops: ['paper', 'soft'], angle: 90 }), /linear gradient/, 'an angle on a radial gradient'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], at: 'top' }), /radial gradient/, 'a point on a linear gradient'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], mid: 40 }), /three colours/, 'a middle on two stops'],
    [g({ kind: 'linear', stops: ['paper', 'soft', 'paper'], mid: 90 }), /20 to 80/, 'a middle out of range'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], css: 'x' }), /not a setting/, 'an unknown key'],
    [g({ kind: 'linear', stops: ['paper', 'soft'], render: 'x' }), /not allowed/, 'a render key'],
    [g('linear-gradient(red, blue)'), /object/, 'a CSS string'],
    [lookWith([{ type: 'box', place: AT(0, 0, 200, 200), fill: 'paper', gradient: { kind: 'linear', stops: ['paper', 'soft'] } }]), /fill and a gradient/, 'fill and gradient on a box'],
    // overlays
    [ov({ colour: '#000000' }), /colour role/, 'a hex overlay'],
    [ov({ colour: 'muted' }), /panel can be filled/, 'an overlay colour that is not a fill'],
    [ov({ from: 'left' }), /one of flat, bottom, top/, 'another direction'],
    [ov({ from: 'flat', fade: 100 }), /does not fade/, 'a fade on an even overlay'],
    [ov({ floor: 0.9, cap: 0.5 }), /above the most strength/, 'floor above cap'],
    [ov({ need: 2 }), /3 to 7/, 'a contrast below 3'],
    [ov({ cap: 1 }), /0.3 to 0.95/, 'a full-strength cap'],
    [ov({ style: 'opacity:1' }), /not a setting/, 'a free style'],
    // graphics
    ...PAYLOADS.map((p) => [gr({ ref: p }), /id of one of the brand/, `a payload ref ${p.slice(0, 10)}`]),
    [gr({ ref: REF.toUpperCase() }), /lowercase UUID/, 'an upper-case ref'],
    [gr({ ref: 'design/assets/photos/a.png' }), /id of one/, 'a path as ref'],
    [gr({ ref: `${REF}/../x` }), /id of one/, 'a ref with a path tail'],
    [gr({ ref: undefined }), /needs ref/, 'no ref'],
    [gr({ at: 'middle' }), /must be one of/, 'another slot'],
    [gr({ size: 'huge' }), /must be one of s, m, l, xl/, 'another size'],
    [gr({ size: 2000 }), /24 to 1350/, 'too wide'],
    [gr({ size: [1, 2] }), /string or a number/, 'a list as size'],
    [gr({ dx: 9999 }), /-540 to 540/, 'too far across'],
    [gr({ dy: 'url(x)' }), /-675 to 675/, 'a payload move'],
    [gr({ tint: '#123456' }), /colour role/, 'a hex tint'],
    [gr({ tint: 'muted' }), /panel can be filled/, 'a tint that is not a fill'],
    [gr({ rot: 30 }), /-15 to 15/, 'turned too far'],
    [gr({ flip: 'yes' }), /true or false/, 'flip as text'],
    [gr({ place: AT(0, 0, 100, 100) }), /takes no place|not a setting/, 'a place on a graphic'],
    [gr({ src: 'data:image/png;base64,AAAA' }), /not a setting/, 'a source'],
    [lookWith([{ type: 'box', place: AT(0, 0, 400, 400), children: [clone(GRAPHIC)] }]), /a box holds/, 'a graphic inside a box'],
  ];
  for (const [l, re, what] of cases) refused(l, re, what);
});

// ==================================================================================================== 3. static contrast rules
test('text over a gradient must read on its worst stop; text over a colour on a picture on that colour', () => {
  // a dark stop under a headline in the default ink: refused, naming the stop that fails
  refused(lookWith([{ ...GRAD, gradient: { kind: 'linear', stops: ['paper', 'dark'] } }]), /ink ink does not read on dark, one of the colours of the gradient/, 'ink on a paper-to-dark gradient');
  refused(lookWith([{ ...GRAD, gradient: { kind: 'linear', stops: ['paper', 'soft', 'field'] } }]), /does not read on field/, 'the third stop decides');
  // light ink on a light stop: refused too
  refused(lookWith([{ ...GRAD, gradient: { kind: 'linear', stops: ['field', 'paper'] } }], { headline: { ink: 'white' }, ground: 'field' }), /white does not read on paper, one of the colours/, 'white on a field-to-paper gradient');
  // an ink that reads on every stop: accepted
  valid(lookWith([{ ...GRAD, gradient: { kind: 'linear', stops: ['field', 'dark'] } }], { headline: { ink: 'white' }, ground: 'field' }), 'white on field and dark');
  // a gradient that is not under the text does not judge it
  valid(lookWith([{ ...GRAD, gradient: { kind: 'linear', stops: ['field', 'dark'] }, place: AT(0, 1200, 1080, 150) }]), 'a gradient strip clear of the headline');
  // a gradient drawn above the text (a higher layer) does not judge it either
  valid(lookWith([{ ...GRAD, gradient: { kind: 'linear', stops: ['field', 'dark'] }, place: AT(0, 1200, 1080, 150), z: 9 }]), 'a gradient above');
  // a box filled with a gradient: its own words are held to every stop
  const box = (ink, stops) => { const l = lookWith([]); l.compositions[0].elements = [{ type: 'box', place: AT(60, 60, 900, 600), gradient: { kind: 'linear', stops }, ...(ink ? { ink } : {}), children: [{ type: 'text', field: 'headline', style: 'display', size: 80, ...(ink ? { ink } : {}) }] }]; return l; };
  refused(box('white', ['field', 'paper']), /white does not read on fill paper/, 'a gradient box with a paper stop');
  valid(box('white', ['field', 'dark']), 'a gradient box with dark stops');
  // a colour laid over a picture: the words' ink must read on it
  refused(lookWith([], { photo: [{ ...OVERLAY, colour: 'paper' }] }), /white does not read on paper, the colour over the picture/, 'white words on a paper overlay');
  // and it backs words over a picture, as a scrim does
  refused(lookWith([], { photo: [] }), /no filled box under it and no dark fade/, 'words over a full picture with nothing behind them');
  valid(lookWith([], { photo: [OVERLAY] }), 'words over a full picture with an overlay behind them');
  refused(lookWith([], { photo: [{ ...OVERLAY, place: AT(0, 0, 1080, 300) }] }), /no filled box under it/, 'an overlay that does not cover the words');
  valid(lookWith([], { photo: [{ ...GRAD, gradient: { kind: 'linear', stops: ['dark', 'ink'] }, place: { anchor: { left: 0, right: 0, bottom: 0, h: 500 } }, z: 1 }] }), 'a gradient band behind the words');
});

// ==================================================================================================== 4. graphics on the page
test('a graphic reaches the page only as the checked data: URI handed over in the post spec', () => {
  const l = lookWith([GRAPHIC]);
  const name = 'design/assets/x"><script>alert(1)</script>.png';
  const r = draw(l, { kind: 'statement', graphics: [{ ref: REF, image: name }] });
  const m = /<div class="abs k-graphic" data-el="\d+" data-grid="skip" style="left:(\d+)px;top:(\d+)px;width:(\d+)px;height:(\d+)px;z-index:2"><img data-user data-graphic data-name="([^"]*)" data-fit="contain" src="([^"]*)" alt=""><\/div>/.exec(r.body);
  assert.ok(m, r.body.slice(0, 400));
  // large (half the page width), its height from its own proportions (400 x 800), at the bottom right inside the margins
  const mg = l.canvas.feed.margin;
  assert.deepEqual([+m[3], +m[4]], [540, 1080]);
  assert.deepEqual([+m[1], +m[2]], [1080 - mg.right - 540, 1350 - mg.bottom - 1080]);
  assert.equal(m[5], 'design/assets/x&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;.png', 'the file name is escaped');
  assert.equal(m[6], PIXEL, 'the source is what ctx.image() returns');
  assert.deepEqual(pieceProblems(r.body), []);
  assert.ok(!/<script/.test(r.body));
  // turned, mirrored, at the page edge, moved, recoloured: a recolourable graphic takes the role through a drop shadow
  const r2 = draw(lookWith([{ ...GRAPHIC, at: 'top-left', edge: true, size: 's', dx: 10, dy: 20, rot: 5, flip: true, tint: 'field' }]), { kind: 'statement', graphics: [{ ref: REF, image: 'g.png', tintable: true }] });
  assert.match(r2.body, /class="abs k-graphic k-tinted" data-el="\d+" data-grid="skip" style="left:10px;top:20px;width:238px;height:476px;transform:rotate\(5deg\) scaleX\(-1\);z-index:2"><img data-user data-graphic data-name="g.png" data-fit="contain" src="[^"]*" alt="" style="filter:drop-shadow\(238px 0 0 var\(--c-field\)\)">/);
  assert.deepEqual(pieceProblems(r2.body), []);
  // not marked recolourable: drawn in its own colours, and the person is told
  const r3 = draw(lookWith([{ ...GRAPHIC, tint: 'field' }]), { kind: 'statement', graphics: [{ ref: REF, image: 'g.png' }] });
  assert.ok(!/k-tinted|drop-shadow/.test(r3.body));
  assert.ok(r3.warnings.some((w) => /not marked as recolourable/.test(w)));
  // not handed over: left out, and the person is told; another graphic's file is never used for it
  const r4 = draw(l, { kind: 'statement', graphics: [{ ref: REF2, image: 'other.png' }] });
  assert.ok(!/k-graphic/.test(r4.body));
  assert.ok(r4.warnings.some((w) => /brand graphic of this design is not available/.test(w)));
  assert.ok(!/k-graphic/.test(draw(l, { kind: 'statement' }).body));
  // a tall cut-out is never taller than the page
  const r5 = draw(lookWith([{ ...GRAPHIC, size: 'xl' }]), { kind: 'statement', graphics: [{ ref: REF, image: 'g.png' }] }, { imageSize: () => ({ w: 100, h: 1000 }) });
  assert.match(r5.body, /k-graphic" data-el="\d+" data-grid="skip" style="left:\d+px;top:-?\d+px;width:135px;height:1350px/);
});

// ==================================================================================================== 5. the post spec and the files
test('the post spec\'s graphics are a short list of ids, picture files and a flag', () => {
  assert.deepEqual(graphicsProblems([{ ref: REF, image: 'design/assets/demo/a.png', tintable: true }, { ref: REF2, image: 'b.webp' }], 'd'), []);
  const BAD = [
    ['x', /list of up to 6/], [Array.from({ length: 7 }, (_, i) => ({ ref: REF.replace(/.$/, String(i)), image: 'a.png' })), /list of up to 6/],
    [[{ ref: REF, image: 'a.jpg' }], /PNG or WebP/], [[{ ref: REF, image: 'a.svg' }], /PNG or WebP/], [[{ ref: 'javascript:alert(1)', image: 'a.png' }], /lowercase UUID/],
    [[{ ref: REF, image: 'a.png' }, { ref: REF, image: 'b.png' }], /twice/], [[{ ref: REF, image: 'a.png', tintable: 'yes' }], /true or false/],
    [[{ ref: REF, image: 'a.png', src: 'data:x' }], /not a setting/], [[{ ref: REF, image: 'a.png', '<script>': 1 }], /not a setting/], [['a.png'], /must be an object/], [[{ ref: REF }], /file path/],
  ];
  for (const [list, re] of BAD) {
    const p = graphicsProblems(list, 'd');
    assert.ok(p.some((m) => re.test(m)), `${JSON.stringify(list).slice(0, 80)}: ${p.join(' | ')}`);
    assert.ok(p.every((m) => !/[<>]/.test(m)), 'no markup in a message');
  }
  assert.ok(postProblems({ template: 'post', kind: 'statement', headline: 'x', graphics: [{ ref: 'x', image: 'a.png' }] }, 'd').some((m) => /UUID/.test(m)), 'postProblems checks them');
  assert.deepEqual(postProblems({ template: 'post', kind: 'statement', headline: 'x', graphics: [{ ref: REF, image: 'a.png' }] }, 'd'), []);
});

test('the renderer reads a graphic only as a PNG or WebP with transparency, and embeds it', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-graphic-'));
  try {
    const ok = path.join(tmp, 'mark.png'), flat = path.join(tmp, 'flat.png'), jpg = path.join(tmp, 'photo.jpg'), liar = path.join(tmp, 'liar.png');
    fs.writeFileSync(ok, pngBytes(4, 8, (x) => [10, 20, 30, x < 2 ? 0 : 255], { alpha: true }));
    fs.writeFileSync(flat, pngBytes(4, 4, () => [10, 20, 30]));
    fs.writeFileSync(jpg, fs.readFileSync(path.join(HERE, 'design', 'assets', 'demo', 'object-jar.jpg')));
    fs.writeFileSync(liar, '<svg onload="alert(1)"></svg>');
    const look = lookWith([GRAPHIC]);
    const b = { ...brand, looks: [look], style: { ...brand.style, direction: look.id } };
    const job = (image) => ({ sizeName: 'feed', spec: { template: 'post', kind: 'statement', variant: 0, headline: 'Words', graphics: [{ ref: REF, image }] } });
    const { out } = preparePage(b, job(ok));
    assert.match(out.body, /<img data-user data-graphic data-name="[^"]*mark\.png" data-fit="contain" src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="">/);
    assert.match(out.body, /width:540px;height:1080px/, 'its own proportions (4 x 8)');
    assert.throws(() => preparePage(b, job(flat)), /has no transparency/);
    assert.throws(() => preparePage(b, job(jpg)), /PNG or WebP/);
    assert.throws(() => preparePage(b, job(liar)), /does not contain PNG data/);
    assert.throws(() => preparePage(b, job(path.join(tmp, 'missing.png'))), /not found/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
