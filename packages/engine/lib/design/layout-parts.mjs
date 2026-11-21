// Pieces every kind of layout page draws with (lib/design/layout-render.mjs for grid pages, layout-poster.mjs and
// layout-editorial.mjs for the built-in templates' pages): reading a block's options from the fixed lists, a rectangle as a
// style, the decorations, the page's frame (its ground, accent and texture) and the loop that draws a built-in page.
// The rule of design/templates/common.mjs holds: only esc()/fmt*() text, ctx.image() data: URIs, numbers computed from
// validated numbers and names from fixed lists reach the page.
import { DesignError } from './errors.mjs';
import { BLOCKS, PAGES, groundCase, optionOf, slotRect, whenHolds } from './layout.mjs';
import { GROUND_NAMES, groundName } from './tokens.mjs';
import { px } from '../../design/templates/common.mjs';
import { dotMapSvg } from '../../design/templates/map.mjs';
import { accentOf, decorationOf, isDark } from '../../design/templates/style.mjs';

// Only a name from the fixed list ever reaches a class attribute, whatever was passed.
export const pick = (list, v, def) => (list.includes(v) ? v : def);
export const opt = (blk, k) => { const o = BLOCKS[blk.type].options[k]; const v = optionOf(blk, k); return o?.t === 'enum' ? pick(o.list, v, o.def) : o?.t === 'bool' ? v === true : undefined; };
export const box = (r) => `left:${px(r.x)}px;top:${px(r.y)}px;width:${px(r.w)}px;height:${px(r.h)}px`;
// A rectangle's place and width, for text that runs down from its top (the built-in pages' text boxes).
export const place = (r) => `left:${px(r.x)}px;top:${px(r.y)}px;width:${px(r.w)}px`;
export const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// The decorations: a hairline rule across the middle of the slot, the tint panel, the dot grid or the line texture (these two
// need design/layout.css), the glow or the brand's dot map.
export function decorationHtml(blk, ctx, r, warnings) {
  const kind = opt(blk, 'kind');
  if (kind === 'rule') return `<div class="rule" style="left:${px(r.x)}px;top:${px(r.y + r.h / 2)}px;width:${px(r.w)}px"></div>`;
  if (kind === 'panel') return `<div class="ly-panel" aria-hidden="true" style="${box(r)}"></div>`;
  if (kind === 'dots') return `<div class="abs ly-dots" aria-hidden="true" style="${box(r)}"></div>`;
  if (kind === 'texture') return `<div class="abs ly-tex" aria-hidden="true" style="${box(r)}"></div>`;
  if (kind === 'glow') return `<div class="glow" aria-hidden="true" style="${box(r)}"></div>`;
  if (!ctx.brand.map) { warnings.push('this brand has no dot map, so the layout\'s map was left off (add one in Settings, Brand and look, Advanced)'); return ''; }
  const w = Math.round(r.w), h = Math.round(r.h);
  return `<svg class="fig map" style="left:${px(r.x)}px;top:${px(r.y)}px" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${dotMapSvg(ctx.brand.map, w, h)}</svg>`;
}

// The page's decoration class for a layout's "texture": the layout's own choice, or (auto) the brand's style as the page's
// templates apply it (`auto` is the default look of that kind of page).
const TEXTURE_CLASS = { none: '', dots: 'dots', grid: 'grid', lines: 'tex' };
export const textureOf = (layout, brand, auto) => (!layout.texture || layout.texture === 'auto' ? auto() : Object.hasOwn(TEXTURE_CLASS, layout.texture) ? TEXTURE_CLASS[layout.texture] : '');

// The frame of a built-in page: its ground (the spec's, else the layout's, else the series', else the page's default), whether
// it is dark, its accent style and the series' name, worded as the templates word their errors.
//   poster: the default ground is cool; "photo" (a page that shows a photo) is the series' ground, else cool, and a plain photo
//           background replaces it in the browser; the accent falls back to the colour; the decoration is the posters' (lines).
//   editorial: the default ground is light; the accent falls back to muted; the decoration is the dots, unless the spec says
//           dots: false.
export function builtFrame(layout, spec, ctx, page) {
  const B = ctx.brand, poster = page === 'poster';
  const series = spec.series !== undefined ? B.series?.[spec.series] : null;
  if (spec.series !== undefined && !series) throw new DesignError(poster ? `series "${spec.series}" is not in brand.json` : `series "${spec.series}" is not in brand.json (known: ${Object.keys(B.series ?? {}).join(', ')})`);
  const photo = poster && typeof spec.image === 'string' && spec.image !== '';
  let g = spec.ground ?? groundCase(layout, spec, ctx.counter) ?? 'series';
  if (g === 'series') g = series?.ground ?? (poster ? 'cool' : 'light');
  else if (g === 'photo' && photo) g = groundName(series?.ground) ?? 'cool';
  const ground = groundName(g);
  if (!ground) throw new DesignError(`ground must be one of ${GROUND_NAMES.join(', ')}${photo ? ' or photo' : ''}`);
  const dark = isDark(B, ground);
  const own = spec.accent ?? (layout.accent && layout.accent !== 'series' ? layout.accent : undefined);
  const accent = accentOf(B, { spec: { accent: own }, series, fallback: poster ? 'colour' : 'muted' });
  const texture = textureOf(layout, B, () => decorationOf(B, poster ? { dark, poster: true } : { dark, off: spec.dots === false }));
  return { ground, dark, accent, texture, label: spec.label ?? series?.name ?? B.name };
}

// A built-in page: its blocks drawn in their order (later ones on top), each only when its condition holds, by the page's
// drawing for its type: draw[type](blk, spec, ctx, r, state) -> markup. state: { frame, shown (the blocks drawn, with their
// rectangles), warnings, ... } for drawings that depend on another block (text on the panel, the footer over it).
export function drawBuiltPage(layout, spec, ctx, { page, draw, wrap }) {
  const size = ctx.size.name;
  if (!PAGES[page]) throw new DesignError(`layout "${layout.id}" has no page of kind ${page}`);
  const shown = layout.blocks.filter((blk) => whenHolds(blk.when, spec, ctx.counter)).map((blk) => ({ blk, r: BLOCKS[blk.type].chrome ? null : slotRect(layout, blk, size) }));
  const state = { frame: builtFrame(layout, spec, ctx, page), shown, warnings: [], txt: false };
  const body = shown.map(({ blk, r }) => {
    if (!Object.hasOwn(draw, blk.type)) throw new DesignError(`a ${page} page does not draw a ${blk.type} block`);
    return draw[blk.type](blk, spec, ctx, r, state);
  }).join('');
  return { ...wrap(state.frame, body), warnings: state.warnings };
}
