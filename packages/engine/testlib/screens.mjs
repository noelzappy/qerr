// Synthetic app screenshots for tests and the demo pictures (no dependencies, no Chrome): a made-up savings app drawn from rectangles, rounded
// rectangles and circles with the PNG encoder in png.mjs. Bars stand for words and every figure is a shape, so no real app, name, interface or
// amount is copied. appScreen(w, h, { theme, accent }) -> the bytes of an RGB PNG (no transparency: a bare screenshot, as a phone saves one).
import { pngBytes } from './png.mjs';

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const THEMES = {
  light: { bg: '#F4F2EE', card: '#FFFFFF', ink: '#1A2233', soft: '#9AA2B1', line: '#E3E0DA', tab: '#FFFFFF' },
  dark: { bg: '#10141C', card: '#1C2330', ink: '#EEF1F6', soft: '#7D8798', line: '#2A3240', tab: '#161B25' },
};

export function appScreen(w = 645, h = 1398, { theme = 'light', accent = '#3D6FD1', second = '#E8603C' } = {}) {
  const T = THEMES[theme] ?? THEMES.light, A = hex(accent), B = hex(second);
  const C = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, hex(v)]));
  const u = w / 645; // drawn at 645 px wide, scaled
  const S = (v) => v * u;
  const inRound = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const box = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
  const circle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  const tabTop = h - S(150);
  return pngBytes(w, h, (x, y) => {
    // the status bar: a time block on the left, signal and battery on the right
    if (y < S(110)) {
      if (inRound(x, y, S(48), S(44), S(128), S(70), S(8))) return C.ink;
      if (inRound(x, y, S(520), S(46), S(580), S(70), S(6)) && !inRound(x, y, S(524), S(50), S(576), S(66), S(4))) return C.ink;
      if (inRound(x, y, S(527), S(53), S(560), S(63), S(2))) return C.ink;
      for (let k = 0; k < 4; k++) if (box(x, y, S(455 + k * 13), S(66 - k * 6), S(464 + k * 13), S(70))) return C.ink;
      return C.bg;
    }
    // the tab bar at the foot: four round icons, the first in the accent colour
    if (y >= tabTop) {
      if (y < tabTop + S(2)) return C.line;
      for (let k = 0; k < 4; k++) if (circle(x, y, S(100 + k * 148), tabTop + S(58), S(20))) return k === 0 ? A : C.soft;
      if (inRound(x, y, w / 2 - S(70), h - S(26), w / 2 + S(70), h - S(16), S(5))) return C.ink;
      return C.tab;
    }
    // a heading (two bars) and a round picture at the top right
    if (inRound(x, y, S(48), S(150), S(300), S(178), S(10))) return C.soft;
    if (inRound(x, y, S(48), S(196), S(420), S(240), S(14))) return C.ink;
    if (circle(x, y, S(560), S(195), S(36))) return B;
    // the balance card in the accent colour: a label bar, a big figure as a block, a progress bar
    if (inRound(x, y, S(40), S(290), S(605), S(600), S(36))) {
      if (inRound(x, y, S(84), S(338), S(260), S(360), S(9))) return [255, 255, 255].map((v, i) => Math.round(v * 0.75 + A[i] * 0.25));
      if (inRound(x, y, S(84), S(392), S(430), S(470), S(16))) return [255, 255, 255];
      if (inRound(x, y, S(84), S(520), S(561), S(546), S(13))) return inRound(x, y, S(84), S(520), S(84) + (S(561) - S(84)) * 0.68, S(546), S(13)) ? [255, 255, 255] : A.map((v) => Math.round(v * 0.7));
      return A;
    }
    // four round actions under the card
    for (let k = 0; k < 4; k++) {
      const cx = S(110 + k * 142);
      if (circle(x, y, cx, S(690), S(46))) return circle(x, y, cx, S(690), S(16)) ? (k === 1 ? B : A) : C.card;
      if (inRound(x, y, cx - S(40), S(756), cx + S(40), S(772), S(8))) return C.soft;
    }
    // the list: rows with a round picture, two bars, and a figure bar at the right, between hairlines
    for (let k = 0; k < 4; k++) {
      const top = S(830 + k * 118);
      if (top + S(118) > tabTop) break;
      if (box(x, y, S(48), top + S(116), S(597), top + S(118))) return C.line;
      if (circle(x, y, S(90), top + S(58), S(34))) return k % 2 ? B : A;
      if (inRound(x, y, S(148), top + S(34), S(360 - k * 18), top + S(56), S(10))) return C.ink;
      if (inRound(x, y, S(148), top + S(70), S(290), top + S(86), S(8))) return C.soft;
      if (inRound(x, y, S(470 + (k % 2) * 20), top + S(42), S(597), top + S(66), S(10))) return C.ink;
    }
    return C.bg;
  });
}
