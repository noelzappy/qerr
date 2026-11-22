// The interpreter: draws a composition written as DATA (look.mjs) with the kit's builders. renderComposition(look, comp, c) returns the
// same { html, classes } a code composition's render(c) returns, by walking comp.elements, resolving every place to pixel numbers with the
// look's canvas, and calling the kit (kit.mjs). The look is validated first (index.mjs renderPostWithLook) and normalised; this file still
// trusts nothing from it: a string of the look reaches the page only through the tables below (enum -> kit parameter), a number only
// through the kit's bounded validators, and every word of the post only as Markup (c.fmt, c.text, c.m, c.items, c.parts).
//
// What the interpreter derives and the data never chooses: data-role (from the field a text shows), data-grid="skip" (a turned element,
// or one inside a shape), data-deco (primitives), data-fill (from fill), data-el (index paths, kit numberElements).
import { PRIMITIVES, COLOUR_NAMES } from '../look-elements.mjs';
import { gridOf, rowSpanOf, styleOf } from '../look-static.mjs';
import { capTrim } from './kit.mjs';

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false));
const FLOWING = new Set(['box', 'text', 'fitted-stack', 'numeral', 'mantra-rows', 'rows', 'sticker', 'rule', 'block']);
// the role (what a text is, for the checks) from the field it shows
const ROLE_OF = { headline: 'headline', quote: 'headline', big: 'stat', sub: 'sub', items: 'item', label: 'label', meta: 'meta', by: 'label', tag: 'label', unit: 'label', cta: 'label' };
const SOURCE_ROLE = { brand: 'label', folio: 'folio', index: 'label' };
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const ROMAN = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n) => { let out = ''; for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; } return out; };
const fittedInside = (el) => (el.type === 'fitted-stack' || el.type === 'mantra-rows' || el.type === 'numeral' || (el.type === 'sticker' && el.fit)) || (el.children ?? []).some(fittedInside);
const BAR = new Set(['bar', 'tilt-bar', 'own-line-bar']);
const EMPH_CLASS = { italic: 'italic', accent: 'accent', bold: 'bold', none: 'none', bar: 'none', 'tilt-bar': 'none', 'own-line-bar': 'none' };
export const HEAD_KEY = 'k-head';
// the nine named turning points as the kit's origin (the kit takes corners, the centre and percentages)
const ORIGIN_CSS = { center: undefined, 'left top': 'left top', top: '50% 0%', 'right top': 'right top', left: '0% 50%', right: '100% 50%', 'left bottom': 'left bottom', bottom: '50% 100%', 'right bottom': 'right bottom' };
const nudgeOf = (el) => (el.before || el.nudgeX ? clean({ y: el.before || undefined, x: el.nudgeX || undefined }) : undefined);
const originOf = (el) => (el.originPct ? `${el.originPct[0]}% ${el.originPct[1]}%` : ORIGIN_CSS[el.origin ?? 'center']);

export function renderComposition(look, comp, c) {
  const T = c.tokens, W = c.W, H = c.H, m = c.margin, frame = T.frame, grid = gridOf(look);
  const shadowOf = look.devices.shadow;
  // a page whose picture may give it its colour (the type and the logo's wordmark then follow the ground the page takes)
  if (JSON.stringify(comp.elements).includes('"blend":"ground"')) c.blendPage = true;
  const tilt = look.dials?.tilt ?? 1;
  const angle = (v) => (v === undefined || v === 0 ? 0 : typeof v === 'number' ? +(v * tilt).toFixed(4) : (T.device.rot[v] ?? 0));
  const len = (v, side = 'left') => (typeof v === 'number' ? v : v === 'margin' ? m[side] : v === 'gutter' ? T.grid.gutter : v === 'col' ? c.colW : v === 'frame' ? frame.t : frame.t + frame.pad);
  const whenOk = (w) => !w || ((w.present === undefined || has(w.present)) && (w.absent === undefined || !has(w.absent)));
  const has = (f) => (f === 'image' ? c.hasImage : c.has(f));
  const shadowObj = (s) => (s === undefined ? undefined : s === 'soft' || s === 'lift' ? { soft: s } : s === 'hard' ? { x: shadowOf.x, y: shadowOf.y, colour: shadowOf.colour } : { x: s.x, y: s.y, colour: s.colour ?? 'ink' });
  const stickerFill = look.colour.sticker === 'primary' ? { fill: 'primary', ink: 'on-primary' } : { fill: 'gold', ink: 'on-accent' };
  // the headline the "leave out when tight" element measures: the first headline text of the composition
  let headEl = null;
  if (JSON.stringify(comp.elements).includes('"dropWhenTight":true') || JSON.stringify(comp.elements).includes('"follow":true')) {
    const find = (list) => { for (const e of list) { if ((e.type === 'text' && e.field === 'headline' && styleOf(e) === 'display') || (e.type === 'fitted-stack' && (e.field ?? 'headline') === 'headline')) return e; const k = find(e.children ?? []); if (k) return k; } return null; };
    headEl = find(comp.elements);
  }

  // ---- text content: the field (or source) as Markup, per part, split and format ----
  const dateOf = (field) => {
    const first = (c.raw(field).split('·')[0] ?? '').trim();
    const dm = /^(?:[A-Za-z]{3,9}\.?,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?$/.exec(first), md = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(first);
    const day = dm ? dm[1] : md ? md[2] : null, mon = dm ? dm[2].slice(0, 3) : md ? md[1].slice(0, 3) : null;
    return { day, mon, mm: mon ? MONTHS.indexOf(mon.toLowerCase()) + 1 : 0 };
  };
  const formatted = (field, format) => {
    const raw = c.raw(field), digits = (/\d+/.exec(raw) ?? [''])[0];
    if (format === 'pad2') return digits ? c.m`${digits.padStart(2, '0')}` : c.m``;
    if (format === 'roman') return digits ? c.m`${roman(+digits)}` : c.m``;
    const d = dateOf(field);
    if (format === 'not-date') { const first = (c.raw(field).split('·')[0] ?? '').trim(); return d.day || !first ? c.m`` : c.m`${first}`; }
    if (format === 'day') return d.day ? c.m`${d.day}` : c.m``;
    if (format === 'month') return d.mon ? c.m`${d.mon}` : c.m``;
    return d.day && d.mm ? c.m`${d.day.padStart(2, '0')}.${String(d.mm).padStart(2, '0')}` : c.m``;
  };
  const wordsOf = (el) => {
    if (el.word !== undefined) return { html: c.m`${el.word}`, role: 'label' };
    if (el.source === 'site') return { html: c.site, role: 'label' };
    if (el.source === 'brand') return { html: c.brand, role: SOURCE_ROLE.brand };
    if (el.source === 'folio') return { html: c.folioText(), role: 'folio' };
    if (el.source === 'index') return { html: c.m``, role: 'label' };
    const f = el.field, role = ROLE_OF[f] ?? 'sub';
    if (el.split) {
      const parts = c.parts(f, el.split.sep);
      const pick = el.split.pick === 'rest' ? parts.slice(1) : parts[el.split.pick] ? [parts[el.split.pick]] : [];
      return { html: c.markup(pick.map(String).join(' · ')), role };
    }
    if (el.format) return { html: formatted(f, el.format), role };
    if (el.part && el.part !== 'all') { const p = c.emphasisParts(f); return { html: c.m`${p[el.part] ?? ''}`, role }; }
    const bar = BAR.has(el.emphasis);
    // a headline's [[pill]] words and {{icon}} marks, drawn only when the element says how (else plain words, no icons)
    const marks = clean({ pills: el.pills ? clean({ shape: el.pills.shape ?? 'pill', fill: el.pills.fill, ink: el.pills.ink }) : undefined, icons: el.icons ? clean({ colour: el.icons.colour, badge: el.icons.badge }) : undefined });
    return { html: c.fmt(f, { ...(bar ? { highlight: true, ...(el.emphasis === 'own-line-bar' ? { breakBefore: true } : {}) } : {}), ...marks }), role };
  };

  // ---- places ----
  const padOf = (p) => (Array.isArray(p) ? p : typeof p === 'number' ? [p, p, p, p] : [0, 0, 0, 0]);
  function placeBox(el, P, top) {
    const pl = el.place, base = { w: P.w ?? W, h: P.h ?? H };
    if (pl === undefined) {
      return clean({ flow: true, w: el.w !== undefined ? len(el.w) : undefined, h: el.h !== undefined ? len(el.h, 'top') : undefined, minH: el.minH, grow: el.grow || undefined, alignSelf: el.alignSelf });
    }
    let b = {};
    if (pl.inset) {
      const t = frame.t;
      b = pl.inset === 'page' ? { x: 0, y: 0, w: W, h: H } : pl.inset === 'margins' ? { x: m.left, y: m.top, w: W - m.left - m.right, h: H - m.top - m.bottom } : { x: t, y: t, w: W - 2 * t, h: H - 2 * t };
    } else if (pl.px) b = clean({ x: pl.px.x, y: pl.px.y, w: pl.px.w, h: pl.px.h });
    else if (pl.anchor) {
      const a = pl.anchor, L = a.left !== undefined ? len(a.left, 'left') : undefined, R = a.right !== undefined ? len(a.right, 'right') : undefined, Tp = a.top !== undefined ? len(a.top, 'top') : undefined, B = a.bottom !== undefined ? len(a.bottom, 'bottom') : undefined;
      const aw = a.w !== undefined ? len(a.w) : undefined, ah = a.h !== undefined ? len(a.h, 'top') : undefined;
      const knownW = top || P.w !== undefined, knownH = top || P.h !== undefined;
      if (L !== undefined && R !== undefined) b = knownW ? { x: L, w: base.w - L - R } : { x: L, right: R }; else b = clean({ x: L, right: R, w: aw });
      if (L !== undefined && R === undefined && aw === undefined) b = { x: L };
      if (Tp !== undefined && B !== undefined) b = { ...b, ...(knownH ? { y: Tp, h: base.h - Tp - B } : { y: Tp, bottom: B }) }; else b = { ...b, ...clean({ y: Tp, bottom: B, h: ah }) };
    } else if (pl.grid) {
      const g = pl.grid;
      b.x = c.col(g.col - 1);
      b.w = pl.w !== undefined ? len(pl.w) : c.span(g.col - 1, g.col + g.span - 2);
      if (g.row !== undefined && grid) {
        const [y0, y1] = rowSpanOf(grid, g.row, g.rowSpan ?? 1);
        b.y = y0; b.h = pl.h !== undefined ? len(pl.h, 'top') : y1 - y0; b.y1 = y1; b.alignY = g.alignY;
      } else { b.y = m.top; b.h = H - m.top - m.bottom; }
      if (pl.square) { b.h = b.w; if (g.alignY === 'bottom' && b.y1 !== undefined) b.y = b.y1 - b.h; }
    }
    if (pl.dx) { if (b.x !== undefined) b.x += pl.dx; if (b.right !== undefined) b.right -= pl.dx; }
    if (pl.dy) { if (b.y !== undefined) b.y += pl.dy; if (b.bottom !== undefined) b.bottom -= pl.dy; }
    if (pl.minH) b.minH = pl.minH;
    // bleed: the edges named run past the page edge by a share of the size
    if (el.bleed && top && b.w !== undefined && b.h !== undefined && b.x !== undefined && b.y !== undefined) {
      const k = el.bleed.by ?? 0.05;
      for (const e of el.bleed.edges) {
        if (e === 'left') { b.x -= k * b.w; b.w += k * b.w; } else if (e === 'right') b.w += k * b.w;
        else if (e === 'top') { b.y -= k * b.h; b.h += k * b.h; } else b.h += k * b.h;
      }
    }
    return b;
  }

  // ---- the walk ----
  function walk(list, P, top = false) {
    const parts = list.map((el, i) => ({ el, i }));
    if (top) parts.sort((a, b) => (a.el.z ?? 0) - (b.el.z ?? 0) || a.i - b.i);
    return parts.map(({ el }) => one(el, P, top)).join('');
  }
  function one(el, P, top) {
    if (!whenOk(el.when)) return '';
    const spec = PRIMITIVES[el.type];
    const flowing = el.place === undefined && !top;
    if (flowing && !FLOWING.has(el.type) && !spec?.SPEC.flow) throw new Error(`look: a ${el.type} cannot flow`);
    const box = el.type === 'seam' || el.type === 'band' || el.type === 'frame' || el.type === 'meta-row' ? {} : placeBox(el, P, top);
    const ink = el.ink ?? P.ink;
    const rotDeg = angle(el.rot);
    const skipGrid = P.skipGrid || rotDeg !== 0 || el.type === 'sticker';
    const trim = look.type.display.trim === 'cap' ? capTrim(T.metrics.display, el.lead ?? look.type.display.lead) : undefined;
    const env = {
      c, look, tokens: T, el, box: { ...box }, innerW: P.w, innerH: P.h, ink, skipGrid, trim, z: top ? el.z || undefined : undefined, rot: rotDeg, fill: el.fill, shadow: shadowOf, angle,
      nudge: nudgeOf(el), formatted, metrics: T.metrics.display, textShadow: shadowObj(el.textShadow),
      shadowOpt: shadowObj(el.shadow),
      kids: (o = {}) => walk(el.children ?? [], { kind: el.type, w: o.w ?? P.w, h: o.h, ink: o.ink ?? ink, skipGrid: skipGrid || o.skipGrid, flexDir: o.flexDir }),
      sticker: el.sticker ? () => sticker(el.sticker, { kind: 'seam', w: W, ink, skipGrid: true }, false) : undefined,
    };
    delete env.box.y1; delete env.box.alignY;
    if (spec) {
      // text-like primitives with a grid cell: alignY decides where the lines sit
      if (box.alignY === 'bottom' && el.type === 'fitted-stack') env.box = { ...env.box };
      return String(spec.render(c, el, { ...env, box: env.box }));
    }
    switch (el.type) {
      case 'box': return boxEl(el, env, P, box);
      case 'text': return textEl(el, env, P, box);
      case 'photo': return photoEl(el, env);
      case 'sticker': return sticker(el, P, flowing, env);
      case 'rule': return ruleEl(el, env);
      case 'block': return blockEl(el, env);
      case 'frame': return c.frame({ t: el.t ?? frame.t, colour: el.colour });
      case 'keyline': return c.keyline(clean({ ...env.box, weight: el.weight, colour: el.colour, radius: el.radius }));
      case 'glyph': return c.glyph(clean({ ...env.box, text: el.glyph, size: el.size, lead: 1, colour: el.colour, weight: T.type.display.weight, stretch: el.stretch, textShadow: env.textShadow, z: env.z }));
      default: throw new Error(`look: no renderer for ${el.type}`);
    }
  }

  function boxEl(el, env, P, box) {
    const pad = el.pad === undefined ? undefined : padOf(el.pad);
    const w = env.box.w, inner = (w ?? P.w) !== undefined ? (w ?? P.w) - (pad ? pad[1] + pad[3] : 0) : undefined;
    const h = env.box.h !== undefined ? env.box.h - (pad ? pad[0] + pad[2] : 0) : undefined;
    const rot = env.rot;
    const kids = walk(el.children ?? [], { kind: 'box', w: inner, h, ink: env.ink, skipGrid: env.skipGrid || rot !== 0, flexDir: el.flow, stretch: el.align === 'stretch' });
    return c.box(clean({
      ...env.box, fill: el.fill, ink: el.ink, rot: rot || undefined, origin: rot ? originOf(el) : undefined, shadow: env.shadowOpt, ring: el.ring, border: el.border ? { w: el.border.w, colour: el.border.colour, style: el.border.style } : undefined,
      gradient: el.gradient, pad, radius: el.radius, corners: el.radius !== undefined && el.corners !== 'all' ? el.corners : undefined, flex: el.children?.length ? el.flow : undefined, justify: el.justify === 'start' ? undefined : el.justify, align: el.align === 'start' ? undefined : el.align, gap: el.gap || undefined,
      z: env.z, nudge: env.nudge, unrot: rot && fittedInside(el) ? true : undefined, flexNone: env.box.flow && P.flexDir === 'row' && w !== undefined ? true : undefined,
    }), kids);
  }

  function photoEl(el, env) {
    if (!c.hasImage) return '';
    const treat = el.treat ?? look.photo.treat ?? [], b = env.box, shape = el.shape;
    const softShadow = typeof el.shadow === 'string' && el.shadow !== 'hard' ? el.shadow : undefined;
    const turned = env.rot !== 0 || (el.shadow && !softShadow) || el.ring;
    const inner = (x, y) => {
      if (shape === 'print') return c.print(clean({ x, y, w: b.w, h: b.h, border: el.border, keyline: el.keyline || 1, treat, caption: 0 }));
      if (shape === 'card') return c.box({ x, y, w: b.w, h: b.h, fill: 'paper-warm', pad: el.border ?? 8 }, c.photo({ x: 0, y: 0, w: b.w - 2 * (el.border ?? 8), h: b.h - 2 * (el.border ?? 8), treat, tint: el.tint ?? look.photo.tint }));
      return c.photo(clean({ x, y, w: b.w, h: b.h, right: b.right, bottom: b.bottom, shape, treat, tint: el.tint ?? look.photo.tint, radius: typeof el.radius === 'number' ? el.radius : undefined, soft: softShadow, z: env.z, blend: el.blend && el.blend !== 'none' ? el.blend : undefined, fade: el.blend && el.blend !== 'none' ? el.fade : undefined }))
        + (el.keyline ? c.keyline({ x, y, w: b.w, h: b.h, weight: el.keyline }) : '');
    };
    if (!turned) return inner(b.x, b.y);
    return c.box(clean({ ...b, rot: env.rot || undefined, origin: env.rot ? originOf(el) : undefined, shadow: env.shadowOpt, ring: el.ring, z: env.z }), inner(0, 0));
  }

  function ruleEl(el, env) {
    const weight = typeof el.weight === 'number' ? el.weight : look.devices.rule[el.weight] ?? 1;
    if (env.box.flow) return c.flowBlock({ w: env.box.w ?? 'fill', h: el.vertical ? (env.box.h ?? weight) : weight, colour: el.colour, dotted: el.style === 'dotted' || undefined });
    return c.rule(clean({ x: env.box.x, y: env.box.y, w: env.box.w, h: env.box.h, weight, vertical: el.vertical || undefined, colour: el.colour, dotted: el.style === 'dotted' || undefined }));
  }
  function blockEl(el, env) {
    const b = env.box, plain = !el.radius && !env.shadowOpt && !b.flow;
    if (plain) return c.block(clean({ ...b, colour: el.colour, rot: env.rot || undefined, skew: el.skew || undefined }));
    if (b.flow && !el.radius && !env.shadowOpt && !env.rot && b.h !== undefined) return c.flowBlock({ w: b.w ?? 'fill', h: b.h, colour: el.colour });
    return c.box(clean({ ...b, fill: el.colour, radius: el.radius, corners: el.radius !== undefined && el.corners !== 'all' ? el.corners : undefined, shadow: env.shadowOpt, rot: env.rot || undefined, flexNone: b.flow || undefined, nudge: env.nudge, z: env.z }), '');
  }

  // ---- stickers: a shape with the words fitted inside ----
  function sticker(el, P, flowing, env0) {
    const env = env0 ?? { box: placeBox(el, P, false), rot: angle(el.rot), shadowOpt: shadowObj(el.shadow), nudge: nudgeOf(el), ink: el.ink ?? P.ink };
    if (el.field !== undefined && !c.has(el.field)) return '';
    const shape = el.shape, hug = el.w === 'hug', size = el.size, b = env.box;
    if (shape === 'seal') return c.seal(clean({ x: b.x, y: b.y, size, colour: el.ink ?? 'ink' }));
    const words = [];
    if (el.field !== undefined) {
      const f = el.field, html = c.text(f);
      if (el.fit) {
        const ft = el.fit;
        words.push(c.fitLines(clean({ flow: true, lead: 0.9, track: -0.02, max: ft.maxLines ?? 2, align: 'center', role: 'label', what: f, grid: 'skip', html, cap: ft.cap, floor: ft.floor, stretch: el.stretch, w: hug ? 'fit' : ft.w, minW: hug ? el.minW : undefined, maxW: hug ? el.maxW : undefined, h: ft.h })));
      } else if (el.ladder) {
        const steps = el.ladder.steps.map((s) => s[1]);
        words.push(c.run(clean({ html, role: 'label', family: 'display', size: steps[0], dfont: true, steps: steps.length > 1 ? steps : undefined, maxLines: steps.length > 1 ? el.ladder.maxLines ?? 2 : undefined, maxH: steps.length > 1 ? el.ladder.maxH : undefined, lead: 0.9, weight: T.type.display.weight, track: -0.02, colour: el.ink ?? stickerFill.ink, scale: true })));
      } else words.push(c.run({ html, role: 'label', family: 'display', dfont: true, size: el.textSize ?? Math.round((size ?? el.h ?? 100) / 5), lead: 0.9, weight: T.type.display.weight, colour: el.ink ?? stickerFill.ink }));
    } else words.push(walk(el.children ?? [], { kind: 'sticker', w: size, ink: el.ink ?? stickerFill.ink, skipGrid: true, inShape: true }));
    const pad = el.pad === undefined ? undefined : padOf(el.pad);
    return c.shape(clean({
      shape, size: hug ? undefined : size, w: hug ? undefined : typeof el.w === 'number' ? el.w : undefined, h: el.h ?? (hug ? size : undefined), x: b.x, y: b.y, right: b.right, bottom: b.bottom, flow: b.flow || undefined, alignSelf: b.alignSelf,
      fill: el.fill ?? stickerFill.fill, ink: el.ink ?? stickerFill.ink, radius: shape === 'tile' && el.radius !== undefined ? el.radius : undefined, rot: env.rot || undefined, ring: el.ring, shadow: env.shadowOpt, pad, z: P.kind === 'page' ? el.z || undefined : undefined, nudge: env.nudge, flexNone: b.flow || undefined,
    }), words.join(''));
  }

  // ---- text ----
  function textEl(el, env, P, box) {
    const style = styleOf(el), { html, role } = wordsOf(el);
    if (!html || !String(html)) return '';
    const b = { ...env.box };
    const o = {
      ...b, html, role, colour: env.ink, align: el.align === 'left' ? undefined : el.align, track: el.track, lead: el.lead, weight: el.weight, family: el.font, upper: el.upper, nowrap: el.nowrap,
      textShadow: env.textShadow, nudge: env.nudge, emph: (EMPH_CLASS[el.emphasis ?? 'none'] === 'none' ? undefined : EMPH_CLASS[el.emphasis]), grid: env.skipGrid ? 'skip' : undefined, z: undefined,
      key: el === headEl ? HEAD_KEY : undefined, dropSub: el.dropWhenTight ? { key: HEAD_KEY, lines: 3 } : undefined,
    };
    if (el.tiltBar) {
      // the whole line on a bar turned by the look's highlight turn: a box whose padding follows the size, the words in it
      const size = el.size ?? T.type.label.size, padY = Math.round(size * 0.3), padX = Math.round(size * 0.7);
      return c.box(clean({ flow: true, variant: 'tilt', pad: [padY, padX, padY, padX], alignSelf: b.alignSelf, nudge: env.nudge, flexNone: P.flexDir === 'row' || undefined }),
        c.run(clean({ html, role, family: T.type.label.family, size, lead: el.lead ?? 1, weight: el.weight ?? T.type.label.weight, track: el.track ?? T.type.label.track, upper: el.upper ?? T.type.label.upper, colour: env.ink, nowrap: el.nowrap })));
    }
    if (el.vertical) return c.verticalLabel(clean({ x: b.x, y: b.y, html, down: el.vertical === 'down' || undefined, colour: env.ink }));
    if (P.inShape || P.kind === 'sticker') {
      const fam = el.font ?? (style === 'display' || style === 'numeral' ? 'display' : style === 'label' ? T.type.label.family : 'text');
      return c.run(clean({ ...o, flow: undefined, x: undefined, y: undefined, scale: el.follow || undefined, follow: el.follow ? HEAD_KEY : undefined, size: el.size ?? T.type.label.size, family: fam, dfont: fam === 'display' || undefined }));
    }
    // a first cap line (or last baseline) on a grid line: the look trims the line box by the font's metrics
    const trimmed = look.type.display.trim === 'cap' && b.x !== undefined && !b.flow;
    const fixTrim = (size, lead, face) => {
      if (!trimmed) return;
      const tr = capTrim(T.metrics[face], lead);
      if (box.alignY === 'bottom' && box.y1 !== undefined) { const baseline = box.y1 - T.metrics[face].desc * size; o.bottom = H - (baseline + tr.bottom * size); o.y = undefined; o.h = undefined; } else if (b.y !== undefined) o.y = b.y - tr.top * size;
      o.h = undefined;
    };
    delete o.y1;
    if (style === 'display') {
      const steps = el.ladder ? el.ladder.steps.map((s) => s[1]) : undefined, size = el.size ?? steps?.[0];
      fixTrim(size, el.lead ?? T.type.display.lead, 'display');
      return c.display(clean({ ...o, size: steps?.length > 1 ? undefined : size, steps: steps?.length > 1 ? steps : undefined, maxLines: steps?.length > 1 ? el.ladder.maxLines : undefined, maxH: steps?.length > 1 ? el.ladder.maxH : undefined, split: true, band: true, family: el.font }));
    }
    if (style === 'body') { const size = el.size ?? T.type.body.size; fixTrim(size, (el.lead ?? T.type.body.lead / T.type.body.size), 'text'); return c.body(clean({ ...o, size: el.size, lead: el.lead, family: el.font })); }
    if (style === 'label') return c.label(clean({ ...o, size: el.size, role: role === 'folio' ? 'folio' : role === 'meta' ? 'meta' : 'label' }));
    if (style === 'item') return c.type(clean({ ...o, role: 'item', family: el.font ?? 'text', size: el.size ?? T.type.item.size, lead: el.lead ?? T.type.item.lead, weight: el.weight ?? T.type.item.weight, colour: env.ink ?? 'body' }));
    return c.type(clean({ ...o, role: 'stat', dfont: (el.font ?? 'display') === 'display' || undefined, family: el.font ?? 'display', size: el.size, lead: el.lead ?? 1, scale: true }));
  }

  const html = walk(comp.elements, { kind: 'page', w: W, h: H, ink: undefined, skipGrid: false }, true);
  return { html, classes: '' };
}

// The font roles and weights a composition's elements use, for font embedding: { display: Set, text: Set, label: Set, mono: Set }.
export function fontUsage(look, comp) {
  const T = look.type, use = { display: new Set(), text: new Set(), label: new Set(), mono: new Set() }, shift = look.dials?.weightShift ?? 0;
  const w = (v) => Math.min(900, Math.max(100, Math.round(v + shift)));
  const labelRole = T.label.role === 'mono' ? 'mono' : 'label';
  const add = (role, weight) => use[role].add(w(weight));
  const styleUse = (style, el) => {
    if (style === 'display' || style === 'numeral') add(el.font ?? 'display', el.weight ?? T.display.weight);
    else if (style === 'body') add(el.font ?? 'text', el.weight ?? T.body.weight);
    else if (style === 'item') add(el.font ?? 'text', el.weight ?? T.item.weight);
    else add(el.font ?? labelRole, el.weight ?? T.label.weight);
  };
  const visit = (list) => {
    for (const el of [...list, ...(list.flatMap((e) => (e.sticker ? [e.sticker] : [])))]) {
      switch (el.type) {
        case 'text': styleUse(styleOf(el), el); break;
        case 'fitted-stack': case 'mantra-rows': add('display', T.display.weight); break;
        case 'numeral': add(el.family ?? 'display', el.weight ?? T.display.weight); if (el.unit) styleUse(el.unit.style ?? 'label', {}); break;
        case 'sticker': add('display', T.display.weight); if (el.children) visit(el.children); break;
        case 'rows': styleUse(el.textStyle ?? 'item', {}); if (el.number && el.number !== 'none') { styleUse(el.numberTile ? 'display' : (el.numberStyle ?? 'label'), el.numberTile ? { weight: T.display.weight } : {}); } if (el.keys) styleUse('label', {}); break;
        case 'meta-row': styleUse('label', {}); break;
        case 'wordmark-pattern': add('display', T.display.weight); break;
        case 'glyph': add('display', T.display.weight); break;
        // a primitive that sets type says which fonts (directions/primitives/<name>.mjs fonts(el, look) -> [[role, weight], ...])
        default: if (typeof PRIMITIVES[el.type]?.fonts === 'function') for (const [role, weight] of PRIMITIVES[el.type].fonts(el, look)) add(role, weight); break;
      }
      if (el.children && el.type !== 'sticker') visit(el.children);
    }
  };
  visit(comp.elements);
  return Object.fromEntries(Object.entries(use).filter(([, s]) => s.size).map(([k, s]) => [k, [...s]]));
}
export { COLOUR_NAMES };
