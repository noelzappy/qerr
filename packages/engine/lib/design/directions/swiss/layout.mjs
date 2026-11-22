// The swiss direction's page furniture: the grid (the meta row, then seven equal rows), the meta row, the accent plan of a page (where
// the brand's accent may go, by measured contrast) and the small builders every composition uses. Trusted engine code: every word reaches
// the page through the kit's Markup builders; every colour is a palette name, or a #rrggbb worked out here from the brand's own colours.
import { accentPlan, palette } from '../colour.mjs';
import { capTrim } from '../kit.mjs';

// ---- the grid ----
// R(r) / B(r): the top and the bottom of row r (2 to 8; row 1 is the meta row). g.x0 / g.x1: the left and right margin lines.
export function geometry(c) {
  const T = c.tokens, mg = c.margin, G = c.grid.gutter, D = T.device;
  const first = mg.top + D.metaHeight + G, rowH = (c.H - mg.top - mg.bottom - D.metaHeight - 7 * G) / 7;
  const R = (r) => first + (r - 2) * (rowH + G), B = (r) => R(r) + rowH;
  return { R, B, rowH, G, x0: c.col(0), x1: c.colR(c.grid.cols - 1), W: c.span(0, c.grid.cols - 1), bottomLine: c.H - mg.bottom, topLine: mg.top };
}

// ---- the accent plan of a page ----
// Where this brand's accent may go, by what it measures against the brand's own targets (colour.mjs accentPlan): as a block always; as type
// only where it reaches the target on that ground. `darkPage` says what the page whose ground is the brand's dark does with it: keep the dark
// ground (the accent reads on it), or switch to the light ground (it does not, and washing it out toward the light would no longer be the
// brand's accent); `wordsOnLight` then whether the accent may be type there.
export function plan(c) {
  if (c.__swissPlan) return c.__swissPlan;
  const brand = c.brandData, pal = palette(brand, Math.max(7, Number(brand.contrast?.headline) || 7)), p = accentPlan(brand, pal);
  const darkOk = p.word.dark, lightOk = p.word.paper;
  const darkPage = darkOk ? 'dark' : lightOk ? 'light' : 'dark';
  c.__swissPlan = {
    ...p, pal, darkPage,
    // the scope every page sets: the accent as type (the page uses it only where `word`/`display` say it may), the greys that reach the label target, the type on an accent block
    scope: { 'accent-type': pal.primary, 'accent-dark': pal.primary, 'on-accent': p.onFill.colour, muted: p.mutedPaper, 'muted-dark': p.mutedDark },
  };
  return c.__swissPlan;
}

// ---- type ----
// The em offsets of a block of a face at a unitless line height.
export const trimOf = (c, face, lead) => capTrim(c.tokens.metrics[face], lead);

// The meta row every page opens with: a 4 px rule, then three mono cells on the grid (label in columns 1-6, the brand name from column 7,
// the folio right-aligned to column 12), the 56 px box closed by a 1 px rule. dark: the light-on-dark version.
export function metaRow(c, g, { dark = false } = {}) {
  const D = c.tokens.device, ink = dark ? 'white' : 'ink', mute = dark ? 'muted-dark' : 'muted', LH = 28;
  const rowBottom = g.topLine + D.metaBox, y = g.topLine + D.ruleTop + (D.metaBox - D.ruleTop - D.ruleBelow - LH) / 2;
  let h = c.rule({ x: g.x0, y: g.topLine, w: g.W, weight: D.ruleTop, colour: ink });
  // the brand name starts at column 7, or earlier when it is too long to fit the cell (a mono line at 20 px with 0.06 em tracking is ~13.2 px a character)
  const need = c.brandChars * 13.3;
  let from = 6; while (from > 4 && c.span(from, 9) < need) from--;
  if (c.has('label')) h += c.label({ role: 'label', html: c.text('label'), x: c.col(0), y, w: c.span(0, from - 1), lead: LH / 20, colour: ink });
  h += c.label({ role: 'meta', html: c.brand, x: c.col(from), y, w: c.span(from, 9), lead: LH / 20, colour: mute });
  h += c.folioMark({ x: c.col(10), y, w: c.span(10, 11), lead: LH / 20, colour: mute, align: 'right' });
  h += c.rule({ x: g.x0, y: rowBottom - D.ruleBelow, w: g.W, weight: D.ruleBelow, colour: ink });
  return h;
}

// ---- body copy at the body size ----
// The sub line: the body size, its first cap line at `top` or its last baseline at `base`, in columns a..b. dark: the version on a dark ground.
export function subBlock(c, g, { a = 0, b = 5, top, base, dark = false, field = 'sub', role = 'sub' } = {}) {
  if (!c.has(field)) return '';
  const B = c.tokens.type.body, tr = trimOf(c, 'text', B.lead / B.size), place = base !== undefined ? { bottom: c.H - (base + tr.bottom * B.size) } : { y: top - tr.top * B.size };
  return c.body({ x: c.col(a), w: c.span(a, b), html: c.fmt(field), colour: dark ? 'body-dark' : 'body', role, ...place });
}

// A solid accent square of two columns, its bottom (or top) edge on a grid line.
export const square = (c, g, { x, top, bottom, colour = 'primary' }) => { const s = c.span(10, 11); return c.block({ x, y: top !== undefined ? top : bottom - s, w: s, h: s, colour }); };
