// Pure maths and geometry for the automatic checks. Tested without a browser.

// Relative luminance (WCAG) of an sRGB colour given as 0-255 channels.
export function luminance(r, g, b) {
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export const contrastRatio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

// A ratio that is below its target, as text for a message. The check compares the true ratio; this only prints it, to one decimal
// when that still reads as below the target, else to two decimals cut off (never rounded up), so a warning never says
// "4.5:1 (needs 4.5:1)".
// ---- the contrast target of LARGE display type on a post (a direction or look page) ----
// A brand's contrast.display (3 to 7, default 4.5) is the target for text that is large on the feed canvas: a rendered size of at least
// LARGE_DISPLAY_PX (64 px on a 1080 px wide image is about 24 CSS px at phone size, the large-text threshold of WCAG) at a weight of
// 400 or more. Smaller text keeps its own target (brand.contrast headline, accent, sub, label ...). It is a brand accessibility
// setting: a look cannot change it, and nothing here lowers a target below the 3:1 floor.
export const LARGE_DISPLAY_PX = 64;
export const DISPLAY_CONTRAST = Object.freeze({ min: 3, max: 7, default: 4.5 });
export const displayTarget = (brand) => { const v = brand?.contrast?.display; return typeof v === 'number' && Number.isFinite(v) && v >= DISPLAY_CONTRAST.min && v <= DISPLAY_CONTRAST.max ? v : DISPLAY_CONTRAST.default; };
// The target one measured text of a post page is held to: `key` is the brand.contrast key its role maps to; size (px) and weight are as rendered.
export function postContrastNeed(brand, key, { size = 0, weight = 400 } = {}) {
  if (['headline', 'accent', 'label'].includes(key) && size >= LARGE_DISPLAY_PX && weight >= 400) return displayTarget(brand);
  return Number(brand?.contrast?.[key]);
}

export function ratioBelow(ratio, need) {
  const one = ratio.toFixed(1);
  return Number(one) < need ? one : (Math.floor(ratio * 100) / 100).toFixed(2);
}

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
    const over = { bottom: u.y1 - lim.y1, top: lim.y0 - u.y0, right: u.x1 - lim.x1, left: lim.x0 - u.x0 - (r.optical || 0) };
    // (a headline pulled left by its first letter's side bearing, data-optical, has its INK on the margin: its box may stand that far outside)
    // a post's numeral may bleed off the edges it names (data-bleed="left bottom", or "all")
    const bleeds = r.bleed ? (r.bleed === 'all' ? Object.keys(over) : r.bleed.split(' ')) : [];
    for (const [edge, px] of Object.entries(over)) if (px > 1 && !bleeds.includes(edge)) problems.push({ kind: 'outside', role: r.role, text: r.text, edge, px: Math.round(px) });
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
  // A chart stays inside its box: every mark (its stroke included) and every word of it (m.charts, runtime.mjs measure).
  for (const ch of m.charts ?? []) {
    if (!ch.ink) continue;
    const out = { top: ch.box.y0 - ch.ink.y0, bottom: ch.ink.y1 - ch.box.y1, left: ch.box.x0 - ch.ink.x0, right: ch.ink.x1 - ch.box.x1 };
    const [edge, px] = Object.entries(out).sort((a, b) => b[1] - a[1])[0];
    if (px > 1) problems.push({ kind: 'chart', role: 'chart', text: 'chart', edge, px: Math.round(px) });
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

// ---- page covers: the brand's words inside their box ----
// The most lines a cover's tagline may take once it wraps.
export const COVER_TAGLINE_LINES = 2;
// boxes = what window.__ds.coverBoxes() returned; S = the cover size ({ w, h, pad, top, bottom? }). Every word of a cover (the
// logo, tagline, descriptor and website, the website included) stays inside its box (the coverWords block's rectangle) and inside
// the size's margins, whichever is tighter on each side, and the tagline takes at most COVER_TAGLINE_LINES lines. On top of
// findLayoutProblems, never instead of it.
export function findCoverProblems(boxes, S) {
  const problems = [];
  const page = { x0: S.pad, x1: S.w - S.pad, y0: S.top, y1: S.h - (S.bottom ?? S.pad) };
  for (const { box, words } of boxes ?? []) {
    const lim = {
      left: box.x0 >= page.x0 ? [box.x0, 'box'] : [page.x0, 'margin'], right: box.x1 <= page.x1 ? [box.x1, 'box'] : [page.x1, 'margin'],
      top: box.y0 >= page.y0 ? [box.y0, 'box'] : [page.y0, 'margin'], bottom: box.y1 <= page.y1 ? [box.y1, 'box'] : [page.y1, 'margin'],
    };
    const seen = words.filter((w) => w.rects.length).map((w) => ({ w, u: union(w.role === 'logo' ? w.rects : w.rects.map(core)) }));
    // Words stacked taller than the room there is are too many words, whichever of them reaches past the edge.
    const all = union(seen.map((x) => x.u)), room = lim.bottom[0] - lim.top[0];
    const tall = seen.length > 0 && all.y1 - all.y0 > room + 1;
    if (tall) problems.push({ kind: 'covertall', role: 'words', text: seen.map((x) => x.w.text).filter(Boolean).join(' / ').slice(0, 80), px: Math.round(all.y1 - all.y0 - room), room: Math.round(room) });
    for (const { w, u } of seen) {
      const over = { left: lim.left[0] - u.x0, right: u.x1 - lim.right[0], top: tall ? 0 : lim.top[0] - u.y0, bottom: tall ? 0 : u.y1 - lim.bottom[0] };
      for (const [edge, px] of Object.entries(over)) if (px > 1) problems.push({ kind: 'coverout', role: w.role, text: w.text, edge, of: lim[edge][1], px: Math.round(px) });
      if (w.role === 'headline' && w.lines > COVER_TAGLINE_LINES) problems.push({ kind: 'coverlines', role: w.role, text: w.text, lines: w.lines });
    }
  }
  return problems;
}

const COVER_WORDS = { headline: 'tagline', sub: 'descriptor', url: 'website', logo: 'logo' };
// Why a cover's words do not fit, naming the cover and the words. tagline: { size, min } (px: the layout's, and the smallest tried).
export function explainCoverProblems(problems, sizeName, { size, min } = {}) {
  const w = (r) => COVER_WORDS[r] ?? r;
  const lines = problems.map((p) => {
    const what = p.role === 'logo' ? 'the logo' : `the ${w(p.role)} ("${p.text}")`;
    if (p.kind === 'coverlines') return `${what} takes ${p.lines} lines (at most ${COVER_TAGLINE_LINES})`;
    if (p.kind === 'covertall') return `the words stand ${p.px} px taller than the ${p.room} px of their box`;
    return `${what} runs ${p.px} px ${p.of === 'box' ? `out of the ${p.edge} of its box` : `past the ${p.edge} margin`}`;
  });
  const tried = size ? ` even with the tagline set from ${size} px down to ${min} px, on one line and wrapped over ${COVER_TAGLINE_LINES} lines` : '';
  return `The brand's words do not fit the ${sizeName} cover${tried}: ${[...new Set(lines)].join('; ')}. Shorten the brand's tagline, descriptor or website (Settings, Brand and look); a cover never draws clipped words.`;
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
    if (p.kind === 'chart') return `the chart runs ${p.px} px out of the ${p.edge} of its box`;
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

// ---- design directions: the checks of a `post` page (lib/design/directions/) ----
// m = what window.__ds.postMetrics() returned; grid = { lefts, rights, centre } of the direction. Pure, so it is tested without Chrome.
//   EMPTINESS  the largest rectangle that no text, picture or deliberate filled device covers is at most 45% of the page, or the
//              composition's own declared calm area (calm: { maxShare }, set on the page as data-calm);
//   SCALE      the headline (or the big numeral) is at least 2.6 times the size of the body text, when both exist;
//   LEVELS     the page uses at most three sizes of type (within 2 px); a headline fitted line by line counts as one;
//   GRID       every text block's edge sits on the margin or a column line (within 2 px), unless it is marked data-grid="skip".
//   EDGE       no line of text has its ink within 10 px of the edge of a filled block or rule (or crossing it), nor sits that close to
//              the edge of the block it is inside (a descender touching a rule, a headline under a block, a price on its block's foot).
export const POST_LIMITS = Object.freeze({ emptyShare: 0.45, scale: 2.6, levels: 3, tol: 2, edge: 10 });
// How far the ink box i is from the filled shape f: a negative number is the room above or below the text inside f (its sides may stand
// 12 px out or close, for a letter's side bearing and a headline pulled onto the margin), else the distance outside it (0 when they cross).
export function inkGap(i, f) {
  const inside = i.x0 >= f.x0 - 12 && i.x1 <= f.x1 + 12 && i.y0 >= f.y0 && i.y1 <= f.y1;
  if (inside) return -Math.min(i.y0 - f.y0, f.y1 - i.y1);
  return Math.hypot(Math.max(f.x0 - i.x1, i.x0 - f.x1, 0), Math.max(f.y0 - i.y1, i.y0 - f.y1, 0));
}
export function findPostProblems(m, { grid } = {}) {
  const problems = [], L = POST_LIMITS, hs = m.hs || 1;
  const limit = Number.isFinite(m.calm) ? Math.max(L.emptyShare, m.calm) : L.emptyShare;
  if (m.empty && m.empty.share > limit + 1e-9) problems.push({ kind: 'empty', share: m.empty.share, limit, rect: m.empty });
  // sizes as designed: a scalable headline is judged at the size it was drawn for, before the fit loop shrank it
  // (an accent phrase inside a headline is scaled with it, and so is any text the page marks data-scaled)
  const designed = (t) => (t.fit ? t.size : t.role === 'headline' || t.role === 'stat' || t.scaled || (t.role === 'accent' && t.inHead) ? t.size / hs : t.size);
  const head = m.texts.filter((t) => t.role === 'headline' || t.role === 'stat'), body = m.texts.filter((t) => t.role === 'sub');
  if (head.length && body.length) {
    const h = Math.min(...head.map(designed)), b = Math.max(...body.map(designed));
    if (h / b < L.scale - 0.005) problems.push({ kind: 'scale', ratio: h / b, headline: Math.round(h), body: Math.round(b) });
  }
  const sizes = [...new Set(m.texts.filter((t) => !t.fit).map((t) => Math.round(designed(t))))].sort((a, b) => a - b);
  const levels = []; for (const z of sizes) if (!levels.length || z - levels[levels.length - 1][levels[levels.length - 1].length - 1] > L.tol) levels.push([z]); else levels[levels.length - 1].push(z);
  const count = levels.length + (m.texts.some((t) => t.fit) ? 1 : 0);
  if (count > L.levels) problems.push({ kind: 'levels', count, sizes: [...levels.map((g) => Math.round(g.reduce((a, b) => a + b, 0) / g.length)), ...(m.texts.some((t) => t.fit) ? ['fitted headline'] : [])] });
  for (const i of m.inks ?? []) {
    for (const f of m.shapes ?? []) {
      if ((f.frame ?? '') !== (i.frame ?? '')) continue;
      // a chart's own words against its own box: held to their cells instead (runtime postMetrics)
      if (f.chart !== undefined && f.chart === i.chart) continue;
      const g = inkGap(i, f);
      if (Math.abs(g) < L.edge) { problems.push({ kind: 'edge', role: i.role, text: i.text, gap: Math.round(Math.abs(g)), inside: g < 0, crossing: g === 0 }); break; }
    }
  }
  if (grid) {
    const near = (x, xs) => xs.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), xs[0]);
    for (const b of m.blocks ?? []) {
      if (b.mode === 'skip') continue;
      const [x, xs] = b.mode === 'right' ? [b.x1, grid.rights] : b.mode === 'center' ? [(b.x0 + b.x1) / 2, [grid.centre]] : [b.x0, grid.lefts];
      const n = near(x, xs);
      if (Math.abs(n - x) > L.tol) problems.push({ kind: 'grid', role: b.role, text: b.text, x: Math.round(x * 10) / 10, nearest: Math.round(n * 10) / 10, mode: b.mode });
    }
  }
  return problems;
}

export function explainPostProblems(problems, post = {}) {
  const who = post.id ? ` (${post.id})` : '';
  const lines = problems.map((p) => {
    if (p.kind === 'empty') return `an empty area covers ${Math.round(p.share * 100)}% of the page (at most ${Math.round(p.limit * 100)}% is allowed here), at x ${Math.round(p.rect.x0)}-${Math.round(p.rect.x1)}, y ${Math.round(p.rect.y0)}-${Math.round(p.rect.y1)}: use longer words, a picture or another variant`;
    if (p.kind === 'scale') return `the headline is ${p.headline} px against ${p.body} px of body text, ${p.ratio.toFixed(2)} times (it needs at least ${POST_LIMITS.scale}): shorten the sub line or use another variant`;
    if (p.kind === 'levels') return `the page sets type in ${p.count} sizes (${p.sizes.join(', ')}); at most ${POST_LIMITS.levels} levels are allowed`;
    if (p.kind === 'edge') return `the ${p.role || 'text'} "${p.text}" ${p.crossing ? 'runs into' : `is only ${p.gap} px ${p.inside ? 'inside' : 'from'}`} the edge of a block or rule (it needs ${POST_LIMITS.edge} px clear): move the text or the block, or shorten the words`;
    return `the ${p.role} "${p.text}" starts at x ${p.x}, which is not on the margin or a column line (nearest ${p.nearest})`;
  });
  return `The page does not meet the design rules${who}: ${[...new Set(lines)].join('; ')}.`;
}

// The length to suggest for words that do not fit: the estimate, but always fewer characters than they have now (an estimate from widths can
// come out at the length that just failed, and "shorten it to about 9 characters (it is 9)" helps nobody). null when there is nothing shorter.
export function shorterLength(est, chars) {
  const n = Math.min(Math.floor(Number(est) || 0), Math.floor(Number(chars) || 0) - 1);
  return n >= 1 ? n : null;
}

// Why a headline fitted line by line (fitLines) does not fit: too many words for the box at the smallest size the direction allows.
export function explainFitLines(f, kind = 'headline') {
  const about = shorterLength(f.est, f.chars);
  return `The ${kind} is too long to set at a size that reads: it would need ${f.lines} lines of ${Math.round(f.min)} px at the most, under the smallest size allowed here (${Math.round(f.floor)} px) or taller than its ${Math.round(f.h)} px box. ${about ? `Shorten the ${kind} to about ${about} characters (it is ${f.chars}).` : `Use fewer or shorter words in the ${kind}.`}`;
}

// Why a post headline does not fit even at the smallest size the fit loop may use (82% of its designed size). fraction: the share of
// the headline's height that fits (its height less the overflow, over its height), from which roughly how many characters would.
export function explainPostFit(problems, { chars = 0, scale = 0.82, fraction = 0, kind = 'headline' } = {}) {
  const mine = problems.some((p) => ['headline', 'stat', 'accent'].includes(p.role) || ['headline', 'stat', 'accent'].includes(p.other));
  const about = mine && chars && fraction > 0 ? shorterLength(Math.max(6, Math.floor(chars * Math.min(0.95, fraction) * 0.95)), chars) : null;
  const lines = [...new Set(problems.map((p) => (p.kind === 'chart' ? `the chart runs ${p.px} px out of the ${p.edge} of its box` : `the ${p.role} ("${p.text}") ${p.kind === 'overlap' ? `overlaps the ${p.other}` : p.px ? `runs ${p.px} px out of its place` : 'does not fit'}`)))];
  return `The text does not fit the post at the smallest size allowed (${Math.round(scale * 100)}% of the designed size): ${lines.join('; ')}.${about ? ` Shorten the ${kind} to about ${about} characters (it is ${chars}).` : ''}`;
}
