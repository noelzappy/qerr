// node --test   (a design read without its caption: where a look leaves a big pale shape, it holds words. Without a picture, the Clean, Soft and
// Bloom offers carry the sub (what the price buys) in the card with the price; Soft's Quiet statement sets its sub in a card at the foot
// instead of leaving the bottom half to two bare circles.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { shippedLooks } from './lib/design/directions/index.mjs';

// the elements of a list and everything under them, with the conditions that hold on the way down
function* walk(els, when = []) {
  for (const e of els ?? []) {
    const w = e.when ? [...when, e.when] : when;
    yield { e, when: w };
    yield* walk(e.children, w);
  }
}
const holds = (when, key, field) => when.some((w) => w[key] === field);
const compOf = (id, kind, name) => shippedLooks()[id].compositions.find((c) => c.kind === kind && (!name || c.name === name));

for (const [id, name] of [['clean', 'Product'], ['soft', 'Price pill'], ['bloom', 'Badge']]) {
  test(`${id} offer (${name}) without a picture: the filled card holds the price and the sub`, () => {
    const comp = compOf(id, 'offer', name);
    const cards = comp.elements.filter((e) => e.fill && e.when?.absent === 'image' && e.children);
    assert.equal(cards.length, 1, 'one filled card in the picture\'s place');
    const inside = [...walk(cards[0].children)].map((x) => x.e);
    assert.ok(inside.some((e) => e.field === 'tag'), 'the price is in the card');
    assert.ok(inside.some((e) => e.field === 'sub'), 'the sub is in the card');
    // and the sub is drawn once in each branch: outside the card only beside a picture
    const subs = [...walk(comp.elements)].filter((x) => x.e.field === 'sub');
    assert.equal(subs.length, 2);
    assert.ok(subs.some((x) => holds(x.when, 'present', 'image')) && subs.some((x) => holds(x.when, 'absent', 'image')));
    // no filled shape without words in the no-picture branch
    for (const { e, when } of walk(comp.elements)) {
      if (e.type !== 'box' || !e.fill || holds(when, 'present', 'image') || holds(when, 'absent', 'sub')) continue;
      if (e.field) continue;
      const words = [...walk(e.children)].some((x) => x.e.field || x.e.source);
      assert.ok(words || (e.place?.px?.w ?? 0) * (e.place?.px?.h ?? 0) < 0.08 * 1080 * 1350, `${id} offer: a filled ${e.place?.px?.w}x${e.place?.px?.h} shape holds no words`);
    }
  });
}

test('soft Quiet statement: with a sub, the sub sits in a filled card and the bare circles are only for a page without one', () => {
  const comp = compOf('soft', 'statement', 'Quiet');
  const subs = [...walk(comp.elements)].filter((x) => x.e.field === 'sub');
  assert.equal(subs.length, 1);
  const card = comp.elements.find((e) => e.fill && [...walk(e.children)].some((x) => x.e.field === 'sub'));
  assert.ok(card, 'the sub is in a filled card');
  const bare = comp.elements.filter((e) => e.type === 'box' && e.fill && !e.children);
  const big = bare.filter((e) => (e.place?.px?.w ?? 0) >= 600 || e.fill === 'paper');
  assert.ok(big.every((e) => e.when?.absent === 'sub'), 'the big dome and the white circle only stand in for a missing sub');
});

test('a look that rotates its light page colours draws each post on one of them, picked from its own words, the same every time', async () => {
  const { rotatedGround } = await import('./lib/design/directions/index.mjs');
  const look = { colour: { grounds: ['paper', 'tint', 'dark'], rotate: ['paper', 'tint'] } };
  const posts = ['Nobody approves their own request', 'Cash taken offline is saved', 'Start free, keep your books', 'Ask Hivebot in plain words', 'Pay by link, step by step', 'Meet the team'].map((headline) => ({ kind: 'statement', headline }));
  const got = posts.map((p) => rotatedGround(look, 'paper', p));
  assert.deepEqual(new Set(got), new Set(['paper', 'tint']), 'a batch of posts lands on both colours');
  assert.deepEqual(posts.map((p) => rotatedGround(look, 'paper', p)), got, 'deterministic');
  assert.equal(rotatedGround(look, 'dark', posts[0]), 'dark', 'a page colour outside the rotation stays');
  assert.equal(rotatedGround({ colour: { grounds: ['paper'] } }, 'paper', posts[0]), 'paper', 'no rotation, no change');
  for (const id of ['clean', 'soft']) assert.ok(shippedLooks()[id].colour.rotate?.length >= 2, `${id} rotates its light page colours`);
});

test('Clean and Soft have a figure over a photo; a figure lands on it only with a picture, and never loses its picture to figure/0', async () => {
  const { postCompositionDevice } = await import('./lib/design/directions/index.mjs');
  for (const id of ['clean', 'soft']) {
    const look = shippedLooks()[id];
    const fig = look.compositions.filter((c) => c.kind === 'figure');
    assert.equal(fig.length, 2);
    assert.equal(fig[1].fields.image?.required, true, `${id} figure/1 takes a required picture`);
    const names = Array.from({ length: 12 }, (_, i) => `post-${i}`);
    const pick = (extra) => names.map((name) => postCompositionDevice(look, { template: 'post', kind: 'figure', name, big: '738+', ...extra }, { shipped: true }).variant);
    assert.deepEqual(new Set(pick({})), new Set([0]), 'without a picture: always the plain figure');
    assert.deepEqual(new Set(pick({ image: 'brands/demo/pictures/x.jpg' })), new Set([1]), 'with a picture: always the figure over a photo');
    assert.equal(postCompositionDevice(look, { template: 'post', kind: 'figure', variant: 0, big: '7', image: 'x.jpg' }, { shipped: true }).variant, 0, 'an asked variant is kept');
  }
});

test('colour.rotate: two or three light page colours the look lists', async () => {
  const { validateLook } = await import('./lib/design/look.mjs');
  const base = JSON.parse(JSON.stringify(shippedLooks().clean));
  const v = (rotate) => validateLook({ ...base, origin: 'copy:shipped:clean', colour: { ...base.colour, rotate } }, 'look');
  assert.deepEqual(v(['paper', 'tint']), []);
  assert.match(v(['paper', 'dark']).join(), /rotate/, 'a dark page colour cannot rotate in: the words are set for a light page');
  assert.match(v(['paper']).join(), /rotate/, 'at least two');
  assert.match(v(['paper', 'soft']).join(), /does not list in colour\.grounds/);
  assert.match(v(['paper', 'red;background:url(x)']).join(), /rotate/);
});

test('the labels of the Clean and Soft looks are set at the largest label size, one level with their body text', () => {
  for (const id of ['clean', 'soft']) {
    const t = shippedLooks()[id].type;
    assert.ok(t.label.size >= 34, `${id} label ${t.label.size}px`);
    assert.ok(Math.abs(t.label.size - t.body.size) <= 2, 'labels and body text stay one level of type (within 2 px)');
  }
});
