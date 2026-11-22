// The `post` template's design block: { "template": "post", "kind": "figure", "variant"?: 0, ...fields }. A post says WHAT it is (a
// kind) and gives its words; the brand's direction (brand.json style.direction) decides how it is composed. Pure: no Chrome, no files
// (the picture is checked when rendering). Spec text is untrusted: every limit is enforced here, and again nowhere else is needed
// because compositions only ever write these fields through their escaping helpers (lib/design/directions/kit.mjs).
import path from 'node:path';
import { DIRECTIONS, POST_KINDS } from './tokens.mjs';

export { POST_KINDS };
export const POST_TEMPLATES = ['post'];
export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
// The fields of a post, with their limits. Lengths count what is seen: the asterisks of an emphasis and the line breaks do not count.
export const POST_FIELDS = {
  label: { max: 28 }, headline: { max: 70, emphasis: true }, sub: { max: 140 }, big: { max: 8 }, unit: { max: 24 },
  quote: { max: 160 }, by: { max: 40 }, meta: { max: 40 }, tag: { max: 16 },
};
export const POST_ITEMS = { min: 2, max: 5, chars: 44 };
export const MAX_VARIANT = 9;
// What every kind needs, by field (a list is "items").
export const POST_REQUIRED = {
  statement: ['headline'], figure: ['big'], list: ['headline', 'items'], quote: ['quote'], photo: ['image', 'headline'], event: ['headline', 'meta'], offer: ['headline', 'tag'],
};
// The keys a post design may carry besides its fields (a batch's file name and sizes, the network sizes).
const OWN = ['template', 'kind', 'variant', 'sizes', 'name', 'networkSizes', 'image', 'focal', 'zoom', 'items'];
export const POST_KEYS = [...OWN, ...Object.keys(POST_FIELDS)];

const seen = (v) => String(v).replace(/\*/g, '').replace(/\\n|\n/g, '');
const clip = (v) => String(v).slice(0, 40);
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// Problems of a post design (a list of texts, empty when fine). opts.direction: the brand's direction when known (null: none, so a
// post is refused; undefined: not known here, so only the design itself is judged); focalOk(f): the spec's focal checker.
export function postProblems(d, where = 'design', { direction, focalOk } = {}) {
  const e = [];
  if (!POST_KINDS.includes(d.kind)) e.push(`${where}: kind must be one of ${POST_KINDS.join(', ')} (got "${clip(d.kind)}")`);
  if (direction === null) e.push(`${where}: a post is drawn in the brand's design direction, and this brand has none; set style.direction in brand.json to one of ${DIRECTIONS.join(', ')} (Settings, Brand and look)`);
  else if (direction !== undefined && !DIRECTIONS.includes(direction)) e.push(`${where}: the brand's design direction "${clip(direction)}" is not one of ${DIRECTIONS.join(', ')}`);
  for (const k of Object.keys(d)) if (!POST_KEYS.includes(k)) e.push(`${where}: "${clip(k)}" is not a field of a post (fields: ${[...Object.keys(POST_FIELDS), 'items', 'image', 'focal', 'zoom'].join(', ')}; also kind, variant)`);
  if (d.variant !== undefined && !(Number.isInteger(d.variant) && d.variant >= 0 && d.variant <= MAX_VARIANT)) e.push(`${where}: variant must be a whole number from 0 to ${MAX_VARIANT} (leave it out and the post picks one itself)`);
  for (const [f, { max }] of Object.entries(POST_FIELDS)) {
    const v = d[f];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !v.trim()) { e.push(`${where}: ${f} must be a non-empty text`); continue; }
    if (f !== 'headline' && f !== 'quote' && f !== 'sub' && /[\r\n]|\\n/.test(v)) e.push(`${where}: ${f} must be one line`);
    const n = [...seen(v)].length;
    if (n > max) e.push(`${where}: ${f} is ${n} characters; the most is ${max}`);
  }
  if (d.items !== undefined) {
    const { min, max, chars } = POST_ITEMS;
    if (!Array.isArray(d.items) || d.items.length < min || d.items.length > max) e.push(`${where}: items must be a list of ${min} to ${max} short texts`);
    else d.items.forEach((t, i) => {
      if (typeof t !== 'string' || !t.trim()) e.push(`${where}: items[${i}] must be a non-empty text`);
      else if (/[\r\n]|\\n/.test(t)) e.push(`${where}: items[${i}] must be one line`);
      else if ([...seen(t)].length > chars) e.push(`${where}: items[${i}] is ${[...seen(t)].length} characters; the most is ${chars}`);
    });
  }
  if (d.image !== undefined) {
    if (typeof d.image !== 'string' || !d.image.trim()) e.push(`${where}: image must be a file path`);
    else if (!IMAGE_EXTS.includes(path.extname(d.image).toLowerCase())) e.push(`${where}: image "${clip(d.image)}" must be ${IMAGE_EXTS.join(' ')}`);
  }
  if (d.focal !== undefined && focalOk && !focalOk(d.focal)) e.push(`${where}: focal must look like "60% 40%", "center", "left top" or { "x": 0.6, "y": 0.4 }`);
  if (d.zoom !== undefined && !isNum(d.zoom, 1, 3)) e.push(`${where}: zoom must be a number from 1 to 3`);
  for (const f of POST_REQUIRED[d.kind] ?? []) if (d[f] === undefined) e.push(`${where}: a ${d.kind} post needs ${f}`);
  return e;
}
