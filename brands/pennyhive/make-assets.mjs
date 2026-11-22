// node brands/pennyhive/make-assets.mjs
// Draws the Pennyhive pack's logos and its map. Pennyhive is a fictional brand: everything here is synthetic, drawn from the
// shapes in this file with the standard library only (no Chrome, no font file, no photograph, no real person, place,
// organisation or amount). Run it again after changing a drawing; the files it writes are committed with the pack.
//   brands/pennyhive/logos/logo-mark.svg, logo-full.svg   the logos as drawn (the source: a hive cell with a coin, and a
//                                                          monoline lowercase "pennyhive" built from strokes and arcs)
//   brands/pennyhive/logos/logo-mark.png, logo-full.png   the same shapes as transparent PNGs, which is what the engine reads
//                                                          (it embeds PNG logos only, never SVG)
//   brands/pennyhive/map.json                             an invented coastline in three districts, for the dot map
// The pack draws no pictures of its own: its example batch uses the engine's synthetic demo pictures
// (packages/engine/design/assets/demo/, drawn by brands/demo/make-assets.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../packages/engine/lib/core.mjs';
import { pngBytes } from '../../packages/engine/testlib/png.mjs';

// The brand's colours (brand.json): the deep green of the dark ground, the teal primary and the warm honey accent.
const GREEN = '#0B3B34', TEAL = '#0F6E60', HONEY = '#F2A541';
const H = 338; // the logo height, as the demo's

const out = (rel) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); return abs; };
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const r1 = (n) => Math.round(n * 10) / 10;

// ---- shapes: each has a signed distance (negative inside) for the PNG and an SVG element; both come from the same numbers ----
// line: a stroke with round caps; arc: a stroke along a circle from angle a0 to a1 (canvas angles, y down, a0 < a1, clockwise on
// screen); dot: a filled disc; hex: a filled pointy-top hexagon with rounded corners; ring: a stroke around a whole circle.
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
  // apothem a (centre to the middle of a side) of the rounded shape; round is the corner radius. The SVG draws the hexagon of
  // apothem a - round and strokes it with round joins, which is the same shape.
  hex: {
    dist: (s, x, y) => {
      const k = [-0.866025404, 0.5, 0.577350269], ia = s.a - s.round;
      let px = Math.abs(y - s.cy), py = Math.abs(x - s.cx); // pointy top: the flat-topped formula with x and y swapped
      const d = 2 * Math.min(k[0] * px + k[1] * py, 0); px -= d * k[0]; py -= d * k[1];
      px -= Math.max(-k[2] * ia, Math.min(k[2] * ia, px)); py -= ia;
      return Math.hypot(px, py) * Math.sign(py) - s.round;
    },
    svg: (s) => {
      const rc = (s.a - s.round) / Math.cos(Math.PI / 6);
      const pts = [0, 1, 2, 3, 4, 5].map((i) => { const t = -Math.PI / 2 + i * Math.PI / 3; return `${r1(s.cx + rc * Math.cos(t))},${r1(s.cy + rc * Math.sin(t))}`; });
      return `<polygon points="${pts.join(' ')}" fill="${s.fill}" stroke="${s.fill}" stroke-width="${r1(2 * s.round)}" stroke-linejoin="round"/>`;
    },
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

// ---- the mark: a hive cell (rounded hexagon, deep green) holding a coin (honey disc with a green ring) ----
function mark(x0, s) {
  const cx = x0 + s / 2, cy = s / 2;
  return [
    { type: 'hex', cx, cy, a: s * 0.425, round: s * 0.07, fill: GREEN },
    { type: 'dot', cx, cy, r: s * 0.205, fill: HONEY },
    { type: 'ring', cx, cy, r: s * 0.125, w: s * 0.034, fill: TEAL },
  ];
}

// ---- the wordmark: monoline lowercase built from strokes. Glyph space is y up from the baseline; x is the stroke's centre line.
const T = 34, C = T / 2, X = 150, ASC = 222, DESC = 64, BASE = 252, GAP = 38;
const RB = X / 2 - C; // a bowl's radius, so its outer edge spans the x-height exactly
const Y = (y) => BASE - y;
const L = (x0, y0, x1, y1) => ({ type: 'line', x0, y0: Y(y0), x1, y1: Y(y1), w: T, fill: GREEN });
// an arc in glyph space, from angle f0 to f1 counter-clockwise (y up), drawn as the matching canvas arc
const A = (cx, cy, r, f0, f1) => ({ type: 'arc', cx, cy: Y(cy), r, a0: -f1, a1: -f0, w: T, fill: GREEN });
const deg = (d) => (d * Math.PI) / 180;
const arch = (x) => [A(x + RB, X - C - RB, RB, 0, Math.PI), L(x + 2 * RB, X - C - RB, x + 2 * RB, C)];
const GLYPHS = {
  p: (x) => [L(x, -DESC + C, x, X - C), { type: 'ring', cx: x + RB, cy: Y(X / 2), r: RB, w: T, fill: GREEN }],
  e: (x) => [L(x, X / 2, x + 2 * RB, X / 2), A(x + RB, X / 2, RB, 0, deg(318))],
  n: (x) => [L(x, C, x, X - C), ...arch(x)],
  h: (x) => [L(x, C, x, ASC - C), ...arch(x)],
  y: (x) => [L(x, X - C, x + RB, C), L(x + 2 * RB, X - C, x + RB - (RB / (X - 2 * C)) * DESC, -DESC + C)],
  i: (x) => [L(x, C, x, X - C), { type: 'dot', cx: x, cy: Y(X + 50), r: C * 1.12, fill: GREEN }],
  v: (x) => [L(x, X - C, x + RB, C), L(x + RB, C, x + 2 * RB, X - C)],
};
const WIDTH = { p: 2 * RB, e: 2 * RB, n: 2 * RB, h: 2 * RB, y: 2 * RB, i: 0, v: 2 * RB };
function wordmark(word, left) {
  const list = [];
  let x = left + C; // the first stroke's outer edge sits at `left`
  for (const ch of word) { list.push(...GLYPHS[ch](x)); x += WIDTH[ch] + T + GAP; }
  return { list, right: x - T - GAP + C };
}

// An invented coastline on a 32 x 40 grid, cut into three districts from west to east: not a real place.
function coastMap() {
  const cols = 32, rows = 40, names = ['Westmere', 'Hollow Bay', 'Eastfold'];
  const regions = names.map((name) => ({ name, cells: [], sum: [0, 0] }));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = Math.atan2(r - 20, c - 16), wobble = 1 + 0.1 * Math.sin(a * 4 + 0.6) + 0.06 * Math.cos(a * 7);
    if (((c - 16) / 14.5) ** 2 + ((r - 20) / 17) ** 2 > wobble ** 2) continue;
    if (((c - 22) / 4) ** 2 + ((r - 9) / 5) ** 2 < 1) continue; // the bay
    const reg = regions[c < 11 ? 0 : c < 21 ? 1 : 2];
    reg.cells.push(c, r); reg.sum[0] += c; reg.sum[1] += r;
  }
  return {
    _source: 'Invented for the Pennyhive pack by brands/pennyhive/make-assets.mjs; not a real place.',
    grid: { cols, rows }, lit: ['Hollow Bay', 'Eastfold'],
    regions: regions.map(({ name, cells, sum }) => ({ name, capital: sum.map((v) => Math.round((v / (cells.length / 2)) * 10) / 10), cells })),
  };
}

const WORD_LEFT = 377, WORDMARK_FROM = 360;

function main() {
  const m = mark(0, H);
  fs.writeFileSync(out('brands/pennyhive/logos/logo-mark.svg'), svgOf(H, H, m, 'Pennyhive'));
  fs.writeFileSync(out('brands/pennyhive/logos/logo-mark.png'), rasterise(H, H, m));
  const word = wordmark('pennyhive', WORD_LEFT);
  const W = Math.ceil(word.right) + 6, full = [...mark(0, H), ...word.list];
  fs.writeFileSync(out('brands/pennyhive/logos/logo-full.svg'), svgOf(W, H, full, 'Pennyhive'));
  fs.writeFileSync(out('brands/pennyhive/logos/logo-full.png'), rasterise(W, H, full));
  const map = coastMap();
  fs.writeFileSync(out('brands/pennyhive/map.json'), `{\n  "_source": ${JSON.stringify(map._source)},\n  "grid": ${JSON.stringify(map.grid)},\n  "lit": ${JSON.stringify(map.lit)},\n  "regions": [\n${map.regions.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`);
  console.log(`logo-full.png is ${W} x ${H}: logos.fullSize [${W}, ${H}], wordmarkFrom ${WORDMARK_FROM}, markGap ${WORDMARK_FROM - H} in brand.json`);
}

main();
