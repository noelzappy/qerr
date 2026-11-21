// The poster page of the built-in templates (object, number, product, myth-fact, closing), as a layout's "page": "poster" draws
// it: one ground per post (a dark one with the posters' line texture), large two-tone headlines, a photo that bleeds off the
// bottom and may lend the page its colour, and the logo bar. Each block is drawn with exactly the markup of
// design/templates/poster.mjs, so a template expressed as a layout (lib/design/builtin-layouts.mjs) makes the same image.
// What each block honours is listed in PAGES.poster (lib/design/layout.mjs). Phase 2 of the conversion adds drawings here,
// each as its own function and one line in DRAW (see testlib/CONVERTING.md).
import { decorationHtml, drawBuiltPage, isInt, opt, place } from './layout-parts.mjs';
import { fmtE, fmtSub, hs, px } from '../../design/templates/common.mjs';
import { bar, objectPhoto } from '../../design/templates/poster.mjs';

// A headline or a figure's font size: shrunk by the fit loop with every other block that shrinks (hs), or fixed.
const fontSize = (blk, n) => (opt(blk, 'shrink') ? hs(n) : `${px(n)}px`);
// The poster's lead text box (the first headline or figure drawn) is #txt, which stands above the photo (brand.css).
const lead = (state) => { if (state.txt) return ''; state.txt = true; return ' id="txt"'; };

// A headline or a big figure in its box, as poster.mjs words() sets one without a sub line: text-align always written. On a
// poster page the type is the posters' unless the block asks for the editorial style.
function words(blk, spec, r, state, { big }) {
  const v = spec[blk.field ?? (big ? 'big' : 'headline')];
  if (typeof v !== 'string' || !v) return '';
  const size = opt(blk, 'size'), editorial = blk.style !== undefined && opt(blk, 'style') === 'editorial';
  const cls = editorial ? (big ? 'h big' : `h s${size}`) : (big ? 'ps-h big' : 'ps-h');
  return `<div class="abs"${lead(state)} style="${place(r)};text-align:${opt(blk, 'align')}"><div class="${cls}" data-role="${big ? 'stat' : 'headline'}" style="font-size:${fontSize(blk, size)}">${fmtE(v)}</div></div>`;
}

// A sub line on its own (number's line under the figure): the box carries the role, in the posters' sub style.
function sub(blk, spec, ctx, r) {
  const v = spec[blk.field ?? 'sub'];
  if (typeof v !== 'string' || !v) return '';
  const align = opt(blk, 'align');
  return `<div class="abs sub ps-sub" data-role="sub" data-min="30" style="${place(r)}${align === 'left' ? '' : `;text-align:${align}`}">${fmtSub(v)}</div>`;
}

// Up to three figures side by side, sharing the rectangle's width with 40 px between them (number's supporting figures).
function stats(blk, spec, ctx, r) {
  const list = Array.isArray(spec[blk.field ?? 'stats']) ? spec[blk.field ?? 'stats'] : [];
  const gap = 40, step = (r.w + gap) / Math.max(1, list.length), size = opt(blk, 'size');
  return list.map((s, i) => `<div class="abs" style="left:${px(r.x + i * step)}px;top:${px(r.y)}px;width:${px(step - gap)}px"><div class="ps-h" data-role="stat" style="font-size:${fontSize(blk, size)}">${fmtSub(s[0])}</div><div class="sub ps-sub" data-role="statlabel" data-min="30" style="margin-top:6px">${fmtSub(s[1])}</div></div>`).join('');
}

// The photo, full width from the top of its rectangle to the bottom edge (or from the spec's validated photoTop). Whether its
// plain background becomes the page is decided in the browser from its pixels (runtime.mjs ready(); not for a treated photo).
function photo(blk, spec, ctx, r) {
  if (typeof spec.image !== 'string' || !spec.image) return '';
  const top = opt(blk, 'photoTop') && isInt(spec.photoTop, 300, 960) ? spec.photoTop : r.y;
  return objectPhoto(ctx, spec, { top });
}

export const DRAW = {
  photo,
  bar: (blk, spec, ctx, r, state) => bar(ctx, state.frame.dark),
  headline: (blk, spec, ctx, r, state) => words(blk, spec, r, state, { big: false }),
  figure: (blk, spec, ctx, r, state) => words(blk, spec, r, state, { big: true }),
  sub,
  stats,
  decoration: (blk, spec, ctx, r, state) => decorationHtml(blk, ctx, r, state.warnings),
  spacer: () => '',
};

// The page around the blocks: poster.mjs poster().
const wrap = (f, body) => ({
  body: `<div class="cv poster${f.texture ? ` ${f.texture}` : ''}" style="--bg:var(--g-${f.ground})">${body}</div>`,
  bodyClass: `acc-${f.accent}${f.dark ? ' dark' : ''}`,
  bodyAttrs: 'data-editorial="1"',
});

export const drawPoster = (layout, spec, ctx) => drawBuiltPage(layout, spec, ctx, { page: 'poster', draw: DRAW, wrap });
