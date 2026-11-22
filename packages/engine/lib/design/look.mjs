// Looks as data: the look and composition schema, interpreted onto the design kit (lib/design/directions/kit.mjs) by a later step.
// Pure: no Chrome, no I/O beyond the font manifest (font-library.mjs). A look is a brand-sized description of a whole way of
// composing a post: look-level sections (canvas, fonts, type, colour, devices, photo, logo, dials) and up to 21 compositions, each a
// tree of up to 40 elements of the types in ELEMENTS. See docs/design.md ("Looks as data: the schema") and look-elements.mjs.
//
//   validateLook(look, where, { shipped, fontLibrary })  -> [problem sentences], empty when it can be drawn
//   validateLooks(list, where, opts)                     -> the same for a brand's list of looks
//   lookCatalogue()                                      -> plain data the web editor draws its controls from
//   lookBrief(look)                                      -> kinds, variants, fields and budgets for the AI and the post editor
//   normaliseLook(look)                                  -> the look, deep frozen, defaults filled, compositions given their ids
//   lookHash(look)                                       -> sha256 of the canonical JSON of the normalised look
//
// A composition's id is derived, `<kind>/<index>` (the index among the look's compositions of that kind, in order); it is never stored.
//
// Defaults (what normaliseLook fills in; documented here so the interpreter and the panel agree):
//   description ''                                  canvas.feed.grid.rows 0, head 0     canvas.feed.extraLines []
//   fonts.mono = fonts.label                        type.item = the body's size, lead and weight; type.numeral { track -0.04, figures lining }
//   type.display { case as-typed, ladder [1, .9, .82], trim none, optical false }           type.body.strength 1
//   type.label { upper true, role label }           colour { field primary, sticker accent, accentAsType never }
//   devices.rule { hair 1, heavy 4 }  devices.frame { t 0, pad 0 }  devices.highlight { pad [0,0,0,0], tilt 0 }
//   devices.shadow { x 0, y 0, colour ink }  devices.angles all 0  devices.folio no  devices.wordmark { opacity .05, sep dash }
//   photo { treat [], tint primary }  logo { default off, height 44 }  dials { tilt 1, density 0, weightShift 0 }
//   composition: fit margins, accepts [], calm null; fields { required false, max the post's own maximum }
//   element: each property with a `default` in the catalogue (z 0, rot 0, skew 0, origin center, text align left, ...).
import crypto from 'node:crypto';
import {
  ANGLE_NAMES, BASELINES, BODY_SIZES, COLOUR_NAMES, COMMON, ELEMENTS, ELEMENT_TYPES, FIELD_NAMES, FLOW_ONLY, GLYPHS, GROUNDS, ITEM_SIZES, KINDS, KIND_FIELDS, LABEL_SIZES, LENGTH_TOKENS,
  LIMITS, LOOK_SCHEMA, ORIGINS, PAGE, PLACE_FORMS, PLACE_MODIFIERS, POST_FIELDS, POST_ITEMS, POST_REQUIRED, ROW_KEYS, SECTIONS, SIZE_RANGE, STICKER_SHAPES, PHOTO_SHAPES, PHOTO_TREATS, FORMATS, EMPHASES, STYLES,
  SPLIT_SEPARATORS, FORBIDDEN_KEYS, REQUIRED_OWN, descriptorOf, keysOf,
} from './look-elements.mjs';
import { LEVELS, VAULT_REF } from './look-desc.mjs';
import { INK_ON } from './look-static.mjs';
import { ICONS, ICON_NAMES } from './icons.mjs';
import { INFO_KEYS, INLINE, POST_GALLERY, POST_INFO, POST_LISTS } from './post-spec.mjs';
import { LIST_FIELDS, PICTURE_FIELDS, PILL_SHAPES } from './look-elements.mjs';
import { CHART_KINDS, CHART_UNITS, POST_CHART } from './chart.mjs';
import { validateLook, validateLooks } from './look-validate.mjs';

export { validateLook, validateLooks, LOOK_SCHEMA, KINDS, ELEMENTS, COMMON, SECTIONS, LIMITS, GLYPHS, STICKER_SHAPES, PHOTO_SHAPES, PHOTO_TREATS, FORMATS, EMPHASES, KIND_FIELDS, ELEMENT_TYPES };
export const MAX_LOOKS = LIMITS.looksPerBrand;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// ---- the catalogue ----
const KIND_INFO = {
  statement: ['Statement', 'One strong line, with an optional sub line.'], figure: ['Figure', 'One big number or figure with its unit.'], list: ['List', 'A headline and two to five short points.'],
  quote: ['Quote', 'A quotation and who said it.'], photo: ['Photo', 'A picture with a headline.'], event: ['Event', 'A date, a place and what is on.'], offer: ['Offer', 'A product or offer with its price or tag.'],
};
const FIELD_INFO = {
  label: ['Small label', 'A short label (up to 28 characters).'], headline: ['Headline', 'The main line; *an emphasised phrase* is allowed.'], sub: ['Sub line', 'One or two supporting sentences.'],
  big: ['Big figure', 'One short figure like 12 kg or £4.50.'], unit: ['Unit', 'The words that go with the figure.'], quote: ['Quote', 'The quotation.'], by: ['Quote source', 'Who said it.'],
  meta: ['Event line', 'Date, time and place, split by dots.'], tag: ['Tag or price', 'A short word or price for a sticker.'], items: ['List points', 'Two to five short points.'], image: ['Picture', 'The post\'s picture.'],
  cta: ['Button words', 'A short call to action for a button, such as Book now.'], info: ['Info rows', 'One to four labelled rows, such as When, Where and Book on.'],
  gallery: ['Round pictures', 'Two to five pictures in a row, each with an optional name.'],
  chart: ['Chart', 'Numbers drawn as bars, a line, a sparkline, a donut or a progress bar: 2 to 12 points, or one value out of a total.'],
  avatar: ['Portrait picture', 'One picture of the person quoted, cropped round, square or rounded round its focal point.'],
};
// the counted lists of a post: their limits, and what the editor counts per entry
const LIST_INFO = { items: { ...POST_ITEMS }, info: { min: POST_INFO.min, max: POST_INFO.max, chars: POST_INFO.value }, gallery: { min: POST_GALLERY.min, max: POST_GALLERY.max, chars: POST_GALLERY.caption } };
const clone = (v) => JSON.parse(JSON.stringify(v));
// A slot is one element of a fixed type held as a property of its element (not in children): a seam's sticker on its edge.
const SLOT_INFO = { sticker: { of: 'sticker', label: 'Sticker on the edge', help: 'One sticker sitting on the slanted edge. Its place is an anchor or px place measured from the top edge of the split; a negative top lifts it above the edge. It takes no layer.', places: ['anchor', 'px'] } };

// Everything the web editor draws its controls from, and the validator and tests are held to: plain JSON, stable key order.
export function lookCatalogue() {
  const elements = {};
  for (const t of ELEMENT_TYPES) {
    const s = ELEMENTS[t], properties = {};
    for (const [k, v] of Object.entries(s.own)) properties[k] = { ...v, group: 'own' };
    for (const k of s.common) properties[k] = { ...COMMON[k], group: FLOW_ONLY.includes(k) ? 'flow' : 'common' };
    elements[t] = {
      label: s.label, group: s.group, help: s.help, placement: s.placement, flow: s.flow, container: s.container ?? null, text: s.text, fitted: !!s.fitted,
      required: [...(REQUIRED_OWN[t] ?? [])], properties,
      ...(s.sticker ? { slots: { sticker: { ...SLOT_INFO.sticker } } } : {}),
    };
  }
  const fields = Object.fromEntries(FIELD_NAMES.map((f) => [f, {
    label: FIELD_INFO[f][0], help: FIELD_INFO[f][1],
    // (a counted list is type "items" for the editor: it is judged by how many entries it has)
    ...(Object.hasOwn(LIST_INFO, f) ? { type: 'items', ...LIST_INFO[f] } : PICTURE_FIELDS.includes(f) ? { type: 'image' } : f === 'chart' ? { type: 'chart', min: POST_CHART.min, max: POST_CHART.max, chars: POST_CHART.label, kinds: [...CHART_KINDS], units: [...CHART_UNITS] } : { type: 'text', max: POST_FIELDS[f].max, emphasis: !!POST_FIELDS[f].emphasis }),
  }]));
  const composition = {
    properties: {
      kind: { kind: 'enum', values: [...KINDS], label: 'Kind', help: 'What sort of post it draws.' },
      name: { kind: 'text', max: LIMITS.name, label: 'Name', help: 'Shown in the panel and to the AI; never placed in an image.' },
      describe: { kind: 'text', max: LIMITS.description, label: 'Description', help: 'One or two sentences on how it looks and when to use it, for people and the AI.' },
      ground: { kind: 'oneOf', values: GROUNDS, label: 'Page colour', help: 'The page colour, or a list of cases ({ when, ground }) with the last having no condition.', maxCases: LIMITS.groundCases },
      fields: { kind: 'fields', label: 'Fields', help: 'The post fields it shows, each with whether it is required and its longest text (never more than a post allows).' },
      accepts: { kind: 'accepts', label: 'Accepts', help: 'Rules on the words it can draw (at most maxChars and, optionally, at least minChars characters of a part of the headline); when they fail the next variant of the kind is used.', max: LIMITS.accepts, parts: ['all', 'pre', 'phrase'] },
      calm: { kind: 'object', props: { maxShare: { kind: 'number', min: 0.45, max: 0.8, step: 0.01 } }, label: 'Empty space', help: 'A deliberately empty area, as a share of the page (0.45 to 0.8).' },
      levels: { kind: 'object', props: { max: { kind: 'number', min: LEVELS.min, max: LEVELS.max, step: 1, int: true }, ratio: { kind: 'number', min: LEVELS.ratioMin, max: LEVELS.ratioMax, step: 0.01, default: LEVELS.ratio } }, required: ['max'], label: 'Type sizes', help: `How many sizes of type the page may set (${LEVELS.min} when left out, at most ${LEVELS.max}). With more than ${LEVELS.min}, each size must be at least the ratio times the next smaller one (${LEVELS.ratio} when left out) and the headline the largest.` },
      fit: { kind: 'oneOf', values: ['margins', 'frame'], props: { pad: [0, 300], top: [0, 300], bottom: [0, 300] }, label: 'Text fit', help: 'The margins text must stay inside.' },
      elements: { kind: 'elements', label: 'Elements', help: 'The layers, back to front.', maxNodes: LIMITS.nodes, maxDepth: LIMITS.depth },
    },
  };
  return clone({
    schema: LOOK_SCHEMA,
    limits: { ...LIMITS },
    page: { ...PAGE },
    kinds: Object.fromEntries(KINDS.map((k) => [k, { label: KIND_INFO[k][0], help: KIND_INFO[k][1], fields: KIND_FIELDS[k], required: POST_REQUIRED[k] }])),
    fields,
    lists: {
      grounds: GROUNDS, angles: ANGLE_NAMES, lengthTokens: LENGTH_TOKENS, origins: ORIGINS, glyphs: GLYPHS, stickerShapes: STICKER_SHAPES, photoShapes: PHOTO_SHAPES, photoTreats: PHOTO_TREATS,
      styles: STYLES, emphases: EMPHASES, formats: FORMATS, splitSeparators: SPLIT_SEPARATORS, rowKeys: ROW_KEYS, baselines: BASELINES, roles: COLOUR_NAMES, fillRoles: Object.keys(INK_ON),
      bodySizes: BODY_SIZES, itemSizes: ITEM_SIZES, labelSizes: LABEL_SIZES, forbiddenKeys: FORBIDDEN_KEYS,
      icons: ICON_NAMES, iconLabels: Object.fromEntries(ICON_NAMES.map((n) => [n, ICONS[n].label])), infoKeys: INFO_KEYS, pillShapes: PILL_SHAPES,
    },
    inline: { ...INLINE },
    sizeRange: SIZE_RANGE,
    inkOn: INK_ON,
    common: COMMON,
    place: { forms: PLACE_FORMS, modifiers: PLACE_MODIFIERS },
    elements,
    sections: SECTIONS,
    composition,
  });
}

// ---- the brief: what the AI and the post editor need to know about a look ----
// kinds the look has a composition for, each with its variants in order (the variant a post names is the index here).
export function lookBrief(look) {
  const kinds = {};
  for (const c of Array.isArray(look?.compositions) ? look.compositions : []) {
    if (!isObj(c) || !KINDS.includes(c.kind)) continue;
    const entry = (kinds[c.kind] ??= { variants: [] });
    const fields = {};
    for (const [name, f] of Object.entries(isObj(c.fields) ? c.fields : {})) {
      const required = isObj(f) && (f.required === true || POST_REQUIRED[c.kind].includes(name));
      const max = isObj(f) && f.max !== undefined ? f.max : Object.hasOwn(POST_LISTS, name) ? POST_LISTS[name].max : POST_FIELDS[name]?.max;
      fields[name] = { required, ...(max !== undefined ? { max } : {}), ...(Object.hasOwn(POST_LISTS, name) && isObj(f) && f.min !== undefined ? { min: f.min } : {}) };
      // a chart: the kinds the composition's chart elements draw (in their order), and its point counts
      if (name === 'chart') fields[name] = { required, kinds: chartKindsOf(c), min: isObj(f) && f.min !== undefined ? f.min : POST_CHART.min, max: isObj(f) && f.max !== undefined ? f.max : POST_CHART.max };
    }
    const device = compositionDevice(c);
    entry.variants.push({ index: entry.variants.length, name: c.name, describe: c.describe, fields, accepts: clone(Array.isArray(c.accepts) ? c.accepts : []), ...(device ? { device } : {}) });
  }
  return { id: look?.id, name: look?.name, kinds };
}

// The chart kinds a composition's chart elements draw, each once, in the order the elements list them (at any depth).
export function chartKindsOf(comp) {
  const out = [];
  const walk = (list) => { for (const el of Array.isArray(list) ? list : []) { if (!isObj(el)) continue; if (el.type === 'chart') for (const k of Array.isArray(el.kinds) ? el.kinds : ['bar']) if (CHART_KINDS.includes(k) && !out.includes(k)) out.push(k); walk(el.children); } };
  walk(comp?.elements);
  return out;
}

// ---- the device a composition draws round its picture ----
// 'phone' or 'tablet' when one of its elements (at any depth) is a device: its picture is then a screenshot (a bare one, the device drawn round it,
// or a capture with the device already drawn); null when it draws none. Read from the look as written.
export function compositionDevice(comp) {
  let out = null;
  const walk = (list) => {
    for (const el of Array.isArray(list) ? list : []) {
      if (out || !isObj(el)) continue;
      if (el.type === 'device') { out = el.model === 'tablet' ? 'tablet' : 'phone'; return; }
      walk(el.children);
    }
  };
  walk(comp?.elements);
  return out;
}

// ---- brand graphics a composition places ----
// The vault ids its `graphic` elements name (at any depth), in order, each once. Only well-formed ids (look-desc VAULT_REF) are listed;
// the validator refuses any other. The app finds the files by these ids; a look never names a path.
export function compositionGraphicRefs(comp) {
  const out = [];
  const walk = (list) => {
    for (const el of Array.isArray(list) ? list : []) {
      if (!isObj(el)) continue;
      if (el.type === 'graphic' && typeof el.ref === 'string' && VAULT_REF.test(el.ref) && !out.includes(el.ref)) out.push(el.ref);
      walk(el.children);
      if (isObj(el.sticker)) walk([el.sticker]);
    }
  };
  walk(comp?.elements);
  return out;
}
// The composition `index` of `kind` in a look (as lookBrief numbers them) with the graphics it places: { kind, variant, name, refs },
// or null when the look has no such composition. Read from the look as written; nothing is validated here.
export function lookCompositionGraphics(look, kind, index) {
  const comps = (Array.isArray(look?.compositions) ? look.compositions : []).filter((c) => isObj(c) && c.kind === kind);
  const comp = Number.isInteger(index) ? comps[index] : undefined;
  if (!comp) return null;
  return { kind, variant: index, name: typeof comp.name === 'string' ? comp.name : `${kind} ${index + 1}`, refs: compositionGraphicRefs(comp) };
}

// ---- normalise and hash ----
const hasDefaults = (desc) => desc.default !== undefined || (desc.kind === 'object' && Object.values(desc.props).some(hasDefaults));
function fill(desc, v) {
  if (!isObj(v) || desc.kind !== 'object') return v;
  for (const [k, sub] of Object.entries(desc.props)) {
    if (v[k] === undefined) { if (sub.default !== undefined) v[k] = clone(sub.default); else if (sub.kind === 'object' && !sub.required && hasDefaults(sub)) v[k] = fill(sub, {}); }
    else v[k] = fill(sub, v[k]);
  }
  return v;
}
function fillElement(el, top = true) {
  const out = { ...el };
  for (const k of keysOf(el.type)) {
    if (k === 'type' || k === 'children' || k === 'sticker' || k === 'place' || (k === 'z' && !top)) continue;
    const desc = descriptorOf(el.type, k);
    if (out[k] === undefined && desc.default !== undefined) out[k] = clone(desc.default);
    else if (out[k] !== undefined) out[k] = fill(desc, out[k]);
  }
  if (Array.isArray(el.children)) out.children = el.children.map((c) => fillElement(c, false));
  if (isObj(el.sticker)) out.sticker = fillElement(el.sticker, false);
  return out;
}
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

export function normaliseLook(look) {
  if (!isObj(look)) throw new TypeError('normaliseLook: a look must be an object');
  const l = clone(look);
  l.description ??= '';
  for (const [name, desc] of Object.entries(SECTIONS)) {
    if (l[name] === undefined) { if (hasDefaults(desc)) l[name] = {}; else continue; }
    l[name] = fill(desc, l[name]);
  }
  if (isObj(l.fonts) && l.fonts.mono === undefined && l.fonts.label !== undefined) l.fonts.mono = clone(l.fonts.label);
  if (isObj(l.type)) {
    l.type.item ??= isObj(l.type.body) ? { size: l.type.body.size, lead: l.type.body.lead, weight: l.type.body.weight } : undefined;
    if (l.type.item === undefined) delete l.type.item;
    l.type.numeral ??= { track: -0.04, figures: 'lining' };
  }
  l.devices ??= {};
  l.devices.highlight ??= { pad: [0, 0, 0, 0], tilt: 0 };
  l.devices.shadow ??= { x: 0, y: 0, colour: 'ink' };
  l.compositions = (Array.isArray(l.compositions) ? l.compositions : []).map((c) => ({ ...c, kind: c.kind }));
  const index = {};
  l.compositions = l.compositions.map((c) => {
    const i = (index[c.kind] = (index[c.kind] ?? -1) + 1);
    const fields = {};
    for (const [name, f] of Object.entries(c.fields ?? {})) fields[name] = { ...f, required: f.required === true || POST_REQUIRED[c.kind]?.includes(name) || false, ...(!LIST_FIELDS.includes(name) && !PICTURE_FIELDS.includes(name) && name !== 'chart' ? { max: f.max ?? POST_FIELDS[name]?.max } : {}) };
    return { ...c, id: `${c.kind}/${i}`, fields, accepts: c.accepts ?? [], calm: c.calm ?? null, fit: c.fit ?? 'margins', elements: (c.elements ?? []).map((e) => fillElement(e, true)) };
  });
  return deepFreeze(l);
}

// Sorted-key JSON, so that two looks that mean the same write the same bytes.
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}
export const lookHash = (look) => crypto.createHash('sha256').update(canonicalJson({ schema: LOOK_SCHEMA, look: normaliseLook(look) })).digest('hex');
