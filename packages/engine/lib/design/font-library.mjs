// The fonts the engine ships (design/fonts/library.json: each family, its woff2 files, weights, axes and unicode ranges, all under the
// SIL Open Font License; the licence texts sit beside the files), the colour emoji (emoji.json) and the currency fallback (symbols.json). The design directions (lib/design/directions/) name the families they
// set type in; a page embeds only the files it uses: the family and style it asks for, the subsets its text needs (latin always;
// latin-ext only when a character of the words is outside latin), each as one @font-face with a data: URI. Nothing is loaded by path.
// The faces are declared under an alias (`VF Fraunces`) so they never clash with a brand's own fonts of the same name.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR } from '../core.mjs';
import { emojiIn } from './emoji.mjs';

const DIR = path.join(ENGINE_DIR, 'design', 'fonts');
const FAMILY = /^[A-Za-z0-9 ]{1,40}$/;
const WEIGHT = /^\d{3}(?: \d{3})?$/;
const RANGE = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(, ?U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;
const FILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.woff2$/;
const DIRNAME = /^(\.|[a-z0-9][a-z0-9-]*)$/;

let cache = null;
export function fontLibrary() {
  if (!cache) cache = JSON.parse(fs.readFileSync(path.join(DIR, 'library.json'), 'utf8'));
  return cache;
}
export const familyOf = (name) => fontLibrary().find((f) => f.family === name) ?? null;
// The name a library family is declared under in a page.
export const fontAlias = (family) => `VF ${family}`;

// Every problem with the manifest and the files it names (tests run this; a page never trusts a file it has not checked).
export function libraryProblems() {
  const errors = [];
  const names = new Set();
  for (const f of fontLibrary()) {
    if (!FAMILY.test(f.family ?? '')) { errors.push(`font library: family "${f.family}" has an odd name`); continue; }
    if (names.has(f.family)) errors.push(`font library: ${f.family} is listed twice`);
    names.add(f.family);
    if (!DIRNAME.test(f.dir ?? '')) errors.push(`font library: ${f.family} has an odd folder "${f.dir}"`);
    if (f.license !== 'OFL-1.1') errors.push(`font library: ${f.family} must be OFL-1.1`);
    const licence = path.join(DIR, f.dir ?? '.', 'OFL.txt');
    if (!fs.existsSync(licence)) errors.push(`font library: ${f.family} has no OFL.txt (${path.relative(ENGINE_DIR, licence)})`);
    for (const x of f.files ?? []) {
      const where = `font library: ${f.family} ${x.file}`;
      if (!FILE.test(x.file ?? '')) { errors.push(`${where}: odd file name`); continue; }
      if (!['normal', 'italic'].includes(x.style)) errors.push(`${where}: style must be normal or italic`);
      if (!WEIGHT.test(x.weight ?? '')) errors.push(`${where}: weight must look like "400" or "300 600"`);
      if (!RANGE.test(x.range ?? '')) errors.push(`${where}: odd unicode-range`);
      if (x.stretch !== undefined && !/^\d{2,3}% \d{2,3}%$/.test(x.stretch)) errors.push(`${where}: stretch must look like "62% 125%"`);
      if (!['latin', 'latin-ext'].includes(x.subset)) errors.push(`${where}: subset must be latin or latin-ext`);
      const file = path.join(DIR, f.dir ?? '.', x.file);
      if (!fs.existsSync(file)) errors.push(`${where}: the file is missing`);
      else if (fs.readFileSync(file).toString('latin1', 0, 4) !== 'wOF2') errors.push(`${where}: not a woff2 file`);
    }
  }
  return errors;
}

// ---- the colour emoji font (design/fonts/emoji.json: Noto Color Emoji, OFL, a COLRv1 build in unicode-range slices) ----
// Embedded only on a page whose words hold an emoji (a brand that turns them on, emoji.mjs), and then only the slices those emoji need, under
// the alias EMOJI_ALIAS, which the page puts in every font stack right after the role's own font. Nothing is loaded from the network.
export const EMOJI_ALIAS = 'VF Emoji';
// one face for every weight the words are set in (an emoji has no weights of its own; this keeps the browser from faking bold)
const EMOJI_WEIGHTS = '100 900';
let emojiCache = null;
export function emojiLibrary() {
  if (!emojiCache) emojiCache = JSON.parse(fs.readFileSync(path.join(DIR, 'emoji.json'), 'utf8'));
  return emojiCache;
}
export function emojiLibraryProblems() {
  const e = [], lib = emojiLibrary();
  if (lib.license !== 'OFL-1.1') e.push('emoji font: must be OFL-1.1');
  if (!DIRNAME.test(lib.dir ?? '')) e.push('emoji font: odd folder');
  else if (!fs.existsSync(path.join(DIR, lib.dir, 'OFL.txt'))) e.push('emoji font: no OFL.txt beside the files');
  for (const x of lib.files ?? []) {
    if (!FILE.test(x.file ?? '')) { e.push('emoji font: odd file name'); continue; }
    if (!RANGE.test(x.range ?? '')) e.push(`emoji font ${x.file}: odd unicode-range`);
    const file = path.join(DIR, lib.dir, x.file);
    if (!fs.existsSync(file)) e.push(`emoji font ${x.file}: the file is missing`);
    else if (fs.readFileSync(file).toString('latin1', 0, 4) !== 'wOF2') e.push(`emoji font ${x.file}: not a woff2 file`);
  }
  return e;
}
// The @font-face rules for the emoji in `text` (only the slices they need), and the files: { css, files }; empty when the text holds none.
export function emojiFacesFor(text = '') {
  const clusters = emojiIn(String(text)).emoji;
  if (!clusters.length) return { css: '', files: [] };
  const lib = emojiLibrary(), cps = new Set(clusters.flatMap((c) => [...c].map((ch) => ch.codePointAt(0))));
  const picked = lib.files.filter((x) => [...cps].some((cp) => inRange(x.range, cp)));
  const css = picked.map((x) => `@font-face{font-family:"${EMOJI_ALIAS}";src:url("${dataUri(lib, x.file)}") format("woff2");font-weight:${EMOJI_WEIGHTS};font-style:normal;unicode-range:${x.range}}`).join('');
  return { css, files: picked.map((x) => ({ family: lib.family, file: x.file, style: 'normal', weight: '400', subset: 'emoji', bytes: x.bytes })) };
}

// ---- the symbol fallback (design/fonts/symbols.json: OFL subsets of Noto Sans, the currency signs, and Noto Sans Symbols, the arrows) ----
// Many display and text faces lack signs such as the cedi (₵), naira (₦) or shekel (₪), or the arrows, and the system fonts behind them differ
// from machine to machine, so a page whose words hold one embeds the faces for it under SYMBOLS_ALIAS and names that alias in every stack after
// the role's own font (and the emoji font): the role's font still draws every sign it has, these only what it lacks. Weight 100 to 900.
export const SYMBOLS_ALIAS = 'VF Symbols';
let symbolsCache = null;
// [{ family, dir, license, files: [{ file, style, weight, range, bytes }] }]
export function symbolsLibrary() {
  if (!symbolsCache) symbolsCache = JSON.parse(fs.readFileSync(path.join(DIR, 'symbols.json'), 'utf8'));
  return symbolsCache;
}
export function symbolsLibraryProblems() {
  const e = [];
  if (!Array.isArray(symbolsLibrary())) return ['symbols fonts: symbols.json must be a list of families'];
  for (const lib of symbolsLibrary()) {
    const w = `symbols font ${lib.family}`;
    if (!FAMILY.test(lib.family ?? '')) e.push(`${w}: odd family name`);
    if (lib.license !== 'OFL-1.1') e.push(`${w}: must be OFL-1.1`);
    if (!DIRNAME.test(lib.dir ?? '')) { e.push(`${w}: odd folder`); continue; }
    if (!fs.existsSync(path.join(DIR, lib.dir, 'OFL.txt'))) e.push(`${w}: no OFL.txt beside the files`);
    for (const x of lib.files ?? []) {
      if (!FILE.test(x.file ?? '')) { e.push(`${w}: odd file name`); continue; }
      if (!RANGE.test(x.range ?? '')) e.push(`${w} ${x.file}: odd unicode-range`);
      if (!['normal', 'italic'].includes(x.style)) e.push(`${w} ${x.file}: style must be normal or italic`);
      if (!WEIGHT.test(x.weight ?? '')) e.push(`${w} ${x.file}: weight must look like "400" or "100 900"`);
      const file = path.join(DIR, lib.dir, x.file);
      if (!fs.existsSync(file)) e.push(`${w} ${x.file}: the file is missing`);
      else if (fs.readFileSync(file).toString('latin1', 0, 4) !== 'wOF2') e.push(`${w} ${x.file}: not a woff2 file`);
    }
  }
  return e;
}
// The fallback files the words need: every file (each style) of a family one of whose ranges takes a character of the words.
function symbolFilesFor(text) {
  const cps = new Set([...String(text)].map((ch) => ch.codePointAt(0)));
  return symbolsLibrary().flatMap((lib) => (lib.files.some((x) => [...cps].some((cp) => inRange(x.range, cp))) ? lib.files.map((x) => ({ lib, x })) : []));
}
// Whether the words hold a sign the symbol fallback is for.
export const needsSymbols = (text = '') => symbolFilesFor(text).length > 0;
// The @font-face rules of the symbol fallback and its files: { css, files }; empty when the words hold none of its signs.
export function symbolFacesFor(text = '') {
  const picked = symbolFilesFor(text);
  const css = picked.map(({ lib, x }) => `@font-face{font-family:"${SYMBOLS_ALIAS}";src:url("${dataUri(lib, x.file)}") format("woff2");font-weight:${x.weight};font-style:${x.style};unicode-range:${x.range}}`).join('');
  return { css, files: picked.map(({ lib, x }) => ({ family: lib.family, file: x.file, style: x.style, weight: x.weight, subset: 'symbols', bytes: x.bytes })) };
}

const bounds = (w) => w.split(' ').map(Number).filter(Number.isFinite);
// Whether a file's weight range covers every weight asked for.
const covers = (weightRange, weights) => { const [lo, hi = lo] = bounds(weightRange); return weights.every((w) => w >= lo && w <= hi); };
// Whether a code point is in a unicode-range descriptor.
export function inRange(range, cp) {
  for (const part of range.split(',')) {
    const m = /^U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?$/.exec(part.trim());
    if (!m) continue;
    if (m[1].includes('?')) { if (cp >= parseInt(m[1].replace(/\?/g, '0'), 16) && cp <= parseInt(m[1].replace(/\?/g, 'F'), 16)) return true; continue; }
    const lo = parseInt(m[1], 16), hi = m[2] ? parseInt(m[2], 16) : lo;
    if (cp >= lo && cp <= hi) return true;
  }
  return false;
}

const bytesCache = new Map();
const dataUri = (family, file) => {
  const abs = path.join(DIR, family.dir, file);
  if (!bytesCache.has(abs)) bytesCache.set(abs, `data:font/woff2;base64,${fs.readFileSync(abs).toString('base64')}`);
  return bytesCache.get(abs);
};

// The files a need takes: those of its family and style whose weights cover the weights asked, one per subset the text needs.
// need: { family, style?: 'normal' | 'italic', weights: [400, 600] }; text: every word of the page.
export function filesFor(need, text = '') {
  const fam = familyOf(need.family);
  if (!fam) throw new Error(`font library: no family "${need.family}"`);
  const style = need.style ?? 'normal', weights = need.weights?.length ? need.weights : [400];
  const cands = fam.files.filter((x) => x.style === style && covers(x.weight, weights));
  if (!cands.length) throw new Error(`font library: ${need.family} ${style} has no file for the weights ${weights.join(', ')}`);
  const latin = cands.filter((x) => x.subset === 'latin');
  const chosen = [...latin];
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0);
    if (latin.some((x) => inRange(x.range, cp))) continue;
    const ext = cands.find((x) => x.subset !== 'latin' && inRange(x.range, cp));
    if (ext && !chosen.includes(ext)) chosen.push(ext);
  }
  return chosen.map((x) => ({ family: fam, file: x }));
}

// The @font-face rules for the needs of a page, and the files they embed. Weights, ranges and the stretch come from the manifest
// (checked by libraryProblems), the names from the families of the manifest: no value of a spec or a brand file is in here.
export function fontFacesFor(needs, text = '') {
  const picked = new Map();
  for (const need of needs) for (const f of filesFor(need, text)) picked.set(`${f.family.dir}/${f.file.file}`, f);
  const faces = [...picked.values()];
  const css = faces.map(({ family, file }) => `@font-face{font-family:"${fontAlias(family.family)}";src:url("${dataUri(family, file.file)}") format("woff2");font-weight:${file.weight};font-style:${file.style};${file.stretch ? `font-stretch:${file.stretch};` : ''}unicode-range:${file.range}}`).join('');
  return { css, files: faces.map(({ family, file }) => ({ family: family.family, file: file.file, style: file.style, weight: file.weight, subset: file.subset, bytes: file.bytes })) };
}
