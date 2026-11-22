// node --test   (missing glyphs: every character a page draws has a glyph in a font the page embeds. The currency signs render in every shipped
// look's fonts, with the engine's currency fallback where a face lacks one; a character no bundled font has fails the render with a reason
// that names the character and never the text.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from './lib/core.mjs';
import { fontCodepoints, hasCodepoint } from './lib/design/font-cmap.mjs';
import { emojiLibrary, fontLibrary, symbolFacesFor, symbolsLibrary, symbolsLibraryProblems, SYMBOLS_ALIAS } from './lib/design/font-library.mjs';
import { explainGlyphProblems, glyphProblems, pageFaces, stackOf } from './lib/design/glyphs.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { buildPage } from './lib/design/page.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { normaliseDesign, validateDesign } from './lib/design/spec.mjs';

const FONTS = path.join(ENGINE_DIR, 'design', 'fonts');
const bytes = (dir, file) => fs.readFileSync(path.join(FONTS, dir, file));
const cps = (dir, file) => fontCodepoints(bytes(dir, file));
const has = (ranges, ch) => hasCodepoint(ranges, ch.codePointAt(0));
// The currency signs a price may carry (the owner's list; KSh and R are letters).
const SIGNS = [...'€£$¥₦₵₹₱₩₪₺₴₽'];
// A sign no bundled font draws (the Thai baht): the test below proves it is absent from every file.
const ABSENT = '฿';

const libraryFiles = () => fontLibrary().flatMap((f) => f.files.map((x) => ({ family: f.family, dir: f.dir, ...x })));
const everyFile = () => [
  ...libraryFiles(),
  ...emojiLibrary().files.map((x) => ({ family: 'emoji', dir: emojiLibrary().dir, ...x })),
  ...symbolsLibrary().flatMap((lib) => lib.files.map((x) => ({ family: lib.family, dir: lib.dir, ...x }))),
];

test('the character map is read from the woff2 files themselves: a face without a sign does not claim it', () => {
  const hanken = cps('hanken-grotesk', 'hanken-grotesk-v12-normal-latin-ext.woff2');
  // the face's unicode-range takes U+20A0-20AB and U+20AD-20C4, but it has no cedi: that is why "GH₵" drew an empty box
  assert.equal(has(hanken, '₵'), false);
  assert.equal(has(hanken, 'Ā'), true);
  assert.equal(has(cps('hanken-grotesk', 'hanken-grotesk-v12-normal-latin.woff2'), '€'), true);
  assert.equal(has(cps('fraunces', 'fraunces-v38-normal-latin-ext.woff2'), '₵'), true);
  assert.throws(() => fontCodepoints(Buffer.from('not a font at all, just words')), /not a woff2/);
  assert.throws(() => fontCodepoints(Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(10)])), /too short/);
});

test('the symbol fallback is checked OFL files: every common currency sign in both styles, and the arrows', () => {
  assert.deepEqual(symbolsLibraryProblems(), []);
  const readme = fs.readFileSync(path.join(FONTS, 'README.md'), 'utf8');
  for (const l of symbolsLibrary()) {
    assert.equal(l.license, 'OFL-1.1');
    assert.ok(fs.existsSync(path.join(FONTS, l.dir, 'OFL.txt')));
    for (const x of l.files) assert.ok(readme.includes(`${l.dir}/${x.file}`), `${x.file} is credited in fonts/README.md`);
  }
  const arrows = symbolsLibrary().find((l) => l.family === 'Noto Sans Symbols');
  for (const ch of '←↑→↓') assert.ok(has(cps(arrows.dir, arrows.files[0].file), ch), `the arrows file draws ${ch}`);
  const lib = symbolsLibrary().find((l) => l.family === 'Noto Sans');
  assert.deepEqual(lib.files.map((x) => x.style).sort(), ['italic', 'normal']);
  for (const x of lib.files) {
    const r = cps(lib.dir, x.file);
    for (const s of SIGNS.filter((c) => c >= '₠')) assert.ok(has(r, s), `${x.file} draws ${s}`);
  }
});

test('every currency sign renders in every shipped look\'s own fonts, with the fallback where a face lacks it', () => {
  const symbols = symbolsLibrary().flatMap((l) => l.files.filter((x) => x.style === 'normal').map((x) => ({ range: x.range, cps: cps(l.dir, x.file) })));
  const drawnBy = (list, ch) => list.some((f) => inRangeOf(f.range, ch) && has(f.cps, ch));
  const brandFamilies = ['Hanken Grotesk', 'Inter', 'JetBrains Mono'];
  for (const [id, look] of Object.entries(shippedLooks())) {
    for (const [role, spec] of Object.entries(look.fonts)) {
      const families = spec.source === 'library' ? [spec.family] : brandFamilies;
      for (const family of families) {
        const fam = fontLibrary().find((f) => f.family === family);
        const faces = fam.files.filter((x) => x.style === 'normal').map((x) => ({ range: x.range, cps: cps(fam.dir, x.file) }));
        for (const s of SIGNS) assert.ok(drawnBy(faces, s) || drawnBy(symbols, s), `${id} ${role} (${family}) draws ${s}`);
      }
    }
  }
});
function inRangeOf(range, ch) {
  const cp = ch.codePointAt(0);
  return range.split(',').some((part) => { const m = /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/i.exec(part.trim()); return m && cp >= parseInt(m[1], 16) && cp <= parseInt(m[2] ?? m[1], 16); });
}

test(`the test's unsupported character (${ABSENT}) is absent from every bundled font file`, () => {
  for (const f of everyFile()) assert.equal(has(cps(f.dir, f.file), ABSENT), false, `${f.family} ${f.file}`);
});

test('a page embeds the currency fallback only when its words hold a sign it is for, and names it after the brand\'s own fonts', () => {
  assert.equal(symbolFacesFor('Save €5 a week').css, '', 'the euro: every library font draws it');
  assert.equal(symbolFacesFor('$5, £5 or ¥5').css, '');
  const f = symbolFacesFor('GH₵ 0');
  assert.match(f.css, new RegExp(`font-family:"${SYMBOLS_ALIAS}"`));
  assert.equal(f.files.length, 2, 'the currency faces, normal and italic');
  assert.deepEqual(symbolFacesFor('Next →').files.map((x) => x.family), ['Noto Sans Symbols']);
  const brand = loadBrand({ file: path.join(ROOT, 'brands', 'pennyhive', 'brand.json') });
  const page = (body) => buildPage({ brand, size: SIZES.feed, body });
  assert.doesNotMatch(page('<p>Save €5</p>'), /VF Symbols/);
  const html = page('<p>GH₵ 5</p>');
  assert.match(html, /--font:'Hanken Grotesk','VF Symbols'/);
  assert.match(html, /--mono:'JetBrains Mono','VF Symbols'/);
  assert.equal(pageFaces(html).filter((x) => x.family === 'vf symbols').length, 2);
});

test('glyphProblems: a character is drawn only by an embedded face whose range takes it AND whose map has it; system fonts never count', () => {
  const uri = (dir, file) => `data:font/woff2;base64,${bytes(dir, file).toString('base64')}`;
  const hankenFaces = `@font-face{font-family:"VF Hanken Grotesk";src:url("${uri('hanken-grotesk', 'hanken-grotesk-v12-normal-latin.woff2')}") format("woff2");font-weight:400 800;font-style:normal;unicode-range:U+0000-00FF}`
    + `@font-face{font-family:"VF Hanken Grotesk";src:url("${uri('hanken-grotesk', 'hanken-grotesk-v12-normal-latin-ext.woff2')}") format("woff2");font-weight:400 800;font-style:normal;unicode-range:U+0100-02BA, U+20A0-20AB, U+20AD-20C4}`;
  const group = (chars, stack = '"VF Hanken Grotesk", Georgia, serif', role = 'label') => [{ stack, style: 'normal', weight: '600', role, chars }];
  assert.deepEqual(glyphProblems(group('GH0'), `<style>${hankenFaces}</style>`), []);
  const bad = glyphProblems(group('GH₵0'), `<style>${hankenFaces}</style>`);
  assert.deepEqual(bad.map((p) => p.ch), ['₵'], 'the face claims the range, but has no cedi; Georgia is a system font and does not count');
  const fixed = `<style>${hankenFaces}${symbolFacesFor('₵').css}</style>`;
  assert.deepEqual(glyphProblems(group('GH₵0', `"VF Hanken Grotesk", "${SYMBOLS_ALIAS}", serif`), fixed), []);
  assert.equal(glyphProblems(group('GH₵0'), fixed).length, 1, 'the fallback helps only a stack that names it');
  assert.equal(glyphProblems(group('a', 'serif'), fixed).length, 1, 'a stack of system fonts only draws nothing the page can vouch for');
  assert.deepEqual(stackOf('"VF Inter", \'VF Emoji\', Georgia, serif'), ['vf inter', 'vf emoji', 'georgia', 'serif']);
});

test('the reason names the character and its code, never the text it is in', () => {
  const text = 'Secret launch price GH₵ 0 for members of the Accra group';
  const msg = explainGlyphProblems([{ ch: '₵', cp: 0x20b5, role: 'label', families: [] }]);
  assert.match(msg, /"₵" \(U\+20B5\)/);
  assert.match(msg, /empty box/);
  assert.doesNotMatch(msg, /Secret|launch|Accra/);
  assert.ok(!msg.includes(text));
  const many = explainGlyphProblems([...'กข ค ง'.replace(/ /g, '')].map((ch) => ({ ch, cp: ch.codePointAt(0), role: 'headline', families: [] })));
  assert.match(many, /the headline has characters .+ and 1 more/);
  assert.match(explainGlyphProblems([{ ch: '\u0007', cp: 7, role: 'sub', families: [] }]), /the sub line has the character U\+0007,/, 'an invisible character is named by its code only');
});

const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-glyphs-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome, lockFile: path.join(tmp, 'design.lock') }); });
test.after(() => { browser?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const pennyhive = () => loadBrand({ file: path.join(ROOT, 'brands', 'pennyhive', 'brand.json') });
const inLook = (brand, id) => ({ ...brand, looks: [{ ...JSON.parse(JSON.stringify(shippedLooks()[id])), origin: `copy:shipped:${id}` }], style: { ...brand.style, direction: id } });
const offer = (tag, sub = 'No monthly fee, now or ever.') => ({ template: 'post', name: 'glyphs', kind: 'offer', variant: 0, label: 'Free plan', headline: 'Start free, *keep your books*', tag, sub });

for (const id of ['clean', 'soft']) {
  test(`a ₵ price renders in the ${id} offer without a picture, drawn by the page's own fonts`, { skip }, async () => {
    const spec = offer('GH₵ 0');
    assert.deepEqual(validateDesign(spec, 'offer', {}), []);
    const r = await renderImage(browser, inLook(pennyhive(), id), { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${id}-cedi.png`) }, { tmpDir: tmp });
    assert.ok(r.post.fonts.some((f) => f.subset === 'symbols'), 'the page embeds the currency fallback');
  });
}

test('every other common currency sign renders in the soft offer', { skip }, async () => {
  const spec = offer('₦₹₱₩₪₺₴₽', 'Prices in many currencies.');
  await renderImage(browser, inLook(pennyhive(), 'soft'), { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, 'soft-signs.png') }, { tmpDir: tmp });
});

test('a character no bundled font has fails the render, naming the character and not the text', { skip }, async () => {
  const spec = offer(`${ABSENT} 99`, 'Members only pricing for the Accra group.');
  await assert.rejects(
    renderImage(browser, inLook(pennyhive(), 'clean'), { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, 'baht.png') }, { tmpDir: tmp }),
    (e) => /"฿" \(U\+0E3F\)/.test(e.message) && /no font of this page can draw/.test(e.message) && !/Accra|Members only/.test(e.message),
  );
  assert.equal(fs.existsSync(path.join(tmp, 'baht.png')), false, 'nothing is saved');
});

test('a classic template with a ₵ price and an arrow draws them with the fallback', { skip }, async () => {
  const brand = loadBrand({ file: path.join(ROOT, 'brands', 'demo', 'brand.json') });
  const spec = normaliseDesign({ template: 'text', name: 'cedi', headline: 'Save GH₵ 5 a week →' });
  await renderImage(browser, brand, { spec, sizeName: 'feed', outFile: path.join(tmp, 'classic.png') }, { tmpDir: tmp });
});
