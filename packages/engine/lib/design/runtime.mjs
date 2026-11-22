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
    // A look's picture that melts into the page (kit photo blend: "ground"): the same reading as above, on a look page. When the picture's
    // top and side edges are one plain colour the page takes that colour, the type and the logo's wordmark follow it, and the picture runs
    // into it (its top edge also fades, see the kit); when they are not, only the fade shows. Nothing is guessed: no reading, no change.
    for (const i of document.querySelectorAll('img[data-bsample]')) {
      if (!i.naturalWidth) continue;
      const cv = i.closest('.k-look'); if (!cv || treat === false) continue;
      const nw = i.naturalWidth, nh = i.naturalHeight, bw = i.offsetWidth, bh = i.offsetHeight;
      const s = Math.max(bw / nw, bh / nh), sw = bw / s, sh = bh / s;
      const pos = (i.style.objectPosition || '50% 50%').match(/([\d.]+)%\s+([\d.]+)%/), fx = pos ? +pos[1] / 100 : 0.5, fy = pos ? +pos[2] / 100 : 0.5;
      const tf = getComputedStyle(i).transform, z = tf && tf !== 'none' ? new DOMMatrix(tf).a || 1 : 1;
      const vw = sw / z, vh = sh / z, vx = (nw - sw) * fx + (sw - vw) * fx, vy = (nh - sh) * fy + (sh - vh) * fy;
      const grab = (x, y, w, h) => {
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, x, y, w, h, 0, 0, c.width, c.height);
        return treatPixels(g.getImageData(0, 0, c.width, c.height).data, treat);
      };
      const e = classifyEdge({ topWidth: Math.max(1, Math.round(vw)), top: grab(vx, vy, vw, vh * 0.03), left: grab(vx, vy, vw * 0.03, vh * 0.3), right: grab(vx + vw * 0.97, vy, vw * 0.03, vh * 0.3) });
      if (e.uniform) { const type = this.typeForLook(cv, e.columns); if (type.ratio >= (+need.text || 0)) this.flushLook(cv, e, type); }
    }
    return { broken, unframed, sampled, fontOk: faces.slice(0, 2).every((f) => document.fonts.check(f)) };
  },
  // The colour roles of a look page as numbers: --c-<name> read as #rrggbb ([r, g, b] or null).
  lookRole(cv, name) { const v = getComputedStyle(cv).getPropertyValue('--c-' + name).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? [1, 3, 5].map((k) => parseInt(v.slice(k, k + 2), 16)) : null; },
  lum(c) { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; },
  // The type for a look page on these column colours: the palette's white or its ink, whichever has the higher contrast against the worst column.
  typeForLook(cv, cols) {
    const ink = this.lookRole(cv, 'ink') || [11, 31, 26], white = this.lookRole(cv, 'white') || [255, 255, 255];
    const worst = (fg) => Math.min(...cols.map((c) => { const x = this.lum(c), y = this.lum(fg); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }));
    const w = worst(white), k = worst(ink), light = w > k;
    return { light, ratio: light ? w : k, worst };
  },
  // The page takes the picture's edge (the one colour, or its twelve column colours side by side) and the look's type roles follow the ground.
  flushLook(cv, e, type) {
    const cols = e.columns, flat = e.drift < 1;
    cv.style.setProperty('--bg', flat ? 'rgb(' + e.rgb.join(',') + ')' : 'linear-gradient(to right,' + cols.map((c, k) => 'rgb(' + c.join(',') + ') ' + (((k + 0.5) / cols.length) * 100).toFixed(2) + '%').join(',') + ')');
    cv.setAttribute('data-sampled', '');
    const val = (n) => getComputedStyle(cv).getPropertyValue('--c-' + n).trim();
    if (type.light) for (const [k, from] of [['ink', 'white'], ['body', 'body-dark'], ['muted', 'muted-dark'], ['accent-type', 'accent-dark'], ['rule', 'rule-dark']]) { const v = val(from); if (v) cv.style.setProperty('--c-' + k, v); }
    for (const l of cv.querySelectorAll('.logo-inv')) l.classList.toggle('logo-ink', !type.light);
    const acc = this.lookRole(cv, 'accent-type');
    if (!acc || type.worst(acc) < 4.5) cv.style.setProperty('--c-accent-type', val('ink'));
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
    // Behind the footer: from 80 px past its outer edge, at the bottom, or at the top when the brand's logo put it there (.up).
    const up = document.querySelector('.footer.up');
    const fb = up ? up.getBoundingClientRect().top : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fbot'));
    const ss = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
    const stops = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return 'rgba(0,0,0,' + (peak * ss(0, 0.4, t) * (1 - ss(0.6, 1, t))).toFixed(4) + ') ' + (t * 100).toFixed(1) + '%'; }).join(',');
    f.style.cssText = (up ? 'top:' : 'bottom:') + (fb - 80) + 'px;height:220px;background:linear-gradient(to ' + (up ? 'bottom' : 'top') + ',' + stops + ')';
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
  // ---- the design directions (lib/design/directions/) ----
  // Every [data-fitlines] headline is broken into lines and each line is sized to fill the measure ({ w } px, at most cap px, the
  // largest the direction allows): the words are split from the markup the engine's own formatter made (text, <em>, <br>), the line
  // breaks chosen to make the smallest line as large as possible (a line that mixes the emphasis and plain words costs a little),
  // then each line's size is corrected by its measured width. Returns one entry per box: { ok, lines, sizes, height, h, est }, where
  // est is roughly how many characters would fit at the floor size.
  fitLines() {
    const R = getComputedStyle(document.documentElement), hscale = parseFloat(R.getPropertyValue('--h-scale')) || 1;
    const out = [];
    // ---- generic additions the retail direction uses (kit.mjs c.box, c.echoStack, c.fitLines valign) ----
    // [data-unrot]: a rotated wrapper is held straight while its lines are measured (a rotated box reports the width of its bounding
    // box, not of its text), and turned back at the end.
    const unrot = [...document.querySelectorAll('[data-unrot]')].map((el) => [el, el.style.transform]);
    for (const [el] of unrot) el.style.transform = 'none';
    // [data-dropsub="key:n"]: this element (a sub line) is left out when the headline with data-key=key sets in n lines or more at its designed size;
    // the page then says so in its notes (an entry with a note).
    const linesOf = (root) => {
      const tops = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const g = document.createRange(); g.selectNodeContents(n);
        for (const r of g.getClientRects()) { if (r.width < 2) continue; const t = r.top + r.height / 2; if (!tops.some((x) => Math.abs(x - t) < r.height * 0.4)) tops.push(t); }
      }
      return tops.length;
    };
    // [data-steps="s1,s2,..."] (px, descending): text set at the largest step at which it takes at most data-maxlines lines and is at most
    // data-maxh px tall ('slot': the room its parent leaves it, the parent's height less its other flow children and the gaps); the smallest
    // step when none does. The size is measured on the page, never guessed from the length of the text.
    for (const el of document.querySelectorAll('[data-steps]')) {
      const steps = el.dataset.steps.split(',').map(Number), maxLines = +el.dataset.maxlines || 99, scaled = el.hasAttribute('data-scaled');
      const setSize = (z) => { el.style.fontSize = scaled ? 'calc(' + z + 'px*var(--hs,1)*var(--h-scale,1))' : z + 'px'; };
      const room = () => {
        if (el.dataset.maxh !== 'slot') return +el.dataset.maxh || Infinity;
        const par = el.parentElement, ps = getComputedStyle(par), sibs = [...par.children].filter((k) => k !== el && getComputedStyle(k).position !== 'absolute');
        return par.clientHeight - (parseFloat(ps.paddingTop) || 0) - (parseFloat(ps.paddingBottom) || 0) - sibs.reduce((t, k) => t + k.offsetHeight, 0) - (parseFloat(ps.rowGap) || 0) * sibs.length;
      };
      let pick = steps[steps.length - 1];
      for (const z of steps) { setSize(z); if (linesOf(el) <= maxLines && el.offsetHeight <= room() + 0.5) { pick = z; break; } }
      setSize(pick); el.dataset.step = String(pick);
    }
    // [data-follow="key"]: takes the font size the stepped element with that data-key was set at
    for (const el of document.querySelectorAll('[data-follow]')) {
      const t = [...document.querySelectorAll('[data-key]')].find((e) => e.dataset.key === el.dataset.follow);
      if (t && t.dataset.step) el.style.fontSize = t.style.fontSize;
    }
    for (const el of [...document.querySelectorAll('[data-dropsub]')]) {
      const [id, k] = el.dataset.dropsub.split(':'), head = [...document.querySelectorAll('[data-key]')].find((e) => e.dataset.key === id);
      if (head && linesOf(head) >= +k) { el.remove(); out.push({ ok: true, note: 'the sub line was left out because the headline takes ' + k + ' lines or more here' }); }
    }
    // [data-echo]: a phrase repeated as outline rows around one solid row (the box holds [data-pre], the phrase's text, and the
    // solid [data-fitlines] row). The rows are as large as lets the phrase fill the width; as many are added as the box's height
    // takes (rmin to rmax), the solid row about the middle. The echo rows are texture (data-deco) and fade with their distance.
    for (const box of document.querySelectorAll('[data-echo]')) {
      const pre = box.querySelector('[data-pre]'), solid = box.querySelector('[data-fitlines]'); if (!pre || !solid) continue;
      const d = box.dataset, W = +d.w, H = d.h === 'auto' ? box.getBoundingClientRect().height : +d.h, cap = +d.cap, rmin = +d.rmin || 3, rmax = +d.rmax || 7, track = +d.track || 0;
      const cs = getComputedStyle(solid), probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;font-size:100px;line-height:1;font-family:' + cs.fontFamily + ';font-weight:' + cs.fontWeight + ';font-stretch:' + cs.fontStretch + ';letter-spacing:' + track + 'em';
      box.appendChild(probe);
      const wid = (t) => { probe.textContent = t; return probe.getBoundingClientRect().width; };
      const text = pre.textContent.trim(), preSize = Math.min(cap, (W / wid(text)) * 100), solidSize = Math.min(cap, (W / (wid(solid.textContent.trim()) + 24)) * 100);
      probe.remove();
      const rowH = preSize * 0.92, solidH = solidSize * (+solid.dataset.lead || 1) * 1.1;
      const n = Math.max(rmin, Math.min(rmax, Math.floor((H - solidH) / rowH))), at = Math.round(n * 0.5);
      const row = (dist) => { const r = document.createElement('div'); r.className = 'k-echo-row'; r.setAttribute('aria-hidden', 'true'); r.setAttribute('data-deco', ''); r.textContent = text; r.style.fontSize = preSize + 'px'; r.style.letterSpacing = track + 'em'; r.style.opacity = String([1, 0.72, 0.5, 0.34, 0.24, 0.18][Math.min(5, dist)]); return r; };
      for (let i = 0; i < at; i++) box.insertBefore(row(at - i), solid);
      for (let i = 0; i < n - at; i++) box.appendChild(row(i + 1));
      const sh = Math.ceil(Math.max(solidH * 1.2, (+solid.dataset.floor || 0) * (+solid.dataset.lead || 1) * 1.2)); solid.dataset.h = String(sh); solid.style.height = sh + 'px';
    }
    // A [data-fitwidth] numeral (kit c.numeral) is sized to the width: from its designed size down in steps of 4 px until its right edge
    // is inside data-right (never below data-min), its baseline on data-base and its left edge bleeding data-lx em off the page edge. Its
    // unit goes beside it at the cap line when it fits before data-right, else under the baseline from data-x.
    for (const box of document.querySelectorAll('[data-fitwidth]')) {
      const num = box.querySelector('[data-fitnum]'), unit = box.querySelector('[data-fitunit]'), d = box.dataset;
      const min = +d.min, right = +d.right, lx = +d.lx, base = +d.base, asc = +d.asc, cap = +d.cap, x = +d.x;
      let size = +d.size;
      const set = () => { box.style.fontSize = size + 'px'; num.style.fontSize = size + 'px'; box.style.left = (-lx * size) + 'px'; box.style.top = (base - asc * size) + 'px'; };
      set();
      while (size > min && -lx * size + num.getBoundingClientRect().width > right) { size -= 4; set(); }
      d.fitSize = String(size);
      if (unit) {
        const uw = unit.getBoundingClientRect().width, nw = num.getBoundingClientRect().width, gap = Math.max(24, 0.06 * size);
        if (-lx * size + nw + gap + uw <= right) { unit.style.left = (nw + gap) + 'px'; unit.style.top = ((asc - cap) * size) + 'px'; d.unit = 'beside'; }
        else { unit.style.left = (x + lx * size) + 'px'; unit.style.top = (asc * size + 40) + 'px'; d.unit = 'under'; }
      }
    }
    for (const box of document.querySelectorAll('[data-fitlines]:not([data-fitmode])')) {
      // data-h="auto": the height is the box's own flex slot, measured now (before its text is replaced); data-w="fit": the measure is the text's
      // own natural width at its cap, between data-minw and data-maxw (set below, once the text can be measured)
      const autoH = box.dataset.h === 'auto', fitW = box.dataset.w === 'fit';
      if (autoH) { box.style.height = ''; box.style.display = ''; box.style.flexDirection = ''; box.style.justifyContent = ''; }
      let W = fitW ? 0 : +box.dataset.w;
      const H = autoH ? box.getBoundingClientRect().height : +box.dataset.h, cap = +box.dataset.cap * hscale, floor = +box.dataset.floor, lead = +box.dataset.lead, max = +box.dataset.max || 5, align = box.dataset.align || 'left';
      if (!box.__src) box.__src = [...box.childNodes].map((n) => n.cloneNode(true));
      // words: [{ parts: [{ t, em }], br }]; a <br> ends the line
      const words = []; let cur = null;
      const push = () => { if (cur) { words.push(cur); cur = null; } };
      const walk = (nodes, em) => { for (const n of nodes) {
        if (n.nodeType === 3) { for (const piece of n.nodeValue.split(/([ \t\n\r\f]+)/)) { if (!piece) continue; if (/^[ \t\n\r\f]+$/.test(piece)) push(); else { cur = cur || { parts: [] }; cur.parts.push({ t: piece, em }); } } }
        else if (n.nodeName === 'BR') { push(); words.push({ br: true }); }
        else walk(n.childNodes, em || n.nodeName === 'EM');
      } };
      walk(box.__src, false); push();
      const mk = (ws, size) => {
        const line = document.createElement('span'); line.className = 'fl-in'; let hl = null;
        ws.forEach((w, i) => {
          const lastEm = i > 0 && ws[i - 1].parts[ws[i - 1].parts.length - 1].em, firstEm = w.parts[0].em;
          if (i) (hl && lastEm && firstEm ? hl : line).appendChild(document.createTextNode(' '));
          for (const p of w.parts) {
            if (p.em) {
              const e = document.createElement('em'); e.setAttribute('data-role', 'accent'); e.textContent = p.t;
              // a highlight bar sits on its own span (never on the measured text), shared by the words of one phrase
              if (box.hasAttribute('data-hl')) { if (!hl) { hl = document.createElement('span'); hl.className = 'k-hl'; line.appendChild(hl); } hl.appendChild(e); } else line.appendChild(e);
            } else { hl = null; line.appendChild(document.createTextNode(p.t)); }
          }
        });
        line.style.letterSpacing = (box.dataset.track || '0') + 'em';
        // data-trail: a negative tracking leaves its (negative) space after the last glyph, which would let the glyph past the measure; keep it inside
        if (box.hasAttribute('data-trail') && +box.dataset.track < 0) line.style.paddingRight = (-box.dataset.track) + 'em';
        if (size) line.style.fontSize = size + 'px';
        return line;
      };
      box.textContent = '';
      const real = words.filter((w) => !w.br);
      // natural widths at 100 px, a group of words at a time (so italics, kerning and spaces are right)
      const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;width:auto'; box.appendChild(probe);
      const wid = (ws) => { probe.textContent = ''; probe.appendChild(mk(ws, 100)); return probe.firstChild.getBoundingClientRect().width; };
      if (fitW) { W = Math.min(+box.dataset.maxw, Math.max(+box.dataset.minw, (wid(real) * cap) / 100)); box.style.width = W + 'px'; }
      const segs = []; let run = []; for (const w of words) { if (w.br) { segs.push(run); run = []; } else run.push(w); } segs.push(run);
      const best = (n) => {
        // split the words into n contiguous lines (never across a <br>), maximising the smallest size
        const flat = real, m = flat.length; if (n > m) return null;
        const brk = new Set(); { let k = 0; for (const w of words) { if (w.br) brk.add(k); else k++; } }
        const cost = (a, b) => { for (const k of brk) if (k > a && k < b) return null; const ws = flat.slice(a, b); const size = Math.min(cap, (W / wid(ws)) * 100); const em = ws.filter((w) => w.parts.some((p) => p.em)).length; const mixed = em > 0 && em < ws.length ? 6 : 0; return { size, mixed }; };
        const memo = new Map(); const c = (a, b) => { const k = a * 1000 + b; if (!memo.has(k)) memo.set(k, cost(a, b)); return memo.get(k); };
        let dp = [{ at: 0, score: Infinity, cuts: [] }];
        for (let line = 0; line < n; line++) {
          const next = [];
          for (let b = line + 1; b <= m - (n - line - 1); b++) {
            let pick = null;
            for (const st of dp) { if (st.at >= b) continue; const k = c(st.at, b); if (!k) continue; const sc = Math.min(st.score, k.size - k.mixed); if (!pick || sc > pick.score) pick = { at: b, score: sc, cuts: [...st.cuts, [st.at, b]] }; }
            if (pick) next.push(pick);
          }
          const byAt = new Map(); for (const s of next) if (!byAt.has(s.at) || s.score > byAt.get(s.at).score) byAt.set(s.at, s); dp = [...byAt.values()];
        }
        const fin = dp.filter((s) => s.at === m).sort((a, b) => b.score - a.score)[0];
        return fin ? { score: fin.score, cuts: fin.cuts } : null;
      };
      let pick = null;
      for (let n = Math.max(1, segs.length); n <= Math.min(max, real.length); n++) {
        const r = best(n); if (!r) continue;
        const sizes = r.cuts.map(([a, b]) => Math.min(cap, (W / wid(real.slice(a, b))) * 100));
        const height = sizes.reduce((t, z) => t + z * lead, 0);
        const cand = { n, cuts: r.cuts, score: r.score, height, fits: height <= H };
        if (!pick || (cand.fits && !pick.fits) || (cand.fits === pick.fits && cand.score > pick.score + 1)) pick = cand;
      }
      box.textContent = '';
      if (!pick) { out.push({ ok: false, lines: 0, sizes: [], height: 0, h: H, est: 0, chars: 0 }); continue; }
      const sizes = [];
      for (const [a, b] of pick.cuts) {
        const ws = real.slice(a, b), row = document.createElement('span'); row.className = 'fl-line'; row.style.textAlign = align;
        const line = mk(ws, 100); row.appendChild(line); box.appendChild(row);
        let z = Math.min(cap, (W / line.getBoundingClientRect().width) * 100);
        for (let i = 0; i < 4; i++) { line.style.fontSize = z + 'px'; const got = line.getBoundingClientRect().width; z = Math.min(cap, z * (W / got) * (got > W ? 0.998 : 1)); }
        z = Math.floor(z * 10) / 10; line.style.fontSize = z + 'px'; row.style.fontSize = z + 'px'; row.style.lineHeight = String(lead);
        sizes.push(z);
      }
      const height = sizes.reduce((t, z) => t + z * lead, 0), min = Math.min(...sizes), chars = real.reduce((t, w) => t + w.parts.reduce((u, p) => u + p.t.length, 0), 0) + real.length - 1;
      box.style.fontSize = min + 'px'; box.dataset.sizes = sizes.join(',');
      if (autoH) {
        // the box keeps its slot; with data-valign the lines sit in the middle (or at the foot) of it
        if (box.dataset.valign) { box.style.display = 'flex'; box.style.flexDirection = 'column'; box.style.justifyContent = box.dataset.valign === 'bottom' ? 'flex-end' : 'center'; }
      } else if (box.classList.contains('k-flow') && !box.dataset.valign) box.style.height = Math.ceil(height) + 'px';
      // data-valign (center | bottom) with data-y: the lines sit in the middle (or at the foot) of the box's height, not at its top
      if (box.dataset.valign && !autoH) { const room = Math.max(0, H - height); box.style.top = (+box.dataset.y + room * (box.dataset.valign === 'bottom' ? 1 : 0.5)) + 'px'; box.style.height = Math.min(H, height) + 'px'; }
      const natural = real.reduce((t, w) => t + wid([w]), 0) + (real.length - 1) * wid([{ parts: [{ t: 'n', em: false }] }]) * 0.5;
      const floorLines = Math.max(1, Math.floor(H / (floor * lead)));
      const est = Math.max(1, Math.floor(chars * Math.min(1, (floorLines * W) / ((natural / 100) * floor) * 0.9)));
      out.push({ ok: min >= floor && height <= H + 1, lines: sizes.length, sizes, height: Math.round(height), h: H, est, chars, min, floor, what: box.dataset.what || '' });
    }
    for (const [el, t] of unrot) el.style.transform = t;
    out.push(...this.fitModes());
    return out;
  },
  // What a post page measures about itself for the design checks (lib/design/checks.mjs findPostProblems): every text's size and
  // lines, the largest rectangle on the page that nothing covers, and where each text block's edge sits. grid: { lefts, rights, centre }.
  // Text inside [data-deco] is a texture, not type; [data-fill] elements, pictures and text cover the page; a [data-fitlines] headline's
  // lines are one level of type however their sizes differ.
  postMetrics(o) {
    const W = innerWidth, H = innerHeight, box = (b) => ({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom });
    const hs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hs')) || 1;
    const texts = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement; if (!el || el.closest('script,style,[data-deco]')) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const g = document.createRange(); g.selectNodeContents(n);
      const rects = [...g.getClientRects()].filter((b) => b.width > 1 && b.height > 1).map(box); if (!rects.length) continue;
      const r = el.closest('[data-role]');
      texts.push({ size: parseFloat(cs.fontSize), rects, fit: !!el.closest('[data-fitlines]'), role: r ? r.dataset.role : '', inHead: !!(r && r.parentElement && r.parentElement.closest('[data-role="headline"],[data-role="stat"]')), scaled: !!(r && r.closest('[data-scaled]')), text: n.nodeValue.trim().slice(0, 30) });
    }
    // covered cells on a 20 px grid: text (a little grown), pictures and filled devices
    const cell = 20, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell), cov = new Uint8Array(cols * rows);
    const mark = (r, grow) => { const x0 = Math.max(0, Math.floor((r.x0 - grow) / cell)), x1 = Math.min(cols - 1, Math.floor((r.x1 + grow - 0.01) / cell)), y0 = Math.max(0, Math.floor((r.y0 - grow) / cell)), y1 = Math.min(rows - 1, Math.floor((r.y1 + grow - 0.01) / cell)); for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cov[y * cols + x] = 1; };
    for (const t of texts) for (const r of t.rects) mark(r, 10);
    for (const el of document.querySelectorAll('img[data-user], [data-fill]')) { const b = el.getBoundingClientRect(); if (b.width > 1 && b.height > 1) mark(box(b), 0); }
    // the largest empty rectangle (histogram method)
    const hgt = new Int32Array(cols); let bestA = 0, bx = 0, by = 0, bw = 0, bh = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) hgt[x] = cov[y * cols + x] ? 0 : hgt[x] + 1;
      const st = [];
      for (let x = 0; x <= cols; x++) {
        const cur = x === cols ? 0 : hgt[x]; let start = x;
        while (st.length && st[st.length - 1].h >= cur) { const t = st.pop(); const a = t.h * (x - t.x); if (a > bestA) { bestA = a; bx = t.x; by = y - t.h + 1; bw = x - t.x; bh = t.h; } start = t.x; }
        st.push({ x: start, h: cur });
      }
    }
    const empty = { share: (bestA * cell * cell) / (W * H), x0: bx * cell, y0: by * cell, x1: (bx + bw) * cell, y1: (by + bh) * cell };
    // where each text block's edge sits
    const blocks = [];
    for (const el of document.querySelectorAll('[data-role]')) {
      if (el.parentElement && el.parentElement.closest('[data-role]')) continue;
      if (el.closest('[data-deco]')) continue;
      const mode = el.getAttribute('data-grid') || (el.closest('[data-grid]') ? el.closest('[data-grid]').getAttribute('data-grid') : 'left');
      const g = document.createRange(); g.selectNodeContents(el);
      const rects = [...g.getClientRects()].filter((b) => b.width > 1 && b.height > 1).map(box); if (!rects.length) continue;
      const u = rects.reduce((a, r) => ({ x0: Math.min(a.x0, r.x0), x1: Math.max(a.x1, r.x1) }), { x0: Infinity, x1: -Infinity });
      blocks.push({ role: el.dataset.role, mode, x0: u.x0 + (parseFloat(el.dataset.optical) || 0), x1: u.x1, text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) });
    }
    // The ink of every line of text and the straight filled shapes on the page, for the "text meets the edge of a block" check
    // (checks.mjs findPostProblems, kind edge). A line's ink runs from the top of its tallest letter to the bottom of its lowest
    // (measured with the line's own font: a descender counts), across the line's width; turned text and turned shapes are left out.
    // (a turned box, data-tilt, is measured straight: its text and its shapes turn together)
    const tilts = [...document.querySelectorAll('[data-tilt]')].map((e) => [e, e.style.transform]); for (const [e] of tilts) e.style.transform = 'none';
    const turned = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const tf = getComputedStyle(e).transform; if (tf && tf !== 'none') return true; } return false; };
    // text and a shape are only compared in the same frame: both outside any turned box, or both inside the same turned boxes
    const tiltKey = (el) => { const k = []; for (let e = el; e && e !== document.body; e = e.parentElement) if (e.hasAttribute('data-tilt')) k.push(tilts.findIndex((t) => t[0] === e)); return k.join('.'); };
    const ctx = document.createElement('canvas').getContext('2d'), inks = [];
    const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker2.nextNode(); n; n = walker2.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement; if (!el || el.closest('script,style,[data-deco]') || turned(el)) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const rr = el.closest('[data-role]'), role = rr ? rr.dataset.role : '';
      if (role === 'logo') continue;
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const lines = [], g = document.createRange(), txt = n.nodeValue;
      for (let i = 0; i < txt.length; i++) {
        if (!txt[i].trim()) continue;
        g.setStart(n, i); g.setEnd(n, i + 1); const b = g.getClientRects()[0]; if (!b || b.width < 0.5 || b.height < 1) continue;
        const L = lines.find((l) => Math.abs(l.y0 - b.top) < 2); const ch = cs.textTransform === 'uppercase' ? txt[i].toUpperCase() : txt[i];
        if (L) { L.x0 = Math.min(L.x0, b.left); L.x1 = Math.max(L.x1, b.right); L.s += ch; } else lines.push({ y0: b.top, y1: b.bottom, x0: b.left, x1: b.right, s: ch });
      }
      for (const L of lines) {
        const mt = ctx.measureText(L.s), top = L.y0 + (mt.fontBoundingBoxAscent ?? (L.y1 - L.y0) * 0.8);
        inks.push({ role, frame: tiltKey(el), text: L.s.trim().slice(0, 30), x0: L.x0, x1: L.x1, y0: top - mt.actualBoundingBoxAscent, y1: top + mt.actualBoundingBoxDescent });
      }
    }
    const SKIP_SHAPE = '.k-frame,.k-keyline,.k-seal,.k-printmat,.k-echo';
    // a shape counts when it can be seen: a colour other than the page's, or a picture behind it (a paper box on a paper page is only a layout box)
    const pageBg = getComputedStyle(document.querySelector('.cv') || document.body).backgroundColor, pics = [...document.querySelectorAll('img')].map((i) => box(i.getBoundingClientRect()));
    const seen = (el, b) => { const bg = getComputedStyle(el).backgroundColor; if (/^rgba\(.*, 0\)$/.test(bg) || bg === 'transparent') return true; return bg !== pageBg || pics.some((p) => Math.min(p.x1, b.right) > Math.max(p.x0, b.left) && Math.min(p.y1, b.bottom) > Math.max(p.y0, b.top)); };
    const shapes = [...document.querySelectorAll('[data-fill]')].filter((el) => !el.matches(SKIP_SHAPE) && !turned(el) && getComputedStyle(el).clipPath === 'none' && seen(el, el.getBoundingClientRect())).map((el) => ({ ...box(el.getBoundingClientRect()), frame: tiltKey(el) })).filter((b) => b.x1 - b.x0 > 0.5 && b.y1 - b.y0 > 0.5 && !(b.x1 - b.x0 >= W * 0.97 && b.y1 - b.y0 >= H * 0.97));
    for (const [e, t] of tilts) e.style.transform = t;
    const calm = document.querySelector('[data-calm]');
    // a rectangle for every element a builder marked (kit numberElements): { el: "2.0", x0, y0, x1, y1 } in document order, keyed by its index path
    const els = [...document.querySelectorAll('[data-el]')].map((el) => { const b = el.getBoundingClientRect(); return { el: el.getAttribute('data-el'), x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; });
    return { W, H, hs, texts, empty, blocks, inks, shapes, calm: calm ? parseFloat(calm.getAttribute('data-calm')) : null, els };
  },
  hide(on) { document.documentElement.classList.toggle('measure', !!on); },
  measure() {
    const box = (b) => ({ x0: b.left, y0: b.top, x1: b.right, y1: b.bottom });
    const rectsOf = (el) => {
      // data-split: the text of the element itself, without the words of the roles nested in it (a headline's highlighted phrase sits on
      // a bar of its own and is judged as the accent role, on that bar). Inside a fitted headline (data-fitlines) a line is judged on
      // the band its capitals and lowercase fill, the middle 65% of its text rectangle, because lines are set tighter than their
      // text rectangles and neighbouring lines' highlight bars reach into those rectangles' edges.
      const fitted = !!el.closest('[data-fitlines]') || el.hasAttribute('data-band');
      if (el.hasAttribute('data-split') || fitted) {
        const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (!n.nodeValue.trim() || (n.parentElement.closest('[data-role]') !== el)) continue;
          const g = document.createRange(); g.selectNodeContents(n);
          for (const b of g.getClientRects()) if (b.width > 1 && b.height > 1) { const r = box(b); if (fitted) { const c = (r.y0 + r.y1) / 2, half = 0.325 * parseFloat(getComputedStyle(n.parentElement).fontSize); r.y0 = c - half; r.y1 = c + half; } out.push(r); }
        }
        return out;
      }
      const g = document.createRange(); g.selectNodeContents(el);
      const rs = [...g.getClientRects()].filter((b) => b.width > 1 && b.height > 1).map(box);
      // a phrase on a marker highlight bar (.k-hl, a bar as tall as the capitals) is judged on the band the bar covers: the middle 65%; so are
      // the words in a pill (.k-pl), whose text box can be taller than the pill in a display face with tall ascent and descent (Anton)
      if (el.parentElement && (el.parentElement.classList.contains('k-hl') || el.parentElement.classList.contains('k-pl'))) { const half = 0.325 * parseFloat(getComputedStyle(el).fontSize); for (const r of rs) { const c = (r.y0 + r.y1) / 2; r.y0 = c - half; r.y1 = c + half; } }
      return rs;
    };
    // A text inside a turned box ([data-tilt] = degrees, kit c.box) reports the bounding box of each of its lines, whose corners reach
    // past the line. Such a line is read as a row of slices along its own direction instead, so the pixels behind the type (contrast)
    // and the overlap checks see the line, not the corners.
    const tiltOf = (el) => { let a = 0; for (let e = el; e; e = e.parentElement) if (e.hasAttribute && e.hasAttribute('data-tilt')) a += +e.getAttribute('data-tilt') || 0; return a; };
    const slices = (r, deg) => {
      const th = (deg * Math.PI) / 180, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)), den = c * c - s * s, wb = r.x1 - r.x0, hb = r.y1 - r.y0;
      const w = (wb * c - hb * s) / den, h = (hb * c - wb * s) / den; if (!(den > 0.2) || !(w > 1) || !(h > 1)) return [r];
      const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, k = Math.max(1, Math.ceil(w / (h * 1.2))), out = [];
      for (let i = 0; i < k; i++) { const t = ((i + 0.5) / k - 0.5) * w, px = cx + t * Math.cos(th), py = cy + t * Math.sin(th); out.push({ x0: px - w / (2 * k), x1: px + w / (2 * k), y0: py - h / 2, y1: py + h / 2 }); }
      return out;
    };
    const rectsT = (el) => { const rs = rectsOf(el), a = tiltOf(el); return a ? rs.flatMap((r) => slices(r, a)) : rs; };
    const avoidEls = [...document.querySelectorAll('[data-avoid]')], objEls = [...document.querySelectorAll('[data-obj]')];
    const roles = [...document.querySelectorAll('[data-role]')].map((el, i) => {
      // An SVG figure and the poster logo's wordmark (a picture with no text in it) are measured on their box.
      const svg = el instanceof SVGElement, cs = getComputedStyle(el), whole = svg || el.dataset.role === 'logo';
      const b = whole ? el.getBoundingClientRect() : null;
      return {
        i, role: el.dataset.role, rects: whole ? (b.width > 1 && b.height > 1 ? [box(b)] : []) : rectsT(el), color: svg ? cs.fill : cs.color,
        overX: svg ? 0 : el.scrollWidth - el.clientWidth, text: (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50),
        size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400, optical: parseFloat(el.closest('[data-optical]')?.dataset.optical) || 0, min: +(el.dataset.min || 0), nested: !!(el.parentElement && el.parentElement.closest('[data-role]')),
        onpanel: el.hasAttribute('data-onpanel'), inAvoid: avoidEls.map((a, k) => (a.contains(el) ? k : -1)).filter((k) => k >= 0),
        cell: el.closest('[data-cell]') ? box(el.closest('[data-cell]').getBoundingClientRect()) : null,
        // a numeral or a picture-like block that may leave the page by the edges named (a post's bleed, lib/design/directions/)
        bleed: el.getAttribute('data-bleed') || null,
      };
    });
    const avoid = avoidEls.map((el, k) => ({ ...box(el.getBoundingClientRect()), id: k }));
    const objs = objEls.map((el) => ({ ...box(el.getBoundingClientRect()), bleed: el.hasAttribute('data-bleed') }));
    // The chrome at the foot (the footer; or, when the brand's logo put the footer at the top, an editorial page's running head
    // there, from its rule) bounds the text from below; the footer at the top (.up, with its logo pill) bounds it from above.
    const ft = document.querySelector('.footer:not(.up)') || document.querySelector('.rh-rule.low') || document.querySelector('.rh.low'), tb = document.getElementById('panel'), lg = document.querySelector('.ft .logo, .ft .logo-inv');
    const up = document.querySelector('.footer.up');
    const hd = up ? [...up.querySelectorAll('*')].map((e) => box(e.getBoundingClientRect())).filter((b) => b.x1 > b.x0 && b.y1 > b.y0).reduce((u, b) => ({ x0: Math.min(u.x0, b.x0), y0: Math.min(u.y0, b.y0), x1: Math.max(u.x1, b.x1), y1: Math.max(u.y1, b.y1) }), box(up.getBoundingClientRect())) : null;
    const imgs = [...document.querySelectorAll('img[data-user]')].map((i) => { const b = i.getBoundingClientRect(); return { name: i.dataset.name, nw: i.naturalWidth, nh: i.naturalHeight, rw: b.width, rh: b.height, fit: i.dataset.fit }; });
    return {
      W: innerWidth, H: innerHeight, roles, avoid, objs, imgs, flex: document.body.dataset.flex === '1',
      footer: ft ? box(ft.getBoundingClientRect()) : null, header: hd, panel: tb ? box(tb.getBoundingClientRect()) : null, logo: lg ? box(lg.getBoundingClientRect()) : null,
    };
  },
  // ======== additions for the swiss direction: modes of fitLines (data-fitmode) and a measured scrim ========
  // fitModes() runs after the classic fitLines boxes; it sets every [data-fitmode] box: "block" (a headline at one size from a ladder, in
  // balanced lines), "fill" (every line as large as lets its ink fill the width, with even sizes) and "numeral" (a big numeral and its
  // unit), then measures the scrims. Each box reports { ok, lines, sizes, height, h, est, chars, min, floor } like fitLines does, so the
  // renderer refuses what does not fit in the same words ("about N characters").
  swWords(box) {
    if (!box.__src) box.__src = [...box.childNodes].map((n) => n.cloneNode(true));
    const words = []; let cur = null;
    const push = () => { if (cur) { words.push(cur); cur = null; } };
    const walk = (nodes, em) => { for (const n of nodes) {
      if (n.nodeType === 3) { for (const piece of n.nodeValue.split(/([ \t\n\r\f]+)/)) { if (!piece) continue; if (/^[ \t\n\r\f]+$/.test(piece)) push(); else { cur = cur || { parts: [] }; cur.parts.push({ t: piece, em }); } } }
      else if (n.nodeName === 'BR') { push(); words.push({ br: true }); }
      else walk(n.childNodes, em || n.nodeName === 'EM');
    } };
    walk(box.__src, false); push();
    return words;
  },
  // A line of words as an inline element at size px (the emphasis phrase as <em data-role="accent">).
  swLine(box, ws, size) {
    const line = document.createElement('span'); line.className = 'fb-in';
    ws.forEach((w, i) => {
      if (i) line.appendChild(document.createTextNode(' '));
      for (const p of w.parts) {
        if (p.em) { const e = document.createElement('em'); e.setAttribute('data-role', 'accent'); e.textContent = p.t; line.appendChild(e); }
        else line.appendChild(document.createTextNode(p.t));
      }
    });
    line.style.letterSpacing = (box.dataset.track || '0') + 'em';
    if (size) line.style.fontSize = size + 'px';
    return line;
  },
  // The canvas text metrics of a box's face: ink(text) -> { left, width } at 100 px (left: the ink's start inside the advance box).
  swInk(box) {
    const cs = getComputedStyle(box), ctx = document.createElement('canvas').getContext('2d');
    ctx.font = cs.fontWeight + ' 100px ' + cs.fontFamily;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (parseFloat(box.dataset.track || '0') * 100) + 'px';
    return (text) => { const m = ctx.measureText(text); return { left: -m.actualBoundingBoxLeft, width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight }; };
  },
  // The height a box may take: its own data-h, less what a data-stop element (by id) leaves, measured from the box's cap line.
  swRoom(box) {
    const d = box.dataset; let H = +d.h;
    const stop = d.stop ? document.getElementById(d.stop) : null;
    if (stop) { const fs = parseFloat(getComputedStyle(box).fontSize), capY = box.getBoundingClientRect().top + (+d.tt || 0) * fs; H = Math.min(H, stop.getBoundingClientRect().top - (+d.gap || 0) - capY); }
    return H;
  },
  fitModes() {
    const out = [];
    for (const box of document.querySelectorAll('[data-fitmode]')) {
      const mode = box.dataset.fitmode;
      out.push(mode === 'block' ? this.swBlock(box) : mode === 'fill' ? this.swFill(box) : this.swNumeral(box));
    }
    this.swScrims();
    return out;
  },
  // data-anchor="bottom": the lines stand at the foot of the room the box was given, the lowest letters (a descender, data-desc em) on its bottom
  // edge, so any empty space of the cell is above the text and not under it.
  swAnchor(box, H, height, size) {
    if (box.dataset.anchor !== 'bottom') return;
    const shift = Math.max(0, H - height - (+box.dataset.desc || 0.2) * size);
    if (!shift) return;
    if (box.classList.contains('abs')) box.style.top = (parseFloat(box.style.top) || 0) + shift + 'px';
    else box.style.marginTop = (parseFloat(getComputedStyle(box).marginTop) || 0) + shift + 'px';
  },
  swBlock(box) {
    const d = box.dataset, W = +d.w, lead = +d.lead, max = +d.max || 5, align = d.align || 'left', capEm = +d.capem, tt = +d.tt, tb = +d.tb;
    const sizes = d.sizes.split(',').map(Number), H = this.swRoom(box), words = this.swWords(box), real = words.filter((w) => !w.br);
    box.textContent = '';
    const probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;width:auto'; box.appendChild(probe);
    const memo = new Map(), wid = (ws, key) => { if (memo.has(key)) return memo.get(key); probe.textContent = ''; probe.appendChild(this.swLine(box, ws, 100)); const w = probe.firstChild.getBoundingClientRect().width; memo.set(key, w); return w; };
    const segs = []; { let run = []; for (const w of words) { if (w.br) { segs.push(run); run = []; } else run.push(w); } segs.push(run); }
    // the words of one paragraph broken into lines that are as even as they can be, none wider than lim (units of 1% of the size)
    const breakSeg = (ws, lim, base) => {
      const m = ws.length; if (!m) return [];
      const cost = Array(m + 1).fill(Infinity), from = Array(m + 1).fill(0); cost[0] = 0;
      for (let j = 1; j <= m; j++) for (let i = 0; i < j; i++) {
        if (!(cost[i] < Infinity)) continue;
        const w = wid(ws.slice(i, j), base + ':' + i + ':' + j); if (w > lim + 0.01) continue;
        const slack = (lim - w) / lim, last = j === m;
        const c = cost[i] + (last ? 0.6 : 1) * slack * slack + 0.28 + (last && w < 0.3 * lim ? 0.5 : 0);
        if (c < cost[j]) { cost[j] = c; from[j] = i; }
      }
      if (!(cost[m] < Infinity)) return null;
      const lines = []; for (let j = m; j > 0; j = from[j]) lines.unshift(ws.slice(from[j], j));
      return lines;
    };
    const layout = (s) => { const lines = []; let k = 0; for (const seg of segs) { const r = breakSeg(seg, (W / s) * 100, 'p' + k++); if (!r) return null; lines.push(...r); } return lines; };
    let pick = null;
    for (const s of sizes) {
      const lines = layout(s); if (!lines) continue;
      const height = ((lines.length - 1) * lead + capEm) * s;
      if (lines.length <= max && height <= H + 0.5) { pick = { s, lines, height }; break; }
    }
    const floor = sizes[sizes.length - 1], chars = real.reduce((t, w) => t + w.parts.reduce((u, p) => u + p.t.length, 0), 0) + real.length - 1;
    let ok = !!pick;
    if (!pick) { const lines = layout(floor) || real.map((w) => [w]); pick = { s: floor, lines, height: ((lines.length - 1) * lead + capEm) * floor }; }
    const { s, lines } = pick, ink = this.swInk(box);
    box.textContent = ''; box.style.fontSize = s + 'px'; box.dataset.size = String(s);
    let optical = 0;
    for (const ws of lines) {
      const row = document.createElement('span'); row.className = 'fb-line'; row.style.textAlign = align;
      const first = ws[0].parts[0].t.charAt(0), lsb = first ? ink(first).left / 100 : 0;
      row.style.marginLeft = (-lsb * s) + 'px'; optical = Math.max(optical, lsb * s);
      row.appendChild(this.swLine(box, ws, 0)); box.appendChild(row);
    }
    box.dataset.optical = String(+optical.toFixed(2));
    this.swAnchor(box, H, pick.height, s);
    const natural = real.reduce((t, w, i) => t + wid([w], 'w' + i), 0);
    const floorLines = Math.max(1, Math.min(max, Math.floor((H / floor - capEm) / lead) + 1));
    const est = Math.max(1, Math.floor(chars * Math.min(1, (floorLines * W) / ((natural / 100) * floor) * 0.85)));
    if (pick.height > H + 0.5 || lines.length > max) ok = false;
    return { ok, lines: lines.length, sizes: [s], height: Math.round(pick.height), h: Math.round(H), est, chars, min: s, floor };
  },
  swFill(box) {
    const d = box.dataset, W = +d.w, cap = +d.cap, floor = +d.floor, gapEm = +d.gapem, capEm = +d.capem, tt = +d.tt, tb = +d.tb, maxLines = +d.max || 8;
    const H = this.swRoom(box), words = this.swWords(box).filter((w) => !w.br), ink = this.swInk(box), n = words.length;
    box.textContent = '';
    const isEm = (w) => w.parts.every((p) => p.em), key = (i, j) => i * 100 + j, cache = new Map();
    const meas = (i, j) => { const k = key(i, j); if (!cache.has(k)) { const m = ink(words.slice(i, j).map((w) => w.parts.map((p) => p.t).join('')).join(' ')); cache.set(k, m); } return cache.get(k); };
    const chars = words.reduce((t, w) => t + w.parts.reduce((u, p) => u + p.t.length, 0), 0) + n - 1;
    let best = null, fallback = null;
    const lim = n > 14 ? 1 << 14 : 1 << Math.max(0, n - 1);
    for (let mask = 0; mask < lim; mask++) {
      const cuts = []; let ok = true;
      for (let i = 0; i < n - 1; i++) { const cut = (mask >> i) & 1; if (isEm(words[i]) !== isEm(words[i + 1]) && !cut) { ok = false; break; } if (cut) cuts.push(i + 1); }
      if (!ok || cuts.length + 1 > maxLines) continue;
      const bounds = [0, ...cuts, n], sized = [];
      for (let k = 0; k < bounds.length - 1; k++) { const m = meas(bounds[k], bounds[k + 1]); sized.push({ a: bounds[k], b: bounds[k + 1], size: Math.min(cap, (W / m.width) * 100), full: (W / m.width) * 100 <= cap, left: m.left }); }
      const sizes = sized.map((s) => s.size), h = sizes.reduce((t, z, i) => t + z * capEm + (i ? z * gapEm : 0), 0), mn = Math.min(...sizes), mx = Math.max(...sizes);
      const mean = sizes.reduce((t, z) => t + z, 0) / sizes.length, cv = Math.sqrt(sizes.reduce((t, z) => t + (z - mean) ** 2, 0) / sizes.length) / mean;
      const cand = { sized, h, mn, mx, cv, mean };
      if (!fallback || mn > fallback.mn) fallback = cand;
      if (h > H || mn < floor || mn < 0.62 * mx) continue;
      const capped = sized.filter((s) => !s.full).length, lastSmall = sizes[sizes.length - 1] < 0.75 * mean ? 1 : 0;
      const score = h / H - 3 * cv - 0.15 * capped - lastSmall;
      if (!best || score > best.score) best = { ...cand, score };
    }
    const pick = best || fallback, ok = !!best;
    for (const [i, s] of pick.sized.entries()) {
      const row = document.createElement('span'); row.className = 'fb-line' + (words[s.a] && isEm(words[s.a]) ? ' fb-em' : '');
      const z = Math.floor(s.size * 10) / 10; row.style.fontSize = z + 'px'; row.style.lineHeight = '1';
      row.style.marginTop = ((i ? gapEm : 0) - tt) + 'em'; row.style.marginBottom = (-tb) + 'em'; row.style.marginLeft = (-(s.left / 100) * z) + 'px';
      row.appendChild(this.swLine(box, words.slice(s.a, s.b), 0)); box.appendChild(row); s.z = z;
    }
    // a line's advance can run a few px past its ink (a side bearing): take that off every line so nothing stands past the measure
    for (let g = 0; g < 4 && box.scrollWidth > box.clientWidth + 0.5; g++) {
      const k = box.clientWidth / box.scrollWidth;
      for (const [i, s] of pick.sized.entries()) { s.z = Math.floor(s.z * k * 10) / 10; box.children[i].style.fontSize = s.z + 'px'; box.children[i].style.marginLeft = (-(s.left / 100) * s.z) + 'px'; }
    }
    box.dataset.optical = String(+Math.max(...pick.sized.map((s) => (s.left / 100) * s.z)).toFixed(2));
    const zs = pick.sized.map((s) => s.z);
    this.swAnchor(box, H, pick.h, zs[zs.length - 1]);
    const natural = ink(words.map((w) => w.parts.map((p) => p.t).join('')).join(' ')).width;
    const est = Math.max(1, Math.floor(chars * Math.min(1, ((H / (floor * (capEm + gapEm))) * W) / ((natural / 100) * floor) * 0.8)));
    return { ok, lines: zs.length, sizes: zs, height: Math.round(pick.h), h: Math.round(H), est, chars, min: Math.min(...zs), floor };
  },
  swNumeral(box) {
    const d = box.dataset, sizes = d.sizes.split(',').map(Number), x0 = +d.x0, right = +d.right, edge = +d.edge, bleed = +d.bleedem, capEm = +d.capem, asc = +d.asc, desc = +d.desc, utt = +d.utt;
    const cols = (d.cols || '').split(',').filter(Boolean).map(Number), minUnit = +d.minunit;
    const num = box.querySelector('.k-fnum-n'), unit = box.querySelector('.k-fnum-u'), text = num.textContent;
    const ncs = getComputedStyle(num), ctx = document.createElement('canvas').getContext('2d');
    ctx.font = ncs.fontWeight + ' 100px ' + ncs.fontFamily; if ('letterSpacing' in ctx) ctx.letterSpacing = (parseFloat(num.style.letterSpacing) * 100) + 'px';
    const m = ctx.measureText(text.charAt(0)), lsb = -m.actualBoundingBoxLeft / 100;
    num.style.fontSize = '100px'; const w100 = num.getBoundingClientRect().width;
    let longest = 0;
    if (unit) { const ucs = getComputedStyle(unit), uc = document.createElement('canvas').getContext('2d'); uc.font = ucs.fontWeight + ' ' + ucs.fontSize + ' ' + ucs.fontFamily; for (const w of unit.textContent.toUpperCase().split(/\s+/)) longest = Math.max(longest, uc.measureText(w).width); }
    const need = Math.max(minUnit, longest);
    let pick = null;
    for (const s of sizes) {
      const left = x0 - lsb * s, r = left + (w100 * s) / 100;
      if (!unit) { if (r <= right + 3) { pick = { s, left, r }; break; } continue; }
      const ux = cols.find((c) => c >= r + 6 && c + need <= right + 0.5);
      if (ux !== undefined) { pick = { s, left, r, ux }; break; }
    }
    const ok = !!pick, floor = sizes[sizes.length - 1];
    if (!pick) { const s = floor, left = x0 - lsb * s, r = left + (w100 * s) / 100; pick = { s, left, r, ux: cols.find((c) => c >= r + 6) ?? right }; }
    const { s, left } = pick, base = edge + bleed * capEm * s;
    num.style.fontSize = s + 'px'; num.style.left = left + 'px'; num.style.top = (base - ((1 - (asc + desc)) / 2 + asc) * s) + 'px';
    box.dataset.optical = String(+(lsb * s).toFixed(2));
    if (unit) {
      const ufs = parseFloat(getComputedStyle(unit).fontSize);
      unit.style.left = pick.ux + 'px'; unit.style.width = Math.max(1, right - pick.ux) + 'px'; unit.style.top = (base - capEm * s - utt * ufs) + 'px';
    }
    const chars = text.length, est = Math.max(1, Math.floor(chars * Math.min(1, (right - x0 - need - 16) / (((w100 * floor) / 100) || 1) * 0.9)));
    return { ok, lines: 1, sizes: [s], height: Math.round(capEm * s), h: Math.round(capEm * s), est, chars, min: s, floor };
  },
  // Every [data-scrim] over the page's picture: strong enough that the text standing in its box reaches the contrast it needs against the
  // picture's own pixels (read from the image as the page shows it: the crop of object-fit: cover around the focal point, the zoom and the
  // grey treatment), and no stronger. It holds that strength to the foot of the lowest text and fades out below.
  swScrims() {
    for (const el of document.querySelectorAll('[data-scrim]')) {
      const d = el.dataset, img = document.querySelector('img[data-user]:not([data-graphic])'); if (!img || !img.naturalWidth) continue;
      const mode = d.mode || 'scrim';
      const need = +d.need, floorA = +d.floor, capA = +d.capa, fade = +d.fade, sb = el.getBoundingClientRect();
      const kc = (getComputedStyle(el).color.match(/\d+/g) || [0, 0, 0]).slice(0, 3).map(Number);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const texts = [];
      for (const t of document.querySelectorAll('[data-role]')) {
        if (t.closest('[data-deco]') || (t.parentElement && t.parentElement.closest('[data-role]'))) continue;
        const g = document.createRange(); g.selectNodeContents(t);
        for (const b of g.getClientRects()) if (b.width > 1 && b.height > 1 && b.top < sb.bottom && b.bottom > sb.top && b.left < sb.right && b.right > sb.left) texts.push({ b, c: (getComputedStyle(t).color.match(/\d+/g) || [255, 255, 255]).slice(0, 3).map(Number) });
      }
      let alpha = floorA, hold = 0;
      const ib = img.getBoundingClientRect(), nw = img.naturalWidth, nh = img.naturalHeight, s0 = Math.max(ib.width / nw, ib.height / nh), sw = ib.width / s0, sh = ib.height / s0;
      const pos = (img.style.objectPosition || '50% 50%').match(/([\d.]+)%\s+([\d.]+)%/), fx = pos ? +pos[1] / 100 : 0.5, fy = pos ? +pos[2] / 100 : 0.5;
      const tf = getComputedStyle(img).transform, z = tf && tf !== 'none' ? new DOMMatrix(tf).a || 1 : 1, vw = sw / z, vh = sh / z, vx = (nw - sw) * fx + (sw - vw) * fx, vy = (nh - sh) * fy + (sh - vh) * fy;
      const grey = !!img.closest('.k-grey');
      for (const { b, c } of texts) {
        hold = Math.max(hold, mode === 'bottom' ? sb.bottom - b.top + 10 : b.bottom - sb.top + 10);
        const r = { x0: Math.max(b.left, ib.left), y0: Math.max(b.top, ib.top), x1: Math.min(b.right, ib.right), y1: Math.min(b.bottom, ib.bottom) };
        if (r.x1 - r.x0 < 2 || r.y1 - r.y0 < 2) continue;
        const cw = Math.min(96, Math.ceil(r.x1 - r.x0)), ch = Math.min(40, Math.ceil(r.y1 - r.y0)), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(img, vx + ((r.x0 - ib.left) / ib.width) * vw, vy + ((r.y0 - ib.top) / ib.height) * vh, ((r.x1 - r.x0) / ib.width) * vw, ((r.y1 - r.y0) / ib.height) * vh, 0, 0, cw, ch);
        const px = cx.getImageData(0, 0, cw, ch).data, pix = [];
        for (let k = 0; k < px.length; k += 4) { let R = px[k], G = px[k + 1], B = px[k + 2]; if (grey) { let g = 0.2126 * R + 0.7152 * G + 0.0722 * B; g = Math.min(255, Math.max(0, (g - 128) * 1.04 + 128)); R = G = B = g; } pix.push([R, G, B]); }
        const lt = lum(c[0], c[1], c[2]), lmax = (lt + 0.05) / (need * 1.03) - 0.05;
        const p95 = (a) => { const L = pix.map(([R, G, B]) => lum(R * (1 - a) + kc[0] * a, G * (1 - a) + kc[1] * a, B * (1 - a) + kc[2] * a)).sort((x, y) => x - y); return L[Math.min(L.length - 1, Math.round(0.95 * (L.length - 1)))]; };
        let a = floorA;
        if (mode !== 'scrim' && lt < 0.18) {
          // an overlay under dark words: the picture must be LIGHT enough, so the darkest 5% of the blended pixels are held to the target
          const lmin = need * 1.03 * (lt + 0.05) - 0.05;
          const p05 = (q) => { const L = pix.map(([R, G, B]) => lum(R * (1 - q) + kc[0] * q, G * (1 - q) + kc[1] * q, B * (1 - q) + kc[2] * q)).sort((x, y) => x - y); return L[Math.min(L.length - 1, Math.round(0.05 * (L.length - 1)))]; };
          while (a < capA && p05(a) < lmin) a = Math.min(capA, +(a + 0.02).toFixed(3));
        } else while (a < capA && p95(a) > lmax) a = Math.min(capA, +(a + 0.02).toFixed(3));
        alpha = Math.max(alpha, a);
      }
      const rgba = (o) => 'rgba(' + kc.join(',') + ',' + o.toFixed(3) + ')', h = Math.max(hold, 24) + fade;
      if (mode !== 'scrim') {
        // an overlay keeps the box it was placed in: even, or held from its foot (or head) past the words and fading out over its fade length
        el.dataset.alpha = alpha.toFixed(2);
        const held = Math.min(sb.height, Math.max(hold, 24)), gone = Math.min(sb.height, held + fade);
        el.style.background = mode === 'flat' ? rgba(alpha) : 'linear-gradient(to ' + (mode === 'bottom' ? 'top' : 'bottom') + ',' + rgba(alpha) + ' 0,' + rgba(alpha) + ' ' + held + 'px,' + rgba(0) + ' ' + gone + 'px)';
        continue;
      }
      el.style.height = h + 'px'; el.dataset.alpha = alpha.toFixed(2);
      el.style.background = 'linear-gradient(to bottom,' + rgba(alpha) + ' 0,' + rgba(alpha) + ' ' + Math.max(hold, 24) + 'px,' + rgba(0) + ' ' + h + 'px)';
    }
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
