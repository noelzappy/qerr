// node --test   S3 signing and upload (no network: the bucket is a Map behind an injectable fetch).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { maskSecrets } from './lib/core.mjs';
import { createClient } from './lib/client.mjs';
import { loadBatch, resolveItems, buildInput } from './lib/batch.mjs';
import { planRows, runPush } from './lib/push.mjs';
import { S3Error, createS3, loadS3Config, publicUrl, signRequest, signingKey, uriEncode } from './lib/storage/s3.mjs';
import { UploadError, objectKey, planUploads, runUpload, safeName } from './lib/storage/upload.mjs';
import { fakeServer, ok } from './testlib/fakes.mjs';

const SECRET = 'S3_SECRET_value_that_must_never_print';
const ENV = {
  S3_ENDPOINT: 'https://fsn1.your-objectstorage.com', S3_BUCKET: 'example-bucket', S3_ACCESS_KEY_ID: 'AKIDTESTACCESS',
  S3_SECRET_ACCESS_KEY: SECRET, S3_PUBLIC_BASE_URL: 'https://example-bucket.fsn1.your-objectstorage.com/',
};
const config = () => loadS3Config(ENV);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---------- the signer against AWS's published examples ----------

// Expected values below are copied from AWS's documentation, not computed by this code:
//  - IAM example: "Signature Version 4 signing process" / "Create a signed request" (docs.aws.amazon.com/general/latest/gr/),
//    GET https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08 at 20150830T123600Z, key wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY.
//  - S3 examples: "Authenticating Requests: Using the Authorization Header (AWS Signature Version 4)" in the Amazon S3 API
//    reference, bucket examplebucket, us-east-1, 20130524T000000Z, key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY:
//    "Example: GET Object" and "Example: PUT Object" (the key test$file.text exercises path encoding).
test('SigV4 signer reproduces the AWS documentation example (IAM ListUsers)', () => {
  const r = signRequest({
    method: 'GET', url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
    accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'iam', amzDate: '20150830T123600Z',
  });
  assert.equal(r.canonicalRequest, [
    'GET', '/', 'Action=ListUsers&Version=2010-05-08',
    'content-type:application/x-www-form-urlencoded; charset=utf-8', 'host:iam.amazonaws.com', 'x-amz-date:20150830T123600Z', '',
    'content-type;host;x-amz-date', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  ].join('\n'));
  assert.equal(r.stringToSign, ['AWS4-HMAC-SHA256', '20150830T123600Z', '20150830/us-east-1/iam/aws4_request', 'f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59'].join('\n'));
  assert.equal(signingKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20150830', 'us-east-1', 'iam').toString('hex'), 'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9');
  assert.equal(r.signature, '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
  assert.equal(r.headers.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
});

test('SigV4 signer reproduces the Amazon S3 documentation examples (GET Object, PUT Object)', () => {
  const base = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', amzDate: '20130524T000000Z' };
  const get = signRequest({ ...base, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { Range: 'bytes=0-9' } });
  assert.equal(get.signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.match(get.headers.authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, /);

  const body = 'Welcome to Amazon S3.';
  assert.equal(sha(body), '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072');
  const put = signRequest({
    ...base, method: 'PUT', url: 'https://examplebucket.s3.amazonaws.com/test$file.text', payloadHash: sha(body),
    headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
  });
  assert.match(put.canonicalRequest, /^PUT\n\/test%24file\.text\n\n/);
  assert.equal(put.signature, '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd');
});

test('uriEncode follows RFC 3986 as SigV4 needs it', () => {
  assert.equal(uriEncode("a b/c!'()*~._-é"), 'a%20b%2Fc%21%27%28%29%2A~._-%C3%A9');
});

// ---------- configuration ----------

test('S3 settings: defaults, the region from a Hetzner endpoint, and errors that name variables, not values', () => {
  const c = config();
  assert.equal(c.region, 'fsn1');
  assert.equal(c.prefix, 'public/');
  assert.equal(c.publicBaseUrl, 'https://example-bucket.fsn1.your-objectstorage.com');
  assert.equal(c.pathStyle, true);
  assert.equal(loadS3Config({ ...ENV, S3_PREFIX: '/media' }).prefix, 'media/');
  assert.throws(() => loadS3Config({ S3_SECRET_ACCESS_KEY: SECRET }), (e) => {
    assert.match(e.message, /not set: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_PUBLIC_BASE_URL/);
    assert.ok(!e.message.includes(SECRET));
    return true;
  });
  assert.throws(() => loadS3Config({ ...ENV, S3_ENDPOINT: 'http://fsn1.your-objectstorage.com' }), /must use https/);
  assert.throws(() => loadS3Config({ ...ENV, S3_ENDPOINT: 'https://objects.example.com' }), /S3_REGION is not set/);
  assert.throws(() => loadS3Config({ ...ENV, S3_PREFIX: 'a/../b' }), /S3_PREFIX/);
});

// ---------- the client against a fake bucket that checks every signature ----------

function fakeBucket({ publicRead = true, putStatus } = {}) {
  const objects = new Map();
  const calls = [];
  const c = config();
  const fetchImpl = async (url, init = {}) => {
    calls.push({ method: init.method, url });
    const u = new URL(url);
    if (u.host === 'fsn1.your-objectstorage.com') {
      // Check the signature the way S3 would: rebuild it from what was received.
      const h = { ...init.headers, host: u.host };
      const received = h.authorization;
      delete h.authorization;
      const again = signRequest({ method: init.method, url, headers: h, payloadHash: h['x-amz-content-sha256'], accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey, region: c.region, amzDate: h['x-amz-date'] });
      if (again.headers.authorization !== received) return new Response('<Error><Code>SignatureDoesNotMatch</Code><Message>bad</Message></Error>', { status: 403 });
      if (init.body && sha(init.body) !== h['x-amz-content-sha256']) return new Response('<Error><Code>XAmzContentSHA256Mismatch</Code></Error>', { status: 400 });
      const key = decodeURIComponent(u.pathname).replace(`/${c.bucket}/`, '');
      if (init.method === 'PUT') {
        if (putStatus) return new Response(`<Error><Code>AccessDenied</Code><Message>nope ${SECRET}</Message></Error>`, { status: putStatus });
        objects.set(key, { body: init.body, type: h['content-type'] });
        return new Response('', { status: 200, headers: { etag: '"e"' } });
      }
      const o = objects.get(key);
      return o ? new Response(null, { status: 200, headers: { 'content-length': String(o.body.length), 'content-type': o.type } }) : new Response(null, { status: 404 });
    }
    // the public side
    const key = decodeURIComponent(u.pathname).slice(1);
    const o = objects.get(key);
    if (!publicRead || !o) return new Response(null, { status: 403 });
    return new Response(null, { status: 200, headers: { 'content-type': o.type } });
  };
  return { fetchImpl, objects, calls };
}

test('putObject and headObject sign what they send, address path-style, and treat 403 as an error, not as "missing"', async () => {
  const b = fakeBucket();
  const s3 = createS3({ config: config(), fetchImpl: b.fetchImpl, now: () => new Date('2026-11-20T10:00:00Z') });
  assert.equal(s3.objectUrl('public/b/ab12-x y.jpg'), 'https://fsn1.your-objectstorage.com/example-bucket/public/b/ab12-x%20y.jpg');
  assert.deepEqual(await s3.headObject('public/b/ab12.jpg'), { exists: false });
  await s3.putObject('public/b/ab12.jpg', Buffer.from('pixels'), 'image/jpeg');
  const head = await s3.headObject('public/b/ab12.jpg');
  assert.equal(head.exists, true);
  assert.equal(head.size, 6);
  assert.equal(head.contentType, 'image/jpeg');
  assert.equal(b.objects.get('public/b/ab12.jpg').type, 'image/jpeg');

  const wrongSecret = createS3({ config: { ...config(), secretAccessKey: 'a-different-secret' }, fetchImpl: b.fetchImpl });
  await assert.rejects(wrongSecret.headObject('public/b/ab12.jpg'), (e) => e instanceof S3Error && e.status === 403 && /SignatureDoesNotMatch/.test(e.message) && /check the access key/.test(e.message));

  const virtual = createS3({ config: { ...config(), pathStyle: false }, fetchImpl: b.fetchImpl });
  assert.equal(virtual.objectUrl('public/k.png'), 'https://example-bucket.fsn1.your-objectstorage.com/public/k.png');
  assert.equal(publicUrl(config(), 'public/fan/ab-é x.jpg'), 'https://example-bucket.fsn1.your-objectstorage.com/public/fan/ab-%C3%A9%20x.jpg');
});

test('the secret never appears in an error: not from a network failure, not from an S3 error body', async () => {
  const thrower = createS3({ config: config(), fetchImpl: async () => { throw new Error(`socket hang up for ${SECRET} and ${ENV.S3_ACCESS_KEY_ID}`); } });
  await assert.rejects(thrower.putObject('public/k.jpg', Buffer.from('x'), 'image/jpeg'), (e) => e instanceof S3Error && !e.message.includes(SECRET) && !e.message.includes(ENV.S3_ACCESS_KEY_ID) && /\*\*\*/.test(e.message));
  const b = fakeBucket({ putStatus: 403 });
  const s3 = createS3({ config: config(), fetchImpl: b.fetchImpl });
  await assert.rejects(s3.putObject('public/k.jpg', Buffer.from('x'), 'image/jpeg'), (e) => /AccessDenied/.test(e.message) && !e.message.includes(SECRET));
  assert.equal(maskSecrets(`x ${SECRET}`, [SECRET]), 'x ***');
});

// ---------- upload ----------

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-'));
  const media = path.join(root, 'media', 'fan');
  fs.mkdirSync(path.join(media, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(media, 'a.jpg'), 'AAAA-jpeg-bytes');
  fs.writeFileSync(path.join(media, 'sub', 'b one.PNG'), 'BBBB-png-bytes');
  fs.writeFileSync(path.join(media, 'v.mp4'), 'CCCC-video-bytes');
  const batchFile = path.join(root, 'fan.json');
  fs.writeFileSync(batchFile, JSON.stringify({
    name: 'fan', timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/fan',
    posts: [
      { id: 'p1', date: '2026-12-01', caption: 'One', media: ['a.jpg'], skip: ['facebook', 'linkedin'] },
      { id: 'p2', date: '2026-12-02', caption: 'Two', media: ['sub/b one.PNG', 'a.jpg'], skip: ['facebook', 'linkedin'], networks: { instagram: { type: 'carousel' } } },
      { id: 'p3', date: '2026-12-03', caption: 'Three', media: ['v.mp4'], skip: ['facebook', 'linkedin'] },
    ],
  }));
  const batch = loadBatch(batchFile, { root });
  return { root, media, batch, items: (opts = {}) => resolveItems(batch, { channels: { instagram: 'ci' }, mediaBaseUrl: 'https://old.example.com/fan', ...opts }) };
}

test('upload keys are content-addressed, URL-safe and carry the batch name; content types follow the extension', () => {
  const p = project();
  const plan = planUploads({ batch: p.batch, items: p.items(), prefix: 'public/', publicBaseUrl: config().publicBaseUrl });
  assert.deepEqual(plan.map((f) => f.rel), ['a.jpg', 'sub/b one.PNG', 'v.mp4']);
  const a = plan[0];
  assert.equal(a.sha256, sha('AAAA-jpeg-bytes'));
  assert.equal(a.key, `public/fan/${a.sha256.slice(0, 16)}-a.jpg`);
  assert.equal(a.url, `https://example-bucket.fsn1.your-objectstorage.com/public/fan/${a.sha256.slice(0, 16)}-a.jpg`);
  assert.equal(plan[1].key, `public/fan/${sha('BBBB-png-bytes').slice(0, 16)}-b-one.PNG`);
  assert.deepEqual(plan.map((f) => f.contentType), ['image/jpeg', 'image/png', 'video/mp4']);
  assert.equal(safeName('sub/we ird (1)é.jpg'), 'we-ird-1-.jpg');
  assert.equal(objectKey({ prefix: 'x/', batchName: 'n', sha256: 'f'.repeat(64), rel: 'q/r.jpg' }), `x/n/${'f'.repeat(16)}-r.jpg`);
  // --only: just that post's files
  const only = planUploads({ batch: p.batch, items: resolveItems(p.batch, { only: 'p3' }) });
  assert.deepEqual(only.map((f) => f.rel), ['v.mp4']);
});

test('upload is idempotent: a second run finds every object and sends nothing, and the URLs land in the state', async () => {
  const p = project();
  const bucket = fakeBucket();
  const s3 = createS3({ config: config(), fetchImpl: bucket.fetchImpl });
  const state = { batch: 'fan', posts: {} };
  const logs = [];
  const run = () => runUpload({ plan: planUploads({ batch: p.batch, items: p.items(), prefix: 'public/', publicBaseUrl: config().publicBaseUrl }), s3, config: config(), state, saveState() {}, fetchImpl: bucket.fetchImpl, log: (l) => logs.push(l) });
  const first = await run();
  assert.deepEqual([first.uploaded, first.skipped, first.notPublic, first.stopped], [3, 0, 0, null]);
  assert.equal(bucket.calls.filter((c) => c.method === 'PUT').length, 3);
  assert.equal(bucket.objects.size, 3);
  assert.equal(state.media['a.jpg'].url, publicUrl(config(), `public/fan/${sha('AAAA-jpeg-bytes').slice(0, 16)}-a.jpg`));
  assert.equal(state.media['a.jpg'].sha256, sha('AAAA-jpeg-bytes'));
  assert.ok(!JSON.stringify(state).includes(SECRET));

  const second = await run();
  assert.deepEqual([second.uploaded, second.skipped], [0, 3]);
  assert.equal(bucket.calls.filter((c) => c.method === 'PUT').length, 3, 'no new PUT');

  // a changed file gets a new key and a new upload; the old object is left alone
  fs.writeFileSync(path.join(p.media, 'a.jpg'), 'AAAA-changed');
  const third = await run();
  assert.deepEqual([third.uploaded, third.skipped], [1, 2]);
  assert.equal(bucket.objects.size, 4);
  assert.equal(state.media['a.jpg'].sha256, sha('AAAA-changed'));
});

test('an object with the same key but a different size is uploaded again', async () => {
  const p = project();
  const bucket = fakeBucket();
  const s3 = createS3({ config: config(), fetchImpl: bucket.fetchImpl });
  const plan = planUploads({ batch: p.batch, items: resolveItems(p.batch, { only: 'p1' }), prefix: 'public/', publicBaseUrl: config().publicBaseUrl });
  bucket.objects.set(plan[0].key, { body: Buffer.from('trunc'), type: 'image/jpeg' });
  const r = await runUpload({ plan, s3, config: config(), state: { posts: {} }, saveState() {}, fetchImpl: bucket.fetchImpl, log() {} });
  assert.equal(r.uploaded, 1);
  assert.equal(bucket.objects.get(plan[0].key).body.length, 'AAAA-jpeg-bytes'.length);
});

test('nothing outside mediaRoot is ever uploaded: traversal, absolute paths and symlinks are refused before any request', async () => {
  const p = project();
  fs.writeFileSync(path.join(p.root, 'secret.txt'), 'outside');
  fs.symlinkSync(path.join(p.root, 'secret.txt'), path.join(p.media, 'link.jpg'));
  fs.symlinkSync(p.root, path.join(p.media, 'linkdir'));
  const fake = (rel) => [{ media: [{ rel, kind: 'image' }] }];
  for (const rel of ['../../secret.txt', '../../../etc/hosts', '/etc/hosts']) {
    assert.throws(() => planUploads({ batch: p.batch, items: fake(rel) }), (e) => e instanceof UploadError && /outside mediaRoot/.test(e.message), rel);
  }
  assert.throws(() => planUploads({ batch: p.batch, items: fake('link.jpg') }), /resolves outside mediaRoot/);
  assert.throws(() => planUploads({ batch: p.batch, items: fake('linkdir/secret.txt') }), /resolves outside mediaRoot/);
  assert.throws(() => planUploads({ batch: p.batch, items: fake('missing.jpg') }), /file not found/);
  // the batch loader already refuses such names, so a batch file cannot ask for them either
  fs.writeFileSync(path.join(p.root, 'evil.json'), JSON.stringify({ timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'media/fan', posts: [{ id: 'e', date: '2026-12-01', caption: 'c', media: ['../../secret.txt'] }] }));
  assert.throws(() => loadBatch(path.join(p.root, 'evil.json'), { root: p.root }), /stay inside it/);
  // one bad file stops the whole plan, so no partial upload happens
  assert.throws(() => planUploads({ batch: p.batch, items: [...p.items(), ...fake('../../secret.txt')] }), UploadError);
});

test('a bucket that is not publicly readable is reported clearly, with the prefix, and nothing changes the policy', async () => {
  const p = project();
  const bucket = fakeBucket({ publicRead: false });
  const s3 = createS3({ config: config(), fetchImpl: bucket.fetchImpl });
  const logs = [];
  const plan = planUploads({ batch: p.batch, items: resolveItems(p.batch, { only: 'p1' }), prefix: 'public/', publicBaseUrl: config().publicBaseUrl });
  const r = await runUpload({ plan, s3, config: config(), state: { posts: {} }, saveState() {}, fetchImpl: bucket.fetchImpl, log: (l) => logs.push(l) });
  assert.equal(r.uploaded, 1);
  assert.equal(r.notPublic, 1);
  assert.ok(logs.some((l) => /NOT PUBLIC a\.jpg: .*HTTP 403.*The bucket must allow public read on public\//.test(l)));
  assert.ok(bucket.calls.every((c) => ['PUT', 'HEAD'].includes(c.method) && !/\?(policy|acl)/.test(c.url)), 'only PUT and HEAD of objects were used');
});

test('a storage error stops the upload, masks the secret and says that running again is safe', async () => {
  const p = project();
  const bucket = fakeBucket({ putStatus: 403 });
  const s3 = createS3({ config: config(), fetchImpl: bucket.fetchImpl });
  const state = { posts: {} };
  const plan = planUploads({ batch: p.batch, items: p.items(), prefix: 'public/', publicBaseUrl: config().publicBaseUrl });
  const r = await runUpload({ plan, s3, config: config(), state, saveState() {}, fetchImpl: bucket.fetchImpl, log() {} });
  assert.match(r.stopped, /Stopped at a\.jpg: .*AccessDenied.*running upload again is safe/);
  assert.ok(!r.stopped.includes(SECRET));
  assert.equal(bucket.calls.filter((c) => c.method === 'PUT').length, 1, 'stopped at the first failure');
  assert.deepEqual(state.media ?? {}, {});
});

// ---------- push uses the uploaded URLs ----------

test('push sends and probes the uploaded URLs when they exist, and MEDIA_BASE_URL otherwise; the hash is the same either way', async () => {
  const p = project();
  const bucket = fakeBucket();
  const s3 = createS3({ config: config(), fetchImpl: bucket.fetchImpl });
  const before = p.items();
  assert.ok(before.every((i) => i.media.every((m) => m.url.startsWith('https://old.example.com/fan/') && m.hosted === 'base-url')), 'no upload yet: MEDIA_BASE_URL as before');

  const state = { batch: 'fan', posts: {} };
  await runUpload({ plan: planUploads({ batch: p.batch, items: before, prefix: 'public/', publicBaseUrl: config().publicBaseUrl }), s3, config: config(), state, saveState() {}, fetchImpl: bucket.fetchImpl, log() {} });
  const after = p.items({ uploaded: state.media });
  assert.ok(after.every((i) => i.media.every((m) => m.hosted === 'upload' && m.url.startsWith(config().publicBaseUrl))));
  assert.deepEqual(after.map((i) => i.hash), before.map((i) => i.hash), 'uploading must not change the duplicate-protection hash');
  assert.equal(buildInput(after[0], { draft: true }).assets[0].image.url, state.media['a.jpg'].url);

  const server = fakeServer({ api: (n) => ok(`b${n}`), media: (url, init) => bucket.fetchImpl(url, init) });
  const client = createClient({ apiKey: 'k_buffer_key_1234', fetchImpl: server.fetchImpl, sleep: async () => {} });
  const pushState = { batch: 'fan', posts: {} };
  const s = await runPush({ rows: planRows(after, pushState, {}), client, state: pushState, saveState() {}, live: false, fetchImpl: server.fetchImpl, log() {}, now: () => 0 });
  assert.equal(s.created, 3);
  const sentUrls = server.posts().flatMap((c) => (c.body.variables.input.assets ?? []).map((a) => a.image?.url ?? a.video.url));
  assert.ok(sentUrls.length === 4 && sentUrls.every((u) => u.startsWith(config().publicBaseUrl)), 'Buffer was given the bucket URLs');
  const probed = server.calls.filter((c) => c.method === 'HEAD').map((c) => c.url);
  assert.ok(probed.length >= 4 && probed.every((u) => u.startsWith(config().publicBaseUrl)), 'the reachability check used the same URLs');
});

test('an upload goes stale when the file changes: push falls back to MEDIA_BASE_URL and the plan says so', async () => {
  const p = project();
  const bucket = fakeBucket();
  const state = { posts: {} };
  const plan = planUploads({ batch: p.batch, items: p.items(), prefix: 'public/', publicBaseUrl: config().publicBaseUrl });
  await runUpload({ plan, s3: createS3({ config: config(), fetchImpl: bucket.fetchImpl }), config: config(), state, saveState() {}, fetchImpl: bucket.fetchImpl, log() {} });
  fs.writeFileSync(path.join(p.media, 'v.mp4'), 'a different video');
  const items = p.items({ uploaded: state.media });
  const reel = items.find((i) => i.postId === 'p3');
  assert.equal(reel.media[0].hosted, 'base-url');
  assert.ok(reel.media[0].url.startsWith('https://old.example.com/fan/'));
  assert.ok(reel.warnings.some((w) => /v\.mp4 changed since it was uploaded; run upload again/.test(w)));
  assert.equal(items.find((i) => i.postId === 'p1').media[0].hosted, 'upload');
});
