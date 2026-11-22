// node --test   (a look page that takes its colour from its picture: colour.fromPicture and a composition's fromPicture)
//   1. reading the picture's background from its edges (pictureEdge): plain, auto, picture, or none (a scene);
//   2. the colours of a page that takes it (pictureColours): type, emphasis and pills chosen by contrast, all computed numbers, or null;
//   3. the setting: a fixed list on the look and the design, in the catalogue, hostile values refused and never echoed; Clean and Soft
//      take the picture's colour by default, every other shipped look keeps the brand's;
//   4. the markup: a picture of a look that takes its colour carries data-pcolour (a fixed word), the brand mode the old data-bsample;
//   5. Chrome (skipped without it): a picture on a plain colour gives the page that colour and is shown whole, with the type set for it;
//      the same look in brand mode keeps the brand's page; a busy picture keeps the brand's page in picture mode too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadBrand } from './lib/design/brand.mjs';
import { ROOT } from './lib/core.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { PICTURE_LIMITS, pictureColours, pictureEdge } from './lib/design/edge.mjs';
import { RUNTIME } from './lib/design/runtime.mjs';
import { lookCatalogue, normaliseLook, validateLook } from './lib/design/look.mjs';
import { renderPostWithLook, shippedLooks } from './lib/design/directions/index.mjs';
import { normaliseDesign, forSize } from './lib/design/spec.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { decodePng, pngBytes } from './testlib/png.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const strip = (w, h, fn) => { const d = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.push(...fn(x, y), 255); return d; };
const grain = (x, y, amp) => (((x * 7919 + y * 104729) % 97) / 97 - 0.5) * 2 * amp;
const edges = (top, left, right = left, w = 240) => ({ top: strip(w, 6, top), topWidth: w, left: strip(8, 120, left), right: strip(8, 120, right), sideWidth: 8 });
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const isRgb = (c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);

// ---- 1. the background of a picture ----
test('a flat studio colour is plain: the page takes exactly it, with no fade', () => {
  const e = pictureEdge(edges(() => [240, 170, 110], () => [240, 170, 110]));
  assert.deepEqual(e.rgb, [240, 170, 110]);
  assert.equal(e.share, 1);
  assert.ok(e.plain && e.auto && e.picture);
});

test('a studio colour with grain and soft light is not plain but is plain enough for auto (the edges then fade into it)', () => {
  const lit = (x, y) => [200 + grain(x, y, 14) + x / 20, 40 + grain(y, x, 10), 30 + grain(x, y, 8)];
  const e = pictureEdge(edges(lit, lit));
  assert.equal(e.plain, false, `grain ${e.grain}`);
  assert.ok(e.auto && e.picture, JSON.stringify({ share: e.share, grain: e.grain }));
  assert.ok(Math.abs(e.rgb[0] - 202) <= 3 && Math.abs(e.rgb[1] - 40) <= 3, String(e.rgb));
});

test('a subject reaching one side: picture mode still takes the background colour, auto does not', () => {
  // the top and the left are the red backdrop; the right edge runs through a dark subject: 14 of 20 segments agree
  const e = pictureEdge(edges(() => [150, 25, 15], () => [150, 25, 15], () => [40, 40, 40]));
  assert.ok(e.share >= PICTURE_LIMITS.picture.share && e.share < PICTURE_LIMITS.auto.share, `share ${e.share}`);
  assert.equal(e.auto, false);
  assert.equal(e.picture, true);
  assert.deepEqual(e.rgb, [150, 25, 15], 'the colour is the backdrop\'s, never a mean with the subject');
});

test('a scene has no background colour: busy edges, or half one colour and half another', () => {
  const busy = pictureEdge(edges((x, y) => [(x * 37 + y * 11) % 256, (x * 91) % 256, (y * 53 + x) % 256], (x, y) => [(y * 41) % 256, (x * 13 + y) % 256, 90]));
  assert.equal(busy.picture, false, JSON.stringify({ share: busy.share, grain: busy.grain }));
  const split = pictureEdge(edges((x) => (x < 120 ? [250, 250, 250] : [60, 110, 80]), () => [250, 250, 250], () => [60, 110, 80]));
  assert.equal(split.auto, false);
  assert.equal(pictureEdge({ top: [], topWidth: 0, left: [], right: [], sideWidth: 0 }).picture, false);
});

// ---- 2. the colours of the page ----
const ROLES = { ink: [11, 31, 26], white: [255, 255, 255], accentType: [27, 94, 32], field: [27, 94, 32], primary: [46, 125, 50], accent: [27, 94, 32], gold: [242, 183, 5] };
const NEED = { text: 7, accent: 4.5, label: 4.5 };

test('on a light picture colour the type is the ink and the emphasis a deeper shade of the picture\'s own hue, each reaching its target', () => {
  const bg = [240, 170, 110], p = pictureColours(bg, ROLES, NEED);
  assert.ok(p && !p.light);
  for (const k of ['ink', 'body', 'muted', 'accent', 'soft']) assert.ok(isRgb(p[k]), `${k}: ${p[k]}`);
  assert.ok(ratio(p.ink, bg) >= 7 && ratio(p.body, bg) >= 7 && ratio(p.muted, bg) >= 4.5);
  assert.equal(p.accentFrom, 'picture');
  assert.ok(ratio(p.accent, bg) >= 4.5, `accent ${p.accent}: ${ratio(p.accent, bg)}`);
  assert.ok(p.accent[0] > p.accent[1] && p.accent[1] > p.accent[2], `an orange's own hue, deeper: ${p.accent}`);
  assert.notDeepEqual(p.accent, ROLES.accentType, 'not the brand green on an orange page');
  assert.ok(p.field && ratio(p.onField, p.field) >= 4.5, 'a pill takes the emphasis colour with type that reads on it');
  assert.ok(lum(p.soft) > lum(bg) && ratio(p.ink, p.soft) >= 7, `a label pill or card: lighter than the page and carrying its type: ${p.soft}`);
});

test('on a deep picture colour the type is white and the emphasis a lighter shade of its hue', () => {
  const bg = [135, 19, 8], p = pictureColours(bg, ROLES, NEED);
  assert.ok(p && p.light);
  assert.deepEqual(p.ink, [255, 255, 255]);
  assert.equal(p.accentFrom, 'picture');
  assert.ok(ratio(p.accent, bg) >= 4.5 && p.accent[0] > p.accent[2], String(p.accent));
  assert.ok(ratio(p.ink, p.soft) >= 7, `a pill on the dark page still carries the white type: ${p.soft}`);
});

test('on a white or grey picture the emphasis is the brand colour when it reads, else the type', () => {
  const white = pictureColours([240, 240, 240], ROLES, NEED);
  assert.equal(white.accentFrom, 'brand');
  assert.deepEqual(white.accent, ROLES.accentType);
  const pale = { ...ROLES, accentType: [120, 200, 120], field: [120, 200, 120], primary: [120, 200, 120], accent: [120, 200, 120], gold: [250, 220, 90] };
  const grey = pictureColours([222, 220, 217], pale, NEED);
  assert.equal(grey.accentFrom, 'ink', 'no brand colour reaches 4.5:1 there');
  assert.deepEqual(grey.accent, grey.ink);
});

test('the ink is deepened toward black before the page gives up, and a colour no type reaches keeps the brand page (null)', () => {
  const bg = [215, 150, 100], ink = [40, 70, 60];
  assert.ok(ratio(ink, bg) < 7.14 && ratio([255, 255, 255], bg) < 7.14);
  const p = pictureColours(bg, { ...ROLES, ink }, NEED);
  assert.ok(p && ratio(p.ink, bg) >= 7, `deepened: ${p && p.ink}`);
  assert.equal(pictureColours([117, 82, 181], ROLES, NEED), null, 'a mid purple: neither black nor white reaches 7:1');
  assert.ok(pictureColours([117, 82, 181], ROLES, { ...NEED, text: 4.5 }), 'but a brand with a 4.5:1 target may take it');
});

test('the page script carries the same reading and the same colour rules (one source)', () => {
  assert.ok(RUNTIME.includes(pictureEdge.toString()));
  assert.ok(RUNTIME.includes(pictureColours.toString()));
  assert.ok(RUNTIME.includes(`const PICTURE_LIMITS = ${JSON.stringify(PICTURE_LIMITS)};`));
});

// ---- 3. the setting ----
const looks = shippedLooks();
const copyOf = (id, edit) => { const l = clone(looks[id]); l.origin = `copy:shipped:${id}`; edit?.(l); return l; };

test('the setting: brand, auto or picture on the look (Colour) and on a design; anything else is refused and never echoed', () => {
  for (const v of ['brand', 'auto', 'picture']) {
    assert.deepEqual(validateLook(copyOf('clean', (l) => { l.colour.fromPicture = v; }), 'look', {}), [], v);
    assert.deepEqual(validateLook(copyOf('clean', (l) => { l.compositions[3].fromPicture = v; }), 'look', {}), [], `design ${v}`);
  }
  for (const bad of ['sepia', '__proto__', 'red;background:url(x)', '</style>', 7, null, ['picture']]) {
    const a = validateLook(copyOf('clean', (l) => { l.colour.fromPicture = bad; }), 'look', {});
    const b = validateLook(copyOf('clean', (l) => { l.compositions[3].fromPicture = bad; }), 'look', {});
    for (const [errs, where] of [[a, 'colour.fromPicture'], [b, 'fromPicture']]) {
      assert.ok(errs.some((e) => e.includes(where)), `${String(bad)}: ${errs.join(' | ')}`);
      for (const e of errs) assert.ok(!/<\/style>|background:url/.test(e), e);
    }
  }
  const cat = lookCatalogue();
  const set = cat.sections.colour.props.fromPicture;
  assert.deepEqual([set.kind, set.values, set.label], ['enum', ['brand', 'auto', 'picture'], 'Page colour from the picture'], 'the look settings show it under Colour');
  assert.deepEqual(cat.composition.properties.fromPicture.values, ['brand', 'auto', 'picture']);
  assert.equal(cat.composition.properties.fromPicture.label, 'Page colour from the picture');
});

test('Clean and Soft take the picture\'s colour by default; every other shipped look keeps the brand\'s', () => {
  for (const [id, l] of Object.entries(looks)) assert.equal(normaliseLook(l).colour.fromPicture, id === 'clean' || id === 'soft' ? 'picture' : 'brand', id);
});

// ---- 4. the markup ----
const brand = loadBrand();
const ctx = { size: SIZES.feed, brand, image: () => 'data:image/png;base64,iVBORw0KGgo=', imageSize: () => ({ w: 1200, h: 800 }) };
const draw = (look, spec) => renderPostWithLook(look, forSize(normaliseDesign({ template: 'post', name: 'p', image: 'design/assets/demo/object-jar.jpg', ...spec }), 'feed'), ctx, { shipped: false }).body;
const FIGURE = { kind: 'figure', variant: 1, big: '738+', unit: 'groups saving', sub: 'Groups in twelve towns.' };

test('every picture design of Clean and Soft lets its picture lend the page its colour; brand mode keeps the old edge reading', () => {
  const cases = { clean: [['figure', 1, FIGURE], ['photo', 0, { headline: 'Every coin, *on record.*' }], ['photo', 1, { headline: 'Every coin, *on record.*' }], ['offer', 0, { headline: 'The group plan', tag: '£0' }]],
    soft: [['figure', 1, FIGURE], ['photo', 0, { headline: 'Every coin, *on record.*' }], ['photo', 1, { headline: 'Every coin, *on record.*' }], ['offer', 0, { headline: 'The group plan', tag: '£0' }]] };
  for (const [id, list] of Object.entries(cases)) for (const [kind, variant, spec] of list) {
    const body = draw(copyOf(id), { ...spec, kind, variant });
    assert.match(body, /<img data-user data-pcolour="picture"/, `${id} ${kind}/${variant}`);
    assert.ok(!body.includes('data-bsample'), `${id} ${kind}/${variant}`);
  }
  const auto = draw(copyOf('clean', (l) => { l.colour.fromPicture = 'auto'; }), FIGURE);
  assert.match(auto, /data-pcolour="auto"/);
  const brandMode = draw(copyOf('clean', (l) => { l.colour.fromPicture = 'brand'; }), FIGURE);
  assert.ok(brandMode.includes('data-bsample') && !brandMode.includes('data-pcolour'));
  // a design's own choice wins over the look's
  const own = draw(copyOf('clean', (l) => { l.compositions[3].fromPicture = 'brand'; }), FIGURE);
  assert.ok(!own.includes('data-pcolour'));
});

// ---- 5. Chrome ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = path.join(ROOT, 'out', `test-picture-colour-${process.pid}`);
const BG = [240, 170, 110];
let browser;
test.before(async () => {
  if (!chrome) return;
  fs.mkdirSync(tmp, { recursive: true });
  // a dark round subject on a studio colour lit a little brighter to the right (too much drift for the old flat-edge reading, so the brand
  // mode keeps its page), and a busy scene
  fs.writeFileSync(path.join(tmp, 'studio.png'), pngBytes(1200, 800, (x, y) => (Math.hypot(x - 600, y - 430) < 230 ? [40, 30, 30] : BG.map((v) => Math.round(v + (x / 1199 - 0.5) * 48)))));
  fs.writeFileSync(path.join(tmp, 'scene.png'), pngBytes(1200, 800, (x, y) => [(x * 37 + y * 11) % 256, (x * 91 + y * 7) % 256, (y * 53 + x) % 256]));
  browser = await Browser.launch({ chromePath: chrome });
});
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const rel = (f) => path.relative(ROOT, path.join(tmp, f)).split(path.sep).join('/');
async function render(look, image, name) {
  const outFile = path.join(tmp, `${name}.png`);
  const spec = normaliseDesign({ template: 'post', name: 'p', ...FIGURE, image: rel(image) });
  const r = await renderImage(browser, { ...brand, looks: [look], style: { ...brand.style, direction: look.id } }, { spec, sizeName: 'feed', outFile }, { tmpDir: path.join(tmp, 't') });
  const png = decodePng(fs.readFileSync(outFile));
  return { ...r, px: (x, y) => { const o = (y * png.w + x) * 4; return [...png.data.slice(o, o + 3)]; } };
}
const near = (a, b, d = 6) => a.every((v, i) => Math.abs(v - b[i]) <= d);

test('Chrome: a picture on a plain colour gives the page that colour, is shown whole, and the type reads on it', { skip }, async () => {
  const r = await render(copyOf('clean'), 'studio.png', 'picture');
  const took = r.notes.map((n) => /the page takes the picture's colour \(rgb\((\d+), (\d+), (\d+)\), a soft edge\)/.exec(n)).find(Boolean);
  assert.ok(took, r.notes.join(' / '));
  const page = took.slice(1, 4).map(Number);
  assert.ok(near(page, BG, 24), `the studio colour, read from its edge: ${page}`);
  assert.deepEqual(r.warnings, []);
  // the page round the words, beside the picture and above it: all the picture's colour, with no band or seam
  for (const [x, y] of [[1040, 400], [20, 700], [20, 1000], [540, 790], [1060, 1300]]) assert.ok(near(r.px(x, y), page, 3), `(${x}, ${y}) ${r.px(x, y)}`);
  // the whole subject is in the picture (contained in its 1080 x 570 box: 855 x 570 at the foot, the disc's centre at (540, 1078))
  assert.ok(r.px(540, 1078).every((v) => v < 60), `the subject: ${r.px(540, 1078)}`);
  // and the brand mode of the same look keeps the brand's page above the picture
  const b = await render(copyOf('clean', (l) => { l.colour.fromPicture = 'brand'; }), 'studio.png', 'brand');
  assert.ok(!near(b.px(1040, 400), BG, 20), `brand page: ${b.px(1040, 400)}`);
  assert.ok(b.notes.some((n) => /not plain.*keeps the brand colour/.test(n)), b.notes.join(' / '));
});

test('Chrome: a busy picture keeps the brand page, even in picture mode', { skip }, async () => {
  const r = await render(copyOf('clean'), 'scene.png', 'scene');
  assert.ok(r.notes.some((n) => /no background colour for the page.*the page keeps the brand colour/.test(n)), r.notes.join(' / '));
  assert.ok(!near(r.px(1040, 400), r.px(540, 1300), 4));
});
