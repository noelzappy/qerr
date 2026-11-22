// The kit every design direction composes with: the context a composition's render(ctx) receives, and the builders (type, rules,
// folio, meta row, photo shapes and treatments, framed print, frame, sticker, highlight bar, wordmark pattern, accent block, fit-to-width
// headline, corner logo). A composition is trusted engine code, but its WORDS are untrusted: they reach the page only as Markup, and
// Markup comes only from ctx.fmt()/ctx.text()/ctx.items() and the m`` tag, which escape. A builder that takes html refuses anything
// that is not Markup, so a raw `${spec.headline}` cannot be written by accident. Positions and sizes are numbers (checked finite and
// written through px()); colours are names from the post's palette (--c-*); fonts are the direction's roles (--f-*).
import { esc, fmtE, hs, px } from '../../../design/templates/common.mjs';
import { paletteCss } from './colour.mjs';
import { fontAlias } from '../font-library.mjs';
import { ICONS } from '../icons.mjs';
import { INFO_KEYS, INLINE, POST_GALLERY, POST_INFO, seenText, withoutMarks } from '../post-spec.mjs';
import { CHART_KINDS, LINE_KINDS, chartLayout, chartProblems, formatAll, highlightIndex, totalOf } from '../chart.mjs';

// ---- markup that is safe to place in the page ----
export class Markup extends String {}
export const markup = (s) => new Markup(s);
// m`<b>${x}</b>`: the literal parts are the code's; each value is escaped unless it is already Markup.
export const m = (strings, ...vals) => new Markup(strings.reduce((out, s, i) => out + s + (i < vals.length ? (vals[i] instanceof Markup ? String(vals[i]) : esc(vals[i])) : ''), ''));
const safe = (v, what) => { if (!(v instanceof Markup)) throw new Error(`design kit: ${what} must be Markup (ctx.fmt(), ctx.text(), m\`\`), never a plain string`); return String(v); };

// ---- numbers and names ----
const n = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`design kit: ${what} must be a finite number (got ${typeof v})`); return v; };
const P = (v, what) => px(n(v, what));
const CLASS = /^[a-z0-9 _-]*$/;
const cls = (c) => { if (typeof c !== 'string' || !CLASS.test(c)) throw new Error('design kit: a class list may only use lowercase letters, digits, space, - and _'); return c; };
// ---- first-class, validated parameters (a composition never passes a free CSS string, class name or attribute) ----
// variant: a name from the kit's own table (tilt) or the direction's (tokens.variants: type treatments such as 'sticker'); it maps to a class by
//   that table. nudge: { x, y } px of margin, within +-NUDGE_MAX. flexNone / alignSelf: the two flex facts a box in a row or column needs.
// split / band: the page measures the element on its own text / on the band its capitals fill. key: an id another element may name.
// follow: the key of a stepped element whose chosen size this element takes.
// dropSub: { key, lines }: the element is left out when the element with that key sets in that many lines or more.
// steps / maxLines / maxH: the runtime sets the element at the largest of `steps` (px, descending) at which it takes at most maxLines lines and
//   is at most maxH px tall (a number, or 'slot': the room its parent leaves it); the smallest step when none does.
const KIT_VARIANTS = Object.freeze({ tilt: 'k-tilt', fill: 'k-v-fill' });
export const NUDGE_MAX = 120;
const ID = /^[a-z][a-z0-9-]{0,30}$/;
const ALIGN_SELF = Object.freeze({ stretch: 'stretch', start: 'flex-start', end: 'flex-end', center: 'center' });
const variantOf = (tokens, v) => {
  if (v === undefined) return '';
  const own = tokens.variants ?? {};
  if (typeof v === 'string' && Object.hasOwn(own, v)) return own[v];
  if (typeof v === 'string' && Object.hasOwn(KIT_VARIANTS, v)) return KIT_VARIANTS[v];
  throw new Error(`design kit: "${String(v).slice(0, 30)}" is not a variant (${[...Object.keys(own), ...Object.keys(KIT_VARIANTS)].join(', ')})`);
};
const nudgeCss = (v) => {
  if (v === undefined) return '';
  if (!v || typeof v !== 'object') throw new Error('design kit: nudge must be { x, y }');
  const out = [];
  for (const [k, prop] of [['x', 'margin-left'], ['y', 'margin-top']]) {
    if (v[k] === undefined) continue;
    const q = n(v[k], `nudge ${k}`);
    if (Math.abs(q) > NUDGE_MAX) throw new Error(`design kit: nudge ${k} must be within ${NUDGE_MAX} px`);
    out.push(`${prop}:${px(q)}px`);
  }
  return out.join(';');
};
// emph: how the emphasised phrase (<em>) of a text is set: a class of kit.css, never a class from a composition
const EMPH = Object.freeze({ italic: 'k-em-i', accent: 'k-em-a', none: 'k-em-n', bold: 'k-em-b' });
const emphClass = (v) => { if (v === undefined) return ''; if (!Object.hasOwn(EMPH, v)) throw new Error('design kit: emph must be one of italic, accent, bold, none'); return ` ${EMPH[v]}`; };
// textShadow: { x, y, colour } px and a palette name: a hard shadow behind the letters
const shadowCss = (v) => {
  if (v === undefined) return '';
  if (!v || typeof v !== 'object') throw new Error('design kit: textShadow must be { x, y, colour }');
  const lim = (q, w) => { n(q, w); if (Math.abs(q) > 24) throw new Error(`design kit: ${w} must be within 24 px`); return px(q); };
  return `text-shadow:${lim(v.x, 'textShadow x')}px ${lim(v.y, 'textShadow y')}px 0 ${colour(v.colour ?? 'ink')}`;
};
const flexCss = (o) => [o.flexNone ? 'flex:none' : '', o.alignSelf !== undefined ? `align-self:${ALIGN_SELF[o.alignSelf] ?? (() => { throw new Error('design kit: alignSelf'); })()}` : ''].filter(Boolean).join(';');
const flagAttrs = (o) => `${o.split ? ' data-split' : ''}${o.band ? ' data-band' : ''}`;
const keyAttr = (o) => { if (o.key === undefined) return ''; if (!ID.test(o.key)) throw new Error('design kit: key must be an id'); return ` data-key="${o.key}"`; };
const dropAttr = (o) => { if (o.dropSub === undefined) return ''; const d = o.dropSub; if (!d || !ID.test(d.key) || !Number.isInteger(d.lines) || d.lines < 1 || d.lines > 12) throw new Error('design kit: dropSub must be { key, lines }'); return ` data-dropsub="${d.key}:${d.lines}"`; };
// follow: the id of a stepped element (key) whose chosen size this element takes (the date numeral of a poster follows its headline)
const followAttr = (o) => { if (o.follow === undefined) return ''; if (!ID.test(o.follow)) throw new Error('design kit: follow must be an id'); return ` data-follow="${o.follow}"`; };
const stepAttrs = (o) => {
  if (o.steps === undefined) return '';
  const list = o.steps;
  if (!Array.isArray(list) || list.length < 2 || list.length > 8) throw new Error('design kit: steps must be a list of 2 to 8 sizes');
  list.forEach((v, i) => { n(v, 'steps'); if (v <= 0 || (i && v >= list[i - 1])) throw new Error('design kit: steps must be positive and descending'); });
  const lines = o.maxLines === undefined ? '' : ` data-maxlines="${Number.isInteger(o.maxLines) && o.maxLines >= 1 && o.maxLines <= 12 ? o.maxLines : (() => { throw new Error('design kit: maxLines must be a whole number from 1 to 12'); })()}"`;
  const maxH = o.maxH === undefined ? '' : ` data-maxh="${o.maxH === 'slot' ? 'slot' : P(o.maxH, 'maxH')}"`;
  return ` data-steps="${list.map((v) => px(v)).join(',')}"${lines}${maxH}`;
};
const ROLES = new Set(['headline', 'stat', 'sub', 'item', 'label', 'meta', 'folio', 'accent']);
export const COLOUR_NAMES = ['paper', 'ink', 'white', 'dark', 'primary', 'field', 'on-field', 'gold', 'gold-deep', 'accent', 'accent-dark', 'on-accent', 'on-primary', 'body', 'soft', 'muted', 'body-dark', 'muted-dark', 'rule', 'rule-soft', 'rule-dark', 'rule-field', 'accent-type', 'body-field', 'field-deep', 'paper-warm', 'light-tint', 'field-text', 'tint-deep'];
// Soft shadows: fixed presets (a blurred, low-opacity ink shadow below), selected by name, never by a number from a composition.
const SOFT = Object.freeze({ soft: '0 14px 34px -10px color-mix(in srgb,var(--c-ink) 24%,transparent)', lift: '0 30px 64px -18px color-mix(in srgb,var(--c-ink) 30%,transparent)' });
const softCss = (v) => { if (!Object.hasOwn(SOFT, v)) throw new Error('design kit: soft shadow must be soft or lift'); return SOFT[v]; };
// Corner radius: pixels, or a named round shape (full: a pill or circle, oval: an ellipse, arch: a rounded top), on all corners or on the
// two corners of one side (corners: all | top | bottom | left | right).
const CORNERS = Object.freeze({ all: [1, 1, 1, 1], top: [1, 1, 0, 0], bottom: [0, 0, 1, 1], left: [1, 0, 0, 1], right: [0, 1, 1, 0] });
const radiusCss = (r, corners = 'all') => {
  if (!Object.hasOwn(CORNERS, corners)) throw new Error('design kit: corners must be all, top, bottom, left or right');
  if (r === 'oval') return '50%';
  const q = r === 'arch' ? '999px' : r === 'full' ? '999px' : `${px(n(r, 'radius'))}px`;
  if (r === 'arch') return '999px 999px 0 0';
  if (typeof r === 'number' && (r < 0 || r > 200)) throw new Error('design kit: radius must be from 0 to 200 px');
  // all four corners alike: one value, as the look always wrote it
  return corners === 'all' ? q : CORNERS[corners].map((on) => (on ? q : '0')).join(' ');
};
const colour = (name) => { if (!COLOUR_NAMES.includes(name)) throw new Error(`design kit: "${String(name).slice(0, 30)}" is not a palette colour (${COLOUR_NAMES.join(', ')})`); return `var(--c-${name})`; };
const FAMILIES = ['display', 'text', 'label', 'mono'];
const GRID_MODES = ['left', 'right', 'center', 'skip'];
const POSITION = /^(\d{1,3}(\.\d{1,2})?)% (\d{1,3}(\.\d{1,2})?)%$/;

// position and size: left/top/right/bottom/width/height in px
export function place({ x, y, w, h, right, bottom }) {
  const out = [];
  if (x !== undefined) out.push(`left:${P(x, 'x')}px`);
  if (y !== undefined) out.push(`top:${P(y, 'y')}px`);
  if (right !== undefined) out.push(`right:${P(right, 'right')}px`);
  if (bottom !== undefined) out.push(`bottom:${P(bottom, 'bottom')}px`);
  if (w !== undefined) out.push(`width:${P(w, 'w')}px`);
  if (h !== undefined) out.push(`height:${P(h, 'h')}px`);
  return out.join(';');
}

// The tracking a display size wants, in em: none below 40 px, tightening to the direction's value from 40 to 120 px.
export const trackFor = (size, tight = -0.03) => +(tight * Math.min(1, Math.max(0, (size - 40) / 80))).toFixed(4);

// The words of a post folio: from the job (the post's place in a batch, or a carousel page's place), else none. A number made up from
// the words or the date would be an arbitrary figure on the page, so without a real place there is no folio at all.
function folioOf({ folio }) {
  const clean = (v) => Number.isInteger(v) && v >= 1 && v <= 999;
  if (folio && clean(folio.n)) return { n: folio.n, total: clean(folio.total) ? folio.total : null };
  return { n: null, total: null };
}

// The parts of a text around its first *emphasis phrase*: { pre, phrase, post } as plain strings (pre is the text before it, trimmed; a text
// with no emphasis is all `pre`). Pure; compositions use it to make rules about a part of the headline (see accepts in directions/index.mjs).
// The inline marks ([[pill]] words, {{icon}}) are taken out first: the parts are plain words.
export function emphasisParts(raw) {
  const t = typeof raw === 'string' ? withoutMarks(raw.replace(/\\n|\n/g, ' ')) : '', mt = /\*([^*]+)\*/.exec(t);
  return mt ? { pre: t.slice(0, mt.index).trim(), phrase: mt[1].trim(), post: t.slice(mt.index + mt[0].length).trim() } : { pre: t.trim(), phrase: '', post: '' };
}
const visible = (s) => seenText(s);

// ---- the inline marks of a headline (post-spec.mjs INLINE) ----
// Pills: [[words]] as a span of a fixed shape class, its colours palette roles (validated here again); the words inside are the escaped
// text and judged as the accent role on the pill. Icons: {{name}} as the engine's own SVG (icons.mjs), decoration in the text's colour.
const PILL_SHAPES = Object.freeze({ pill: 'k-pl-round', soft: 'k-pl-soft', outline: 'k-pl-line' });
// one icon as inline SVG from the fixed table: the path is the engine's own constant, never data
// size: whole pixels 8 to 600 (an icon drawn at a size of its own: a badge, a row's tile), else it follows the size of the words it sits in
export function iconSvg(name, { colour, cls: extra, size } = {}) {
  if (!Object.hasOwn(ICONS, name)) throw new Error('design kit: an icon must be one of the engine\'s icons');
  const k = extra === undefined ? '' : extra === 'btn' ? ' k-ic-btn' : (() => { throw new Error('design kit: icon class'); })();
  if (size !== undefined && !(Number.isInteger(size) && size >= 8 && size <= 600)) throw new Error('design kit: an icon size is whole pixels from 8 to 600');
  const css = [size !== undefined ? `width:${size}px;height:${size}px` : '', colour ? `fill:${colour_(colour)}` : ''].filter(Boolean).join(';');
  return `<svg class="k-ic${k}" viewBox="0 0 24 24" aria-hidden="true" data-deco${css ? ` style="${css}"` : ''}><path d="${esc(ICONS[name].d)}"/></svg>`;
}
// The escaped, formatted html of a headline with its marks set: o.pills ({ shape, fill, ink }) draws pills, else the words stay plain;
// o.icons ({ colour?, badge? }) draws icons, else they are left out; with badge (a palette colour) each icon sits in a small round disc of that
// colour, like a sticker in the line. An unknown {{name}} stays as the escaped text it is.
function inlineMarks(html, o) {
  const pill = o.pills;
  if (pill !== undefined && (!pill || !Object.hasOwn(PILL_SHAPES, pill.shape ?? 'pill'))) throw new Error('design kit: pills must be { shape, fill, ink }');
  // a pill and the punctuation right after it ("[[an app]],") stay on one line: a comma never starts a line after a pill; the pill then
  // drops its outer margin on that side (k-pl-end) and the page pulls the mark (k-pl-p) in by its own side bearing (runtime ready), so its
  // ink sits snug against the pill's edge
  let out = html.replace(/\[\[([^[\]*{}<>\n\\]{1,120})\]\]([,.;:!?]{0,3})/g, (all, words, stop) => {
    if (!pill) return words + stop;
    const shape = pill.shape ?? 'pill', bg = shape === 'outline' ? '' : `background:${colour_(pill.fill)};`;
    const one = (end) => `<span class="k-pl ${PILL_SHAPES[shape]}${end ? ' k-pl-end' : ''}" style="${bg}color:${colour_(pill.ink)}"><span class="k-pl-t" data-role="accent">${words}</span></span>`;
    return stop ? `<span class="k-pl-stop">${one(true)}<span class="k-pl-p">${stop}</span></span>` : one(false);
  });
  const badge = o.icons?.badge === undefined ? '' : colour_(o.icons.badge);
  out = out.replace(/\{\{([a-z][a-z-]{0,19})\}\}/g, (all, name) => (!Object.hasOwn(ICONS, name) ? all : !o.icons ? '' : badge ? `<span class="k-icb" style="background:${badge}">${iconSvg(name, { colour: o.icons.colour })}</span>` : iconSvg(name, { colour: o.icons.colour })));
  return out.replace(/ {2,}/g, ' ');
}
// ---- a post's chart (chart.mjs): the data checked again here, as numbers and escaped labels ----
// The chart of a spec, or null: { kind (the post's, or undefined), values (finite numbers), labels (escaped strings, '' for none), unit, highlight,
// total }. Anything chartProblems refuses is no chart at all (the post was checked before; this holds whatever reaches the page).
export function chartOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || chartProblems(raw).length) return null;
  return {
    kind: raw.kind, values: raw.series.map((p) => p.value), labels: raw.series.map((p) => (typeof p.label === 'string' ? esc(p.label) : '')),
    unit: raw.unit ?? 'number', highlight: raw.highlight, total: totalOf(raw),
  };
}
// The path of a rectangle with its corners rounded by r on the side named (top, bottom, left, right, all): numbers only.
function roundRect(x, y, w, h, r, side) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2)), f = (v) => px(v);
  if (!q) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  const tl = side === 'all' || side === 'top' || side === 'left', tr = side === 'all' || side === 'top' || side === 'right';
  const br = side === 'all' || side === 'bottom' || side === 'right', bl = side === 'all' || side === 'bottom' || side === 'left';
  const arc = (ex, ey) => `A${f(q)} ${f(q)} 0 0 1 ${f(ex)} ${f(ey)}`;
  return `M${f(x)} ${f(y + (tl ? q : 0))}${tl ? arc(x + q, y) : ''}H${f(x + w - (tr ? q : 0))}${tr ? arc(x + w, y + q) : ''}V${f(y + h - (br ? q : 0))}${br ? arc(x + w - q, y + h) : ''}H${f(x + (bl ? q : 0))}${bl ? arc(x, y + h - q) : ''}Z`;
}
const circlePath = (cx, cy, r) => `M${px(cx - r)} ${px(cy)}a${px(r)} ${px(r)} 0 1 0 ${px(2 * r)} 0a${px(r)} ${px(r)} 0 1 0 ${px(-2 * r)} 0Z`;
// an arc of a circle from the top, clockwise, over share (0 to 1) of the turn
function arcPath(cx, cy, r, share) {
  const s = Math.max(0, Math.min(1, share));
  if (s >= 0.9999) return `M${px(cx)} ${px(cy - r)}a${px(r)} ${px(r)} 0 1 1 0 ${px(2 * r)}a${px(r)} ${px(r)} 0 1 1 0 ${px(-2 * r)}`;
  const a = s * 2 * Math.PI, ex = cx + r * Math.sin(a), ey = cy - r * Math.cos(a);
  return `M${px(cx)} ${px(cy - r)}A${px(r)} ${px(r)} 0 ${s > 0.5 ? 1 : 0} 1 ${px(ex)} ${px(ey)}`;
}
export const CHART_AXES = Object.freeze(['none', 'baseline', 'grid']);
export const CHART_MARKS = Object.freeze(['none', 'end', 'minmax', 'all']);

const colour_ = (name) => { if (!COLOUR_NAMES.includes(name)) throw new Error(`design kit: "${String(name).slice(0, 30)}" is not a palette colour`); return `var(--c-${name})`; };

// the builders that refuse the old free-string options (extra, cls, attrs)
const FREE = ['extra', 'cls', 'attrs'];
const BUILDERS = ['type', 'label', 'body', 'display', 'fitLines', 'group', 'rule', 'block', 'flowBlock', 'folioMark', 'verticalLabel', 'sticker', 'glyph', 'wordmarkPattern', 'numeral', 'seal', 'frame', 'keyline',
  'photo', 'print', 'box', 'band', 'run', 'shape', 'echoStack', 'fitBlock', 'fitFill', 'fitNumeral', 'scrim', 'gradient', 'overlay', 'graphic', 'tape', 'paper', 'badge', 'chartSvg', 'device', 'avatarPhoto'];

// ---- gradients: two or three palette colours, a whole-degree angle or one of nine points; written from these tables only ----
const GRADIENT_AT = Object.freeze({ center: 'center', top: 'top', bottom: 'bottom', left: 'left', right: 'right', 'left top': 'left top', 'right top': 'right top', 'left bottom': 'left bottom', 'right bottom': 'right bottom' });
export function gradientCss(g) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) throw new Error('design kit: gradient must be { kind, stops, ... }');
  const stops = g.stops;
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 3) throw new Error('design kit: a gradient has two or three colours');
  const cs = stops.map((s) => colour(s));
  let pos = [0, 100];
  if (cs.length === 3) {
    const mid = g.mid ?? 50;
    if (!Number.isInteger(mid) || mid < 20 || mid > 80) throw new Error('design kit: the middle colour of a gradient sits from 20 to 80 percent');
    pos = [0, mid, 100];
  }
  const list = cs.map((c, i) => `${c} ${pos[i]}%`).join(',');
  if (g.kind === 'linear') {
    const a = g.angle ?? 180;
    if (!Number.isInteger(a) || a < 0 || a > 359) throw new Error('design kit: a gradient angle is a whole number of degrees from 0 to 359');
    return `linear-gradient(${a}deg,${list})`;
  }
  if (g.kind === 'radial') {
    const shape = g.shape ?? 'ellipse', at = g.at ?? 'center';
    if (shape !== 'circle' && shape !== 'ellipse') throw new Error('design kit: a radial gradient is a circle or an ellipse');
    if (!Object.hasOwn(GRADIENT_AT, at)) throw new Error('design kit: a radial gradient spreads from one of nine points');
    return `radial-gradient(${shape} at ${GRADIENT_AT[at]},${list})`;
  }
  throw new Error('design kit: a gradient is linear or radial');
}
const OVERLAY_MODES = Object.freeze(['flat', 'bottom', 'top']);
// a device's finish: a class of kit.css (fixed device materials, and the brand's primary colour)
const DEVICE_FINISH = Object.freeze({ light: 'k-dev-light', dark: 'k-dev-dark', brand: 'k-dev-brand' });
// a device's soft shadow: a fixed drop shadow (it follows the outline of the drawn body, or of a pre-framed capture's own phone)
const DEVICE_SOFT = Object.freeze({ soft: 'drop-shadow(0 18px 26px rgba(0,0,0,.28))', lift: 'drop-shadow(0 36px 48px rgba(0,0,0,.36))' });
const softDevice = (v) => { if (!Object.hasOwn(DEVICE_SOFT, v)) throw new Error('design kit: a device shadow is soft or lift'); return DEVICE_SOFT[v]; };
// the corner of a portrait picture by its shape (rounded: a share of its side, worked out where it is drawn)
const AVATAR_SHAPES = Object.freeze({ circle: '50%', rounded: null, square: '0' });

// ---- the context ----
// args: { spec, brand, tokens, direction, kind, variant, comp, size, image, imageSize, counter, folio, date }
export function makeContext(args) {
  const { spec, brand, tokens, direction, kind, variant, comp, size: S } = args;
  const W = S.w, H = S.h, mg = tokens.margin, G = tokens.grid;
  const colW = (W - mg.left - mg.right - (G.cols - 1) * G.gutter) / G.cols;
  const folio = folioOf({ folio: args.folio ?? (args.counter ? { n: args.counter.n, total: args.counter.total } : undefined) });
  const brandName = brand.name;
  const carousel = args.counter && Number.isInteger(args.counter.n) && Number.isInteger(args.counter.total) ? args.counter : null;
  const c = {
    direction, kind, variant, tokens, W, H, margin: mg, grid: G, colW, folio, comp,
    // ---- the grid: column i (0-based) starts at col(i) and ends at colR(i); span(a, b) is the width from the start of a to the end of b
    col: (i) => mg.left + i * (colW + G.gutter),
    colR: (i) => mg.left + i * (colW + G.gutter) + colW,
    span: (a, b = a) => (b - a + 1) * colW + (b - a) * G.gutter,
    // the x of every column's left and right edge, and the page's centre: what the grid check holds text to
    gridLines() {
      const lefts = [...Array(G.cols).keys()].map((i) => c.col(i)), rights = [...Array(G.cols).keys()].map((i) => c.colR(i));
      return { lefts: [...lefts, ...(tokens.extraLines ?? [])], rights, centre: W / 2 };
    },
    // ---- the words (the only way spec text reaches the page)
    has: (f) => (f === 'items' || f === 'info' || f === 'gallery' ? Array.isArray(spec[f]) && spec[f].length > 0 : f === 'chart' ? chartOf(spec.chart) !== null : f === 'avatar' ? c.hasAvatar : typeof spec[f] === 'string' && spec[f] !== ''),
    chars: (f) => (typeof spec[f] === 'string' ? [...visible(spec[f])].length : 0),
    wordCount: (f) => (typeof spec[f] === 'string' ? visible(spec[f]).trim().split(/\s+/).filter(Boolean).length : 0),
    // plain escaped text (no emphasis, one line)
    // (a headline's inline marks are taken out: its pill words plain, its icons left out)
    text: (f) => new Markup(typeof spec[f] === 'string' ? esc(INLINE.fields.includes(f) ? withoutMarks(spec[f]) : spec[f]) : ''),
    // text with the emphasis phrase (*phrase*) as <em data-role="accent"> and \n as <br>: the engine's own formatter
    // { highlight: true } puts the emphasis on a highlight bar: the phrase is wrapped in a span the bar is painted on (a bar on the
    // measured text itself would be hidden with it when the page reads the pixels behind the type)
    // o.breakBefore: the emphasis phrase starts a new line (a <br> before it, unless it opens the text or follows a break)
    // o.pills ({ shape: pill | soft | outline, fill, ink }) and o.icons ({ colour? }): how a headline's [[pill]] words and {{icon}} marks are
    // drawn; without them the pill words are plain and the icons left out (kit inlineMarks)
    fmt: (f, o = {}) => {
      if (typeof spec[f] !== 'string') return new Markup('');
      let html = fmtE(spec[f]);
      if (INLINE.fields.includes(f)) html = inlineMarks(html, o);
      // "No. 1" is one unit: never broken between the abbreviation and its number
      html = html.replace(/\b(No|Nos)\. (?=\d)/g, '$1.\u00a0');
      if (o.highlight) html = html.replace(/<em data-role="accent">([^<]*)<\/em>/g, '<span class="k-hl"><em data-role="accent">$1</em></span>');
      if (o.breakBefore) html = html.replace(/(\s*)(<span class="k-hl">|<em data-role="accent">)/, (all, sp, tag, off, whole) => (off > 0 && !whole.slice(0, off).endsWith('<br>') ? `<br>${tag}` : all));
      return new Markup(html);
    },
    // the emphasis phrase's plain text, or ''
    emphasis: (f = 'headline') => (typeof spec[f] === 'string' ? /\*([^*]+)\*/.exec(spec[f])?.[1] ?? '' : ''),
    items: () => (Array.isArray(spec.items) ? spec.items.map((t) => new Markup(esc(t))) : []),
    // each item split at its last "·" into [words, after] (a menu line and its price, a day and its hours), both escaped; after is null when the
    // item has no "·" or nothing on one side of it (the whole item is then the words)
    itemParts: () => (Array.isArray(spec.items) ? spec.items.map((t) => {
      const s = String(t), i = s.lastIndexOf('·'), a = i < 0 ? '' : s.slice(0, i).trim(), b = i < 0 ? '' : s.slice(i + 1).trim();
      return a && b ? [new Markup(esc(a)), new Markup(esc(b))] : [new Markup(esc(s)), null];
    }) : []),
    // the rows of an info block as Markup { key, value }: only rows whose key is one of the fixed words and whose value is a text, at most
    // POST_INFO.max of them (the spec was checked; this holds whatever reaches it)
    info: () => (Array.isArray(spec.info) ? spec.info.filter((r) => r && typeof r === 'object' && INFO_KEYS.includes(r.key) && typeof r.value === 'string' && r.value.trim())
      .slice(0, POST_INFO.max).map((r) => ({ key: new Markup(esc(r.key)), value: new Markup(esc(r.value)) })) : []),
    // the pictures of a row: { image (the path, for c.galleryPhoto), caption (Markup, '' without one) }, at most POST_GALLERY.max
    gallery: () => (Array.isArray(spec.gallery) && typeof args.image === 'function' ? spec.gallery.filter((p) => p && typeof p === 'object' && typeof p.image === 'string' && p.image !== '')
      .slice(0, POST_GALLERY.max).map((p) => ({ image: p.image, caption: new Markup(typeof p.caption === 'string' ? esc(p.caption) : '') })) : []),
    brand: new Markup(esc(brandName)),
    // the brand's web address as a plain host (no scheme, no path), '' without one
    site: new Markup(esc(String(brand.website ?? '').replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').slice(0, 60))),
    brandChars: [...String(brandName)].length,
    // the label, else the brand's name
    labelOrBrand: () => new Markup(esc(typeof spec.label === 'string' && spec.label ? spec.label : brandName)),
    // the folio as the direction sets it ("No. 07", "07/12")
    folioText: () => new Markup(folio.n ? esc(tokens.folio(folio.n, folio.total)) : ''),
    // "Swipe" and an arrow on a carousel page that has a page after it (its place in the carousel, args.counter), else nothing: a single post
    // or the last page has no next page to swipe to. The words and the arrow are the engine's own, never data.
    swipe: () => (carousel && carousel.n < carousel.total ? new Markup(`Swipe ${iconSvg('arrow-right')}`) : new Markup('')),
    m, markup, emphasisParts: (f = 'headline') => emphasisParts(spec[f]),
    // an icon of the engine's own set (icons.mjs) as Markup; o: { colour (a palette role), cls: 'btn' }
    icon: (name, o = {}) => new Markup(iconSvg(name, o)),
    hasImage: typeof spec.image === 'string' && spec.image !== '' && typeof args.image === 'function',
    // the post's portrait picture (avatar: { image, focal? }), drawn by c.avatarPhoto
    hasAvatar: !!spec.avatar && typeof spec.avatar === 'object' && typeof spec.avatar.image === 'string' && spec.avatar.image !== '' && typeof args.image === 'function',
    // the picture's own size (width, height) in pixels, or null
    imageDims: () => (c.hasImage ? args.imageSize?.(spec.image) ?? null : null),
    // notes a look's pieces leave for the person (a graphic that is not there), added to the render's warnings
    lookNotes: [],
  };
  // A brand graphic or cut-out the post spec hands over (spec.graphics: [{ ref, image, tintable }], checked by post-spec.mjs, the files read, checked
  // and embedded by render.mjs preparePage): { src (the data: URI, through args.image only), name, w, h, tintable }, or null when it is not there.
  c.graphicOf = (ref) => {
    const list = Array.isArray(spec.graphics) ? spec.graphics : [];
    const g = list.find((x) => x && typeof x === 'object' && x.ref === ref && typeof x.image === 'string');
    if (!g || typeof args.image !== 'function') return null;
    const dims = args.imageSize?.(g.image) ?? null;
    return { src: args.image(g.image), name: g.image, w: dims?.w ?? null, h: dims?.h ?? null, tintable: g.tintable === true };
  };

  // The CSS font stack of a role: the brand's own font when it brought one for that role (font.display / font.label with files),
  // else the direction's.
  c.fontVar = (role) => { if (!FAMILIES.includes(role)) throw new Error(`design kit: font role "${role}"`); return `var(--f-${role})`; };

  // ---- text ----
  // One block of text at a place. role: what it is for the checks (headline, stat, sub, item, label, meta, folio, accent);
  // html: Markup, or text: a plain string to escape. size is in px: scale: true lets the page's fit loop shrink it (headlines, big
  // numerals); lead: a unitless line height; track: em; weight; family: a role of the direction; colour: a palette name; grid: how the
  // grid check reads it (left, right, center, skip); bleed: edges it may leave the page by ('left', 'bottom', ...).
  // `base`: the kit's own classes for a builder that wraps this one (display); never from a composition.
  const textEl = (o, base = '') => {
    const role = o.role ?? 'sub';
    if (!ROLES.has(role)) throw new Error(`design kit: role "${role}"`);
    const body = o.html !== undefined ? safe(o.html, 'html') : esc(o.text ?? '');
    if (!body) return '';
    const fam = o.family ?? 'text', mode = o.grid ?? (o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left');
    if (!GRID_MODES.includes(mode)) throw new Error(`design kit: grid mode "${mode}"`);
    const size = o.steps !== undefined ? o.steps[0] : o.size;
    const sz = o.scale ? hs(n(size, 'size')) : `${P(size, 'size')}px`;
    // flow: the block sits in the flow of a group (c.group) instead of at a place of its own; only its width is set
    const css = [o.flow ? (o.w !== undefined ? `width:${P(o.w, 'w')}px` : '') : place(o), `font-family:${c.fontVar(fam)}`, `font-size:${sz}`, `line-height:${o.lead === undefined ? 1.2 : P(o.lead, 'lead')}`,
      o.track !== undefined ? `letter-spacing:${P(o.track, 'track')}em` : '', o.weight !== undefined ? `font-weight:${P(o.weight, 'weight')}` : '',
      o.colour ? `color:${colour(o.colour)}` : '', o.align ? `text-align:${['left', 'right', 'center'].includes(o.align) ? o.align : 'left'}` : '',
      o.italic ? 'font-style:italic' : '', o.upper ? 'text-transform:uppercase' : '', o.num === 'onum' ? 'font-variant-numeric:oldstyle-nums' : o.num === 'lnum' ? 'font-variant-numeric:lining-nums' : '',
      o.nowrap ? 'white-space:nowrap' : '', shadowCss(o.textShadow), flexCss(o), nudgeCss(o.nudge)].filter(Boolean).join(';');
    const v = variantOf(tokens, o.variant);
    return `<div class="${o.flow ? 'k-flow ' : 'abs '}k-t${base ? ` ${base}` : ''}${v ? ` ${v}` : ''}${emphClass(o.emph)}${o.dfont ? ' k-dfont' : ''}" data-role="${role}" data-el${o.scale ? ' data-scaled' : ''} data-grid="${mode}"${o.bleed ? ` data-bleed="${cls(o.bleed)}"` : ''}${flagAttrs(o)}${keyAttr(o)}${dropAttr(o)}${followAttr(o)}${stepAttrs(o)} style="${css}">${body}</div>`;
  };
  c.type = (o) => textEl(o);
  // A label: the direction's small caps line (its size, tracking, family and weight come from the tokens).
  c.label = (o) => {
    const L = tokens.type.label;
    return c.type({ role: o.role ?? 'label', family: L.family ?? 'label', size: L.size, lead: L.lead ?? 1.2, track: L.track, weight: L.weight, upper: L.upper !== false, colour: o.colour ?? 'muted', nowrap: true, ...o });
  };
  // body copy at the direction's body size
  c.body = (o) => { const B = tokens.type.body; return c.type({ role: 'sub', family: 'text', size: B.size, lead: +(B.lead / B.size).toFixed(4), weight: B.weight, colour: 'body', ...o }); };

  // ---- display type: size-dependent tracking and leading, balanced lines, true italics for emphasis (direction css) ----
  c.display = (o) => {
    const D = tokens.type.display, size = o.steps !== undefined ? o.steps[0] : o.size;
    return textEl({ role: o.role ?? 'headline', family: 'display', scale: o.scale ?? true, lead: D.lead, track: trackFor(size, D.track), weight: D.weight, colour: 'ink', ...o }, 'k-display');
  };

  // ---- a headline set to fill the measure line by line (runtime.mjs fitLines): each line is as large as lets it fill the width ----
  // o: x, y, w, h (the box), cap (the largest a line may be), floor (the smallest; below it the render is refused), lead, track,
  // max (most lines), align, weight, family, colour, html (Markup of the headline).
  // w: 'fit': the measure is the text's own natural width at `cap` (one line), kept between minW and maxW (the box is then as wide as its
  //   text). h: 'auto': the height is whatever the box's own flex slot measures at run time (give it grow: true in a column), so a fixed
  //   estimate of what sits beside it is never needed; with valign the lines sit in the middle or at the foot of that slot.
  // Also: role (default headline), what (the word the refusal uses for it, for example 'tag'), trail (a negative tracking keeps its trailing
  // space inside the measure), flow (in the flow of a box: give no x or y), key (so a sub line can name it, dropSub), valign ('center' | 'bottom'),
  // highlight, grow, variant, nudge, flexNone, alignSelf.
  c.fitLines = (o) => {
    const D = tokens.type.display, body = safe(o.html ?? c.fmt('headline'), 'html');
    const auto = o.h === 'auto', fit = o.w === 'fit';
    if (o.valign !== undefined && !['center', 'bottom'].includes(o.valign)) throw new Error('design kit: valign');
    if (o.valign && !auto && o.y === undefined) throw new Error('design kit: valign needs y or h: "auto"');
    const css = [place({ x: o.x, y: o.y, w: fit ? undefined : o.w, h: auto ? undefined : o.h, right: o.right, bottom: o.bottom }), `font-family:${c.fontVar(o.family ?? 'display')}`, `line-height:${P(o.lead ?? D.lead, 'lead')}`,
      `letter-spacing:${P(o.track ?? D.track, 'track')}em`, `font-weight:${P(o.weight ?? D.weight, 'weight')}`, o.colour ? `color:${colour(o.colour)}` : '', `text-align:${o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left'}`,
      o.grow ? 'flex:1 1 0;min-height:0' : '', shadowCss(o.textShadow), flexCss(o), nudgeCss(o.nudge),
      o.stretch !== undefined ? `font-stretch:${n(o.stretch, 'stretch')}%` : '', o.padBelow !== undefined ? `--k-lpad:${P(o.padBelow, 'padBelow')}em` : ''].filter(Boolean).join(';');
    const v = variantOf(tokens, o.variant);
    return `<div class="${o.flow ? 'k-flow' : 'abs'} k-t k-display k-fit${o.padBelow !== undefined ? ' k-lpad' : ''}${v ? ` ${v}` : ''}${emphClass(o.emph)}" data-el${keyAttr(o)}${o.trail ? ' data-trail' : ''}${o.what ? ` data-what="${cls(o.what)}"` : ''}${o.valign ? ` data-valign="${o.valign}"${auto ? '' : ` data-y="${P(o.y, 'y')}"`}` : ''} data-role="${o.role && ROLES.has(o.role) ? o.role : 'headline'}" data-grid="${o.grid ?? (o.align === 'center' ? 'center' : 'left')}" data-fitlines data-split${o.highlight ? ' data-hl' : ''} data-w="${fit ? 'fit' : P(o.w, 'w')}"${fit ? ` data-minw="${P(o.minW ?? 0, 'minW')}" data-maxw="${P(o.maxW ?? 10000, 'maxW')}"` : ''} data-h="${auto ? 'auto' : P(o.h, 'h')}" data-cap="${P(o.cap, 'cap')}" data-floor="${P(o.floor, 'floor')}" data-lead="${P(o.lead ?? D.lead, 'lead')}" data-track="${P(o.track ?? D.track, 'track')}" data-max="${P(o.max ?? 5, 'max')}" data-align="${o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left'}" style="${css}">${body}</div>`;
  };

  // A group: blocks that flow one under another (type() with flow: true), the whole box placed at x/y/right/bottom, gap px apart.
  c.group = (o, inner) => `<div class="abs k-group" data-el style="${place(o)};display:flex;flex-direction:column;align-items:${o.align === 'right' ? 'flex-end' : o.align === 'center' ? 'center' : 'flex-start'};justify-content:${o.justify === 'end' ? 'flex-end' : o.justify === 'center' ? 'center' : 'flex-start'};gap:${P(o.gap ?? 0, 'gap')}px">${inner}</div>`;

  // ---- devices ----
  // A hairline: weight px thick, from x over w (horizontal) or from y over h (vertical). colour: a palette name.
  // A dotted line: round dots as wide as the line is thick, along it (a radial gradient: numbers and a palette colour only).
  const dots = (o, vertical) => { const t = P(o.weight ?? 1, 'weight'), c0 = colour(o.colour ?? 'rule'); return `background:radial-gradient(circle at 50% 50%,${c0} 0,${c0} ${px(t / 2 - 0.5)}px,transparent ${px(t / 2 + 0.5)}px) 0 0/${vertical ? `${t}px ${px(t * 2.4)}px repeat-y` : `${px(t * 2.4)}px ${t}px repeat-x`}`; };
  c.rule = (o) => `<i class="abs k-rule" aria-hidden="true" data-el data-fill style="${place({ x: o.x, y: o.y, w: o.vertical ? o.weight ?? 1 : o.w, h: o.vertical ? o.h : o.weight ?? 1 })};${o.dotted ? dots(o, o.vertical) : `background:${colour(o.colour ?? 'rule')}`}"></i>`;
  // A filled block (an accent block, a band): colour a palette name; rot degrees; counts as deliberate fill for the emptiness check.
  c.block = (o) => `<i class="abs k-block" aria-hidden="true" data-el data-fill style="${place(o)};background:${colour(o.colour ?? 'accent')}${o.rot ? `;transform:rotate(${P(o.rot, 'rot')}deg)` : ''}${o.skew ? `;transform:rotate(${P(o.rot ?? 0, 'rot')}deg) skewX(${P(o.skew, 'skew')}deg)` : ''}"></i>`;
  // A filled bar in the flow of a group (an accent tick between a headline and its sub).
  c.flowBlock = (o) => `<i class="k-flow k-block" aria-hidden="true" data-el data-fill style="display:block;flex:none;${o.w === 'fill' ? 'align-self:stretch' : `width:${P(o.w, 'w')}px`};height:${P(o.h, 'h')}px;${o.dotted ? dots({ weight: o.h, colour: o.colour ?? 'accent' }, false) : `background:${colour(o.colour ?? 'accent')}`}${o.nudge ? `;${nudgeCss(o.nudge)}` : ''}"></i>`;
  // The folio at a place (right-aligned at x1 when align is right).
  c.folioMark = (o) => !folio.n ? '' : c.type({ role: 'folio', family: o.family ?? 'label', html: c.folioText(), size: o.size ?? tokens.type.label.size, lead: 1.2, track: o.track ?? tokens.type.label.track, weight: o.weight ?? tokens.type.label.weight, upper: o.upper ?? tokens.type.label.upper !== false, colour: o.colour ?? 'muted', nowrap: true, num: o.num ?? 'lnum', ...o });
  // A vertical label running up the page (rotated 90 degrees counter-clockwise), its box starting at (x, y) and reading upward;
  // down: true turns it the other way, reading downward from (x, y) with its line box inside the margin.
  c.verticalLabel = (o) => {
    const L = tokens.type.label, body = o.html !== undefined ? safe(o.html, 'html') : esc(o.text ?? '');
    if (!body) return '';
    return `<div class="abs k-t k-vlabel${o.down ? ' k-vdown' : ''}" data-el data-role="label" data-grid="skip" style="${place({ x: o.x, y: o.y })};font-family:${c.fontVar('label')};font-size:${P(L.size, 'size')}px;line-height:1.2;letter-spacing:${P(L.track, 'track')}em;font-weight:${P(L.weight, 'weight')};text-transform:uppercase;color:${colour(o.colour ?? 'muted')};white-space:nowrap">${body}</div>`;
  };
  // A sticker: a circle or a pill carrying short words, turned by rot degrees. grid is skipped (it is a rotated element).
  c.sticker = (o) => {
    const shape = o.shape === 'pill' ? 'pill' : 'circle', body = o.html !== undefined ? safe(o.html, 'html') : esc(o.text ?? '');
    if (!body) return '';
    const sz = n(o.size, 'size');
    const dims = shape === 'circle' ? { w: sz, h: sz } : { w: o.w ?? sz * 2, h: sz };
    const css = [place({ x: o.x, y: o.y, right: o.right, bottom: o.bottom, ...dims }), `background:${colour(o.fill ?? 'accent')}`, `color:${colour(o.ink ?? 'on-accent')}`, `transform:rotate(${P(o.rot ?? 0, 'rot')}deg)`,
      `font-family:${c.fontVar(o.family ?? 'display')}`, `font-size:${P(o.fontSize ?? sz / 5, 'fontSize')}px`, `line-height:${P(o.lead ?? 1, 'lead')}`, o.weight !== undefined ? `font-weight:${P(o.weight, 'weight')}` : ''].filter(Boolean).join(';');
    return `<div class="abs k-sticker k-${shape}" data-el data-fill data-grid="skip" style="${css}"><span data-role="${o.role ?? 'label'}" data-grid="skip">${body}</span></div>`;
  };
  // The highlight bar behind an emphasis phrase: wraps Markup in a span the direction's css paints.
  c.highlight = (html) => new Markup(`<span class="k-hl">${safe(html, 'html')}</span>`);
  // The brand's name repeated at low opacity, as a texture: rows of the name in the direction's display face over a box.
  // sep: what stands between the repeats (default " — "); altItalic: every second row in italics; track: letter spacing in em;
  // fadeFrom: with fade, the percentage of the box's height where the texture starts to fade out (default 45).
  c.wordmarkPattern = (o) => {
    const rows = Math.max(1, Math.round(n(o.h, 'h') / (n(o.size, 'size') * (o.lead ?? 1.05))));
    const sep = esc(o.sep ?? ' — ');
    const row = (i) => `<span class="k-wm-row" style="margin-left:${P(-(i % 2) * (o.shift ?? o.size * 2), 'shift')}px${o.altItalic && i % 2 ? ';font-style:italic' : ''}">${`${esc(brandName)}${sep}`.repeat(o.repeat ?? 8)}</span>`;
    const from = o.fade && o.fadeFrom !== undefined ? Math.min(95, Math.max(0, n(o.fadeFrom, 'fadeFrom'))) : null;
    const mask = from === null ? '' : `;-webkit-mask-image:linear-gradient(to bottom,#000 ${P(from, 'fadeFrom')}%,transparent 100%);mask-image:linear-gradient(to bottom,#000 ${P(from, 'fadeFrom')}%,transparent 100%)`;
    return `<div class="abs k-wm${o.fade && from === null ? ' k-wm-fade' : ''}" aria-hidden="true" data-el data-deco style="${place({ x: o.x, y: o.y, w: o.w, h: o.h })};font-family:${c.fontVar(o.family ?? 'display')};font-size:${P(o.size, 'size')}px;line-height:${P(o.lead ?? 1.05, 'lead')};opacity:${P(o.opacity ?? 0.05, 'opacity')};color:${colour(o.colour ?? 'ink')}${o.weight ? `;font-weight:${P(o.weight, 'weight')}` : ''}${o.track !== undefined ? `;letter-spacing:${P(o.track, 'track')}em` : ''}${mask}">${Array.from({ length: rows }, (_, i) => row(i)).join('')}</div>`;
  };
  // A decorative glyph (a hanging opening quotation mark, a large ornament): texture, not type, so no role and no check reads it.
  // text: the glyph (escaped); positioned like type (x, y, right, bottom in px, in the nearest positioned box); size, lead, colour, family.
  c.glyph = (o) => `<span class="abs k-glyph${variantOf(tokens, o.variant) ? ` ${variantOf(tokens, o.variant)}` : ''}" aria-hidden="true" data-el data-deco style="${place(o)};font-family:${c.fontVar(o.family ?? 'display')};font-size:${P(o.size, 'size')}px;line-height:${P(o.lead ?? 1, 'lead')};color:${colour(o.colour ?? 'accent')};font-weight:${P(o.weight ?? 300, 'weight')};white-space:nowrap${o.z !== undefined ? `;z-index:${P(o.z, 'z')}` : ''}${o.stretch !== undefined ? `;font-stretch:${n(o.stretch, 'stretch')}%` : ''}${o.textShadow ? `;${shadowCss(o.textShadow)}` : ''}">${esc(o.text ?? '')}</span>`;
  // A date line ("12 Dec · 6pm · The roastery") read as a date tile: { line, count, first, day, month } as Markup, every piece escaped from the
  // raw text here (never a split of already-built markup). day and month are set only when the first piece looks like a date ("12 Dec",
  // "Sat 12 December", "Dec 12": one or two digits and a month name, kept to three letters); otherwise they are null and `first` is the piece.
  c.dateParts = (f = 'meta', sep = '·') => {
    const raw = typeof spec[f] === 'string' ? spec[f].split(sep).map((t) => t.trim()).filter(Boolean) : [], first = raw[0] ?? '';
    const dm = /^(?:[A-Za-z]{3,9}\.?,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?$/.exec(first), md = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(first);
    const day = dm ? dm[1] : md ? md[2] : null, month = dm ? dm[2].slice(0, 3) : md ? md[1].slice(0, 3) : null;
    return { count: raw.length, line: new Markup(raw.map(esc).join(' \u00B7 ')), first: new Markup(esc(first)), day: day === null ? null : new Markup(esc(day)), month: month === null ? null : new Markup(esc(month)) };
  };
  // The pieces of a field split at a separator (a meta line "12 Dec · 6pm · The roastery"), trimmed and escaped, as Markup.
  c.parts = (f, sep = '·') => (typeof spec[f] === 'string' ? spec[f].split(sep).map((t) => t.trim()).filter(Boolean).map((t) => new Markup(esc(t))) : []);
  // A numeral set as large as the width allows (runtime.mjs fitLines sizes it): its baseline at base, the left edge bleeding by
  // lx em, the right edge held at right, never smaller than min. unit (Markup, optional) sits at the numeral's top right at unitSize
  // (an accent role, italic), or under its baseline from x when it does not fit beside it. o: base, size, min, right, x, html, unit,
  // unitSize, lx (default 0.07), colour, unitColour, track, weight, cap (the numeral's cap height in em, default 0.7).
  c.numeral = (o) => {
    const D = tokens.type.display, body = safe(o.html, 'html'), size = n(o.size, 'size');
    const common = `font-family:${c.fontVar(o.family ?? 'display')};line-height:1;white-space:nowrap`;
    const num = `<span class="k-t k-numeral-n" data-role="stat" data-grid="skip" data-bleed="left" data-fitnum style="display:inline-block;${common};font-size:${P(size, 'size')}px;letter-spacing:${P(o.track ?? -0.045, 'track')}em;font-weight:${P(o.weight ?? D.weight, 'weight')};color:${colour(o.colour ?? 'ink')}">${body}</span>`;
    const unit = o.unit === undefined || o.unit === null ? '' : `<span class="k-t k-numeral-u" data-role="accent" data-grid="skip" data-fitunit style="position:absolute;left:0;top:0;${common};font-size:${P(o.unitSize ?? 36, 'unitSize')}px;font-style:italic;font-weight:${P(o.weight ?? D.weight, 'weight')};color:${colour(o.unitColour ?? 'accent-type')}">${safe(o.unit, 'unit')}</span>`;
    return `<div class="abs k-numeral" data-el data-fitwidth data-size="${P(size, 'size')}" data-min="${P(o.min ?? size / 3, 'min')}" data-right="${P(o.right, 'right')}" data-x="${P(o.x, 'x')}" data-base="${P(o.base, 'base')}" data-lx="${P(o.lx ?? 0.07, 'lx')}" data-cap="${P(o.cap ?? 0.7, 'cap')}" data-asc="${P(o.asc ?? 0.86, 'asc')}" style="left:0;top:0;${common};font-size:${P(size, 'size')}px">${num}${unit}</div>`;
  };
  // A seal: a keyline circle of `size` px at (x, y) with a second ring inside it and, between the two, the brand's name set round
  // the circle in small capitals (decoration). ring: Markup of the words to repeat round it (default the brand's name).
  c.seal = (o) => {
    const sz = n(o.size, 'size'), fs = n(o.ringSize ?? tokens.type.label.size, 'ringSize'), r = sz / 2 - 12 - fs * 0.75, inner = r - 14;
    const phrase = o.ring ? safe(o.ring, 'ring') : esc(brandName), plain = String(phrase).replace(/&[a-z#0-9]+;/g, 'x').length + 3;
    const circ = 2 * Math.PI * r, reps = Math.max(1, Math.round(circ / (fs * 0.85) / plain));
    const text = `${phrase} · `.repeat(reps);
    const path = `M ${P(sz / 2, 'cx')} ${P(sz / 2 - r, 'top')} a ${P(r, 'r')} ${P(r, 'r')} 0 1 1 0 ${P(2 * r, 'd')} a ${P(r, 'r')} ${P(r, 'r')} 0 1 1 0 ${P(-2 * r, 'd')}`;
    const t = tokens.type.label;
    return `<div class="abs k-seal" aria-hidden="true" data-el data-fill data-grid="skip" style="${place({ x: o.x, y: o.y, w: sz, h: sz })};border:${P(o.keyline ?? 1, 'keyline')}px solid ${colour(o.colour ?? 'ink')};border-radius:50%;box-sizing:border-box">`
      + `<i class="abs" style="left:${P(sz / 2 - inner - 1, 'l')}px;top:${P(sz / 2 - inner - 1, 't')}px;width:${P(2 * inner, 'w')}px;height:${P(2 * inner, 'h')}px;border:1px solid ${colour(o.ringColour ?? 'gold')};border-radius:50%;box-sizing:border-box"></i>`
      + `<svg class="abs" data-deco width="${P(sz, 'w')}" height="${P(sz, 'h')}" viewBox="0 0 ${P(sz, 'w')} ${P(sz, 'h')}" style="left:-1px;top:-1px;overflow:visible"><path id="k-seal-path" d="${path}" fill="none"/><text style="font-family:${c.fontVar('label')};font-size:${P(fs, 'fs')}px;font-weight:${P(t.weight, 'weight')};letter-spacing:${P(t.track, 'track')}em;text-transform:uppercase;fill:${colour(o.colour ?? 'ink')}"><textPath href="#k-seal-path" textLength="${P(circ - fs * 0.4, 'len')}" lengthAdjust="spacing">${text}</textPath></text></svg></div>`;
  };
  // The frame: a solid border of thickness t on all four sides in a palette colour (it counts as fill, and text is never set on it).
  c.frame = (o) => { const t = P(o.t, 't'); return `<i class="abs k-frame" aria-hidden="true" data-el data-fill style="inset:0;border:${t}px solid ${colour(o.colour ?? 'field')}"></i>`; };
  // A keyline: a thin border box (the double border of an invitation).
  c.keyline = (o) => `<i class="abs k-keyline" aria-hidden="true" data-el data-fill style="${place(o)};border:${P(o.weight ?? 1, 'weight')}px solid ${colour(o.colour ?? 'rule')}${o.radius !== undefined ? `;border-radius:${radiusCss(o.radius)}` : ''}"></i>`;

  // ---- the picture: the spec's image, art-directed ----
  // o: x, y, w, h; shape: rect | circle | arch | rounded; radius (rounded); treat: a list of 'grey' | 'multiply' | 'grain';
  // tint: palette colour for multiply. The brand's own photo treatment (tint, duotone, overlay) still applies (.ph).
  c.photo = (o) => {
    if (!c.hasImage) return '';
    const shape = ['rect', 'circle', 'arch', 'rounded', 'oval', 'pill'].includes(o.shape) ? o.shape : 'rect', treat = Array.isArray(o.treat) ? o.treat : [];
    for (const t of treat) if (!['grey', 'multiply', 'grain', 'punch'].includes(t)) throw new Error(`design kit: photo treatment "${t}"`);
    const fo = POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%';
    const zoom = Number.isFinite(Number(spec.zoom)) ? Math.min(3, Math.max(1, Number(spec.zoom))) : 1;
    const tr = zoom > 1 ? `;transform:scale(${px(zoom)});transform-origin:${fo}` : '';
    const radius = shape === 'arch' ? `border-radius:${P(o.w / 2, 'w')}px ${P(o.w / 2, 'w')}px 0 0` : shape === 'circle' || shape === 'oval' ? 'border-radius:50%' : shape === 'pill' ? 'border-radius:999px' : shape === 'rounded' ? `border-radius:${P(o.radius ?? 24, 'radius')}px` : '';
    const classes = ['abs', 'ph', 'k-photo', ...treat.map((t) => `k-${t}`)].join(' ');
    // blend: 'ground' | 'fade': the top edge fades into the page over `fade` px (a fixed mask); 'ground' also lets the page take the picture's own
    // plain edge colour (runtime.mjs ready(): the picture is read as shown, as the classic poster layouts do)
    if (o.blend !== undefined && !['ground', 'fade'].includes(o.blend)) throw new Error('design kit: blend must be ground or fade');
    const fadeCss = o.blend ? (() => { const f = P(o.fade ?? 160, 'fade'); if (f < 0 || f > 400) throw new Error('design kit: fade must be from 0 to 400 px'); return f > 0 ? `;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 ${f}px);mask-image:linear-gradient(to bottom,transparent 0,#000 ${f}px)` : ''; })() : '';
    return `<div class="${classes}" data-el${o.blend ? ` data-blend="${o.blend}"` : ''} style="${place(o)}${fadeCss}${o.z !== undefined ? `;z-index:${P(o.z, 'z')}` : ''}${radius ? `;${radius}` : ''}${o.soft !== undefined ? `;box-shadow:${softCss(o.soft)}` : ''}"><img data-user${o.blend === 'ground' ? ' data-bsample' : ''} data-name="${esc(spec.image)}" data-fit="cover" src="${args.image(spec.image)}" alt="" style="object-position:${fo}${tr}">${treat.includes('multiply') ? `<i class="k-mul" style="background:${colour(o.tint ?? 'primary')}"></i>` : ''}${treat.includes('grain') ? '<i class="k-gr"></i>' : ''}</div>`;
  };
  // One picture of a row of round pictures (c.gallery()), in the flow of its row: a circle of d px, cropped to cover from the centre, read as
  // every picture is (img[data-user]: its enlargement is checked). o: d, image (a path c.gallery() gave), treat, tint, ring { w, colour }, soft.
  c.galleryPhoto = (o) => {
    const p = typeof o.image === 'string' && Array.isArray(spec.gallery) && spec.gallery.some((g) => g && g.image === o.image) ? o.image : null;
    if (!p) throw new Error('design kit: galleryPhoto shows a picture of the post\'s gallery');
    const treat = Array.isArray(o.treat) ? o.treat : [];
    for (const t of treat) if (!['grey', 'multiply', 'grain', 'punch'].includes(t)) throw new Error(`design kit: photo treatment "${String(t).slice(0, 20)}"`);
    const d = P(o.d, 'd'), shadows = [];
    if (o.ring) shadows.push(`0 0 0 ${P(o.ring.w, 'ring')}px ${colour(o.ring.colour)}`);
    if (o.soft !== undefined) shadows.push(softCss(o.soft));
    return `<div class="k-flow ph k-photo k-round${treat.map((t) => ` k-${t}`).join('')}" data-el style="width:${d}px;height:${d}px;border-radius:50%;flex:none${shadows.length ? `;box-shadow:${shadows.join(',')}` : ''}"><img data-user data-name="${esc(p)}" data-fit="cover" src="${args.image(p)}" alt="" style="object-position:50% 50%">${treat.includes('multiply') ? `<i class="k-mul" style="background:${colour(o.tint ?? 'primary')}"></i>` : ''}${treat.includes('grain') ? '<i class="k-gr"></i>' : ''}</div>`;
  };
  // ---- a chart of the post's numbers (chart.mjs chartLayout), as inline SVG built from numbers only, its words as text in cells ----
  // o: x, y, w, h (or flow: true with w and h), kind (one of CHART_KINDS), colours { mark, highlight, track, grid } (palette roles), axis
  // (none | baseline | grid), values / labels (show the values / the points' labels), radius (bar corners), stroke (a line's width), thickness
  // (a bar's, a ring's or a progress bar's), trim (a line's axis may start near its data, never a bar's), marks (a line's dots: none | end |
  // minmax | all), labelSize / valueSize (px), labelFamily / valueFamily (font roles), labelWeight / valueWeight, labelInk / valueInk, upper,
  // track (letter spacing, em), z, nudge, alignSelf. The number format is the brand's (brand.numbers, chart.mjs numberFormat).
  // The marks are decoration (data-deco, no text); every word is a run with a role in a cell (data-cell) as large as chartLayout made room for,
  // so the fit check refuses a label that runs out of it and the contrast check reads the pixels under each one, bars and lines included.
  // The wrapper (data-chart) is measured against everything in it: a mark or a word outside the box is refused (checks.mjs, kind "chart").
  c.chart = () => chartOf(spec.chart);
  c.chartSvg = (o) => {
    const data = chartOf(spec.chart);
    if (!data) return '';
    const kind = o.kind;
    if (!CHART_KINDS.includes(kind)) throw new Error('design kit: chart kind');
    if (o.axis !== undefined && !CHART_AXES.includes(o.axis)) throw new Error('design kit: chart axis');
    if (o.marks !== undefined && !CHART_MARKS.includes(o.marks)) throw new Error('design kit: chart marks');
    if (o.trim && !LINE_KINDS.includes(kind)) throw new Error('design kit: only a line chart may trim its axis');
    const w = n(o.w, 'w'), h = n(o.h, 'h');
    if (w < 40 || h < 24 || w > 1400 || h > 1400) throw new Error('design kit: a chart is 40 to 1400 px wide and 24 to 1400 px tall');
    const bounded = (v, lo, hi, what, d) => { if (v === undefined) return d; n(v, what); if (v < lo || v > hi) throw new Error(`design kit: chart ${what} must be from ${lo} to ${hi}`); return v; };
    const stroke = bounded(o.stroke, 1, 16, 'stroke', 4), radius = bounded(o.radius, 0, 40, 'radius', 0), thickness = o.thickness === undefined ? undefined : bounded(o.thickness, 2, 200, 'thickness');
    const labelSize = bounded(o.labelSize, 12, 80, 'labelSize', 24), valueSize = bounded(o.valueSize, 12, 200, 'valueSize', 28);
    const labelW = o.labelW === undefined ? undefined : bounded(o.labelW, 20, 700, 'labelW'), valueW = o.valueW === undefined ? undefined : bounded(o.valueW, 20, 700, 'valueW');
    const share = kind === 'donut' || kind === 'progress';
    const showLabels = !!o.labels && data.labels.some(Boolean) && kind !== 'spark' && kind !== 'donut', showValues = !!o.values && kind !== 'spark';
    const lineH = (s) => Math.ceil(s * 1.25) + 2;
    const hi = highlightIndex(data.values, data.highlight);
    const L = chartLayout({ kind, values: data.values, total: data.total, w, h, trim: !!o.trim, stroke, thickness, radius, labelH: showLabels ? lineH(labelSize) : 0, valueH: showValues ? lineH(valueSize) : 0, marks: o.marks ?? 'none', highlight: hi, labelW, valueW });
    const col = { mark: o.colours?.mark ?? 'primary', highlight: o.colours?.highlight ?? o.colours?.mark ?? 'accent', track: o.colours?.track ?? 'rule-soft', grid: o.colours?.grid ?? 'rule' };
    for (const v of Object.values(col)) colour(v);
    const paths = [];
    // a mark that carries the data (a bar, a progress bar's fill, a donut's share, a line and its dots) is tagged data-mark with what it is, a
    // fixed word: the page measures it against the surface behind it (WCAG 1.4.11, 3:1); the grid, the baseline, a track and an area's
    // light fill are not data marks
    const fillP = (d, c0, extra = '', mark = '') => paths.push(`<path${mark ? ` data-mark="${mark}"` : ''} d="${d}" style="fill:${colour(c0)}${extra}"></path>`);
    const strokeP = (d, c0, sw, cap = 'round', extra = '', mark = '') => paths.push(`<path${mark ? ` data-mark="${mark}"` : ''} d="${d}" style="fill:none;stroke:${colour(c0)};stroke-width:${px(sw)}px;stroke-linecap:${cap};stroke-linejoin:round${extra}"></path>`);
    const axis = o.axis ?? 'baseline';
    if (axis === 'grid') for (const g of L.grid ?? []) strokeP(g.vertical ? `M${px(g.x)} ${px(g.y0)}V${px(g.y1)}` : `M${px(g.x0)} ${px(g.y)}H${px(g.x1)}`, col.grid, 1, 'butt', ';opacity:0.5');
    if (L.bars) for (const b of L.bars) if (b.w >= 0.5 && b.h >= 0.5) fillP(roundRect(b.x, b.y, b.w, b.h, b.r, kind === 'hbar' ? (b.neg ? 'left' : 'right') : (b.neg ? 'bottom' : 'top')), b.i === hi ? col.highlight : col.mark, '', 'bar');
    if (L.track) { fillP(roundRect(L.track.x, L.track.y, L.track.w, L.track.h, L.track.r, 'all'), col.track); if (L.bar.w > 0.5) fillP(roundRect(L.bar.x, L.bar.y, L.bar.w, L.bar.h, L.bar.r, 'all'), col.highlight, '', 'fill'); }
    if (L.ring) { const R = L.ring; strokeP(circlePath(R.cx, R.cy, R.r), col.track, R.t, 'butt'); if (R.share > 0) strokeP(arcPath(R.cx, R.cy, R.r, R.share), col.highlight, R.t, radius > 0 && R.share < 0.9999 ? 'round' : 'butt', '', 'arc'); }
    if (L.points) {
      const line = L.points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x)} ${px(p.y)}`).join('');
      if (kind === 'area') fillP(`${line}L${px(L.points[L.points.length - 1].x)} ${px(L.floor)}L${px(L.points[0].x)} ${px(L.floor)}Z`, col.mark, ';opacity:0.18');
      strokeP(line, col.mark, stroke, 'round', '', 'line');
      const mk = o.marks ?? 'none', vs = data.values, mx = vs.indexOf(Math.max(...vs)), mn = vs.indexOf(Math.min(...vs));
      const dotted = new Set(mk === 'all' ? vs.map((_, i) => i) : mk === 'end' ? [vs.length - 1] : mk === 'minmax' ? [mn, mx, vs.length - 1] : []);
      // the highlighted point and the point whose value is written always carry a dot, in the highlight colour
      if (hi >= 0) dotted.add(hi);
      if (L.valueAt !== undefined) dotted.add(L.valueAt);
      const lit = (i) => i === hi || i === L.valueAt || (hi < 0 && L.valueAt === undefined && i === vs.length - 1);
      if (L.dot > 0) for (const i of [...dotted].sort((a, b) => a - b)) { const p = L.points[i]; fillP(circlePath(p.x, p.y, L.dot), lit(i) ? col.highlight : col.mark, '', 'dot'); }
    }
    if (axis !== 'none' && L.base && !share) strokeP(L.base.vertical ? `M${px(L.base.x)} ${px(L.base.y0)}V${px(L.base.y1)}` : `M${px(L.base.x0)} ${px(L.base.y)}H${px(L.base.x1)}`, col.grid, 2, 'butt');
    const svg = `<svg class="abs k-chart-s" data-deco aria-hidden="true" width="${px(w)}" height="${px(h)}" viewBox="0 0 ${px(w)} ${px(h)}" style="left:0;top:0">${paths.join('')}</svg>`;
    // the words: labels and values in cells, each the size chartLayout made room for
    const fmt = formatAll([...data.values, ...(data.total !== null ? [data.total] : [])], { unit: data.unit, numbers: brand.numbers });
    const fam = (f, d) => { const v = f ?? d; if (!FAMILIES.includes(v)) throw new Error('design kit: chart font'); return v; };
    const words = (L.labels ?? []).map((l) => {
      const isValue = l.what === 'value';
      const text = isValue ? (kind === 'progress' ? `${fmt(data.values[0])} / ${fmt(data.total)}` : kind === 'donut' ? (data.unit === 'percent' && data.total === 100 ? fmt(data.values[0]) : `${Math.round((data.values[0] / data.total) * 100)}%`) : fmt(data.values[l.i])) : data.labels[l.i];
      if (!text) return '';
      const run = c.run({
        html: new Markup(isValue ? esc(text) : text), role: isValue ? 'meta' : 'label', family: fam(isValue ? o.valueFamily : o.labelFamily, 'label'), size: isValue ? valueSize : labelSize, lead: 1.2,
        weight: isValue ? o.valueWeight : o.labelWeight, track: isValue ? o.valueTrack : o.track, upper: !isValue && o.upper ? true : undefined, colour: isValue ? o.valueInk ?? 'ink' : o.labelInk ?? 'body', nowrap: true,
      });
      return boxEl({ x: l.x, y: l.y, w: l.w, h: l.h, cell: true, flex: 'row', align: 'center', justify: l.align === 'right' ? 'end' : l.align === 'center' ? 'center' : undefined, skipGrid: true }, run);
    }).join('');
    const css = o.flow ? [`width:${px(w)}px`, `height:${px(h)}px`, 'flex:none', flexCss({ alignSelf: o.alignSelf }), nudgeCss(o.nudge)].filter(Boolean).join(';') : [place({ x: o.x, y: o.y, right: o.right, bottom: o.bottom, w, h }), o.z !== undefined ? `z-index:${P(o.z, 'z')}` : ''].filter(Boolean).join(';');
    return `<div class="${o.flow ? 'k-flow' : 'abs'} k-chart" data-el data-chart data-fill data-grid="skip" style="${css}">${svg}${words}</div>`;
  };
  // The post's portrait picture (spec.avatar), in the flow of its parent: a square of d px cropped to cover round its focal point (spec.avatarFocalCss,
  // checked against the position pattern again here), round (circle), with rounded corners (rounded: a fixed share of its side) or square, read as
  // every picture is (img[data-user]: its enlargement is checked). o: d, shape, treat, tint, ring { w, colour }, soft, nudge, alignSelf.
  c.avatarPhoto = (o) => {
    if (!c.hasAvatar) return '';
    const shape = o.shape ?? 'circle';
    if (!Object.hasOwn(AVATAR_SHAPES, shape)) throw new Error('design kit: an avatar is a circle, rounded or square');
    const treat = Array.isArray(o.treat) ? o.treat : [];
    for (const t of treat) if (!['grey', 'multiply', 'grain', 'punch'].includes(t)) throw new Error('design kit: avatar treatment');
    const d = P(o.d, 'd');
    if (d < 40 || d > 600) throw new Error('design kit: an avatar is 40 to 600 px across');
    const radius = shape === 'rounded' ? `${px(Math.round(d * 0.22))}px` : AVATAR_SHAPES[shape];
    const fo = POSITION.test(spec.avatarFocalCss ?? '') ? spec.avatarFocalCss : '50% 50%', shadows = [];
    if (o.ring) shadows.push(`0 0 0 ${P(o.ring.w, 'ring')}px ${colour(o.ring.colour)}`);
    if (o.soft !== undefined) shadows.push(softCss(o.soft));
    const p = spec.avatar.image, extra = [nudgeCss(o.nudge), flexCss({ alignSelf: o.alignSelf })].filter(Boolean).join(';');
    return `<div class="k-flow ph k-photo k-avatar${treat.map((t) => ` k-${t}`).join('')}" data-el style="width:${d}px;height:${d}px;border-radius:${radius};flex:none${shadows.length ? `;box-shadow:${shadows.join(',')}` : ''}${extra ? `;${extra}` : ''}"><img data-user data-name="${esc(p)}" data-fit="cover" src="${args.image(p)}" alt="" style="object-position:${fo}">${treat.includes('multiply') ? `<i class="k-mul" style="background:${colour(o.tint ?? 'primary')}"></i>` : ''}${treat.includes('grain') ? '<i class="k-gr"></i>' : ''}</div>`;
  };
  // A device round the post's picture (primitives/device.mjs works out the geometry): the body of g.w x g.h px at (x, y), its finish a class of
  // kit.css (light, dark, brand: the palette's primary), the screen inside its bezel with its own corner radius clipping the screenshot (cover
  // round the focal point, then the zoom), the camera island or notch and the side buttons, every one of them whole pixels checked here. The
  // whole turns by tilt degrees (within 9) and lifts on a soft shadow (a fixed preset). The screenshot is a user image marked data-device: the
  // runtime reads its corners, and a capture with the device already drawn into it (see-through corners) is shown whole and the drawn frame
  // is hidden (data-framed), so it is never framed twice.
  c.device = (o) => {
    if (!c.hasImage) return '';
    const g = o.geometry;
    if (!g || typeof g !== 'object' || !g.screen) throw new Error('design kit: a device needs its geometry');
    if (!Object.hasOwn(DEVICE_FINISH, o.finish ?? 'dark')) throw new Error('design kit: a device finish is light, dark or brand');
    if (!['phone', 'tablet'].includes(o.model ?? 'phone')) throw new Error('design kit: a device is a phone or a tablet');
    const tilt = o.tilt ?? 0;
    if (!Number.isFinite(tilt) || Math.abs(tilt) > 9) throw new Error('design kit: a device turns at most 9 degrees');
    const whole = (v, what, lo, hi) => { const q = n(v, what); if (!Number.isInteger(q) || q < lo || q > hi) throw new Error(`design kit: a device's ${what} must be whole pixels from ${lo} to ${hi}`); return q; };
    const bw = whole(g.w, 'width', 160, 1400), bh = whole(g.h, 'height', 160, 2000), s = g.screen;
    const sc = { x: whole(s.x, 'bezel', 0, 200), y: whole(s.y, 'bezel', 0, 200), w: whole(s.w, 'screen width', 40, 1400), h: whole(s.h, 'screen height', 40, 2000), r: whole(s.radius, 'screen radius', 0, 400) };
    const r = whole(g.radius, 'radius', 0, 400);
    const fo = POSITION.test(spec.focalCss ?? '') ? spec.focalCss : '50% 50%';
    const zoom = Number.isFinite(Number(spec.zoom)) ? Math.min(3, Math.max(1, Number(spec.zoom))) : 1;
    const tr = zoom > 1 ? `;transform:scale(${px(zoom)});transform-origin:${fo}` : '';
    const btns = (Array.isArray(g.buttons) ? g.buttons : []).slice(0, 6).map((b) => `<i class="abs k-dev-btn" aria-hidden="true" data-deco style="left:${whole(b.x, 'button x', -20, 1420)}px;top:${whole(b.y, 'button y', 0, 2000)}px;width:${whole(b.w, 'button width', 1, 20)}px;height:${whole(b.h, 'button height', 4, 400)}px"></i>`).join('');
    let cut = '';
    if (g.cut) {
      if (!['island', 'notch'].includes(g.cut.kind)) throw new Error('design kit: a device camera is an island or a notch');
      cut = `<i class="abs k-dev-cut k-dev-${g.cut.kind}" aria-hidden="true" data-deco style="left:${whole(g.cut.x, 'camera x', 0, 1400)}px;top:${whole(g.cut.y, 'camera y', 0, 400)}px;width:${whole(g.cut.w, 'camera width', 8, 800)}px;height:${whole(g.cut.h, 'camera height', 4, 200)}px${g.cut.kind === 'notch' ? `;border-radius:0 0 ${whole(Math.round(g.cut.h * 0.6), 'camera corner', 2, 120)}px ${whole(Math.round(g.cut.h * 0.6), 'camera corner', 2, 120)}px` : ''}"></i>`;
    }
    const css = [place({ x: o.x, y: o.y, w: bw, h: bh }), tilt ? `transform:rotate(${px(tilt)}deg)` : '', o.soft !== undefined ? `filter:${softDevice(o.soft)}` : '', o.z !== undefined ? `z-index:${P(o.z, 'z')}` : ''].filter(Boolean).join(';');
    return `<div class="abs k-dev k-dev-${o.model ?? 'phone'}" data-el data-grid="skip"${tilt ? ` data-tilt="${px(tilt)}"` : ''} style="${css}">${btns}`
      + `<div class="abs k-dev-body ${DEVICE_FINISH[o.finish ?? 'dark']}" data-el data-fill style="inset:0;border-radius:${r}px">`
      + `<div class="abs k-photo k-dev-screen" data-el style="left:${sc.x}px;top:${sc.y}px;width:${sc.w}px;height:${sc.h}px;border-radius:${sc.r}px"><img data-user data-device data-name="${esc(spec.image)}" data-fit="cover" src="${args.image(spec.image)}" alt="" style="object-position:${fo}${tr}"></div>`
      + `${cut}</div></div>`;
  };
  // A framed print: the picture inset in a paper border with a keyline, and a caption strip beneath. The outer box is (x, y, w, h);
  // border px of paper; caption: Markup placed under the picture inside the border (kept to the label size).
  c.print = (o) => {
    if (!c.hasImage) return '';
    const b = n(o.border ?? 28, 'border'), cap = n(o.caption ?? 0, 'caption');
    const inner = { x: o.x + b, y: o.y + b, w: o.w - 2 * b, h: o.h - 2 * b - cap };
    return `<div class="abs k-printmat" data-el data-fill style="${place(o)};background:${colour(o.paper ?? 'paper')};box-shadow:0 0 0 ${P(o.keyline ?? 1, 'keyline')}px ${colour(o.keylineColour ?? 'rule')} inset"></div>`
      + c.photo({ ...inner, shape: 'rect', treat: o.treat ?? [] })
      + (o.inner === false ? '' : `<i class="abs k-keyline" aria-hidden="true" style="${place(inner)};box-shadow:0 0 0 ${P(o.keyline ?? 1, 'keyline')}px ${colour(o.keylineColour ?? 'rule')}"></i>`);
  };

  // ---- the brand's logo: only when the brand switched it on (style.logo set to a corner) and, for a look, the look says `corner` (logo.default) ----
  c.logoHtml = () => {
    if (tokens.logoOn === false) return '';
    const corner = tokens.logoCorner ?? brand.style?.logo;
    if (!brand.logos) return '';
    if (!['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(corner)) return '';
    const h = tokens.logoHeight ?? 44, [fw, fh] = brand.logos.fullSize, k = h / fh;
    const right = corner.endsWith('right'), bottom = corner.startsWith('bottom');
    const darkPage = Boolean(c.dark ?? comp?.dark), dark = darkPage || Boolean(c.blendPage);
    const pos = [right ? `right:${P(mg.right, 'margin')}px` : `left:${P(mg.left, 'margin')}px`, bottom ? `bottom:${P(mg.bottom, 'margin')}px` : `top:${P(mg.top, 'margin')}px`].join(';');
    const inner = dark
      ? `<span class="logo-inv ly-logo${darkPage ? '' : ' logo-ink'}" style="height:${P(h, 'h')}px"><img src="${brand.logoMarkSrc}" alt="" style="height:${P(h, 'h')}px"><i role="img" aria-label="${esc(brandName)}" style="height:${P(h, 'h')}px;background-size:auto ${P(h, 'h')}px;--lw:${P((fw - brand.logos.wordmarkFrom) * k, 'lw')}px;--lx:-${P(brand.logos.wordmarkFrom * k, 'lx')}px;--lm:${P(brand.logos.markGap * k, 'lm')}px"></i></span>`
      : `<img src="${brand.logoFullSrc}" alt="${esc(brandName)}" style="height:${P(h, 'h')}px;display:block">`;
    return `<div class="abs k-logo" data-avoid style="${pos}">${inner}</div>`;
  };

  // ======== additions for the retail direction (generic and neutrally named; any direction may use them) ========
  // A box: the generic container (flow: true puts it in the flow of its parent instead of at a place of its own; grow: a flex share,
  // with minH). o: x, y, w, h, right, bottom (px); minH (a minimum height); fill (palette colour; also counts as deliberate fill for the
  // emptiness check); ink (text colour inside); rot (degrees) with origin ('center', 'left bottom', ..., or 'x% y%'); shadow
  // { x, y, colour } (a hard offset shadow, no blur); ring { w, colour } (an outline ring outside the box); border { w, colour, style:
  // 'solid' | 'dashed' }; pad (px, or [top, right, bottom, left]); radius (px or 'full'); clip (a polygon [[x, y], ...] in px: the box shows only
  // inside it); slant (px: the box's top edge rises by this much from its left edge to its right, whatever its height); flex ('column' | 'row')
  // with justify, align, gap; z (z-index); unrot (the runtime holds it straight while it measures fitted lines); skipGrid; variant,
  // nudge, flexNone, alignSelf (see the top of this file). inner: markup the code made (other builders' output), never a spec word.
  const ORIGIN = /^(center|left bottom|left top|right bottom|right top|\d{1,3}% \d{1,3}%)$/;
  const padOf = (v) => (Array.isArray(v) ? v.map((q, i) => P(q, `pad ${i}`)).join('px ') : P(v, 'pad')) + 'px';
  // `base`: the kit's own classes for a builder that wraps this one (shape); never from a composition.
  const boxEl = (o, inner = '', base = '') => {
    const rot = Number(o.rot) || 0, shadows = [];
    if (o.ring) shadows.push(`0 0 0 ${P(o.ring.w, 'ring')}px ${colour(o.ring.colour)}`);
    if (o.shadow?.soft !== undefined) shadows.push(softCss(o.shadow.soft));
    else if (o.shadow) shadows.push(`${P(o.shadow.x ?? 0, 'shadow x')}px ${P(o.shadow.y ?? 0, 'shadow y')}px 0 ${colour(o.shadow.colour ?? 'ink')}`);
    if (o.origin !== undefined && !ORIGIN.test(o.origin)) throw new Error('design kit: box origin');
    if (o.border && !['solid', 'dashed'].includes(o.border.style ?? 'solid')) throw new Error('design kit: border style');
    if (o.slant !== undefined && (!Number.isFinite(o.slant) || o.slant < 0 || o.slant > 600)) throw new Error('design kit: slant must be from 0 to 600 px');
    if (o.fill && o.gradient) throw new Error('design kit: a box takes fill or a gradient, not both');
    const css = [place(o), o.minH !== undefined && o.grow === undefined ? `min-height:${P(o.minH, 'minH')}px` : '', o.fill ? `background:${colour(o.fill)}` : '', o.gradient ? `background:${gradientCss(o.gradient)}` : '', o.ink ? `color:${colour(o.ink)}` : '', rot ? `transform:rotate(${P(rot, 'rot')}deg)` : '', rot && o.origin ? `transform-origin:${o.origin}` : '',
      shadows.length ? `box-shadow:${shadows.join(',')}` : '', o.border ? `border:${P(o.border.w, 'border')}px ${o.border.style ?? 'solid'} ${colour(o.border.colour ?? 'ink')}` : '', o.pad !== undefined ? `padding:${padOf(o.pad)}` : '',
      o.radius !== undefined ? `border-radius:${radiusCss(o.radius, o.corners)}` : '',
      o.clip ? `clip-path:polygon(${o.clip.map(([px_, py]) => `${P(px_, 'clip x')}px ${P(py, 'clip y')}px`).join(',')})` : '',
      o.slant !== undefined ? `clip-path:polygon(0 ${P(o.slant, 'slant')}px,100% 0,100% 100%,0 100%)` : '',
      o.flex ? `display:flex;flex-direction:${o.flex === 'row' ? 'row' : 'column'};justify-content:${{ end: 'flex-end', center: 'center', between: 'space-between' }[o.justify] ?? 'flex-start'};align-items:${{ end: 'flex-end', center: 'center', stretch: 'stretch' }[o.align] ?? 'flex-start'}${o.gap ? `;gap:${P(o.gap, 'gap')}px` : ''}` : '',
      o.grow !== undefined ? `flex:${P(o.grow, 'grow')} 1 0;min-height:${P(o.minH ?? 0, 'minH')}px` : '',
      flexCss(o), nudgeCss(o.nudge),
      o.z !== undefined ? `z-index:${P(o.z, 'z')}` : ''].filter(Boolean).join(';');
    const v = variantOf(tokens, o.variant);
    // cell: the text inside must stay inside this box (the fit check's cell rule: an info value, a button's words)
    return `<div class="${o.flow ? 'k-flow' : 'abs'} k-box${base ? ` ${base}` : ''}${v ? ` ${v}` : ''}" data-el${o.cell ? ' data-cell' : ''}${o.fill || o.gradient ? ' data-fill' : ''}${o.unrot ? ' data-unrot' : ''}${rot ? ` data-tilt="${P(rot, 'rot')}"` : ''}${rot || o.skipGrid ? ' data-grid="skip"' : ''} style="${css}">${inner}</div>`;
  };
  c.box = (o, inner = '') => boxEl(o, inner);
  // A band: a full-width slab turned by rot degrees, wider than the page (overscan px each side) so its ends never show. y, h: where its
  // middle sits when straight; colour: a palette colour. inner: markup placed inside it (positions are inside the slab).
  c.band = (o, inner = '') => boxEl({ x: -n(o.overscan ?? 140, 'overscan'), y: o.y, w: W + 2 * (o.overscan ?? 140), h: o.h, fill: o.colour ?? 'paper', ink: o.ink, rot: o.rot, origin: o.origin ?? 'center', z: o.z, unrot: o.unrot, pad: o.pad, shadow: o.shadow }, inner);
  // A run of text inside a box or a shape (block level): like type(), but without a place of its own. o: html | text, role, size (scale: true
  // lets the fit loop shrink it), lead, weight, track, colour, upper, variant, nudge.
  c.run = (o) => {
    const body = o.html !== undefined ? safe(o.html, 'html') : esc(o.text ?? '');
    if (!body) return '';
    const rsize = o.steps !== undefined ? o.steps[0] : o.size;
    const sz = o.scale ? hs(n(rsize, 'size')) : `${P(rsize, 'size')}px`;
    const css = [`display:block`, `font-family:${c.fontVar(o.family ?? 'display')}`, `font-size:${sz}`, `line-height:${o.lead === undefined ? 1 : P(o.lead, 'lead')}`, o.track !== undefined ? `letter-spacing:${P(o.track, 'track')}em` : '',
      o.weight !== undefined ? `font-weight:${P(o.weight, 'weight')}` : '', o.colour ? `color:${colour(o.colour)}` : '', o.upper ? 'text-transform:uppercase' : '', o.nowrap ? 'white-space:nowrap' : '', shadowCss(o.textShadow), flexCss(o), nudgeCss(o.nudge),
      o.textAlign === 'center' || o.textAlign === 'right' ? `text-align:${o.textAlign}` : ''].filter(Boolean).join(';');
    const v = variantOf(tokens, o.variant);
    return `<span class="k-t k-run${v ? ` ${v}` : ''}${emphClass(o.emph)}${o.dfont ? ' k-dfont' : ''}" data-role="${ROLES.has(o.role ?? 'label') ? o.role ?? 'label' : 'label'}" data-el${o.scale ? ' data-scaled' : ''}${followAttr(o)}${stepAttrs(o)} data-grid="skip" style="${css}">${body}</span>`;
  };
  // A shape with centred content (a sticker): shape 'circle' | 'pill' | 'tile' | 'stamp' (a circle with a dashed ring inside it). size (circle,
  // stamp, tile: the side) or w and h; fill and ink (palette colours); rot; ring { w, colour } (a paper ring round it); shadow. inner: runs.
  // A pill or tile with no w is as wide as its content (a shape placed by right or x takes its content's width).
  c.shape = (o, inner = '') => {
    const shape = ['circle', 'pill', 'tile', 'stamp'].includes(o.shape) ? o.shape : 'circle', w = o.w ?? o.size, h = o.h ?? o.size;
    return boxEl({ x: o.x, y: o.y, right: o.right, bottom: o.bottom, w, h, flow: o.flow, variant: o.variant, nudge: o.nudge, flexNone: o.flexNone, alignSelf: o.alignSelf, fill: o.fill ?? 'gold', ink: o.ink ?? 'on-accent', rot: o.rot ?? 0, ring: o.ring, shadow: o.shadow, z: o.z, skipGrid: true,
      pad: o.pad, radius: shape === 'pill' ? 'full' : shape === 'tile' ? (o.radius ?? 28) : 'full' }, inner, `k-shape k-shape-${shape}`);
  };
  // A phrase repeated as outline rows (texture) around one solid row on a highlight bar, the whole filling the box (x, y, w, h): the
  // runtime sizes the rows to the width and adds as many as the height takes (rmin to rmax). pre: Markup of the repeated phrase;
  // html: Markup of the solid phrase (an <em data-role="accent"> from ctx.fmt or m``); cap, floor, lead, track as for fitLines.
  // h: 'auto' (with flow: true and grow: true in a column) takes the height the box's own flex slot measures at run time.
  c.echoStack = (o) => {
    const D = tokens.type.display, track = o.track ?? D.track, lead = o.lead ?? 1, auto = o.h === 'auto';
    const solid = c.fitLines({ flow: true, w: o.w, h: o.h, cap: o.cap, floor: o.floor, lead, track, max: 1, highlight: true, colour: o.colour, html: o.html });
    const outline = o.outline === undefined ? '' : `--k-ol:${P(o.outline, 'outline')}px`;
    const css = [auto ? '' : place({ x: o.x, y: o.y, w: o.w, h: o.h }), auto ? `width:${P(o.w, 'w')}px;flex:1 1 0;min-height:0` : '', outline, `font-family:${c.fontVar('display')}`, `font-weight:${P(o.weight ?? D.weight, 'weight')}`, nudgeCss(o.nudge)].filter(Boolean).join(';');
    return `<div class="${auto ? 'k-flow' : 'abs'} k-echo k-display" data-el data-fill data-echo data-w="${P(o.w, 'w')}" data-h="${auto ? 'auto' : P(o.h, 'h')}" data-cap="${P(o.cap, 'cap')}" data-rmin="${P(o.rmin ?? 3, 'rmin')}" data-rmax="${P(o.rmax ?? 7, 'rmax')}" data-track="${P(track, 'track')}" style="${css}">`
      + `<span data-pre style="display:none">${safe(o.pre, 'pre')}</span>${solid}</div>`;
  };
  // The brand colour's text-safe version and the on-colour are worked out in colour.mjs (palette roles field-text, on-field, on-accent).
  // Builders that need the brand, the grid and a page-wide colour scope (see the block at the end of this file): kitExtras().
  Object.assign(c, kitExtras(c, brand, spec));
  // No builder takes a free style, class or attribute string: a composition names a validated parameter instead (variant, nudge, flexNone,
  // split, key ...). Asking for one of the old pass-throughs is an error, not silently ignored.
  for (const name of BUILDERS) {
    const fn = c[name];
    if (typeof fn !== 'function') continue;
    c[name] = (o, ...rest) => {
      if (o && typeof o === 'object') for (const k of FREE) if (o[k] !== undefined) throw new Error(`design kit: ${name}() takes no "${k}" (a free ${k === 'extra' ? 'style' : k === 'cls' ? 'class' : 'attribute'} string); use a validated parameter`);
      return fn(o, ...rest);
    };
  }
  return c;
}

// The page's root: palette, font stacks and the grain as custom properties, then the composition's markup.
export function rootCss({ palette, tokens, brand, grain }) {
  const stack = (role) => {
    const f = tokens.fonts[role];
    const brandOwn = (role === 'display' && brand.font.display !== brand.font.family) || (role === 'label' && brand.font.label !== brand.font.mono);
    const own = role === 'display' ? 'var(--display)' : role === 'label' ? 'var(--label)' : null;
    return `${brandOwn && own ? `${own},` : ''}'${fontAlias(f.family)}',${f.fallback.replace(/"/g, "'")}`;
  };
  return [paletteCss(palette), `--f-display:${stack('display')}`, `--f-text:${stack('text')}`, `--f-label:${stack('label')}`, `--f-mono:${stack('mono')}`, `--k-grain:${grain}`].join(';');
}

// A fine noise as an SVG data: URI (feTurbulence), declared as a custom property; numbers only. Fully percent-encoded, so the value
// holds no quote and sits safely inside a style attribute.
export const grainUri = ({ freq = 0.85, strength = 0.5 } = {}) => {
  const f = Math.min(2, Math.max(0.1, Number(freq))), s = Math.min(1, Math.max(0.05, Number(strength)));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260"><filter id="g"><feTurbulence type="fractalNoise" baseFrequency="${+f.toFixed(3)}" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${+s.toFixed(3)} 0"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>`;
  return `url(data:image/svg+xml,${encodeURIComponent(svg).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27')})`;
};

// ======== additions for the swiss direction (generic and neutrally named; any direction may use them) ========
// How far a font's line box sits above its cap line (top) and below its baseline (bottom), in em, for a unitless line height `lead`.
// m: { asc, desc, cap } in em (the font's ascent, descent and cap height, from the direction's tokens). A block pulled by these (a
// negative margin of this many em) has its first cap line and its last baseline exactly on the grid, without text-box-trim (which a
// Chrome older than 133 does not have).
export const capTrim = (m, lead) => { const half = (lead - (m.asc + m.desc)) / 2; return { top: +(half + m.asc - m.cap).toFixed(4), bottom: +(half + m.desc).toFixed(4) }; };

const HEX6 = /^#[0-9a-f]{6}$/i;
const sizesOf = (list, what) => { if (!Array.isArray(list) || !list.length || list.length > 16) throw new Error(`design kit: ${what} must be a list of sizes`); return list.map((v) => P(v, what)).join(','); };
const emOf = (v, what) => `${P(v, what)}em`;

// Builders that need the brand or a page-wide scope. Every number is checked finite and written through px(); colours are palette names
// (or, for scope(), a #rrggbb the direction worked out from the brand's colours); the words are Markup.
function kitExtras(c, brand, spec) {
  const tokens = c.tokens, x = { brandData: brand };
  // The text of a field as a plain string, for a composition's own logic (a date read out of a line). Never Markup: no builder accepts it as html,
  // so it can reach the page only through c.text(), c.fmt() or m``.
  x.raw = (f) => (typeof spec[f] === 'string' ? spec[f] : '');
  // A page-wide colour scope: the markup inside sees these palette names as the given #rrggbb colours (an accent worked out by contrast
  // for this page, a grey that reaches the label target). The names must be palette names; the colours must be plain hex.
  x.scope = (vars, inner) => {
    const css = Object.entries(vars).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => {
      if (!COLOUR_NAMES.includes(k)) throw new Error(`design kit: "${String(k).slice(0, 30)}" is not a palette colour`);
      if (typeof v !== 'string' || !HEX6.test(v)) throw new Error('design kit: a scoped colour must be #rrggbb');
      return `--c-${k}:${v}`;
    }).join(';');
    return `<div class="abs k-scope" style="inset:0;${css}">${inner}</div>`;
  };
  // The common attributes of a headline the runtime sets (fitLines in lib/design/runtime.mjs, modes block, fill and numeral).
  const head = (o, mode) => {
    const D = tokens.type.display, role = ROLES.has(o.role ?? 'headline') ? o.role ?? 'headline' : 'headline';
    const lead = o.lead ?? D.lead, track = o.track ?? D.track;
    const trim = o.trim ?? { top: 0, bottom: 0 };
    const css = [o.flow ? (o.w !== undefined ? `width:${P(o.w, 'w')}px` : '') : place({ x: o.x, y: o.y, w: o.w, right: o.right, bottom: o.bottom }), `font-family:${c.fontVar(o.family ?? 'display')}`, `font-size:${P(o.sizes?.[0] ?? o.cap, 'size')}px`,
      `line-height:${P(lead, 'lead')}`, `letter-spacing:${P(track, 'track')}em`, `font-weight:${P(o.weight ?? D.weight, 'weight')}`, o.colour ? `color:${colour(o.colour)}` : '', `text-align:${o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left'}`,
      o.ml !== undefined ? `margin-left:${P(o.ml, 'ml')}px` : '', o.trimTop === false ? '' : `margin-top:-${emOf(trim.top, 'trim')}`, o.trimBottom === false ? '' : `margin-bottom:-${emOf(trim.bottom, 'trim')}`].filter(Boolean).join(';');
    if (o.stop !== undefined && !ID.test(o.stop)) throw new Error('design kit: stop must be an id');
    const body = safe(o.html ?? c.fmt('headline'), 'html');
    return `<div class="${o.flow ? 'k-flow' : 'abs'} k-t k-display k-fb${emphClass(o.emph)}" data-el data-role="${role}" data-grid="${o.grid ?? 'left'}" data-fitlines data-fitmode="${mode}" data-w="${P(o.w, 'w')}" data-h="${P(o.h, 'h')}"${o.sizes ? ` data-sizes="${sizesOf(o.sizes, 'sizes')}"` : ''}`
      + ` data-lead="${P(lead, 'lead')}" data-track="${P(track, 'track')}" data-max="${P(o.max ?? 5, 'max')}" data-align="${o.align === 'right' ? 'right' : o.align === 'center' ? 'center' : 'left'}" data-capem="${P(o.capEm ?? 0.7, 'capEm')}"`
      + ` data-tt="${P(trim.top, 'trim')}" data-tb="${P(trim.bottom, 'trim')}"${o.stop ? ` data-stop="${o.stop}" data-gap="${P(o.gap ?? 32, 'gap')}"` : ''}${o.anchor === 'bottom' ? ` data-anchor="bottom" data-desc="${P(o.desc ?? 0.2, 'desc')}"` : ''}`
      + `${o.mode ?? ''} style="${css}">${body}</div>`;
  };
  // A headline at ONE size for all its lines, in lines balanced against each other: the largest of `sizes` (descending) at which it fits the
  // width w and the height h in at most `max` lines. If none fits, the render is refused with the number of characters that would. Each line
  // is pulled left by its own first glyph's side bearing so the ink, not the box, sits on the grid (the runtime reports the pull as data-optical).
  // o: html, x, y (the y of the first cap line), w, h, sizes, lead, track, weight, family, colour, max, trim ({ top, bottom } em, capTrim()),
  // capEm, flow, bottom (anchor: the last baseline), stop (the id of an element the block must stay gap px clear of), role.
  x.fitBlock = (o) => head({ ...o, mode: undefined }, 'block');
  // A headline whose every line is as large as lets its INK fill the width (caps and floors in px), the line breaks chosen so that the line
  // sizes are as even as the words allow while the block fills the height: o.cap (the largest a line may be), o.floor (below it the render
  // is refused), o.gapEm (the gap between lines, in em of the line below, default 0.24); an emphasised phrase never shares a line.
  x.fitFill = (o) => head({ ...o, sizes: [o.cap], mode: ` data-cap="${P(o.cap, 'cap')}" data-floor="${P(o.floor, 'floor')}" data-gapem="${P(o.gapEm ?? 0.24, 'gapEm')}"`, max: o.max ?? 8 }, 'fill');
  // A numeral at the largest of `sizes` whose width leaves room for its unit, ink flush left at x0, its baseline `bleed` em of its cap height
  // below the page's bottom edge (data-bleed), its unit (Markup, optional) snapped to the first column line clear of the numeral and set in
  // the unit's own style, its cap line level with the numeral's. o: html, unit, x0 (left edge), right (the right margin), edge (the page's
  // bottom edge), bleed (default 0.08), sizes, track, weight, colour, cols (the column lines), unitSize, unitLead, unitTrim, numTrim, minUnit.
  x.fitNumeral = (o) => {
    const D = tokens.type.display, T = tokens.type, num = safe(o.html, 'html'), unit = o.unit === undefined || o.unit === null ? '' : safe(o.unit, 'unit');
    const common = `display:block;white-space:nowrap`;
    const nSpan = `<span class="abs k-t k-fnum-n" data-role="stat" data-grid="skip" data-bleed="left bottom" style="${common};left:0;top:0;font-family:${c.fontVar(o.family ?? 'display')};font-size:${P(o.sizes[0], 'size')}px;line-height:1;letter-spacing:${P(o.track ?? -0.05, 'track')}em;font-weight:${P(o.weight ?? D.weight, 'weight')};color:${colour(o.colour ?? 'ink')};font-variant-numeric:lining-nums">${num}</span>`;
    const uSpan = unit ? `<span class="abs k-t k-fnum-u" data-role="sub" data-grid="left" style="left:0;top:0;font-family:${c.fontVar('mono')};font-size:${P(o.unitSize ?? T.body.size, 'unitSize')}px;line-height:${P(o.unitLead ?? T.body.lead / T.body.size, 'unitLead')};font-weight:500;text-transform:uppercase;color:${colour(o.unitColour ?? 'ink')}">${unit}</span>` : '';
    const cols = (o.cols ?? []).map((v) => P(v, 'col')).join(',');
    return `<div class="abs k-fnum" data-el data-fitlines data-fitmode="numeral" data-w="${P(o.right - o.x0, 'w')}" data-h="0" data-x0="${P(o.x0, 'x0')}" data-right="${P(o.right, 'right')}" data-edge="${P(o.edge, 'edge')}" data-bleedem="${P(o.bleed ?? 0.08, 'bleed')}"`
      + ` data-sizes="${sizesOf(o.sizes, 'sizes')}" data-capem="${P(o.capEm ?? 0.7, 'capEm')}" data-asc="${P(o.asc, 'asc')}" data-desc="${P(o.desc, 'desc')}" data-cols="${cols}" data-minunit="${P(o.minUnit ?? 0, 'minUnit')}"`
      + ` data-utt="${P(o.unitTrim?.top ?? 0, 'unitTrim')}" style="inset:0">${nSpan}${uSpan}</div>`;
  };
  // A scrim over a picture under text: the runtime reads the picture's pixels behind the page's text in the scrim's box and darkens the
  // scrim (colour: a palette name, default ink) until the text reaches `need`:1 there, no stronger than `cap` and no weaker than `floor`;
  // it holds that strength to the foot of the lowest text and fades out over `fade` px below. o: x, y, w, h, need, floor, cap, fade, colour.
  x.scrim = (o) => `<i class="abs k-scrim" aria-hidden="true" data-el data-scrim data-need="${P(o.need ?? 4.5, 'need')}" data-floor="${P(o.floor ?? 0.45, 'floor')}" data-capa="${P(o.cap ?? 0.92, 'cap')}" data-fade="${P(o.fade ?? 56, 'fade')}" style="${place(o)};color:${colour(o.colour ?? 'ink')}"></i>`;
  // An area filled with a gradient (gradientCss: palette colours, a whole-degree angle or one of nine points). It counts as deliberate fill.
  // o: x, y, w, h, right, bottom, gradient, radius (px or a round name), corners, z.
  x.gradient = (o) => `<i class="abs k-grad" aria-hidden="true" data-el data-fill style="${place(o)};background:${gradientCss(o.gradient)}${o.radius !== undefined ? `;border-radius:${radiusCss(o.radius, o.corners)}` : ''}${o.z !== undefined ? `;z-index:${P(o.z, 'z')}` : ''}"></i>`;
  // A colour laid over the picture under text (the scrim's measurement, read by runtime.mjs swScrims): flat, or strongest at the foot (from: bottom)
  // or the top (from: top) of its box, fading out `fade` px beyond the words. It starts at `floor` of the colour and is raised until the words in
  // its box reach `need`:1 against the picture's own pixels, no further than `cap`. o: x, y, w, h, colour, from, need, floor, cap, fade, z.
  x.overlay = (o) => {
    const from = o.from ?? 'bottom';
    if (!OVERLAY_MODES.includes(from)) throw new Error('design kit: an overlay is flat or strongest at the bottom or the top');
    const lim = (v, lo, hi, what) => { n(v, what); if (v < lo || v > hi) throw new Error(`design kit: ${what} must be from ${lo} to ${hi}`); return px(v); };
    return `<i class="abs k-scrim k-overlay" aria-hidden="true" data-el data-scrim data-mode="${from}" data-need="${lim(o.need ?? 4.5, 3, 7, 'need')}" data-floor="${lim(o.floor ?? 0.35, 0.1, 0.9, 'floor')}" data-capa="${lim(o.cap ?? 0.85, 0.3, 0.95, 'cap')}" data-fade="${lim(o.fade ?? 240, 0, 800, 'fade')}" style="${place(o)};color:${colour(o.colour ?? 'ink')}${o.z !== undefined ? `;z-index:${P(o.z, 'z')}` : ''}"></i>`;
  };
  // One of the brand's graphics or cut-outs (c.graphicOf: the picture handed over in the post spec, embedded as a data: URI by args.image) in a box
  // of w x h px at x, y, turned by rot degrees and mirrored with flip. tint (a palette colour) recolours a recolourable graphic: the picture is drawn
  // one box to the left, outside the clip, and its drop shadow (no blur) falls exactly into the box in that colour, its outline the graphic's own.
  // The picture is a user image (data-user) so the enlargement check and the emptiness check read it; data-graphic keeps it apart from the post's photo.
  x.graphic = (o) => {
    const g = c.graphicOf(o.ref);
    if (!g) return '';
    const w = P(o.w, 'w'), rot = o.rot === undefined ? 0 : n(o.rot, 'rot');
    if (Math.abs(rot) > 15) throw new Error('design kit: a graphic turns at most 15 degrees');
    const tr = [rot ? `rotate(${P(rot, 'rot')}deg)` : '', o.flip ? 'scaleX(-1)' : ''].filter(Boolean).join(' ');
    const tint = o.tint === undefined ? '' : colour(o.tint);
    return `<div class="abs k-graphic${tint ? ' k-tinted' : ''}" data-el data-grid="skip" style="${place({ x: o.x, y: o.y, w: o.w, h: o.h })}${tr ? `;transform:${tr}` : ''}${o.z !== undefined ? `;z-index:${P(o.z, 'z')}` : ''}"><img data-user data-graphic data-name="${esc(g.name)}" data-fit="contain" src="${g.src}" alt=""${tint ? ` style="filter:drop-shadow(${w}px 0 0 ${tint})"` : ''}></div>`;
  };
  // A strip of tape (decoration): w x h px centred on (cx, cy), turned by rot degrees (within 60), in a palette colour; kit.css gives it its
  // see-through look and torn ends. Never type, never a fill the checks count.
  x.tape = (o) => {
    const rot = o.rot ?? 0;
    if (!Number.isFinite(rot) || Math.abs(rot) > 60) throw new Error('design kit: a strip of tape turns at most 60 degrees');
    const w = n(o.w, 'w'), h = n(o.h, 'h'), cx = n(o.cx, 'cx'), cy = n(o.cy, 'cy');
    return `<i class="abs k-tape" aria-hidden="true" data-el data-deco style="${place({ x: cx - w / 2, y: cy - h / 2, w, h })};background:${colour(o.colour ?? 'muted')}${rot ? `;transform:rotate(${P(rot, 'rot')}deg)` : ''}"></i>`;
  };
  // A paper texture over an area (decoration): the page's own grain (--k-grain) at a strength from 0.05 to 0.6, fine or coarse.
  x.paper = (o) => {
    const s = n(o.strength ?? 0.25, 'strength');
    if (s < 0.05 || s > 0.6) throw new Error('design kit: a paper texture has a strength from 0.05 to 0.6');
    if (o.grain !== undefined && o.grain !== 'fine' && o.grain !== 'coarse') throw new Error('design kit: a paper texture is fine or coarse');
    return `<i class="abs k-paper${o.grain === 'coarse' ? ' k-paper-c' : ''}" aria-hidden="true" data-el data-deco style="${place(o)};opacity:${px(s)}${o.z !== undefined ? `;z-index:${P(o.z, 'z')}` : ''}"></i>`;
  };
  // A round badge holding one of the engine's icons (decoration, like a small sticker): size px across, fill and ink palette colours, an optional
  // ring and soft shadow, turned by rot. The icon is the engine's own SVG (iconSvg), never data.
  x.badge = (o) => {
    const size = n(o.size, 'size');
    if (size < 24 || size > 300) throw new Error('design kit: a badge is 24 to 300 px across');
    return c.box({ x: o.x, y: o.y, right: o.right, bottom: o.bottom, w: size, h: size, flow: o.flow, flexNone: o.flow || undefined, alignSelf: o.alignSelf, nudge: o.nudge, fill: o.fill ?? 'gold', radius: 'full', ring: o.ring, shadow: o.shadow, rot: o.rot || undefined, z: o.z, skipGrid: true, flex: 'row', justify: 'center', align: 'center' },
      `<i class="k-badge-i" aria-hidden="true" data-deco style="font-size:${px(Math.round(size * 0.58))}px">${iconSvg(o.icon, { colour: o.ink ?? 'on-accent' })}</i>`);
  };
  return x;
}

// ======== stable element addresses ========
// Every builder marks the element it makes with a bare `data-el`. Once the page is assembled, numberElements gives each marked element its
// index path: its position among the marked children of its nearest marked ancestor, joined by dots from the top ("0", "2", "2.0", "2.1.3"),
// in document order. The path is digits and dots only, it does not change when the words change, and the runtime reports a rectangle per
// path (postMetrics().els), so a data version of a composition, a check message and an editor can all address the same element.
// Only markup the kit itself made is read (every word and attribute value in it is escaped, so a value never holds a `<` or a `>`).
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
const ATTR = /(\s+)([^\s"'>/=]+)((?:\s*=\s*(?:"[^"]*"|'[^']*'))?)/g;
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link']);
export function numberElements(html) {
  const root = { path: '', kids: 0 }, stack = [];
  const nearest = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].node) return stack[i].node; return root; };
  return String(html).replace(TAG, (all, close, name, attrs, selfClose) => {
    const tag = name.toLowerCase();
    if (close) {
      if (!stack.length || stack[stack.length - 1].tag !== tag) throw new Error(`design kit: the page markup is not well formed at </${tag}>`);
      stack.pop();
      return all;
    }
    let node = null, out = all;
    if (/(^|\s)data-el(?=\s|$|=)/.test(attrs.replace(/"[^"]*"|'[^']*'/g, '""'))) {
      const parent = nearest(), i = parent.kids++, path = parent.path ? `${parent.path}.${i}` : String(i);
      node = { path, kids: 0 };
      let done = false;
      const next = attrs.replace(ATTR, (a, sp, key, val) => { if (!done && key === 'data-el' && !val) { done = true; return `${sp}data-el="${path}"`; } return a; });
      out = `<${name}${next}${selfClose ? '/' : ''}>`;
    }
    if (!selfClose && !VOID.has(tag)) stack.push({ tag, node });
    return out;
  });
}
