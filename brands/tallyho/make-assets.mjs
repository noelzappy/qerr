// node brands/tallyho/make-assets.mjs
// Draws the Tallyho pack's logos. Tallyho is a fictional brand: everything here is synthetic, drawn from the shapes in this file with
// the standard library only (no Chrome, no font file, no photograph, no real person, place, organisation or amount). Run it again after
// changing a drawing; the files it writes are committed with the pack.
//   brands/tallyho/logos/logo-mark.svg, logo-full.svg   the logos as drawn (the source: a speech bubble holding a tick, and a heavy
//                                                        monoline lowercase "tallyho" built from strokes and rings)
//   brands/tallyho/logos/logo-mark.png, logo-full.png   the same shapes as transparent PNGs, which is what the engine reads
//                                                        (it embeds PNG logos only, never SVG)
// The pack draws no pictures of its own: its example batch uses the engine's synthetic demo pictures
// (packages/engine/design/assets/demo/, drawn by brands/demo/make-assets.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../packages/engine/lib/core.mjs';
import { pngBytes } from '../../packages/engine/testlib/png.mjs';

// The brand's colours (brand.json): the saturated blue primary, the orange accent and the deep purple of the dark ground.
const BLUE = '#3D5AFE', ORANGE = '#FF7A1A', PURPLE = '#2A0E5E';
const H = 300; // the logo height

const out = (rel) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); return abs; };
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const r1 = (n) => Math.round(n * 10) / 10;

// ---- shapes: each has a signed distance (negative inside) for the PNG and an SVG element; both come from the same numbers ----
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const shapes = {
  // a stroke with round caps
  line: { dist: (s, x, y) => segDist(x, y, s.x0, s.y0, s.x1, s.y1) - s.w / 2,
    svg: (s) => `<line x1="${r1(s.x0)}" y1="${r1(s.y0)}" x2="${r1(s.x1)}" y2="${r1(s.y1)}" stroke="${s.fill}" stroke-width="${s.w}" stroke-linecap="round"/>` },
  // a filled disc
  dot: { dist: (s, x, y) => Math.hypot(x - s.cx, y - s.cy) - s.r, svg: (s) => `<circle cx="${r1(s.cx)}" cy="${r1(s.cy)}" r="${r1(s.r)}" fill="${s.fill}"/>` },
  // a stroke round a whole circle
  ring: { dist: (s, x, y) => Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) - s.w / 2,
    svg: (s) => `<circle cx="${r1(s.cx)}" cy="${r1(s.cy)}" r="${r1(s.r)}" fill="none" stroke="${s.fill}" stroke-width="${r1(s.w)}"/>` },
  // a filled rectangle with rounded corners: centre cx, cy, half sizes hw, hh, corner radius round
  rrect: {
    dist: (s, x, y) => { const qx = Math.abs(x - s.cx) - s.hw + s.round, qy = Math.abs(y - s.cy) - s.hh + s.round; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.round; },
    svg: (s) => `<rect x="${r1(s.cx - s.hw)}" y="${r1(s.cy - s.hh)}" width="${r1(2 * s.hw)}" height="${r1(2 * s.hh)}" rx="${r1(s.round)}" fill="${s.fill}"/>`,
  },
  // a filled triangle (the bubble's tail)
  tri: {
    dist: (s, x, y) => {
      const [a, b, c] = s.p, inside = (p, q) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
      const e = Math.min(segDist(x, y, ...a, ...b), segDist(x, y, ...b, ...c), segDist(x, y, ...c, ...a));
      const s1 = inside(a, b), s2 = inside(b, c), s3 = inside(c, a);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0) ? -e : e;
    },
    svg: (s) => `<polygon points="${s.p.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ')}" fill="${s.fill}"/>`,
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

// ---- the mark: a blue speech bubble with a tail at its foot, holding an orange tick (a vote counted) ----
function mark(x0, s) {
  const cx = x0 + s / 2, cy = s * 0.44;
  return [
    { type: 'rrect', cx, cy, hw: s * 0.46, hh: s * 0.38, round: s * 0.16, fill: BLUE },
    { type: 'tri', p: [[cx - s * 0.2, cy + s * 0.3], [cx - s * 0.02, cy + s * 0.3], [cx - s * 0.26, cy + s * 0.54]], fill: BLUE },
    { type: 'line', x0: cx - s * 0.2, y0: cy + s * 0.01, x1: cx - s * 0.05, y1: cy + s * 0.15, w: s * 0.1, fill: ORANGE },
    { type: 'line', x0: cx - s * 0.05, y0: cy + s * 0.15, x1: cx + s * 0.22, y1: cy - s * 0.15, w: s * 0.1, fill: ORANGE },
  ];
}

// ---- the wordmark: heavy monoline lowercase built from strokes. Glyph space is y up from the baseline; x is the stroke's left centre line.
const T = 40, C = T / 2, X = 140, ASC = 214, DESC = 60, BASE = 222, GAP = 26;
const RB = X / 2 - C; // a bowl's radius, so its outer edge spans the x-height exactly
const Y = (y) => BASE - y;
const L = (x0, y0, x1, y1) => ({ type: 'line', x0, y0: Y(y0), x1, y1: Y(y1), w: T, fill: PURPLE });
const bowl = (x) => ({ type: 'ring', cx: x + RB, cy: Y(X / 2), r: RB, w: T, fill: PURPLE });
const GLYPHS = {
  t: (x) => [L(x + RB * 0.55, C, x + RB * 0.55, ASC - C), L(x, X - C, x + RB * 1.1, X - C)],
  a: (x) => [bowl(x), L(x + 2 * RB, C, x + 2 * RB, X - C)],
  l: (x) => [L(x, C, x, ASC - C)],
  y: (x) => [L(x, X - C, x + RB, C), L(x + 2 * RB, X - C, x + RB - (RB / (X - 2 * C)) * DESC, -DESC + C)],
  h: (x) => [L(x, C, x, ASC - C), { type: 'arch', cx: x + RB, cy: Y(X / 2), r: RB, w: T, fill: PURPLE }, L(x + 2 * RB, C, x + 2 * RB, X / 2)],
  o: (x) => [bowl(x)],
};
const WIDTH = { t: RB * 1.1, a: 2 * RB, l: 0, y: 2 * RB, h: 2 * RB, o: 2 * RB };
function wordmark(word, left) {
  const list = [];
  let x = left + C; // the first stroke's outer edge sits at `left`
  for (const ch of word) { list.push(...GLYPHS[ch](x)); x += WIDTH[ch] + T + GAP; }
  return { list, right: x - T - GAP + C };
}
// an arch: the top half of a ring (the shoulder of an h), with round ends
shapes.arch = {
  dist: (s, x, y) => {
    if (y <= s.cy) return Math.abs(Math.hypot(x - s.cx, y - s.cy) - s.r) - s.w / 2;
    return Math.min(Math.hypot(x - s.cx + s.r, y - s.cy), Math.hypot(x - s.cx - s.r, y - s.cy)) - s.w / 2;
  },
  svg: (s) => `<path d="M${r1(s.cx - s.r)} ${r1(s.cy)} A${r1(s.r)} ${r1(s.r)} 0 0 1 ${r1(s.cx + s.r)} ${r1(s.cy)}" fill="none" stroke="${s.fill}" stroke-width="${s.w}" stroke-linecap="round"/>`,
};

const WORD_LEFT = 330, WORDMARK_FROM = 316;

function main() {
  const m = mark(0, H);
  fs.writeFileSync(out('brands/tallyho/logos/logo-mark.svg'), svgOf(H, H, m, 'Tallyho'));
  fs.writeFileSync(out('brands/tallyho/logos/logo-mark.png'), rasterise(H, H, m));
  const word = wordmark('tallyho', WORD_LEFT);
  const W = Math.ceil(word.right) + 6, full = [...mark(0, H), ...word.list];
  fs.writeFileSync(out('brands/tallyho/logos/logo-full.svg'), svgOf(W, H, full, 'Tallyho'));
  fs.writeFileSync(out('brands/tallyho/logos/logo-full.png'), rasterise(W, H, full));
  console.log(`logo-full.png is ${W} x ${H}: logos.fullSize [${W}, ${H}], wordmarkFrom ${WORDMARK_FROM}, markGap ${WORDMARK_FROM - H} in brand.json`);
}

main();
