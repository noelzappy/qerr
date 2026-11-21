// Batch loading, validation, per-channel resolution, warnings and Buffer request bodies. No network here.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson, sha256, sha256File, validTimeZone, zonedToUtcIso } from './core.mjs';
import { CLASSIC_NETWORKS, LIMITS, NETWORKS } from './networks.mjs';
import { LEGACY_ACCOUNT, captionLimitFor } from './accounts.mjs';
import { validateBatchDesigns } from './design/batch.mjs';
import { loadSeries } from './design/brand.mjs';

export { NETWORKS, CLASSIC_NETWORKS, LIMITS };
export const DEFAULT_FACEBOOK_TYPE = 'post';
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
export const VIDEO_EXT = ['.mp4', '.mov', '.m4v'];

export const CREATE_POST_QUERY = `mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id text dueAt } }
    ... on MutationError { message }
  }
}`;

export class BatchError extends Error {
  constructor(errors) {
    super(`The batch is not valid:\n  - ${errors.join('\n  - ')}`);
    this.errors = errors;
  }
}

const mediaKind = (file) => {
  const ext = path.extname(file).toLowerCase();
  return IMAGE_EXT.includes(ext) ? 'image' : VIDEO_EXT.includes(ext) ? 'video' : null;
};

export function loadBatch(file, { root = ROOT } = {}) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new BatchError([`file not found: ${file}`]);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new BatchError([`${file} is not valid JSON: ${e.message}`]);
  }
  const { errors, batch } = validateBatch(raw, { fallbackName: path.basename(abs, '.json'), root });
  if (errors.length) throw new BatchError(errors);
  return batch;
}

function normaliseMedia(list, where, errors) {
  if (!Array.isArray(list) || !list.length) {
    errors.push(`${where}: media must be a non-empty list of file names`);
    return [];
  }
  return list.flatMap((m, i) => {
    const rel = typeof m === 'string' ? m : m?.file;
    if (typeof rel !== 'string' || !rel) return errors.push(`${where}: media[${i}] needs a file name`), [];
    if (path.isAbsolute(rel) || rel.split('/').includes('..')) return errors.push(`${where}: "${rel}" must be relative to mediaRoot and stay inside it`), [];
    const kind = mediaKind(rel);
    if (!kind) return errors.push(`${where}: "${rel}" is not a known image (${IMAGE_EXT.join(' ')}) or video (${VIDEO_EXT.join(' ')}) type`), [];
    return [{ rel, kind, thumbnailOffsetMs: typeof m === 'object' ? m.thumbnailOffsetMs : undefined }];
  });
}

export function validateBatch(raw, { fallbackName = 'batch', root = ROOT } = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['the batch must be a JSON object'] };
  const name = String(raw.name || fallbackName).replace(/[^A-Za-z0-9._-]/g, '-');
  if (!validTimeZone(raw.timezone)) errors.push(`timezone "${raw.timezone}" is not a valid IANA time zone (e.g. Europe/London)`);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.defaultTime ?? '')) errors.push(`defaultTime "${raw.defaultTime}" must look like 09:00`);
  if (typeof raw.mediaRoot !== 'string' || !raw.mediaRoot) errors.push('mediaRoot is required (folder with the media, relative to the buffer folder)');
  if (!Array.isArray(raw.posts) || !raw.posts.length) errors.push('posts must be a non-empty list');
  const defaults = raw.defaultNetworks ?? CLASSIC_NETWORKS;
  if (!Array.isArray(defaults) || !defaults.length || defaults.some((n) => !NETWORKS.includes(n))) errors.push(`defaultNetworks must be a non-empty list of ${NETWORKS.join(', ')}`);
  if (errors.length) return { errors };

  const seen = new Set();
  const posts = [];
  raw.posts.forEach((p, idx) => {
    const where = `post ${p?.id ?? `#${idx + 1}`}`;
    if (!p || typeof p !== 'object') return errors.push(`post #${idx + 1} must be an object`);
    if (!/^[A-Za-z0-9._-]+$/.test(p.id ?? '')) errors.push(`${where}: id is required and may only use letters, digits, . _ -`);
    else if (seen.has(p.id)) errors.push(`${where}: duplicate id`);
    seen.add(p.id);

    const date = p.date;
    const time = p.time ?? raw.defaultTime;
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
    if (!dateOk) errors.push(`${where}: date "${date}" must be a real date like 2026-12-01`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push(`${where}: time "${time}" must look like 09:00`);
    if (typeof p.caption !== 'string' || !p.caption.trim()) errors.push(`${where}: caption is required`);

    const skip = p.skip ?? [];
    if (!Array.isArray(skip) || skip.some((s) => !NETWORKS.includes(s))) errors.push(`${where}: skip must be a list of ${NETWORKS.join(', ')}`);
    const overrides = p.networks ?? {};
    for (const k of Object.keys(overrides)) if (!NETWORKS.includes(k)) errors.push(`${where}: unknown network "${k}" (use ${NETWORKS.join(', ')})`);

    // A network is a target when the batch lists it as a default or the post names it under "networks"; skip wins.
    const targets = NETWORKS.filter((n) => !skip.includes(n) && (defaults.includes(n) || n in overrides));
    if (!targets.length) errors.push(`${where}: every network is skipped`);
    const networks = {};
    for (const n of targets) {
      const o = overrides[n] ?? {};
      const mediaList = o.media ?? p.media;
      const nw = `${where} / ${n}`;
      const media = mediaList === undefined ? [] : normaliseMedia(mediaList, nw, errors);
      networks[n] = {
        caption: o.caption ?? p.caption,
        type: o.type, media,
        shouldShareToFeed: o.shouldShareToFeed,
        firstComment: o.firstComment,
      };
    }
    if (dateOk && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      posts.push({ id: p.id, title: p.title ?? p.id, date, time, dueAt: zonedToUtcIso(date, time, raw.timezone), networks });
    }
  });
  errors.push(...validateBatchDesigns(raw.posts, { series: loadSeries({ root }) }));
  if (errors.length) return { errors };
  const mediaRootRel = raw.mediaRoot;
  return { errors, batch: { name, timezone: raw.timezone, defaultTime: raw.defaultTime, mediaRootRel, mediaRoot: path.resolve(root, mediaRootRel), posts } };
}

export const mediaUrl = (rel, base) => `${base ? base.replace(/\/+$/, '') : '<MEDIA_BASE_URL>'}/${rel.split('/').map(encodeURIComponent).join('/')}`;

const hashtagCount = (t) => (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;

function resolveType(network, cfg, media) {
  if (cfg.type) return cfg.type;
  if (network === 'facebook') return DEFAULT_FACEBOOK_TYPE;
  if (network === 'instagram') {
    // Buffer takes an Instagram carousel as type "post" with several images; it rejects "carousel" (checked 2026-11-20).
    if (media[0]?.kind === 'video') return 'reel';
    return 'post';
  }
  return null; // LinkedIn and X have no per-post type
}

function metadataFor(network, type, cfg) {
  const md = {};
  if (network === 'instagram') {
    md.instagram = { type, shouldShareToFeed: cfg.shouldShareToFeed ?? true };
    if (cfg.firstComment) md.instagram.firstComment = cfg.firstComment;
  } else if (network === 'facebook') {
    md.facebook = { type };
    if (cfg.firstComment) md.facebook.firstComment = cfg.firstComment;
  } else if (network === 'linkedin' && cfg.firstComment) md.linkedin = { firstComment: cfg.firstComment };
  return Object.keys(md).length ? md : undefined;
}

function warningsFor(item, schemaCache) {
  const w = [];
  const { network, text, media, type } = item;
  const limit = LIMITS[network];
  const len = [...text].length;
  if (len > item.charLimit) w.push(`caption is ${len} characters, ${network} allows ${item.charLimit}${network === 'x' ? ' (counted in characters; X counts links as 23, so the real count may differ; set captionLimits.x for a paid X tier)' : ''}`);
  if (limit.hashtags && hashtagCount(text) > limit.hashtags) w.push(`${hashtagCount(text)} hashtags, ${network} allows ${limit.hashtags}`);
  const videos = media.filter((m) => m.kind === 'video').length;
  const images = media.length - videos;
  if (network === 'instagram') {
    if (!media.length) w.push('Instagram needs media and this post has none');
    if (media.length > 10) w.push(`${media.length} items, Instagram allows 10 in one post`);
    if (type === 'carousel') w.push('Buffer rejects type "carousel" for Instagram; use "post" with several images');
    if (type === 'reel' && !videos) w.push('reel without a video');
  }
  if (network === 'x' && images > 4) w.push(`${images} images, X allows 4`);
  if (network === 'x' && item.firstComment) w.push('firstComment is not sent to X (no X metadata is known); put it in the caption or drop it');
  if (network === 'linkedin' && videos && images) w.push('LinkedIn does not take video mixed with images');
  if (media.length > 1 && videos && network !== 'instagram') w.push('several items including a video; most networks take one video alone');
  for (const m of media) if (!fs.existsSync(m.abs)) w.push(`local file missing: ${m.rel}`);
  if (network === 'facebook') {
    const known = schemaCache?.types?.PostTypeFacebook?.enumValues?.map((v) => v.name);
    if (!known) w.push(`Facebook type "${type}" is unverified; run check`);
    else if (!known.includes(type)) w.push(`Facebook type "${type}" is not in PostTypeFacebook (${known.join(', ')})`);
  }
  return w;
}

// One item = one post on one channel, with everything push and plan need.
// routing: { network: { account, channelId } } (accounts.json). Without it, channels: { network: channelId } means one account.
// uploaded: { "<rel>": { url, sha256 } } from the state file (the upload command); used while the file is unchanged.
export function resolveItems(batch, { channels = {}, routing, accounts = [], mediaBaseUrl = '', uploaded = {}, only, network: onlyNetwork, schemaCache } = {}) {
  const items = [];
  const hashes = new Map();
  const fileSha = (abs) => {
    if (!hashes.has(abs)) hashes.set(abs, fs.existsSync(abs) ? sha256File(abs) : null);
    return hashes.get(abs);
  };
  for (const post of batch.posts) {
    if (only && post.id !== only) continue;
    for (const [network, cfg] of Object.entries(post.networks)) {
      if (onlyNetwork && network !== onlyNetwork) continue;
      const route = routing ? routing[network] : { account: LEGACY_ACCOUNT, channelId: channels[network] || null };
      const account = accounts.find((a) => a.name === route?.account);
      const staleUploads = [];
      const media = cfg.media.map((m) => {
        const abs = path.join(batch.mediaRoot, m.rel);
        const up = uploaded[m.rel];
        // An upload counts only while the file is the one that was uploaded; otherwise the public copy shows old content.
        const current = up && fileSha(abs) === up.sha256;
        if (up && !current && fs.existsSync(abs)) staleUploads.push(m.rel);
        return { ...m, abs, url: current ? up.url : mediaUrl(m.rel, mediaBaseUrl), hosted: current ? 'upload' : 'base-url' };
      });
      const type = resolveType(network, cfg, media);
      const metadata = metadataFor(network, type, cfg);
      const item = {
        postId: post.id, title: post.title, network, account: route?.account ?? null, channelId: route?.channelId || null,
        date: post.date, time: post.time, dueAt: post.dueAt, text: cfg.caption, type, media, metadata,
        charLimit: captionLimitFor(account, network, LIMITS), firstComment: cfg.firstComment,
      };
      item.hash = contentHash(item);
      item.warnings = warningsFor(item, schemaCache);
      for (const rel of staleUploads) item.warnings.push(`${rel} changed since it was uploaded; run upload again (until then the MEDIA_BASE_URL copy is used)`);
      items.push(item);
    }
  }
  return items;
}

// What the duplicate guard compares: text, media paths, dueAt, plus type and metadata, which change what is published.
export function contentHash({ text, media, dueAt, type, metadata }) {
  return sha256(JSON.stringify([text, media.map((m) => [m.kind, m.rel, m.thumbnailOffsetMs ?? null]), dueAt, type ?? null, metadata ?? null]));
}

export function buildInput(item, { draft }) {
  const assets = item.media.map((m) => (m.kind === 'image'
    ? { image: { url: m.url } }
    : { video: { url: m.url, metadata: { thumbnailOffset: m.thumbnailOffsetMs ?? 0 } } }));
  const input = {
    text: item.text,
    channelId: item.channelId ?? `<CHANNEL_ID:${item.network}>`,
    schedulingType: 'automatic',
    mode: 'customScheduled',
    dueAt: item.dueAt,
  };
  if (assets.length) input.assets = assets;
  if (item.metadata) input.metadata = item.metadata;
  if (draft) input.saveToDraft = true;
  return input;
}

export const buildRequest = (item, { draft }) => ({ query: CREATE_POST_QUERY, variables: { input: buildInput(item, { draft }) } });

export function loadChannels(root = ROOT) {
  return readJson(path.join(root, 'channels.json'), {});
}
