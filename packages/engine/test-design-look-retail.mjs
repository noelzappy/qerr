// node --test   (the retail look as data, lib/design/looks/retail.look.json: pure, no Chrome. It validates as a shipped look, its
// brief matches the code registry it must reproduce (kinds, variants, names, fields, budgets), and the file holds no hex colour,
// no url(, no path and no markup.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lookBrief, validateLook } from './lib/design/look.mjs';
import { POST_ITEMS } from './lib/design/post-spec.mjs';
import { REGISTRY } from './lib/design/directions/index.mjs';

const FILE = new URL('./lib/design/looks/retail.look.json', import.meta.url);
const look = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const code = REGISTRY.retail;

test('the retail look validates as a shipped look, with no problem at all (fully strict: no allow-list)', () => {
  assert.deepEqual(validateLook(look, 'retail', { shipped: true }), []);
});

test('the brief lists all seven kinds, with the code registry\'s variants, names and budgets', () => {
  const brief = lookBrief(look);
  assert.deepEqual(Object.keys(brief.kinds).sort(), ['event', 'figure', 'list', 'offer', 'photo', 'quote', 'statement']);
  for (const [kind, variants] of Object.entries(code)) {
    const got = brief.kinds[kind].variants;
    assert.equal(got.length, variants.length, `${kind}: variant count`);
    variants.forEach((c, i) => {
      const v = got[i], where = `${kind}/${i}`;
      assert.equal(v.name, c.name, `${where}: name`);
      assert.deepEqual(Object.keys(v.fields).sort(), [...c.fields].sort(), `${where}: fields`);
      for (const f of c.fields) {
        if (f === 'image') continue;
        if (f === 'items') { assert.equal(v.fields.items.max <= POST_ITEMS.max && v.fields.items.min >= POST_ITEMS.min, true, `${where}: items count`); assert.equal(c.words.items, POST_ITEMS.chars, `${where}: item characters`); continue; }
        assert.equal(v.fields[f].max, c.words[f], `${where}: budget of ${f}`);
      }
      assert.equal(v.accepts.length > 0, typeof c.accepts === 'function', `${where}: accepts rule`);
      assert.ok(v.describe.length > 0 && v.describe.length <= 300, `${where}: describe`);
    });
  }
  assert.deepEqual(brief.kinds.statement.variants[1].accepts, [{ field: 'headline', part: 'pre', maxChars: 22 }]);
});

test('the grounds of the compositions match the code', () => {
  const grounds = {};
  for (const c of look.compositions) (grounds[c.kind] ??= []).push(c.ground);
  for (const [kind, variants] of Object.entries(code)) assert.deepEqual(grounds[kind], variants.map((c) => c.ground), kind);
});

test('the file holds no hex colour, url(, path or markup', () => {
  const strings = [];
  const walk = (v) => { if (typeof v === 'string') strings.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { strings.push(k); walk(x); } };
  walk(look);
  assert.ok(strings.length > 100);
  for (const s of strings) {
    assert.doesNotMatch(s, /#[0-9a-f]{3,8}/i, `hex colour in ${JSON.stringify(s)}`);
    assert.doesNotMatch(s, /url\(/i, `url( in ${JSON.stringify(s)}`);
    assert.doesNotMatch(s, /\//, `path in ${JSON.stringify(s)}`);
    assert.doesNotMatch(s, /</, `markup in ${JSON.stringify(s)}`);
  }
});
