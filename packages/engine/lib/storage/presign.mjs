// SigV4 query-string presigning (a URL that carries its own signature) for S3-compatible storage, node:crypto only.
// Reuses the signer pieces of s3.mjs. Nothing here sends a request; the URL is for the caller to hand out.
import crypto from 'node:crypto';
import { amzDateOf, signingKey, uriEncode } from './s3.mjs';

const MIN_EXPIRES = 1;
const MAX_EXPIRES = 604800; // 7 days, the SigV4 maximum
const METHODS = ['GET', 'PUT'];

// Same object-URL rule as createS3().objectUrl (kept here because s3.mjs is not edited): path-style by default.
function objectParts(config, key) {
  const endpoint = new URL(config.endpoint);
  const encoded = key.split('/').map(uriEncode).join('/');
  return config.pathStyle
    ? { origin: `${endpoint.protocol}//${endpoint.host}`, host: endpoint.host, path: `/${config.bucket}/${encoded}` }
    : { origin: `${endpoint.protocol}//${config.bucket}.${endpoint.host}`, host: `${config.bucket}.${endpoint.host}`, path: `/${encoded}` };
}

const byKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

// Returns the presigned URL as a string. `config` is what loadS3Config returns. The secret is used for the signature only.
export function presignUrl({ config, key, method = 'GET', expiresSeconds = 300, now = new Date(), responseContentType } = {}) {
  const verb = String(method).toUpperCase();
  if (!METHODS.includes(verb)) throw new Error(`presignUrl: method must be one of ${METHODS.join(', ')}`);
  if (typeof key !== 'string' || !key) throw new Error('presignUrl: key must be a non-empty string');
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < MIN_EXPIRES || expiresSeconds > MAX_EXPIRES) {
    throw new Error(`presignUrl: expiresSeconds must be a whole number from ${MIN_EXPIRES} to ${MAX_EXPIRES}`);
  }
  const amzDate = amzDateOf(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const { origin, host, path } = objectParts(config, key);
  const params = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${config.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (responseContentType) params.push(['response-content-type', responseContentType]);
  const query = params.map(([k, v]) => [uriEncode(k), uriEncode(v)]).sort(byKey).map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalRequest = [verb, path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(config.secretAccessKey, dateStamp, config.region, 's3')).update(stringToSign).digest('hex');
  return `${origin}${path}?${query}&X-Amz-Signature=${signature}`;
}

export const presignGetUrl = ({ config, key, expiresSeconds, now }) => presignUrl({ config, key, method: 'GET', expiresSeconds, now });
