// The template baseline harness: renders every built-in template with representative specs (fields present and absent, every
// ground kind, carousel page 1 and later pages, photos whose plain background becomes the page and photos that stay a band) at
// every size it supports, for the demo brand and for two style variants of it (brand.json `style`), through the web app's render
// entry point (lib/design-render.mjs, renderDesignBlock), as lossless PNGs. Then it compares two runs pixel by pixel, or the
// current code's page markup with a run's, without Chrome. See testlib/CONVERTING.md for how it is used.
//
//   node packages/engine/testlib/template-baseline.mjs render <run> [--only number,text] [--styles demo,outline] [--cases id,id]
//   node packages/engine/testlib/template-baseline.mjs compare <base> <run> [--only ...] [--max 20] [--tolerance 0] [--diff]
//   node packages/engine/testlib/template-baseline.mjs markup <base> [--only ...]       (no Chrome)
//   node packages/engine/testlib/template-baseline.mjs sheet <run> [--only ...]        (contact sheets, to look at a run)
//   node packages/engine/testlib/template-baseline.mjs list [--only ...]
//
// A run is written to out/template-baseline/<run>/ (git-ignored, like everything under out/): <style>/<file>.png, the page markup
// of each image as <style>/<file>.html (data: URIs replaced by a short hash), and manifest.json with each case's result (ok,
// error, warnings, notes). Renders are sequential: one Chrome at a time, behind the engine's lock file.
//
// The pictures are the demo pack's synthetic ones (design/assets/demo) and a few more drawn here (a pre-framed phone, plain and
// drifting studio grounds): no photograph, no real person.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../lib/core.mjs';
import { renderDesignBlock } from '../lib/design-render.mjs';
import { loadBrand } from '../lib/design/brand.mjs';
import { Browser, findChrome } from '../lib/design/chrome.mjs';
import { detectConverter } from '../lib/design/convert.mjs';
import { DesignError, preparePage, renderImage } from '../lib/design/render.mjs';
import { normaliseDesign, outputFiles, validateDesign } from '../lib/design/spec.mjs';
import { comparePixels, decodePng, diffImage, pngBytes } from './png.mjs';

export const BASE_DIR = 'out/template-baseline';
const DEMO_PACK = 'brands/demo';

// ---- the brands: the demo pack as it is, and two packs that differ from it only in their `style` block ----
export const STYLES = {
  demo: null,
  // outlined surfaces, a grid on every ground, upper-case display type, the logo top right in a light pill
  outline: {
    type: { display: { case: 'upper' } },
    surface: 'outline',
    decoration: { kind: 'grid', on: 'all' },
    logo: 'top-right',
    footer: 'pill',
  },
  // flat surfaces, no decoration, duotone photos, the logo bottom left, no accent device, no website beside the logo
  flat: {
    type: { accent: 'none' },
    surface: 'flat',
    decoration: { kind: 'none' },
    photo: { treatment: 'duotone', strength: 0.6, colour: 'primary', shadows: 'dark', highlights: 'warm' },
    logo: 'bottom-left',
    footer: 'none',
  },
};
export const STYLE_NAMES = Object.keys(STYLES);

// The pack a style renders with, relative to the repository root.
const packOf = (style) => (STYLES[style] ? `${BASE_DIR}/brands/${style}` : DEMO_PACK);

export function prepareBrands(root = ROOT) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, DEMO_PACK, 'brand.json'), 'utf8'));
  for (const [name, style] of Object.entries(STYLES)) {
    if (!style) continue;
    const dir = path.join(root, packOf(name));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'brand.json'), `${JSON.stringify({ ...raw, style }, null, 2)}\n`);
    for (const f of ['map.json']) if (fs.existsSync(path.join(root, DEMO_PACK, f))) fs.copyFileSync(path.join(root, DEMO_PACK, f), path.join(dir, f));
  }
}

// ---- the pictures ----
const ASSETS = `${BASE_DIR}/assets`;
export const IMG = {
  jar: 'design/assets/demo/object-jar.jpg', // a studio object on a plain ground: the page takes its colour
  scene: 'design/assets/demo/scene-market.jpg', // a scene: a full-bleed band
  desk: 'design/assets/demo/screen-desk.png', // a desktop screenshot
  phone: `${ASSETS}/phone.png`, // a pre-framed phone capture (transparent around the phone)
  mint: `${ASSETS}/mint.png`, // a plain coloured studio ground with the object low down
  drift: `${ASSETS}/drift.png`, // a plain ground whose light drifts along the edge (the page takes its column colours)
  uneven: `${ASSETS}/uneven.png`, // an edge split in two colours: a band
};

export function prepareAssets(root = ROOT) {
  const dir = path.join(root, ASSETS);
  fs.mkdirSync(dir, { recursive: true });
  const write = (name, make) => { const f = path.join(dir, name); if (!fs.existsSync(f)) fs.writeFileSync(f, make()); };
  const blob = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  const inside = (x, y, w, h, m = 4, r = 80) => { if (x < m || y < m || x >= w - m || y >= h - m) return false; const cx = Math.min(Math.max(x, m + r), w - m - r), cy = Math.min(Math.max(y, m + r), h - m - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  write('phone.png', () => pngBytes(660, 1354, (x, y) => (!inside(x, y, 660, 1354) ? [0, 0, 0, 0] : inside(x, y, 660, 1354, 26, 60) ? (y > 300 && y < 340 && x > 80 && x < 580 ? [47, 91, 183, 255] : [248, 250, 249, 255]) : [24, 28, 27, 255]), { alpha: true }));
  write('mint.png', () => pngBytes(1400, 1000, (x, y) => (blob(x, y, 900, 760, 220) ? [200, 40, 90] : [200, 228, 210])));
  write('drift.png', () => pngBytes(1400, 1000, (x, y) => (blob(x, y, 700, 700, 200) ? [60, 90, 160] : [Math.round(240 - (x / 1400) * 14), Math.round(236 - (x / 1400) * 8), 228])));
  write('uneven.png', () => pngBytes(1400, 1000, (x) => (x < 700 ? [250, 250, 250] : [120, 140, 130])));
}

// ---- the cases: { id, design } (the design's own sizes, else feed). Each template's cases start with its id. ----
const LEDGER = { columns: [{ label: 'Day' }, { label: 'Paid in', align: 'end' }, { label: 'Balance', align: 'end' }], rows: [['01', '10.00', '10.00'], ['02', '12.50', '22.50'], ['03', '', '22.50'], ['04', '10.00', '32.50']], mark: [{ row: 3, col: 2 }] };
const REGISTER = { title: 'Where it went', rows: [['Rent', '400.00'], ['Food', '120.50'], ['Savings', '80.00']], mark: 2 };
const ALL_SIZES = ['feed', 'square', 'story', 'wide'];
export const CASES = [
  // object (poster)
  { id: 'object-jar', design: { template: 'object', headline: 'Every euro, *on record.*', sub: 'One place for the group\'s savings.', image: IMG.jar } },
  { id: 'object-jar-warm-center', design: { template: 'object', headline: 'Save together, *see every step.*', image: IMG.jar, ground: 'gold-pale', align: 'center' } },
  { id: 'object-scene-series', design: { template: 'object', headline: 'Market day, *every week.*', sub: 'The collector records each deposit.', image: IMG.scene, series: 'explainers' } },
  { id: 'object-mint-deep', design: { template: 'object', headline: 'Watch the page fill.', sub: 'A sub line.', image: IMG.mint, ground: 'deep' } },
  { id: 'object-drift-photo', design: { template: 'object', headline: 'The light *drifts.*', image: IMG.drift, ground: 'photo', size: 88, photoTop: 700, focal: '50% 60%', zoom: 1.2 } },
  { id: 'object-uneven-dark', design: { template: 'object', headline: 'Two halves, *one band.*', image: IMG.uneven, ground: 'dark', accent: 'weight' } },
  // number (poster)
  { id: 'number-plain', design: { template: 'number', big: '14.8M+', line: 'saved by members this year', stats: ['3,900+|members saving daily', '400+|groups registered'] } },
  { id: 'number-plain-dark-3', design: { template: 'number', big: '*€* 2.4M', stats: ['120|towns', '3,900+|members', '400+|groups'], ground: 'ink', series: 'myth-vs-fact' } },
  { id: 'number-big-only', design: { template: 'number', big: '98%', accent: 'weight' } },
  { id: 'number-big-long', design: { template: 'number', big: '€ 14,800,000+', line: 'a long figure shrinks to fit' } },
  { id: 'number-series-noimage', design: { template: 'number', big: '400+', line: 'groups on record', series: 'the-numbers', label: 'The numbers' } },
  { id: 'number-jar', design: { template: 'number', big: '*€* 14.8M+', line: 'processed', stats: ['3,900+|members saving daily', '400+|organisations registered'], image: IMG.jar } },
  { id: 'number-scene-series', design: { template: 'number', big: '52', line: 'market days a year', image: IMG.scene, series: 'the-numbers', photoTop: 700 } },
  { id: 'number-mint-cool', design: { template: 'number', big: '1 in 3', line: 'members save weekly', stats: ['12|weeks'], image: IMG.mint, ground: 'mint' } },
  { id: 'number-ground-photo', design: { template: 'number', big: '31', line: 'days on every page', image: IMG.jar, ground: 'photo', accent: 'muted', focal: 'center top', zoom: 1.5 } },
  { id: 'number-uneven-warm', design: { template: 'number', big: '7', stats: ['7|days', '4|weeks'], image: IMG.uneven, ground: 'warm' } },
  { id: 'number-drift-deep', design: { template: 'number', big: '2026', line: 'the year on record', image: IMG.drift, ground: 'deep', photoTop: 760 } },
  // product (poster)
  { id: 'product-center', design: { template: 'product', headline: 'Members see their own savings. *On their phone.*', image: IMG.phone } },
  { id: 'product-center-sub', design: { template: 'product', headline: 'Every deposit, *on record.*', sub: 'The balance updates the moment money moves.', image: IMG.phone } },
  { id: 'product-side-warm', design: { template: 'product', layout: 'side', headline: 'Record the deposit. *The balance updates.*', sub: 'Each deposit is posted as it is recorded.', image: IMG.phone, ground: 'gold-pale' } },
  { id: 'product-noglow', design: { template: 'product', headline: 'No glow.', image: IMG.phone, glow: false, size: 120, phoneTop: 700, align: 'left', ground: 'dark' } },
  // myth-fact (poster)
  { id: 'myth-fact', design: { template: 'myth-fact', series: 'myth-vs-fact', myth: 'Going digital means every member needs a smartphone.', factLead: 'Members keep saving *as they do today.*', fact: 'The collector records each deposit.' } },
  { id: 'myth-fact-nofact-label', design: { template: 'myth-fact', myth: 'Records are hard to keep.', factLead: 'Every payment is *on the record.*', label: 'Busting myths', ground: 'deep' } },
  // closing (poster)
  { id: 'closing', design: { template: 'closing' } },
  { id: 'closing-map', design: { template: 'closing', map: true, headline: 'See you *next week.*', line: 'acmesavings.example/join' } },
  { id: 'closing-cool', design: { template: 'closing', ground: 'cool', series: 'explainers' } },
  // cover (editorial)
  { id: 'cover', design: { template: 'cover', headline: 'How a group *saves together.*', sub: 'Five steps, from the first deposit to the payout.', image: IMG.scene } },
  { id: 'cover-nosub-series', design: { template: 'cover', headline: 'On record, *every week.*', image: IMG.jar, series: 'news', headRight: 'Issue 4' } },
  // text (editorial)
  { id: 'text', design: { template: 'text', headline: 'Saving is easier *together.*', sub: 'A group keeps each other going, and every deposit is on the record.' } },
  { id: 'text-nosub', design: { template: 'text', headline: 'One clear line *on record.*' } },
  { id: 'text-70-series', design: { template: 'text', headline: 'Field notes from *the market.*', sub: 'What the collectors told us this month.', size: 70, series: 'news', label: 'Field notes', headRight: 'May 2026' } },
  { id: 'text-84-dark-nodots', design: { template: 'text', headline: 'Dark, *without dots.*', sub: 'The decoration is off on this page.', size: 84, ground: 'dark', dots: false } },
  { id: 'text-dark', design: { template: 'text', headline: 'Dark, *with the brand\'s decoration.*', ground: 'ink' } },
  { id: 'text-accent-colour', design: { template: 'text', headline: 'The accent *in colour.*', sub: 'The *bold* words in the sub line.', accent: 'colour', series: 'explainers' } },
  { id: 'text-long', design: { template: 'text', headline: 'A long headline that runs over several lines and has to *shrink to fit the page.*', sub: 'And a sub line under it.' } },
  { id: 'text-warm-weight', design: { template: 'text', headline: 'Warm ground, *weight accent.*', ground: 'warm', accent: 'weight' } },
  { id: 'text-artefact-ledger', design: { template: 'text', headline: 'The week *on record.*', sub: 'Every deposit, as it was made.', artefact: { type: 'ledger', ...LEDGER, notes: ['Figures in euros'] } } },
  { id: 'text-artefact-register', design: { template: 'text', headline: 'Where *it went.*', artefact: { type: 'register', ...REGISTER } } },
  { id: 'text-artefact-passbook', design: { template: 'text', headline: 'A month *of saving.*', artefact: { type: 'passbook', days: 30, ticked: 12, today: 13 } } },
  { id: 'text-artefact-passbook-register', design: { template: 'text', headline: 'The passbook *and the card.*', sub: 'Side by side.', artefact: { type: 'passbook', days: 31, ticked: 17, today: 18, tick: 'gold', register: REGISTER } } },
  // ledger, passbook (editorial)
  { id: 'ledger', design: { template: 'ledger', headline: 'The week *on record.*', sub: 'Every deposit, as it was made.', ...LEDGER, notes: ['Figures in euros', 'Updated daily'] } },
  { id: 'ledger-nosub-dark', design: { template: 'ledger', headline: 'Ledger *on dark.*', ...LEDGER, ground: 'dark' } },
  { id: 'passbook', design: { template: 'passbook', headline: 'A month *of saving.*', days: 30, ticked: 12, today: 13 } },
  { id: 'passbook-sub', design: { template: 'passbook', headline: 'Every day *ticked.*', sub: 'One tick for each day paid.', days: 31, ticked: 20, today: 21, tick: 'gold' } },
  { id: 'passbook-register', design: { template: 'passbook', headline: 'The passbook *and the card.*', sub: 'Side by side.', days: 28, ticked: 9, today: 10, register: REGISTER } },
  // stats (editorial)
  { id: 'stats', design: { template: 'stats', big: '14.8M+', line: 'saved by members this year', stats: ['3,900+|members', '400+|groups', '120|towns'] } },
  { id: 'stats-photo', design: { template: 'stats', big: '*€* 2.4M', line: 'paid out', stats: ['3,900+|members', '400+|groups'], image: IMG.scene, series: 'the-numbers' } },
  { id: 'stats-big-only-dark', design: { template: 'stats', big: '98%', ground: 'dark' } },
  // screen (editorial)
  { id: 'screen-phone', design: { template: 'screen', headline: 'Your savings, *on your phone.*', sub: 'Every deposit shows the moment it is made.', image: IMG.phone, pills: ['Read-only by design', 'Two-person approval'] } },
  { id: 'screen-phone-checks', design: { template: 'screen', headline: 'Built for *groups.*', image: IMG.phone, checks: ['Two-person approval', 'Every change logged'], glow: false } },
  { id: 'screen-beside', design: { template: 'screen', headline: 'The same passbook, *on record.*', sub: 'Each member sees their balance.', image: IMG.phone, beside: { days: 31, ticked: 17 } } },
  { id: 'screen-fade', design: { template: 'screen', headline: 'The app, *at a glance.*', image: IMG.phone, fade: true } },
  { id: 'screen-desktop', design: { template: 'screen', device: 'desktop', headline: 'Watch the page fill *towards its target.*', sub: 'Anyone can see how far the page has come.', image: IMG.desk, title: 'Passbooks', region: 0.75 } },
  { id: 'screen-desktop-tilt', design: { template: 'screen', device: 'desktop', headline: 'Every passbook, *on record.*', image: IMG.desk, tilt: true } },
  { id: 'screen-desktop-framed', design: { template: 'screen', device: 'desktop', headline: 'As captured.', image: IMG.desk, framed: true, ground: 'soft' } },
  // photo-story (editorial)
  { id: 'photo-story', design: { template: 'photo-story', headline: 'Market day, *together.*', sub: 'The collector comes round every Friday.', image: IMG.scene } },
  { id: 'photo-story-print', design: { template: 'photo-story', layout: 'print', headline: 'A jar *for every goal.*', sub: 'Small deposits add up.', image: IMG.jar, series: 'community' } },
  // photo (every size)
  { id: 'photo', design: { template: 'photo', eyebrow: 'Market day', headline: 'Saving, *together.*', sub: 'Every deposit is on the record.', image: IMG.scene, sizes: ALL_SIZES } },
  { id: 'photo-bottom', design: { template: 'photo', headline: 'Text at the *bottom.*', image: IMG.scene, textAt: 'bottom', lines: false, sizes: ALL_SIZES } },
  { id: 'photo-noscrim-lines', design: { template: 'photo', headline: 'Lines given, *no scrim.*', image: IMG.jar, scrim: 'none', focal: { x: 0.5, y: 0.4 }, lines: [{ t: 'arc', x: 0.9, y: 0.7, r: 0.3, a0: 120, a1: 240 }, { t: 'br', x: 0.1, y: 0.6, l: 0.06 }], sizes: ['feed'] } },
  { id: 'photo-bottom-full', design: { template: 'photo', eyebrow: 'Every Friday', headline: 'The collector *comes round.*', sub: 'Each deposit is posted as it is recorded.', image: IMG.jar, textAt: 'bottom', focal: { feed: '50% 30%', story: 'center top', wide: '40% 50%' }, sizes: ALL_SIZES } },
  { id: 'photo-per-size', design: { template: 'photo', headline: 'Top here, *bottom there.*', sub: 'The text moves per size.', image: IMG.scene, textAt: { feed: 'bottom', square: 'top', story: 'bottom', wide: 'top' }, lines: { feed: [{ t: 'br', x: 0.85, y: 0.2, l: 0.05 }], wide: [] }, scrimPeak: 0.3, sizes: ALL_SIZES } },
  // carousels: every page template as page 1 (with "Swipe →") and as a later page (with the folio)
  ...[
    ['object', { template: 'object', headline: 'Page *one.*', image: IMG.jar }], ['number', { template: 'number', big: '14.8M+', line: 'saved', stats: ['3,900+|members'] }],
    ['product', { template: 'product', headline: 'On *the phone.*', image: IMG.phone }], ['myth-fact', { template: 'myth-fact', myth: 'A myth.', factLead: 'The *fact.*' }],
    ['closing', { template: 'closing' }], ['cover', { template: 'cover', headline: 'The *cover.*', image: IMG.scene }],
    ['text', { template: 'text', headline: 'A text *page.*', sub: 'With a sub line.' }], ['ledger', { template: 'ledger', headline: 'The *ledger.*', ...LEDGER }],
    ['passbook', { template: 'passbook', headline: 'The *passbook.*', days: 30, ticked: 5, today: 6 }], ['stats', { template: 'stats', big: '400+', stats: ['3,900+|members'] }],
    ['screen', { template: 'screen', headline: 'The *app.*', image: IMG.phone }], ['photo-story', { template: 'photo-story', headline: 'The *story.*', image: IMG.scene }],
  ].map(([name, page], i, all) => ({ id: `carousel-${name}`, design: { template: 'carousel', series: i % 2 ? 'explainers' : undefined, pages: [page, all[(i + 1) % all.length][1]] } })),
  { id: 'carousel-number-photo-later', design: { template: 'carousel', label: 'In numbers', pages: [{ template: 'text', headline: 'The year *in numbers.*' }, { template: 'number', big: '52', line: 'market days', image: IMG.scene }, { template: 'number', big: '31', image: IMG.jar, ground: 'photo' }] } },
];
// Page covers are not post images (renderDesignBlock refuses them), so they are rendered with renderImage directly.
export const PAGECOVER_KINDS = ['profile', 'facebook', 'linkedin', 'x'];

const templatesOf = (design) => (design.template === 'carousel' ? design.pages.map((p) => p.template) : [design.template]);
// The cases that show one of `only` (template names; a carousel counts for each template on it). Page covers are "pagecover".
export function selectCases({ only, cases } = {}) {
  const list = CASES.map((c) => ({ ...c, design: JSON.parse(JSON.stringify(c.design)) }));
  return list.filter((c) => (!only?.length || templatesOf(c.design).some((t) => only.includes(t))) && (!cases?.length || cases.includes(c.id)));
}

// ---- markup ----
// The data: URIs of fonts, logos and pictures are long and the same in every page; they are written as a hash.
const shortData = (s) => s.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/g, (m) => `data:#${crypto.createHash('sha256').update(m).digest('hex').slice(0, 12)}`);
// What the template made for one image, as text: the body's class and attributes, the extra stylesheet's name and the body.
const markupText = (out) => shortData(`bodyClass: ${out.bodyClass ?? ''}\nbodyAttrs: ${out.bodyAttrs ?? ''}\nsheet: ${out.sheet ?? ''}\nwarnings: ${JSON.stringify(out.warnings ?? [])}\n${out.body}\n`);

// The markup of every image of one case, for the brand in use (BRAND_DIR), keyed by file name. No Chrome.
function caseMarkup(c, brand) {
  const spec = normaliseDesign(c.design);
  if (!brand.map) for (const p of spec.template === 'carousel' ? spec.pages : [spec]) if (p?.map) p.map = false;
  const out = {};
  for (const f of outputFiles(spec, { stem: c.id, ext: '.png' })) {
    const carousel = spec.template === 'carousel';
    const job = { spec: carousel ? { ...spec.pages[f.slide], sizes: spec.sizes } : spec, sizeName: f.size, counter: carousel ? { n: f.slide + 1, total: spec.pages.length } : undefined };
    try { out[f.file] = markupText(preparePage(brand, job).out); } catch (e) { out[f.file] = `error: ${e instanceof DesignError ? e.message : e.stack}\n`; }
  }
  return out;
}

function pagecoverMarkup(brand) {
  const out = {};
  for (const kind of PAGECOVER_KINDS) {
    try { out[`pagecover-${kind}.png`] = markupText(preparePage(brand, { spec: { template: 'pagecover', kind }, sizeName: kind }).out); } catch (e) { out[`pagecover-${kind}.png`] = `error: ${e.message}\n`; }
  }
  return out;
}

const withBrandDir = async (style, fn) => {
  const before = process.env.BRAND_DIR;
  process.env.BRAND_DIR = packOf(style);
  try { return await fn(); } finally { if (before === undefined) delete process.env.BRAND_DIR; else process.env.BRAND_DIR = before; }
};

const runDir = (root, run) => {
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(run)) throw new Error('a run name is letters, digits, . _ - (up to 60)');
  return path.join(root, BASE_DIR, run);
};
const wantsPagecover = (only) => !only?.length || only.includes('pagecover');

// ---- render a run ----
export async function renderRun(run, { root = ROOT, only, styles = STYLE_NAMES, cases, log = console.log } = {}) {
  prepareBrands(root);
  prepareAssets(root);
  const dir = runDir(root, run);
  const manifestFile = path.join(dir, 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  const list = selectCases({ only, cases });
  for (const style of styles) {
    if (!(style in STYLES)) throw new Error(`unknown style "${style}" (styles: ${STYLE_NAMES.join(', ')})`);
    const out = path.join(dir, style);
    fs.mkdirSync(out, { recursive: true });
    manifest[style] ??= {};
    await withBrandDir(style, async () => {
      const brand = loadBrand({ root });
      for (const c of list) {
        for (const [file, text] of Object.entries(caseMarkup(c, brand))) fs.writeFileSync(path.join(out, file.replace(/\.png$/, '.html')), text);
        const r = await renderDesignBlock({ root, design: c.design, postId: c.id, outDir: path.relative(root, out), stem: c.id, png: true });
        manifest[style][c.id] = { ok: r.ok, error: r.error ?? null, warnings: r.warnings, notes: r.notes, files: r.files.map((f) => f.file) };
        log(`${style} ${c.id}: ${r.ok ? `${r.files.length} image(s)` : `ERROR ${r.error}`}`);
      }
      if (!wantsPagecover(only) || cases?.length) return;
      for (const [file, text] of Object.entries(pagecoverMarkup(brand))) fs.writeFileSync(path.join(out, file.replace(/\.png$/, '.html')), text);
      const chrome = findChrome();
      if (!chrome) throw new Error('Google Chrome not found (set CHROME_PATH)');
      const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(root, 'out', 'design.lock') });
      try {
        for (const kind of PAGECOVER_KINDS) {
          const id = `pagecover-${kind}`, file = `${id}.png`;
          try {
            const r = await renderImage(browser, brand, { spec: { template: 'pagecover', kind }, sizeName: kind, outFile: path.join(out, file) }, { tmpDir: path.join(root, 'out', 'design-tmp'), converter: detectConverter() });
            manifest[style][id] = { ok: true, error: null, warnings: r.warnings, notes: r.notes, files: [file] };
          } catch (e) {
            if (!(e instanceof DesignError)) throw e;
            manifest[style][id] = { ok: false, error: e.message, warnings: [], notes: [], files: [] };
          }
          log(`${style} ${id}: ${manifest[style][id].ok ? '1 image(s)' : `ERROR ${manifest[style][id].error}`}`);
        }
      } finally { browser.close(); }
    });
  }
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// The ids a selection covers, including the page covers.
const idsOf = ({ only, cases }) => [...selectCases({ only, cases }).map((c) => c.id), ...(wantsPagecover(only) && !cases?.length ? PAGECOVER_KINDS.map((k) => `pagecover-${k}`) : [])];

// ---- compare two runs ----
// -> { images: [{ style, file, differing, maxDelta, box, sameSize, missing? }], results: [{ style, id, what, base, run }], failed }
// An image fails when more than `max` pixels differ; a case fails when its result (ok, error, warnings, notes) differs.
// tolerance: a pixel that differs by no more than this in every channel is noise, not a difference (see comparePixels).
export function compareRuns(base, run, { root = ROOT, only, styles = STYLE_NAMES, cases, max = 20, tolerance = 0, diff = false } = {}) {
  const A = runDir(root, base), B = runDir(root, run);
  const ma = JSON.parse(fs.readFileSync(path.join(A, 'manifest.json'), 'utf8')), mb = JSON.parse(fs.readFileSync(path.join(B, 'manifest.json'), 'utf8'));
  const ids = idsOf({ only, cases }), images = [], results = [];
  for (const style of styles) {
    for (const id of ids) {
      const a = ma[style]?.[id], b = mb[style]?.[id];
      if (!a || !b) { results.push({ style, id, what: 'missing', base: !!a, run: !!b }); continue; }
      for (const k of ['ok', 'error', 'warnings', 'notes']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) results.push({ style, id, what: k, base: a[k], run: b[k] });
      for (const file of a.files) {
        const fa = path.join(A, style, file), fb = path.join(B, style, file);
        if (!fs.existsSync(fb)) { images.push({ style, file, missing: true, differing: Infinity, maxDelta: 255 }); continue; }
        const pa = decodePng(fs.readFileSync(fa)), pb = decodePng(fs.readFileSync(fb)), c = comparePixels(pa, pb, { tolerance });
        if (diff && c.differing && c.sameSize) { fs.mkdirSync(path.join(B, 'diff', style), { recursive: true }); fs.writeFileSync(path.join(B, 'diff', style, file), diffImage(pa, pb)); }
        images.push({ style, file, ...c });
      }
    }
  }
  const failed = images.some((i) => i.differing > max) || results.length > 0;
  return { images, results, failed };
}

// ---- compare the current code's markup with a run's (no Chrome) ----
export async function compareMarkup(base, { root = ROOT, only, styles = STYLE_NAMES, cases } = {}) {
  prepareBrands(root);
  prepareAssets(root);
  const A = runDir(root, base), rows = [];
  for (const style of styles) {
    await withBrandDir(style, async () => {
      const brand = loadBrand({ root });
      const all = Object.assign({}, ...selectCases({ only, cases }).map((c) => caseMarkup(c, brand)), wantsPagecover(only) && !cases?.length ? pagecoverMarkup(brand) : {});
      for (const [file, now] of Object.entries(all)) {
        const f = path.join(A, style, file.replace(/\.png$/, '.html'));
        const was = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
        let at = -1;
        if (was !== now) { at = 0; while (at < Math.min(was?.length ?? 0, now.length) && was[at] === now[at]) at++; }
        rows.push({ style, file, same: was === now, missing: was === null, at, was: was?.slice(Math.max(0, at - 60), at + 140), now: now.slice(Math.max(0, at - 60), at + 140) });
      }
    });
  }
  return rows;
}

// ---- contact sheets, to look at a run: every image of the selection, a quarter of its size, `columns` to a row ----
export function contactSheets(run, { root = ROOT, only, styles = STYLE_NAMES, cases, columns = 6, k = 4, per = 24 } = {}) {
  const dir = runDir(root, run), m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), written = [];
  for (const style of styles) {
    const files = idsOf({ only, cases }).flatMap((id) => m[style]?.[id]?.files ?? []);
    for (let start = 0; start < files.length; start += per) {
      const pics = files.slice(start, start + per).map((f) => decodePng(fs.readFileSync(path.join(dir, style, f))));
      const cw = Math.ceil(Math.max(...pics.map((p) => p.w)) / k) + 8, ch = Math.ceil(Math.max(...pics.map((p) => p.h)) / k) + 8;
      const cols = Math.min(columns, pics.length), rows = Math.ceil(pics.length / cols), W = cols * cw, H = rows * ch;
      const px = new Uint8Array(W * H * 3).fill(128);
      pics.forEach((p, i) => {
        const ox = (i % cols) * cw + 4, oy = Math.floor(i / cols) * ch + 4;
        for (let y = 0; y < Math.floor(p.h / k); y++) for (let x = 0; x < Math.floor(p.w / k); x++) {
          const s = [0, 0, 0];
          for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const q = ((y * k + dy) * p.w + x * k + dx) * 4; s[0] += p.data[q]; s[1] += p.data[q + 1]; s[2] += p.data[q + 2]; }
          const o = ((oy + y) * W + ox + x) * 3;
          for (let c = 0; c < 3; c++) px[o + c] = Math.round(s[c] / (k * k));
        }
      });
      const what = cases?.length ? 'cases' : only?.length ? only.join('+') : 'all';
      const file = path.join(dir, `sheet-${what}-${style}-${start / per + 1}.png`);
      fs.writeFileSync(file, pngBytes(W, H, (x, y) => { const o = (y * W + x) * 3; return [px[o], px[o + 1], px[o + 2]]; }));
      written.push({ file: path.relative(root, file), images: files.slice(start, start + per) });
    }
  }
  return written;
}

// ---- command line ----
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--diff') o.diff = true;
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i];
    else o._.push(a);
  }
  const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
  return { cmd: o._[0], names: o._.slice(1), only: list(o.only), styles: list(o.styles) ?? STYLE_NAMES, cases: list(o.cases), max: o.max === undefined ? 20 : Number(o.max), tolerance: o.tolerance === undefined ? 0 : Number(o.tolerance), diff: !!o.diff };
}

async function main(argv) {
  const a = args(argv);
  if (a.cmd === 'list') {
    for (const c of selectCases(a)) console.log(`${c.id}\t${templatesOf(c.design).join(',')}\t${(c.design.sizes ?? ['feed']).join(',')}`);
    return 0;
  }
  if (a.cmd === 'render' && a.names.length === 1) {
    const m = await renderRun(a.names[0], a);
    const bad = Object.entries(m).flatMap(([s, r]) => Object.entries(r).filter(([, v]) => !v.ok).map(([id, v]) => `${s} ${id}: ${v.error}`));
    console.log(`\nwritten to ${BASE_DIR}/${a.names[0]}/${bad.length ? `; ${bad.length} case(s) were refused (part of the baseline):\n  ${bad.join('\n  ')}` : ''}`);
    return 0;
  }
  if (a.cmd === 'compare' && a.names.length === 2) {
    const r = compareRuns(a.names[0], a.names[1], a);
    for (const i of r.images) console.log(`${i.differing > a.max ? 'DIFF' : i.differing ? 'aa  ' : 'same'}  ${i.style}/${i.file}  ${i.missing ? 'missing in the run' : !i.sameSize ? 'different size' : `${i.differing} px differ, max channel delta ${i.maxDelta}${i.box ? ` in x ${i.box.x0}-${i.box.x1}, y ${i.box.y0}-${i.box.y1}` : ''}${i.noise ? ` (${i.noise} px within the tolerance of ${a.tolerance})` : ''}`}`);
    for (const x of r.results) console.log(`RESULT ${x.style} ${x.id} ${x.what}:\n  base: ${JSON.stringify(x.base)}\n  run:  ${JSON.stringify(x.run)}`);
    const n = r.images.length, same = r.images.filter((i) => i.differing === 0).length, aa = r.images.filter((i) => i.differing > 0 && i.differing <= a.max).length;
    console.log(`\n${n} images: ${same} identical${a.tolerance ? ` (up to the tolerance of ${a.tolerance})` : ''}, ${aa} within ${a.max} px, ${n - same - aa} different; ${r.results.length} result difference(s)${a.diff ? ` (diff pictures in ${BASE_DIR}/${a.names[1]}/diff/)` : ''}`);
    return r.failed ? 1 : 0;
  }
  if (a.cmd === 'sheet' && a.names.length === 1) {
    for (const s of contactSheets(a.names[0], a)) console.log(`${s.file}: ${s.images.join(' ')}`);
    return 0;
  }
  if (a.cmd === 'markup' && a.names.length === 1) {
    const rows = await compareMarkup(a.names[0], a);
    for (const r of rows.filter((x) => !x.same)) console.log(`DIFF ${r.style}/${r.file}${r.missing ? ' (not in the run)' : ` at character ${r.at}`}\n  was: ${JSON.stringify(r.was)}\n  now: ${JSON.stringify(r.now)}`);
    console.log(`\n${rows.length} pages: ${rows.filter((x) => x.same).length} with the same markup, ${rows.filter((x) => !x.same).length} different`);
    return rows.every((x) => x.same) ? 0 : 1;
  }
  console.log('usage: template-baseline.mjs render <run> | compare <base> <run> [--max 20] [--tolerance 0] [--diff] | markup <base> | sheet <run> | list   [--only t1,t2] [--styles demo,outline,flat] [--cases id1,id2]');
  return 2;
}

// Every case is a design the engine accepts as it is (the harness never renders an invalid spec by mistake).
export const caseProblems = () => CASES.flatMap((c) => validateDesign(c.design, c.id).map((e) => e));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e.stack ?? e); process.exitCode = 1; });
}
