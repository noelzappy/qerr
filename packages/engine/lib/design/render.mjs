// Renders one image: builds the page, lets Chrome lay it out, then checks it (fit, contrast, upscaling, pixel size) before saving.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { TEMPLATE_FNS } from '../../design/templates/index.mjs';
import { buildPage, buildPrintPage } from './page.mjs';
import { COVER_SIZES, SIZES } from './sizes.mjs';
import { forSize } from './spec.mjs';
import { SCALABLE, autoLines, contrastRatio, explainProblems, findLayoutProblems, imageSize, linesToSvg, luminance, upscaleWarning } from './checks.mjs';
import { convertToJpeg } from './convert.mjs';
import { hasAlpha, readImageBytes, sniff } from './assets.mjs';
import { DesignError } from './errors.mjs';
import { pdfPages, snapMediaBox } from './pdf.mjs';
import { findLayout, layoutUsesPhone } from './layout.mjs';
import { layoutFit, renderLayout } from './layout-render.mjs';

export { DesignError };

// Which contrast target a text role has. Photo posts use brand.photo.minContrast (text over a picture, scrim raised to reach it);
// everything else sits on a flat surface and uses brand.contrast: headline and the ink on a sheet 7:1, body 7:1, labels and accents 4.5:1.
const PHOTO_KEY = { headline: 'headline', stat: 'headline', sub: 'sub', statlabel: 'sub', eyebrow: 'eyebrow', url: 'url' };
const EDITORIAL_KEY = { headline: 'headline', stat: 'headline', accent: 'accent', sub: 'sub', statlabel: 'sub', label: 'label', foot: 'label', url: 'label', art: 'art', artbody: 'artbody' };
const WORD = { url: 'website', foot: 'footer label', art: 'artefact label', artbody: 'artefact text', label: 'label' };
const MIN_SCALE = 0.62;
const PUSHED = new Set(['panel', 'outside', 'avoid']);
const parseRgb = (c) => { const m = c.match(/[\d.]+/g).map(Number); return luminance(m[0], m[1], m[2]); };

// A phone screen is always a pre-framed capture: the tool never draws a phone around a plain screenshot.
const isPhoneScreen = (spec, layout) => (spec.template === 'screen' && (spec.device ?? 'phone') === 'phone') || spec.template === 'product' || (layout ? layoutUsesPhone(layout) : false);
const unframedPhone = (file, why) => `screen: "${file}" is not a pre-framed phone capture (${why}). Use a pre-framed phone capture: a transparent PNG or WebP with the phone already drawn around the screen, like the website's public/screens/<name>-phone-660.webp (see design/assets/screens/SOURCES.md). The tool does not draw phones. For a desktop screenshot use "device": "desktop".`;

// The page of one image before Chrome sees it: the size, the spec for that size, the layout it is drawn from (if any) and the
// template's output { body, bodyClass, bodyAttrs, sheet?, warnings? }. Pictures are read and checked here. No Chrome; the
// template baseline harness (testlib/template-baseline.mjs) compares this markup between two versions of the code.
// job: { spec (one image: template + fields), sizeName, counter?, layouts? }. A { template: "layout" } spec is drawn from
// the layout it names: one of job.layouts (a preview of layouts not saved yet), else of the brand's own (brand.json "layouts").
export function preparePage(brand, job) {
  const { sizeName } = job;
  const S = SIZES[sizeName] ?? COVER_SIZES[sizeName];
  const spec = forSize(job.spec, sizeName);
  const layouts = job.layouts ?? brand.layouts;
  let layout = null;
  if (spec.template === 'layout') {
    try { layout = findLayout(spec.layout, layouts); } catch (err) { throw new DesignError(err.message); }
    if (!layout.canvas[sizeName]) throw new DesignError(`layout "${layout.id}" has no ${sizeName} size`);
  }
  const tpl = layout ? renderLayout : TEMPLATE_FNS[spec.template];
  // Pictures are read and checked here, once, and embedded; templates only ever see the resulting data: URIs.
  const images = new Map(), dims = new Map();
  if (spec.image !== undefined) {
    const { type, buf } = readImageBytes(spec.image, { root: brand.root });
    if (isPhoneScreen(spec, layout) && hasAlpha(buf) === false) throw new DesignError(unframedPhone(spec.image, 'it has no transparency, so it is a plain screenshot'));
    images.set(spec.image, `data:${type};base64,${buf.toString('base64')}`);
    dims.set(spec.image, imageSize(buf));
  }
  const out = tpl(spec, { size: S, brand, counter: job.counter, layouts, image: (p) => images.get(p) ?? (() => { throw new DesignError(`image not loaded: ${p}`); })(), imageSize: (p) => dims.get(p) ?? null });
  return { S, spec, layout, out };
}

// job: { spec, sizeName, outFile, counter?, layouts? } (see preparePage).
export async function renderImage(browser, brand, job, { tmpDir, converter, quality = 92, log = () => {} } = {}) {
  const { sizeName, outFile } = job;
  const { S, spec, layout, out } = preparePage(brand, job);
  const warnings = [], notes = [];
  const html = buildPage({ brand, size: S, ...out });
  const isPhoto = spec.template === 'photo';
  const THRESHOLD_KEY = isPhoto ? PHOTO_KEY : EDITORIAL_KEY;
  const need = (key) => (isPhoto ? brand.photo.minContrast[key] : brand.contrast[key]);
  warnings.push(...(out.warnings ?? []));
  // The editorial pages keep the reference margins (70 px, a few px of optical overhang on the headline); a layout keeps its own.
  const Sfit = layout ? layoutFit(layout, sizeName) : isPhoto || COVER_SIZES[sizeName] ? S : { ...S, pad: 62, top: 46 };
  fs.mkdirSync(tmpDir, { recursive: true });
  const page = await browser.page(S.w, S.h);
  try {
    await page.setContent(html);
    const ready = await page.evaluate('window.__ds.ready()');
    if (ready.broken.length) throw new DesignError(`image could not be loaded: ${ready.broken.join(', ')} (is the path right, and is it a valid image?)`);
    if (ready.unframed.length) throw new DesignError(unframedPhone(ready.unframed[0], 'its corners are not transparent, so it is a screenshot without a phone around it'));
    for (const s of ready.sampled ?? []) {
      notes.push(s.uniform
        ? `photo background is plain (rgb(${s.rgb.join(', ')}), drift ${s.drift.toFixed(1)}): the page takes its colour and the photo runs into it`
        : `photo background is not plain (grain ${s.grain.toFixed(1)}, edge drift ${s.drift.toFixed(1)}, sides ${s.shift.toFixed(1)}): the photo is placed as a full-bleed band`);
    }
    if (!ready.fontOk) warnings.push(`the ${brand.font.family} font did not load; the text uses a fallback font`);
    let peak = 0;
    if (isPhoto && spec.scrim !== 'none') peak = spec.scrimPeak ?? brand.photo.scrimStart;
    if (isPhoto) await page.evaluate(`window.__ds.setScrim(${Number(peak) || 0})`);

    // 1. Fit: shrink headlines and big numbers step by step; anything else that overflows is the owner's text to shorten.
    // Long headlines start smaller (the brand sizes suit about 24 characters); the loop below shrinks further only if it must.
    const chars = [...String(spec.headline ?? spec.title ?? '').replace(/\*|\\n|\n/g, '')].length;
    const start = !(isPhoto || spec.template === 'pagecover') || chars <= 24 ? 1 : +Math.max(0.6, Math.sqrt(24 / chars)).toFixed(3);
    let scale = start, m, problems;
    if (start < 1) await page.evaluate(`window.__ds.setScale(${start})`);
    for (;;) {
      m = await page.evaluate('window.__ds.measure()');
      problems = findLayoutProblems(m, Sfit);
      if (!problems.length) break;
      // A smaller headline also helps text under it that runs into the panel, the footer or a picture: it moves up with it.
      const hasHeadline = m.roles.some((r) => r.role === 'headline' && r.rects.length);
      const scalable = problems.some((p) => SCALABLE.has(p.role) || SCALABLE.has(p.other) || (hasHeadline && PUSHED.has(p.kind)));
      if (!scalable || scale <= MIN_SCALE) {
        const hl = m.roles.find((r) => r.role === 'headline')?.text.length;
        throw new DesignError(explainProblems(problems, sizeName, { headline: spec.headline ? String(spec.headline).replace(/\*|\\n/g, '').length : hl }));
      }
      scale = +(scale * 0.93).toFixed(3);
      await page.evaluate(`window.__ds.setScale(${scale})`);
    }
    if (scale < 1) notes.push(`headline set at ${Math.round(scale * 100)}% of the brand size to fit`);
    if (scale < 0.7) warnings.push(`the headline had to be shrunk to ${Math.round(scale * 100)}%; a shorter headline reads better`);

    // 2. Upscaling of supplied images.
    for (const im of m.imgs) {
      const w = upscaleWarning({ src: im.name, nw: im.nw, nh: im.nh, boxW: im.rw, boxH: im.rh, fit: im.fit, sizeName, max: brand.photo.maxUpscale });
      if (w) warnings.push(w);
    }

    // 3. Contrast, measured on the rendered pixels behind each text line (text hidden), raising the photo scrim first.
    let fade = 0, ratios = {};
    for (let round = 0; round < 12; round++) {
      m = await page.evaluate('window.__ds.measure()');
      const checked = m.roles.filter((r) => THRESHOLD_KEY[r.role] && r.rects.length);
      await page.evaluate('window.__ds.hide(true)');
      const png = await page.screenshotPng();
      await page.evaluate('window.__ds.hide(false)');
      const stats = await page.evaluate(`window.__ds.analyse(${JSON.stringify(png.toString('base64'))}, ${JSON.stringify(checked.map((r) => r.rects))})`);
      const failing = [];
      ratios = {};
      checked.forEach((r, i) => {
        if (!stats[i]) return;
        const tl = parseRgb(r.color);
        const ratio = contrastRatio(tl, tl >= 0.18 ? stats[i].p95 : stats[i].p05);
        const key = THRESHOLD_KEY[r.role];
        ratios[key] = Math.min(ratios[key] ?? Infinity, ratio);
        if (ratio < need(key)) failing.push({ role: r.role, key, ratio, need: need(key) });
      });
      const body = failing.filter((f) => f.key !== 'url');
      if (isPhoto && spec.scrim !== 'none' && body.length && peak < brand.photo.scrimCap - 1e-9) {
        peak = Math.min(brand.photo.scrimCap, +(peak + brand.photo.scrimStep).toFixed(3));
        await page.evaluate(`window.__ds.setScrim(${Number(peak) || 0})`);
        continue;
      }
      if (isPhoto && failing.some((f) => f.key === 'url') && fade < brand.photo.footerFadeCap - 1e-9) {
        fade = Math.min(brand.photo.footerFadeCap, +(fade + 0.1).toFixed(2));
        await page.evaluate(`window.__ds.setFootFade(${fade})`);
        continue;
      }
      for (const f of failing) warnings.push(`low contrast: the ${WORD[f.role] ?? f.key} text is ${f.ratio.toFixed(1)}:1 against the ${isPhoto ? 'picture' : 'surface'} behind it (needs ${f.need}:1)${isPhoto ? (spec.scrim === 'none' ? '; scrim is off' : '; the scrim is already at its cap, choose another photo or move the text to a calmer part with textAt/focal') : ''}`);
      break;
    }
    if (isPhoto && peak > (spec.scrimPeak ?? brand.photo.scrimStart) + 1e-9) notes.push(`scrim raised to ${peak.toFixed(2)} to reach the contrast targets`);
    if (fade > 0) notes.push(`footer fade ${fade.toFixed(2)} added so the website is readable`);

    // 4. Thin lines (photo posts): the lines given, or an automatic placement clear of the text.
    if (isPhoto && spec.linesResolved !== false && spec.linesResolved !== 'none') {
      m = await page.evaluate('window.__ds.measure()');
      let shapes = Array.isArray(spec.linesResolved) ? spec.linesResolved : null;
      if (!shapes) {
        const text = m.roles.filter((r) => ['headline', 'sub', 'eyebrow'].includes(r.role)).flatMap((r) => r.rects);
        const atTop = (spec.textAtResolved ?? 'top') === 'top';
        const u = text.reduce((a, r) => ({ y0: Math.min(a.y0, r.y0), y1: Math.max(a.y1, r.y1) }), { y0: Infinity, y1: -Infinity });
        const zone = atTop ? { y0: u.y1 + 30, y1: m.footer.y0 - 20 } : { y0: S.top + 10, y1: u.y0 - 30 };
        const res = autoLines({ W: S.w, H: S.h, avoid: [...text, m.footer], zone, seed: `${spec.headline}|${sizeName}` });
        shapes = res.shapes;
        if (res.note) warnings.push(res.note);
      }
      await page.evaluate(`window.__ds.setLines(${JSON.stringify(linesToSvg(shapes, S.w, S.h, brand.accents.gold))})`);
    }

    // 5. Save, and check the pixel size of what was written.
    const png = await page.screenshotPng();
    const size = imageSize(png);
    if (!size || size.w !== S.w || size.h !== S.h) throw new DesignError(`Chrome produced ${size ? `${size.w}x${size.h}` : 'an unreadable image'}, expected ${S.w}x${S.h}`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const ext = path.extname(outFile).toLowerCase();
    if (ext === '.png') fs.writeFileSync(outFile, png);
    else if (converter) {
      const t = path.join(tmpDir, `${crypto.randomBytes(6).toString('hex')}.png`);
      fs.writeFileSync(t, png);
      try { convertToJpeg(converter, t, outFile, quality); } finally { fs.rmSync(t, { force: true }); }
    } else fs.writeFileSync(outFile, await page.screenshotJpeg(quality));
    const written = imageSize(fs.readFileSync(outFile));
    if (!written || written.w !== S.w || written.h !== S.h) throw new DesignError(`the saved file is ${written ? `${written.w}x${written.h}` : 'unreadable'}, expected ${S.w}x${S.h}`);
    if (page.blocked.length) warnings.push(`the page tried to load ${page.blocked.length} outside resource(s), which were blocked (${page.blocked.join(', ')}); a template must not need the network`);
    return { file: outFile, w: S.w, h: S.h, warnings, notes, ratios };
  } finally {
    await page.close();
  }
}

// A 1080 x 1350 px page in points (1 px = 0.75 pt).
export const PDF_PT = { w: 810, h: 1012.5 };

// The PDF of a carousel: the finished images, one per page, each exactly 1080 x 1350 CSS px (810 x 1012.5 pt), zero margins, in the
// order given. The images are read back from the files just written and embedded as data: URIs in a print page that has the same
// restrictions as the post pages (no network, nothing but data: images), then Chrome prints that page over the open connection.
export async function renderPdf(browser, imageFiles, outFile) {
  const images = imageFiles.map((f) => {
    const buf = fs.readFileSync(f), type = sniff(buf);
    if (type !== 'image/png' && type !== 'image/jpeg') throw new DesignError(`cannot put ${path.basename(f)} in the PDF: it is not a PNG or JPG image`);
    return `data:${type};base64,${buf.toString('base64')}`;
  });
  const page = await browser.page(1080, 1350);
  try {
    await page.setContent(buildPrintPage({ images }));
    await page.evaluate('Promise.all([...document.images].map((i) => i.decode().catch(() => null)))');
    const printed = await page.pdf();
    if (page.blocked.length) throw new DesignError(`the PDF page tried to load outside resources (${page.blocked.join(', ')})`);
    // 1350 px is 1012.5 pt; Chrome prints 1013.04 pt. Fix the page box to the true size (see snapMediaBox).
    const { pdf } = snapMediaBox(printed, { width: PDF_PT.w, height: PDF_PT.h });
    const got = pdfPages(pdf);
    const warnings = [];
    if (got.length !== imageFiles.length) throw new DesignError(`the PDF has ${got.length} page(s) but there are ${imageFiles.length} images; nothing was written`);
    const off = got.find((g) => Math.abs(g.width - PDF_PT.w) > 0.01 || Math.abs(g.height - PDF_PT.h) > 0.01);
    if (off) warnings.push(`the PDF page size is ${off.width} x ${off.height} pt, not ${PDF_PT.w} x ${PDF_PT.h} (Chrome rounds the page size and the box could not be corrected)`);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, pdf);
    return { file: outFile, pages: imageFiles.length, bytes: pdf.length, warnings };
  } finally {
    await page.close();
  }
}
