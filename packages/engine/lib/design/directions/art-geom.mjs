// The geometry of the art layer (the art primitive): decorative vector shapes behind or around the words, built ONLY from validated numbers.
// Pure (no Chrome, no DOM). artGeometry(shapes, w, h) returns one piece per shape, in the art box's own pixels:
//   { kind: 'box', x, y, w, h, round: 'circle' | 'px', radius, rot, shape }   a circle, an ellipse or a rectangle (drawn as a box: a palette
//                                                                              colour or a gradient of palette colours, turned in CSS)
//   { kind: 'svg', d, fill: true | false, stroke, cap, shape, box? }            a path, line, ring, arc, or a pattern of dots or stripes (box:
//                                                                              the region stripes are drawn in, in its own pixels; else the art box)
// Every number in a path is rounded to a tenth of a pixel; turns of a path are worked into its points here. Positions are thousandths of the
// art box (x of its width, y of its height: 0 to 1000 is the box, -1000 to 2000 lets a shape run past it, where the box clips it); a radius,
// a corner and a path's own size are thousandths of the box's shorter side, so a circle stays round when the box is resized. Stroke widths,
// gaps and dot sizes are pixels.
export const ART_LIMITS = Object.freeze({
  shapes: 24, points: 400, pos: [-1000, 2000], size: [1, 3000], stroke: [1, 120], gap: [8, 300], dot: [1, 60], marks: 3000,
  pathCommands: 100, rot: [-180, 180], opacity: [0.05, 1],
});
export const ART_SHAPES = Object.freeze(['circle', 'ellipse', 'rect', 'ring', 'arc', 'line', 'path', 'dots', 'stripes']);
export const ART_BLENDS = Object.freeze(['normal', 'multiply', 'screen', 'overlay', 'soft-light']);
export const ART_CAPS = Object.freeze(['round', 'butt']);
// The path commands: M and L take one point, Q two, C three, Z none (absolute coordinates only).
export const PATH_ARITY = Object.freeze({ M: 1, L: 1, Q: 2, C: 3, Z: 0 });

const fin = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`art: ${what} must be a finite number`); return v; };
const f = (v) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? '0' : String(r); };
const within = (v, [lo, hi], what) => { fin(v, what); if (v < lo || v > hi) throw new Error(`art: ${what} is out of range`); return v; };

// How many points a path holds (the cap of ART_LIMITS.points counts them over a whole composition).
export function pathPoints(d) {
  if (!Array.isArray(d)) return 0;
  let n = 0;
  for (const c of d) if (Array.isArray(c) && Object.hasOwn(PATH_ARITY, c[0])) n += PATH_ARITY[c[0]];
  return n;
}
// The points a shape counts toward the cap: a path its own, a line two, every other shape one.
export const shapePoints = (s) => (s && s.shape === 'path' ? pathPoints(s.d) : s && s.shape === 'line' ? 2 : 1);

// The problems of a path's command list (sentences, empty when fine). Each command is [letter, x, y, ...] with the letter's number of points.
export function pathProblems(d) {
  if (!Array.isArray(d) || d.length < 2 || d.length > ART_LIMITS.pathCommands) return [`must be a list of 2 to ${ART_LIMITS.pathCommands} commands like ["M", 100, 200]`];
  const out = [];
  d.forEach((c, i) => {
    if (!Array.isArray(c) || typeof c[0] !== 'string' || !Object.hasOwn(PATH_ARITY, c[0])) { out.push(`[${i}] must start with one of M, L, Q, C or Z`); return; }
    const want = 1 + PATH_ARITY[c[0]] * 2;
    if (c.length !== want) { out.push(`[${i}] ${c[0]} takes ${want - 1} numbers`); return; }
    for (let k = 1; k < c.length; k++) if (typeof c[k] !== 'number' || !Number.isFinite(c[k]) || c[k] < ART_LIMITS.pos[0] || c[k] > ART_LIMITS.pos[1]) { out.push(`[${i}] holds a number outside ${ART_LIMITS.pos[0]} to ${ART_LIMITS.pos[1]}`); return; }
  });
  if (Array.isArray(d[0]) && d[0][0] !== 'M') out.push('must start with M');
  return out;
}

const turn = (cx, cy, deg) => {
  const t = (deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  return (x, y) => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
};
const circlePath = (cx, cy, r) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;

// shapes: the validated list; w, h: the box in pixels. -> { pieces, marks }
export function artGeometry(shapes, w, h) {
  fin(w, 'w'); fin(h, 'h');
  if (w <= 0 || h <= 0 || w > 4000 || h > 4000) throw new Error('art: the box must be 1 to 4000 px each way');
  if (!Array.isArray(shapes) || shapes.length < 1 || shapes.length > ART_LIMITS.shapes) throw new Error(`art: 1 to ${ART_LIMITS.shapes} shapes`);
  const short = Math.min(w, h);
  const X = (v) => (within(v, ART_LIMITS.pos, 'a position') / 1000) * w, Y = (v) => (within(v, ART_LIMITS.pos, 'a position') / 1000) * h;
  const S = (v) => (within(v, ART_LIMITS.size, 'a size') / 1000) * short;
  const pieces = [];
  let marks = 0, points = 0;
  for (const s of shapes) {
    if (!s || typeof s !== 'object' || !ART_SHAPES.includes(s.shape)) throw new Error('art: a shape is one of the fixed shapes');
    const rot = s.rot === undefined ? 0 : within(s.rot, ART_LIMITS.rot, 'rot');
    points += shapePoints(s);
    if (points > ART_LIMITS.points) throw new Error(`art: at most ${ART_LIMITS.points} points`);
    switch (s.shape) {
      case 'circle': { const r = S(s.r), cx = X(s.cx), cy = Y(s.cy); pieces.push({ kind: 'box', shape: s, x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, round: 'circle', rot }); break; }
      case 'ellipse': { const rx = S(s.rx), ry = S(s.ry), cx = X(s.cx), cy = Y(s.cy); pieces.push({ kind: 'box', shape: s, x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry, round: 'circle', rot }); break; }
      case 'rect': {
        const x = X(s.x), y = Y(s.y), ww = (within(s.w, ART_LIMITS.size, 'w') / 1000) * w, hh = (within(s.h, ART_LIMITS.size, 'h') / 1000) * h;
        const radius = s.radius === undefined ? 0 : Math.min(S(Math.max(1, s.radius)), ww / 2, hh / 2) * (s.radius === 0 ? 0 : 1);
        pieces.push({ kind: 'box', shape: s, x, y, w: ww, h: hh, round: 'px', radius, rot });
        break;
      }
      case 'ring': { const r = S(s.r), sw = within(s.stroke, ART_LIMITS.stroke, 'stroke'); pieces.push({ kind: 'svg', shape: s, d: circlePath(X(s.cx), Y(s.cy), r), fill: false, stroke: sw, cap: 'butt' }); break; }
      case 'arc': {
        const cx = X(s.cx), cy = Y(s.cy), r = S(s.r), sw = within(s.stroke, ART_LIMITS.stroke, 'stroke');
        const from = within(s.from ?? 0, [0, 359], 'from') + rot, sweep = within(s.sweep, [5, 360], 'sweep');
        const pt = (deg) => { const a = (deg * Math.PI) / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
        let d;
        if (sweep >= 359.99) d = circlePath(cx, cy, r);
        else { const [x0, y0] = pt(from), [x1, y1] = pt(from + sweep); d = `M${f(x0)} ${f(y0)}A${f(r)} ${f(r)} 0 ${sweep > 180 ? 1 : 0} 1 ${f(x1)} ${f(y1)}`; }
        pieces.push({ kind: 'svg', shape: s, d, fill: false, stroke: sw, cap: s.cap ?? 'round' });
        break;
      }
      case 'line': {
        const a = [X(s.x1), Y(s.y1)], b = [X(s.x2), Y(s.y2)], t = turn((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, rot);
        const [p, q] = [t(...a), t(...b)];
        pieces.push({ kind: 'svg', shape: s, d: `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`, fill: false, stroke: within(s.stroke, ART_LIMITS.stroke, 'stroke'), cap: s.cap ?? 'round' });
        break;
      }
      case 'path': {
        const bad = pathProblems(s.d);
        if (bad.length) throw new Error('art: a path is a list of M, L, Q, C and Z commands of numbers in range');
        const pts = [];
        for (const c of s.d) for (let k = 1; k < c.length; k += 2) pts.push([X(c[k]), Y(c[k + 1])]);
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length, t = turn(cx, cy, rot);
        const d = s.d.map((c) => { let out = c[0]; for (let k = 1; k < c.length; k += 2) { const [x, y] = t(X(c[k]), Y(c[k + 1])); out += `${k > 1 ? ' ' : ''}${f(x)} ${f(y)}`; } return out; }).join('');
        const stroked = s.stroke !== undefined;
        pieces.push({ kind: 'svg', shape: s, d, fill: !stroked, stroke: stroked ? within(s.stroke, ART_LIMITS.stroke, 'stroke') : undefined, cap: s.cap ?? 'round' });
        break;
      }
      case 'dots': case 'stripes': {
        const x0 = X(s.x), y0 = Y(s.y), x1 = x0 + (within(s.w, ART_LIMITS.size, 'w') / 1000) * w, y1 = y0 + (within(s.h, ART_LIMITS.size, 'h') / 1000) * h;
        let gap = within(s.gap, ART_LIMITS.gap, 'gap');
        const parts = [];
        if (s.shape === 'dots') {
          const r = within(s.size, ART_LIMITS.dot, 'size');
          const n0 = ((x1 - x0) / gap + 1) * ((y1 - y0) / gap + 1);
          if (n0 > ART_LIMITS.marks) gap *= Math.sqrt(n0 / ART_LIMITS.marks);
          for (let y = y0 + gap / 2; y <= y1 - r + 1e-9 && marks < ART_LIMITS.marks; y += gap) for (let x = x0 + gap / 2; x <= x1 - r + 1e-9 && marks < ART_LIMITS.marks; x += gap) { parts.push(circlePath(x, y, r)); marks++; }
          pieces.push({ kind: 'svg', shape: s, d: parts.join(''), fill: true });
        } else {
          // stripes: bands `width` px thick every `gap` px, at `angle` degrees, clipped to the region by the page (the region is their box)
          const bw = Math.min(within(s.width, ART_LIMITS.stroke, 'width'), gap - 1), deg = within(s.angle ?? 45, [0, 179], 'angle');
          // (drawn in the region's own pixels: the region is an svg of its own, which clips them)
          const cx = (x1 - x0) / 2, cy = (y1 - y0) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap, t = turn(cx, cy, deg);
          for (let k = -R; k <= R && marks < ART_LIMITS.marks; k += gap) {
            const q = [[cx - R, cy + k - bw / 2], [cx + R, cy + k - bw / 2], [cx + R, cy + k + bw / 2], [cx - R, cy + k + bw / 2]].map(([x, y]) => t(x, y));
            parts.push(`M${q.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`); marks++;
          }
          pieces.push({ kind: 'svg', shape: s, d: parts.join(''), fill: true, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
        }
        break;
      }
      default: throw new Error('art: unknown shape');
    }
  }
  return { pieces, marks, points };
}
