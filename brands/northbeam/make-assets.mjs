// node brands/northbeam/make-assets.mjs
// Draws the Northbeam pack's logos. Northbeam is a fictional product and design studio: everything here is synthetic, drawn from
// the shapes in this file with the standard library only (no Chrome, no font file, no photograph, no real person, place,
// organisation or amount). Run it again after changing a drawing; the files it writes are committed with the pack.
//   brands/northbeam/logos/logo-mark.svg, logo-full.svg   the logos as drawn (the source: a yellow tile crossed by a dark beam rising
//                                                          to the north-east, and a heavy monoline lowercase "northbeam" with a red full stop)
//   brands/northbeam/logos/logo-mark.png, logo-full.png   the same shapes as transparent PNGs, which is what the engine reads
//                                                          (it embeds PNG logos only, never SVG)
// The pack draws no pictures of its own: its example batch points at photos in packages/engine/design/assets/photos/ (not
// committed; each one's source and licence is a row in that folder's CREDITS.md).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../packages/engine/lib/core.mjs';
import { pngBytes } from '../../packages/engine/testlib/png.mjs';

// The brand's colours (brand.json): the near-black ink, the red primary and the yellow accent.
const INK = '#141414', RED = '#CC2A1F', YELLOW = '#F5C431';
const H = 338; // the logo height, as the demo's

const out = (rel) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); return abs; };
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const r1 = (n) => Math.round(n * 10) / 10;

// ---- shapes: each has a signed distance (negative inside) for the PNG and an SVG element; both come from the same numbers ----
// line: a stroke with round caps; arc: a stroke along a circle from angle a0 to a1 (canvas angles, y down, a0 < a1, clockwise on
// screen); dot: a filled disc; ring: a stroke around a whole circle; tile: a filled square with rounded corners.
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const TAU = Math.PI * 2;
const shapes = {
  line: { dist: (s, x, y) => segDist(x, y, s.x0, s.y0, s.x1, s.y1) - s.w / 2,
    svg: (s) => `<line x1="${r1(s.x0)}" y1="${r1(s.y0)}" x2="${r1(s.x1)}" y2="${r1(s.y1)}" stroke="${s.fill}" stroke-width="${s.w}" stroke-linecap="round"/>` },
  arc: {
    dist: (s, x, y) => {
      let a = Math.atan2(y - s.cy, x - s.cx);
      while (a < s.a0) a += TAU;
      while (a >= s.a0 + TAU) a -= TAU;
      if (a <= s.a1) return Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) - s.w / 2;
      const end = (t) => Math.hypot(x - s.cx - s.r * Math.cos(t), y - s.cy - s.r * Math.sin(t));
      return Math.min(end(s.a0), end(s.a1)) - s.w / 2;
    },
    svg: (s) => {
      const p = (t) => `${r1(s.cx + s.r * Math.cos(t))} ${r1(s.cy + s.r * Math.sin(t))}`;
      return `<path d="M${p(s.a0)} A${s.r} ${s.r} 0 ${s.a1 - s.a0 > Math.PI ? 1 : 0} 1 ${p(s.a1)}" fill="none" stroke="${s.fill}" stroke-width="${s.w}" stroke-linecap="round"/>`;
    },
  },
  dot: { dist: (s, x, y) => Math.hypot(x - s.cx, y - s.cy) - s.r, svg: (s) => `<circle cx="${r1(s.cx)}" cy="${r1(s.cy)}" r="${r1(s.r)}" fill="${s.fill}"/>` },
  ring: { dist: (s, x, y) => Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) - s.w / 2,
    svg: (s) => `<circle cx="${r1(s.cx)}" cy="${r1(s.cy)}" r="${r1(s.r)}" fill="none" stroke="${s.fill}" stroke-width="${r1(s.w)}"/>` },
  tile: {
    dist: (s, x, y) => {
      const qx = Math.abs(x - s.cx) - (s.half - s.round), qy = Math.abs(y - s.cy) - (s.half - s.round);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.round;
    },
    svg: (s) => `<rect x="${r1(s.cx - s.half)}" y="${r1(s.cy - s.half)}" width="${r1(2 * s.half)}" height="${r1(2 * s.half)}" rx="${r1(s.round)}" fill="${s.fill}"/>`,
  },
};

// Shapes painted in order (later over earlier), anti-aliased from their distances; transparent outside.
function rasterise(w, h, list) {
  const cols = list.map((s) => hex(s.fill));
  return pngBytes(w, h, (x, y) => {
    let r = 0, g = 0, b = 0, a = 0;
    list.forEach((s, i) => {
      const cover = Math.max(0, Math.min(1, 0.5 - shapes[s.type].dist(s, x + 0.5, y + 0.5)));
      if (!cover) return;
      const [cr, cg, cb] = cols[i], na = cover + a * (1 - cover);
      r = (cr * cover + r * a * (1 - cover)) / na; g = (cg * cover + g * a * (1 - cover)) / na; b = (cb * cover + b * a * (1 - cover)) / na; a = na;
    });
    return a ? [Math.round(r), Math.round(g), Math.round(b), Math.round(a * 255)] : [0, 0, 0, 0];
  }, { alpha: true });
}
const svgOf = (w, h, list, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}">\n${list.map((s) => `  ${shapes[s.type].svg(s)}`).join('\n')}\n</svg>\n`;

// ---- the mark: a yellow tile (it reads on the red field, the dark page and the cream page alike) crossed by a dark beam rising to
// the north-east, ending in a dot ----
function mark(x0, s) {
  const cx = x0 + s / 2, cy = s / 2, w = s * 0.13;
  return [
    { type: 'tile', cx, cy, half: s * 0.46, round: s * 0.1, fill: YELLOW },
    { type: 'line', x0: cx - s * 0.24, y0: cy + s * 0.24, x1: cx + s * 0.08, y1: cy - s * 0.08, w, fill: INK },
    { type: 'dot', cx: cx + s * 0.2, cy: cy - s * 0.2, r: w * 0.62, fill: INK },
  ];
}

// ---- the wordmark: heavy monoline lowercase built from strokes. Glyph space is y up from the baseline; x is the stroke's centre line.
const T = 42, C = T / 2, X = 160, ASC = 236, BASE = 250, GAP = 24;
const RB = X / 2 - C; // a bowl's radius, so its outer edge spans the x-height exactly
const Y = (y) => BASE - y;
const L = (x0, y0, x1, y1) => ({ type: 'line', x0, y0: Y(y0), x1, y1: Y(y1), w: T, fill: INK });
// an arc in glyph space, from angle f0 to f1 counter-clockwise (y up), drawn as the matching canvas arc
const A = (cx, cy, r, f0, f1) => ({ type: 'arc', cx, cy: Y(cy), r, a0: -f1, a1: -f0, w: T, fill: INK });
const O = (cx) => ({ type: 'ring', cx, cy: Y(X / 2), r: RB, w: T, fill: INK });
const deg = (d) => (d * Math.PI) / 180;
const arch = (x, r = RB) => [A(x + r, X - C - r, r, 0, Math.PI), L(x + 2 * r, X - C - r, x + 2 * r, C)];
const RM = RB * 0.78; // the narrower bowls of the m
const GLYPHS = {
  n: (x) => [L(x, C, x, X - C), ...arch(x)],
  o: (x) => [O(x + RB)],
  r: (x) => [L(x, C, x, X - C), A(x + RB, X - C - RB, RB, deg(70), Math.PI)],
  t: (x) => [L(x + RB * 0.55, C, x + RB * 0.55, ASC - 30), L(x - C * 0.2, X - C, x + RB * 1.3, X - C)],
  h: (x) => [L(x, C, x, ASC - C), ...arch(x)],
  b: (x) => [L(x, C, x, ASC - C), O(x + RB)],
  e: (x) => [L(x, X / 2, x + 2 * RB, X / 2), A(x + RB, X / 2, RB, 0, deg(318))],
  a: (x) => [O(x + RB), L(x + 2 * RB, C, x + 2 * RB, X - C)],
  m: (x) => [L(x, C, x, X - C), ...arch(x, RM), ...arch(x + 2 * RM, RM)],
};
const WIDTH = { n: 2 * RB, o: 2 * RB, r: RB * 1.25, t: RB * 1.3, h: 2 * RB, b: 2 * RB, e: 2 * RB, a: 2 * RB, m: 4 * RM };
function wordmark(word, left) {
  const list = [];
  let x = left + C; // the first stroke's outer edge sits at `left`
  for (const ch of word) { list.push(...GLYPHS[ch](x)); x += WIDTH[ch] + T + GAP; }
  // the red full stop after the word
  const stop = x - GAP * 0.4, r = C * 1.15;
  list.push({ type: 'dot', cx: stop, cy: Y(r), r, fill: RED });
  return { list, right: stop + r };
}

const WORD_LEFT = 384, WORDMARK_FROM = 368;

function main() {
  const m = mark(0, H);
  fs.writeFileSync(out('brands/northbeam/logos/logo-mark.svg'), svgOf(H, H, m, 'Northbeam'));
  fs.writeFileSync(out('brands/northbeam/logos/logo-mark.png'), rasterise(H, H, m));
  const word = wordmark('northbeam', WORD_LEFT);
  const W = Math.ceil(word.right) + 6, full = [...mark(0, H), ...word.list];
  fs.writeFileSync(out('brands/northbeam/logos/logo-full.svg'), svgOf(W, H, full, 'Northbeam'));
  fs.writeFileSync(out('brands/northbeam/logos/logo-full.png'), rasterise(W, H, full));
  console.log(`logo-full.png is ${W} x ${H}: logos.fullSize [${W}, ${H}], wordmarkFrom ${WORDMARK_FROM}, markGap ${WORDMARK_FROM - H} in brand.json`);
}

main();
