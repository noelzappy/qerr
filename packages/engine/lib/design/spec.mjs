// A post's "design" block (written in the web app, imported with a batch, or drafted by the AI), checked and normalised.
// Pure: no Chrome, no file system (image files are checked when rendering).
import path from 'node:path';
import { shapeProblems } from './checks.mjs';
import { LIMITS, ledgerLayout } from './figures.mjs';
import { COVER_SIZES, DEFAULT_SIZES, SIZE_NAMES } from './sizes.mjs';
import { isPostCarousel, postCarouselProblems, postProblems } from './post-spec.mjs';
import { lookBrief } from './look.mjs';
import { ACCENT_STYLES, ALIGNS, GROUND_ALIASES, GROUND_NAMES, POSTER_SIZES, SERIES_KEY, groundName } from './tokens.mjs';

// The feed pages (one 1080 x 1350 page each, usable as pages of a carousel): first the poster pages of 2026-11-20 (one real
// image per post, large headlines), then the earlier editorial ones, then the two that work at every size.
export const POSTER_TEMPLATES = ['object', 'number', 'product', 'myth-fact', 'closing'];
export const PAGE_TEMPLATES = [...POSTER_TEMPLATES, 'cover', 'text', 'ledger', 'passbook', 'stats', 'screen', 'photo-story'];
export const TEMPLATES = [...PAGE_TEMPLATES, 'photo', 'carousel', 'pagecover'];
export const FEED_ONLY = new Set(PAGE_TEMPLATES);
export const SCRIMS = ['black', 'none'];
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
export const NETWORKS = ['instagram', 'linkedin', 'facebook', 'x'];
export const MAX_STATS = 3;
export const MAX_PAGES = 10;
export const HEADLINE_SIZES = [70, 84, 112];
export const TICKS = ['ink', 'gold'];
export const ARTEFACT_TYPES = ['ledger', 'passbook', 'register'];
export const LAYOUTS = ['panel', 'print'];
export const DEVICES = ['phone', 'desktop'];
// The website's outlined pills and check list (screen with a phone): a few short one-line texts each.
export const LISTS = { pills: { max: 4, chars: 28 }, checks: { max: 4, chars: 48 } };
export const PRODUCT_LAYOUTS = ['center', 'side'];
// Grounds a poster with a photo can take besides the named ones: "photo" samples the colour from the photo's top edge.
const PHOTO_GROUND_TEMPLATES = ['object', 'number'];

const isStr = (v) => typeof v === 'string' && v.trim() !== '';

// "$14.8M+|processed" or ["$14.8M+", "processed"] -> ["$14.8M+", "processed"]
export function parseStat(s) {
  if (Array.isArray(s)) return s.length === 2 && s.every(isStr) ? [s[0].trim(), s[1].trim()] : null;
  if (typeof s !== 'string') return null;
  const i = s.indexOf('|');
  if (i < 1 || i === s.length - 1) return null;
  const n = s.slice(0, i).trim();
  const l = s.slice(i + 1).trim();
  return n && l ? [n, l] : null;
}

const KEYWORD = { left: '0%', right: '100%', top: '0%', bottom: '100%', center: '50%' };
// A focal point as the owner writes it -> a CSS object-position. null when it is not understood.
//   "60% 40%", "center", "left top", {x:.6,y:.4} or [60, 40] (percent)
export function focalToCss(f) {
  if (f === undefined || f === null) return '50% 50%';
  if (Array.isArray(f) && f.length === 2 && f.every((n) => typeof n === 'number' && n >= 0 && n <= 100)) return `${f[0]}% ${f[1]}%`;
  if (typeof f === 'object' && !Array.isArray(f) && typeof f.x === 'number' && typeof f.y === 'number') {
    return f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1 ? `${+(f.x * 100).toFixed(2)}% ${+(f.y * 100).toFixed(2)}%` : null;
  }
  if (typeof f !== 'string') return null;
  const parts = f.trim().split(/\s+/);
  const conv = (p, axis) => {
    if (/^\d{1,3}(\.\d+)?%$/.test(p) && parseFloat(p) <= 100) return p;
    if (p === 'center') return '50%';
    if (axis === 'x' && (p === 'left' || p === 'right')) return KEYWORD[p];
    if (axis === 'y' && (p === 'top' || p === 'bottom')) return KEYWORD[p];
    return null;
  };
  if (parts.length === 1 && parts[0] === 'center') return '50% 50%';
  if (parts.length === 1 && (parts[0] === 'top' || parts[0] === 'bottom')) return `50% ${KEYWORD[parts[0]]}`;
  if (parts.length === 1 && (parts[0] === 'left' || parts[0] === 'right')) return `${KEYWORD[parts[0]]} 50%`;
  if (parts.length !== 2) return null;
  const x = conv(parts[0], 'x');
  const y = conv(parts[1], 'y');
  return x && y ? `${x} ${y}` : null;
}

const perSize = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const pick = (v, size, fallback) => (perSize(v) ? v[size] ?? v.feed ?? fallback : v ?? fallback);

export function parseSizes(v, { allowCover = false, errors, where } = {}) {
  const list = v === undefined ? [...DEFAULT_SIZES] : Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowCover ? Object.keys(COVER_SIZES) : SIZE_NAMES;
  const bad = list.filter((s) => !ok.includes(s));
  if (bad.length || !list.length) errors?.push(`${where}: sizes must be from ${ok.join(', ')} (got "${bad.join(', ') || list.join(', ')}")`);
  return [...new Set(list)];
}

function checkText(d, field, where, errors, { required = false, max = 220 } = {}) {
  const v = d[field];
  if (v === undefined) { if (required) errors.push(`${where}: ${field} is required`); return; }
  if (!isStr(v)) return errors.push(`${where}: ${field} must be a non-empty text`);
  if (v.length > max) errors.push(`${where}: ${field} is ${v.length} characters; the most the tool accepts is ${max}`);
}

function checkImage(d, where, errors, required) {
  if (d.image === undefined) { if (required) errors.push(`${where}: image is required`); return; }
  if (!isStr(d.image)) return errors.push(`${where}: image must be a file path`);
  if (!IMAGE_EXT.includes(path.extname(d.image).toLowerCase())) errors.push(`${where}: image "${d.image}" must be ${IMAGE_EXT.join(' ')}`);
}

function checkLines(lines, where, errors) {
  if (lines === undefined || typeof lines === 'boolean' || lines === 'auto' || lines === 'none') return;
  const shapesOk = (arr, label) => {
    if (!Array.isArray(arr) || arr.length > 12) return errors.push(`${where}: ${label} must be a list of up to 12 shapes`);
    arr.forEach((s, i) => shapeProblems(s).forEach((p) => errors.push(`${where}: ${label}[${i}] ${p}`)));
  };
  if (Array.isArray(lines)) return shapesOk(lines, 'lines');
  if (perSize(lines)) {
    for (const [k, v] of Object.entries(lines)) {
      if (!SIZE_NAMES.includes(k)) errors.push(`${where}: lines has an unknown size "${k}"`);
      else shapesOk(v, `lines.${k}`);
    }
    return;
  }
  errors.push(`${where}: lines must be true, false, "auto", a list of shapes, or shapes per size`);
}

function checkOptions(d, where, errors) {
  if (d.focal !== undefined) {
    const f = perSize(d.focal) && !('x' in d.focal) ? Object.values(d.focal) : [d.focal];
    if (f.some((x) => focalToCss(x) === null)) errors.push(`${where}: focal must look like "60% 40%", "center", "left top" or { "x": 0.6, "y": 0.4 } (per size allowed)`);
  }
  if (d.textAt !== undefined) {
    const vals = perSize(d.textAt) ? Object.values(d.textAt) : [d.textAt];
    if (vals.some((x) => !['top', 'bottom'].includes(x))) errors.push(`${where}: textAt must be "top" or "bottom" (per size allowed)`);
  }
  if (d.scrim !== undefined && !SCRIMS.includes(d.scrim)) errors.push(`${where}: scrim must be one of ${SCRIMS.join(', ')}`);
  if (d.scrimPeak !== undefined && !(typeof d.scrimPeak === 'number' && Number.isFinite(d.scrimPeak) && d.scrimPeak >= 0 && d.scrimPeak <= 0.65)) errors.push(`${where}: scrimPeak must be a number from 0 to 0.65`);
  checkLines(d.lines, where, errors);
}

function checkStats(d, where, errors, { required }) {
  if (d.stats === undefined && !required) return;
  if (!Array.isArray(d.stats) || (required && !d.stats.length)) return errors.push(`${where}: stats needs 1 to ${MAX_STATS} entries like "14.8M+|processed"`);
  if (d.stats.length > MAX_STATS) errors.push(`${where}: stats has ${d.stats.length} entries; the most is ${MAX_STATS}`);
  d.stats.forEach((s, i) => { if (!parseStat(s)) errors.push(`${where}: stats[${i}] must look like "number|label" or ["number", "label"]`); });
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// A short, one-line text (a label, a cell, a caption). Returns the problem or null.
function shortProblem(v, max, { allowEmpty = false } = {}) {
  if (typeof v !== 'string') return 'must be a text';
  if (!allowEmpty && !v.trim()) return 'must not be empty';
  if (/[\r\n]/.test(v)) return 'must be one line';
  if (v.length > max) return `is ${v.length} characters; the most is ${max}`;
  return null;
}
function checkShort(d, field, where, errors, max, opts = {}) {
  if (d[field] === undefined) return;
  const p = shortProblem(d[field], max, opts);
  if (p) errors.push(`${where}: ${field} ${p}`);
}

// series (a key from the brand file), label (your own words), ground and accent (fixed lists), the right-hand running head, headline size.
function checkFrame(d, where, errors, opts, { size = false } = {}) {
  if (d.series !== undefined) {
    if (typeof d.series !== 'string' || !SERIES_KEY.test(d.series)) errors.push(`${where}: series must be a key from brand.json (lowercase letters, digits and -)`);
    else if (opts.series && !opts.series.includes(d.series)) errors.push(`${where}: series "${d.series}" is not in brand.json (known: ${opts.series.join(', ') || 'none'})`);
  }
  checkShort(d, 'label', where, errors, 40);
  checkShort(d, 'headRight', where, errors, 30);
  const photoGround = PHOTO_GROUND_TEMPLATES.includes(d.template) && d.ground === 'photo';
  // A ground by its name, or by its older name (white, tint, mint, gold-pale, ink), which means the same ground.
  if (d.ground !== undefined && !groundName(d.ground) && !photoGround) errors.push(`${where}: ground must be one of ${GROUND_NAMES.join(', ')}${PHOTO_GROUND_TEMPLATES.includes(d.template) ? ' or photo' : ''} (the older names ${Object.keys(GROUND_ALIASES).join(', ')} also work)`);
  if (d.accent !== undefined && !ACCENT_STYLES.includes(d.accent)) errors.push(`${where}: accent must be one of ${ACCENT_STYLES.join(', ')}`);
  const sizes = ['object', 'product'].includes(d.template) ? POSTER_SIZES : HEADLINE_SIZES;
  if (d.size !== undefined && (!size || !sizes.includes(d.size))) errors.push(size ? `${where}: size must be one of ${sizes.join(', ')}` : `${where}: size is not used by this template`);
  // dots: false takes the decoration (by default a dot grid on a dark page) off this page; silk: the dropped ribbon.
  if (d.dots !== undefined && typeof d.dots !== 'boolean') errors.push(`${where}: dots must be true or false`);
  // Dropped on 2026-11-20 after owner feedback: the ribbon read as a shaded corner, and figure captions do not belong on a post.
  if (d.silk !== undefined) errors.push(`${where}: silk is no longer used (the ribbon read as a shaded corner, not the website's wave); remove it`);
  if (d.caption !== undefined) errors.push(`${where}: caption is no longer used (posts carry no figure captions); remove it`);
}

// A poster page's own options: headline alignment, where the photo or the phone starts.
function checkPoster(d, where, errors) {
  if (d.align !== undefined && !ALIGNS.includes(d.align)) errors.push(`${where}: align must be one of ${ALIGNS.join(', ')}`);
  for (const k of ['photoTop', 'phoneTop']) if (d[k] !== undefined && !isInt(d[k], 300, 960)) errors.push(`${where}: ${k} must be a whole number of pixels from 300 to 960`);
}

// A list of short one-line texts (pills, check list items).
function checkList(d, field, where, errors) {
  if (d[field] === undefined) return;
  const L = LISTS[field];
  if (!Array.isArray(d[field]) || d[field].length < 1 || d[field].length > L.max) return errors.push(`${where}: ${field} must be a list of 1 to ${L.max} short texts`);
  d[field].forEach((t, i) => { const p = shortProblem(t, L.chars); if (p) errors.push(`${where}: ${field}[${i}] ${p}`); });
}

// The photo window: a focal point (not per size) and an optional zoom.
function checkWindow(d, where, errors) {
  if (d.focal !== undefined && (perSize(d.focal) && !('x' in d.focal) ? true : focalToCss(d.focal) === null)) errors.push(`${where}: focal must look like "60% 40%", "center", "left top" or { "x": 0.6, "y": 0.4 }`);
  if (d.zoom !== undefined && !isNum(d.zoom, 1, 3)) errors.push(`${where}: zoom must be a number from 1 to 3`);
}

function checkRegister(r, where, errors) {
  const R = LIMITS.register;
  if (!isObj(r)) return errors.push(`${where}: must be an object like { "title": "...", "rows": [["label", "value"]] }`);
  checkShort(r, 'title', where, errors, R.maxTitle);
  if (!Array.isArray(r.rows) || r.rows.length < R.minRows || r.rows.length > R.maxRows) return errors.push(`${where}: rows needs ${R.minRows} to ${R.maxRows} entries like ["Label", "value"]`);
  r.rows.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== 2) return errors.push(`${where}: rows[${i}] must be ["label", "value"]`);
    const a = shortProblem(row[0], R.maxLabel), b = shortProblem(row[1], R.maxValue, { allowEmpty: true });
    if (a) errors.push(`${where}: rows[${i}] label ${a}`);
    if (b) errors.push(`${where}: rows[${i}] value ${b}`);
  });
  if (r.mark !== undefined && !isInt(r.mark, 0, r.rows.length - 1)) errors.push(`${where}: mark must be a row number from 0 to ${r.rows.length - 1}`);
}

function checkLedger(l, where, errors) {
  const L = LIMITS.ledger, before = errors.length;
  if (!Array.isArray(l.columns) || l.columns.length < L.minCols || l.columns.length > L.maxCols) return errors.push(`${where}: columns needs ${L.minCols} to ${L.maxCols} entries like { "label": "Day", "align": "start" }`);
  l.columns.forEach((c, j) => {
    if (!isObj(c)) return errors.push(`${where}: columns[${j}] must be { "label": "...", "align": "start" | "end" }`);
    const p = shortProblem(c.label, L.maxLabel);
    if (p) errors.push(`${where}: columns[${j}] label ${p}`);
    if (c.align !== undefined && c.align !== 'start' && c.align !== 'end') errors.push(`${where}: columns[${j}] align must be "start" or "end"`);
  });
  if (!Array.isArray(l.rows) || l.rows.length < L.minRows || l.rows.length > L.maxRows) errors.push(`${where}: rows needs ${L.minRows} to ${L.maxRows} rows`);
  else l.rows.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== l.columns.length) return errors.push(`${where}: rows[${i}] must be a list of ${l.columns.length} cells, one per column`);
    row.forEach((cell, j) => { const p = shortProblem(cell, L.maxCell, { allowEmpty: true }); if (p) errors.push(`${where}: rows[${i}][${j}] ${p}`); });
  });
  if (l.mark !== undefined) {
    if (!Array.isArray(l.mark) || l.mark.length > 10) errors.push(`${where}: mark must be a list of up to 10 cells like { "row": 2, "col": 1 }`);
    else l.mark.forEach((m, i) => {
      if (!isObj(m) || !isInt(m.row, 0, (l.rows?.length ?? 1) - 1) || !isInt(m.col, 0, (l.columns?.length ?? 1) - 1)) errors.push(`${where}: mark[${i}] must be { "row": 0-${(l.rows?.length ?? 1) - 1}, "col": 0-${(l.columns?.length ?? 1) - 1} }`);
    });
  }
  if (l.notes !== undefined) {
    if (!Array.isArray(l.notes) || l.notes.length > L.maxNotes) errors.push(`${where}: notes must be a list of up to ${L.maxNotes} short lines`);
    else l.notes.forEach((t, i) => { const p = shortProblem(t, L.maxNote); if (p) errors.push(`${where}: notes[${i}] ${p}`); });
  }
  if (l.rotate !== undefined) errors.push(`${where}: rotate is no longer used (cards are never rotated); remove it`);
  if (errors.length === before && !ledgerLayout(l.columns.map((c) => ({ label: c.label, align: c.align })), l.rows).ok) errors.push(`${where}: the columns are too wide for the sheet; shorten the longest cells or use fewer columns`);
}

function checkPassbook(p, where, errors, { register = true } = {}) {
  const P = LIMITS.passbook;
  if (p.days !== undefined && !isInt(p.days, P.minDays, P.maxDays)) errors.push(`${where}: days must be a whole number from ${P.minDays} to ${P.maxDays}`);
  const days = isInt(p.days, P.minDays, P.maxDays) ? p.days : P.maxDays;
  if (p.ticked !== undefined && !isInt(p.ticked, 0, days)) errors.push(`${where}: ticked must be a whole number from 0 to ${days}`);
  if (p.today !== undefined && !isInt(p.today, 1, days)) errors.push(`${where}: today must be a whole number from 1 to ${days}`);
  if (p.tick !== undefined && !TICKS.includes(p.tick)) errors.push(`${where}: tick must be one of ${TICKS.join(', ')}`);
  if (p.register !== undefined) { if (register) checkRegister(p.register, `${where}: register`, errors); else errors.push(`${where}: register is not used here`); }
}

// device "phone" (a pre-framed phone capture, shown as it is) or "desktop" (a screenshot in the website's window chrome, or as it
// is with framed: true); title, tilt and region are for the desktop window; beside (a passbook card) is for the phone.
function checkScreen(d, where, errors) {
  if (d.device !== undefined && !DEVICES.includes(d.device)) return errors.push(`${where}: device must be one of ${DEVICES.join(', ')}`);
  const device = d.device ?? 'phone';
  if (d.framed !== undefined && typeof d.framed !== 'boolean') errors.push(`${where}: framed must be true or false`);
  if (device === 'phone' && d.framed === false) errors.push(`${where}: a phone screen must be a pre-framed phone capture; the tool does not draw phones (use a pre-framed phone capture, see design/assets/screens/SOURCES.md, or "device": "desktop")`);
  if (d.statusFill !== undefined) errors.push(`${where}: statusFill is no longer used: phones are pre-framed captures with their own status bar; remove it`);
  checkShort(d, 'title', where, errors, 40);
  if (d.tilt !== undefined && typeof d.tilt !== 'boolean') errors.push(`${where}: tilt must be true or false`);
  if (d.region !== undefined && !isNum(d.region, 0.4, 1)) errors.push(`${where}: region must be a number from 0.4 to 1 (the share of the capture to show)`);
  if (device === 'phone') for (const k of ['title', 'tilt', 'region']) if (d[k] !== undefined) errors.push(`${where}: ${k} is only used with "device": "desktop"`);
  for (const k of ['glow', 'fade']) {
    if (d[k] === undefined) continue;
    if (typeof d[k] !== 'boolean') errors.push(`${where}: ${k} must be true or false`);
    else if (device !== 'phone') errors.push(`${where}: ${k} is only used with a phone`);
  }
  for (const k of ['pills', 'checks']) {
    if (d[k] === undefined) continue;
    if (device !== 'phone' || d.beside !== undefined) errors.push(`${where}: ${k} is only used with a phone (without beside)`);
    else checkList(d, k, where, errors);
  }
  if (d.fade === true && d.beside !== undefined) errors.push(`${where}: fade and beside cannot be used together`);
  if (d.beside !== undefined) {
    if (device !== 'phone') errors.push(`${where}: beside is only used with a phone`);
    else if (!isObj(d.beside)) errors.push(`${where}: beside must be a passbook like { "days": 31, "ticked": 17 }`);
    else checkPassbook(d.beside, `${where}: beside`, errors, { register: false });
  }
}

function checkArtefact(a, where, errors) {
  if (!isObj(a)) return errors.push(`${where}: artefact must be an object like { "type": "ledger", ... }`);
  if (!ARTEFACT_TYPES.includes(a.type)) return errors.push(`${where}: artefact.type must be one of ${ARTEFACT_TYPES.join(', ')}`);
  const w = `${where}: artefact`;
  if (a.type === 'ledger') checkLedger(a, w, errors);
  else if (a.type === 'passbook') checkPassbook(a, w, errors);
  else { checkRegister(a, w, errors); if (a.rotate !== undefined) errors.push(`${w}: rotate is no longer used (cards are never rotated); remove it`); }
}

function checkOne(d, template, where, errors, opts = {}) {
  const text = (f, o) => checkText(d, f, where, errors, o);
  if (PAGE_TEMPLATES.includes(template)) checkFrame(d, where, errors, opts, { size: ['text', 'ledger', 'passbook', 'object', 'product'].includes(template) });
  if (POSTER_TEMPLATES.includes(template)) checkPoster(d, where, errors);
  const unused = (keys) => keys.forEach((k) => { if (d[k] !== undefined) errors.push(`${where}: ${k} is not used by ${template}`); });
  if (template === 'object') {
    text('headline', { required: true }); text('sub'); checkImage(d, where, errors, true); checkWindow(d, where, errors); unused(['phoneTop']);
  } else if (template === 'number') {
    checkShort(d, 'big', where, errors, 40);
    if (d.big === undefined) errors.push(`${where}: big is required`);
    text('line', { max: 80 }); checkStats(d, where, errors, { required: false }); checkImage(d, where, errors, false); checkWindow(d, where, errors); unused(['phoneTop', 'align']);
  } else if (template === 'product') {
    text('headline', { required: true }); text('sub'); checkImage(d, where, errors, true); unused(['photoTop']);
    if (d.layout !== undefined && !PRODUCT_LAYOUTS.includes(d.layout)) errors.push(`${where}: layout must be one of ${PRODUCT_LAYOUTS.join(', ')}`);
    if (d.glow !== undefined && typeof d.glow !== 'boolean') errors.push(`${where}: glow must be true or false`);
  } else if (template === 'cover') {
    text('headline', { required: true }); text('sub'); checkImage(d, where, errors, true); checkWindow(d, where, errors);
  } else if (template === 'text') {
    text('headline', { required: true }); text('sub');
    if (d.artefact !== undefined) checkArtefact(d.artefact, where, errors);
  } else if (template === 'ledger') {
    text('headline', { required: true }); text('sub'); checkLedger(d, where, errors);
  } else if (template === 'passbook') {
    text('headline', { required: true }); text('sub'); checkPassbook(d, where, errors);
  } else if (template === 'myth-fact') {
    text('myth', { required: true }); text('factLead', { required: true }); text('fact'); unused(['photoTop', 'phoneTop', 'align']);
  } else if (template === 'stats') {
    checkShort(d, 'big', where, errors, 40);
    if (d.big === undefined) errors.push(`${where}: big is required`);
    text('line', { max: 80 }); checkStats(d, where, errors, { required: false }); checkImage(d, where, errors, false); checkWindow(d, where, errors);
  } else if (template === 'screen') {
    text('headline', { required: true }); text('sub'); checkImage(d, where, errors, true);
    checkScreen(d, where, errors);
  } else if (template === 'photo-story') {
    text('headline', { required: true }); text('sub'); checkImage(d, where, errors, true); checkWindow(d, where, errors);
    if (d.layout !== undefined && !LAYOUTS.includes(d.layout)) errors.push(`${where}: layout must be one of ${LAYOUTS.join(', ')}`);
  } else if (template === 'closing') {
    text('headline'); checkShort(d, 'line', where, errors, 60); unused(['photoTop', 'phoneTop', 'align']);
    if (d.map !== undefined && typeof d.map !== 'boolean') errors.push(`${where}: map must be true or false`);
  } else if (template === 'photo') {
    text('headline', { required: true }); text('sub'); text('eyebrow', { max: 60 }); checkImage(d, where, errors, true); checkOptions(d, where, errors);
  }
}

// Validates one design spec (the template plus its options). Returns a list of problems, empty when fine.
// opts.series: the series keys of the brand file (callers that can read it pass them; without them only the key's shape is checked).
// opts.layoutPage(page, where): the problems of a carousel page { template: "layout", layout: "<id>", ... }, one of the brand's
// own layouts (layout.mjs layoutPageProblems, which postDesignProblems passes). Without it such a page is refused, as before.
export function validateDesign(d, where = 'design', opts = {}) {
  const errors = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return [`${where}: must be an object`];
  // `post` (lib/design/post-spec.mjs) is the design directions' template. It is not one of TEMPLATES (no built-in layout draws it).
  if (!TEMPLATES.includes(d.template) && d.template !== 'post') return [`${where}: template must be one of ${TEMPLATES.join(', ')} (got "${d.template}")`];
  if (d.template === 'pagecover') {
    if (!Object.keys(COVER_SIZES).includes(d.kind)) errors.push(`${where}: kind must be one of ${Object.keys(COVER_SIZES).join(', ')}`);
    return errors;
  }
  const sizes = parseSizes(d.sizes, { errors, where });
  if ((FEED_ONLY.has(d.template) || d.template === 'carousel' || d.template === 'post') && sizes.some((z) => z !== 'feed')) errors.push(`${where}: ${d.template} is made for the feed format (1080x1350) only; sizes must be feed (got ${sizes.join(', ')})`);
  if (d.name !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(d.name)) errors.push(`${where}: name must use lowercase letters, digits, . _ - only`);
  if (d.networkSizes !== undefined) {
    const ns = d.networkSizes;
    if (!ns || typeof ns !== 'object' || Array.isArray(ns)) errors.push(`${where}: networkSizes must look like { "linkedin": "wide" }`);
    else for (const [n, s] of Object.entries(ns)) {
      if (!NETWORKS.includes(n)) errors.push(`${where}: networkSizes has an unknown network "${n}"`);
      else if (!parseSizes(d.sizes).includes(s)) errors.push(`${where}: networkSizes.${n} is "${s}", which is not in sizes`);
    }
  }
  if (d.template === 'carousel' && isPostCarousel(d)) {
    errors.push(...postCarouselProblems(d, where, { direction: opts.direction, brief: opts.look ? lookBrief(opts.look) : undefined, focalOk: (f) => focalToCss(f) !== null }));
    return errors;
  }
  if (d.template === 'carousel') {
    if (d.slides !== undefined) errors.push(`${where}: a carousel takes "pages" (the old "slides" and its title, step and end templates are gone)`);
    checkFrame(d, where, errors, opts);
    if (!Array.isArray(d.pages) || d.pages.length < 2 || d.pages.length > MAX_PAGES) return [...errors, `${where}: pages needs 2 to ${MAX_PAGES} pages`];
    d.pages.forEach((p, i) => {
      const pw = `${where} page ${i + 1}`;
      if (p?.template === 'layout' && typeof opts.layoutPage === 'function') errors.push(...opts.layoutPage(p, pw));
      else if (!p || !PAGE_TEMPLATES.includes(p.template)) errors.push(`${pw}: template must be one of ${PAGE_TEMPLATES.join(', ')}${typeof opts.layoutPage === 'function' ? ', or layout (one of the brand\'s layouts)' : ''}`);
      else checkOne(p, p.template, pw, errors, opts);
    });
    return errors;
  }
  if (d.template === 'post') {
    errors.push(...postProblems(d, where, { direction: opts.direction, brief: opts.look ? lookBrief(opts.look) : undefined, focalOk: (f) => focalToCss(f) !== null }));
    return errors;
  }
  checkOne(d, d.template, where, errors, opts);
  return errors;
}

const pageOf = (d, carousel) => {
  const p = { ...d };
  if (d.stats) p.stats = d.stats.map(parseStat);
  if (carousel) for (const k of ['series', 'label']) if (p[k] === undefined && carousel[k] !== undefined) p[k] = carousel[k];
  return p;
};

// Fills defaults and parses what needs parsing. Call validateDesign first.
export function normaliseDesign(d) {
  const spec = { ...d };
  if (d.template === 'pagecover') return spec;
  spec.sizes = parseSizes(d.sizes);
  if (d.stats) spec.stats = d.stats.map(parseStat);
  if (d.pages) spec.pages = d.pages.map((p) => ({ ...pageOf(p, d), sizes: spec.sizes }));
  return spec;
}

// What one size of a spec resolves to (per-size options picked).
export function forSize(spec, size) {
  return {
    ...spec,
    focalCss: focalToCss(pick(spec.focal, size, undefined)),
    // a post's portrait picture is cropped round its own focal point
    ...(spec.avatar && typeof spec.avatar === 'object' && !Array.isArray(spec.avatar) ? { avatarFocalCss: focalToCss(spec.avatar.focal) } : {}),
    textAtResolved: pick(spec.textAt, size, undefined),
    linesResolved: perSize(spec.lines) ? spec.lines[size] ?? 'auto' : spec.lines ?? 'auto',
  };
}

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\p{ASCII}]/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'post';
export const slugify = slug;

// File names a design produces, in order. A carousel has one image per page (and a PDF of them, see pdfFile).
// stem + "-" + size for one-image posts; stem + "-" + n for a carousel (feed only).
export function outputFiles(spec, { stem, ext = '.jpg' }) {
  if (spec.template === 'pagecover') return [{ size: spec.kind, slide: null, file: `${stem}${ext}` }];
  const out = [];
  for (const size of spec.sizes) {
    if (spec.template === 'carousel') {
      spec.pages.forEach((_, i) => out.push({ size, slide: i, file: spec.sizes.length > 1 ? `${stem}-${size}-${i + 1}${ext}` : `${stem}-${i + 1}${ext}` }));
    } else out.push({ size, slide: null, file: `${stem}-${size}${ext}` });
  }
  return out;
}
// The PDF written next to a carousel's images, for LinkedIn documents.
export const pdfFile = (stem) => `${stem}.pdf`;

export const stemFor = (spec, fallback) => spec.name ?? slug(fallback);
