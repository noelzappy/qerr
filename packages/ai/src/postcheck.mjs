// Checks one AI-written post against the vault and the engine's rules. Nothing a model wrote is trusted:
// it either passes here, is repaired in a way that is reported, or is rejected with reasons.
import { LIMITS, NETWORKS } from '@vesk/engine/networks';
import { lintText, textFieldsOf } from '@vesk/engine/design/lint';
import { POSTER_TEMPLATES, normaliseDesign, validateDesign } from '@vesk/engine/design/spec';
import { EMOJI_G, fixSpelling, isTitleCase, numberKeys, quoteIsSourced, quotesIn, trimToLimit, unsourcedNumbers, usSpellings } from './facts.mjs';
import { MEDIA_KINDS, foreignMoneyPattern, isStale, mentionsForeignMoney, needsRightsCheck } from './vault.mjs';

// The drafting assistant may only use the poster pages (a real photo or a framed phone screen on a pale ground), a full-bleed photo
// and carousels of poster pages. The older editorial templates stay in the engine for hand-written batches.
export const ALLOWED_TEMPLATES = [...POSTER_TEMPLATES, 'photo', 'carousel'];
const ALLOWED_LIST = 'object, number, product, myth-fact or closing';
// The vault kind each template's image must have: a framed phone is a screen item, every other picture is a photo item.
const IMAGE_KIND = { product: 'screen', object: 'photo', number: 'photo', photo: 'photo' };
const ID_OK = /^[A-Za-z0-9._-]+$/;
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
const IMAGE_KEEP = new Set(['image', 'template', 'series', 'ground', 'accent', 'tick', 'layout', 'name', 'statusFill', 'kind', 'textAt', 'scrim']);
const len = (s) => [...s].length;
const hashtags = (t) => (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Applies fn to every string of a design block except fixed-list and path fields.
function mapStrings(v, fn, key) {
  if (typeof v === 'string') return IMAGE_KEEP.has(key) ? v : fn(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fn, key));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fn, k)]));
  return v;
}

// Replaces "vault:<id>" and known vault file paths in `image` fields; returns { design, ids, problems }.
function resolveImages(design, ctx) {
  const ids = new Set(), problems = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (!isObj(v)) return v;
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (k !== 'image') { out[k] = walk(x); continue; }
      if (typeof x !== 'string') { out[k] = x; continue; }
      const id = x.startsWith('vault:') ? x.slice(6) : ctx.byFile.get(x)?.id;
      const item = id ? ctx.byId.get(id) : null;
      if (!item) problems.push(`image "${x.slice(0, 80)}" is not a vault photo; use "vault:<id>" with the id of a photo or screen item`);
      else if (!MEDIA_KINDS.includes(item.kind) || !item.file) problems.push(`vault item ${id} is not a photo or screen with a file`);
      else if (/^[a-z][a-z0-9+.-]*:/i.test(item.file) || item.file.startsWith('/') || item.file.split('/').includes('..')) problems.push(`vault item ${id} has a file path that is not relative to the repository`);
      else { ids.add(id); out[k] = item.file; }
    }
    return out;
  };
  return { design: walk(design), ids: [...ids], problems };
}

function vaultItemOf(image, ctx) {
  if (typeof image !== 'string') return null;
  const id = image.startsWith('vault:') ? image.slice(6) : ctx.byFile.get(image)?.id;
  return id ? ctx.byId.get(id) ?? null : null;
}

// Template rules the engine does not know: only poster pages inside a carousel, and the right kind of vault item behind each image.
function templateProblems(design) {
  if (!ALLOWED_TEMPLATES.includes(design.template)) return [`template "${design.template}" is not allowed; use ${ALLOWED_LIST}, or photo or carousel`];
  if (design.template !== 'carousel' || !Array.isArray(design.pages)) return [];
  const out = [];
  design.pages.forEach((p, i) => {
    if (!POSTER_TEMPLATES.includes(p?.template)) out.push(`carousel page ${i + 1} uses template "${p?.template}", which is not allowed; every page must be ${ALLOWED_LIST}`);
  });
  return out;
}

function imageKindProblems(design, ctx) {
  const pages = design.template === 'carousel' && Array.isArray(design.pages) ? design.pages.map((p, i) => [p, `carousel page ${i + 1}: `]) : [[design, '']];
  const out = [];
  for (const [p, at] of pages) {
    const want = IMAGE_KIND[p?.template], item = vaultItemOf(p?.image, ctx);
    if (!want || !item || !MEDIA_KINDS.includes(item.kind) || item.kind === want) continue;
    out.push(`${at}${p.template} needs a vault item of kind ${want} as its image, but ${item.id} is a ${item.kind}; ${want === 'screen' ? 'pick a framed phone screen' : 'pick a photo'} item instead`);
  }
  return out;
}

// Every image of a design in page order (a carousel's pages, or the one image), repeats kept.
function imageIdsOf(design, ctx) {
  const pages = design.template === 'carousel' && Array.isArray(design.pages) ? design.pages : [design];
  return pages.map((p) => vaultItemOf(p?.image, ctx)?.id).filter(Boolean);
}

// Pictures must not repeat inside a post or across the batch, and must not show foreign money.
function pictureProblems(design, ctx) {
  const ids = imageIdsOf(design, ctx), out = [], money = foreignMoneyPattern(ctx.brand);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) out.push(`picture ${id} is used twice in this carousel; choose a different one for each page`);
    seen.add(id);
    const by = ctx.usedImages?.get(id);
    if (by) out.push(`picture ${id} is already used by post ${by}; choose a different one`);
    const item = ctx.byId.get(id);
    if (item && mentionsForeignMoney(item, money)) out.push(`picture ${id} shows or mentions foreign money${ctx.brand.money.local ? `; ${ctx.brand.money.local}` : ''}, so choose another picture`);
  }
  return [...new Set(out)];
}

// Object and number pages that carry a picture take the page colour from the picture's top edge, so no band shows.
function repairGround(design) {
  let changed = false;
  const fix = (p) => {
    if (!isObj(p) || !['object', 'number'].includes(p.template) || typeof p.image !== 'string' || p.ground === 'photo') return p;
    changed = true;
    return { ...p, ground: 'photo' };
  };
  const out = design.template === 'carousel' && Array.isArray(design.pages) ? { ...design, pages: design.pages.map(fix) } : fix(design);
  return { design: out, changed };
}

// checkPost(raw, ctx) -> { ok, post, reasons, repairs, imageSuggestion }
// ctx: { byId: Map, byFile: Map, channels, period: {from,to}|null, seriesKeys, brand, now, takenIds: Set, tagline,
//        usedImages?: Map<imageId, postId> (a batch draft: pictures other posts already use), requireImageReason?: boolean }
export function checkPost(raw, ctx) {
  const reasons = [], repairs = [], warnings = [];
  const label = typeof raw?.id === 'string' ? raw.id : '(no id)';
  if (!isObj(raw)) return { ok: false, reasons: ['post is not an object'], repairs, post: null };

  // id, date, time
  let id = String(raw.id ?? '').trim();
  if (!ID_OK.test(id)) { const fixed = id.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, ''); if (fixed) { repairs.push(`id "${id}" changed to "${fixed}"`); id = fixed; } else reasons.push('id is missing'); }
  if (id && ctx.takenIds?.has(id)) { let n = 2; while (ctx.takenIds.has(`${id}-${n}`)) n++; repairs.push(`duplicate id "${id}" changed to "${id}-${n}"`); id = `${id}-${n}`; }
  const date = raw.date;
  if (typeof date !== 'string' || !DATE_OK.test(date) || !new Date(`${date}T00:00:00Z`).toISOString().startsWith(date)) reasons.push(`date "${date}" is not a real YYYY-MM-DD date`);
  else if (ctx.period && (date < ctx.period.from || date > ctx.period.to)) reasons.push(`date ${date} is outside the period ${ctx.period.from} to ${ctx.period.to}`);
  if (raw.time !== undefined && !(typeof raw.time === 'string' && TIME_OK.test(raw.time))) reasons.push(`time "${raw.time}" must look like 09:00`);
  if (typeof raw.caption !== 'string' || !raw.caption.trim()) reasons.push('caption is missing');
  if (typeof raw.title !== 'string' || !raw.title.trim()) reasons.push('title is missing');

  // sources
  const sources = Array.isArray(raw.sources) ? [...new Set(raw.sources.filter((s) => typeof s === 'string'))] : [];
  if (!sources.length) reasons.push('the post cites no vault item in sources');
  const unknown = sources.filter((s) => !ctx.byId.has(s));
  if (unknown.length) reasons.push(`sources name items that are not in the vault: ${unknown.join(', ')}`);
  const sourceItems = sources.map((s) => ctx.byId.get(s)).filter(Boolean);

  // design: template list, images, engine validation
  let design = raw.design;
  let photoIds = [];
  if (!isObj(design)) reasons.push('design block is missing');
  else if (templateProblems(design).length) reasons.push(...templateProblems(design));
  else {
    const r = resolveImages(design, ctx);
    reasons.push(...r.problems);
    if (!r.problems.length) reasons.push(...imageKindProblems(design, ctx), ...pictureProblems(raw.design, ctx));
    design = r.design; photoIds = r.ids;
    if (!r.problems.length) {
      const g = repairGround(design);
      design = g.design;
      if (g.changed) repairs.push("ground set to photo so the page matches the picture's background");
    }
    if (!r.problems.length) reasons.push(...validateDesign(design, 'design', { series: ctx.seriesKeys }));
  }
  const imageReason = typeof raw.imageReason === 'string' ? raw.imageReason.trim().slice(0, 200) : '';
  if (ctx.requireImageReason && photoIds.length && !imageReason) reasons.push('imageReason is missing: say what the picture shows and why it fits this post');
  if (reasons.length) return { ok: false, reasons: reasons.map((x) => `${label}: ${x}`), repairs, post: null, imageSuggestion: raw.imageSuggestion };

  // brand repairs: spelling everywhere, emoji out of image text
  const rules = ctx.brand.spelling;
  const fixCaption = (t) => { const f = fixSpelling(t, rules); if (f !== t) repairs.push('brand spelling corrected in a caption'); return f; };
  let caption = fixCaption(raw.caption);
  const networkCaptions = {};
  for (const [n, t] of Object.entries(isObj(raw.networkCaptions) ? raw.networkCaptions : {})) {
    if (NETWORKS.includes(n) && ctx.channels.includes(n) && typeof t === 'string' && t.trim()) networkCaptions[n] = fixCaption(t);
  }
  const before = JSON.stringify(design);
  design = mapStrings(design, (s) => fixSpelling(s, rules).replace(EMOJI_G, '').replace(/ {2,}/g, ' ').trim());
  // The photo template's thin arcs and corner brackets are the older look the owner rejected; AI photo posts never draw them.
  if (design.template === 'photo' && design.lines !== false) design = { ...design, lines: false };
  if (JSON.stringify(design) !== before) repairs.push('brand spelling corrected or emoji removed in the image text');
  const revalid = validateDesign(design, 'design', { series: ctx.seriesKeys });
  if (revalid.length) return { ok: false, reasons: revalid.map((x) => `${label}: ${x}`), repairs, post: null };

  // claims: numbers and quotations must come from the cited items
  const sourceText = sourceItems.map((i) => `${i.title ?? ''} ${i.body ?? ''}`).join('\n');
  const allowed = numberKeys(sourceText);
  allowed.add(date.slice(0, 4));
  const imageFields = textFieldsOf(normaliseDesign(design));
  const texts = [{ where: 'caption', text: caption }, ...Object.entries(networkCaptions).map(([n, text]) => ({ where: `${n} caption`, text })), ...imageFields.map((f) => ({ where: `image text (${f.field})`, text: f.text }))];
  for (const { where, text } of texts) {
    const bad = unsourcedNumbers(text, allowed);
    if (bad.length) reasons.push(`${where} has ${bad.length === 1 ? 'a number' : 'numbers'} not found in its sources: ${bad.join(', ')}`);
    for (const q of quotesIn(text)) if (!quoteIsSourced(q, sourceText)) reasons.push(`${where} contains a quotation not found in its sources: "${q.slice(0, 60)}"`);
  }
  if (reasons.length) return { ok: false, reasons: reasons.map((x) => `${label}: ${x}`), repairs, post: null, imageSuggestion: raw.imageSuggestion };

  // limits per network
  const networks = {};
  for (const n of ctx.channels) {
    let text = networkCaptions[n] ?? caption;
    if (n === 'x' && len(text) > LIMITS.x.chars) {
      const cut = trimToLimit(text, LIMITS.x.chars);
      if (cut) { repairs.push(`X caption trimmed from ${len(text)} to ${len(cut)} characters at a sentence end`); text = cut; networkCaptions.x = cut; }
      else warnings.push(`X caption is ${len(text)} characters, X allows ${LIMITS.x.chars}`);
    } else if (len(text) > LIMITS[n].chars) warnings.push(`${n} caption is ${len(text)} characters, ${n} allows ${LIMITS[n].chars}`);
    if (LIMITS[n].hashtags && hashtags(text) > LIMITS[n].hashtags) warnings.push(`${n} caption has ${hashtags(text)} hashtags, ${n} allows ${LIMITS[n].hashtags}`);
    if (networkCaptions[n] !== undefined) networks[n] = { caption: networkCaptions[n] };
  }

  // style and source warnings (never block)
  for (const w of lintText(imageFields, 'feed', ctx.brand)) if (/long for/.test(w)) warnings.push(w);
  for (const f of imageFields) {
    if (/headline/.test(f.field) && isTitleCase(f.text)) warnings.push(`${f.field} looks like Title Case; the house style is sentence case`);
  }
  const us = usSpellings([caption, ...Object.values(networkCaptions), ...imageFields.map((f) => f.text)].join(' '));
  if (us.length) warnings.push(`possible US spelling (the house style is UK): ${us.join(', ')}`);
  const opts = { now: ctx.now };
  for (const i of sourceItems) {
    if (i.status !== 'confirmed') warnings.push(`uses unconfirmed item ${i.id}${i.title ? ` ("${String(i.title).slice(0, 50)}")` : ''}`);
    if (isStale(i, opts)) warnings.push(`uses a stale item ${i.id}${i.validUntil ? ` (valid until ${String(i.validUntil).slice(0, 10)})` : ''}`);
  }
  for (const pid of photoIds) {
    const p = ctx.byId.get(pid);
    if (needsRightsCheck(p)) warnings.push(`photo ${pid} needs its rights confirmed before this post can be approved`);
    if (p.status !== 'confirmed') warnings.push(`photo ${pid} is not confirmed`);
  }
  for (const w of Array.isArray(raw.warnings) ? raw.warnings : []) if (typeof w === 'string' && w.trim()) warnings.push(w.trim().slice(0, 200));

  const post = { id, date, ...(raw.time ? { time: raw.time } : {}), title: raw.title.trim(), caption, ...(Object.keys(networks).length ? { networks } : {}), design, sources, photoIds, warnings: [...new Set(warnings)] };
  return { ok: true, post, reasons: [], repairs, ...(imageReason && photoIds.length ? { imageReason } : {}), imageSuggestion: typeof raw.imageSuggestion === 'string' ? raw.imageSuggestion.slice(0, 300) : undefined };
}
