// The poster pages (2026-11-20, after the owner rejected the drawn, "cheaply drawn webpage" look): one real image per post, a
// large confident two-tone headline, one pale ground per post (or a dark one with a fine line texture), and only a small logo and
// the website for chrome. Modelled on the LinkedIn posts the owner likes (WeWire): a styled object photo bleeding off the bottom,
// colour-blocked myth and fact slabs, a big framed phone.
//
//   object   a headline over one styled object photo that fills the lower part of the page and bleeds off the bottom edge. The
//            photo's own background decides the rest (no gradient is ever drawn): a plain top and side edge (a studio shot) becomes
//            the page colour, exactly, so the photo runs into the page unseen; anything else (a real scene) is placed as a
//            full-bleed band, edge to edge from its top to the page bottom, with no radius or shadow, on the ground (the series',
//            the spec's, else the cool ground). See objectPhoto.
//   number   one big figure (and up to three supporting figures) over the same kind of photo. Drawn from its layout
//            (lib/design/builtin/poster.mjs); the function below is unused and goes when every poster is converted.
//   product  a website framed phone, large, on a pale ground with the website's soft glow; centred under the headline and running
//            off the bottom, or beside it.
//   mythFact the myth on a solid dark slab, the fact on a pale slab, on a dark ground with its decoration; the series mark at the
//            bottom right (top right when the logo bar is at the bottom).
//   closing  the dark page with the tagline set large.
//
// Every value reaches the page through esc()/fmtE()/fmtSub(), ctx.image() or a number computed here (see common.mjs).
import { DesignError } from '../../lib/design/errors.mjs';
import { GROUND_NAMES, groundName } from '../../lib/design/tokens.mjs';
import { esc, fmtE, fmtSub, hs, px, taglineMarkup } from './common.mjs';
import { glow, phone } from './editorial.mjs';
import { accentOf, decorationOf, footerOf, isDark, logoPlace, photoTreated } from './style.mjs';
import { dotMapSvg } from './map.mjs';

export const POSTER = { w: 1080, h: 1350, m: 80, barTop: 60, headTop: 170, photoTop: 600, phoneTop: 620 };
const POSITION = /^(\d{1,3}(\.\d{1,2})?)% (\d{1,3}(\.\d{1,2})?)%$/;

// The ground: the spec's, else the series', else the template's default, by its neutral name (an older name such as "mint" is
// the same ground). "photo" (object and number only) means: no ground of its own, so the page takes the photo's plain
// background, or the series' ground (else the cool ground) when the photo is a scene.
function groundOf(spec, ctx, fallback, { photo = false } = {}) {
  const series = spec.series !== undefined ? ctx.brand.series[spec.series] : null;
  if (spec.series !== undefined && !series) throw new DesignError(`series "${spec.series}" is not in brand.json`);
  const g = spec.ground ?? fallback ?? series?.ground ?? 'cool';
  if (g === 'photo' && photo) return g;
  const name = groundName(g);
  if (!name) throw new DesignError(`ground must be one of ${GROUND_NAMES.join(', ')}${photo ? ' or photo' : ''}`);
  return name;
}

// The small logo: the full colour logo on a light ground, the white mark and wordmark on a dark one (the full logo's wordmark,
// cut from the same file and turned white, beside the gold mark).
function logo(ctx, dark, h = 34) {
  const B = ctx.brand, [fw, fh] = B.logos.fullSize, k = h / fh;
  // On every poster ground the wordmark is drawn solid (ink on light grounds, white on dark) so it reads on mint, gold and photo grounds.
  return `<span class="logo-inv${dark ? '' : ' logo-ink'}" style="height:${h}px"><img src="${B.logoMarkSrc}" alt="" style="height:${h}px"><i role="img" aria-label="${esc(B.name)}" style="height:${h}px;--lw:${px((fw - B.logos.wordmarkFrom) * k)}px;--lx:-${px(B.logos.wordmarkFrom * k)}px;--lm:${px(B.logos.markGap * k)}px"></i></span>`;
}

// The only chrome (also drawn for the built-in layouts' "bar" block, lib/design/layout-poster.mjs): the logo and the website (or
// "Swipe →" on page 1 of a carousel) in one bar, by default at the top with the
// logo on the left. The brand's style may put the bar at the bottom, the logo on the right, the logo in a light pill, or leave
// the website out.
export function bar(ctx, dark, { right } = {}) {
  const style = footerOf(ctx.brand), place = logoPlace(ctx.brand, 'poster');
  let r = right;
  if (r === undefined) r = ctx.counter?.n === 1 ? 'Swipe →' : style === 'none' ? '' : ctx.brand.website;
  const mark = style === 'pill' ? `<span class="lpill"><img src="${ctx.brand.logoFullSrc}" alt="${esc(ctx.brand.name)}"></span>` : logo(ctx, dark);
  const y = place.bottom ? POSTER.h - POSTER.barTop - 40 : POSTER.barTop;
  return `<div class="pbar${place.right ? ' flip' : ''}" style="left:${POSTER.m}px;right:${POSTER.m}px;top:${y}px">${mark}${r ? `<span class="purl" data-role="foot">${esc(r)}</span>` : ''}</div>`;
}

// The headline (two-tone: the statement in ink, the *continuation* in primary green, or gold on a dark ground) and the sub line.
export function words({ headline, sub, size, y = POSTER.headTop, x = POSTER.m, w = 920, subW = 820, align = 'left', big = false }) {
  const center = align === 'center';
  const h = `<div class="ps-h${big ? ' big' : ''}" data-role="${big ? 'stat' : 'headline'}" style="font-size:${hs(size)}">${fmtE(headline)}</div>`;
  const s = sub ? `<div class="sub ps-sub" data-role="sub" data-min="30" style="margin-top:28px;max-width:${subW}px${center ? ';margin-left:auto;margin-right:auto' : ''}">${fmtSub(sub)}</div>` : '';
  return `<div class="abs" id="txt" style="left:${px(x)}px;top:${px(y)}px;width:${px(w)}px;text-align:${center ? 'center' : 'left'}">${h}${s}</div>`;
}

// The object photo (also a poster page's photo block, lib/design/layout-poster.mjs): full width from `top` to the bottom edge
// (it bleeds off the page), cropped around the focal point. Whether it
// stays that way is decided in the page from the photo's own pixels (lib/design/edge.mjs, window.__ds.ready): when its top and
// side edges are one plain colour the page takes exactly that colour and the photo runs into it with no fade, no gradient and no
// blend; otherwise the wrapper gets the class "band" and the photo is a full-bleed band (left 0, full width, no radius, no shadow)
// from its top to the bottom edge, on the template's ground, like the stats page's photo. Either way the wrapper is the avoid zone for text, and nothing here depends on the mode.
export function objectPhoto(ctx, spec, { top }) {
  const fo = POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%';
  const [fx, fy] = fo.split(' ').map((v) => parseFloat(v) / 100);
  const zoom = Number.isFinite(Number(spec.zoom)) ? Math.min(3, Math.max(1, Number(spec.zoom))) : 1;
  const tr = zoom > 1 ? `;transform:scale(${px(zoom)});transform-origin:${fo}` : '';
  // A treated photo (tint, duotone, overlay) is not what its raw pixels say, so it never lends the page its edge colour: it
  // stays on the template's ground.
  const sample = photoTreated(ctx.brand) ? '' : ` data-sample data-fx="${px(fx)}" data-fy="${px(fy)}"`;
  const img = `<img data-user data-name="${esc(spec.image)}" data-fit="cover"${sample} src="${ctx.image(spec.image)}" alt="" style="object-position:${fo}${tr}">`;
  return `<div class="ph pobj" data-avoid style="--pt:${px(top)}px;--ph:${px(POSTER.h - top)}px;--pm:${POSTER.m}px">${img}</div>`;
}

// The ground a photo page starts from, and keeps when its photo is a band: the series' ground, else the cool ground.
function sceneGround(spec, ctx) {
  return groundName(spec.series !== undefined ? ctx.brand.series[spec.series]?.ground : undefined) ?? 'cool';
}

// The page: its ground (a token), dark type rules on a dark ground with the fine line texture. A page with a photo may still
// change its ground and type colour in the browser, when the photo's plain background becomes the page (runtime.mjs flush()).
// The headline's second half follows the page's accent style: the spec's own, else the brand's device, else its series', else
// the colour (the poster look). Only names from the fixed ACCENT_STYLES list reach the class attribute.
function posterAccent(spec, ctx) {
  return accentOf(ctx.brand, { spec, series: spec?.series !== undefined ? ctx.brand.series?.[spec.series] : null, fallback: 'colour' });
}

function poster(ctx, ground, body, { flex = false, spec } = {}) {
  const dark = isDark(ctx.brand, ground), deco = decorationOf(ctx.brand, { dark, poster: true });
  return {
    body: `<div class="cv poster${deco ? ` ${deco}` : ''}" style="--bg:var(--g-${ground})">${body}</div>`,
    bodyClass: `acc-${posterAccent(spec, ctx)}${dark ? ' dark' : ''}`,
    bodyAttrs: `data-editorial="1"${flex ? ' data-flex="1"' : ''}`,
  };
}

// Unused: drawn from its layout (lib/design/builtin/poster.mjs).
export function object(spec, ctx) {
  const asked = groundOf(spec, ctx, 'photo', { photo: true }), g = asked === 'photo' ? sceneGround(spec, ctx) : asked, dark = isDark(ctx.brand, g);
  const top = spec.photoTop ?? POSTER.photoTop;
  const body = objectPhoto(ctx, spec, { top }) + bar(ctx, dark)
    + words({ headline: spec.headline, sub: spec.sub, size: spec.size ?? 104, align: spec.align });
  return poster(ctx, g, body, { spec });
}

export function number(spec, ctx) {
  const asked = groundOf(spec, ctx, spec.image ? 'photo' : 'cool', { photo: Boolean(spec.image) }), g = asked === 'photo' ? sceneGround(spec, ctx) : asked, dark = isDark(ctx.brand, g);
  const list = spec.stats ?? [], top = spec.photoTop ?? 616;
  const big = words({ headline: spec.big, size: 168, big: true, y: 140 });
  const line = spec.line ? `<div class="abs sub ps-sub" data-role="sub" data-min="30" style="left:${POSTER.m}px;top:336px;width:900px">${fmtSub(spec.line)}</div>` : '';
  const step = (920 + 40) / Math.max(1, list.length);
  const stats = list.map((s, i) => `<div class="abs" style="left:${px(POSTER.m + i * step)}px;top:448px;width:${px(step - 40)}px"><div class="ps-h" data-role="stat" style="font-size:${hs(64)}">${fmtSub(s[0])}</div><div class="sub ps-sub" data-role="statlabel" data-min="30" style="margin-top:6px">${fmtSub(s[1])}</div></div>`).join('');
  const pic = spec.image ? objectPhoto(ctx, spec, { top }) : '';
  return poster(ctx, g, pic + bar(ctx, dark) + big + line + stats, { spec });
}

// Unused: drawn from its layouts (lib/design/builtin/poster.mjs: product, and product-side for layout "side").
export function product(spec, ctx) {
  const g = groundOf(spec, ctx, 'cool'), dark = isDark(ctx.brand, g);
  const d = ctx.imageSize?.(spec.image), ratio = d && d.w > 0 ? d.h / d.w : 1354 / 660;
  let text, w, x, y;
  if ((spec.layout ?? 'center') === 'side') {
    w = 450; x = POSTER.w - w - 60; y = spec.phoneTop ?? 300;
    text = words({ headline: spec.headline, sub: spec.sub, size: spec.size ?? 76, w: 470, subW: 440, y: 300 });
  } else {
    // With a sub line the headline steps down a size and the phone starts lower, so the phone never crowds the text.
    w = 600; x = (POSTER.w - w) / 2; y = spec.phoneTop ?? (spec.sub ? POSTER.phoneTop + 40 : POSTER.phoneTop);
    text = words({ headline: spec.headline, sub: spec.sub, size: spec.size ?? (spec.sub ? 88 : 104), align: spec.align ?? 'center' });
  }
  const halo = spec.glow === false ? '' : glow(ctx, { x, y: y + 40, w, h: Math.min(POSTER.h - y, w * ratio) });
  return poster(ctx, g, halo + bar(ctx, dark) + text + phone(ctx, spec, { w, at: { x, y } }), { spec });
}

// Myth and fact as colour-blocked slabs on a dark textured ground, centred between the top bar and the series mark.
export function mythFact(spec, ctx) {
  const g = groundOf(spec, ctx, 'dark'), dark = isDark(ctx.brand, g);
  const series = spec.series !== undefined ? ctx.brand.series[spec.series] : null;
  const mark = spec.label ?? series?.name ?? 'Myths vs facts';
  const t = 68;
  const myth = `<div class="slab myth"><span class="tag" data-role="label">Myth</span><div class="ps-h" data-role="headline" style="font-size:${hs(t)};margin-top:30px">${fmtE(spec.myth)}</div></div>`;
  const fact = `<div class="slab fact"><span class="tag" data-role="label">Fact</span><div class="ps-h" data-role="headline" style="font-size:${hs(t)};margin-top:30px">${fmtE(spec.factLead)}</div>${spec.fact ? `<div class="sub" data-role="sub" data-min="30" style="margin-top:24px">${fmtSub(spec.fact)}</div>` : ''}</div>`;
  const stack = `<div class="stack" style="left:${POSTER.m}px;top:150px;width:920px;height:1050px;gap:28px;justify-content:center">${myth}${fact}</div>`;
  const foot = `<div class="pmark" style="right:${POSTER.m}px;${logoPlace(ctx.brand, 'poster').bottom ? `top:${POSTER.barTop + 3}px` : 'bottom:62px'}"><span data-role="foot">${esc(mark)}</span></div>`;
  return poster(ctx, g, bar(ctx, dark) + stack + foot, { flex: true, spec });
}

const MAP = { x: 640, y: 150, w: 360, h: 450 };

export function closing(spec, ctx) {
  const g = groundOf(spec, ctx, 'deep'), dark = isDark(ctx.brand, g);
  const map = spec.map ? `<svg class="fig map" style="left:${MAP.x}px;top:${MAP.y}px" width="${MAP.w}" height="${MAP.h}" viewBox="0 0 ${MAP.w} ${MAP.h}" aria-hidden="true">${dotMapSvg(ctx.brand.map, MAP.w, MAP.h)}</svg>` : '';
  const block = words({ headline: spec.headline ?? taglineMarkup(ctx.brand.tagline), sub: spec.line ?? ctx.brand.website, size: 136, y: spec.map ? 700 : 560, w: 920 });
  return poster(ctx, g, map + bar(ctx, dark, { right: '' }) + block, { spec });
}
