// Pure maths and geometry for the automatic checks. Tested without a browser.

// Relative luminance (WCAG) of an sRGB colour given as 0-255 channels.
export function luminance(r, g, b) {
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export const contrastRatio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// Worst-case contrast of text of luminance `textL` over background pixels of the given luminances: light text is judged against
// the brightest part of its background (95th percentile, so one specular speck does not decide), dark text against the darkest.
export function worstContrast(textL, bgLuminances) {
  if (!bgLuminances.length) return Infinity;
  const sorted = [...bgLuminances].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  const light = textL >= 0.18;
  return contrastRatio(textL, light ? q(0.95) : q(0.05));
}

// How much an image is enlarged. cover: fills the whole box; width: shown at box width.
export function upscaleFactor({ nw, nh, boxW, boxH, fit = 'cover' }) {
  if (!nw || !nh) return 1;
  return fit === 'cover' ? Math.max(boxW / nw, boxH / nh) : boxW / nw;
}
export function upscaleWarning({ src, nw, nh, boxW, boxH, fit, sizeName, max }) {
  const f = upscaleFactor({ nw, nh, boxW, boxH, fit });
  if (f <= max) return null;
  const need = Math.ceil(fit === 'cover' ? Math.max((boxW / max), (boxH / max) * (nw / nh)) : boxW / max);
  return `${src} is ${nw}x${nh} px and is enlarged ${f.toFixed(2)}x to fill ${Math.round(boxW)}x${Math.round(boxH)} at ${sizeName}; it will look soft (use an image at least ${need} px wide)`;
}

// ---- thin lines (arcs and corner brackets) ----
const rad = (d) => (d * Math.PI) / 180;
export function arcPoints(s, W, H, n = 60) {
  const r = Number(s.r) * W, cx = Number(s.x) * W, cy = Number(s.y) * H;
  const span = (((s.a1 - s.a0) % 360) + 360) % 360 || 360;
  return Array.from({ length: n + 1 }, (_, i) => { const a = rad(s.a0 + (span * i) / n); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
}
function bracketPoints(s, W, H) {
  const x = s.x * W, y = s.y * H, l = s.l * W, dx = s.dx ?? 1, dy = s.dy ?? 1;
  return [[x, y + dy * l], [x, y], [x + dx * l, y]];
}
export const shapePoints = (s, W, H) => (s.t === 'arc' ? arcPoints(s, W, H) : bracketPoints(s, W, H));

// ---- shapes: validated at the spec boundary AND again before drawing (defence in depth) ----
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
// Problems with one shape, as plain texts. A shape is { t: "arc", x, y, r, a0, a1 } or { t: "br", x, y, l, dx, dy },
// each optionally with c ("gold" or "white"), o (opacity 0-1) and w (line width up to 20 px).
export function shapeProblems(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['is not an object'];
  const bad = [];
  const need = (k, lo, hi) => { if (!isNum(s[k], lo, hi)) bad.push(`${k} must be a number from ${lo} to ${hi}`); };
  if (s.t !== 'arc' && s.t !== 'br') return ['t must be "arc" or "br"'];
  need('x', -1, 2); need('y', -1, 2);
  if (s.t === 'arc') { need('r', 0.01, 3); need('a0', -720, 720); need('a1', -720, 720); }
  else { need('l', 0.001, 1); if (s.dx !== undefined && s.dx !== 1 && s.dx !== -1) bad.push('dx must be 1 or -1'); if (s.dy !== undefined && s.dy !== 1 && s.dy !== -1) bad.push('dy must be 1 or -1'); }
  if (s.c !== undefined && s.c !== 'gold' && s.c !== 'white') bad.push('c must be "gold" or "white"');
  if (s.o !== undefined) need('o', 0, 1);
  if (s.w !== undefined) need('w', 0.1, 20);
  return bad;
}
// The shape with only known fields, as real numbers; null when anything is not usable.
export function cleanShape(s) {
  if (!s || typeof s !== 'object') return null;
  const n = (k) => Number(s[k]);
  const out = { t: s.t, x: n('x'), y: n('y'), c: s.c === 'gold' ? 'gold' : 'white', o: s.o === undefined ? 0.9 : n('o'), w: s.w === undefined ? 3 : n('w') };
  if (s.t === 'arc') Object.assign(out, { r: n('r'), a0: n('a0'), a1: n('a1') });
  else if (s.t === 'br') Object.assign(out, { l: n('l'), dx: s.dx === -1 ? -1 : 1, dy: s.dy === -1 ? -1 : 1 });
  else return null;
  return Object.values(out).every((v) => typeof v === 'string' || Number.isFinite(v)) && shapeProblems({ ...out }).length === 0 ? out : null;
}

// Shapes as fractions of the canvas width (x, y also of width/height), drawn in white or brand gold. The markup is built from
// numbers and two fixed colours only; a shape that does not validate is dropped.
export function linesToSvg(shapes, W, H, goldHex) {
  const gold = /^#[0-9a-fA-F]{6}$/.test(goldHex) ? goldHex : '#ecb12a';
  const f = (v) => (Math.round(v * 10) / 10).toString();
  return (Array.isArray(shapes) ? shapes : []).map(cleanShape).filter(Boolean).map((s) => {
    const c = s.c === 'gold' ? gold : '#fff';
    if (s.t === 'arc') {
      const r = s.r * W, cx = s.x * W, cy = s.y * H;
      const p = (a) => `${f(cx + r * Math.cos(rad(a)))} ${f(cy + r * Math.sin(rad(a)))}`;
      const span = (((s.a1 - s.a0) % 360) + 360) % 360 || 360;
      return `<path d="M ${p(s.a0)} A ${f(r)} ${f(r)} 0 ${span > 180 ? 1 : 0} 1 ${p(s.a1)}" stroke="${c}" stroke-width="${f(s.w)}" opacity="${f(s.o * 100) / 100}"/>`;
    }
    const x = s.x * W, y = s.y * H, l = s.l * W;
    return `<path d="M ${f(x)} ${f(y + s.dy * l)} L ${f(x)} ${f(y)} L ${f(x + s.dx * l)} ${f(y)}" stroke="${c}" stroke-width="${f(s.w)}" opacity="${f(s.o * 100) / 100}" stroke-linejoin="round"/>`;
  }).join('');
}

const hashOf = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const hits = (pts, rects, pad) => pts.some(([x, y]) => rects.some((r) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad));

// Picks line shapes for a photo post when none are given: an arc (with a thin gold arc inside it) on the side away from the
// text, and a corner bracket in the free corner. `avoid` is a list of {x0,y0,x1,y1} in pixels (text lines, footer).
// Deterministic for a given seed. Returns { shapes, note }: an empty list and a note when nothing fits.
export function autoLines({ W, H, avoid, zone, seed }) {
  const zy = zone.y1 - zone.y0, mid = zone.y0 + zy / 2;
  const presets = [
    { x: 0.97, y: mid / H, r: 0.38, a0: 115, a1: 245 },
    { x: 0.03, y: mid / H, r: 0.38, a0: 295, a1: 65 },
    { x: 0.5, y: (zone.y1 + 0.1 * H) / H, r: 0.4, a0: 200, a1: 340 },
    { x: 0.5, y: (zone.y0 - 0.1 * H) / H, r: 0.4, a0: 20, a1: 160 },
    { x: 0.92, y: (mid - 0.1 * H) / H, r: 0.3, a0: 105, a1: 255 },
  ];
  const start = hashOf(seed) % presets.length;
  for (let k = 0; k < presets.length; k++) {
    const p = presets[(start + k) % presets.length];
    const outer = { t: 'arc', ...p };
    const pts = arcPoints(outer, W, H);
    const inside = pts.filter(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H);
    if (inside.length < pts.length * 0.4) continue;
    if (hits(inside, avoid, 28)) continue;
    const inner = { t: 'arc', ...p, r: p.r * 0.84, a0: (p.a0 + 6) % 360, a1: (((p.a1 - 6) % 360) + 360) % 360, c: 'gold' };
    const shapes = [outer, inner];
    const bx = 0.92, by = zone.y0 / H + 0.02;
    const br = { t: 'br', x: bx, y: by, l: 0.07, dx: -1, dy: 1 };
    if (!hits(bracketPoints(br, W, H), avoid, 24) && !hits(inside, [{ x0: br.x * W - br.l * W, y0: br.y * H, x1: br.x * W, y1: br.y * H + br.l * W }], 10)) shapes.push(br);
    return { shapes, note: null };
  }
  return { shapes: [], note: 'no free space for the thin lines next to the text; none were drawn (give coordinates in "lines", or use --no-lines to silence this)' };
}

// ---- image file sizes, read from the bytes ----
export function pngSize(buf) {
  return buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47 ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : null;
}
export function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
// WebP: the canvas size of an extended file (VP8X), or the frame size of a lossless (VP8L) or lossy (VP8) one.
export function webpSize(buf) {
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  if (chunk === 'VP8L') { const v = buf.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >>> 14) & 0x3fff) + 1 }; }
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  return null;
}
export const imageSize = (buf) => pngSize(buf) ?? jpegSize(buf) ?? webpSize(buf);

// ---- layout problems, from the page's measurements ----
const union = (rects) => rects.reduce((u, r) => ({ x0: Math.min(u.x0, r.x0), y0: Math.min(u.y0, r.y0), x1: Math.max(u.x1, r.x1), y1: Math.max(u.y1, r.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
// Text rectangles include the font's ascent and descent, which tight line heights make overlap harmlessly; judge the middle 80%.
const core = (r) => ({ x0: r.x0, x1: r.x1, y0: r.y0 + (r.y1 - r.y0) * 0.1, y1: r.y1 - (r.y1 - r.y0) * 0.1 });
const overlap = (a0, b0, tol = 3) => { const a = core(a0), b = core(b0); return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > tol && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > tol; };
export const SCALABLE = new Set(['headline', 'stat']);
// The footer label and the website line sit below the text area on purpose.
const EXEMPT_EDGE = new Set(['url', 'foot', 'logo']);
const hit = (a, b, tol = 2) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > tol && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > tol;

// m = what window.__ds.measure() returned; S = the size's margins. Looks for text outside the safe area, text running into
// other text or into a picture, a screenshot or an object it does not belong to, text straddling the edge of the panel, body
// text under its minimum size, single-line numbers wider than their box, and drawn objects that leave the page, run into the
// footer or the logo, or lie on each other. (Text inside an object, and an artefact's own text, is judged by the object it is on.)
export function findLayoutProblems(m, S) {
  const problems = [];
  // Text stays above the footer, and under it when the brand's logo put the footer at the top (m.header); then, with nothing at
  // the foot, above the footer's band there too (a story's bottom band, which the app's interface covers).
  const bottom = Math.max(S.bottom ?? S.pad, m.header ? S.fbot ?? 0 : 0);
  const lim = { x0: S.pad - 3, x1: m.W - S.pad + 3, y0: m.header ? Math.max(S.top - 6, m.header.y1 + 10) : S.top - 6, y1: m.footer ? m.footer.y0 - 10 : m.H - bottom + 3 };
  const roles = m.roles.filter((r) => r.rects.length);
  const own = roles.filter((r) => !r.nested);
  for (const r of own) {
    if (EXEMPT_EDGE.has(r.role)) continue;
    const u = union(r.rects.map(core));
    const over = { bottom: u.y1 - lim.y1, top: lim.y0 - u.y0, right: u.x1 - lim.x1, left: lim.x0 - u.x0 };
    for (const [edge, px] of Object.entries(over)) if (px > 1) problems.push({ kind: 'outside', role: r.role, text: r.text, edge, px: Math.round(px) });
    if (r.overX > 1) problems.push({ kind: 'wide', role: r.role, text: r.text, px: Math.round(r.overX) });
    // A layout's text stays in its own cell (its slot on the grid): text that runs out of it is too long for the slot.
    if (r.cell) {
      const out = { bottom: u.y1 - r.cell.y1, top: r.cell.y0 - u.y0, right: u.x1 - r.cell.x1, left: r.cell.x0 - u.x0 };
      const tol = { bottom: 3, top: 3, right: 6, left: 6 };
      const [edge, px] = Object.entries(out).sort((a, b) => b[1] - a[1])[0];
      if (px > tol[edge]) problems.push({ kind: 'cell', role: r.role, text: r.text, edge, px: Math.round(px) });
    }
    if ((m.avoid ?? []).some((a) => !(r.inAvoid ?? []).includes(a.id) && r.rects.some((q) => overlap(q, a)))) problems.push({ kind: 'avoid', role: r.role, text: r.text });
    if (r.min && r.size < r.min) problems.push({ kind: 'small', role: r.role, text: r.text, size: Math.round(r.size), min: r.min });
    if (m.panel && !r.onpanel && !(r.inAvoid ?? []).length) {
      const c = union(r.rects.map(core));
      if (c.y0 < m.panel.y0 - 1 && c.y1 > m.panel.y0 + 2) problems.push({ kind: 'panel', role: r.role, text: r.text, px: Math.round(c.y1 - m.panel.y0) });
    }
  }
  for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) {
    const a = own[i], b = own[j];
    if (EXEMPT_EDGE.has(a.role) || EXEMPT_EDGE.has(b.role)) continue;
    if (a.rects.some((p) => b.rects.some((q) => overlap(p, q)))) problems.push({ kind: 'overlap', role: a.role, other: b.role, text: a.text });
  }
  // Drawn objects: inside the page (a phone may run off the bottom), above the footer, clear of the logo, not on each other.
  const objs = m.objs ?? [], who = m.flex ? 'headline' : 'object';
  objs.forEach((o, i) => {
    if (o.x0 < 0 || o.x1 > m.W || o.y0 < 0 || (!o.bleed && o.y1 > m.H)) problems.push({ kind: 'objout', role: who });
    if ((!o.bleed && m.footer && o.y1 > m.footer.y0 - 6) || (m.header && o.y0 < m.header.y1 + 6)) problems.push({ kind: 'objfoot', role: who });
    if (m.logo && hit(o, m.logo)) problems.push({ kind: 'objlogo', role: who });
    if (m.panel && o.y0 < m.panel.y0 - 2) problems.push({ kind: 'objpanel', role: who });
    for (let j = i + 1; j < objs.length; j++) if (hit(o, objs[j])) problems.push({ kind: 'objoverlap', role: who });
  });
  return problems;
}

const ROLE_WORDS = { headline: 'headline', stat: 'big number', statlabel: 'number label', sub: 'sub line', eyebrow: 'eyebrow', label: 'label', foot: 'footer label', logo: 'logo', art: 'text on the artefact', artbody: 'text on the artefact', accent: 'accent phrase' };
export function explainProblems(problems, sizeName, lengths = {}) {
  const w = (r) => ROLE_WORDS[r] ?? r;
  const lines = problems.map((p) => {
    if (p.kind === 'outside') {
      const where = { bottom: 'past the bottom of the text area, into the footer', top: 'above the top margin', right: 'past the right margin', left: 'past the left margin' }[p.edge];
      return `the ${w(p.role)} ("${p.text}") runs ${p.px} px ${where}`;
    }
    if (p.kind === 'wide') return `the ${w(p.role)} ("${p.text}") is ${p.px} px wider than its box`;
    if (p.kind === 'cell') return `the ${w(p.role)} ("${p.text}") runs ${p.px} px out of the ${p.edge} of its slot`;
    if (p.kind === 'panel') return `the ${w(p.role)} ("${p.text}") runs ${p.px} px into the panel`;
    if (p.kind === 'small') return `the ${w(p.role)} ("${p.text}") is ${p.size} px, under the ${p.min} px minimum for body text`;
    if (p.kind === 'objout') return 'a drawn object runs off the page';
    if (p.kind === 'objfoot') return 'a drawn object runs into the footer';
    if (p.kind === 'objlogo') return 'a drawn object runs into the logo';
    if (p.kind === 'objpanel') return 'a drawn object starts above the panel it should sit on';
    if (p.kind === 'objoverlap') return 'two drawn objects overlap';
    if (p.kind === 'avoid') return `the ${w(p.role)} ("${p.text}") runs into the picture (screenshot or logo mark)`;
    return `the ${w(p.role)} ("${p.text}") overlaps the ${w(p.other)}`;
  });
  const tip = lengths.headline ? ` The headline is ${lengths.headline} characters; try about ${Math.max(12, Math.floor(lengths.headline * 0.65))}.` : '';
  return `The text does not fit the ${sizeName} format: ${[...new Set(lines)].join('; ')}. Shorten the text (a shorter headline or sub line fits; the tool already shrank the headline as far as the brand allows).${tip}`;
}
