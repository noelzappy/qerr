// node --test   (the catalogue Settings, Layouts is driven by, layoutCatalogue(), and the validator agree: everything the catalogue
// offers a brand's layout on each page kind is accepted, values just outside its bounds and lists are refused, and what it leaves
// out (block types, options, bindings, condition choices, grounds, sizes) is refused too, so the editor can neither offer what the
// engine refuses nor miss anything it accepts.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, CHOICE_NAMES, FIELDS, FIELD_NAMES, PAGE_KINDS, layoutCatalogue, layoutDesignProblems, sampleDesign, validateLayout } from './lib/design/layout.mjs';
import { STARTER_LAYOUTS, builtinCopy, builtinLayouts } from './lib/design/layout-starters.mjs';

const cat = layoutCatalogue();
const PAGES = Object.keys(cat.pages);
const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20 };
// A minimal valid layout on a page kind: a headline (showing "headline") in the top rows, or at a rectangle near the top.
const base = (page) => ({
  id: 'cat-test', name: 'Catalogue test', ...(page === 'grid' ? {} : { page }), fields: { headline: {} }, canvas: { feed: structuredClone(GRID) },
  blocks: [page === 'grid' ? { type: 'headline', slot: { col: 1, row: 1, width: 12, height: 4 } } : { type: 'headline', px: { x: 80, y: 160, w: 920, h: 200 } }],
});
const ok = (l, what) => assert.deepEqual(validateLayout(l), [], `${what}: ${JSON.stringify(l.blocks.slice(1))}`);
const refused = (l, what) => assert.notDeepEqual(validateLayout(l), [], `${what} should be refused: ${JSON.stringify(l.blocks.slice(1))}`);
// A field of a kind a block may show that the base layout does not use yet (so it is shown once).
const freeField = (fields, layout) => fields.find((f) => !layout.fields[f]) ?? fields[0];
const SECOND = { x: 80, y: 600, w: 920, h: 300 };

// The block of a type placed where nothing else is, with the field it shows declared.
function withBlock(page, type, extra = {}) {
  const l = base(page), spec = cat.pages[page].blocks[type];
  const b = { type };
  if (spec.fullWidth) { b.px = { x: 0, y: 900, w: 1080, h: 450 }; Object.assign(b, spec.fullWidth); }
  else if (!spec.chrome) {
    if (page === 'grid') b.slot = { col: 1, row: 10, width: 12, height: 6 };
    else b.px = { ...SECOND };
  }
  if (type === 'label') b.text = 'Words';
  else if (spec.kinds.length) { b.field = freeField(spec.fields, l); l.fields[b.field] = {}; }
  if (spec.children) b.children = [];
  Object.assign(b, extra);
  l.blocks.push(b);
  return { l, b };
}
// Satisfies what an option or a binding needs: the option value, or a binding filled in with a free declared field.
function satisfy(l, page, b, needs) {
  for (const [k, v] of Object.entries(needs ?? {})) {
    if (v === true) { const f = freeField(cat.pages[page].blocks[b.type].bindings[k].fields, l); b[k] = f; l.fields[f] = {}; }
    else b[k] = v;
  }
}
const valuesOf = (o) => (o.type === 'enum' ? o.values : o.type === 'bool' ? [true, false] : [o.min, o.max, o.default]);
const outside = (o) => (o.type === 'enum' ? ['not-a-value', ...(typeof o.values[0] === 'number' ? [Math.max(...o.values) + 1] : [])] : o.type === 'bool' ? ['yes', 1] : [o.min - 1, o.max + 1, o.min + 0.5]);

test('the catalogue describes every page kind a brand may use, and the validator refuses the others', () => {
  assert.deepEqual(PAGES, ['grid', 'poster', 'editorial']);
  for (const p of PAGE_KINDS.filter((x) => !PAGES.includes(x))) refused({ ...base('poster'), page: p }, `page ${p}`);
  for (const p of PAGES) ok(base(p), p);
  // the grid page's blocks are the AI's list, as before
  assert.deepEqual(Object.keys(cat.pages.grid.blocks), Object.keys(cat.blocks));
});

test('every block type of every page is accepted there, and every other block type is refused', () => {
  for (const p of PAGES) {
    for (const t of Object.keys(cat.pages[p].blocks)) ok(withBlock(p, t).l, `${p} ${t}`);
    for (const t of Object.keys(BLOCKS).filter((x) => !(x in cat.pages[p].blocks))) {
      const l = base(p);
      l.blocks.push(p === 'grid' ? { type: t, slot: { col: 1, row: 10, width: 12, height: 6 } } : BLOCKS[t].chrome ? { type: t } : { type: t, px: { ...SECOND } });
      refused(l, `${p} ${t}`);
    }
  }
});

test('every option the catalogue offers takes every value it lists, and nothing just outside its list or bounds', () => {
  let n = 0;
  for (const p of PAGES) for (const [t, spec] of Object.entries(cat.pages[p].blocks)) {
    for (const [k, o] of Object.entries(spec.options)) {
      for (const v of [...valuesOf(o), ...Object.keys(o.aliases ?? {})]) {
        const { l, b } = withBlock(p, t);
        satisfy(l, p, b, o.needs);
        b[k] = v;
        // a value an option is pinned to elsewhere (the full-width panel's kind) is checked with its own rule below
        if (spec.fullWidth && k in spec.fullWidth && v !== spec.fullWidth[k]) continue;
        // a framed photo cannot bleed: only shown when it does not
        ok(l, `${p} ${t}.${k} = ${v}`);
        n++;
      }
      for (const v of outside(o)) {
        const { l, b } = withBlock(p, t);
        satisfy(l, p, b, o.needs);
        b[k] = v;
        refused(l, `${p} ${t}.${k} = ${v}`);
      }
      // an option used only with another setting is refused without it
      for (const [dep, want] of Object.entries(o.needs ?? {})) {
        const { l, b } = withBlock(p, t);
        b[k] = o.default;
        if (want !== true) { const other = spec.options[dep]?.values.find((x) => x !== want); if (other === undefined) continue; b[dep] = other; }
        refused(l, `${p} ${t}.${k} without ${dep}`);
      }
    }
  }
  assert.ok(n > 150, `${n} values checked`);
});

test('every option the catalogue leaves out of a page is refused there (none the validator accepts is missing)', () => {
  for (const p of PAGES) for (const [t, spec] of Object.entries(cat.pages[p].blocks)) {
    for (const [k, o] of Object.entries(BLOCKS[t].options)) {
      if (k in spec.options) continue;
      const { l, b } = withBlock(p, t);
      if (o.needs) for (const [dep, want] of Object.entries(o.needs)) b[dep] = want === true ? 'sub' : want;
      b[k] = o.def;
      refused(l, `${p} ${t}.${k} (not offered)`);
    }
    for (const k of ['text', 'source', 'titleField', 'subField']) {
      if (k in spec.bindings || (t === 'label' && k !== 'titleField' && k !== 'subField')) continue;
      const { l, b } = withBlock(p, t);
      b[k] = k === 'source' ? 'series' : k === 'text' ? 'Words' : 'note';
      l.fields.note = {};
      refused(l, `${p} ${t}.${k} (not offered)`);
    }
  }
});

test('what a block shows: every field it may show, and its bindings, exactly as offered', () => {
  for (const p of PAGES) for (const [t, spec] of Object.entries(cat.pages[p].blocks)) {
    if (spec.kinds.length && t !== 'label') {
      for (const f of spec.fields) {
        const { l, b } = withBlock(p, t);
        if (f === 'headline') { l.blocks[0].field = 'quote'; l.fields.quote = {}; }
        delete l.fields[b.field];
        b.field = f;
        l.fields[f] = {};
        ok(l, `${p} ${t} shows ${f}`);
      }
      for (const f of FIELD_NAMES.filter((x) => !spec.fields.includes(x))) {
        const { l, b } = withBlock(p, t);
        b.field = f;
        l.fields[f] = {};
        refused(l, `${p} ${t} shows ${f}`);
      }
    }
    for (const [k, bind] of Object.entries(spec.bindings)) {
      if (bind.fields) {
        for (const f of bind.fields) {
          const { l, b } = withBlock(p, t);
          satisfy(l, p, b, bind.needs);
          if (b.field === f || l.blocks[0].field === f || (f === 'headline' && !l.blocks[0].field)) continue;
          b[k] = f;
          l.fields[f] = {};
          ok(l, `${p} ${t}.${k} = ${f}`);
        }
        const { l, b } = withBlock(p, t);
        satisfy(l, p, b, bind.needs);
        b[k] = 'image';
        l.fields.image = {};
        refused(l, `${p} ${t}.${k} = image`);
      }
    }
  }
  // a label's words: one of a field, fixed words (up to the catalogue's length) or a source
  const label = cat.pages.grid.blocks.label;
  for (const f of label.fields) { const { l, b } = withBlock('grid', 'label'); delete b.text; b.field = f; l.fields[f] = {}; ok(l, `label field ${f}`); }
  for (const s of label.bindings.source.values) { const { l, b } = withBlock('grid', 'label'); delete b.text; b.source = s; ok(l, `label source ${s}`); }
  ok(withBlock('grid', 'label', { text: 'x'.repeat(label.bindings.text.max) }).l, 'label text at its length');
  refused(withBlock('grid', 'label', { text: 'x'.repeat(label.bindings.text.max + 1) }).l, 'label text past its length');
  refused(withBlock('grid', 'label', { source: 'nope' }).l, 'label with two ways');
  { const { l, b } = withBlock('grid', 'label'); delete b.text; b.source = 'nope'; refused(l, 'label source nope'); }
});

test('slab children: every child type the catalogue lists, with its options, and nothing else', () => {
  for (const p of PAGES) for (const [t, spec] of Object.entries(cat.pages[p].blocks)) {
    if (!spec.children) continue;
    for (const c of spec.children) {
      const cs = cat.pages[p].blocks[c];
      assert.ok(cs.child, `${p} ${c} is a child type`);
      const child = { type: c };
      const { l, b } = withBlock(p, t);
      if (c === 'label') child.text = 'Tag';
      else if (cs.kinds.length) { child.field = freeField(cs.fields, l); l.fields[child.field] = {}; }
      b.children = [child];
      ok(l, `${p} ${t} holds ${c}`);
      for (const [k, o] of Object.entries(cs.options)) {
        const offered = spec.children && cs.childOptions.includes(k);
        b.children = [{ ...child, [k]: o.default }];
        if (offered && !o.needs) ok(l, `${p} ${t} > ${c}.${k}`);
        if (!offered) refused(l, `${p} ${t} > ${c}.${k} (not inside a slab)`);
      }
      b.children = [{ ...child, when: { present: child.field ?? 'headline' } }];
      refused(l, `${p} ${t} > ${c} with a condition`);
      b.children = [{ ...child, slot: { col: 1, row: 1, width: 1, height: 1 } }];
      refused(l, `${p} ${t} > ${c} with a slot`);
    }
    for (const c of Object.keys(BLOCKS).filter((x) => !spec.children.includes(x))) {
      const { l, b } = withBlock(p, t);
      b.children = [{ type: c }];
      refused(l, `${p} ${t} holds ${c}`);
    }
    const { l, b } = withBlock(p, t);
    b.children = Array.from({ length: cat.limits.children + 1 }, () => ({ type: 'sub', field: 'sub' }));
    refused(l, `${p} ${t} with too many children`);
  }
});

test('conditions: every form and choice the catalogue offers is accepted, the other choices and values are refused', () => {
  for (const p of PAGES) {
    const C = cat.pages[p].conditions;
    const cond = (when, fields = {}) => { const { l } = withBlock(p, 'sub'); Object.assign(l.fields, fields); l.blocks[1].when = when; return l; };
    ok(cond({ present: 'sub' }), `${p} present`);
    ok(cond({ absent: 'headline' }), `${p} absent`);
    refused(cond({ present: 'quote' }), `${p} present of an undeclared field`);
    for (const v of C.pages) ok(cond({ page: v }), `${p} page ${v}`);
    refused(cond({ page: 'second' }), `${p} page second`);
    for (const [name, ch] of Object.entries(C.choices)) {
      const fields = ch.declared ? { [name]: {} } : {};
      // a declared choice field must be shown: an artefact block where nothing else is
      const l0 = (when) => { const l = cond(when, fields); if (ch.declared) l.blocks.push(p === 'grid' ? { type: name, slot: { col: 1, row: 17, width: 12, height: 6 } } : { type: name, px: { x: 70, y: 950, w: 900, h: 300 } }); return l; };
      for (const v of ch.values) { ok(l0({ field: name, is: v }), `${p} ${name} is ${v}`); ok(l0({ field: name, not: v }), `${p} ${name} not ${v}`); }
      ok(l0({ field: name, is: ch.values }), `${p} ${name} is all`);
      refused(l0({ field: name, is: 'nope' }), `${p} ${name} is nope`);
      refused(l0({ field: name, is: [ch.values[0], ch.values[0]] }), `${p} ${name} twice`);
      refused(l0({ field: name, is: ch.values[0], not: ch.values[0] }), `${p} ${name} is and not`);
      refused(l0({ field: name }), `${p} ${name} without is`);
      ok(l0({ present: 'sub', page: 'single', field: name, is: ch.values[0] }), `${p} all keys together`);
      if (ch.declared) refused(cond({ field: name, is: ch.values[0] }), `${p} ${name} undeclared`);
    }
    for (const name of CHOICE_NAMES.filter((x) => !(x in C.choices))) {
      const values = (FIELDS[name] ? ['ledger'] : [true, 'phone', 'top', 'black', 'center', 84, 'facebook']);
      for (const v of values) refused(cond({ field: name, is: v }, FIELDS[name] ? { [name]: {} } : {}), `${p} ${name} (not offered)`);
    }
    assert.deepEqual(C.keys, ['present', 'absent', 'page', 'field', 'is', 'not']);
  }
});

test('page colours: every ground the catalogue offers, its older names, ground cases up to the limit, and nothing else', () => {
  for (const p of PAGES) {
    const P = cat.pages[p];
    for (const g of [...P.grounds, ...Object.keys(cat.groundAliases)]) {
      let l = base(p);
      if (g === 'photo') l = withBlock(p, 'photo').l;
      l.ground = g;
      ok(l, `${p} ground ${g}`);
    }
    for (const g of ['nope', 'panel', 'card', ...(P.photoGround ? [] : ['photo'])]) refused({ ...base(p), ground: g }, `${p} ground ${g}`);
    if (P.photoGround) refused({ ...base(p), ground: 'photo' }, `${p} photo ground without the image field`);
    const cases = (n) => [...Array.from({ length: n - 1 }, (_, i) => ({ when: { page: P.conditions.pages[i % 3] }, ground: P.grounds[(i + 1) % P.grounds.length] === 'photo' ? 'dark' : P.grounds[(i + 1) % P.grounds.length] })), { ground: 'light' }];
    for (let n = 1; n <= cat.limits.groundCases; n++) ok({ ...base(p), ground: cases(n) }, `${p} ${n} ground cases`);
    refused({ ...base(p), ground: cases(cat.limits.groundCases + 1) }, `${p} too many ground cases`);
    refused({ ...base(p), ground: [] }, `${p} no ground cases`);
    refused({ ...base(p), ground: [{ when: { present: 'headline' }, ground: 'dark' }] }, `${p} last case with a condition`);
    refused({ ...base(p), ground: [{ ground: 'dark' }, { ground: 'light' }] }, `${p} first case without a condition`);
    for (const name of Object.keys(P.conditions.choices)) {
      const l = withBlock(p, 'sub').l;
      if (P.conditions.choices[name].declared) { l.fields[name] = {}; l.blocks.push(p === 'grid' ? { type: name, slot: { col: 1, row: 17, width: 12, height: 6 } } : { type: name, px: { x: 70, y: 950, w: 900, h: 300 } }); }
      l.ground = [{ when: { field: name, is: P.conditions.choices[name].values[0] }, ground: 'dark' }, { ground: 'light' }];
      ok(l, `${p} ground case on ${name}`);
    }
  }
});

test('fields: every rule the catalogue offers, at its bounds and just outside them', () => {
  const shows = { text: 'sub', short: 'sub', stats: 'stats', items: 'list', image: 'photo', artefact: 'artefact' };
  const withField = (f, rule) => { const { l, b } = withBlock('grid', shows[FIELDS[f].kind]); delete l.fields[b.field]; b.field = f; if (f === 'headline') { l.blocks[0].field = 'quote'; l.fields.quote = {}; } l.fields[f] = rule; return l; };
  for (const [f, F] of Object.entries(cat.fields)) {
    const R = F.rules;
    ok(withField(f, {}), `${f} {}`);
    for (const v of [true, false]) ok(withField(f, { required: v }), `${f} required ${v}`);
    refused(withField(f, { required: 'yes' }), `${f} required yes`);
    for (const k of ['min', 'max']) {
      if (!R[k]) { refused(withField(f, { [k]: 1 }), `${f}.${k} (not offered)`); continue; }
      ok(withField(f, { [k]: R[k].min }), `${f}.${k} at its least`);
      // (min is at most the field's max, its own or the catalogue's default)
      ok(withField(f, { [k]: R[k].max, ...(k === 'min' ? { max: R.max.max } : {}) }), `${f}.${k} at its most`);
      refused(withField(f, { [k]: R[k].min - 1 }), `${f}.${k} under`);
      refused(withField(f, { [k]: R[k].max + 1 }), `${f}.${k} over`);
    }
    if (R.min && R.max) refused(withField(f, { min: R.max.max, max: 1 }), `${f} min over max`);
    if (R.types) {
      for (const t of R.types) ok(withField(f, { types: [t] }), `${f} types ${t}`);
      ok(withField(f, { types: R.types }), `${f} every type`);
      refused(withField(f, { types: [] }), `${f} no types`);
      refused(withField(f, { types: ['nope'] }), `${f} types nope`);
    } else refused(withField(f, { types: ['ledger'] }), `${f}.types (not offered)`);
  }
  assert.deepEqual(Object.keys(cat.fields), FIELD_NAMES);
});

test('sizes, grids and pixel rectangles: the limits the catalogue gives, on every page', () => {
  const G = cat.grid;
  for (const p of PAGES) {
    for (const z of Object.keys(cat.sizes)) {
      const min = cat.sizes[z].minMargins;
      const one = { columns: 4, rows: 4, margin: { ...min }, gutter: 0 };
      const l = { ...base(p), canvas: { [z]: one } };
      l.blocks = [p === 'grid' ? { type: 'headline', slot: { col: 1, row: 1, width: 1, height: 1 } } : { type: 'headline', px: { x: min.left, y: min.top, w: 400, h: 100 } }];
      if (cat.pages[p].sizes.includes(z)) ok(l, `${p} ${z} at the least margins`);
      else { refused(l, `${p} ${z} (not offered)`); continue; }
      for (const e of ['top', 'right', 'bottom', 'left']) refused({ ...l, canvas: { [z]: { ...one, margin: { ...min, [e]: min[e] - 1 } } } }, `${p} ${z} margin ${e} under`);
      for (const [k, [lo, hi]] of [['columns', G.columns], ['rows', G.rows], ['gutter', G.gutter], ['rowGutter', G.gutter]]) {
        const big = { ...one, margin: { ...min } };
        if (k === 'columns' || k === 'rows') { ok({ ...l, canvas: { [z]: { ...big, [k]: lo } } }, `${p} ${z} ${k} ${lo}`); refused({ ...l, canvas: { [z]: { ...big, [k]: hi + 1 } } }, `${p} ${z} ${k} ${hi + 1}`); refused({ ...l, canvas: { [z]: { ...big, [k]: lo - 1 } } }, `${p} ${z} ${k} ${lo - 1}`); }
        else { ok({ ...l, canvas: { [z]: { ...big, [k]: hi } } }, `${p} ${z} ${k} ${hi}`); refused({ ...l, canvas: { [z]: { ...big, [k]: hi + 1 } } }, `${p} ${z} ${k} ${hi + 1}`); }
      }
      // margins as one number: the largest minimum on every side
      ok({ ...l, canvas: { [z]: { ...one, margin: Math.max(...Object.values(min)) } } }, `${p} ${z} one margin`);
      refused({ ...l, canvas: { [z]: { ...one, margin: G.margin[1] + 1 } } }, `${p} ${z} margin past the limit`);
      // pixel rectangles: a picture may take the whole page; text keeps inside the minimum margins
      const S = cat.sizes[z], X = S.px;
      const pic = (px) => ({ ...l, blocks: [...l.blocks, { type: 'decoration', kind: 'glow', px }] });
      ok(pic({ x: X.x[0], y: X.y[0], w: X.w[1], h: X.h[1] }), `${p} ${z} px the whole page`);
      refused(pic({ x: 1, y: 0, w: X.w[1], h: 10 }), `${p} ${z} px past the width`);
      refused(pic({ x: 0, y: 1, w: 10, h: X.h[1] }), `${p} ${z} px past the height`);
      refused(pic({ x: X.x[0] - 1, y: 0, w: 10, h: 10 }), `${p} ${z} px x under`);
      refused(pic({ x: 0, y: 0, w: X.w[0] - 1, h: 10 }), `${p} ${z} px w under`);
      const text = (px) => ({ ...l, blocks: [{ ...l.blocks[0], slot: undefined, px }] });
      ok(text({ x: min.left, y: min.top, w: S.w - min.left - min.right, h: S.h - min.top - min.bottom }), `${p} ${z} text px inside the margins`);
      refused(text({ x: min.left - 1, y: min.top, w: 100, h: 100 }), `${p} ${z} text px over the margin`);
    }
    refused({ ...base(p), canvas: { profile: { columns: 4, rows: 4, margin: 0 } } }, `${p} a cover size`);
  }
  for (const z of cat.pages.grid.sizes) {
    // a slot per size, and a slot of one size for every size
    const l = { ...base('grid'), canvas: Object.fromEntries(cat.pages.grid.sizes.map((s) => [s, { columns: 4, rows: 4, margin: { ...cat.sizes[s].minMargins } }])) };
    l.blocks = [{ type: 'headline', slot: Object.fromEntries(cat.pages.grid.sizes.map((s) => [s, { col: 1, row: s === z ? 2 : 1, width: 4, height: 2 }])) }];
    ok(l, `slot per size (${z} moved)`);
  }
});

test('the layout itself: the name, description, accent and texture the catalogue allows, and just past them', () => {
  const L = cat.layout;
  ok({ ...base('grid'), name: 'n'.repeat(L.name.max) }, 'name at its length');
  refused({ ...base('grid'), name: 'n'.repeat(L.name.max + 1) }, 'name past its length');
  ok({ ...base('grid'), description: 'd'.repeat(L.description.max) }, 'description at its length');
  refused({ ...base('grid'), description: 'd'.repeat(L.description.max + 1) }, 'description past its length');
  ok({ ...base('grid'), id: 'a'.repeat(L.id.max) }, 'id at its length');
  refused({ ...base('grid'), id: 'a'.repeat(L.id.max + 1) }, 'id past its length');
  assert.ok(new RegExp(L.id.pattern).test('my-layout-2') && !new RegExp(L.id.pattern).test('My layout'));
  for (const a of L.accents) ok({ ...base('grid'), accent: a }, `accent ${a}`);
  refused({ ...base('grid'), accent: 'loud' }, 'accent loud');
  for (const t of cat.textures) ok({ ...base('grid'), texture: t }, `texture ${t}`);
  refused({ ...base('grid'), texture: 'waves' }, 'texture waves');
});

test('every starter and every built-in layout a brand may copy uses only what the catalogue offers', () => {
  const copies = builtinLayouts().filter((b) => b.copyable).map((b) => builtinCopy(b.layout.id));
  for (const l of [...STARTER_LAYOUTS, ...copies]) {
    const P = cat.pages[l.page ?? 'grid'];
    assert.ok(P, l.id);
    const check = (b, child) => {
      const s = P.blocks[b.type];
      assert.ok(s, `${l.id} ${b.type}`);
      for (const [k, v] of Object.entries(b)) {
        if (['type', 'slot', 'px', 'when', 'field', 'bleed', 'children'].includes(k)) continue;
        if (k in s.bindings) continue;
        const o = s.options[k];
        assert.ok(o && (!child || s.childOptions.includes(k)), `${l.id} ${b.type}.${k}`);
        if (o.type === 'enum') assert.ok(o.values.includes(v) || Object.hasOwn(o.aliases ?? {}, v), `${l.id} ${b.type}.${k} = ${v}`);
      }
      for (const c of b.children ?? []) { assert.ok(s.children.includes(c.type), `${l.id} ${b.type} > ${c.type}`); check(c, true); }
    };
    l.blocks.forEach((b) => check(b, false));
  }
});

test('a preview\'s sample artefact is of the type asked for, when the layout takes it', () => {
  const l = withBlock('grid', 'artefact').l;
  assert.equal(sampleDesign(l).artefact.type, 'register');
  for (const t of ['ledger', 'passbook', 'register']) {
    const d = sampleDesign(l, { artefact: t });
    assert.equal(d.artefact.type, t);
    assert.deepEqual(layoutDesignProblems(d, 'd', { layouts: [l] }), [], t);
  }
  l.fields.artefact = { types: ['passbook'] };
  assert.equal(sampleDesign(l, { artefact: 'ledger' }).artefact.type, 'passbook', 'a type the layout does not take is not used');
  assert.equal(sampleDesign(l, { artefact: '__proto__' }).artefact.type, 'passbook');
});
