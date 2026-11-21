// The "design" block of a batch post: which images it needs, what they are called, and the media fields to fill in.
// Pure: reads a parsed batch, returns a plan. Rendering and writing the batch file are done by cli.mjs.
import path from 'node:path';
import { normaliseDesign, outputFiles, pdfFile, slugify, validateDesign } from './spec.mjs';

const NAME_OK = /^[a-z0-9][a-z0-9._-]*$/;
export const stemOf = (post, spec) => spec.name ?? (NAME_OK.test(post.id) ? post.id : slugify(post.id));

// Errors for every design block in a batch (used by the batch validator too).
export function validateBatchDesigns(posts, opts = {}) {
  const errors = [];
  (posts ?? []).forEach((p, i) => {
    if (p?.design === undefined) return;
    const where = `post ${p.id ?? `#${i + 1}`}: design`;
    errors.push(...validateDesign(p.design, where, opts));
    if (p.design?.template === 'pagecover') errors.push(`${where}: pagecover is made with "design page-cover", not inside a batch`);
  });
  return errors;
}

// Returns { jobs, fills, warnings }.
//  job:   { postId, spec, stem, dir, files: [{ size, slide, file }] }
//  fill:  { postId, media?: [file...], networks?: { linkedin: [file...] } }  (only where the batch has no value yet)
export function planBatchDesign(raw, { root, only, outDir } = {}) {
  const jobs = [], fills = [], warnings = [];
  const dir = path.resolve(root, outDir ?? raw.mediaRoot);
  const inside = path.relative(root, path.resolve(root, raw.mediaRoot));
  if (inside.startsWith('..') || path.isAbsolute(inside)) throw new Error(`mediaRoot "${raw.mediaRoot}" must stay inside the repository`);
  for (const p of raw.posts) {
    if (p.design === undefined || (only && p.id !== only)) continue;
    const spec = normaliseDesign(p.design);
    const stem = stemOf(p, spec);
    const files = outputFiles(spec, { stem });
    jobs.push({ postId: p.id, spec, stem, dir, files, pdf: spec.template === 'carousel' ? pdfFile(stem) : undefined });
    const primary = files.filter((f) => f.size === spec.sizes[0]).map((f) => f.file);
    const fill = { postId: p.id };
    if (p.media === undefined) fill.media = primary;
    else if (!primary.some((f) => (Array.isArray(p.media) ? p.media : []).some((m) => (typeof m === 'string' ? m : m?.file) === f))) {
      warnings.push(`post ${p.id}: media is set by hand and does not list the image rendered for it (${primary[0]}); the batch is left as it is`);
    }
    for (const [net, size] of Object.entries(spec.networkSizes ?? {})) {
      if (p.networks?.[net]?.media === undefined) (fill.networks ??= {})[net] = files.filter((f) => f.size === size).map((f) => f.file);
    }
    if (fill.media || fill.networks) fills.push(fill);
  }
  return { jobs, fills, warnings };
}

// A copy of the raw batch with media filled in. Never touches a media field that already has a value.
export function applyFills(raw, fills) {
  const byId = new Map(fills.map((f) => [f.postId, f]));
  const posts = raw.posts.map((p) => {
    const f = byId.get(p.id);
    if (!f) return p;
    const next = {};
    for (const [k, v] of Object.entries(p)) {
      next[k] = v;
      if (k === 'caption' && f.media && p.media === undefined) next.media = f.media;
    }
    if (f.media && next.media === undefined) next.media = f.media;
    if (f.networks) {
      next.networks = { ...(p.networks ?? {}) };
      for (const [n, list] of Object.entries(f.networks)) {
        if (next.networks[n]?.media === undefined) next.networks[n] = { ...(next.networks[n] ?? {}), media: list };
      }
    }
    return next;
  });
  return { ...raw, posts };
}
