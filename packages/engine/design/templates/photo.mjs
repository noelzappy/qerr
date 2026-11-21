// photo: a full-bleed photograph. The photo is untouched except behind the text, where a neutral black gradient eases out
// (strength is set by the renderer, which measures contrast). White headline in the brand type, an optional mono eyebrow, the logo
// pill bottom-left, the website in mono bottom-right. Thin arcs and brackets are added by the renderer (automatic placement or
// the "lines" you give). Words in *asterisks* turn brand gold.
import { contentBottom } from '../../lib/design/sizes.mjs';
import { byName, esc, fmt, hs } from './common.mjs';

// object-position is only ever "N% N%" with numbers; anything else falls back to the centre.
const POSITION = /^(\d{1,3}(\.\d{1,2})?)% (\d{1,3}(\.\d{1,2})?)%$/;

export function photo(spec, ctx) {
  const S = ctx.size;
  const atTop = (spec.textAtResolved ?? 'top') === 'top';
  const fs = byName({ feed: 112, wide: 68, story: 120, square: 88 }, S);
  const sf = byName({ feed: 38, wide: 24, story: 42, square: 30 }, S);
  const ef = byName({ feed: 24, wide: 17, story: 26, square: 20 }, S);
  const maxw = byName({ feed: 880, wide: 640, story: 900, square: 830 }, S);
  const topY = S.top + byName({ feed: 4, wide: 0, story: 20, square: 0 }, S);
  const pos = atTop ? `top:${topY}px` : `bottom:${S.h - contentBottom(S)}px`;
  const footer = `<div class="footer"><div class="lpill"><img src="${ctx.brand.logoFullSrc}" alt=""></div><div class="url" data-role="url">${esc(ctx.brand.website)}</div></div>`;
  const body = `<div class="pcanvas photo"><img class="bg" data-user data-name="${esc(spec.image)}" data-fit="cover" src="${ctx.image(spec.image)}" alt="" style="object-position:${POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%'}">
<div class="scrim" id="scrim"></div><div class="fade" id="fade"></div>
<svg class="lines" id="lines" viewBox="0 0 ${S.w} ${S.h}" aria-hidden="true"></svg>
<div class="ptext" id="pt" style="${pos};max-width:${maxw}px">
${spec.eyebrow ? `<div class="eyebrow" data-role="eyebrow" style="font-size:${ef}px;line-height:${ef * 1.3}px;margin-bottom:${ef * 0.9}px">${fmt(spec.eyebrow)}</div>` : ''}
<div class="h" data-role="headline" style="font-size:${hs(fs)}">${fmt(spec.headline)}</div>
${spec.sub ? `<div class="sub" data-role="sub" style="font-size:${sf}px;line-height:1.3;margin-top:${sf * 0.6}px;max-width:${S.name === 'wide' ? 560 : 800}px">${fmt(spec.sub)}</div>` : ''}</div>
${footer}</div>`;
  return { body, bodyClass: 'photo', bodyAttrs: `data-textat="${atTop ? 'top' : 'bottom'}"` };
}
