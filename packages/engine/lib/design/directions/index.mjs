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
import { displayTarget } from '../checks.mjs';
import { fontFacesFor } from '../font-library.mjs';
import { grainUri, makeContext, numberElements, rootCss } from './kit.mjs';
import fs from 'node:fs';
import { canonicalJson, compositionDevice, compositionGraphicRefs, lookBrief, normaliseLook, validateLook } from '../look.mjs';
import { POST_FIELDS, POST_ITEMS, POST_KINDS, POST_LISTS, POST_REQUIRED, seenText } from '../post-spec.mjs';
import { accentPlan, paletteCss } from './colour.mjs';
import { fontAlias } from '../font-library.mjs';
import { fontNeedsFor, tokensFromLook } from './look-tokens.mjs';
import { fontUsage, renderComposition } from './interpret.mjs';
import { emphasisParts } from './kit.mjs';
import crypto from 'node:crypto';
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

// (every word the page may set picks the font subsets: the fields, the list items, an info block's labels and values and the pictures' names)
const listWords = (spec) => [
  ...(Array.isArray(spec.items) ? spec.items : []),
  ...(Array.isArray(spec.info) ? spec.info.flatMap((r) => (r && typeof r === 'object' ? [r.key, r.value] : [])) : []),
  ...(Array.isArray(spec.gallery) ? spec.gallery.map((p) => (p && typeof p === 'object' ? p.caption : undefined)) : []),
];
const wordsOfPage = (spec, brand, folioText) => [brand.name, folioText, ...['label', 'headline', 'sub', 'big', 'unit', 'quote', 'by', 'meta', 'tag', 'cta'].map((f) => spec[f]), ...listWords(spec)].filter((v) => typeof v === 'string').join(' ');

// The template function of a `post`: (spec, ctx) -> { body, bodyClass, bodyAttrs, sheet, css, warnings, fit, post }.
// ctx: { size, brand, counter?, folio?, date?, image(path), imageSize(path) } as for every page (render.mjs preparePage).
export function renderPost(spec, ctx) {
  const brand = ctx.brand, direction = brand.style?.direction;
  // a look the brand carries (brand.looks, written as data) named by style.direction is drawn by the interpreter, after validation
  const own = Array.isArray(brand.looks) && typeof direction === 'string' ? brand.looks.find((l) => l && typeof l === 'object' && l.id === direction) : null;
  if (own) return renderPostWithLook(own, spec, ctx, { shipped: false });
  if (!direction) throw new DesignError('a post is drawn in the brand\'s design direction, and this brand has none: set style.direction in brand.json to one of ' + DIRECTIONS.join(', '));
  if (!DIRECTIONS.includes(direction) || !Object.hasOwn(REGISTRY, direction)) throw new DesignError(`the brand's design direction "${String(direction).slice(0, 30)}" is not one of ${DIRECTIONS.join(', ')}`);
  const list = compositionsFor(direction, spec.kind);
  if (!list.length) throw new DesignError(`the ${direction} direction has no ${spec.kind} composition yet`);
  const { variant, used, fellBackFrom } = pickVariant(spec, list, direction);
  const comp = list[used], tokens = DIRECTION_TOKENS[direction];
  return draw({ spec, ctx, comp, tokens, direction, used, fellBackFrom, code: true });
}

// The variant a post gets and the one that draws it: the named or hashed variant, then the next that accepts the words (see renderPost).
function pickVariant(spec, list, direction) {
  const variant = spec.variant ?? chooseVariant({ ...spec, name: spec.name }, list.length);
  if (!Number.isInteger(variant) || variant < 0 || variant >= list.length) throw new DesignError(`the ${direction} direction has ${list.length} ${spec.kind} variant${list.length === 1 ? '' : 's'} (0 to ${list.length - 1}), not ${String(variant).slice(0, 8)}`);
  // A composition may decline content it cannot draw well (accepts(spec) is false): the next variant of the kind, in order and
  // wrapping round, is used instead. When none accepts it, the post is refused.
  let used = variant;
  for (let i = 0; i < list.length && typeof list[used].accepts === 'function' && !list[used].accepts(spec); i++) used = (used + 1) % list.length;
  if (typeof list[used].accepts === 'function' && !list[used].accepts(spec)) throw new DesignError(`no ${spec.kind} composition of the ${direction} direction can draw these words`);
  return { variant, used, fellBackFrom: used === variant ? null : list[variant].id };
}

// ---- looks written as data ----
// resolveLook: validate FIRST (an invalid look never reaches the interpreter), then normalise. Memoised by the content of the look (no state per brand).
const memo = new Map();
export function resolveLook(raw, { shipped = false } = {}) {
  let key;
  try { key = crypto.createHash('sha256').update(`${shipped ? 's' : 'b'}${canonicalJson(raw)}`).digest('hex'); } catch { key = null; }
  if (key && memo.has(key)) return memo.get(key);
  const problems = validateLook(raw, 'look', { shipped });
  const out = problems.length ? { problems } : { problems: [], look: normaliseLook(raw), comps: null };
  if (out.look) out.comps = adapt(out.look);
  deepFreeze(out);
  if (key) { if (memo.size >= 64) memo.delete(memo.keys().next().value); memo.set(key, out); }
  return out;
}

const deepFreeze = (o) => { if (o && (typeof o === 'object' || typeof o === 'function') && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
// the compositions of a normalised look as the registry's shape (id, name, fields, words, ground, accepts, render ...), by kind
function adapt(look) {
  const byKind = {};
  look.compositions.forEach((cp) => {
    const index = (byKind[cp.kind] ??= []).length, tokensProbe = null;
    const groundOf = (spec) => {
      if (typeof cp.ground === 'string') return cp.ground;
      const has = (f) => (Object.hasOwn(POST_LISTS, f) ? Array.isArray(spec[f]) && spec[f].length > 0 : f === 'image' ? typeof spec.image === 'string' && spec.image !== '' : f === 'avatar' ? !!spec.avatar && typeof spec.avatar === 'object' && typeof spec.avatar.image === 'string' && spec.avatar.image !== '' : typeof spec[f] === 'string' && spec[f] !== '');
      for (const g of cp.ground) if (!g.when || ((g.when.present === undefined || has(g.when.present)) && (g.when.absent === undefined || !has(g.when.absent)))) return g.ground;
      return cp.ground[cp.ground.length - 1].ground;
    };
    const seen = (v) => [...seenText(v)].length;
    byKind[cp.kind].push({
      id: `${look.id}/${cp.kind}/${index}`, name: cp.name, describe: cp.describe, fields: Object.keys(cp.fields), words: Object.fromEntries(Object.entries(cp.fields).filter(([f, v]) => f !== 'items' && f !== 'image' && f !== 'avatar' && v.max).map(([f, v]) => [f, v.max])),
      ground: typeof cp.ground === 'string' ? cp.ground : cp.ground[cp.ground.length - 1].ground, groundOf, calm: cp.calm ? { maxShare: cp.calm.maxShare } : undefined, fitSpec: cp.fit,
      dark: groundDark(cp), bodyOnField: bodyOnField(cp),
      accepts: cp.accepts.length ? (spec) => cp.accepts.every((r) => {
        if (Object.hasOwn(POST_LISTS, r.field)) { const n = Array.isArray(spec[r.field]) ? spec[r.field].length : 0; return (r.min === undefined || n >= r.min) && (r.max === undefined || n <= r.max); }
        if (typeof spec[r.field] !== 'string') return true;
        const part = r.part ?? 'all', t = part === 'all' ? spec[r.field] : emphasisParts(spec[r.field])[part];
        return seen(t) <= r.maxChars && (r.minChars === undefined || seen(t) >= r.minChars);
      }) : undefined,
      data: cp,
    });
  });
  return byKind;
}
const groundDark = (cp) => { const g = typeof cp.ground === 'string' ? [cp.ground] : cp.ground.map((x) => x.ground); return g.some((x) => x === 'field' || x === 'dark'); };
// whether small body text sits directly on the field colour (so the field must carry the stricter body target)
function bodyOnField(cp) {
  const FIELDS = ['field', 'field-deep', 'dark', 'primary'];
  const base = (typeof cp.ground === 'string' ? [cp.ground] : cp.ground.map((x) => x.ground)).some((x) => x === 'field' || x === 'dark') ? 'field' : 'paper';
  const walk = (list, bg) => list.some((e) => {
    const here = e.fill && ['box', 'band'].includes(e.type) ? e.fill : bg;
    if (e.type === 'text' && ['sub', 'items'].includes(e.field) && FIELDS.includes(here)) return true;
    return walk([...(e.children ?? []), ...(e.sticker ? [e.sticker] : [])], e.type === 'sticker' ? 'paper' : here);
  });
  return walk(cp.elements, base);
}

// Draws a post with a look written as data. look: the raw look (validated here: a refusal lists the validator's problems and nothing is
// drawn); opts.shipped: the engine's own shipped looks (origin "shipped") are accepted. The brand's own looks reach this through renderPost.
export function renderPostWithLook(look, spec, ctx, { shipped = false } = {}) {
  const r = resolveLook(look, { shipped });
  if (r.problems.length) throw new DesignError(`this look cannot be drawn: ${r.problems.slice(0, 4).join('; ')}${r.problems.length > 4 ? `; and ${r.problems.length - 4} more` : ''}`);
  const list = r.comps[spec.kind] ?? [];
  if (!list.length) throw new DesignError(`the ${r.look.id} look has no ${spec.kind} composition`);
  const { used, fellBackFrom } = pickVariant(spec, list, r.look.id);
  const comp = list[used], tokens = tokensFromLook(r.look, ctx.brand);
  return draw({ spec, ctx, comp, tokens, direction: r.look.id, used, fellBackFrom, code: false, look: r.look });
}

// The composition of a look written as data that will draw `spec` (a post), chosen as renderPostWithLook chooses it (the named or hashed
// variant, then the next that accepts the words), with the brand graphics it places: { kind, variant, name, refs }. null when the look is
// invalid or has no composition that takes the post (drawing it is refused then, with the reason). No page is built.
export function postCompositionGraphics(look, spec, { shipped = false } = {}) {
  const r = resolveLook(look, { shipped });
  if (r.problems.length || !isObjSpec(spec)) return null;
  const list = r.comps[spec.kind] ?? [];
  if (!list.length) return null;
  let used;
  try { ({ used } = pickVariant(spec, list, r.look.id)); } catch (e) { if (e instanceof DesignError) return null; throw e; }
  const comp = list[used];
  return { kind: spec.kind, variant: used, name: comp.name, refs: compositionGraphicRefs(comp.data) };
}
const isObjSpec = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// The device the composition that will draw `spec` (a post) draws round its picture, chosen as renderPostWithLook chooses it: { kind, variant, name,
// device: 'phone' | 'tablet' | null }, or null when the look is invalid or has no composition that takes the post. No page is built.
export function postCompositionDevice(look, spec, { shipped = false } = {}) {
  const r = resolveLook(look, { shipped });
  if (r.problems.length || !isObjSpec(spec)) return null;
  const list = r.comps[spec.kind] ?? [];
  if (!list.length) return null;
  let used;
  try { ({ used } = pickVariant(spec, list, r.look.id)); } catch (e) { if (e instanceof DesignError) return null; throw e; }
  const comp = list[used];
  return { kind: spec.kind, variant: used, name: comp.name, device: compositionDevice(comp.data) };
}

const num4 = (v) => +Number(v).toFixed(4);
// the look's custom properties on the page's root: numbers and fixed words only
function lookRoot(look, tokens) {
  const hl = look.devices.highlight, [t, r, b, l] = hl.pad, d = look.type.display;
  const stretch = look.fonts.display.source === 'library' ? look.fonts.display.stretch : undefined;
  return [`--k-dstretch:${stretch ? num4(stretch) : 100}%`, ...(look.fonts.display.source === 'library' && look.fonts.display.opsz ? [`--k-dvar:'opsz' ${num4(look.fonts.display.opsz)}`] : []), `--k-dcase:${d.case === 'upper' ? 'uppercase' : 'none'}`, `--k-dword:${num4(d.wordSpace ?? 0)}em`, `--k-hl-top:${num4(t)}em`, `--k-hl-h:${num4(1 - t - b)}em`, `--k-hl-pr:${num4(r)}em`, `--k-hl-pl:${num4(l)}em`, `--k-hl-tilt:${num4(hl.tilt)}deg`].join(';');
}
function lookStack(tokens, role) {
  const f = tokens.fonts[role];
  return f.brandVar ? `var(${f.brandVar}),${f.fallback.replace(/"/g, "'")}` : `'${fontAlias(f.family)}',${f.fallback.replace(/"/g, "'")}`;
}

function draw({ spec, ctx, comp, tokens, direction, used, fellBackFrom, code, look }) {
  const brand = ctx.brand;
  const c = makeContext({ spec, brand, tokens, direction, kind: spec.kind, variant: used, comp, size: ctx.size, image: ctx.image, imageSize: ctx.imageSize, counter: ctx.counter, folio: ctx.folio, date: ctx.date });
  if (c.hasImage === false && comp.fields.includes('image') && spec.kind === 'photo') throw new DesignError('a photo post needs an image');
  let out;
  if (code) out = comp.render(c);
  else {
    // a look is data a person wrote: whatever the kit refuses on a look that passed the validator is a refusal of that look, never a bare engine error
    try { out = renderComposition(look, comp.data, c); } catch (e) {
      if (e instanceof DesignError) throw e;
      throw new DesignError(`the ${look.id} look cannot draw its ${comp.name} composition (${comp.id}): ${String(e?.message ?? e).replace(/[^\x20-\x7e]/g, '?').slice(0, 160)}`);
    }
  }
  const made = typeof out === 'string' ? out : out?.html;
  if (typeof made !== 'string') throw new Error(`${comp.id}: render must return { html }`);
  const classes = typeof out === 'object' && out.classes ? String(out.classes) : '';
  if (!/^[a-z0-9 _-]*$/.test(classes)) throw new Error(`${comp.id}: classes may only use lowercase letters, digits, space, - and _`);
  const warnings = [...new Set(c.lookNotes ?? [])];
  for (const f of ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'meta', 'tag', 'image', 'cta', 'info', 'gallery', 'avatar']) if (spec[f] !== undefined && !comp.fields.includes(f)) warnings.push(`${f} is not used by the ${comp.name} composition (${comp.id}); it is left out of the image`);
  for (const [f, max] of Object.entries(comp.words)) {
    if (f === 'items') continue;
    if (spec[f] !== undefined && c.chars(f) > max) warnings.push(`the ${f} is ${c.chars(f)} characters; the ${comp.name} composition is designed for up to ${max}, so it may be set smaller than intended`);
  }
  const pal0 = palette(brand, comp.bodyOnField ? Math.max(displayTarget(brand), Number(brand.contrast?.sub) || 0) : displayTarget(brand));
  // accentAsType "field": the emphasised phrase is set in the deep field colour (always readable on the page and on a pale tint), not the accent
  const pal = look?.colour?.accentAsType === 'field' ? { ...pal0, accentType: pal0.field } : pal0;
  let fonts, root, html, ground = code ? comp.ground : comp.groundOf(spec), sheet, rootClass;
  if (code) {
    html = numberElements(made);
    fonts = fontFacesFor(fontNeeds(tokens, comp, brand), wordsOfPage(spec, brand, (c.folio.n ? tokens.folio(c.folio.n, c.folio.total) : '')));
    root = `--bg:var(--c-${ground === 'accent' ? 'gold' : ground === 'soft' ? 'soft' : ground});${rootCss({ palette: pal, tokens, brand, grain: grainUri(tokens.grain) })}`;
    sheet = ['kit', direction]; rootClass = `d-${direction}`;
  } else {
    let inner = made;
    let bg = ground === 'accent' ? 'gold' : ground === 'soft' ? 'soft' : ground === 'tint' ? 'light-tint' : ground === 'field' && look.colour.field === 'dark' ? 'dark' : ground;
    if (look.colour.logic === 'one-accent') {
      // the accent plan of the page (what the brand's accent reaches by measured contrast): a page on the dark ground keeps it when the accent reads
      // there; when it does not, but reads on paper, the page takes the light ground and every dark-page colour turns into its light-page one
      const p = accentPlan(brand, pal), lightPage = !p.word.dark && p.word.paper;
      const vars = { 'accent-type': pal.primary, 'accent-dark': pal.primary, 'on-accent': p.onFill.colour, muted: p.mutedPaper, 'muted-dark': p.mutedDark };
      if (lightPage && bg === 'dark') { Object.assign(vars, { white: pal.ink, dark: pal.paper, field: pal.paper, 'on-field': pal.ink, 'body-dark': pal.body, 'muted-dark': p.mutedPaper }); bg = 'paper'; }
      inner = c.scope(vars, made);
    }
    html = numberElements(inner);
    fonts = fontFacesFor(fontNeedsFor(look, fontUsage(look, comp.data), brand), wordsOfPage(spec, brand, (c.folio.n ? tokens.folio(c.folio.n, c.folio.total) : '')));
    root = `--bg:var(--c-${bg});${paletteCss(pal)};--f-display:${lookStack(tokens, 'display')};--f-text:${lookStack(tokens, 'text')};--f-label:${lookStack(tokens, 'label')};--f-mono:${lookStack(tokens, 'mono')};--k-grain:${grainUri(tokens.grain)};${lookRoot(look, tokens)}`;
    sheet = ['kit']; rootClass = 'k-look';
  }
  const body = `<div class="cv post ${rootClass}${classes ? ` ${classes}` : ''}" data-kind="${spec.kind}" data-comp="${comp.id}"${comp.calm ? ` data-calm="${comp.calm.maxShare}"` : ''} style="${root}">${html}${c.logoHtml()}</div>`;
  const m = tokens.margin;
  const f = look ? (comp.fitSpec === 'frame' ? { pad: tokens.frame.t + tokens.frame.pad, top: tokens.frame.t + tokens.frame.pad, bottom: tokens.frame.t + tokens.frame.pad } : comp.fitSpec && typeof comp.fitSpec === 'object' ? comp.fitSpec : {}) : comp.fit ?? {};
  return {
    body, bodyClass: 'post-page', bodyAttrs: 'data-post="1"', sheet, css: fonts.css, warnings,
    fit: { pad: f.pad ?? m.left, top: f.top ?? m.top, bottom: f.bottom ?? m.bottom },
    post: { direction, kind: spec.kind, variant: used, ...(fellBackFrom ? { fellBackFrom } : {}), id: comp.id, name: comp.name, calm: comp.calm?.maxShare ?? null, grid: c.gridLines(), fonts: fonts.files },
  };
}

// ---- the engine's own looks, written as data ----
export { lookBrief };
const SHIPPED_IDS = Object.freeze(['retail', 'swiss', 'soft', 'bloom', 'clean', 'loud', 'ledger']);
let shipped = null;
// The shipped looks (lib/design/looks/<id>.look.json), read once, validated as shipped looks and deep frozen: { retail, swiss, soft, bloom, clean, loud, ledger } as the raw look
// data (origin "shipped"). A brand copies one into brand.looks (origin "copy:shipped:<id>") to change it; draw one with
// renderPostWithLook(look, spec, ctx, { shipped: true }). A shipped file the validator refuses is an engine bug, so it throws.
export function shippedLooks() {
  if (shipped) return shipped;
  const out = {};
  for (const id of SHIPPED_IDS) {
    const raw = JSON.parse(fs.readFileSync(new URL(`../looks/${id}.look.json`, import.meta.url), 'utf8'));
    const problems = validateLook(raw, `shipped look ${id}`, { shipped: true });
    if (problems.length) throw new Error(`the shipped ${id} look is not valid: ${problems.slice(0, 5).join('; ')}`);
    if (raw.id !== id) throw new Error(`the shipped look file ${id}.look.json carries the id "${String(raw.id).slice(0, 30)}"`);
    out[id] = deepFreeze(raw);
  }
  return (shipped = Object.freeze(out));
}

// The brand's own look the direction names (an entry of brand.looks with that id), or null (a code direction, or none).
export const lookOfBrand = (brand) => (Array.isArray(brand?.looks) && typeof brand?.style?.direction === 'string' ? brand.looks.find((l) => l && typeof l === 'object' && l.id === brand.style.direction) ?? null : null);

// What a brand's direction draws, in the shape the AI library and the post editor read for any direction:
// { [kind]: { required: [fields], fields: { field: { max, budget? } | { min, max, chars } | {} }, variants: [{ variant, name, describe }] } }, only the kinds
// with a composition. A look written as data is read from its brief (look.mjs lookBrief); with no named variant any composition may draw a post, so a
// field's budget is the smallest any variant draws it with. The brand's direction may be a code direction (editorial, swiss, retail) or its own look.
export function postKinds(brand) {
  const direction = brand?.style?.direction, own = lookOfBrand(brand);
  const out = {};
  if (own) {
    const brief = lookBrief(own);
    for (const kind of POST_KINDS) {
      const entry = brief.kinds[kind];
      if (!entry?.variants.length) continue;
      const vs = entry.variants, names = new Set([...(POST_REQUIRED[kind] ?? []), ...vs.flatMap((v) => Object.keys(v.fields))]), fields = {};
      for (const f of names) {
        if (f === 'image' || f === 'avatar') { fields[f] = {}; continue; }
        const have = vs.filter((v) => v.fields[f]);
        if (f === 'items') { fields[f] = { min: Math.min(...have.map((v) => v.fields.items.min ?? POST_ITEMS.min)), max: Math.max(...have.map((v) => v.fields.items.max ?? POST_ITEMS.max)), chars: POST_ITEMS.chars }; continue; }
        if (f === 'info' || f === 'gallery') { const L = POST_LISTS[f]; fields[f] = { min: Math.min(...have.map((v) => v.fields[f].min ?? L.min)), max: Math.max(...have.map((v) => v.fields[f].max ?? L.max)), chars: f === 'info' ? L.value : L.caption }; continue; }
        const hard = POST_FIELDS[f]?.max;
        if (!hard) continue;
        fields[f] = { max: hard, ...(have.length ? { budget: Math.min(hard, ...have.map((v) => v.fields[f].max ?? hard)) } : {}) };
      }
      out[kind] = { required: POST_REQUIRED[kind] ?? [], fields, variants: vs.map((v) => ({ variant: v.index, name: v.name, describe: v.describe, ...(v.device ? { device: v.device } : {}) })) };
    }
    return out;
  }
  for (const kind of POST_KINDS) {
    const comps = compositionsFor(direction, kind);
    if (!comps.length) continue;
    const names = new Set(POST_REQUIRED[kind] ?? []);
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
    out[kind] = { required: POST_REQUIRED[kind] ?? [], fields, variants: comps.map((c, variant) => ({ variant, name: c.name, describe: c.describe })) };
  }
  return out;
}
