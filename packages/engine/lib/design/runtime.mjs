// The small script that runs inside every rendered page. The driver (render.mjs) calls window.__ds.* through the DevTools
// protocol to size devices, tune the photo scrim, measure text and read the pixels behind it. No network, no libraries.
import { EDGE_LIMITS, classifyEdge } from './edge.mjs';
import { TREATED, treatPixels } from './treatment.mjs';

export const RUNTIME = String.raw`
const EDGE_LIMITS = ${JSON.stringify(EDGE_LIMITS)};
const TREATED = ${JSON.stringify(TREATED)};
${classifyEdge.toString()}
${treatPixels.toString()}
window.__ds = {
  peak: 0, hold: 0.68,
  // need: { text } the contrast the page's type needs (render.mjs passes the brand's strictest text threshold); a plain photo
  // background whose colour no type colour reaches it on does not become the page.
  async ready(need = {}) {
    const D = document.documentElement.dataset, fam = D.family, mono = D.mono;
    const faces = ['600 40px "' + fam + '"', '400 40px "' + fam + '"', '300 40px "' + fam + '"', '500 40px "' + mono + '"', '400 40px "' + mono + '"'];
    // Every face the page declares (the sans, the mono, and the display and label fonts a brand may add) is loaded before anything
    // is measured.
    try { await Promise.all([...faces.map((f) => document.fonts.load(f)), ...[...document.fonts].map((f) => f.load().catch(() => null))]); await document.fonts.ready; } catch (e) {}
    const broken = [];
    await Promise.all([...document.images].map(async (i) => {
      try { if (!i.complete) await new Promise((res, rej) => { i.onload = res; i.onerror = rej; }); await i.decode(); } catch (e) {}
      if (!i.naturalWidth) broken.push(i.getAttribute('data-name') || i.src);
    }));
    // A phone must be a pre-framed capture: the phone drawn into a transparent picture, so its four corners are see-through. A
    // plain screenshot (opaque corners) is reported, and the renderer refuses it rather than showing it as if it were a phone.
    const unframed = [];
    for (const i of document.querySelectorAll('img[data-phone]')) {
      if (!i.naturalWidth) continue;
      const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, 0, 0);
      const corners = [[0, 0], [c.width - 1, 0], [0, c.height - 1], [c.width - 1, c.height - 1]];
      if (corners.some(([a, b]) => x.getImageData(a, b, 1, 1).data[3] > 16)) unframed.push(i.getAttribute('data-name'));
    }
    // A poster photo (object, number) is one of two things, decided here from its own pixels (edge.mjs): when its top and side
    // edges are one plain colour, the page takes exactly that colour and the photo runs into it with no fade; otherwise the photo
    // stays a full-bleed band on the template's ground. The strips are read from the photo as the flush layout shows it (the crop of
    // object-fit: cover around the focal point, then the zoom) and in the colours it is drawn in: with the brand's photo treatment
    // (treatment.mjs) applied, so the page, the photo and the type picked against the page agree.
    const sampled = [], treat = this.treatment();
    for (const i of document.querySelectorAll('img[data-sample]')) {
      if (!i.naturalWidth) continue;
      const box = i.closest('.pobj'), cv = i.closest('.poster');
      box.classList.remove('band');
      // a treatment whose colours cannot be read is never guessed at: the photo stays a band on the ground
      if (treat === false) { box.classList.add('band'); sampled.push({ name: i.getAttribute('data-name'), uniform: false, untreatable: true }); continue; }
      const nw = i.naturalWidth, nh = i.naturalHeight, bw = i.offsetWidth, bh = i.offsetHeight;
      const s = Math.max(bw / nw, bh / nh), sw = bw / s, sh = bh / s, fx = +i.dataset.fx || 0, fy = +i.dataset.fy || 0;
      const tf = getComputedStyle(i).transform, z = tf && tf !== 'none' ? new DOMMatrix(tf).a || 1 : 1;
      const vw = sw / z, vh = sh / z, vx = (nw - sw) * fx + (sw - vw) * fx, vy = (nh - sh) * fy + (sh - vh) * fy;
      const grab = (x, y, w, h) => {
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, x, y, w, h, 0, 0, c.width, c.height);
        return treatPixels(g.getImageData(0, 0, c.width, c.height).data, treat);
      };
      const e = classifyEdge({ topWidth: Math.max(1, Math.round(vw)), top: grab(vx, vy, vw, vh * 0.03), left: grab(vx, vy, vw * 0.03, vh * 0.3), right: grab(vx + vw * 0.97, vy, vw * 0.03, vh * 0.3) });
      const type = e.uniform ? this.typeFor(e.columns) : null, low = !!type && type.ratio < (+need.text || 0);
      if (e.uniform && !low) this.flush(cv, e, type); else box.classList.add('band');
      sampled.push({ name: i.getAttribute('data-name'), rgb: e.rgb, uniform: e.uniform, grain: e.grain, drift: e.drift, shift: e.shift, treatment: treat ? treat.treatment : null, ...(low ? { lowContrast: type.ratio, need: +need.text } : {}) });
    }
    return { broken, unframed, sampled, fontOk: faces.slice(0, 2).every((f) => document.fonts.check(f)) };
  },
  // The brand's photo treatment as the page draws it: its kind from the page's class (styleClasses) and its colours and strength
  // from the variables brand.css draws it with (--ph-c, --ph-lo, --ph-hi, --ph-k). null without one; false if a colour cannot be
  // read as #rrggbb.
  treatment() {
    const R = document.documentElement, kind = TREATED.find((t) => R.classList.contains('st-ph-' + t));
    if (!kind) return null;
    const S = getComputedStyle(R), rgb = (n) => { const v = S.getPropertyValue(n).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? [1, 3, 5].map((k) => parseInt(v.slice(k, k + 2), 16)) : null; };
    const t = { treatment: kind, strength: parseFloat(S.getPropertyValue('--ph-k')), colour: rgb('--ph-c'), shadows: rgb('--ph-lo'), highlights: rgb('--ph-hi') };
    return t.colour && t.shadows && t.highlights && Number.isFinite(t.strength) ? t : false;
  },
  // The type for a page of these column colours: white or ink, whichever has the higher WCAG contrast against its worst column
  // ({ light, ratio, worst, hex }).
  typeFor(cols) {
    const S = getComputedStyle(document.documentElement), hex = (n) => { const v = S.getPropertyValue(n).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? [1, 3, 5].map((k) => parseInt(v.slice(k, k + 2), 16)) : null; };
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const worst = (fg) => Math.min(...cols.map((c) => { const x = lum(c), y = lum(fg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }));
    const ink = hex('--ink') || [11, 31, 26], w = worst([255, 255, 255]), k = worst(ink), light = w > k;
    return { light, ratio: light ? w : k, worst, hex };
  },
  // The page takes the photo's edge: the one colour when the edge does not drift, else its twelve column colours side by side (a
  // horizontal run of exactly the colours the photo's top row has, so the two meet with no band). No decoration (it would stop
  // at the photo). The type is set for that ground (typeFor); the accent word likewise from its own pair.
  flush(cv, e, type = this.typeFor(e.columns)) {
    const cols = e.columns, flat = e.drift < 1;
    cv.style.setProperty('--bg', flat ? 'rgb(' + e.rgb.join(',') + ')' : 'linear-gradient(to right,' + cols.map((c, k) => 'rgb(' + c.join(',') + ') ' + (((k + 0.5) / cols.length) * 100).toFixed(2) + '%').join(',') + ')');
    cv.setAttribute('data-sampled', '');
    cv.classList.remove('tex', 'dots', 'grid', 'art');
    const { light, worst, hex } = type;
    document.body.classList.toggle('dark', light);
    for (const l of cv.querySelectorAll('.logo-inv')) l.classList.toggle('logo-ink', !light);
    const accent = light ? hex('--gold') : hex('--slab-myth');
    cv.style.setProperty('--acc', accent && worst(accent) >= 4.5 ? 'rgb(' + accent.join(',') + ')' : light ? '#fff' : 'var(--ink)');
  },
  setScale(k) { document.documentElement.style.setProperty('--hs', String(k)); this.setScrim(this.peak); },
  // A page cover's tagline (lib/design/layout-cover.mjs) at k times the size its layout gave it, in whole pixels, on one line or,
  // with wrap, balanced over several lines (the renderer allows two). The layout's own size is read once from the page.
  setCoverScale(k, wrap) {
    this.coverBase = this.coverBase || new WeakMap();
    for (const el of document.querySelectorAll('.pc .col [data-role="headline"]')) {
      if (!this.coverBase.has(el)) this.coverBase.set(el, parseFloat(el.style.fontSize));
      el.style.fontSize = Math.max(1, Math.round(this.coverBase.get(el) * k)) + 'px';
      // white-space and text-wrap share text-wrap-mode: the one set last decides, so the order matters.
      if (wrap) { el.style.whiteSpace = 'normal'; el.style.textWrap = 'balance'; } else { el.style.textWrap = ''; el.style.whiteSpace = 'nowrap'; }
    }
  },
  // A page cover's word boxes: each box's rectangle, and the rectangles of the words in it (the tagline, descriptor and website
  // line by line, the logo picture whole), with the number of lines each takes.
  coverBoxes() {
    const box = (b) => ({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom });
    const lines = (rects) => { let n = 0, y = -Infinity; for (const r of [...rects].sort((a, b) => a.y0 - b.y0)) if (r.y0 > y) { n++; y = r.y0 + (r.y1 - r.y0) / 2; } return n; };
    return [...document.querySelectorAll('.pc .col')].map((col) => ({
      box: box(col.getBoundingClientRect()),
      words: [...col.querySelectorAll('[data-role], img')].map((el) => {
        const img = el.tagName === 'IMG', g = document.createRange();
        g.selectNodeContents(el);
        const rects = (img ? [el.getBoundingClientRect()] : [...g.getClientRects()]).filter((b) => b.width > 1 && b.height > 1).map(box);
        return { role: img ? 'logo' : el.dataset.role, text: img ? '' : (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50), rects, lines: img ? 1 : lines(rects), size: img ? 0 : parseFloat(getComputedStyle(el).fontSize) };
      }),
    }));
  },
  setScrim(peak) {
    this.peak = peak;
    const sc = document.getElementById('scrim'), pt = document.getElementById('pt');
    if (!sc || !pt) return;
    if (peak <= 0) { sc.style.cssText = 'display:none'; return; }
    const atTop = document.body.dataset.textat !== 'bottom', H = innerHeight, r = pt.getBoundingClientRect();
    const reach = Math.round((atTop ? r.bottom : H - r.top) * 1.25), hold = this.hold;
    const stops = Array.from({ length: 14 }, (_, i) => { const t = i / 13, u = Math.min(1, Math.max(0, (t - hold) / (1 - hold))); return 'rgba(0,0,0,' + (peak * (1 - u * u * (3 - 2 * u))).toFixed(4) + ') ' + (t * 100).toFixed(1) + '%'; }).join(',');
    sc.style.cssText = (atTop ? 'top' : 'bottom') + ':0;height:' + reach + 'px;background:linear-gradient(to ' + (atTop ? 'bottom' : 'top') + ',' + stops + ')';
  },
  setFootFade(peak) {
    const f = document.getElementById('fade');
    if (!f) return;
    if (peak <= 0) { f.style.cssText = 'display:none'; return; }
    const fb = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fbot'));
    const ss = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
    const stops = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return 'rgba(0,0,0,' + (peak * ss(0, 0.4, t) * (1 - ss(0.6, 1, t))).toFixed(4) + ') ' + (t * 100).toFixed(1) + '%'; }).join(',');
    f.style.cssText = 'bottom:' + (fb - 80) + 'px;height:220px;background:linear-gradient(to top,' + stops + ')';
  },
  // Only <path> elements with a handful of plain attributes are copied in; anything else in the string is ignored.
  setLines(svg) {
    const s = document.getElementById('lines');
    if (!s) return;
    s.textContent = '';
    const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">' + svg + '</svg>', 'image/svg+xml');
    for (const p of doc.documentElement.children) {
      if (p.localName !== 'path') continue;
      const q = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      for (const a of ['d', 'stroke', 'stroke-width', 'opacity', 'stroke-linejoin']) if (p.hasAttribute(a) && /^[-\w #.,]+$/.test(p.getAttribute(a))) q.setAttribute(a, p.getAttribute(a));
      s.appendChild(q);
    }
  },
  hide(on) { document.documentElement.classList.toggle('measure', !!on); },
  measure() {
    const box = (b) => ({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom });
    const rectsOf = (el) => { const g = document.createRange(); g.selectNodeContents(el); return [...g.getClientRects()].filter((b) => b.width > 1 && b.height > 1).map(box); };
    const avoidEls = [...document.querySelectorAll('[data-avoid]')], objEls = [...document.querySelectorAll('[data-obj]')];
    const roles = [...document.querySelectorAll('[data-role]')].map((el, i) => {
      // An SVG figure and the poster logo's wordmark (a picture with no text in it) are measured on their box.
      const svg = el instanceof SVGElement, cs = getComputedStyle(el), whole = svg || el.dataset.role === 'logo';
      const b = whole ? el.getBoundingClientRect() : null;
      return {
        i, role: el.dataset.role, rects: whole ? (b.width > 1 && b.height > 1 ? [box(b)] : []) : rectsOf(el), color: svg ? cs.fill : cs.color,
        overX: svg ? 0 : el.scrollWidth - el.clientWidth, text: (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        size: parseFloat(cs.fontSize), min: +(el.dataset.min || 0), nested: !!(el.parentElement && el.parentElement.closest('[data-role]')),
        onpanel: el.hasAttribute('data-onpanel'), inAvoid: avoidEls.map((a, k) => (a.contains(el) ? k : -1)).filter((k) => k >= 0),
        cell: el.closest('[data-cell]') ? box(el.closest('[data-cell]').getBoundingClientRect()) : null,
      };
    });
    const avoid = avoidEls.map((el, k) => ({ ...box(el.getBoundingClientRect()), id: k }));
    const objs = objEls.map((el) => ({ ...box(el.getBoundingClientRect()), bleed: el.hasAttribute('data-bleed') }));
    const ft = document.querySelector('.footer'), tb = document.getElementById('panel'), lg = document.querySelector('.ft .logo, .ft .logo-inv');
    const imgs = [...document.querySelectorAll('img[data-user]')].map((i) => { const b = i.getBoundingClientRect(); return { name: i.dataset.name, nw: i.naturalWidth, nh: i.naturalHeight, rw: b.width, rh: b.height, fit: i.dataset.fit }; });
    return {
      W: innerWidth, H: innerHeight, roles, avoid, objs, imgs, flex: document.body.dataset.flex === '1',
      footer: ft ? box(ft.getBoundingClientRect()) : null, panel: tb ? box(tb.getBoundingClientRect()) : null, logo: lg ? box(lg.getBoundingClientRect()) : null,
    };
  },
  async analyse(b64, rects) {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return rects.map((list) => {
      const L = [];
      for (const r of list) {
        const x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0)), w = Math.min(c.width, Math.ceil(r.x1)) - x0, h = Math.min(c.height, Math.ceil(r.y1)) - y0;
        if (w < 1 || h < 1) continue;
        const d = x.getImageData(x0, y0, w, h).data;
        for (let k = 0; k < d.length; k += 4) L.push(0.2126 * lin(d[k]) + 0.7152 * lin(d[k + 1]) + 0.0722 * lin(d[k + 2]));
      }
      if (!L.length) return null;
      L.sort((a, b) => a - b);
      const q = (p) => L[Math.min(L.length - 1, Math.round(p * (L.length - 1)))];
      return { p05: q(0.05), p95: q(0.95), n: L.length };
    });
  },
};
`;
