// node --test   (the portrait picture of a quotation and a device drawn round a bare screenshot, two picture capabilities of looks)
//   1. avatar in a post: { image, focal? }, checked by shape; hostile keys, paths and focal points refused, never echoed;
//   2. the avatar element: a parameter table of bounded numbers and fixed lists; its rules; it shows the avatar field once;
//   3. drawing an avatar: one picture read like every picture (img[data-user]), the focal point only as a checked position, a ring in a role;
//   4. the device element: its geometry from fixed shares, its rules, hostile values refused, its lean counted as a turn;
//   5. drawing a device: whole pixels, fixed finishes, the screenshot as a user image marked data-device, nothing of the post but escaped text;
//   6. screenFit: a bare screenshot far from the model's proportions is refused, a near one cropped with a note or a warning, naming sizes only;
//   7. the shipped ledger and soft looks offer the avatar, and ledger's phone page draws its phone;
//   8. Chrome (skipped without it): a bare screenshot is framed, a pre-framed capture is shown as it is (never twice), a landscape one refused,
//      the avatar's enlargement is checked like every picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrand } from './lib/design/brand.mjs';
import { ROOT } from './lib/core.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { KIND_FIELDS } from './lib/design/look-elements.mjs';
import { lookCatalogue, lookBrief, validateLook } from './lib/design/look.mjs';
import { postCompositionDevice, postKinds, renderPostWithLook, shippedLooks } from './lib/design/directions/index.mjs';
import { validateDesign, normaliseDesign, forSize } from './lib/design/spec.mjs';
import { DEVICE_TILT, MODELS, deviceGeometry, screenFit } from './lib/design/directions/primitives/device.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { appScreen } from './testlib/screens.mjs';
import { pngBytes } from './testlib/png.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const clone = (v) => JSON.parse(JSON.stringify(v));
const SWISS = JSON.parse(fs.readFileSync(path.join(HERE, 'testlib', 'looks', 'swiss.sample.json'), 'utf8'));
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const brand = loadBrand();
const ctx = { size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 600, h: 600 }) };
const PX = (x, y, w, h) => ({ px: { x, y, ...(w !== undefined ? { w, h } : {}) } });
const HOSTILE = ['"><script>window.__pwn=1</script>', 'javascript:alert(1)', 'url(http://evil.example/x.png)', 'red;background:url(x)', '</style>', '__proto__', 'constructor'];
const ECHO = /<script|javascript:|evil\.example|<\/style>|background:url/;
const JAR = 'design/assets/demo/object-jar.jpg';

// a quote with a portrait picture beside the name, and a photo post with a device
function picturesLook({ avatar = {}, device = {}, quoteFields = {} } = {}) {
  return clone({
    ...clone(SWISS), id: 'pictures', origin: 'copy:shipped:swiss', name: 'Pictures',
    compositions: [
      { kind: 'quote', name: 'Face', describe: 'A quotation with the portrait picture of the person quoted beside the name.', ground: 'paper', calm: { maxShare: 0.8 },
        fields: { quote: { required: true, max: 160 }, by: { max: 40 }, avatar: {}, ...quoteFields },
        elements: [
          { type: 'text', field: 'quote', style: 'display', size: 72, place: PX(64, 200, 952, 600) },
          { type: 'box', place: PX(64, 1000, 952, 160), flow: 'row', align: 'center', gap: 33, children: [
            { type: 'avatar', size: 128, ring: { w: 6, colour: 'field' }, when: { present: 'avatar' }, ...avatar },
            { type: 'text', field: 'by', style: 'label', when: { present: 'by' } },
          ] },
        ] },
      { kind: 'photo', name: 'Phone', describe: 'A headline beside a phone the engine draws round the picture, a bare screenshot.', ground: 'paper',
        fields: { image: { required: true }, headline: { required: true, max: 60 } },
        elements: [
          { type: 'text', field: 'headline', style: 'display', size: 72, place: PX(64, 300, 440, 600) },
          { type: 'device', place: PX(560, 200, 460, 960), shadow: 'soft', ...device },
        ] },
    ],
  });
}
const errsOf = (l) => validateLook(l, 'look', {});
const says = (l, re, what) => {
  const e = errsOf(l);
  assert.ok(e.some((x) => re.test(x)), `${what}: ${e.join(' | ')}`);
  for (const x of e) assert.ok(x.length <= 240 && !ECHO.test(x), `${what}: not echoed: ${x}`);
};
const quoteSpec = (extra = {}) => ({ template: 'post', kind: 'quote', name: 'q', quote: 'Now we just look.', by: 'Ama', avatar: { image: JAR }, ...extra });
const drawQuote = (look, extra) => renderPostWithLook(look, forSize(normaliseDesign(quoteSpec(extra)), 'feed'), ctx, { shipped: false }).body;
const phoneSpec = (extra = {}) => ({ template: 'post', kind: 'photo', name: 'p', headline: 'See the pot fill', image: 'design/assets/demo/screen-app.png', ...extra });
const drawPhone = (look, extra) => renderPostWithLook(look, forSize(normaliseDesign(phoneSpec(extra)), 'feed'), ctx, { shipped: false }).body;

// ---- 1. the avatar of a post ----
test('a post takes one portrait picture: { image, focal? }, checked by shape, hostile values refused and never echoed', () => {
  const look = picturesLook();
  assert.deepEqual(errsOf(look), []);
  assert.deepEqual(validateDesign(quoteSpec(), 'd', { look }), []);
  assert.deepEqual(validateDesign(quoteSpec({ avatar: { image: JAR, focal: '50% 30%' } }), 'd', { look }), []);
  assert.deepEqual(validateDesign(quoteSpec({ avatar: { image: JAR, focal: { x: 0.5, y: 0.2 } } }), 'd', { look }), []);
  const refused = (avatar, re, what) => {
    const p = validateDesign(quoteSpec({ avatar }), 'd', { look });
    assert.ok(p.some((x) => re.test(x)), `${what}: ${p.join(' | ')}`);
    for (const x of p) assert.ok(!ECHO.test(x), `${what}: not echoed: ${x}`);
  };
  for (const bad of ['design/assets/demo/object-jar.jpg', ['x.jpg'], 5, null, true]) refused(bad, /avatar must be an object/, `avatar ${JSON.stringify(bad)}`);
  refused({}, /avatar\.image must be a file path/, 'no image');
  refused({ image: '' }, /avatar\.image must be a file path/, 'an empty path');
  refused({ image: 'a\u0000b.jpg' }, /avatar\.image must be a file path/, 'a NUL in the path');
  for (const h of HOSTILE) refused({ image: h }, /avatar\.image must be/, `hostile path ${h.slice(0, 12)}`);
  refused({ image: 'face.svg' }, /avatar\.image must be \.jpg/, 'an SVG');
  for (const h of [...HOSTILE, '120% 40%', NaN, Infinity, { x: 2, y: 0 }, [500, 2]]) refused({ image: JAR, focal: h }, /avatar\.focal must look like/, `hostile focal ${String(h).slice(0, 12)}`);
  for (const k of [...HOSTILE, 'caption', 'src', 'style']) refused({ image: JAR, [k]: 'x' }, /avatar takes only image and focal \(1 other key given\)/, `extra key ${k.slice(0, 12)}`);
  // a quote may carry it in a look; a look's own kinds decide where it is drawn (a statement composition cannot declare it)
  assert.ok(KIND_FIELDS.quote.includes('avatar') && KIND_FIELDS.event.includes('avatar') && !KIND_FIELDS.statement.includes('avatar'));
  const st = picturesLook(); st.compositions[0].kind = 'statement'; st.compositions[0].fields = { headline: { required: true, max: 60 }, avatar: {} };
  st.compositions[0].elements[0].field = 'headline';
  says(st, /"avatar" is not a field of a statement post/, 'a statement declares no avatar');
});

// ---- 2. the avatar element ----
test('the avatar element: a bounded size, three shapes, a ring in a role and a soft shadow; it must be declared and shown once', () => {
  const cat = lookCatalogue();
  assert.deepEqual(cat.elements.avatar.properties.shape.values, ['circle', 'rounded', 'square']);
  assert.deepEqual([cat.elements.avatar.properties.size.min, cat.elements.avatar.properties.size.max], [48, 400]);
  assert.equal(cat.fields.avatar.type, 'image');
  for (const shape of ['circle', 'rounded', 'square']) assert.deepEqual(errsOf(picturesLook({ avatar: { shape } })), [], shape);
  assert.deepEqual(errsOf(picturesLook({ avatar: { shadow: 'lift' } })), []);
  for (const size of [47, 401, 120.5, '120', NaN, Infinity, null]) says(picturesLook({ avatar: { size } }), /size/, `size ${String(size)}`);
  for (const h of HOSTILE) says(picturesLook({ avatar: { shape: h } }), /shape/, `hostile shape ${h.slice(0, 12)}`);
  for (const h of HOSTILE) says(picturesLook({ avatar: { ring: { w: 6, colour: h } } }), /colour/, `hostile ring ${h.slice(0, 12)}`);
  says(picturesLook({ avatar: { ring: { w: 17, colour: 'field' } } }), /ring/, 'a ring too wide');
  says(picturesLook({ avatar: { shadow: 'hard' } }), /soft shadow/, 'a hard shadow');
  says(picturesLook({ avatar: { treat: ['sepia'] } }), /treat/, 'a treatment not in the list');
  says(picturesLook({ avatar: { field: 'by' } }), /field/, 'an avatar shows no words');
  says(picturesLook({ avatar: { render: 'x' } }), /render/, 'a render key');
  // declared and shown
  const undeclared = picturesLook(); delete undeclared.compositions[0].fields.avatar;
  says(undeclared, /avatar.*which the composition does not declare/, 'an avatar the composition does not declare');
  const unshown = picturesLook(); unshown.compositions[0].elements[1].children.shift();
  says(unshown, /declares avatar but no element shows it/, 'a declared avatar nothing shows');
  const twice = picturesLook(); twice.compositions[0].elements.push({ type: 'avatar', size: 80, place: PX(900, 40) });
  says(twice, /shows avatar in the same way/, 'the avatar twice');
  says(picturesLook({ avatar: { place: PX(64, 40, 300, 300) } }), /as wide and as tall as its size/, 'a place of another size');
  // the brief tells the AI and the editor which variants draw one
  assert.deepEqual(lookBrief(picturesLook()).kinds.quote.variants[0].fields.avatar, { required: false });
});

// ---- 3. drawing an avatar ----
test('drawing an avatar: one checked picture round its focal point, a ring in a role, never a raw value', () => {
  const look = picturesLook();
  const one = (body) => body.match(/<div class="k-flow ph k-photo k-avatar[^"]*"[^>]*>.*?<\/div>/)?.[0];
  const a = one(drawQuote(look, { avatar: { image: JAR, focal: '50% 30%' } }));
  // (the swiss sample look treats its pictures grey: the avatar takes the look's treatment unless it names its own)
  assert.match(a, /^<div class="k-flow ph k-photo k-avatar k-grey" data-el="[\d.]+" style="width:128px;height:128px;border-radius:50%;flex:none;box-shadow:0 0 0 6px var\(--c-field\)"><img data-user data-name="design\/assets\/demo\/object-jar\.jpg" data-fit="cover" src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="" style="object-position:50% 30%"><\/div>$/);
  assert.match(one(drawQuote(picturesLook({ avatar: { shape: 'rounded', size: 100 } }))), /width:100px;height:100px;border-radius:22px;/);
  assert.match(one(drawQuote(picturesLook({ avatar: { shape: 'square' } }))), /border-radius:0;/);
  assert.match(one(drawQuote(picturesLook({ avatar: { treat: [] } }))), /^<div class="k-flow ph k-photo k-avatar" /, 'no treatment of its own: none');
  // no avatar: nothing drawn, and the condition keeps the row tidy
  assert.doesNotMatch(drawQuote(look, { avatar: undefined }), /k-avatar/);
  // hostile values that reach the context despite the spec check: the path only as escaped text, the focal point only as a checked position
  const ctxH = { ...ctx, image: () => PIXEL };
  const raw = renderPostWithLook(look, { ...quoteSpec(), avatar: { image: '"><script>x</script>.jpg' }, avatarFocalCss: 'red;background:url(x)' }, ctxH, { shipped: false }).body;
  assert.ok(!/<script|background:url/.test(raw), 'nothing raw reaches the page');
  assert.match(raw, /data-name="&quot;&gt;&lt;script&gt;x&lt;\/script&gt;\.jpg"/);
  assert.match(raw, /object-position:50% 50%/);
  // the picture is drawn only through the image the renderer read (ctx.image): a context without one draws no avatar
  assert.doesNotMatch(renderPostWithLook(look, quoteSpec(), { ...ctx, image: undefined }, { shipped: false }).body, /k-avatar/);
});

// ---- 4. the device element ----
test('the device element: a phone or a tablet from fixed shares, its rules, hostile values refused, its lean counted as a turn', () => {
  assert.deepEqual(errsOf(picturesLook()), []);
  for (const finish of ['light', 'dark', 'brand']) for (const cutout of ['island', 'notch', 'none']) assert.deepEqual(errsOf(picturesLook({ device: { finish, cutout, buttons: false, tilt: -6, align: 'left' } })), [], `${finish} ${cutout}`);
  assert.deepEqual(errsOf(picturesLook({ device: { model: 'tablet', cutout: 'none' } })), []);
  says(picturesLook({ device: { model: 'tablet', cutout: 'island' } }), /a tablet has none/, 'a tablet with a camera island');
  for (const tilt of [-7, 7, 2.5, '3', NaN, Infinity]) says(picturesLook({ device: { tilt } }), /tilt/, `tilt ${String(tilt)}`);
  for (const h of HOSTILE) for (const k of ['model', 'finish', 'cutout', 'align']) says(picturesLook({ device: { [k]: h } }), new RegExp(k), `hostile ${k} ${h.slice(0, 12)}`);
  says(picturesLook({ device: { buttons: 'yes' } }), /buttons/, 'buttons not a boolean');
  says(picturesLook({ device: { shadow: 'hard' } }), /soft shadow/, 'a hard shadow');
  says(picturesLook({ device: { place: PX(560, 200) } }), /needs a place with a width and a height/, 'a place without a size');
  says(picturesLook({ device: { place: PX(560, 200, 150, 900) } }), /less than 160 pixels wide/, 'too small a place');
  says(picturesLook({ device: { rot: 4 } }), /"rot" is not a setting/, 'it leans by its own tilt, not rot');
  says(picturesLook({ device: { ring: { w: 2, colour: 'ink' } } }), /"ring" is not a setting/, 'no ring');
  // its lean is a turn: with three other turned elements the look is refused
  const busy = picturesLook({ device: { tilt: 4 } });
  busy.compositions[1].elements.push(...[1, 2, 3].map((i) => ({ type: 'block', colour: 'accent', rot: 5, place: PX(64, 900 + i * 60, 100, 40) })));
  says(busy, /turns 4 elements; at most 3/, 'the lean counts as a turn');
  const calm = picturesLook({ device: { tilt: 0 } });
  calm.compositions[1].elements.push(...[1, 2, 3].map((i) => ({ type: 'block', colour: 'accent', rot: 5, place: PX(64, 900 + i * 60, 100, 40) })));
  assert.deepEqual(errsOf(calm), [], 'no lean, no turn');
  // geometry: whole pixels at the model's proportions, inside the place
  const g = deviceGeometry({ w: 460, h: 960 });
  assert.deepEqual([g.w, g.h], [460, Math.round(460 * MODELS.phone.aspect)]);
  for (const v of [g.x, g.y, g.w, g.h, g.radius, ...Object.values(g.screen), g.cut.x, g.cut.y, g.cut.w, g.cut.h]) assert.ok(Number.isInteger(v), String(v));
  assert.ok(g.screen.x > 0 && g.screen.w === g.w - 2 * g.screen.x && g.screen.radius < g.radius);
  assert.equal(g.buttons.length, 4);
  const narrow = deviceGeometry({ w: 800, h: 900, align: 'right' });
  assert.ok(narrow.h <= 900 && narrow.x + narrow.w === 800, 'fits by height, at the right');
  const tab = deviceGeometry({ w: 600, h: 600, model: 'tablet', cutout: 'island' });
  assert.equal(tab.cut, null, 'a tablet has no camera cut');
  assert.throws(() => deviceGeometry({ w: 100, h: 900 }), /too small/);
  assert.throws(() => deviceGeometry({ w: NaN, h: 900 }), /width and a height/);
  assert.throws(() => deviceGeometry({ w: 400, h: 900, model: 'watch' }), /phone or a tablet/);
  assert.equal(DEVICE_TILT, 6);
});

// ---- 5. drawing a device ----
test('drawing a device: whole pixels, fixed finishes, the screenshot as a user image marked data-device, escaped and cropped round its focal point', () => {
  const body = drawPhone(picturesLook({ device: { finish: 'light', cutout: 'notch', tilt: 3 } }), { focal: '50% 0%' });
  const dev = body.match(/<div class="abs k-dev k-dev-phone"[^>]*>/)?.[0];
  assert.match(dev, /^<div class="abs k-dev k-dev-phone" data-el="[\d.]+" data-grid="skip" data-tilt="3" style="left:\d+px;top:\d+px;width:\d+px;height:\d+px;transform:rotate\(3deg\);filter:drop-shadow\(0 18px 26px rgba\(0,0,0,\.28\)\)">$/);
  assert.match(body, /<div class="abs k-dev-body k-dev-light" data-el="[\d.]+" data-fill style="inset:0;border-radius:\d+px">/);
  assert.match(body, /<div class="abs k-photo k-dev-screen" data-el="[\d.]+" style="left:\d+px;top:\d+px;width:\d+px;height:\d+px;border-radius:\d+px"><img data-user data-device data-name="design\/assets\/demo\/screen-app\.png" data-fit="cover" src="data:image\/png;base64,[A-Za-z0-9+/=]+" alt="" style="object-position:50% 0%"><\/div>/);
  assert.match(body, /<i class="abs k-dev-cut k-dev-notch" aria-hidden="true" data-deco style="left:\d+px;top:\d+px;width:\d+px;height:\d+px;border-radius:0 0 \d+px \d+px"><\/i>/);
  assert.equal((body.match(/k-dev-btn/g) ?? []).length, 4, 'four side buttons');
  assert.equal((drawPhone(picturesLook({ device: { buttons: false } })).match(/k-dev-btn/g) ?? []).length, 0);
  assert.match(drawPhone(picturesLook({ device: { cutout: 'island' } })), /k-dev-cut k-dev-island/);
  assert.doesNotMatch(drawPhone(picturesLook({ device: { cutout: 'none' } })), /k-dev-cut/);
  assert.match(drawPhone(picturesLook({ device: { model: 'tablet', cutout: 'none', finish: 'brand' } })), /k-dev k-dev-tablet.*k-dev-body k-dev-brand/);
  // the look's tilt dial scales the lean like every angle (0: straight)
  const flat = picturesLook({ device: { tilt: 5 } }); flat.dials = { ...flat.dials, tilt: 0 };
  assert.doesNotMatch(drawPhone(flat), /rotate\(/);
  // hostile words and paths reach it only escaped; a hostile focal point is dropped for the centre; the zoom is a bounded number
  const raw = renderPostWithLook(picturesLook(), { ...phoneSpec(), image: '"><img src=x onerror=alert(1)>.png', focalCss: 'red;background:url(x)', zoom: 'red' }, ctx, { shipped: false }).body;
  assert.ok(!/<img src=x|background:url/.test(raw));
  assert.equal(raw.split('onerror').length - 1, (raw.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) ?? []).length, 'the handler only inside escaped text');
  assert.match(raw, /object-position:50% 50%"/);
  // no picture: a photo post is refused before anything is drawn (a device never stands empty)
  assert.throws(() => renderPostWithLook(picturesLook(), { ...phoneSpec(), image: undefined }, ctx, { shipped: false }), /a photo post needs an image/);
});

// ---- 6. screenFit ----
test('screenFit: refuses a screenshot far from the model, crops a near one with a note or a warning, and names sizes only', () => {
  const phone = { sw: 400, sh: 868 };
  assert.deepEqual(screenFit({ ...phone, nw: 645, nh: 1398 }).ok, true);
  const near = screenFit({ ...phone, nw: 645, nh: 1398 });
  assert.ok(near.crop < 0.06 && !near.warning);
  const crop = screenFit({ ...phone, nw: 720, nh: 1280 });
  assert.ok(crop.ok && crop.crop > 0.06 && crop.at === 'sides' && /cropped by 18% at the sides/.test(crop.warning), crop.warning);
  const tall = screenFit({ ...phone, nw: 600, nh: 1400 });
  assert.ok(tall.ok && tall.at === 'top and bottom');
  for (const [nw, nh, re] of [[1640, 1025, /too wide: a landscape or desktop screenshot/], [1000, 1000, /too wide/], [600, 2000, /too tall: a scrolling capture/], [900, 1400, /too wide/]]) {
    const r = screenFit({ ...phone, nw, nh });
    assert.ok(!r.ok && re.test(r.problem), `${nw} x ${nh}: ${r.problem}`);
    assert.match(r.problem, new RegExp(`${nw} x ${nh} px`));
  }
  // the tablet takes a squarer screenshot, refuses a phone one
  assert.ok(screenFit({ model: 'tablet', sw: 500, sh: 680, nw: 1000, nh: 1400 }).ok);
  assert.ok(!screenFit({ model: 'tablet', sw: 500, sh: 680, nw: 645, nh: 1398 }).ok);
  for (const bad of [NaN, Infinity, 0, -5, '645', undefined]) assert.match(screenFit({ ...phone, nw: bad, nh: 1398 }).problem, /could not be measured/);
});

// ---- 7. the shipped looks ----
test('the shipped looks: ledger and soft offer the avatar, ledger\'s phone page draws its phone round a bare screenshot', () => {
  const S = shippedLooks();
  const has = (look, kind, type) => JSON.stringify(look.compositions.filter((c) => c.kind === kind)).includes(`"type":"${type}"`);
  assert.ok(has(S.ledger, 'quote', 'avatar') && has(S.soft, 'quote', 'avatar'));
  assert.ok(has(S.ledger, 'photo', 'device'));
  // the ledger testimonial draws the avatar, or the gallery when there is no avatar
  const L = { ...clone(S.ledger), origin: 'copy:shipped:ledger' };
  const q = (extra) => renderPostWithLook(L, forSize(normaliseDesign({ template: 'post', kind: 'quote', name: 'q', quote: 'We just look.', by: 'Ama', ...extra }), 'feed'), ctx, { shipped: false }).body;
  const pics = [{ image: JAR }, { image: 'design/assets/demo/scene-market.jpg' }];
  assert.ok(/k-avatar/.test(q({ avatar: { image: JAR } })) && !/k-round/.test(q({ avatar: { image: JAR } })));
  assert.ok(/k-avatar/.test(q({ avatar: { image: JAR }, gallery: pics })) && !/k-round/.test(q({ avatar: { image: JAR }, gallery: pics })), 'the avatar wins');
  assert.ok(!/k-avatar/.test(q({ gallery: pics })) && /k-round/.test(q({ gallery: pics })));
  assert.deepEqual(validateDesign({ template: 'post', kind: 'quote', quote: 'We just look.', avatar: { image: JAR } }, 'd', { look: L }), []);
  // the brief and the hooks say which variant draws a device, so the app and the AI can send a screenshot only there
  assert.deepEqual(lookBrief(L).kinds.photo.variants.map((v) => v.device ?? null), ['phone', null]);
  assert.deepEqual(postKinds({ ...ctx.brand, looks: [L], style: { ...ctx.brand.style, direction: L.id } }).photo.variants.map((v) => v.device ?? null), ['phone', null]);
  assert.deepEqual(postCompositionDevice(L, { template: 'post', kind: 'photo', variant: 0, headline: 'x', image: 'a.png' }), { kind: 'photo', variant: 0, name: 'Phone', device: 'phone' });
  assert.equal(postCompositionDevice(L, { template: 'post', kind: 'photo', variant: 1, headline: 'x', image: 'a.jpg' }).device, null);
  assert.equal(postCompositionDevice(L, { template: 'post', kind: 'nope' }), null);
  const tab = picturesLook({ device: { model: 'tablet', cutout: 'none' } });
  assert.equal(lookBrief(tab).kinds.photo.variants[0].device, 'tablet');
});

// ---- 8. Chrome ----
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = path.join(ROOT, 'out', `test-pictures-${process.pid}`);
let browser;
test.before(async () => {
  if (!chrome) return;
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'bare.png'), appScreen(645, 1398));
  fs.writeFileSync(path.join(tmp, 'wide.png'), appScreen(900, 700));
  fs.writeFileSync(path.join(tmp, 'short.png'), appScreen(720, 1280));
  // a bare screenshot saved with an alpha channel, every pixel opaque: still a bare screenshot (its corners decide, not its header)
  fs.writeFileSync(path.join(tmp, 'opaque-alpha.png'), pngBytes(400, 860, (x, y) => [240, 240, 236, 255].map((v, i) => (i < 3 && y < 120 ? 40 : v)), { alpha: true }));
  fs.writeFileSync(path.join(tmp, 'tiny.png'), pngBytes(40, 40, () => [120, 140, 160]));
  browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(ROOT, 'out', 'design.lock') });
});
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const rel = (f) => path.relative(ROOT, path.join(tmp, f)).split(path.sep).join('/');
const brandFor = (look) => ({ ...brand, looks: [look], style: { ...brand.style, direction: look.id } });
async function render(look, spec, name) {
  const outFile = path.join(tmp, `${name}.png`);
  const r = await renderImage(browser, brandFor(look), { spec: normaliseDesign(spec), sizeName: 'feed', outFile }, { tmpDir: path.join(tmp, 't') });
  return r;
}

test('Chrome: a bare screenshot is drawn on a phone; a pre-framed capture is shown as it is, never framed twice', { skip }, async () => {
  const look = picturesLook();
  const bare = await render(look, phoneSpec({ image: rel('bare.png') }), 'bare');
  assert.ok(bare.notes.some((n) => /cropped by \d+% at the top and bottom/.test(n)) || !bare.notes.some((n) => /already has/.test(n)), bare.notes.join(' / '));
  assert.ok(!bare.notes.some((n) => /already has the phone drawn/.test(n)));
  const framed = await render(look, phoneSpec({ image: 'design/assets/demo/screen-phone.png' }), 'framed');
  assert.ok(framed.notes.some((n) => /already has the phone drawn round it, so it is shown as it is/.test(n)), framed.notes.join(' / '));
  const opaque = await render(look, phoneSpec({ image: rel('opaque-alpha.png') }), 'opaque');
  assert.ok(!opaque.notes.some((n) => /already has/.test(n)), 'an alpha channel with opaque corners is a bare screenshot');
  // the drawn frame is visible on the bare one (dark body pixels at its edge) and hidden on the framed one (the page shows through)
  const { decodePng } = await import('./testlib/png.mjs');
  const px = (f, x, y) => { const p = decodePng(fs.readFileSync(path.join(tmp, f))); const o = (y * p.w + x) * 4; return [...p.data.slice(o, o + 3)]; };
  const g = deviceGeometry({ w: 460, h: 960 }), edge = [560 + g.x + 3, 200 + g.y + Math.round(g.h / 2)];
  const dark = px('bare.png', ...edge), page = px('framed.png', ...edge);
  assert.ok(dark.every((v) => v < 90), `the dark body at the edge of the bare one: ${dark}`);
  assert.notDeepEqual(page, dark, 'the framed one shows its own capture, not the drawn body');
});

test('Chrome: a screenshot far from a phone is refused, a near one cropped with a warning', { skip }, async () => {
  const look = picturesLook();
  await assert.rejects(render(look, phoneSpec({ image: rel('wide.png') }), 'wide'), (e) => /900 x 700 px.*too wide: a landscape or desktop screenshot/.test(e.message) && !e.message.includes('wide.png'));
  await assert.rejects(render(look, phoneSpec({ image: 'design/assets/demo/screen-desk.png' }), 'desk'), /too wide/);
  const short = await render(look, phoneSpec({ image: rel('short.png') }), 'short');
  assert.ok(short.warnings.some((w) => /cropped by \d+% at the sides to fill the screen/.test(w)), short.warnings.join(' / '));
});

test('Chrome: the avatar is a picture like every other: its enlargement is checked', { skip }, async () => {
  const look = picturesLook();
  const r = await render(look, quoteSpec({ avatar: { image: rel('tiny.png') } }), 'tiny');
  assert.ok(r.warnings.some((w) => /tiny\.png is 40x40 px and is enlarged/.test(w)), r.warnings.join(' / '));
  const ok = await render(look, quoteSpec(), 'jar');
  assert.ok(!ok.warnings.some((w) => /enlarged/.test(w)), ok.warnings.join(' / '));
});
