// The poster page of the built-in templates (object, number, product, myth-fact, closing), as a layout's "page": "poster" draws
// it: one ground per post (a dark one with the posters' line texture), large two-tone headlines, a photo that bleeds off the
// bottom and may lend the page its colour, and the logo bar. Each block is drawn with exactly the markup the
// poster template functions wrote (testlib/builtin-markup.json holds it), with the helpers of design/templates/poster.mjs.
// What each block honours is listed in PAGES.poster (lib/design/layout.mjs). A new drawing is its own function and one line in DRAW.
import { DesignError } from './errors.mjs';
import { BLOCKS, whenHolds } from './layout.mjs';
import { decorationHtml, drawBuiltPage, isInt, opt, place } from './layout-parts.mjs';
import { ALIGNS as SPEC_ALIGNS, GROUND_NAMES, groundName } from './tokens.mjs';
import { esc, fmtE, fmtSub, hs, px, taglineMarkup } from '../../design/templates/common.mjs';
import { glow, phone } from '../../design/templates/editorial.mjs';
import { dotMapSvg } from '../../design/templates/map.mjs';
import { BAR_LOW, POSTER, bar, objectPhoto } from '../../design/templates/poster.mjs';
import { logoPlace } from '../../design/templates/style.mjs';

// A headline or a figure's font size: shrunk by the fit loop with every other block that shrinks (hs), or fixed.
const fontSize = (blk, n) => (opt(blk, 'shrink') ? hs(n) : `${px(n)}px`);
// The poster's lead text box (the first headline or figure drawn) is #txt, which stands above the photo (brand.css).
const lead = (state) => { if (state.txt) return ''; state.txt = true; return ' id="txt"'; };

// A headline or a big figure in its box, as poster.mjs words() sets one: text-align always written. On a poster page the type is
// the posters' unless the block asks for the editorial style. A headline with a subField has that sub line flowing 28 px under it
// in the same box (subWidth wide, centred under a centred headline), so it moves up as the fit loop shrinks the headline.
// A headline may take the spec's own validated align (specAlign: object, product), fall back to the brand's tagline when the spec
// has none (fallback: tagline) and its sub line to the brand's website (subFallback: website), as the closing page does.
function words(blk, spec, ctx, r, state, { big }) {
  let v = spec[blk.field ?? (big ? 'big' : 'headline')];
  if (!big && v === undefined && opt(blk, 'fallback') === 'tagline') v = taglineMarkup(ctx.brand.tagline);
  if (typeof v !== 'string' || !v) return '';
  const size = opt(blk, 'size'), editorial = blk.style !== undefined && opt(blk, 'style') === 'editorial';
  const align = !big && opt(blk, 'specAlign') && SPEC_ALIGNS.includes(spec.align) ? spec.align : opt(blk, 'align');
  const cls = editorial ? (big ? 'h big' : `h s${size}`) : (big ? 'ps-h big' : 'ps-h');
  let s = big || blk.subField === undefined ? undefined : spec[blk.subField];
  if (!big && blk.subField !== undefined && s === undefined && opt(blk, 'subFallback') === 'website') s = ctx.brand.website;
  const flow = typeof s === 'string' && s ? `<div class="sub ps-sub" data-role="sub" data-min="30" style="margin-top:28px;max-width:${px(opt(blk, 'subWidth'))}px${align === 'center' ? ';margin-left:auto;margin-right:auto' : ''}">${fmtSub(s)}</div>` : '';
  return `<div class="abs"${lead(state)} style="${place(r)};text-align:${align}"><div class="${cls}" data-role="${big ? 'stat' : 'headline'}" style="font-size:${fontSize(blk, size)}">${fmtE(v)}</div>${flow}</div>`;
}

// A sub line on its own (number's line under the figure): the box carries the role, in the posters' sub style.
function sub(blk, spec, ctx, r) {
  const v = spec[blk.field ?? 'sub'];
  if (typeof v !== 'string' || !v) return '';
  const align = opt(blk, 'align');
  return `<div class="abs sub ps-sub" data-role="sub" data-min="30" style="${place(r)}${align === 'left' ? '' : `;text-align:${align}`}">${fmtSub(v)}</div>`;
}

// Up to three figures side by side, sharing the rectangle's width with 40 px between them (number's supporting figures).
function stats(blk, spec, ctx, r) {
  const list = Array.isArray(spec[blk.field ?? 'stats']) ? spec[blk.field ?? 'stats'] : [];
  const gap = 40, step = (r.w + gap) / Math.max(1, list.length), size = opt(blk, 'size');
  return list.map((s, i) => `<div class="abs" style="left:${px(r.x + i * step)}px;top:${px(r.y)}px;width:${px(step - gap)}px"><div class="ps-h" data-role="stat" style="font-size:${fontSize(blk, size)}">${fmtSub(s[0])}</div><div class="sub ps-sub" data-role="statlabel" data-min="30" style="margin-top:6px">${fmtSub(s[1])}</div></div>`).join('');
}

// The photo, full width from the top of its rectangle to the bottom edge (or from the spec's validated photoTop). Whether its
// plain background becomes the page is decided in the browser from its pixels (runtime.mjs ready(); not for a treated photo).
function photo(blk, spec, ctx, r) {
  if (typeof spec.image !== 'string' || !spec.image) return '';
  const top = opt(blk, 'photoTop') && isInt(spec.photoTop, 300, 960) ? spec.photoTop : r.y;
  return objectPhoto(ctx, spec, { top });
}

// -- poster group: drawings of new block types go here --
// A phone's top: its rectangle's, or the spec's validated phoneTop when the block takes it.
const phoneTop = (blk, spec, r) => (opt(blk, 'phoneTop') && isInt(spec.phoneTop, 300, 960) ? spec.phoneTop : r.y);
// The picture's height over its width (its own size, else a pre-framed phone capture's).
const ratioOf = (ctx, spec) => { const d = ctx.imageSize?.(spec.image); return d && d.w > 0 ? d.h / d.w : 1354 / 660; };
const hasImage = (spec) => typeof spec.image === 'string' && spec.image !== '';

// The logo bar; without its label (the website or "Swipe →") on the closing page. When a photo (it always runs to the bottom
// edge) or a phone whose full height reaches the bar's low place lies under where a bottom bar would be, the bar stays at the top,
// on the ground, as poster.mjs decides (bottomTaken).
function logoBar(blk, spec, ctx, r, state) {
  const taken = hasImage(spec) && state.shown.some(({ blk: b, r: q }) => b.type === 'photo' || (b.type === 'screen' && phoneTop(b, spec, q) + q.w * ratioOf(ctx, spec) > BAR_LOW));
  return bar(ctx, state.frame.dark, { ...(opt(blk, 'label') === 'none' ? { right: '' } : {}), bottomTaken: taken });
}

// The phone shown where the page has a screen block (product): the pre-framed capture, the rectangle's width, from its top,
// running off the bottom.
function screen(blk, spec, ctx, r) {
  if (!hasImage(spec)) return '';
  return phone(ctx, spec, { w: r.w, at: { x: r.x, y: phoneTop(blk, spec, r) } });
}

// The decorations. A glow on a page that shows a phone is that phone's soft glow, as product draws it: from 40 px under the
// phone's top, as wide as the phone and as tall as the picture at that width (its own size, else a phone's) or to the page's
// bottom edge, whichever is less, the brand's glow inset larger on every side. The dot map is drawn as closing draws it (a brand
// without a map refuses it, as the template did). The rest as on any page.
function decoration(blk, spec, ctx, r, state) {
  const kind = opt(blk, 'kind');
  if (kind === 'glow') {
    const ph = state.shown.find((x) => x.blk.type === 'screen');
    if (ph) {
      const y = phoneTop(ph.blk, spec, ph.r);
      return glow(ctx, { x: ph.r.x, y: y + 40, w: ph.r.w, h: Math.min(ctx.size.h - y, ph.r.w * ratioOf(ctx, spec)) });
    }
  }
  if (kind === 'map') {
    const w = Math.round(r.w), h = Math.round(r.h);
    return `<svg class="fig map" style="left:${px(r.x)}px;top:${px(r.y)}px" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${dotMapSvg(ctx.brand.map, w, h)}</svg>`;
  }
  return decorationHtml(blk, ctx, r, state.warnings);
}

// myth-fact's slabs: a flex column in the rectangle, the slabs 28 px apart and centred in it. Each headline child starts the next
// slab, in the order of SLABS (its class picks the brand's slab colour; its tag is fixed words); a sub line child is set in the
// slab before it. Slab text has no #txt (the page's objects flow, data-flex).
const SLABS = [{ cls: 'myth', tag: 'Myth' }, { cls: 'fact', tag: 'Fact' }];
function slabs(blk, spec, ctx, r) {
  const groups = [];
  for (const c of Array.isArray(blk.children) ? blk.children : []) {
    if (c.type === 'headline' || !groups.length) groups.push([]);
    groups[groups.length - 1].push(c);
  }
  const html = groups.slice(0, SLABS.length).map((g, i) => {
    const inner = g.map((c) => {
      const v = spec[c.field ?? BLOCKS[c.type].field];
      if (typeof v !== 'string' || !v) return '';
      if (c.type === 'headline') return `<div class="ps-h" data-role="headline" style="font-size:${fontSize(c, opt(c, 'size'))};margin-top:30px">${fmtE(v)}</div>`;
      if (c.type === 'sub') return `<div class="sub" data-role="sub" data-min="30" style="margin-top:24px">${fmtSub(v)}</div>`;
      return '';
    }).join('');
    return `<div class="slab ${SLABS[i].cls}"><span class="tag" data-role="label">${SLABS[i].tag}</span>${inner}</div>`;
  }).join('');
  return `<div class="stack" style="${place(r)};height:${px(r.h)}px;gap:28px;justify-content:center">${html}</div>`;
}

// The series mark, opposite the logo bar: bottom right, or top right when the brand's style puts the bar at the bottom. Its words:
// the spec's label, else the series' name, else "Myths vs facts".
function mark(blk, spec, ctx) {
  const series = spec.series !== undefined ? ctx.brand.series?.[spec.series] : null;
  const t = spec.label ?? series?.name ?? 'Myths vs facts';
  return `<div class="pmark" style="right:${POSTER.m}px;${logoPlace(ctx.brand, 'poster').bottom ? `top:${POSTER.barTop + 3}px` : 'bottom:62px'}"><span data-role="foot">${esc(t)}</span></div>`;
}
// (end of poster group)

export const DRAW = {
  photo,
  bar: logoBar,
  headline: (blk, spec, ctx, r, state) => words(blk, spec, ctx, r, state, { big: false }),
  figure: (blk, spec, ctx, r, state) => words(blk, spec, ctx, r, state, { big: true }),
  sub,
  stats,
  decoration,
  spacer: () => '',
  // -- poster group --
  screen,
  slabs,
  mark,
  // (end of poster group)
};

// The page around the blocks: poster.mjs poster(). A page whose objects flow (myth-fact's slabs) is marked data-flex, so the fit
// check knows that shrinking the headlines helps.
const FLOWING = ['slabs'];
const wrapFor = (flex) => (f, body) => ({
  body: `<div class="cv poster${f.texture ? ` ${f.texture}` : ''}" style="--bg:var(--g-${f.ground})">${body}</div>`,
  bodyClass: `acc-${f.accent}${f.dark ? ' dark' : ''}`,
  bodyAttrs: `data-editorial="1"${flex ? ' data-flex="1"' : ''}`,
});

// A poster whose layout has no photo ground (product, myth-fact, closing) takes no photo ground from the spec either, and words a
// wrong ground as poster.mjs groundOf does (after the series, which is checked first).
function noPhotoGround(layout, spec, ctx) {
  const cases = Array.isArray(layout.ground) ? layout.ground.map((c) => c.ground) : [layout.ground];
  if (cases.includes('photo') || spec.ground === undefined) return;
  if (spec.series !== undefined && !ctx.brand.series?.[spec.series]) throw new DesignError(`series "${spec.series}" is not in brand.json`);
  if (!groundName(spec.ground)) throw new DesignError(`ground must be one of ${GROUND_NAMES.join(', ')}`);
}

export function drawPoster(layout, spec, ctx) {
  noPhotoGround(layout, spec, ctx);
  const flex = layout.blocks.some((b) => FLOWING.includes(b.type) && whenHolds(b.when, spec, ctx.counter));
  return drawBuiltPage(layout, spec, ctx, { page: 'poster', draw: DRAW, wrap: wrapFor(flex) });
}
