// node brands/demo/make-assets.mjs
// Draws the demo brand's logos and the demo pictures used by the example batches. Everything is synthetic: shapes and type
// drawn in Chrome from this file, no photograph, no real person, place, organisation or amount. Run it again after changing a
// drawing; the files it writes are committed so a fresh clone can render the examples.
//   brands/demo/logos/logo-mark.png, logo-full.png        transparent PNG (the full logo: the mark, then the wordmark)
//   packages/engine/design/assets/demo/object-jar.jpg      a studio-style object on a plain ground (runs into the page colour)
//   packages/engine/design/assets/demo/scene-market.jpg    a busy scene (placed as a full-bleed band)
//   packages/engine/design/assets/demo/screen-desk.png     a desktop app screen, window content only (the tool draws the chrome)
//   packages/engine/design/assets/demo/screen-phone.png    a pre-framed phone capture (transparent around a drawn phone and its
//                                                          app screen), for the layouts that show a phone (drawn without Chrome)
//   brands/demo/map.json                                   an invented island in three regions, for the dot map
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, ROOT } from '../../packages/engine/lib/core.mjs';
import { Browser, NO_CHROME, findChrome } from '../../packages/engine/lib/design/chrome.mjs';
import { pngBytes } from '../../packages/engine/testlib/png.mjs';

const NAVY = '#14213D', CORAL = '#E8603C', SKY = '#3D6FD1', PALE = '#F3EEE6';
const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(ENGINE_DIR, 'design', 'fonts', f)).toString('base64')}`;
const FONTS = `
  const inter = new FontFace('Inter', 'url(${font('inter-v20-latin.woff2')})', { weight: '100 900' });
  document.fonts.add(await inter.load());`;
const out = (rel) => { const abs = path.join(ROOT, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); return abs; };
const dataToBuf = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

// A canvas drawing in the page; returns the encoded file.
async function draw(page, w, h, type, body) {
  return dataToBuf(await page.evaluate(`(async () => {${FONTS}
    const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h};
    const g = c.getContext('2d');
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    ${body}
    return c.toDataURL('${type}', 0.92);
  })()`));
}

const MARK = `
  const mark = (x0, y0, s) => {
    g.fillStyle = '${NAVY}'; rr(x0, y0, s, s, s * 0.24); g.fill();
    const bw = s * 0.15, gap = s * 0.07, base = y0 + s * 0.76, left = x0 + (s - 3 * bw - 2 * gap) / 2;
    [[0.30, '#FFFFFF'], [0.44, '#FFFFFF'], [0.58, '${CORAL}']].forEach(([hh, col], i) => {
      g.fillStyle = col; rr(left + i * (bw + gap), base - s * hh, bw, s * hh, bw * 0.3); g.fill();
    });
  };`;

// An invented island: a wobbly ellipse on a 32 x 40 grid, cut into three bands from north to south.
function islandMap() {
  const cols = 32, rows = 40, names = ['North Reach', 'Midlands', 'South Cape'];
  const regions = names.map((name) => ({ name, cells: [], sum: [0, 0] }));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = Math.atan2(r - 20, c - 16), wobble = 1 + 0.12 * Math.sin(a * 3) + 0.07 * Math.cos(a * 5);
    if (((c - 16) / 13) ** 2 + ((r - 20) / 18) ** 2 > wobble ** 2) continue;
    const reg = regions[r < 14 ? 0 : r < 26 ? 1 : 2];
    reg.cells.push(c, r); reg.sum[0] += c; reg.sum[1] += r;
  }
  return {
    _source: 'Invented for the demo brand by brands/demo/make-assets.mjs; not a real place.',
    grid: { cols, rows }, lit: ['Midlands', 'South Cape'],
    regions: regions.map(({ name, cells, sum }) => ({ name, capital: sum.map((v) => Math.round((v / (cells.length / 2)) * 10) / 10), cells })),
  };
}

// A pre-framed phone capture, 660 x 1354 like the website's: transparent outside a rounded dark frame, and in it a pale app screen
// with a navy header, a balance card, a coral progress bar and a few list rows (no words, no real amount).
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function phoneCapture() {
  const W = 660, H = 1354;
  const inRound = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const box = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
  return pngBytes(W, H, (x, y) => {
    if (!inRound(x, y, 4, 4, W - 4, H - 4, 84)) return [0, 0, 0, 0];
    if (!inRound(x, y, 28, 28, W - 28, H - 28, 62)) return [...hex('#1B1F24'), 255];
    if (inRound(x, y, 250, 44, 410, 82, 19)) return [...hex('#1B1F24'), 255];
    if (inRound(x, y, 70, 200, W - 70, 420, 28)) return [...(box(x, y, 110, 250, 380, 290) ? hex(NAVY) : box(x, y, 110, 320, 300, 350) ? hex('#9AA3B5') : [255, 255, 255]), 255];
    if (box(x, y, 28, 28, W - 28, 300)) return [...hex(NAVY), 255];
    if (inRound(x, y, 70, 470, W - 70, 500, 15)) return [...hex(x < 70 + (W - 140) * 0.68 ? CORAL : '#E4DED4'), 255];
    for (let i = 0; i < 6; i++) {
      const top = 560 + i * 110;
      if (box(x, y, 70, top + 100, W - 70, top + 102)) return [...hex('#E4DED4'), 255];
      if (inRound(x, y, 70, top + 20, 130, top + 80, 30)) return [...hex(i % 2 ? SKY : CORAL), 255];
      if (box(x, y, 160, top + 30, 380, top + 50)) return [...hex(NAVY), 255];
      if (box(x, y, 160, top + 60, 300, top + 74)) return [...hex('#9AA3B5'), 255];
      if (box(x, y, 470, top + 36, W - 70, top + 58)) return [...hex(NAVY), 255];
    }
    return [...hex(PALE), 255];
  }, { alpha: true });
}

async function main() {
  fs.writeFileSync(out('packages/engine/design/assets/demo/screen-phone.png'), phoneCapture());
  const map = islandMap();
  fs.writeFileSync(out('brands/demo/map.json'), `{\n  "_source": ${JSON.stringify(map._source)},\n  "grid": ${JSON.stringify(map.grid)},\n  "lit": ${JSON.stringify(map.lit)},\n  "regions": [\n${map.regions.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`);
  const chromePath = findChrome();
  if (!chromePath) throw new Error(NO_CHROME);
  const browser = await Browser.launch({ chromePath });
  try {
    const page = await browser.page(800, 600);
    await page.setContent('<!doctype html><body></body>');

    fs.writeFileSync(out('brands/demo/logos/logo-mark.png'), await draw(page, 338, 338, 'image/png', `${MARK} mark(0, 0, 338);`));
    // The wordmark starts at x 377 (wordmarkFrom 360 in brand.json leaves a little air); the canvas is cut to the text.
    const full = await draw(page, 1700, 338, 'image/png', `
      g.font = '650 196px Inter'; c.width = 377 + Math.ceil(g.measureText('Acme Savings').width) + 6;
      ${MARK} mark(0, 0, 338);
      g.fillStyle = '${NAVY}'; g.font = '650 196px Inter'; g.textBaseline = 'alphabetic'; g.fillText('Acme Savings', 377, 246);`);
    fs.writeFileSync(out('brands/demo/logos/logo-full.png'), full);
    console.log(`logo-full.png is ${full.readUInt32BE(16)} x ${full.readUInt32BE(20)} (logos.fullSize in brand.json)`);

    // A jar of coins on a flat warm ground, lit from the top left: the edges are plain, so the page takes their colour.
    fs.writeFileSync(out('packages/engine/design/assets/demo/object-jar.jpg'), await draw(page, 1800, 1800, 'image/jpeg', `
      g.fillStyle = '${PALE}'; g.fillRect(0, 0, 1800, 1800);
      const sh = g.createRadialGradient(900, 1430, 40, 900, 1430, 520); sh.addColorStop(0, 'rgba(60,40,20,0.28)'); sh.addColorStop(1, 'rgba(60,40,20,0)');
      g.fillStyle = sh; g.beginPath(); g.ellipse(900, 1430, 520, 90, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 46; i++) {
        const x = 650 + ((i * 97) % 500), y = 1370 - Math.floor(i / 6) * 58 - ((i * 31) % 40);
        const coin = g.createLinearGradient(x - 60, y - 20, x + 60, y + 20); coin.addColorStop(0, '#F2C14E'); coin.addColorStop(1, '#B8860B');
        g.fillStyle = coin; g.beginPath(); g.ellipse(x, y, 62, 22, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(120,80,10,0.5)'; g.lineWidth = 4; g.stroke();
      }
      const glass = g.createLinearGradient(560, 0, 1240, 0); glass.addColorStop(0, 'rgba(255,255,255,0.55)'); glass.addColorStop(0.3, 'rgba(255,255,255,0.12)'); glass.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = glass; rr(560, 760, 680, 680, 90); g.fill(); g.strokeStyle = 'rgba(80,90,110,0.45)'; g.lineWidth = 10; g.stroke();
      g.fillStyle = '${NAVY}'; rr(600, 680, 600, 110, 30); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; rr(620, 820, 40, 520, 20); g.fill();`));

    // A street market of awnings and crates under a sky: busy edges, so it becomes a band.
    fs.writeFileSync(out('packages/engine/design/assets/demo/scene-market.jpg'), await draw(page, 2400, 1600, 'image/jpeg', `
      const sky = g.createLinearGradient(0, 0, 0, 700); sky.addColorStop(0, '#7FB2E5'); sky.addColorStop(1, '#D9ECF7'); g.fillStyle = sky; g.fillRect(0, 0, 2400, 1600);
      for (let i = 0; i < 9; i++) { g.fillStyle = ['#C8B89A', '#B7A58A', '#D4C7AE'][i % 3]; g.fillRect(i * 270 - 20, 300 + (i % 4) * 40, 290, 900); }
      const awn = ['${CORAL}', '${SKY}', '#2E9E6A', '#F2B134', '#8E5BC8'];
      for (let i = 0; i < 8; i++) {
        const x = i * 300 + 10, y = 560 + (i % 3) * 30;
        for (let s = 0; s < 6; s++) { g.fillStyle = s % 2 ? '#FFFFFF' : awn[i % 5]; g.beginPath(); g.moveTo(x + s * 48, y); g.lineTo(x + s * 48 + 48, y); g.lineTo(x + s * 48 + 58, y + 170); g.lineTo(x + s * 48 + 4, y + 170); g.fill(); }
        g.fillStyle = '#6B4A2B'; g.fillRect(x + 20, y + 170, 16, 560); g.fillRect(x + 250, y + 170, 16, 560);
        for (let k = 0; k < 14; k++) { g.fillStyle = ['#E4572E', '#F3A712', '#76B041', '#E9D985', '#C0392B'][(k + i) % 5]; g.beginPath(); g.arc(x + 50 + (k % 7) * 30, y + 640 + Math.floor(k / 7) * 34, 17, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#8B5E34'; g.fillRect(x + 30, y + 700, 230, 110);
      }
      g.fillStyle = '#9A8F84'; g.fillRect(0, 1380, 2400, 220);
      for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(40,30,20,' + (0.04 + (i % 5) * 0.02) + ')'; g.fillRect((i * 613) % 2400, 1390 + (i * 37) % 200, 6, 3); }`));

    // A desktop screen of the demo app: an invented savings group with invented members and amounts.
    const screen = await browser.page(1640, 1025);
    await screen.setContent(`<!doctype html><html><head><style>
      @font-face{font-family:Inter;src:url(${font('inter-v20-latin.woff2')});font-weight:100 900}
      *{box-sizing:border-box;margin:0}body{font:15px Inter;color:${NAVY};background:#F6F8FB;display:flex;height:1025px}
      nav{width:240px;background:${NAVY};color:#DCE3F0;padding:28px 20px}nav b{display:block;color:#fff;font-size:20px;margin-bottom:36px}
      nav div{padding:11px 12px;border-radius:8px;margin-bottom:4px}nav .on{background:rgba(255,255,255,.12);color:#fff}
      main{flex:1;padding:36px 44px}h1{font-size:28px;font-weight:650;margin-bottom:6px}p.s{color:#5B6880;margin-bottom:28px}
      .cards{display:flex;gap:20px;margin-bottom:28px}.card{flex:1;background:#fff;border-radius:12px;padding:22px;box-shadow:0 1px 3px rgba(20,33,61,.08)}
      .card small{color:#5B6880}.card div{font-size:30px;font-weight:650;margin-top:8px}.card .up{color:#2E9E6A;font-size:14px;font-weight:500}
      table{width:100%;background:#fff;border-radius:12px;border-collapse:collapse;box-shadow:0 1px 3px rgba(20,33,61,.08)}
      th,td{text-align:left;padding:15px 20px;border-bottom:1px solid #EEF1F6}th{color:#5B6880;font-weight:500;font-size:13px}
      td.n{text-align:right;font-variant-numeric:tabular-nums}.ok{color:#2E9E6A}.due{color:${CORAL}}
    </style></head><body>
      <nav><b>Acme Savings</b><div class="on">Groups</div><div>Members</div><div>Deposits</div><div>Goals</div><div>Reports</div></nav>
      <main><h1>Harbour Street Savers</h1><p class="s">Weekly group, 24 members, demo data</p>
        <div class="cards"><div class="card"><small>Saved this month</small><div>€ 4,820</div><span class="up">+12% on last month</span></div>
          <div class="card"><small>Deposits recorded</small><div>96</div><span class="up">all on time</span></div>
          <div class="card"><small>Group goal</small><div>68%</div><span class="up">€ 13,600 of € 20,000</span></div></div>
        <table><tr><th>Member</th><th>Last deposit</th><th class="n">Amount</th><th class="n">Total saved</th><th>Status</th></tr>
          ${[['Member 01', '18 Jan', '50.00', '850.00', 'ok'], ['Member 02', '18 Jan', '40.00', '720.00', 'ok'], ['Member 03', '17 Jan', '60.00', '1,140.00', 'ok'], ['Member 04', '11 Jan', '50.00', '600.00', 'due'], ['Member 05', '18 Jan', '25.00', '410.00', 'ok'], ['Member 06', '18 Jan', '45.00', '765.00', 'ok']]
            .map(([m, d, a, t, s]) => `<tr><td>${m}</td><td>${d}</td><td class="n">€ ${a}</td><td class="n">€ ${t}</td><td class="${s}">${s === 'ok' ? 'Up to date' : 'Due'}</td></tr>`).join('')}
        </table></main></body></html>`);
    await screen.evaluate('document.fonts.ready.then(() => true)');
    fs.writeFileSync(out('packages/engine/design/assets/demo/screen-desk.png'), await screen.screenshotPng());
    console.log('demo assets written');
  } finally {
    browser.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
