// Loads brand.json from the brand pack (BRAND_DIR, see core.mjs), the one place for colours, surfaces, shadows, radii, window chrome, fonts, logos, series, website,
// tagline and spelling rules.
// Every value is checked here and the CSS is built from the checked numbers, so nothing in the file can become markup.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, brandFile, repoPath } from '../core.mjs';
import { readBrandAsset } from './assets.mjs';
import { ACCENT_STYLES, GRADIENT_NAMES, GROUND_NAMES, HEX, SERIES_KEY, SHADOW_NAMES } from './tokens.mjs';

const REQUIRED = ['name', 'website', 'tagline', 'grounds', 'text', 'accents', 'surfaces', 'scale', 'radius', 'shadows', 'window', 'phone', 'glow', 'dots', 'gradient', 'figure', 'poster', 'font', 'logos', 'series', 'spelling', 'lint', 'contrast', 'photo'];
const RANGE = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(, ?U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;
const FAMILY = /^[A-Za-z0-9 _-]{1,40}$/;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// A shadow layer: finite numbers in sane ranges, a #rrggbb colour and an alpha from 0 to 1.
export function shadowProblems(s, where) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return [`${where} must be an object`];
  const bad = [];
  for (const [k, lo, hi] of [['x', -200, 200], ['y', -200, 200], ['blur', 0, 300], ['spread', -200, 200]]) {
    if (!isNum(s[k], lo, hi)) bad.push(`${where}.${k} must be a number from ${lo} to ${hi}`);
  }
  if (typeof s.color !== 'string' || !HEX.test(s.color)) bad.push(`${where}.color must be a #rrggbb colour`);
  if (!isNum(s.alpha, 0, 1)) bad.push(`${where}.alpha must be a number from 0 to 1`);
  if (s.inset !== undefined && typeof s.inset !== 'boolean') bad.push(`${where}.inset must be true or false`);
  return bad;
}

const colourAlpha = (o, where, errors) => {
  if (!o || typeof o !== 'object' || typeof o.color !== 'string' || !HEX.test(o.color)) errors.push(`brand.json: ${where}.color must be a #rrggbb colour`);
  if (!isNum(o?.alpha, 0, 1)) errors.push(`brand.json: ${where}.alpha must be a number from 0 to 1`);
};

export function validateBrand(b) {
  const errors = [];
  if (!b || typeof b !== 'object') return ['brand.json must be a JSON object'];
  for (const k of REQUIRED) if (b[k] === undefined) errors.push(`brand.json: "${k}" is missing`);
  if (errors.length) return errors;
  for (const k of ['name', 'website', 'tagline', 'descriptor']) {
    if (b[k] === undefined && k === 'descriptor') continue;
    if (typeof b[k] !== 'string' || !b[k] || b[k].length > 200) errors.push(`brand.json: ${k} must be a text of up to 200 characters`);
  }
  if (b.timezone !== undefined) {
    let ok = typeof b.timezone === 'string';
    try { if (ok) new Intl.DateTimeFormat('en', { timeZone: b.timezone }); } catch { ok = false; }
    if (!ok) errors.push('brand.json: timezone must be an IANA time zone such as Europe/London');
  }
  // What the AI is told about the brand beyond its name: the voice, the language, the visual direction and the style briefs of
  // the design references people uploaded. Plain text for the model only; none of it is ever placed in a rendered page.
  for (const [k, max] of [['voice', 4000], ['visualDirection', 4000], ['language', 60]]) {
    if (b[k] !== undefined && (typeof b[k] !== 'string' || b[k].length > max)) errors.push(`brand.json: ${k} must be a text of up to ${max} characters`);
  }
  if (b.references !== undefined && (!Array.isArray(b.references) || b.references.length > 24 || b.references.some((r) => typeof r !== 'string' || !r.trim() || r.length > 2000))) {
    errors.push('brand.json: references must be a list of up to 24 texts of up to 2000 characters (style briefs of design references)');
  }
  if (b.money !== undefined) {
    const m = b.money;
    if (!m || typeof m !== 'object' || Array.isArray(m)) errors.push('brand.json: money must be an object with local and foreign');
    else {
      if (typeof m.local !== 'string' || !m.local || m.local.length > 200) errors.push('brand.json: money.local must be a text of up to 200 characters (what the brand\'s money is)');
      let ok = typeof m.foreign === 'string' && m.foreign.length > 0 && m.foreign.length <= 300;
      try { if (ok) new RegExp(m.foreign, 'i'); } catch { ok = false; }
      if (!ok) errors.push('brand.json: money.foreign must be a pattern of up to 300 characters that matches other currencies');
    }
  }
  const hexes = (obj, where, keys) => { for (const k of keys) if (typeof obj?.[k] !== 'string' || !HEX.test(obj[k])) errors.push(`brand.json: ${where}.${k} must be a #rrggbb colour`); };
  const same = (obj, where, keys) => { const extra = Object.keys(obj ?? {}).filter((k) => !keys.includes(k)); if (extra.length) errors.push(`brand.json: ${where} has unknown entries (${extra.join(', ')})`); };
  hexes(b.grounds, 'grounds', GROUND_NAMES); same(b.grounds, 'grounds', GROUND_NAMES);
  hexes(b.text, 'text', ['ink', 'body', 'muted', 'mutedInv', 'invBody']); colourAlpha(b.text?.hair, 'text.hair', errors);
  hexes(b.accents, 'accents', ['gold', 'goldDeep', 'primary']);
  hexes(b.gradient, 'gradient', GRADIENT_NAMES); same(b.gradient, 'gradient', GRADIENT_NAMES);
  hexes(b.surfaces, 'surfaces', ['panel', 'card']); colourAlpha(b.surfaces?.line, 'surfaces.line', errors);
  if (!isNum(b.scale, 1, 4)) errors.push('brand.json: scale must be a number from 1 to 4 (post pixels per website pixel)');
  for (const k of ['card', 'device', 'button']) if (!isNum(b.radius?.[k], 0, 64)) errors.push(`brand.json: radius.${k} must be a number from 0 to 64`);
  for (const name of SHADOW_NAMES) {
    const list = b.shadows?.[name];
    if (!Array.isArray(list) || list.length < 1 || list.length > 8) { errors.push(`brand.json: shadows.${name} must be a list of 1 to 8 layers`); continue; }
    list.forEach((s, i) => errors.push(...shadowProblems(s, `brand.json: shadows.${name}[${i}]`)));
  }
  (b.shadows?.phone ?? []).forEach((s, i) => { if (s?.spread !== 0 || s?.inset) errors.push(`brand.json: shadows.phone[${i}] is a drop shadow: spread must be 0 and it cannot be inset`); });
  const w = b.window ?? {};
  for (const [k, lo, hi] of [['refWidth', 100, 4000], ['bar', 8, 200], ['dot', 1, 60], ['dotGap', 0, 60], ['padX', 0, 200], ['titleGap', 0, 200], ['titleSize', 4, 60], ['titlePadX', 0, 60], ['titlePadY', 0, 60]]) {
    if (!isNum(w[k], lo, hi)) errors.push(`brand.json: window.${k} must be a number from ${lo} to ${hi}`);
  }
  if (!isNum(w.tilt?.perspective, 100, 10000)) errors.push('brand.json: window.tilt.perspective must be a number from 100 to 10000');
  for (const k of ['rotateX', 'rotateY']) if (!isNum(w.tilt?.[k], -30, 30)) errors.push(`brand.json: window.tilt.${k} must be a number of degrees from -30 to 30`);
  if (!isNum(b.phone?.refWidth, 100, 2000)) errors.push('brand.json: phone.refWidth must be a number from 100 to 2000');
  if (!isNum(b.phone?.fade, 0, 400)) errors.push('brand.json: phone.fade must be a number from 0 to 400 (website pixels)');
  for (const [k, lo, hi] of [['opacity', 0, 1], ['blur', 0, 200], ['inset', 0, 200]]) if (!isNum(b.glow?.[k], lo, hi)) errors.push(`brand.json: glow.${k} must be a number from ${lo} to ${hi}`);
  for (const [k, lo, hi] of [['size', 0.5, 10], ['spacing', 4, 200], ['alpha', 0, 1]]) if (!isNum(b.dots?.[k], lo, hi)) errors.push(`brand.json: dots.${k} must be a number from ${lo} to ${hi}`);
  if (b.art !== undefined) errors.push('brand.json: art is no longer used (it was dropped); remove it');
  const P = b.poster ?? {};
  if (!Number.isInteger(P.headlineWeight) || P.headlineWeight < 100 || P.headlineWeight > 900) errors.push('brand.json: poster.headlineWeight must be a whole number from 100 to 900');
  if (!isNum(P.tracking, -0.1, 0.1)) errors.push('brand.json: poster.tracking must be a number of em from -0.1 to 0.1');
  if (!isNum(P.leading, 0.9, 1.6)) errors.push('brand.json: poster.leading must be a line height from 0.9 to 1.6');
  hexes(P.slabs, 'poster.slabs', ['myth', 'fact']);
  if (!isNum(P.slabRadius, 0, 80)) errors.push('brand.json: poster.slabRadius must be a number from 0 to 80');
  for (const [k, lo, hi] of [['alpha', 0, 0.2], ['spacing', 3, 60], ['angle', 0, 180]]) if (!isNum(P.texture?.[k], lo, hi)) errors.push(`brand.json: poster.texture.${k} must be a number from ${lo} to ${hi}`);
  for (const k of ['strong', 'soft', 'grid']) if (!isNum(b.figure?.[k], 0, 1)) errors.push(`brand.json: figure.${k} must be a number from 0 to 1`);
  const f = b.font ?? {};
  for (const k of ['family', 'mono']) if (!FAMILY.test(f[k] ?? '')) errors.push(`brand.json: font.${k} may only use letters, digits, space, _ and -`);
  for (const k of ['headlineWeight', 'accentWeight']) if (!Number.isInteger(f[k]) || f[k] < 100 || f[k] > 900) errors.push(`brand.json: font.${k} must be a whole number from 100 to 900`);
  if (!isNum(f.tracking, -0.1, 0.1)) errors.push('brand.json: font.tracking must be a number of em from -0.1 to 0.1');
  if (!isNum(f.leading, 0.9, 1.6)) errors.push('brand.json: font.leading must be a line height from 0.9 to 1.6');
  if (!Array.isArray(f.files) || !f.files.length || f.files.length > 12) errors.push('brand.json: font.files must be a list of 1 to 12 font files');
  else f.files.forEach((x, i) => {
    if (!['sans', 'mono'].includes(x?.role)) errors.push(`brand.json: font.files[${i}].role must be "sans" or "mono"`);
    if (typeof x?.weight !== 'string' || !/^\d{3}( \d{3})?$/.test(x.weight)) errors.push(`brand.json: font.files[${i}].weight must look like "400" or "300 700"`);
    if (typeof x?.file !== 'string' || !x.file.endsWith('.woff2')) errors.push(`brand.json: font.files[${i}].file must be a .woff2 path`);
    if (typeof x?.range !== 'string' || !RANGE.test(x.range)) errors.push(`brand.json: font.files[${i}].range must be a unicode-range like "U+0000-00FF, U+20AC"`);
  });
  const lg = b.logos ?? {};
  if (typeof lg.full !== 'string' || typeof lg.mark !== 'string') errors.push('brand.json: logos.full and logos.mark must be paths');
  if (!Array.isArray(lg.fullSize) || lg.fullSize.length !== 2 || !lg.fullSize.every((n) => Number.isInteger(n) && n > 0 && n < 20000)) errors.push('brand.json: logos.fullSize must be [width, height] in pixels');
  for (const k of ['wordmarkFrom', 'markGap']) if (!Number.isInteger(lg[k]) || lg[k] < 0 || lg[k] > 20000) errors.push(`brand.json: logos.${k} must be a whole number of pixels`);
  if (!b.series || typeof b.series !== 'object' || Array.isArray(b.series)) errors.push('brand.json: series must be an object of series');
  else for (const [key, s] of Object.entries(b.series)) {
    if (!SERIES_KEY.test(key)) errors.push(`brand.json: series key "${key}" may only use lowercase letters, digits and -`);
    if (typeof s?.name !== 'string' || !s.name.trim() || s.name.length > 40 || /[\n\r]/.test(s.name)) errors.push(`brand.json: series.${key}.name must be a short text (up to 40 characters, one line)`);
    if (!GROUND_NAMES.includes(s?.ground)) errors.push(`brand.json: series.${key}.ground must be one of ${GROUND_NAMES.join(', ')}`);
    if (!ACCENT_STYLES.includes(s?.accent)) errors.push(`brand.json: series.${key}.accent must be one of ${ACCENT_STYLES.join(', ')}`);
  }
  for (const k of ['headline', 'accent', 'sub', 'label', 'art', 'artbody']) if (!isNum(b.contrast?.[k], 1, 21)) errors.push(`brand.json: contrast.${k} must be a ratio from 1 to 21`);
  for (const r of b.spelling ?? []) {
    try { new RegExp(r.wrong, r.flags ?? ''); } catch { errors.push(`brand.json: spelling rule "${r.wrong}" is not a valid pattern`); }
  }
  return errors;
}

// The series keys of the brand file, without reading fonts or images (used to validate specs and batches).
export function loadSeries({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  try { return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).series ?? {}); } catch { return []; }
}

export function loadBrand({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  if (!fs.existsSync(file)) throw new Error(`brand file not found: ${path.relative(root, file)} (set BRAND_DIR to a brand pack such as brands/demo)`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${path.relative(root, file)} is not valid JSON: ${e.message}`); }
  const errors = validateBrand(raw);
  if (errors.length) throw new Error(`The brand file is not valid:\n  - ${errors.join('\n  - ')}`);
  const css = fs.readFileSync(repoPath('design/brand.css', root), 'utf8');
  return {
    ...raw, root, css,
    fontFaces: raw.font.files.map((x) => ({ ...x, family: x.role === 'sans' ? raw.font.family : raw.font.mono, src: readBrandAsset(x.file, { root, type: 'font/woff2' }) })),
    logoFullSrc: readBrandAsset(raw.logos.full, { root, type: 'image/png' }),
    logoMarkSrc: readBrandAsset(raw.logos.mark, { root, type: 'image/png' }),
    map: loadMap(path.join(path.dirname(file), 'map.json')),
  };
}

// The pack's dot map (map.json), or null when the brand has none. Only whole numbers, fractions and short names: nothing in it
// becomes markup, the map is drawn from the numbers.
export function mapProblems(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['map.json must be a JSON object'];
  const errors = [];
  const cols = m.grid?.cols, rows = m.grid?.rows;
  if (!Number.isInteger(cols) || cols < 2 || cols > 400 || !Number.isInteger(rows) || rows < 2 || rows > 400) errors.push('map.json: grid.cols and grid.rows must be whole numbers from 2 to 400');
  if (!Array.isArray(m.regions) || !m.regions.length || m.regions.length > 100) return [...errors, 'map.json: regions must be a list of 1 to 100 regions'];
  m.regions.forEach((r, i) => {
    const where = `map.json: regions[${i}]`;
    if (typeof r?.name !== 'string' || !r.name || r.name.length > 80) errors.push(`${where}.name must be a text of up to 80 characters`);
    if (!Array.isArray(r?.capital) || r.capital.length !== 2 || !r.capital.every((n) => isNum(n, 0, 400))) errors.push(`${where}.capital must be [col, row]`);
    if (!Array.isArray(r?.cells) || r.cells.length % 2 || !r.cells.every((n, j) => Number.isInteger(n) && n >= 0 && n < (j % 2 ? rows : cols))) errors.push(`${where}.cells must be flat [col, row, ...] pairs inside the grid`);
  });
  const names = new Set(m.regions.map((r) => r?.name));
  if (!Array.isArray(m.lit) || m.lit.some((n) => !names.has(n))) errors.push('map.json: lit must list region names to light');
  return errors;
}

function loadMap(file) {
  if (!fs.existsSync(file)) return null;
  let m;
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`map.json is not valid JSON: ${e.message}`); }
  const errors = mapProblems(m);
  if (errors.length) throw new Error(`The brand's map is not valid:\n  - ${errors.join('\n  - ')}`);
  return { grid: m.grid, regions: m.regions, lit: m.lit };
}

const num = (n) => String(+Number(n).toFixed(3));
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${num(a)})`;

// "x y blur spread colour" for each validated layer, joined into one box-shadow value. k scales the offsets, blur and spread
// (the website's values are in its CSS pixels; a post is drawn at `scale` post pixels per website pixel).
export const shadowCss = (layers, k = 1) => layers.map((s) => `${s.inset ? 'inset ' : ''}${num(s.x * k)}px ${num(s.y * k)}px ${num(s.blur * k)}px ${num(s.spread * k)}px ${rgba(s.color, s.alpha)}`).join(',');
// The same layers as a CSS filter of drop-shadow()s (for a transparent phone capture, whose shadow follows the phone's outline).
export const dropShadowCss = (layers, k = 1) => layers.map((s) => `drop-shadow(${num(s.x * k)}px ${num(s.y * k)}px ${num(s.blur * k)}px ${rgba(s.color, s.alpha)})`).join(' ');
export const rgbaOf = (o) => rgba(o.color, o.alpha);

export function brandCssVars(brand) {
  const t = brand.text, a = brand.accents, s = brand.surfaces, k = brand.scale;
  const grounds = GROUND_NAMES.map((n) => `--g-${n}:${brand.grounds[n]}`).join(';');
  return [
    grounds,
    `--ink:${t.ink};--body:${t.body};--muted:${t.muted};--muted-inv:${t.mutedInv};--inv-body:${t.invBody};--hair:${rgba(t.hair.color, t.hair.alpha)}`,
    GRADIENT_NAMES.map((n, i) => `--gr-${i + 1}:${brand.gradient[n]}`).join(';'),
    `--dot:${rgba('#FFFFFF', brand.dots.alpha)};--dot-r:${num(brand.dots.size * k)}px;--dot-s:${num(brand.dots.spacing * k)}px`,
    `--glow-o:${num(brand.glow.opacity)};--glow-blur:${num(brand.glow.blur * k)}px;--glow-in:${num(brand.glow.inset * k)}px;--fade:${num(brand.phone.fade * k)}px`,
    `--fig-strong:${rgba(t.ink, brand.figure.strong)};--fig-soft:${rgba(t.ink, brand.figure.soft)};--fig-grid:${rgba(t.ink, brand.figure.grid)}`,
    `--gold:${a.gold};--gold-deep:${a.goldDeep};--primary:${a.primary}`,
    `--panel:${s.panel};--card:${s.card};--line:${rgba(s.line.color, s.line.alpha)}`,
    `--r-card:${num(brand.radius.card * k)}px;--r-btn:${num(brand.radius.button * k)}px`,
    `--shadow-card:${shadowCss(brand.shadows.card, k)}`,
    `--logo-full:url("${brand.logoFullSrc}")`,
    `--pw:${brand.poster.headlineWeight};--p-track:${num(brand.poster.tracking)}em;--p-lead:${num(brand.poster.leading)};--slab-myth:${brand.poster.slabs.myth};--slab-fact:${brand.poster.slabs.fact};--r-slab:${num(brand.poster.slabRadius)}px`,
    `--tex:${rgba('#FFFFFF', brand.poster.texture.alpha)};--tex-s:${num(brand.poster.texture.spacing)}px;--tex-a:${num(brand.poster.texture.angle)}deg`,
    `--font:'${brand.font.family}';--mono:'${brand.font.mono}';--hw:${brand.font.headlineWeight};--aw:${brand.font.accentWeight};--h-track:${num(brand.font.tracking)}em;--h-lead:${num(brand.font.leading)}`,
  ].join(';');
}
