// node --test   (the interpreter against its oracles. Needs Google Chrome; skipped without it.)
// Retail: the shipped retail look (lib/design/looks/retail.look.json, shippedLooks().retail) is drawn beside the code compositions it replaces
// (directions/retail/compositions.mjs), ALL NINE, from the normal copy in three sets of brand colours and from the stress and minimal copy in the
// demo colours. The text elements must come out in the same order, within 3 px of the oracle and within 2.5 px of its font size. The markup is NOT
// byte-identical (the data path writes enum classes of kit.css, not the retail.css variants, and its own custom properties on the root), so the level
// reached is "geometry". The documented deviations (everything else is within the tolerance above):
//   - roles: the figure's numeral is role stat (the code's fitted headline is role headline); the unit of the figure, the day of the date tile and its month
//     are drawn as label or meta text (the code marks the unit and the day accent, the month label); the check that reads a role holds them to the same targets;
//   - the highlight bar pads .12 em each side in the data version against .13 em on a wrapping headline in retail.css: the right edge of a wrapping
//     emphasis (Seam, Poster band) is up to 5 px short of the code's.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrand } from './lib/design/brand.mjs';
import { renderPost, shippedLooks } from './lib/design/directions/index.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { buildPage } from './lib/design/page.mjs';
import { preparePage, renderImage } from './lib/design/render.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';
import { MINIMAL, MINIMAL_CHECKED, NORMAL, STRESS, paletteBrand, retailSpec } from './testlib/retail-copy.mjs';
import { MINIMAL as SWISS_MINIMAL, NORMAL as SWISS_NORMAL, STRESS as SWISS_STRESS } from './testlib/swiss-copy.mjs';
import { MINIMAL as SOFT_MINIMAL, NORMAL as SOFT_NORMAL, STRESS as SOFT_STRESS } from './testlib/soft-copy.mjs';
import { MINIMAL as BLOOM_MINIMAL, NORMAL as BLOOM_NORMAL, STRESS as BLOOM_STRESS } from './testlib/bloom-copy.mjs';
import { MINIMAL as CLEAN_MINIMAL, NORMAL as CLEAN_NORMAL, STRESS as CLEAN_STRESS } from './testlib/clean-copy.mjs';
import { MINIMAL as STUDIO_MINIMAL, NORMAL as STUDIO_NORMAL, STRESS as STUDIO_STRESS } from './testlib/studio-copy.mjs';

const asCopy = (l) => ({ ...l, origin: `copy:shipped:${l.id}` });
const RETAIL = asCopy(shippedLooks().retail), SWISS = asCopy(shippedLooks().swiss), SOFT = asCopy(shippedLooks().soft), BLOOM = asCopy(shippedLooks().bloom), CLEAN = asCopy(shippedLooks().clean), STUDIO = asCopy(shippedLooks().studio);
const COLOURS = {
  demo: {},
  dark: paletteBrand({ name: 'Night Kitchen', light: '#EFEAE0', ink: '#10151F', primary: '#1B2A41', gold: '#F2B84B', deep: '#8A5A00' }),
  pale: paletteBrand({ name: 'Pale Mill', light: '#F5F0E6', ink: '#2A2418', primary: '#9C3B16', gold: '#EADFC0', deep: '#9A7B2E' }),
};
const brandOf = (colours, look) => { const b = loadBrand(); return { ...b, ...COLOURS[colours], ...(look ? { looks: [look] } : {}), style: { ...b.style, direction: look ? look.id : 'retail' } }; };
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vesk-look-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(tmp, 'design.lock') }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const texts = async (brand, spec) => {
  const prep = preparePage(brand, { spec: normaliseDesign(spec), sizeName: 'feed' });
  const page = await browser.page(1080, 1350);
  try {
    await page.setContent(buildPage({ brand, size: SIZES.feed, ...prep.out }));
    await page.evaluate('window.__ds.ready({})');
    await page.evaluate('window.__ds.fitLines()');
    return JSON.parse(await page.evaluate(`JSON.stringify([...document.querySelectorAll('[data-role]')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.role, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), parseFloat(getComputedStyle(e).fontSize)]; }))`));
  } finally { await page.close(); }
};

const ROLE_PAIRS = new Set(['headline/stat', 'accent/label', 'accent/meta', 'label/meta']);
test('retail as data: all nine compositions draw where the code compositions do (3 px, font size 2.5 px; the documented deviations above)', { skip }, async () => {
  const runs = [...Object.keys(COLOURS).map((c) => ['normal', NORMAL, c]), ['stress', STRESS, 'demo'], ['minimal', MINIMAL_CHECKED, 'demo']];
  let compared = 0;
  for (const [what, set, colours] of runs) {
    for (const id of Object.keys(NORMAL)) {
      const spec = retailSpec({ id, fields: ['image'] }, set[id]);
      const oracle = await texts(brandOf(colours), spec), data = await texts(brandOf(colours, RETAIL), spec);
      const where = `${id} ${what} ${colours}`;
      assert.equal(data.length, oracle.length, `${where}: the same number of text elements`);
      oracle.forEach((o, i) => {
        const d = data[i];
        assert.ok(o[0] === d[0] || ROLE_PAIRS.has(`${o[0]}/${d[0]}`), `${where} #${i}: role ${d[0]} against the oracle's ${o[0]}`);
        const wrappingBar = o[0] === 'accent' && ['retail/photo/1', 'retail/event/0'].includes(id) && o[5] > 90;
        o.slice(1, 5).forEach((v, k) => assert.ok(Math.abs(v - d[k + 1]) <= (wrappingBar && k === 2 ? 5 : 3), `${where} #${i} ${o[0]}: edge ${k + 1} is ${d[k + 1]}, the oracle's ${v}`));
        assert.ok(Math.abs(o[5] - d[5]) <= 2.5, `${where} #${i}: font size ${d[5]} against ${o[5]}`);
        compared++;
      });
    }
  }
  assert.ok(compared >= 200, `${compared} text elements compared`);
});

// An offer without a picture draws no empty card where the picture would be (a big colour panel with nothing in it): the stamp is larger and
// centred with the sub line under it, in the code composition and the look alike, and the page passes every check.
test('retail offer without a picture: no empty picture card, the data version where the code one is, every check passed', { skip }, async () => {
  const spec = { template: 'post', kind: 'offer', variant: 0, name: 'no-picture', headline: 'Free for clubs *up to 20*', tag: 'Free', sub: 'No card needed.' };
  for (const brand of [brandOf('demo'), brandOf('demo', RETAIL)]) {
    const { body } = renderPost(spec, { size: SIZES.feed, brand, image: () => '', imageSize: () => ({ w: 1, h: 1 }) });
    assert.doesNotMatch(body, /width:520px/, 'no picture card');
    assert.match(body, /k-shape-stamp/);
    await renderImage(browser, brand, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `offer-no-picture-${brand.looks ? 'data' : 'code'}.png`) }, { tmpDir: tmp });
  }
  const oracle = await texts(brandOf('demo'), spec), data = await texts(brandOf('demo', RETAIL), spec);
  assert.equal(data.length, oracle.length);
  oracle.forEach((o, i) => o.slice(1, 5).forEach((v, k) => assert.ok(Math.abs(v - data[i][k + 1]) <= 3, `#${i} ${o[0]}: edge ${k + 1} is ${data[i][k + 1]}, the oracle's ${v}`)));
});

// The price tag with figures of five to eight characters and a unit (a real batch had "2,000" and "10,000" refused: the figure ran into the
// edge of its unit block): every check passes, in the code composition and the look.
test('retail price tag: figures of five to eight characters with a unit pass every check', { skip }, async () => {
  for (const [big, unit] of [['2,000', 'members'], ['10,000', 'deposits a month'], ['100,000', 'savers'], ['€14.8M+', 'saved']]) {
    const spec = { template: 'post', kind: 'figure', variant: 0, name: 'figures', label: 'This year', big, unit, sub: 'Groups in twelve towns now keep their records in the app.' };
    for (const brand of [brandOf('demo'), brandOf('demo', RETAIL)]) {
      try { await renderImage(browser, brand, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, 'figure.png') }, { tmpDir: tmp }); }
      catch (e) { assert.fail(`${big} ${unit} (${brand.looks ? 'data' : 'code'}): ${e.message}`); }
    }
  }
});

// Every shipped look, every one of its nine compositions, from sample, stress and minimal copy, in three sets of brand colours: every page passes the
// checks (fit, contrast, pixel size, emptiness, scale, levels, grid). The likeness of swiss to the prototype is judged by eye on the sheets
// (scripts/direction-sheet.mjs --look ... --copy sample|stress|minimal).
const COPY = {
  retail: { sample: NORMAL, stress: STRESS, minimal: MINIMAL_CHECKED }, swiss: { sample: SWISS_NORMAL, stress: SWISS_STRESS, minimal: SWISS_MINIMAL },
  soft: { sample: SOFT_NORMAL, stress: SOFT_STRESS, minimal: SOFT_MINIMAL }, bloom: { sample: BLOOM_NORMAL, stress: BLOOM_STRESS, minimal: BLOOM_MINIMAL },
  clean: { sample: CLEAN_NORMAL, stress: CLEAN_STRESS, minimal: CLEAN_MINIMAL }, studio: { sample: STUDIO_NORMAL, stress: STUDIO_STRESS, minimal: STUDIO_MINIMAL },
};
test('every shipped look passes every check, all 62 compositions from sample, stress and minimal copy, in three sets of brand colours', { skip }, async () => {
  assert.deepEqual(Object.keys(shippedLooks()).sort(), ['bloom', 'clean', 'retail', 'soft', 'studio', 'swiss'], 'a new shipped look is added here with its copy');
  let drawn = 0;
  for (const look of [RETAIL, SWISS, SOFT, BLOOM, CLEAN, STUDIO]) {
    for (const [kind, versions] of Object.entries(Object.groupBy(look.compositions, (c) => c.kind))) {
      for (const [v, comp] of versions.entries()) {
        const id = `${look.id}/${kind}/${v}`;
        for (const copyName of ['sample', 'stress', 'minimal']) {
          for (const colours of Object.keys(COLOURS)) {
            const spec = { template: 'post', kind, variant: v, name: 'look-test', ...COPY[look.id][copyName][id], ...(comp.fields.image ? { image: 'design/assets/demo/object-jar.jpg' } : {}) };
            try {
              await renderImage(browser, brandOf(colours, look), { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${look.id}-${kind}-${v}-${copyName}-${colours}.png`), folio: { n: 4, total: 12 } }, { tmpDir: tmp });
              drawn++;
            } catch (e) { assert.fail(`${id} (${comp.name}) ${copyName} ${colours}: ${e.message}`); }
          }
        }
      }
    }
  }
  assert.equal(drawn, 62 * 3 * 3);
});
