// Puts the media a batch is about to send into S3-compatible storage under content-addressed keys and records the public
// URLs in state.media, where resolveItems (batch.mjs) picks them up for the push loop.
import fs from 'node:fs';
import path from 'node:path';
import { sha256File } from '../core.mjs';
import { probeMedia } from '../client.mjs';
import { S3Error, publicUrl } from './s3.mjs';

export const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
};
// A single PUT is held in memory so its payload can be hashed for the signature.
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export class UploadError extends Error {
  constructor(errors) {
    super(`Cannot upload:\n  - ${errors.join('\n  - ')}`);
    this.errors = errors;
  }
}

// URL-safe file name for the key; the hash in front keeps different files with the same name apart.
export const safeName = (file) => path.basename(file).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';

export const objectKey = ({ prefix, batchName, sha256, rel }) => `${prefix}${batchName}/${sha256.slice(0, 16)}-${safeName(rel)}`;

const inside = (root, file) => file === root || file.startsWith(root + path.sep);

// What would be uploaded, with every refusal collected first so nothing is sent for a batch that cannot be uploaded whole.
export function planUploads({ batch, items, prefix = 'public/', publicBaseUrl = '' }) {
  const errors = [];
  const files = new Map();
  for (const it of items) for (const m of it.media) files.set(m.rel, m);
  const rootReal = fs.existsSync(batch.mediaRoot) ? fs.realpathSync(batch.mediaRoot) : null;
  const plan = [];
  for (const rel of [...files.keys()].sort()) {
    const lexical = path.resolve(batch.mediaRoot, rel);
    if (path.isAbsolute(rel) || !inside(path.resolve(batch.mediaRoot), lexical)) { errors.push(`${rel}: is outside mediaRoot (${batch.mediaRootRel}); only files inside it are uploaded`); continue; }
    if (!fs.existsSync(lexical)) { errors.push(`${rel}: file not found in ${batch.mediaRootRel}`); continue; }
    const real = fs.realpathSync(lexical); // a symlink must not lead out of mediaRoot
    if (!rootReal || !inside(rootReal, real)) { errors.push(`${rel}: resolves outside mediaRoot (${batch.mediaRootRel}); only files inside it are uploaded`); continue; }
    const stat = fs.statSync(real);
    if (!stat.isFile()) { errors.push(`${rel}: is not a file`); continue; }
    if (stat.size > MAX_UPLOAD_BYTES) { errors.push(`${rel}: is ${(stat.size / 1048576).toFixed(0)} MB; the limit for one upload is ${MAX_UPLOAD_BYTES / 1048576} MB`); continue; }
    const contentType = CONTENT_TYPES[path.extname(rel).toLowerCase()];
    if (!contentType) { errors.push(`${rel}: no content type known for this extension`); continue; }
    const sha256 = sha256File(real);
    const key = objectKey({ prefix, batchName: batch.name, sha256, rel });
    plan.push({ rel, abs: real, size: stat.size, sha256, contentType, key, url: publicBaseUrl ? publicUrl({ publicBaseUrl }, key) : null });
  }
  if (errors.length) throw new UploadError(errors);
  return plan;
}

const baseType = (t) => String(t ?? '').split(';')[0].trim().toLowerCase();

// Uploads what is not there yet. Idempotent: a key is a hash of the content, so an existing key with the same size and
// type is the same file. Stops at the first storage error (rerunning is safe). Never changes the bucket's policy.
export async function runUpload({ plan, s3, config, state, saveState, fetchImpl = globalThis.fetch, log, now = Date.now }) {
  const summary = { uploaded: 0, skipped: 0, notPublic: 0, stopped: null };
  state.media ??= {};
  for (const f of plan) {
    try {
      const head = await s3.headObject(f.key);
      const same = head.exists && head.size === f.size && baseType(head.contentType) === f.contentType;
      if (same) {
        summary.skipped++;
        log(`skip     ${f.rel}: already in the bucket as ${f.key}`);
      } else {
        await s3.putObject(f.key, fs.readFileSync(f.abs), f.contentType);
        summary.uploaded++;
        log(`uploaded ${f.rel} -> ${f.key} (${(f.size / 1048576).toFixed(2)} MB)`);
      }
    } catch (e) {
      if (!(e instanceof S3Error)) throw e;
      summary.stopped = `Stopped at ${f.rel}: ${e.message}. ${summary.uploaded} uploaded before this; uploading again is safe.`;
      break;
    }
    const url = publicUrl(config, f.key);
    state.media[f.rel] = { url, key: f.key, sha256: f.sha256, size: f.size, contentType: f.contentType, uploadedAt: new Date(now()).toISOString() };
    saveState();
    const probe = await probeMedia(url, fetchImpl);
    if (!probe.ok) {
      summary.notPublic++;
      log(`NOT PUBLIC ${f.rel}: ${url} answered "${probe.reason}". The bucket must allow public read on ${config.prefix} (Qerr never changes the bucket's policy).`);
    }
  }
  return summary;
}
