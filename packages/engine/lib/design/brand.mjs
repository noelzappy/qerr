// Loads brand.json from the brand pack (BRAND_DIR, see core.mjs), the one place for colours, surfaces, shadows, radii, window chrome, fonts, logos, series, website,
// tagline and spelling rules.
// Every value is checked here and the CSS is built from the checked numbers, so nothing in the file can become markup.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, brandFile, repoPath } from '../core.mjs';
import { validateLayouts } from './layout.mjs';
import { validateLooks } from './look.mjs';
import { readBrandAsset, readBrandImage } from './assets.mjs';
import { numbersProblems } from './chart.mjs';
import {
  ACCENT_DEVICES, ACCENT_STYLES, ARTWORK_FITS, DECORATION_ON, DECORATIONS, FONT_ROLES, FOOTERS, GRADIENT_NAMES, GROUND_ALIASES, GROUND_NAMES, HEX, LOGO_PLACES,
  DIRECTIONS, PHOTO_TREATMENTS, SERIES_KEY, SHADOW_NAMES, STYLE_COLOURS, STYLE_DEFAULTS, SURFACES, TYPE_CASES, groundName, isDarkColour,
} from './tokens.mjs';

const REQUIRED = ['name', 'website', 'tagline', 'grounds', 'text', 'accents', 'surfaces', 'scale', 'radius', 'shadows', 'window', 'phone', 'glow', 'dots', 'gradient', 'figure', 'poster', 'font', 'logos', 'series', 'spelling', 'lint', 'contrast', 'photo'];
const RANGE = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(, ?U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;
const FAMILY = /^[A-Za-z0-9 _-]{1,40}$/;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
// font.files: at most this many in all, and per role (every weight from 100 to 900, in a latin and a latin-ext file each).
export const MAX_FONT_FILES = 64;
export const MAX_ROLE_FONT_FILES = 18;
// The weight a font file is declared for: one weight from 100 to 900, or a range of two ("300 700", lighter first).
const fontWeightOk = (w) => {
  const m = typeof w === 'string' ? /^(\d{3})(?: (\d{3}))?$/.exec(w) : null;
  if (!m) return false;
  const lo = Number(m[1]), hi = Number(m[2] ?? m[1]);
  return lo >= 100 && hi <= 900 && lo <= hi;
};
// A font file's path: relative, a .woff2, in plain path characters, with no ".." segment (loading it checks again that it
// stays inside the repository, see assets.mjs).
const fontPathOk = (p) => typeof p === 'string' && p.length <= 300 && /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.woff2$/.test(p) && !p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '');

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
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const OLD_NAME = Object.fromEntries(Object.entries(GROUND_ALIASES).map(([old, now]) => [now, old]));

// The grounds: one #rrggbb colour for each ground, under its name or its older name (white, tint, mint, gold-pale, ink), never both.
export function groundsProblems(g) {
  if (!isObj(g)) return ['brand.json: grounds must be an object of colours'];
  const errors = [], seen = {}, unknown = [];
  for (const [k, v] of Object.entries(g)) {
    const n = groundName(k);
    if (!n) { unknown.push(k); continue; }
    if (seen[n]) errors.push(`brand.json: grounds.${seen[n]} and grounds.${k} are the same ground (${n}); keep one`);
    seen[n] = k;
    if (typeof v !== 'string' || !HEX.test(v)) errors.push(`brand.json: grounds.${k} must be a #rrggbb colour`);
  }
  if (unknown.length) errors.push(`brand.json: grounds has unknown entries (${unknown.join(', ')})`);
  for (const n of GROUND_NAMES) if (!seen[n]) errors.push(`brand.json: grounds.${n} must be a #rrggbb colour${OLD_NAME[n] ? ` (or give it under its older name ${OLD_NAME[n]})` : ''}`);
  return errors;
}

// The grounds under their neutral names (call groundsProblems first).
export function canonicalGrounds(g) {
  const out = {};
  for (const [k, v] of Object.entries(g ?? {})) { const n = groundName(k); if (n) out[n] = v; }
  return out;
}

// The style block (brand.json `style`): every field optional, each a value from a fixed list or a number in a range. Nothing in
// it is ever written into the page as it is: it picks class names and variables from tables (see styleCss).
export function styleProblems(s, where = 'brand.json: style', { looks } = {}) {
  if (s === undefined) return [];
  if (!isObj(s)) return [`${where} must be an object`];
  const e = [];
  const only = (o, keys, w) => { const extra = Object.keys(o).filter((k) => !keys.includes(k)); if (extra.length) e.push(`${w} has unknown entries (${extra.join(', ')})`); };
  const pick = (v, list, w) => { if (v !== undefined && !list.includes(v)) e.push(`${w} must be one of ${list.join(', ')}`); };
  const obj = (v, w) => { if (v === undefined) return false; if (!isObj(v)) { e.push(`${w} must be an object`); return false; } return true; };
  only(s, ['type', 'surface', 'decoration', 'photo', 'logo', 'footer', 'direction'], where);
  if (obj(s.type, `${where}.type`)) {
    const t = s.type;
    only(t, ['display', 'body', 'label', 'scale', 'accent'], `${where}.type`);
    for (const role of ['display', 'body', 'label']) {
      const w = `${where}.type.${role}`;
      if (!obj(t[role], w)) continue;
      only(t[role], ['case', 'tracking', 'weight'], w);
      pick(t[role].case, TYPE_CASES, `${w}.case`);
      if (t[role].tracking !== undefined && !isNum(t[role].tracking, -0.1, 0.3)) e.push(`${w}.tracking must be a number of em from -0.1 to 0.3`);
      if (t[role].weight !== undefined && !(Number.isInteger(t[role].weight) && t[role].weight >= 100 && t[role].weight <= 900)) e.push(`${w}.weight must be a whole number from 100 to 900`);
    }
    if (t.scale !== undefined && !isNum(t.scale, 0.8, 1.25)) e.push(`${where}.type.scale must be a number from 0.8 to 1.25 (the headline sizes are multiplied by it)`);
    pick(t.accent, ACCENT_DEVICES, `${where}.type.accent`);
  }
  pick(s.surface, SURFACES, `${where}.surface`);
  if (obj(s.decoration, `${where}.decoration`)) {
    const d = s.decoration, w = `${where}.decoration`;
    only(d, ['kind', 'on', 'artwork', 'fit', 'opacity', 'alpha'], w);
    pick(d.kind, DECORATIONS, `${w}.kind`);
    pick(d.on, DECORATION_ON, `${w}.on`);
    pick(d.fit, ARTWORK_FITS, `${w}.fit`);
    if (d.artwork !== undefined && (typeof d.artwork !== 'string' || d.artwork.length > 300 || d.artwork.includes('\0') || !/\.(png|jpe?g|webp)$/i.test(d.artwork))) e.push(`${w}.artwork must be the path of a .png, .jpg or .webp picture`);
    if (d.kind === 'artwork' && d.artwork === undefined) e.push(`${w}.artwork is needed when the decoration is artwork`);
    if (d.opacity !== undefined && !isNum(d.opacity, 0.05, 1)) e.push(`${w}.opacity must be a number from 0.05 to 1`);
    if (d.alpha !== undefined && !isNum(d.alpha, 0.01, 0.4)) e.push(`${w}.alpha must be a number from 0.01 to 0.4 (how strong dots, grid and lines are)`);
  }
  if (obj(s.photo, `${where}.photo`)) {
    const p = s.photo, w = `${where}.photo`;
    only(p, ['treatment', 'strength', 'colour', 'shadows', 'highlights'], w);
    pick(p.treatment, PHOTO_TREATMENTS, `${w}.treatment`);
    for (const k of ['colour', 'shadows', 'highlights']) pick(p[k], STYLE_COLOURS, `${w}.${k}`);
    if (p.strength !== undefined && !isNum(p.strength, 0, 1)) e.push(`${w}.strength must be a number from 0 to 1`);
  }
  pick(s.logo, LOGO_PLACES, `${where}.logo`);
  // a shipped direction (the engine's own looks) or the id of one of the brand's own looks (brand.looks)
  const own = (Array.isArray(looks) ? looks : []).map((l) => (l && typeof l === 'object' && typeof l.id === 'string' ? l.id : null)).filter(Boolean);
  pick(s.direction, [...DIRECTIONS, ...own.filter((x) => !DIRECTIONS.includes(x))], `${where}.direction`);
  pick(s.footer, FOOTERS, `${where}.footer`);
  return e;
}

// The style block with the defaults filled in (call styleProblems first).
export function resolveStyle(s = {}) {
  const D = STYLE_DEFAULTS, t = s.type ?? {};
  return {
    type: {
      display: { ...D.type.display, ...t.display }, body: { ...D.type.body, ...t.body }, label: { ...D.type.label, ...t.label },
      scale: t.scale ?? D.type.scale, accent: t.accent ?? D.type.accent,
    },
    surface: s.surface ?? D.surface,
    decoration: { ...D.decoration, ...s.decoration },
    photo: { ...D.photo, ...s.photo },
    logo: s.logo ?? D.logo,
    footer: s.footer ?? D.footer,
    // the design direction (the `post` template): absent means none, and the style block then equals the defaults exactly
    ...(s.direction !== undefined ? { direction: s.direction } : {}),
  };
}

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
  // the design references people uploaded. Plain text for the model only; none of it is ever placed in a rendered page. (What a
  // reference changes in the pixels arrives as checked `style` and colour values, once an admin accepts it in Settings.)
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
  // how the brand writes numbers in a chart (decimal mark, thousands, currency, percent): fixed lists and one short currency sign (chart.mjs)
  errors.push(...numbersProblems(b.numbers));
  const hexes = (obj, where, keys) => { for (const k of keys) if (typeof obj?.[k] !== 'string' || !HEX.test(obj[k])) errors.push(`brand.json: ${where}.${k} must be a #rrggbb colour`); };
  const same = (obj, where, keys) => { const extra = Object.keys(obj ?? {}).filter((k) => !keys.includes(k)); if (extra.length) errors.push(`brand.json: ${where} has unknown entries (${extra.join(', ')})`); };
  errors.push(...groundsProblems(b.grounds));
  hexes(b.text, 'text', ['ink', 'body', 'muted', 'mutedInv', 'invBody']); colourAlpha(b.text?.hair, 'text.hair', errors);
  // inverse: headlines on dark grounds (default: the light ground's colour)
  if (b.text?.inverse !== undefined) hexes(b.text, 'text', ['inverse']);
  hexes(b.accents, 'accents', ['gold', 'goldDeep', 'primary']);
  hexes(b.gradient, 'gradient', GRADIENT_NAMES); same(b.gradient, 'gradient', GRADIENT_NAMES);
  hexes(b.surfaces, 'surfaces', ['panel', 'card']); colourAlpha(b.surfaces?.line, 'surfaces.line', errors);
  // outline: the line of outlined cards and panels (default: the ink)
  if (b.surfaces?.outline !== undefined) hexes(b.surfaces, 'surfaces', ['outline']);
  errors.push(...styleProblems(b.style, undefined, { looks: b.looks }));
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
  // display (headlines) and label (labels, footers): optional families of their own, each the sans, the mono, or a family with
  // files of that role.
  for (const k of ['display', 'label']) {
    if (f[k] === undefined) continue;
    if (!FAMILY.test(f[k])) { errors.push(`brand.json: font.${k} may only use letters, digits, space, _ and -`); continue; }
    if (f[k] !== f.family && f[k] !== f.mono && !(Array.isArray(f.files) && f.files.some((x) => x?.role === k))) errors.push(`brand.json: font.${k} names "${f[k]}", which has no font files: add font.files with role "${k}", or name font.family or font.mono`);
  }
  for (const k of ['headlineWeight', 'accentWeight']) if (!Number.isInteger(f[k]) || f[k] < 100 || f[k] > 900) errors.push(`brand.json: font.${k} must be a whole number from 100 to 900`);
  if (!isNum(f.tracking, -0.1, 0.1)) errors.push('brand.json: font.tracking must be a number of em from -0.1 to 0.1');
  if (!isNum(f.leading, 0.9, 1.6)) errors.push('brand.json: font.leading must be a line height from 0.9 to 1.6');
  if (!Array.isArray(f.files) || !f.files.length || f.files.length > MAX_FONT_FILES) errors.push(`brand.json: font.files must be a list of 1 to ${MAX_FONT_FILES} font files`);
  else {
    f.files.forEach((x, i) => {
      if (!FONT_ROLES.includes(x?.role)) errors.push(`brand.json: font.files[${i}].role must be one of ${FONT_ROLES.join(', ')}`);
      else if ((x.role === 'display' || x.role === 'label') && f[x.role] === undefined) errors.push(`brand.json: font.files[${i}] is a ${x.role} font, but font.${x.role} names no family for it`);
      if (!fontWeightOk(x?.weight)) errors.push(`brand.json: font.files[${i}].weight must be a weight from 100 to 900 or a range of two, lighter first, like "400" or "300 700"`);
      if (!fontPathOk(x?.file)) errors.push(`brand.json: font.files[${i}].file must be the relative path of a .woff2 file inside the brand pack or the engine (no "..", no absolute path)`);
      if (typeof x?.range !== 'string' || x.range.length > 2000 || !RANGE.test(x.range)) errors.push(`brand.json: font.files[${i}].range must be a unicode-range like "U+0000-00FF, U+20AC"`);
    });
    for (const role of FONT_ROLES) {
      const n = f.files.filter((x) => x?.role === role).length;
      if (n > MAX_ROLE_FONT_FILES) errors.push(`brand.json: font.files has ${n} files of role ${role}; the most for one role is ${MAX_ROLE_FONT_FILES} (every weight from 100 to 900 in two subsets)`);
    }
  }
  const lg = b.logos ?? {};
  if (typeof lg.full !== 'string' || typeof lg.mark !== 'string') errors.push('brand.json: logos.full and logos.mark must be paths');
  if (!Array.isArray(lg.fullSize) || lg.fullSize.length !== 2 || !lg.fullSize.every((n) => Number.isInteger(n) && n > 0 && n < 20000)) errors.push('brand.json: logos.fullSize must be [width, height] in pixels');
  for (const k of ['wordmarkFrom', 'markGap']) if (!Number.isInteger(lg[k]) || lg[k] < 0 || lg[k] > 20000) errors.push(`brand.json: logos.${k} must be a whole number of pixels`);
  if (!b.series || typeof b.series !== 'object' || Array.isArray(b.series)) errors.push('brand.json: series must be an object of series');
  else for (const [key, s] of Object.entries(b.series)) {
    if (!SERIES_KEY.test(key)) errors.push(`brand.json: series key "${key}" may only use lowercase letters, digits and -`);
    if (typeof s?.name !== 'string' || !s.name.trim() || s.name.length > 40 || /[\n\r]/.test(s.name)) errors.push(`brand.json: series.${key}.name must be a short text (up to 40 characters, one line)`);
    if (!groundName(s?.ground)) errors.push(`brand.json: series.${key}.ground must be one of ${GROUND_NAMES.join(', ')} (or an older name: ${Object.keys(GROUND_ALIASES).join(', ')})`);
    if (!ACCENT_STYLES.includes(s?.accent)) errors.push(`brand.json: series.${key}.accent must be one of ${ACCENT_STYLES.join(', ')}`);
  }
  for (const k of ['headline', 'accent', 'sub', 'label', 'art', 'artbody']) if (!isNum(b.contrast?.[k], 1, 21)) errors.push(`brand.json: contrast.${k} must be a ratio from 1 to 21`);
  if (b.contrast?.display !== undefined && !isNum(b.contrast.display, 3, 7)) errors.push('brand.json: contrast.display must be a ratio from 3 to 7 (the target for large headlines on look pages; 4.5 when left out)');
  for (const r of b.spelling ?? []) {
    try { new RegExp(r.wrong, r.flags ?? ''); } catch { errors.push(`brand.json: spelling rule "${r.wrong}" is not a valid pattern`); }
  }
  // The brand's own compositions (layouts as data, lib/design/layout.mjs): each checked in full, ids unique.
  errors.push(...validateLayouts(b.layouts));
  // The brand's own looks (looks as data, lib/design/look.mjs): at most MAX_LOOKS, each checked in full, ids unique; the problems name where they are.
  errors.push(...validateLooks(b.looks, 'brand.json: looks'));
  return errors;
}

// The series keys of the brand file, without reading fonts or images (used to validate specs and batches).
export function loadSeries({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  try { return Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')).series ?? {}); } catch { return []; }
}

// The brand file's design direction (style.direction) or null, without reading fonts or images (used to validate a `post` design).
export function loadDirection({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).style?.direction ?? null; } catch { return null; }
}

// The look the brand's direction names (style.direction is the id of an entry of brand.looks), as written in the file, or null (a code
// direction, none, or no file). Not validated here: loadBrand validates the whole file, and the interpreter validates the look again.
export function loadLook({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  try {
    const b = JSON.parse(fs.readFileSync(file, 'utf8'));
    const id = b.style?.direction;
    return Array.isArray(b.looks) && typeof id === 'string' ? b.looks.find((l) => l && typeof l === 'object' && l.id === id) ?? null : null;
  } catch { return null; }
}

export function loadBrand({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  if (!fs.existsSync(file)) throw new Error(`brand file not found: ${path.relative(root, file)} (set BRAND_DIR to a brand pack such as brands/demo)`);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${path.relative(root, file)} is not valid JSON: ${e.message}`); }
  const errors = validateBrand(raw);
  if (errors.length) throw new Error(`The brand file is not valid:\n  - ${errors.join('\n  - ')}`);
  const css = fs.readFileSync(repoPath('design/brand.css', root), 'utf8');
  return { ...normaliseBrand(raw), root, css, ...brandAssets(raw, { root }), map: loadMap(path.join(path.dirname(file), 'map.json')) };
}

// A checked brand file in the engine's own terms: grounds and series grounds under their neutral names, the optional colours
// filled in, the style block with its defaults, and which grounds are dark (worked out from their colours). No file is read.
export function normaliseBrand(raw) {
  const grounds = canonicalGrounds(raw.grounds);
  const series = Object.fromEntries(Object.entries(raw.series).map(([k, s]) => [k, { ...s, ground: groundName(s.ground) }]));
  return {
    ...raw, grounds, series,
    // inverse (type on dark grounds) defaults to the light ground, or to white when the brand's light ground is itself dark
    text: { ...raw.text, inverse: raw.text.inverse ?? (isDarkColour(grounds.light) ? '#FFFFFF' : grounds.light) },
    surfaces: { ...raw.surfaces, outline: raw.surfaces.outline ?? raw.text.ink },
    font: { ...raw.font, display: raw.font.display ?? raw.font.family, label: raw.font.label ?? raw.font.mono },
    style: resolveStyle(raw.style),
    darkGrounds: GROUND_NAMES.filter((n) => isDarkColour(grounds[n])),
  };
}

// Whether a ground (by name or older name) of a loaded brand is dark: white type on it, the dark decoration.
export const groundIsDark = (brand, g) => (brand.darkGrounds ?? []).includes(groundName(g));

// The brand's files, read, checked and embedded as data: URIs: the fonts (each under the family of its role), the logos and
// the artwork of the decoration.
function brandAssets(raw, { root }) {
  const familyOf = { sans: raw.font.family, mono: raw.font.mono, display: raw.font.display, label: raw.font.label };
  const d = raw.style?.decoration;
  return {
    fontFaces: raw.font.files.map((x) => ({ ...x, family: familyOf[x.role], src: readBrandAsset(x.file, { root, type: 'font/woff2' }) })),
    logoFullSrc: readBrandAsset(raw.logos.full, { root, type: 'image/png' }),
    logoMarkSrc: readBrandAsset(raw.logos.mark, { root, type: 'image/png' }),
    artworkSrc: d?.kind === 'artwork' && d.artwork ? readBrandImage(d.artwork, { root }) : null,
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

// The brand colours a photo treatment may name (STYLE_COLOURS), as the variables that hold them.
const STYLE_COLOUR_VAR = { primary: 'var(--primary)', accent: 'var(--gold)', ink: 'var(--ink)', inverse: 'var(--inv)', ...Object.fromEntries(GROUND_NAMES.map((n) => [n, `var(--g-${n})`])) };
const CASE = { 'as-typed': 'none', upper: 'uppercase' };
// An entry of one of these tables, or the fallback: a key that is not the table's own (even "__proto__") never picks anything.
const pickOf = (table, key, fallback) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : fallback);

// The weights of the type roles, as the page's variables carry them: --hw (headlines, and bold words in body text), --aw (the
// lighter accent and big figures), --pw (poster headlines), --b-w (body text) and --l-w (labels). A display weight set in the
// style block applies to the editorial and the poster headlines alike; without one each keeps its own (font.* and poster.*).
// (validateBrand has checked them; a value that is not a number in range is still never copied: it falls back.)
function typeWeights(brand) {
  const ty = brand.style.type;
  const weight = (v, d) => (Number.isInteger(v) && v >= 100 && v <= 900 ? v : d);
  const dw = weight(ty.display.weight, null);
  return {
    hw: dw ?? brand.font.headlineWeight, pw: dw ?? brand.poster.headlineWeight, aw: dw ? Math.max(100, dw - 300) : brand.font.accentWeight,
    bw: weight(ty.body.weight, 400), lw: weight(ty.label.weight, 500),
  };
}

// The fixed weights the stylesheets (design/brand.css, design/layout.css) and the templates set in each role's family, besides
// the variables above. sans (var(--font), the page's own family): plain text 400, the website and pills 500 (.purl, .pill,
// .ly-url), tags and the brand name in a footer 600 (.tag, .ly-tag, .pmark span). display (var(--display)): the plain brand
// name of a layout, 600 (.ly-plain). mono (var(--mono)): the labels and values of drawn figures, 400 and 500 (svg.fig .fl,
// .fv, .fn). test-design-fonts.mjs fails when a stylesheet sets a weight that is not listed here.
export const FIXED_ROLE_WEIGHTS = Object.freeze({ sans: [400, 500, 600], display: [600], label: [], mono: [400, 500] });

const sortedUnique = (list) => [...new Set(list)].sort((a, b) => a - b);

// The weights the page draws each type role at, for this brand: what a font for that role needs so that no weight is faked
// by the browser. sans: body text (--b-w), its bold words (--hw) and the fixed weights; display: headlines (--hw), the accent
// and big figures (--aw), poster headlines (--pw) and 600; label: --l-w; mono: the figures.
export function roleWeights(input) {
  const brand = input.darkGrounds ? input : normaliseBrand(input);
  const { hw, aw, pw, bw, lw } = typeWeights(brand);
  const F = FIXED_ROLE_WEIGHTS;
  return { sans: sortedUnique([...F.sans, bw, hw]), display: sortedUnique([...F.display, hw, aw, pw]), label: sortedUnique([...F.label, lw]), mono: sortedUnique(F.mono) };
}

// The weights each family of the brand is drawn at: a family that fills several roles (the sans for the headlines as well, a
// label font for the headlines) needs the weights of each.
export function familyWeights(input) {
  const brand = input.darkGrounds ? input : normaliseBrand(input);
  const byRole = roleWeights(brand);
  const familyOf = { sans: brand.font.family, mono: brand.font.mono, display: brand.font.display, label: brand.font.label };
  const out = {};
  for (const role of FONT_ROLES) out[familyOf[role]] = sortedUnique([...(out[familyOf[role]] ?? []), ...byRole[role]]);
  return out;
}

// The weight of `available` that stands in for `want`: the nearest; on a tie, the one CSS font matching would take (the
// heavier from 400 up to but not including 500, and above 500; the lighter below 400 and at 500).
export function nearestWeight(available, want) {
  let best = null;
  for (const w of available) {
    if (best === null) { best = w; continue; }
    const d = Math.abs(w - want), bd = Math.abs(best - want);
    if (d < bd || (d === bd && (w > best) === heavierWins(want))) best = w;
  }
  return best;
}
const heavierWins = (want) => (want >= 400 && want < 500) || want > 500;

// The font-weight each of several weights of one family is declared for, so that every weight from 100 to 900 is drawn with
// the nearest of them (nearestWeight) and never with a synthetic bold: "100 549" and "550 900" for 400 and 700. A single
// weight is declared for all of 100 to 900.
export function weightRanges(weights) {
  const list = sortedUnique(weights.filter((w) => Number.isInteger(w) && w >= 100 && w <= 900));
  const out = new Map();
  let lo = 100;
  list.forEach((w, i) => {
    const next = list[i + 1];
    let hi = 900;
    if (next !== undefined) {
      hi = lo;
      for (let x = lo; x < next; x++) if (nearestWeight([w, next], x) === w) hi = x;
    }
    out.set(w, `${lo} ${hi}`);
    lo = hi + 1;
  });
  return out;
}

// The page's variables, built from the checked numbers and colours. The style block only picks entries of the fixed tables above
// or gives numbers in their ranges; nothing in it is copied into the CSS as it is.
export function brandCssVars(input) {
  const brand = input.darkGrounds ? input : normaliseBrand(input);
  const t = brand.text, a = brand.accents, s = brand.surfaces, k = brand.scale, st = brand.style, ty = st.type, deco = st.decoration, ph = st.photo;
  const grounds = GROUND_NAMES.map((n) => `--g-${n}:${brand.grounds[n]}`).join(';');
  const dotA = deco.alpha ?? brand.dots.alpha, texA = deco.alpha ?? brand.poster.texture.alpha;
  const em = (v, d) => (isNum(v, -0.1, 0.3) ? v : d);
  const dt = em(ty.display.tracking, null);
  const { hw, aw, pw, bw, lw } = typeWeights(brand);
  const lt = em(ty.label.tracking, 0.07);
  return [
    grounds,
    `--ink:${t.ink};--body:${t.body};--muted:${t.muted};--muted-inv:${t.mutedInv};--inv-body:${t.invBody};--inv:${t.inverse};--hair:${rgba(t.hair.color, t.hair.alpha)}`,
    GRADIENT_NAMES.map((n, i) => `--gr-${i + 1}:${brand.gradient[n]}`).join(';'),
    `--dot:${rgba(t.inverse, dotA)};--dot-l:${rgba(t.ink, dotA)};--dot-r:${num(brand.dots.size * k)}px;--dot-s:${num(brand.dots.spacing * k)}px;--grid-s:${num(brand.dots.spacing * k * 2)}px`,
    `--glow-o:${num(brand.glow.opacity)};--glow-blur:${num(brand.glow.blur * k)}px;--glow-in:${num(brand.glow.inset * k)}px;--fade:${num(brand.phone.fade * k)}px`,
    `--fig-strong:${rgba(t.ink, brand.figure.strong)};--fig-soft:${rgba(t.ink, brand.figure.soft)};--fig-grid:${rgba(t.ink, brand.figure.grid)}`,
    `--gold:${a.gold};--gold-deep:${a.goldDeep};--primary:${a.primary}`,
    `--panel:${s.panel};--card:${s.card};--line:${rgba(s.line.color, s.line.alpha)};--outline:${s.outline};--ow:${num(Math.max(1, 1.5 * k))}px`,
    // the light backing of the full colour logo (the logo pill): the light ground, or the inverse text colour when that ground is dark
    `--pill:${isDarkColour(brand.grounds.light) ? t.inverse : brand.grounds.light}`,
    `--r-card:${num(brand.radius.card * k)}px;--r-btn:${num(brand.radius.button * k)}px`,
    `--shadow-card:${shadowCss(brand.shadows.card, k)}`,
    `--logo-full:url("${brand.logoFullSrc}")`,
    `--pw:${pw};--p-track:${num(dt ?? brand.poster.tracking)}em;--p-lead:${num(brand.poster.leading)};--slab-myth:${brand.poster.slabs.myth};--slab-fact:${brand.poster.slabs.fact};--r-slab:${num(brand.poster.slabRadius)}px`,
    `--tex:${rgba(t.inverse, texA)};--tex-l:${rgba(t.ink, texA)};--tex-s:${num(brand.poster.texture.spacing)}px;--tex-a:${num(brand.poster.texture.angle)}deg`,
    `--font:'${brand.font.family}';--mono:'${brand.font.mono}';--display:'${brand.font.display}';--label:'${brand.font.label}'`,
    `--hw:${hw};--aw:${aw};--h-track:${num(dt ?? brand.font.tracking)}em;--h-lead:${num(brand.font.leading)};--h-scale:${num(isNum(ty.scale, 0.8, 1.25) ? ty.scale : 1)};--d-case:${pickOf(CASE, ty.display.case, 'none')}`,
    `--b-w:${bw};--b-track:${num(em(ty.body.tracking, -0.006))}em;--b-case:${pickOf(CASE, ty.body.case, 'none')}`,
    `--l-w:${lw};--l-track:${num(lt)}em;--l-track-n:${num(Math.min(lt, 0.01))}em;--l-case:${pickOf(CASE, ty.label.case, 'uppercase')}`,
    `--ph-k:${num(isNum(ph.strength, 0, 1) ? ph.strength : 0.5)};--ph-c:${pickOf(STYLE_COLOUR_VAR, ph.colour, 'var(--primary)')};--ph-lo:${pickOf(STYLE_COLOUR_VAR, ph.shadows, 'var(--g-dark)')};--ph-hi:${pickOf(STYLE_COLOUR_VAR, ph.highlights, 'var(--g-light)')}`,
    ...(brand.artworkSrc ? [`--art:url("${brand.artworkSrc}");--art-o:${num(isNum(deco.opacity, 0.05, 1) ? deco.opacity : 1)}`] : []),
  ].join(';');
}

// The style choices that the stylesheet keys on, as class names for the page's root element: names from fixed tables only.
const SURFACE_CLASS = { shadow: '', outline: 'st-outline', flat: 'st-flat' };
const PHOTO_CLASS = { none: '', tint: 'st-ph-tint', duotone: 'st-ph-duotone', overlay: 'st-ph-overlay' };
const FIT_CLASS = { cover: '', corner: 'st-art-corner' };
export function styleClasses(input) {
  const st = (input.darkGrounds ? input : normaliseBrand(input)).style;
  return [pickOf(SURFACE_CLASS, st.surface, ''), pickOf(PHOTO_CLASS, st.photo.treatment, ''), st.decoration.kind === 'artwork' ? pickOf(FIT_CLASS, st.decoration.fit, '') : ''].filter(Boolean).join(' ');
}
