// The brand's dot map (map.json in the brand pack), drawn as one still frame of a sweep of lights: the regions listed in
// "lit" glow gold, each light caught 0.9 s after it left the region's capital.
// Every number is computed here from the validated map data; the colours are CSS classes (mint dots, gold lights).
import { DesignError } from '../../lib/design/errors.mjs';
import { px } from './common.mjs';

const LIGHT_FOR = 2.8, SWEEP = 0.6, AGE = 0.9;
const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
function envelope(age) {
  const life = LIGHT_FOR - SWEEP;
  if (age <= 0 || age >= life) return 0;
  return smooth(age / 0.35) * (1 - smooth((age - life * 0.45) / (life * 0.55)));
}

// The map fitted into a w x h box, as SVG markup for an svg.map element of that size.
export function dotMapSvg(map, w, h) {
  if (!map) throw new DesignError('this brand has no map: add map.json to the brand pack, or leave the map option off');
  const { cols, rows } = map.grid;
  const REGIONS = map.regions, LIT = map.lit;
  const pitch = Math.min(w / cols, h / rows), ox = (w - pitch * (cols - 1)) / 2, oy = (h - pitch * (rows - 1)) / 2;
  const dot = Math.max(0.8, pitch * 0.24);
  const owner = new Map();
  REGIONS.forEach((r, ri) => { for (let i = 0; i < r.cells.length; i += 2) owner.set(r.cells[i + 1] * cols + r.cells[i], ri); });
  const at = (c, r) => [ox + c * pitch, oy + r * pitch];
  const circle = (cls, [x, y], rad, o) => `<circle class="${cls}" cx="${px(x)}" cy="${px(y)}" r="${px(rad)}" opacity="${px(o)}"/>`;
  let base = '', lit = '';
  REGIONS.forEach((r, ri) => {
    const pts = [];
    for (let i = 0; i < r.cells.length; i += 2) pts.push([r.cells[i], r.cells[i + 1]]);
    for (const [c, rr] of pts) {
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const o = owner.get((rr + dy) * cols + c + dx); return o !== undefined && o !== ri; });
      base += circle('md', at(c, rr), edge ? dot * 0.7 : dot, edge ? 0.18 : 0.42);
    }
    if (!LIT.includes(r.name)) return;
    const far = Math.max(0, ...pts.map(([c, rr]) => Math.hypot(c - r.capital[0], rr - r.capital[1])));
    for (const [c, rr] of pts) {
      const delay = far ? (Math.hypot(c - r.capital[0], rr - r.capital[1]) / far) * SWEEP : 0, e = envelope(AGE - delay);
      if (e <= 0.01) continue;
      lit += circle('mg', at(c, rr), dot * 2.6, e * 0.18) + circle('mg', at(c, rr), dot * (1 + e * 0.35), 0.35 + e * 0.65);
    }
    const ring = Math.min(1, AGE / 1.4), cap = at(r.capital[0], r.capital[1]);
    if (ring < 1) lit += `<circle class="mr" cx="${px(cap[0])}" cy="${px(cap[1])}" r="${px(pitch * (0.6 + ring * 3.5))}" stroke-width="${px(Math.max(1, pitch * 0.08))}" opacity="${px((1 - ring) * 0.8)}"/>`;
    lit += circle('mg', cap, dot * 1.7, Math.max(0.4, envelope(AGE)));
  });
  return base + lit;
}
