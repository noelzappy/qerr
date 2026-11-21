// photo: a full-bleed photograph. The photo is untouched except behind the text, where a neutral black gradient eases out
// (strength is set by the renderer, which measures contrast), and the brand's photo treatment if it has one. A light headline in
// the brand's display type, an optional eyebrow in its label type, the logo pill bottom-left, the website bottom-right (the
// brand's style may swap the sides or leave the website out). Thin arcs and brackets are added by the renderer (automatic placement or
// the "lines" you give). Words in *asterisks* turn brand gold.
import { contentBottom } from '../../lib/design/sizes.mjs';
import { byName, esc, fmt, hs } from './common.mjs';
import { accentOf, footerOf, logoPlace } from './style.mjs';

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
  // The logo always sits in its light pill over a photo; the brand's style decides the side and whether the website shows.
  const url = footerOf(ctx.brand) === 'none' ? '' : `<div class="url" data-role="url">${esc(ctx.brand.website)}</div>`;
  const footer = `<div class="footer${logoPlace(ctx.brand, 'photo').right ? ' flip' : ''}"><div class="lpill"><img src="${ctx.brand.logoFullSrc}" alt=""></div>${url}</div>`;
  const body = `<div class="pcanvas photo"><img class="bg" data-user data-name="${esc(spec.image)}" data-fit="cover" src="${ctx.image(spec.image)}" alt="" style="object-position:${POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%'}">
<div class="scrim" id="scrim"></div><div class="fade" id="fade"></div>
<svg class="lines" id="lines" viewBox="0 0 ${S.w} ${S.h}" aria-hidden="true"></svg>
<div class="ptext" id="pt" style="${pos};max-width:${maxw}px">
${spec.eyebrow ? `<div class="eyebrow" data-role="eyebrow" style="font-size:${ef}px;line-height:${ef * 1.3}px;margin-bottom:${ef * 0.9}px">${fmt(spec.eyebrow)}</div>` : ''}
<div class="h" data-role="headline" style="font-size:${hs(fs)}">${fmt(spec.headline)}</div>
${spec.sub ? `<div class="sub" data-role="sub" style="font-size:${sf}px;line-height:1.3;margin-top:${sf * 0.6}px;max-width:${S.name === 'wide' ? 560 : 800}px">${fmt(spec.sub)}</div>` : ''}</div>
${footer}</div>`;
  // *words* are the accent colour, unless the brand sets its headlines without an accent device.
  const none = accentOf(ctx.brand, { spec: {}, fallback: 'colour' }) === 'none';
  return { body, bodyClass: `photo${none ? ' acc-none' : ''}`, bodyAttrs: `data-textat="${atTop ? 'top' : 'bottom'}"` };
}
