// node --test   SigV4 query-string presigning against AWS's published example (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { presignGetUrl, presignUrl } from './lib/storage/presign.mjs';

const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const aws = { endpoint: 'https://s3.amazonaws.com', region: 'us-east-1', bucket: 'examplebucket', accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: SECRET, pathStyle: false };
const NOW = new Date('2013-05-24T00:00:00Z');

// Expected signature copied from AWS's S3 documentation, "Authenticating Requests: Using Query Parameters (AWS Signature
// Version 4)": GET https://examplebucket.s3.amazonaws.com/test.txt, 2013-05-24T00:00:00Z, expires 86400, us-east-1.
test('presigned GET reproduces the AWS documentation example', () => {
  const url = new URL(presignGetUrl({ config: aws, key: 'test.txt', expiresSeconds: 86400, now: NOW }));
  assert.equal(url.origin + url.pathname, 'https://examplebucket.s3.amazonaws.com/test.txt');
  assert.equal(url.searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(url.searchParams.get('X-Amz-Credential'), 'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
  assert.equal(url.searchParams.get('X-Amz-Date'), '20130524T000000Z');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '86400');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
});

test('path-style puts the bucket in the path', () => {
  const cfg = { ...aws, endpoint: 'https://fsn1.your-objectstorage.com', region: 'fsn1', bucket: 'example-bucket', pathStyle: true };
  const url = new URL(presignGetUrl({ config: cfg, key: 'public/a.jpg', now: NOW }));
  assert.equal(url.host, 'fsn1.your-objectstorage.com');
  assert.equal(url.pathname, '/example-bucket/public/a.jpg');
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
});

test('keys with spaces and unicode are encoded once and the signature still depends on them', () => {
  const key = 'public/my file é☃.jpg';
  const href = presignGetUrl({ config: aws, key, now: NOW });
  assert.ok(href.includes('/public/my%20file%20%C3%A9%E2%98%83.jpg?'), href);
  const other = presignGetUrl({ config: aws, key: 'public/my file e.jpg', now: NOW });
  assert.notEqual(new URL(href).searchParams.get('X-Amz-Signature'), new URL(other).searchParams.get('X-Amz-Signature'));
});

test('expiry is checked: 1 to 604800 whole seconds', () => {
  for (const bad of [0, -5, 604801, 1.5, NaN, '60']) {
    assert.throws(() => presignGetUrl({ config: aws, key: 'a', expiresSeconds: bad, now: NOW }), /expiresSeconds/, String(bad));
  }
  assert.equal(new URL(presignGetUrl({ config: aws, key: 'a', expiresSeconds: 1, now: NOW })).searchParams.get('X-Amz-Expires'), '1');
  assert.equal(new URL(presignGetUrl({ config: aws, key: 'a', expiresSeconds: 604800, now: NOW })).searchParams.get('X-Amz-Expires'), '604800');
});

test('PUT presigns differently from GET; other methods and empty keys are refused', () => {
  const get = presignUrl({ config: aws, key: 'a', now: NOW });
  const put = presignUrl({ config: aws, key: 'a', method: 'put', now: NOW });
  assert.notEqual(new URL(get).searchParams.get('X-Amz-Signature'), new URL(put).searchParams.get('X-Amz-Signature'));
  assert.throws(() => presignUrl({ config: aws, key: 'a', method: 'DELETE', now: NOW }), /method/);
  assert.throws(() => presignUrl({ config: aws, key: '', now: NOW }), /key/);
});

test('response-content-type is signed into the query', () => {
  const plain = new URL(presignGetUrl({ config: aws, key: 'a', now: NOW }));
  const typed = new URL(presignUrl({ config: aws, key: 'a', now: NOW, responseContentType: 'image/jpeg' }));
  assert.equal(typed.searchParams.get('response-content-type'), 'image/jpeg');
  assert.notEqual(plain.searchParams.get('X-Amz-Signature'), typed.searchParams.get('X-Amz-Signature'));
});

test('the secret never appears in the URL', () => {
  const href = presignGetUrl({ config: aws, key: 'a', now: NOW });
  for (const s of [SECRET, encodeURIComponent(SECRET), 'wJalrXUtnFEMI']) assert.ok(!href.includes(s));
});
