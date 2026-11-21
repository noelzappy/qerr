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
// The artefact as crisp white cards (artefacts.mjs artefactCards): a ledger with its notes or a register card at the rectangle's
// top-left, each its own drawn size; a passbook page filling the rectangle; a passbook page with its register card beside it.
// `from` (a listed name) says where the artefact is: the block's field (a text page's artefact), or the spec itself, as the
// ledger and passbook templates take theirs. The values are validateDesign's; the drawings escape every word and clamp every
// number. A ledger's notes are marked as on the panel when the rectangle lies on it. (The import sits in this section so that the
// groups' changes to this file merge; an import is hoisted wherever it is written.)
import { artefactCards } from '../../design/templates/artefacts.mjs';

const ARTEFACT_FROM = {
  field: (blk, spec) => spec[blk.field ?? 'artefact'],
  ledger: (blk, spec) => ({ type: 'ledger', columns: spec.columns, rows: spec.rows, mark: spec.mark, notes: spec.notes }),
  passbook: (blk, spec) => ({ type: 'passbook', days: spec.days, ticked: spec.ticked, today: spec.today, tick: spec.tick, register: spec.register }),
};
function artefact(blk, spec, ctx, r, state) {
  const a = ARTEFACT_FROM[opt(blk, 'from')](blk, spec);
  if (!a || typeof a !== 'object' || Array.isArray(a)) return '';
  return artefactCards(a, r, { onPanel: within(r, panelOf(state)) });
}
// (end of artefacts group)
// -- editorial group: drawings of new block types go here --
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
  artefact,
  // (end of artefacts group)
  // -- editorial group --
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
