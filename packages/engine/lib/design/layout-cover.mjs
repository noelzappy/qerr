// A social page's cover or profile picture (design/templates/pagecover.mjs), as a layout's "page": "cover" draws it, at a cover
// size (sizes.mjs COVER_SIZES): the white ground in the brand's type, the brand's mark, or its logo, tagline, descriptor and
// website set in a box. Each block is drawn with the markup of pagecover.mjs's own helpers, so a cover drawn from its layout
// (lib/design/builtin/photo.mjs) is the same image. What each block honours is listed in PAGES.cover (lib/design/layout.mjs).
//
// The words are the brand's, never a spec's: through pagecover.mjs coverWords (esc()/fmt()); every position and size is a
// number from the layout's checked rectangles and bounded options. The sizes are the layout's; the renderer sets the tagline
// smaller or over two lines when the words would leave their box or the size's margins, and refuses words that fit neither
// (render.mjs fitCover, checks.mjs findCoverProblems).
import { DesignError } from './errors.mjs';
import { slotRect, whenHolds } from './layout.mjs';
import { opt } from './layout-parts.mjs';
import { COVER_SIZES } from './sizes.mjs';
import { px } from '../../design/templates/common.mjs';
import { coverLine, coverMark, coverTag, coverUrl, coverWords } from '../../design/templates/pagecover.mjs';

// A length: 0 as the covers write it, else whole pixels.
const len = (n) => (n === 0 ? '0' : `${px(n)}px`);

// The mark, as high as its rectangle, centred on the rectangle's centre (in % of the page).
const mark = (blk, spec, ctx, r) => coverMark(ctx.brand, { h: px(r.h), cx: px(((r.x + r.w / 2) / ctx.size.w) * 100), cy: px(((r.y + r.h / 2) / ctx.size.h) * 100) });

// The logo, tagline, descriptor and website in a flex box filling the rectangle: a column (centred, or set left) or a row.
function words(blk, spec, ctx, r) {
  const S = ctx.size, w = coverWords(ctx.brand), o = (k) => opt(blk, k);
  const at = `left:${len(r.x)};right:${len(S.w - r.x - r.w)};top:${px(r.y)}px;height:${px(r.h)}px`;
  if (o('arrange') === 'row') {
    return `<div class="col" style="${at};align-items:center;gap:${o('gap')}px">${w.logo(o('logo'))}
${coverTag(w, { size: o('size') })}
<div style="margin-left:auto">${coverLine(w, { size: o('subSize'), maxw: o('subWidth') })}${coverUrl(w, { size: o('urlSize'), gap: o('urlGap') })}</div></div>`;
  }
  const flex = o('align') === 'left' ? 'flex-direction:column;justify-content:center;align-items:flex-start' : 'flex-direction:column;align-items:center;justify-content:center;text-align:center';
  return `<div class="col" style="${at};${flex}">${w.logo(o('logo'))}
${coverTag(w, { size: o('size'), gap: o('gap') })}
${coverLine(w, { size: o('subSize'), gap: o('subGap') })}
${coverUrl(w, { size: o('urlSize'), gap: o('urlGap') })}</div>`;
}

export const DRAW = { coverMark: mark, coverWords: words };

export function drawCover(layout, spec, ctx) {
  const size = ctx.size.name;
  if (!Object.hasOwn(COVER_SIZES, size)) throw new DesignError(`layout "${layout.id}" is drawn at the cover sizes only (${Object.keys(COVER_SIZES).join(', ')})`);
  const body = layout.blocks.filter((blk) => whenHolds(blk.when, spec, ctx.counter)).map((blk) => {
    if (!Object.hasOwn(DRAW, blk.type)) throw new DesignError(`a cover page does not draw a ${blk.type} block`);
    return DRAW[blk.type](blk, spec, ctx, slotRect(layout, blk, size));
  }).join('');
  return { body: `<div class="pc">${body}</div>` };
}
