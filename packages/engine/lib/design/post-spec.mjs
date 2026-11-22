// The `post` template's design block: { "template": "post", "kind": "figure", "variant"?: 0, ...fields }. A post says WHAT it is (a
// kind) and gives its words; the brand's direction (brand.json style.direction) decides how it is composed. Pure: no Chrome, no files
// (the picture is checked when rendering). Spec text is untrusted: every limit is enforced here, and again nowhere else is needed
// because compositions only ever write these fields through their escaping helpers (lib/design/directions/kit.mjs).
import path from 'node:path';
import { DIRECTIONS, POST_KINDS } from './tokens.mjs';
import { ICON_NAMES } from './icons.mjs';

export { POST_KINDS };
export const POST_TEMPLATES = ['post'];
export const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
// The fields of a post, with their limits. Lengths count what is seen: the asterisks of an emphasis and the line breaks do not count.
export const POST_FIELDS = {
  label: { max: 28 }, headline: { max: 70, emphasis: true }, sub: { max: 140 }, big: { max: 8 }, unit: { max: 24 },
  quote: { max: 160 }, by: { max: 40 }, meta: { max: 40 }, tag: { max: 16 }, cta: { max: 24 },
};
export const POST_ITEMS = { min: 2, max: 5, chars: 44 };
// An info block: 1 to 4 labelled rows ({ key, value }), the key one of a fixed list of words (never free text), the value one line of up to 40
// characters. A row of round pictures (gallery): 2 to 5 { image, caption? }, the caption one line of up to 24 characters (a name, a product).
export const POST_INFO = { min: 1, max: 4, value: 40 };
export const INFO_KEYS = ['When', 'Where', 'Date', 'Time', 'Place', 'Book on', 'Tickets', 'Price', 'Entry', 'Who', 'Host', 'Call', 'Online', 'Starts', 'Ends', 'Open'];
export const POST_GALLERY = { min: 2, max: 5, caption: 24 };
// A single portrait picture (avatar) of the person a quotation is by: { image, focal? }, one picture read and checked like `image`, cropped by the
// look's avatar element (round, square or rounded) round its focal point. Whether a face may be shown is the picture's own record (the app's
// rights and consent rule, the AI's usable pictures); the engine checks the shape here and the file when the page is made.
export const POST_AVATAR = Object.freeze({ keys: ['image', 'focal'] });
// The lists of a post counted by entries: { min, max } of each (a look's composition may narrow them).
export const POST_LISTS = { items: POST_ITEMS, info: POST_INFO, gallery: POST_GALLERY };
// The fields that are a picture (no length; the file is read and checked when the page is made).
export const PICTURE_FIELDS = Object.freeze(['image', 'avatar']);

// The inline marks of a headline, besides its *emphasis*: [[words]] sets one to three words in a pill, {{name}} places an icon of the engine's
// fixed set (icons.mjs). At most INLINE.pills pills and INLINE.icons icons; a pill holds plain words only (no emphasis, icon or bracket), an
// emphasis holds no pill or icon. Only the headline takes them. A composition that draws no pills shows the words plainly and leaves icons out.
export const INLINE = Object.freeze({ fields: ['headline'], pills: 2, icons: 2, pillWords: 3, pillChars: 24 });
export const pillMarks = () => /\[\[([^[\]*{}\n\\]{1,40})\]\]/g;
export const iconMarks = () => /\{\{([a-z][a-z-]{0,19})\}\}/g;
const STRAY = /\[\[|\]\]|\{\{|\}\}/;
// The words of a text without its inline marks (an icon leaves nothing), and what is seen of it for counting (an icon counts as two characters).
export const withoutMarks = (v) => String(v).replace(iconMarks(), '').replace(pillMarks(), '$1').replace(/ {2,}/g, ' ');
export const seenText = (v) => String(v).replace(iconMarks(), '■■').replace(pillMarks(), '$1').replace(/\*/g, '').replace(/\\n|\n/g, '');

// The problems of the inline marks of one text of a post (sentences without a place; empty when fine).
export function markProblems(text, field) {
  if (typeof text !== 'string') return [];
  if (!INLINE.fields.includes(field)) return STRAY.test(text) ? [`${field} takes no [[pill]] words or {{icon}} marks; only the headline does`] : [];
  const out = [], pills = [...text.matchAll(pillMarks())], icons = [...text.matchAll(iconMarks())];
  const rest = text.replace(pillMarks(), 'x').replace(iconMarks(), 'x');
  if (STRAY.test(rest)) out.push(`${field} has a [[ or {{ that is not closed, or marks something a mark cannot hold (a pill is [[one to three plain words]], an icon is {{name}})`);
  if (pills.length > INLINE.pills) out.push(`${field} has ${pills.length} pills; the most is ${INLINE.pills}`);
  for (const p of pills) {
    const words = p[1].trim().split(/\s+/).filter(Boolean);
    if (!words.length) out.push(`${field} has an empty pill`);
    else if (words.length > INLINE.pillWords) out.push(`a pill in ${field} holds ${words.length} words; a pill holds 1 to ${INLINE.pillWords}`);
    else if ([...p[1].trim()].length > INLINE.pillChars) out.push(`a pill in ${field} is ${[...p[1].trim()].length} characters; the most is ${INLINE.pillChars}`);
  }
  if (pills.length && !withoutMarks(text.replace(pillMarks(), '')).replace(/[*\s]|\\n/g, '')) out.push(`the pills in ${field} are the whole text; set only one to three words in a pill`);
  if (icons.length > INLINE.icons) out.push(`${field} has ${icons.length} icons; the most is ${INLINE.icons}`);
  for (const m of icons) if (!ICON_NAMES.includes(m[1])) out.push(`{{${m[1]}}} in ${field} is not one of the icons (${ICON_NAMES.join(', ')})`);
  for (const m of text.matchAll(/\*([^*]+)\*/g)) if (/\[\[|\{\{/.test(m[1])) { out.push(`the *emphasis* in ${field} holds a pill or an icon; keep them apart`); break; }
  return out;
}
export const MAX_VARIANT = 9;
// What every kind needs, by field (a list is "items").
export const POST_REQUIRED = {
  statement: ['headline'], figure: ['big'], list: ['headline', 'items'], quote: ['quote'], photo: ['image', 'headline'], event: ['headline', 'meta'], offer: ['headline', 'tag'],
};
// The keys a post design may carry besides its fields (a batch's file name and sizes, the network sizes).
const OWN = ['template', 'kind', 'variant', 'sizes', 'name', 'networkSizes', 'image', 'focal', 'zoom', 'items', 'graphics', 'info', 'gallery', 'avatar'];
// The brand graphics and cut-outs a post hands to its look (the app fills this from the vault for the graphics the look's pieces name):
// [{ ref: the vault item's id, image: a PNG or WebP file with transparency, tintable: whether a piece may recolour it }]. Checked here by
// shape; the files are read and checked (type, size, transparency) when the page is made (render.mjs preparePage).
export const POST_GRAPHICS = Object.freeze({ max: 6, exts: ['.png', '.webp'] });
const GRAPHIC_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function graphicsProblems(list, where) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > POST_GRAPHICS.max) return [`${where}: graphics must be a list of up to ${POST_GRAPHICS.max} { ref, image, tintable }`];
  const e = [], refs = new Set();
  list.forEach((g, i) => {
    const w = `${where}: graphics[${i}]`;
    if (!g || typeof g !== 'object' || Array.isArray(g)) return e.push(`${w} must be an object with ref (the vault id), image (the file) and tintable`);
    for (const k of Object.keys(g)) if (!['ref', 'image', 'tintable'].includes(k)) e.push(`${w}: "${clip(k).replace(/[^A-Za-z0-9 ._-]/g, '?')}" is not a setting of a graphic (ref, image, tintable)`);
    if (typeof g.ref !== 'string' || !GRAPHIC_REF.test(g.ref)) e.push(`${w}: ref must be the id of a vault picture (a lowercase UUID)`);
    else if (refs.has(g.ref)) e.push(`${w}: the same graphic is listed twice`);
    else refs.add(g.ref);
    if (typeof g.image !== 'string' || !g.image.trim() || g.image.includes('\0')) e.push(`${w}: image must be a file path`);
    // the file is read from disk when the page is made: only a path relative to the repository that stays inside it (never absolute, never "..")
    else if (path.isAbsolute(g.image) || path.win32.isAbsolute(g.image) || g.image.split(/[\\/]/).includes('..')) e.push(`${w}: image must be a path relative to the repository that stays inside the repository`);
    else if (!POST_GRAPHICS.exts.includes(path.extname(g.image).toLowerCase())) e.push(`${w}: image must be a PNG or WebP file (${POST_GRAPHICS.exts.join(' ')}) with a transparent background`);
    if (g.tintable !== undefined && typeof g.tintable !== 'boolean') e.push(`${w}: tintable must be true or false`);
  });
  return e;
}
export const POST_KEYS = [...OWN, ...Object.keys(POST_FIELDS)];

const seen = (v) => seenText(v);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clip = (v) => String(v).slice(0, 40);
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// Problems of a post design (a list of texts, empty when fine). opts.direction: the brand's direction when known (null: none, so a
// post is refused; undefined: not known here, so only the design itself is judged); focalOk(f): the spec's focal checker.
// brief: lookBrief(look) of a look written as data when the brand's direction is one (then kind, variant and the word budgets are held to
// the look's own compositions, and `direction` is not looked up among the engine's).
export function postProblems(d, where = 'design', { direction, focalOk, brief } = {}) {
  const e = [];
  if (!POST_KINDS.includes(d.kind)) e.push(`${where}: kind must be one of ${POST_KINDS.join(', ')} (got "${clip(d.kind)}")`);
  if (brief) e.push(...briefProblems(d, where, brief));
  if (brief) { /* the look is the direction */ } else if (direction === null) e.push(`${where}: a post is drawn in the brand's design direction, and this brand has none; set style.direction in brand.json to one of ${DIRECTIONS.join(', ')} (Settings, Brand and look)`);
  else if (direction !== undefined && !DIRECTIONS.includes(direction)) e.push(`${where}: the brand's design direction "${clip(direction)}" is not one of ${DIRECTIONS.join(', ')}`);
  for (const k of Object.keys(d)) if (!POST_KEYS.includes(k)) e.push(`${where}: "${clip(k)}" is not a field of a post (fields: ${[...Object.keys(POST_FIELDS), 'items', 'info', 'gallery', 'avatar', 'image', 'focal', 'zoom'].join(', ')}; also kind, variant)`);
  if (d.variant !== undefined && !(Number.isInteger(d.variant) && d.variant >= 0 && d.variant <= MAX_VARIANT)) e.push(`${where}: variant must be a whole number from 0 to ${MAX_VARIANT} (leave it out and the post picks one itself)`);
  for (const [f, { max }] of Object.entries(POST_FIELDS)) {
    const v = d[f];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !v.trim()) { e.push(`${where}: ${f} must be a non-empty text`); continue; }
    if (f !== 'headline' && f !== 'quote' && f !== 'sub' && /[\r\n]|\\n/.test(v)) e.push(`${where}: ${f} must be one line`);
    const n = [...seen(v)].length;
    if (n > max) e.push(`${where}: ${f} is ${n} characters; the most is ${max}`);
    for (const p of markProblems(v, f)) e.push(`${where}: ${p}`);
  }
  if (d.items !== undefined) {
    const { min, max, chars } = POST_ITEMS;
    if (!Array.isArray(d.items) || d.items.length < min || d.items.length > max) e.push(`${where}: items must be a list of ${min} to ${max} short texts`);
    else d.items.forEach((t, i) => {
      if (typeof t !== 'string' || !t.trim()) e.push(`${where}: items[${i}] must be a non-empty text`);
      else if (/[\r\n]|\\n/.test(t)) e.push(`${where}: items[${i}] must be one line`);
      else if ([...seen(t)].length > chars) e.push(`${where}: items[${i}] is ${[...seen(t)].length} characters; the most is ${chars}`);
      else if (markProblems(t, 'items').length) e.push(`${where}: items[${i}] takes no [[pill]] words or {{icon}} marks; only the headline does`);
    });
  }
  e.push(...infoProblems(d.info, where), ...galleryProblems(d.gallery, where), ...avatarProblems(d.avatar, where, focalOk));
  if (d.image !== undefined) {
    if (typeof d.image !== 'string' || !d.image.trim()) e.push(`${where}: image must be a file path`);
    else if (!IMAGE_EXTS.includes(path.extname(d.image).toLowerCase())) e.push(`${where}: image "${clip(d.image)}" must be ${IMAGE_EXTS.join(' ')}`);
  }
  if (d.focal !== undefined && focalOk && !focalOk(d.focal)) e.push(`${where}: focal must look like "60% 40%", "center", "left top" or { "x": 0.6, "y": 0.4 }`);
  if (d.zoom !== undefined && !isNum(d.zoom, 1, 3)) e.push(`${where}: zoom must be a number from 1 to 3`);
  e.push(...graphicsProblems(d.graphics, where));
  for (const f of POST_REQUIRED[d.kind] ?? []) if (d[f] === undefined) e.push(`${where}: a ${d.kind} post needs ${f}`);
  return e;
}

// A carousel of post pages: { "template": "carousel", "pages": [ { "template": "post", "kind": ..., ...fields }, ... ] }. Each page is a
// post design drawn by the brand's look, one image per page, in order: the first page is the cover, the last the closing page (their place
// is their role; nothing else marks it). The carousel itself carries only what names and sizes its files.
export const POST_CAROUSEL_KEYS = ['template', 'pages', 'sizes', 'name', 'networkSizes'];
export const POST_PAGES = { min: 2, max: 10 };
// Keys a page leaves to its carousel (one file name stem and one size for every page).
const PAGE_OWN = ['sizes', 'name', 'networkSizes'];
const isObjLike = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Whether a design is (or holds) a post design: a post, or a carousel with a post page.
export const usesPostTemplate = (d) => isObjLike(d) && (d.template === 'post' || (d.template === 'carousel' && Array.isArray(d.pages) && d.pages.some((p) => isObjLike(p) && p.template === 'post')));
export const isPostCarousel = (d) => isObjLike(d) && d.template === 'carousel' && usesPostTemplate(d);

// Problems of a carousel of post pages (a list of texts). opts as for postProblems; every page is held to them.
export function postCarouselProblems(d, where = 'design', opts = {}) {
  const e = [];
  for (const k of Object.keys(d)) if (!POST_CAROUSEL_KEYS.includes(k)) e.push(`${where}: "${clip(k)}" is not used by a carousel of post pages (each page carries its own words; the carousel takes ${POST_CAROUSEL_KEYS.slice(1).join(', ')})`);
  const { min, max } = POST_PAGES;
  if (!Array.isArray(d.pages) || d.pages.length < min || d.pages.length > max) return [...e, `${where}: pages needs ${min} to ${max} pages (a cover, body pages and a closing page)`];
  d.pages.forEach((p, i) => {
    const pw = `${where} page ${i + 1}`;
    if (!isObjLike(p) || p.template !== 'post') return e.push(`${pw}: every page of this carousel must be a post page ({"template": "post", "kind": ...}), not ${isObjLike(p) ? `"${clip(p.template)}"` : 'that'}; pages of the older templates and post pages do not mix`);
    for (const k of PAGE_OWN) if (p[k] !== undefined) e.push(`${pw}: ${k} belongs to the carousel, not to a page`);
    e.push(...postProblems(p, pw, opts));
  });
  return e;
}

// Kind, variant and word budgets of a post against the brief of a look written as data (look.mjs lookBrief): a kind the look has no composition for is
// refused; a named variant must exist and holds the post to its own budgets; with no variant a field must fit the roomiest composition of the kind.
function briefProblems(d, where, brief) {
  const e = [], kinds = brief?.kinds ?? {}, name = clip(brief?.name ?? brief?.id ?? 'look');
  if (!POST_KINDS.includes(d.kind)) return e;
  const entry = Object.hasOwn(kinds, d.kind) ? kinds[d.kind] : null;
  if (!entry || !entry.variants.length) return [`${where}: the ${name} look has no ${d.kind} composition (it draws ${Object.keys(kinds).join(', ') || 'nothing'})`];
  const vs = entry.variants;
  let pool = vs;
  if (d.variant !== undefined && Number.isInteger(d.variant) && d.variant >= 0) {
    if (d.variant >= vs.length) return [`${where}: the ${name} look has ${vs.length} ${d.kind} variant${vs.length === 1 ? '' : 's'} (0 to ${vs.length - 1}), not ${d.variant}`];
    pool = [vs[d.variant]];
  }
  for (const [f, { max }] of Object.entries(POST_FIELDS)) {
    if (typeof d[f] !== 'string') continue;
    const budgets = pool.map((v) => v.fields?.[f]?.max).filter((m) => Number.isFinite(m));
    if (!budgets.length) continue;
    const room = Math.max(...budgets), n = [...seen(d[f])].length;
    if (n > room && n <= max) e.push(`${where}: ${f} is ${n} characters; the ${name} look draws it with up to ${room}`);
  }
  for (const [f, base] of Object.entries(POST_LISTS)) {
    if (!Array.isArray(d[f])) continue;
    // items keep the old rule (every variant counts); an info block or a row of pictures is judged on the variants that draw one
    const drawing = f === 'items' ? pool : pool.filter((v) => v.fields?.[f]);
    if (!drawing.length) continue;
    const lo = Math.min(...drawing.map((v) => v.fields?.[f]?.min ?? base.min)), hi = Math.max(...drawing.map((v) => v.fields?.[f]?.max ?? base.max));
    if (d[f].length < lo || d[f].length > hi) e.push(`${where}: the ${name} look draws ${lo} to ${hi} ${f === 'gallery' ? 'pictures in a row' : f === 'info' ? 'info rows' : 'items'}, not ${d[f].length}`);
  }
  return e;
}

// One line of plain words: a non-empty text, one line, at most max seen characters, no inline marks. Returns a problem or null.
function lineProblem(v, what, max) {
  if (typeof v !== 'string' || !v.trim()) return `${what} must be a non-empty text`;
  if (/[\r\n]|\\n/.test(v)) return `${what} must be one line`;
  if (/\*|\[\[|\]\]|\{\{|\}\}/.test(v)) return `${what} takes no *emphasis*, [[pill]] or {{icon}} marks`;
  const n = [...seen(v)].length;
  return n > max ? `${what} is ${n} characters; the most is ${max}` : null;
}
// The rows of an info block: [{ key, value }], the key from INFO_KEYS (never echoed back), each key once.
function infoProblems(info, where) {
  if (info === undefined) return [];
  const { min, max, value } = POST_INFO;
  if (!Array.isArray(info) || info.length < min || info.length > max) return [`${where}: info must be a list of ${min} to ${max} rows like { "key": "When", "value": "Sat 12 Dec, 6pm" }`];
  const e = [], keys = new Set();
  info.forEach((r, i) => {
    const at = `${where}: info[${i}]`;
    if (!isObj(r)) { e.push(`${at} must be an object like { "key": "Where", "value": "The roastery" }`); return; }
    for (const k of Object.keys(r)) if (k !== 'key' && k !== 'value') e.push(`${at}: "${clip(k)}" is not part of an info row (key, value)`);
    if (!INFO_KEYS.includes(r.key)) e.push(`${at}.key must be one of ${INFO_KEYS.join(', ')}`);
    else if (keys.has(r.key)) e.push(`${at}.key ${r.key} is used twice; use each label once`);
    else keys.add(r.key);
    const p = lineProblem(r.value, `info[${i}].value`, value);
    if (p) e.push(`${where}: ${p}`);
  });
  return e;
}
// The portrait picture of a quotation: { image, focal? }. Nothing of a refused value is echoed (a key or a path may be anything).
export function avatarProblems(a, where, focalOk) {
  if (a === undefined) return [];
  if (!isObj(a)) return [`${where}: avatar must be an object like { "image": "design/assets/photos/a.jpg", "focal": "50% 30%" }`];
  const e = [];
  const extra = Object.keys(a).filter((k) => !POST_AVATAR.keys.includes(k));
  if (extra.length) e.push(`${where}: avatar takes only image and focal (${extra.length} other key${extra.length === 1 ? '' : 's'} given)`);
  if (typeof a.image !== 'string' || !a.image.trim() || a.image.includes('\0')) e.push(`${where}: avatar.image must be a file path`);
  else if (!IMAGE_EXTS.includes(path.extname(a.image).toLowerCase())) e.push(`${where}: avatar.image must be ${IMAGE_EXTS.join(' ')}`);
  if (a.focal !== undefined && (typeof focalOk === 'function' ? !focalOk(a.focal) : false)) e.push(`${where}: avatar.focal must look like "60% 40%", "center", "left top" or { "x": 0.6, "y": 0.4 }`);
  return e;
}
// The pictures of a row of round pictures: [{ image, caption? }], each picture once.
function galleryProblems(g, where) {
  if (g === undefined) return [];
  const { min, max, caption } = POST_GALLERY;
  if (!Array.isArray(g) || g.length < min || g.length > max) return [`${where}: gallery must be a list of ${min} to ${max} pictures like { "image": "design/assets/photos/a.jpg", "caption": "Ama" }`];
  const e = [], images = new Set();
  g.forEach((p, i) => {
    const at = `${where}: gallery[${i}]`;
    if (!isObj(p)) { e.push(`${at} must be an object like { "image": "...", "caption": "..." }`); return; }
    for (const k of Object.keys(p)) if (k !== 'image' && k !== 'caption') e.push(`${at}: "${clip(k)}" is not part of a picture in a row (image, caption)`);
    if (typeof p.image !== 'string' || !p.image.trim()) e.push(`${at}.image must be a file path`);
    else if (!IMAGE_EXTS.includes(path.extname(p.image).toLowerCase())) e.push(`${at}.image must be ${IMAGE_EXTS.join(' ')}`);
    else if (images.has(p.image)) e.push(`${at}.image is used twice in the row; use each picture once`);
    else images.add(p.image);
    if (p.caption !== undefined) { const q = lineProblem(p.caption, `gallery[${i}].caption`, caption); if (q) e.push(`${where}: ${q}`); }
  });
  return e;
}
