// The fonts the engine ships (design/fonts/library.json: each family, its woff2 files, weights, axes and unicode ranges, all under the
// SIL Open Font License; the licence texts sit beside the files). The design directions (lib/design/directions/) name the families they
// set type in; a page embeds only the files it uses: the family and style it asks for, the subsets its text needs (latin always;
// latin-ext only when a character of the words is outside latin), each as one @font-face with a data: URI. Nothing is loaded by path.
// The faces are declared under an alias (`VF Fraunces`) so they never clash with a brand's own fonts of the same name.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR } from '../core.mjs';

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
