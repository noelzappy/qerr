// node --test   (the markup without Chrome; the measured gap with Google Chrome, skipped without it.)
// Punctuation right after a headline pill ("[[one question]].") sits snug against the pill, on the same line, in every shipped look that
// draws pills: the pill drops its outer margin on that side, and the page pulls the mark in by its own side bearing, so the ink of the
// mark starts a hair after the pill's edge. Measured on the screenshot's pixels, in each look's own faces (Inter, Anton, Fraunces ...).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrand } from './lib/design/brand.mjs';
import { renderPostWithLook, shippedLooks } from './lib/design/directions/index.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { buildPage } from './lib/design/page.mjs';
import { preparePage, renderImage } from './lib/design/render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';
import { decodePng } from './testlib/png.mjs';
import { NORMAL as STUDIO } from './testlib/studio-copy.mjs';
import { NORMAL as LOUD } from './testlib/loud-copy.mjs';
import { NORMAL as ROAST } from './testlib/roast-copy.mjs';
import { NORMAL as GUIDE } from './testlib/guide-copy.mjs';

// every shipped look whose headline draws pills, with a composition that does and its copy, the headline ending in a pill and a full stop
const CASES = [
  ['studio', 'statement', 0, STUDIO, 'Start with [[one question]].'],
  ['loud', 'statement', 0, LOUD, 'Pick the next [[feature]].'],
  ['roast', 'statement', 1, ROAST, 'Fresh beans [[on Thursday]].'],
  ['guide', 'statement', 0, GUIDE, 'Seven days [[out]].'],
];
const brandFor = (id) => { const b = loadBrand(), look = { ...shippedLooks()[id], origin: `copy:shipped:${id}` }; return { ...b, looks: [look], style: { ...b.style, direction: id } }; };
const specFor = ([id, kind, variant, copy, headline]) => ({ template: 'post', kind, variant, name: `pill-${id}`, ...copy[`${id}/${kind}/${variant}`], headline });

test('every shipped look that draws pills is covered here', () => {
  const withPills = Object.values(shippedLooks()).filter((l) => JSON.stringify(l.compositions).includes('"pills"')).map((l) => l.id).sort();
  assert.deepEqual(withPills, CASES.map((c) => c[0]).sort());
});

test('a pill and the mark after it are one unbreakable run, the pill without its outer margin on that side', () => {
  for (const c of CASES) {
    const body = renderPostWithLook(brandFor(c[0]).looks[0], specFor(c), { size: SIZES.feed, brand: brandFor(c[0]), image: () => 'data:image/png;base64,iVBORw0KGgo=', imageSize: () => ({ w: 800, h: 600 }) }, { shipped: false }).body;
    assert.match(body, /<span class="k-pl-stop"><span class="k-pl k-pl-[a-z]+ k-pl-end"[^>]*><span class="k-pl-t" data-role="accent">[^<]+<\/span><\/span><span class="k-pl-p">\.<\/span><\/span>/, c[0]);
  }
  // a pill with no mark after it keeps its margin and stands alone
  const plain = renderPostWithLook(brandFor('studio').looks[0], { ...specFor(CASES[0]), headline: 'Start with [[one question]] today' }, { size: SIZES.feed, brand: brandFor('studio'), image: () => '', imageSize: () => null }, { shipped: false }).body;
  assert.ok(!plain.includes('k-pl-stop') && !plain.includes('k-pl-end'));
});

const chrome = findChrome();
test('with Chrome: the ink of the full stop starts within 0.04 em of the pill, on its line, in every look', { skip: chrome ? false : 'Google Chrome was not found' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-pill-'));
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    for (const c of CASES) {
      const brand = brandFor(c[0]);
      const { S, out } = preparePage(brand, { spec: normaliseDesign(specFor(c)), sizeName: 'feed' });
      const page = await browser.page(S.w, S.h);
      await page.setContent(buildPage({ brand, size: S, ...out }));
      await page.evaluate('window.__ds.ready({})');
      await page.evaluate('window.__ds.fitLines()');
      const m = await page.evaluate(`(() => {
        const st = document.querySelector('.k-pl-stop'), pl = st.querySelector('.k-pl'), p = st.querySelector('.k-pl-p');
        const r = document.createRange(); r.selectNodeContents(p);
        const a = pl.getBoundingClientRect(), b = r.getBoundingClientRect();
        return { right: a.right, top: a.top, bottom: a.bottom, mTop: b.top, mBottom: b.bottom, mRight: b.right, fs: parseFloat(getComputedStyle(p).fontSize) };
      })()`);
      assert.ok(m.mTop < m.bottom && m.mBottom > m.top, `${c[0]}: the mark is on the pill's line`);
      const png = decodePng(await page.screenshotPng());
      const px = (x, y) => { const o = (y * png.w + x) * 4; return [png.data[o], png.data[o + 1], png.data[o + 2]]; };
      // the page right of the pill, above the full stop (which sits on the baseline), is the background the ink is told apart from
      const x0 = Math.ceil(m.right) + 1, y0 = Math.round(m.top + (m.bottom - m.top) * 0.2), y1 = Math.floor(m.bottom) - 1, bg = px(x0, y0);
      let ink = -1;
      for (let x = Math.floor(m.right) + 1; x <= Math.ceil(m.mRight) && ink < 0; x++) for (let y = y0; y <= y1; y++) { const q = px(x, y); if (Math.abs(q[0] - bg[0]) + Math.abs(q[1] - bg[1]) + Math.abs(q[2] - bg[2]) > 120) { ink = x; break; } }
      assert.ok(ink > 0, `${c[0]}: the full stop's ink is found`);
      const gap = (ink - m.right) / m.fs;
      assert.ok(gap >= 0 && gap <= 0.04, `${c[0]}: the full stop's ink starts ${gap.toFixed(3)} em after the pill (0 to 0.04)`);
    }
  } finally { browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('with Chrome: words on an outline pill are judged inside its ring, never on the ring drawn in their own colour (loud Shout)', { skip: chrome ? false : 'Google Chrome was not found' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-pill-ring-'));
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    const brand = brandFor('loud'), spec = normaliseDesign({ template: 'post', kind: 'statement', variant: 0, name: 'ring', ...LOUD['loud/statement/0'] });
    assert.match(spec.headline, /\[\[/, 'the shout headline has a pill');
    const r = await renderImage(browser, brand, { spec, sizeName: 'feed', outFile: path.join(tmp, 'ring.png') }, { tmpDir: tmp });
    assert.deepEqual(r.warnings, []);
    const { S, out } = preparePage(brand, { spec, sizeName: 'feed' });
    const page = await browser.page(S.w, S.h);
    await page.setContent(buildPage({ brand, size: S, ...out }));
    await page.evaluate('window.__ds.ready({})');
    await page.evaluate('window.__ds.fitLines()');
    const m = await page.evaluate(`(() => { const pl = document.querySelector('.k-pl-line'), b = pl.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, ring: parseFloat(getComputedStyle(pl).boxShadow.replace(/rgba?\\([^)]*\\)/g, '').match(/[\\d.]+px/g)[3]) }; })()`);
    const accent = (await page.evaluate('window.__ds.measure()')).roles.find((x) => x.role === 'accent');
    assert.ok(m.ring > 2, `an outline pill (${m.ring} px ring)`);
    for (const q of accent.rects) assert.ok(q.y0 >= m.top + m.ring && q.y1 <= m.bottom - m.ring, 'the words are read inside the ring');
  } finally { browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
});
