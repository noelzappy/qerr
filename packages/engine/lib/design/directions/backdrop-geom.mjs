// The geometry of a decorative background (the backdrop primitive): a pattern built ONLY from validated numbers. Pure (no Chrome, no DOM):
// backdropGeometry(o) returns { paths: [{ d, colour, stroke? }], blobs?: [...], marks, scale } in the box's own pixels (0..w, 0..h). The kit turns
// it into one inline <svg> of <path> elements (or, for the blob mesh, CSS radial gradients) whose colours are palette roles; no value of a look
// or a post reaches the markup except through these numbers, rounded to a tenth of a pixel. The same numbers (and seed) give the same pattern
// every time: the only randomness is a seeded generator (mulberry32).
export const BACKDROP_LIMITS = Object.freeze({ marks: 5000, lattice: 9000, confetti: 400, rings: 160, scale: [12, 240], seed: [0, 9999] });

const fin = (v, what) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`backdrop: ${what} must be a finite number`); return v; };
const f = (v) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? '0' : String(r); };
// a seeded generator: the same seed, the same numbers
export function rng(seed) {
  let a = (Math.floor(seed) + 0x9e3779b9) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// The nine points (as for a radial gradient) as shares of the box.
const AT = { center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5], 'left top': [0, 0], 'right top': [1, 0], 'left bottom': [0, 1], 'right bottom': [1, 1] };

const circle = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
const poly = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;

// A lattice of spacing s turned by `deg` about the box's centre: the points (u, v) of the turned frame that land in the box (grown by `pad`).
function lattice(w, h, s, deg, pad, cb) {
  const th = (deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th), cx = w / 2, cy = h / 2;
  const R = deg ? Math.hypot(w, h) / 2 + pad : 0;
  const [u0, u1, v0, v1] = deg ? [-R, R, -R, R] : [-cx - pad, cx + pad, -cy - pad, cy + pad];
  const i0 = Math.floor(u0 / s), i1 = Math.ceil(u1 / s), j0 = Math.floor(v0 / s), j1 = Math.ceil(v1 / s);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const u = i * s, v = j * s, x = cx + u * cos - v * sin, y = cy + u * sin + v * cos;
    if (x < -pad || x > w + pad || y < -pad || y > h + pad) continue;
    cb(x, y, i, j);
  }
}
// The spacing a lattice pattern takes: its scale, grown (deterministically) when the box would hold more marks than the limit.
function spacing(w, h, s, deg) {
  const span = deg ? Math.hypot(w, h) : Math.max(w, h), n = ((deg ? span : w) / s + 2) * ((deg ? span : h) / s + 2);
  return n > BACKDROP_LIMITS.lattice ? s * Math.sqrt(n / BACKDROP_LIMITS.lattice) : s;
}
// Lines across the turned frame (v = k): each a band `bw` thick from one side of the frame to the other, as a polygon.
function bands(w, h, s, deg, bw, cb) {
  const th = (deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th), cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2 + s;
  const P = (u, v) => [cx + u * cos - v * sin, cy + u * sin + v * cos];
  for (let k = Math.floor(-R / s) * s; k <= R; k += s) cb([P(-R, k - bw / 2), P(R, k - bw / 2), P(R, k + bw / 2), P(-R, k + bw / 2)], k);
}

// o: { pattern, w, h, scale, density, angle, seed, at, two } (two: a second colour is given). Returns the paths and how many marks they hold.
export function backdropGeometry(o) {
  const dflt = (v, x) => (v === undefined ? x : v);
  const w = fin(o.w, 'w'), h = fin(o.h, 'h'), d = fin(dflt(o.density, 0.5), 'density'), deg = fin(dflt(o.angle, 0), 'angle'), seed = fin(dflt(o.seed, 1), 'seed');
  let s = fin(dflt(o.scale, 40), 'scale');
  if (w <= 0 || h <= 0 || w > 4000 || h > 4000) throw new Error('backdrop: the box must be 1 to 4000 px each way');
  if (s < BACKDROP_LIMITS.scale[0] || s > BACKDROP_LIMITS.scale[1] || d < 0.1 || d > 1 || deg < 0 || deg > 179 || seed < BACKDROP_LIMITS.seed[0] || seed > BACKDROP_LIMITS.seed[1]) throw new Error('backdrop: a number is out of range');
  const at = AT[o.at ?? (o.pattern === 'halftone' ? 'left top' : 'center')];
  if (!at) throw new Error('backdrop: at must be one of the nine points');
  const A = [], B = [];
  let marks = 0;
  const put = (list, piece) => { if (marks >= BACKDROP_LIMITS.marks) return; list.push(piece); marks++; };
  switch (o.pattern) {
    case 'dots': {
      s = spacing(w, h, s, deg); const r = s * (0.06 + 0.34 * d);
      lattice(w, h, s, deg, r, (x, y) => put(A, circle(x, y, r)));
      break;
    }
    case 'halftone': {
      // dots that shrink with their distance from a point: largest at `at`, gone at the far side of the box
      s = spacing(w, h, s, deg); const rmax = s * (0.2 + 0.3 * d), ox = at[0] * w, oy = at[1] * h;
      const far = Math.max(...[[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => Math.hypot(x - ox, y - oy))) || 1;
      lattice(w, h, s, deg, rmax, (x, y) => { const r = rmax * (1 - Math.hypot(x - ox, y - oy) / far); if (r >= 0.6) put(A, circle(x, y, r)); });
      break;
    }
    case 'grid': {
      s = spacing(w, h, s, deg); const lw = Math.min(12, Math.max(1, s * (0.02 + 0.06 * d)));
      bands(w, h, s, deg, lw, (p) => put(A, poly(p)));
      bands(w, h, s, (deg + 90) % 180, lw, (p) => put(A, poly(p)));
      break;
    }
    case 'stripes': {
      const bw = s * (0.1 + 0.6 * d);
      bands(w, h, s, deg, bw, (p) => put(A, poly(p)));
      break;
    }
    case 'checker': {
      s = spacing(w, h, s, deg); const side = s * (0.5 + 0.5 * d), th = (deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
      lattice(w, h, s, deg, s, (x, y, i, j) => {
        if ((i + j) % 2) return;
        const hs = side / 2, P = (u, v) => [x + u * cos - v * sin, y + u * sin + v * cos];
        put(A, poly([P(-hs, -hs), P(hs, -hs), P(hs, hs), P(-hs, hs)]));
      });
      break;
    }
    case 'plus': {
      s = spacing(w, h, s, deg); const L = s * (0.15 + 0.25 * d), t = Math.max(1.5, L * 0.3), th = (deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
      lattice(w, h, s, deg, L, (x, y) => {
        const P = (u, v) => [x + u * cos - v * sin, y + u * sin + v * cos];
        put(A, poly([P(-L, -t / 2), P(L, -t / 2), P(L, t / 2), P(-L, t / 2)]) + poly([P(-t / 2, -L), P(t / 2, -L), P(t / 2, L), P(-t / 2, L)]));
      });
      break;
    }
    case 'rings': {
      // concentric circles round `at`, a stroke each (the kit draws these paths stroked)
      const ox = at[0] * w, oy = at[1] * h, far = Math.max(...[[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => Math.hypot(x - ox, y - oy)));
      if (far / s > BACKDROP_LIMITS.rings) s = far / BACKDROP_LIMITS.rings;
      for (let r = s; r <= far + s; r += s) put(A, circle(ox, oy, r));
      return { paths: [{ d: A.join(''), stroke: Math.min(40, Math.max(1, s * (0.05 + 0.35 * d))) }], marks, scale: s };
    }
    case 'waves': {
      // rows of a smooth wave (quadratic segments mirrored with T), a stroke each, turned by the angle
      // rows times half waves stay under the lattice limit (the spacing grows, as for the other patterns)
      { const R0 = Math.hypot(w, h) / 2 + s * 3, n = ((2 * R0) / s) * ((2 * R0) / (s * 1.5)); if (n > BACKDROP_LIMITS.lattice) s *= Math.sqrt(n / BACKDROP_LIMITS.lattice); }
      const amp = s * (0.12 + 0.3 * d), lambda = s * 3, th = (deg * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th), cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2 + lambda;
      const P = (u, v) => `${f(cx + u * cos - v * sin)} ${f(cy + u * sin + v * cos)}`;
      for (let k = Math.floor(-R / s) * s; k <= R; k += s) {
        let seg = `M${P(-R, k)}Q${P(-R + lambda / 4, k - amp)} ${P(-R + lambda / 2, k)}`;
        for (let u = -R + lambda; u <= R + lambda / 2; u += lambda / 2) seg += `T${P(u, k)}`;
        put(A, seg);
      }
      return { paths: [{ d: A.join(''), stroke: Math.min(24, Math.max(1.5, s * (0.03 + 0.08 * d))) }], marks, scale: s };
    }
    case 'confetti': {
      // shipped shapes (a dot, a square, a triangle, a bar, a ring segment as a dot) scattered on a jittered grid; turned and coloured by the seed
      const R = rng(seed), cell = Math.max(s, s / Math.sqrt(d)), m = s * 0.32;
      const n = Math.ceil(w / cell) * Math.ceil(h / cell);
      const c = n > BACKDROP_LIMITS.confetti ? cell * Math.sqrt(n / BACKDROP_LIMITS.confetti) : cell;
      for (let y = 0; y < h; y += c) for (let x = 0; x < w; x += c) {
        const px = x + R() * c, py = y + R() * c, kind = Math.floor(R() * 4), rot = R() * Math.PI, list = o.two && R() < 0.5 ? B : A;
        const cos = Math.cos(rot), sin = Math.sin(rot), P = (u, v) => [px + u * cos - v * sin, py + u * sin + v * cos];
        if (kind === 0) put(list, circle(px, py, m * 0.5));
        else if (kind === 1) put(list, poly([P(-m / 2, -m / 2), P(m / 2, -m / 2), P(m / 2, m / 2), P(-m / 2, m / 2)]));
        else if (kind === 2) put(list, poly([P(0, -m * 0.6), P(m * 0.55, m * 0.4), P(-m * 0.55, m * 0.4)]));
        else put(list, poly([P(-m * 0.8, -m * 0.16), P(m * 0.8, -m * 0.16), P(m * 0.8, m * 0.16), P(-m * 0.8, m * 0.16)]));
      }
      return { paths: [{ d: A.join('') }, ...(B.length ? [{ d: B.join(''), second: true }] : [])], marks, scale: c };
    }
    case 'blobs': {
      // a soft mesh of two to four blobs (radial gradients), placed by the seed; the scale sets how large they are
      const R = rng(seed), count = 2 + Math.round(d * 2), size = Math.round(28 + ((s - 12) / 228) * 44);
      const blobs = Array.from({ length: count }, (_, i) => ({ x: Math.round(8 + R() * 84), y: Math.round(8 + R() * 84), r: Math.max(20, Math.min(80, Math.round(size * (0.8 + R() * 0.4)))), second: !!o.two && i % 2 === 1 }));
      return { paths: [], blobs, marks: count, scale: s };
    }
    default: throw new Error('backdrop: unknown pattern');
  }
  return { paths: [{ d: A.join('') }], marks, scale: s };
}
