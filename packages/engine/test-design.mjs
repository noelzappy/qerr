// node --test   (the design tool: no network, no dependencies; two tests render for real and need Google Chrome)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './lib/core.mjs';
import { validateBatch } from './lib/batch.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { applyFills, planBatchDesign, stemOf } from './lib/design/batch.mjs';
import { autoLines, arcPoints, contrastRatio, explainProblems, findLayoutProblems, imageSize, luminance, upscaleFactor, upscaleWarning, worstContrast } from './lib/design/checks.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import http from 'node:http';
import { buildPage } from './lib/design/page.mjs';
import { TEMPLATE_FNS } from './design/templates/index.mjs';
import { detectConverter } from './lib/design/convert.mjs';
import { parseDesignArgs, specFromFlags } from './lib/design/flags.mjs';
import { lintText } from './lib/design/lint.mjs';
import { runDesign } from './lib/design/cli.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { pngBytes } from './testlib/png.mjs';
import { focalToCss, normaliseDesign, outputFiles, parseStat, pdfFile, validateDesign } from './lib/design/spec.mjs';

const brand = loadBrand();
const photo = (extra = {}) => ({ template: 'photo', image: 'a.jpg', headline: 'Every euro, *on record.*', ...extra });

test('spec validation: every template, with the problems named', () => {
  assert.deepEqual(validateDesign(photo()), []);
  assert.deepEqual(validateDesign({ template: 'text', headline: 'Hi' }), []);
  assert.deepEqual(validateDesign({ template: 'stats', big: '14.8M+', stats: ['3,900+|members', ['400+', 'organisations']] }), []);
  assert.deepEqual(validateDesign({ template: 'screen', image: 's.png', headline: 'x' }), []);
  assert.match(validateDesign({ template: 'poster' })[0], /template must be one of/);
  const bad = validateDesign({ template: 'photo', headline: '', image: 'a.txt', sizes: ['huge'], focal: 'sideways', textAt: 'middle', scrim: 'green', scrimPeak: 0.9, lines: 5 }, 'post x');
  for (const frag of ['headline', 'image "a.txt"', 'sizes must be from', 'focal must look like', 'textAt must be', 'scrim must be', 'scrimPeak', 'lines must be']) assert.ok(bad.some((e) => e.includes(frag)), frag);
  assert.ok(validateDesign({ template: 'stats', big: '1', stats: ['no label here'] })[0].includes('number|label'));
  assert.ok(validateDesign({ template: 'stats', big: '1', stats: ['a|b', 'a|b', 'a|b', 'a|b'] })[0].includes('most is 3'));
  assert.ok(validateDesign({ template: 'screen', headline: 'x' }).some((e) => e.includes('image is required')));
  assert.ok(validateDesign({ template: 'carousel', pages: [{ template: 'text', headline: 'a' }] })[0].includes('2 to 10'));
  assert.ok(validateDesign({ template: 'carousel', pages: [{ template: 'text', headline: 'a' }, { template: 'cover', headline: 'b' }] }).some((e) => e.includes('page 2') && e.includes('image is required')));
  assert.ok(validateDesign({ template: 'text', headline: 'x'.repeat(300) })[0].includes('300 characters'));
  assert.ok(validateDesign(photo({ networkSizes: { linkedin: 'wide' } })).some((e) => e.includes('not in sizes')));
  assert.deepEqual(validateDesign(photo({ sizes: ['feed', 'wide'], networkSizes: { linkedin: 'wide' } })), []);
});

test('parseStat, focal points and normalising', () => {
  assert.deepEqual(parseStat('€ 14.8M+|processed'), ['€ 14.8M+', 'processed']);
  assert.deepEqual(parseStat(['3,900+', 'members']), ['3,900+', 'members']);
  assert.equal(parseStat('nolabel'), null);
  assert.equal(parseStat('|label'), null);
  assert.equal(focalToCss('60% 40%'), '60% 40%');
  assert.equal(focalToCss('center'), '50% 50%');
  assert.equal(focalToCss('left top'), '0% 0%');
  assert.equal(focalToCss({ x: 0.6, y: 0.4 }), '60% 40%');
  assert.equal(focalToCss('nowhere'), null);
  assert.equal(focalToCss(undefined), '50% 50%');
  const n = normaliseDesign({ template: 'screen', image: 's.png', headline: 'x' });
  assert.deepEqual(n.sizes, ['feed']);
});

test('flag parsing: values, repeats, booleans, line breaks and unknown flags', () => {
  const { flags, pos, errors } = parseDesignArgs(['--stat', 'a|b', '--stat', 'c|d', '--headline', 'One\\nTwo', '--no-lines', '--sizes', 'feed,wide', 'x.json']);
  assert.deepEqual(errors, []);
  assert.deepEqual(pos, ['x.json']);
  const spec = specFromFlags('photo', { ...flags, image: 'p.jpg', 'text-at': 'bottom', 'scrim-peak': '0.4', focal: '60% 40%' });
  assert.equal(spec.headline, 'One\nTwo');
  assert.deepEqual(spec.stats, ['a|b', 'c|d']);
  assert.equal(spec.lines, false);
  assert.equal(spec.sizes, 'feed,wide');
  assert.equal(spec.textAt, 'bottom');
  assert.equal(spec.scrimPeak, 0.4);
  assert.deepEqual(validateDesign({ ...spec, template: 'photo', stats: undefined }), []);
  const scr = parseDesignArgs(['--device', 'desktop', '--framed', '--title', 'Passbooks', '--tilt', '--region', '0.75', '--image', 'd.webp', '--headline', 'h']);
  assert.deepEqual(scr.errors, []);
  const desk = specFromFlags('screen', scr.flags);
  assert.deepEqual([desk.device, desk.framed, desk.title, desk.tilt, desk.region], ['desktop', true, 'Passbooks', true, 0.75]);
  assert.deepEqual(validateDesign(desk), []);
  const ph = parseDesignArgs(['--image', 'p.webp', '--headline', 'h', '--pill', 'Read-only by design', '--check', 'Two-person approval', '--check', 'Audited', '--fade', '--no-glow']);
  assert.deepEqual(ph.errors, []);
  const phs = specFromFlags('screen', ph.flags);
  assert.deepEqual([phs.pills, phs.checks, phs.fade, phs.glow], [['Read-only by design'], ['Two-person approval', 'Audited'], true, false]);
  assert.deepEqual(validateDesign(phs), []);
  const cl = specFromFlags('closing', parseDesignArgs(['--map', '--no-dots']).flags);
  assert.deepEqual([cl.map, cl.dots], [true, false]);
  assert.deepEqual(validateDesign(cl), []);
  const ob = parseDesignArgs(['--image', 'a.jpg', '--headline', 'h', '--ground', 'photo', '--align', 'center', '--size', '120', '--photo-top', '640']);
  assert.deepEqual(ob.errors, []);
  const obs = specFromFlags('object', ob.flags);
  assert.deepEqual([obs.ground, obs.align, obs.size, obs.photoTop], ['photo', 'center', 120, 640]);
  assert.deepEqual(validateDesign(obs), []);
  const pr = specFromFlags('product', parseDesignArgs(['--image', 'p.webp', '--headline', 'h', '--layout', 'side', '--phone-top', '400']).flags);
  assert.deepEqual([pr.layout, pr.phoneTop], ['side', 400]);
  assert.deepEqual(validateDesign(pr), []);
  // the silk ribbon and figure captions are gone (owner, 2026-11-20)
  assert.deepEqual(parseDesignArgs(['--silk']).errors, ['unknown flag --silk']);
  assert.deepEqual(parseDesignArgs(['--caption', 'Fig. x']).errors, ['unknown flag --caption']);
  assert.deepEqual(parseDesignArgs(['--status-fill', '#F0F0F4']).errors, ['unknown flag --status-fill']);
  assert.deepEqual(parseDesignArgs(['--bogus']).errors, ['unknown flag --bogus']);
  assert.deepEqual(parseDesignArgs(['--image']).errors, ['--image needs a value']);
  assert.deepEqual(parseDesignArgs(['--image', '--headline', 'x']).errors, ['--image needs a value']);
  assert.throws(() => specFromFlags('carousel', { spec: '/nonexistent/spec.json' }), /spec file not found/);
});

test('file naming: one image per size, per slide, and the stem rules', () => {
  const s = (o) => normaliseDesign({ template: 'photo', image: 'a.jpg', headline: 'x', ...o });
  assert.deepEqual(outputFiles(s({}), { stem: '01-x' }).map((f) => f.file), ['01-x-feed.jpg']);
  assert.deepEqual(outputFiles(s({ sizes: ['feed', 'wide', 'story'] }), { stem: 'p' }).map((f) => f.file), ['p-feed.jpg', 'p-wide.jpg', 'p-story.jpg']);
  const c = normaliseDesign({ template: 'carousel', pages: [{ template: 'text', headline: 'a' }, { template: 'closing' }] });
  assert.deepEqual(outputFiles(c, { stem: '04-pass' }).map((f) => f.file), ['04-pass-1.jpg', '04-pass-2.jpg']);
  assert.equal(pdfFile('04-pass'), '04-pass.pdf');
  assert.deepEqual(outputFiles(s({}), { stem: 'p', ext: '.png' }).map((f) => f.file), ['p-feed.png']);
  assert.equal(stemOf({ id: '06-field-agents' }, { name: '05-field-agents' }), '05-field-agents');
  assert.equal(stemOf({ id: 'Post_One' }, {}), 'post-one');
});

const rawBatch = (posts) => ({ name: 't', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/t', posts: posts.map((p, i) => ({ id: `0${i + 1}-p`, date: '2026-12-01', caption: 'Hello', ...p })) });

test('batch design block: media is filled in when absent and never overwritten when set', () => {
  const raw = rawBatch([
    { design: photo({ sizes: ['feed', 'wide'], networkSizes: { linkedin: 'wide' } }) },
    { media: ['hand-made.jpg'], design: photo() },
    { design: { template: 'carousel', pages: [{ template: 'text', headline: 'a' }, { template: 'closing' }] } },
    { caption: 'no design' },
  ]);
  assert.deepEqual(validateBatch(raw).errors, []);
  const plan = planBatchDesign(raw, { root: ROOT });
  assert.equal(plan.jobs.length, 3);
  assert.equal(plan.jobs[0].dir, path.join(ROOT, 'media', 't'));
  assert.deepEqual(plan.jobs[0].files.map((f) => f.file), ['01-p-feed.jpg', '01-p-wide.jpg']);
  assert.ok(plan.warnings.some((w) => w.includes('02-p') && w.includes('does not list')));
  const out = applyFills(raw, plan.fills);
  assert.deepEqual(out.posts[0].media, ['01-p-feed.jpg']);
  assert.deepEqual(out.posts[0].networks.linkedin.media, ['01-p-wide.jpg']);
  assert.deepEqual(out.posts[1].media, ['hand-made.jpg']);
  assert.deepEqual(out.posts[2].media, ['03-p-1.jpg', '03-p-2.jpg']);
  assert.equal(out.posts[3].media, undefined);
  assert.deepEqual(Object.keys(out.posts[0]).slice(0, 4), ['id', 'date', 'caption', 'media']);
  // applying twice, or after the owner set media, changes nothing
  assert.deepEqual(applyFills(out, planBatchDesign(out, { root: ROOT }).fills), out);
  const handSet = { ...raw, posts: raw.posts.map((p) => ({ ...p, media: p.media ?? ['mine.jpg'] })) };
  assert.deepEqual(applyFills(handSet, plan.fills).posts.map((p) => p.media), handSet.posts.map((p) => p.media));
  // --out-dir renders elsewhere; --only limits the posts
  assert.equal(planBatchDesign(raw, { root: ROOT, outDir: 'media/preview' }).jobs[0].dir, path.join(ROOT, 'media', 'preview'));
  assert.equal(planBatchDesign(raw, { root: ROOT, only: '03-p' }).jobs.length, 1);
});

test('batch validation reports design block errors, and pagecover is refused in a batch', () => {
  const r = validateBatch(rawBatch([{ design: { template: 'photo', headline: 'x' } }, { design: { template: 'pagecover', kind: 'x' } }]));
  assert.ok(r.errors.some((e) => e.includes('01-p: design') && e.includes('image is required')));
  assert.ok(r.errors.some((e) => e.includes('page-cover')));
});

test('upscale warning maths', () => {
  assert.equal(upscaleFactor({ nw: 800, nh: 600, boxW: 1080, boxH: 1350 }), 2.25);
  assert.equal(upscaleFactor({ nw: 2000, nh: 1500, boxW: 1080, boxH: 1350 }), 0.9);
  assert.equal(upscaleFactor({ nw: 500, nh: 1000, boxW: 400, boxH: 800, fit: 'width' }), 0.8);
  const warn = (nw, nh) => upscaleWarning({ src: 'a.jpg', nw, nh, boxW: 1080, boxH: 1350, fit: 'cover', sizeName: 'feed', max: 1.3 });
  assert.equal(warn(1100, 1100), null); // 1.23x is fine
  assert.equal(warn(1300, 1350), null); // exactly 1x
  assert.match(warn(1404, 1000), /1404x1000 px.*enlarged 1\.35x.*1080x1350 at feed/); // 1.35x is over the limit
  assert.match(warn(800, 600), /enlarged 2\.25x/);
  assert.match(warn(800, 600), /at least \d+ px wide/);
});

test('brand lint: the brand\'s spelling rules, emoji and length guidance', () => {
  const l = (text, field = 'headline', size = 'feed') => lintText([{ field, text }], size, brand);
  assert.deepEqual(l('Save together, *see every step.*'), []);
  assert.deepEqual(l('Acme Savings at acmesavings.example', 'sub'), []);
  assert.match(l('Welcome to Acme savings')[0], /"Acme savings" should be written "Acme Savings"/);
  assert.match(l('Meet Acme-savings')[0], /"Acme-savings" should be written "Acme Savings"/);
  assert.match(l('Meet ACME SAVINGS')[0], /Acme Savings/);
  assert.match(l('Saving together \u{1F389}')[0], /emoji/);
  assert.match(l('x'.repeat(80))[0], /80 characters before the grey continuation is long for feed \(guidance: up to 60\)/);
  // a two-tone headline: the statement against the headline guidance, the whole against the sub line's
  assert.deepEqual(l('Save together, see every step. *Group savings, goals and records in one place.*'), []);
  assert.match(l(`Short statement. *${'x'.repeat(100)}*`)[0], /characters is long for feed \(guidance: up to 110 with the continuation\)/);
  assert.match(lintText([{ field: 'pill 1', text: 'Ask Acmesavings' }], 'feed', brand)[0], /Acme Savings/);
  assert.equal(l('x'.repeat(55), 'headline', 'wide').length, 1); // wide guidance is shorter
  assert.deepEqual(l('x'.repeat(55), 'headline', 'story'), []);
  assert.deepEqual(l('Line one\\nLine *two*'), []);
});

test('contrast maths: WCAG ratios and worst-case against the pixels behind the text', () => {
  const white = luminance(255, 255, 255), black = luminance(0, 0, 0);
  assert.equal(contrastRatio(white, black), 21);
  assert.ok(Math.abs(contrastRatio(white, luminance(119, 119, 119)) - 4.48) < 0.05); // #777 on white is the classic 4.48
  const dark = Array(95).fill(luminance(20, 20, 20));
  assert.ok(worstContrast(white, dark) > 15);
  const mixed = [...Array(80).fill(luminance(20, 20, 20)), ...Array(20).fill(luminance(230, 230, 230))]; // a fifth of the area is bright
  assert.ok(worstContrast(white, mixed) < 1.3); // light text is judged against the bright part
  assert.ok(worstContrast(black, mixed) < 2); // and dark text against the dark part... dark text on 20,20,20 is poor
  assert.equal(worstContrast(white, []), Infinity);
});

test('thin lines: automatic placement keeps clear of the text and the footer, and is deterministic', () => {
  const S = SIZES.feed;
  const text = [{ x0: 72, y0: 84, x1: 700, y1: 330 }, { x0: 72, y0: 340, x1: 800, y1: 440 }];
  const footer = { x0: 72, y0: S.h - 64 - 58, x1: S.w - 72, y1: S.h - 64 };
  const args = { W: S.w, H: S.h, avoid: [...text, footer], zone: { y0: 470, y1: footer.y0 - 20 }, seed: 'a|feed' };
  const a = autoLines(args), b = autoLines(args);
  assert.deepEqual(a, b);
  assert.ok(a.shapes.length >= 2 && a.shapes[0].t === 'arc');
  assert.equal(a.shapes[1].c, 'gold');
  for (const sh of a.shapes.filter((x) => x.t === 'arc')) {
    for (const [x, y] of arcPoints(sh, S.w, S.h)) {
      if (x < 0 || x > S.w || y < 0 || y > S.h) continue;
      for (const r of [...text, footer]) assert.ok(!(x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1), `arc point ${x},${y} is inside text`);
    }
  }
  // a text block that fills the picture leaves no room: nothing is drawn, with a note
  const full = autoLines({ ...args, avoid: [{ x0: -50, y0: -50, x1: S.w + 50, y1: S.h + 50 }] });
  assert.deepEqual(full.shapes, []);
  assert.match(full.note, /no free space/);
});

test('layout problems: overflow, collisions and a clear message that says to shorten the text', () => {
  const S = SIZES.feed;
  const role = (r, rects, extra = {}) => ({ role: r, rects, color: 'rgb(255,255,255)', overX: 0, text: `${r} text`, ...extra });
  const base = { W: S.w, H: S.h, avoid: [], footer: { x0: 72, y0: 1228, x1: 1008, y1: 1286 }, imgs: [] };
  const fits = { ...base, roles: [role('headline', [{ x0: 72, y0: 90, x1: 900, y1: 300 }]), role('sub', [{ x0: 72, y0: 330, x1: 800, y1: 380 }])] };
  assert.deepEqual(findLayoutProblems(fits, S), []);
  const tall = { ...base, roles: [role('headline', [{ x0: 72, y0: 90, x1: 900, y1: 1600 }])] };
  const p = findLayoutProblems(tall, S);
  assert.equal(p[0].kind, 'outside');
  assert.equal(p[0].edge, 'bottom');
  const msg = explainProblems(p, 'feed', { headline: 90 });
  assert.match(msg, /does not fit the feed format/);
  assert.match(msg, /past the bottom of the text area/);
  assert.match(msg, /Shorten the text/);
  assert.match(msg, /90 characters/);
  const clash = { ...base, roles: [role('headline', [{ x0: 72, y0: 90, x1: 900, y1: 300 }]), role('sub', [{ x0: 72, y0: 200, x1: 800, y1: 280 }])] };
  assert.equal(findLayoutProblems(clash, S)[0].kind, 'overlap');
  const wide = { ...base, roles: [role('stat', [{ x0: 72, y0: 90, x1: 900, y1: 200 }], { overX: 120 })] };
  assert.equal(findLayoutProblems(wide, S)[0].kind, 'wide');
  const hitsShot = { ...base, avoid: [{ x0: 500, y0: 100, x1: 1000, y1: 900 }], roles: [role('headline', [{ x0: 72, y0: 90, x1: 900, y1: 300 }])] };
  assert.equal(findLayoutProblems(hitsShot, S)[0].kind, 'avoid');
});

test('image sizes are read from the bytes; Chrome is found through CHROME_PATH; the JPG converter has an order', () => {
  assert.deepEqual(imageSize(pngBytes(7, 5, () => [0, 0, 0])), { w: 7, h: 5 });
  assert.equal(imageSize(Buffer.from('not an image at all, just text')), null);
  assert.equal(findChrome({ env: { CHROME_PATH: '/x/chrome' }, exists: () => true }), '/x/chrome');
  assert.equal(findChrome({ env: { CHROME_PATH: '/x/chrome' }, exists: () => false }), null);
  assert.equal(findChrome({ env: {}, platform: 'darwin', exists: (p) => p.startsWith('/Applications/Google Chrome.app') }), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  assert.equal(findChrome({ env: {}, platform: 'darwin', exists: () => false }), null);
  assert.equal(detectConverter({ probe: (cmd) => cmd === 'sips' || cmd === 'ffmpeg' }).name, 'sips');
  assert.equal(detectConverter({ probe: (cmd) => cmd === 'ffmpeg' }).name, 'ffmpeg');
  assert.equal(detectConverter({ probe: () => false }), null);
});

test('design --help works on its own and through buffer.mjs; unknown flags and commands exit 1', () => {
  const run = (file, ...args) => spawnSync(process.execPath, [path.join(import.meta.dirname, file), ...args], { encoding: 'utf8' });
  for (const [file, args] of [['design.mjs', ['--help']], ['design.mjs', []], ['buffer.mjs', ['design', '--help']]]) {
    const r = run(file, ...args);
    assert.equal(r.status, 0);
    for (const word of ['photo', 'cover', 'ledger', 'passbook', 'myth-fact', 'stats', 'screen', 'carousel', 'render', '--sizes', '--no-lines', '--image', '--spec', 'CHROME_PATH']) assert.ok(r.stdout.includes(word), `${file} ${args}: ${word}`);
  }
  const bad = run('design.mjs', 'photo', '--bogus');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /unknown flag --bogus/);
  assert.equal(run('design.mjs', 'frobnicate').status, 1);
  const missing = run('design.mjs', 'photo', '--headline', 'x');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /image is required/);
});


const chrome = findChrome();
const NO_CHROME_SKIP = 'Google Chrome not found (set CHROME_PATH); skipping the real render';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-design-test-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const capture = () => { const lines = []; return { lines, log: (s) => lines.push(String(s)) }; };

// A pale, bright synthetic "photo": white text on it fails contrast until the scrim is raised.
const synthetic = path.join(tmp, 'pale-field.png');
fs.writeFileSync(synthetic, pngBytes(1600, 1200, (x, y) => { const v = 225 + Math.round(30 * (x / 1600)); return [v, v - 6 + (y % 7), v - 12]; }));

test('end to end: a text page renders at the exact size', { skip: chrome ? false : NO_CHROME_SKIP }, async () => {
  const { lines, log } = capture();
  const out = path.join(tmp, 'text.jpg');
  const code = await runDesign(['text', '--headline', 'Every euro,\n*on record.*', '--sub', 'One place to run savings, passbooks, goals, loans and welfare funds.', '--out', out], { log });
  assert.equal(code, 0, lines.join('\n'));
  const size = imageSize(fs.readFileSync(out));
  assert.deepEqual(size, { w: 1080, h: 1350 });
  assert.ok(fs.statSync(out).size > 20000);
  assert.match(lines.join('\n'), /1 image\(s\) made, 0 failed/);
});

test('end to end: a photo post raises the scrim for contrast, draws the lines, and writes every size', { skip: chrome ? false : NO_CHROME_SKIP }, async () => {
  const { lines, log } = capture();
  const out = path.join(tmp, 'photo.jpg');
  const code = await runDesign(['photo', '--image', synthetic, '--headline', 'Every euro,\n*on record.*', '--sub', 'Savings, passbooks, goals, loans and welfare funds in one place.', '--sizes', 'feed,wide', '--out', out], { log });
  const text = lines.join('\n');
  assert.equal(code, 0, text);
  assert.deepEqual(imageSize(fs.readFileSync(path.join(tmp, 'photo-feed.jpg'))), { w: 1080, h: 1350 });
  assert.deepEqual(imageSize(fs.readFileSync(path.join(tmp, 'photo-wide.jpg'))), { w: 1200, h: 675 });
  assert.match(text, /scrim raised to 0\.\d+/); // white text on a pale picture needed more than the starting scrim
  // the same picture with the scrim switched off and no lines: the tool says so instead of hiding it
  const off = capture();
  const code2 = await runDesign(['photo', '--image', synthetic, '--headline', 'Every euro, on record.', '--scrim', 'none', '--no-lines', '--out', path.join(tmp, 'off.jpg')], { log: off.log });
  assert.equal(code2, 0, off.lines.join('\n'));
  assert.match(off.lines.join('\n'), /low contrast: the headline text is/);
});

test('end to end: text that cannot fit fails with a message that says to shorten it; nothing is written', { skip: chrome ? false : NO_CHROME_SKIP }, async () => {
  const { lines, log } = capture();
  const out = path.join(tmp, 'long.jpg');
  const code = await runDesign(['stats', '--big', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', '--line', 'Every deposit and payout, written down the moment it happens.', '--out', out], { log });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /does not fit the feed format.*Shorten the text/s);
  assert.equal(fs.existsSync(out), false);
});

test('end to end: render <batch> writes the images into mediaRoot and fills media only where it was absent', { skip: chrome ? false : NO_CHROME_SKIP }, async () => {
  const mediaRoot = 'out/test-design-media';
  fs.rmSync(path.join(ROOT, mediaRoot), { recursive: true, force: true });
  const batchFile = path.join(tmp, 'batch.json');
  const raw = rawBatch([
    { design: { template: 'text', headline: 'Hello, *world.*', sizes: ['feed'] } },
    { media: ['mine.jpg'], design: { template: 'photo', image: synthetic, headline: 'Saving together', lines: false } },
  ]);
  raw.mediaRoot = mediaRoot;
  fs.writeFileSync(batchFile, JSON.stringify(raw, null, 2));
  const { lines, log } = capture();
  try {
    const code = await runDesign(['render', batchFile], { log });
    assert.equal(code, 0, lines.join('\n'));
    const after = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
    assert.deepEqual(after.posts[0].media, ['01-p-feed.jpg']);
    assert.deepEqual(after.posts[1].media, ['mine.jpg']); // hand-set media is never touched
    assert.deepEqual(imageSize(fs.readFileSync(path.join(ROOT, mediaRoot, '01-p-feed.jpg'))), { w: 1080, h: 1350 });
    assert.ok(fs.existsSync(path.join(ROOT, mediaRoot, '02-p-feed.jpg')));
    assert.match(lines.join('\n'), /media does not|does not list the image/);
    assert.deepEqual(validateBatch(after).errors, []);
  } finally {
    fs.rmSync(path.join(ROOT, mediaRoot), { recursive: true, force: true });
  }
});

// ---- untrusted text, in a real browser ----
const HOSTILE_HEADLINE = '</div><script>window.__pwn=1</script><img src=x onerror="window.__pwn=2"><svg onload="window.__pwn=3"> "><script>window.__pwn=4</script>';
const PIXEL_URI = `data:image/png;base64,${pngBytes(2, 2, () => [200, 30, 30]).toString('base64')}`;
const loadPage = async (browser, spec, tweak = (h) => h) => {
  const S = SIZES.feed;
  const t = TEMPLATE_FNS[spec.template](spec, { size: S, brand, image: () => PIXEL_URI });
  const page = await browser.page(S.w, S.h);
  await page.setContent(tweak(buildPage({ brand, size: S, ...t })));
  await page.evaluate('window.__ds.ready()');
  return page;
};

test('end to end: a hostile headline is shown as literal text and no script runs', { skip: chrome ? false : NO_CHROME_SKIP }, async () => {
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    for (const spec of [{ template: 'text', headline: HOSTILE_HEADLINE, sub: HOSTILE_HEADLINE }, { template: 'stats', big: HOSTILE_HEADLINE, stats: [[HOSTILE_HEADLINE, HOSTILE_HEADLINE]] }, { template: 'photo', image: 'x.png', headline: HOSTILE_HEADLINE, eyebrow: HOSTILE_HEADLINE }]) {
      const page = await loadPage(browser, spec);
      const r = await page.evaluate(`({
        pwn: window.__pwn, scripts: document.scripts.length, onerror: document.querySelectorAll('[onerror],[onload]').length,
        injected: document.querySelectorAll('svg:not(.lines):not([data-ok]), body img[src="x"]').length,
        headline: document.querySelector('[data-role=headline],[data-role=stat]').textContent.replace(/\\s+/g, ' ').trim() })`);
      assert.equal(r.pwn, undefined, `${spec.template}: a script ran`);
      assert.equal(r.scripts, 1, `${spec.template}: extra script elements`);
      assert.equal(r.onerror, 0);
      assert.equal(r.injected, 0);
      assert.equal(r.headline, HOSTILE_HEADLINE.replace(/\s+/g, ' ').trim(), `${spec.template}: the text must appear literally`);
      assert.deepEqual(page.blocked, []);
      await page.close();
    }
  } finally { browser.close(); }
  // and through the whole command: it renders (the text is just text), exit code 0
  const { lines, log } = capture();
  const out = path.join(tmp, 'hostile.jpg');
  const code = await runDesign(['text', '--headline', '"> <script> window.__pwn=1 </script>', '--sub', '<img src=x onerror=alert(1)>', '--out', out], { log });
  assert.equal(code, 0, lines.join('\n'));
  assert.deepEqual(imageSize(fs.readFileSync(out)), { w: 1080, h: 1350 });
});

test('end to end: the rendered page cannot reach the network or the disk (CSP, request blocking, no file access)', { skip: chrome ? false : NO_CHROME_SKIP }, async () => {
  const hits = [];
  const server = http.createServer((req, res) => { hits.push(req.url); res.end('x'); }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const url = `http://127.0.0.1:${server.address().port}/leak.png`;
  const secretFile = path.join(tmp, 'secret.png');
  fs.writeFileSync(secretFile, pngBytes(3, 3, () => [1, 2, 3]));
  const attack = `<img id="a" src="${url}"><img id="b" src="file://${secretFile}"><link rel="stylesheet" href="${url}?css"><script nonce="wrong">window.__pwn=1</script>`;
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    // 1. with the policy in place
    let page = await loadPage(browser, { template: 'text', headline: 'x' }, (h) => h.replace('</body>', `${attack}</body>`));
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(hits, []);
    assert.equal(await page.evaluate('window.__pwn'), undefined); // an inline script without the nonce does not run
    assert.equal(await page.evaluate('document.getElementById("b").naturalWidth'), 0); // a file: picture does not load
    await page.close();
    // 2. with the policy removed, the request filter alone still stops everything
    page = await loadPage(browser, { template: 'text', headline: 'x' }, (h) => h.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace('</body>', `${attack}</body>`));
    await new Promise((r) => setTimeout(r, 400));
    assert.deepEqual(hits, []);
    assert.ok(page.blocked.some((u) => u.startsWith('http://127.0.0.1')), page.blocked.join(' ')); // (a file: picture on an about:blank page is refused by Chrome itself, before the filter)
    assert.equal(await page.evaluate('document.getElementById("b").naturalWidth'), 0);
    await page.close();
  } finally { browser.close(); server.close(); }
});
