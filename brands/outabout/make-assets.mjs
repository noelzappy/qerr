// node brands/outabout/make-assets.mjs
// Draws the Outabout pack's logos. Outabout is a fictional what's-on guide for an invented city (Tallowmere is not a real
// place): everything here is synthetic, drawn from the shapes in this file with the standard library only (no Chrome, no font
// file, no photograph, no real person, place, organisation or amount). Run it again after changing a drawing; the files it
// writes are committed with the pack.
//   brands/outabout/logos/logo-mark.svg, logo-full.svg   the logos as drawn (the source: a ring with a sun dot, and a monoline
//                                                        lowercase "outabout" built from strokes and arcs)
//   brands/outabout/logos/logo-mark.png, logo-full.png   the same shapes as transparent PNGs, which is what the engine reads
//                                                        (it embeds PNG logos only, never SVG)
// The pack draws no pictures of its own: its example batch uses the engine's synthetic demo pictures
// (packages/engine/design/assets/demo/, drawn by brands/demo/make-assets.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../packages/engine/lib/core.mjs';
import { pngBytes } from '../../packages/engine/testlib/png.mjs';

// The logo is drawn in the brand's ink (brand.json text.ink), so it reads on the orange field and on the cream paper; on a
// dark page the engine sets it light.
const INK = '#0D0D0D', ORANGE = '#FF7A1F'; // ink and the primary colour (brand.json accents.primary)
const H = 338; // the logo height, as the demo's

const out = (rel) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); return abs; };
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const r1 = (n) => Math.round(n * 10) / 10;

// ---- shapes: each has a signed distance (negative inside) for the PNG and an SVG element; both come from the same numbers ----
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

// ---- the mark: an ink disc holding an orange ring (the "o" of out) with a sun dot rising in its top right. The engine keeps a mark in
// its own colours on a dark page (only the wordmark turns light), so the orange keeps the mark visible there, the ink disc on the field.
function mark(x0, s) {
  const cx = x0 + s / 2, cy = s / 2;
  return [
    { type: 'dot', cx, cy, r: s * 0.44, fill: INK },
    { type: 'ring', cx, cy, r: s * 0.2, w: s * 0.1, fill: ORANGE },
    { type: 'dot', cx: cx + s * 0.2, cy: cy - s * 0.2, r: s * 0.075, fill: ORANGE },
  ];
}

// ---- the wordmark: monoline lowercase built from strokes. Glyph space is y up from the baseline; x is the stroke's centre line.
const T = 40, C = T / 2, X = 160, ASC = 232, BASE = 262, GAP = 30;
const RB = X / 2 - C; // a bowl's radius, so its outer edge spans the x-height exactly
const Y = (y) => BASE - y;
const L = (x0, y0, x1, y1) => ({ type: 'line', x0, y0: Y(y0), x1, y1: Y(y1), w: T, fill: INK });
// an arc in glyph space, from angle f0 to f1 counter-clockwise (y up), drawn as the matching canvas arc
const A = (cx, cy, r, f0, f1) => ({ type: 'arc', cx, cy: Y(cy), r, a0: -f1, a1: -f0, w: T, fill: INK });
const bowl = (x) => ({ type: 'ring', cx: x + RB, cy: Y(X / 2), r: RB, w: T, fill: INK });
const GLYPHS = {
  o: (x) => [bowl(x)],
  a: (x) => [bowl(x), L(x + 2 * RB, C, x + 2 * RB, X - C)],
  b: (x) => [L(x, C, x, ASC - C), bowl(x)],
  u: (x) => [L(x, X - C, x, C + RB), A(x + RB, C + RB, RB, Math.PI, TAU), L(x + 2 * RB, X - C, x + 2 * RB, C)],
  t: (x) => [L(x + RB * 0.5, C, x + RB * 0.5, ASC * 0.9 - C), L(x - C * 0.2, X - C, x + RB * 1.2, X - C)],
};
const WIDTH = { o: 2 * RB, a: 2 * RB, b: 2 * RB, u: 2 * RB, t: RB * 1.2 };
function wordmark(word, left) {
  const list = [];
  let x = left + C; // the first stroke's outer edge sits at `left`
  for (const ch of word) { list.push(...GLYPHS[ch](x)); x += WIDTH[ch] + T + GAP; }
  return { list, right: x - T - GAP + C };
}

const WORD_LEFT = 392, WORDMARK_FROM = 372;

function main() {
  const m = mark(0, H);
  fs.writeFileSync(out('brands/outabout/logos/logo-mark.svg'), svgOf(H, H, m, 'Outabout'));
  fs.writeFileSync(out('brands/outabout/logos/logo-mark.png'), rasterise(H, H, m));
  const word = wordmark('outabout', WORD_LEFT);
  const W = Math.ceil(word.right) + 6, full = [...mark(0, H), ...word.list];
  fs.writeFileSync(out('brands/outabout/logos/logo-full.svg'), svgOf(W, H, full, 'Outabout'));
  fs.writeFileSync(out('brands/outabout/logos/logo-full.png'), rasterise(W, H, full));
  console.log(`logo-full.png is ${W} x ${H}: logos.fullSize [${W}, ${H}], wordmarkFrom ${WORDMARK_FROM}, markGap ${WORDMARK_FROM - H} in brand.json`);
}

main();
