// A brand with a design direction (brand.json style.direction) designs its images with ONE template, `post`, and says what each
// post is (its kind); the direction decides how it is drawn. This file reads the kinds, fields and word budgets from the
// engine's own registry (lib/design/directions, lib/design/post-spec.mjs), so the model is told exactly what the renderer will
// accept and nothing is written twice. The compositions' budgets are the most characters per field they are designed for.
import { DIRECTIONS } from '@vesk/engine/design/tokens';
import { INFO_KEYS, INLINE, POST_FIELDS, POST_ITEMS, POST_KINDS, POST_LISTS, POST_REQUIRED } from '@vesk/engine/design/post-spec';
import { ICON_NAMES } from '@vesk/engine/design/icons';
import { CHART_HIGHLIGHTS, CHART_UNITS, POST_CHART, SHARE_KINDS } from '@vesk/engine/design/chart';

// What one entry of an info block or a row of round pictures looks like, for the model.
export const LIST_SHAPES = {
  info: `[{ "key": one of ${INFO_KEYS.join(', ')} (each once), "value": one line }]`,
  gallery: '[{ "image": "vault:<id of a photo>", "caption": one line, optional (a name or a product) }]',
};
// What a chart looks like, for the model: its kind (one the design draws), its points, the unit its numbers are written in, the point to
// highlight; a donut or progress bar is one point and its total.
export const CHART_SHAPE = `{ "kind": one of the listed kinds, "series": [{ "label": one line of up to ${POST_CHART.label} characters, optional, "value": a number }], "unit": one of ${CHART_UNITS.join(', ')}, "highlight": the index of a point or one of ${CHART_HIGHLIGHTS.join(', ')}, optional; for ${SHARE_KINDS.join(' or ')}: one point and "total" (what the value is a share of; leave it out for a percentage of 100) }`;
// Whether any composition of a kind in a look draws its headline's pills or icons (a headline text with `pills` / `icons`).
function inlineOf(look, kind) {
  const out = { pills: false, icons: false };
  const walk = (list) => { for (const e of Array.isArray(list) ? list : []) { if (e && e.type === 'text' && e.field === 'headline') { if (e.pills) out.pills = true; if (e.icons) out.icons = true; } walk(e?.children); } };
  for (const c of Array.isArray(look?.compositions) ? look.compositions : []) if (c?.kind === kind) walk(c.elements);
  return out;
}
import { compositionsFor, lookBrief, lookOfBrand } from '@vesk/engine/design/directions/index';

// The brand's direction, or null (no direction, or one the engine does not know).
// A look written as data (brand.looks) that style.direction names is a direction too: its id is returned.
export const directionOf = (brand) => (DIRECTIONS.includes(brand?.style?.direction) || lookOfBrand(brand) ? brand.style.direction : null);

// The fields that take the `*emphasis*` marker.
export const EMPHASIS_FIELDS = Object.entries(POST_FIELDS).filter(([, f]) => f.emphasis).map(([k]) => k).concat('quote');

// THE ADAPTER: the one place that reads the engine for what a direction can draw. Today it reads the directions registry
// (lib/design/directions + post-spec.mjs); to read it from the looks instead, point this one function at `lookBrief` in
// lib/design/look.mjs and return the same shape: { [kind]: { required: [fields], fields: { field: { max, budget? } | { min, max, chars } | {} } } },
// leaving out every kind with nothing to draw it. Nothing below knows where the description comes from.
// With no `variant` the engine may pick any composition of a kind, so a field's budget is the smallest any composition draws it with.
function describeKinds(direction, brand) {
  const own = lookOfBrand(brand);
  if (own && brand?.style?.direction === direction) return describeLook(own);
  const out = {};
  for (const kind of POST_KINDS) {
    const comps = compositionsFor(direction, kind);
    if (!comps.length) continue;
    const required = POST_REQUIRED[kind] ?? [];
    const names = new Set(required);
    for (const c of comps) for (const f of c.fields) names.add(f);
    const fields = {};
    for (const f of names) {
      if (f === 'image' || f === 'focal' || f === 'zoom') { fields[f] = {}; continue; }
      if (f === 'items') { fields[f] = { min: POST_ITEMS.min, max: POST_ITEMS.max, chars: Math.min(POST_ITEMS.chars, ...comps.filter((c) => c.fields.includes(f)).map((c) => c.words?.items ?? POST_ITEMS.chars)) }; continue; }
      const hard = POST_FIELDS[f]?.max;
      if (!hard) continue;
      const drawn = comps.filter((c) => c.fields.includes(f)).map((c) => c.words?.[f] ?? hard);
      fields[f] = { max: hard, ...(drawn.length ? { budget: Math.min(hard, ...drawn) } : {}) };
    }
    out[kind] = { required, fields };
  }
  return out;
}

// A look written as data (brand.looks, the one style.direction names): every kind it has a composition for, each with its VARIANTS (the
// index a post may name as `variant`), what each draws and its own word budgets. `fields` is what the kind takes in any variant; its budget is
// the smallest any variant draws it with (a post that names no variant must fit that).
function describeLook(look) {
  const out = {};
  const brief = lookBrief(look);
  for (const kind of POST_KINDS) {
    const vs = brief.kinds[kind]?.variants ?? [];
    if (!vs.length) continue;
    const inline = inlineOf(look, kind);
    const required = POST_REQUIRED[kind] ?? [];
    const names = new Set(required);
    for (const v of vs) for (const f of Object.keys(v.fields)) names.add(f);
    const fields = {};
    for (const f of names) {
      if (f === 'image' || f === 'focal' || f === 'zoom') { fields[f] = {}; continue; }
      const have = vs.filter((v) => v.fields[f]);
      if (f === 'items') { fields[f] = { min: Math.min(...have.map((v) => v.fields.items.min ?? POST_ITEMS.min)), max: Math.max(...have.map((v) => v.fields.items.max ?? POST_ITEMS.max)), chars: POST_ITEMS.chars }; continue; }
      // an info block (labelled rows) and a row of round pictures: counted lists, each with its own shape (LIST_SHAPES)
      // a chart: the kinds its designs draw, its point counts and the shape of its data
      if (f === 'chart') { fields[f] = { kinds: [...new Set(have.flatMap((v) => v.fields.chart.kinds ?? []))], min: Math.min(...have.map((v) => v.fields.chart.min ?? POST_CHART.min)), max: Math.max(...have.map((v) => v.fields.chart.max ?? POST_CHART.max)), chars: POST_CHART.label, shape: CHART_SHAPE }; continue; }
      if (f === 'info' || f === 'gallery') { const L = POST_LISTS[f]; fields[f] = { min: Math.min(...have.map((v) => v.fields[f].min ?? L.min)), max: Math.max(...have.map((v) => v.fields[f].max ?? L.max)), chars: f === 'info' ? L.value : L.caption, shape: LIST_SHAPES[f] }; continue; }
      const hard = POST_FIELDS[f]?.max;
      if (!hard) continue;
      fields[f] = { max: hard, ...(have.length ? { budget: Math.min(hard, ...have.map((v) => v.fields[f].max ?? hard)) } : {}) };
      // a headline the look draws with pills or icons: how to mark them
      if (f === 'headline' && inline.pills) fields[f].pills = `mark ${INLINE.pills} at most runs of 1 to ${INLINE.pillWords} words as [[words]]; they are drawn in pills`;
      if (f === 'headline' && inline.icons) fields[f].icons = `place up to ${INLINE.icons} icons as {{name}}, name one of: ${ICON_NAMES.join(', ')}`;
    }
    const variants = vs.map((v) => ({
      variant: v.index, name: v.name, describe: v.describe,
      fields: Object.fromEntries(Object.entries(v.fields).filter(([f]) => f !== 'focal' && f !== 'zoom').map(([f, o]) => [f, f === 'image' ? { required: Boolean(o.required) } : f === 'chart' ? { required: Boolean(o.required), kinds: o.kinds, min: o.min, max: o.max } : Object.hasOwn(POST_LISTS, f) ? { required: Boolean(o.required), ...(o.min !== undefined ? { min: o.min } : {}), ...(o.max !== undefined ? { max: o.max } : {}) } : { required: Boolean(o.required), ...(o.max !== undefined ? { max: Math.min(o.max, POST_FIELDS[f]?.max ?? o.max) } : {}) }])),
      ...(v.accepts?.length ? { accepts: v.accepts } : {}),
    }));
    out[kind] = { required, fields, variants };
  }
  return out;
}

// What one kind may carry in a direction, or null when the direction draws none (so the kind is not offered and is rejected).
export const kindBrief = (direction, kind, brand) => { const k = describeKinds(direction, brand)[kind]; return k ? { kind, ...k } : null; };

// The kinds a direction can draw today.
export const directionKinds = (direction, brand) => Object.keys(describeKinds(direction, brand));

// What the model is given: the direction's name and each drawable kind with its fields and budgets.
export const directionBrief = (direction, brand) => ({ direction, template: 'post', kinds: describeKinds(direction, brand) });

// The brand's look in the shape of the engine's lookBrief ({ name, kinds: { kind: { variants: [{ index, name, fields: { f: { max } } }] } } }), for
// planning named series against it: the look written as data when the brand has one, else the direction's own compositions. null: no direction.
export function seriesBrief(brand) {
  const direction = directionOf(brand), own = lookOfBrand(brand);
  if (own) return lookBrief(own);
  if (!direction) return null;
  const kinds = {};
  for (const kind of POST_KINDS) {
    const comps = compositionsFor(direction, kind);
    if (comps.length) kinds[kind] = { variants: comps.map((c, index) => ({ index, name: c.name, describe: c.describe, fields: Object.fromEntries(c.fields.map((f) => [f, c.words?.[f] ? { max: c.words[f] } : {}])) })) };
  }
  return { id: direction, name: direction, kinds };
}

// The emphasis phrases of a text: the parts between asterisks.
export const emphasisIn = (text) => [...String(text ?? '').matchAll(/\*([^*]*)\*/g)].map((m) => m[1]);
