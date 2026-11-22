// node brands/saltandember/make-assets.mjs
// Draws the Salt & Ember pack's logos and its pictures. Salt & Ember is a fictional grill restaurant: everything here is synthetic,
// drawn on a canvas in the engine's own Chrome from the shapes in this file (no photograph, no real person, place, organisation or
// amount). Run it again after changing a drawing; the files it writes are committed with the pack.
//   brands/saltandember/logos/logo-mark.png, logo-full.png   transparent PNG: an ember flame over a salt crystal in a charcoal ring,
//                                                             then the wordmark "Salt & Ember" set in Fraunces
//   brands/saltandember/pictures/steak.jpg                   sliced steak on a dark board, from above (dark, busy edges)
//   brands/saltandember/pictures/embers.jpg                  glowing coals and low flames (a full-bleed texture)
//   brands/saltandember/pictures/grill.jpg                   charred leeks and peppers on a grill over the fire
//   brands/saltandember/pictures/plate.jpg                   a plated fillet with its sauce on a pale plate on a dark table
// The pictures are what the pack's tests draw with (a fresh clone has them); the example batch uses licensed photographs instead
// (packages/engine/design/assets/photos/, not committed, credited in CREDITS.md there).
// One Chrome at a time: the engine's lock (out/design.lock) is taken while it draws.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from '../../packages/engine/lib/core.mjs';
import { Browser, NO_CHROME, findChrome } from '../../packages/engine/lib/design/chrome.mjs';

// The brand's colours (brand.json): the charcoal primary, the near-black ground, bone and the ember accent.
const CHARCOAL = '#2B211C', BONE = '#EFE6D7', EMBER = '#E07B3C';
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(ENGINE_DIR, 'design', 'fonts', f)).toString('base64')}`;
const FONTS = `
  const fr = new FontFace('Fraunces', 'url(${font('fraunces/fraunces-v38-normal-latin.woff2')})', { weight: '300 600' });
  document.fonts.add(await fr.load());`;
const out = (rel) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); return abs; };
const dataToBuf = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

// A canvas drawing in the page; returns the encoded file. rnd() is a seeded random number (the same picture every run).
async function draw(page, w, h, type, body) {
  return dataToBuf(await page.evaluate(`(async () => {${FONTS}
    const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h};
    const g = c.getContext('2d');
    let seed = 11; const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const grain = (a) => { for (let i = 0; i < c.width * c.height / 90; i++) { g.fillStyle = (rnd() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (a * rnd()).toFixed(3) + ')'; g.fillRect(rnd() * c.width, rnd() * c.height, 2, 2); } };
    const glow = (x, y, r, col, a) => { const s = g.createRadialGradient(x, y, 0, x, y, r); s.addColorStop(0, 'rgba(' + col + ',' + a + ')'); s.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = s; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    const shadow = (x, y, rx, ry, a) => { g.save(); g.translate(x, y); g.scale(1, ry / rx); glow(0, 0, rx, '0,0,0', a); g.restore(); };
    const vignette = (a) => { const v = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,' + a + ')'); g.fillStyle = v; g.fillRect(0, 0, c.width, c.height); };
    // a sprig of rosemary from x, y along angle a, length l
    const sprig = (x, y, a, l) => { g.save(); g.translate(x, y); g.rotate(a); g.strokeStyle = '#4C5A2E'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 0); g.lineTo(l, 0); g.stroke();
      for (let t = 10; t < l; t += 16) for (const s of [-1, 1]) { g.save(); g.translate(t, 0); g.rotate(s * (0.7 + rnd() * 0.3)); g.fillStyle = rnd() < 0.5 ? '#5F7238' : '#7A8C4A'; g.beginPath(); g.ellipse(26, 0, 28, 6, 0, 0, Math.PI * 2); g.fill(); g.restore(); } g.restore(); };
    const salt = (n, x0, y0, w, h) => { for (let i = 0; i < n; i++) { const x = x0 + rnd() * w, y = y0 + rnd() * h, s = 4 + rnd() * 9; g.fillStyle = 'rgba(250,248,240,' + (0.6 + rnd() * 0.4) + ')'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s * 0.8); g.lineTo(x - s * 0.9, y); g.fill(); } };
    ${body}
    return c.toDataURL('${type}', 0.9);
  })()`));
}

const MARK = `
  const mark = (x0, y0, s) => {
    g.fillStyle = '${CHARCOAL}'; g.beginPath(); g.arc(x0 + s / 2, y0 + s / 2, s / 2, 0, Math.PI * 2); g.fill();
    const cx = x0 + s / 2;
    g.fillStyle = '${EMBER}'; g.beginPath(); g.moveTo(cx, y0 + s * 0.16);
    g.bezierCurveTo(cx + s * 0.2, y0 + s * 0.34, cx + s * 0.2, y0 + s * 0.56, cx, y0 + s * 0.66);
    g.bezierCurveTo(cx - s * 0.2, y0 + s * 0.56, cx - s * 0.2, y0 + s * 0.34, cx, y0 + s * 0.16); g.fill();
    g.fillStyle = '${BONE}'; g.beginPath(); g.moveTo(cx, y0 + s * 0.62); g.lineTo(cx + s * 0.13, y0 + s * 0.74); g.lineTo(cx, y0 + s * 0.86); g.lineTo(cx - s * 0.13, y0 + s * 0.74); g.fill();
  };`;

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error(NO_CHROME);
  const browser = await Browser.launch({ chromePath, lockFile: path.join(ROOT, 'out', 'design.lock') });
  try {
    const page = await browser.page(800, 600);
    await page.setContent('<!doctype html><body></body>');
    fs.writeFileSync(out('brands/saltandember/logos/logo-mark.png'), await draw(page, 338, 338, 'image/png', `${MARK} mark(0, 0, 338);`));
    const full = await draw(page, 2400, 338, 'image/png', `
      g.font = '400 210px Fraunces'; c.width = 380 + Math.ceil(g.measureText('Salt & Ember').width) + 8;
      ${MARK} mark(0, 0, 338);
      g.fillStyle = '${CHARCOAL}'; g.font = '400 210px Fraunces'; g.textBaseline = 'alphabetic'; g.fillText('Salt & Ember', 380, 244);`);
    fs.writeFileSync(out('brands/saltandember/logos/logo-full.png'), full);
    console.log(`logo-full.png is ${full.readUInt32BE(16)} x ${full.readUInt32BE(20)} (logos.fullSize in brand.json)`);

    // Sliced steak fanned on a dark board, from above: crust, a pink middle, rosemary and flakes of salt.
    fs.writeFileSync(out('brands/saltandember/pictures/steak.jpg'), await draw(page, 1600, 2000, 'image/jpeg', `
      g.fillStyle = '#16110F'; g.fillRect(0, 0, 1600, 2000);
      shadow(840, 1060, 760, 900, 0.7);
      const bd = g.createLinearGradient(0, 200, 1600, 1800); bd.addColorStop(0, '#3A2A20'); bd.addColorStop(1, '#22170F'); g.fillStyle = bd; rr(180, 260, 1240, 1560, 60); g.fill();
      for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(0,0,0,' + (0.08 + rnd() * 0.12) + ')'; g.lineWidth = 2 + rnd() * 5; const y = 280 + rnd() * 1520; g.beginPath(); g.moveTo(200, y); g.bezierCurveTo(600, y + rnd() * 30 - 15, 1000, y + rnd() * 30 - 15, 1400, y + rnd() * 20 - 10); g.stroke(); }
      for (let i = 0; i < 7; i++) {
        g.save(); g.translate(560 + i * 80, 620 + i * 105); g.rotate(-0.42 + i * 0.03);
        shadow(18, 26, 300, 120, 0.6);
        g.fillStyle = '#2A140C'; rr(-290, -105, 580, 210, 90); g.fill();
        const m = g.createRadialGradient(0, 0, 20, 0, 0, 280); m.addColorStop(0, '#D9566A'); m.addColorStop(0.55, '#B8424E'); m.addColorStop(0.85, '#8A3A2E'); m.addColorStop(1, '#5A2A1C');
        g.fillStyle = m; rr(-262, -78, 524, 156, 70); g.fill();
        for (let k = 0; k < 8; k++) { g.strokeStyle = 'rgba(255,200,200,0.12)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-220 + k * 55, -60); g.lineTo(-200 + k * 55, 60); g.stroke(); }
        g.restore();
      }
      sprig(330, 470, 0.5, 360); sprig(1050, 1500, -2.4, 340); sprig(1180, 420, 2.2, 260);
      salt(140, 350, 450, 900, 1150);
      for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(10,6,4,0.8)'; g.beginPath(); g.arc(360 + rnd() * 880, 480 + rnd() * 1100, 3 + rnd() * 4, 0, Math.PI * 2); g.fill(); }
      glow(1300, 1650, 260, '230,180,120', 0.0);
      g.fillStyle = '#1C1411'; g.beginPath(); g.arc(1240, 1580, 150, 0, Math.PI * 2); g.fill();
      const sc = g.createRadialGradient(1220, 1560, 10, 1240, 1580, 120); sc.addColorStop(0, '#6E8A3A'); sc.addColorStop(1, '#3F5220'); g.fillStyle = sc; g.beginPath(); g.arc(1240, 1580, 118, 0, Math.PI * 2); g.fill();
      vignette(0.65); grain(0.06);`));

    // Glowing coals and low flames: a dark field lit from below.
    fs.writeFileSync(out('brands/saltandember/pictures/embers.jpg'), await draw(page, 1600, 2000, 'image/jpeg', `
      g.fillStyle = '#0C0807'; g.fillRect(0, 0, 1600, 2000);
      glow(800, 1700, 1100, '200,70,20', 0.45);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 22; i++) { const x = 60 + rnd() * 1480, base = 1260 + rnd() * 120, h = 260 + rnd() * 520, w = 50 + rnd() * 80;
        const f = g.createLinearGradient(0, base, 0, base - h); f.addColorStop(0, 'rgba(255,170,70,0.5)'); f.addColorStop(0.5, 'rgba(230,90,30,0.22)'); f.addColorStop(1, 'rgba(200,60,20,0)');
        g.fillStyle = f; g.beginPath(); g.moveTo(x - w, base); g.bezierCurveTo(x - w, base - h * 0.5, x + w * 0.3, base - h * 0.7, x + (rnd() - 0.5) * 60, base - h); g.bezierCurveTo(x + w * 0.2, base - h * 0.6, x + w, base - h * 0.4, x + w, base); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 520; i++) { const y = 1150 + Math.pow(rnd(), 0.8) * 900, x = rnd() * 1700 - 50, r = 40 + rnd() * 60 + (y - 1150) * 0.06, hot = rnd() < 0.3 ? rnd() : 0;
        g.save(); g.translate(x, y); g.rotate(rnd() * 3);
        const e = g.createRadialGradient(0, 0, 2, 0, 0, r); e.addColorStop(0, hot ? (hot > 0.5 ? '#FFC46A' : '#E8642A') : '#3A241A'); e.addColorStop(0.5, hot ? '#A8361A' : '#22140E'); e.addColorStop(1, '#0C0605');
        g.fillStyle = e; g.beginPath(); g.ellipse(0, 0, r, r * (0.55 + rnd() * 0.3), 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = rnd() < 0.4 ? 'rgba(255,120,40,0.75)' : 'rgba(10,5,3,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-r * 0.6, 0); g.lineTo(-r * 0.1, r * 0.15); g.lineTo(r * 0.5, -r * 0.05); g.stroke(); g.restore(); }
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(255,' + (150 + Math.floor(rnd() * 80)) + ',80,' + (0.3 + rnd() * 0.6) + ')'; g.beginPath(); g.arc(rnd() * 1600, rnd() * 1200, 1.5 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      grain(0.05);`));

    // Charred leeks and peppers on a grill over the fire, from above at an angle.
    fs.writeFileSync(out('brands/saltandember/pictures/grill.jpg'), await draw(page, 1600, 2000, 'image/jpeg', `
      g.fillStyle = '#0E0907'; g.fillRect(0, 0, 1600, 2000);
      for (let i = 0; i < 40; i++) glow(rnd() * 1600, rnd() * 2000, 120 + rnd() * 220, '220,90,30', 0.18 + rnd() * 0.2);
      for (let i = 0; i < 15; i++) { const x = 40 + i * 110; const bar = g.createLinearGradient(x, 0, x + 26, 0); bar.addColorStop(0, '#1C1816'); bar.addColorStop(0.5, '#5E5650'); bar.addColorStop(1, '#141110'); g.fillStyle = bar; g.fillRect(x, 0, 26, 2000); }
      const leek = (x, y, a, l) => { g.save(); g.translate(x, y); g.rotate(a); shadow(10, 30, l * 0.55, 70, 0.7);
        const b = g.createLinearGradient(0, -55, 0, 55); b.addColorStop(0, '#D9D2A8'); b.addColorStop(0.5, '#B9B27E'); b.addColorStop(1, '#6E6A3A'); g.fillStyle = b; rr(-l / 2, -55, l, 110, 55); g.fill();
        g.fillStyle = '#4E6A2A'; rr(l / 2 - l * 0.28, -58, l * 0.28, 116, 50); g.fill();
        for (let k = 0; k < l / 110; k++) { g.fillStyle = 'rgba(20,10,5,0.85)'; rr(-l / 2 + 40 + k * 110, -56, 26, 112, 10); g.fill(); } g.restore(); };
      const pepper = (x, y, a) => { g.save(); g.translate(x, y); g.rotate(a); shadow(10, 30, 240, 120, 0.7);
        const p = g.createRadialGradient(-60, -40, 10, 0, 0, 240); p.addColorStop(0, '#F06A3A'); p.addColorStop(0.7, '#C8341C'); p.addColorStop(1, '#6A160C'); g.fillStyle = p; g.beginPath(); g.ellipse(0, 0, 230, 120, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3E5A22'; rr(210, -18, 90, 36, 14); g.fill();
        for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(25,10,5,0.75)'; rr(-180 + k * 110, -118, 34, 236, 14); g.fill(); } g.restore(); };
      leek(760, 360, -0.12, 1100); leek(840, 640, -0.08, 1150); pepper(520, 1020, 0.2); pepper(1100, 1180, -0.35); leek(800, 1560, -0.15, 1080); pepper(430, 1800, -0.1);
      salt(80, 200, 200, 1200, 1700);
      vignette(0.6); grain(0.05);`));

    // A plated fillet with its sauce on a pale plate, on a dark table.
    fs.writeFileSync(out('brands/saltandember/pictures/plate.jpg'), await draw(page, 1600, 1600, 'image/jpeg', `
      g.fillStyle = '#17110E'; g.fillRect(0, 0, 1600, 1600);
      for (let i = 0; i < 50; i++) { g.strokeStyle = 'rgba(255,240,220,' + (0.015 + rnd() * 0.03) + ')'; g.lineWidth = 2 + rnd() * 8; const y = rnd() * 1600; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(500, y + rnd() * 40 - 20, 1100, y + rnd() * 40 - 20, 1600, y); g.stroke(); }
      shadow(830, 850, 700, 700, 0.75);
      const pl = g.createRadialGradient(700, 700, 50, 800, 800, 660); pl.addColorStop(0, '#F3EDE2'); pl.addColorStop(1, '#C9C0B2'); g.fillStyle = pl; g.beginPath(); g.arc(800, 800, 620, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(120,100,80,0.25)'; g.lineWidth = 5; g.beginPath(); g.arc(800, 800, 480, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = '#5A1E16'; g.lineCap = 'round'; g.lineWidth = 70; g.beginPath(); g.arc(800, 800, 300, Math.PI * 0.6, Math.PI * 1.35); g.stroke();
      g.strokeStyle = '#7A2A1E'; g.lineWidth = 36; g.beginPath(); g.arc(800, 800, 300, Math.PI * 0.65, Math.PI * 1.3); g.stroke();
      shadow(830, 830, 300, 200, 0.5);
      g.save(); g.translate(820, 790); g.rotate(-0.3);
      g.fillStyle = '#2A140C'; rr(-260, -150, 520, 300, 120); g.fill();
      const cr = g.createLinearGradient(0, -150, 0, 150); cr.addColorStop(0, '#6A3418'); cr.addColorStop(1, '#3A1A0C'); g.fillStyle = cr; rr(-245, -138, 490, 276, 112); g.fill();
      for (let k = 0; k < 5; k++) { g.strokeStyle = 'rgba(15,6,3,0.8)'; g.lineWidth = 16; g.beginPath(); g.moveTo(-200 + k * 95, -130); g.lineTo(-150 + k * 95, 130); g.stroke(); }
      g.restore();
      sprig(560, 1060, -0.6, 260); sprig(1000, 560, 2.6, 220);
      for (let i = 0; i < 9; i++) { g.fillStyle = ['#D8C05A', '#E07B3C', '#C8341C'][i % 3]; g.beginPath(); g.arc(1040 + rnd() * 160, 900 + rnd() * 200, 16 + rnd() * 12, 0, Math.PI * 2); g.fill(); }
      salt(60, 600, 580, 460, 420);
      vignette(0.55); grain(0.05);`));
    console.log('saltandember assets written');
  } finally {
    browser.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
