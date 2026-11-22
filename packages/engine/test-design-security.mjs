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
import { TEMPLATE_FNS } from './lib/design/builtin-layouts.mjs';
import { esc, fmt, fmtE } from './design/templates/common.mjs';
import { pngBytes } from './testlib/png.mjs';
import { renderPostWithLook } from './lib/design/directions/index.mjs';

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

test('looks: hostile text in every field and the brand name never puts a script, a handler or a javascript: URL into a tag of a post drawn by a look', () => {
  // (the interpreter's own tests, with the grammar of every tag, attribute, class and style, are in test-design-look-render.mjs)
  const look = (f) => JSON.parse(fs.readFileSync(path.join(ENGINE_DIR, 'testlib', 'looks', f), 'utf8'));
  const FIELDS = ['label', 'headline', 'sub', 'big', 'unit', 'quote', 'by', 'meta', 'tag'];
  let drawn = 0;
  for (const l of [look('retail.sample.json'), look('swiss.sample.json')]) {
    const per = {};
    for (const cp of l.compositions) {
      const variant = per[cp.kind] = (per[cp.kind] ?? -1) + 1;
      for (const h of HOSTILE) {
        const spec = { template: 'post', kind: cp.kind, variant, name: 'looks-security', ...Object.fromEntries(FIELDS.map((f) => [f, h])), items: [h, h], image: 'design/assets/demo/object-jar.jpg' };
        let r;
        try { r = renderPostWithLook(l, spec, { size: SIZES.feed, brand: { ...brand, name: h }, image: () => PIXEL, imageSize: () => ({ w: 100, h: 100 }) }, { shipped: true }); } catch (e) { assert.match(e.message, /can draw these words/); continue; }
        // the tags only (the words are text there, and may say anything): no script, no handler, no javascript: and no raw angle bracket left in the text
        const tags = [...r.body.matchAll(/<[^>]*>/g)].map((t) => t[0]);
        assert.ok(!tags.some((t) => /<\/?script|onerror|onload|javascript:/i.test(t)), `${l.id} ${cp.kind}/${variant}: ${h}`);
        assert.ok(!/[<>]/.test(r.body.replace(/<[^>]*>/g, '')), `${l.id} ${cp.kind}/${variant}: ${h}`);
        assert.deepEqual(tags.flatMap((t) => [...t.matchAll(/\s(on[a-z]+)=/gi)].map((m) => m[1])), [], `${l.id} ${cp.kind}/${variant}: ${h}`);
        drawn++;
      }
    }
  }
  assert.equal(drawn, 7 * HOSTILE.length, 'the 4 retail and 3 swiss compositions, each from every hostile text'); // (a composition that declines the words falls to the next of its kind, so all are drawn)
});

// A brand file is untrusted data: a look it carries (brand.looks) is checked by validateBrand like every other part, so a hostile or invalid look never
// reaches the renderer through a brand.
test('a brand carrying a hostile or invalid look is refused by validateBrand', async () => {
  const { shippedLooks } = await import('./lib/design/directions/index.mjs');
  const raw = JSON.parse(fs.readFileSync(brandFile('brand.json'), 'utf8'));
  const own = { ...structuredClone(shippedLooks().retail), id: 'my-retail', origin: 'copy:shipped:retail' };
  assert.deepEqual(validateBrand({ ...raw, looks: [own], style: { ...raw.style, direction: 'my-retail' } }), [], 'a valid copy of a shipped look is accepted');
  const hostile = [
    ['a render key', (l) => { l.render = 'process.exit(1)'; }],
    ['__proto__', (l) => { Object.defineProperty(l, '__proto__', { value: { x: 1 }, enumerable: true }); }],
    ['a hex colour where a role goes', (l) => { l.compositions[0].elements[0].fill = '#ff0000'; }],
    ['a style payload in a number', (l) => { l.canvas.feed.margin.top = 'red;background:url(//evil.example/x)'; }],
    ['a script URL in a font family', (l) => { l.fonts.display.family = 'javascript:alert(1)'; }],
    ['the shipped origin', (l) => { l.origin = 'shipped'; }],
    ['a composition nested far too deep', (l) => { let n = l.compositions[0].elements[0]; for (let i = 0; i < 30; i++) { n.children = [{ type: 'box', flow: 'column' }]; n = n.children[0]; } }],
  ];
  for (const [what, edit] of hostile) {
    const l = structuredClone(own);
    edit(l);
    const errs = validateBrand({ ...raw, looks: [l], style: { ...raw.style, direction: 'my-retail' } });
    assert.ok(errs.length > 0, `${what}: refused`);
    assert.ok(errs.every((e) => e.startsWith('brand.json: ') && e.length <= 220), `${what}: ${errs[0]}`);
    assert.ok(!errs.join(' ').includes('evil.example') && !errs.join(' ').includes('onerror'), `${what}: the payload is not echoed`);
  }
  assert.ok(validateBrand({ ...raw, looks: Array.from({ length: 21 }, (_, i) => ({ ...own, id: `l${i}` })) }).length > 0, 'more than the most looks');
  assert.ok(validateBrand({ ...raw, style: { ...raw.style, direction: 'nope' } }).some((e) => /direction/.test(e)), 'a direction that names nothing');
});

// Pills, icons, info rows, buttons and round pictures (the full suite is test-design-look-parts.mjs): hostile words and paths through each new field
// reach a post drawn by a look only as escaped text; an icon is only ever the engine's own path; a picture only the checked data: URI.
test('looks: hostile pill words, icon names, info rows, button words and picture paths never reach a tag', async () => {
  const { shippedLooks } = await import('./lib/design/directions/index.mjs');
  const { ICONS } = await import('./lib/design/icons.mjs');
  const look = { ...structuredClone(shippedLooks().swiss), id: 'sec-parts', origin: 'copy:shipped:swiss',
    compositions: [{ kind: 'event', name: 'Parts', describe: 'Security check.', ground: 'paper',
      fields: { headline: { required: true }, meta: { required: true }, cta: {}, info: {}, gallery: {} },
      elements: [
        { type: 'text', field: 'headline', style: 'display', size: 90, place: { px: { x: 64, y: 200, w: 952, h: 300 } }, pills: { fill: 'accent', ink: 'on-accent' }, icons: {} },
        { type: 'text', field: 'meta', style: 'label', place: { px: { x: 64, y: 140, w: 952, h: 40 } } },
        { type: 'info-rows', place: { px: { x: 64, y: 560, w: 952, h: 260 } }, valueStyle: 'label' },
        { type: 'photo-row', place: { px: { x: 64, y: 860, w: 952, h: 260 } }, captions: true },
        { type: 'button', place: { px: { x: 64, y: 1160, w: 952, h: 110 } }, size: 20, icon: 'arrow-right' },
      ] }] };
  const paths = new Set(Object.values(ICONS).map((i) => i.d));
  for (const h of HOSTILE) {
    const spec = { template: 'post', kind: 'event', name: 'sec', headline: `[[${h.slice(0, 20)}]] ${h} {{star}} {{${h}}}`, meta: h, cta: h,
      info: [{ key: 'When', value: h }, { key: h, value: h }], gallery: [{ image: h, caption: h }, { image: `${h}.jpg`, caption: h }] };
    assert.ok(validateDesign(spec, 'design', { direction: 'swiss' }).length > 0, `${h}: refused before drawing`);
    const r = renderPostWithLook(look, spec, { size: SIZES.feed, brand: { ...brand, name: h }, image: () => PIXEL, imageSize: () => ({ w: 600, h: 600 }) }, { shipped: false });
    const tags = [...r.body.matchAll(/<[^>]*>/g)].map((t) => t[0]);
    assert.ok(!tags.some((t) => /<\/?script|\son[a-z]+=|javascript:/i.test(t.replace(/ data-name="[^"]*"/g, ''))), h);
    assert.ok(!/[<>]/.test(r.body.replace(/<[^>]*>/g, '')), `${h}: no raw angle bracket in the text`);
    for (const m of r.body.matchAll(/ d="([^"]*)"/g)) assert.ok(paths.has(m[1]) || /^M [\d.]+ [\d.]+ a /.test(m[1]), `${h}: a path from the icon table only`);
    for (const m of r.body.matchAll(/ src="([^"]*)"/g)) assert.equal(m[1], PIXEL);
    for (const m of r.body.matchAll(/ data-name="([^"]*)"/g)) assert.ok(!/["<>]/.test(m[1]));
  }
});

test('post graphics: a graphic file is a path relative to the repository that stays inside it', async () => {
  const { graphicsProblems } = await import('./lib/design/post-spec.mjs');
  const REF = '0f8fad5b-d9cb-469f-a165-70867728950e';
  for (const image of ['/etc/secret.png', '../secret.png', 'design/assets/../../../secret.webp', 'C:\\secret.png', 'a\\..\\..\\secret.png']) {
    const p = graphicsProblems([{ ref: REF, image }], 'design');
    assert.ok(p.some((m) => /inside the repository/.test(m)), `${image}: ${p.join(' | ')}`);
    assert.ok(!p.some((m) => m.includes(image)), `${image}: the path is not echoed`);
  }
  assert.deepEqual(graphicsProblems([{ ref: REF, image: 'design/assets/demo/mark.png' }, { ref: '7c9e6679-7425-40de-944b-e07fc1f90ae7', image: 'out/app-render/x/in/1-mark.webp' }], 'design'), []);
});

test('charts: hostile labels, kinds, units, numbers and a hostile currency never reach a tag; the marks are numbers and palette roles only', async () => {
  const { shippedLooks } = await import('./lib/design/directions/index.mjs');
  const look = { ...structuredClone(shippedLooks().swiss), id: 'sec-chart', origin: 'copy:shipped:swiss',
    compositions: [{ kind: 'figure', name: 'Chart', describe: 'Security check.', ground: 'paper', fields: { big: { required: true }, chart: {} },
      elements: [
        { type: 'text', field: 'big', style: 'display', size: 200, place: { px: { x: 64, y: 100, w: 952, h: 260 } } },
        { type: 'chart', place: { px: { x: 64, y: 500, w: 952, h: 500 } }, kinds: ['bar', 'hbar', 'line', 'area', 'spark', 'donut', 'progress'], axis: 'grid', radius: 12 },
      ] }] };
  const draw = (chart, b = brand) => renderPostWithLook(look, { template: 'post', kind: 'figure', name: 'sec', big: '12', chart }, { size: SIZES.feed, brand: b, image: () => PIXEL, imageSize: () => ({ w: 600, h: 600 }) }, { shipped: false }).body;
  for (const h of [...HOSTILE, 'a‮b', 'x'.repeat(15)]) {
    for (const chart of [{ kind: h, series: [{ value: 1 }, { value: 2 }] }, { unit: h, series: [{ value: 1 }, { value: 2 }] }, { highlight: h, series: [{ value: 1 }, { value: 2 }] },
      { series: [{ label: h, value: 1 }, { value: 2 }] }, { series: [{ value: h }, { value: 2 }] }, { series: [{ value: 1, [h]: 1 }, { value: 2 }] }]) {
      const e = validateDesign({ template: 'post', kind: 'figure', big: '12', chart }, 'design', { direction: 'swiss' });
      const body = draw(chart);
      // a label of plain words (no bracket, mark or control character, up to 14 characters) is words like any other: drawn, escaped
      if (!e.length) {
        assert.ok(chart.series[0].label === h, `${h}: only a plain label is taken`);
        assert.ok(body.includes(esc(h)) && !/<\/?script|\son[a-z]+=/i.test(body), h);
        continue;
      }
      assert.ok(e.some((m) => /chart/.test(m)), `${h}: refused before drawing`);
      for (const m of e) assert.ok(!m.includes(h.slice(0, 16)) || h.length < 4, `${h}: not echoed (${m})`);
      assert.ok(!/data-chart/.test(body), `${h}: a refused chart is not drawn`);
    }
  }
  // a hostile currency in the brand's number format is refused by validateBrand and drawn as no currency at all
  for (const cur of ['<b>', '"><script>', 'url(x)', '€;color:red']) {
    assert.ok(validateBrand({ ...loadBrand(), numbers: { currency: cur } }).some((m) => /numbers\.currency/.test(m)), cur);
    const body = draw({ unit: 'currency', series: [{ label: 'Jan', value: 1450 }, { label: 'Feb', value: 1600 }] }, { ...brand, numbers: { currency: cur } });
    assert.match(body, /data-chart/);
    assert.ok(!body.includes(cur) && !body.includes(esc(cur)), cur);
  }
  // every kind, at the edges of what a chart takes: the marks are commands and numbers, the styles palette roles and numbers
  for (const chart of [{ kind: 'bar', series: [{ value: 1e9 }, { value: -1e9 }] }, { kind: 'hbar', series: [{ value: 0.01 }, { value: 0 }] }, { kind: 'line', series: Array.from({ length: 12 }, (_, i) => ({ value: i * 7 - 30 })) },
    { kind: 'area', series: [{ value: 3 }, { value: 3 }] }, { kind: 'spark', series: [{ value: 1 }, { value: 9 }] }, { kind: 'donut', unit: 'percent', series: [{ value: 100 }] }, { kind: 'progress', total: 1, series: [{ value: 0 }] }]) {
    const body = draw(chart);
    assert.match(body, /data-chart/, chart.kind);
    for (const m of body.matchAll(/<path d="([^"]*)" style="([^"]*)"/g)) {
      assert.match(m[1], /^[MLHVAZa0-9 .-]+$/, `${chart.kind}: ${m[1]}`);
      assert.match(m[2], /^fill:(?:none|var\(--c-[a-z-]+\))(?:;stroke:var\(--c-[a-z-]+\);stroke-width:[0-9.]+px;stroke-linecap:(?:round|butt);stroke-linejoin:round)?(?:;opacity:0\.\d+)?$/, `${chart.kind}: ${m[2]}`);
    }
    assert.ok(!/NaN|Infinity|undefined/.test(body), chart.kind);
  }
});

// A post's own design (design.composition) is untrusted data written by the AI or a person: it is held to the brand's look by the same validator
// as the look's compositions, refused without a look, and drawn only after it passes; the art layer it may carry is numbers and palette roles only.
test('a post\'s own design: hostile values are refused before drawing and never echoed; a valid one with art draws only numbers and palette roles', () => {
  const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'brands', 'kettleworks', 'brand.json'), 'utf8'));
  const look = pack.looks[0];
  const base = () => { const c = JSON.parse(JSON.stringify(look.compositions.find((x) => x.kind === 'statement'))); c.elements.unshift({ type: 'art', place: { inset: 'page' }, z: 0, shapes: [{ shape: 'circle', cx: 100, cy: 100, r: 200, colour: 'soft' }, { shape: 'path', d: [['M', 0, 0], ['Q', 100, 900, 900, 900]], stroke: 4 }] }); return c; };
  const post = (composition, extra = {}) => ({ template: 'post', kind: 'statement', headline: 'Words', composition, ...extra });
  const ctx = { size: SIZES.feed, brand: { ...brand, looks: [look], style: { ...brand.style, direction: look.id } }, image: () => PIXEL, imageSize: () => ({ w: 1, h: 1 }) };
  for (const h of HOSTILE) {
    const edits = [
      (c) => { c.name = h; }, (c) => { c.elements[0].shapes[0].colour = h; }, (c) => { c.elements[0].shapes[1].d = [['M', 0, 0], [h, 1, 1]]; }, (c) => { c.elements[0].shapes[1].d = h; },
      (c) => { c.elements[1].fill = h; }, (c) => { c.ground = h; }, (c) => { c.elements[0][h] = 1; }, (c) => { c.elements[0].shapes[0].cx = h; }, (c) => { c.elements[0].shapes[0].blend = h; },
    ];
    for (const edit of edits) {
      const c = base(); edit(c);
      const e = validateDesign(post(c), 'design', { look });
      // a name of plain words is a name (it never reaches the page); everything else is refused
      if (!e.length) { assert.equal(c.name, h); continue; }
      for (const m of e) assert.ok(!/<script|javascript:|onerror|url\(/i.test(m), `${h}: echoed (${m})`);
      assert.throws(() => renderPostWithLook(look, post(c), ctx), /own design cannot be drawn/);
    }
  }
  // the words of the post, hostile, through a valid own design with art: only escaped text, numbers and palette roles reach the tags
  for (const h of HOSTILE) {
    const r = renderPostWithLook(look, post(base(), { headline: h.slice(0, 60), sub: h.slice(0, 100), label: h.slice(0, 28) }), { ...ctx, brand: { ...ctx.brand, name: h } });
    const tags = [...r.body.matchAll(/<[^>]*>/g)].map((t) => t[0]);
    assert.ok(!tags.some((t) => /<\/?script|onerror|onload|javascript:|url\(x/i.test(t)), h);
    assert.ok(!/[<>]/.test(r.body.replace(/<[^>]*>/g, '')), h);
    for (const m of r.body.matchAll(/<path d="([^"]*)" style="([^"]*)"/g)) assert.match(m[1], /^[MLQCZAa0-9 .-]+$/);
  }
  // without a look there is nothing to draw it with
  assert.ok(validateDesign(post(base()), 'design', { direction: 'retail' }).some((m) => /drawn with the brand's look/.test(m)));
});
