// A small S3 client for S3-compatible storage (Hetzner Object Storage): AWS Signature Version 4 with node:crypto only.
// putObject and headObject, path-style addressing by default. fetch is injectable so tests never touch a network.
import crypto from 'node:crypto';
import { maskSecrets } from '../core.mjs';

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
export const EMPTY_PAYLOAD_SHA256 = sha256Hex('');

// RFC 3986 encoding as SigV4 wants it: only A-Z a-z 0-9 - _ . ~ stay as they are.
export const uriEncode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export const amzDateOf = (date = new Date()) => date.toISOString().replace(/[-:]|\.\d{3}/g, '');

export function signingKey(secretAccessKey, dateStamp, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), 'aws4_request');
}

// S3 encodes each path segment once and never normalises the path; other AWS services encode twice.
function canonicalUri(pathname, service) {
  return pathname.split('/').map((seg) => {
    const once = uriEncode(decodeURIComponent(seg));
    return service === 's3' ? once : uriEncode(once);
  }).join('/') || '/';
}

function canonicalQuery(url) {
  return [...url.searchParams].map(([k, v]) => [uriEncode(k), uriEncode(v)]).sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join('&');
}

// Signs one request. `headers` are the ones to sign besides the ones added here (host, x-amz-date and, for S3,
// x-amz-content-sha256). Returns every header to send (host included, lower case) plus the pieces, for tests.
export function signRequest({
  method, url, headers = {}, payloadHash = EMPTY_PAYLOAD_SHA256, accessKeyId, secretAccessKey, region, service = 's3', amzDate = amzDateOf(),
}) {
  const u = new URL(url);
  const h = {};
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  h.host ??= u.host;
  h['x-amz-date'] ??= amzDate;
  if (service === 's3') h['x-amz-content-sha256'] ??= payloadHash;
  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map((n) => `${n}:${h[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method.toUpperCase(), canonicalUri(u.pathname, service), canonicalQuery(u), canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const dateStamp = h['x-amz-date'].slice(0, 8);
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', h['x-amz-date'], scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(secretAccessKey, dateStamp, region, service)).update(stringToSign).digest('hex');
  h.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers: h, canonicalRequest, stringToSign, signature };
}

export class S3Error extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'S3Error';
    this.status = status;
    this.code = code;
  }
}

const REQUIRED = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'];

// Reads the S3_* settings from an env map. Throws one error that lists every problem, never a value.
export function loadS3Config(env) {
  const get = (k) => String(env[k] ?? '').trim();
  const missing = REQUIRED.filter((k) => !get(k));
  const errors = missing.length ? [`not set: ${missing.join(', ')} (see .env.example)`] : [];
  let endpoint = get('S3_ENDPOINT').replace(/\/+$/, '');
  let region = get('S3_REGION');
  if (endpoint) {
    let u;
    try { u = new URL(endpoint); } catch { u = null; }
    if (!u) errors.push('S3_ENDPOINT is not a URL (expected https://fsn1.your-objectstorage.com)');
    else {
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
      if (u.protocol !== 'https:' && !local) errors.push('S3_ENDPOINT must use https');
      if (u.pathname !== '/' || u.search) errors.push('S3_ENDPOINT must be the host only, without a path (the bucket goes in S3_BUCKET)');
      // Hetzner: the location (fsn1, nbg1, hel1) is the first label of the host and is also the region.
      region ||= u.hostname.endsWith('.your-objectstorage.com') ? u.hostname.split('.')[0] : '';
    }
  }
  if (!region) errors.push('S3_REGION is not set (for Hetzner it is the location: fsn1, nbg1 or hel1)');
  const bucket = get('S3_BUCKET');
  if (bucket && !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) errors.push('S3_BUCKET is not a valid bucket name');
  const publicBase = get('S3_PUBLIC_BASE_URL').replace(/\/+$/, '');
  if (publicBase && !/^https?:\/\//.test(publicBase)) errors.push('S3_PUBLIC_BASE_URL must start with https://');
  let prefix = get('S3_PREFIX') || 'public/';
  prefix = prefix.replace(/^\/+/, '');
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  if (prefix.split('/').some((p) => p === '..' || p === '.')) errors.push('S3_PREFIX must not contain . or .. segments');
  if (errors.length) throw new Error(`The storage settings are not usable:\n  - ${errors.join('\n  - ')}`);
  return {
    endpoint, region, bucket, publicBaseUrl: publicBase, prefix,
    accessKeyId: get('S3_ACCESS_KEY_ID'), secretAccessKey: get('S3_SECRET_ACCESS_KEY'),
    pathStyle: get('S3_PATH_STYLE').toLowerCase() !== 'false',
  };
}

// The public URL of a key: S3_PUBLIC_BASE_URL is the bucket's root URL, so the key (which already holds the prefix) follows it.
export const publicUrl = (config, key) => `${config.publicBaseUrl}/${key.split('/').map(uriEncode).join('/')}`;

export function createS3({ config, fetchImpl = globalThis.fetch, now = () => new Date(), timeoutMs = 120000 }) {
  const mask = (s) => maskSecrets(s, [config.secretAccessKey, config.accessKeyId]);
  const endpoint = new URL(config.endpoint);

  function objectUrl(key) {
    const encoded = key.split('/').map(uriEncode).join('/');
    return config.pathStyle
      ? `${endpoint.protocol}//${endpoint.host}/${config.bucket}/${encoded}`
      : `${endpoint.protocol}//${config.bucket}.${endpoint.host}/${encoded}`;
  }

  async function send(method, key, { body, contentType } = {}) {
    const url = objectUrl(key);
    const payloadHash = body ? sha256Hex(body) : EMPTY_PAYLOAD_SHA256;
    const { headers } = signRequest({
      method, url, headers: contentType ? { 'content-type': contentType } : {}, payloadHash,
      accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey, region: config.region, amzDate: amzDateOf(now()),
    });
    delete headers.host; // fetch sets it from the URL; it was signed above
    try {
      return await fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new S3Error(mask(`${method} ${key} failed before an answer: ${e.message}`));
    }
  }

  async function fail(res, what) {
    const text = await res.text().catch(() => '');
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
    const message = /<Message>([^<]+)<\/Message>/.exec(text)?.[1];
    const hint = res.status === 403 ? ' (check the access key, the secret and the bucket permissions)' : '';
    throw new S3Error(mask(`${what} was refused: HTTP ${res.status}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}${hint}`), { status: res.status, code });
  }

  return {
    objectUrl,
    async putObject(key, body, contentType) {
      const res = await send('PUT', key, { body, contentType });
      if (!res.ok) await fail(res, `Uploading ${key}`);
      return { etag: res.headers.get('etag') };
    },
    // 404 means "not there". Anything else that is not 200 is an error: a 403 must not be read as "missing".
    async headObject(key) {
      const res = await send('HEAD', key);
      if (res.status === 404) return { exists: false };
      if (!res.ok) await fail(res, `Checking ${key}`);
      return { exists: true, size: Number(res.headers.get('content-length')), contentType: res.headers.get('content-type') ?? '', etag: res.headers.get('etag') };
    },
  };
}
