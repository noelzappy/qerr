// Command line flags for `design <template> ...` -> a spec object, plus the flags that control the run.
import fs from 'node:fs';
import path from 'node:path';

const VALUE = new Set(['image', 'headline', 'sub', 'eyebrow', 'focal', 'zoom', 'text-at', 'scrim', 'scrim-peak', 'series', 'label', 'ground', 'accent', 'head-right',
  'big', 'line', 'myth', 'fact-lead', 'fact', 'layout', 'device', 'title', 'region', 'align', 'photo-top', 'phone-top', 'size', 'sizes', 'out', 'out-dir', 'name', 'spec', 'kind', 'only', 'lines']);
const REPEAT = new Set(['stat', 'pill', 'check']);
const BOOL = new Set(['no-lines', 'strict', 'no-write', 'quiet', 'framed', 'tilt', 'fade', 'no-glow', 'no-dots', 'map']);

// Turns "a\nb" typed in a shell (a backslash and an n) into a real line break.
const unescapeText = (s) => s.replace(/\\n/g, '\n');

export function parseDesignArgs(argv) {
  const flags = {};
  const pos = [];
  const errors = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2);
    if (VALUE.has(key) || REPEAT.has(key)) {
      const v = argv[++i];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) { errors.push(`--${key} needs a value`); continue; }
      if (REPEAT.has(key)) (flags[key] ??= []).push(v); else flags[key] = v;
    } else if (BOOL.has(key)) flags[key] = true;
    else errors.push(`unknown flag --${key}`);
  }
  return { flags, pos, errors };
}

// Flags -> the design spec for one template. Only what was given is set; defaults live in the templates.
export function specFromFlags(template, flags, { cwd = process.cwd() } = {}) {
  if (flags.spec) {
    const file = path.resolve(cwd, flags.spec);
    if (!fs.existsSync(file)) throw new Error(`spec file not found: ${flags.spec}`);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${flags.spec} is not valid JSON: ${e.message}`); }
    return { ...raw, template, ...(flags.sizes ? { sizes: flags.sizes } : {}), ...(flags.name ? { name: flags.name } : {}) };
  }
  const spec = { template };
  const text = (k) => { if (flags[k] !== undefined) spec[k] = unescapeText(flags[k]); };
  for (const k of ['headline', 'sub', 'eyebrow', 'label', 'big', 'line', 'myth', 'fact']) text(k);
  if (flags['fact-lead'] !== undefined) spec.factLead = unescapeText(flags['fact-lead']);
  if (flags['head-right']) spec.headRight = flags['head-right'];
  for (const k of ['series', 'ground', 'accent', 'layout', 'device', 'align']) if (flags[k]) spec[k] = flags[k];
  if (flags['photo-top'] !== undefined) spec.photoTop = Number(flags['photo-top']);
  if (flags['phone-top'] !== undefined) spec.phoneTop = Number(flags['phone-top']);
  if (flags.size !== undefined) spec.size = Number(flags.size);
  if (flags.title !== undefined) spec.title = flags.title;
  if (flags.region !== undefined) spec.region = Number(flags.region);
  if (flags.framed) spec.framed = true;
  if (flags.tilt) spec.tilt = true;
  for (const k of ['fade', 'map']) if (flags[k]) spec[k] = true;
  if (flags['no-glow']) spec.glow = false;
  if (flags['no-dots']) spec.dots = false;
  if (flags.pill) spec.pills = flags.pill;
  if (flags.check) spec.checks = flags.check;
  if (flags.zoom !== undefined) spec.zoom = Number(flags.zoom);
  if (flags.image) spec.image = flags.image;
  if (flags.focal) spec.focal = flags.focal;
  if (flags['text-at']) spec.textAt = flags['text-at'];
  if (flags.scrim) spec.scrim = flags.scrim;
  if (flags['scrim-peak'] !== undefined) spec.scrimPeak = Number(flags['scrim-peak']);
  if (flags.sizes) spec.sizes = flags.sizes;
  if (flags.name) spec.name = flags.name;
  if (flags.kind) spec.kind = flags.kind;
  if (flags.stat) spec.stats = flags.stat;
  if (flags['no-lines']) spec.lines = false;
  else if (flags.lines) spec.lines = flags.lines === 'none' ? false : flags.lines;
  return spec;
}
