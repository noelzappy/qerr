// The editorial toolkit: the page frame (ground, running head, footer), headline and body text, the panel, cards, photo windows,
// the pre-framed phone and the desktop window. All geometry is in page pixels (1080 x 1350, 70 px margins) and comes from numbers,
// never from spec text.
import { dropShadowCss, rgbaOf, shadowCss } from '../../lib/design/brand.mjs';
import { DesignError } from '../../lib/design/errors.mjs';
import { WEB_ADDRESS } from '../../lib/design/lint.mjs';
import { GROUND_NAMES } from '../../lib/design/tokens.mjs';
import { esc, fmtE, fmtSub, hs, px } from './common.mjs';

export const PAGE = { w: 1080, h: 1350, m: 70, headTop: 154, subGap: 28 };
export const HEADLINE_SIZES = [70, 84, 112];
const pad2 = (v) => String(v).padStart(2, '0');
const POSITION = /^(\d{1,3}(\.\d{1,2})?)% (\d{1,3}(\.\d{1,2})?)%$/;

// Which series, ground and accent style a page uses: the series from the brand file (by key), a label of its own, and any
// per-page override of ground and accent from the fixed lists.
export function styleOf(spec, brand) {
  let s = { name: brand.name, ground: 'white', accent: 'muted' };
  if (spec.series !== undefined) {
    s = brand.series[spec.series];
    if (!s) throw new DesignError(`series "${spec.series}" is not in brand.json (known: ${Object.keys(brand.series).join(', ')})`);
  }
  const ground = spec.ground ?? s.ground;
  if (!GROUND_NAMES.includes(ground)) throw new DesignError(`ground must be one of ${GROUND_NAMES.join(', ')}`);
  return { label: spec.label ?? s.name, ground, accent: spec.accent ?? s.accent };
}

// Mono labels are upper case by default; camel-cased names (a brand such as "YouTube") and web addresses keep their case.
const CAMEL = /\b[A-Za-z][a-z]+[A-Z][A-Za-z]*\b|\b[a-z]+[A-Z][A-Za-z]*\b/;
const keepCase = (t) => CAMEL.test(t) || new RegExp(WEB_ADDRESS.source, 'i').test(t);
export const lbl = (t, extra = '', role = 'label', attrs = '') => `<span class="lbl${keepCase(t) ? ' n' : ''}${extra ? ` ${extra}` : ''}" data-role="${role}"${attrs}>${esc(t)}</span>`;
export const folio = (ctx) => (ctx.counter ? `${pad2(ctx.counter.n)} / ${pad2(ctx.counter.total)}` : null);

export const runhead = (left, right, rule = true) => `<div class="rh">${left ? lbl(left) : '<span></span>'}${right ? lbl(right) : '<span></span>'}</div>${rule ? '<div class="rh-rule"></div>' : ''}`;

// Footer: the full colour logo bottom-left, a mono label bottom-right ("Swipe →" on page 1 of a carousel, else the website).
export function footer(ctx, { label, inverse = false } = {}) {
  const B = ctx.brand;
  let right = label;
  if (right === undefined) right = ctx.counter?.n === 1 ? 'Swipe →' : B.website;
  const [fw, fh] = B.logos.fullSize, k = 32 / fh;
  const logo = inverse
    ? `<span class="logo-inv"><img src="${B.logoMarkSrc}" alt="" style="height:32px"><i role="img" aria-label="${esc(B.name)}" style="--lw:${px((fw - B.logos.wordmarkFrom) * k)}px;--lx:-${px(B.logos.wordmarkFrom * k)}px;--lm:${px(B.logos.markGap * k)}px"></i></span>`
    : `<img class="logo" src="${B.logoFullSrc}" alt="${esc(B.name)}">`;
  return `<div class="ft footer"><div>${logo}</div>${right ? lbl(right, '', 'foot') : ''}</div>`;
}

// The headline and its sub line, from (70, y), or in the flow of its parent with `flow`. Sizes 70 / 84 / 112 (the fit loop may
// shrink the headline).
export function textBlock({ y = PAGE.headTop, w = 940, size = 84, headline, sub, subW = 820, subCls = '', id = 'txt', flow = false, pills, checks }) {
  const h = `<div class="h s${size}" data-role="headline" style="font-size:${hs(size)};max-width:${w}px">${fmtE(headline)}</div>`;
  const s = sub ? `<div class="sub${subCls ? ` ${subCls}` : ''}" data-role="sub" data-min="30" style="margin-top:${PAGE.subGap}px;max-width:${subW}px">${fmtSub(sub)}</div>` : '';
  const extra = pillRow(pills) + checkList(checks);
  if (flow) return `<div id="${id}" style="width:${w}px">${h}${s}${extra}</div>`;
  return `<div class="abs" id="${id}" style="left:${PAGE.m}px;top:${px(y)}px;width:${w}px">${h}${s}${extra}</div>`;
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

// The tint panel that fills the page from `top` down; cards and screens below the text sit on it.
export const panel = (top) => `<div class="panel" id="panel" style="top:${px(top)}px"></div>`;

// A short mono note at a fixed place, on the panel (a ledger's notes).
export const note = (x, y, t, { w } = {}) => `<div class="abs" style="left:${px(x)}px;top:${px(y)}px${w ? `;width:${px(w)}px` : ''}">${lbl(t, 'n', 'label', ' data-onpanel')}</div>`;

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
export function phone(ctx, spec, { w, at, cut }) {
  const B = ctx.brand, k = w / B.phone.refWidth;
  const pos = at ? `left:${px(at.x)}px;top:${px(at.y)}px;` : 'position:relative;';
  const img = `<img data-user data-phone data-name="${esc(spec.image)}" data-fit="width" src="${ctx.image(spec.image)}" alt="">`;
  // `cut`: only the top `cut` pixels show, fading out at the foot (the website's product wells).
  const inner = cut ? `<div class="cut" style="height:${px(cut)}px">${img}</div>` : img;
  return `<div class="phone" data-obj data-avoid data-bleed style="${pos}width:${px(w)}px;filter:${dropShadowCss(B.shadows.phone, k)}">${inner}</div>`;
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
  const shadow = `${shadowCss(B.shadows.window, k)},0 0 0 ${px(ring)}px ${rgbaOf(B.surfaces.line)}`;
  const img = (extra = '') => `<img data-user data-name="${esc(spec.image)}" data-fit="width" src="${ctx.image(spec.image)}" alt=""${extra}>`;
  const size = ctx.imageSize?.(spec.image), r = Number(region);
  const pic = size && r >= 0.4 && r < 1 ? `<div class="crop" style="height:${px((w * size.h) / size.w)}px">${img(` style="width:${px(100 / r)}%"`)}</div>` : img();
  return `<div class="win obj" data-obj data-avoid style="width:${px(w)}px;border-radius:${px(B.radius.device * k)}px;box-shadow:${shadow}${lean}">${bar}${pic}</div>`;
}

// The page: ground, accent style, the body. `flex` marks pages whose objects flow (so shrinking the headline helps).
// An ink page gets the website's faint dot grid unless the spec says `dots: false`.
export function page(ctx, spec, { body, dark = false, flex = false, ground, accent }) {
  const st = styleOf(spec, ctx.brand);
  const g = dark ? 'ink' : (ground ?? st.ground);
  const cls = [`acc-${accent ?? st.accent}`, g === 'ink' ? 'dark' : ''].filter(Boolean).join(' ');
  const dots = g === 'ink' && spec.dots !== false ? ' dots' : '';
  return { body: `<div class="cv${dots}" style="--bg:var(--g-${g})">${body}</div>`, bodyClass: cls, bodyAttrs: `data-editorial="1"${flex ? ' data-flex="1"' : ''}` };
}
export const head = (ctx, spec, { right, rule = true } = {}) => {
  const st = styleOf(spec, ctx.brand);
  return runhead(st.label, right ?? folio(ctx) ?? spec.headRight ?? ctx.brand.name, rule);
};

// Where the panel starts under the text: the reference spacing for a headline of 70 / 84 / 112 px with or without a sub line
// (two headline lines and up to three sub lines; longer text is shrunk by the fit loop or refused).
// The headline's line height is the website's 1.2, so two lines of 70 / 84 / 112 px take 168 / 202 / 269 px.
export const panelTopFor = (size, hasSub) => ({ 70: hasSub ? 500 : 350, 84: hasSub ? 540 : 420, 112: hasSub ? 600 : 450 }[size] ?? 540);
