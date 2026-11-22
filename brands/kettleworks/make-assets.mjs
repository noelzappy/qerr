// node brands/kettleworks/make-assets.mjs
// Draws the Kettleworks Coffee pack's logos and its pictures. Kettleworks Coffee is a fictional neighbourhood roaster: everything here
// is synthetic, drawn on a canvas in the engine's own Chrome from the shapes in this file (no photograph, no real person, place,
// organisation or amount). Run it again after changing a drawing; the files it writes are committed with the pack.
//   brands/kettleworks/logos/logo-mark.png, logo-full.png   transparent PNG: a round espresso badge with a cream bean and a tangerine
//                                                            dot, then the wordmark "Kettleworks" set in Fraunces
//   brands/kettleworks/pictures/latte-top.jpg               a latte seen from above on a terracotta table (the drink of the week)
//   brands/kettleworks/pictures/beans.jpg                   roasted beans filling the frame (a full-bleed texture)
//   brands/kettleworks/pictures/mug.jpg                     a mug with steam on a plain cream ground (its edges are plain)
// The pictures are what the pack's tests draw with (a fresh clone has them); the example batch uses licensed photographs instead
// (packages/engine/design/assets/photos/, not committed, credited in CREDITS.md there).
// One Chrome at a time: the engine's lock (out/design.lock) is taken while it draws.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from '../../packages/engine/lib/core.mjs';
import { Browser, NO_CHROME, findChrome } from '../../packages/engine/lib/design/chrome.mjs';

// The brand's colours (brand.json): espresso, the brown primary, cream and the tangerine accent.
const ESPRESSO = '#2A1A12', BROWN = '#6A3B22', CREAM = '#F6EEDF', TANGERINE = '#F26A3D';
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(ENGINE_DIR, 'design', 'fonts', f)).toString('base64')}`;
const FONTS = `
  const fr = new FontFace('Fraunces', 'url(${font('fraunces/fraunces-v38-normal-latin.woff2')})', { weight: '300 600' });
  document.fonts.add(await fr.load());`;
const out = (rel) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); return abs; };
const dataToBuf = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

// A canvas drawing in the page; returns the encoded file. rnd() is a seeded random number (the same picture every run); grain(a) lays a
// fine noise over the whole canvas.
async function draw(page, w, h, type, body) {
  return dataToBuf(await page.evaluate(`(async () => {${FONTS}
    const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h};
    const g = c.getContext('2d');
    let seed = 7; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const grain = (a) => { for (let i = 0; i < c.width * c.height / 90; i++) { g.fillStyle = (rnd() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (a * rnd()).toFixed(3) + ')'; g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2); } };
    const shadow = (x, y, rx, ry, a) => { const s = g.createRadialGradient(x, y, 0, x, y, rx); s.addColorStop(0, 'rgba(40,20,10,' + a + ')'); s.addColorStop(1, 'rgba(40,20,10,0)'); g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y); g.fillStyle = s; g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill(); g.restore(); };
    // a roasted bean at x, y, length l, turned a: a dark oval with a lit side and an S-shaped groove
    const bean = (x, y, l, a, tone) => {
      g.save(); g.translate(x, y); g.rotate(a);
      const b = g.createRadialGradient(-l * 0.15, -l * 0.2, l * 0.05, 0, 0, l * 0.6);
      b.addColorStop(0, tone[0]); b.addColorStop(0.6, tone[1]); b.addColorStop(1, tone[2]);
      g.fillStyle = b; g.beginPath(); g.ellipse(0, 0, l * 0.5, l * 0.36, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(20,8,2,0.85)'; g.lineWidth = l * 0.06; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-l * 0.42, 0); g.bezierCurveTo(-l * 0.15, -l * 0.14, l * 0.15, l * 0.14, l * 0.42, 0); g.stroke();
      g.restore();
    };
    ${body}
    return c.toDataURL('${type}', 0.9);
  })()`));
}

const MARK = `
  const mark = (x0, y0, s) => {
    g.fillStyle = '${ESPRESSO}'; g.beginPath(); g.arc(x0 + s / 2, y0 + s / 2, s / 2, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(x0 + s * 0.47, y0 + s * 0.53); g.rotate(-0.5);
    g.fillStyle = '${CREAM}'; g.beginPath(); g.ellipse(0, 0, s * 0.25, s * 0.18, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '${ESPRESSO}'; g.lineWidth = s * 0.035; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-s * 0.21, 0); g.bezierCurveTo(-s * 0.07, -s * 0.08, s * 0.07, s * 0.08, s * 0.21, 0); g.stroke();
    g.restore();
    g.fillStyle = '${TANGERINE}'; g.beginPath(); g.arc(x0 + s * 0.74, y0 + s * 0.27, s * 0.075, 0, Math.PI * 2); g.fill();
  };`;

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error(NO_CHROME);
  const browser = await Browser.launch({ chromePath, lockFile: path.join(ROOT, 'out', 'design.lock') });
  try {
    const page = await browser.page(800, 600);
    await page.setContent('<!doctype html><body></body>');
    fs.writeFileSync(out('brands/kettleworks/logos/logo-mark.png'), await draw(page, 338, 338, 'image/png', `${MARK} mark(0, 0, 338);`));
    const full = await draw(page, 2200, 338, 'image/png', `
      g.font = '600 220px Fraunces'; c.width = 380 + Math.ceil(g.measureText('Kettleworks').width) + 8;
      ${MARK} mark(0, 0, 338);
      g.fillStyle = '${ESPRESSO}'; g.font = '600 220px Fraunces'; g.textBaseline = 'alphabetic'; g.fillText('Kettleworks', 380, 248);`);
    fs.writeFileSync(out('brands/kettleworks/logos/logo-full.png'), full);
    console.log(`logo-full.png is ${full.readUInt32BE(16)} x ${full.readUInt32BE(20)} (logos.fullSize in brand.json)`);

    // A latte from above on a terracotta table: saucer, cup, a crema heart, a spoon and a few beans.
    fs.writeFileSync(out('brands/kettleworks/pictures/latte-top.jpg'), await draw(page, 1600, 2000, 'image/jpeg', `
      const t = g.createLinearGradient(0, 0, 1600, 2000); t.addColorStop(0, '#C86A43'); t.addColorStop(1, '#A84E2C'); g.fillStyle = t; g.fillRect(0, 0, 1600, 2000);
      for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(90,30,10,' + (0.05 + rnd() * 0.06) + ')'; g.lineWidth = 2 + rnd() * 6; g.beginPath(); const y = rnd() * 2000; g.moveTo(0, y); g.bezierCurveTo(500, y + rnd() * 80 - 40, 1100, y + rnd() * 80 - 40, 1600, y + rnd() * 60 - 30); g.stroke(); }
      const cx = 800, cy = 1020;
      shadow(cx + 50, cy + 60, 640, 640, 0.45);
      const sc = g.createRadialGradient(cx - 120, cy - 140, 60, cx, cy, 600); sc.addColorStop(0, '#FFFDF7'); sc.addColorStop(1, '#E9DCC8');
      g.fillStyle = sc; g.beginPath(); g.arc(cx, cy, 560, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,90,60,0.18)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 470, 0, Math.PI * 2); g.stroke();
      shadow(cx + 30, cy + 40, 420, 420, 0.35);
      g.fillStyle = '#FBF7EF'; g.beginPath(); g.arc(cx, cy, 400, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(cx + 380, cy + 40); g.rotate(0.15); g.fillStyle = '#F3EBDD'; rr(0, -55, 210, 110, 55); g.fill(); g.fillStyle = '#B5552F'; rr(40, -24, 130, 48, 24); g.fill(); g.restore();
      const cof = g.createRadialGradient(cx - 60, cy - 70, 20, cx, cy, 340); cof.addColorStop(0, '#B4723F'); cof.addColorStop(0.75, '#8A4E28'); cof.addColorStop(1, '#5A2E16');
      g.fillStyle = cof; g.beginPath(); g.arc(cx, cy, 340, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#F4E6CF'; g.beginPath(); g.moveTo(cx, cy + 190);
      g.bezierCurveTo(cx - 60, cy + 120, cx - 250, cy + 20, cx - 230, cy - 110); g.bezierCurveTo(cx - 210, cy - 230, cx - 50, cy - 240, cx, cy - 120);
      g.bezierCurveTo(cx + 50, cy - 240, cx + 210, cy - 230, cx + 230, cy - 110); g.bezierCurveTo(cx + 250, cy + 20, cx + 60, cy + 120, cx, cy + 190); g.fill();
      g.strokeStyle = 'rgba(140,80,40,0.55)'; g.lineWidth = 10; g.beginPath(); g.moveTo(cx, cy - 110); g.lineTo(cx, cy + 175); g.stroke();
      for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(140,80,40,0.35)'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy - 20 + k * 40, 120 - k * 22, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }
      g.save(); g.translate(cx - 470, cy + 470); g.rotate(-0.75); const sp = g.createLinearGradient(0, -30, 0, 30); sp.addColorStop(0, '#E8E2DA'); sp.addColorStop(1, '#9C948A');
      g.fillStyle = sp; rr(-30, -14, 420, 28, 14); g.fill(); g.beginPath(); g.ellipse(-90, 0, 80, 52, 0, 0, Math.PI * 2); g.fill(); g.restore();
      for (const [x, y, a] of [[230, 300, 0.4], [330, 380, 2.1], [1350, 1750, 1.2], [1250, 1820, 2.8], [1420, 1640, 0.3], [180, 1700, 1.9]]) { shadow(x + 10, y + 14, 70, 50, 0.4); bean(x, y, 120, a, ['#7A4A2A', '#4A2614', '#24110A']); }
      grain(0.07);`));

    // Roasted beans filling the frame, lit from the top left.
    fs.writeFileSync(out('brands/kettleworks/pictures/beans.jpg'), await draw(page, 1600, 2000, 'image/jpeg', `
      g.fillStyle = '#1E0F08'; g.fillRect(0, 0, 1600, 2000);
      for (let i = 0; i < 1300; i++) { const x = rnd() * 1700 - 50, y = rnd() * 2100 - 50, l = 90 + rnd() * 50, lit = 1 - (x + y) / 4200;
        shadow(x + 8, y + 12, l * 0.6, l * 0.45, 0.6);
        bean(x, y, l, rnd() * Math.PI * 2, [lit > 0.55 ? '#8C5733' : '#6E4022', '#462413', '#1C0C05']); }
      const v = g.createRadialGradient(700, 800, 300, 800, 1000, 1300); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,4,2,0.55)'); g.fillStyle = v; g.fillRect(0, 0, 1600, 2000);
      grain(0.06);`));

    // A mug with steam on a plain cream ground, a soft shadow under it: the edges are plain, so the page can take their colour.
    fs.writeFileSync(out('brands/kettleworks/pictures/mug.jpg'), await draw(page, 1600, 2000, 'image/jpeg', `
      g.fillStyle = '#EFE3CE'; g.fillRect(0, 0, 1600, 2000);
      const fl = g.createLinearGradient(0, 1250, 0, 2000); fl.addColorStop(0, 'rgba(0,0,0,0)'); fl.addColorStop(1, 'rgba(120,80,40,0.10)'); g.fillStyle = fl; g.fillRect(0, 1250, 1600, 750);
      shadow(820, 1560, 560, 90, 0.35);
      g.lineWidth = 64; g.strokeStyle = '#E25A2F'; g.beginPath(); g.ellipse(1150, 1180, 150, 190, 0, -Math.PI / 2, Math.PI / 2); g.stroke();
      const m = g.createLinearGradient(380, 0, 1180, 0); m.addColorStop(0, '#C84A22'); m.addColorStop(0.35, '#F26A3D'); m.addColorStop(0.7, '#E35C31'); m.addColorStop(1, '#B9431E');
      g.fillStyle = m; g.beginPath(); g.moveTo(380, 860); g.lineTo(1160, 860); g.lineTo(1140, 1450); g.bezierCurveTo(1130, 1540, 1060, 1580, 960, 1580); g.lineTo(580, 1580); g.bezierCurveTo(480, 1580, 410, 1540, 400, 1450); g.closePath(); g.fill();
      g.fillStyle = '#F7C9A8'; g.beginPath(); g.ellipse(770, 860, 390, 70, 0, 0, Math.PI * 2); g.fill();
      const cf = g.createRadialGradient(700, 850, 20, 770, 865, 360); cf.addColorStop(0, '#9A5A30'); cf.addColorStop(1, '#4E2812'); g.fillStyle = cf; g.beginPath(); g.ellipse(770, 866, 352, 56, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.22)'; rr(470, 940, 54, 520, 27); g.fill();
      for (let s = 0; s < 3; s++) { g.strokeStyle = 'rgba(255,255,255,' + (0.55 - s * 0.1) + ')'; g.lineWidth = 26 - s * 4; g.lineCap = 'round'; const x = 640 + s * 130;
        g.beginPath(); g.moveTo(x, 760); g.bezierCurveTo(x - 90, 640, x + 90, 560, x, 430 - s * 30); g.bezierCurveTo(x - 60, 350, x + 50, 300, x + 10, 220); g.stroke(); }
      grain(0.05);`));

    console.log('kettleworks assets written');
  } finally {
    browser.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
