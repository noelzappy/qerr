// The editorial page of the built-in templates (cover, text, ledger, passbook, stats, screen, photo-story), as a layout's
// "page": "editorial" draws it: the series' ground, the running head, the tint panel that text and cards sit on, and the footer
// with the logo. Each block is drawn with exactly the markup the editorial template functions wrote
// (testlib/builtin-markup.json holds it), with the helpers of design/templates/editorial.mjs. What each block honours is listed in
// PAGES.editorial (lib/design/layout.mjs). A new drawing is its own function and one line in DRAW.
import { HEADLINE_PX } from './layout.mjs';
import { decorationHtml, drawBuiltPage, opt, place } from './layout-parts.mjs';
import { isDarkColour } from './tokens.mjs';
import { fmtE, fmtSub, hs, px } from '../../design/templates/common.mjs';
import { folio, footer, runhead, toneOf, withTone } from '../../design/templates/editorial.mjs';
import { logoPlace } from '../../design/templates/style.mjs';

const fontSize = (blk, n) => (opt(blk, 'shrink') ? hs(n) : `${px(n)}px`);
const lead = (state) => { if (state.txt) return ''; state.txt = true; return ' id="txt"'; };
const alignOf = (blk) => (opt(blk, 'align') === 'left' ? '' : `;text-align:${opt(blk, 'align')}`);
const isPanel = (blk) => blk.type === 'decoration' && opt(blk, 'kind') === 'panel';
// The panel drawn on this page (the tint band from its top to the bottom edge), if any.
const panelOf = (state) => state.shown.find((s) => isPanel(s.blk))?.r ?? null;
const within = (r, p) => !!p && r.x >= p.x && r.y >= p.y && r.x + r.w <= p.x + p.w && r.y + r.h <= p.y + p.h;
// What text sits on: the panel or the page's ground. Text is coloured for that surface: on a surface of the other tone than the
// ground (the light panel on a dark ground) it carries the tone class (editorial.mjs toneOf), and brand.css colours it as a page
// of that tone, so it is held to the contrast targets on what is really behind it. toneIn: a block whose rectangle lies on the
// panel; onPanelAt: chrome from y down (the panel runs from its top to the bottom edge, the full width).
const surfaceDark = (ctx, state, onPanel) => (onPanel ? isDarkColour(ctx.brand.surfaces.panel) : state.frame.dark);
const onPanelAt = (state, y) => { const p = panelOf(state); return !!p && p.y <= y; };
const toneIn = (ctx, state, r) => toneOf(state.frame.dark, surfaceDark(ctx, state, within(r, panelOf(state))));

// The page's chrome (the feed page's, in page pixels): the running head's labels from y 56 and its rule at y 98; the footer, 34 px
// tall, 56 px above the bottom edge. With the brand's logo at the top they change places: the footer from y 56, and the running
// head at the foot, its labels 56 px above the bottom edge and its rule 98 px above it, at y 1251 (brand.css .ft.up, .rh.low).
// The page's text and pictures stay in the band between them (y 126 to 1240).
const CHROME = { top: 56, foot: 1260, lowRule: 1251, band: { top: 126, bottom: 1240 } };
// Whether the chrome changes places: the brand puts its logo at the top, and no picture (a photo or a screen the spec fills)
// reaches into the band the footer would move into (above y 126: photo-story's full-bleed photo) nor, on a page with a running
// head, into the band at the foot (below y 1240: a phone running off the bottom edge). Otherwise the footer stays at the bottom
// and its logo follows only the side, as a poster's bar stays at the top over a photo that takes the bottom edge.
function chromeUp(ctx, state, spec) {
  if (state.up !== undefined) return state.up;
  let up = !logoPlace(ctx.brand, 'editorial').bottom;
  if (up) {
    const filled = typeof spec.image === 'string' && spec.image !== '';
    const pics = state.shown.filter(({ blk }) => filled && (blk.type === 'photo' || blk.type === 'screen'));
    const head = state.shown.some(({ blk }) => blk.type === 'runhead');
    up = !pics.some(({ r }) => r.y < CHROME.band.top || (head && r.y + r.h > CHROME.band.bottom));
  }
  state.up = up;
  return up;
}

// The headline in its box (editorial.mjs textBlock): the size from the block, or the spec's own validated "size" (70, 84 or 112)
// when the block takes it, with its class for the optical overhang. A subField's sub line flows 28 px under it in the same box,
// subWidth wide, so it moves up as the fit loop shrinks the headline; with `lists`, the spec's pills and check list (the screen
// template's) follow it (editorial.mjs pillRow, checkList: escaped items, a fixed check drawing).
// With `row`, the box is the text column of a flex row with the layout's phone (its screen block, drawn here and not on its
// own): the row runs from the headline's left edge to the phone's right edge, the gap between their rectangles apart, and both
// are centred in the band the two rectangles share (editorial.mjs textBlock's flow, as the screen template sets its phone row).
function headline(blk, spec, ctx, r, state) {
  const v = spec[blk.field ?? 'headline'];
  if (typeof v !== 'string' || !v) return '';
  const size = opt(blk, 'specSize') && HEADLINE_PX.includes(spec.size) ? spec.size : opt(blk, 'size');
  const cls = opt(blk, 'style') === 'poster' ? 'ps-h' : `h s${size}`;
  const s = blk.subField === undefined ? undefined : spec[blk.subField];
  const flow = typeof s === 'string' && s ? `<div class="sub" data-role="sub" data-min="30" style="margin-top:28px;max-width:${px(opt(blk, 'subWidth'))}px">${fmtSub(s)}</div>` : '';
  const lists = opt(blk, 'lists') ? screenKit.pillRow(spec.pills) + screenKit.checkList(spec.checks) : '';
  const inner = `<div class="${cls}" data-role="headline" style="font-size:${fontSize(blk, size)};max-width:${px(r.w)}px">${fmtE(v)}</div>${flow}${lists}`;
  const tone = toneIn(ctx, state, r);
  if (opt(blk, 'row')) return phoneRow(blk, spec, ctx, r, state, `<div${lead(state)}${tone ? ` class="${tone}"` : ''} style="width:${px(r.w)}px${alignOf(blk)}">${inner}</div>`);
  return `<div class="${withTone('abs', tone)}"${lead(state)} style="${place(r)}${alignOf(blk)}">${inner}</div>`;
}

// A sub line on its own; on the panel when its rectangle lies on it (the fit check then does not count the panel's edge).
function sub(blk, spec, ctx, r, state) {
  const v = spec[blk.field ?? 'sub'];
  if (typeof v !== 'string' || !v) return '';
  return `<div class="${withTone('abs sub', toneIn(ctx, state, r))}" data-role="sub" data-min="30"${within(r, panelOf(state)) ? ' data-onpanel' : ''} style="${place(r)}${alignOf(blk)}">${fmtSub(v)}</div>`;
}

// The tint panel from the top of its rectangle to the bottom edge (editorial.mjs panel); the other decorations as on any page.
const decoration = (blk, spec, ctx, r, state) => (isPanel(blk) ? `<div class="panel" id="panel" style="top:${px(r.y)}px"></div>` : decorationHtml(blk, ctx, r, state.warnings));

// The running head: the series' name (or the spec's label) on the left; the folio on a carousel page, else the spec's own
// right-hand head, else the brand's name, on the right. At the top, or at the foot when the footer took the top (chromeUp);
// coloured for what it sits on.
function head(blk, spec, ctx, r, state) {
  const low = chromeUp(ctx, state, spec);
  const tone = toneOf(state.frame.dark, surfaceDark(ctx, state, onPanelAt(state, low ? CHROME.lowRule : CHROME.top)));
  return runhead(state.frame.label, folio(ctx) ?? spec.headRight ?? ctx.brand.name, opt(blk, 'rule'), { low, tone });
}

// The footer: the logo, and the website ("Swipe →" on page 1 of a carousel), as the brand's style places them: at the bottom, or
// at the top (chromeUp). Its logo and label are drawn for what they sit on: the panel when the footer lies on it, else the ground.
function chromeFoot(ctx, state, spec, label) {
  const up = chromeUp(ctx, state, spec), dark = surfaceDark(ctx, state, onPanelAt(state, up ? CHROME.top : CHROME.foot));
  return footer(ctx, { label, inverse: dark, up, tone: toneOf(state.frame.dark, dark) });
}
const foot = (blk, spec, ctx, r, state) => chromeFoot(ctx, state, spec);

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
  return artefactCards(a, r, { onPanel: within(r, panelOf(state)), tone: toneIn(ctx, state, r) });
}
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
function editorialFigure(blk, spec, ctx, r, state) {
  const v = spec[blk.field ?? 'big'];
  if (typeof v !== 'string' || !v) return '';
  const size = fontSize(blk, opt(blk, 'size'));
  return `<div class="${withTone('abs h big', toneIn(ctx, state, r))}" data-role="stat" style="${place(r)};font-size:${size};line-height:${size}">${fmtE(v)}</div>`;
}

// Up to three figures (stats.mjs). "row": side by side across the rectangle, 50 px apart, each its number in bold over its label,
// in the sub style (the stats page over a photo; `size` is not used). "column": rows a third of the rectangle's height apart, each
// number in the headline type at `size` over its label, with a hairline above every row but the first when `rules` is on.
function editorialStats(blk, spec, ctx, r, state) {
  const list = Array.isArray(spec[blk.field ?? 'stats']) ? spec[blk.field ?? 'stats'] : [];
  const tone = toneIn(ctx, state, r);
  if (opt(blk, 'direction') === 'row') {
    const gap = 50, step = (r.w + gap) / Math.max(1, list.length);
    return list.map((s, i) => `<div class="${withTone('abs sub', tone)}" data-role="statlabel" data-min="30" style="left:${px(r.x + i * step)}px;top:${px(r.y)}px;width:${px(step - gap)}px"><b>${fmtSub(s[0])}</b><br>${fmtSub(s[1])}</div>`).join('');
  }
  const pitch = r.h / EDITORIAL_MAX_STATS, size = opt(blk, 'size'), rules = opt(blk, 'rules');
  return list.map((s, i) => `<div class="${withTone('abs', tone)}" style="${place({ x: r.x, y: r.y + i * pitch, w: r.w })};${rules && i ? 'border-top:1px solid var(--hair);padding-top:24px' : ''}"><div class="h s${size}" data-role="stat" style="font-size:${fontSize(blk, size)}">${fmtSub(s[0])}</div><div class="sub" data-role="statlabel" data-min="30" style="margin-top:8px">${fmtSub(s[1])}</div></div>`).join('');
}

// The label row (photo-story's panel page): the series' name (or the spec's label) at the left end of the rectangle and, on a
// carousel page, the folio at the right end.
function labelRow(blk, spec, ctx, r, state) {
  const f = folio(ctx);
  return `<div class="${withTone('abs', toneIn(ctx, state, r))}" style="left:${px(r.x)}px;right:${px(ctx.size.w - r.x - r.w)}px;top:${px(r.y)}px;display:flex;justify-content:space-between">${editorialKit.lbl(state.frame.label)}${f ? editorialKit.lbl(f) : ''}</div>`;
}
// (end of editorial group)
// -- screen group: drawings of new block types go here --
// The screen template's page: a pre-framed phone in a row with the text, faded out under the text
// or beside a passbook card, or a desktop window on the panel. Its imports are here (imports are hoisted), as namespaces with
// names of their own, so that the groups' changes to this file stay apart and never declare a name twice.
import * as screenArt from '../../design/templates/artefacts.mjs';
import * as screenKit from '../../design/templates/editorial.mjs';
import * as screenErr from './errors.mjs';

// The layout's phone (its screen block, shown, device phone), and whether a headline draws it in its row (a headline with `row`
// whose words are there: an empty headline draws nothing, and the phone is then drawn on its own).
const phoneOf = (state) => state.shown.find((s) => s.blk.type === 'screen' && opt(s.blk, 'device') === 'phone') ?? null;
const rowOf = (state, spec) => state.shown.some((s) => s.blk.type === 'headline' && opt(s.blk, 'row') && typeof spec[s.blk.field ?? 'headline'] === 'string' && spec[s.blk.field ?? 'headline'] !== '');

// The headline's row (see headline above): `text` is its column. The phone's rectangle must lie beside the headline's, at the
// same height, as the screen template sets them (text 430 px, gap 40, phone 470 in the band from 126 to 1240).
function phoneRow(blk, spec, ctx, r, state, text) {
  const p = phoneOf(state)?.r;
  if (!p || p.y !== r.y || p.h !== r.h || p.x < r.x + r.w) throw new screenErr.DesignError('a headline set in a row needs the layout\'s phone beside it, at the same height');
  return `<div class="abs" style="left:${px(r.x)}px;top:${px(r.y)}px;width:${px(p.x + p.w - r.x)}px;height:${px(r.h)}px;display:flex;align-items:center;gap:${px(p.x - r.x - r.w)}px"><div style="flex:1;min-width:0">${text}</div>${screenKit.phone(ctx, spec, { w: p.w })}</div>`;
}

// The screen block: a desktop window in a stack at the top of its rectangle, its width (the spec's own framed, tilt and region
// with specWindow; a title from titleField); or a phone, the rectangle's width, from its top (it may run off the bottom edge),
// cut at the rectangle's foot with fit "crop" (the website's product wells). A phone in a headline's row is drawn there.
function screenBlock(blk, spec, ctx, r, state) {
  if (opt(blk, 'device') === 'desktop') {
    const own = opt(blk, 'specWindow'), title = blk.titleField === undefined ? undefined : spec[blk.titleField];
    const win = screenKit.desktopWindow(ctx, spec, { w: r.w, framed: own && spec.framed === true, title, tilt: own && spec.tilt === true, region: own ? spec.region : undefined });
    return `<div class="stack" style="left:${px(r.x)}px;top:${px(r.y)}px;width:${px(r.w)}px;gap:32px">${win}</div>`;
  }
  if (rowOf(state, spec)) return '';
  return screenKit.phone(ctx, spec, { w: r.w, at: { x: r.x, y: r.y }, cut: opt(blk, 'fit') === 'crop' ? r.h : undefined });
}

// The glow the phone floats on, behind the layout's phone as its screen block draws it: in a headline's row, centred in the band
// and moved right by the glow's inset (off the text column); cut, no taller than the cut. Nothing without a phone.
function halo(blk, spec, ctx, r, state) {
  const p = phoneOf(state);
  if (!p) return '';
  const { x, y, w, h } = p.r, ph = w * screenKit.ratioOf(ctx, spec);
  if (rowOf(state, spec)) return screenKit.glow(ctx, { x: x + ctx.brand.glow.inset * ctx.brand.scale, y: y + (h - ph) / 2, w, h: ph });
  return screenKit.glow(ctx, { x, y, w, h: opt(p.blk, 'fit') === 'crop' ? Math.min(h, ph) : ph });
}

// The passbook card the spec's "beside" describes (passbookSvg checks its days, ticked, today and tick), filling its rectangle
// with a padding of 28 px.
function besideCard(blk, spec, ctx, r) {
  const b = spec.beside;
  if (!b || typeof b !== 'object') return '';
  const pad = 28, w = r.w - 2 * pad, h = r.h - 2 * pad;
  return screenKit.obj(r.x, r.y, r.w, r.h, 'card', screenArt.svgBox(pad, pad, w, h, screenArt.passbookSvg(w, h, { days: b.days ?? 31, ticked: b.ticked ?? 0, today: b.today ?? 0, tick: b.tick ?? 'ink' })));
}

// The footer with the logo alone (no website, no "Swipe →"), placed and drawn as the footer is (chromeFoot).
const footlogo = (blk, spec, ctx, r, state) => chromeFoot(ctx, state, spec, '');
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
  photo: editorialPhoto,
  figure: editorialFigure,
  stats: editorialStats,
  labelrow: labelRow,
  // (end of editorial group)
  // -- screen group --
  screen: screenBlock,
  halo,
  beside: besideCard,
  footlogo,
  // (end of screen group)
};

// The page around the blocks: editorial.mjs page().
const wrap = (f, body) => ({
  body: `<div class="cv${f.texture ? ` ${f.texture}` : ''}" style="--bg:var(--g-${f.ground})">${body}</div>`,
  bodyClass: [`acc-${f.accent}`, f.dark ? 'dark' : ''].filter(Boolean).join(' '),
  bodyAttrs: 'data-editorial="1"',
});

export const drawEditorial = (layout, spec, ctx) => drawBuiltPage(layout, spec, ctx, { page: 'editorial', draw: DRAW, wrap });
