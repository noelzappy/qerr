// The poster page's drawing helpers (lib/design/layout-poster.mjs draws the posters with them, from lib/design/builtin/poster.mjs):
// one real image per post, a large confident two-tone headline, one pale ground per post (or a dark one with a fine line
// texture), and only a small logo and the website for chrome. Here: the page's measures, the logo bar and the object photo that
// fills the lower part of the page and bleeds off the bottom edge.
//
// Every value reaches the page through esc()/fmtE()/fmtSub(), ctx.image() or a number computed here (see common.mjs).
import { esc, px } from './common.mjs';
import { footerOf, logoPlace, photoTreated } from './style.mjs';

export const POSTER = { w: 1080, h: 1350, m: 80, barTop: 60 };
const POSITION = /^(\d{1,3}(\.\d{1,2})?)% (\d{1,3}(\.\d{1,2})?)%$/;

// The small logo: the full colour logo on a light ground, the white mark and wordmark on a dark one (the full logo's wordmark,
// cut from the same file and turned white, beside the gold mark).
function logo(ctx, dark, h = 34) {
  const B = ctx.brand, [fw, fh] = B.logos.fullSize, k = h / fh;
  // On every poster ground the wordmark is drawn solid (ink on light grounds, white on dark) so it reads on mint, gold and photo grounds.
  // It is measured like text (data-role "logo"): the renderer warns when what lies behind it leaves it under the label contrast.
  return `<span class="logo-inv${dark ? '' : ' logo-ink'}" style="height:${h}px"><img src="${B.logoMarkSrc}" alt="" style="height:${h}px"><i data-role="logo" role="img" aria-label="${esc(B.name)}" style="height:${h}px;--lw:${px((fw - B.logos.wordmarkFrom) * k)}px;--lx:-${px(B.logos.wordmarkFrom * k)}px;--lm:${px(B.logos.markGap * k)}px"></i></span>`;
}

// The only chrome (also drawn for the built-in layouts' "bar" block, lib/design/layout-poster.mjs): the logo and the website (or
// "Swipe →" on page 1 of a carousel) in one bar, by default at the top with the
// logo on the left. The brand's style may put the bar at the bottom, the logo on the right, the logo in a light pill, or leave
// the website out. `bottomTaken`: a photo or phone runs to the bottom edge, under where a bottom bar would be. The bar's logo is
// drawn for the page's ground, not for a picture, so there it stays at the top, on the ground (the side still follows the style).
export const BAR_LOW = POSTER.h - POSTER.barTop - 40;
export function bar(ctx, dark, { right, bottomTaken = false } = {}) {
  const style = footerOf(ctx.brand), place = logoPlace(ctx.brand, 'poster');
  let r = right;
  if (r === undefined) r = ctx.counter?.n === 1 ? 'Swipe →' : style === 'none' ? '' : ctx.brand.website;
  const mark = style === 'pill' ? `<span class="lpill"><img src="${ctx.brand.logoFullSrc}" alt="${esc(ctx.brand.name)}"></span>` : logo(ctx, dark);
  const y = place.bottom && !bottomTaken ? BAR_LOW : POSTER.barTop;
  return `<div class="pbar${place.right ? ' flip' : ''}" style="left:${POSTER.m}px;right:${POSTER.m}px;top:${y}px">${mark}${r ? `<span class="purl" data-role="foot">${esc(r)}</span>` : ''}</div>`;
}

// The object photo (also a poster page's photo block, lib/design/layout-poster.mjs): full width from `top` to the bottom edge
// (it bleeds off the page), cropped around the focal point. Whether it
// stays that way is decided in the page from the photo's own pixels (lib/design/edge.mjs, window.__ds.ready): when its top and
// side edges are one plain colour the page takes exactly that colour and the photo runs into it with no fade, no gradient and no
// blend; otherwise the wrapper gets the class "band" and the photo is a full-bleed band (left 0, full width, no radius, no shadow)
// from its top to the bottom edge, on the page's ground, like the stats page's photo. Either way the wrapper is the avoid zone for text, and nothing here depends on the mode.
export function objectPhoto(ctx, spec, { top }) {
  const fo = POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%';
  const [fx, fy] = fo.split(' ').map((v) => parseFloat(v) / 100);
  const zoom = Number.isFinite(Number(spec.zoom)) ? Math.min(3, Math.max(1, Number(spec.zoom))) : 1;
  const tr = zoom > 1 ? `;transform:scale(${px(zoom)});transform-origin:${fo}` : '';
  // A treated photo (tint, duotone, overlay) is not what its raw pixels say, so it never lends the page its edge colour: it
  // stays on the page's ground.
  const sample = photoTreated(ctx.brand) ? '' : ` data-sample data-fx="${px(fx)}" data-fy="${px(fy)}"`;
  const img = `<img data-user data-name="${esc(spec.image)}" data-fit="cover"${sample} src="${ctx.image(spec.image)}" alt="" style="object-position:${fo}${tr}">`;
  return `<div class="ph pobj" data-avoid style="--pt:${px(top)}px;--ph:${px(POSTER.h - top)}px;--pm:${POSTER.m}px">${img}</div>`;
}
