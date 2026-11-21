// The drawn artefacts: ledger sheet, passbook page and register card, as hairline SVG. Every coordinate is computed from validated
// numbers; every word goes through esc(); every colour is a CSS class (the colours live in the brand pack's brand.json).
import { LIMITS, MONO_ADVANCE, ledgerLayout, passbookGeometry, registerHeight } from '../../lib/design/figures.mjs';
import { esc, px } from './common.mjs';
import { lbl, note, obj } from './editorial.mjs';

const n = (v) => px(v);
const num = (v, lo, hi, fallback) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fallback);

// Text in an artefact. role: 'art' (a label, 4.5:1) or 'artbody' (what is written on the page, 7:1).
const text = (x, y, s, { anchor = 'start', cls = 'fl', role = 'art', fs } = {}) =>
  `<text class="${cls}" data-role="${role}" x="${n(x)}" y="${n(y)}" text-anchor="${anchor}"${fs ? ` style="font-size:${n(fs)}px"` : ''}>${esc(s)}</text>`;

export const svgBox = (x, y, w, h, body) => `<svg class="fig" style="left:${n(x)}px;top:${n(y)}px" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}" aria-hidden="true">${body}</svg>`;

// A ledger: header labels, an ink rule, ruled rows of mono text, gold underlines under the cells in `mark` ({row, col}, 0-based).
export function ledgerSvg(ledger) {
  const L = ledgerLayout(ledger.columns, ledger.rows), W = L.width, p = L.pitch;
  let g = ledger.columns.map((c, j) => text(L.cols[j].x, 22, c.label.toUpperCase(), { anchor: L.cols[j].anchor, fs: L.fs })).join('');
  g += `<line class="ln-ink" x1="0" y1="42" x2="${n(W)}" y2="42" stroke-width="1.5"/>`;
  ledger.rows.forEach((row, i) => {
    const y = L.head + (i + 1) * p;
    row.forEach((v, j) => { if (v !== '') g += text(L.cols[j].x, y - Math.round(p * 0.36), v, { anchor: L.cols[j].anchor, cls: 'fv', role: 'artbody', fs: L.fs }); });
    g += `<line class="ln-soft" x1="0" y1="${n(y)}" x2="${n(W)}" y2="${n(y)}"/>`;
  });
  for (const m of ledger.mark ?? []) {
    const col = L.cols[m.col], v = String(ledger.rows[m.row][m.col]);
    const w = Math.max(12, v.length * MONO_ADVANCE * L.fs - 1.2), y = L.head + (m.row + 1) * p - Math.round(p * 0.2);
    g += `<rect class="f-gold" x="${n(col.anchor === 'end' ? col.x - w : col.x)}" y="${n(y)}" width="${n(w)}" height="4"/>`;
  }
  return { svg: g, w: W, h: L.height };
}

// A register card: a title, then label / value rows; `mark` underlines the value of one row in gold.
export function registerSvg(reg) {
  const R = LIMITS.register, W = R.width, h = registerHeight(reg.rows.length);
  let g = text(0, 22, String(reg.title ?? '').toUpperCase()) + `<line class="ln-ink" x1="0" y1="42" x2="${W}" y2="42" stroke-width="1.5"/>`;
  reg.rows.forEach(([label, value], i) => {
    const y = R.head + (i + 1) * R.pitch;
    g += text(0, y - 20, label, { cls: 'fv', role: 'artbody' }) + text(W, y - 20, value, { anchor: 'end', cls: 'fv', role: 'artbody' });
    g += `<line class="ln-soft" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`;
    if (reg.mark === i) { const w = Math.max(12, String(value).length * MONO_ADVANCE * 22 - 1.2); g += `<rect class="f-gold" x="${n(W - w)}" y="${y - 12}" width="${n(w)}" height="4"/>`; }
  });
  return { svg: g, w: W, h };
}

// A ruled passbook page: header fields, 7 columns of days, ticks for the days that are paid, a heavy box on `today`, hatching on
// the cells after the last day of the month.
export function passbookSvg(w, h, { days = 31, ticked = 0, today = 0, tick = 'ink' } = {}) {
  const D = num(days, 28, 31, 31), T = num(ticked, 0, D, 0), now = num(today, 0, D, 0);
  const G = passbookGeometry(w, h, D), p = 0;
  const tickCls = tick === 'gold' ? 'tick-gold' : 'tick-ink';
  let g = `<line class="ln-strong" x1="0" y1="${G.hdr - 22}" x2="${n(w)}" y2="${G.hdr - 22}"/>`;
  g += text(p, 46, 'NAME') + `<line class="ln-soft" x1="70" y1="48" x2="${n(w * 0.62)}" y2="48"/>` + text(w * 0.66, 46, 'PAGE 1');
  for (let i = 0; i <= G.cols; i++) g += `<line class="ln-grid" x1="${n(i * G.cw)}" y1="${G.hdr}" x2="${n(i * G.cw)}" y2="${n(G.hdr + G.rows * G.ch)}"/>`;
  for (let r = 0; r <= G.rows; r++) g += `<line class="ln-grid" x1="0" y1="${n(G.hdr + r * G.ch)}" x2="${n(w)}" y2="${n(G.hdr + r * G.ch)}"/>`;
  for (let i = 0; i < G.slots; i++) {
    const cx = (i % G.cols) * G.cw, cy = G.hdr + Math.floor(i / G.cols) * G.ch;
    if (i >= D) { g += `<line class="ln-soft" x1="${n(cx)}" y1="${n(cy + G.ch)}" x2="${n(cx + G.cw)}" y2="${n(cy)}"/>`; continue; }
    g += text(cx + 9, cy + 24, String(i + 1), { cls: 'fn' });
    if (i < T) {
      const m = Math.min(G.cw, G.ch), ox = cx + G.cw / 2, oy = cy + G.ch / 2 + 4;
      g += `<polyline class="${tickCls} nofill" points="${n(ox - m * 0.17)},${n(oy)} ${n(ox - m * 0.04)},${n(oy + m * 0.13)} ${n(ox + m * 0.2)},${n(oy - m * 0.15)}" stroke-width="${n(Math.max(2.5, m * 0.03))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (i + 1 === now) g += `<rect class="ln-ink nofill" x="${n(cx + 1)}" y="${n(cy + 1)}" width="${n(G.cw - 2)}" height="${n(G.ch - 2)}" stroke-width="2.5"/>`;
  }
  return g;
}

// The artefact as the editorial pages set it on the panel, as crisp white cards in the rectangle r (page pixels, from validated
// numbers): a ledger card (its drawn size, its notes under it) or a register card at r's top-left; a passbook page filling r;
// or, with a register card, the passbook page 410 px wide and r's height at r's top-left and the register card at r's top-right.
// onPanel: the notes sit on the tint panel (the fit check then does not count the panel's edge for them); tone: their tone class
// there (editorial.mjs toneOf: the panel's tone against the page's ground).
export function artefactCards(art, r, { onPanel = true, tone = '' } = {}) {
  const at = (x, y, t) => (onPanel ? note(x, y, t, { tone }) : `<div class="abs" style="left:${n(x)}px;top:${n(y)}px">${lbl(t, 'n', 'label')}</div>`);
  if (art.type === 'ledger') {
    const f = ledgerSvg(art), pad = 40, w = f.w + 2 * pad, h = f.h + 2 * pad;
    return obj(r.x, r.y, w, h, 'card', svgBox(pad, pad, f.w, f.h, f.svg)) + (art.notes ?? []).map((t, i) => at(r.x, r.y + h + 44 + i * 42, t)).join('');
  }
  if (art.type === 'register') {
    const f = registerSvg(art), pad = 32, w = f.w + 2 * pad, h = f.h + 2 * pad;
    return obj(r.x, r.y, w, h, 'card', svgBox(pad, pad, f.w, f.h, f.svg));
  }
  const pass = { days: art.days ?? 31, ticked: art.ticked ?? 0, today: art.today ?? 0, tick: art.tick ?? 'ink' };
  if (art.register) {
    const pw = 410, ph = r.h, pad = 30, f = registerSvg(art.register), cw = f.w + 64, ch = f.h + 64;
    return obj(r.x, r.y, pw, ph, 'card', svgBox(pad, pad, pw - 2 * pad, ph - 2 * pad, passbookSvg(pw - 2 * pad, ph - 2 * pad, pass)))
      + obj(r.x + r.w - cw, r.y, cw, ch, 'card', svgBox(32, 32, f.w, f.h, f.svg));
  }
  const pad = 34, w = r.w - 2 * pad, h = r.h - 2 * pad;
  return obj(r.x, r.y, r.w, r.h, 'card', svgBox(pad, pad, w, h, passbookSvg(w, h, pass)));
}
