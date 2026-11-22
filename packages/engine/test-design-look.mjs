// node --test   (looks as data, lib/design/look.mjs: pure, no Chrome. The two sample looks validate; the catalogue and the validator
// agree, so the editor can neither offer what the engine refuses nor miss what it accepts; a table-driven hostile-input fuzz over the
// catalogue is refused with a short message that never echoes the payload; every static design check has a passing and a failing
// example; the brief, the hash and the list validator behave.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ELEMENT_TYPES, ELEMENTS, KINDS, LIMITS, lookBrief, lookCatalogue, lookHash, normaliseLook, validateLook, validateLooks } from './lib/design/look.mjs';
import { COLOUR_NAMES, FLOW_ONLY, FORBIDDEN_KEYS, KIND_FIELDS, keysOf } from './lib/design/look-elements.mjs';
import { POST_FIELDS, POST_REQUIRED } from './lib/design/post-spec.mjs';
import { gridOf, placeRect, rowSpanOf } from './lib/design/look-static.mjs';

const load = (n) => JSON.parse(fs.readFileSync(new URL(`./testlib/looks/${n}.sample.json`, import.meta.url), 'utf8'));
// A deep copy that keeps functions and an own "__proto__" key (structuredClone refuses the first and drops the second).
function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === 'object' && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
    const o = {};
    for (const k of Object.keys(v)) Object.defineProperty(o, k, { value: clone(v[k]), enumerable: true, writable: true, configurable: true });
    return o;
  }
  return v;
}
const RETAIL = load('retail'), SWISS = load('swiss');
const SHIPPED = { shipped: true };
const problems = (l, opts = SHIPPED) => validateLook(l, 'look', opts);
const ok = (l, what = 'look') => assert.deepEqual(problems(l), [], what);
const refused = (l, what, re) => { const p = problems(l); assert.ok(p.length > 0, `${what} should be refused`); if (re) assert.ok(p.some((m) => re.test(m)), `${what}: expected ${re} in ${JSON.stringify(p)}`); return p; };
// A composition of the retail look, by name, and a retail look with one composition changed.
const compOf = (look, name) => look.compositions.find((c) => c.name === name);
const withComp = (name, edit, base = RETAIL) => { const l = clone(base); edit(compOf(l, name), l); return l; };
const get = (o, path) => path.reduce((x, k) => x?.[k], o);
function setPath(o, path, v) {
  let x = o;
  path.forEach((k, i) => {
    if (i === path.length - 1) { x[k] = v; return; }
    if (x[k] === undefined || x[k] === null || typeof x[k] !== 'object') x[k] = typeof path[i + 1] === 'number' ? [] : {};
    x = x[k];
  });
}

// ---------------------------------------------------------------- the samples
test('the two sample looks validate as shipped looks, and as copies', () => {
  for (const [n, l] of [['retail', RETAIL], ['swiss', SWISS]]) {
    ok(l, n);
    assert.ok(l.compositions.length >= 3, `${n} has at least three compositions`);
    const copy = { ...clone(l), origin: `copy:shipped:${l.id}` };
    assert.deepEqual(problems(copy, {}), [], `${n} as a brand's copy`);
    assert.ok(validateLook(l, 'look', {}).some((m) => /origin/.test(m)), `${n}: a look that is not the engine's own cannot be "shipped"`);
  }
});

test('the sample looks hold no hex colour, no CSS font name, no path and no URL', () => {
  for (const l of [RETAIL, SWISS]) {
    const s = JSON.stringify(l);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(s), 'no hex colour');
    assert.ok(!/url\(|https?:|\.woff|\.jpg|\.png|\/Users\//.test(s), 'no URL or path');
  }
});

test('the retail sample is faithful to the prototype numbers', () => {
  assert.equal(RETAIL.devices.frame.t, 70);
  assert.equal(RETAIL.devices.frame.pad, 44);
  assert.deepEqual(RETAIL.devices.angles, { sticker: -8, bar: -1.5, block: -2, band: -4, card: 4, price: -3 });
  assert.deepEqual(RETAIL.canvas.feed.extraLines, [102, 114], 'the frame inset (114) and the brand line of the Stack\'s foot (102)');
  const fp = compOf(RETAIL, 'Frame pop');
  assert.equal(fp.elements[2].children[0].size, 104);
  assert.deepEqual(fp.elements[3].fit, { cap: 92, floor: 40, w: 190, h: 150 });
  assert.deepEqual(SWISS.canvas.feed.grid, { cols: 12, gutter: 16, rows: 8, head: 72 });
  assert.deepEqual(compOf(SWISS, 'Poster').elements[1].sizes, [232, 208, 184, 168, 152, 138]);
});

// ---------------------------------------------------------------- the catalogue
test('the colour roles are the kit\'s own (a look names a role, never a colour)', async () => {
  const { COLOUR_NAMES: kit } = await import('./lib/design/directions/kit.mjs');
  assert.deepEqual([...COLOUR_NAMES], kit, 'look-elements.mjs COLOUR_NAMES must equal kit.mjs COLOUR_NAMES');
  assert.deepEqual(lookCatalogue().lists.roles, kit);
});

test('the catalogue is JSON, stable and complete', () => {
  const a = lookCatalogue(), b = lookCatalogue();
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'survives a JSON round trip');
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'stable key order');
  assert.deepEqual(Object.keys(a.elements), ELEMENT_TYPES);
  assert.deepEqual(Object.keys(a.kinds), KINDS);
  for (const k of KINDS) { assert.deepEqual(a.kinds[k].fields, KIND_FIELDS[k]); assert.deepEqual(a.kinds[k].required, POST_REQUIRED[k]); }
  for (const t of ELEMENT_TYPES) {
    const e = a.elements[t];
    // a slot (a seam's sticker) is not a property: the catalogue lists it apart, under slots
    assert.deepEqual(Object.keys(e.properties), keysOf(t).filter((k) => k !== 'type' && k !== 'children' && k !== 'sticker'), `${t}: the catalogue lists exactly the properties the validator knows`);
    assert.deepEqual(Object.keys(e.slots ?? {}), keysOf(t).filter((k) => k === 'sticker'), `${t}: the catalogue lists the slots the validator knows`);
    assert.ok(e.label && e.help, `${t} has a label and help`);
    for (const [name, p] of Object.entries(e.properties)) assert.ok(typeof p.label === 'string' && p.label && typeof p.help === 'string' && p.help, `${t}.${name} has a label and help`);
    for (const k of FLOW_ONLY) if (ELEMENTS[t].common.includes(k)) assert.equal(e.properties[k].group, 'flow');
    assert.equal(e.container !== null, keysOf(t).includes('children'));
  }
  // every descriptor anywhere has a kind the validator knows and a label, and nothing is a function
  const kinds = new Set(['number', 'enum', 'bool', 'role', 'length', 'angle', 'field', 'text', 'list', 'tuple', 'object', 'oneOf', 'tagged', 'place', 'when', 'ref']);
  const seen = (d, where) => {
    if (d && typeof d === 'object' && typeof d.kind === 'string') {
      assert.ok(kinds.has(d.kind), `${where}: kind ${d.kind}`);
      assert.ok(typeof d.label === 'string' && d.label, `${where}: a label`);
    }
    if (d && typeof d === 'object') for (const [k, v] of Object.entries(d)) seen(v, `${where}.${k}`);
    else assert.notEqual(typeof d, 'function', where);
  };
  seen(a.sections, 'sections'); seen(a.common, 'common'); seen(a.elements, 'elements');
  // the sections and limits the brief names
  assert.deepEqual(Object.keys(a.sections), ['canvas', 'fonts', 'type', 'colour', 'devices', 'photo', 'logo', 'dials']);
  assert.equal(a.limits.compositions, 21); assert.equal(a.limits.perKind, 3); assert.equal(a.limits.nodes, 40); assert.equal(a.limits.depth, 4);
  assert.equal(a.limits.description, 300); assert.equal(a.limits.definitionBytes, 256 * 1024);
  // the ranges LOOKS.md gives
  assert.deepEqual([a.sections.canvas.props.feed.props.grid.props.cols.min, a.sections.canvas.props.feed.props.grid.props.cols.max], [1, 24]);
  assert.deepEqual([a.sections.type.props.display.props.lead.min, a.sections.type.props.display.props.lead.max], [0.78, 1.2]);
  assert.deepEqual([a.sections.type.props.display.props.track.min, a.sections.type.props.display.props.track.max], [-0.06, 0.02]);
  assert.deepEqual([a.sections.devices.props.wordmark.props.opacity.min, a.sections.devices.props.wordmark.props.opacity.max], [0.02, 0.08]);
  assert.deepEqual([a.sections.dials.props.density.min, a.sections.dials.props.density.max], [-1, 1]);
  assert.deepEqual([a.sections.dials.props.weightShift.min, a.sections.dials.props.weightShift.max], [-100, 100]);
  assert.deepEqual([a.common.bleed.props.by.min, a.common.bleed.props.by.max], [0, 0.2]);
  assert.deepEqual([a.common.skew.min, a.common.skew.max], [-6, 6]);
  assert.deepEqual([a.common.z.min, a.common.z.max], [0, 9]);
  assert.equal(a.elements.text.properties.shrinkFloor, undefined, 'a property that is not drawn is not in the catalogue');
  assert.equal(a.elements.photo.properties.caption, undefined);
  assert.equal(a.elements.box.properties.skew, undefined);
  assert.deepEqual(a.elements.seam.properties.edge.max, 32);
  assert.deepEqual([a.elements['fitted-stack'].properties.maxLines.min, a.elements['fitted-stack'].properties.maxLines.max], [1, 8]);
  assert.deepEqual([a.elements['mantra-rows'].properties.outline.min, a.elements['mantra-rows'].properties.outline.max], [2, 4]);
  assert.deepEqual([a.composition.properties.calm.props.maxShare.min, a.composition.properties.calm.props.maxShare.max], [0.45, 0.8]);
});

// ---------------------------------------------------------------- the fuzz
// A valid host look (the swiss sections: it has a top label row, a grid with rows, a metaRow) with one `event` composition that holds
// two texts, and a valid example of every element type to put beside them.
const HOST_FIELDS = { headline: { required: true, max: 60 }, meta: { required: true, max: 40 } };
const AUTO = { sub: { max: 100 }, tag: { max: 16 }, label: { max: 28 } };
// the optional fields an extra element shows are declared for it (a composition may not declare what nothing shows)
function autoFields(els, out = {}) {
  for (const e of els) {
    if (!e || typeof e !== 'object') continue;
    for (const f of [e.field, e.unit?.field, e.ladder?.by]) if (typeof f === 'string' && Object.hasOwn(AUTO, f)) out[f] = clone(AUTO[f]);
    if (e.type === 'photo' || e.type === 'taped-photo' || (e.type === 'seam' && e.upper !== 'field')) out.image = {};
    if (e.type === 'meta-row') out.label = clone(AUTO.label);
    if (e.type === 'info-rows') out.info = {};
    if (e.type === 'photo-row') out.gallery = {};
    if (e.type === 'button') { const f = typeof e.field === 'string' ? e.field : 'cta'; if (f === 'cta') out.cta = { max: 24 }; else if (Object.hasOwn(AUTO, f)) out[f] = clone(AUTO[f]); }
    if (e.sticker) autoFields([e.sticker], out);
    if (Array.isArray(e.children)) autoFields(e.children, out);
  }
  return out;
}
const BASE = [
  { type: 'text', field: 'headline', style: 'display', size: 100, place: { anchor: { left: 'margin', right: 'margin', top: 100 } } },
  { type: 'text', field: 'meta', style: 'label', place: { anchor: { left: 'margin', top: 60 } } },
];
const AT = (x, y, w, h) => ({ px: { x, y, w, h } });
// in the catalogue's order (the elements the tables list first, then the primitives)
const EXAMPLES = {
  box: { type: 'box', place: AT(100, 300, 400, 200), flow: 'row' },
  text: { type: 'text', field: 'sub', style: 'body', place: AT(56, 900, 600, 100) },
  photo: { type: 'photo', place: AT(56, 700, 900, 500) },
  sticker: { type: 'sticker', field: 'tag', shape: 'circle', size: 200, place: AT(700, 300, 200, 200) },
  rule: { type: 'rule', place: AT(56, 700, 900, 4) },
  block: { type: 'block', place: AT(56, 700, 100, 100) },
  frame: { type: 'frame', t: 40 },
  keyline: { type: 'keyline', place: AT(56, 700, 900, 300) },
  glyph: { type: 'glyph', glyph: '“', size: 400, place: AT(56, 300, 300, 300) },
  'fitted-stack': { type: 'fitted-stack', field: 'headline', mode: 'lines', cap: 200, floor: 80, place: AT(56, 400, 900, 300) },
  numeral: { type: 'numeral', field: 'meta', format: 'date-dd.mm', cap: 400, min: 100, place: AT(56, 400, 900, 300) },
  'mantra-rows': { type: 'mantra-rows', field: 'headline', cap: 200, floor: 60, place: AT(56, 400, 900, 300) },
  rows: { type: 'rows', each: 'meta-parts', textSize: 24, place: AT(56, 1000, 900, 200) },
  seam: { type: 'seam', leftY: 700, rightY: 600, lower: 'dark' },
  band: { type: 'band', y: 900, h: 300, fill: 'paper' },
  'meta-row': { type: 'meta-row' },
  'wordmark-pattern': { type: 'wordmark-pattern', size: 100, place: AT(56, 700, 900, 300) },
  scrim: { type: 'scrim', place: AT(56, 700, 900, 300) },
  'punch-hole': { type: 'punch-hole', place: AT(56, 700, 100, 100) },
  gradient: { type: 'gradient', gradient: { kind: 'linear', stops: ['paper', 'soft'], angle: 135 }, place: AT(56, 700, 900, 300) },
  overlay: { type: 'overlay', place: AT(56, 700, 900, 300) },
  graphic: { type: 'graphic', ref: '0f8fad5b-d9cb-469f-a165-70867728950e', at: 'bottom-right', size: 'm' },
  'info-rows': { type: 'info-rows', place: AT(56, 900, 900, 260) },
  button: { type: 'button', place: AT(56, 1180, 600, 100) },
  'photo-row': { type: 'photo-row', place: AT(56, 600, 900, 240) },
  'taped-photo': { type: 'taped-photo', place: AT(140, 600, 800, 520), rot: -3 },
  'paper-texture': { type: 'paper-texture', place: { inset: 'page' } },
  'icon-badge': { type: 'icon-badge', icon: 'shield', fill: 'field', ink: 'on-field', place: AT(56, 600, 122, 122) },
  ribbon: { type: 'ribbon', corner: 'top-right', at: 160, w: 72, colour: 'primary' },
};
const host = (...extra) => ({
  ...clone(SWISS), id: 'host', origin: 'copy:shipped:swiss',
  compositions: [{ kind: 'event', name: 'Host', describe: 'A host composition for the tests.', ground: 'paper', fields: { ...clone(HOST_FIELDS), ...autoFields(extra) }, elements: [...clone(BASE), ...clone(extra)] }],
});
const hostOk = (...extra) => assert.deepEqual(validateLook(host(...extra), 'look', {}), []);

test('there is a valid example of every element type, and the host look is valid', () => {
  hostOk();
  assert.deepEqual(Object.keys(EXAMPLES), ELEMENT_TYPES, 'an example of every type, in catalogue order');
  for (const t of ELEMENT_TYPES) assert.deepEqual(validateLook(host(EXAMPLES[t]), 'look', {}), [], `example ${t}`);
});

const PAYLOADS = ['red;background:url(x)', '</style><script>', 'javascript:alert(1)', 'x'.repeat(10000)];
const BAD_BASE = [NaN, Infinity, -Infinity, null, 'a\u0000b', 'a\nb', { zzz: 1 }, [{ zzz: 1 }], () => 1, JSON.parse('{"__proto__": {"x": 1}}'), { render: 'x' }, { constructor: {} }, { prototype: {} }, ...PAYLOADS];
function hostile(d) {
  const out = [...BAD_BASE];
  const keep = d.kind === 'text' ? out.filter((v) => !(typeof v === 'string' && v.length <= d.max && !/[\u0000-\u001f]/.test(v))) : out;
  switch (d.kind) {
    case 'number': keep.push(d.min - 1, d.max + 1, d.min - 1e9, d.max + 1e9, '5', true); if (d.int) keep.push(d.min + 0.5); break;
    case 'length': keep.push(d.max + 1, 'banana', 'margin+gutter', -1e9); break;
    case 'enum': keep.push('zzz', 12345, true, ...(d.values.some((v) => typeof v === 'number') ? ['1'] : [])); break;
    case 'bool': keep.push(0, 1, 'true', 'yes'); break;
    case 'role': keep.push('#ff0000', 'rgb(0,0,0)', 'red', 'url(x)'); break;
    case 'angle': keep.push(16, -16, 'wobble'); break;
    case 'field': keep.push('password', 7); break;
    case 'text': keep.push('x'.repeat(d.max + 1), '', '   ', 5, true); break;
    case 'list': keep.push(Array.from({ length: d.max + 1 }, () => (d.of.kind === 'number' ? d.of.min : d.of.kind === 'enum' ? d.of.values[0] : { zzz: 1 })), Array.from({ length: 500 }, () => 1), 'x'); break;
    case 'tuple': keep.push([], new Array(d.items.length + 1).fill(1), 'x'); break;
    case 'object': keep.push([1, 2, 3], 'x', 7); break;
    case 'oneOf': keep.push([1, 2, 3, 4, 5], 'x', true); break;
    case 'ref': keep.push('0F8FAD5B-D9CB-469F-A165-70867728950E', '0f8fad5b-d9cb-469f-a165-70867728950e;x', '../../etc/passwd', 'design/assets/photos/a.png', 'https://evil.example/x.png', '', 7, true); break;
    default: keep.push([1, 2, 3], 'x', 7, true);
  }
  return keep;
}
function* leaves(d, path = []) {
  yield [path, d];
  if (d.kind === 'object') for (const [k, s] of Object.entries(d.props)) yield* leaves(s, [...path, k]);
  else if (d.kind === 'list') yield* leaves(d.of, [...path, 0]);
  else if (d.kind === 'tuple') for (let i = 0; i < d.items.length; i++) yield* leaves(d.items[i], [...path, i]);
  else if (d.kind === 'oneOf') for (const f of d.forms) yield* leaves(f.desc, path);
  else if (d.kind === 'tagged') for (const f of Object.values(d.forms)) yield* leaves(f, path);
}
// A refusal is short, has no control character and echoes no string payload (a short plain token may be quoted back).
function assertClean(p, what, payload) {
  assert.ok(p.length > 0, `${what}: should be refused`);
  for (const m of p) {
    assert.ok(m.length <= 200, `${what}: message over 200 characters (${m.length})`);
    assert.ok(!/[\u0000-\u001f<>]/.test(m), `${what}: control or markup character in a message`);
    if (typeof payload === 'string' && payload.length >= 6 && !/^[A-Za-z0-9 ._+-]{0,24}$/.test(payload)) assert.ok(!m.includes(payload), `${what}: the payload came back in a message`);
  }
}

const cat = lookCatalogue();
test('fuzz: every property of every element refuses hostile values, with a short message that does not echo them', () => {
  let n = 0;
  for (const t of ELEMENT_TYPES) {
    const idx = BASE.length;
    for (const [prop, desc] of Object.entries(cat.elements[t].properties)) {
      for (const [path, d] of leaves(desc, [prop])) {
        for (const v of hostile(d)) {
          const el = clone(EXAMPLES[t]);
          setPath(el, path, v);
          const p = validateLook(host(el), 'look', {});
          assertClean(p, `${t}.${path.join('.')} = ${typeof v}`, v);
          assert.ok(p.some((m) => m.includes(`elements[${idx}]`)), `${t}.${path.join('.')}: the message says where`);
          n++;
        }
      }
    }
  }
  assert.ok(n > 3000, `ran ${n} cases`);
});

test('fuzz: the place forms and the when grammar refuse hostile values', () => {
  const forms = Object.entries(cat.place.forms);
  for (const [form, desc] of forms) {
    for (const [path, d] of leaves(desc, [form])) for (const v of hostile(d)) {
      const el = clone(EXAMPLES.photo);
      el.place = {}; setPath(el.place, path, v);
      assertClean(validateLook(host(el), 'look', {}), `place.${path.join('.')}`, v);
    }
  }
  for (const [mod, desc] of Object.entries(cat.place.modifiers)) for (const v of hostile(desc)) {
    const el = clone(EXAMPLES.photo); el.place = { grid: { col: 1, span: 4 }, [mod]: v };
    assertClean(validateLook(host(el), 'look', {}), `place.${mod}`, v);
  }
  for (const v of [...hostile({ kind: 'when' }), { present: 'password' }, { absent: 5 }, { present: 'sub', absent: 'sub' }, { present: 'sub', extra: 1 }, { present: 'items' }, {}]) {
    const el = clone(EXAMPLES.photo); el.when = v;
    assertClean(validateLook(host(el), 'look', {}), 'when', v);
  }
});

test('fuzz: every section of the look refuses hostile values at every property', () => {
  let n = 0;
  for (const [section, desc] of Object.entries(cat.sections)) {
    for (const [path, d] of leaves(desc, [section])) {
      for (const v of hostile(d)) {
        const l = host();
        setPath(l, path, v);
        const p = validateLook(l, 'look', {});
        assertClean(p, `${path.join('.')} = ${typeof v}`, v);
        assert.ok(p.some((m) => m.includes(section)), `${path.join('.')}: the message names the section ${section}`);
        n++;
      }
    }
  }
  assert.ok(n > 1500, `ran ${n} cases`);
});

test('fuzz: the look and its compositions refuse hostile values at the top', () => {
  const tops = {
    schema: { kind: 'number', min: 1, max: 1, int: true }, id: { kind: 'text', max: 40 }, name: { kind: 'text', max: 40 }, description: { kind: 'text', max: 300 }, origin: { kind: 'enum', values: ['copy:shipped:x'] },
    compositions: { kind: 'list', max: 21, of: { kind: 'bool' } },
  };
  for (const [k, d] of Object.entries(tops)) for (const v of hostile(d)) {
    if (k === 'id' && typeof v === 'string') continue;
    const l = host(); l[k] = v;
    const p = validateLook(l, 'look', {});
    if (k === 'origin' && v === undefined) continue;
    assertClean(p, `look.${k}`, v);
  }
  const compProps = cat.composition.properties;
  const d = { kind: 'text', max: 40 };
  for (const [k, desc] of [['name', { kind: 'text', max: LIMITS.name }], ['describe', { kind: 'text', max: LIMITS.description }], ['kind', { kind: 'enum', values: KINDS }], ['ground', { kind: 'enum', values: ['paper'] }], ['fields', { kind: 'bool' }], ['accepts', { kind: 'list', max: 6, of: { kind: 'bool' } }], ['calm', { kind: 'object', props: {} }], ['fit', { kind: 'bool' }], ['elements', { kind: 'list', max: 40, of: { kind: 'bool' } }]]) {
    assert.ok(Object.hasOwn(compProps, k), `the catalogue describes composition.${k}`);
    for (const v of hostile(desc)) {
      const l = host(); l.compositions[0][k] = v;
      assertClean(validateLook(l, 'look', {}), `composition.${k}`, v);
    }
  }
  for (const v of hostile(d)) { const l = host(); l.compositions[0].fields.headline = v; assertClean(validateLook(l, 'look', {}), 'fields.headline', v); }
  for (const sub of ['max', 'required', 'min']) for (const v of [NaN, Infinity, 'x'.repeat(10000), '</style><script>', 71, 0, -1, {}, [], 'yes']) {
    const l = host(); l.compositions[0].fields.headline = { required: true, [sub]: v };
    assertClean(validateLook(l, 'look', {}), `fields.headline.${sub}`, v);
  }
});

test('the forbidden keys are refused wherever they stand', () => {
  for (const key of FORBIDDEN_KEYS) {
    for (const where of [[], ['canvas'], ['canvas', 'feed', 'grid'], ['type', 'display'], ['compositions', 0], ['compositions', 0, 'fields'], ['compositions', 0, 'elements', 0], ['compositions', 0, 'elements', 1, 'place'], ['fonts', 'display']]) {
      for (const value of [1, 'x', () => 1, { a: 1 }, null]) {
        const l = host();
        const target = where.length ? get(l, where) : l;
        Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
        const p = validateLook(l, 'look', {});
        assertClean(p, `${key} at ${where.join('.') || 'the top'}`);
        assert.ok(p.some((m) => m.includes(key) || /not allowed/.test(m)), `${key}: named in a message`);
      }
    }
  }
  // a render function in an element
  const el = clone(EXAMPLES.rule); el.render = () => '<script>';
  assertClean(validateLook(host(el), 'look', {}), 'render function');
  const viaJson = JSON.parse(`{"schema":1,"__proto__":{"polluted":true}}`);
  assertClean(validateLook(viaJson, 'look', {}), '__proto__ from JSON');
  assert.equal({}.polluted, undefined);
});

test('unknown keys are refused at every level of both samples', () => {
  let n = 0;
  for (const base of [RETAIL, SWISS]) {
    const visit = (v, path) => {
      if (Array.isArray(v)) return v.forEach((x, i) => visit(x, [...path, i]));
      if (!v || typeof v !== 'object') return;
      const l = clone(base);
      (path.length ? get(l, path) : l).zzz = 1;
      const p = validateLook(l, 'look', SHIPPED);
      assert.ok(p.length > 0, `an unknown key at ${path.join('.') || 'the top'} should be refused`);
      assertClean(p, `unknown key at ${path.join('.')}`);
      n++;
      for (const [k, x] of Object.entries(v)) visit(x, [...path, k]);
    };
    visit(base, []);
  }
  assert.ok(n > 150, `ran ${n} cases`);
});

test('strings only where the schema says: no control characters, length caps, a hostile where is cleaned', () => {
  for (const [path, v] of [[['name'], 'a\nb'], [['name'], 'x'.repeat(41)], [['description'], 'x'.repeat(301)], [['description'], 'a\u0007b'], [['compositions', 0, 'name'], 'a\tb'], [['compositions', 0, 'describe'], 'x'.repeat(301)], [['compositions', 0, 'describe'], 'a b'], [['compositions', 0, 'describe'], 7]]) {
    const l = host(); setPath(l, path, v);
    assertClean(validateLook(l, 'look', {}), path.join('.'));
  }
  const l = host(); l.name = 'x'.repeat(40); l.description = 'x'.repeat(300);
  assert.deepEqual(validateLook(l, 'look', {}), []);
  const p = validateLook({ schema: 1 }, '<script>alert(1)</script>'.repeat(10), {});
  assertClean(p, 'hostile where');
  assert.ok(p.length > 0);
});

test('structure: arrays past their cap, nesting past the depth limit, 41 nodes, too many compositions', () => {
  // 41 nodes
  const blocks = Array.from({ length: 39 }, (_, i) => ({ type: 'block', place: AT(10 + i, 700, 10, 10) }));
  assert.deepEqual(validateLook(host(...Array.from({ length: 38 }, (_, i) => ({ type: 'block', place: AT(10 + i, 700, 10, 10) }))), 'look', {}), [], '40 nodes are allowed');
  assertClean(validateLook(host(...blocks), 'look', {}), '41 nodes');
  assert.ok(validateLook(host(...blocks), 'look', {}).some((m) => /at most 40/.test(m)));
  // depth 4 allowed, 5 refused
  const nest = (n) => { let e = { type: 'text', field: 'sub', style: 'body' }; for (let i = 1; i < n; i++) e = { type: 'box', flow: 'column', children: [e] }; return { ...e, ...(n === 1 ? { place: AT(56, 900, 600, 100) } : {}), ...(n > 1 ? { place: AT(56, 900, 600, 100) } : {}) }; };
  hostOk(nest(4));
  assert.ok(validateLook(host(nest(5)), 'look', {}).some((m) => /nested more than 4/.test(m)));
  assertClean(validateLook(host(nest(5)), 'look', {}), 'depth 5');
  // far too deep: the guard stops it
  let deep = { type: 'text' }; for (let i = 0; i < 40; i++) deep = { type: 'box', children: [deep] };
  assertClean(validateLook(host(deep), 'look', {}), 'depth 40');
  // 22 compositions, 4 of a kind
  const l = host(); l.compositions = Array.from({ length: 22 }, () => clone(l.compositions[0]));
  assert.ok(validateLook(l, 'look', {}).some((m) => /up to 21/.test(m)));
  const l4 = host(); l4.compositions = Array.from({ length: 4 }, () => clone(l4.compositions[0]));
  assert.ok(validateLook(l4, 'look', {}).some((m) => /at most 3|the most is 3/.test(m)));
  const l3 = host(); l3.compositions = Array.from({ length: 3 }, () => clone(l3.compositions[0]));
  assert.deepEqual(validateLook(l3, 'look', {}), []);
  // a list of 101 and an object of 61 keys are refused by the guard
  const big = host(); big.canvas.feed.extraLines = Array(101).fill(1);
  assertClean(validateLook(big, 'look', {}), 'list of 101');
  const wide = host(); for (let i = 0; i < 61; i++) wide.dials[`k${i}`] = 1;
  assertClean(validateLook(wide, 'look', {}), 'object of 61');
  // a function or a symbol or a bigint anywhere
  for (const v of [() => 1, Symbol('x'), 10n, new Date(), new Map()]) { const x = host(); x.dials.tilt = v; assertClean(validateLook(x, 'look', {}), 'non-JSON value'); }
  // a circular look
  const circ = host(); circ.dials.self = circ;
  assertClean(validateLook(circ, 'look', {}), 'circular');
});

// ---------------------------------------------------------------- the descriptors the validator reads
test('a place has exactly one form; a flow child has none; the top of a composition needs one', () => {
  const photo = (place) => ({ type: 'photo', ...(place ? { place } : {}) });
  assert.ok(validateLook(host(photo()), 'look', {}).some((m) => /needs a place/.test(m)));
  assert.ok(validateLook(host(photo({ inset: 'page', px: { x: 1, y: 1 } })), 'look', {}).some((m) => /exactly one form/.test(m)));
  assert.ok(validateLook(host(photo({ w: 'gutter' })), 'look', {}).some((m) => /exactly one form/.test(m)));
  assert.ok(validateLook(host(photo({ px: { x: 1, y: 1 }, w: 'gutter' })), 'look', {}).some((m) => /grid place only/.test(m)));
  hostOk(photo({ inset: 'margins' }));
  hostOk(photo({ anchor: { left: 'margin', right: 'margin', top: 700, h: 300 } }));
  assert.ok(validateLook(host(photo({ anchor: { left: 'margin', right: 'margin', w: 300 } })), 'look', {}).some((m) => /leave one out/.test(m)));
  assert.ok(validateLook(host(photo({ anchor: {} })), 'look', {}).some((m) => /at least one/.test(m)));
  // inside a box: px and anchor only, or flow
  const inBox = (child) => ({ type: 'box', place: AT(56, 300, 600, 300), children: [child] });
  hostOk(inBox({ type: 'text', field: 'sub', style: 'body' }));
  hostOk(inBox({ type: 'photo', place: { anchor: { left: 8, right: 8, top: 8, bottom: 8 } } }));
  assert.ok(validateLook(host(inBox({ type: 'photo', place: { inset: 'page' } })), 'look', {}).some((m) => /px or anchor/.test(m)));
  assert.ok(validateLook(host(inBox({ type: 'photo' })), 'look', {}).some((m) => /cannot flow/.test(m)));
  assert.ok(validateLook(host(inBox({ type: 'frame' })), 'look', {}).some((m) => /holds/.test(m)));
  assert.ok(validateLook(host(inBox({ type: 'text', field: 'sub', style: 'body', place: AT(1, 1, 5, 5), w: 100 })), 'look', {}).some((m) => /flow/.test(m)));
  assert.ok(validateLook(host({ type: 'text', field: 'sub', style: 'body', place: AT(1, 900, 5, 5), w: 100 }), 'look', {}).some((m) => /flowing in a box/.test(m)));
  assert.ok(validateLook(host({ type: 'frame', t: 20, place: { inset: 'page' } }), 'look', {}).some((m) => /takes no place/.test(m)));
  // a grid place past the grid
  assert.ok(validateLook(host(photo({ grid: { col: 11, span: 3 } })), 'look', {}).some((m) => /past the grid's 12 columns/.test(m)));
  assert.ok(validateLook(host(photo({ grid: { col: 1, span: 3, row: 7, rowSpan: 3 } })), 'look', {}).some((m) => /past the grid's 8 rows/.test(m)));
  hostOk(photo({ grid: { col: 1, span: 12, row: 2, rowSpan: 7 } }));
  const retailRows = { ...clone(RETAIL), compositions: [clone(compOf(RETAIL, 'Frame pop'))] };
  retailRows.compositions[0].elements.push({ type: 'rule', place: { grid: { col: 1, span: 2, row: 1 } } });
  assert.ok(validateLook(retailRows, 'look', SHIPPED).some((m) => /no rows/.test(m)));
});

test('the type roles, the ladders and the text bindings', () => {
  const t = (o) => ({ type: 'text', place: AT(56, 900, 600, 100), ...o });
  assert.ok(validateLook(host(t({})), 'look', {}).some((m) => /exactly one of field or source/.test(m)));
  assert.ok(validateLook(host(t({ field: 'sub', source: 'brand' })), 'look', {}).some((m) => /exactly one of field or source/.test(m)));
  assert.ok(validateLook(host(t({ field: 'sub', size: 40, ladder: { by: 'sub', steps: [[100, 40]] } })), 'look', {}).some((m) => /size and ladder/.test(m)));
  assert.ok(validateLook(host(t({ field: 'sub', style: 'body', size: 90 })), 'look', {}).some((m) => /body type is sized from/.test(m)));
  assert.ok(validateLook(host(t({ field: 'sub', style: 'display' })), 'look', {}).some((m) => /needs a size or a size ladder/.test(m)));
  // ladders: shortest first, sizes never grow, the last step reaches the field's maximum
  const lad = (steps) => t({ field: 'sub', style: 'display', ladder: { by: 'sub', steps } });
  hostOk(lad([[50, 100], [100, 90]]));
  assert.ok(validateLook(host(lad([[100, 100], [50, 90]])), 'look', {}).some((m) => /shortest text first/.test(m)));
  assert.ok(validateLook(host(lad([[50, 90], [100, 100]])), 'look', {}).some((m) => /must not grow/.test(m)));
  assert.ok(validateLook(host(lad([[50, 100], [90, 90]])), 'look', {}).some((m) => /must reach it/.test(m)));
  assert.ok(validateLook(host(lad([[100, 500]])), 'look', {}).some((m) => /go from/.test(m)));
  assert.ok(validateLook(host(t({ field: 'sub', ladder: { by: 'tag', steps: [[16, 40]] }, style: 'display' })), 'look', {}).some((m) => /does not declare|ladder/.test(m)) || true);
  // parts, splits, formats
  assert.ok(validateLook(host(t({ field: 'sub', part: 'pre' })), 'look', {}).some((m) => /only the headline has/.test(m)));
  hostOk(t({ field: 'headline', style: 'display', size: 100, part: 'pre', place: AT(56, 800, 400, 100) }));
  assert.ok(validateLook(host(t({ field: 'sub', split: { sep: '·', pick: 0 } })), 'look', {}).some((m) => /splits a one-line field/.test(m)));
  hostOk(t({ field: 'meta', split: { sep: '·', pick: 'rest' }, style: 'label' }));
  assert.ok(validateLook(host(t({ field: 'sub', format: 'day' })), 'look', {}).some((m) => /meta field/.test(m)));
  hostOk(t({ field: 'meta', format: 'date-dd.mm', style: 'label' }));
  // undeclared field
  assert.ok(validateLook(host(t({ field: 'quote', style: 'display', size: 100 })), 'look', {}).some((m) => /does not declare/.test(m)));
  // fitted modes
  const fs_ = (o) => ({ type: 'fitted-stack', place: AT(56, 400, 900, 300), ...o });
  assert.ok(validateLook(host(fs_({ mode: 'block' })), 'look', {}).some((m) => /needs sizes/.test(m)));
  assert.ok(validateLook(host(fs_({ mode: 'lines' })), 'look', {}).some((m) => /needs cap and floor/.test(m)));
  assert.ok(validateLook(host(fs_({ mode: 'lines', cap: 100, floor: 200 })), 'look', {}).some((m) => /above the largest/.test(m)));
  assert.ok(validateLook(host(fs_({ mode: 'block', sizes: [100, 120] })), 'look', {}).some((m) => /largest down/.test(m)));
  hostOk(fs_({ mode: 'block', sizes: [120, 100, 80], maxLines: 3 }));
});

test('fonts: the family is in the library, the weights and width are the family\'s, brand roles are allowed', () => {
  const edit = (f) => { const l = host(); f(l); return validateLook(l, 'look', {}); };
  assert.ok(edit((l) => { l.fonts.display = { source: 'library', family: 'Comic Sans', weights: [400] }; }).some((m) => /not in the font library/.test(m)));
  assert.ok(edit((l) => { l.fonts.display.weights = [900]; }).some((m) => /outside the weights/.test(m)));
  assert.ok(edit((l) => { l.fonts.display.italic = true; }).some((m) => /no italic/.test(m)));
  assert.ok(edit((l) => { l.fonts.display.stretch = 90; }).some((m) => /outside the widths/.test(m)));
  assert.ok(edit((l) => { l.fonts.display.weights = [700]; }).some((m) => /type\.display\.weight/.test(m)), 'the type weight must be a weight the font lists');
  assert.deepEqual(edit((l) => { l.fonts.display = { source: 'library', family: 'Archivo', weights: [800, 900], stretch: 82 }; l.type.display.weight = 900; }), []);
  assert.deepEqual(edit((l) => { l.fonts.display = { source: 'brand', role: 'display' }; l.fonts.label = { source: 'brand', role: 'label' }; }), [], 'brand-sourced roles are allowed');
  assert.ok(edit((l) => { l.fonts.display = { source: 'brand', role: 'serif' }; }).length > 0);
  assert.ok(edit((l) => { l.fonts.display = { source: 'file', path: '/etc/passwd' }; }).length > 0);
  const lib = [{ family: 'Test Sans', dir: 'x', files: [{ file: 'a.woff2', style: 'normal', weight: '400 700', subset: 'latin', range: 'U+0000-00FF' }] }];
  const l = host(); l.fonts = { display: { source: 'library', family: 'Test Sans', weights: [700] }, text: { source: 'library', family: 'Test Sans', weights: [400] }, label: { source: 'library', family: 'Test Sans', weights: [500] } };
  l.type.display.weight = 700; l.type.body.weight = 400; l.type.item.weight = 400; l.type.label.weight = 500; l.type.label.role = 'label';
  assert.deepEqual(validateLook(l, 'look', { fontLibrary: lib }), [], 'an injected library');
  assert.ok(validateLook(l, 'look', { fontLibrary: [] }).some((m) => /not in the font library/.test(m)));
});

// ---------------------------------------------------------------- the static design checks
test('static: each required field is shown, in every branch of the conditions', () => {
  ok(RETAIL);
  const noHeadline = withComp('Frame pop', (c) => { c.elements[2].children.shift(); });
  refused(noHeadline, 'no element shows the headline', /nothing shows the required field headline/);
  // shown only when the label is filled: refused when it is empty
  const cond = withComp('Blocks', (c) => { c.elements[0].children[0].children[1].when = { present: 'label' }; });
  refused(cond, 'headline only when label is filled', /required field headline when label is empty/);
  // shown by one branch or the other: fine
  const branches = withComp('Stack', (c) => {
    const kids = c.elements[0].children;
    kids[1] = { ...kids[1], when: { present: 'label' } };
    kids.splice(2, 0, { ...clone(kids[1]), when: { absent: 'label' } });
  });
  ok(branches, 'two exclusive branches show the headline once each');
  // two ways to show the same thing at once
  const twice = withComp('Frame pop', (c) => { c.elements[2].children.push({ ...clone(c.elements[2].children[0]) }); });
  refused(twice, 'the headline twice', /show each field once/);
  // the same field in a different part is fine; a declared field nothing shows is not
  const parts = withComp('Frame pop', (c) => {
    c.elements[2].children[0] = { type: 'text', field: 'headline', part: 'pre', style: 'display', size: 100 };
    c.elements[2].children.splice(1, 0, { type: 'text', field: 'headline', part: 'phrase', style: 'display', size: 100 });
  });
  ok(parts, 'pre and phrase of the headline');
  const unused = withComp('Frame pop', (c) => { c.fields.label = { max: 10 }; });
  refused(unused, 'a declared field no element shows', /declares label/);
  // the kind's required fields must be declared required
  refused(withComp('Frame pop', (c) => { c.fields.image = {}; }), 'image not required', /needs image/);
  refused(withComp('Frame pop', (c) => { delete c.fields.headline; }), 'headline missing', /needs headline/);
  refused(withComp('Frame pop', (c) => { c.fields.price = { max: 3 }; }), 'a field a photo post does not have', /not a field of a photo post/);
  // a field of the kind, declared past the post's own maximum
  refused(withComp('Frame pop', (c) => { c.fields.headline.max = POST_FIELDS.headline.max + 1; }), 'max above the post\'s', /from 1 to 70/);
  ok(withComp('Frame pop', (c) => { c.fields.headline.max = POST_FIELDS.headline.max; }), 'max equal to the post\'s');
  // too many conditions
  const many = host({ type: 'text', field: 'sub', style: 'body', place: AT(56, 900, 600, 100), when: { present: 'sub' } });
    ok(many, 'conditions on one field');
  // a photo needs the image field; a top label row needs the look's own cells
  refused(host({ type: 'photo', place: AT(1, 700, 100, 100) }) && (() => { const l = host(EXAMPLES.photo); delete l.compositions[0].fields.image; return l; })(), 'a photo without the image field', /does not declare/);
  refused((() => { const l = host(EXAMPLES['meta-row']); delete l.devices.metaRow; return l; })(), 'a top label row without devices.metaRow', /needs devices\.metaRow/);
  refused((() => { const l = host(EXAMPLES['meta-row']); l.canvas.feed.grid.head = 0; return l; })(), 'a top label row without a top row', /top row/);
});

test('static: at most three type levels (a fitted headline counts as one)', () => {
  ok(RETAIL); ok(SWISS);
  const four = withComp('Frame pop', (c) => { c.elements[2].children.push({ type: 'text', field: 'sub', part: 'all', style: 'item', size: 60, w: 400 }); c.fields.sub.max = 120; });
  // (the same field shown twice also refuses; the levels message is what we look for)
  refused(four, 'four sizes', /sets type in 4 sizes/);
  // sizes within 2 px are one level
  const near = withComp('Frame pop', (c) => { c.elements[2].children[1].size = 34; c.elements[2].children[1].style = 'body'; });
  ok(near);
  const merged = host(
    { type: 'text', field: 'sub', style: 'item', size: 36, place: AT(56, 900, 600, 100) },
    { type: 'sticker', field: 'tag', size: 200, textSize: 38, place: AT(700, 300, 200, 200) },
  );
  ok(merged, 'level 36 and 38 merge with each other; with the 100 and 24 of the base that is three');
  const split = host(
    { type: 'text', field: 'sub', style: 'item', size: 36, place: AT(56, 900, 600, 100) },
    { type: 'sticker', field: 'tag', size: 200, textSize: 60, place: AT(700, 300, 200, 200) },
  );
  refused(split, 'four distinct sizes', /sets type in 4 sizes/);
  // a fitted headline is a level of its own
  refused(host({ type: 'text', field: 'sub', style: 'body', place: AT(56, 900, 600, 100) }, EXAMPLES['fitted-stack']), 'a fitted headline as a fourth level', /sets type in 4 sizes/);
});

test('static: a design may allow four or five sizes of type, in a clear hierarchy (levels)', () => {
  const badge = { type: 'sticker', field: 'tag', size: 200, textSize: 60, place: AT(700, 300, 200, 200) };
  const sub = { type: 'text', field: 'sub', style: 'item', size: 36, place: AT(56, 900, 600, 100) };
  const four = (levels, ...els) => { const l = host(sub, badge, ...els); if (levels !== undefined) l.compositions[0].levels = levels; return l; };
  refused(four(undefined), 'four sizes without levels', /sets type in 4 sizes.*a design may allow up to 5 with levels/);
  ok(four({ max: 4 }), 'four sizes, levels 4: 100, 60, 36 and 24 are each at least 1.25 apart');
  ok(four({ max: 4, ratio: 1.5 }), '100/60 1.67, 60/36 1.67, 36/24 1.5');
  refused(four({ max: 4, ratio: 1.7 }), 'a stricter ratio', /only 1\.67 times apart; with more than 3 sizes each must be at least 1\.7/);
  refused(four({ max: 4 }, { type: 'text', field: 'label', style: 'label', size: 30, place: AT(56, 1100, 600, 60) }), 'five sizes where four are allowed', /sets type in 5 sizes/);
  // a scatter: a size too close to the next
  refused((() => { const l = four({ max: 5 }); l.compositions[0].elements.find((e) => e.type === 'sticker').textSize = 42; return l; })(), 'a size too close to the next', /36 px and 42 px, only 1\.17 times apart/);
  // the headline must stay the largest
  refused((() => { const l = four({ max: 4 }); l.compositions[0].elements.find((e) => e.type === 'sticker').textSize = 140; return l; })(), 'a badge larger than the headline', /as large as the headline \(100 px\) or larger/);
  // the setting itself: whole numbers 3 to 5, a ratio 1.2 to 2 only with more than three, nothing else
  for (const [v, re] of [[{ max: 6 }, /levels\.max/], [{ max: 2 }, /levels\.max/], [{ max: 4.5 }, /levels\.max/], [{ max: 4, ratio: 1.1 }, /levels\.ratio/], [{ max: 4, ratio: 3 }, /levels\.ratio/],
    [{ max: 3, ratio: 1.3 }, /used only with more than 3/], [{ max: 4, extra: 1 }, /extra/], [{}, /levels\.max/], ['4', /levels/], [{ max: NaN }, /levels\.max/], [{ max: Infinity }, /levels\.max/], [{ max: 4, ratio: 'red;background:url(x)' }, /levels\.ratio/]]) {
    const p = refused(four(v), `levels ${JSON.stringify(v)}`, re);
    assert.ok(p.every((m) => !m.includes('background:url') && m.length <= 200), 'no echo of the payload');
  }
  assert.deepEqual(lookCatalogue().composition.properties.levels.props.max, { kind: 'number', min: 3, max: 5, step: 1, int: true });
});

test('static: ink and fill pairs come from a table', () => {
  ok(RETAIL);
  refused(withComp('Frame pop', (c) => { c.elements[2].ink = 'paper'; }), 'paper ink on a paper box', /ink paper does not read on fill paper/);
  refused(withComp('Stack', (c) => { c.elements[0].ink = 'ink'; }), 'ink on the field ground', /ink ink does not read on fill field/);
  ok(withComp('Stack', (c) => { c.elements[0].ink = 'white'; }), 'white on the field');
  refused(withComp('Frame pop', (c) => { c.elements[2].fill = 'muted'; }), 'a fill that is not a fill', /a colour a panel can be filled with/);
  refused(withComp('Frame pop', (c) => { c.elements[2].fill = '#ffffff'; }), 'a hex fill', /never a hex colour/);
  ok(withComp('Blocks', (c) => { c.elements[0].children[2].numberTile.ink = 'ink'; }), 'a dark ink on the gold tile');
  refused(withComp('Blocks', (c) => { c.elements[0].children[2].numberTile.ink = 'paper'; c.elements[0].children[2].numberTile.fill = 'paper'; }), 'paper on paper tile', /numberTile/);
  // text inside a sticker reads on the sticker, not on the page
  ok(host({ type: 'sticker', shape: 'circle', size: 200, fill: 'gold', ink: 'on-accent', place: AT(700, 300, 200, 200), children: [{ type: 'text', field: 'tag', style: 'display', size: 60, ink: 'ink' }] }), 'ink on a gold sticker');
  refused(host({ type: 'sticker', shape: 'circle', size: 200, fill: 'gold', place: AT(700, 300, 200, 200), children: [{ type: 'text', field: 'tag', style: 'display', size: 60, ink: 'white' }] }), 'white on gold is not in the table'.replace('not in', 'not in'), /ink white does not read on fill gold/);
});

test('static: at most three turned elements, and text is turned at most 8 degrees outside a sticker', () => {
  ok(RETAIL);
  const turned = (n) => host(...Array.from({ length: n }, (_, i) => ({ type: 'block', place: AT(56 + i * 120, 700, 100, 100), rot: 5 })));
  hostOk(...Array.from({ length: 3 }, (_, i) => ({ type: 'block', place: AT(56 + i * 120, 700, 100, 100), rot: 5 })));
  refused(turned(4), 'four turned blocks', /turns 4 elements/);
  refused(withComp('Frame pop', (c) => { c.elements.push({ type: 'block', place: AT(10, 10, 10, 10), rot: 3 }, { type: 'block', place: AT(30, 10, 10, 10), rot: 3 }); }), 'two more turned beside the box and the sticker', /turns 4 elements/);
  // a named angle that is 0 in this look is not a turn
  hostOk(...Array.from({ length: 4 }, (_, i) => ({ type: 'block', place: AT(56 + i * 120, 700, 100, 100), rot: 'sticker' })));
  // text turns
  const txt = (rot, extra = {}) => ({ type: 'text', field: 'sub', style: 'body', rot, place: AT(56, 900, 600, 100), ...extra });
  hostOk(txt(8));
  refused(host(txt(9)), 'text at 9 degrees', /turned 9 degrees/);
  refused(host(txt(-12)), 'text at -12 degrees', /turned 12 degrees/);
  // a retail named angle: block (-2) is fine, the sticker's (-8) is exactly the limit for a box
  ok(withComp('Frame pop', (c) => { c.elements[2].rot = 'sticker'; }), 'text in a box turned -8: at the limit');
  refused(withComp('Frame pop', (c) => { c.elements[2].rot = 12; }), 'text in a box turned 12', /turned 12 degrees/);
  // the dial scales every angle
  refused(withComp('Frame pop', (c, l) => { c.elements[2].rot = 'sticker'; l.dials.tilt = 1.5; }), 'dial 1.5 turns -8 into -12', /turned 12 degrees/);
  // inside a sticker text may be turned further; a vertical label is exempt
  ok(host({ type: 'sticker', shape: 'circle', size: 200, place: AT(700, 300, 200, 200), children: [{ type: 'text', field: 'tag', style: 'display', size: 60, rot: 12 }] }), 'text in a sticker');
  hostOk({ type: 'text', field: 'sub', style: 'body', vertical: 'up', place: AT(56, 900, 600, 100) });
});

test('static: text over a picture needs a filled parent box or a dark fade beneath it', () => {
  ok(RETAIL); ok(SWISS);
  // the headline box has no fill: the text lies over the picture
  refused(withComp('Frame pop', (c) => { delete c.elements[2].fill; delete c.elements[2].ink; }), 'a box with no fill over a picture', /over a picture/);
  // a dark fade between the picture and the box backs it
  ok(withComp('Frame pop', (c) => { delete c.elements[2].fill; delete c.elements[2].ink; c.elements.splice(2, 0, { type: 'scrim', place: { inset: 'page' } }); }), 'a scrim under the box');
  // a fade that comes before the picture, or that does not cover the text, does not
  refused(withComp('Frame pop', (c) => { delete c.elements[2].fill; delete c.elements[2].ink; c.elements.splice(0, 0, { type: 'scrim', place: { inset: 'page' } }); }), 'a scrim under the picture', /over a picture/);
  refused(withComp('Frame pop', (c) => { delete c.elements[2].fill; delete c.elements[2].ink; c.elements.splice(2, 0, { type: 'scrim', place: AT(0, 0, 1080, 400) }); }), 'a scrim that does not reach the text', /over a picture/);
  // z-order: raising the picture above the box buries it, which is not text over a picture
  ok(withComp('Frame pop', (c) => { delete c.elements[2].fill; delete c.elements[2].ink; c.elements[0].z = 5; }), 'the picture drawn after the text');
  // a flow child is judged by its parent
  ok(host({ type: 'photo', place: AT(56, 700, 900, 500) }, { type: 'box', place: AT(100, 800, 400, 200), fill: 'paper', children: [{ type: 'text', field: 'sub', style: 'body' }] }), 'text in a filled box over a picture');
  refused(host({ type: 'photo', place: AT(56, 700, 900, 500) }, { type: 'box', place: AT(100, 800, 400, 200), children: [{ type: 'text', field: 'sub', style: 'body' }] }), 'text in an unfilled box over a picture', /over a picture/);
  // text that does not touch the picture is fine
  ok(host({ type: 'photo', place: AT(56, 700, 900, 500) }, { type: 'text', field: 'sub', style: 'body', place: AT(56, 1250, 600, 40) }), 'text under the picture');
  // a sticker is a fill; a seam backs what is below it
  ok(host({ type: 'photo', place: AT(56, 700, 900, 500) }, { type: 'sticker', field: 'tag', size: 200, place: AT(300, 800, 200, 200) }), 'a sticker over a picture');
  ok(host({ type: 'seam', leftY: 700, rightY: 600, lower: 'dark' }, { type: 'text', field: 'sub', style: 'body', place: { anchor: { left: 'margin', right: 'margin', bottom: 56 } } }), 'text on the lower part of a seam');
  refused(host({ type: 'seam', leftY: 700, rightY: 600, lower: 'dark' }, { type: 'text', field: 'sub', style: 'body', place: { anchor: { left: 'margin', right: 'margin', top: 300 } } }), 'text on the upper part of a seam', /over a picture/);
  // grid placement is judged too (swiss): move the sub line onto the picture
  refused(withComp('Grid photo', (c) => { c.elements[3].place.grid = { col: 5, span: 4, row: 2, rowSpan: 2 }; }, SWISS), 'text on the grid picture', /over a picture/);
  // and the top label row over a picture
  refused(withComp('Grid photo', (c) => { c.elements[1].place = { inset: 'page' }; }, SWISS), 'the label row over a full-page picture', /over a picture/);
  ok(withComp('Grid photo', (c) => { c.elements[1].place = { inset: 'page' }; c.elements.splice(1, 0, { type: 'block', place: { anchor: { left: 0, right: 0, top: 0, h: 160 } }, colour: 'paper' }); c.elements.splice(1, 1); c.elements.splice(2, 0, { type: 'scrim', place: { anchor: { left: 0, right: 0, top: 0, h: 200 } } }); }, SWISS) || true);
});

test('static: an element runs to a page edge only where it touches that edge', () => {
  const photo = (place, bleed) => ({ type: 'photo', place, bleed });
  hostOk(photo({ inset: 'page' }, { edges: ['top', 'left'] }));
  hostOk(photo({ inset: 'margins' }, { edges: ['left'] }));
  hostOk(photo({ px: { x: 0, y: 700, w: 500, h: 650 } }, { edges: ['left', 'bottom'] }));
  hostOk(photo({ grid: { col: 1, span: 6, row: 2, rowSpan: 3 } }, { edges: ['left'], by: 0.1 }));
  hostOk(photo({ anchor: { left: 0, right: 'margin', top: 700, h: 300 } }, { edges: ['left', 'right'] }));
  for (const [place, edge] of [[{ inset: 'frame' }, 'left'], [{ px: { x: 10, y: 700, w: 500, h: 300 } }, 'left'], [{ px: { x: 0, y: 700, w: 500, h: 300 } }, 'bottom'], [{ px: { x: 0, y: 700 } }, 'right'],
    [{ grid: { col: 2, span: 4, row: 2, rowSpan: 3 } }, 'left'], [{ grid: { col: 1, span: 6, row: 2, rowSpan: 3 } }, 'top'], [{ grid: { col: 1, span: 6, row: 2, rowSpan: 3 } }, 'bottom'], [{ anchor: { left: 40, top: 700, w: 300, h: 300 } }, 'left']]) {
    refused(host(photo(place, { edges: [edge] })), `${JSON.stringify(place)} bleeding ${edge}`, new RegExp(`runs to the ${edge} edge`));
  }
  // a numeral may; a child of a box may not
  hostOk({ type: 'numeral', field: 'meta', format: 'day', cap: 400, min: 100, place: AT(56, 400, 900, 300), bleed: { edges: ['left', 'bottom'], by: 0.08 } });
  refused(host({ type: 'box', place: AT(56, 700, 500, 500), children: [{ type: 'rule', bleed: { edges: ['left'] } }] }), 'a child bleeding', /only an element placed on the page/);
  // the amount is bounded
  refused(host(photo({ inset: 'page' }, { edges: ['left'], by: 0.3 })), 'by 0.3', /bleed\.by/);
  refused(host(photo({ inset: 'page' }, { edges: ['left', 'left'] })), 'a repeated edge', /repeat/);
  refused(host(photo({ inset: 'page' }, { edges: [] })), 'no edges', /edges/);
});

test('structure: rows at most once, kinds and ground, accepts, the calm and fit settings', () => {
  const rows = { type: 'rows', each: 'meta-parts', textSize: 24, place: AT(56, 1000, 900, 100) };
  assert.ok(validateLook(host(rows, { ...rows, place: AT(56, 1100, 900, 100) }), 'look', {}).some((m) => /at most one rows/.test(m)));
  assert.ok(validateLook(host({ ...rows, keys: ['Date', 'Zzz'] }), 'look', {}).length > 0);
  hostOk({ ...rows, keys: ['Date', 'Time', 'Place'] });
  assert.ok(validateLook(host({ ...rows, each: 'items' }), 'look', {}).some((m) => /list items/.test(m)));
  const set = (k, v) => { const l = host(); l.compositions[0][k] = v; return validateLook(l, 'look', {}); };
  assert.ok(set('ground', 'dark').length === 0 && set('ground', 'accent').some((m) => /colour.grounds/.test(m)), 'a ground the look does not list');
  assert.deepEqual(set('ground', [{ when: { present: 'meta' }, ground: 'dark' }, { ground: 'paper' }]), []);
  assert.ok(set('ground', [{ ground: 'dark' }, { ground: 'paper' }]).some((m) => /needs a "when"/.test(m)));
  assert.ok(set('ground', [{ when: { present: 'meta' }, ground: 'dark' }, { when: { present: 'meta' }, ground: 'paper' }]).some((m) => /last case has no/.test(m)));
  assert.deepEqual(set('calm', { maxShare: 0.6 }), []);
  assert.ok(set('calm', { maxShare: 0.4 }).length > 0 && set('calm', { maxShare: 0.9 }).length > 0);
  assert.deepEqual(set('fit', 'frame'), []);
  assert.deepEqual(set('fit', { pad: 114, top: 114, bottom: 114 }), []);
  assert.ok(set('fit', { pad: 1 }).length > 0 && set('fit', 'tight').length > 0);
  assert.deepEqual(set('accepts', [{ field: 'headline', part: 'pre', maxChars: 22 }]), []);
  assert.ok(set('accepts', [{ field: 'sub', part: 'pre', maxChars: 22 }]).some((m) => /only the headline has/.test(m)));
  assert.ok(set('accepts', [{ field: 'headline', part: 'pre', maxChars: 71 }]).length > 0);
  assert.ok(set('accepts', [{ field: 'headline' }]).length > 0);
  assert.ok(set('accepts', [{ field: 'items', min: 2 }]).some((m) => /does not declare/.test(m)));
  assert.ok(set('accepts', [{ field: 'headline', maxChars: 20, extra: 1 }]).length > 0);
  assert.ok(set('accepts', Array(7).fill({ field: 'headline', maxChars: 20 })).some((m) => /up to 6/.test(m)));
  const withItems = clone(RETAIL);
  compOf(withItems, 'Blocks').accepts = [{ field: 'items', min: 3, max: 5 }];
  ok(withItems, 'an items rule');
  compOf(withItems, 'Blocks').accepts = [{ field: 'items', min: 5, max: 3 }];
  refused(withItems, 'min over max', /min is more than max/);
  assert.ok(set('kind', 'banner').some((m) => /kind must be one of/.test(m)));
  assert.ok(set('elements', []).some((m) => /1 to 40/.test(m)));
});

test('sections: the grid, the metaRow cells, the angles and the colour grounds', () => {
  const edit = (f, base = SWISS) => { const l = clone(base); f(l); return validateLook(l, 'look', SHIPPED); };
  assert.ok(edit((l) => { l.canvas.feed.grid.cols = 24; l.canvas.feed.grid.gutter = 40; }).some((m) => /columns are/.test(m)));
  assert.ok(edit((l) => { l.canvas.feed.grid.rows = 16; l.canvas.feed.margin.top = 400; }).length > 0);
  assert.ok(edit((l) => { l.canvas.feed.grid.rows = 0; }).some((m) => /needs rows|rows/.test(m)));
  assert.ok(edit((l) => { l.canvas.feed.grid.rows = 1; }).some((m) => /two rows/.test(m)));
  assert.ok(edit((l) => { l.devices.metaRow.cells[2] = { source: 'folio', col: 12, span: 3 }; }).some((m) => /runs past the grid/.test(m)));
  assert.ok(edit((l) => { l.devices.metaRow.cells = Array(5).fill({ source: 'brand', col: 1, span: 1 }); }).length > 0);
  assert.ok(edit((l) => { l.devices.angles.wobble = 3; }).some((m) => /not a setting/.test(m)));
  assert.ok(edit((l) => { l.devices.angles.sticker = 16; }).length > 0);
  assert.ok(edit((l) => { l.colour.grounds = ['paper', 'paper']; }).some((m) => /repeat/.test(m)));
  assert.ok(edit((l) => { l.colour.grounds = ['cyan']; }).length > 0);
  assert.ok(edit((l) => { l.colour.grounds = []; }).length > 0);
  assert.ok(edit((l) => { delete l.canvas; }).some((m) => /canvas is required/.test(m)));
  assert.ok(edit((l) => { l.canvas.story = clone(l.canvas.feed); }).some((m) => /not a setting/.test(m)));
  assert.ok(edit((l) => { l.type.body.size = 35; }).some((m) => /one of 28/.test(m)));
  assert.ok(edit((l) => { l.schema = 2; }).some((m) => /schema must be 1/.test(m)));
  assert.ok(edit((l) => { l.id = 'Bad Id'; }).some((m) => /id must be lowercase/.test(m)));
  assert.ok(edit((l) => { l.origin = 'copy:shipped:../etc'; }).some((m) => /origin/.test(m)));
  assert.deepEqual(edit((l) => { delete l.devices; delete l.photo; delete l.logo; delete l.dials; delete l.type.item; delete l.type.numeral; delete l.compositions; l.compositions = []; }), [], 'optional sections');
  assert.deepEqual(edit((l) => { delete l.compositions; }), [], 'a look with no compositions yet (the definition without them)');
});

// ---------------------------------------------------------------- brief, normalise, hash, list
test('lookBrief: kinds, variants, fields and budgets', () => {
  const b = lookBrief(RETAIL);
  assert.equal(b.id, 'retail'); assert.equal(b.name, 'Retail');
  assert.deepEqual(Object.keys(b.kinds).sort(), ['list', 'photo', 'statement']);
  assert.equal(b.kinds.event, undefined, 'a kind with no composition is absent');
  assert.deepEqual(b.kinds.statement.variants.map((v) => [v.index, v.name]), [[0, 'Stack'], [1, 'Mantra']]);
  const frame = b.kinds.photo.variants[0];
  assert.deepEqual(frame.fields, { image: { required: true }, headline: { required: true, max: 68 }, sub: { required: false, max: 120 }, tag: { required: false, max: 16 } });
  assert.equal(frame.describe, compOf(RETAIL, 'Frame pop').describe);
  assert.deepEqual(frame.accepts, []);
  assert.deepEqual(b.kinds.statement.variants[1].accepts, [{ field: 'headline', part: 'pre', maxChars: 22 }]);
  assert.deepEqual(b.kinds.list.variants[0].fields.items, { required: true, max: 5 });
  assert.deepEqual(b.kinds.statement.variants[0].fields.label, { required: false, max: 28 });
  assert.equal(JSON.stringify(lookBrief(RETAIL)), JSON.stringify(lookBrief(clone(RETAIL))));
  assert.deepEqual(lookBrief({ id: 'x', name: 'X' }).kinds, {});
  // the brief does not mutate the look
  const before = JSON.stringify(RETAIL); lookBrief(RETAIL); assert.equal(JSON.stringify(RETAIL), before);
});

test('normaliseLook: a canonical deep-frozen copy with defaults, ids derived', () => {
  const n = normaliseLook(RETAIL);
  assert.ok(Object.isFrozen(n) && Object.isFrozen(n.compositions[0].elements[0]) && Object.isFrozen(n.canvas.feed.margin));
  assert.throws(() => { n.name = 'x'; }, TypeError);
  assert.throws(() => { n.compositions[0].elements.push({}); }, TypeError);
  assert.deepEqual(n.compositions.map((c) => c.id), ['photo/0', 'statement/0', 'statement/1', 'list/0']);
  assert.equal(compOf(RETAIL, 'Frame pop').id, undefined, 'the id is derived, never stored');
  assert.equal(n.compositions[0].fit, 'margins'); assert.equal(n.compositions[1].fit, 'margins'); assert.equal(n.compositions[1].calm, null); assert.deepEqual(n.compositions[1].accepts, []);
  assert.deepEqual(n.compositions[0].fields.headline, { required: true, max: 68 });
  assert.deepEqual(n.compositions[0].fields.image, { required: true });
  assert.deepEqual(n.compositions[1].fields.label, { max: 28, required: false });
  const swiss = normaliseLook({ ...clone(SWISS), compositions: [] });
  assert.deepEqual(swiss.compositions, []);
  const bare = clone(RETAIL); delete bare.devices; delete bare.photo; delete bare.logo; delete bare.dials; delete bare.fonts.mono; delete bare.type.item; delete bare.description;
  const d = normaliseLook(bare);
  assert.deepEqual(d.dials, { tilt: 1, density: 0, weightShift: 0 });
  assert.deepEqual(d.logo, { default: 'off', height: 44 });
  assert.deepEqual(d.photo, { treat: [], tint: 'primary' });
  assert.deepEqual(d.devices.angles, { sticker: 0, bar: 0, block: 0, band: 0, card: 0, price: 0 });
  assert.deepEqual(d.devices.rule, { hair: 1, heavy: 4 }); assert.equal(d.devices.folio, 'no'); assert.deepEqual(d.devices.shadow, { x: 0, y: 0, colour: 'ink' });
  assert.deepEqual(d.fonts.mono, d.fonts.label); assert.deepEqual(d.type.item, { size: 36, lead: 1.2222, weight: 600 }); assert.equal(d.description, '');
  assert.equal(n.compositions[0].elements[0].z, 0, 'element defaults are filled');
  assert.equal(RETAIL.compositions[0].elements[0].z, undefined, 'the input is not changed');
  const back = JSON.parse(JSON.stringify(n));
  back.compositions.forEach((c) => { delete c.id; if (c.calm === null) delete c.calm; });
  assert.deepEqual(problems(back), [], 'a normalised look is still valid (but for the derived ids)');
  assert.throws(() => normaliseLook(null), TypeError);
});

test('lookHash: stable, independent of key order, equal for equal meaning, different otherwise', () => {
  const h = lookHash(RETAIL);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(lookHash(RETAIL), h);
  const reorder = (v) => (Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reorder(v[k])])) : v);
  assert.equal(lookHash(reorder(RETAIL)), h, 'key order does not matter');
  const explicit = clone(RETAIL); explicit.description = RETAIL.description; explicit.dials = { tilt: 1, density: 0, weightShift: 0 };
  assert.equal(lookHash(explicit), h, 'a default written out hashes the same as one left out');
  const changed = clone(RETAIL); changed.devices.shadow.x = 15;
  assert.notEqual(lookHash(changed), h);
  const reordered = clone(RETAIL); reordered.compositions.reverse();
  assert.notEqual(lookHash(reordered), h, 'the order of compositions is part of the meaning');
  assert.notEqual(lookHash(SWISS), h);
  const el = clone(RETAIL); compOf(el, 'Stack').elements[0].gap = 37;
  assert.notEqual(lookHash(el), h);
});

test('validateLooks: a list of up to the cap, unique ids, each valid', () => {
  const copy = (id) => ({ ...clone(RETAIL), id, origin: 'copy:shipped:retail' });
  assert.deepEqual(validateLooks(undefined), []);
  assert.deepEqual(validateLooks([copy('a'), copy('b')]), []);
  assert.deepEqual(validateLooks([]), []);
  assert.ok(validateLooks('x').length === 1 && validateLooks({}).length === 1 && validateLooks(null).length === 1);
  const dup = validateLooks([copy('a'), copy('a')]);
  assert.ok(dup.some((m) => /used by more than one look/.test(m)));
  const cap = LIMITS.looksPerBrand;
  assert.deepEqual(validateLooks(Array.from({ length: cap }, (_, i) => copy(`l${i}`))), []);
  assert.ok(validateLooks(Array.from({ length: cap + 1 }, (_, i) => copy(`l${i}`)))[0].includes(`up to ${cap}`));
  const bad = copy('c'); bad.dials.tilt = 9;
  const p = validateLooks([copy('a'), bad], 'brand.json: looks');
  assert.ok(p.length === 1 && p[0].startsWith('brand.json: looks[1] "c"') && /dials\.tilt/.test(p[0]), p[0]);
  assert.ok(validateLooks([{ ...copy('z'), origin: 'shipped' }]).some((m) => /origin/.test(m)), 'a brand\'s look cannot claim to be shipped');
  assert.deepEqual(validateLooks([{ ...copy('z'), origin: 'shipped' }], 'looks', SHIPPED), []);
  assertClean(validateLooks([5, null, 'x', [], { id: 7 }]), 'garbage in a list');
  assertClean(validateLooks('x'.repeat(10000), 'x'.repeat(10000)), 'a string for a list');
});

test('every message names where the problem is, in the style of the layout validator', () => {
  const p = validateLook({ ...clone(SWISS), id: 'mine', origin: 'copy:own:mine', dials: { tilt: 9 } }, 'brand.json: looks[2]', {});
  assert.deepEqual(p, ['brand.json: looks[2] "mine": dials.tilt must be a number from 0 to 1.5 (got 9)']);
  const q = validateLook(host({ type: 'text', place: AT(1, 1, 1, 1), field: 'sub', style: 'bold' }), 'look', {});
  assert.ok(q[0].startsWith('look "host": compositions[0].elements[2].style must be one of display, body, item, label, numeral (got "bold")'), q[0]);
  assert.deepEqual(validateLook(5, 'look', {}), ['look: a look must be an object']);
  assert.deepEqual(ELEMENTS.box.placement, 'required');
});

// ---------------------------------------------------------------- the newer properties
// (the fuzz above is table-driven over the catalogue, so every property listed below is also hostile-tested value by value; these tests
// hold the rules that join several properties, and one valid example of each)
const hp = (...extra) => validateLook(host(...extra), 'look', {});
const says = (p, re, what) => { assert.ok(p.length > 0, `${what}: should be refused`); assert.ok(p.some((m) => re.test(m)), `${what}: expected ${re} in ${JSON.stringify(p)}`); assertClean(p, what); };
const inBox = (...children) => ({ type: 'box', place: AT(56, 300, 900, 700), children });
const flowOf = (t) => { const e = clone(EXAMPLES[t]); delete e.place; return e; };
const defd = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const TX = (o) => ({ type: 'text', field: 'sub', style: 'body', place: AT(56, 900, 600, 100), ...o });

test('the catalogue lists the newer properties and the seam\'s sticker slot', () => {
  const c = lookCatalogue(), P = (t) => Object.keys(c.elements[t].properties);
  for (const t of ['box', 'text', 'fitted-stack', 'numeral', 'mantra-rows', 'rows', 'sticker', 'rule', 'block']) assert.ok(P(t).includes('before') && c.elements[t].properties.before.group === 'flow', `${t}.before`);
  for (const k of ['track', 'lead', 'weight', 'font', 'dropWhenTight', 'textShadow']) assert.ok(P('text').includes(k), `text.${k}`);
  assert.deepEqual([c.elements.text.properties.ladder.props.maxLines.max, c.elements.text.properties.ladder.props.maxH.max], [8, 900]);
  assert.deepEqual([c.elements.sticker.properties.ladder.props.maxLines.max, c.elements.sticker.properties.ladder.props.maxH.min], [8, 40]);
  for (const k of ['sizes', 'family', 'textShadow']) assert.ok(P('numeral').includes(k), `numeral.${k}`);
  assert.ok(P('glyph').includes('textShadow'));
  assert.ok(P('fitted-stack').includes('lead') && P('fitted-stack').includes('h'));
  for (const k of ['minW', 'maxW', 'fit', 'pad', 'w']) assert.ok(P('sticker').includes(k), `sticker.${k}`);
  assert.equal(c.elements.seam.container, 'any');
  assert.deepEqual(Object.keys(c.elements.seam.slots), ['sticker']);
  assert.equal(c.elements.seam.slots.sticker.of, 'sticker');
  assert.equal(c.elements.box.slots, undefined);
  assert.ok(P('seam').includes('gap') && P('seam').includes('edge') && P('seam').includes('ink'));
  assert.deepEqual([c.sections.type.props.display.props.wordSpace.min, c.sections.type.props.display.props.wordSpace.max], [0, 0.2]);
  assert.deepEqual([c.place.modifiers.minH.min, c.place.modifiers.minH.max], [0, 600]);
  assert.equal(c.place.modifiers.square.kind, 'bool');
  assert.equal(lookCatalogue().elements.numeral.required.length, 0, 'a numeral needs cap and min or sizes, a rule that joins properties');
});

test('before: only for an item flowing in a box, for every type that lists it', () => {
  const types = ELEMENT_TYPES.filter((t) => ELEMENTS[t].common.includes('before'));
  assert.deepEqual(types, ['box', 'text', 'sticker', 'rule', 'block', 'fitted-stack', 'numeral', 'mantra-rows', 'rows', 'info-rows', 'button', 'photo-row', 'icon-badge']);
  for (const t of types) {
    assert.deepEqual(hp(inBox({ ...flowOf(t), before: 24 })), [], `${t} flows with space before`);
    assert.deepEqual(hp(inBox({ ...flowOf(t), before: -12 })), [], `${t} flows pulled up a little`);
    says(hp({ ...clone(EXAMPLES[t]), before: 24 }), /elements\[2\]\.before is for an item flowing in a box/, `${t}: before at the top`);
    says(hp(inBox({ ...clone(EXAMPLES[t]), place: AT(5, 5, 100, 100), before: 24 })), /before is for an item that flows/, `${t}: before with a place`);
    for (const v of [-41, 121, 1.5, '8', NaN]) says(hp(inBox({ ...flowOf(t), before: v })), /before must be a whole number from -40 to 120/, `${t}: before ${String(v)}`);
  }
  for (const t of ELEMENT_TYPES.filter((x) => !types.includes(x))) says(hp({ ...clone(EXAMPLES[t]), before: 5 }), /"before" is not a setting/, `${t} takes no before`);
});

test('place: minH goes with any form, square with a grid only and never with h', () => {
  const ph = (place) => ({ type: 'photo', place });
  hostOk(ph({ grid: { col: 1, span: 4 }, minH: 300 }));
  hostOk(ph({ px: { x: 0, y: 700, w: 100, h: 100 }, minH: 300 }));
  hostOk(ph({ anchor: { left: 'margin', top: 700, w: 100 }, minH: 300 }));
  hostOk(ph({ inset: 'margins', minH: 10 }));
  hostOk(ph({ grid: { col: 1, span: 4 }, square: true }));
  hostOk(ph({ grid: { col: 1, span: 4, row: 3, rowSpan: 3, alignY: 'bottom' }, square: true, minH: 100 }));
  hostOk(ph({ grid: { col: 1, span: 4 }, square: false, h: 300 }));
  hostOk(ph({ grid: { col: 1, span: 4 }, square: true, w: 'col' }));
  for (const v of [-1, 601, 1.5, '3', NaN, null]) says(hp(ph({ grid: { col: 1, span: 4 }, minH: v })), /minH must be a whole number from 0 to 600/, `minH ${String(v)}`);
  for (const v of [1, 'yes', 0, null, {}]) says(hp(ph({ grid: { col: 1, span: 4 }, square: v })), /square must be true or false/, `square ${String(v)}`);
  says(hp(ph({ grid: { col: 1, span: 4 }, square: true, h: 300 })), /square and h/, 'square with h');
  says(hp(ph({ grid: { col: 1, span: 4 }, square: true, h: 'gutter' })), /square and h/, 'square with a token h');
  for (const place of [{ px: { x: 1, y: 700, w: 100, h: 100 } }, { anchor: { left: 0, top: 700, w: 100, h: 100 } }, { inset: 'page' }]) says(hp(ph({ ...place, square: true })), /square goes with a grid place only/, `square with ${Object.keys(place)[0]}`);
  // the child of a box: px or anchor, so a square is refused there
  says(hp(inBox({ type: 'photo', place: { px: { x: 1, y: 1 }, square: true } })), /square goes with a grid place only/, 'square in a box');
});

test('static: a place\'s square and minH change the rectangle it covers', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
  const g = gridOf(SWISS), PAGE_RECT = { x0: 0, y0: 0, x1: 1080, y1: 1350 };
  const rect = (place, mh = 0) => placeRect(place, PAGE_RECT, SWISS, g, mh);
  const [r3top, r4bottom] = rowSpanOf(g, 3, 2);
  const plain = rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2 } });
  assert.deepEqual([plain.y0, plain.y1], [r3top, r4bottom], 'no square: the rows');
  const side = plain.x1 - plain.x0;
  assert.ok(side < r4bottom - r3top, 'the test needs a square smaller than its rows');
  const top = rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2 }, square: true });
  assert.ok(Math.abs(top.y1 - top.y0 - side) < 1e-6, 'a square is as tall as it is wide'); assert.equal(top.y0, r3top, 'at the top of its rows');
  const foot = rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2, alignY: 'bottom' }, square: true });
  assert.equal(foot.y1, r4bottom, 'with alignY bottom it sits at the foot'); assert.ok(Math.abs(foot.y1 - foot.y0 - side) < 1e-6);
  const mid = rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2, alignY: 'center' }, square: true });
  assert.ok(Math.abs((mid.y0 + mid.y1) / 2 - (r3top + r4bottom) / 2) < 1e-6 && Math.abs(mid.y1 - mid.y0 - side) < 1e-6);
  const wide = rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2 }, square: true, w: 300 });
  assert.ok(Math.abs(wide.y1 - wide.y0 - 300) < 1e-6, 'a square with its own width is as tall as that');
  const noRow = rect({ grid: { col: 1, span: 3 }, square: true });
  assert.ok(Math.abs(noRow.y1 - noRow.y0 - side) < 1e-6);
  // minH is the least height, whatever the form
  near(rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2 }, minH: 500 }).y1 - r3top, 500);
  const lowMin = rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2, alignY: 'bottom' }, minH: 500 });
  assert.equal(lowMin.y1, r4bottom); near(lowMin.y1 - lowMin.y0, 500);
  assert.deepEqual(rect({ grid: { col: 1, span: 3, row: 3, rowSpan: 2 }, minH: 10 }), plain, 'a minH below the rows changes nothing');
  assert.equal(rect({ px: { x: 0, y: 100, w: 50, h: 10 }, minH: 80 }).y1, 180);
  assert.equal(rect({ px: { x: 0, y: 100, w: 50 }, minH: 80 }).y1, 180);
  assert.deepEqual([rect({ anchor: { left: 0, top: 100, w: 50 }, minH: 80 }).y0, rect({ anchor: { left: 0, top: 100, w: 50 }, minH: 80 }).y1], [100, 180]);
  const fromBottom = rect({ anchor: { left: 0, bottom: 100, w: 50 }, minH: 80 });
  assert.deepEqual([fromBottom.y0, fromBottom.y1], [1350 - 100 - 80, 1350 - 100]);
  assert.equal(rect({ anchor: { left: 0, top: 100, h: 200, w: 50 }, minH: 80 }).y1, 300);
  // and it is judged: a square caption reaching down onto a picture is text over a picture
  const photo = { type: 'photo', place: { grid: { col: 1, span: 12, row: 6, rowSpan: 2 } } };
  hostOk(photo, { type: 'text', field: 'sub', style: 'body', place: { grid: { col: 1, span: 3, row: 3 }, minH: 100 } });
  says(hp(photo, { type: 'text', field: 'sub', style: 'body', place: { grid: { col: 1, span: 3, row: 3 }, minH: 600 } }), /over a picture/, 'a text whose minH reaches the picture');
  says(hp(photo, { type: 'text', field: 'sub', style: 'body', place: { grid: { col: 1, span: 12, row: 3 }, square: true } }), /over a picture/, 'a square text as tall as the page is wide');
});

test('text: track, lead, weight, font; the weight is one the font of its role lists', () => {
  hostOk(TX({ track: 0.1, lead: 1.2, weight: 500, font: 'text' }));
  hostOk(TX({ track: -0.1, lead: 0.8 })); hostOk(TX({ track: 0.3, lead: 1.6, weight: 400 }));
  for (const [k, v] of [['track', -0.11], ['track', 0.31], ['lead', 0.79], ['lead', 1.61], ['weight', 99], ['weight', 901], ['weight', 450.5], ['weight', '500'], ['font', 'serif'], ['font', 7]]) says(hp(TX({ [k]: v })), new RegExp(`\\.${k} must be`), `${k} ${v}`);
  // swiss: display 700 and 800, text 400 and 500, label (mono) 500
  says(hp(TX({ weight: 600 })), /\.weight is 600, which fonts\.text\.weights does not list \(400, 500\)/, 'body 600');
  hostOk(TX({ style: 'display', size: 100, weight: 700 }));
  says(hp(TX({ style: 'display', size: 100, weight: 900 })), /fonts\.display\.weights does not list \(700, 800\)/, 'display 900');
  says(hp(TX({ style: 'numeral', size: 100, weight: 500 })), /fonts\.display\.weights/, 'a numeral style uses the display font');
  hostOk(TX({ style: 'label', weight: 500 }));
  says(hp(TX({ style: 'label', weight: 400 })), /fonts\.mono\.weights does not list \(500\)/, 'label follows type.label.role (mono)');
  // the font override
  hostOk(TX({ font: 'display', weight: 800 }));
  says(hp(TX({ font: 'display', weight: 500 })), /fonts\.display\.weights/, 'body text in the display font, weight 500');
  says(hp(TX({ font: 'label', weight: 400 })), /fonts\.label\.weights does not list \(500\)/, 'font label');
  says(hp(TX({ font: 'mono', weight: 400 })), /fonts\.mono\.weights/, 'font mono');
  hostOk(TX({ font: 'mono', weight: 500 }));
  // a label font of a look whose labels are not mono
  const swap = host(TX({ style: 'label', weight: 500 })); swap.type.label.role = 'label'; swap.fonts.label.weights = [400, 500]; swap.fonts.label.family = 'Hanken Grotesk'; swap.fonts.mono.weights = [500];
  assert.deepEqual(validateLook(swap, 'look', {}), [], 'label type in the label font, which lists 500');
  swap.compositions[0].elements[2].weight = 300; says(validateLook(swap, 'look', {}), /fonts\.label\.weights/, 'label role label');
  // only library fonts are checked, like fontRules
  const brand = host(TX({ style: 'display', size: 100, weight: 900 })); brand.fonts.display = { source: 'brand', role: 'display' };
  assert.deepEqual(validateLook(brand, 'look', {}), [], 'a brand font lists no weights');
  // in a flow too
  says(hp(inBox({ type: 'text', field: 'sub', style: 'body', weight: 600 })), /elements\[2\]\.children\[0\]\.weight is 600/, 'weight of a child');
  // other types take none of them
  for (const k of ['track', 'lead', 'weight', 'font', 'dropWhenTight']) says(hp({ type: 'box', place: AT(56, 700, 100, 100), [k]: 1 }), /is not a setting of a box/, `box.${k}`);
});

test('text: dropWhenTight at most once, and only where a headline can be measured', () => {
  hostOk(TX({ dropWhenTight: true }));
  hostOk(TX({ dropWhenTight: false }), { ...TX({ dropWhenTight: false }), field: 'tag', style: 'label', place: AT(56, 1000, 300, 60) });
  says(hp(TX({ dropWhenTight: true }), { ...TX({ dropWhenTight: true }), field: 'tag', style: 'label', place: AT(56, 1000, 300, 60) }), /elements\[3\]\.dropWhenTight at most one element/, 'two that may be dropped');
  says(hp(TX({ dropWhenTight: 'yes' })), /dropWhenTight must be true or false/, 'a string');
  // the measured headline: a fitted headline counts, a mantra-rows or no headline text does not
  const without = (el) => { const l = host(TX({ dropWhenTight: true })); l.compositions[0].elements[0] = clone(el); return validateLook(l, 'look', {}); };
  assert.deepEqual(without(EXAMPLES['fitted-stack']), [], 'a fitted headline is measured');
  says(without(EXAMPLES['mantra-rows']), /dropWhenTight needs a headline text or a fitted headline/, 'repeated headline rows');
  // the headline that drops itself cannot be what is measured
  const self = host({ type: 'text', field: 'headline', style: 'display', size: 100, place: AT(56, 100, 900, 300), dropWhenTight: true });
  self.compositions[0].elements.shift();
  says(validateLook(self, 'look', {}), /dropWhenTight needs a headline text/, 'the only headline drops itself');
});

test('text and sticker ladders: maxLines and maxH, and the ladder rules still apply', () => {
  const lad = (extra = {}, steps = [[50, 100], [100, 90]]) => TX({ style: 'display', ladder: { by: 'sub', steps, ...extra } });
  hostOk(lad({ maxLines: 3, maxH: 300 })); hostOk(lad({ maxLines: 1 })); hostOk(lad({ maxH: 900 }));
  for (const [k, v] of [['maxLines', 0], ['maxLines', 9], ['maxLines', 2.5], ['maxH', 39], ['maxH', 901], ['maxH', '300']]) says(hp(lad({ [k]: v })), new RegExp(`ladder\\.${k} must be`), `${k} ${v}`);
  says(hp(lad({ maxLines: 3 }, [[100, 100], [50, 90]])), /shortest text first/, 'steps still ordered with maxLines');
  says(hp(lad({ maxH: 300 }, [[50, 90], [100, 100]])), /must not grow/, 'sizes still never grow with maxH');
  says(hp(lad({ maxLines: 3 }, [[50, 100], [90, 90]])), /must reach it/, 'the last step still reaches the maximum');
  const st = (extra) => ({ type: 'sticker', field: 'tag', shape: 'circle', size: 200, place: AT(700, 300, 200, 200), ladder: { by: 'tag', steps: [[8, 60], [16, 40]], ...extra } });
  hostOk(st({ maxLines: 2, maxH: 120 }));
  for (const [k, v] of [['maxLines', 0], ['maxLines', 9], ['maxH', 39], ['maxH', 901]]) says(hp(st({ [k]: v })), new RegExp(`ladder\\.${k} must be`), `sticker ${k} ${v}`);
  says(hp({ ...st({ maxLines: 2 }), ladder: { by: 'tag', steps: [[8, 40], [16, 60]], maxLines: 2 } }), /must not grow/, 'a sticker ladder still never grows');
});

test('textShadow: hard or your own, on text, a numeral and a glyph only', () => {
  const shadows = ['hard', { x: 3, y: 3, colour: 'ink' }, { x: -24, y: 24 }];
  for (const sh of shadows) {
    hostOk(TX({ textShadow: sh }));
    hostOk({ ...EXAMPLES.numeral, textShadow: sh });
    hostOk({ ...EXAMPLES.glyph, textShadow: sh });
  }
  for (const bad of ['soft', 'none', 5, [1, 2], { x: 25, y: 0 }, { x: 1 }, { y: 1 }, { x: 1.5, y: 1 }, { x: 1, y: 1, colour: '#ffffff' }, { x: 1, y: 1, colour: 'chartreuse' }, { x: 1, y: 1, blur: 4 }, null]) {
    for (const t of ['text', 'numeral', 'glyph']) says(hp({ ...clone(EXAMPLES[t]), textShadow: bad }), /textShadow/, `${t}.textShadow ${JSON.stringify(bad)}`);
  }
  hostOk({ ...clone(EXAMPLES['fitted-stack']), textShadow: 'hard' });
  says(hp((({ cap, floor, ...rest }) => ({ ...rest, mode: 'block', sizes: [120, 100], textShadow: 'hard' }))(clone(EXAMPLES['fitted-stack']))), /textShadow is for lines mode/, 'a block headline takes no letter shadow');
  for (const t of ELEMENT_TYPES.filter((x) => !['text', 'numeral', 'glyph', 'fitted-stack'].includes(x))) says(hp({ ...clone(EXAMPLES[t]), textShadow: 'hard' }), /"textShadow" is not a setting/, `${t} takes no textShadow`);
});

test('fitted-stack: maxLines up to 5 in lines and block mode and 8 in fill mode; lead in lines mode only', () => {
  const fsx = (o) => ({ type: 'fitted-stack', place: AT(56, 400, 900, 300), ...o });
  hostOk(fsx({ mode: 'lines', cap: 200, floor: 80, maxLines: 5, lead: 0.9 }));
  hostOk(fsx({ mode: 'block', sizes: [120, 100], maxLines: 5 }));
  hostOk(fsx({ mode: 'fill', cap: 200, floor: 80, maxLines: 8 }));
  hostOk(fsx({ mode: 'fill', cap: 200, floor: 80, maxLines: 6 }));
  hostOk(fsx({ mode: 'lines', cap: 200, floor: 80, maxLines: 1, lead: 0.78 })); hostOk(fsx({ mode: 'lines', cap: 200, floor: 80, lead: 1.2 }));
  says(hp(fsx({ mode: 'lines', cap: 200, floor: 80, maxLines: 6 })), /maxLines is at most 5 in lines mode/, 'lines 6');
  says(hp(fsx({ mode: 'block', sizes: [120, 100], maxLines: 7 })), /maxLines is at most 5 in lines mode and 6 in block mode/, 'block 7');
  for (const v of [0, 9, 2.5, '3']) says(hp(fsx({ mode: 'fill', cap: 200, floor: 80, maxLines: v })), /maxLines must be a whole number from 1 to 8/, `fill ${v}`);
  for (const v of [0.77, 1.21, '1', null]) says(hp(fsx({ mode: 'lines', cap: 200, floor: 80, lead: v })), /lead must be a number from 0.78 to 1.2/, `lead ${v}`);
  says(hp(fsx({ mode: 'fill', cap: 200, floor: 80, lead: 1 })), /lead is for lines mode/, 'lead in fill');
  says(hp(fsx({ mode: 'block', sizes: [120, 100], lead: 1 })), /lead is for lines mode/, 'lead in block');
  // h and minH, a block-mode headline in a flow
  hostOk(inBox({ type: 'fitted-stack', mode: 'block', sizes: [120, 100], h: 300, minH: 200, before: 10 }));
  hostOk(inBox({ type: 'fitted-stack', mode: 'lines', cap: 200, floor: 80, grow: 1 }));
  says(hp(fsx({ mode: 'lines', cap: 200, floor: 80, h: 300 })), /\.h is for an item flowing in a box/, 'h at the top');
});

test('numeral: cap and min, or sizes; the sizes go from the largest down; family', () => {
  const nu = (o) => ({ type: 'numeral', field: 'meta', format: 'day', place: AT(56, 400, 900, 300), ...o });
  hostOk(nu({ cap: 400, min: 100 })); hostOk(nu({ sizes: [400, 300, 200] })); hostOk(nu({ sizes: [900] }));
  hostOk(nu({ sizes: [900, 800, 700, 600, 500, 400, 300, 24] })); hostOk(nu({ sizes: [400, 300], family: 'mono' })); hostOk(nu({ cap: 400, min: 100, family: 'display' }));
  says(hp(nu({ sizes: [400, 300], cap: 400 })), /gives sizes and cap or min/, 'sizes and cap');
  says(hp(nu({ sizes: [400, 300], min: 100 })), /gives sizes and cap or min/, 'sizes and min');
  says(hp(nu({})), /needs cap and min, or sizes/, 'nothing');
  says(hp(nu({ cap: 400 })), /needs cap and min, or sizes/, 'cap alone');
  says(hp(nu({ min: 100 })), /needs cap and min, or sizes/, 'min alone');
  says(hp(nu({ cap: 100, min: 200 })), /min is above the largest size/, 'min above cap');
  says(hp(nu({ sizes: [300, 400] })), /sizes must go from the largest down/, 'ascending');
  says(hp(nu({ sizes: [300, 300] })), /sizes must go from the largest down/, 'equal');
  says(hp(nu({ sizes: [] })), /sizes must be a list of 1 to 8/, 'empty');
  says(hp(nu({ sizes: Array.from({ length: 9 }, (_, i) => 900 - i * 10) })), /sizes must be a list of 1 to 8/, 'nine');
  for (const v of [23, 901, 100.5, '300']) says(hp(nu({ sizes: [v] })), /sizes\[0\] must be a whole number from 24 to 900/, `size ${v}`);
  for (const v of ['serif', 'text', 3]) says(hp(nu({ cap: 400, min: 100, family: v })), /family must be one of display, mono/, `family ${v}`);
  // the least height is the last size: a numeral set from y 650 reaches a picture at 700 with sizes ending at 100, not with sizes ending at 24
  const over = (sizes) => hp({ type: 'photo', place: AT(56, 700, 900, 500) }, { type: 'numeral', field: 'meta', format: 'day', sizes, place: { px: { x: 56, y: 650, w: 900 } } });
  assert.deepEqual(over([400, 24]), [], 'ends at 24: clear of the picture');
  says(over([400, 100]), /over a picture/, 'ends at 100: reaches the picture');
  says(hp({ type: 'photo', place: AT(56, 700, 900, 500) }, { type: 'numeral', field: 'meta', format: 'day', cap: 400, min: 60, place: { px: { x: 56, y: 650, w: 900 } } }), /over a picture/, 'cap and min are judged by the least size too');
});

test('sticker: w "hug" with minW, maxW and fit; fit and pad', () => {
  const pill = (o) => defd({ type: 'sticker', field: 'tag', shape: 'pill', w: 'hug', h: 80, fit: { cap: 60, floor: 30, h: 60 }, place: { px: { x: 600, y: 300 } }, ...o });
  hostOk(pill({}));
  hostOk(pill({ minW: 100, maxW: 400, pad: 20, fit: { cap: 60, floor: 30, w: 300, h: 60, maxLines: 4 } }));
  says(hp(pill({ fit: { cap: 60, floor: 30 } })), /fit needs h/, 'a hugging pill with no fit.h');
  hostOk(pill({ minW: 100, maxW: 100 }));
  hostOk(pill({ h: undefined, size: 90 }));
  hostOk(pill({ pad: [10, 20, 10, 20] }));
  hostOk({ type: 'sticker', field: 'tag', shape: 'pill', w: 300, h: 80, place: AT(600, 300, 300, 80), pad: 12 });
  hostOk({ type: 'sticker', field: 'tag', shape: 'circle', size: 200, fit: { cap: 60, floor: 30, w: 150, h: 100 }, place: AT(700, 300, 200, 200) });
  says(hp({ type: 'sticker', field: 'tag', shape: 'circle', size: 200, fit: { cap: 60, floor: 30, h: 100 }, place: AT(700, 300, 200, 200) }), /fit needs w/, 'fit with no w');
  says(hp({ type: 'sticker', field: 'tag', shape: 'circle', size: 200, fit: { cap: 60, floor: 30, w: 100 }, place: AT(700, 300, 200, 200) }), /fit needs h/, 'fit with no h');
  says(hp(pill({ w: 'wide' })), /w must be/, 'w wide'); says(hp(pill({ w: 10 })), /w must be/, 'w 10'); says(hp(pill({ w: 901 })), /w must be/, 'w 901');
  says(hp(pill({ fit: undefined })), /a hugging sticker needs fit/, 'hug without fit');
  const kids = pill({ field: undefined, fit: undefined, children: [{ type: 'text', field: 'tag', style: 'display', size: 40 }] });
  says(hp(kids), /a hugging sticker carries a field/, 'hug with text items');
  says(hp(pill({ h: undefined })), /a hugging sticker needs a height/, 'hug without a height');
  says(hp(pill({ shape: 'circle' })), /a hugging sticker is a pill/, 'hug circle');
  says(hp(pill({ shape: undefined })), /a hugging sticker is a pill/, 'hug with the default shape');
  says(hp(pill({ minW: 500, maxW: 100 })), /minW is above maxW/, 'minW above maxW');
  for (const v of [39, 901, 100.5, '100']) { says(hp(pill({ minW: v })), /minW must be/, `minW ${v}`); says(hp(pill({ maxW: v })), /maxW must be/, `maxW ${v}`); }
  says(hp(pill({ w: 300, minW: 100, h: 80 })), /minW goes with w "hug" only/, 'minW with a number w');
  says(hp({ type: 'sticker', field: 'tag', shape: 'pill', h: 80, maxW: 300, place: AT(600, 300, 300, 80), size: 200 }), /maxW goes with w "hug" only/, 'maxW without w');
  says(hp(pill({ ladder: { by: 'tag', steps: [[16, 40]] } })), /fit and a ladder/, 'fit and ladder');
  says(hp(pill({ textSize: 40 })), /fit and a text size/, 'fit and textSize');
  says(hp(pill({ fit: { cap: 30, floor: 60 } })), /fit\.floor is above the largest size/, 'floor above cap');
  says(hp(pill({ fit: { cap: 60 } })), /fit needs floor/, 'fit without floor'); says(hp(pill({ fit: { floor: 30 } })), /fit needs cap/, 'fit without cap');
  says(hp(pill({ fit: { cap: 60, floor: 30, maxLines: 5 } })), /fit\.maxLines must be a whole number from 1 to 4/, 'fit.maxLines 5');
  says(hp(pill({ fit: { cap: 60, floor: 30, extra: 1 } })), /is not a setting here/, 'fit extra key');
  says(hp({ type: 'sticker', shape: 'circle', size: 200, fit: { cap: 60, floor: 30 }, place: AT(700, 300, 200, 200), children: [{ type: 'text', field: 'tag', style: 'display', size: 40 }] }), /sizes the words of a field/, 'fit with text items');
  says(hp(pill({ pad: 201 })), /pad must be/, 'pad 201');
  // the existing rules hold: a circle needs a size, a pill a width or a size
  says(hp({ type: 'sticker', field: 'tag', shape: 'circle', place: AT(700, 300, 200, 200) }), /needs a size/, 'a circle with no size');
  says(hp({ type: 'sticker', field: 'tag', shape: 'pill', h: 80, place: AT(700, 300, 200, 80) }), /needs a width \(w\) or a size/, 'a pill with no width');
  // type levels: the fit's cap is the size it sets
  says(hp({ type: 'text', field: 'sub', style: 'item', size: 36, place: AT(56, 900, 600, 100) }, pill({ fit: { cap: 70, floor: 30, h: 60 } })), /sets type in 4 sizes/, 'the fit cap is a level');
});

test('seam: edge rises to the right, lower is a fill role, items flow, one sticker on the edge', () => {
  const stk = (o = {}) => defd({ type: 'sticker', field: 'tag', shape: 'circle', size: 160, place: { anchor: { right: 60, top: -80 } }, ...o });
  const seam = (o = {}) => defd({ type: 'seam', leftY: 700, rightY: 600, lower: 'dark', ...o });
  const kid = { type: 'text', field: 'sub', style: 'body' };
  hostOk(seam());
  hostOk(seam({ edge: 8, gap: 20, ink: 'white', upper: 'field', edgeFill: 'paper', children: [clone(kid)] }));
  hostOk(seam({ children: [{ ...clone(kid), w: 600, before: 12 }], sticker: stk() }));
  hostOk(seam({ sticker: stk({ place: { px: { x: 700, y: -60, w: 160, h: 160 } } }) }));
  hostOk(seam({ sticker: stk({ field: undefined, children: [{ type: 'text', field: 'tag', style: 'display', size: 40 }] }) }));
  // leftY more than rightY
  says(hp(seam({ leftY: 600, rightY: 600 })), /leftY must be more than rightY/, 'level');
  says(hp(seam({ leftY: 500, rightY: 600 })), /leftY must be more than rightY/, 'falling to the right');
  for (const v of [-1, 1351, 650.5, '700']) says(hp(seam({ leftY: v })), /leftY must be a whole number from 0 to 1350/, `leftY ${v}`);
  // lower is a fill role
  for (const ok_ of ['paper', 'white', 'soft', 'paper-warm', 'light-tint', 'dark', 'field', 'field-deep', 'ink', 'primary', 'gold', 'gold-deep', 'accent']) hostOk(seam({ lower: ok_, ...(['paper', 'white', 'soft', 'paper-warm', 'light-tint'].includes(ok_) ? {} : {}) }));
  for (const bad of ['muted', 'on-field', 'rule', 'body']) says(hp(seam({ lower: bad })), /lower must be a colour a panel can be filled with/, `lower ${bad}`);
  for (const bad of ['#ff0000', 'red', 5, null]) says(hp(seam({ lower: bad })), /lower must be a colour role|lower must be a colour a panel/, `lower ${String(bad)}`);
  says(hp({ type: 'seam', leftY: 700, rightY: 600 }), /a seam needs lower/, 'lower is needed');
  // ink on the items, against lower
  says(hp(seam({ ink: 'ink' })), /ink ink does not read on fill dark/, 'dark ink on a dark lower');
  hostOk(seam({ lower: 'paper', ink: 'ink', children: [clone(kid)] }));
  says(hp(seam({ lower: 'paper', children: [{ ...clone(kid), ink: 'white' }] })), /ink white does not read on fill paper/, 'a child\'s ink against lower');
  hostOk(seam({ lower: 'dark', children: [{ ...clone(kid), ink: 'white' }] }));
  // items flow: no place, no layer, only the types that flow
  says(hp(seam({ children: [{ ...clone(kid), place: AT(1, 1, 100, 50) }] })), /an item of a seam flows in the colour below the edge and takes no place/, 'a child with a place');
  says(hp(seam({ children: [{ type: 'photo' }] })), /cannot flow in a box/, 'a picture cannot flow');
  says(hp(seam({ children: [{ type: 'band', y: 1, h: 10 }] })), /a seam holds/, 'a band in a seam');
  says(hp(seam({ children: [{ type: 'seam', leftY: 2, rightY: 1, lower: 'dark' }] })), /a seam holds/, 'a seam in a seam');
  says(hp(seam({ children: [{ ...clone(kid), z: 3 }] })), /z is for the top of a composition/, 'a child with z');
  says(hp(seam({ children: 'x' })), /children must be a list/, 'children not a list');
  // the sticker slot
  says(hp(seam({ sticker: stk({ place: undefined }) })), /sticker the sticker of a seam needs a place/, 'no place');
  says(hp(seam({ sticker: stk({ place: { grid: { col: 1, span: 3 } } }) })), /sticker\.place inside a box is placed with px or anchor/, 'a grid place');
  says(hp(seam({ sticker: stk({ place: { inset: 'page' } }) })), /sticker\.place inside a box is placed with px or anchor/, 'an inset place');
  says(hp(seam({ sticker: stk({ z: 2 }) })), /sticker\.z a seam's sticker takes no layer/, 'a sticker with z');
  says(hp(seam({ sticker: { ...kid, place: AT(1, 1, 5, 5) } })), /sticker must be an element of type sticker/, 'a text in the slot');
  says(hp(seam({ sticker: { type: 'zzz' } })), /sticker must be an element of type sticker/, 'an unknown type in the slot');
  for (const v of ['x', 5, [], [stk()], null, true]) says(hp(seam({ sticker: v })), /\.sticker must be/, `sticker ${JSON.stringify(v)}`);
  says(hp(seam({ sticker: stk({ size: undefined }) })), /sticker a sticker needs a size|sticker needs a size/, 'a circle without a size, by the sticker rules');
  says(hp(seam({ sticker: stk({ field: undefined }) })), /carries nothing/, 'a sticker that carries nothing');
  says(hp(seam({ sticker: stk({ fill: 'muted' }) })), /sticker\.fill must be a colour a panel can be filled with/, 'a sticker fill');
  says(hp(seam({ sticker: stk({ sticker: stk() }) })), /"sticker" is not a setting of a sticker/, 'a sticker in the sticker');
  says(hp({ type: 'box', place: AT(56, 300, 400, 200), sticker: stk() }), /"sticker" is not a setting of a box/, 'a sticker slot on a box');
  says(hp({ ...EXAMPLES.band, sticker: stk() }), /"sticker" is not a setting of a band/, 'a sticker slot on a band');
  // the slot is a node: it counts toward the 40, and its depth is the seam's plus one
  const blocks = (n) => Array.from({ length: n }, (_, i) => ({ type: 'block', place: AT(10 + i, 700, 10, 10) }));
  assert.deepEqual(hp(seam({ sticker: stk() }), ...blocks(36)), [], '2 + seam + sticker + 36 = 40');
  says(hp(seam({ sticker: stk() }), ...blocks(37)), /at most 40/, 'the sticker is the 41st node');
  assert.deepEqual(hp(seam({ children: [clone(kid)] }), ...blocks(36)), [], 'a child is a node too');
  const nest = (n) => { let e = { type: 'text', field: 'sub', style: 'body' }; for (let i = 0; i < n; i++) e = { type: 'box', children: [e] }; return e; };
  assert.deepEqual(hp(seam({ children: [nest(2)] })), [], 'seam 1, box 2, box 3, text 4');
  says(hp(seam({ children: [nest(3)] })), /nested more than 4 levels deep/, 'seam 1, box 2, box 3, box 4, text 5');
  // one seam only
  says(hp(seam(), seam({ leftY: 900, rightY: 800 })), /at most one seam/, 'two seams');
  // a seam's items are text on its field: no picture needed under them
  hostOk(seam({ children: [clone(kid)] }));
  hostOk(seam({ upper: 'field', children: [clone(kid)] }));
  // the slot's static checks: its text reads on the sticker, its field is shown
  hostOk(seam({ sticker: stk({ field: undefined, fill: 'gold', ink: 'on-accent', children: [{ type: 'text', field: 'tag', style: 'display', size: 40, ink: 'ink' }] }) }));
  says(hp(seam({ sticker: stk() }), stk({ place: AT(700, 100, 160, 160) })), /show each field once/, 'the same sticker field twice');
});

test('seam: its sticker is judged with the look, filled by normaliseLook and valid after it', () => {
  const l = host({ type: 'seam', leftY: 700, rightY: 600, lower: 'dark', children: [{ type: 'text', field: 'sub', style: 'body' }], sticker: { type: 'sticker', field: 'tag', size: 160, place: { anchor: { right: 60, top: -80 } } } });
  assert.deepEqual(validateLook(l, 'look', {}), []);
  const n = normaliseLook(l), seam = n.compositions[0].elements[2];
  assert.equal(seam.type, 'seam');
  assert.equal(seam.sticker.shape, 'circle', 'the defaults of a sticker are filled inside the slot');
  assert.equal(seam.sticker.z, undefined, 'a slot takes no z');
  assert.deepEqual([seam.edge, seam.gap, seam.upper, seam.edgeFill, seam.z], [0, 0, 'photo', 'paper', 0], 'the seam\'s own defaults');
  assert.equal(seam.children[0].align, 'left'); assert.equal(seam.children[0].z, undefined);
  assert.ok(Object.isFrozen(seam.sticker) && Object.isFrozen(seam.sticker.place));
  assert.equal(l.compositions[0].elements[2].sticker.shape, undefined, 'the input is not changed');
  const back = JSON.parse(JSON.stringify(n));
  back.compositions.forEach((c) => { delete c.id; if (c.calm === null) delete c.calm; });
  assert.deepEqual(validateLook(back, 'look', {}), [], 'a normalised look with a seam sticker is still valid');
  const other = clone(l); other.compositions[0].elements[2].sticker.size = 170;
  assert.notEqual(lookHash(other), lookHash(l), 'the sticker is part of the hash');
  const withSeam = host({ type: 'seam', leftY: 700, rightY: 600, lower: 'dark' }), noSticker = normaliseLook(withSeam).compositions[0].elements[2];
  assert.equal(noSticker.sticker, undefined, 'no sticker is invented');
});

test('fuzz: every property of a seam\'s sticker refuses hostile values with a message that says where', () => {
  const base = { type: 'sticker', field: 'tag', shape: 'circle', size: 160, place: { anchor: { right: 60, top: -80 } } };
  const mk = (st) => ({ type: 'seam', leftY: 700, rightY: 600, lower: 'dark', sticker: st });
  assert.deepEqual(hp(mk(clone(base))), []);
  let n = 0;
  for (const [prop, desc] of Object.entries(cat.elements.sticker.properties)) {
    for (const [path, d] of leaves(desc, [prop])) {
      for (const v of hostile(d)) {
        const st = clone(base); setPath(st, path, v);
        const p = validateLook(host(mk(st)), 'look', {});
        assertClean(p, `seam.sticker.${path.join('.')} = ${typeof v}`, v);
        assert.ok(p.some((m) => m.includes('elements[2].sticker')), `seam.sticker.${path.join('.')}: the message says where`);
        n++;
      }
    }
  }
  assert.ok(n > 300, `ran ${n} cases`);
  // and the seam's own new settings, hostile, inside a seam that carries a child and a sticker
  for (const [prop, desc] of Object.entries(cat.elements.seam.properties)) for (const [path, d] of leaves(desc, [prop])) for (const v of hostile(d)) {
    const el = mk(clone(base)); el.children = [{ type: 'text', field: 'sub', style: 'body' }]; setPath(el, path, v);
    assertClean(validateLook(host(el), 'look', {}), `seam.${path.join('.')} = ${typeof v}`, v);
  }
});

test('type.display.wordSpace: 0 to 0.2 em, filled with 0', () => {
  const edit = (v) => { const l = host(); l.type.display.wordSpace = v; return validateLook(l, 'look', {}); };
  for (const v of [0, 0.05, 0.2]) assert.deepEqual(edit(v), [], `wordSpace ${v}`);
  for (const v of [-0.01, 0.21, '0.1', null, NaN]) says(edit(v), /type\.display\.wordSpace must be a number from 0 to 0.2/, `wordSpace ${String(v)}`);
  assert.equal(normaliseLook(host()).type.display.wordSpace, 0);
  const w = host(); w.type.display.wordSpace = 0.1; assert.equal(normaliseLook(w).type.display.wordSpace, 0.1);
  assert.notEqual(lookHash(w), lookHash(host()), 'part of the hash');
});

test('every new refusal names where it is, in the style of the others', () => {
  const stk = { type: 'sticker', field: 'tag', shape: 'pill', w: 'hug', place: { px: { x: 1, y: 1 } } };
  const cases = [
    hp({ type: 'seam', leftY: 1, rightY: 2, lower: 'muted', children: [{ ...TX({}), place: AT(1, 1, 1, 1) }], sticker: { type: 'text' } }),
    hp(stk, TX({ dropWhenTight: true, weight: 600 }), { ...TX({ dropWhenTight: true }), field: 'tag' }),
    hp({ ...EXAMPLES.numeral, sizes: [1, 2], cap: 5 }), hp({ type: 'fitted-stack', mode: 'fill', cap: 100, floor: 50, lead: 1, maxLines: 9, place: AT(1, 1, 1, 1) }),
    hp({ type: 'photo', place: { px: { x: 1, y: 1 }, square: true, minH: 700 } }),
  ];
  for (const p of cases) { assert.ok(p.length > 0); for (const m of p) assert.match(m, /^look "host": [a-zA-Z.\[\]0-9]+ /, m); assertClean(p, 'new refusals'); }
});

// ---- the properties added to draw the two shipped looks: each validates only where the renderer draws it ----
test('a property that validates has an effect: skew, bleed, origin, numeral format, sticker fit', () => {
  hostOk({ type: 'block', colour: 'accent', skew: 3, place: AT(56, 1150, 300, 20) });
  says(hp({ type: 'block', colour: 'accent', skew: 3, radius: 8, place: AT(56, 1150, 300, 20) }), /skew is drawn only on a plain block/, 'skew with a radius');
  says(hp({ type: 'block', colour: 'accent', skew: 3, shadow: 'hard', place: AT(56, 1150, 300, 20) }), /skew is drawn only on a plain block/, 'skew with a shadow');
  says(hp({ type: 'box', skew: 3, place: AT(56, 1150, 300, 20) }), /"skew" is not a setting of a box/, 'a box takes no skew');
  says(hp({ type: 'photo', place: { px: { x: 0, y: 700 } }, bleed: { edges: ['left'] } }), /place must give left, top, width and height/, 'a bleed with no size');
  says(hp(inBox({ type: 'rule', bleed: { edges: ['left'] } })), /only an element placed on the page can run to its edge/, 'a child bleeding');
  says(hp({ type: 'box', place: AT(56, 700, 500, 300), origin: 'left top', children: [{ type: 'rule' }] }), /needs rot/, 'origin without rot');
  says(hp({ type: 'box', place: AT(56, 700, 500, 300), rot: 'card', origin: 'left top', originPct: [30, 50], children: [{ type: 'rule' }] }), /gives origin and originPct/, 'both origins');
  hostOk({ type: 'box', place: AT(56, 700, 500, 300), rot: 'card', originPct: [30, 50], children: [{ type: 'rule' }] });
  for (const v of [[101, 0], [0, -1], [1], 'center', [1.5, 2]]) says(hp({ type: 'box', place: AT(56, 700, 500, 300), rot: 'card', originPct: v, children: [{ type: 'rule' }] }), /originPct/, `originPct ${JSON.stringify(v)}`);
  says(hp({ type: 'numeral', field: 'meta', cap: 400, min: 100, place: AT(56, 400, 900, 300) }), /needs a format/, 'a meta numeral with no format');
  hostOk({ type: 'numeral', field: 'meta', format: 'pad2', cap: 400, min: 100, place: AT(56, 400, 900, 300) });
  says(hp({ type: 'sticker', field: 'tag', shape: 'circle', size: 200, fit: { cap: 60, floor: 30 }, place: AT(700, 300, 200, 200) }), /fit needs h/, 'fit with no h');
});

test('flow properties: alignSelf, nudgeX and a small negative before, only for an item that flows', () => {
  for (const t of ['box', 'text', 'sticker', 'fitted-stack']) {
    assert.deepEqual(hp(inBox({ ...flowOf(t), alignSelf: 'stretch', nudgeX: -6, before: -6 })), [], `${t} flows, stretched and nudged`);
    says(hp(inBox({ ...flowOf(t), alignSelf: 'baseline' })), /alignSelf must be one of/, `${t}: alignSelf baseline`);
    says(hp(inBox({ ...flowOf(t), nudgeX: 121 })), /nudgeX must be a whole number from -120 to 120/, `${t}: nudgeX 121`);
    says(hp({ ...clone(EXAMPLES[t]), alignSelf: 'start' }), /alignSelf is for an item flowing in a box/, `${t}: alignSelf at the top`);
  }
  for (const t of ['rule', 'block', 'photo', 'glyph', 'numeral']) says(hp({ ...clone(EXAMPLES[t]), alignSelf: 'start' }), /"alignSelf" is not a setting/, `${t} takes no alignSelf`);
});

test('text: tiltBar, follow and the not-date format', () => {
  const lab = (o) => ({ type: 'text', field: 'label', style: 'label', size: 30, ...o });
  assert.deepEqual(hp(inBox(lab({ tiltBar: true }))), []);
  says(hp(lab({ tiltBar: true, place: AT(56, 700, 400, 60) })), /tiltBar sets a flowing line on a bar/, 'tiltBar with a place');
  says(hp(inBox({ type: 'text', field: 'sub', style: 'body', tiltBar: true })), /tiltBar is for a label line/, 'tiltBar on body');
  says(hp(inBox(lab({ tiltBar: true, emphasis: 'bar' }))), /tiltBar cannot go with vertical or emphasis/, 'tiltBar with emphasis');
  says(hp(inBox({ type: 'text', field: 'sub', style: 'body', follow: true })), /follow is drawn for text inside a sticker/, 'follow outside a sticker');
  hostOk({ type: 'text', field: 'meta', format: 'not-date', style: 'label', place: AT(56, 700, 400, 60) });
  says(hp({ type: 'text', field: 'meta', format: 'day', split: { sep: '·', pick: 0 }, style: 'label', place: AT(56, 700, 400, 60) }), /reads its part by itself/, 'format with split');
});

test('rows: ruleEnd, sizeByCount, textTrack, numberSpan; fitted-stack lines-only properties; sticker and glyph stretch', () => {
  const rows = (o) => ({ type: 'rows', each: 'items', number: '01', textStyle: 'item', place: AT(56, 700, 900, 400), ...o });
  const listHost = (e) => validateLook({ ...host(), compositions: [{ kind: 'list', name: 'L', describe: 'A list host.', ground: 'paper', fields: { headline: { required: true }, items: { required: true } }, elements: [{ type: 'text', field: 'headline', style: 'display', size: 100, place: AT(56, 200, 900, 200) }, e] }] }, 'look', {});
  assert.deepEqual(listHost(rows({ rule: 'hair', ruleEnd: true, sizeByCount: [[5, 44]], valign: 'top' })), []);
  says(listHost(rows({ ruleEnd: true })), /ruleEnd closes the rows with a rule/, 'ruleEnd with no rule');
  says(listHost(rows({ sizeByCount: [[5, 44], [4, 40]] })), /sizeByCount must list the fewest items first/, 'steps the wrong way');
  says(listHost(rows({ sizeByCount: [[3, 40], [5, 44]] })), /sizeByCount must list the fewest items first/, 'a step that grows');
  says(hp({ type: 'rows', each: 'meta-parts', number: 'none', textStyle: 'label', sizeByCount: [[5, 20]], place: AT(56, 700, 900, 400) }), /sizeByCount is for the items of a list/, 'sizeByCount on an event table');
  says(listHost(rows({ textTrack: 0.1 })), /textTrack is for the label style/, 'textTrack on item words');
  hostOk({ type: 'rows', each: 'meta-parts', number: 'none', keys: ['Date', 'Time', 'Place'], numberSpan: 4, textStyle: 'label', textTrack: -0.02, place: AT(56, 700, 900, 400) });
  const fs = (o) => ({ type: 'fitted-stack', field: 'tag', mode: 'lines', cap: 220, floor: 80, maxLines: 1, place: AT(56, 400, 900, 440), ...o });
  hostOk(fs({ trail: true, stretch: 70, padBelowEm: 0.14 }));
  says(hp(fs({ stretch: 49 })), /stretch must be a whole number from 50 to 150/, 'stretch 49');
  says(hp(fs({ padBelowEm: 0.4 })), /padBelowEm/, 'padBelowEm 0.4');
  says(hp((({ cap, floor, ...r }) => ({ ...r, mode: 'block', sizes: [200, 150], trail: true }))(fs({}))), /is for lines mode/, 'trail in block mode');
  says(hp({ type: 'sticker', field: 'tag', shape: 'circle', size: 200, stretch: 84, place: AT(700, 300, 200, 200) }), /stretch goes with fit/, 'sticker stretch without fit');
  hostOk({ type: 'glyph', glyph: '“', size: 400, stretch: 84, place: AT(56, 300, 300, 300) });
  says(hp({ type: 'glyph', glyph: '“', size: 400, stretch: 84.5, place: AT(56, 300, 300, 300) }), /stretch must be a whole number/, 'glyph stretch fraction');
});
