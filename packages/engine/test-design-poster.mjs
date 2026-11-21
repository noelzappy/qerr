// node --test   (the poster pages of 2026-11-20: object, number, product, myth-fact, closing; one real image per post, large
// two-tone headlines, a small logo and the website only, no captions)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBrand, loadSeries } from './lib/design/brand.mjs';
import { findChrome } from './lib/design/chrome.mjs';
import { imageSize } from './lib/design/checks.mjs';
import { buildPage } from './lib/design/page.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { forSize, validateDesign } from './lib/design/spec.mjs';
import { TEMPLATE_FNS } from './design/templates/index.mjs';
import { pngBytes } from './testlib/png.mjs';
import { renderSpec } from './testlib/render.mjs';

const SERIES = loadSeries();
const v = (d) => validateDesign(d, 'p', { series: SERIES });
const has = (errs, frag) => errs.some((e) => e.includes(frag));
const brand = loadBrand();
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const html = (spec, extra = {}) => {
  const t = TEMPLATE_FNS[spec.template](forSize(spec, 'feed'), { size: SIZES.feed, brand, image: () => PIXEL, imageSize: () => ({ w: 660, h: 1354 }), ...extra });
  return buildPage({ brand, size: SIZES.feed, ...t });
};
const HOSTILE = '"><script>window.__pwn=1</script><img src=x onerror=alert(1)>';

test('poster specs: good ones pass, and each field names its problem', () => {
  const good = [
    { template: 'object', headline: 'Every euro, *on record.*', sub: 's', image: 'a.jpg', ground: 'gold-pale', align: 'center', size: 120, photoTop: 600, focal: '50% 60%', zoom: 1.2 },
    { template: 'object', headline: 'h', image: 'a.jpg', ground: 'photo' },
    { template: 'number', big: '*€* 14.8M+', line: 'processed', stats: ['3,900+|members'], image: 'a.jpg', ground: 'photo' },
    { template: 'number', big: '14.8M+' },
    { template: 'product', headline: 'h', image: 'p.webp', layout: 'side', ground: 'mint', glow: false, phoneTop: 400, size: 76 },
    { template: 'myth-fact', series: 'myth-vs-fact', myth: 'm', factLead: 'f', fact: 'x', ground: 'deep' },
    { template: 'closing', map: true, ground: 'ink' },
  ];
  for (const d of good) assert.deepEqual(v(d), [], d.template);
  const bad = [
    [{ template: 'object', headline: 'h' }, 'image is required'], [{ template: 'object', image: 'a.jpg' }, 'headline is required'],
    [{ template: 'object', headline: 'h', image: 'a.jpg', ground: 'peach' }, 'ground must be one of'],
    [{ template: 'product', headline: 'h', image: 'p.webp', ground: 'photo' }, 'ground must be one of'],
    [{ template: 'object', headline: 'h', image: 'a.jpg', align: 'right' }, 'align must be one of'],
    [{ template: 'object', headline: 'h', image: 'a.jpg', size: 112 }, 'size must be one of 76, 88, 104, 120'],
    [{ template: 'object', headline: 'h', image: 'a.jpg', photoTop: 100 }, 'photoTop must be a whole number'],
    [{ template: 'object', headline: 'h', image: 'a.jpg', phoneTop: 400 }, 'phoneTop is not used by object'],
    [{ template: 'product', headline: 'h', image: 'p.webp', layout: 'left' }, 'layout must be one of center, side'],
    [{ template: 'product', headline: 'h', image: 'p.webp', glow: 'yes' }, 'glow must be true or false'],
    [{ template: 'number', line: 'x' }, 'big is required'], [{ template: 'myth-fact', myth: 'm', factLead: 'f', align: 'center' }, 'align is not used'],
  ];
  for (const [d, frag] of bad) assert.ok(has(v(d), frag), `${frag}: ${v(d).join(' | ')}`);
});

test('poster pages: only a small logo and the website, the two-tone headline, the ground from the brand file', () => {
  const page = html({ template: 'object', headline: 'Every euro, *on record.*', image: 'a.jpg', ground: 'mint' });
  // "mint" is the older name of the cool ground
  assert.match(page, /<div class="cv poster" style="--bg:var\(--g-cool\)">/);
  assert.match(page, /<div class="pbar"[^>]*><span class="logo-inv logo-ink" style="height:34px"><img src="data:image\/png;base64,[^"]+" alt="" style="height:34px"><i role="img" aria-label="Acme Savings"[^>]*><\/i><\/span><span class="purl" data-role="foot">acmesavings\.example<\/span><\/div>/);
  assert.match(page, /<div class="ps-h" data-role="headline" style="font-size:calc\(104px\*var\(--hs,1\)\*var\(--h-scale,1\)\)">Every euro, <em data-role="accent">on record\.<\/em><\/div>/);
  assert.ok(!/class="(rh|rh-rule|ft footer|silk|panel)"/.test(page), 'no running head, rule, footer row, silk or panel');
  // page 1 of a carousel says Swipe instead of the website
  assert.match(html({ template: 'object', headline: 'h', image: 'a.jpg' }, { counter: { n: 1, total: 6 } }), /data-role="foot">Swipe →</);
  // the poster type and slab tokens reach the page as variables
  assert.ok(/--pw:600;--p-track:-0\.035em;--p-lead:1\.06;--slab-myth:#23365E;--slab-fact:#E8EEF9;--r-slab:28px/.test(page));
  assert.ok(/--g-cool:#E8EEF9;--g-warm:#FCEBE4;--g-dark:#14213D;--g-deep:#1C2D52/.test(page));
});

test('poster headlines follow the series accent style: grey, the colour or a lighter weight', () => {
  const body = (spec) => /<body class="([^"]*)"/.exec(html(spec))?.[1];
  // explainers is a "muted" series in the demo pack, myth-vs-fact a "colour" one
  assert.equal(body({ template: 'object', headline: 'a *b*', image: 'a.jpg', ground: 'mint', series: 'explainers' }), 'acc-muted');
  assert.equal(body({ template: 'number', big: '12', line: 'x', ground: 'ink', series: 'myth-vs-fact' }), 'acc-colour dark');
  assert.equal(body({ template: 'object', headline: 'a *b*', image: 'a.jpg', ground: 'mint' }), 'acc-colour');
});

test('object photos: one wrapper for both layouts, sampled in the page, with no gradient, blend or tone in the markup or the styles', () => {
  const named = html({ template: 'object', headline: 'h', image: 'a.jpg', ground: 'gold-pale', focal: '50% 60%' });
  assert.match(named, /<div class="ph pobj" data-avoid style="--pt:600px;--ph:750px;--pm:80px"><img data-user data-name="a\.jpg" data-fit="cover" data-sample data-fx="0\.5" data-fy="0\.6" src="data:[^"]+" alt="" style="object-position:50% 60%"><\/div>/);
  // a named ground is the band's ground and the fallback; the page only takes the photo's colour later, in the browser
  assert.match(named, /<div class="cv poster" style="--bg:var\(--g-warm\)">/);
  assert.ok(!named.includes('class="blend"') && !/<div class="blend/.test(named) && !named.includes('pobj tone') && !/<div class="cv[^>]*data-sampled/.test(named), 'the page is only marked as taking the photo colour in the browser');
  // ground "photo" has no ground of its own: the band ground is the cool ground, or the series' ground
  const photo = html({ template: 'object', headline: 'h', image: 'a.jpg', ground: 'photo', focal: '70% 100%' });
  assert.match(photo, /<div class="cv poster" style="--bg:var\(--g-cool\)">/);
  assert.match(photo, /data-sample data-fx="0\.7" data-fy="1" src=/);
  const series = Object.entries(brand.series).find(([, v]) => v.ground && v.ground !== 'cool');
  if (series) assert.match(html({ template: 'object', headline: 'h', image: 'a.jpg', ground: 'photo', series: series[0] }), new RegExp(`--bg:var\\(--g-${series[1].ground}\\)`));
  // the wrapper is the avoid zone for text, in both layouts
  assert.equal((photo.match(/<div class="ph pobj" data-avoid/g) ?? []).length, 1);
  // the styles: flush (the default) and band (full bleed, no radius, no shadow, no side margin); nothing blends, tones or fades
  assert.match(brand.css, /\.pobj\{z-index:1;left:0;top:var\(--pt\);width:100%;height:var\(--ph\)\}/);
  assert.match(brand.css, /\.pobj\.band\{left:0;width:100%;height:var\(--ph\);border-radius:0;box-shadow:none\}/);
  // A brand may choose a photo treatment (tint, duotone, overlay); those rules exist only under its st-ph-* class, which a brand
  // without one (the demo) never gets, so its photos stay untouched.
  const pobj = brand.css.split('\n').filter((l) => /pobj|\.blend|mix-blend-mode/.test(l) && !/^\.st-ph-(tint|duotone|overlay) /.test(l)).join('\n');
  assert.ok(!/gradient|mix-blend-mode|\.blend/.test(pobj), pobj);
  for (const l of brand.css.split('\n').filter((x) => /mix-blend-mode|filter:grayscale/.test(x))) assert.match(l, /^(\.st-ph-(tint|duotone|overlay) [^,{]+,?)+\{/, l);
  assert.ok(!/<html[^>]*class="[^"]*st-ph/.test(named), 'the demo brand has no photo treatment');
  // a number page with a photo uses the same wrapper; without one it has none
  const n = html({ template: 'number', big: '5', image: 'a.jpg' });
  assert.match(n, /<div class="ph pobj" data-avoid style="--pt:616px;--ph:734px;--pm:80px">/);
  assert.ok(!html({ template: 'number', big: '5' }).includes('class="ph pobj"'));
  // a dark ground is a dark page (and gets the fine line texture) until the browser decides the photo's colour replaces it
  const dark = html({ template: 'object', headline: 'h', image: 'a.jpg', ground: 'deep' });
  assert.ok(dark.includes('class="cv poster tex"') && dark.includes('<body class="acc-colour dark"'));
});

test('product: a pre-framed phone, large, with the glow; myth-fact: colour-blocked slabs and the series mark', () => {
  const p = html({ template: 'product', headline: 'h', image: 'p.webp' });
  assert.match(p, /<div class="phone" data-obj data-avoid data-bleed style="left:240px;top:620px;width:600px;filter:drop-shadow/);
  assert.ok(p.includes('class="glow"') && !html({ template: 'product', headline: 'h', image: 'p.webp', glow: false }).includes('class="glow"'));
  assert.match(html({ template: 'product', headline: 'h', image: 'p.webp', layout: 'side' }), /<div class="phone" data-obj data-avoid data-bleed style="left:570px;top:300px;width:450px;/);
  const m = html({ template: 'myth-fact', series: 'myth-vs-fact', myth: 'A myth', factLead: 'The *fact.*', fact: 'More.' });
  assert.match(m, /<div class="slab myth"><span class="tag" data-role="label">Myth<\/span><div class="ps-h" data-role="headline"[^>]*>A myth<\/div><\/div>/);
  assert.match(m, /<div class="slab fact"><span class="tag" data-role="label">Fact<\/span><div class="ps-h" data-role="headline"[^>]*>The <em data-role="accent">fact\.<\/em><\/div><div class="sub" data-role="sub" data-min="30"[^>]*>More\.<\/div><\/div>/);
  assert.match(m, /<div class="pmark" style="right:80px;bottom:62px"><span data-role="foot">Myths vs facts<\/span><\/div>/);
  assert.ok(m.includes('class="cv poster tex" style="--bg:var(--g-dark)"'));
});

test('hostile text in every poster field stays text', () => {
  const specs = [
    { template: 'object', headline: HOSTILE, sub: HOSTILE, image: 'a.jpg', ground: 'photo' },
    { template: 'number', big: HOSTILE.slice(0, 40), line: HOSTILE, stats: [[HOSTILE, HOSTILE]], image: 'a.jpg' },
    { template: 'product', headline: HOSTILE, sub: HOSTILE, image: 'p.webp', layout: 'side' },
    { template: 'myth-fact', myth: HOSTILE, factLead: HOSTILE, fact: HOSTILE, label: HOSTILE.slice(0, 40) },
    { template: 'closing', headline: HOSTILE, line: HOSTILE.slice(0, 60) },
  ];
  for (const d of specs) {
    const page = html(d);
    assert.equal((page.match(/<script/gi) ?? []).length, 1, d.template); // the runtime only
    assert.ok(!/<img src=x|<script>window/.test(page), d.template); // the words are there, but only as escaped text
  }
});

const chrome = findChrome();
const SKIP = 'Google Chrome not found (set CHROME_PATH); skipping the real render';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-poster-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('end to end: each poster template renders at 1080x1350; a plain photo background becomes the page and a scene becomes a full-bleed band', { skip: chrome ? false : SKIP }, async () => {
  // a white studio shot (an object on white), a plain coloured ground (mint, with the object low down) and an uneven one
  const white = path.join(tmp, 'white.png'), mint = path.join(tmp, 'mint.png'), uneven = path.join(tmp, 'uneven.png');
  const blob = (x, y, cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 < 220 ** 2;
  fs.writeFileSync(white, pngBytes(1400, 1000, (x, y) => (blob(x, y, 700, 640) ? [190, 60, 70] : [252, 252, 252])));
  fs.writeFileSync(mint, pngBytes(1400, 1000, (x, y) => (blob(x, y, 900, 760) ? [200, 40, 90] : [200, 228, 210])));
  fs.writeFileSync(uneven, pngBytes(1400, 1000, (x) => (x < 700 ? [250, 250, 250] : [120, 140, 130])));
  const phone = path.join(tmp, 'phone.png');
  const inside = (x, y, w, h, m = 4, r = 80) => { if (x < m || y < m || x >= w - m || y >= h - m) return false; const cx = Math.min(Math.max(x, m + r), w - m - r), cy = Math.min(Math.max(y, m + r), h - m - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  fs.writeFileSync(phone, pngBytes(660, 1354, (x, y) => (!inside(x, y, 660, 1354) ? [0, 0, 0, 0] : inside(x, y, 660, 1354, 26, 60) ? [248, 250, 249, 255] : [24, 28, 27, 255]), { alpha: true }));
  const shot = path.join(tmp, 'shot.png');
  fs.writeFileSync(shot, pngBytes(430, 940, () => [245, 245, 240]));
  const run = async (spec) => {
    fs.rmSync(path.join(tmp, `${spec.template}-feed.jpg`), { force: true });
    return renderSpec(spec, path.join(tmp, `${spec.template}.jpg`));
  };
  const clean = [
    { template: 'object', headline: 'Every euro, *on record.*', sub: 'One place for savings.', image: white, ground: 'gold-pale', align: 'center' },
    { template: 'number', big: '*€* 14.8M+', line: 'processed', stats: ['3,900+|members saving daily', '400+|organisations registered'], image: white, ground: 'mint' },
    { template: 'product', headline: 'Members see their own savings. *On their phone.*', image: phone },
    { template: 'product', layout: 'side', headline: 'Record the deposit. *The balance updates.*', sub: 'Each deposit is posted as it is recorded.', image: phone, ground: 'gold-pale' },
    { template: 'myth-fact', series: 'myth-vs-fact', myth: 'Going digital means every member needs a smartphone.', factLead: 'Members keep saving *as they do today.*', fact: 'The collector records each deposit.' },
    { template: 'closing' },
  ];
  for (const spec of clean) {
    const r = await run(spec);
    assert.equal(r.code, 0, `${spec.template}: ${r.text}`);
    assert.deepEqual(imageSize(fs.readFileSync(r.out)), { w: 1080, h: 1350 });
    assert.ok(!/WARN/.test(r.text), `${spec.template}: ${r.text}`);
  }
  const sampled = await run({ template: 'object', headline: 'Watch the page fill.', image: mint, ground: 'photo' });
  assert.equal(sampled.code, 0, sampled.text);
  assert.match(sampled.text, /photo background is plain \(rgb\(200, 228, 210\), drift 0\.0\): the page takes its colour and the photo runs into it/);
  assert.ok(!/WARN/.test(sampled.text), sampled.text);
  // a named ground does not stop a plain photo background from becoming the page
  const named = await run({ template: 'object', headline: 'Watch the page fill.', image: mint, ground: 'gold-pale' });
  assert.match(named.text, /photo background is plain \(rgb\(200, 228, 210\)/);
  // a photo whose edge is split in two colours is a scene: a band, and no warning about a fade that is no longer there
  const rough = await run({ template: 'object', headline: 'Watch the page fill.', image: uneven, ground: 'photo' });
  assert.equal(rough.code, 0, rough.text);
  assert.match(rough.text, /photo background is not plain \(.*\): the photo is placed as a full-bleed band/);
  assert.ok(!/WARN/.test(rough.text), rough.text);
  // a dark ground with a plain light photo: the page takes the photo's colour and the type turns to ink, so the contrast holds
  const dark = await run({ template: 'object', headline: 'Watch the page fill.', sub: 'A sub line.', image: white, ground: 'deep' });
  assert.equal(dark.code, 0, dark.text);
  assert.ok(!/WARN/.test(dark.text), dark.text);
  // a product phone must be a pre-framed capture, as on screen
  const plain = await run({ template: 'product', headline: 'A phone', image: shot });
  assert.notEqual(plain.code, 0);
  assert.match(plain.text, /use a pre-framed phone capture/i);
  assert.ok(!fs.existsSync(plain.out));
});
