// node --test   (the page covers' words fit their box: lib/design/checks.mjs findCoverProblems, and the renderer's cover fit in
// lib/design/render.mjs, which sets the tagline smaller, then over two lines, and refuses words that fit neither. The real renders
// need Google Chrome and are skipped without it.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand, validateBrand } from './lib/design/brand.mjs';
import { COVER_TAGLINE_LINES, explainCoverProblems, findCoverProblems } from './lib/design/checks.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { DesignError, preparePage, renderImage } from './lib/design/render.mjs';
import { COVER_SIZES } from './lib/design/sizes.mjs';
import { decodePng } from './testlib/png.mjs';
import { STYLES } from './testlib/template-baseline.mjs';

const RAW = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const demo = loadBrand();
// A brand from the demo pack with other words or another style; every value still passes validateBrand.
const withBrand = (style, words = {}) => {
  const raw = { ...RAW, ...words, ...(style ? { style } : {}) };
  assert.deepEqual(validateBrand(raw), []);
  return { ...demo, ...normaliseBrand(raw) };
};

// ---- the check, without Chrome ----
const X = COVER_SIZES.x; // 1500 x 500, margins 24 at the sides, 16 at the top
const BOX = { x0: 440, y0: 105, x1: 1410, y1: 395 };
const word = (role, x0, y0, x1, y1, more = {}) => ({ role, text: role === 'logo' ? '' : `${role} words`, rects: [{ x0, y0, x1, y1 }], lines: 1, size: 40, ...more });

test('a cover\'s words inside their box and the margins pass', () => {
  assert.deepEqual(findCoverProblems([{ box: BOX, words: [word('logo', 440, 109, 687, 157), word('headline', 440, 172, 1400, 269), word('sub', 440, 277, 1351, 348), word('url', 440, 359, 718, 391)] }], X), []);
  assert.deepEqual(findCoverProblems([], X), []);
});

test('a tagline past the side of its box is a problem, even where the page margin would allow it', () => {
  // the X header's tagline at 80 px in mixed case: 94 px out of its box, 25 px inside the page's own margin
  const p = findCoverProblems([{ box: BOX, words: [word('headline', 440, 172, 1504, 269)] }], X);
  assert.deepEqual(p.map(({ kind, role, edge, of, px }) => ({ kind, role, edge, of, px })), [{ kind: 'coverout', role: 'headline', edge: 'right', of: 'box', px: 94 }]);
});

test('where the box is wider than the margins, the margins hold the words', () => {
  const fb = COVER_SIZES.facebook;
  const p = findCoverProblems([{ box: { x0: 0, y0: 62, x1: 1640, y1: 562 }, words: [word('headline', -18, 237, 1658, 363)] }], fb);
  assert.deepEqual(p.map(({ edge, of, px }) => ({ edge, of, px })), [{ edge: 'left', of: 'margin', px: 42 }, { edge: 'right', of: 'margin', px: 42 }]);
});

test('the website is held to the box too (it is exempt from no cover check), and so is the logo picture', () => {
  const li = COVER_SIZES.linkedin, box = { x0: 560, y0: 20, x1: 2166, y1: 290 };
  const p = findCoverProblems([{ box, words: [word('url', 1930, 238, 2208, 270), word('logo', 540, 131, 807, 179)] }], li);
  assert.deepEqual(p.map(({ role, edge, px }) => ({ role, edge, px })), [{ role: 'url', edge: 'right', px: 42 }, { role: 'logo', edge: 'left', px: 20 }]);
});

test('a tagline over more than two lines, and words stacked taller than their box, are problems', () => {
  const three = findCoverProblems([{ box: BOX, words: [word('headline', 440, 150, 1000, 300, { lines: COVER_TAGLINE_LINES + 1 })] }], X);
  assert.deepEqual(three.map((p) => p.kind), ['coverlines']);
  // too tall: one problem for the stack, not one for each word that sticks out at the top or the bottom
  const tall = findCoverProblems([{ box: BOX, words: [word('logo', 440, 99, 687, 147), word('headline', 440, 160, 1300, 300), word('url', 440, 380, 900, 402)] }], X);
  assert.deepEqual(tall.map(({ kind, px, room }) => ({ kind, px, room })), [{ kind: 'covertall', px: 11, room: 290 }]);
});

test('the refusal names the cover, the words and what was tried, and says what to change', () => {
  const p = findCoverProblems([{ box: BOX, words: [word('headline', 440, 172, 1504, 269, { text: 'SAVE TOGETHER, SEE EVERY STEP.' })] }], X);
  const msg = explainCoverProblems(p, 'x', { size: 80, min: 50 });
  assert.match(msg, /^The brand's words do not fit the x cover even with the tagline set from 80 px down to 50 px, on one line and wrapped over 2 lines: /);
  assert.match(msg, /the tagline \("SAVE TOGETHER, SEE EVERY STEP\."\) runs 94 px out of the right of its box/);
  assert.match(msg, /Shorten the brand's tagline, descriptor or website \(Settings, Brand and look\)/);
});

// ---- real renders ----
const chrome = findChrome();
const KINDS = Object.keys(COVER_SIZES);
// The ink of a rendered cover (every pixel that is not the white ground) lies inside the words' box and the size's margins, so no
// word is drawn past them, and none is clipped at the page's edge. (A few px for glyphs that overhang their advance.)
function assertInkInside(file, brand, kind) {
  const { w, h, data } = decodePng(fs.readFileSync(file));
  const S = COVER_SIZES[kind], { layout } = preparePage(brand, { spec: { template: 'pagecover', kind }, sizeName: kind });
  const r = layout.blocks[0].px;
  const lim = { x0: Math.max(r.x, S.pad), x1: Math.min(r.x + r.w, S.w - S.pad), y0: Math.max(r.y, S.top), y1: Math.min(r.y + r.h, S.h - (S.bottom ?? S.pad)) };
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    if (data[o] < 245 || data[o + 1] < 245 || data[o + 2] < 245) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  const tol = 4;
  assert.ok(x1 >= 0, `${file}: nothing drawn`);
  assert.ok(x0 >= lim.x0 - tol && x1 <= lim.x1 + tol && y0 >= lim.y0 - tol && y1 <= lim.y1 + tol, `${file}: ink ${x0},${y0}-${x1},${y1} outside ${JSON.stringify(lim)}`);
}

test('real render: every cover in every style, upper case and wide tracking included, fits its box', { skip: chrome ? false : 'Google Chrome not found' }, async () => {
  const dir = path.join(ROOT, 'out', 'test-cover-fit');
  fs.rmSync(dir, { recursive: true, force: true });
  const looks = {
    demo: withBrand(null),
    outline: withBrand(STYLES.outline),
    flat: withBrand(STYLES.flat),
    'flat-upper': withBrand({ ...STYLES.flat, type: { ...STYLES.flat.type, display: { case: 'upper' } } }),
    'all-upper': withBrand({ type: { display: { case: 'upper', tracking: 0.3, weight: 900 }, body: { case: 'upper', tracking: 0.3 }, label: { case: 'upper', tracking: 0.3 } }, surface: 'outline' }),
  };
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    for (const [name, brand] of Object.entries(looks)) {
      for (const kind of KINDS) {
        const outFile = path.join(dir, `${name}-${kind}.png`);
        const r = await renderImage(browser, brand, { spec: { template: 'pagecover', kind }, sizeName: kind, outFile }, { tmpDir: path.join(dir, 'tmp') });
        assert.equal(r.w, COVER_SIZES[kind].w);
        if (kind !== 'profile') assertInkInside(outFile, brand, kind);
        // the demo's Facebook cover fits as its layout sets it: nothing is shrunk that need not be
        if (name === 'demo' && kind === 'facebook') assert.deepEqual(r.notes, []);
        // the X header's box is too narrow for the 80 px tagline, and upper case is wider still: the tagline is set smaller
        if (kind === 'x') assert.ok(r.notes.some((n) => /^tagline set at \d+% of the layout's size to fit the x cover$/.test(n)), `${name}: ${r.notes}`);
      }
    }
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('real render: a long brand tagline and website wrap where the cover allows, and words that cannot fit are refused by name', { skip: chrome ? false : 'Google Chrome not found' }, async () => {
  const dir = path.join(ROOT, 'out', 'test-cover-fit-long');
  fs.rmSync(dir, { recursive: true, force: true });
  const long = withBrand(null, {
    name: 'Acme Savings and Family Goals Cooperative',
    tagline: 'Save together with the whole family, see every single step.',
    website: 'acme-savings-and-family-goals.example',
    descriptor: 'Group savings, goals, shared records and reminders for every member of the family in one place. A fictional brand.',
  });
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    // Facebook: too long for one line at any allowed size, so it is balanced over two at the layout's size
    for (const kind of ['facebook', 'linkedin']) {
      const outFile = path.join(dir, `long-${kind}.png`);
      const r = await renderImage(browser, long, { spec: { template: 'pagecover', kind }, sizeName: kind, outFile }, { tmpDir: path.join(dir, 'tmp') });
      assert.ok(r.notes.some((n) => /over two lines to fit the/.test(n)), `${kind}: ${r.notes}`);
      assertInkInside(outFile, long, kind);
    }
    // X: the words stand taller than the header's box at every size tried; the render is refused, no file is written
    const outFile = path.join(dir, 'long-x.png');
    await assert.rejects(
      renderImage(browser, long, { spec: { template: 'pagecover', kind: 'x' }, sizeName: 'x', outFile }, { tmpDir: path.join(dir, 'tmp') }),
      (e) => e instanceof DesignError && /^The brand's words do not fit the x cover even with the tagline set from 80 px down to 50 px/.test(e.message) && /taller than the 290 px of their box/.test(e.message) && /Shorten the brand's tagline, descriptor or website/.test(e.message),
    );
    assert.equal(fs.existsSync(outFile), false);
    // upper case makes the same tagline too long for the LinkedIn row even over two lines at its smallest
    const upper = withBrand(STYLES.outline, { tagline: long.tagline, website: long.website, descriptor: long.descriptor });
    await assert.rejects(
      renderImage(browser, upper, { spec: { template: 'pagecover', kind: 'linkedin' }, sizeName: 'linkedin', outFile: path.join(dir, 'long-upper-linkedin.png') }, { tmpDir: path.join(dir, 'tmp') }),
      (e) => e instanceof DesignError && /do not fit the linkedin cover/.test(e.message) && /the tagline \("SAVE TOGETHER WITH THE WHOLE FAMILY/.test(e.message),
    );
  } finally {
    browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
