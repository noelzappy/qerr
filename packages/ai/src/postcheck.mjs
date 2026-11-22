// Checks one AI-written post against the vault and the engine's rules. Nothing a model wrote is trusted:
// it either passes here, is repaired in a way that is reported, or is rejected with reasons.
import { LIMITS, MEDIA_LIMITS, NETWORKS } from '@vesk/engine/networks';
import { foreignMoneyWarning, lintText, textFieldsOf } from '@vesk/engine/design/lint';
import { POSTER_TEMPLATES } from '@vesk/engine/design/spec';
import { normalisePostDesign, postDesignProblems, screenDeviceOf } from '@vesk/engine/design/layout';
import { layoutImageKind } from './context.mjs';
import { EMOJI_G, fixSpelling, isTitleCase, numberKeys, quoteIsSourced, quotesIn, trimToLimit, unsourcedNumbers, usSpellings } from './facts.mjs';
import { MEDIA_KINDS, foreignMoneyPattern, mentionsForeignMoney, unusableReason } from './vault.mjs';
import { POST_PAGES, seenText } from '@vesk/engine/design/post-spec';
import { applySeriesSlot, seriesMark, seriesRefProblems } from '@vesk/engine/design/series';
import { lookOfBrand } from '@vesk/engine/design/directions/index';
import { EMPHASIS_FIELDS, directionKinds, emphasisIn, kindBrief } from './direction.mjs';

// The drafting assistant may only use the poster pages (a real photo or a framed phone screen on a pale ground), a full-bleed photo,
// carousels of poster pages, and the brand's own layouts (template "layout", when the brand has some, as a post or as a carousel
// page). The older editorial templates
// stay in the engine for hand-written batches.
export const ALLOWED_TEMPLATES = [...POSTER_TEMPLATES, 'photo', 'carousel', 'layout'];
const ALLOWED_LIST = 'object, number, product, myth-fact or closing';
// The vault kind each template's image must have: a framed phone is a screen item, every other picture is a photo item.
const IMAGE_KIND = { product: 'screen', object: 'photo', number: 'photo', photo: 'photo', post: 'photo' };
const ID_OK = /^[A-Za-z0-9._-]+$/;
const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OK = /^([01]\d|2[0-3]):[0-5]\d$/;
const IMAGE_KEEP = new Set(['image', 'template', 'series', 'ground', 'accent', 'tick', 'layout', 'name', 'statusFill', 'kind', 'textAt', 'scrim', 'key']);
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
      else if (unusableReason(item, { now: ctx.now })) problems.push(`picture ${id} ${unusableReason(item, { now: ctx.now })}, so it cannot be used; choose a picture from the vault list`);
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

// Template rules the engine does not know: only poster pages (or the brand's layouts) inside a carousel, and the right kind of vault
// item behind each image.
function templateProblems(design, ctx) {
  // A brand with a design direction designs with the `post` template only: it says what the post is, the direction draws it. (A
  // carousel's pages cannot be `post` designs in the engine, so carousels are not offered to such a brand.)
  if (ctx.direction) {
    if (design.template === 'post') return [];
    if (design.template === 'carousel' && Array.isArray(design.pages)) {
      const bad = design.pages.map((p, i) => [p, i]).filter(([p]) => p?.template !== 'post');
      if (bad.length) return bad.map(([p, i]) => `carousel page ${i + 1} uses template "${String(p?.template).slice(0, 20)}", which is not allowed: this brand has the "${ctx.direction}" design direction, so every carousel page is a post page (template "post" and a kind)`);
      const max = maxPagesFor(ctx.channels);
      if (design.pages.length > max) return [`the carousel has ${design.pages.length} pages; ${max < POST_PAGES.max ? `X takes ${max} images in one post, so a carousel for these channels has at most ${max}` : `a carousel has at most ${max}`}. Use fewer body pages`];
      return [];
    }
    return [`template "${design.template}" is not allowed: this brand has the "${ctx.direction}" design direction, so every post is designed with template "post" and a kind (${directionKinds(ctx.direction, ctx.brand).join(', ')}), or as a carousel of post pages; the older templates are not used`];
  }
  if (design.template === 'post') return ['template "post" needs a brand with a design direction (style.direction), and this brand has none; use one of the other templates'];
  if (!ALLOWED_TEMPLATES.includes(design.template) || (design.template === 'layout' && !ctx.layouts?.length)) return [`template "${design.template}" is not allowed; use ${ALLOWED_LIST}, or photo or carousel${ctx.layouts?.length ? ', or layout with one of the brand\'s layouts' : ''}`];
  if (design.template !== 'carousel' || !Array.isArray(design.pages)) return [];
  const out = [];
  const layouts = ctx.layouts?.length > 0;
  design.pages.forEach((p, i) => {
    if (POSTER_TEMPLATES.includes(p?.template) || (layouts && p?.template === 'layout')) return;
    out.push(`carousel page ${i + 1} uses template "${p?.template}", which is not allowed; every page must be ${ALLOWED_LIST}${layouts ? ', or layout with one of the brand\'s layouts' : ''}`);
  });
  return out;
}

// The image of each page must be the right kind of vault item, and a screen must be the right kind of screen: a phone layout (the
// product template, a brand layout with a phone screen block) takes only a pre-framed phone capture, a desktop screen block only a
// plain screenshot. Which one a screen item is, the app works out from the stored file (item.framing: "phone" or "desktop");
// an item that says nothing is not judged here (the renderer still refuses a wrong one). There is no repair: no template the
// drafter may use takes the other kind with the same fields, so the post is rejected and the model is told why.
function imageKindProblems(design, ctx) {
  const pages = design.template === 'carousel' && Array.isArray(design.pages) ? design.pages.map((p, i) => [p, `carousel page ${i + 1}: `]) : [[design, '']];
  const out = [];
  // the pictures of a post's row of round pictures are photos
  if (design.template === 'post' && Array.isArray(design.gallery)) design.gallery.forEach((g, i) => {
    const item = vaultItemOf(g?.image, ctx);
    if (item && MEDIA_KINDS.includes(item.kind) && item.kind !== 'photo') out.push(`gallery[${i}] needs a vault photo, but ${item.id} is a ${item.kind}; pick a photo item instead`);
  });
  for (const [p, at] of pages) {
    const want = p?.template === 'layout' ? layoutImageKind(ctx.layouts?.find((l) => l.id === p.layout)) : IMAGE_KIND[p?.template], item = vaultItemOf(p?.image, ctx);
    if (!want || !item || !MEDIA_KINDS.includes(item.kind)) continue;
    if (item.kind !== want) {
      out.push(`${at}${p.template} needs a vault item of kind ${want} as its image, but ${item.id} is a ${item.kind}; ${want === 'screen' ? 'pick a framed phone screen' : 'pick a photo'} item instead`);
      continue;
    }
    const device = item.kind === 'screen' ? screenDeviceOf(p, ctx.layouts) : null;
    if (device && ['phone', 'desktop'].includes(item.framing) && item.framing !== device) {
      out.push(device === 'phone'
        ? `${at}${p.template === 'layout' ? `layout "${p.layout}"` : p.template} shows a pre-framed phone capture, but ${item.id} is a desktop screenshot (no phone around it); pick a screen item marked "phone screen, framed", or a layout whose picture is a desktop screenshot`
        : `${at}layout "${p.layout}" shows a desktop screenshot, but ${item.id} is a pre-framed phone capture; pick a screen item marked "desktop screenshot", or a layout or template that shows a phone`);
    }
  }
  return out;
}

// The most pages a carousel may have for these channels: the fewest images any of them takes in one post (Instagram 10, X 4).
export const maxPagesFor = (channels) => Math.min(POST_PAGES.max, ...(Array.isArray(channels) ? channels : []).map((n) => MEDIA_LIMITS[n] ?? Infinity));
// The kind a design counts as for "never three in a row": a post's kind; a carousel is its own kind.
export const kindOfDesign = (d) => (d?.template === 'carousel' ? 'carousel' : d?.kind);

// Every image of a design in page order (a carousel's pages, or the one image), repeats kept.
// (a post's row of round pictures counts too, each picture after the post's own)
function imageIdsOf(design, ctx) {
  const pages = design.template === 'carousel' && Array.isArray(design.pages) ? design.pages : [design];
  return pages.flatMap((p) => [p?.image, ...(Array.isArray(p?.gallery) ? p.gallery.map((g) => g?.image) : [])]).map((im) => vaultItemOf(im, ctx)?.id).filter(Boolean);
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

// The engine's own checks of a design block: a brand layout's (a post or a carousel page) against the fields it declares, the rest
// against the templates.
// (a brand whose direction is its own look written as data is held to that look's compositions)
const designProblems = (design, ctx) => postDesignProblems(design, 'design', { layouts: ctx.layouts ?? [], series: ctx.seriesKeys, direction: ctx.direction ?? null, look: lookOfBrand(ctx.brand) ?? undefined });

// A `post` design (a brand with a design direction): the kind must be one its direction can draw, only fields that kind's
// compositions draw, every text within its budget, at most one emphasis phrase (1 to 4 words, never the whole text), and no
// `variant` (checkPost removes one; the engine varies it). Everything else is the engine's own validator
// (designProblems). Returns a list of problems.
function postKindProblems(design, ctx) {
  if (design.template === 'carousel' && Array.isArray(design.pages)) return design.pages.flatMap((p, i) => (p?.template === 'post' ? onePostKindProblems(p, ctx).map((x) => `carousel page ${i + 1}: ${x}`) : []));
  return onePostKindProblems(design, ctx);
}
function onePostKindProblems(design, ctx) {
  const out = [], d = design;
  if (d.template !== 'post') return out;
  const brief = ctx.direction ? kindBrief(ctx.direction, d.kind, ctx.brand) : null;
  if (!brief) {
    if (ctx.direction && typeof d.kind === 'string') out.push(`kind "${String(d.kind).slice(0, 20)}" cannot be drawn in the "${ctx.direction}" direction; use one of: ${directionKinds(ctx.direction, ctx.brand).join(', ')}`);
    return out;
  }
  const visible = (v) => [...seenText(v)].length;
  // A look written as data lists variants: one a post names is held to that variant's own fields and budgets.
  const variant = d.variant !== undefined && brief.variants ? brief.variants[d.variant] : undefined;
  if (d.variant !== undefined && brief.variants && !variant) out.push(`a ${d.kind} post has variants 0 to ${brief.variants.length - 1}, not ${JSON.stringify(d.variant).slice(0, 12)}; use one of them or leave variant out`);
  if (variant) for (const [f, o] of Object.entries(variant.fields)) if (o.required && d[f] === undefined && f !== 'image') out.push(`the ${variant.name} variant of ${d.kind} needs ${f}`);
  for (const [f, v] of Object.entries(d)) {
    if (['template', 'kind', 'variant', 'sizes', 'name', 'networkSizes', 'focal', 'zoom'].includes(f)) continue;
    if (f === 'image') { if (!brief.fields.image) out.push(`a ${d.kind} post does not draw a picture; remove image (only these kinds do: ${directionKinds(ctx.direction, ctx.brand).filter((k) => kindBrief(ctx.direction, k, ctx.brand).fields.image).join(', ') || 'none'})`); continue; }
    const spec = brief.fields[f];
    if (variant && !variant.fields[f] && spec) { out.push(`the ${variant.name} variant of ${d.kind} does not draw ${f}; remove it or choose another variant (it takes: ${Object.keys(variant.fields).join(', ')})`); continue; }
    if (!spec) { out.push(`a ${d.kind} post does not draw ${f}; remove it (this kind takes: ${Object.keys(brief.fields).join(', ')})`); continue; }
    if (f === 'items') {
      if (Array.isArray(v)) v.forEach((t, i) => { if (typeof t === 'string' && visible(t) > spec.chars) out.push(`items[${i}] is ${visible(t)} characters; this direction draws items of at most ${spec.chars}. Shorten it and keep the items parallel in length`); });
      continue;
    }
    // an info block and a row of round pictures: within the design's own counts (a named variant's, else any that draws one)
    if (f === 'info' || f === 'gallery') {
      if (!Array.isArray(v)) continue;
      const own = variant?.fields[f], lo = own?.min ?? spec.min, hi = own?.max ?? spec.max;
      if (v.length < lo || v.length > hi) out.push(`${f} has ${v.length} ${f === 'info' ? 'rows' : 'pictures'}; a ${d.kind} post${variant ? ` in the ${variant.name} variant` : ''} draws ${lo} to ${hi}`);
      v.forEach((e, i) => {
        const t = f === 'info' ? e?.value : e?.caption;
        if (typeof t === 'string' && visible(t) > spec.chars) out.push(`${f}[${i}].${f === 'info' ? 'value' : 'caption'} is ${visible(t)} characters; the most is ${spec.chars}. Shorten it`);
      });
      continue;
    }
    // a chart: a kind the design draws, within its point counts (the engine checks its shape, its numbers and its labels)
    if (f === 'chart') {
      if (!isObj(v) || !Array.isArray(v.series)) continue;
      const own = variant?.fields.chart, kinds = own?.kinds ?? spec.kinds ?? [], lo = own?.min ?? spec.min, hi = own?.max ?? spec.max;
      if (v.kind !== undefined && !kinds.includes(v.kind)) out.push(`the chart's kind is not one a ${d.kind} post${variant ? ` in the ${variant.name} variant` : ''} draws; use one of ${kinds.join(', ')}`);
      if (v.series.length > 1 && (v.series.length < lo || v.series.length > hi)) out.push(`the chart has ${v.series.length} points; a ${d.kind} post${variant ? ` in the ${variant.name} variant` : ''} draws ${lo} to ${hi}`);
      continue;
    }
    if (typeof v !== 'string') continue;
    // [[pill]] words and {{icon}} marks only where the look draws them (the engine checks their form)
    if (f === 'headline') {
      if (/\[\[/.test(v) && !spec.pills) out.push(`the headline has [[pill]] words, but no ${d.kind} design of this look draws pills; remove the [[ ]] brackets`);
      if (/\{\{/.test(v) && !spec.icons) out.push(`the headline has {{icon}} marks, but no ${d.kind} design of this look draws icons; remove them`);
    }
    const budget = variant?.fields[f]?.max ?? spec.budget;
    if (budget && visible(v) > budget) out.push(`${f} is ${visible(v)} characters; a ${d.kind} post${variant ? ` in the ${variant.name} variant` : ''} in the "${ctx.direction}" direction draws at most ${budget}. Shorten it to about ${Math.max(10, Math.floor(budget * 0.75))}`);
    const marks = emphasisIn(v);
    if (EMPHASIS_FIELDS.includes(f)) {
      const stars = (v.match(/\*/g) ?? []).length;
      if (stars % 2 || marks.length > 1) out.push(`${f} has ${marks.length > 1 ? 'more than one emphasis phrase' : 'an unpaired asterisk'}; mark exactly one phrase of 1 to 4 words with *asterisks*`);
      else if (marks.length === 1) {
        const words = marks[0].trim().split(/\s+/).filter(Boolean).length;
        if (!words || words > 4) out.push(`the emphasis in ${f} is ${words} words; mark a phrase of 1 to 4 words`);
        else if (visible(marks[0]) >= visible(v)) out.push(`the emphasis in ${f} is the whole text; mark only a phrase of 1 to 4 words`);
      }
    } else if (hasStar(v)) out.push(`${f} has asterisks; only headline and quote take an *emphasis* phrase`);
  }
  return out;
}
const hasStar = (v) => typeof v === 'string' && v.includes('*');
// The charts of a design (a post's, or each post page's of a carousel) that have a series to read.
const chartsOf = (design) => (design.template === 'carousel' && Array.isArray(design.pages) ? design.pages : [design]).map((p) => p?.chart).filter((c) => isObj(c) && Array.isArray(c.series));
const ILLUSTRATIVE = /\billustrative\b/i;

// Never the same kind three posts running (in date order): ctx.kinds is the kinds of the posts already accepted, { date, time?, kind }.
function kindRunProblems(design, date, ctx) {
  const kind = kindOfDesign(design);
  if ((design.template !== 'post' && kind !== 'carousel') || !Array.isArray(ctx.kinds) || !ctx.kinds.length || typeof date !== 'string') return [];
  const all = [...ctx.kinds, { date, time: '', kind, self: true }].sort((a, b) => `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`));
  const at = all.findIndex((x) => x.self);
  for (let s = Math.max(0, at - 2); s <= at && s + 2 < all.length; s++) {
    if (all[s].kind === all[s + 1].kind && all[s + 1].kind === all[s + 2].kind) return [`three posts in a row (by date) would be ${kind === 'carousel' ? 'carousels' : `"${kind}" posts`}; choose a different kind for this one`];
  }
  return [];
}

// A post of a named series. raw.series is a slug (a draft: the post takes the plan's open slot of that series, ctx.seriesSlots, on its date
// or else the earliest) or { slug, number } (a rewrite of a post already in a series, ctx.seriesList when known). The app, never the model,
// sets the slot's date, the composition and the mark; the model writes the words. -> { problems, repairs, design?, ref?, date? }
function seriesOfPost(raw, design, date, ctx) {
  const out = { problems: [], repairs: [] };
  if (typeof raw.series === 'string') {
    const open = (ctx.seriesSlots ?? []).filter((s) => s.slug === raw.series);
    if (!open.length) { out.problems.push(`series "${raw.series.slice(0, 40)}" has no open slot in this batch; use a series from seriesPlan, or leave series out`); return out; }
    const slot = open.find((s) => s.date === date) ?? open[0];
    if (design?.template !== 'post') out.problems.push(`a "${slot.name}" post is a single ${slot.kind} post (template "post"), not a ${design?.template === 'carousel' ? 'carousel' : 'design of another template'}`);
    else if (design.kind !== slot.kind) out.problems.push(`"${slot.name}" posts are ${slot.kind} posts; write this one as kind "${slot.kind}"`);
    if (out.problems.length) return out;
    const field = slot.markField ?? 'label';
    if (slot.mark !== undefined && design[field] !== undefined && design[field] !== slot.mark) out.repairs.push(`${field} set to the series mark "${slot.mark}"`);
    if (slot.date !== date) out.repairs.push(`date moved from ${date} to ${slot.date}, the date of "${slot.name}" #${slot.number}`);
    return { ...out, design: applySeriesSlot(design, slot), ref: { slug: slot.slug, number: slot.number }, date: slot.date };
  }
  const p = seriesRefProblems(raw.series, 'series');
  if (p.length) return { ...out, problems: p };
  const ref = { slug: raw.series.slug, number: raw.series.number }, known = (ctx.seriesList ?? []).find((s) => s.slug === ref.slug);
  const mark = known?.mark && design?.template === 'post' ? { [known.markField ?? 'label']: seriesMark(known.mark, ref.number) } : {};
  return { ...out, design: { ...design, ...mark }, ref, date };
}

// checkPost(raw, ctx) ->{ ok, post, reasons, repairs, imageSuggestion }
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
  for (const i of sourceItems) {
    const why = unusableReason(i, { now: ctx.now });
    if (why) reasons.push(`source ${i.id}${i.title ? ` ("${String(i.title).slice(0, 50)}")` : ''} ${why}, so a post may not cite it; use only the items in the vault list`);
  }

  // design: template list, images, engine validation
  let design = raw.design;
  let photoIds = [], series, seriesDate;
  if (!isObj(design)) reasons.push('design block is missing');
  else if (templateProblems(design, ctx).length) reasons.push(...templateProblems(design, ctx));
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
    if (!r.problems.length) {
      const dropVariant = (p) => { if (p?.template !== 'post' || p.variant === undefined || kindBrief(ctx.direction, p.kind, ctx.brand)?.variants) return p; const { variant: _v, ...rest } = p; repairs.push('variant removed: the design direction chooses the variant itself'); return rest; };
      design = design.template === 'carousel' && Array.isArray(design.pages) ? { ...design, pages: design.pages.map(dropVariant) } : dropVariant(design);
      // a post of a named series: the app sets its date, kind, design and mark from the plan (never the model)
      if (raw.series !== undefined) {
        const s = seriesOfPost(raw, design, date, ctx);
        if (s.problems.length) reasons.push(...s.problems);
        else { design = s.design; series = s.ref; seriesDate = s.date; repairs.push(...s.repairs); }
      }
      const engine = designProblems(design, ctx);
      reasons.push(...engine);
      if (!engine.length && (design.template === 'post' || (ctx.direction && design.template === 'carousel'))) reasons.push(...postKindProblems(design, ctx), ...kindRunProblems(design, seriesDate ?? date, ctx));
    }
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
  const revalid = designProblems(design, ctx);
  if (revalid.length) return { ok: false, reasons: revalid.map((x) => `${label}: ${x}`), repairs, post: null };

  // claims: numbers and quotations must come from the cited items
  const sourceText = sourceItems.map((i) => `${i.title ?? ''} ${i.body ?? ''}`).join('\n');
  const allowed = numberKeys(sourceText);
  allowed.add(date.slice(0, 4));
  // the series number is the app's own count, not a claim
  if (series) for (const k of numberKeys(String(series.number))) allowed.add(k);
  const imageFields = textFieldsOf(normalisePostDesign(design, ctx.layouts));
  const texts = [{ where: 'caption', text: caption }, ...Object.entries(networkCaptions).map(([n, text]) => ({ where: `${n} caption`, text })), ...imageFields.map((f) => ({ where: `image text (${f.field})`, text: f.text }))];
  for (const { where, text } of texts) {
    const bad = unsourcedNumbers(text, allowed);
    if (bad.length) reasons.push(`${where} has ${bad.length === 1 ? 'a number' : 'numbers'} not found in its sources: ${bad.join(', ')}`);
    for (const q of quotesIn(text)) if (!quoteIsSourced(q, sourceText)) reasons.push(`${where} contains a quotation not found in its sources: "${q.slice(0, 60)}"`);
  }
  // a chart's numbers are claims like the figures: every value (and a total) must be in a cited item; data a cited item calls illustrative
  // is said to be illustrative on the image and in the caption, as figures are (for example "Illustrative figures." in the sub line)
  const charts = chartsOf(design);
  if (charts.length) {
    const nums = charts.flatMap((c) => [...c.series.map((pt) => pt?.value), ...(c.total !== undefined ? [c.total] : [])]).filter((x) => typeof x === 'number' && Number.isFinite(x));
    const missing = [...new Set(nums.map((x) => String(Number(Math.abs(x).toPrecision(12)))).filter((k) => !allowed.has(k)))];
    if (missing.length) reasons.push(`the chart has ${missing.length === 1 ? 'a number' : 'numbers'} not found in its sources: ${missing.slice(0, 6).join(', ')}; draw only numbers a cited item gives`);
    if (ILLUSTRATIVE.test(sourceText)) {
      if (!imageFields.some((f) => ILLUSTRATIVE.test(String(f.text)))) reasons.push('the chart\'s numbers come from items that call them illustrative; say so on the image, as figures are (for example "Illustrative figures." in the sub line)');
      if (![caption, ...Object.values(networkCaptions)].every((t) => ILLUSTRATIVE.test(String(t)))) reasons.push('the chart\'s numbers come from items that call them illustrative; say so in the caption too');
    }
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
  for (const w of lintText(imageFields, 'feed', ctx.brand)) if (/long for|mentions another currency/.test(w)) warnings.push(w);
  // Another currency than the brand's in a caption (the image text is covered by lintText above). A fact the post cites may
  // carry it, so it is a warning a person reads before approving, not a rejection.
  for (const { where, text } of [{ where: 'caption', text: caption }, ...Object.entries(networkCaptions).map(([n, text]) => ({ where: `${n} caption`, text }))]) {
    const w = foreignMoneyWarning(where, text, ctx.brand);
    if (w) warnings.push(w);
  }
  for (const f of imageFields) {
    if (/headline/.test(f.field) && isTitleCase(f.text)) warnings.push(`${f.field} looks like Title Case; the house style is sentence case`);
  }
  const us = usSpellings([caption, ...Object.values(networkCaptions), ...imageFields.map((f) => f.text)].join(' '));
  if (us.length) warnings.push(`possible US spelling (the house style is UK): ${us.join(', ')}`);
  for (const w of Array.isArray(raw.warnings) ? raw.warnings : []) if (typeof w === 'string' && w.trim()) warnings.push(w.trim().slice(0, 200));

  const post = { id, date: seriesDate ?? date, ...(series ? { series } : {}), ...(raw.time ? { time: raw.time } : {}), title: raw.title.trim(), caption, ...(Object.keys(networks).length ? { networks } : {}), design, sources, photoIds, warnings: [...new Set(warnings)] };
  return { ok: true, post, reasons: [], repairs, ...(imageReason && photoIds.length ? { imageReason } : {}), imageSuggestion: typeof raw.imageSuggestion === 'string' ? raw.imageSuggestion.slice(0, 300) : undefined };
}
