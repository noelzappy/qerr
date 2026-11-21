// The editorial page's drawing helpers (lib/design/layout-editorial.mjs and the grid page, layout-render.mjs, draw with them):
// labels, the running head and the footer, the pills and the check list, the glow, cards, photo windows, the pre-framed phone and
// the desktop window. All geometry is in page pixels and comes from numbers, never from spec text.
import { dropShadowCss, rgbaOf, shadowCss } from '../../lib/design/brand.mjs';
import { WEB_ADDRESS } from '../../lib/design/lint.mjs';
import { esc, px } from './common.mjs';
import { footerOf, logoPlace, surfaceOf } from './style.mjs';

const pad2 = (v) => String(v).padStart(2, '0');
const POSITION = /^(\d{1,3}(\.\d{1,2})?)% (\d{1,3}(\.\d{1,2})?)%$/;

// Mono labels are upper case by default; camel-cased names (a brand such as "YouTube") and web addresses keep their case.
const CAMEL = /\b[A-Za-z][a-z]+[A-Z][A-Za-z]*\b|\b[a-z]+[A-Z][A-Za-z]*\b/;
const keepCase = (t) => CAMEL.test(t) || new RegExp(WEB_ADDRESS.source, 'i').test(t);
export const lbl = (t, extra = '', role = 'label', attrs = '') => `<span class="lbl${keepCase(t) ? ' n' : ''}${extra ? ` ${extra}` : ''}" data-role="${role}"${attrs}>${esc(t)}</span>`;
export const folio = (ctx) => (ctx.counter ? `${pad2(ctx.counter.n)} / ${pad2(ctx.counter.total)}` : null);

// The tone class of text that sits on a surface of the other tone than the page's ground (the light panel on a dark page, a dark
// panel on a light one): brand.css then colours it for that surface, as a page of its tone would be. '' when the tones agree.
export const toneOf = (pageDark, surfaceDark) => (pageDark === surfaceDark ? '' : surfaceDark ? 'on-dark' : 'on-light');
export const withTone = (cls, tone) => (tone ? `${cls} ${tone}` : cls);

// The running head. `tone`: toneOf() for what it sits on.
export const runhead = (left, right, rule = true, { tone = '' } = {}) => `<div class="${withTone('rh', tone)}">${left ? lbl(left) : '<span></span>'}${right ? lbl(right) : '<span></span>'}</div>${rule ? `<div class="${withTone('rh-rule', tone)}"></div>` : ''}`;

// Footer: the logo bottom-left (or right, as the brand's style says; in a light pill with footer "pill"), a label on the other
// side ("Swipe →" on page 1 of a carousel, else the website; nothing with footer "none"). The full colour logo on a light
// surface; on a dark one (`inverse`: the page's ground, or the panel when the footer sits on it) the mark with the wordmark in
// white. `tone`: toneOf() for its label.
export function footer(ctx, { label, inverse = false, tone = '' } = {}) {
  const B = ctx.brand, style = footerOf(B), swipe = ctx.counter?.n === 1;
  let right = label;
  if (right === undefined) right = swipe ? 'Swipe →' : style === 'none' ? '' : B.website;
  const [fw, fh] = B.logos.fullSize, k = 32 / fh;
  const logo = style === 'pill' ? `<span class="lpill"><img src="${B.logoFullSrc}" alt="${esc(B.name)}"></span>`
    : inverse
      ? `<span class="logo-inv"><img src="${B.logoMarkSrc}" alt="" style="height:32px"><i role="img" aria-label="${esc(B.name)}" style="--lw:${px((fw - B.logos.wordmarkFrom) * k)}px;--lx:-${px(B.logos.wordmarkFrom * k)}px;--lm:${px(B.logos.markGap * k)}px"></i></span>`
      : `<img class="logo" src="${B.logoFullSrc}" alt="${esc(B.name)}">`;
  const cls = withTone(`ft footer${logoPlace(B, 'editorial').right ? ' flip' : ''}`, right ? tone : '');
  return `<div class="${cls}"><div>${logo}</div>${right ? lbl(right, '', 'foot') : ''}</div>`;
}

// The website's outlined pills ("Read-only by design") and its check list ("Two-person approval"), under the sub line. Each item
// is escaped text; the check is a fixed drawing.
export const pillRow = (list) => (Array.isArray(list) && list.length
  ? `<div class="pills" style="margin-top:36px">${list.map((t) => `<span class="pill" data-role="label">${esc(t)}</span>`).join('')}</div>` : '');
const CHECK = '<span class="ck" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg></span>';
export const checkList = (list) => (Array.isArray(list) && list.length
  ? `<ul class="checks" style="margin-top:36px">${list.map((t) => `<li>${CHECK}<span data-role="sub" data-min="30">${esc(t)}</span></li>`).join('')}</ul>` : '');

// The soft gradient glow a phone floats on (the website puts a blurred gradient behind its product mockups): a box `glow.inset`
// larger than the phone on every side, blurred.
export function glow(ctx, { x, y, w, h }) {
  const g = ctx.brand.glow.inset * ctx.brand.scale;
  return `<div class="glow" aria-hidden="true" style="left:${px(x - g)}px;top:${px(y - g)}px;width:${px(w + 2 * g)}px;height:${px(h + 2 * g)}px"></div>`;
}

// A short mono note at a fixed place, on the panel (a ledger's notes); `tone`: toneOf() for the panel.
export const note = (x, y, t, { w, tone = '' } = {}) => `<div class="abs" style="left:${px(x)}px;top:${px(y)}px${w ? `;width:${px(w)}px` : ''}">${lbl(t, withTone('n', tone), 'label', ' data-onpanel')}</div>`;

// An object with its own surface: cls "card" (raised white card), "flat" (white card, line only), "photo" or "photo raised";
// inner is placed inside. Nothing is ever rotated.
export const obj = (x, y, w, h, cls, inner, { avoid = true } = {}) =>
  `<div class="obj ${cls}" data-obj${avoid ? ' data-avoid' : ''} style="left:${px(x)}px;top:${px(y)}px;width:${px(w)}px${h ? `;height:${px(h)}px` : ''}">${inner}</div>`;

// A photograph in a box: object-fit cover around a focal point, optionally zoomed. The page measures the shown size against the
// picture's real size and warns above 1.3x.
export function photoWindow(ctx, spec, { x, y, w, h, cls = 'ph', avoid = false }) {
  const fo = POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%';
  const zoom = Number.isFinite(Number(spec.zoom)) ? Math.min(3, Math.max(1, Number(spec.zoom))) : 1;
  const tr = zoom > 1 ? `;transform:scale(${px(zoom)});transform-origin:${fo}` : '';
  return `<div class="${cls}"${avoid ? ' data-avoid' : ''} style="left:${px(x)}px;top:${px(y)}px;width:${px(w)}px;height:${px(h)}px"><img data-user data-name="${esc(spec.image)}" data-fit="cover" src="${ctx.image(spec.image)}" alt="" style="object-position:${fo}${tr}"></div>`;
}

// A phone: a pre-framed capture (a transparent PNG or WebP with a real phone drawn around the screen by the capture tool), shown as
// it is, `w` pixels wide, with the website's drop shadow scaled to that width. The tool never draws a phone; the renderer refuses a
// capture that is not transparent around the phone. `at` places it absolutely; without it the phone flows in its parent.
// A capture's height over its width (its own size, else the website's phones, 660 x 1354).
export const ratioOf = (ctx, spec) => { const d = ctx.imageSize?.(spec.image); return d && d.w > 0 ? d.h / d.w : 1354 / 660; };

export function phone(ctx, spec, { w, at, cut }) {
  const B = ctx.brand, k = w / B.phone.refWidth;
  const pos = at ? `left:${px(at.x)}px;top:${px(at.y)}px;` : 'position:relative;';
  const img = `<img data-user data-phone data-name="${esc(spec.image)}" data-fit="width" src="${ctx.image(spec.image)}" alt="">`;
  // `cut`: only the top `cut` pixels show, fading out at the foot (the website's product wells).
  const inner = cut ? `<div class="cut" style="height:${px(cut)}px">${img}</div>` : img;
  // The drop shadow belongs to the shadowed surface style; outlined and flat brands show the capture as it is.
  const shadow = surfaceOf(B) === 'shadow' ? `;filter:${dropShadowCss(B.shadows.phone, k)}` : '';
  return `<div class="phone" data-obj data-avoid data-bleed style="${pos}width:${px(w)}px${shadow}">${inner}</div>`;
}

// A desktop screen in the website's window chrome (its DeviceFrame): a white window with the device radius, the layered device
// shadow and a 1 px line, a tint title bar with three dots and an optional title. Every size is the website's, scaled by
// w / window.refWidth so the proportions match the website at any width. `framed` (the capture already has its own chrome) shows
// the picture in the window shape without a bar. `tilt` is the website's hero lean. `region` (0.4 to 1) is the website's zoom for a
// wide capture in a small slot: only the top-left share of the capture's width and height shows, drawn larger, in a window of the
// capture's own shape (it needs the picture's size, ctx.imageSize). It flows in its parent (a stack).
export function desktopWindow(ctx, spec, { w, framed = false, title, tilt = false, region }) {
  const B = ctx.brand, W = B.window, k = w / W.refWidth, ring = Math.max(1, Math.round(k * 2) / 2);
  const lean = tilt ? `;transform:perspective(${px(W.tilt.perspective * k)}px) rotateY(${px(W.tilt.rotateY)}deg) rotateX(${px(W.tilt.rotateX)}deg)` : '';
  const dot = `<span class="dot" style="width:${px(W.dot * k)}px;height:${px(W.dot * k)}px"></span>`;
  const name = title ? `<span class="ttl" data-role="art" style="margin-left:${px(W.titleGap * k)}px;font-size:${px(W.titleSize * k)}px;padding:${px(W.titlePadY * k)}px ${px(W.titlePadX * k)}px">${esc(title)}</span>` : '';
  const bar = framed ? '' : `<div class="bar" style="height:${px(W.bar * k)}px;padding:0 ${px(W.padX * k)}px;gap:${px(W.dotGap * k)}px">${dot}${dot}${dot}${name}</div>`;
  // The surface style: the layered device shadow and a line ring (shadow), a solid ring in the outline colour (outline), or the
  // line ring alone (flat). Colours are the brand's checked ones; the widths are numbers.
  const surface = surfaceOf(B);
  const shadow = surface === 'outline' ? `0 0 0 ${px(Math.max(1, 1.5 * B.scale))}px ${B.surfaces.outline ?? B.text.ink}`
    : surface === 'flat' ? `0 0 0 ${px(ring)}px ${rgbaOf(B.surfaces.line)}`
      : `${shadowCss(B.shadows.window, k)},0 0 0 ${px(ring)}px ${rgbaOf(B.surfaces.line)}`;
  const img = (extra = '') => `<img data-user data-name="${esc(spec.image)}" data-fit="width" src="${ctx.image(spec.image)}" alt=""${extra}>`;
  const size = ctx.imageSize?.(spec.image), r = Number(region);
  const pic = size && r >= 0.4 && r < 1 ? `<div class="crop" style="height:${px((w * size.h) / size.w)}px">${img(` style="width:${px(100 / r)}%"`)}</div>` : img();
  return `<div class="win obj" data-obj data-avoid style="width:${px(w)}px;border-radius:${px(B.radius.device * k)}px;box-shadow:${shadow}${lean}">${bar}${pic}</div>`;
}
