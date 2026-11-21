// `npm run design -- ...` (also `npm run buffer -- design ...`): make the post images.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, writeJson } from '../core.mjs';
import { BatchError, validateBatch } from '../batch.mjs';
import { loadBrand, loadSeries } from './brand.mjs';
import { Browser, NO_CHROME, findChrome } from './chrome.mjs';
import { detectConverter } from './convert.mjs';
import { parseDesignArgs, specFromFlags } from './flags.mjs';
import { lintText, textFieldsOf } from './lint.mjs';
import { DesignError, renderImage, renderPdf } from './render.mjs';
import { applyFills, planBatchDesign } from './batch.mjs';
import { SIZE_NAMES } from './sizes.mjs';
import { PAGE_TEMPLATES, TEMPLATES, normaliseDesign, outputFiles, pdfFile, slugify, validateDesign } from './spec.mjs';

export const DESIGN_USAGE = `Makes finished, on-brand post images (JPG or PNG) with headless Google Chrome.

Usage:
  npm run design -- object   --image <photo> --headline <text> [--sub <text>] [--ground mint|gold-pale|tint|white|ink|deep|photo]
                           [--align left|center] [--size 76|88|104|120] [--photo-top <px>] [--focal "60% 40%"] [--zoom <1-3>]
                           (one styled object photo filling the lower part of the page, bleeding off the bottom)
  npm run design -- number   --big <text> [--line <text>] [--stat "number|label" ...] [--image <photo>] [--ground ...]
  npm run design -- product  --image <framed phone> --headline <text> [--sub <text>] [--layout center|side] [--ground ...]
                           [--phone-top <px>] [--no-glow]   (a website framed phone, large, on a pale ground)
  npm run design -- myth-fact --myth <text> --fact-lead <text> [--fact <text>]   (colour-blocked slabs on a dark ground)
  npm run design -- closing  [--headline <text>] [--line <text>] [--map]
  npm run design -- cover    --image <file> --headline <text> [--sub <text>] [--series <key>] [--label <text>] [--focal "60% 40%"] [--zoom <1-3>]
  npm run design -- text     --headline <text> [--sub <text>]  (an artefact needs --spec)
  npm run design -- ledger | passbook                    --spec <file.json>     (tables and sheets are written in a JSON file)
  npm run design -- stats    --big <text> [--line <text>] [--stat "number|label" ...] [--image <file>]        (up to 3 stats)
  npm run design -- screen   --image <screen> --headline <text> [--sub <text>]
                           [--device phone|desktop] [--framed] [--title <text>] [--tilt] [--region <0.4-1>]
                           (a phone is a pre-framed phone capture, shown as it is; a desktop screenshot gets the website's window)
  npm run design -- photo-story --image <file> --headline <text> [--sub <text>] [--layout panel|print]
  npm run design -- photo    --image <file> --headline <text> [--sub <text>] [--eyebrow <text>] [--focal "60% 40%"]
                           [--text-at top|bottom] [--scrim black|none] [--scrim-peak <0-0.65>] [--no-lines]
  npm run design -- carousel --spec <file.json>        (2 to 10 pages; writes one image per page and a PDF of them)
  npm run design -- page-cover --kind profile|facebook|linkedin|x --out <file>
  npm run design -- render <batch.json> [--only <postId>] [--out-dir <dir>] [--no-write]
  npm run design -- lint <batch.json>
  npm run design -- help | --help | -h
  (the same commands work as: npm run buffer -- design <command> ...)

The poster pages (object, number, product, myth-fact, closing) are the launch look: one real image per post, a large two-tone
  headline, a small logo and the website only. Never a figure caption. A photo with a plain background (a studio shot) becomes the page
  colour, exactly, and runs into it; any other photo is placed as a full-bleed band (edge to edge, no radius, no shadow) on the ground (--ground photo: the series' or mint).
Page options (the earlier editorial templates): --series <key from the brand's brand.json> or --label <text>, --ground
  white|tint|mint|gold-pale|ink|deep, --accent muted|colour|weight, --head-right <text>, --no-dots; --map the brand's dot map (map.json).
  A phone screen floats on a soft glow (--no-glow removes it); --fade puts the text on top and fades the phone out at the foot;
  --pill <text> and --check <text> (up to 4 each) add the website's outlined pills and check list under its sub line.
  The editorial templates are 1080x1350 only (the default size, feed).

Output:
  --out <file.jpg|file.png>   exact file (one image), or with several sizes the size is added to the name
  --out <folder>              a folder; file names are made from --name or the headline
  --name <stem>               file name without extension (default: from the headline)
  --sizes feed,wide,story     photo posts only: feed 1080x1350 (default), wide 1200x675, story 1080x1920, square 1080x1080
  --spec <file.json>          read the post from a JSON file instead of flags (flags --sizes and --name still apply)
  --strict                    exit 1 when there are warnings too

Text: a backslash-n in a flag is a line break; *words in asterisks* are the headline's continuation, in the muted grey of the
website's two-tone headings (or a colour or a lighter weight, set per series; gold on photo posts). Spell the brand as brand.json says; no emoji.

Commands:
  cover, text, ledger, passbook, myth-fact, stats, screen, photo-story, closing, photo, carousel, page-cover
           Render one post from flags or a spec file. A carousel also writes <name>.pdf next to its images.
  render   Render every post that has a "design" block in the batch into the batch's mediaRoot (or --out-dir). Fills in
           "media" where the post has none (never changes one that is set), unless --no-write or --out-dir is used.
  lint     Check the text of every design block against the brand rules. No Chrome needed.

Needs Google Chrome (set CHROME_PATH if it is not in the usual place). JPG conversion uses sips (macOS) or ffmpeg when
present, otherwise Chrome itself. Images are checked as they are made: contrast, enlargement, text that does not fit, objects
that overlap or leave the page.`;

const SINGLE = Object.fromEntries([...PAGE_TEMPLATES, 'photo', 'carousel'].map((t) => [t, t]).concat([['page-cover', 'pagecover']]));

const rel = (p, root) => path.relative(root, p) || p;
const brandLint = (spec, brand) => (spec.template === 'pagecover' ? [] : [...new Set((spec.sizes ?? []).flatMap((s) => lintText(textFieldsOf(spec), s, brand)))]);

// The spec of one image of a job (carousel: one page) and its page counter.
function imageSpec(spec, f) {
  if (spec.template !== 'carousel') return { spec, counter: undefined };
  return { spec: { ...spec.pages[f.slide], sizes: spec.sizes }, counter: { n: f.slide + 1, total: spec.pages.length } };
}

async function renderJobs(jobs, { root, log, quiet }) {
  const brand = loadBrand({ root });
  const chrome = findChrome();
  if (!chrome) throw new Error(NO_CHROME);
  const converter = detectConverter();
  const tmpDir = path.join(root, 'out', 'design-tmp');
  const results = [], pdfs = [];
  const browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(root, 'out', 'design.lock') });
  const stop = () => browser.close();
  process.once('exit', stop);
  try {
    for (const job of jobs) {
      for (const f of job.files) {
        const outFile = path.join(job.dir, f.file);
        const { spec, counter } = imageSpec(job.spec, f);
        try {
          const r = await renderImage(browser, brand, { spec, sizeName: f.size, outFile, counter }, { tmpDir, converter });
          results.push({ job, f, ok: true, ...r });
          if (!quiet) {
            log(`  ok   ${rel(outFile, root)}  ${r.w}x${r.h}`);
            const lowest = Object.entries(r.ratios ?? {}).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
            if (lowest) log(`       lowest contrast: ${lowest}`);
            for (const n of r.notes) log(`       note: ${n}`);
            for (const w of r.warnings) log(`       WARN: ${w}`);
          }
        } catch (e) {
          if (!(e instanceof DesignError)) throw e;
          results.push({ job, f, ok: false, error: e.message, warnings: [], notes: [] });
          log(`  FAIL ${rel(outFile, root)}\n       ${e.message}`);
        }
      }
      // A carousel also gets a PDF of its pages (for LinkedIn documents), only when every page was made.
      const mine = results.filter((r) => r.job === job);
      if (job.pdf && mine.length && mine.every((r) => r.ok)) {
        const file = path.join(job.dir, job.pdf);
        try {
          const r = await renderPdf(browser, mine.map((x) => x.file), file);
          pdfs.push(r);
          if (!quiet) { log(`  ok   ${rel(file, root)}  PDF, ${r.pages} pages`); for (const w of r.warnings) log(`       WARN: ${w}`); }
          results.push({ job, f: { size: 'pdf', slide: null, file: job.pdf }, ok: true, file, warnings: r.warnings, notes: [], pdf: true });
        } catch (e) {
          if (!(e instanceof DesignError)) throw e;
          results.push({ job, f: { size: 'pdf', slide: null, file: job.pdf }, ok: false, error: e.message, warnings: [], notes: [] });
          log(`  FAIL ${rel(file, root)}\n       ${e.message}`);
        }
      }
    }
  } finally {
    stop();
    process.removeListener('exit', stop);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return { results, converter, pdfs };
}

function summarise(results, converter, log, strict, extraWarnings = 0, pdfs = []) {
  const ok = results.filter((r) => r.ok && !r.pdf).length, failed = results.filter((r) => !r.ok).length;
  const warns = results.reduce((n, r) => n + r.warnings.length, 0) + extraWarnings;
  log(`\n${ok} image(s) made${pdfs.length ? `, ${pdfs.length} PDF(s) written` : ''}, ${failed} failed, ${warns} warning(s). JPG conversion: ${converter ? converter.name : 'Chrome (no sips or ffmpeg found)'}.`);
  return failed || (strict && warns) ? 1 : 0;
}

async function runSingle(template, flags, { root, log }) {
  const raw = specFromFlags(template, flags);
  if (template === 'pagecover') {
    const errs = validateDesign(raw, 'page-cover');
    if (errs.length) throw new BatchError(errs);
    if (!flags.out) throw new Error('page-cover needs --out <file>');
    const ext = ['.jpg', '.jpeg', '.png'].includes(path.extname(flags.out).toLowerCase()) ? '' : '.jpg';
    const file = path.resolve(root, flags.out + ext);
    const job = { postId: 'page-cover', spec: raw, dir: path.dirname(file), files: [{ size: raw.kind, slide: null, file: path.basename(file) }] };
    const { results, converter } = await renderJobs([job], { root, log });
    return summarise(results, converter, log, flags.strict);
  }
  const errs = validateDesign(raw, template, { series: loadSeries({ root }) });
  if (errs.length) throw new BatchError(errs);
  const spec = normaliseDesign(raw);
  const brand = loadBrand({ root });
  const warnings = brandLint(spec, brand);
  warnings.forEach((w) => log(`WARN: ${w}`));
  const out = flags.out;
  const hasExt = out && ['.jpg', '.jpeg', '.png'].includes(path.extname(out).toLowerCase());
  const first = spec.pages?.[0] ?? spec;
  const base = spec.name ?? (hasExt ? path.basename(out, path.extname(out)) : slugify(first.headline ?? first.big ?? first.myth ?? path.basename(first.image ?? 'post', path.extname(first.image ?? ''))));
  const ext = hasExt ? path.extname(out).toLowerCase() : '.jpg';
  const dir = path.resolve(root, hasExt ? path.dirname(out) : out ?? path.join('media', 'design'));
  let files = outputFiles(spec, { stem: base, ext });
  if (hasExt && files.length === 1 && spec.template !== 'carousel') files = [{ ...files[0], file: path.basename(out) }];
  const { results, converter, pdfs } = await renderJobs([{ postId: base, spec, dir, files, pdf: spec.template === 'carousel' ? pdfFile(base) : undefined }], { root, log });
  return summarise(results, converter, log, flags.strict, warnings.length, pdfs);
}

async function runBatchRender(file, flags, { root, log }) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new BatchError([`file not found: ${file}`]);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { throw new BatchError([`${file} is not valid JSON: ${e.message}`]); }
  const { errors } = validateBatch(raw, { fallbackName: path.basename(abs, '.json'), root });
  if (errors.length) throw new BatchError(errors);
  if (flags.only && !raw.posts.some((p) => p.id === flags.only)) throw new Error(`no post with id "${flags.only}" in this batch`);
  const { jobs, fills, warnings } = planBatchDesign(raw, { root, only: flags.only, outDir: flags['out-dir'] });
  if (!jobs.length) { log('No post in this batch has a "design" block, so nothing to render.'); return 0; }
  const brand = loadBrand({ root });
  let lintCount = 0;
  for (const j of jobs) for (const w of brandLint(j.spec, brand)) { log(`WARN: post ${j.postId}: ${w}`); lintCount++; }
  for (const w of warnings) { log(`WARN: ${w}`); lintCount++; }
  log(`Rendering ${jobs.reduce((n, j) => n + j.files.length, 0)} image(s) for ${jobs.length} post(s) into ${rel(jobs[0].dir, root)}`);
  const { results, converter, pdfs } = await renderJobs(jobs, { root, log });
  const done = new Set(jobs.filter((j) => results.filter((r) => r.job === j).every((r) => r.ok)).map((j) => j.postId));
  const todo = fills.filter((f) => done.has(f.postId));
  if (todo.length && !flags['out-dir'] && !flags['no-write']) {
    writeJson(abs, applyFills(raw, todo));
    for (const f of todo) log(`Filled in media for ${f.postId}: ${[...(f.media ?? []), ...Object.entries(f.networks ?? {}).map(([n, l]) => `${n}: ${l.join(', ')}`)].join(' | ')}`);
  } else if (todo.length) log(`Media fields were not written (${flags['out-dir'] ? '--out-dir' : '--no-write'}).`);
  return summarise(results, converter, log, flags.strict, lintCount, pdfs);
}

function runLint(file, { root, log }) {
  const raw = readJson(path.resolve(file), null);
  if (!raw) throw new BatchError([`file not found: ${file}`]);
  const { errors } = validateBatch(raw, { fallbackName: 'batch', root });
  if (errors.length) throw new BatchError(errors);
  const brand = loadBrand({ root });
  const { jobs } = planBatchDesign(raw, { root });
  let n = 0;
  for (const j of jobs) for (const w of brandLint(j.spec, brand)) { log(`WARN: post ${j.postId}: ${w}`); n++; }
  log(`${jobs.length} design block(s) checked, ${n} warning(s).`);
  return 0;
}

export async function runDesign(argv, { root = ROOT, log = console.log } = {}) {
  const [cmd, ...rest] = argv;
  if (!cmd || ['help', '--help', '-h'].includes(cmd)) { log(DESIGN_USAGE); return 0; }
  const { flags, pos, errors } = parseDesignArgs(rest);
  if (errors.length) { log(`${errors.join('\n')}\n\n${DESIGN_USAGE}`); return 1; }
  if (SINGLE[cmd]) return runSingle(SINGLE[cmd], flags, { root, log });
  if (cmd === 'render' && pos[0]) return runBatchRender(pos[0], flags, { root, log });
  if (cmd === 'lint' && pos[0]) return runLint(pos[0], { root, log });
  log(DESIGN_USAGE);
  return 1;
}

export { TEMPLATES, SIZE_NAMES };
