// Layouts as data: a brand's own compositions, described as blocks placed in slots on a grid. A layout never holds markup,
// CSS or a URL: it is numbers in bounds and names from the fixed lists below, and lib/design/layout-render.mjs turns a checked
// layout and a checked spec into a page with the same helpers, escaping and checks as the built-in templates.
// Pure: no Chrome, no file system (except loadLayouts, which reads brand.json's "layouts" list).
//
// A layout:
//   {
//     "id": "split-photo",                        lowercase letters, digits and -, up to 40 (a design names it: { "template": "layout", "layout": "split-photo" })
//     "name": "Split photo",                      shown in Settings and to the AI; never placed in an image
//     "description": "A photo on top ...",        optional, up to 300 characters, for people and the AI
//     "ground": "series" | a ground name,         the page colour (default: the series' ground, else light); older names are read
//                                                 as the neutral ones (white is light, tint soft, mint cool, gold-pale warm, ink dark)
//     "accent": "series" | an accent style,       how the *accent phrase* of a headline is set (default: the brand's style)
//     "texture": "auto" | "none" | "dots" | "grid" | "lines",  the page's decoration (auto: the brand's style decides)
//     "fields": { "headline": { "required": true, "max": 90 }, "image": { "required": true }, "stats": { "min": 1, "max": 3 } },
//     "canvas": { "feed": { "columns": 12, "rows": 15, "margin": { "top": 80, "right": 70, "bottom": 70, "left": 70 }, "gutter": 24 } },
//     "blocks": [ { "type": "photo", "slot": { "col": 1, "row": 1, "width": 12, "height": 8 }, "bleed": ["top", "left", "right"] }, ... ]
//   }
//
// The sizes a layout renders at are the keys of its canvas (from lib/design/sizes.mjs). A slot is in grid cells, 1-based, and
// may be given per size ({ "feed": {...}, "story": {...} }). A design block for a layout is checked against the fields the layout
// declares, with their lengths, exactly as the built-in templates check theirs.
//
// The same format describes the built-in templates (lib/design/builtin-layouts.mjs), which needs a few more settings, each a
// name from a fixed list or a bounded whole number:
//   "page": "grid" | "poster" | "editorial"     what kind of page the blocks are drawn on (default grid: the page above, drawn
//                                               with design/layout.css). A poster or editorial page is the built-in templates'
//                                               own page: their wrapper, type, decoration, fit margins and chrome blocks, and
//                                               each block drawn with their markup (see PAGES). "photo" (the full-bleed photo
//                                               post) and "cover" (the page covers, at the cover sizes) are the same for theirs.
//   "ground": [{ "when": {...}, "ground": "photo" }, { "ground": "cool" }]   a ground chosen by the first case whose condition
//                                               holds (the last case has none); "photo" (poster pages) is the ground a photo page
//                                               starts from, the series' else cool, which a plain photo background replaces in
//                                               the browser (runtime.mjs ready()).
//   block "px": { "x", "y", "w", "h" }           a rectangle in page pixels instead of grid cells (or one per size), where a
//                                               built-in template places something at a hand-tuned position.
//   block "when": { "present": "sub" } | { "absent": "image" } | { "page": "first" | "later" | "single" }   the block is drawn
//                                               only when the field is filled (or empty), or on page 1 of a carousel, a later
//                                               page, or a post that is not a carousel. Several keys must all hold. Two blocks
//                                               whose conditions exclude each other may show the same field and may overlap.
//                                               { "field": "artefact", "is": "ledger" } (or "not", a value or a list) tests one
//                                               choice of SPEC_CHOICES: the artefact's type, and on built-in pages the templates'
//                                               own options and flags.
//   chrome blocks (no slot: the page frame places them, following the brand's logo placement and footer style): "bar" (the
//                                               poster's logo and website, "Swipe →" on page 1 of a carousel), "runhead" (the
//                                               editorial running head) and "footer" (the editorial footer).
//   options: "shrink" (headline, figure, stats: true, the default, shrinks the block with the fit loop, together with every
//                                               other block that shrinks; false keeps its size), "specSize"
//                                               (headline: the spec's own validated "size" replaces the block's), "photoTop"
//                                               (a poster photo: the spec's validated "photoTop" moves its top edge), "subField"
//                                               and "subWidth" (a headline's sub line flowing under it in the same box).
//
// A brand's own layout (Settings, Layouts; brand.json "layouts") may use the poster and editorial pages too, with everything
// they draw, except what reads a setting of the built-in templates' own designs, which a design for a brand's layout never has
// ({ "template": "layout" } takes the layout's fields and the page frame only): the options specSize, specAlign, photoTop,
// phoneTop, lists and specWindow, an artefact "from" the spec, the beside card, and conditions on any choice but the artefact's
// type and its register card. Those, and the photo post's and the page covers' pages, which the renderer treats by the template's
// own settings, are for the built-in layouts only (validateLayout(l, where, { builtin: true }), lib/design/builtin-layouts.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, brandFile } from '../core.mjs';
import { ARTEFACT_TYPES, DEVICES, HEADLINE_SIZES as SPEC_HEADLINE_SIZES, IMAGE_EXT, LAYOUTS as STORY_LAYOUTS, MAX_STATS, NETWORKS, PRODUCT_LAYOUTS, SCRIMS, focalToCss, normaliseDesign, parseSizes, parseStat, validateDesign } from './spec.mjs';
import { COVER_SIZES, SIZES, SIZE_NAMES } from './sizes.mjs';
import { ACCENT_STYLES, ALIGNS as SPEC_ALIGNS, DARK_GROUNDS, GROUND_ALIASES, GROUND_NAMES, POSTER_SIZES, SERIES_KEY, groundName } from './tokens.mjs';

export const LAYOUT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const MAX_LAYOUTS = 40;
export const MAX_BLOCKS = 24;
export const MAX_CHILDREN = 6;

// The grid's bounds, and the smallest margins per size: text and logos stay inside the margins (a story keeps clear of the
// Instagram interface at the top and bottom); only a photo, a slab or a decoration may bleed over them to the page edge.
export const GRID_LIMITS = { columns: [1, 24], rows: [1, 36], gutter: [0, 80], margin: [0, 600], minCell: 16 };
export const MIN_MARGINS = {
  feed: { top: 40, right: 48, bottom: 40, left: 48 },
  square: { top: 40, right: 48, bottom: 40, left: 48 },
  wide: { top: 28, right: 36, bottom: 28, left: 36 },
  story: { top: 250, right: 48, bottom: 320, left: 48 },
};
// A page cover ("page": "cover") is drawn at the cover sizes (sizes.mjs COVER_SIZES), and only a cover page is: its canvas names
// them instead of the post sizes. Its words are the brand's, set in boxes the layout places anywhere on the page (the fit check
// holds them to the cover size's own margins when it is drawn), so its grid has no minimum margins.
const COVER_NAMES = Object.keys(COVER_SIZES);
const COVER_MIN_MARGINS = Object.fromEntries(COVER_NAMES.map((z) => [z, { top: 0, right: 0, bottom: 0, left: 0 }]));
const SIZE_OF = { ...SIZES, ...COVER_SIZES };
const MIN_OF = { ...MIN_MARGINS, ...COVER_MIN_MARGINS };
const sizeNamesOf = (page) => (page === 'cover' ? COVER_NAMES : SIZE_NAMES);
// Type sizes are given for the feed page; the other sizes scale them.
export const TYPE_SCALE = { feed: 1, square: 0.9, story: 1, wide: 0.6 };
const EDGES = ['top', 'right', 'bottom', 'left'];

// The fields a layout may declare. Text: `max` characters (up to `cap`); lists: `min` and `max` entries (up to `cap`).
export const FIELDS = {
  headline: { kind: 'text', cap: 220, max: 120, word: 'the headline (*accent phrase* and \\n line breaks allowed)' },
  sub: { kind: 'text', cap: 220, max: 180, word: 'the sub line' },
  line: { kind: 'text', cap: 120, max: 80, word: 'a line under a big number' },
  quote: { kind: 'text', cap: 220, max: 160, word: 'a quotation' },
  myth: { kind: 'text', cap: 220, max: 120, word: 'the myth' },
  factLead: { kind: 'text', cap: 220, max: 120, word: 'the fact, as a headline' },
  fact: { kind: 'text', cap: 220, max: 180, word: 'the fact explained' },
  big: { kind: 'short', cap: 40, max: 40, word: 'one big figure, like "14.8M+"' },
  label: { kind: 'short', cap: 40, max: 40, word: 'a short label (also replaces the series name)' },
  eyebrow: { kind: 'short', cap: 60, max: 60, word: 'a short line over the headline' },
  note: { kind: 'short', cap: 80, max: 80, word: 'a short note' },
  title: { kind: 'short', cap: 40, max: 40, word: 'a window title' },
  stats: { kind: 'stats', cap: MAX_STATS, max: MAX_STATS, word: 'figures like "3,900+|members"' },
  items: { kind: 'items', cap: 6, max: 4, chars: 48, word: 'short one-line points' },
  image: { kind: 'image', word: 'a photo or a screen capture' },
  artefact: { kind: 'artefact', word: 'a ledger, passbook or register card' },
};
export const FIELD_NAMES = Object.keys(FIELDS);
const TEXTUAL = ['text', 'short'];

// Fixed lists for block options. Sizes are pixels on the feed page.
export const ALIGNS = ['left', 'center', 'right'];
export const VALIGNS = ['top', 'center', 'bottom'];
export const HEADLINE_PX = [56, 64, 68, 70, 76, 84, 88, 96, 104, 112, 120, 136];
export const SUB_PX = [30, 32, 34, 36, 40, 44];
export const FIGURE_PX = [96, 120, 144, 168, 200, 240];
export const STAT_PX = [48, 56, 64, 70, 84];
export const LABEL_PX = [22, 24, 26, 28];
export const LOGO_PX = [24, 28, 32, 34, 40, 48];
export const WEBSITE_PX = [22, 24, 26, 28, 30];
export const PAD_PX = [0, 24, 32, 40, 48, 56, 64];
export const GAP_PX = [0, 12, 16, 24, 28, 32, 40, 48];
export const SLAB_GROUNDS = [...GROUND_NAMES, 'panel', 'card'];
export const TEXTURES = ['auto', 'none', 'dots', 'grid', 'lines'];
export const LABEL_SOURCES = ['series', 'brand', 'folio'];

// The kinds of page a layout draws on (its "page"): grid (a brand's own layout, drawn with design/layout.css), or the built-in
// templates' poster or editorial page, the full-bleed photo post's page (photo) or a social page's cover (cover; see the header
// and PAGES).
export const PAGE_KINDS = ['grid', 'poster', 'editorial', 'photo', 'cover'];
const BUILT_PAGES = ['poster', 'editorial'];
// The page kinds a brand's own layout may use, and why the others are the built-in layouts' only.
export const BRAND_PAGE_KINDS = ['grid', 'poster', 'editorial'];
const BUILTIN_PAGE_WHY = {
  photo: 'the renderer raises the photo post\'s scrim, places its lines and holds its text to the photo contrast targets from the photo template\'s own settings (textAt, scrim, lines), which a design for a brand\'s layout does not have',
  cover: 'page covers are made from the brand for its social profiles, never for a post',
};
export const builtinPageWhy = (page) => BUILTIN_PAGE_WHY[page] ?? null;
// Pages drawn at the feed size only (the built-in templates' pages: their chrome is placed for 1080 x 1350).
const FEED_PAGES = ['poster', 'editorial'];
export const PAGE_CONDITIONS = ['single', 'first', 'later'];
const WHEN_KEYS = ['present', 'absent', 'page', 'field', 'is', 'not'];
const BOOL = [true, false];

// What a condition { "field": <name>, "is": <value or list> } (or "not") may test besides the declared fields: the artefact's
// type, and the built-in templates' own fixed options and flags, each with the fixed list of values it can have. read() gives a
// spec's value: with the template's default filled in where every template has the same one (a phone is the default device), the
// value as given where they differ (product's layout defaults to center, photo-story's to panel); an unset value (unset: true)
// matches no "is", only a "not". Only "artefact" (a declared field) may be tested on a grid page, and the artefact and its
// register card on a brand's own poster or editorial page (grid, brand); the rest are settings of the built-in templates'
// designs, which a design for a brand's own layout does not take.
export const SPEC_CHOICES = {
  artefact: { values: ARTEFACT_TYPES, read: (s) => (isObj(s?.artefact) ? s.artefact.type : undefined), unset: true, grid: true, brand: true },
  // the register card the page draws: the passbook template's own, a text page's artefact's (either place without a template)
  register: { values: BOOL, read: (s) => (s?.template === 'passbook' ? isObj(s.register) : s?.template === 'text' ? isObj(s.artefact?.register) : isObj(s?.register) || isObj(s?.artefact?.register)), brand: true },
  beside: { values: BOOL, read: (s) => isObj(s?.beside) },
  pills: { values: BOOL, read: (s) => filled(s?.pills) },
  checks: { values: BOOL, read: (s) => filled(s?.checks) },
  layout: { values: [...PRODUCT_LAYOUTS, ...STORY_LAYOUTS], read: (s) => s?.layout, unset: true },
  device: { values: DEVICES, read: (s) => s?.device ?? 'phone' },
  align: { values: SPEC_ALIGNS, read: (s) => s?.align, unset: true },
  size: { values: [...new Set([...SPEC_HEADLINE_SIZES, ...POSTER_SIZES])].sort((x, y) => x - y), read: (s) => s?.size, unset: true },
  textAt: { values: ['top', 'bottom'], read: (s) => s?.textAtResolved ?? (typeof s?.textAt === 'string' ? s.textAt : 'top') },
  scrim: { values: SCRIMS, read: (s) => s?.scrim ?? 'black' },
  map: { values: BOOL, read: (s) => s?.map === true },
  fade: { values: BOOL, read: (s) => s?.fade === true },
  tilt: { values: BOOL, read: (s) => s?.tilt === true },
  framed: { values: BOOL, read: (s) => s?.framed === true },
  glow: { values: BOOL, read: (s) => s?.glow !== false },
  dots: { values: BOOL, read: (s) => s?.dots !== false },
  kind: { values: Object.keys(COVER_SIZES), read: (s) => s?.kind, unset: true },
};
export const CHOICE_NAMES = Object.keys(SPEC_CHOICES);
export const MAX_GROUND_CASES = 4;

// canon: a reader that turns an older spelling into a listed name (a ground alias into its neutral name). pages: the page kinds
// an option (or a block type) is used on, when not all of them (the editor and the AI see only what a grid page takes).
// aliases: older spellings read as a listed name ({ white: "light" }), turned into the canon reader.
const e = (list, def, aliases) => ({ t: 'enum', list, def, ...(aliases ? { aliases, canon: (v) => (typeof v === 'string' && Object.hasOwn(aliases, v) ? aliases[v] : v) } : {}) });
const b = (def) => ({ t: 'bool', def });
const n = (min, max, def) => ({ t: 'int', min, max, def });
const on = (pages, o) => ({ ...o, pages });
// An option that reads a setting of the built-in templates' own designs: the built-in layouts' only (see the header).
const only = (o) => ({ ...o, builtin: true });
// An option used only together with another setting of the same block: { device: "desktop" } (that option's value, its default
// filled in) or { subField: true } (that key given). validateLayout refuses it otherwise; the editor shows it only then.
const needs = (want, o) => ({ ...o, needs: want });
const ALIGN = e(ALIGNS, 'left');
const VALIGN = e(VALIGNS, 'top');
const SHRINK = b(true);

// Every block type, the field kinds it can show, the field it shows by default and its options (each from a fixed list).
// bleed: photos, slabs and decorations may run over the margins to the page edges their slot touches. chrome: a part of the page
// frame with no slot of its own (the page places it). text: a block whose words must stay inside the size's minimum margins.
export const BLOCKS = {
  headline: { kinds: TEXTUAL, field: 'headline', child: true, text: true, options: { size: e(HEADLINE_PX, 84), style: e(['editorial', 'poster'], 'editorial'), align: ALIGN, valign: VALIGN, shrink: SHRINK, specSize: only(on(BUILT_PAGES, b(false))), subWidth: needs({ subField: true }, on(BUILT_PAGES, n(100, 1080, 820))) } },
  sub: { kinds: TEXTUAL, field: 'sub', child: true, text: true, options: { size: e(SUB_PX, 32), align: ALIGN, valign: VALIGN } },
  label: { kinds: ['short'], field: null, child: true, text: true, options: { style: e(['mono', 'tag', 'plain'], 'mono'), tone: e(['muted', 'accent'], 'muted'), size: e(LABEL_PX, 22), align: ALIGN, valign: VALIGN } },
  figure: { kinds: ['short'], field: 'big', child: true, text: true, options: { size: e(FIGURE_PX, 168), style: e(['editorial', 'poster'], 'editorial'), align: ALIGN, valign: VALIGN, shrink: SHRINK } },
  stats: { kinds: ['stats'], field: 'stats', child: true, text: true, options: { direction: e(['row', 'column'], 'row'), size: e(STAT_PX, 64), rules: b(false), align: ALIGN, valign: VALIGN, shrink: SHRINK } },
  list: { kinds: ['items'], field: 'items', child: true, text: true, options: { style: e(['checks', 'pills', 'bullets'], 'checks'), align: ALIGN, valign: VALIGN } },
  photo: { kinds: ['image'], field: 'image', options: { frame: e(['none', 'card', 'raised'], 'none'), photoTop: only(on(['poster'], b(false))) }, bleed: true },
  screen: { kinds: ['image'], field: 'image', options: { device: e(['phone', 'desktop'], 'phone'), fit: needs({ device: 'phone' }, e(['contain', 'crop'], 'contain')), glow: b(true), tilt: needs({ device: 'desktop' }, b(false)), framed: needs({ device: 'desktop' }, b(false)), align: e(ALIGNS, 'center'), valign: e(VALIGNS, 'center') } },
  logo: { kinds: [], field: null, child: true, text: true, options: { variant: e(['auto', 'full', 'solid', 'pill', 'mark'], 'auto'), size: e(LOGO_PX, 34), align: ALIGN, valign: VALIGN } },
  website: { kinds: [], field: null, child: true, text: true, options: { size: e(WEBSITE_PX, 26), align: ALIGN, valign: VALIGN } },
  slab: { kinds: [], field: null, options: { ground: e(SLAB_GROUNDS, 'panel', GROUND_ALIASES), radius: e(['none', 'card', 'slab'], 'none'), shadow: b(false), padding: e(PAD_PX, 48), gap: e(GAP_PX, 24), align: ALIGN, valign: VALIGN }, bleed: true, children: true },
  artefact: { kinds: ['artefact'], field: 'artefact', options: { align: ALIGN, valign: VALIGN } },
  decoration: { kinds: [], field: null, options: { kind: e(['rule', 'panel', 'dots', 'texture', 'glow', 'map'], 'rule') }, bleed: true, under: true },
  spacer: { kinds: [], field: null, options: {} },
  // the built-in pages' chrome
  bar: { kinds: [], field: null, options: {}, chrome: true, pages: ['poster'] },
  runhead: { kinds: [], field: null, options: { rule: b(true) }, chrome: true, pages: ['editorial'] },
  footer: { kinds: [], field: null, options: {}, chrome: true, pages: ['editorial'] },
  // Block types a phase 2 group adds go in its own section below (testlib/CONVERTING.md), so parallel changes merge.
  // -- poster group --
  // myth-fact's colour-blocked slabs, stacked and centred in the rectangle: each headline child starts the next slab (the myth's,
  // then the fact's, each with its fixed tag), a sub line child goes in the slab before it. holds: the only child types it draws,
  // with the only options it honours on each (layout-poster.mjs slabs()); slabs: how many slabs it draws (SLABS there).
  slabs: { kinds: [], field: null, options: {}, text: true, children: true, pages: ['poster'], holds: { headline: ['size'], sub: [] }, slabs: 2 },
  // the series mark opposite the poster's logo bar (bottom right, or top right when the bar is at the bottom): the spec's label,
  // else the series' name, else "Myths vs facts".
  mark: { kinds: [], field: null, options: {}, chrome: true, pages: ['poster'] },
  // (end of poster group)
  // -- artefacts group --
  // (end of artefacts group)
  // -- editorial group --
  // the editorial label row (photo-story's panel page): the series' name (or the spec's label) on the left and, on a carousel
  // page, the folio on the right, across its rectangle
  labelrow: { kinds: [], field: null, options: {}, text: true, pages: ['editorial'] },
  // (end of editorial group)
  // -- screen group --
  // The screen template's (editorial pages only): the glow behind the layout's phone, sized from the phone as its screen block
  // draws it (no rectangle of its own); the passbook card the spec's "beside" describes, in its rectangle; and the footer with
  // the logo alone (no website, no "Swipe →").
  halo: { kinds: [], field: null, options: {}, chrome: true, pages: ['editorial'] },
  beside: { kinds: [], field: null, options: {}, pages: ['editorial'], builtin: true },
  footlogo: { kinds: [], field: null, options: {}, chrome: true, pages: ['editorial'] },
  // (end of screen group)
  // -- photo group --
  // the photo post's page: the photograph under everything (full bleed, whatever its rectangle), the scrim and footer fade the
  // renderer raises until the text reads, the thin lines it draws, and the footer (the logo in its pill, the website)
  backdrop: { kinds: ['image'], field: 'image', options: {}, under: true, pages: ['photo'] },
  scrim: { kinds: [], field: null, options: {}, chrome: true, pages: ['photo'] },
  lines: { kinds: [], field: null, options: {}, chrome: true, pages: ['photo'] },
  photoFooter: { kinds: [], field: null, options: {}, chrome: true, pages: ['photo'] },
  // the page covers: the brand's mark centred on its rectangle (as high as it), and the brand's logo (logo px high), tagline
  // (size), descriptor (subSize) and website (urlSize) in a box: a column, centred or set left, with gap, subGap and urlGap
  // above the tagline, the descriptor and the website; or a row, gap apart, the descriptor (subWidth wide) and the website
  // pushed to its right end, urlGap apart.
  coverMark: { kinds: [], field: null, options: {}, pages: ['cover'] },
  coverWords: { kinds: [], field: null, pages: ['cover'], options: { arrange: e(['column', 'row'], 'column'), align: e(['center', 'left'], 'center'), logo: n(16, 160, 48), size: n(24, 200, 80), subSize: n(16, 80, 30), urlSize: n(16, 60, 24), gap: n(0, 160, 24), subGap: n(0, 120, 16), urlGap: n(0, 120, 10), subWidth: n(100, 1200, 420) } },
  // (end of photo group)
};

// Options a phase 2 group adds to a block type that is already there: [type, name, option], in the group's own section, so that
// two groups never edit the same line. Merged into BLOCKS here; a name given twice is a mistake and stops the engine loading.
const ADDED_OPTIONS = [
  // -- poster group --
  // A headline takes the spec's own validated align (left or center) instead of the block's when the spec gives one (object,
  // product); its size follows the spec's through conditions on "size" (a "when" tests one choice, so align cannot be one too).
  ['headline', 'specAlign', only(on(['poster'], b(false)))],
  // A headline with nothing to show takes the brand's tagline (two-tone, as on the closing page), and its subField's sub line the
  // brand's website (the closing page's defaults).
  ['headline', 'fallback', on(['poster'], e(['none', 'tagline'], 'none'))],
  ['headline', 'subFallback', on(['poster'], e(['none', 'website'], 'none'))],
  // The bar's label beside the logo: auto (the website, or "Swipe →" on page 1 of a carousel) or none (the closing page).
  ['bar', 'label', on(['poster'], e(['auto', 'none'], 'auto'))],
  // A poster phone's top edge moves to the spec's validated phoneTop (product).
  ['screen', 'phoneTop', only(on(['poster'], b(false)))],
  // (end of poster group)
  // -- artefacts group --
  // where the artefact an editorial page draws is: the block's field (a text page's artefact), or the spec itself, as the
  // ledger template (columns, rows, mark, notes) and the passbook template (days, ticked, today, tick, register) take theirs
  // (ledger and passbook read the spec's own fields, which a brand's layout's design does not have: built-in layouts only)
  ['artefact', 'from', { ...on(['editorial'], e(['field', 'ledger', 'passbook'], 'field')), builtinValues: ['ledger', 'passbook'] }],
  // (end of artefacts group)
  // -- editorial group --
  // (end of editorial group)
  // -- screen group --
  // lists: the spec's pills and check list (the screen template's) under the headline and its sub line. row: the headline is the
  // text column of a row with the layout's phone (its screen block), centred in the band their rectangles share.
  ['headline', 'lists', only(on(['editorial'], b(false)))],
  ['headline', 'row', on(['editorial'], b(false))],
  // specWindow: a desktop window takes the spec's own validated framed, tilt and region.
  ['screen', 'specWindow', only(on(['editorial'], b(false)))],
  // (end of screen group)
  // -- photo group --
  // the photo post's headline box also holds the spec's eyebrow, over the headline
  ['headline', 'eyebrow', on(['photo'], b(false))],
  // (end of photo group)
];
for (const [type, name, o] of ADDED_OPTIONS) {
  if (!Object.hasOwn(BLOCKS, type) || Object.hasOwn(BLOCKS[type].options, name)) throw new Error(`layout.mjs: the option ${type}.${name} is added twice or to an unknown block type`);
  BLOCKS[type].options[name] = o;
}
const usedOn = (x, page) => !x.pages || x.pages.includes(page);
// The block types a brand's own grid layout can use: what the AI is offered (the editor reads layoutCatalogue().pages).
export const BLOCK_TYPES = Object.keys(BLOCKS).filter((t) => usedOn(BLOCKS[t], 'grid'));
export const ALL_BLOCK_TYPES = Object.keys(BLOCKS);

// What a built-in page draws (lib/design/layout-poster.mjs, layout-editorial.mjs): for each block type it has a drawing for,
// the options that drawing honours (any other option of the type is refused on that page), the decoration kinds it draws, and
// the margins its fit check holds text to (the templates' reference margins). A grid page draws every block type with every
// option. Phase 2 of the conversion adds to these lists as it converts more templates (see testlib/CONVERTING.md): one line per
// block type, so that parallel changes merge.
export const PAGES = {
  poster: {
    draws: {
      photo: ['photoTop'],
      bar: [],
      headline: ['size', 'style', 'align', 'shrink', 'subWidth'],
      figure: ['size', 'style', 'align', 'shrink'],
      sub: ['align'],
      stats: ['size', 'shrink'],
      decoration: ['kind'],
      spacer: [],
      // -- poster group --
      screen: ['phoneTop'],
      slabs: [],
      mark: [],
      // (end of poster group)
    },
    decorations: ['rule', 'glow', 'map'],
    fit: { pad: 62, top: 46 },
  },
  editorial: {
    draws: {
      decoration: ['kind'],
      runhead: ['rule'],
      headline: ['size', 'style', 'align', 'shrink', 'specSize', 'subWidth'],
      sub: ['align'],
      footer: [],
      spacer: [],
      // -- artefacts group --
      artefact: ['from'],
      // (end of artefacts group)
      // -- editorial group --
      photo: ['frame'],
      figure: ['size', 'shrink'],
      stats: ['direction', 'size', 'rules', 'shrink'],
      labelrow: [],
      // (end of editorial group)
      // -- screen group --
      screen: ['device', 'fit', 'specWindow'],
      halo: [],
      beside: [],
      footlogo: [],
      // (end of screen group)
    },
    decorations: ['panel', 'rule', 'glow', 'map'],
    fit: { pad: 62, top: 46 },
  },
  // The full-bleed photo post (lib/design/layout-photo.mjs). Its headline box is anchored at the top of its rectangle, or with
  // "valign": "bottom" at its bottom edge, and holds the eyebrow (with "eyebrow": true), the headline and the subField's sub line,
  // set in the page's own type sizes per size (type: px; subWidth, the sub line's max-width). The fit check holds text to the
  // size's own margins (fit: null).
  photo: {
    draws: {
      backdrop: [],
      scrim: [],
      lines: [],
      headline: ['valign', 'eyebrow'],
      photoFooter: [],
    },
    decorations: [],
    fit: null,
    type: {
      feed: { headline: 112, sub: 38, eyebrow: 24, subWidth: 800 },
      wide: { headline: 68, sub: 24, eyebrow: 17, subWidth: 560 },
      story: { headline: 120, sub: 42, eyebrow: 26, subWidth: 800 },
      square: { headline: 88, sub: 30, eyebrow: 20, subWidth: 800 },
    },
  },
  // A social page's cover or profile picture (lib/design/layout-cover.mjs), at the cover sizes, on the white ground: its words
  // are all the brand's (words: "brand": no field, no text block needed). The fit check holds them to the size's own margins
  // and to their box; the renderer sets the tagline smaller, then over two lines, to fit (render.mjs fitCover).
  cover: {
    draws: {
      coverMark: [],
      coverWords: ['arrange', 'align', 'logo', 'size', 'subSize', 'urlSize', 'gap', 'subGap', 'urlGap', 'subWidth'],
    },
    decorations: [],
    fit: null,
    words: 'brand',
  },
};
// Options a phase 2 group lets a built-in page honour on a block type it already draws: [page, type, option], in the group's own
// section (a new block type's drawing gets its own line in PAGES above, in the group's section there).
const ADDED_HONOURS = [
  // -- poster group --
  ['poster', 'headline', 'specAlign'],
  ['poster', 'headline', 'fallback'],
  ['poster', 'headline', 'subFallback'],
  ['poster', 'bar', 'label'],
  // (end of poster group)
  // -- artefacts group --
  // (end of artefacts group)
  // -- editorial group --
  // (end of editorial group)
  // -- screen group --
  ['editorial', 'headline', 'lists'],
  ['editorial', 'headline', 'row'],
  // (end of screen group)
  // -- photo group --
  // (end of photo group)
];
for (const [page, type, name] of ADDED_HONOURS) {
  const list = PAGES[page]?.draws?.[type];
  if (!list || list.includes(name) || !Object.hasOwn(BLOCKS[type]?.options ?? {}, name)) throw new Error(`layout.mjs: ${page} ${type}.${name} is honoured twice, or is not an option of a block that page draws`);
  list.push(name);
}
const BASE_KEYS = ['type', 'slot', 'px', 'field', 'when'];
// What a block shows besides its "field": a label's fixed words or source (exactly one of field, text, source), a desktop
// window's title, and a headline's sub line flowing under it (on the built-in pages, not inside a slab). kinds: the field kinds
// it may name; needs: as an option's.
export const BINDINGS = {
  label: { text: { max: 40 }, source: { values: LABEL_SOURCES } },
  screen: { titleField: { kinds: ['short'], needs: { device: 'desktop' } } },
  headline: { subField: { kinds: TEXTUAL, pages: PAGE_KINDS.filter((p) => p !== 'grid'), child: false } },
};
// A block type that bleeds only with its option at this value (a framed photo cannot bleed).
export const BLEED_NEEDS = { photo: { frame: 'none' } };
// The blocks a built-in page runs the full width to the bottom edge from a "px" rectangle (x 0, the page's width, its bottom at
// the page's foot): the poster's photo, the editorial page's tint panel. The value names the option values it applies to.
export const FULL_WIDTH = { poster: { photo: {} }, editorial: { decoration: { kind: 'panel' } } };
const fullWidth = (page, blk) => { const w = FULL_WIDTH[page]?.[blk.type]; return !!w && Object.entries(w).every(([k, v]) => optionOf(blk, k) === v); };
// The options a block inside a slab may not take (it flows in the slab: the slab aligns its children vertically).
export const CHILD_REFUSED = ['valign'];
// Whether a block has what an option (or binding) needs.
const needsMet = (blk, want) => !want || Object.entries(want).every(([k, v]) => (v === true ? blk[k] !== undefined : optionOf(blk, k) === v));
const needsWords = (want) => Object.entries(want).map(([k, v]) => (v === true ? k : `"${k}": "${v}"`)).join(' and ');
const LAYOUT_KEYS = ['id', 'name', 'description', 'page', 'ground', 'accent', 'texture', 'fields', 'canvas', 'blocks'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const oneLine = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max && !/[\r\n]/.test(v);
// A value or a key quoted back in a message: short, and without markup characters (messages are plain text, but are shown in
// the web app and given to the AI).
const clip = (s) => String(s).slice(0, 40).replace(/[<>&\u0000-\u001f`]/g, '?');
const show = (v) => clip(JSON.stringify(v) ?? String(v));
const unknownKeys = (o, keys, where, errors) => { for (const k of Object.keys(o)) if (!keys.includes(k)) errors.push(`${where}: "${clip(k)}" is not a known setting (known: ${keys.join(', ')})`); };

// The grid of one size, with every margin resolved.
function gridProblems(g, size, where, errors) {
  if (!isObj(g)) return errors.push(`${where} must be an object like { "columns": 12, "rows": 15, "margin": 70, "gutter": 24 }`);
  unknownKeys(g, ['columns', 'rows', 'margin', 'gutter', 'rowGutter'], where, errors);
  const L = GRID_LIMITS, before = errors.length;
  if (!isInt(g.columns, ...L.columns)) errors.push(`${where}.columns must be a whole number from ${L.columns[0]} to ${L.columns[1]}`);
  if (!isInt(g.rows, ...L.rows)) errors.push(`${where}.rows must be a whole number from ${L.rows[0]} to ${L.rows[1]}`);
  for (const k of ['gutter', 'rowGutter']) if (g[k] !== undefined && !isInt(g[k], ...L.gutter)) errors.push(`${where}.${k} must be a whole number of pixels from ${L.gutter[0]} to ${L.gutter[1]}`);
  const m = marginsOf(g.margin);
  if (!m) errors.push(`${where}.margin must be a whole number of pixels or { "top", "right", "bottom", "left" } (each from ${L.margin[0]} to ${L.margin[1]})`);
  else {
    const min = MIN_OF[size];
    for (const k of EDGES) if (m[k] < min[k]) errors.push(`${where}.margin.${k} is ${m[k]} px; a ${size} page needs at least ${min[k]} px so text stays clear of the edge${size === 'story' ? ' and the story interface' : ''}`);
  }
  if (errors.length > before) return;
  const c = cellOf(g, size);
  if (c.w < L.minCell || c.h < L.minCell) errors.push(`${where}: the cells are ${Math.floor(c.w)} x ${Math.floor(c.h)} px; use fewer columns or rows, smaller margins or a smaller gutter (each cell needs at least ${L.minCell} px)`);
}

function marginsOf(m) {
  const ok = (n) => isInt(n, ...GRID_LIMITS.margin);
  if (ok(m)) return { top: m, right: m, bottom: m, left: m };
  if (!isObj(m) || Object.keys(m).some((k) => !EDGES.includes(k)) || !EDGES.every((k) => ok(m[k]))) return null;
  return { top: m.top, right: m.right, bottom: m.bottom, left: m.left };
}

// The size of one cell of a (checked) grid, in page pixels.
export function cellOf(g, size) {
  const S = SIZE_OF[size], m = marginsOf(g.margin), gx = g.gutter ?? 0, gy = g.rowGutter ?? gx;
  return { w: (S.w - m.left - m.right - (g.columns - 1) * gx) / g.columns, h: (S.h - m.top - m.bottom - (g.rows - 1) * gy) / g.rows, gx, gy, m };
}

// A block's rectangle on the page for one size: the slot's cells, and the page edges it bleeds to; or its pixel rectangle.
export function slotRect(layout, block, size) {
  const p = pxFor(block.px, size);
  if (p) { const r = { x: p.x, y: p.y, w: p.w, h: p.h }; return { ...r, inner: { ...r } }; }
  const g = layout.canvas[size], c = cellOf(g, size), s = slotFor(block.slot, size), S = SIZE_OF[size];
  let x = c.m.left + (s.col - 1) * (c.w + c.gx), y = c.m.top + (s.row - 1) * (c.h + c.gy);
  let w = s.width * c.w + (s.width - 1) * c.gx, h = s.height * c.h + (s.height - 1) * c.gy;
  const inner = { x, y, w, h };
  for (const edge of block.bleed ?? []) {
    if (edge === 'top') { h += y; y = 0; }
    if (edge === 'left') { w += x; x = 0; }
    if (edge === 'bottom') h = S.h - y;
    if (edge === 'right') w = S.w - x;
  }
  return { x, y, w, h, inner };
}

const slotFor = (slot, size) => (isObj(slot) && 'col' in slot ? slot : slot?.[size]);
const pxFor = (p, size) => (isObj(p) && 'x' in p ? p : isObj(p) ? p[size] : undefined);

// A pixel rectangle: whole numbers, inside the page of that size.
function onePxProblems(p, size, where, errors) {
  if (!isObj(p)) return errors.push(`${where} must be { "x": 70, "y": 154, "w": 940, "h": 300 } (in page pixels)`);
  unknownKeys(p, ['x', 'y', 'w', 'h'], where, errors);
  const S = SIZE_OF[size], before = errors.length;
  for (const [k, lo, hi] of [['x', 0, S.w - 1], ['y', 0, S.h - 1], ['w', 1, S.w], ['h', 1, S.h]]) if (!isInt(p[k], lo, hi)) errors.push(`${where}.${k} must be a whole number of pixels from ${lo} to ${hi}`);
  if (errors.length > before) return;
  if (p.x + p.w > S.w) errors.push(`${where}: x + w is ${p.x + p.w}, past the ${size} page's width of ${S.w}`);
  if (p.y + p.h > S.h) errors.push(`${where}: y + h is ${p.y + p.h}, past the ${size} page's height of ${S.h}`);
}

function pxProblems(p, sizes, where, errors) {
  if (isObj(p) && 'x' in p) { for (const z of sizes) onePxProblems(p, z, `${where}.px`, errors); return; }
  if (!isObj(p)) return errors.push(`${where}.px must be { "x", "y", "w", "h" } in page pixels, or one per size`);
  for (const k of Object.keys(p)) if (!sizes.includes(k)) errors.push(`${where}.px has "${clip(k)}", which is not a size of this layout (${sizes.join(', ')})`);
  for (const z of sizes) {
    if (p[z] === undefined) errors.push(`${where}.px has no rectangle for ${z}`);
    else onePxProblems(p[z], z, `${where}.px.${z}`, errors);
  }
}

// ---- conditions: a block (or a ground) that applies only when a field is filled or empty, or on some pages of a carousel ----
// A value counts as filled when it is a non-empty text, a non-empty list, an object, a number or true.
export const filled = (v) => (typeof v === 'string' ? v !== '' : Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== false);
const pageOf = (counter) => (!counter ? 'single' : counter.n === 1 ? 'first' : 'later');

const listOf = (v) => (Array.isArray(v) ? v : [v]);
const choiceOf = (name) => (typeof name === 'string' && Object.hasOwn(SPEC_CHOICES, name) ? SPEC_CHOICES[name] : null);
// The values of a choice that a (checked) { field, is | not } condition lets through; undefined stands for an unset value.
function matched(when) {
  const c = choiceOf(when.field), all = [...c.values, ...(c.unset ? [undefined] : [])];
  return when.is !== undefined ? listOf(when.is) : all.filter((v) => !listOf(when.not).includes(v));
}

// Whether a (checked) condition holds for a spec, on a page (ctx.counter: { n, total } on a carousel page).
export function whenHolds(when, spec, counter) {
  if (when === undefined) return true;
  if (when.present !== undefined && !filled(spec?.[when.present])) return false;
  if (when.absent !== undefined && filled(spec?.[when.absent])) return false;
  if (when.page !== undefined && pageOf(counter) !== when.page) return false;
  if (when.field !== undefined) {
    const c = choiceOf(when.field);
    if (!c) return false;
    const hit = listOf(when.is ?? when.not).includes(c.read(spec));
    if (when.is !== undefined ? !hit : hit) return false;
  }
  return true;
}

// fields: the field names a condition may name (a layout's declared fields). page: the kind of page the layout draws on; on a grid
// page a { field, is } condition may test only the type of a declared artefact, and on a brand's own poster or editorial page also
// its register card. Without a page (the registry of built-in layouts), or for a built-in layout (builtin), every choice may be
// tested.
export function whenProblems(when, fields, where, { page, builtin = false } = {}) {
  if (!isObj(when) || !Object.keys(when).length) return [`${where} must be an object like { "present": "sub" }, { "absent": "image" }, { "page": "first" } or { "field": "artefact", "is": "ledger" }`];
  const errors = [];
  unknownKeys(when, WHEN_KEYS, where, errors);
  for (const k of ['present', 'absent']) {
    if (when[k] === undefined) continue;
    if (typeof when[k] !== 'string' || !FIELDS[when[k]]) errors.push(`${where}.${k} must be one of ${FIELD_NAMES.join(', ')} (got ${show(when[k])})`);
    else if (!fields.includes(when[k])) errors.push(`${where}.${k}: "${when[k]}" is not in the layout's fields; declare it there first`);
  }
  if (when.present !== undefined && when.present === when.absent) errors.push(`${where}: a field cannot be both present and absent`);
  if (when.page !== undefined && !PAGE_CONDITIONS.includes(when.page)) errors.push(`${where}.page must be one of ${PAGE_CONDITIONS.join(', ')}`);
  if (when.field === undefined) {
    if (when.is !== undefined || when.not !== undefined) errors.push(`${where}: "is" and "not" need a "field" (one of ${CHOICE_NAMES.join(', ')})`);
    return errors;
  }
  const c = choiceOf(when.field), grid = page === 'grid', brand = page !== undefined && !grid && !builtin;
  const allowed = grid ? CHOICE_NAMES.filter((n) => SPEC_CHOICES[n].grid) : brand ? CHOICE_NAMES.filter((n) => SPEC_CHOICES[n].brand) : CHOICE_NAMES;
  if (!c || !allowed.includes(when.field)) return [...errors, `${where}.field must be one of ${allowed.join(', ')}${grid ? ' on a grid page' : brand ? ' on a brand\'s own layout (the other choices are settings of the built-in templates\' designs)' : ''} (got ${show(when.field)})`];
  if (FIELDS[when.field] && page !== undefined && !fields.includes(when.field)) errors.push(`${where}.field: "${when.field}" is not in the layout's fields; declare it there first`);
  if ((when.is === undefined) === (when.not === undefined)) return [...errors, `${where}: give "is" or "not" (not both) with "field"`];
  const k = when.is !== undefined ? 'is' : 'not', vals = listOf(when[k]);
  if (!vals.length || vals.length > c.values.length || vals.some((v) => !c.values.includes(v)) || new Set(vals).size !== vals.length) errors.push(`${where}.${k} must be one of ${c.values.join(', ')}, or a list of them (got ${show(when[k])})`);
  return errors;
}

// Two (checked) conditions that can never hold together: one needs a field the other needs empty, they name different pages, or
// they let through no common value of the same choice.
export function exclusive(a, b) {
  if (!a || !b) return false;
  const one = (x, y) => (x.present !== undefined && x.present === y.absent);
  if (one(a, b) || one(b, a) || (a.page !== undefined && b.page !== undefined && a.page !== b.page)) return true;
  if (a.field !== undefined && a.field === b.field && choiceOf(a.field)) { const m = matched(b); return !matched(a).some((v) => m.includes(v)); }
  return false;
}

// The layout's ground for a spec: its "ground" (a name, "series" or "photo"), or the first of its cases whose condition holds.
export function groundCase(layout, spec, counter) {
  const g = layout.ground;
  if (!Array.isArray(g)) return g;
  return g.find((c) => whenHolds(c.when, spec, counter))?.ground;
}
const GROUND_WORDS = (page) => `series${page === 'poster' ? ', photo' : ''} or one of ${GROUND_NAMES.join(', ')}`;
function groundProblems(l, page, where, errors, builtin) {
  const one = (v, w) => {
    if (v === 'series' || groundName(v)) return;
    if (v === 'photo' && page === 'poster') { if (!isObj(l.fields) || !l.fields.image) errors.push(`${w}: a photo ground needs the image field`); return; }
    errors.push(`${w} must be ${GROUND_WORDS(page)}`);
  };
  if (!Array.isArray(l.ground)) return one(l.ground, `${where}: ground`);
  if (!l.ground.length || l.ground.length > MAX_GROUND_CASES) return errors.push(`${where}: ground must be a ground or a list of 1 to ${MAX_GROUND_CASES} cases like { "when": { "present": "image" }, "ground": "photo" }`);
  l.ground.forEach((c, i) => {
    const w = `${where}: ground[${i}]`;
    if (!isObj(c)) return errors.push(`${w} must be an object like { "when": { "present": "image" }, "ground": "photo" }`);
    unknownKeys(c, ['when', 'ground'], w, errors);
    one(c.ground, `${w}.ground`);
    const last = i === l.ground.length - 1;
    if (last && c.when !== undefined) errors.push(`${w}: the last case has no "when" (it is the ground when no other case holds)`);
    if (!last && c.when === undefined) errors.push(`${w} needs a "when" (only the last case has none)`);
    if (c.when !== undefined) errors.push(...whenProblems(c.when, isObj(l.fields) ? Object.keys(l.fields) : [], `${w}.when`, { page, builtin }));
  });
}

function oneSlotProblems(s, g, where, errors) {
  if (!isObj(s)) return errors.push(`${where} must be { "col": 1, "row": 1, "width": 6, "height": 4 } (in grid cells)`);
  unknownKeys(s, ['col', 'row', 'width', 'height'], where, errors);
  const before = errors.length;
  for (const [k, max] of [['col', g.columns], ['row', g.rows], ['width', g.columns], ['height', g.rows]]) if (!isInt(s[k], 1, max)) errors.push(`${where}.${k} must be a whole number from 1 to ${max}`);
  if (errors.length > before) return;
  if (s.col + s.width - 1 > g.columns) errors.push(`${where}: columns ${s.col} to ${s.col + s.width - 1} run past the grid's ${g.columns} columns`);
  if (s.row + s.height - 1 > g.rows) errors.push(`${where}: rows ${s.row} to ${s.row + s.height - 1} run past the grid's ${g.rows} rows`);
}

function slotProblems(slot, layout, sizes, where, errors) {
  if (isObj(slot) && 'col' in slot) { for (const z of sizes) oneSlotProblems(slot, layout.canvas[z], `${where}.slot`, errors); return; }
  if (!isObj(slot)) return errors.push(`${where}.slot is required: { "col": 1, "row": 1, "width": 6, "height": 4 }, or one per size`);
  for (const k of Object.keys(slot)) if (!sizes.includes(k)) errors.push(`${where}.slot has "${clip(k)}", which is not a size of this layout (${sizes.join(', ')})`);
  for (const z of sizes) {
    if (slot[z] === undefined) errors.push(`${where}.slot has no slot for ${z}`);
    else oneSlotProblems(slot[z], layout.canvas[z], `${where}.slot.${z}`, errors);
  }
}

const BUILTIN_ONLY = 'a setting of the built-in templates\' own designs, which a design for a brand\'s layout does not have, so only the built-in layouts use it';
function optionProblems(block, spec, where, errors, page, builtin) {
  for (const [k, o] of Object.entries(spec.options)) {
    const v = block[k];
    if (v === undefined) continue;
    if (!usedOn(o, page)) { errors.push(`${where}.${k} is used on ${o.pages.join(' and ')} pages only`); continue; }
    if (!builtin && o.builtin) { errors.push(`${where}.${k} reads ${BUILTIN_ONLY}`); continue; }
    if (!builtin && o.builtinValues?.includes(v)) { errors.push(`${where}.${k} "${v}" reads ${BUILTIN_ONLY}`); continue; }
    if (o.t === 'enum' && !o.list.includes(o.canon ? o.canon(v) : v)) errors.push(`${where}.${k} must be one of ${o.list.join(', ')} (got ${show(v)})`);
    if (o.t === 'bool' && typeof v !== 'boolean') errors.push(`${where}.${k} must be true or false`);
    if (o.t === 'int' && !isInt(v, o.min, o.max)) errors.push(`${where}.${k} must be a whole number from ${o.min} to ${o.max}`);
  }
}

// What a block on a built-in (poster or editorial) page may not do: those pages draw each block as the templates do, from the
// top of its rectangle down, in the page's own type, with the options PAGES lists, and some only in a given place.
const aPage = (page) => (/^[aeiou]/.test(page) ? `an ${page} page` : `a ${page} page`);

function builtPageProblems(blk, layout, sizes, where, errors, page) {
  const P = PAGES[page], honoured = Object.hasOwn(P.draws, blk.type) ? P.draws[blk.type] : null;
  if (!honoured) return errors.push(`${where}: ${aPage(page)} does not draw a ${blk.type} block (it draws ${Object.keys(P.draws).join(', ')})`);
  for (const k of Object.keys(BLOCKS[blk.type].options)) if (blk[k] !== undefined && !honoured.includes(k)) errors.push(`${where}.${k} is not used on ${aPage(page)} (a ${blk.type} there takes ${honoured.join(', ') || 'no options'})`);
  if (blk.type === 'decoration' && !P.decorations.includes(optionOf(blk, 'kind'))) errors.push(`${where}: ${aPage(page)} draws the decorations ${P.decorations.join(', ')} only`);
  // The poster photo runs full width to the bottom edge (it bleeds off the page); the editorial panel fills the page from its top.
  const full = fullWidth(page, blk);
  if (full && blk.px === undefined) errors.push(`${where}: on ${aPage(page)} the ${blk.type === 'photo' ? 'photo' : 'panel'} takes a "px" rectangle`);
  if (full && blk.px !== undefined) for (const z of sizes) {
    const p = pxFor(blk.px, z), S = SIZE_OF[z];
    if (isObj(p) && isInt(p.x, 0, S.w) && (p.x !== 0 || p.w !== S.w || p.y + p.h !== S.h)) errors.push(`${where}.px: on ${aPage(page)} the ${blk.type === 'photo' ? 'photo' : 'panel'} runs the full width to the bottom edge (x 0, w ${S.w}, y + h ${S.h} at ${z})`);
  }
}

// The value of an option with its default filled in (an older spelling read as the listed name).
export const optionOf = (block, k) => { const o = BLOCKS[block.type].options[k]; const v = block[k] ?? o?.def; return o?.canon ? o.canon(v) : v; };

// How many slabs a slabs block's children make: each headline starts one, and a first child that is not a headline starts one too.
export const slabCount = (children) => (Array.isArray(children) ? children.filter((c, i) => c?.type === 'headline' || i === 0).length : 0);

// One block (or one child of a slab). Returns the fields it shows. inside: the options its parent draws on it (a parent with
// "holds"), else every option a child may take.
function blockProblems(blk, layout, sizes, where, errors, { child = false, page = 'grid', builtin = false, inside = null } = {}) {
  if (!isObj(blk)) { errors.push(`${where} must be an object like { "type": "headline", "slot": { ... } }`); return []; }
  const spec = Object.hasOwn(BLOCKS, blk.type) ? BLOCKS[blk.type] : null;
  if (!spec) { errors.push(`${where}.type must be one of ${BLOCK_TYPES.join(', ')} (got ${show(blk.type)})`); return []; }
  if (!usedOn(spec, page)) { errors.push(`${where}: a ${blk.type} block belongs to ${spec.pages.join(' and ')} pages (set the layout's "page"), not to ${aPage(page)}`); return []; }
  if (!builtin && spec.builtin) { errors.push(`${where}: a ${blk.type} block draws ${BUILTIN_ONLY}`); return []; }
  if (child && !spec.child) { errors.push(`${where}: a ${blk.type} cannot go inside a slab (a slab holds ${BLOCK_TYPES.filter((t) => BLOCKS[t].child).join(', ')})`); return []; }
  const keys = [...BASE_KEYS, ...Object.keys(spec.options), ...(spec.bleed ? ['bleed'] : []), ...(spec.children ? ['children'] : []), ...Object.keys(BINDINGS[blk.type] ?? {})];
  unknownKeys(blk, keys, where, errors);
  optionProblems(blk, spec, where, errors, page, builtin);
  if (blk.when !== undefined) errors.push(...whenProblems(blk.when, isObj(layout.fields) ? Object.keys(layout.fields) : [], `${where}.when`, { page, builtin }));
  if (page !== 'grid') builtPageProblems(blk, layout, sizes, where, errors, page);
  if (child) {
    if (blk.slot !== undefined || blk.px !== undefined) errors.push(`${where}: a block inside a slab has no slot of its own (it flows in the slab)`);
    for (const k of CHILD_REFUSED) if (blk[k] !== undefined) errors.push(`${where}: a block inside a slab has no ${k} (set it on the slab)`);
    if (blk.when !== undefined) errors.push(`${where}: a block inside a slab has no condition of its own (set "when" on the slab)`);
    if (inside) for (const k of Object.keys(spec.options)) if (blk[k] !== undefined && !CHILD_REFUSED.includes(k) && !inside.includes(k)) errors.push(`${where}.${k}: the slabs do not draw a ${blk.type}'s ${k} (${inside.length ? `it takes only ${inside.join(', ')}` : 'it takes no options'} there)`);
  } else if (spec.chrome) {
    if (blk.slot !== undefined || blk.px !== undefined) errors.push(`${where}: a ${blk.type} has no slot: the page places it (following the brand's logo placement)`);
  } else if (blk.px !== undefined) {
    if (blk.slot !== undefined) errors.push(`${where}: give a slot (grid cells) or px (page pixels), not both`);
    if (blk.bleed !== undefined) errors.push(`${where}.bleed: a px rectangle is already in page pixels; run it to the page edge instead of bleeding`);
    pxProblems(blk.px, sizes, where, errors);
    // words stay inside the size's minimum margins (a story keeps clear of the Instagram interface)
    if (spec.text) for (const z of sizes) {
      const p = pxFor(blk.px, z), M = MIN_OF[z], S = SIZE_OF[z];
      if (!isObj(p) || ![p.x, p.y, p.w, p.h].every(Number.isInteger)) continue;
      if (p.x < M.left || p.y < M.top || p.x + p.w > S.w - M.right || p.y + p.h > S.h - M.bottom) errors.push(`${where}.px: a ${blk.type} keeps inside the ${z} page's minimum margins (${M.top} ${M.right} ${M.bottom} ${M.left} px) so its text stays clear of the edge`);
    }
  } else slotProblems(blk.slot, layout, sizes, where, errors);
  // What it shows: a declared field (by default the block type's own), a fixed text of the layout, or a fixed source.
  const used = [];
  const bind = (name, kinds, label = 'field') => {
    if (typeof name !== 'string' || !FIELDS[name]) return errors.push(`${where}.${label} must be one of ${FIELD_NAMES.filter((f) => kinds.includes(FIELDS[f].kind)).join(', ')} (got ${show(name)})`);
    if (!kinds.includes(FIELDS[name].kind)) return errors.push(`${where}.${label}: a ${blk.type} cannot show "${name}" (it shows ${FIELD_NAMES.filter((f) => kinds.includes(FIELDS[f].kind)).join(', ')})`);
    if (!isObj(layout.fields) || !layout.fields[name]) return errors.push(`${where}.${label}: "${name}" is not in the layout's fields; declare it there first`);
    used.push(name);
  };
  if (blk.type === 'label') {
    const ways = ['field', 'text', 'source'].filter((k) => blk[k] !== undefined);
    if (ways.length !== 1) errors.push(`${where}: a label needs exactly one of field (a declared short text), text (fixed words of the layout) or source (${LABEL_SOURCES.join(', ')})`);
    if (blk.field !== undefined) bind(blk.field, spec.kinds);
    if (blk.text !== undefined && !oneLine(blk.text, 40)) errors.push(`${where}.text must be one line of up to 40 characters`);
    if (blk.source !== undefined && !LABEL_SOURCES.includes(blk.source)) errors.push(`${where}.source must be one of ${LABEL_SOURCES.join(', ')}`);
  } else if (spec.kinds.length) bind(blk.field ?? spec.field, spec.kinds);
  else if (blk.field !== undefined) errors.push(`${where}: a ${blk.type} shows no field (remove field)`);
  if (blk.type === 'screen' && blk.titleField !== undefined) {
    const t = BINDINGS.screen.titleField;
    if (!needsMet(blk, t.needs)) errors.push(`${where}.titleField is only used with ${needsWords(t.needs)}`);
    else bind(blk.titleField, t.kinds, 'titleField');
  }
  // Options used only with another setting (a desktop window's tilt, a phone's fit, a sub line's width).
  for (const [k, o] of Object.entries(spec.options)) if (o.needs && blk[k] !== undefined && !needsMet(blk, o.needs)) errors.push(`${where}.${k} is only used with ${needsWords(o.needs)}`);
  // A headline's sub line flowing under it in the same box (the templates' textBlock and words), on the built-in pages.
  if (blk.type === 'headline' && blk.subField !== undefined) {
    const s = BINDINGS.headline.subField;
    if (!s.pages.includes(page)) errors.push(`${where}.subField is used on poster and editorial pages only (on a grid page, give the sub line its own block)`);
    else if (child) errors.push(`${where}.subField: a headline inside a slab has no sub line of its own`);
    else bind(blk.subField, s.kinds, 'subField');
  }
  if (blk.bleed !== undefined) {
    if (!Array.isArray(blk.bleed) || blk.bleed.length > 4 || blk.bleed.some((x) => !EDGES.includes(x)) || new Set(blk.bleed).size !== blk.bleed.length) errors.push(`${where}.bleed must be a list of page edges from ${EDGES.join(', ')}`);
    else if (blk.bleed.length && !needsMet(blk, BLEED_NEEDS[blk.type])) errors.push(`${where}: a framed photo cannot bleed (use ${needsWords(BLEED_NEEDS[blk.type])})`);
    else for (const z of sizes) {
      const s = slotFor(blk.slot, z), g = layout.canvas[z];
      if (!isObj(s) || !isInt(s.col, 1, 99) || !isInt(s.width, 1, 99)) continue;
      const touches = { top: s.row === 1, left: s.col === 1, bottom: s.row + s.height - 1 === g.rows, right: s.col + s.width - 1 === g.columns };
      for (const edge of blk.bleed) if (!touches[edge]) errors.push(`${where}.bleed: the slot does not touch the ${edge} edge of the ${z} grid, so it cannot bleed there`);
    }
  }
  if (spec.children) {
    if (blk.children === undefined) blk = { ...blk, children: [] };
    if (!Array.isArray(blk.children) || blk.children.length > MAX_CHILDREN) errors.push(`${where}.children must be a list of up to ${MAX_CHILDREN} blocks`);
    else {
      blk.children.forEach((c, i) => {
        const w = `${where}.children[${i}]`;
        if (spec.holds && isObj(c) && Object.hasOwn(BLOCKS, c.type) && !Object.hasOwn(spec.holds, c.type)) return errors.push(`${w}: the ${blk.type} draw only ${Object.keys(spec.holds).join(' and ')} inside them, not a ${c.type}`);
        used.push(...blockProblems(c, layout, sizes, w, errors, { child: true, page, builtin, inside: spec.holds?.[c?.type] ?? null }));
      });
      if (spec.slabs && slabCount(blk.children) > spec.slabs) errors.push(`${where}.children make ${slabCount(blk.children)} slabs, and the page draws ${spec.slabs} (each headline starts a slab, and so does a first child that is not a headline)`);
    }
  }
  return used;
}

// Rectangles in page pixels (a grid slot's cells, without its bleed, or a px rectangle). Cells that do not share a cell never
// overlap here either: they are a gutter apart (or touch, with no gutter), and a tolerance of half a pixel absorbs rounding.
const TOL = 0.5;
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > TOL && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > TOL;
const inside = (a, b) => a.x >= b.x - TOL && a.y >= b.y - TOL && a.x + a.w <= b.x + b.w + TOL && a.y + a.h <= b.y + b.h + TOL;
const boxOf = (l, blk, z) => slotRect(l, blk, z).inner;

// Every problem with one layout, as plain sentences. Empty when it can be used. A brand's own layout by default; { builtin: true }
// for the built-in templates' layouts (lib/design/builtin-layouts.mjs), which may also use what reads the templates' own design
// settings, and the photo post's and the page covers' pages (see the header).
export function validateLayout(l, where = 'layout', { builtin = false } = {}) {
  const errors = [];
  if (!isObj(l)) return [`${where} must be an object`];
  if (typeof l.id !== 'string' || !LAYOUT_ID.test(l.id)) return [`${where}: id must be lowercase letters, digits and - (up to 40, starting with a letter or digit)`];
  where = `${where} "${l.id}"`;
  unknownKeys(l, LAYOUT_KEYS, where, errors);
  if (!oneLine(l.name, 40)) errors.push(`${where}: name must be one line of up to 40 characters`);
  if (l.description !== undefined && (typeof l.description !== 'string' || l.description.length > 300)) errors.push(`${where}: description must be a text of up to 300 characters`);
  if (l.page !== undefined && !PAGE_KINDS.includes(l.page)) errors.push(`${where}: page must be one of ${PAGE_KINDS.join(', ')}`);
  const page = PAGE_KINDS.includes(l.page) ? l.page : 'grid';
  if (!builtin && !BRAND_PAGE_KINDS.includes(page)) errors.push(`${where}: a ${page} page is for the built-in layouts only: ${BUILTIN_PAGE_WHY[page]} (a brand's layout may use ${BRAND_PAGE_KINDS.join(', ')})`);
  if (l.ground !== undefined) groundProblems(l, page, where, errors, builtin);
  if (l.accent !== undefined && l.accent !== 'series' && !ACCENT_STYLES.includes(l.accent)) errors.push(`${where}: accent must be series or one of ${ACCENT_STYLES.join(', ')}`);
  if (l.texture !== undefined && !TEXTURES.includes(l.texture)) errors.push(`${where}: texture must be one of ${TEXTURES.join(', ')}`);
  // fields (a page whose words are all the brand's, PAGES[page].words "brand", may declare none and show no text block)
  const brandWords = PAGES[page]?.words === 'brand';
  if (!isObj(l.fields) || (!brandWords && !Object.keys(l.fields).length)) errors.push(`${where}: fields must name at least one field the layout shows, like { "headline": { "required": true } }`);
  else for (const [name, f] of Object.entries(l.fields)) {
    const w = `${where}: fields.${clip(name)}`, F = FIELDS[name];
    if (!F) { errors.push(`${w} is not a known field (known: ${FIELD_NAMES.join(', ')})`); continue; }
    if (!isObj(f)) { errors.push(`${w} must be an object like { "required": true }`); continue; }
    const keys = ['required', ...(TEXTUAL.includes(F.kind) ? ['max'] : []), ...(['stats', 'items'].includes(F.kind) ? ['min', 'max'] : []), ...(F.kind === 'artefact' ? ['types'] : [])];
    unknownKeys(f, keys, w, errors);
    if (f.required !== undefined && typeof f.required !== 'boolean') errors.push(`${w}.required must be true or false`);
    if (TEXTUAL.includes(F.kind) && f.max !== undefined && !isInt(f.max, 1, F.cap)) errors.push(`${w}.max must be a whole number of characters from 1 to ${F.cap}`);
    if (['stats', 'items'].includes(F.kind)) {
      if (f.max !== undefined && !isInt(f.max, 1, F.cap)) errors.push(`${w}.max must be a whole number from 1 to ${F.cap}`);
      if (f.min !== undefined && !isInt(f.min, 0, F.cap)) errors.push(`${w}.min must be a whole number from 0 to ${F.cap}`);
      if (isInt(f.min, 0, F.cap) && isInt(f.max ?? F.max, 1, F.cap) && f.min > (f.max ?? F.max)) errors.push(`${w}: min is more than max`);
    }
    if (F.kind === 'artefact' && f.types !== undefined && (!Array.isArray(f.types) || !f.types.length || f.types.some((t) => !ARTEFACT_TYPES.includes(t)))) errors.push(`${w}.types must be a list from ${ARTEFACT_TYPES.join(', ')}`);
  }
  // canvas
  const names = sizeNamesOf(page);
  if (!isObj(l.canvas) || !Object.keys(l.canvas).length) { errors.push(`${where}: canvas must have a grid for at least one size (${names.join(', ')})`); return errors; }
  const before = errors.length;
  for (const [size, g] of Object.entries(l.canvas)) {
    if (!names.includes(size)) errors.push(`${where}: canvas has an unknown size "${clip(size)}" (sizes${page === 'cover' ? ' of a cover page' : ''}: ${names.join(', ')})`);
    else if (FEED_PAGES.includes(page) && size !== 'feed') errors.push(`${where}: canvas has a ${size} size, but ${aPage(page)} is drawn at the feed size only`);
    else gridProblems(g, size, `${where}: canvas.${size}`, errors);
  }
  if (errors.length > before) return errors;
  const sizes = names.filter((z) => l.canvas[z]);
  // blocks
  if (!Array.isArray(l.blocks) || !l.blocks.length || l.blocks.length > MAX_BLOCKS) { errors.push(`${where}: blocks must be a list of 1 to ${MAX_BLOCKS} blocks`); return errors; }
  const used = [];
  l.blocks.forEach((blk, i) => used.push(...blockProblems(blk, l, sizes, `${where}: blocks[${i}]`, errors, { page, builtin }).map((name) => ({ name, i, when: blk?.when }))));
  if (errors.length) return errors;
  // A field is shown once, or by blocks that are never drawn together (their conditions exclude each other).
  const twice = used.filter((u, k) => used.some((v, j) => j < k && v.name === u.name && (v.i === u.i || !exclusive(v.when, u.when))));
  for (const f of new Set(twice.map((u) => u.name))) errors.push(`${where}: "${f}" is shown by more than one block; show each field once`);
  if (isObj(l.fields)) for (const f of Object.keys(l.fields)) if (FIELDS[f] && !used.some((u) => u.name === f)) errors.push(`${where}: fields.${f} is declared but no block shows it`);
  const shows = (t) => l.blocks.some((x) => x.type === t || (x.children ?? []).some((c) => c.type === t));
  if (!brandWords && !['headline', 'figure', 'sub'].some(shows) && !l.blocks.some((x) => x.type === 'label' || (x.children ?? []).some((c) => c.type === 'label'))) errors.push(`${where}: a layout needs at least one block of text (a headline, figure, sub line or label)`);
  // Blocks may not lie on each other (text never runs over a picture or another text); decorations lie under everything.
  // Chrome blocks have no slot (the page places them); blocks that are never drawn together may share space.
  for (const z of sizes) {
    const placed = l.blocks.map((x, i) => ({ i, s: BLOCKS[x.type].chrome ? null : boxOf(l, x, z), under: BLOCKS[x.type].under, when: x.when })).filter((p) => !p.under && p.s);
    for (let a = 0; a < placed.length; a++) for (let c = a + 1; c < placed.length; c++) {
      if (exclusive(placed[a].when, placed[c].when)) continue;
      if (overlaps(placed[a].s, placed[c].s)) errors.push(`${where}: blocks[${placed[a].i}] (${l.blocks[placed[a].i].type}) and blocks[${placed[c].i}] (${l.blocks[placed[c].i].type}) overlap on the ${z} grid; give each its own cells (put text on a colour panel with a slab and its children)`);
    }
    // A block on the tint panel lies wholly on it or wholly off it, never across its edge.
    l.blocks.forEach((p, i) => {
      if (p.type !== 'decoration' || optionOf(p, 'kind') !== 'panel') return;
      const ps = boxOf(l, p, z);
      placed.forEach((q) => { if (!exclusive(p.when, q.when) && overlaps(q.s, ps) && !inside(q.s, ps)) errors.push(`${where}: blocks[${q.i}] (${l.blocks[q.i].type}) lies across the edge of the panel (blocks[${i}]) on the ${z} grid; put it wholly on the panel or wholly off it`); });
    });
  }
  return errors;
}

// A brand's list of layouts (brand.json "layouts"): each valid, ids unique.
export function validateLayouts(list, where = 'brand.json: layouts') {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > MAX_LAYOUTS) return [`${where} must be a list of up to ${MAX_LAYOUTS} layouts`];
  const errors = list.flatMap((l, i) => validateLayout(l, `${where}[${i}]`));
  const ids = list.map((l) => l?.id).filter((id) => typeof id === 'string');
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errors.push(`${where}: the id "${id}" is used by more than one layout`);
  return errors;
}

// The brand file's layouts as written, without reading fonts or images (used to validate specs and batches). Each is checked
// where it is used.
export function loadLayouts({ root = ROOT, file = brandFile('brand.json', { root }) } = {}) {
  try { const l = JSON.parse(fs.readFileSync(file, 'utf8')).layouts; return Array.isArray(l) ? l : []; } catch { return []; }
}

// The layout a design names, checked. Throws an Error with a plain message when it is missing or not valid.
export function findLayout(id, layouts) {
  const list = Array.isArray(layouts) ? layouts : [];
  const l = list.find((x) => isObj(x) && x.id === id);
  if (!l) throw new Error(`layout "${clip(id)}" is not one of the brand's layouts (${list.filter(isObj).map((x) => x.id).filter((x) => typeof x === 'string').join(', ') || 'it has none'})`);
  const problems = validateLayout(l);
  if (problems.length) throw new Error(`the brand's layout "${l.id}" is not valid: ${problems.join('; ')}`);
  return l;
}

export const layoutSizes = (l) => SIZE_NAMES.filter((z) => l.canvas?.[z]);
export const layoutHasImage = (l) => !!l.fields?.image;
// Whether a layout shows a phone (the renderer then insists on a pre-framed capture).
export const layoutUsesPhone = (l) => (l.blocks ?? []).some((x) => x.type === 'screen' && optionOf(x, 'device') === 'phone');

// The keys a design block for a layout may have besides its fields: the page frame, as for the built-in templates.
const FRAME_KEYS = ['template', 'layout', 'sizes', 'name', 'networkSizes', 'series', 'label', 'ground', 'accent'];

function fieldProblems(d, name, f, where, errors) {
  const F = FIELDS[name], v = d[name], required = f.required === true || (['stats', 'items'].includes(F.kind) && (f.min ?? 0) > 0);
  if (v === undefined) { if (required) errors.push(`${where}: ${name} is required by this layout`); return; }
  if (F.kind === 'text') {
    const max = f.max ?? F.max;
    if (!isStr(v)) errors.push(`${where}: ${name} must be a non-empty text`);
    else if (v.length > max) errors.push(`${where}: ${name} is ${v.length} characters; this layout takes up to ${max}`);
  } else if (F.kind === 'short') {
    const max = f.max ?? F.max;
    if (typeof v !== 'string' || !v.trim()) errors.push(`${where}: ${name} must be a non-empty text`);
    else if (/[\r\n]/.test(v)) errors.push(`${where}: ${name} must be one line`);
    else if (v.length > max) errors.push(`${where}: ${name} is ${v.length} characters; this layout takes up to ${max}`);
  } else if (F.kind === 'stats') {
    const min = f.min ?? 1, max = f.max ?? F.max;
    if (!Array.isArray(v) || v.length < Math.max(1, min) || v.length > max) return errors.push(`${where}: stats needs ${Math.max(1, min)} to ${max} entries like "14.8M+|processed"`);
    v.forEach((s, i) => {
      const p = parseStat(s);
      if (!p) errors.push(`${where}: stats[${i}] must look like "number|label" or ["number", "label"]`);
      else if (p[0].length > 40 || p[1].length > 60) errors.push(`${where}: stats[${i}] is too long (up to 40 characters for the number and 60 for the label)`);
    });
  } else if (F.kind === 'items') {
    const min = f.min ?? 1, max = f.max ?? F.max;
    if (!Array.isArray(v) || v.length < Math.max(1, min) || v.length > max) return errors.push(`${where}: items must be a list of ${Math.max(1, min)} to ${max} short texts`);
    v.forEach((t, i) => {
      if (typeof t !== 'string' || !t.trim()) errors.push(`${where}: items[${i}] must be a non-empty text`);
      else if (/[\r\n]/.test(t)) errors.push(`${where}: items[${i}] must be one line`);
      else if (t.length > F.chars) errors.push(`${where}: items[${i}] is ${t.length} characters; the most is ${F.chars}`);
    });
  } else if (F.kind === 'image') {
    if (!isStr(v)) errors.push(`${where}: image must be a file path`);
    else if (!IMAGE_EXT.includes(path.extname(v).toLowerCase())) errors.push(`${where}: image "${clip(v)}" must be ${IMAGE_EXT.join(' ')}`);
  } else if (F.kind === 'artefact') {
    if (!isObj(v)) return errors.push(`${where}: artefact must be an object like { "type": "ledger", ... }`);
    if (f.types && !f.types.includes(v.type)) return errors.push(`${where}: this layout takes an artefact of type ${f.types.join(' or ')}`);
    // The built-in templates' own artefact checks, run through their public validator (a text page with that artefact).
    errors.push(...validateDesign({ template: 'text', headline: 'x', artefact: v }, where));
  }
}

// Every problem with a design block { template: "layout", layout: "<id>", ...fields }. opts.layouts: the brand's layouts;
// opts.series: its series keys (without them only the key's shape is checked).
export function layoutDesignProblems(d, where = 'design', opts = {}) {
  if (!isObj(d)) return [`${where}: must be an object`];
  if (d.template !== 'layout') return [`${where}: template must be "layout"`];
  if (typeof d.layout !== 'string' || !LAYOUT_ID.test(d.layout)) return [`${where}: layout must name one of the brand's layouts (lowercase letters, digits and -)`];
  let l;
  try { l = findLayout(d.layout, opts.layouts); } catch (err) { return [`${where}: ${err.message}`]; }
  const errors = [], sizes = layoutSizes(l);
  const asked = parseSizes(d.sizes, { errors, where });
  const off = asked.filter((z) => SIZE_NAMES.includes(z) && !sizes.includes(z));
  if (off.length) errors.push(`${where}: layout "${l.id}" is drawn for ${sizes.join(', ')} only (not ${off.join(', ')})`);
  if (d.sizes === undefined && !sizes.includes('feed')) errors.push(`${where}: layout "${l.id}" has no feed size; set sizes to ${sizes.join(', ')}`);
  if (d.name !== undefined && !/^[a-z0-9][a-z0-9._-]*$/.test(d.name)) errors.push(`${where}: name must use lowercase letters, digits, . _ - only`);
  if (d.networkSizes !== undefined) {
    if (!isObj(d.networkSizes)) errors.push(`${where}: networkSizes must look like { "linkedin": "wide" }`);
    else for (const [n, s] of Object.entries(d.networkSizes)) {
      if (!NETWORKS.includes(n)) errors.push(`${where}: networkSizes has an unknown network "${clip(n)}"`);
      else if (!asked.includes(s)) errors.push(`${where}: networkSizes.${n} is "${show(s)}", which is not in sizes`);
    }
  }
  if (d.series !== undefined) {
    if (typeof d.series !== 'string' || !SERIES_KEY.test(d.series)) errors.push(`${where}: series must be a key from brand.json (lowercase letters, digits and -)`);
    else if (opts.series && !opts.series.includes(d.series)) errors.push(`${where}: series "${d.series}" is not in brand.json (known: ${opts.series.join(', ') || 'none'})`);
  }
  if (d.ground !== undefined && !groundName(d.ground)) errors.push(`${where}: ground must be one of ${GROUND_NAMES.join(', ')}`);
  if (d.accent !== undefined && !ACCENT_STYLES.includes(d.accent)) errors.push(`${where}: accent must be one of ${ACCENT_STYLES.join(', ')}`);
  const own = Object.keys(l.fields);
  const extra = layoutHasImage(l) ? ['focal', 'zoom'] : [];
  if (d.focal !== undefined && layoutHasImage(l) && (isObj(d.focal) && !('x' in d.focal) ? true : focalToCss(d.focal) === null)) errors.push(`${where}: focal must look like "60% 40%", "center", "left top" or { "x": 0.6, "y": 0.4 }`);
  if (d.zoom !== undefined && layoutHasImage(l) && !(typeof d.zoom === 'number' && Number.isFinite(d.zoom) && d.zoom >= 1 && d.zoom <= 3)) errors.push(`${where}: zoom must be a number from 1 to 3`);
  for (const k of Object.keys(d)) {
    if (!FRAME_KEYS.includes(k) && !own.includes(k) && !extra.includes(k)) errors.push(`${where}: ${clip(k)} is not used by layout "${l.id}" (it takes ${[...own, ...extra].join(', ')})`);
  }
  // The label field doubles as the series name override; it is checked like any other short field when declared.
  if (d.label !== undefined && !own.includes('label') && !oneLine(d.label, 40)) errors.push(`${where}: label must be one line of up to 40 characters`);
  for (const [name, f] of Object.entries(l.fields)) fieldProblems(d, name, f, where, errors);
  return errors;
}

// Fills defaults and parses what needs parsing (sizes, stats). Call layoutDesignProblems first.
export function normaliseLayoutDesign(d, layouts) {
  const l = findLayout(d.layout, layouts), sizes = layoutSizes(l);
  const spec = { ...d, sizes: d.sizes === undefined ? (sizes.includes('feed') ? ['feed'] : [sizes[0]]) : parseSizes(d.sizes) };
  if (d.stats) spec.stats = d.stats.map(parseStat);
  return spec;
}

// ---- a carousel page drawn from one of the brand's layouts ----
// A carousel's page may be { "template": "layout", "layout": "<id>", ...that layout's fields }, beside (or instead of) the
// built-in page templates. It is checked exactly as a single post made with that layout (layoutDesignProblems) and drawn with its
// place in the carousel (the renderer's counter { n, total }), so the layout's "page" conditions and the folio hold. A carousel
// is drawn at the feed size, so the layout needs a feed canvas; sizes, the file name and the network sizes are the carousel's.
const CAROUSEL_OWN = ['sizes', 'name', 'networkSizes'];
export function layoutPageProblems(p, where = 'page', opts = {}) {
  if (!isObj(p)) return [`${where}: must be an object`];
  const errors = CAROUSEL_OWN.filter((k) => p[k] !== undefined).map((k) => `${where}: ${k} is set on the carousel, not on one of its pages`);
  const rest = Object.fromEntries(Object.entries(p).filter(([k]) => !CAROUSEL_OWN.includes(k)));
  const l = Array.isArray(opts.layouts) ? opts.layouts.find((x) => isObj(x) && x.id === p.layout) : undefined;
  if (l && isObj(l.canvas) && !l.canvas.feed) return [...errors, `${where}: layout "${clip(l.id)}" has no feed size, and a carousel page is drawn at the feed size (1080 x 1350)`];
  return [...errors, ...layoutDesignProblems(rest, where, opts)];
}

// Every problem with a post's design block: a brand layout's against the fields it declares, the built-in templates' with the
// templates' validator, and a carousel's pages either way. opts: { series, layouts } of the brand.
export function postDesignProblems(d, where = 'design', opts = {}) {
  if (isObj(d) && d.template === 'layout') return layoutDesignProblems(d, where, opts);
  return validateDesign(d, where, { ...opts, layoutPage: (p, w) => layoutPageProblems(p, w, opts) });
}

// A post's design block with defaults filled in and what needs parsing parsed: a layout's, or the built-in templates' with a
// carousel's layout pages normalised as their layout's (at the carousel's sizes). Call postDesignProblems first.
export function normalisePostDesign(d, layouts) {
  if (d.template === 'layout') return normaliseLayoutDesign(d, layouts);
  const spec = normaliseDesign(d);
  if (spec.template === 'carousel') spec.pages = spec.pages.map((p) => (p.template === 'layout' ? { ...normaliseLayoutDesign(p, layouts), sizes: spec.sizes } : p));
  return spec;
}
// Whether a design block needs the brand's layouts to be checked: a layout post, or a carousel with a layout page.
export const usesLayouts = (d) => isObj(d) && (d.template === 'layout' || (Array.isArray(d.pages) && d.pages.some((p) => isObj(p) && p.template === 'layout')));

// Sample words for each field, for previews of a layout before any post uses it.
export const SAMPLE = {
  headline: 'Every saving, *on record.*', sub: 'One clear line that says what the post is about, in the brand\'s own voice.', line: 'saved by members this year',
  quote: 'We finally see where every euro goes.', myth: 'Group savings are hard to keep track of.', factLead: 'Every payment is *on the record.*', fact: 'Each member sees the same ledger, updated the moment money moves.',
  big: '14.8M+', label: 'Explainer', eyebrow: 'New this month', note: 'Figures from the last twelve months', title: 'Passbooks',
  stats: [['3,900+', 'members'], ['400+', 'groups']], items: ['Read-only by design', 'Two-person approval', 'Every change logged'],
  image: 'design/assets/demo/object-jar.jpg', artefact: { type: 'register', title: 'Where it went', rows: [['Rent', '400.00'], ['Food', '120.50'], ['Savings', '80.00']], mark: 2 },
};

// A sample artefact of each type (SAMPLE.artefact is the register card).
const SAMPLE_ARTEFACTS = {
  register: SAMPLE.artefact,
  passbook: { type: 'passbook', days: 31, ticked: 17, today: 18 },
  ledger: { type: 'ledger', columns: [{ label: 'Day' }, { label: 'Paid', align: 'end' }], rows: [['01', '10.00'], ['02', '12.50'], ['03', '10.00']], mark: [{ row: 1, col: 1 }] },
};

// A design block that shows every field of a layout with sample words (lists cut to the layout's maximum, texts to its length).
// artefact: the type of the sample artefact (a ledger, passbook or register card), when the layout's artefact field takes it.
export function sampleDesign(l, { size, artefact } = {}) {
  const d = { template: 'layout', layout: l.id };
  for (const [name, f] of Object.entries(l.fields ?? {})) {
    const F = FIELDS[name];
    if (!F) continue;
    let v = structuredClone(SAMPLE[name]);
    if (TEXTUAL.includes(F.kind)) v = v.length > (f.max ?? F.max) ? v.slice(0, f.max ?? F.max).replace(/\*/g, '').trim() : v;
    if (F.kind === 'stats' || F.kind === 'items') v = v.slice(0, f.max ?? F.max);
    if (name === 'image' && l.blocks.some((x) => x.type === 'screen' && optionOf(x, 'device') === 'desktop')) v = 'design/assets/demo/screen-desk.png';
    // a phone is always a pre-framed capture (the renderer refuses any other picture there)
    if (name === 'image' && layoutUsesPhone(l)) v = 'design/assets/demo/screen-phone.png';
    if (F.kind === 'artefact') {
      const takes = (t) => Object.hasOwn(SAMPLE_ARTEFACTS, t) && (!f.types || f.types.includes(t));
      v = structuredClone(SAMPLE_ARTEFACTS[takes(artefact) ? artefact : takes('register') ? 'register' : f.types[0] === 'passbook' ? 'passbook' : 'ledger']);
    }
    d[name] = v;
  }
  if (size) d.sizes = [size];
  else if (!layoutSizes(l).includes('feed')) d.sizes = [layoutSizes(l)[0]];
  return d;
}

// The options of a block type that a grid page (a brand's own layout) takes; the others belong to the built-in pages.
export const gridOptions = (type) => Object.entries(BLOCKS[type].options).filter(([, o]) => usedOn(o, 'grid'));

// The condition choices ({ field, is | not }) a brand's layout may test on a page: the artefact's type on a grid page, the
// artefact and its register card on a brand's poster or editorial page (whenProblems; the rest are the built-in layouts' only).
const brandChoices = (page) => CHOICE_NAMES.filter((n) => (page === 'grid' ? SPEC_CHOICES[n].grid : SPEC_CHOICES[n].brand));

// One page kind as a brand's layout may use it: what the editor offers there, and nothing validateLayout refuses a brand's
// layout (test-design-layout-catalogue.mjs holds the two together).
function pageCatalogue(p) {
  const grid = p === 'grid';
  const types = grid ? BLOCK_TYPES : Object.keys(PAGES[p].draws).filter((t) => !BLOCKS[t].builtin);
  const honoured = (t) => (grid ? gridOptions(t).map(([k]) => k) : PAGES[p].draws[t]).filter((k) => !BLOCKS[t].options[k].builtin);
  const decorations = grid ? BLOCKS.decoration.options.kind.list : PAGES[p].decorations;
  const fieldsOf = (kinds) => FIELD_NAMES.filter((f) => kinds.includes(FIELDS[f].kind));
  const childTypes = types.filter((t) => BLOCKS[t].child);
  return {
    sizes: SIZE_NAMES.filter((z) => !FEED_PAGES.includes(p) || z === 'feed'),
    // how a block is placed: grid cells ("slot") and page pixels ("px") on a grid page, page pixels on a built-in page
    place: grid ? ['slot', 'px'] : ['px'],
    decorations,
    // the page colour: "series", a ground name (or an older name, groundAliases), and on a poster page "photo" with the image field
    grounds: ['series', ...GROUND_NAMES, ...(p === 'poster' ? ['photo'] : [])],
    photoGround: p === 'poster' ? { field: 'image' } : null,
    // a block's (or a ground case's) "when": present / absent name a declared field; page one of pages; field names a choice,
    // with "is" or "not" and one value or a list of distinct values from its list. declared: the choice is a field of the layout,
    // which must be declared; unset: an empty one matches no "is", only a "not". Several keys must all hold; a block inside a
    // slab takes none.
    conditions: {
      keys: WHEN_KEYS, pages: PAGE_CONDITIONS,
      // (a choice that is a field only where a block of this page can show that field: it must be declared, and so shown)
      choices: Object.fromEntries(brandChoices(p).filter((n) => !FIELDS[n] || types.some((t) => BLOCKS[t].kinds.includes(FIELDS[n].kind)))
        .map((n) => [n, { values: SPEC_CHOICES[n].values, unset: !!SPEC_CHOICES[n].unset, declared: !!FIELDS[n] }])),
    },
    blocks: Object.fromEntries(types.map((t) => {
      const s = BLOCKS[t];
      const bindable = Object.entries(BINDINGS[t] ?? {}).filter(([, v]) => !v.pages || v.pages.includes(p)).map(([k]) => k);
      // what a "needs" asks for can be had on this page: a binding it offers, or an option value it offers (or the default)
      const reachable = (want, offered) => !want || Object.entries(want).every(([k, v]) => (v === true ? bindable.includes(k) : offered.includes(k) ? s.options[k].list?.includes(v) ?? true : s.options[k]?.def === v));
      const plain = honoured(t);
      const opts = plain.filter((k) => reachable(s.options[k].needs, plain));
      const option = (k) => optionSpec(t === 'decoration' && k === 'kind' ? { ...s.options[k], list: decorations } : s.options[k]);
      const bind = bindable.map((k) => [k, BINDINGS[t][k]]).filter(([, v]) => reachable(v.needs, opts));
      // what a block with children holds: each child type, with the options it takes inside (a child's own options here, but no
      // vertical alignment; only those the parent draws when it has "holds")
      const childOpts = (c) => honoured(c).filter((k) => reachable(BLOCKS[c].options[k].needs, honoured(c)) && !CHILD_REFUSED.includes(k) && (!s.holds || s.holds[c].includes(k)));
      const holds = s.children ? Object.fromEntries(childTypes.filter((c) => !s.holds || Object.hasOwn(s.holds, c)).map((c) => [c, childOpts(c)])) : null;
      return [t, {
        kinds: s.kinds, field: s.field, fields: fieldsOf(s.kinds),
        chrome: !!s.chrome, child: !!s.child, text: !!s.text, under: !!s.under,
        bleed: grid && s.bleed ? { edges: EDGES, needs: BLEED_NEEDS[t] ?? null } : null,
        children: holds ? Object.keys(holds) : null,
        holds,
        // the most slabs a slabs block draws (each headline child starts one, and so does a first child that is not a headline)
        slabs: s.slabs ?? null,
        fullWidth: FULL_WIDTH[p]?.[t] ?? null,
        options: Object.fromEntries(opts.map((k) => [k, option(k)])),
        // every option's default, also of those this page does not take (a "needs" reads them)
        defaults: Object.fromEntries(Object.entries(s.options).map(([k, o]) => [k, o.def])),
        bindings: Object.fromEntries(bind.map(([k, v]) => [k, { ...(v.kinds ? { kinds: v.kinds, fields: fieldsOf(v.kinds) } : {}), ...(v.max ? { max: v.max } : {}), ...(v.values ? { values: v.values } : {}), needs: v.needs ?? null, child: v.child !== false }])),
      }];
    })),
  };
}

// What the layout editor and the AI are told, as plain data. blocks: the grid page's block types and options (what the AI's
// compositions are offered). pages: every page kind a brand's layout may use (grid, poster, editorial), with its block types, the
// options each takes there (a fixed list, a flag or a bounded whole number), the fields each may show, the condition forms and
// choices, and the page colours; the built-in layouts' own options, blocks, choices and pages are not in it.
export function layoutCatalogue() {
  return {
    sizes: Object.fromEntries(SIZE_NAMES.map((z) => [z, {
      w: SIZES[z].w, h: SIZES[z].h, minMargins: MIN_MARGINS[z],
      // a "px" rectangle on this size: whole numbers, x + w and y + h inside the page
      px: { x: [0, SIZES[z].w - 1], y: [0, SIZES[z].h - 1], w: [1, SIZES[z].w], h: [1, SIZES[z].h] },
    }])),
    grid: GRID_LIMITS,
    grounds: GROUND_NAMES, groundAliases: { ...GROUND_ALIASES }, darkGrounds: DARK_GROUNDS, accents: ACCENT_STYLES, textures: TEXTURES,
    fields: Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, { ...f, rules: fieldRules(f) }])),
    blocks: Object.fromEntries(BLOCK_TYPES.map((k) => [k, BLOCKS[k]]).map(([k, s]) => [k, {
      kinds: s.kinds, field: s.field, child: !!s.child, bleed: !!s.bleed, children: !!s.children, under: !!s.under,
      options: Object.fromEntries(gridOptions(k).map(([o, v]) => [o, optionSpec(v)])),
    }])),
    labelSources: LABEL_SOURCES,
    layout: { id: { pattern: LAYOUT_ID.source, max: 40 }, name: { max: 40 }, description: { max: 300 }, accents: ['series', ...ACCENT_STYLES] },
    limits: { layouts: MAX_LAYOUTS, blocks: MAX_BLOCKS, children: MAX_CHILDREN, groundCases: MAX_GROUND_CASES },
    pages: Object.fromEntries(BRAND_PAGE_KINDS.map((p) => [p, pageCatalogue(p)])),
  };
}
// The rules a layout's field may set: required, and max (texts), min and max (lists) or types (an artefact), with their bounds.
function fieldRules(F) {
  const r = { required: true };
  if (TEXTUAL.includes(F.kind)) r.max = { min: 1, max: F.cap, default: F.max };
  // (no min given: the field is optional, and one given has at least one entry)
  if (['stats', 'items'].includes(F.kind)) { r.min = { min: 0, max: F.cap }; r.max = { min: 1, max: F.cap, default: F.max }; }
  if (F.kind === 'artefact') r.types = ARTEFACT_TYPES;
  return r;
}
// An option as the editor is told it: a fixed list (without values for the built-in layouts only, with the older spellings it
// reads), a flag or a bounded whole number; and what it needs of the block's other settings.
function optionSpec(v) {
  const more = v.needs ? { needs: v.needs } : {};
  if (v.t === 'enum') return { type: 'enum', values: v.list.filter((x) => !v.builtinValues?.includes(x)), default: v.def, ...(v.aliases ? { aliases: { ...v.aliases } } : {}), ...more };
  if (v.t === 'int') return { type: 'int', min: v.min, max: v.max, step: 1, default: v.def, ...more };
  return { type: 'bool', default: v.def, ...more };
}
