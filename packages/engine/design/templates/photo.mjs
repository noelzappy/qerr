// The photo post's drawing helpers (lib/design/layout-photo.mjs draws the page with them, from lib/design/builtin/photo.mjs): a
// full-bleed photograph, untouched except behind the text, where a neutral black gradient eases out (strength is set by the
// renderer, which measures contrast), and the brand's photo treatment if it has one. A light headline in the brand's display type,
// an optional eyebrow in its label type, the logo pill bottom-left, the website bottom-right (the brand's style may swap the sides
// or leave the website out). Thin arcs and brackets are added by the renderer (automatic placement or the "lines" you give). Words
// in *asterisks* turn brand gold.
import { esc, fmt, hs } from './common.mjs';
import { accentOf, footerOf, logoPlace } from './style.mjs';

// object-position is only ever "N% N%" with numbers; anything else falls back to the centre.
const POSITION = /^(\d{1,3}(\.\d{1,2})?)% (\d{1,3}(\.\d{1,2})?)%$/;

// The photograph, full bleed (brand.css .pcanvas>img.bg), at the spec's checked focal point.
export const photoBackdrop = (spec, ctx) => `<img class="bg" data-user data-name="${esc(spec.image)}" data-fit="cover" src="${ctx.image(spec.image)}" alt="" style="object-position:${POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%'}">`;
// The scrim and the footer fade (the renderer raises them until the text reads), and the thin lines (the renderer fills them in).
export const photoScrim = () => '<div class="scrim" id="scrim"></div><div class="fade" id="fade"></div>';
export const photoLines = (S) => `<svg class="lines" id="lines" viewBox="0 0 ${S.w} ${S.h}" aria-hidden="true"></svg>`;
// The text box: the eyebrow, the headline and the sub line. pos: "top:Npx" or "bottom:Npx" (numbers the caller computed); maxw,
// fs, sf, ef, subW: numbers from the caller's fixed tables.
export function photoText(spec, { pos, maxw, fs, sf, ef, subW }) {
  return `<div class="ptext" id="pt" style="${pos};max-width:${maxw}px">
${spec.eyebrow ? `<div class="eyebrow" data-role="eyebrow" style="font-size:${ef}px;line-height:${ef * 1.3}px;margin-bottom:${ef * 0.9}px">${fmt(spec.eyebrow)}</div>` : ''}
<div class="h" data-role="headline" style="font-size:${hs(fs)}">${fmt(spec.headline)}</div>
${spec.sub ? `<div class="sub" data-role="sub" style="font-size:${sf}px;line-height:1.3;margin-top:${sf * 0.6}px;max-width:${subW}px">${fmt(spec.sub)}</div>` : ''}</div>`;
}
// The logo always sits in its light pill over a photo; the brand's style decides the side and whether the website shows.
export function photoFooter(ctx) {
  const url = footerOf(ctx.brand) === 'none' ? '' : `<div class="url" data-role="url">${esc(ctx.brand.website)}</div>`;
  return `<div class="footer${logoPlace(ctx.brand, 'photo').right ? ' flip' : ''}"><div class="lpill"><img src="${ctx.brand.logoFullSrc}" alt=""></div>${url}</div>`;
}
// The page around it: its body class (*words* are the accent colour, unless the brand sets its headlines without an accent
// device) and where the text sits.
export function photoPage(ctx, body, atTop) {
  const none = accentOf(ctx.brand, { spec: {}, fallback: 'colour' }) === 'none';
  return { body: `<div class="pcanvas photo">${body}</div>`, bodyClass: `photo${none ? ' acc-none' : ''}`, bodyAttrs: `data-textat="${atTop ? 'top' : 'bottom'}"` };
}
