#!/usr/bin/env node
// The design directions' contact sheet: renders a list of `post` designs under every direction with one brand pack and writes
//   out/directions/<direction>/<kind>-<variant>.jpg   (the pages, 1080 x 1350)
//   out/directions/sheet.jpg                          (one image: rows = kinds and variants, columns = directions, labelled)
// A tool for the person who looks at the pictures, not a test. Chrome only (the engine's own driver); one Chrome at a time.
//
//   node packages/engine/scripts/direction-sheet.mjs [--content file.json] [--brand brands/demo] [--directions editorial,swiss,retail]
//        [--kinds statement,figure] [--variants all|0|0,1] [--name "Brand name"] [--out out/directions] [--thumb 400]
//
// --content: { brandName?, designs: [ { template: "post", kind, ...fields } ] } (default testlib/direction-sample.json: a fictional
//   coffee roaster, one design per kind, the synthetic demo pictures). The same design is drawn in every direction.
// --brand: the brand pack (default brands/demo, or BRAND_DIR). Its colours, logo and photo treatment are used as they are; only the
//   direction changes from column to column. --name replaces the brand's name for the sheet (the content file's brandName does too).
// --variants: which variants of each kind to draw (default all: every variant any direction has; a direction without it shows a gap).
// Pictures named in a design are read from the repository (checked as ever); nothing is sent anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../lib/core.mjs';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
if (args.includes('--help') || args.includes('-h')) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }

const here = path.dirname(fileURLToPath(import.meta.url));
const contentFile = path.resolve(opt('content', path.join(here, '..', 'testlib', 'direction-sample.json')));
const brandRel = opt('brand', process.env.BRAND_DIR || 'brands/demo');
process.env.BRAND_DIR = brandRel;
const outRoot = path.resolve(ROOT, opt('out', 'out/directions'));
const thumb = Math.max(200, Math.min(1080, Number(opt('thumb', 400)) || 400));
if (path.relative(ROOT, outRoot).startsWith('..')) { console.error('--out must stay inside the repository'); process.exit(2); }

const { loadBrand } = await import('../lib/design/brand.mjs');
const { Browser, NO_CHROME, findChrome } = await import('../lib/design/chrome.mjs');
const { renderImage } = await import('../lib/design/render.mjs');
const { normaliseDesign, validateDesign } = await import('../lib/design/spec.mjs');
const { DIRECTIONS } = await import('../lib/design/tokens.mjs');
const { compositionsFor } = await import('../lib/design/directions/index.mjs');
const { esc } = await import('../design/templates/common.mjs');

const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));
const directions = (opt('directions', DIRECTIONS.join(',')) ?? '').split(',').filter((d) => DIRECTIONS.includes(d));
const kinds = opt('kinds') ? opt('kinds').split(',') : null;
const wanted = opt('variants', 'all');
const designs = (content.designs ?? []).filter((d) => !kinds || kinds.includes(d.kind));
if (!directions.length || !designs.length) { console.error('nothing to draw: check --directions, --kinds and the content file'); process.exit(2); }

const base = loadBrand();
const name = opt('name', content.brandName);
const brandFor = (direction) => ({ ...base, ...(name ? { name } : {}), style: { ...base.style, direction } });

// rows: each design, each variant any chosen direction has (or the variants asked for)
const rows = [];
for (const d of designs) {
  const most = Math.max(1, ...directions.map((dir) => compositionsFor(dir, d.kind).length));
  const list = wanted === 'all' ? [...Array(most).keys()] : wanted.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0);
  if (!directions.some((dir) => compositionsFor(dir, d.kind).length)) { console.log(`skip ${d.kind}: no direction has a ${d.kind} composition yet`); continue; }
  for (const v of list) rows.push({ design: d, variant: v });
}

const chrome = findChrome();
if (!chrome) { console.error(NO_CHROME); process.exit(1); }
fs.mkdirSync(outRoot, { recursive: true });
const tmpDir = path.join(ROOT, 'out', 'design-tmp');
const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(ROOT, 'out', 'design.lock') });
const cells = new Map();
let failed = 0;
try {
  for (const row of rows) {
    for (const direction of directions) {
      const key = `${row.design.kind}-${row.variant}`, file = path.join(outRoot, direction, `${key}.jpg`);
      const label = `${direction}/${key}`;
      if (row.variant >= compositionsFor(direction, row.design.kind).length) { cells.set(label, { gap: true }); continue; }
      const design = { ...row.design, variant: row.variant };
      const problems = validateDesign(design, 'design', { direction });
      if (problems.length) { cells.set(label, { error: problems.join('; ') }); failed++; console.log(`FAIL ${label}: ${problems.join('; ')}`); continue; }
      try {
        const r = await renderImage(browser, brandFor(direction), { spec: normaliseDesign(design), sizeName: 'feed', outFile: file, folio: { n: rows.indexOf(row) + 1, total: rows.length } }, { tmpDir });
        cells.set(label, { file, warnings: r.warnings });
        console.log(`ok   ${label}${r.warnings.length ? `  (${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}: ${r.warnings.join(' | ')})` : ''}`);
      } catch (e) {
        // a refusal of the design checks, or an engine error in a composition: either way the cell shows why, and the run goes on
        cells.set(label, { error: e.message }); failed++;
        console.log(`FAIL ${label}: ${e.message}`);
      }
    }
  }
  // the contact sheet: an HTML page of <img> data: URIs, photographed by the same Chrome
  const th = Math.round((thumb * 1350) / 1080), gap = 14, labelW = 150, headH = 54, pad = 20;
  const W = pad * 2 + labelW + directions.length * (thumb + gap) - gap, H = pad * 2 + headH + rows.length * (th + gap) - gap;
  const cell = (row, direction) => {
    const c = cells.get(`${direction}/${row.design.kind}-${row.variant}`);
    if (c?.file) return `<img width="${thumb}" height="${th}" src="data:image/jpeg;base64,${fs.readFileSync(c.file).toString('base64')}" alt="">`;
    return `<div class="gap" style="width:${thumb}px;height:${th}px">${c?.error ? `<b>refused</b><br>${esc(c.error.slice(0, 220))}` : 'no variant'}</div>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#ececea;font:15px/1.3 system-ui,-apple-system,sans-serif;color:#222;width:${W}px;height:${H}px;padding:${pad}px}
    .g{display:grid;grid-template-columns:${labelW}px repeat(${directions.length},${thumb}px);gap:${gap}px;align-items:start}
    .h{height:${headH - gap}px;font-weight:700;font-size:20px;letter-spacing:.04em;text-transform:uppercase;padding-top:14px}
    .r{padding-top:6px;font-size:15px}.r b{display:block;font-size:18px;text-transform:capitalize}
    img{display:block;box-shadow:0 1px 6px rgba(0,0,0,.25)}.gap{background:#dcdcd8;color:#666;padding:16px;font-size:13px;border:1px dashed #aaa;overflow:hidden}
  </style><div class="g"><div></div>${directions.map((d) => `<div class="h">${esc(d)}</div>`).join('')}${rows.map((row) => `<div class="r"><b>${esc(row.design.kind)}</b>variant ${row.variant}</div>${directions.map((d) => cell(row, d)).join('')}`).join('')}</div>`;
  const page = await browser.page(W, H);
  try {
    await page.setContent(html);
    await page.evaluate('Promise.all([...document.images].map((i) => i.decode().catch(() => null)))');
    const sheet = path.join(outRoot, 'sheet.jpg');
    fs.writeFileSync(sheet, await page.screenshotJpeg(90));
    console.log(`\nsheet: ${path.relative(ROOT, sheet)} (${W} x ${H}); pages in ${path.relative(ROOT, outRoot)}/<direction>/<kind>-<variant>.jpg; ${failed ? `${failed} refused` : 'none refused'}`);
  } finally { await page.close(); }
} finally { browser.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); }
process.exit(failed ? 3 : 0);
