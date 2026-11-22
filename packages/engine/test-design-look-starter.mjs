// The blank starter look (lib/design/look-starter.mjs): a valid brand look with one plain composition for every kind, in the brand's own
// fonts and colours, never a shipped look. The pure checks need no Chrome; the drawing test (every composition from sample, stress and minimal
// copy, in three sets of brand colours, through every page check) is skipped without Chrome.
// Run: node --test test-design-look-starter.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KINDS, lookBrief, validateLook } from './lib/design/look.mjs';
import { POST_REQUIRED } from './lib/design/post-spec.mjs';
import { STARTER_KINDS, starterComposition, starterLook } from './lib/design/look-starter.mjs';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { Browser, findChrome } from './lib/design/chrome.mjs';
import { renderImage } from './lib/design/render.mjs';
import { normaliseDesign } from './lib/design/spec.mjs';
import { paletteBrand } from './testlib/retail-copy.mjs';

const walk = (els, fn) => { for (const e of els ?? []) { fn(e); walk(e.children, fn); } };
const bound = (comp) => { const out = new Set(); walk(comp.elements, (e) => { if (e.field) out.add(e.field); if (e.each === 'items') out.add('items'); if (e.type === 'photo') out.add('image'); }); return out; };

test('the starter is a valid brand look with one plain composition of every kind', () => {
  const look = starterLook({ id: 'my-start', name: 'My start' });
  assert.deepEqual(validateLook(look, 'starter'), []);
  assert.equal(look.id, 'my-start');
  assert.equal(look.name, 'My start');
  assert.equal(look.origin, 'starter');
  assert.deepEqual(STARTER_KINDS, KINDS);
  assert.deepEqual(look.compositions.map((c) => c.kind), KINDS);
  const counts = Object.fromEntries(Object.entries(lookBrief(look).kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, Object.fromEntries(KINDS.map((k) => [k, 1])));
});

test('it is not a shipped look and never claims to be one', () => {
  assert.ok(!Object.keys(shippedLooks()).includes('starter'));
  assert.ok(!Object.values(shippedLooks()).some((l) => l.origin === 'starter'));
  // a look that says it is shipped is refused unless it is the engine's own file
  assert.notDeepEqual(validateLook({ ...starterLook(), origin: 'shipped' }, 'starter'), []);
});

test('it takes the brand\'s fonts and colours: brand font roles only, no colour value, url, path or markup', () => {
  const look = starterLook();
  for (const f of Object.values(look.fonts)) assert.equal(f.source, 'brand');
  const bad = [];
  (function scan(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => scan(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
  assert.equal(look.logo.default, 'top-left');
});

test('every composition draws its kind\'s required fields, and a headline or the kind\'s main field with a sub line where the kind has one', () => {
  const want = { statement: ['headline', 'sub'], figure: ['big', 'unit', 'sub'], list: ['headline', 'items'], quote: ['quote', 'by'], photo: ['image', 'headline', 'sub'], event: ['headline', 'meta', 'sub'], offer: ['headline', 'tag', 'sub'] };
  for (const kind of KINDS) {
    const c = starterComposition(kind), fields = bound(c);
    for (const f of [...POST_REQUIRED[kind], ...want[kind]]) assert.ok(fields.has(f), `${kind} draws ${f}`);
    for (const f of POST_REQUIRED[kind]) assert.equal(c.fields[f]?.required, true, `${kind}: ${f} is required`);
  }
});

test('starterComposition hands out fresh copies, and null for an unknown kind', () => {
  const a = starterComposition('statement');
  a.name = 'Changed';
  assert.equal(starterComposition('statement').name, 'Plain statement');
  assert.equal(starterLook().compositions[0].name, 'Plain statement');
  for (const k of ['nope', '__proto__', 'constructor', '', null, 3]) assert.equal(starterComposition(k), null);
  // each one fits into a look of its own beside another composition of its kind (Add a blank design)
  const look = starterLook();
  for (const kind of KINDS) assert.deepEqual(validateLook({ ...look, compositions: [...look.compositions, starterComposition(kind)] }, 'starter'), [], kind);
});

// Fictional copy (the demo brand). No real organisation, person, place or amount.
const COPY = {
  sample: {
    statement: { headline: 'Save together, *see every step.*', sub: 'Every deposit is recorded the moment it is made, so the whole group sees the same balance.' },
    figure: { big: '3,900+', unit: 'members saving weekly', sub: 'Groups in twelve towns now keep their records in the app.' },
    list: { headline: 'Start a group in *four steps*', items: ['Name the group and its goal', 'Invite the members by phone', 'Choose a collector', 'Record the first deposit'] },
    quote: { quote: 'We used to argue about the book every month. Now everyone sees the same numbers.', by: 'Treasurer of a market group' },
    photo: { headline: 'Every coin, *on record.*', sub: 'One place for the group’s savings, open to every member.' },
    event: { headline: 'Meet the team behind *your savings*', meta: '12 Dec · 6pm · The community hall', sub: 'Bring your questions. Forty seats, so register early.' },
    offer: { headline: 'The group plan, *free for the first year*', tag: '£0', sub: 'For groups of up to thirty members. No card needed.' },
  },
  stress: {
    statement: { headline: 'Every member sees the same balance, *the moment money moves in*', sub: 'Every deposit is recorded the moment it is made, so the whole group sees the same balance and nobody keeps a book.' },
    figure: { big: '14.8M+', unit: 'saved by members a year', sub: 'Groups in twelve towns now keep their records in the app instead of a paper book.' },
    list: { headline: 'Start a saving group in *five easy steps*', items: ['Name the group and the goal it saves for', 'Invite the members with their phone numbers', 'Choose the collector who records deposits', 'Record the very first deposit together', 'Share the balance at the next meeting'] },
    quote: { quote: 'We used to argue about the book every month. Now everyone sees the same numbers, the meeting takes ten minutes and nobody wonders where the money went.', by: 'Treasurer of a market group, 2026' },
    photo: { headline: 'Every coin your group saves, *on record for all*', sub: 'One place for the group’s savings, open to every member, with a receipt for each deposit.' },
    event: { headline: 'Meet the people who keep *your savings safe*', meta: '12 Dec · 6pm · Community hall, Room 2', sub: 'Bring your questions and your group. Forty seats, so register early.' },
    offer: { headline: 'The group plan, *free for the whole first year*', tag: '£0 / year', sub: 'For groups of up to thirty members. No card needed, cancel any time.' },
  },
  minimal: {
    statement: { headline: 'Hello' }, figure: { big: '7 kg' }, list: { headline: 'Three', items: ['One', 'Two', 'Three'] }, quote: { quote: 'Said' },
    photo: { headline: 'Look' }, event: { headline: 'Night', meta: '12 Dec' }, offer: { headline: 'Half', tag: '-50%' },
  },
};
const COLOURS = {
  demo: {},
  dark: paletteBrand({ name: 'Night Kitchen', light: '#EFEAE0', ink: '#10151F', primary: '#1B2A41', gold: '#F2B84B', deep: '#8A5A00' }),
  pale: paletteBrand({ name: 'Pale Mill', light: '#F5F0E6', ink: '#2A2418', primary: '#9C3B16', gold: '#EADFC0', deep: '#9A7B2E' }),
};
const chrome = findChrome();
const skip = chrome ? false : 'Google Chrome was not found';
// STARTER_KEEP=<dir> keeps the pictures there, to look at them
const keep = process.env.STARTER_KEEP || '';
const tmp = keep || fs.mkdtempSync(path.join(os.tmpdir(), 'qerr-starter-'));
let browser;
test.before(async () => { if (chrome) browser = await Browser.launch({ chromePath: chrome }); });
test.after(() => { browser?.close(); if (!keep) fs.rmSync(tmp, { recursive: true, force: true }); });

test('every starter composition passes every page check from sample, stress and minimal copy, in three sets of brand colours', { skip }, async () => {
  const look = starterLook({ id: 'blank', name: 'Blank' });
  let drawn = 0;
  for (const colours of Object.keys(COLOURS)) {
    const b = loadBrand();
    const brand = { ...b, ...COLOURS[colours], looks: [look], style: { ...b.style, direction: look.id } };
    for (const [scenario, set] of Object.entries(COPY)) {
      for (const kind of KINDS) {
        const spec = { template: 'post', kind, variant: 0, name: 'starter-test', ...set[kind], ...(kind === 'photo' ? { image: 'design/assets/demo/object-jar.jpg' } : {}) };
        try {
          await renderImage(browser, brand, { spec: normaliseDesign(spec), sizeName: 'feed', outFile: path.join(tmp, `${kind}-${scenario}-${colours}.png`) }, { tmpDir: tmp });
          drawn++;
        } catch (e) { assert.fail(`${kind} ${scenario} ${colours}: ${e.message}`); }
      }
    }
  }
  assert.equal(drawn, KINDS.length * 3 * 3);
});
