// The editorial page of the built-in templates (cover, text, ledger, passbook, stats, screen, photo-story), as a layout's
// "page": "editorial" draws it: the series' ground, the running head, the tint panel that text and cards sit on, and the footer
// with the logo. Each block is drawn with exactly the markup of design/templates/editorial.mjs and the templates that use it, so
// a template expressed as a layout (lib/design/builtin-layouts.mjs) makes the same image. What each block honours is listed in
// PAGES.editorial (lib/design/layout.mjs). Phase 2 of the conversion adds drawings here, each as its own function and one line
// in DRAW (see testlib/CONVERTING.md).
import { HEADLINE_PX } from './layout.mjs';
import { decorationHtml, drawBuiltPage, opt, place } from './layout-parts.mjs';
import { isDarkColour } from './tokens.mjs';
import { fmtE, fmtSub, hs, px } from '../../design/templates/common.mjs';
import { folio, footer, runhead } from '../../design/templates/editorial.mjs';

const fontSize = (blk, n) => (opt(blk, 'shrink') ? hs(n) : `${px(n)}px`);
const lead = (state) => { if (state.txt) return ''; state.txt = true; return ' id="txt"'; };
const alignOf = (blk) => (opt(blk, 'align') === 'left' ? '' : `;text-align:${opt(blk, 'align')}`);
const isPanel = (blk) => blk.type === 'decoration' && opt(blk, 'kind') === 'panel';
// The panel drawn on this page (the tint band from its top to the bottom edge), if any.
const panelOf = (state) => state.shown.find((s) => isPanel(s.blk))?.r ?? null;
const within = (r, p) => !!p && r.x >= p.x && r.y >= p.y && r.x + r.w <= p.x + p.w && r.y + r.h <= p.y + p.h;

// The headline in its box (editorial.mjs textBlock): the size from the block, or the spec's own validated "size" (70, 84 or 112)
// when the block takes it, with its class for the optical overhang. A subField's sub line flows 28 px under it in the same box,
// subWidth wide, so it moves up as the fit loop shrinks the headline.
function headline(blk, spec, ctx, r, state) {
  const v = spec[blk.field ?? 'headline'];
  if (typeof v !== 'string' || !v) return '';
  const size = opt(blk, 'specSize') && HEADLINE_PX.includes(spec.size) ? spec.size : opt(blk, 'size');
  const cls = opt(blk, 'style') === 'poster' ? 'ps-h' : `h s${size}`;
  const s = blk.subField === undefined ? undefined : spec[blk.subField];
  const flow = typeof s === 'string' && s ? `<div class="sub" data-role="sub" data-min="30" style="margin-top:28px;max-width:${px(opt(blk, 'subWidth'))}px">${fmtSub(s)}</div>` : '';
  return `<div class="abs"${lead(state)} style="${place(r)}${alignOf(blk)}"><div class="${cls}" data-role="headline" style="font-size:${fontSize(blk, size)};max-width:${px(r.w)}px">${fmtE(v)}</div>${flow}</div>`;
}

// A sub line on its own; on the panel when its rectangle lies on it (the fit check then does not count the panel's edge).
function sub(blk, spec, ctx, r, state) {
  const v = spec[blk.field ?? 'sub'];
  if (typeof v !== 'string' || !v) return '';
  return `<div class="abs sub" data-role="sub" data-min="30"${within(r, panelOf(state)) ? ' data-onpanel' : ''} style="${place(r)}${alignOf(blk)}">${fmtSub(v)}</div>`;
}

// The tint panel from the top of its rectangle to the bottom edge (editorial.mjs panel); the other decorations as on any page.
const decoration = (blk, spec, ctx, r, state) => (isPanel(blk) ? `<div class="panel" id="panel" style="top:${px(r.y)}px"></div>` : decorationHtml(blk, ctx, r, state.warnings));

// The running head: the series' name (or the spec's label) on the left; the folio on a carousel page, else the spec's own
// right-hand head, else the brand's name, on the right.
const head = (blk, spec, ctx, r, state) => runhead(state.frame.label, folio(ctx) ?? spec.headRight ?? ctx.brand.name, opt(blk, 'rule'));

// The footer: the logo, and the website ("Swipe →" on page 1 of a carousel), as the brand's style places them. Its logo is drawn
// for what it sits on: the panel when the page has one, else the ground.
const foot = (blk, spec, ctx, r, state) => footer(ctx, { inverse: panelOf(state) ? isDarkColour(ctx.brand.surfaces.panel) : state.frame.dark });

// -- artefacts group: drawings of new block types go here --
// (end of artefacts group)
// -- editorial group: drawings of new block types go here --
// (Imported under names of their own, so they never clash with another group's imports.)
import * as editorialKit from '../../design/templates/editorial.mjs';
import { MAX_STATS as EDITORIAL_MAX_STATS } from './spec.mjs';

// A photo in its rectangle (cover, stats, photo-story), by its frame: "none" a photo window, as the stats page's band and
// photo-story's panel are drawn; "card" the photo with the card radius and a 1 px line (cover); "raised" that card raised
// (photo-story's print, on the panel). Nothing without a photo.
function editorialPhoto(blk, spec, ctx, r) {
  if (typeof spec.image !== 'string' || !spec.image) return '';
  const frame = opt(blk, 'frame');
  if (frame === 'none') return editorialKit.photoWindow(ctx, spec, { x: r.x, y: r.y, w: r.w, h: r.h, avoid: true });
  return editorialKit.obj(r.x, r.y, r.w, r.h, frame === 'raised' ? 'photo raised' : 'photo', editorialKit.photoWindow(ctx, spec, { x: 0, y: 0, w: r.w, h: r.h }));
}

// The big figure (stats.mjs): the box is the figure itself, its line height its size. It is not the page's #txt (the stats page
// has none).
function editorialFigure(blk, spec, ctx, r) {
  const v = spec[blk.field ?? 'big'];
  if (typeof v !== 'string' || !v) return '';
  const size = fontSize(blk, opt(blk, 'size'));
  return `<div class="abs h big" data-role="stat" style="${place(r)};font-size:${size};line-height:${size}">${fmtE(v)}</div>`;
}

// Up to three figures (stats.mjs). "row": side by side across the rectangle, 50 px apart, each its number in bold over its label,
// in the sub style (the stats page over a photo; `size` is not used). "column": rows a third of the rectangle's height apart, each
// number in the headline type at `size` over its label, with a hairline above every row but the first when `rules` is on.
function editorialStats(blk, spec, ctx, r) {
  const list = Array.isArray(spec[blk.field ?? 'stats']) ? spec[blk.field ?? 'stats'] : [];
  if (opt(blk, 'direction') === 'row') {
    const gap = 50, step = (r.w + gap) / Math.max(1, list.length);
    return list.map((s, i) => `<div class="abs sub" data-role="statlabel" data-min="30" style="left:${px(r.x + i * step)}px;top:${px(r.y)}px;width:${px(step - gap)}px"><b>${fmtSub(s[0])}</b><br>${fmtSub(s[1])}</div>`).join('');
  }
  const pitch = r.h / EDITORIAL_MAX_STATS, size = opt(blk, 'size'), rules = opt(blk, 'rules');
  return list.map((s, i) => `<div class="abs" style="${place({ x: r.x, y: r.y + i * pitch, w: r.w })};${rules && i ? 'border-top:1px solid var(--hair);padding-top:24px' : ''}"><div class="h s${size}" data-role="stat" style="font-size:${fontSize(blk, size)}">${fmtSub(s[0])}</div><div class="sub" data-role="statlabel" data-min="30" style="margin-top:8px">${fmtSub(s[1])}</div></div>`).join('');
}

// The label row (photo-story's panel page): the series' name (or the spec's label) at the left end of the rectangle and, on a
// carousel page, the folio at the right end.
function labelRow(blk, spec, ctx, r, state) {
  const f = folio(ctx);
  return `<div class="abs" style="left:${px(r.x)}px;right:${px(ctx.size.w - r.x - r.w)}px;top:${px(r.y)}px;display:flex;justify-content:space-between">${editorialKit.lbl(state.frame.label)}${f ? editorialKit.lbl(f) : ''}</div>`;
}
// (end of editorial group)
// -- screen group: drawings of new block types go here --
// (end of screen group)

export const DRAW = {
  decoration,
  runhead: head,
  headline,
  sub,
  footer: foot,
  spacer: () => '',
  // -- artefacts group --
  // (end of artefacts group)
  // -- editorial group --
  photo: editorialPhoto,
  figure: editorialFigure,
  stats: editorialStats,
  labelrow: labelRow,
  // (end of editorial group)
  // -- screen group --
  // (end of screen group)
};

// The page around the blocks: editorial.mjs page().
const wrap = (f, body) => ({
  body: `<div class="cv${f.texture ? ` ${f.texture}` : ''}" style="--bg:var(--g-${f.ground})">${body}</div>`,
  bodyClass: [`acc-${f.accent}`, f.dark ? 'dark' : ''].filter(Boolean).join(' '),
  bodyAttrs: 'data-editorial="1"',
});

export const drawEditorial = (layout, spec, ctx) => drawBuiltPage(layout, spec, ctx, { page: 'editorial', draw: DRAW, wrap });
