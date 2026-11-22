// Looks as data: the validator (see look.mjs). validateLook(look, where, opts) returns a list of plain sentences, empty when the look
// can be drawn, in the style of layout.mjs validateLayout: every message is prefixed with where the problem is, quotes only short
// plain values (a text that is not a short run of letters, digits, spaces and . _ + - is never echoed, so no payload comes back in
// a message), and is at most 200 characters. A look is untrusted data: unknown keys are refused at every level, and so is any key
// named render, __proto__, constructor or prototype, and any value that is not plain JSON.
import { fontLibrary as shippedFontLibrary } from './font-library.mjs';
import {
  ANGLE_NAMES, COLOUR_NAMES, COMMON, CONTAINERS, ELEMENTS, ELEMENT_TYPES, FIELD_NAMES, FLOWING, FLOW_ONLY, FORBIDDEN_KEYS, GROUNDS, ID, KINDS, KIND_FIELDS, LENGTH_TOKENS,
  LIMITS, LOOK_SCHEMA, ORIGIN, PAGE, PLACE_FORMS, PLACE_MODIFIERS, POST_FIELDS, POST_ITEMS, POST_REQUIRED, REQUIRED_OWN, SECTIONS, SECTION_NAMES, SIZE_RANGE, TEXT_FIELDS, TOP_ONLY, VALIGNS, descriptorOf, keysOf,
} from './look-elements.mjs';
import { FILL_ROLES, compositionStaticChecks, gridOf, styleOf } from './look-static.mjs';
import { VAULT_REF } from './look-desc.mjs';
import { INLINE, POST_LISTS } from './post-spec.mjs';
import { POST_CHART } from './chart.mjs';
import { PRIMITIVES } from './look-elements.mjs';

export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const SAFE = /^[A-Za-z0-9 ._+-]{0,24}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// A value quoted back in a message: only a short plain token; anything else is described, never echoed.
export function show(v) {
  if (typeof v === 'string') return SAFE.test(v) ? JSON.stringify(v) : `a text of ${v.length} characters`;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).slice(0, 12) : 'not a finite number';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `a list of ${v.length}`;
  if (typeof v === 'object') return 'an object';
  return typeof v;
}
const safeKey = (k) => (SAFE.test(k) ? `"${k}"` : 'a setting with an odd name');
const clipMsg = (m) => (m.length > 200 ? `${m.slice(0, 197)}...` : m);
const push = (errs, ctx, path, text) => errs.push(`${ctx.W}: ${path ? `${path} ` : ''}${text}`);
const hasOwn = (o, k) => Object.hasOwn(o, k);
const list = (xs) => xs.join(', ');

// ---- the guard pass: nothing but plain JSON, no forbidden key, bounded in depth, width and size ----
function guard(v, path, depth, st, errs, W) {
  if (st.stop) return;
  const here = path || 'the look';
  if (depth > 14) { errs.push(`${W}: ${here} is nested far too deeply`); st.stop = true; return; }
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') return;
  if (typeof v !== 'object') { errs.push(`${W}: ${here} is a ${typeof v}; a look holds plain data only (text, numbers, true or false, lists and objects)`); return; }
  if (++st.n > 5000) { errs.push(`${W}: the look has far too many values`); st.stop = true; return; }
  if (Array.isArray(v)) {
    if (v.length > 100) { errs.push(`${W}: ${here} is a list of ${v.length}; no list in a look is that long`); return; }
    v.forEach((x, i) => guard(x, `${path}[${i}]`, depth + 1, st, errs, W));
    return;
  }
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) { errs.push(`${W}: ${here} is not a plain object`); return; }
  const keys = Object.keys(v);
  if (keys.length > 60) { errs.push(`${W}: ${here} has ${keys.length} settings; no object in a look has that many`); return; }
  for (const k of keys) {
    if (FORBIDDEN_KEYS.includes(k)) { errs.push(`${W}: ${here ? `${here}: ` : ''}a setting named ${k} is not allowed (a look is data, never code)`); continue; }
    guard(v[k], path ? `${path}.${SAFE.test(k) ? k : '?'}` : SAFE.test(k) ? k : '?', depth + 1, st, errs, W);
  }
}

// ---- descriptor-driven checks ----
const unknownKeys = (v, known, path, ctx, errs, what = 'here') => {
  for (const k of Object.keys(v)) if (!known.includes(k)) push(errs, ctx, path, `${safeKey(k)} is not a setting ${what} (known: ${list(known)})`);
};
const isLen = (v, lo, hi) => (typeof v === 'string' && LENGTH_TOKENS.includes(v)) || (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi);

// Checks one value against a descriptor. ctx: { W, declared (the fields a composition declares, or null), look }.
export function check(desc, v, path, ctx, errs) {
  const bad = (t) => push(errs, ctx, path, t);
  switch (desc.kind) {
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v) || (desc.int && !Number.isInteger(v)) || v < desc.min || v > desc.max) bad(`must be ${desc.int ? 'a whole number' : 'a number'} from ${desc.min} to ${desc.max} (got ${show(v)})`);
      return;
    case 'enum':
      if (!desc.values.includes(v)) bad(`must be one of ${list(desc.values)} (got ${show(v)})`);
      return;
    case 'bool':
      if (typeof v !== 'boolean') bad('must be true or false');
      return;
    case 'role':
      if (typeof v !== 'string' || !COLOUR_NAMES.includes(v)) bad(`must be a colour role of the brand, never a hex colour (got ${show(v)})`);
      return;
    case 'length':
      if (!isLen(v, desc.min, desc.max)) bad(`must be a number of pixels from ${desc.min} to ${desc.max}, or one of ${list(LENGTH_TOKENS)} (got ${show(v)})`);
      return;
    case 'angle':
      if (!(typeof v === 'string' && ANGLE_NAMES.includes(v)) && !(typeof v === 'number' && Number.isFinite(v) && v >= -15 && v <= 15)) bad(`must be one of the look's angles (${list(ANGLE_NAMES)}) or a number from -15 to 15 (got ${show(v)})`);
      return;
    case 'field':
      if (typeof v !== 'string' || !desc.of.includes(v)) return bad(`must be one of ${list(desc.of)} (got ${show(v)})`);
      if (ctx.declared && !ctx.declared.includes(v)) bad(`names ${show(v)}, which the composition does not declare; add it to the composition's fields first`);
      return;
    case 'text':
      if (typeof v !== 'string' || !v.trim() || v.length > desc.max || CONTROL.test(v)) bad(`must be one line of 1 to ${desc.max} characters, without control characters`);
      return;
    case 'list': {
      if (!Array.isArray(v)) return bad(`must be a list of up to ${desc.max}`);
      if (v.length > desc.max || v.length < (desc.min ?? 0)) return bad(`must be a list of ${desc.min ?? 0} to ${desc.max} (got ${v.length})`);
      v.forEach((x, i) => check(desc.of, x, `${path}[${i}]`, ctx, errs));
      if (desc.unique && new Set(v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x))).size !== v.length) bad('must not repeat an entry');
      return;
    }
    case 'tuple':
      if (!Array.isArray(v) || v.length !== desc.items.length) return bad(`must be a list of exactly ${desc.items.length} values`);
      v.forEach((x, i) => check(desc.items[i], x, `${path}[${i}]`, ctx, errs));
      return;
    case 'object': {
      if (!isObj(v)) return bad('must be an object');
      unknownKeys(v, Object.keys(desc.props), path, ctx, errs);
      for (const k of desc.required ?? []) if (v[k] === undefined) bad(`needs ${k}`);
      for (const [k, sub] of Object.entries(desc.props)) if (v[k] !== undefined) check(sub, v[k], path ? `${path}.${k}` : k, ctx, errs);
      return;
    }
    case 'oneOf': {
      const is = typeof v === 'number' ? 'number' : typeof v === 'string' ? 'string' : typeof v === 'boolean' ? 'boolean' : Array.isArray(v) ? 'array' : isObj(v) ? 'object' : null;
      const form = desc.forms.find((f) => f.is === is);
      if (!form) return bad(`must be ${desc.forms.map((f) => `${f.is === 'array' ? 'a list' : f.is === 'boolean' ? 'true or false' : `a ${f.is}`}`).join(' or ')}`);
      check(form.desc, v, path, ctx, errs);
      return;
    }
    case 'tagged': {
      if (!isObj(v)) return bad('must be an object');
      if (typeof v[desc.key] !== 'string' || !hasOwn(desc.forms, v[desc.key])) return bad(`${desc.key} must be one of ${list(Object.keys(desc.forms))}`);
      check(desc.forms[v[desc.key]], v, path, ctx, errs);
      return;
    }
    case 'when': return checkWhen(v, path, ctx, errs);
    case 'ref':
      if (typeof v !== 'string' || !VAULT_REF.test(v)) bad('must be the id of one of the brand\'s pictures (a lowercase UUID)');
      return;
    case 'place': return;
    default: bad('has a setting the engine does not know');
  }
}

export function checkWhen(v, path, ctx, errs) {
  if (!isObj(v) || !Object.keys(v).length) return push(errs, ctx, path, 'must be an object like { "present": "sub" } or { "absent": "image" }');
  unknownKeys(v, ['present', 'absent'], path, ctx, errs);
  for (const k of ['present', 'absent']) {
    if (v[k] === undefined) continue;
    if (typeof v[k] !== 'string' || !FIELD_NAMES.includes(v[k])) push(errs, ctx, `${path}.${k}`, `must be one of ${list(FIELD_NAMES)} (got ${show(v[k])})`);
    else if (ctx.declared && !ctx.declared.includes(v[k])) push(errs, ctx, `${path}.${k}`, `names ${show(v[k])}, which the composition does not declare; add it to the composition's fields first`);
  }
  if (v.present !== undefined && v.present === v.absent) push(errs, ctx, path, 'a field cannot be both present and absent');
}

// ---- place ----
function checkPlace(v, path, ctx, errs, { child }) {
  if (!isObj(v)) return push(errs, ctx, path, 'must be an object with exactly one of grid, px, anchor or inset');
  const keys = Object.keys(v), forms = keys.filter((k) => hasOwn(PLACE_FORMS, k)), mods = keys.filter((k) => hasOwn(PLACE_MODIFIERS, k));
  for (const k of keys) if (!hasOwn(PLACE_FORMS, k) && !hasOwn(PLACE_MODIFIERS, k)) push(errs, ctx, path, `${safeKey(k)} is not part of a place (use one of ${list(Object.keys(PLACE_FORMS))}; w, h, dx, dy, square go with a grid place; minH goes with any)`);
  if (forms.length !== 1) return push(errs, ctx, path, `needs exactly one form: ${list(Object.keys(PLACE_FORMS))}`);
  const form = forms[0];
  if (child && !['px', 'anchor'].includes(form)) return push(errs, ctx, path, 'inside a box is placed with px or anchor (relative to the box), or left out to flow');
  const before = errs.length;
  check(PLACE_FORMS[form], v[form], `${path}.${form}`, ctx, errs);
  for (const k of mods) {
    if ((k === 'w' || k === 'h') && form !== 'grid') push(errs, ctx, path, `${k} goes with a grid place only (an anchor or px place has its own ${k})`);
    else if ((k === 'dx' || k === 'dy') && !['grid', 'anchor'].includes(form)) push(errs, ctx, path, `${k} goes with a grid or anchor place only`);
    else if (k === 'square' && form !== 'grid') push(errs, ctx, path, 'square goes with a grid place only');
    else check(PLACE_MODIFIERS[k], v[k], `${path}.${k}`, ctx, errs);
  }
  if (errs.length > before) return;
  if (v.square === true && v.h !== undefined) push(errs, ctx, path, 'gives square and h; a square place is as tall as it is wide');
  const p = v[form];
  if (form === 'anchor') {
    if (!Object.keys(p).length) push(errs, ctx, `${path}.anchor`, 'needs at least one of left, right, top, bottom, w, h');
    if (p.left !== undefined && p.right !== undefined && p.w !== undefined) push(errs, ctx, `${path}.anchor`, 'gives left, right and w; leave one out');
    if (p.top !== undefined && p.bottom !== undefined && p.h !== undefined) push(errs, ctx, `${path}.anchor`, 'gives top, bottom and h; leave one out');
  }
  if (form === 'grid') {
    const g = ctx.grid;
    if (!g) return;
    if (p.col + p.span - 1 > g.cols) push(errs, ctx, `${path}.grid`, `columns ${p.col} to ${p.col + p.span - 1} run past the grid's ${g.cols} columns`);
    if (p.row !== undefined || p.rowSpan !== undefined || p.alignY !== undefined) {
      if (g.rows < 1) push(errs, ctx, `${path}.grid`, 'uses rows, but the look\'s page grid has no rows (set canvas.feed.grid.rows)');
      else if (p.row === undefined) push(errs, ctx, `${path}.grid`, 'gives rowSpan or alignY without row');
      else if (p.row + (p.rowSpan ?? 1) - 1 > g.rows) push(errs, ctx, `${path}.grid`, `rows ${p.row} to ${p.row + (p.rowSpan ?? 1) - 1} run past the grid's ${g.rows} rows`);
    }
  }
}

// ---- elements ----
function ladderProblems(l, path, ctx, errs, style) {
  const steps = l.steps;
  if (!Array.isArray(steps) || steps.some((s) => !Array.isArray(s) || s.length !== 2 || !Number.isFinite(s[0]) || !Number.isFinite(s[1]))) return;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i][0] <= steps[i - 1][0]) push(errs, ctx, `${path}.steps`, 'must list the shortest text first: each "up to" more characters than the one before');
    if (steps[i][1] > steps[i - 1][1]) push(errs, ctx, `${path}.steps`, 'sizes must not grow as the text gets longer');
  }
  const [lo, hi] = SIZE_RANGE[style] ?? [14, 900];
  for (const s of steps) if (s[1] < lo || s[1] > hi) { push(errs, ctx, `${path}.steps`, `sizes of ${style} type go from ${lo} to ${hi}`); break; }
  const by = l.by, c = ctx.comp;
  if (c && typeof by === 'string' && isObj(c.fields) && isObj(c.fields[by])) {
    const max = c.fields[by].max ?? POST_FIELDS[by]?.max;
    if (Number.isFinite(max) && steps[steps.length - 1][0] < max) push(errs, ctx, `${path}.steps`, `the last step covers ${steps[steps.length - 1][0]} characters, but ${by} may be ${max}; the last step must reach it`);
  }
}

const NEEDS_OWN = (type) => REQUIRED_OWN[type] ?? [];

// The font role a text is set in: its own font, else its style's (labels follow type.label.role; numerals use the display font).
const textFontRole = (el, look) => {
  if (el.font !== undefined) return el.font;
  const style = styleOf(el);
  return style === 'display' || style === 'numeral' ? 'display' : style === 'label' ? (look?.type?.label?.role === 'mono' ? 'mono' : 'label') : 'text';
};

function typeRules(el, path, ctx, errs) {
  const bad = (t, sub) => push(errs, ctx, sub ? `${path}.${sub}` : path, t);
  const t = el.type;
  if (t === 'text') {
    if ([el.field, el.source, el.word].filter((v) => v !== undefined).length !== 1) bad('needs exactly one of field or source (or a fixed word)');
    const style = styleOf(el), [lo, hi] = SIZE_RANGE[style] ?? [14, 900];
    if (el.size !== undefined && el.ladder !== undefined) bad('gives size and ladder; use one');
    if (el.size !== undefined && Number.isFinite(el.size) && (el.size < lo || el.size > hi)) bad(`${style} type is sized from ${lo} to ${hi}`, 'size');
    if (el.ladder !== undefined && isObj(el.ladder)) ladderProblems(el.ladder, `${path}.ladder`, ctx, errs, style);
    if (el.part !== undefined && el.part !== 'all' && el.field !== undefined && !POST_FIELDS[el.field]?.emphasis) bad('splits at the emphasised phrase, which only the headline has', 'part');
    if (el.part !== undefined && el.part !== 'all' && el.source !== undefined) bad('cannot split a source', 'part');
    if (el.split !== undefined && !['meta', 'by', 'label'].includes(el.field)) bad('splits a one-line field: meta, by or label', 'split');
    if (el.format !== undefined) {
      const date = ['date-dd.mm', 'day', 'month', 'not-date'].includes(el.format);
      if (date && el.field !== 'meta') bad('reads a date from the meta field', 'format');
      if (!date && !(el.source === 'index' || el.source === 'folio' || el.field === 'big')) bad('numbers a source (index or folio) or the big field', 'format');
    }
    if (el.vertical !== undefined && el.rot !== undefined) bad('is turned up or down already; leave out rot', 'vertical');
    if (el.split !== undefined && el.format !== undefined) bad('reads its part by itself (a date format) or splits a line; use one', 'format');
    if (el.tiltBar === true) {
      if (style !== 'label') bad('is for a label line', 'tiltBar');
      if (el.place !== undefined) bad('sets a flowing line on a bar; leave out place', 'tiltBar');
      if (el.vertical !== undefined || (el.emphasis !== undefined && el.emphasis !== 'none')) bad('cannot go with vertical or emphasis', 'tiltBar');
    }
    if (Number.isFinite(el.weight)) {
      const role = textFontRole(el, ctx.look), fonts = isObj(ctx.look?.fonts) ? ctx.look.fonts : {}, f = fonts[role] ?? (role === 'mono' ? fonts.label : undefined);
      if (isObj(f) && f.source === 'library' && Array.isArray(f.weights) && !f.weights.includes(el.weight)) bad(`is ${el.weight}, which fonts.${role}.weights does not list (${list(f.weights)}); add it there`, 'weight');
    }
    // pills and icons are the headline's inline marks, set in a text the page does not rebuild (a fitted headline keeps its words only)
    for (const k of ['pills', 'icons']) {
      if (el[k] === undefined) continue;
      if (!INLINE.fields.includes(el.field) || (el.part !== undefined && el.part !== 'all')) bad(`draws the marks of a whole headline; show the headline (part all) to use ${k}`, k);
      else if (el.tiltBar === true || el.vertical !== undefined) bad('cannot go with tiltBar or vertical', k);
    }
    if (isObj(el.pills)) {
      const shape = el.pills.shape ?? 'pill';
      if (shape === 'outline' && el.pills.fill !== undefined) bad('an outline pill has no fill; leave fill out or choose another shape', 'pills.fill');
      if (shape !== 'outline' && el.pills.fill === undefined) bad(`a ${shape} needs a fill`, 'pills');
      if (typeof el.pills.fill === 'string' && COLOUR_NAMES.includes(el.pills.fill) && !ctx.fillRoles.includes(el.pills.fill)) bad(`must be ${FILL_ROLES_HELP} (${list(ctx.fillRoles)})`, 'pills.fill');
    }
  }
  // a primitive's own rules (directions/primitives/<name>.mjs rules(el, bad))
  if (Object.hasOwn(PRIMITIVES, t) && typeof PRIMITIVES[t].rules === 'function') PRIMITIVES[t].rules(el, bad);
  if (el.corners !== undefined && el.corners !== 'all' && el.radius === undefined) bad('says which corners to round but gives no radius', 'corners');
  if (el.corners !== undefined && el.corners !== 'all' && el.radius === 'oval') bad('an oval has no corners to choose', 'corners');
  if (t === 'block' && el.skew !== undefined && el.skew !== 0 && (el.radius !== undefined || el.shadow !== undefined || el.place === undefined)) bad('is drawn only on a plain block with a place, with no rounded corners and no shadow', 'skew');
  if (el.origin !== undefined && el.originPct !== undefined) bad('gives origin and originPct; use one', 'originPct');
  if ((el.origin !== undefined || el.originPct !== undefined) && el.rot === undefined) bad('is the point it turns about, so it needs rot', el.origin !== undefined ? 'origin' : 'originPct');
  if (t === 'fitted-stack') {
    if (el.mode !== 'lines') for (const k of ['trail', 'stretch', 'padBelowEm', 'textShadow']) if (el[k] !== undefined) bad('is for lines mode', k);
    if (['big', 'tag'].includes(el.field) && el.emphasis !== undefined && el.emphasis !== 'none') bad('a figure or tag has no emphasised phrase', 'emphasis');
    if (el.mode === 'block') {
      if (el.sizes === undefined) bad('needs sizes in block mode', 'sizes');
      else if (Array.isArray(el.sizes)) for (let i = 1; i < el.sizes.length; i++) if (el.sizes[i] >= el.sizes[i - 1]) { bad('must go from the largest down', 'sizes'); break; }
      if (el.cap !== undefined || el.floor !== undefined) bad('block mode takes sizes, not cap and floor');
    } else if (el.mode === 'lines' || el.mode === 'fill') {
      if (el.cap === undefined || el.floor === undefined) bad(`needs cap and floor in ${el.mode} mode`);
      else if (el.floor > el.cap) bad('is above the largest size', 'floor');
      if (el.sizes !== undefined) bad('sizes are for block mode', 'sizes');
    }
    if (Number.isFinite(el.maxLines) && el.maxLines > (el.mode === 'block' ? 6 : 5) && el.mode !== 'fill') bad('is at most 5 in lines mode and 6 in block mode (fill mode takes up to 8)', 'maxLines');
    if (el.lead !== undefined && el.mode !== 'lines') bad('is for lines mode', 'lead');
  }
  if (t === 'numeral') {
    if (el.sizes !== undefined) {
      if (el.cap !== undefined || el.min !== undefined) bad('gives sizes and cap or min; use one');
      else if (Array.isArray(el.sizes)) for (let i = 1; i < el.sizes.length; i++) if (el.sizes[i] >= el.sizes[i - 1]) { bad('must go from the largest down', 'sizes'); break; }
    } else if (el.cap === undefined || el.min === undefined) bad('needs cap and min, or sizes');
    if (Number.isFinite(el.min) && Number.isFinite(el.cap) && el.min > el.cap) bad('is above the largest size', 'min');
    if ((el.field ?? 'big') === 'meta' && el.format === undefined) bad('reading a date from the meta field needs a format', 'format');
    if (Number.isFinite(el.weight)) {
      const role = el.family ?? 'display', fonts = isObj(ctx.look?.fonts) ? ctx.look.fonts : {}, f = fonts[role] ?? (role === 'mono' ? fonts.label : undefined);
      if (isObj(f) && f.source === 'library' && Array.isArray(f.weights) && !f.weights.includes(el.weight)) bad(`is ${el.weight}, which fonts.${role}.weights does not list (${list(f.weights)}); add it there`, 'weight');
    }
    if (el.format !== undefined) {
      const date = ['date-dd.mm', 'day', 'month', 'not-date'].includes(el.format);
      if (date && (el.field ?? 'big') !== 'meta') bad('reads a date from the meta field', 'format');
    }
  }
  if (t === 'mantra-rows') {
    if (Number.isFinite(el.floor) && Number.isFinite(el.cap) && el.floor > el.cap) bad('is above the largest size', 'floor');
    if (Number.isFinite(el.rmin) && Number.isFinite(el.rmax) && el.rmin > el.rmax) bad('is more than rmax', 'rmin');
  }
  if (t === 'rows') {
    if (el.textTrack !== undefined && el.textStyle !== 'label') bad('is for the label style', 'textTrack');
    if (el.numberSpan !== undefined && el.number === 'none' && el.keys === undefined) bad('needs numbering or row labels (keys)', 'numberSpan');
    if (el.sizeByCount !== undefined && el.each !== 'items') bad('is for the items of a list', 'sizeByCount');
    if (el.sizeByCount !== undefined && Array.isArray(el.sizeByCount)) for (let i = 1; i < el.sizeByCount.length; i++) if (!(el.sizeByCount[i][0] > el.sizeByCount[i - 1][0]) || el.sizeByCount[i][1] > el.sizeByCount[i - 1][1]) { bad('must list the fewest items first, each step with more items and a smaller size than the one before', 'sizeByCount'); break; }
    if (el.ruleEnd === true && (el.rule === undefined || el.rule === 'none')) bad('closes the rows with a rule, so it needs rule above each row', 'ruleEnd');
    if (el.keys !== undefined && el.each !== 'meta-parts') bad('labels the rows of an event table (each: meta-parts)', 'keys');
    if (el.numberTile !== undefined && el.number === 'none' && el.icons === undefined) bad('needs numbering (or icons)', 'numberTile');
    if (el.numberStyle !== undefined && (el.number === undefined || el.number === 'none') && el.numberTile === undefined) bad('needs numbering', 'numberStyle');
  }
  if (t === 'photo') {
    if (el.border !== undefined && !['print', 'card'].includes(el.shape)) bad('is the mount of a print or a card', 'border');
    if (el.radius !== undefined && el.shape !== 'rounded') bad('rounds a rounded picture', 'radius');
    if (el.fade !== undefined && (el.blend === undefined || el.blend === 'none')) bad('is the fade of a picture that melts into the page (blend: ground or fade)', 'fade');
    if (el.blend !== undefined && el.blend !== 'none') {
      if (el.shape !== undefined && el.shape !== 'rect') bad('melts only a plain rectangle picture', 'blend');
      for (const k of ['shadow', 'ring', 'rot', 'keyline', 'border', 'radius']) if (el[k] !== undefined) bad(`melts into the page, so it takes no ${k}`, 'blend');
    }
  }
  if (t === 'seam' && !(el.leftY > el.rightY)) bad('must be more than rightY: the edge rises to the right', 'leftY');
  if (t === 'sticker') {
    if (el.radius !== undefined && el.shape !== 'tile') bad('rounds a tile (circles and pills are already round)', 'radius');
    const hasKids = Array.isArray(el.children) && el.children.length > 0;
    if (el.field !== undefined && hasKids) bad('gives a field and text items; use one');
    if (el.field === undefined && !hasKids) bad('carries nothing: give it a field or text items');
    if (el.ladder !== undefined && (el.field === undefined || el.ladder.by !== el.field)) bad('counts the length of the field it carries', 'ladder');
    if (el.ladder !== undefined && el.textSize !== undefined) bad('gives a ladder and a text size; use one');
    if (el.ladder !== undefined && isObj(el.ladder)) ladderProblems(el.ladder, `${path}.ladder`, ctx, errs, 'display');
    const shape = el.shape ?? 'circle';
    if (['circle', 'stamp', 'seal'].includes(shape) && el.size === undefined) bad('needs a size');
    if (shape === 'pill' && el.size === undefined && el.w === undefined) bad('needs a width (w) or a size');
    if (shape === 'tile' && el.size === undefined && (el.w === undefined || el.h === undefined)) bad('needs a size, or w and h');
    if (el.field !== undefined && Number.isFinite(el.textSize) && (el.textSize < SIZE_RANGE.display[0] || el.textSize > 400)) bad('is out of range', 'textSize');
    const hug = el.w === 'hug';
    for (const k of ['minW', 'maxW']) if (el[k] !== undefined && !hug) bad('goes with w "hug" only', k);
    if (hug) {
      if (Number.isFinite(el.minW) && Number.isFinite(el.maxW) && el.minW > el.maxW) bad('is above maxW', 'minW');
      if (shape !== 'pill') bad('a hugging sticker is a pill', 'w');
      if (el.field === undefined) bad('a hugging sticker carries a field', 'w');
      if (el.fit === undefined) bad('a hugging sticker needs fit (cap and floor)', 'w');
      if (el.h === undefined && el.size === undefined) bad('a hugging sticker needs a height (h) or a size');
    }
    if (el.stretch !== undefined && el.fit === undefined) bad('goes with fit (it is the width of the fitted words)', 'stretch');
    if (el.fit !== undefined && isObj(el.fit)) {
      if (el.fit.h === undefined) bad('needs h, the height of the box the words fill', 'fit');
      if (el.fit.w === undefined && !hug) bad('needs w, the width of the box the words fill (a hugging sticker takes its width from its words)', 'fit');
      if (el.field === undefined) bad('sizes the words of a field; give it a field', 'fit');
      if (el.ladder !== undefined) bad('gives fit and a ladder; use one', 'fit');
      if (el.textSize !== undefined) bad('gives fit and a text size; use one', 'fit');
      if (Number.isFinite(el.fit.floor) && Number.isFinite(el.fit.cap) && el.fit.floor > el.fit.cap) bad('is above the largest size', 'fit.floor');
    }
  }
  if (t === 'scrim' && Number.isFinite(el.floor) && Number.isFinite(el.cap) && el.floor > el.cap) bad('is above the most strength', 'floor');
  gradientCapabilityRules(el, path, ctx, errs);
  if (t === 'wordmark-pattern' && el.fadeFrom !== undefined && !el.fade) bad('needs fade', 'fadeFrom');
  if (t === 'rule' && el.vertical && el.h === undefined && el.place === undefined) bad('a vertical rule needs a height (h)');
}

const FILL_ROLES_HELP = 'a colour a panel can be filled with';

// ---- gradients, colour over a picture, brand graphics: the rules that need more than one property ----
function gradientRules(g, path, ctx, errs) {
  if (!isObj(g)) return;
  const bad = (t, sub) => push(errs, ctx, sub ? `${path}.${sub}` : path, t);
  if (Array.isArray(g.stops)) g.stops.forEach((s, i) => { if (typeof s === 'string' && COLOUR_NAMES.includes(s) && !ctx.fillRoles.includes(s)) bad(`must be ${FILL_ROLES_HELP} (${list(ctx.fillRoles)})`, `stops[${i}]`); });
  if (g.mid !== undefined && !(Array.isArray(g.stops) && g.stops.length === 3)) bad('places the middle colour, so the gradient needs three colours', 'mid');
  if (g.kind === 'radial' && g.angle !== undefined) bad('is the direction of a linear gradient; a radial one spreads from its point (at)', 'angle');
  if (g.kind === 'linear') for (const k of ['at', 'shape']) if (g[k] !== undefined) bad('is for a radial gradient', k);
}
function gradientCapabilityRules(el, path, ctx, errs) {
  const bad = (t, sub) => push(errs, ctx, sub ? `${path}.${sub}` : path, t);
  if (el.gradient !== undefined) gradientRules(el.gradient, `${path}.gradient`, ctx, errs);
  if (el.type === 'box' && el.gradient !== undefined && el.fill !== undefined) bad('gives fill and a gradient fill; use one', 'gradient');
  if (el.type === 'overlay') {
    if (typeof el.colour === 'string' && COLOUR_NAMES.includes(el.colour) && !ctx.fillRoles.includes(el.colour)) bad(`must be ${FILL_ROLES_HELP} (${list(ctx.fillRoles)})`, 'colour');
    if (Number.isFinite(el.floor) && Number.isFinite(el.cap) && el.floor > el.cap) bad('is above the most strength', 'floor');
    if (el.fade !== undefined && el.from === 'flat') bad('is the fade of an overlay strongest at the foot or the top; an even one does not fade', 'fade');
  }
  if (el.type === 'graphic' && el.tint !== undefined && typeof el.tint === 'string' && COLOUR_NAMES.includes(el.tint) && !ctx.fillRoles.includes(el.tint)) bad(`must be ${FILL_ROLES_HELP} (${list(ctx.fillRoles)})`, 'tint');
}

function element(el, path, ctx, errs, st, parent, depth, comp, slot = false) {
  if (!isObj(el)) return push(errs, ctx, path, 'must be an object like { "type": "text", ... }');
  if (typeof el.type !== 'string' || !hasOwn(ELEMENTS, el.type)) return push(errs, ctx, path, `type must be one of ${list(ELEMENT_TYPES)} (got ${show(el.type)})`);
  if (depth > LIMITS.depth) { if (!st.deep) push(errs, ctx, path, `is nested more than ${LIMITS.depth} levels deep`); st.deep = true; return; }
  if (st.nodes.length >= LIMITS.nodes) { if (!st.over) push(errs, ctx, path, `is element ${st.nodes.length + 1}; a composition has at most ${LIMITS.nodes}`); st.over = true; return; }
  const spec = ELEMENTS[el.type], node = { el, path, parent, depth, order: st.nodes.length, type: el.type, slot }, mark = errs.length;
  st.nodes.push(node);
  const isChild = parent !== null;
  const known = keysOf(el.type);
  unknownKeys(el, known, path, ctx, errs, `of a ${el.type}`);
  for (const k of NEEDS_OWN(el.type)) if (el[k] === undefined) push(errs, ctx, path, `a ${el.type} needs ${k}`);
  for (const k of Object.keys(el)) {
    if (k === 'type' || k === 'children' || k === 'sticker' || !known.includes(k) || el[k] === undefined) continue;
    const kp = `${path}.${k}`;
    if (k === 'place') { checkPlace(el.place, kp, ctx, errs, { child: isChild }); continue; }
    check(descriptorOf(el.type, k), el[k], kp, ctx, errs);
  }
  // fill and ink are palette roles, and a fill is a colour a panel can have
  if (el.fill !== undefined && typeof el.fill === 'string' && COLOUR_NAMES.includes(el.fill) && !ctx.fillRoles.includes(el.fill)) push(errs, ctx, `${path}.fill`, `must be ${FILL_ROLES_HELP} (${list(ctx.fillRoles)})`);
  // a seam's colour is a fill role
  if (el.type === 'seam' && typeof el.lower === 'string' && COLOUR_NAMES.includes(el.lower) && !ctx.fillRoles.includes(el.lower)) push(errs, ctx, `${path}.lower`, `must be ${FILL_ROLES_HELP} (${list(ctx.fillRoles)})`);
  // placement
  const hasPlace = el.place !== undefined;
  if (spec.placement === 'none') {
    if (isChild) push(errs, ctx, path, `a ${el.type} takes the whole page and goes at the top of the composition, not inside a box`);
    if (hasPlace) push(errs, ctx, path, `a ${el.type} has its own geometry and takes no place`);
  } else if (!isChild) {
    if (!hasPlace) push(errs, ctx, path, `needs a place (grid, px, anchor or inset)`);
    for (const k of FLOW_ONLY) if (el[k] !== undefined && spec.common.includes(k)) push(errs, ctx, `${path}.${k}`, 'is for an item flowing in a box; use place at the top of a composition');
  } else if (!hasPlace) {
    if (slot) push(errs, ctx, path, 'the sticker of a seam needs a place (anchor or px, relative to the top edge of the seam)');
    else if (!spec.flow) push(errs, ctx, path, `a ${el.type} cannot flow in a box; give it a place (px or anchor, relative to the box)`);
  } else {
    if (isChild && !slot && parent.type === 'seam') push(errs, ctx, path, 'an item of a seam flows in the colour below the edge and takes no place');
    for (const k of FLOW_ONLY) if (el[k] !== undefined && spec.common.includes(k)) push(errs, ctx, `${path}.${k}`, 'is for an item that flows; this one has a place');
  }
  if (isChild && el.z !== undefined) push(errs, ctx, `${path}.z`, slot ? 'a seam\'s sticker takes no layer' : 'is for the top of a composition; inside a box the order is the list\'s');
  if (errs.length === mark) typeRules(el, path, ctx, errs);
  // children
  if (el.children !== undefined) {
    if (!spec.container) push(errs, ctx, path, `a ${el.type} holds no items`);
    else if (!Array.isArray(el.children)) push(errs, ctx, `${path}.children`, 'must be a list of elements');
    else {
      const allowed = spec.container === 'text' ? ['text'] : ELEMENT_TYPES.filter((t) => !TOP_ONLY.includes(t));
      el.children.forEach((c, i) => {
        if (isObj(c) && typeof c.type === 'string' && hasOwn(ELEMENTS, c.type) && !allowed.includes(c.type)) return push(errs, ctx, `${path}.children[${i}]`, `a ${el.type} holds ${list(allowed)}, not a ${c.type}`);
        element(c, `${path}.children[${i}]`, ctx, errs, st, node, depth + 1, comp);
      });
    }
  }
  // the one sticker a seam may hold, on its edge
  if (el.sticker !== undefined && known.includes('sticker')) {
    const s = el.sticker;
    if (!isObj(s)) push(errs, ctx, `${path}.sticker`, 'must be a sticker element like { "type": "sticker", ... }');
    else if (s.type !== 'sticker') push(errs, ctx, `${path}.sticker`, 'must be an element of type sticker');
    else element(s, `${path}.sticker`, ctx, errs, st, node, depth + 1, comp, true);
  }
  return node;
}

// ---- the composition ----
function fieldSpecProblems(name, f, kind, path, ctx, errs) {
  if (!isObj(f)) return push(errs, ctx, path, 'must be an object like { "required": true, "max": 60 }');
  if (hasOwn(POST_LISTS, name)) {
    const L = POST_LISTS[name];
    unknownKeys(f, ['required', 'min', 'max'], path, ctx, errs);
    for (const k of ['min', 'max']) if (f[k] !== undefined && !(Number.isInteger(f[k]) && f[k] >= L.min && f[k] <= L.max)) push(errs, ctx, `${path}.${k}`, `must be a whole number from ${L.min} to ${L.max}`);
    if (Number.isInteger(f.min) && Number.isInteger(f.max) && f.min > f.max) push(errs, ctx, path, 'min is more than max');
  } else if (name === 'image') {
    unknownKeys(f, ['required'], path, ctx, errs);
  } else if (name === 'chart') {
    // a chart's points: from 2 to 12 (a donut or progress bar draws one value whatever these say)
    unknownKeys(f, ['required', 'min', 'max'], path, ctx, errs);
    for (const k of ['min', 'max']) if (f[k] !== undefined && !(Number.isInteger(f[k]) && f[k] >= POST_CHART.min && f[k] <= POST_CHART.max)) push(errs, ctx, `${path}.${k}`, `must be a whole number of points from ${POST_CHART.min} to ${POST_CHART.max}`);
    if (Number.isInteger(f.min) && Number.isInteger(f.max) && f.min > f.max) push(errs, ctx, path, 'min is more than max');
  } else {
    unknownKeys(f, ['required', 'max'], path, ctx, errs);
    const cap = POST_FIELDS[name].max;
    if (f.max !== undefined && !(Number.isInteger(f.max) && f.max >= 1 && f.max <= cap)) push(errs, ctx, `${path}.max`, `must be a whole number of characters from 1 to ${cap} (the most a post allows)`);
  }
  if (f.required !== undefined && typeof f.required !== 'boolean') push(errs, ctx, `${path}.required`, 'must be true or false');
}

function acceptsProblems(a, i, comp, path, ctx, errs) {
  if (!isObj(a)) return push(errs, ctx, path, 'must be an object like { "field": "headline", "part": "pre", "maxChars": 22 }');
  if (typeof a.field !== 'string' || !FIELD_NAMES.includes(a.field)) return push(errs, ctx, `${path}.field`, `must be one of ${list(FIELD_NAMES)}`);
  if (isObj(comp.fields) && !hasOwn(comp.fields, a.field)) push(errs, ctx, `${path}.field`, `names ${show(a.field)}, which the composition does not declare`);
  if (a.field === 'image') return push(errs, ctx, `${path}.field`, 'a picture has no length to judge');
  if (hasOwn(POST_LISTS, a.field)) {
    const L = POST_LISTS[a.field];
    unknownKeys(a, ['field', 'min', 'max'], path, ctx, errs);
    for (const k of ['min', 'max']) if (a[k] !== undefined && !(Number.isInteger(a[k]) && a[k] >= 1 && a[k] <= L.max)) push(errs, ctx, `${path}.${k}`, `must be a whole number from 1 to ${L.max}`);
    if (a.min === undefined && a.max === undefined) push(errs, ctx, path, 'needs min or max');
    if (Number.isInteger(a.min) && Number.isInteger(a.max) && a.min > a.max) push(errs, ctx, path, 'min is more than max');
    return;
  }
  unknownKeys(a, ['field', 'part', 'minChars', 'maxChars'], path, ctx, errs);
  if (a.minChars !== undefined && !(Number.isInteger(a.minChars) && a.minChars >= 1 && a.minChars <= POST_FIELDS[a.field].max)) push(errs, ctx, `${path}.minChars`, `must be a whole number of characters from 1 to ${POST_FIELDS[a.field].max}`);
  if (Number.isInteger(a.minChars) && Number.isInteger(a.maxChars) && a.minChars > a.maxChars) push(errs, ctx, path, 'minChars is more than maxChars');
  if (a.part !== undefined && !['all', 'pre', 'phrase'].includes(a.part)) push(errs, ctx, `${path}.part`, 'must be one of all, pre, phrase');
  else if (a.part !== undefined && a.part !== 'all' && !POST_FIELDS[a.field].emphasis) push(errs, ctx, `${path}.part`, 'splits at the emphasised phrase, which only the headline has');
  if (!(Number.isInteger(a.maxChars) && a.maxChars >= 1 && a.maxChars <= POST_FIELDS[a.field].max)) push(errs, ctx, `${path}.maxChars`, `must be a whole number of characters from 1 to ${POST_FIELDS[a.field].max}`);
}

const COMP_KEYS = ['kind', 'name', 'describe', 'ground', 'fields', 'accepts', 'calm', 'fit', 'elements'];

function compositionProblems(c, i, ctx, errs) {
  const path = `compositions[${i}]`;
  if (!isObj(c)) return push(errs, ctx, path, 'must be an object');
  const before = errs.length;
  unknownKeys(c, COMP_KEYS, path, ctx, errs, 'of a composition');
  if (typeof c.kind !== 'string' || !KINDS.includes(c.kind)) { push(errs, ctx, `${path}.kind`, `must be one of ${list(KINDS)} (got ${show(c.kind)})`); return; }
  const cctx = { ...ctx, comp: c, declared: null };
  check({ kind: 'text', max: LIMITS.name }, c.name, `${path}.name`, cctx, errs);
  check({ kind: 'text', max: LIMITS.description }, c.describe, `${path}.describe`, cctx, errs);
  // ground
  const grounds = ctx.look?.colour?.grounds;
  const oneGround = (g, p) => {
    if (typeof g !== 'string' || !GROUNDS.includes(g)) return push(errs, ctx, p, `must be one of ${list(GROUNDS)} (got ${show(g)})`);
    if (Array.isArray(grounds) && !grounds.includes(g)) push(errs, ctx, p, `is a page colour (${g}) the look does not list in colour.grounds (${list(grounds)})`);
  };
  // fields
  let declared = [];
  if (!isObj(c.fields) || !Object.keys(c.fields).length) push(errs, ctx, `${path}.fields`, `must name the fields the composition shows, like { "headline": { "required": true } }`);
  else {
    for (const [name, f] of Object.entries(c.fields)) {
      if (!KIND_FIELDS[c.kind].includes(name)) { push(errs, ctx, `${path}.fields`, `${safeKey(name)} is not a field of a ${c.kind} post (${list(KIND_FIELDS[c.kind])})`); continue; }
      declared.push(name);
      fieldSpecProblems(name, f, c.kind, `${path}.fields.${name}`, ctx, errs);
    }
    for (const f of POST_REQUIRED[c.kind]) if (!isObj(c.fields[f]) || c.fields[f].required !== true) push(errs, ctx, `${path}.fields`, `a ${c.kind} post needs ${f}, so it must be declared with "required": true`);
  }
  cctx.declared = declared;
  // ground (after fields: its cases name fields)
  if (c.ground === undefined) push(errs, ctx, `${path}.ground`, 'is required');
  else if (typeof c.ground === 'string') oneGround(c.ground, `${path}.ground`);
  else if (!Array.isArray(c.ground) || !c.ground.length || c.ground.length > LIMITS.groundCases) push(errs, ctx, `${path}.ground`, `must be a page colour or a list of 1 to ${LIMITS.groundCases} cases like { "when": { "present": "image" }, "ground": "dark" }`);
  else c.ground.forEach((g, gi) => {
    const gp = `${path}.ground[${gi}]`;
    if (!isObj(g)) return push(errs, ctx, gp, 'must be an object like { "when": { ... }, "ground": "paper" }');
    unknownKeys(g, ['when', 'ground'], gp, ctx, errs);
    oneGround(g.ground, `${gp}.ground`);
    const last = gi === c.ground.length - 1;
    if (last && g.when !== undefined) push(errs, ctx, gp, 'the last case has no "when" (it is the ground when no other holds)');
    if (!last && g.when === undefined) push(errs, ctx, gp, 'needs a "when" (only the last case has none)');
    if (g.when !== undefined) checkWhen(g.when, `${gp}.when`, cctx, errs);
  });
  if (c.accepts !== undefined) {
    if (!Array.isArray(c.accepts) || c.accepts.length > LIMITS.accepts) push(errs, ctx, `${path}.accepts`, `must be a list of up to ${LIMITS.accepts} rules`);
    else c.accepts.forEach((a, ai) => acceptsProblems(a, ai, c, `${path}.accepts[${ai}]`, cctx, errs));
  }
  if (c.calm !== undefined) {
    if (!isObj(c.calm)) push(errs, ctx, `${path}.calm`, 'must be { "maxShare": 0.6 }');
    else { unknownKeys(c.calm, ['maxShare'], `${path}.calm`, ctx, errs); check({ kind: 'number', min: 0.45, max: 0.8 }, c.calm.maxShare, `${path}.calm.maxShare`, cctx, errs); }
  }
  if (c.fit !== undefined) {
    if (typeof c.fit === 'string') { if (!['margins', 'frame'].includes(c.fit)) push(errs, ctx, `${path}.fit`, 'must be margins, frame or { "pad", "top", "bottom" }'); }
    else if (!isObj(c.fit)) push(errs, ctx, `${path}.fit`, 'must be margins, frame or { "pad", "top", "bottom" }');
    else {
      unknownKeys(c.fit, ['pad', 'top', 'bottom'], `${path}.fit`, ctx, errs);
      for (const k of ['pad', 'top', 'bottom']) check({ kind: 'number', min: 0, max: 300, int: true }, c.fit[k], `${path}.fit.${k}`, cctx, errs);
    }
  }
  // elements
  if (!Array.isArray(c.elements) || !c.elements.length) { push(errs, ctx, `${path}.elements`, `must be a list of 1 to ${LIMITS.nodes} elements`); return; }
  const st = { nodes: [], over: false, deep: false };
  c.elements.forEach((el, ei) => element(el, `${path}.elements[${ei}]`, cctx, errs, st, null, 1, c));
  // one of each (they own the page)
  for (const t of ['rows', 'frame', 'meta-row', 'seam']) {
    const n = st.nodes.filter((x) => x.type === t);
    if (n.length > 1) push(errs, ctx, n[1].path, `a composition has at most one ${t}`);
  }
  for (const n of st.nodes.filter((x) => x.type === 'text' && x.el.follow === true)) {
    let inSticker = false;
    for (let a = n.parent; a; a = a.parent) if (a.type === 'sticker') inSticker = true;
    if (!inSticker) push(errs, ctx, `${n.path}.follow`, 'is drawn for text inside a sticker (a date numeral on a tile); put it there');
  }
  const droppers = st.nodes.filter((x) => x.type === 'text' && x.el.dropWhenTight === true);
  if (droppers.length > 1) push(errs, ctx, `${droppers[1].path}.dropWhenTight`, 'at most one element of a composition may leave itself out when tight');
  const measures = (x) => (x.type === 'fitted-stack' && (x.el.field ?? 'headline') === 'headline') || (x.type === 'text' && ['headline', 'quote'].includes(x.el.field) && x.el.dropWhenTight !== true);
  if (st.nodes.some((x) => x.type === 'text' && x.el.follow === true) && !st.nodes.some(measures)) push(errs, ctx, `${st.nodes.find((x) => x.type === 'text' && x.el.follow === true).path}.follow`, 'needs a headline text or a fitted headline in the composition to follow');
  if (droppers.length && !st.nodes.some(measures)) push(errs, ctx, `${droppers[0].path}.dropWhenTight`, 'needs a headline text or a fitted headline in the composition to measure');
  if (errs.length === before) compositionStaticChecks(c, st.nodes, cctx, path, errs, push);
}

// ---- the look-level rules that need more than a descriptor ----
function fontRules(look, ctx, errs, lib) {
  const roles = isObj(look.fonts) ? look.fonts : {};
  for (const [role, spec] of Object.entries(roles)) {
    if (!isObj(spec) || spec.source !== 'library' || typeof spec.family !== 'string') continue;
    const p = `fonts.${role}`, fam = lib.find((f) => f.family === spec.family);
    if (!fam) { push(errs, ctx, `${p}.family`, `${show(spec.family)} is not in the font library (${list(lib.map((f) => f.family))})`); continue; }
    const bounds = (w) => { const [lo, hi = lo] = String(w).split(' ').map(Number); return [lo, hi]; };
    const styles = spec.italic ? ['normal', 'italic'] : ['normal'];
    for (const style of styles) {
      const files = fam.files.filter((x) => x.style === style);
      if (!files.length) { push(errs, ctx, `${p}.italic`, `${fam.family} has no ${style} style`); continue; }
      for (const w of Array.isArray(spec.weights) ? spec.weights : []) if (Number.isFinite(w) && !files.some((x) => { const [lo, hi] = bounds(x.weight); return w >= lo && w <= hi; })) push(errs, ctx, `${p}.weights`, `${show(w)} is outside the weights ${fam.family} has in ${style}`);
    }
    if (spec.opsz !== undefined && Number.isFinite(spec.opsz)) {
      const ax = fam.axes?.opsz;
      if (!ax) push(errs, ctx, `${p}.opsz`, `${fam.family} has no optical size axis`);
      else if (spec.opsz < ax[0] || spec.opsz > ax[1]) push(errs, ctx, `${p}.opsz`, `${show(spec.opsz)} is outside the optical sizes ${fam.family} has (${ax[0]} to ${ax[1]})`);
    }
    if (spec.stretch !== undefined && Number.isFinite(spec.stretch)) {
      const ok = fam.files.some((x) => { const m = /^(\d+)% (\d+)%$/.exec(x.stretch ?? ''); return m && spec.stretch >= +m[1] && spec.stretch <= +m[2]; });
      if (!ok) push(errs, ctx, `${p}.stretch`, `${show(spec.stretch)} is outside the widths ${fam.family} has (or it has none)`);
    }
  }
  // each type style's weight is one the font of its role carries
  const t = look.type;
  if (!isObj(t)) return;
  const fontFor = { display: 'display', body: 'text', item: 'text', label: isObj(t.label) && t.label.role === 'mono' ? 'mono' : 'label' };
  for (const [style, role] of Object.entries(fontFor)) {
    const f = roles[role] ?? (role === 'mono' ? roles.label : undefined), w = t[style]?.weight;
    if (isObj(f) && f.source === 'library' && Array.isArray(f.weights) && Number.isFinite(w) && !f.weights.includes(w)) push(errs, ctx, `type.${style}.weight`, `is ${w}, which fonts.${role}.weights does not list (${list(f.weights)}); add it there`);
  }
}

function canvasRules(look, ctx, errs) {
  const f = look.canvas?.feed;
  if (!isObj(f) || !isObj(f.grid) || !isObj(f.margin)) return;
  const g = gridOf(look);
  if (!g) return;
  const p = 'canvas.feed';
  if (g.colW < 16) push(errs, ctx, `${p}.grid`, `the columns are ${Math.floor(g.colW)} px wide; use fewer columns, smaller margins or a smaller gutter (each needs at least 16 px)`);
  if (g.head > 0 && g.rows < 2) push(errs, ctx, `${p}.grid`, 'a top row height needs at least two rows');
  if (g.rows === 0 && g.head > 0) push(errs, ctx, `${p}.grid.head`, 'needs rows');
  if (g.rows > 0 && g.rowH < 16) push(errs, ctx, `${p}.grid`, `the rows are ${Math.floor(g.rowH)} px tall; use fewer rows or smaller margins (each needs at least 16 px)`);
  for (const k of ['left', 'right']) if (f.margin[k] + 16 > PAGE.w / 2) push(errs, ctx, `${p}.margin.${k}`, 'is too wide for the page');
  const m = look.devices?.metaRow;
  if (isObj(m) && Array.isArray(m.cells)) {
    m.cells.forEach((c, i) => { if (isObj(c) && Number.isInteger(c.col) && Number.isInteger(c.span) && c.col + c.span - 1 > g.cols) push(errs, ctx, `devices.metaRow.cells[${i}]`, `runs past the grid's ${g.cols} columns`); });
    if (g.head === 0) push(errs, ctx, 'devices.metaRow', 'needs a top row (canvas.feed.grid.head above 0) to sit in');
  }
}

const TOP_KEYS = ['schema', 'id', 'name', 'description', 'origin', 'canvas', 'fonts', 'type', 'colour', 'devices', 'photo', 'logo', 'dials', 'compositions'];
const REQUIRED_SECTIONS = ['canvas', 'fonts', 'type', 'colour'];

export function validateLook(look, where = 'look', opts = {}) {
  const { shipped = false } = opts;
  const errs = [];
  const W0 = String(where).replace(/[^A-Za-z0-9 ._:\-\[\]"]/g, '?').slice(0, 60);
  const ctx = { W: W0, look, grid: null, declared: null, comp: null, fillRoles: [] };
  const g = { n: 0, stop: false };
  guard(look, '', 0, g, errs, W0);
  if (errs.length) return finish(errs);
  if (!isObj(look)) return finish([`${W0}: a look must be an object`]);
  let size = 0;
  try { size = JSON.stringify(look).length; } catch { return finish([`${W0}: the look cannot be written as JSON`]); }
  if (size > LIMITS.definitionBytes) return finish([`${W0}: the look is ${Math.round(size / 1024)} KB; the most is ${LIMITS.definitionBytes / 1024} KB`]);
  if (typeof look.id === 'string' && ID.test(look.id)) ctx.W = `${W0} "${look.id}"`;
  ctx.fillRoles = FILL_ROLES;
  unknownKeys(look, TOP_KEYS, '', ctx, errs, 'of a look');
  if (look.schema !== LOOK_SCHEMA) push(errs, ctx, 'schema', `must be ${LOOK_SCHEMA} (this engine reads schema ${LOOK_SCHEMA})`);
  if (typeof look.id !== 'string' || !ID.test(look.id)) push(errs, ctx, 'id', 'must be lowercase letters, digits and - (up to 40, starting with a letter or digit)');
  check({ kind: 'text', max: LIMITS.name }, look.name, 'name', ctx, errs);
  if (look.description !== undefined) check({ kind: 'text', max: LIMITS.description }, look.description, 'description', ctx, errs);
  if (typeof look.origin !== 'string' || !(look.origin === 'shipped' ? shipped : ORIGIN.test(look.origin))) push(errs, ctx, 'origin', shipped ? 'must be "shipped", or "copy:shipped:" or "copy:own:" followed by an id' : 'must be "copy:shipped:" or "copy:own:" followed by an id (only the engine\'s own looks are "shipped")');
  for (const s of SECTION_NAMES) {
    if (look[s] === undefined) { if (REQUIRED_SECTIONS.includes(s)) push(errs, ctx, s, 'is required'); continue; }
    check(SECTIONS[s], look[s], s, ctx, errs);
  }
  if (errs.length === 0) {
    const lib = opts.fontLibrary ?? shippedFontLibrary();
    fontRules(look, ctx, errs, lib);
    canvasRules(look, ctx, errs);
  }
  if (look.compositions !== undefined) {
    const cs = look.compositions;
    if (!Array.isArray(cs) || cs.length > LIMITS.compositions) push(errs, ctx, 'compositions', `must be a list of up to ${LIMITS.compositions} compositions`);
    else if (errs.length === 0) {
      ctx.grid = gridOf(look);
      const perKind = {};
      cs.forEach((c) => { if (isObj(c) && KINDS.includes(c.kind)) perKind[c.kind] = (perKind[c.kind] ?? 0) + 1; });
      for (const [k, n] of Object.entries(perKind)) if (n > LIMITS.perKind) push(errs, ctx, 'compositions', `has ${n} ${k} compositions; the most is ${LIMITS.perKind} for each kind`);
      cs.forEach((c, i) => compositionProblems(c, i, ctx, errs));
    }
  }
  return finish(errs);
}
const finish = (errs) => errs.map(clipMsg);

// A brand's list of looks: an array of up to MAX looks, ids unique, each valid.
export function validateLooks(list_, where = 'looks', opts = {}) {
  if (list_ === undefined) return [];
  const W = String(where).replace(/[^A-Za-z0-9 ._:\-\[\]"]/g, '?').slice(0, 60);
  if (!Array.isArray(list_) || list_.length > LIMITS.looksPerBrand) return [clipMsg(`${W}: must be a list of up to ${LIMITS.looksPerBrand} looks`)];
  const errs = list_.flatMap((l, i) => validateLook(l, `${W}[${i}]`, opts));
  const ids = list_.map((l) => (isObj(l) && typeof l.id === 'string' && ID.test(l.id) ? l.id : null)).filter(Boolean);
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) errs.push(clipMsg(`${W}: the id "${id}" is used by more than one look`));
  return errs;
}
export { CONTAINERS, FLOWING, TEXT_FIELDS, VALIGNS, COMMON };
