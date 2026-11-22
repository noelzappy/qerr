// A brand with a design direction (brand.json style.direction) designs its images with ONE template, `post`, and says what each
// post is (its kind); the direction decides how it is drawn. This file reads the kinds, fields and word budgets from the
// engine's own registry (lib/design/directions, lib/design/post-spec.mjs), so the model is told exactly what the renderer will
// accept and nothing is written twice. The compositions' budgets are the most characters per field they are designed for.
import { DIRECTIONS } from '@vesk/engine/design/tokens';
import { POST_FIELDS, POST_ITEMS, POST_KINDS, POST_REQUIRED } from '@vesk/engine/design/post-spec';
import { compositionsFor } from '@vesk/engine/design/directions/index';

// The brand's direction, or null (no direction, or one the engine does not know).
export const directionOf = (brand) => (DIRECTIONS.includes(brand?.style?.direction) ? brand.style.direction : null);

// The fields that take the `*emphasis*` marker.
export const EMPHASIS_FIELDS = Object.entries(POST_FIELDS).filter(([, f]) => f.emphasis).map(([k]) => k).concat('quote');

// THE ADAPTER: the one place that reads the engine for what a direction can draw. Today it reads the directions registry
// (lib/design/directions + post-spec.mjs); to read it from the looks instead, point this one function at `lookBrief` in
// lib/design/look.mjs and return the same shape: { [kind]: { required: [fields], fields: { field: { max, budget? } | { min, max, chars } | {} } } },
// leaving out every kind with nothing to draw it. Nothing below knows where the description comes from.
// With no `variant` the engine may pick any composition of a kind, so a field's budget is the smallest any composition draws it with.
function describeKinds(direction) {
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

// What one kind may carry in a direction, or null when the direction draws none (so the kind is not offered and is rejected).
export const kindBrief = (direction, kind) => { const k = describeKinds(direction)[kind]; return k ? { kind, ...k } : null; };

// The kinds a direction can draw today.
export const directionKinds = (direction) => Object.keys(describeKinds(direction));

// What the model is given: the direction's name and each drawable kind with its fields and budgets.
export const directionBrief = (direction) => ({ direction, template: 'post', kinds: describeKinds(direction) });

// The emphasis phrases of a text: the parts between asterisks.
export const emphasisIn = (text) => [...String(text ?? '').matchAll(/\*([^*]*)\*/g)].map((m) => m[1]);
