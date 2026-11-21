// node --test   (does a photo have a plain top and side edge, so the page can take its colour and the photo run into it with no
// fade; or is it a scene, to be placed as a band. The decision is a pure function; the real-photo checks need Chrome.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { EDGE_LIMITS, classifyEdge } from './lib/design/edge.mjs';
import { RUNTIME } from './lib/design/runtime.mjs';
import { brandFile, repoPath } from './lib/core.mjs';

// A strip of w x h pixels, each colour from fn(x, y), as RGBA bytes.
const strip = (w, h, fn) => { const d = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.push(...fn(x, y), 255); return d; };
// Pseudo-random grain, the same every run.
const grain = (x, y, amp) => (((x * 7919 + y * 104729) % 97) / 97 - 0.5) * 2 * amp;
const regions = (top, side, w = 240) => ({ top: strip(w, 4, top), topWidth: w, left: strip(6, 30, side), right: strip(6, 30, side) });

test('a plain background is uniform: flat, or with photo grain, and the page takes its colour', () => {
  const flat = classifyEdge(regions(() => [200, 228, 210], () => [200, 228, 210]));
  assert.equal(flat.uniform, true);
  assert.deepEqual(flat.rgb, [200, 228, 210]);
  assert.ok(flat.grain < 0.01 && flat.drift < 0.01 && flat.shift < 0.01);
  const noisy = classifyEdge(regions((x, y) => [226 + grain(x, y, 2), 225 + grain(y, x, 2), 223 + grain(x, x, 2)], () => [226, 225, 223]));
  assert.equal(noisy.uniform, true);
  assert.ok(noisy.grain < EDGE_LIMITS.grain, `grain ${noisy.grain}`);
});

test('studio light that drifts slowly along the edge is still plain, and the page follows it column by column', () => {
  const lit = (x) => [150 + (x / 240) * 14, 190 - (x / 240) * 6, 120]; // a green backdrop a little lighter to the right
  const c = classifyEdge(regions((x) => lit(x), () => lit(120)));
  assert.equal(c.uniform, true);
  assert.equal(c.columns.length, 12);
  assert.ok(c.drift > 1, `drift ${c.drift}: more than a flat colour, so the page must follow the columns`);
  assert.ok(c.columns[0][0] < c.columns[11][0], 'the columns carry the gradient of the edge');
});

test('a scene is not uniform: a busy top edge, a split edge, or scenery down the sides', () => {
  assert.equal(classifyEdge(regions((x, y) => [(x * 37 + y * 11) % 256, (x * 91) % 256, (y * 53 + x) % 256], () => [128, 128, 128])).uniform, false, 'busy: grain');
  assert.equal(classifyEdge(regions((x) => (x < 120 ? [250, 250, 250] : [90, 110, 100]), () => [250, 250, 250])).uniform, false, 'a hard split along the edge: drift');
  const sky = classifyEdge(regions(() => [200, 215, 230], () => [60, 90, 50]));
  assert.equal(sky.uniform, false, 'a plain top edge with scenery down the sides: shift');
  assert.ok(sky.grain < EDGE_LIMITS.grain && sky.shift > EDGE_LIMITS.shift);
});

test('an empty strip is never uniform', () => {
  assert.equal(classifyEdge({ top: [], topWidth: 0, left: [], right: [] }).uniform, false);
});

test('the page script carries the same decision as this module (one source)', () => {
  assert.ok(RUNTIME.includes(classifyEdge.toString()));
  assert.ok(RUNTIME.includes(JSON.stringify(EDGE_LIMITS)));
});

// ---- the real photos of the library, in Chrome, read the way the page reads them (full width, 750 px tall, focal centre) ----
const chrome = findChrome();
const SKIP = 'Google Chrome not found (set CHROME_PATH); skipping the real photos';
// The brand pack lists pictures whose edge is known (edge-photos.json: "uniform" and "scene", paths like design/assets/...).
// The demo pack's are committed; a private pack's photo library is git-ignored, so its check runs only where the photos are.
const listFile = brandFile('edge-photos.json');
const KNOWN = fs.existsSync(listFile) ? JSON.parse(fs.readFileSync(listFile, 'utf8')) : { uniform: [], scene: [] };
const all = [...KNOWN.uniform, ...KNOWN.scene];
const missing = all.filter((f) => !fs.existsSync(repoPath(f)));
const NO_PHOTOS = !all.length ? 'the brand pack lists no pictures in edge-photos.json' : `the brand's pictures are not on this machine (${missing.length} of ${all.length} missing); skipping the real photos`;

test('the brand\'s known pictures: studio shots are uniform, scenes become bands', { skip: !chrome ? SKIP : !all.length || missing.length ? NO_PHOTOS : false }, async () => {
  const browser = await Browser.launch({ chromePath: chrome });
  try {
    const page = await browser.page(1080, 1350);
    await page.setContent('<!doctype html><body></body>');
    const read = async (file) => {
      const src = `data:${file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg'};base64,${fs.readFileSync(repoPath(file)).toString('base64')}`;
      const r = await page.evaluate(`(async () => {
        const i = new Image(); i.src = ${JSON.stringify(src)}; await i.decode();
        const bw = 1080, bh = 750, nw = i.naturalWidth, nh = i.naturalHeight, s = Math.max(bw / nw, bh / nh), sw = bw / s, sh = bh / s, ox = (nw - sw) / 2, oy = (nh - sh) / 2;
        const grab = (x, y, w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, ox + x, oy + y, w, h, 0, 0, c.width, c.height); return Array.from(g.getImageData(0, 0, c.width, c.height).data); };
        return { topWidth: Math.round(sw), top: grab(0, 0, sw, sh * 0.03), left: grab(0, 0, sw * 0.03, sh * 0.3), right: grab(sw * 0.97, 0, sw * 0.03, sh * 0.3) };
      })()`);
      return classifyEdge(r);
    };
    for (const f of KNOWN.uniform) { const c = await read(f); assert.equal(c.uniform, true, `${f} should be uniform: ${JSON.stringify({ g: c.grain, d: c.drift, s: c.shift })}`); }
    for (const f of KNOWN.scene) { const c = await read(f); assert.equal(c.uniform, false, `${f} should be a band: ${JSON.stringify({ g: c.grain, d: c.drift, s: c.shift })}`); }
  } finally {
    await browser.close();
  }
});
