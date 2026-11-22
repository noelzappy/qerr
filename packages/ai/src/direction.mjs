// A brand with a design direction (brand.json style.direction) designs its images with ONE template, `post`, and says what each
// post is (its kind); the direction decides how it is drawn. This file reads the kinds, fields and word budgets from the
// engine's own registry (lib/design/directions, lib/design/post-spec.mjs), so the model is told exactly what the renderer will
// accept and nothing is written twice. The compositions' budgets are the most characters per field they are designed for.
import { DIRECTIONS } from '@vesk/engine/design/tokens';
import { POST_FIELDS, POST_ITEMS, POST_KINDS, POST_REQUIRED } from '@vesk/engine/design/post-spec';
import { compositionsFor, lookBrief, lookOfBrand } from '@vesk/engine/design/directions/index';

// The brand's direction, or null (no direction, or one the engine does not know).
// A look written as data that the brand carries (brand.looks, named by style.direction) is a direction too.
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
    const required = POST_REQUIRED[kind] ?? [];
    const names = new Set(required);
    for (const v of vs) for (const f of Object.keys(v.fields)) names.add(f);
    const fields = {};
    for (const f of names) {
      if (f === 'image' || f === 'focal' || f === 'zoom') { fields[f] = {}; continue; }
      const have = vs.filter((v) => v.fields[f]);
      if (f === 'items') { fields[f] = { min: Math.min(...have.map((v) => v.fields.items.min ?? POST_ITEMS.min)), max: Math.max(...have.map((v) => v.fields.items.max ?? POST_ITEMS.max)), chars: POST_ITEMS.chars }; continue; }
      const hard = POST_FIELDS[f]?.max;
      if (!hard) continue;
      fields[f] = { max: hard, ...(have.length ? { budget: Math.min(hard, ...have.map((v) => v.fields[f].max ?? hard)) } : {}) };
    }
    const variants = vs.map((v) => ({
      variant: v.index, name: v.name, describe: v.describe,
      fields: Object.fromEntries(Object.entries(v.fields).filter(([f]) => f !== 'focal' && f !== 'zoom').map(([f, o]) => [f, f === 'image' ? { required: Boolean(o.required) } : { required: Boolean(o.required), ...(o.max !== undefined ? { max: Math.min(o.max, POST_FIELDS[f]?.max ?? o.max) } : {}) }])),
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
