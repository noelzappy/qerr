// Renders ONE post's "design" block, for the web app's render job: validate, name the files, brand lint, one Chrome behind
// the lock file, check every image, a PDF for a carousel. It returns data instead of printing. Nothing here writes a batch
// file or fills in a media field.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './core.mjs';
import { loadBrand, loadDirection, loadLook, loadSeries } from './design/brand.mjs';
import { stemOf } from './design/batch.mjs';
import { Browser, NO_CHROME, findChrome } from './design/chrome.mjs';
import { detectConverter } from './design/convert.mjs';
import { lintText, textFieldsOf } from './design/lint.mjs';
import { DesignError, renderImage, renderPdf } from './design/render.mjs';
import { normaliseDesign, outputFiles, pdfFile } from './design/spec.mjs';
import { postCompositionDevice, postCompositionGraphics } from './design/directions/index.mjs';
import { usesPostTemplate } from './design/post-spec.mjs';
import { loadLayouts, normalisePostDesign, postDesignProblems, usesLayouts } from './design/layout.mjs';

// Every problem with a design block, as the batch validator would list them. No Chrome needed.
// A { template: "layout" } block, or a carousel page of that kind, is checked against the layout it names: one of `layouts` when
// given (a preview of layouts that are not saved yet), else one of the brand's (brand.json "layouts").
export function designBlockProblems(design, { root = ROOT, layouts } = {}) {
  const series = loadSeries({ root });
  // A `post` design needs the brand's design direction (style.direction); it is only looked up for one.
  // When the direction is a look written as data (brand.looks), the post is held to that look's compositions and budgets (its brief).
  // A carousel of post pages is held to the same: each page is a post.
  const post = usesPostTemplate(design);
  const direction = post ? loadDirection({ root }) : undefined;
  const look = post ? loadLook({ root }) ?? undefined : undefined;
  const errors = postDesignProblems(design, 'design', { series, direction, look, layouts: usesLayouts(design) ? layouts ?? loadLayouts({ root }) : [] });
  if (design?.template === 'pagecover') errors.push('design: page-cover makes profile and cover images, not post images, so it cannot be used in a batch');
  return errors;
}

// The brand graphics each picture of a design block places: for a post, and each post page of a carousel, drawn with the brand's own look
// (brand.looks named by style.direction), the composition the renderer will choose for it and the vault ids its graphic elements name.
// -> [{ page: null (the post) | index from 0 (a carousel page), kind, variant, name, refs }], only the pictures that place a graphic.
// Empty for a code direction, a classic layout, or a design that cannot be drawn (rendering it says why). No Chrome; reads only brand.json.
export function designGraphicNeeds(design, { root = ROOT } = {}) {
  if (!usesPostTemplate(design)) return [];
  const look = loadLook({ root });
  if (!look) return [];
  let spec;
  try { spec = normaliseDesign(design); } catch { return []; }
  const pictures = spec.template === 'carousel' && Array.isArray(spec.pages) ? spec.pages.map((p, i) => [i, p]) : [[null, spec]];
  const out = [];
  for (const [page, s] of pictures) {
    if (!s || s.template !== 'post') continue;
    const c = postCompositionGraphics(look, s);
    if (c?.refs.length) out.push({ page, ...c });
  }
  return out;
}

// The device each picture of a design block is drawn on with the brand's own look: for a post, and each post page of a carousel, the composition the
// renderer will choose and the device it draws round its picture. -> [{ page: null | index from 0, kind, variant, name, device: 'phone' | 'tablet' }],
// only the pictures drawn on a device. The app uses it to say, before any render, that a desktop screenshot cannot go on a phone. No Chrome.
export function designScreenNeeds(design, { root = ROOT } = {}) {
  if (!usesPostTemplate(design)) return [];
  const look = loadLook({ root });
  if (!look) return [];
  let spec;
  try { spec = normaliseDesign(design); } catch { return []; }
  const pictures = spec.template === 'carousel' && Array.isArray(spec.pages) ? spec.pages.map((p, i) => [i, p]) : [[null, spec]];
  const out = [];
  for (const [page, s] of pictures) {
    if (!s || s.template !== 'post' || typeof s.image !== 'string') continue;
    const c = postCompositionDevice(look, s);
    if (c?.device) out.push({ page, ...c });
  }
  return out;
}

const brandWarnings =(spec, brand) => [...new Set(spec.sizes.flatMap((s) => lintText(textFieldsOf(spec), s, brand)))];

// -> { ok, files: [{ size, slide, file, abs, w, h }], warnings, notes, pdf?, error? }
// `only` limits the sizes rendered (a list of size names). `outDir` is resolved against root; `stem` overrides the file name stem.
// `layouts` replaces the brand's layouts for this render (the layout editor's preview). `slides` limits a carousel's pages
// rendered (a list of page indexes, from 0: the layout editor's preview of one page of a carousel).
// `folio` ({ n, total }): the post's place in its batch, shown in a look's folio cell; without it a single post has no folio.
// `png` (tests only: the template baseline harness, testlib/template-baseline.mjs) writes lossless PNG files instead of JPEGs,
// so that a pixel comparison sees real differences and not the JPEG encoder's noise. Posts are always JPEGs.
export async function renderDesignBlock({ root = ROOT, design, postId, outDir, stem, only, slides, layouts, png = false, folio, log = () => {} } = {}) {
  const fail = (error, extra = {}) => ({ ok: false, files: [], warnings: [], notes: [], error, ...extra });
  let spec, brand;
  try {
    const problems = designBlockProblems(design, { root, layouts });
    if (problems.length) return fail(problems.join('; '));
    if (!outDir) return fail('outDir is required');
    brand = loadBrand({ root });
    if (layouts) brand = { ...brand, layouts };
    spec = normalisePostDesign(design, brand.layouts);
  } catch (e) {
    if (e instanceof DesignError) return fail(e.message);
    throw e;
  }
  const name = stem ?? stemOf({ id: String(postId ?? 'post') }, spec);
  const dir = path.resolve(root, outDir);
  const ext = png ? '.png' : '.jpg';
  let files = outputFiles(spec, { stem: name, ext });
  if (only?.length) {
    files = files.filter((f) => only.includes(f.size));
    if (!files.length) return fail(`none of the sizes ${only.join(', ')} is in this design (it makes ${spec.sizes.join(', ')})`);
  }
  if (slides?.length) {
    files = files.filter((f) => f.slide !== null && slides.includes(f.slide));
    if (!files.length) return fail(`none of the pages ${slides.map((i) => i + 1).join(', ')} is in this design`);
  }
  const warnings = brandWarnings(spec, brand);
  // A brand without a dot map (the usual case for a brand set up in the web app) still gets its closing page: the map is left
  // off and the post carries a warning, instead of the whole post failing.
  if (!brand.map) {
    const pages = spec.template === 'carousel' ? spec.pages : [spec];
    if (pages.some((p) => p?.map)) {
      for (const p of pages) if (p?.map) p.map = false;
      warnings.push('this brand has no dot map, so the map was left off the closing page (add one in Settings, Brand and look, Advanced)');
    }
  }
  const notes = [];
  const chrome = findChrome();
  if (!chrome) return fail(NO_CHROME, { warnings });
  const converter = detectConverter();
  const tmpDir = path.join(root, 'out', 'design-tmp');
  let browser;
  try {
    browser = await Browser.launch({ chromePath: chrome });
  } catch (e) {
    return fail(e.message, { warnings });
  }
  const stop = () => browser.close();
  process.once('exit', stop);
  const made = [];
  let pdf;
  try {
    for (const f of files) {
      const abs = path.join(dir, f.file);
      const carousel = spec.template === 'carousel';
      const imageSpec = carousel ? { ...spec.pages[f.slide], sizes: spec.sizes } : spec;
      const counter = carousel ? { n: f.slide + 1, total: spec.pages.length } : undefined;
      try {
        const r = await renderImage(browser, brand, { spec: imageSpec, sizeName: f.size, outFile: abs, counter, ...(!carousel && folio ? { folio } : {}) }, { tmpDir, converter });
        made.push({ size: f.size, slide: f.slide, file: f.file, abs, w: r.w, h: r.h });
        warnings.push(...r.warnings.map((w) => `${f.file}: ${w}`));
        notes.push(...r.notes.map((n) => `${f.file}: ${n}`));
        log(`ok ${f.file} ${r.w}x${r.h}`);
      } catch (e) {
        if (!(e instanceof DesignError)) throw e;
        return fail(`${f.file}: ${e.message}`, { files: made, warnings, notes });
      }
    }
    // A carousel's PDF is made only when every size of it was rendered (not when `only` cut some out).
    if (spec.template === 'carousel' && made.length === outputFiles(spec, { stem: name, ext }).length) {
      const abs = path.join(dir, pdfFile(name));
      try {
        const r = await renderPdf(browser, made.map((m) => m.abs), abs);
        pdf = { file: pdfFile(name), abs, pages: r.pages };
        warnings.push(...r.warnings.map((w) => `${pdfFile(name)}: ${w}`));
      } catch (e) {
        if (!(e instanceof DesignError)) throw e;
        return fail(`${pdfFile(name)}: ${e.message}`, { files: made, warnings, notes });
      }
    }
  } finally {
    stop();
    process.removeListener('exit', stop);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return { ok: true, files: made, warnings, notes, ...(pdf ? { pdf } : {}) };
}
