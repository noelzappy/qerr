// node --test   (a carousel page drawn from one of the brand's own layouts: its validation, exactly as a single post made with
// that layout; its normalisation; the page it makes with its place in the carousel, so "page" conditions and the folio hold; one
// real render needs Google Chrome)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrand, loadSeries } from './lib/design/brand.mjs';
import { validateBatchDesigns } from './lib/design/batch.mjs';
import { findChrome } from './lib/design/chrome.mjs';
import { layoutDesignProblems, layoutPageProblems, normalisePostDesign, postDesignProblems, validateLayout } from './lib/design/layout.mjs';
import { preparePage } from './lib/design/render.mjs';
import { normaliseDesign, outputFiles, validateDesign } from './lib/design/spec.mjs';
import { designBlockProblems, renderDesignBlock } from './lib/design-render.mjs';
import { decodePng } from './testlib/png.mjs';

const brand = loadBrand();
const SERIES = loadSeries();
const at = (col, row, width, height) => ({ col, row, width, height });
const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };

// A brand's layout made for carousels: "Start here" on page 1, the folio on the later pages, a dark ground on page 1.
const pageLayout = () => ({
  id: 'step', name: 'Step', description: 'One step of an explainer carousel.',
  ground: [{ when: { page: 'first' }, ground: 'dark' }, { ground: 'light' }],
  texture: 'none',
  fields: { headline: { required: true, max: 90 }, sub: { max: 140 }, stats: { min: 0, max: 2 } },
  canvas: { feed: structuredClone(GRID) },
  blocks: [
    { type: 'label', text: 'Start here', slot: at(1, 2, 8, 1), tone: 'accent', when: { page: 'first' } },
    { type: 'label', source: 'folio', slot: at(9, 2, 4, 1), align: 'right', when: { page: 'later' } },
    { type: 'headline', slot: at(1, 5, 12, 8), size: 84 },
    { type: 'sub', slot: at(1, 14, 12, 4), when: { present: 'sub' } },
    { type: 'stats', slot: at(1, 19, 12, 3) },
    { type: 'logo', slot: at(1, 24, 6, 1), valign: 'bottom' },
    { type: 'website', slot: at(7, 24, 6, 1), align: 'right', valign: 'bottom' },
  ],
});
const storyOnly = () => ({ ...pageLayout(), id: 'tall', canvas: { story: { ...structuredClone(GRID), margin: { top: 250, right: 70, bottom: 320, left: 70 } } } });
const LAYOUTS = [pageLayout(), storyOnly()];
const step = (o = {}) => ({ template: 'layout', layout: 'step', headline: 'Every saving, *on record.*', ...o });
const carousel = (pages, o = {}) => ({ template: 'carousel', series: 'explainers', pages, ...o });
const closing = { template: 'closing', headline: 'Start saving with us' };
const check = (d, layouts = LAYOUTS) => postDesignProblems(d, 'design', { series: SERIES, layouts });
const has = (errs, frag) => errs.some((e) => e.includes(frag));

test('the test layouts are valid brand layouts', () => {
  for (const l of LAYOUTS) assert.deepEqual(validateLayout(l), [], l.id);
});

test('a carousel accepts a page drawn from one of the brand\'s layouts, alone or beside the built-in pages', () => {
  assert.deepEqual(check(carousel([step(), step({ headline: 'Second', sub: 'A sub line.' }), step({ headline: 'Third', stats: ['3,900+|members'] })])), []);
  assert.deepEqual(check(carousel([step(), closing])), []);
  // the batch validator and the render job's validator say the same
  assert.deepEqual(validateBatchDesigns([{ id: 'p', design: carousel([step(), closing]) }], { series: SERIES, layouts: LAYOUTS }), []);
  assert.deepEqual(designBlockProblems(carousel([step(), closing]), { layouts: LAYOUTS }), []);
  // a series and label on the carousel, a page's own label
  assert.deepEqual(check(carousel([step({ label: 'Step one' }), step()], { label: 'Explainer' })), []);
});

test('a layout page is checked exactly as a single post made with that layout', () => {
  const cases = [
    [{ headline: undefined }, 'headline is required by this layout'],
    [{ headline: 'x'.repeat(91) }, 'headline is 91 characters; this layout takes up to 90'],
    [{ quote: 'Not declared' }, 'quote is not used by layout "step"'],
    [{ stats: ['1|a', '2|b', '3|c'] }, 'stats needs 1 to 2 entries'],
    [{ series: 'nope' }, 'series "nope" is not in brand.json'],
    [{ ground: 'purple' }, 'ground must be one of'],
  ];
  for (const [o, msg] of cases) {
    const page = step(o);
    if (o.headline === undefined && 'headline' in o) delete page.headline;
    const errs = check(carousel([page, closing]));
    assert.ok(has(errs, `design page 1: ${msg}`), `${msg}: ${errs.join(' | ')}`);
    // the same words as a single post made with that layout get the same answer
    const single = { ...page };
    assert.ok(has(layoutDesignProblems(single, 'design page 1', { series: SERIES, layouts: LAYOUTS }), msg), msg);
  }
});

test('a layout page that names no brand layout, or one without a feed size, is refused', () => {
  assert.ok(has(check(carousel([step({ layout: 'missing' }), closing])), 'design page 1: layout "missing" is not one of the brand\'s layouts (step, tall)'));
  assert.ok(has(check(carousel([step(), closing]), []), 'design page 1: layout "step" is not one of the brand\'s layouts (it has none)'));
  assert.ok(has(check(carousel([step({ layout: 'Bad Id!' }), closing])), 'design page 1: layout must name one of the brand\'s layouts'));
  assert.ok(has(check(carousel([step({ layout: 'tall' }), closing])), 'design page 1: layout "tall" has no feed size, and a carousel page is drawn at the feed size'));
  // sizes, the file name and the network sizes belong to the carousel
  for (const k of ['sizes', 'name', 'networkSizes']) {
    const errs = check(carousel([step({ [k]: k === 'sizes' ? ['feed'] : k === 'name' ? 'x' : { linkedin: 'feed' } }), closing]));
    assert.ok(has(errs, `design page 1: ${k} is set on the carousel, not on one of its pages`), k);
  }
  // an invalid layout of the brand's is never drawn
  const broken = { ...pageLayout(), blocks: [] };
  assert.ok(has(check(carousel([step(), closing]), [broken]), 'the brand\'s layout "step" is not valid'));
});

test('hostile text in a layout page is refused or quoted back harmlessly, as for a single post', () => {
  const script = '<script>alert(1)</script>';
  const errs = check(carousel([step({ layout: script }), step({ [script]: 'x' }), step({ headline: { toString: () => script } }), step({ sub: 'x'.repeat(5000) }), closing]));
  assert.ok(has(errs, 'design page 1: layout must name one of the brand\'s layouts'));
  assert.ok(has(errs, 'design page 2: ?script?alert(1)?/script? is not used by layout "step"'), errs.join(' | '));
  assert.ok(has(errs, 'design page 3: headline must be a non-empty text'));
  assert.ok(has(errs, 'design page 4: sub is 5000 characters; this layout takes up to 140'));
  for (const e of errs) assert.ok(!e.includes('<script'), e);
  assert.ok(has(check(carousel([step({ image: 'x.jpg' }), closing])), 'design page 1: image is not used by layout "step"'));
  assert.ok(has(check(carousel([null, closing])), 'design page 1: template must be one of'));
});

test('without the brand\'s layouts the templates\' own validator refuses a layout page, and every other carousel is checked as before', () => {
  assert.ok(has(validateDesign(carousel([step(), closing]), 'design', { series: SERIES }), 'design page 1: template must be one of object, number'));
  const plain = carousel([{ template: 'object', headline: 'x', image: 'design/assets/demo/object-jar.jpg' }, { template: 'nope' }, closing]);
  const before = validateDesign(plain, 'design', { series: SERIES });
  const after = check(plain);
  assert.equal(after.length, before.length);
  assert.ok(has(after, 'design page 2: template must be one of object, number, product, myth-fact, closing, cover, text, ledger, passbook, stats, screen, photo-story, or layout'));
  assert.deepEqual(check(carousel([{ template: 'object', headline: 'x', image: 'design/assets/demo/object-jar.jpg' }, closing])), []);
  assert.deepEqual(normalisePostDesign(carousel([closing, closing]), LAYOUTS), normaliseDesign(carousel([closing, closing])));
});

test('a layout page is normalised as its layout\'s, at the carousel\'s sizes, with the carousel\'s series', () => {
  const spec = normalisePostDesign(carousel([step({ stats: ['3,900+ | members'] }), closing]), LAYOUTS);
  assert.deepEqual(spec.sizes, ['feed']);
  assert.equal(spec.pages[0].template, 'layout');
  assert.deepEqual(spec.pages[0].stats, [['3,900+', 'members']]);
  assert.deepEqual(spec.pages[0].sizes, ['feed']);
  assert.equal(spec.pages[0].series, 'explainers');
  assert.deepEqual(outputFiles(spec, { stem: 's' }).map((f) => f.file), ['s-1.jpg', 's-2.jpg']);
});

// The page markup for one page of a carousel (no Chrome), as the renderer prepares it.
const markup = (spec, counter) => preparePage(brand, { spec, sizeName: 'feed', counter, layouts: LAYOUTS }).out.body;

test('a layout page is drawn with its place in the carousel: "page" conditions, the ground cases and the folio', () => {
  const spec = normalisePostDesign(carousel([step(), step(), step()]), LAYOUTS);
  const [one, two, three] = spec.pages.map((p, i) => markup(p, { n: i + 1, total: 3 }));
  assert.ok(one.includes('Start here'), 'page 1 shows the block for the first page');
  assert.ok(!two.includes('Start here') && !three.includes('Start here'), 'the later pages do not');
  assert.ok(!one.includes('01 / 03'));
  assert.ok(two.includes('02 / 03') && three.includes('03 / 03'), 'the later pages show the folio');
  assert.match(one, /--bg:var\(--g-dark\)/);
  assert.match(two, /--bg:var\(--g-light\)/);
  // the same layout as a single post is neither page 1 nor a later page
  const single = markup(normalisePostDesign(step(), LAYOUTS), undefined);
  assert.ok(!single.includes('Start here') && !single.includes(' / '));
  assert.match(single, /--bg:var\(--g-light\)/);
});

const chrome = findChrome() ? false : 'Google Chrome not found';
test('real render: a carousel of layout pages and a built-in page, page 1 drawn as page 1', { skip: chrome }, async () => {
  const keep = process.env.QERR_KEEP_RENDERS ? path.resolve(process.env.QERR_KEEP_RENDERS) : null;
  const out = keep ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ss-layout-carousel-'));
  try {
    const design = carousel([
      step({ headline: 'How a savings group *keeps its record.*', sub: 'Three steps, from the first payment to the shared ledger.' }),
      step({ headline: 'Every payment is *written down.*', stats: ['3,900+|members', '400+|groups'] }),
      step({ headline: 'Everyone sees *the same ledger.*' }),
      closing,
    ]);
    const r = await renderDesignBlock({ design, layouts: LAYOUTS, postId: 'layout-carousel', outDir: out, png: true });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.files.map((f) => [f.slide, f.w, f.h]), [[0, 1080, 1350], [1, 1080, 1350], [2, 1080, 1350], [3, 1080, 1350]]);
    assert.equal(r.pdf?.pages, 4);
    assert.deepEqual(r.warnings, []);
    // the ground case for page 1 holds on page 1 only: a dark corner there, a light one on pages 2 and 3
    const corner = (f) => { const img = decodePng(fs.readFileSync(f.abs)); const k = (10 * img.w + 10) * 4; return img.data[k] + img.data[k + 1] + img.data[k + 2]; };
    const [c1, c2, c3] = r.files.slice(0, 3).map(corner);
    assert.ok(c1 < 200, `page 1 is dark (${c1})`);
    assert.ok(c2 > 600 && c3 > 600, `pages 2 and 3 are light (${c2}, ${c3})`);
    // one page alone (the layout editor's preview of a carousel page)
    const one = await renderDesignBlock({ design, layouts: LAYOUTS, postId: 'layout-carousel', stem: 'only', outDir: out, png: true, slides: [2] });
    assert.equal(one.ok, true, one.error);
    assert.deepEqual(one.files.map((f) => f.file), ['only-3.png']);
    assert.equal(one.pdf, undefined, 'no PDF for a part of a carousel');
  } finally { if (!keep) fs.rmSync(out, { recursive: true, force: true }); }
});
