// The shipped swiss look as data (lib/design/looks/swiss.look.json): pure checks, no Chrome. Run: node --test test-design-look-swiss.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateLook, lookBrief } from './lib/design/look.mjs';

const look = JSON.parse(fs.readFileSync(new URL('./lib/design/looks/swiss.look.json', import.meta.url), 'utf8'));

test('the swiss look loads and names itself', () => {
  assert.equal(look.id, 'swiss');
  assert.equal(look.compositions.length, 9);
  assert.equal(look.colour.logic, 'one-accent');
  assert.equal(look.canvas.feed.grid.rows, 8);
  assert.equal(look.canvas.feed.grid.head, 72);
  assert.equal(look.devices.folio, 'pad2-of-total');
});

test('validateLook reports no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'swiss', { shipped: true }), []);
});

test('lookBrief lists all seven kinds with the right variant counts', () => {
  const b = lookBrief(look);
  assert.deepEqual(Object.keys(b.kinds).sort(), ['event', 'figure', 'list', 'offer', 'photo', 'quote', 'statement']);
  const counts = Object.fromEntries(Object.entries(b.kinds).map(([k, v]) => [k, v.variants.length]));
  assert.deepEqual(counts, { statement: 2, figure: 1, list: 1, quote: 1, photo: 2, event: 1, offer: 1 });
  for (const v of Object.values(b.kinds)) for (const x of v.variants) { assert.ok(x.name); assert.ok(x.describe.length > 40 && x.describe.length <= 300); }
});

// How many elements of a composition draw in the accent role: a fill, ink or colour of accent, the emphasis of a fitted stack in
// accent (that page's one accent), a list's first number in accent.
const ACCENT = new Set(['accent', 'accent-type']);
function accents(els) {
  let n = 0;
  for (const e of els) {
    for (const k of ['fill', 'ink', 'colour']) if (ACCENT.has(e[k])) n++;
    if (e.type === 'fitted-stack' && e.emphasis === 'accent') n++;
    if (e.type === 'rows') { if (e.firstAccent) n++; if (ACCENT.has(e.numberTile?.fill)) n++; for (const r of e.altFill ?? []) if (ACCENT.has(r)) n++; }
    if (e.children) n += accents(e.children);
  }
  return n;
}
test('every composition has exactly one accent element', () => {
  for (const c of look.compositions) assert.equal(accents(c.elements), 1, `${c.kind}/${c.name}`);
});

test('no string carries a colour, a url, a path or markup', () => {
  const bad = [];
  (function walk(v, at) {
    if (typeof v === 'string') { if (/#[0-9a-f]{3,8}/i.test(v) || v.includes('url(') || v.includes('/') || v.includes('<')) bad.push(`${at}: ${v}`); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  })(look, 'look');
  assert.deepEqual(bad, []);
});
