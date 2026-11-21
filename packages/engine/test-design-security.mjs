// node --test   (untrusted text: hostile values must be rejected or end up inert in the generated page; no Chrome needed)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ENGINE_DIR, ROOT, brandFile } from './lib/core.mjs';
import { loadBrand, normaliseBrand, validateBrand } from './lib/design/brand.mjs';
import { readBrandAsset, readImage } from './lib/design/assets.mjs';
import { cleanShape, linesToSvg, shapeProblems } from './lib/design/checks.mjs';
import { buildPage } from './lib/design/page.mjs';
import { SIZES } from './lib/design/sizes.mjs';
import { focalToCss, validateDesign } from './lib/design/spec.mjs';
import { TEMPLATE_FNS } from './design/templates/index.mjs';
import { esc, fmt, fmtE } from './design/templates/common.mjs';
import { pngBytes } from './testlib/png.mjs';

// The silk ribbon is the website's artwork (ignored by git); a stand-in keeps these tests independent of it.
const brand = { ...loadBrand(), silkSrc: 'data:image/png;base64,iVBORw0KGgo=' };
const PIXEL = 'data:image/png;base64,iVBORw0KGgo=';
const HOSTILE = [
  '"><script>window.__pwn=1</script>',
  '</style><script>window.__pwn=2</script>',
  '<img src=x onerror="window.__pwn=3">',
  "';alert(1);//",
  '</div><svg onload=window.__pwn=4>',
  'javascript:alert(5)',
  '`${window.__pwn=6}`',
  'url(http://evil.example/x.png)',
];

test('esc and fmt: markup is produced only after escaping, from a whitelist', () => {
  for (const h of HOSTILE) { const e = fmtE(h); assert.ok(!/<(script|img|svg|style|div)/i.test(e), e); }
  assert.equal(fmtE('a *b* **c**'), 'a <em data-role="accent">b</em> *<em data-role="accent">c</em>*');
  for (const h of HOSTILE) {
    const out = fmt(h);
    assert.ok(!/<(script|img|svg|style|div)/i.test(out), out);
    assert.ok(!out.includes('"><'), out);
  }
  assert.equal(fmt('a\\nb *gold*'), 'a<br>b <span class="gold">gold</span>');
  assert.equal(fmt('*<b>x</b>*'), '<span class="gold">&lt;b&gt;x&lt;/b&gt;</span>');
  assert.equal(esc(`"'\`<>&`), '&quot;&#39;&#96;&lt;&gt;&amp;');
});

test('shapes: every field must be a finite number in range; colours only gold or white', () => {
  const arc = { t: 'arc', x: 0.5, y: 0.5, r: 0.3, a0: 10, a1: 200 };
  assert.deepEqual(shapeProblems(arc), []);
  assert.deepEqual(shapeProblems({ t: 'br', x: 0.9, y: 0.1, l: 0.07, dx: -1, dy: 1, c: 'gold', o: 0.5, w: 2 }), []);
  const bad = [
    { ...arc, x: '"><script>alert(1)</script>' }, { ...arc, x: '0.5' }, { ...arc, y: NaN }, { ...arc, r: Infinity }, { ...arc, r: 50 },
    { ...arc, a0: null }, { ...arc, a1: 99999 }, { ...arc, c: 'red;}</style><script>' }, { ...arc, c: '#fff' }, { ...arc, o: 2 }, { ...arc, w: 500 },
    { t: 'br', x: 0.1, y: 0.1, l: 0.1, dx: 2 }, { t: 'br', x: 0.1, y: 0.1, l: -1 }, { t: 'path', x: 0, y: 0 }, null, 'arc', [],
  ];
  for (const b of bad) assert.ok(shapeProblems(b).length > 0, JSON.stringify(b));
  // at the spec boundary
  const errs = validateDesign({ template: 'photo', image: 'a.jpg', headline: 'x', lines: [{ ...arc, x: '"><script>' }, { ...arc, c: 'url(x)' }] }, 'p');
  assert.ok(errs.some((e) => e.includes('lines[0] x must be a number')) && errs.some((e) => e.includes('lines[1] c must be')), errs.join('|'));
  assert.ok(validateDesign({ template: 'photo', image: 'a.jpg', headline: 'x', lines: { feed: [{ ...arc, r: 'big' }] } }, 'p').some((e) => e.includes('lines.feed[0] r must be')));
  assert.ok(validateDesign({ template: 'photo', image: 'a.jpg', headline: 'x', lines: Array(13).fill(arc) }, 'p').some((e) => e.includes('up to 12')));
  assert.deepEqual(validateDesign({ template: 'photo', image: 'a.jpg', headline: 'x', lines: [arc] }, 'p'), []);
});

test('drawing: a shape that slips past validation is coerced or dropped, and the markup is numbers and fixed colours only', () => {
  const svg = linesToSvg([
    { t: 'arc', x: 0.5, y: 0.5, r: 0.3, a0: 0, a1: 90, c: 'gold' },
    { t: 'arc', x: '"><script>alert(1)</script>', y: 1, r: 1, a0: 0, a1: 1 },
    { t: 'arc', x: 0.5, y: 0.5, r: 0.3, a0: 0, a1: 90, c: '"/><script>alert(2)</script>' },
    { t: 'br', x: 0.9, y: 0.1, l: 0.07, dx: '1" onload="alert(3)' },
    { t: 'arc', x: NaN, y: 0, r: 1, a0: 0, a1: 1 },
    { t: 'br', x: 0.9, y: 0.1, l: 0.07, dx: -1 },
  ], 1080, 1350, '"/><script>alert(4)</script>');
  assert.ok(!/script|alert|onload|"><|\bNaN\b|undefined/.test(svg), svg);
  const paths = svg.match(/<path [^>]*\/>/g);
  assert.equal(paths.length, 4); // the two with strings/NaN in a number field are dropped; the odd colour and odd dx are coerced
  for (const p of paths) assert.match(p, /^<path d="M [-\d. ALMlargev]+" stroke="#[0-9a-f]{3,6}" stroke-width="[\d.]+" opacity="[\d.]+"( stroke-linejoin="round")?\/>$/);
  assert.ok(svg.includes('#ecb12a')); // a hostile brand colour falls back to the brand gold
  assert.equal(cleanShape({ t: 'arc', x: 1, y: 1, r: 1, a0: 0, a1: 'x' }), null);
  assert.equal(linesToSvg('not a list', 10, 10, '#000'), '');
});

test('other spec fields: focal, textAt, scrim, sizes, device, kind, name and images are strict', () => {
  const p = (o) => validateDesign({ template: 'photo', image: 'a.jpg', headline: 'x', ...o }, 'p');
  for (const focal of ['50% 50%;background:url(http://evil/x)', 'center</style>', '50% 50% 50%', 'url(x)', { x: '1);', y: 0 }, { x: 5, y: 0 }, [101, 0], 'calc(1px) 2px']) {
    assert.ok(p({ focal }).some((e) => e.includes('focal must look like')), JSON.stringify(focal));
  }
  assert.equal(focalToCss('50% 50%;color:red'), null);
  assert.ok(p({ textAt: 'top;x' }).length && p({ scrim: 'black;x' }).length && p({ scrimPeak: '0.5' }).length && p({ scrimPeak: NaN }).length);
  assert.ok(p({ sizes: ['feed"><script>'] }).length && p({ sizes: 'feed,<x>' }).length);
  assert.ok(p({ name: '../../etc/passwd' }).length && p({ name: 'a"b' }).length);
  assert.ok(p({ image: 'javascript:alert(1)' }).length && p({ image: 'x.svg' }).length && p({ image: '/etc/passwd' }).length && p({ image: 5 }).length);
  assert.ok(validateDesign({ template: 'screen', image: 'a.png', headline: 'x', statusFill: 'red;background:url(x)' }, 's').length);
  const sc = (o) => validateDesign({ template: 'screen', image: 'a.png', headline: 'x', device: 'desktop', ...o }, 's');
  assert.ok(sc({ device: 'desktop"><script>' }).length && sc({ region: '0.5;background:url(x)' }).length && sc({ region: NaN }).length && sc({ tilt: 'rotate(90deg)' }).length && sc({ framed: 'no' }).length && sc({ title: 'a\nb' }).length);
  assert.ok(validateDesign({ template: 'pagecover', kind: 'x"><script>' }, 'c').length);
  assert.ok(validateDesign({ template: 'text', headline: ['x'] }, 'c').length);
  assert.ok(validateDesign({ template: 'stats', big: '1', stats: [['a', { b: 1 }]] }, 's').length);
});

test('pictures: only existing, allowed, genuine images are read, and they become data: URIs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-sec-'));
  try {
    const png = path.join(tmp, 'ok.png'); fs.writeFileSync(png, pngBytes(4, 4, () => [1, 2, 3]));
    assert.match(readImage(png, { root: ROOT }), /^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    fs.writeFileSync(path.join(tmp, 'liar.png'), '<script>alert(1)</script>');
    fs.writeFileSync(path.join(tmp, 'page.html'), '<html>');
    fs.mkdirSync(path.join(tmp, 'dir.png'));
    fs.symlinkSync('/etc/hosts', path.join(tmp, 'link.png'));
    fs.writeFileSync(path.join(tmp, 'wrong.jpg'), pngBytes(2, 2, () => [0, 0, 0])); // a PNG named .jpg
    const cases = [
      [path.join(tmp, 'liar.png'), /does not contain PNG data/], [path.join(tmp, 'page.html'), /not an allowed image type/], [path.join(tmp, 'dir.png'), /not a file/],
      [path.join(tmp, 'link.png'), /does not contain PNG data/], [path.join(tmp, 'wrong.jpg'), /does not contain JPEG data/], [path.join(tmp, 'missing.png'), /not found/],
      ['/etc/passwd', /not an allowed image type/], ['../../../etc/passwd', /not an allowed image type/], ['javascript:alert(1)', /not an allowed image type/],
      ['javascript:alert(1)//x.png', /not found/], ['http://evil.example/x.png', /not found/], ['file:///etc/hosts', /not an allowed image type/], ['x.svg', /not an allowed image type/],
      ['a\0.png', /empty or not text/], ['', /empty or not text/], [{ toString: () => 'x.png' }, /empty or not text/],
    ];
    for (const [file, re] of cases) assert.throws(() => readImage(file, { root: ROOT }), re, String(file));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('brand file: font family, weight and asset paths are checked', () => {
  const good = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
  assert.deepEqual(validateBrand(good), []);
  const mod = (f) => { const b = structuredClone(good); f(b); return validateBrand(b); };
  assert.ok(mod((b) => { b.font.family = 'x";}</style><script>'; }).some((e) => e.includes('font.family')));
  assert.ok(mod((b) => { b.font.headlineWeight = '600;x'; }).some((e) => e.includes('headlineWeight')));
  assert.ok(mod((b) => { b.accents.gold = 'red;background:url(x)'; }).some((e) => e.includes('accents.gold')));
  assert.ok(mod((b) => { b.name = 5; }).some((e) => e.includes('name')));
  assert.throws(() => readBrandAsset('../../../etc/hosts', { root: ROOT, type: 'font/woff2' }), /stay inside the repository/);
  assert.throws(() => readBrandAsset('design/brand.css', { root: ROOT, type: 'image/png' }), /not a image\/png file/);
});

// Attribute names of every real tag, read with a quote-aware pattern (a quoted value cannot hide or fake one).
const SAFE_ATTRS = new Set(['lang', 'style', 'data-family', 'charset', 'http-equiv', 'content', 'nonce', 'class', 'src', 'alt', 'viewBox', 'aria-hidden', 'data-user', 'data-name', 'data-fit', 'data-avoid', 'data-role', 'data-textat', 'data-mono', 'data-editorial', 'data-flex', 'data-min', 'data-onpanel', 'data-phone', 'data-obj', 'data-bleed', 'data-sampled', 'data-sample', 'data-fx', 'data-fy', 'aria-label', 'role', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'text-anchor', 'id', 'width', 'height', 'viewbox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'opacity']);
function attributeNames(html) {
  const names = [];
  const body = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '<script>').replace(/<style>[\s\S]*?<\/style>/g, '<style>');
  for (const m of body.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g)) {
    for (const a of m[2].matchAll(/\s+([^\s"'>\/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/g)) names.push(a[1]);
  }
  return names;
}

assert.deepEqual(attributeNames('<p class="a b" onerror=x><img src="y" onload=\'z\'>'), ['class', 'onerror', 'src', 'onload']); // the helper itself sees real attributes

const LEDGER = (h) => ({ type: 'ledger', columns: [{ label: h.slice(0, 16), align: 'end' }, { label: 'b' }], rows: [[h.slice(0, 16), h.slice(0, 16)]], mark: [{ row: 0, col: 0 }], notes: [h.slice(0, 60)] });
const hostileSpecs = (h) => ({
  cover: { template: 'cover', image: h, headline: h, sub: h, series: 'explainers', label: h, headRight: h },
  object: { template: 'object', image: h, headline: h, sub: h, ground: 'photo', focalCss: `50% 50%;background:url(${h})` },
  objectToned: { template: 'object', image: h, headline: h, sub: h, ground: 'mint', align: 'center' },
  number: { template: 'number', big: h, line: h, stats: [[h, h], [h, h]], image: h },
  product: { template: 'product', image: h, headline: h, sub: h },
  productSide: { template: 'product', layout: 'side', image: h, headline: h, sub: h, ground: 'gold-pale' },
  closingMap: { template: 'closing', headline: h, line: h, map: true },
  textPassbook: { template: 'text', headline: h, sub: h, headRight: h, artefact: { type: 'passbook', days: 31, ticked: 3 } },
  textPlain: { template: 'text', headline: h, sub: h, label: h },
  textLedger: { template: 'text', headline: h, sub: h, artefact: LEDGER(h) },
  textRegister: { template: 'text', headline: h, artefact: { type: 'register', title: h.slice(0, 26), rows: [[h.slice(0, 17), h.slice(0, 8)]] } },
  ledger: { template: 'ledger', headline: h, sub: h, ...LEDGER(h) },
  passbook: { template: 'passbook', headline: h, sub: h, days: 31, ticked: 3, today: 4, tick: 'gold', register: { title: h.slice(0, 26), rows: [[h.slice(0, 17), h.slice(0, 8)]], mark: 0 } },
  mythFact: { template: 'myth-fact', myth: h, factLead: h, fact: h, label: h },
  stats: { template: 'stats', big: h, line: h, stats: [[h, h], [h, h]] },
  statsPhoto: { template: 'stats', big: h, line: h, stats: [[h, h]], image: h },
  screen: { template: 'screen', image: h, headline: h, sub: h, pills: [h, h], checks: [h] },
  screenFade: { template: 'screen', image: h, headline: h, sub: h, fade: true, glow: true, pills: [h], checks: [h, h] },
  screenDesktop: { template: 'screen', device: 'desktop', image: h, headline: h, sub: h, title: h, tilt: true, region: 0.75 },
  screenFramedDesktop: { template: 'screen', device: 'desktop', framed: true, image: h, headline: h, region: h },
  screenBeside: { template: 'screen', image: h, headline: h, sub: h, beside: { days: 30, ticked: 5 } },
  panel: { template: 'photo-story', image: h, headline: h, sub: h, label: h },
  print: { template: 'photo-story', layout: 'print', image: h, headline: h, sub: h },
  closing: { template: 'closing', headline: h, line: h },
  photo: { template: 'photo', image: h, headline: h, sub: h, eyebrow: h, focalCss: `50% 50%;background:url(${h})`, textAtResolved: h },
});

// The same brand with every style choice that changes the markup: outlined surfaces, artwork, a photo treatment, the logo bar at
// the bottom right in a pill, capitals and no accent device.
const raw = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
const styled = {
  ...brand,
  ...normaliseBrand({ ...raw, style: { type: { display: { case: 'upper', weight: 700 }, label: { case: 'as-typed' }, accent: 'none' }, surface: 'outline', decoration: { kind: 'artwork', artwork: 'x.png', on: 'all', fit: 'corner' }, photo: { treatment: 'duotone' }, logo: 'bottom-right', footer: 'pill' } }),
  artworkSrc: PIXEL,
};

for (const [which, b] of [['the demo brand', brand], ['a fully styled brand', styled]]) test(`generated pages: hostile text in every field of every template stays inert (${which})`, () => {
  for (const [name, spec] of Object.entries(hostileSpecs('X'))) {
    const S = SIZES.feed;
    const run = (s) => { const t = TEMPLATE_FNS[s.template](s, { size: S, brand: b, counter: { n: 2, total: 5 }, image: () => PIXEL, imageSize: () => ({ w: 1640, h: 1025 }) }); return buildPage({ brand: b, size: S, ...t }); };
    const base = run(spec);
    for (const h of HOSTILE) {
      const html = run(hostileSpecs(h)[name]);
      assert.equal((html.match(/<script/gi) ?? []).length, 1, `${name}: ${h}`); // only the runtime script
      assert.equal((html.match(/<\/style>/g) ?? []).length, (base.match(/<\/style>/g) ?? []).length, `${name}: ${h}`);
      assert.equal((html.match(/<img/g) ?? []).length, (base.match(/<img/g) ?? []).length, `${name}: ${h}`);
      assert.equal((html.match(/<svg/g) ?? []).length, (base.match(/<svg/g) ?? []).length, `${name}: ${h}`);
      assert.equal((html.match(/<text/g) ?? []).length, (base.match(/<text/g) ?? []).length, `${name}: ${h}`);
      assert.deepEqual(attributeNames(html).filter((a) => /^on/i.test(a)), [], `${name}: ${h}`); // no event-handler attribute on any tag
      assert.deepEqual([...new Set(attributeNames(html))].filter((a) => !SAFE_ATTRS.has(a)), [], `${name}: ${h}`); // and no attribute the templates do not write themselves
      for (const st of html.match(/ style="[^"]*"/g) ?? []) assert.ok(!/url\(|http|expression|;\s*background/.test(st), `${name}: ${h}: ${st}`); // spec values never reach a style
      assert.ok(!html.includes('object-position:50% 50%;background'), `${name}: ${h}`); // the bad focal value was refused
    }
  }
});

test('generated pages: strict Content-Security-Policy first in the head, no remote or file sources anywhere', () => {
  const S = SIZES.feed;
  const t = TEMPLATE_FNS.text({ template: 'text', headline: 'Hello' }, { size: S, brand, image: () => PIXEL });
  const html = buildPage({ brand, size: S, ...t });
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<style'));
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /img-src data:;/);
  assert.match(csp, /font-src data:;/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'nonce-[A-Za-z0-9+/=]+'/);
  assert.ok(!/script-src[^;]*unsafe/.test(csp) && !/(https?|file|ftp):/.test(csp));
  assert.ok(!/(https?|file):\/\//.test(html.replace(/<script[\s\S]*<\/script>/, '')), 'no remote or file URL in the markup'); // (the runtime script names the SVG namespace, which is not a request)
  assert.ok(!/<(link|iframe|object|embed|base|form)\b/i.test(html));
  const nonce = csp.match(/nonce-([^']+)/)[1];
  assert.ok(html.includes(`<script nonce="${nonce}">`));
  assert.notEqual(buildPage({ brand, size: S, ...t }).match(/nonce-([^']+)/)[1], nonce); // a fresh nonce per page
});
