// The design directions: a registry { direction -> kind -> [composition, ...] } and the function that draws a `post` design.
//
// A composition is trusted engine code in its direction's own files (directions/<name>/compositions.mjs):
//   { id: 'editorial/statement/0', name, describe, fields: [the spec fields it draws], words: { headline: 60, ... } (the most
//     characters per field it is designed for), ground: 'paper' | 'field' | 'dark' | 'accent' (the page colour), calm?: { maxShare }
//     (a deliberate empty area, see checks.mjs), fit?: { pad, top, bottom } (the margins the fit check holds text to), dark?: true
//     (the page is dark, for the logo), roles?: ['display', 'text', 'label', 'mono'] (the font roles it uses; default all),
//     accepts?(spec) -> boolean (false when the composition cannot draw this content, for example a rule on the length of a part of the
//     headline: the next variant of the kind is used instead, see renderPost), render(ctx) -> { html, classes? } }
// render(ctx) gets the context of directions/kit.mjs. See docs/design.md ("Design directions and the post template").
import { DesignError } from '../errors.mjs';
import { DIRECTIONS } from '../tokens.mjs';
import { palette } from './colour.mjs';
import { fontFacesFor } from '../font-library.mjs';
import { grainUri, makeContext, numberElements, rootCss } from './kit.mjs';
import { COMPOSITIONS as EDITORIAL } from './editorial/compositions.mjs';
import { TOKENS as EDITORIAL_TOKENS } from './editorial/tokens.mjs';
import { COMPOSITIONS as RETAIL } from './retail/compositions.mjs';
import { TOKENS as RETAIL_TOKENS } from './retail/tokens.mjs';
import { COMPOSITIONS as SWISS } from './swiss/compositions.mjs';
import { TOKENS as SWISS_TOKENS } from './swiss/tokens.mjs';

export const DIRECTION_TOKENS = { editorial: EDITORIAL_TOKENS, swiss: SWISS_TOKENS, retail: RETAIL_TOKENS };
export const REGISTRY = { editorial: EDITORIAL, swiss: SWISS, retail: RETAIL };
const GROUNDS = ['paper', 'field', 'dark', 'accent', 'soft'];
const FIELDS = ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'image', 'meta', 'tag'];

// The compositions of a kind in a direction (a list, empty when the direction has none yet).
export const compositionsFor = (direction, kind) => (Object.hasOwn(REGISTRY, direction) && Object.hasOwn(REGISTRY[direction], kind) ? REGISTRY[direction][kind] : []);

// Every composition, flat: { direction, kind, variant, comp }.
export function allCompositions() {
  const out = [];
  for (const [direction, kinds] of Object.entries(REGISTRY)) for (const [kind, list] of Object.entries(kinds)) list.forEach((comp, variant) => out.push({ direction, kind, variant, comp }));
  return out;
}

// The variant a post gets when it names none: a hash of its name and words, so a batch varies but a re-render never changes.
export function chooseVariant(spec, count) {
  if (count <= 1) return 0;
  const seed = [spec.name, spec.kind, spec.label, spec.headline, spec.big, spec.quote, spec.meta, spec.tag, ...(Array.isArray(spec.items) ? spec.items : [])].filter((v) => typeof v === 'string').join('|');
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) % count;
}

// Every problem with the registry: ids that do not match their place, unknown fields, missing render, duplicate ids.
export function registryProblems() {
  const errors = [], ids = new Set();
  for (const d of DIRECTIONS) if (!Object.hasOwn(REGISTRY, d) || !Object.hasOwn(DIRECTION_TOKENS, d)) errors.push(`directions: ${d} is not registered`);
  for (const { direction, kind, variant, comp } of allCompositions()) {
    const where = `directions: ${direction}/${kind}/${variant}`;
    if (comp.id !== `${direction}/${kind}/${variant}`) errors.push(`${where}: the id is "${comp.id}"; it must be "${direction}/${kind}/${variant}"`);
    if (ids.has(comp.id)) errors.push(`${where}: the id is used twice`);
    ids.add(comp.id);
    if (typeof comp.name !== 'string' || !comp.name || typeof comp.describe !== 'string' || !comp.describe) errors.push(`${where}: needs a name and a describe`);
    if (!Array.isArray(comp.fields) || !comp.fields.length || comp.fields.some((f) => !FIELDS.includes(f))) errors.push(`${where}: fields must list fields of a post (${FIELDS.join(', ')})`);
    if (!comp.words || typeof comp.words !== 'object' || Object.keys(comp.words).some((k) => !FIELDS.includes(k) || !(comp.words[k] > 0))) errors.push(`${where}: words must give a character budget per field`);
    if (!GROUNDS.includes(comp.ground)) errors.push(`${where}: ground must be one of ${GROUNDS.join(', ')}`);
    if (comp.calm !== undefined && !(comp.calm?.maxShare > 0.45 && comp.calm.maxShare <= 0.8)) errors.push(`${where}: calm.maxShare must be a number above 0.45 and up to 0.8`);
    if (comp.accepts !== undefined && typeof comp.accepts !== 'function') errors.push(`${where}: accepts must be a function`);
    if (typeof comp.render !== 'function') errors.push(`${where}: render must be a function`);
  }
  return errors;
}

// The font faces a composition needs: the direction's roles it uses, minus the roles the brand brought its own font for.
export function fontNeeds(tokens, comp, brand) {
  const roles = comp.roles ?? ['display', 'text', 'label', 'mono'];
  const own = { display: brand.font.display !== brand.font.family, label: brand.font.label !== brand.font.mono };
  const needs = new Map();
  for (const role of roles) {
    if (own[role]) continue;
    const f = tokens.fonts[role];
    for (const face of f.faces) {
      const key = `${f.family}|${face.style}`;
      needs.set(key, { family: f.family, style: face.style, weights: [...new Set([...(needs.get(key)?.weights ?? []), ...face.weights])].sort((a, b) => a - b) });
    }
  }
  return [...needs.values()];
}

const wordsOfPage = (spec, brand, folioText) => [brand.name, folioText, ...['label', 'headline', 'sub', 'big', 'unit', 'quote', 'by', 'meta', 'tag'].map((f) => spec[f]), ...(Array.isArray(spec.items) ? spec.items : [])].filter((v) => typeof v === 'string').join(' ');

// The template function of a `post`: (spec, ctx) -> { body, bodyClass, bodyAttrs, sheet, css, warnings, fit, post }.
// ctx: { size, brand, counter?, folio?, date?, image(path), imageSize(path) } as for every page (render.mjs preparePage).
export function renderPost(spec, ctx) {
  const brand = ctx.brand, direction = brand.style?.direction;
  if (!direction) throw new DesignError('a post is drawn in the brand\'s design direction, and this brand has none: set style.direction in brand.json to one of ' + DIRECTIONS.join(', '));
  if (!DIRECTIONS.includes(direction) || !Object.hasOwn(REGISTRY, direction)) throw new DesignError(`the brand's design direction "${String(direction).slice(0, 30)}" is not one of ${DIRECTIONS.join(', ')}`);
  const list = compositionsFor(direction, spec.kind);
  if (!list.length) throw new DesignError(`the ${direction} direction has no ${spec.kind} composition yet`);
  const variant = spec.variant ?? chooseVariant({ ...spec, name: spec.name }, list.length);
  if (!Number.isInteger(variant) || variant < 0 || variant >= list.length) throw new DesignError(`the ${direction} direction has ${list.length} ${spec.kind} variant${list.length === 1 ? '' : 's'} (0 to ${list.length - 1}), not ${String(variant).slice(0, 8)}`);
  // A composition may decline content it cannot draw well (accepts(spec) is false): the next variant of the kind, in order and
  // wrapping round, is used instead. When none accepts it, the post is refused.
  let used = variant;
  for (let i = 0; i < list.length && typeof list[used].accepts === 'function' && !list[used].accepts(spec); i++) used = (used + 1) % list.length;
  if (typeof list[used].accepts === 'function' && !list[used].accepts(spec)) throw new DesignError(`no ${spec.kind} composition of the ${direction} direction can draw these words`);
  const fellBackFrom = used === variant ? null : list[variant].id;
  const comp = list[used], tokens = DIRECTION_TOKENS[direction];
  const c = makeContext({ spec, brand, tokens, direction, kind: spec.kind, variant: used, comp, size: ctx.size, image: ctx.image, imageSize: ctx.imageSize, counter: ctx.counter, folio: ctx.folio, date: ctx.date });
  if (c.hasImage === false && comp.fields.includes('image') && spec.kind === 'photo') throw new DesignError('a photo post needs an image');
  const out = comp.render(c);
  const made = typeof out === 'string' ? out : out?.html;
  if (typeof made !== 'string') throw new Error(`${comp.id}: render must return { html }`);
  // every element a builder marked gets its index path (data-el="2.0"), see kit.mjs numberElements
  const html = numberElements(made);
  const classes = typeof out === 'object' && out.classes ? String(out.classes) : '';
  if (!/^[a-z0-9 _-]*$/.test(classes)) throw new Error(`${comp.id}: classes may only use lowercase letters, digits, space, - and _`);
  const warnings = [];
  for (const f of ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'meta', 'tag', 'image']) if (spec[f] !== undefined && !comp.fields.includes(f)) warnings.push(`${f} is not used by the ${comp.name} composition (${comp.id}); it is left out of the image`);
  for (const [f, max] of Object.entries(comp.words)) {
    if (f === 'items') continue;
    if (spec[f] !== undefined && c.chars(f) > max) warnings.push(`the ${f} is ${c.chars(f)} characters; the ${comp.name} composition is designed for up to ${max}, so it may be set smaller than intended`);
  }
  const pal = palette(brand, Math.max(7, Number(brand.contrast?.headline) || 7));
  const fonts = fontFacesFor(fontNeeds(tokens, comp, brand), wordsOfPage(spec, brand, tokens.folio(c.folio.n, c.folio.total)));
  const root = `--bg:var(--c-${comp.ground === 'accent' ? 'gold' : comp.ground === 'soft' ? 'soft' : comp.ground});${rootCss({ palette: pal, tokens, brand, grain: grainUri(tokens.grain) })}`;
  const body = `<div class="cv post d-${direction}${classes ? ` ${classes}` : ''}" data-kind="${spec.kind}" data-comp="${comp.id}"${comp.calm ? ` data-calm="${comp.calm.maxShare}"` : ''} style="${root}">${html}${c.logoHtml()}</div>`;
  const m = tokens.margin;
  return {
    body, bodyClass: 'post-page', bodyAttrs: 'data-post="1"', sheet: ['kit', direction], css: fonts.css, warnings,
    fit: { pad: comp.fit?.pad ?? m.left, top: comp.fit?.top ?? m.top, bottom: comp.fit?.bottom ?? m.bottom },
    post: { direction, kind: spec.kind, variant: used, ...(fellBackFrom ? { fellBackFrom } : {}), id: comp.id, name: comp.name, calm: comp.calm?.maxShare ?? null, grid: c.gridLines(), fonts: fonts.files },
  };
}
