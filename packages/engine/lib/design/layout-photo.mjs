// The full-bleed photo post's page (design/templates/photo.mjs), as a layout's "page": "photo" draws it: the photograph under
// everything, the scrim and footer fade the renderer raises until the text reads, the thin lines it draws, one box with the
// eyebrow, the headline and the sub line in light type, and the footer (the logo in its pill, the website). Each block is drawn
// with the markup of photo.mjs's own helpers, so the post drawn from its layout (lib/design/builtin/photo.mjs) is the same image.
// What each block honours is listed in PAGES.photo (lib/design/layout.mjs), with the page's type sizes per size.
//
// Unlike the poster and editorial pages, this page has no ground, series, accent setting or texture: the photo is the page.
// The rule of design/templates/common.mjs holds: text only through esc()/fmt(), the photo through ctx.image(), positions from
// the layout's checked rectangles and sizes from PAGES.photo.type.
import { DesignError } from './errors.mjs';
import { BLOCKS, PAGES, SPEC_CHOICES, slotRect, whenHolds } from './layout.mjs';
import { opt } from './layout-parts.mjs';
import { px } from '../../design/templates/common.mjs';
import { photoBackdrop, photoFooter, photoLines, photoPage, photoScrim, photoText } from '../../design/templates/photo.mjs';

// The headline box: anchored at the top of the rectangle, or (valign bottom) at its bottom edge; as wide as the rectangle. The
// eyebrow is drawn over the headline when the block asks for it, the subField's sub line under it.
function headline(blk, spec, ctx, r) {
  const S = ctx.size, T = PAGES.photo.type[S.name];
  const pos = opt(blk, 'valign') === 'bottom' ? `bottom:${px(S.h - r.y - r.h)}px` : `top:${px(r.y)}px`;
  const words = { ...spec, eyebrow: opt(blk, 'eyebrow') ? spec.eyebrow : undefined, sub: blk.subField === undefined ? undefined : spec[blk.subField], headline: spec[blk.field ?? 'headline'] };
  return `${photoText(words, { pos, maxw: px(r.w), fs: T.headline, sf: T.sub, ef: T.eyebrow, subW: T.subWidth })}\n`;
}

export const DRAW = {
  backdrop: (blk, spec, ctx) => `${photoBackdrop({ ...spec, image: spec[blk.field ?? 'image'] }, ctx)}\n`,
  scrim: () => `${photoScrim()}\n`,
  lines: (blk, spec, ctx) => `${photoLines(ctx.size)}\n`,
  headline,
  photoFooter: (blk, spec, ctx) => photoFooter(ctx),
};

export function drawPhoto(layout, spec, ctx) {
  const size = ctx.size.name;
  if (!PAGES.photo.type[size]) throw new DesignError(`layout "${layout.id}" has no ${size} size`);
  const body = layout.blocks.filter((blk) => whenHolds(blk.when, spec, ctx.counter)).map((blk) => {
    if (!Object.hasOwn(DRAW, blk.type)) throw new DesignError(`a photo page does not draw a ${blk.type} block`);
    return DRAW[blk.type](blk, spec, ctx, BLOCKS[blk.type].chrome ? null : slotRect(layout, blk, size));
  }).join('');
  // Where the text sits (the renderer's scrim grows from that side): the textAt choice, as the headline blocks' conditions read it.
  return photoPage(ctx, body, SPEC_CHOICES.textAt.read(spec) === 'top');
}
