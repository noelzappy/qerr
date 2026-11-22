// node --test   Several Buffer accounts, channel routing, X, per-account limits, records without an account.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from './lib/client.mjs';
import { validateBatch, resolveItems, contentHash } from './lib/batch.mjs';
import { isValidAccountName } from './lib/accounts.mjs';
import { decide, planRows, runPush, runStatus } from './lib/push.mjs';
import { fakeServer, ok } from './testlib/fakes.mjs';

const KEYS = { A: 'fake_ACCOUNT_A_secret_1', B: 'fake_ACCOUNT_B_secret_2' };
const BASE = 'https://media.example.com/fan';

const accounts = [
  { name: 'A', apiKey: KEYS.A, organizationId: '', captionLimits: {} },
  { name: 'B', apiKey: KEYS.B, organizationId: '', captionLimits: {} },
];
// X and LinkedIn through A, Facebook and Instagram through B (the example in the spec).
const routing = {
  x: { account: 'A', channelId: 'x1' }, linkedin: { account: 'A', channelId: 'l1' },
  facebook: { account: 'B', channelId: 'f1' }, instagram: { account: 'B', channelId: 'i1' },
};
const rawFan = (over = {}) => ({
  name: 'fan', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/fan', defaultNetworks: ['instagram', 'linkedin', 'facebook', 'x'],
  posts: [
    { id: 'p1', date: '2026-12-01', caption: 'Hello', media: ['a.jpg'] },
    { id: 'p2', date: '2026-12-02', caption: 'Two', media: ['b.jpg'] },
  ],
  ...over,
});
const batchOf = (raw = rawFan()) => {
  const { errors, batch } = validateBatch(raw);
  assert.deepEqual(errors, []);
  return batch;
};
// The web app uploads every file to the public prefix before it sends; here each medium gets the URL an upload would give it.
const withUrls = (items) => {
  for (const i of items) for (const m of i.media) m.url = `${BASE}/${m.rel}`;
  return items;
};
const fanItems = (opts = {}) => withUrls(resolveItems(batchOf(), { routing, accounts, ...opts }));

function multiHarness({ items = fanItems(), api, live = false, state = { batch: 'fan', posts: {} }, budget } = {}) {
  const server = fakeServer({ api });
  const sleeps = { A: [], B: [] };
  const clients = Object.fromEntries(['A', 'B'].map((n) => [n, createClient({ apiKey: KEYS[n], fetchImpl: server.fetchImpl, sleep: async (ms) => { sleeps[n].push(ms); }, ...(budget ? { budget } : {}) })]));
  const logs = [];
  const run = () => runPush({
    rows: planRows(items, state, { live }), clients, state, saveState() {}, live,
    fetchImpl: server.fetchImpl, log: (l) => logs.push(l), now: () => Date.parse('2026-11-20T00:00:00Z'),
  });
  return { server, run, state, logs, sleeps, clients };
}
const whoIs = (call) => (call.headers.Authorization === `Bearer ${KEYS.A}` ? 'A' : 'B');

// ---------- accounts and routing ----------

test('account names: letters, digits, _ and -, up to 32 characters', () => {
  for (const good of ['main', 'Second_2', 'a-b', 'x'.repeat(32)]) assert.equal(isValidAccountName(good), true, good);
  for (const bad of ['', 'x'.repeat(33), 'two words', 'name.with.dots', 'ünï', undefined, 7, { name: 'main' }]) assert.equal(isValidAccountName(bad), false, String(bad));
});

test('a post is split across two accounts, each request carrying its own key and channel', async () => {
  const items = fanItems();
  assert.deepEqual(items.filter((i) => i.postId === 'p1').map((i) => `${i.network}:${i.account}:${i.channelId}`), ['instagram:B:i1', 'linkedin:A:l1', 'facebook:B:f1', 'x:A:x1']);
  const h = multiHarness({ items, api: (n) => ok(`b${n}`) });
  const s = await h.run();
  assert.equal(s.created, 8);
  const sent = h.server.posts().map((c) => [whoIs(c), c.body.variables.input.channelId]);
  for (const [who, channel] of sent) assert.equal(routing[Object.keys(routing).find((n) => routing[n].channelId === channel)].account, who, `${channel} went through the wrong account`);
  assert.equal(h.state.posts.p1.x.account, 'A');
  assert.equal(h.state.posts.p1.instagram.account, 'B');
  assert.deepEqual(s.byAccount.A, { created: 4, skipped: 0, refused: 0, failed: 0, unknown: 0, notAttempted: 0 });
  assert.equal(h.clients.A.requestCount, 4);
  assert.equal(h.clients.B.requestCount, 4);
  assert.ok(!JSON.stringify(h.state).includes('secret'), 'no key in state');
});

test('a network with no route is refused, not sent through some other account', async () => {
  const partial = { ...routing };
  delete partial.x;
  const items = withUrls(resolveItems(batchOf(), { routing: partial, accounts }));
  const h = multiHarness({ items, api: (n) => ok(`b${n}`) });
  const s = await h.run();
  assert.equal(s.refused, 2);
  assert.equal(s.created, 6);
  assert.ok(h.logs.some((l) => /REFUSE .*p1 \/ x: x has no route/.test(l)));
});

test('rate limiting and Retry-After are per account', async () => {
  let t = 0;
  const sleeps = { A: [], B: [] };
  const fetchImpl = async () => new Response(JSON.stringify({ data: { ok: true } }));
  const mk = (n) => createClient({ apiKey: KEYS[n], fetchImpl, now: () => t, sleep: async (ms) => { sleeps[n].push(ms); t += ms; }, budget: { max: 2, windowMs: 1000 } });
  const a = mk('A');
  const b = mk('B');
  await a.gql('q'); await b.gql('q'); await a.gql('q'); await b.gql('q');
  assert.deepEqual(sleeps, { A: [], B: [] }, 'two requests each is within each account\'s own budget');
  await a.gql('q'); // A's third inside the window waits; B's use of its own budget does not count against A, nor A's against B
  assert.deepEqual(sleeps.A, [1000]);
  assert.deepEqual(sleeps.B, []);

  // A 429 on one account sleeps that account's Retry-After only; the other account's client never sleeps.
  const h = multiHarness({ api: (n, call) => (n === 1 && whoIs(call) === 'B' ? new Response('slow', { status: 429, headers: { 'retry-after': '7' } }) : ok(`r${n}`)) });
  const s = await h.run();
  assert.deepEqual(h.sleeps, { A: [], B: [7000] });
  assert.equal(s.created, 8);
});

test('a failure on one account stops the run, names the account and channel, and lists what was not sent', async () => {
  // p1: instagram(B) ok, linkedin(A) ok, facebook(B) is answered with a server error; x(A) and all of p2 must not be sent.
  const h = multiHarness({ api: (n) => (n === 3 ? new Response('boom', { status: 502 }) : ok(`b${n}`)) });
  const s = await h.run();
  assert.equal(s.created, 2);
  assert.equal(s.unknown, 1);
  assert.match(s.stopped, /p1 \/ facebook \(account "B", channel f1\)/);
  assert.match(s.stopped, /NOT retried/);
  assert.equal(h.server.posts().length, 3, 'nothing was sent after the failure and nothing was retried');
  assert.equal(s.notAttempted.length, 5);
  assert.deepEqual(s.notAttempted[0], { postId: 'p1', network: 'x', account: 'A' });
  assert.ok(h.logs.some((l) => /NOT SENT p1 \/ x \(account "A"\)/.test(l)));
  assert.equal(s.byAccount.A.notAttempted, 3);
  assert.equal(s.byAccount.B.notAttempted, 2);
  assert.equal(h.state.posts.p1.facebook.status, 'unknown');
  assert.equal(h.state.posts.p1.facebook.account, 'B');
  // A rerun refuses the unknown record rather than creating a possible duplicate in account B.
  const again = planRows(fanItems(), h.state, { live: false });
  assert.equal(again.find((r) => r.item.postId === 'p1' && r.item.network === 'facebook').action, 'refuse');
});

test('a Buffer refusal on one account is reported with its account too', async () => {
  const h = multiHarness({ api: (n, call) => (whoIs(call) === 'A' ? new Response(JSON.stringify({ data: { createPost: { __typename: 'MutationError', message: 'Channel is disconnected' } } })) : ok(`b${n}`)) });
  const s = await h.run();
  assert.equal(s.failed, 1);
  assert.match(s.stopped, /p1 \/ linkedin \(account "A", channel l1\): Channel is disconnected/);
  assert.equal(s.created, 1);
});

// ---------- records without an account, old hashes ----------

// Hashes printed by the version before accounts and X existed, for this exact batch. They must never change.
const LEGACY_RAW = {
  name: 'legacy', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/legacy',
  posts: [
    { id: 'a1', date: '2026-12-01', caption: 'Hello #a', media: ['one.jpg'], networks: { instagram: { type: 'post', firstComment: 'hi' }, linkedin: { caption: 'Hello LI' } } },
    { id: 'a2', date: '2026-12-02', time: '15:30', caption: 'Clip', media: [{ file: 'v.mp4', thumbnailOffsetMs: 1500 }], skip: ['linkedin'] },
  ],
};
const LEGACY_HASHES = {
  'a1/instagram': '169e571cbbbce060e78d4367c9bd5f618f8ea264e851da8792f9e5bf2b79f0b8',
  'a1/linkedin': '257877f4e289261931113c9a0543d6722d8af3b7a64927f5eb4269bf8651cefa',
  'a1/facebook': 'f500ec4510436e1b24cc1944b844146d096efe3c7dad83dbab55259d1a0efef1',
  'a2/instagram': '0c35500e693280c6ce5a4ce821bd9a0291f0d17af4242d99850fa9ba2cfc8957',
  'a2/facebook': '350eac70c78edaea3499d19f996013dc1a859603078fd19dae09f1407302c74f',
};
// State exactly as the first version wrote it: no `account`, no `media`.
const OLD_STATE = JSON.parse(JSON.stringify({
  batch: 'legacy',
  posts: {
    a1: {
      instagram: { mode: 'draft', dueAt: '2026-12-01T09:00:00.000Z', hash: LEGACY_HASHES['a1/instagram'], at: '2026-11-20T10:00:00.000Z', status: 'created', bufferId: 'buf_ig' },
      linkedin: { mode: 'live', dueAt: '2026-12-01T09:00:00.000Z', hash: LEGACY_HASHES['a1/linkedin'], at: '2026-11-20T10:00:01.000Z', status: 'created', bufferId: 'buf_li', previous: [{ bufferId: 'buf_li_draft', mode: 'draft', hash: 'old' }] },
    },
    a2: { facebook: { mode: 'draft', dueAt: '2026-12-02T15:30:00.000Z', hash: 'stale-content', at: '2026-11-20T10:00:02.000Z', status: 'created', bufferId: 'buf_fb' } },
  },
}));

test('the duplicate-protection hash is unchanged: pinned values, and independent of account, routing, limits and uploads', () => {
  const batch = batchOf(LEGACY_RAW);
  const plain = resolveItems(batch, { routing: { instagram: { account: 'A', channelId: 'c1' }, linkedin: { account: 'A', channelId: 'c2' }, facebook: { account: 'A', channelId: 'c3' } }, accounts });
  assert.deepEqual(Object.fromEntries(plain.map((i) => [`${i.postId}/${i.network}`, i.hash])), LEGACY_HASHES);
  assert.deepEqual(resolveItems(batch).map((i) => i.hash), plain.map((i) => i.hash), 'no routing at all');
  const routed = resolveItems(batch, {
    routing: { instagram: { account: 'B', channelId: 'x' }, linkedin: { account: 'A', channelId: 'y' }, facebook: { account: 'B', channelId: 'z' } },
    accounts: [{ ...accounts[0], captionLimits: { linkedin: 10 } }, accounts[1]], uploaded: { 'one.jpg': { url: 'https://bucket.example/public/x/one.jpg', sha256: 'abc' } },
  });
  assert.deepEqual(routed.map((i) => i.hash), plain.map((i) => i.hash));
  assert.equal(contentHash({ text: 'x', media: [], dueAt: 'd' }), contentHash({ text: 'x', media: [], dueAt: 'd', account: 'A' }));
});

test('records that carry no account are still honoured, whichever account the network is routed to', async () => {
  const batch = batchOf(LEGACY_RAW);
  const oneAccount = { instagram: { account: 'A', channelId: 'c1' }, linkedin: { account: 'A', channelId: 'c2' }, facebook: { account: 'A', channelId: 'c3' } };
  const twoAccounts = { instagram: { account: 'B', channelId: 'c1' }, linkedin: { account: 'A', channelId: 'c2' }, facebook: { account: 'B', channelId: 'c3' } };
  for (const r of [oneAccount, twoAccounts]) {
    const items = resolveItems(batch, { routing: r, accounts });
    const state = structuredClone(OLD_STATE);
    const rows = planRows(items, state, { live: false });
    const by = Object.fromEntries(rows.map((r) => [`${r.item.postId}/${r.item.network}`, r]));
    assert.equal(by['a1/instagram'].action, 'skip', 'same hash, draft: skipped');
    assert.match(by['a1/instagram'].reason, /buf_ig/);
    assert.equal(by['a1/linkedin'].action, 'skip', 'same hash, live: skipped');
    assert.equal(by['a2/facebook'].action, 'refuse', 'changed content: refused');
    assert.equal(by['a2/instagram'].action, 'create');
    // live over an old draft keeps the history exactly as before
    const live = planRows(items, state, { live: true });
    assert.equal(live.find((r) => r.item.postId === 'a1' && r.item.network === 'instagram').promote, true);
  }
  // and it sends nothing for the skipped and refused ones
  const server = fakeServer({ api: (n) => ok(`n${n}`) });
  const client = createClient({ apiKey: 'k_legacy_key', fetchImpl: server.fetchImpl, sleep: async () => {} });
  const state = structuredClone(OLD_STATE);
  const items = withUrls(resolveItems(batch, { routing: oneAccount, accounts }));
  const s = await runPush({ rows: planRows(items, state, {}), clients: { A: client }, state, saveState() {}, live: false, fetchImpl: server.fetchImpl, log() {}, now: () => 0 });
  assert.equal(s.skipped, 2);
  assert.equal(s.refused, 1);
  assert.equal(s.created, 2);
  assert.equal(state.posts.a1.linkedin.bufferId, 'buf_li');
  assert.equal(state.posts.a1.instagram.bufferId, 'buf_ig');
  assert.equal(server.posts().length, 2);
  assert.equal(state.posts.a2.instagram.account, 'A', 'new records say which account made them');
});

test('a record made in one account is not honoured as a record in another', () => {
  const items = fanItems();
  const item = items.find((i) => i.postId === 'p1' && i.network === 'facebook');
  const rec = { status: 'created', mode: 'draft', bufferId: 'bf1', hash: item.hash, account: 'A' };
  for (const live of [false, true]) {
    const d = decide(rec, item, { live });
    assert.equal(d.action, 'refuse');
    assert.match(d.reason, /account "A".*routed to "B"; delete it from Buffer/);
  }
  assert.equal(decide({ ...rec, account: 'B' }, item, { live: false }).action, 'skip');
});

// ---------- X ----------

test('x is opt-in per post or per batch, so batches written before X keep their meaning', () => {
  const asBefore = batchOf(rawFan({ defaultNetworks: undefined }));
  assert.deepEqual(resolveItems(asBefore, { routing }).map((i) => i.network), ['instagram', 'linkedin', 'facebook', 'instagram', 'linkedin', 'facebook']);
  const optIn = batchOf(rawFan({ defaultNetworks: undefined, posts: [{ id: 'p1', date: '2026-12-01', caption: 'Hello', media: ['a.jpg'], networks: { x: {} } }] }));
  assert.deepEqual(resolveItems(optIn, { routing }).map((i) => i.network), ['instagram', 'linkedin', 'facebook', 'x']);
  const skipped = batchOf(rawFan({ posts: [{ id: 'p1', date: '2026-12-01', caption: 'Hello', media: ['a.jpg'], skip: ['x'] }] }));
  assert.ok(!resolveItems(skipped, { routing }).some((i) => i.network === 'x'));
  assert.ok(validateBatch({ ...rawFan(), defaultNetworks: ['tiktok'] }).errors.some((e) => /defaultNetworks/.test(e)));
  assert.ok(validateBatch({ ...rawFan(), posts: [{ id: 'p1', date: '2026-12-01', caption: 'c', skip: ['whatsapp'] }] }).errors.some((e) => /skip must be a list of instagram, linkedin, facebook, x/.test(e)));
});

test('x takes its own caption override, sends no type or metadata, and has a 280 character limit', () => {
  const long = 'y'.repeat(281);
  const batch = batchOf(rawFan({ posts: [{ id: 'p1', date: '2026-12-01', caption: long, media: ['a.jpg'], networks: { x: { caption: 'Short for X' }, linkedin: {}, instagram: {}, facebook: {} } }] }));
  const items = resolveItems(batch, { routing, accounts });
  const x = items.find((i) => i.network === 'x');
  assert.equal(x.text, 'Short for X');
  assert.equal(x.type, null);
  assert.equal(x.metadata, undefined);
  assert.equal(x.charLimit, 280);
  assert.deepEqual(x.warnings, []);
  assert.equal(items.find((i) => i.network === 'linkedin').text, long, 'other networks keep the post caption');
});

test('x caption limit warnings: 280 by default, per account when raised, and the other X warnings', () => {
  const caption = 'z'.repeat(281);
  const mk = (extra = {}) => batchOf(rawFan({ posts: [{ id: 'p1', date: '2026-12-01', caption, media: ['a.jpg'], skip: ['instagram', 'linkedin', 'facebook'], ...extra }] }));
  const warn = (items) => items.find((i) => i.network === 'x').warnings;
  assert.match(warn(resolveItems(mk(), { routing, accounts }))[0], /caption is 281 characters, x allows 280/);
  const paid = [{ ...accounts[0], captionLimits: { x: 25000 } }, accounts[1]];
  assert.deepEqual(warn(resolveItems(mk(), { routing, accounts: paid })), []);
  assert.equal(resolveItems(mk(), { routing, accounts: paid }).find((i) => i.network === 'x').charLimit, 25000);
  // the limit belongs to the account the network is routed to
  const elsewhere = { ...routing, x: { account: 'B', channelId: 'x1' } };
  assert.match(warn(resolveItems(mk(), { routing: elsewhere, accounts: paid }))[0], /allows 280/);
  assert.equal(warn(resolveItems(mk({ caption: 'z'.repeat(280) }), { routing, accounts })).length, 0, 'exactly 280 is fine');
  assert.match(warn(resolveItems(mk({ media: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'], caption: 'ok' }), { routing, accounts })).join('|'), /5 images, X allows 4; remove pages from the carousel or leave X out/);
  assert.doesNotMatch(warn(resolveItems(mk({ media: ['1.jpg', '2.jpg', '3.jpg', '4.jpg'], caption: 'ok' }), { routing, accounts })).join('|'), /X allows/, 'four images is fine');
  assert.match(warn(resolveItems(mk({ caption: 'ok', networks: { x: { firstComment: 'later' } } }), { routing, accounts })).join('|'), /firstComment is not sent to X/);
});

// ---------- status ----------

test('status asks each account for its own posts and matches records only inside their account', async () => {
  const state = { batch: 'fan', posts: {
    p1: {
      x: { account: 'A', status: 'created', mode: 'draft', bufferId: 'same-id', hash: 'h' },
      instagram: { account: 'B', status: 'created', mode: 'draft', bufferId: 'same-id', hash: 'h' },
      linkedin: { status: 'created', mode: 'draft', bufferId: 'old-li', hash: 'h' }, // written before accounts existed
    },
  } };
  const asked = [];
  const server = fakeServer({
    api: (_n, call) => {
      const who = whoIs(call);
      asked.push(who);
      const edges = call.body.query.includes('[scheduled]') ? (who === 'A' ? [{ node: { id: 'same-id', text: 't', dueAt: 'd' } }, { node: { id: 'old-li', text: 't', dueAt: 'd' } }] : []) : [];
      return new Response(JSON.stringify({ data: { posts: { edges } } }));
    },
  });
  const mk = (n) => ({ name: n, client: createClient({ apiKey: KEYS[n], fetchImpl: server.fetchImpl, sleep: async () => {} }), orgId: `o${n}` });
  const out = [];
  await runStatus({ accounts: [mk('A'), mk('B')], accountOf: (network) => routing[network]?.account, state, saveState() {}, log: (l) => out.push(l) });
  const text = out.join('\n');
  assert.deepEqual([...new Set(asked)].sort(), ['A', 'B']);
  const row = (net) => text.split('\n').find((l) => l.startsWith('p1') && l.includes(` ${net} `));
  assert.match(row('x'), /in Buffer \(scheduled\)/);
  assert.match(row('instagram'), /not in the scheduled\/draft lists/, 'the id exists in account A only, so B\'s record must not match it');
  assert.match(row('linkedin'), /A .*in Buffer \(scheduled\)/, 'an old record is looked up in the account its network is routed to');
});
