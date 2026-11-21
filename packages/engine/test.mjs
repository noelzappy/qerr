// node --test   (no network, no dependencies; Buffer is played by a fake fetch)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, maskSecrets, zonedToUtcIso } from './lib/core.mjs';
import { createClient } from './lib/client.mjs';
import { buildInput, contentHash, loadBatch, resolveItems, validateBatch } from './lib/batch.mjs';
import { decide, loadState, planRows, runPush, runStatus } from './lib/push.mjs';
import { compareSchema, expectations, runCheck } from './lib/schema.mjs';

const KEY = 'sk_test_SECRET_KEY_12345';
const BASE = 'https://media.example.com/launch';

const rawBatch = (over = {}) => ({
  name: 't', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/t',
  posts: [
    { id: 'p1', date: '2026-12-01', caption: 'Hello #a #b', media: ['one.jpg'], networks: { instagram: { type: 'post' } }, skip: ['facebook'] },
    { id: 'p2', date: '2026-12-02', time: '15:30', caption: 'Second', media: ['v.mp4'], networks: { instagram: { type: 'reel', shouldShareToFeed: true } }, skip: ['linkedin', 'facebook'] },
    { id: 'p3', date: '2026-12-03', caption: 'Slides', media: ['s1.jpg', 's2.jpg', 's3 x.jpg'], networks: { instagram: { type: 'carousel' } }, skip: ['linkedin', 'facebook'] },
  ],
  ...over,
});
const channels = { instagram: 'ch_ig', linkedin: 'ch_li', facebook: 'ch_fb' };
const itemsOf = (raw = rawBatch()) => {
  const { errors, batch } = validateBatch(raw);
  assert.deepEqual(errors, []);
  return resolveItems(batch, { channels, mediaBaseUrl: BASE });
};

// A fake Buffer + media host. `api` decides how POSTs to the API are answered.
function fakeServer({ api, media = () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }) }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    return url.startsWith('https://api.buffer.com') ? api(calls.filter((c) => c.method === 'POST').length, calls.at(-1)) : media(url);
  };
  return { fetchImpl, calls, posts: () => calls.filter((c) => c.method === 'POST') };
}
const ok = (id, dueAt = '2026-12-01T09:00:00.000Z') => new Response(JSON.stringify({ data: { createPost: { __typename: 'PostActionSuccess', post: { id, text: 't', dueAt } } } }));

function harness({ items = itemsOf(), api, live = false, sleeps = [], state = { batch: 't', posts: {} }, forceNew = false } = {}) {
  const server = fakeServer({ api });
  const client = createClient({ apiKey: KEY, fetchImpl: server.fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });
  const logs = [];
  let saves = 0;
  const run = () => runPush({
    rows: planRows(items, state, { live, forceNew }), client, state, saveState: () => { saves++; },
    live, fetchImpl: server.fetchImpl, log: (l) => logs.push(l), now: () => Date.parse('2026-11-20T00:00:00Z'),
  });
  return { server, run, state, logs, sleeps, saves: () => saves };
}

test('local date and time become the UTC dueAt', () => {
  assert.equal(zonedToUtcIso('2026-12-01', '15:00', 'UTC'), '2026-12-01T15:00:00.000Z');
  assert.equal(zonedToUtcIso('2026-07-01', '09:00', 'Europe/London'), '2026-07-01T08:00:00.000Z');
  assert.equal(zonedToUtcIso('2026-12-01', '09:00', 'America/New_York'), '2026-12-01T14:00:00.000Z');
  assert.equal(zonedToUtcIso('2026-07-01', '09:00', 'America/New_York'), '2026-07-01T13:00:00.000Z');
  assert.equal(zonedToUtcIso('2026-12-01', '01:30', 'Asia/Tokyo'), '2026-11-30T16:30:00.000Z');
});

test('the content hash is stable and sensitive to text, media and dueAt', () => {
  const a = itemsOf()[0];
  assert.equal(a.hash, itemsOf()[0].hash);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  const base = { text: 't', media: [{ kind: 'image', rel: 'a.jpg' }], dueAt: '2026-12-01T09:00:00.000Z' };
  const h = contentHash(base);
  assert.equal(h, contentHash({ ...base }));
  assert.notEqual(h, contentHash({ ...base, text: 't2' }));
  assert.notEqual(h, contentHash({ ...base, media: [{ kind: 'image', rel: 'b.jpg' }] }));
  assert.notEqual(h, contentHash({ ...base, dueAt: '2026-12-01T10:00:00.000Z' }));
});

test('same hash is skipped, changed hash is refused unless --force-new', () => {
  const [item] = itemsOf();
  const rec = { status: 'created', mode: 'draft', bufferId: 'b1', hash: item.hash };
  assert.equal(decide(rec, item, { live: false, forceNew: false }).action, 'skip');
  assert.equal(decide({ ...rec, mode: 'live' }, item, { live: true, forceNew: false }).action, 'skip');
  assert.equal(decide({ ...rec, mode: 'live' }, item, { live: false, forceNew: false }).action, 'skip');
  const promote = decide(rec, item, { live: true, forceNew: false });
  assert.equal(promote.action, 'create');
  assert.ok(promote.promote);
  const changed = { ...rec, hash: 'other' };
  const refused = decide(changed, item, { live: false, forceNew: false });
  assert.equal(refused.action, 'refuse');
  assert.match(refused.reason, /content changed/);
  assert.equal(decide(changed, item, { live: false, forceNew: true }).action, 'create');
  assert.equal(decide({ status: 'unknown', hash: item.hash }, item, { live: false, forceNew: false }).action, 'refuse');
  assert.equal(decide(undefined, item, { live: false, forceNew: false }).action, 'create');
});

test('push skips what is recorded and refuses what changed, sending nothing for them', async () => {
  const items = itemsOf();
  const state = { batch: 't', posts: {
    p1: { instagram: { status: 'created', mode: 'draft', bufferId: 'b1', hash: items[0].hash }, linkedin: { status: 'created', mode: 'draft', bufferId: 'b2', hash: 'stale' } },
  } };
  const h = harness({ items, state, api: (n) => ok(`new${n}`) });
  const summary = await h.run();
  assert.equal(summary.skipped, 1);
  assert.equal(summary.refused, 1);
  assert.equal(summary.created, items.length - 2);
  assert.equal(state.posts.p1.linkedin.bufferId, 'b2');
});

test('key masking: text, bearer tokens and error bodies', async () => {
  assert.equal(maskSecrets(`oops ${KEY} and Bearer abc.def`, [KEY]), 'oops *** and Bearer ***');
  const server = fakeServer({ api: () => new Response(`bad token ${KEY}`, { status: 401 }) });
  const client = createClient({ apiKey: KEY, fetchImpl: server.fetchImpl, sleep: async () => {} });
  await assert.rejects(client.gql('query { x }'), (e) => !e.message.includes(KEY) && /rejected the API key/.test(e.message));
  const thrower = createClient({ apiKey: KEY, fetchImpl: async () => { throw new Error(`socket ${KEY}`); }, sleep: async () => {} });
  await assert.rejects(thrower.gql('query { x }'), (e) => !e.message.includes(KEY));
});

test('the key is not in plan output or state', async () => {
  const h = harness({ api: () => ok('b') });
  await h.run();
  assert.ok(!JSON.stringify(h.state).includes(KEY));
  assert.ok(h.server.posts().every((c) => c.headers.Authorization === `Bearer ${KEY}` && !JSON.stringify(c.body).includes(KEY)));
});

test('batch validation reports every problem', () => {
  const { errors } = validateBatch({
    timezone: 'Mars/Base', defaultTime: '9am', mediaRoot: 'm', posts: [{ id: 'x' }],
  });
  assert.ok(errors.some((e) => /timezone/.test(e)));
  assert.ok(errors.some((e) => /defaultTime/.test(e)));
  const bad = validateBatch({
    timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'm',
    posts: [
      { id: 'a', date: '2026-02-30', caption: 'x', media: ['a.jpg'] },
      { id: 'a', date: '2026-12-01', caption: '', media: ['../a.jpg'] },
      { id: 'c', date: '2026-12-01', time: '25:00', caption: 'x', media: ['a.txt'], skip: ['tiktok'], networks: { myspace: {} } },
    ],
  }).errors.join('\n');
  for (const re of [/real date/, /duplicate id/, /caption is required/, /stay inside/, /time "25:00"/, /not a known image/, /skip must be/, /unknown network "myspace"/]) assert.match(bad, re);
});

test('request body: image post (draft vs live), LinkedIn has no type metadata', () => {
  const items = itemsOf();
  const ig = items.find((i) => i.postId === 'p1' && i.network === 'instagram');
  const live = buildInput(ig, { draft: false });
  assert.deepEqual(live, {
    text: 'Hello #a #b', channelId: 'ch_ig', schedulingType: 'automatic', mode: 'customScheduled', dueAt: '2026-12-01T09:00:00.000Z',
    assets: [{ image: { url: `${BASE}/one.jpg` } }],
    metadata: { instagram: { type: 'post', shouldShareToFeed: true } },
  });
  assert.equal(buildInput(ig, { draft: true }).saveToDraft, true);
  assert.equal('saveToDraft' in live, false);
  const li = items.find((i) => i.postId === 'p1' && i.network === 'linkedin');
  assert.equal(buildInput(li, { draft: false }).metadata, undefined);
});

test('request body: carousel keeps order and encodes URLs; reel has a video asset', () => {
  const items = itemsOf();
  const car = buildInput(items.find((i) => i.postId === 'p3'), { draft: true });
  assert.deepEqual(car.assets.map((a) => a.image.url), [`${BASE}/s1.jpg`, `${BASE}/s2.jpg`, `${BASE}/s3%20x.jpg`]);
  assert.equal(car.metadata.instagram.type, 'carousel');
  const reel = buildInput(items.find((i) => i.postId === 'p2'), { draft: false });
  assert.equal(reel.dueAt, '2026-12-02T15:30:00.000Z');
  assert.deepEqual(reel.assets, [{ video: { url: `${BASE}/v.mp4`, metadata: { thumbnailOffset: 0 } } }]);
  assert.deepEqual(reel.metadata, { instagram: { type: 'reel', shouldShareToFeed: true } });
});

test('push drafts send saveToDraft, push --live does not, and state records the mode', async () => {
  const d = harness({ api: (n) => ok(`d${n}`) });
  const ds = await d.run();
  assert.equal(ds.created, 4);
  assert.ok(d.server.posts().every((c) => c.body.variables.input.saveToDraft === true));
  assert.equal(d.state.posts.p1.instagram.mode, 'draft');
  assert.equal(d.state.posts.p1.instagram.bufferId, 'd1');
  assert.ok(d.server.calls.filter((c) => c.method === 'HEAD').length >= 4);

  const l = harness({ api: (n) => ok(`l${n}`), live: true });
  await l.run();
  assert.ok(l.server.posts().every((c) => !('saveToDraft' in c.body.variables.input)));
  assert.equal(l.state.posts.p2.instagram.mode, 'live');
});

test('live push after a draft creates a live post and notes the old draft', async () => {
  const items = itemsOf();
  const state = { batch: 't', posts: { p1: { instagram: { status: 'created', mode: 'draft', bufferId: 'dr1', hash: items[0].hash } } } };
  const h = harness({ items, state, live: true, api: (n) => ok(`l${n}`) });
  await h.run();
  assert.equal(state.posts.p1.instagram.mode, 'live');
  assert.deepEqual(state.posts.p1.instagram.previous, [{ bufferId: 'dr1', mode: 'draft', hash: items[0].hash }]);
});

test('a MutationError stops the run and records nothing for that post', async () => {
  const h = harness({ api: () => new Response(JSON.stringify({ data: { createPost: { __typename: 'MutationError', message: 'Channel is disconnected' } } })) });
  const s = await h.run();
  assert.equal(s.failed, 1);
  assert.match(s.stopped, /Channel is disconnected/);
  assert.equal(h.server.posts().length, 1);
  assert.deepEqual(h.state.posts, {});
});

test('429 honours Retry-After, sleeps, and retries the same request', async () => {
  const h = harness({
    items: itemsOf().slice(0, 1),
    api: (n) => (n === 1 ? new Response('slow down', { status: 429, headers: { 'retry-after': '42' } }) : ok('after429')),
  });
  const s = await h.run();
  assert.deepEqual(h.sleeps, [42000]);
  assert.equal(s.created, 1);
  assert.equal(h.server.posts().length, 2);
  assert.equal(h.state.posts.p1.instagram.bufferId, 'after429');
});

test('an ambiguous failure (5xx or timeout) is recorded as unknown, never retried, and stops the run', async () => {
  for (const api of [() => new Response('boom', { status: 502 }), () => { throw new DOMException('timed out', 'TimeoutError'); }]) {
    const h = harness({ api });
    const s = await h.run();
    assert.equal(s.unknown, 1);
    assert.match(s.stopped, /status/);
    assert.equal(h.server.posts().length, 1, 'no automatic retry');
    assert.equal(h.state.posts.p1.instagram.status, 'unknown');
    assert.ok(h.saves() >= 1);
    // a second run refuses the unknown record instead of creating a possible duplicate
    const again = planRows(itemsOf(), h.state, { live: false, forceNew: false });
    assert.equal(again[0].action, 'refuse');
  }
});

test('media that is not 200 image/video refuses that post only', async () => {
  const items = itemsOf();
  // p1's picture is a 404 and one carousel slide is HTML; the reel is fine.
  const server = fakeServer({
    api: (n) => ok(`m${n}`),
    media: (url) => (url.endsWith('/one.jpg') ? new Response(null, { status: 404 }) : url.endsWith('/s2.jpg') ? new Response(null, { status: 200, headers: { 'content-type': 'text/html' } }) : new Response(null, { status: 200, headers: { 'content-type': 'video/mp4' } })),
  });
  const client = createClient({ apiKey: KEY, fetchImpl: server.fetchImpl, sleep: async () => {} });
  const state = { batch: 't', posts: {} };
  const logs = [];
  const s = await runPush({ rows: planRows(items, state, {}), client, state, saveState() {}, live: false, fetchImpl: server.fetchImpl, log: (l) => logs.push(l), now: Date.now });
  assert.equal(s.refused, 3);
  assert.ok(logs.some((l) => /one\.jpg -> HTTP 404/.test(l)));
  assert.ok(logs.some((l) => /not image\/\* or video\/\*/.test(l)));
  assert.equal(s.created, 1);
  assert.equal(server.posts().length, 1);
});

test('live push refuses a dueAt in the past', async () => {
  const items = itemsOf(rawBatch({ posts: [{ id: 'old', date: '2026-01-01', caption: 'x', media: ['a.jpg'], skip: ['linkedin', 'facebook'] }] }));
  const h = harness({ items, live: true, api: () => ok('x') });
  const s = await h.run();
  assert.equal(s.refused, 1);
  assert.equal(h.server.posts().length, 0);
});

test('warnings: limits, hashtags, missing Instagram media, carousel size, LinkedIn mixing', () => {
  const long = 'x'.repeat(2201);
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ');
  const { batch } = validateBatch({
    timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'm',
    posts: [
      { id: 'a', date: '2026-12-01', caption: long, media: ['a.jpg'], skip: ['facebook', 'linkedin'] },
      { id: 'b', date: '2026-12-01', caption: tags, skip: ['facebook', 'linkedin'] },
      { id: 'c', date: '2026-12-01', caption: 'c', media: Array.from({ length: 11 }, (_, i) => `${i}.jpg`), skip: ['facebook', 'linkedin'] },
      { id: 'd', date: '2026-12-01', caption: 'd', media: ['a.jpg', 'b.mp4'], skip: ['facebook', 'instagram'] },
    ],
  });
  const w = resolveItems(batch).flatMap((i) => i.warnings.map((x) => `${i.postId}: ${x}`)).join('\n');
  assert.match(w, /a: caption is 2201 characters, instagram allows 2200/);
  assert.match(w, /b: 31 hashtags/);
  assert.match(w, /b: Instagram needs media/);
  assert.match(w, /c: 11 items, Instagram allows 10/);
  assert.match(w, /d: LinkedIn does not take video mixed with images/);
});

test('compareSchema finds missing required fields, unknown fields and unknown enum values', () => {
  const f = (name, required = false) => ({ name, defaultValue: null, type: { kind: required ? 'NON_NULL' : 'SCALAR', name: null } });
  const en = (...v) => ({ enumValues: v.map((name) => ({ name })) });
  const exp = expectations({ facebookTypes: ['post'] });
  const good = {
    CreatePostInput: { inputFields: exp.inputs.CreatePostInput.map((n) => f(n)) },
    AssetInput: { inputFields: [f('image'), f('video')] },
    ImageAssetInput: { inputFields: [f('url', true)] },
    VideoAssetInput: { inputFields: [f('url', true), f('metadata')] },
    PostInputMetaData: { inputFields: [f('instagram'), f('facebook'), f('linkedin')] },
    InstagramPostMetadataInput: { inputFields: [f('type', true), f('shouldShareToFeed', true), f('firstComment')] },
    FacebookPostMetadataInput: { inputFields: [f('type', true), f('firstComment')] },
    LinkedInPostMetadataInput: { inputFields: [f('firstComment')] },
    ShareMode: en('customScheduled', 'addToQueue'), SchedulingType: en('automatic', 'notification'),
    PostType: en('post', 'reel', 'story', 'carousel'), PostTypeFacebook: en('post', 'reel'),
  };
  assert.deepEqual(compareSchema(good, exp), []);
  const broken = structuredClone(good);
  broken.InstagramPostMetadataInput.inputFields.push(f('audience', true));
  broken.FacebookPostMetadataInput.inputFields = [f('type', true)];
  broken.PostTypeFacebook = en('video');
  delete broken.ShareMode;
  const out = compareSchema(broken, exp).join('\n');
  assert.match(out, /InstagramPostMetadataInput: required field "audience" is not sent/);
  assert.match(out, /FacebookPostMetadataInput: field "firstComment" is sent but does not exist/);
  assert.match(out, /PostTypeFacebook: value "post" is used but the enum has \[video\]/);
  assert.match(out, /enum ShareMode not found/);
});

test('check lists orgs and channels, introspects, and saves the cache (fake Buffer)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buffer-check-'));
  const f = (name, required = false) => ({ name, defaultValue: null, type: { kind: required ? 'NON_NULL' : 'SCALAR', name: required ? null : 'String', ofType: required ? { kind: 'SCALAR', name: 'String' } : null } });
  const types = {
    CreatePostInput: { name: 'CreatePostInput', inputFields: ['text', 'channelId', 'schedulingType', 'mode', 'dueAt', 'assets', 'metadata', 'saveToDraft'].map((n) => f(n)) },
    AssetInput: { name: 'AssetInput', inputFields: [{ ...f('image'), type: { kind: 'INPUT_OBJECT', name: 'ImageAssetInput' } }, { ...f('video'), type: { kind: 'INPUT_OBJECT', name: 'VideoAssetInput' } }] },
    ImageAssetInput: { name: 'ImageAssetInput', inputFields: [f('url', true), f('altText')] },
    VideoAssetInput: { name: 'VideoAssetInput', inputFields: [f('url', true), f('metadata')] },
    PostInputMetaData: { name: 'PostInputMetaData', inputFields: [f('instagram'), f('facebook'), f('linkedin')] },
    InstagramPostMetadataInput: { name: 'InstagramPostMetadataInput', inputFields: [f('type', true), f('shouldShareToFeed', true), f('firstComment')] },
    FacebookPostMetadataInput: { name: 'FacebookPostMetadataInput', inputFields: [f('type', true), f('firstComment')] },
    LinkedInPostMetadataInput: { name: 'LinkedInPostMetadataInput', inputFields: [f('firstComment')] },
    ShareMode: { name: 'ShareMode', enumValues: [{ name: 'customScheduled' }] },
    SchedulingType: { name: 'SchedulingType', enumValues: [{ name: 'automatic' }] },
    PostType: { name: 'PostType', enumValues: ['post', 'reel', 'story', 'carousel'].map((name) => ({ name })) },
    PostTypeFacebook: { name: 'PostTypeFacebook', enumValues: [{ name: 'post' }] },
    Mutation: { name: 'Mutation', fields: [{ name: 'createPost' }, { name: 'deletePost' }, { name: 'login' }] },
    Query: { name: 'Query', fields: [] },
    Channel: { name: 'Channel', fields: [] },
  };
  const server = fakeServer({
    api: (_n, call) => {
      const q = call.body.query;
      if (q.includes('organizations')) return new Response(JSON.stringify({ data: { account: { organizations: [{ id: 'o1', name: 'Acme savings' }] } } }));
      if (q.includes('channels(')) return new Response(JSON.stringify({ data: { channels: [{ id: 'c1', name: 'savingspaa', displayName: 'Acme Savings', service: 'instagram', isQueuePaused: false }] } }));
      const names = [...q.matchAll(/(t\d+): __type\(name: "([^"]+)"\)/g)];
      return new Response(JSON.stringify({ data: Object.fromEntries(names.map(([, alias, name]) => [alias, types[name] ?? null])) }));
    },
  });
  const client = createClient({ apiKey: KEY, fetchImpl: server.fetchImpl, sleep: async () => {} });
  const out = [];
  const r = await runCheck({ client, log: (l) => out.push(l), root });
  const text = out.join('\n');
  assert.deepEqual(r.mismatches, []);
  assert.match(text, /Organizations \(1\)/);
  assert.match(text, /"instagram": "c1"/);
  assert.match(text, /createPost, deletePost/);
  assert.match(text, /Alt text field on images: altText/);
  assert.ok(!text.includes(KEY));
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'schema-cache.json'), 'utf8')).types.PostTypeFacebook);
});

test('status resolves an unknown record only on an exact text and dueAt match', async () => {
  const state = { batch: 't', posts: {
    p1: { instagram: { status: 'unknown', mode: 'draft', dueAt: '2026-12-01T09:00:00.000Z', text: 'Hello  world', hash: 'h' } },
    p2: { instagram: { status: 'unknown', mode: 'draft', dueAt: '2026-12-02T09:00:00.000Z', text: 'Nothing like it', hash: 'h' } },
  } };
  const server = fakeServer({
    api: (_n, call) => new Response(JSON.stringify({ data: { posts: { edges: call.body.query.includes('[scheduled]') ? [] : [{ node: { id: 'found1', text: 'Hello world', dueAt: '2026-12-01T09:00:00.000Z' } }] } } })),
  });
  const client = createClient({ apiKey: KEY, fetchImpl: server.fetchImpl, sleep: async () => {} });
  await runStatus({ client, orgId: 'o1', state, saveState() {}, log() {} });
  assert.equal(state.posts.p1.instagram.status, 'created');
  assert.equal(state.posts.p1.instagram.bufferId, 'found1');
  assert.equal(state.posts.p2.instagram.status, 'unknown');
});

test('the example launch batch loads and resolves to 28 channel posts (seven posts on four channels, X included) without errors', () => {
  const batch = loadBatch(path.join(ROOT, 'batches', 'example-launch.json'));
  const items = resolveItems(batch, { channels, mediaBaseUrl: BASE });
  assert.equal(items.length, 28);
  // Media is never committed, so a fresh clone has none; only the file-existence warning is allowed.
  assert.equal(items.filter((i) => i.warnings.some((w) => !/local file missing|Facebook type .* is unverified/.test(w))).length, 0);
  assert.equal(items[0].dueAt, '2026-11-23T09:00:00.000Z');
  assert.ok(loadState('/nonexistent/state.json', 'x').posts);
});

test('--help, -h, help and no arguments print usage and exit 0; an unknown command exits 1', () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(import.meta.dirname, 'buffer.mjs'), ...args], { encoding: 'utf8' });
  for (const args of [['--help'], ['-h'], ['help'], []]) {
    const r = run(...args);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage:/);
    for (const c of ['check', 'plan', 'media', 'upload', 'push', 'status', '--live', '--yes', '--force-new']) assert.ok(r.stdout.includes(c), c);
  }
  const bad = run('frobnicate');
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /Usage:/);
});
