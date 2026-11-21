// node --test   (font weights: which weights each type role is drawn at, how several weights of one family are declared, what
// brand.json may say about font files, and, in a real browser, that a bold role is drawn with the true bold face. The render at
// the end needs Google Chrome and is skipped without it.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT, brandFile } from './lib/core.mjs';
import { FIXED_ROLE_WEIGHTS, MAX_FONT_FILES, MAX_ROLE_FONT_FILES, familyWeights, loadBrand, nearestWeight, roleWeights, validateBrand, weightRanges } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { buildPage, fontFaceCss } from './lib/design/page.mjs';
import { TEMPLATE_FNS } from './lib/design/builtin-layouts.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, normaliseDesign } from './lib/design/spec.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const WEIGHT_VARS = ['--hw', '--aw', '--pw', '--b-w', '--l-w'];
const PLEX = (w) => `design/fonts/ibm-plex-mono-v23-${w}-latin.woff2`;
const LATIN = 'U+0000-00FF';

test('the stylesheets set no weight that roleWeights does not know about', () => {
  // every font-weight in the stylesheets and in the inline styles of the templates is a role's weight variable or one of the
  // fixed weights; a new literal weight must be added to FIXED_ROLE_WEIGHTS (so that Google fonts bring it too)
  const sources = [
    ...['brand.css', 'layout.css'].map((f) => path.join(ENGINE_DIR, 'design', f)),
    ...fs.readdirSync(path.join(ENGINE_DIR, 'design', 'templates')).map((f) => path.join(ENGINE_DIR, 'design', 'templates', f)),
    ...fs.readdirSync(path.join(ENGINE_DIR, 'lib', 'design')).filter((f) => f.endsWith('.mjs')).map((f) => path.join(ENGINE_DIR, 'lib', 'design', f)),
  ];
  const fixed = new Set(Object.values(FIXED_ROLE_WEIGHTS).flat());
  let seen = 0;
  for (const file of sources) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/font-weight:([^;}"'`\s]+)/g)) {
      const v = m[1];
      if (v.startsWith('${')) continue; // page.mjs: the @font-face rules, from checked brand values
      seen++;
      const name = /^var\((--[a-z-]+)\)$/.exec(v)?.[1];
      if (name) assert.ok(WEIGHT_VARS.includes(name), `${path.basename(file)}: font-weight ${v} is not a type weight variable`);
      else if (v !== 'inherit') assert.ok(fixed.has(Number(v)), `${path.basename(file)}: font-weight ${v} is not in FIXED_ROLE_WEIGHTS`);
    }
  }
  assert.ok(seen > 20, `only ${seen} font-weight declarations found`);
});

test('the weights of each role follow the brand: headline, accent, poster, body and label weights', () => {
  const b = loadBrand();
  // the demo: headlines 400, the accent 300, posters 600, body 400, labels 500
  assert.deepEqual(roleWeights(b), { sans: [400, 500, 600], display: [300, 400, 600], label: [500], mono: [400, 500] });
  // its sans is also the headline face, and its mono the label face
  assert.deepEqual(familyWeights(b), { Inter: [300, 400, 500, 600], 'IBM Plex Mono': [400, 500] });
  const styled = { ...RAW, font: { ...RAW.font, headlineWeight: 700, accentWeight: 400 }, style: { type: { body: { weight: 300 }, label: { weight: 600 } } } };
  assert.deepEqual(roleWeights(styled), { sans: [300, 400, 500, 600, 700], display: [400, 600, 700], label: [600], mono: [400, 500] });
  // a display weight in the style block sets the headlines, the posters and (300 lighter) the accent
  assert.deepEqual(roleWeights({ ...RAW, style: { type: { display: { weight: 800 } } } }).display, [500, 600, 800]);
  // a display family of its own needs the display weights only; labels in the sans add theirs to the sans
  const files = [...RAW.font.files, { role: 'display', weight: '100 900', file: PLEX(500), range: LATIN }];
  const own = { ...RAW, font: { ...RAW.font, display: 'Brand Display', label: 'Inter', files } };
  assert.deepEqual(familyWeights(own), { Inter: [400, 500, 600], 'IBM Plex Mono': [400, 500], 'Brand Display': [300, 400, 600] });
});

test('several weights of one family are each declared for the weights they are nearest to', () => {
  assert.equal(nearestWeight([400, 700], 600), 700);
  assert.equal(nearestWeight([400, 700], 500), 400);
  assert.equal(nearestWeight([300, 500], 400), 500, 'a tie at 400 goes to the heavier, as in CSS font matching');
  assert.equal(nearestWeight([400, 600], 500), 400, 'a tie at 500 goes to the lighter');
  assert.equal(nearestWeight([200, 400], 300), 200, 'a tie below 400 goes to the lighter');
  assert.equal(nearestWeight([600, 800], 700), 800, 'a tie above 500 goes to the heavier');
  assert.equal(nearestWeight([500], 900), 500);
  assert.deepEqual([...weightRanges([400])], [[400, '100 900']]);
  assert.deepEqual([...weightRanges([700, 400])], [[400, '100 549'], [700, '550 900']]);
  assert.deepEqual([...weightRanges([300, 400, 600])], [[300, '100 350'], [400, '351 500'], [600, '501 900']]);
  // the ranges cover 100 to 900 without a gap or an overlap, and each weight is drawn with its nearest
  for (const list of [[100, 900], [300, 500, 700], [100, 200, 300, 400, 500, 600, 700, 800, 900], [400, 500], [200, 800]]) {
    const ranges = [...weightRanges(list)].map(([w, r]) => [w, ...r.split(' ').map(Number)]);
    assert.equal(ranges[0][1], 100);
    assert.equal(ranges.at(-1)[2], 900);
    for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i][1], ranges[i - 1][2] + 1, String(list));
    for (let want = 100; want <= 900; want++) assert.equal(ranges.find(([, lo, hi]) => want >= lo && want <= hi)[0], nearestWeight(list, want), `${list} at ${want}`);
  }
  // ignores what is not a weight
  assert.deepEqual([...weightRanges([400, 950, 'x', 400.5])], [[400, '100 900']]);
});

test('validateBrand: font files with known weights, inside the pack, in bounded numbers', () => {
  const brand = (files, extra = {}) => ({ ...RAW, font: { ...RAW.font, display: 'Brand Display', ...extra, files: [...RAW.font.files, ...files] } });
  const file = (weight, f = PLEX(400), role = 'display') => ({ role, weight, file: f, range: LATIN });
  // several weights of a family, each with its own range, and the older one file per role
  assert.deepEqual(validateBrand(brand([file('100 449'), file('450 900', PLEX(500))])), []);
  assert.deepEqual(validateBrand(brand([file('100 900')])), []);
  assert.deepEqual(validateBrand(brand([file('700')])), []);
  assert.deepEqual(validateBrand(brand([file('400', 'state/brand/0123abcd/fonts/display-400-latin.woff2')])), []);
  const refused = (b, what) => assert.ok(validateBrand(b).some((e) => e.includes(what)), `${JSON.stringify(b.font.files.at(-1))}: ${validateBrand(b).join(' | ')}`);
  for (const w of ['950', '050', '700 400', '400 1000', '400-700', 'bold', ' 400', '400 ', 400, null]) refused(brand([file(w)]), 'weight must be a weight from 100 to 900');
  for (const f of ['../secret/x.woff2', 'design/../../x.woff2', '/etc/fonts/x.woff2', 'C:\\fonts\\x.woff2', 'design//x.woff2', './x.woff2', 'design/fonts/x.ttf', 'x.woff2?y', 'a b.woff2', `${'a/'.repeat(160)}x.woff2`, 7]) {
    refused(brand([file('400', f)]), 'must be the relative path of a .woff2 file');
  }
  refused(brand([{ ...file('400'), range: `${'U+0041, '.repeat(300)}U+0041` }]), 'range must be a unicode-range');
  // at most 18 files of one role, 64 in all
  refused(brand(Array.from({ length: MAX_ROLE_FONT_FILES + 1 }, () => file('400'))), `files of role display; the most for one role is ${MAX_ROLE_FONT_FILES}`);
  assert.deepEqual(validateBrand(brand(Array.from({ length: MAX_ROLE_FONT_FILES }, () => file('400')))), []);
  const many = ['sans', 'mono', 'display', 'label'].flatMap((role) => Array.from({ length: 16 }, () => file('400', PLEX(400), role)));
  refused({ ...RAW, font: { ...RAW.font, display: 'Brand Display', label: 'Brand Label', files: [...RAW.font.files, ...many] } }, `font.files must be a list of 1 to ${MAX_FONT_FILES} font files`);
});

test('each weight is its own @font-face rule with its font-weight', () => {
  const pack = path.join(ROOT, 'out', `test-fonts-faces-${process.pid}`);
  fs.mkdirSync(pack, { recursive: true });
  try {
    const files = [...RAW.font.files, { role: 'display', weight: '100 449', file: PLEX(400), range: LATIN }, { role: 'display', weight: '450 900', file: PLEX(500), range: LATIN }];
    fs.writeFileSync(path.join(pack, 'brand.json'), JSON.stringify({ ...RAW, font: { ...RAW.font, display: 'Brand Display', files } }));
    const b = loadBrand({ file: path.join(pack, 'brand.json') });
    const own = b.fontFaces.filter((f) => f.family === 'Brand Display');
    assert.deepEqual(own.map((f) => f.weight), ['100 449', '450 900']);
    const rules = fontFaceCss(b).split('@font-face').filter((r) => r.includes('font-family:"Brand Display"'));
    assert.equal(rules.length, 2);
    assert.ok(rules[0].includes(own[0].src) && rules[0].includes('font-weight:100 449;'), 'the 400 file, for 100 to 449');
    assert.ok(rules[1].includes(own[1].src) && rules[1].includes('font-weight:450 900;'), 'the 500 file, for 450 to 900');
    assert.notEqual(own[0].src, own[1].src);
  } finally { fs.rmSync(pack, { recursive: true, force: true }); }
});

// ---- in a real browser ----
const chrome = findChrome();
const NO_CHROME_SKIP = 'Google Chrome not found (set CHROME_PATH); skipping the real render';

// A brand whose headline face is IBM Plex Mono in two true weights (400 and 500), declared as `ranges` says.
function brandWith(dir, ranges, extra = {}) {
  const files = [...RAW.font.files, ...ranges.map(([w, weight]) => ({ role: 'display', weight, file: PLEX(w), range: LATIN }))];
  fs.writeFileSync(path.join(dir, 'brand.json'), JSON.stringify({ ...RAW, ...extra, font: { ...RAW.font, ...extra.font, display: 'Weight Test', files } }));
  return loadBrand({ file: path.join(dir, 'brand.json') });
}

// The page, drawn, and the fonts Chrome used for the text of the headline (CSS.getPlatformFontsForNode, through a second
// DevTools session on the same tab) and for its accent phrase; and a picture of the headline.
async function drawn(browser, brand, spec) {
  const S = SIZES.feed;
  const t = TEMPLATE_FNS[spec.template](forSize(normaliseDesign(spec), 'feed'), { size: S, brand, image: () => '', imageSize: () => ({ w: 1, h: 1 }) });
  const before = new Set((await browser.send('Target.getTargets')).targetInfos.map((x) => x.targetId));
  const page = await browser.page(S.w, S.h);
  try {
    await page.setContent(buildPage({ brand, size: S, ...t }));
    await page.evaluate('window.__ds.ready()');
    const targetId = (await browser.send('Target.getTargets')).targetInfos.find((x) => x.type === 'page' && !before.has(x.targetId)).targetId;
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p = {}) => browser.send(m, p, sessionId);
    await send('DOM.enable');
    await send('CSS.enable');
    const { root } = await send('DOM.getDocument', { depth: -1 });
    const fontsOf = async (selector) => {
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert.ok(nodeId, selector);
      return (await send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map((f) => f.postScriptName || f.familyName);
    };
    const box = await page.evaluate('(() => { const r = document.querySelector("[data-role=headline]").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()');
    const weights = await page.evaluate('[getComputedStyle(document.querySelector("[data-role=headline]")).fontWeight, getComputedStyle(document.querySelector("[data-role=headline] em")).fontWeight]');
    return { headline: await fontsOf('[data-role=headline]'), accent: await fontsOf('[data-role=headline] em'), weights, png: await page.screenshotPng(), box };
  } finally { await page.close(); }
}

test('end to end: a bold role is drawn with the true bold face, a light one with the light face, and never with a synthetic bold', { skip: chrome ? false : NO_CHROME_SKIP }, async () => {
  const dir = path.join(ROOT, 'out', `test-fonts-render-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  const shots = process.env.VESK_FONT_SHOTS; // a folder to keep the pictures in, to look at them
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    const spec = { template: 'text', headline: 'Every weight *a true one*', accent: 'weight', series: Object.keys(RAW.series)[0] };
    // headlines at 600, the accent at 400: as declared by weightRanges([400, 500])
    const ranges = [...weightRanges([400, 500])];
    const heavy = brandWith(dir, ranges, { font: { headlineWeight: 600, accentWeight: 400 } });
    const a = await drawn(browser, heavy, spec);
    assert.deepEqual(a.weights, ['600', '400']);
    // (the fonts of a node include those of the text inside it: the headline holds the accent phrase)
    assert.deepEqual(a.headline.sort(), ['IBMPlexMono-Medium', 'IBMPlexMono-Regular'], 'the headline is drawn with the 500 file, the nearest to 600');
    assert.deepEqual(a.accent, ['IBMPlexMono-Regular'], 'the accent is drawn with the 400 file');
    // the 500 face stands in for 600 as it is: the headline at 600 looks exactly like the headline at 500 (no synthetic bold)
    const b = await drawn(browser, brandWith(dir, ranges, { font: { headlineWeight: 500, accentWeight: 400 } }), spec);
    assert.deepEqual(b.headline.sort(), ['IBMPlexMono-Medium', 'IBMPlexMono-Regular']);
    assert.ok(a.png.equals(b.png), 'the 600 headline differs from the 500 one: the browser made a bold of its own');
    // declared at their own weights only, the same two files leave 600 to a synthetic bold, which this check sees
    const c = await drawn(browser, brandWith(dir, [[400, '400'], [500, '500']], { font: { headlineWeight: 600, accentWeight: 400 } }), spec);
    assert.deepEqual(c.headline.sort(), ['IBMPlexMono-Medium', 'IBMPlexMono-Regular']);
    assert.ok(!c.png.equals(a.png), 'a synthetic bold should have changed the picture');
    if (shots) for (const [n, x] of [['ranges-600', a], ['ranges-500', b], ['exact-600-synthetic', c]]) fs.writeFileSync(path.join(shots, `fonts-${n}.png`), x.png);
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
