// Turns a checked layout (lib/design/layout.mjs) and a checked spec into a page body, for the renderer (render.mjs), which then
// runs the same fit loop, contrast, enlargement and pixel checks, under the same Content-Security-Policy, as for the built-in
// templates. The rule of design/templates/common.mjs holds here too: spec, brand and layout values reach the page only through
// esc()/fmtE()/fmtSub() (text), ctx.image() (a checked data: URI), numbers computed here from validated numbers, and names
// picked from the fixed lists of layout.mjs. Nothing a layout holds is ever written into markup or a style as it is.
import { DesignError } from './errors.mjs';
import { LIMITS } from './figures.mjs';
import { BLOCKS, PAGES, TYPE_SCALE, cellOf, findLayout, groundCase, slotRect, whenHolds } from './layout.mjs';
import { box, decorationHtml, opt, textureOf } from './layout-parts.mjs';
import { drawEditorial } from './layout-editorial.mjs';
import { drawPhoto } from './layout-photo.mjs';
import { drawPoster } from './layout-poster.mjs';
import { COVER_SIZES, SIZES } from './sizes.mjs';
import { GROUND_NAMES, groundName, isDarkColour } from './tokens.mjs';
import { esc, fmtE, fmtSub, hs, px } from '../../design/templates/common.mjs';
import { desktopWindow, folio, glow, lbl, obj, phone, photoWindow } from '../../design/templates/editorial.mjs';
import { ledgerSvg, passbookSvg, registerSvg, svgBox } from '../../design/templates/artefacts.mjs';
import { accentOf, decorationOf, footerOf, isDark } from '../../design/templates/style.mjs';

const CHECK = '<span class="ck" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20"><polyline points="20 6 9 17 4 12"/></svg></span>';

// The ground, accent style and series name a grid page uses. Ground: the spec's, else the layout's (its first case that holds),
// else the series', else light. Accent: the spec's, else the layout's, else the brand's style (its accent device, else the
// series'), else muted. Whether the ground is dark comes from the brand's own colour for it.
export function frameOf(spec, layout, brand, counter) {
  const series = spec.series !== undefined ? brand.series?.[spec.series] : null;
  if (spec.series !== undefined && !series) throw new DesignError(`series "${spec.series}" is not in brand.json (known: ${Object.keys(brand.series ?? {}).join(', ')})`);
  const given = groundCase(layout, spec, counter);
  const ground = groundName(spec.ground ?? (given && given !== 'series' ? given : series?.ground ?? 'light'));
  if (!ground) throw new DesignError(`ground must be one of ${GROUND_NAMES.join(', ')}`);
  const own = spec.accent ?? (layout.accent && layout.accent !== 'series' ? layout.accent : undefined);
  const accent = accentOf(brand, { spec: { accent: own }, series, fallback: 'muted' });
  return { ground, accent, dark: isDark(brand, ground), label: spec.label ?? series?.name ?? brand.name };
}

// The margins the fit check holds text to on a layout page: the layout's own, less a few pixels for the optical overhang of
// large type. They are never smaller than the size's minimum margins (layout.mjs checks the grid against them). A built-in
// page (poster, editorial) keeps its templates' reference margins (PAGES[page].fit); the photo post and the page covers
// (fit: null) the size's own margins, as their templates did.
export function layoutFit(layout, sizeName) {
  const page = layout.page ?? 'grid', S = SIZES[sizeName] ?? (page === 'cover' ? COVER_SIZES[sizeName] : undefined);
  if (page !== 'grid') return PAGES[page].fit ? { ...S, ...PAGES[page].fit } : S;
  const { m } = cellOf(layout.canvas[sizeName], sizeName);
  return { ...S, pad: Math.min(m.left, m.right) - 6, top: m.top - 6, bottom: m.bottom - 6 };
}

const scaled = (n, size) => Math.round(n * (TYPE_SCALE[size.name] ?? 1));
// A size the fit loop shrinks (with every other block that shrinks), or a fixed one (shrink: false).
const fontSize = (blk, n) => (opt(blk, 'shrink') ? hs(n) : `${px(n)}px`);

// ---- text, in the flow of a cell or a slab ----

function logoHtml(ctx, variant, h, dark) {
  const B = ctx.brand, [fw, fh] = B.logos.fullSize, k = h / fh;
  if (variant === 'pill' || (variant === 'auto' && footerOf(B) === 'pill')) return `<span class="lpill ly-logo" data-avoid style="--logo-h:${px(h)}px"><img src="${B.logoFullSrc}" alt="${esc(B.name)}"></span>`;
  if (variant === 'mark') return `<img class="ly-logo" data-avoid src="${B.logoMarkSrc}" alt="${esc(B.name)}" style="height:${px(h)}px">`;
  if (variant === 'full' || (variant === 'auto' && !dark)) return `<img class="ly-logo" data-avoid src="${B.logoFullSrc}" alt="${esc(B.name)}" style="height:${px(h)}px">`;
  // The mark beside the full logo's wordmark, drawn white on a dark surface and ink on a light one (as on the poster pages).
  return `<span class="logo-inv${dark ? '' : ' logo-ink'} ly-logo" data-avoid style="height:${px(h)}px"><img src="${B.logoMarkSrc}" alt="" style="height:${px(h)}px"><i role="img" aria-label="${esc(B.name)}" style="height:${px(h)}px;background-size:auto ${px(h)}px;--lw:${px((fw - B.logos.wordmarkFrom) * k)}px;--lx:-${px(B.logos.wordmarkFrom * k)}px;--lm:${px(B.logos.markGap * k)}px"></i></span>`;
}

function labelText(blk, spec, ctx, frame) {
  if (blk.field !== undefined) return spec[blk.field];
  if (blk.text !== undefined) return blk.text;
  if (blk.source === 'series') return frame.label;
  if (blk.source === 'brand') return ctx.brand.name;
  if (blk.source === 'folio') return folio(ctx) ?? undefined;
  return undefined;
}

// One text block's markup, or '' when its field is empty. `dark`: the surface it sits on.
function flowHtml(blk, spec, ctx, frame, dark) {
  const S = ctx.size, t = blk.type;
  const field = blk.field ?? BLOCKS[t].field;
  if (t === 'headline') {
    const v = spec[field];
    if (typeof v !== 'string' || !v) return '';
    const cls = opt(blk, 'style') === 'poster' ? 'ps-h' : 'h';
    return `<div class="${cls} ly-h" data-role="headline" style="font-size:${fontSize(blk, scaled(opt(blk, 'size'), S))}">${fmtE(v)}</div>`;
  }
  if (t === 'sub') {
    const v = spec[field];
    if (typeof v !== 'string' || !v) return '';
    const n = scaled(opt(blk, 'size'), S);
    return `<div class="sub ly-sub" data-role="sub" data-min="${scaled(30, S)}" style="font-size:${px(n)}px;line-height:${px(Math.round(n * 1.31))}px">${fmtSub(v)}</div>`;
  }
  if (t === 'figure') {
    const v = spec[field];
    if (typeof v !== 'string' || !v) return '';
    const cls = opt(blk, 'style') === 'poster' ? 'ps-h' : 'h';
    return `<div class="${cls} big ly-fig" data-role="stat" style="font-size:${fontSize(blk, scaled(opt(blk, 'size'), S))};line-height:1">${fmtE(v)}</div>`;
  }
  if (t === 'label') {
    const v = labelText(blk, spec, ctx, frame);
    if (typeof v !== 'string' || !v) return '';
    const n = scaled(opt(blk, 'size'), S), size = `font-size:${px(n)}px;line-height:${px(Math.round(n * 1.27))}px`;
    const style = opt(blk, 'style'), acc = opt(blk, 'tone') === 'accent';
    if (style === 'mono') return `<div class="ly-line">${lbl(v, acc ? 'acc' : '', 'label', ` style="${size}"`)}</div>`;
    return `<div class="ly-line"><span class="${style === 'tag' ? 'ly-tag' : 'ly-plain'}${acc ? ' ly-acc' : ''}" data-role="label" style="${size}">${esc(v)}</span></div>`;
  }
  if (t === 'website') {
    const n = scaled(opt(blk, 'size'), S);
    return `<div class="ly-line"><span class="ly-url" data-role="label" style="font-size:${px(n)}px;line-height:${px(Math.round(n * 1.25))}px">${esc(ctx.brand.website)}</span></div>`;
  }
  if (t === 'logo') return `<div class="ly-line">${logoHtml(ctx, opt(blk, 'variant'), scaled(opt(blk, 'size'), S), dark)}</div>`;
  if (t === 'stats') {
    const list = Array.isArray(spec[field]) ? spec[field] : [];
    if (!list.length) return '';
    const n = scaled(opt(blk, 'size'), S), l = scaled(30, S), row = opt(blk, 'direction') === 'row', rules = opt(blk, 'rules');
    const items = list.map((s, i) => `<div class="ly-stat${rules && i ? ' ly-ruled' : ''}"><div class="h ly-statn" data-role="stat" style="font-size:${fontSize(blk, n)}">${fmtSub(s[0])}</div><div class="sub" data-role="statlabel" data-min="${l}" style="font-size:${px(l)}px;line-height:${px(Math.round(l * 1.31))}px;margin-top:${px(scaled(8, S))}px">${fmtSub(s[1])}</div></div>`).join('');
    return `<div class="ly-stats ${row ? 'ly-row' : 'ly-col'}" style="gap:${px(scaled(row ? 40 : 24, S))}px">${items}</div>`;
  }
  if (t === 'list') {
    const list = Array.isArray(spec[field]) ? spec[field] : [];
    if (!list.length) return '';
    const n = scaled(30, S), size = `font-size:${px(n)}px;line-height:${px(Math.round(n * 1.5))}px`, style = opt(blk, 'style');
    if (style === 'pills') return `<div class="pills ly-pills">${list.map((v) => `<span class="pill" data-role="label">${esc(v)}</span>`).join('')}</div>`;
    if (style === 'bullets') return `<ul class="ly-bullets">${list.map((v) => `<li data-role="sub" data-min="${n}" style="${size}">${esc(v)}</li>`).join('')}</ul>`;
    return `<ul class="checks ly-checks">${list.map((v) => `<li style="${size}">${CHECK}<span data-role="sub" data-min="${n}">${esc(v)}</span></li>`).join('')}</ul>`;
  }
  return '';
}

const cellClass = (blk, { stack = false } = {}) => `ly-cell${stack ? ' ly-stack' : ''} ly-v-${opt(blk, 'valign') ?? 'top'} ly-a-${opt(blk, 'align') ?? 'left'}`;

// ---- pictures, panels and drawn objects ----

// Where a w x h object sits in the rectangle r, by the block's alignment.
function placeIn(r, w, h, blk) {
  const a = opt(blk, 'align') ?? 'center', v = opt(blk, 'valign') ?? 'center';
  const x = a === 'left' ? r.x : a === 'right' ? r.x + r.w - w : r.x + (r.w - w) / 2;
  const y = v === 'top' ? r.y : v === 'bottom' ? r.y + r.h - h : r.y + (r.h - h) / 2;
  return { x, y };
}

function screenHtml(blk, spec, ctx, r) {
  const d = ctx.imageSize?.(spec.image);
  if (opt(blk, 'device') === 'desktop') {
    const W = ctx.brand.window, framed = opt(blk, 'framed'), ratio = d && d.w > 0 ? d.h / d.w : 0.625;
    const k = ratio + (framed ? 0 : W.bar / W.refWidth), w = Math.min(r.w, r.h / k), at = placeIn(r, w, w * k, blk);
    const title = blk.titleField !== undefined && typeof spec[blk.titleField] === 'string' ? spec[blk.titleField] : undefined;
    return `<div class="stack" style="left:${px(at.x)}px;top:${px(at.y)}px;width:${px(w)}px">${desktopWindow(ctx, spec, { w, framed, title, tilt: opt(blk, 'tilt') })}</div>`;
  }
  const ratio = d && d.w > 0 ? d.h / d.w : 1354 / 660;
  const crop = opt(blk, 'fit') === 'crop';
  const w = crop ? r.w : Math.min(r.w, r.h / ratio), h = w * ratio, cut = crop && h > r.h ? r.h : undefined;
  const at = placeIn(r, w, cut ?? h, blk);
  const halo = opt(blk, 'glow') ? glow(ctx, { x: at.x, y: at.y, w, h: cut ?? h }) : '';
  return halo + phone(ctx, spec, { w, at, cut });
}

function photoHtml(blk, spec, ctx, r) {
  const frame = opt(blk, 'frame');
  if (frame === 'none') return photoWindow(ctx, spec, { ...r, avoid: true });
  return obj(r.x, r.y, r.w, r.h, frame === 'raised' ? 'photo raised' : 'photo', photoWindow(ctx, spec, { x: 0, y: 0, w: r.w, h: r.h }));
}

const tooSmall = (what, need, r) => new DesignError(`the ${what} needs a slot of at least ${Math.ceil(need.w)} x ${Math.ceil(need.h)} px; its slot is ${Math.floor(r.w)} x ${Math.floor(r.h)} px (give the block more cells, or use another layout)`);

function artefactHtml(blk, spec, ctx, r) {
  const a = spec.artefact;
  if (!a || typeof a !== 'object') return '';
  if (a.type === 'ledger') {
    const f = ledgerSvg(a), pad = 40, w = f.w + 2 * pad, h = f.h + 2 * pad, notes = Array.isArray(a.notes) ? a.notes : [];
    const total = h + (notes.length ? 44 + notes.length * 42 : 0);
    if (w > r.w + 0.5 || total > r.h + 0.5) throw tooSmall('ledger', { w, h: total }, r);
    const at = placeIn(r, w, total, blk);
    return obj(at.x, at.y, w, h, 'card', svgBox(pad, pad, f.w, f.h, f.svg))
      + notes.map((t, i) => `<div class="abs" style="left:${px(at.x)}px;top:${px(at.y + h + 44 + i * 42)}px;width:${px(w)}px">${lbl(t, 'n', 'label')}</div>`).join('');
  }
  if (a.type === 'register') {
    const f = registerSvg(a), pad = 32, w = f.w + 2 * pad, h = f.h + 2 * pad;
    if (w > r.w + 0.5 || h > r.h + 0.5) throw tooSmall('register card', { w, h }, r);
    const at = placeIn(r, w, h, blk);
    return obj(at.x, at.y, w, h, 'card', svgBox(pad, pad, f.w, f.h, f.svg));
  }
  const pass = { days: a.days ?? 31, ticked: a.ticked ?? 0, today: a.today ?? 0, tick: a.tick ?? 'ink' };
  if (a.register) {
    const pw = 410, ph = 540, f = registerSvg(a.register), cw = f.w + 64, ch = f.h + 64, gap = 24, w = pw + gap + cw, h = Math.max(ph, ch);
    if (w > r.w + 0.5 || h > r.h + 0.5) throw tooSmall('passbook with its register card', { w, h }, r);
    const at = placeIn(r, w, h, blk);
    return obj(at.x, at.y, pw, ph, 'card', svgBox(30, 30, pw - 60, ph - 60, passbookSvg(pw - 60, ph - 60, pass)))
      + obj(at.x + pw + gap, at.y, cw, ch, 'card', svgBox(32, 32, f.w, f.h, f.svg));
  }
  const min = { w: 320, h: 380 };
  if (r.w < min.w || r.h < min.h) throw tooSmall('passbook page', min, r);
  const w = Math.min(r.w, LIMITS.ledger.width + 80), h = Math.min(r.h, 724), pad = 34, at = placeIn(r, w, h, blk);
  return obj(at.x, at.y, w, h, 'card', svgBox(pad, pad, w - 2 * pad, h - 2 * pad, passbookSvg(w - 2 * pad, h - 2 * pad, pass)));
}

function slabHtml(blk, spec, ctx, frame, r) {
  const g = opt(blk, 'ground'), dark = g === 'panel' || g === 'card' ? isDarkColour(ctx.brand.surfaces[g]) : isDark(ctx.brand, g), pad = opt(blk, 'padding');
  const bg = g === 'panel' ? 'var(--panel)' : g === 'card' ? 'var(--card)' : `var(--g-${g})`;
  const inner = { x: r.inner.x - r.x + pad, y: r.inner.y - r.y + pad, w: r.inner.w - 2 * pad, h: r.inner.h - 2 * pad };
  if (inner.w < 16 || inner.h < 16) throw new DesignError(`a slab's padding (${pad} px) leaves no room for its text; give it more cells or less padding`);
  const children = (blk.children ?? []).map((c) => flowHtml(c, spec, ctx, frame, dark)).join('');
  const cls = `abs ly-slab ly-${dark ? 'dark' : 'light'} ly-r-${opt(blk, 'radius')}${opt(blk, 'shadow') ? ' ly-shadow' : ''}`;
  return `<div class="${cls}" data-avoid style="${box(r)};--ly-bg:${bg}"><div class="${cellClass(blk, { stack: true })}" data-cell style="${box(inner)};gap:${px(opt(blk, 'gap'))}px">${children}</div></div>`;
}

// The template function for { template: "layout" }: (spec, ctx) -> { body, bodyClass, bodyAttrs, sheet, warnings }.
// ctx.layouts: the brand's layouts (or the ones being previewed); the one named is checked again here before use.
export function renderLayout(spec, ctx) {
  let layout;
  try { layout = findLayout(spec.layout, ctx.layouts ?? ctx.brand.layouts); } catch (err) { throw new DesignError(err.message); }
  return renderLayoutWith(layout, spec, ctx);
}

// A checked layout drawn for a spec: a grid page here, a built-in page by its own drawings (layout-poster.mjs,
// layout-editorial.mjs). The built-in templates are drawn this way from lib/design/builtin-layouts.mjs.
export function renderLayoutWith(layout, spec, ctx) {
  const size = ctx.size.name;
  if (!layout.canvas[size]) throw new DesignError(`layout "${layout.id}" has no ${size} size`);
  if (layout.page === 'poster') return drawPoster(layout, spec, ctx);
  if (layout.page === 'editorial') return drawEditorial(layout, spec, ctx);
  if (layout.page === 'photo') return drawPhoto(layout, spec, ctx);
  const frame = frameOf(spec, layout, ctx.brand, ctx.counter), warnings = [];
  let under = '', media = '', text = '';
  for (const blk of layout.blocks) {
    if (!whenHolds(blk.when, spec, ctx.counter)) continue;
    const r = slotRect(layout, blk, size);
    const t = blk.type;
    if (t === 'spacer') continue;
    if (t === 'decoration') under += decorationHtml(blk, ctx, r, warnings);
    else if (t === 'photo') { if (spec.image) media += photoHtml(blk, spec, ctx, r); }
    else if (t === 'screen') { if (spec.image) media += screenHtml(blk, spec, ctx, r); }
    else if (t === 'artefact') media += artefactHtml(blk, spec, ctx, r);
    else if (t === 'slab') media += slabHtml(blk, spec, ctx, frame, r);
    else {
      const inner = flowHtml(blk, spec, ctx, frame, frame.dark);
      if (inner) text += `<div class="${cellClass(blk)}" data-cell style="${box(r)}">${inner}</div>`;
    }
  }
  const texture = textureOf(layout, ctx.brand, () => decorationOf(ctx.brand, { dark: frame.dark }));
  return {
    body: `<div class="cv lyt${texture ? ` ${texture}` : ''}" style="--bg:var(--g-${frame.ground})">${under}${media}${text}</div>`,
    bodyClass: `acc-${frame.accent}${frame.dark ? ' dark' : ''}`,
    bodyAttrs: 'data-editorial="1" data-layout="1"',
    // the layout classes (design/layout.css), a fixed file of the engine that buildPage places after the brand's stylesheet
    sheet: 'layout',
    warnings,
  };
}
