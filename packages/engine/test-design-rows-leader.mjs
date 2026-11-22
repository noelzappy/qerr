// The price leader of the rows primitive (rows.leader, directions/primitives/rows.mjs): each list item split at its last "·", the words on the
// left and the rest (a price, the hours) at the right end of the row after a dotted or solid line. A fixed list, refused value by value, list rows
// only, and every word escaped. Pure: no Chrome (the roast and plate look tests draw it through every check).
// Run: node --test test-design-rows-leader.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLook } from './lib/design/look.mjs';
import { shippedLooks, renderPostWithLook } from './lib/design/directions/index.mjs';
import { loadBrand } from './lib/design/brand.mjs';
import { SIZES } from './lib/design/sizes.mjs';

const look = shippedLooks().bloom;
const walkEls = (els, fn) => { for (const e of els) { fn(e); if (e.children) walkEls(e.children, fn); } };
const clone = (v) => JSON.parse(JSON.stringify(v));
const asCopy = (l) => ({ ...clone(l), origin: `copy:shipped:${l.id}` });
const brand = loadBrand();
const draw = (l, spec) => renderPostWithLook(l, { template: 'post', name: 'leader-test', ...spec }, { size: SIZES.feed, brand, image: () => 'data:image/png;base64,AA==', imageSize: () => ({ w: 1600, h: 2000 }) });

const leaderLook = (rows) => { const l = asCopy(look); const c = l.compositions.find((x) => x.name === 'Garden list'); walkEls(c.elements, (e) => { if (e.type === 'rows') { delete e.ruleEnd; delete e.ruleStyle; Object.assign(e, { rule: 'none' }, rows); } }); return l; };

test('rows.leader: a fixed list, list items only, refused value by value with a clean message', () => {
  assert.deepEqual(validateLook(leaderLook({ leader: 'solid' }), 'look', {}), []);
  assert.deepEqual(validateLook(leaderLook({ leader: 'dotted' }), 'look', {}), []);
  assert.deepEqual(validateLook(leaderLook({ leader: 'none' }), 'look', {}), []);
  for (const bad of ['dashed', 'red;background:url(x)', '</style>', 7, null, ['dotted'], { a: 1 }]) {
    const p = validateLook(leaderLook({ leader: bad }), 'look', {});
    assert.ok(p.some((m) => /leader/.test(m)), `${JSON.stringify(bad)}: ${p.join(' | ')}`);
    for (const m of p) assert.ok(m.length <= 200 && !m.includes('url(x)') && !m.includes('</style>'));
  }
  const ev = asCopy(look); const e = ev.compositions.find((x) => x.name === 'Invitation arch');
  e.elements.push({ type: 'rows', each: 'meta-parts', leader: 'dotted', place: { px: { x: 80, y: 900, w: 920, h: 200 } } });
  assert.ok(validateLook(ev, 'look', {}).some((m) => /needs each: items/.test(m)));
});

test('rows.leader: the words before the last "·" on the left, the rest at the right after a dotted line, all of it escaped', () => {
  const l = leaderLook({ leader: 'dotted' });
  const { body } = draw(l, { kind: 'list', variant: 0, headline: 'Menu', items: ['Flat white · €3', 'Tea <b>&amp; "cake" · ·€4', 'No price here', '<img src=x onerror=alert(1)>·<script>x</script>'] });
  assert.doesNotMatch(body, /<img|<script|<b>/);
  assert.match(body, />Flat white</); assert.match(body, />€3</);
  assert.match(body, /Tea &lt;b&gt;&amp;amp; &quot;cake&quot; ·</, 'only the last "·" splits');
  assert.match(body, />No price here</);
  assert.match(body, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.match(body, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.equal((body.match(/radial-gradient\(circle at 50% 50%/g) ?? []).length, 3, 'a dotted leader on each priced item, none on the item without a price');
  assert.doesNotMatch(draw(leaderLook({ leader: 'solid' }), { kind: 'list', variant: 0, headline: 'Menu', items: ['Tea · €2', 'Cake · €3'] }).body, /radial-gradient\(circle at 50% 50%/, 'a solid leader is a plain line');
  const { body: plain } = draw(leaderLook({}), { kind: 'list', variant: 0, headline: 'Menu', items: ['Flat white · €3', 'Tea · €2'] });
  assert.match(plain, />Flat white · €3</, 'without a leader the item is drawn whole');
});

