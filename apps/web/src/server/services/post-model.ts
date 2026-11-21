// How a stored post maps to the engine's batch format, and back. Pure functions, no database and no files.
//
// Post.networks holds the engine's per-network overrides plus the skip list under `skip`:
//   { "skip": ["x"], "linkedin": { "caption": "...", "media": ["<media rel>"] } }
// Post.media holds the files a post owns in the private bucket (rendered by the design engine or uploaded by hand).
import path from 'node:path';
import type { Batch, Post } from '@prisma/client';

export interface MediaEntry {
  // The file name, unique within the post.
  rel: string;
  // Private bucket key: renders/<batchId>/<postKey>/...
  key: string;
  sha256: string;
  // Bytes.
  size: number;
  contentType: string;
  kind: 'image' | 'video';
  source: 'render' | 'upload';
  // For renders: the design size name and, for a carousel, the page index.
  renderSize?: string;
  slide?: number | null;
}

export type NetworkOverride = {
  caption?: string;
  type?: string;
  shouldShareToFeed?: boolean;
  firstComment?: string;
  // File names from Post.media
  media?: string[];
};

export const asMedia = (value: unknown): MediaEntry[] => (Array.isArray(value) ? (value as MediaEntry[]) : []);
const asStringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

export function splitNetworks(value: unknown): { skip: string[]; overrides: Record<string, NetworkOverride> } {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const overrides: Record<string, NetworkOverride> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== 'skip' && v && typeof v === 'object' && !Array.isArray(v)) overrides[k] = v as NetworkOverride;
  }
  return { skip: asStringList(obj.skip), overrides };
}

export const joinNetworks = (skip: string[], overrides: Record<string, NetworkOverride>): Record<string, unknown> => ({ ...(skip.length ? { skip } : {}), ...overrides });

// The networks a post goes to: a default network, or one named under networks, unless skipped. The engine's own rule.
export function targetNetworks(post: Pick<Post, 'networks'>, defaults: string[], all: readonly string[]): string[] {
  const { skip, overrides } = splitNetworks(post.networks);
  return all.filter((n) => !skip.includes(n) && (defaults.includes(n) || n in overrides));
}

const designObject = (design: unknown): Record<string, unknown> | null => (design && typeof design === 'object' && !Array.isArray(design) ? (design as Record<string, unknown>) : null);

// The design size a network gets: networkSizes[network], else the first size of the design (feed by default).
function designSizeFor(design: unknown, network: string): string {
  const d = designObject(design);
  const ns = d?.networkSizes && typeof d.networkSizes === 'object' ? (d.networkSizes as Record<string, string>) : {};
  if (typeof ns[network] === 'string') return ns[network];
  const sizes = Array.isArray(d?.sizes) ? (d!.sizes as string[]) : typeof d?.sizes === 'string' ? d.sizes.split(',').map((s) => s.trim()) : [];
  return sizes[0] ?? 'feed';
}

// The media a post sends to a network, in order: the network's own list when it names one, else the rendered files
// of the size that network uses (carousel pages in order), then files uploaded by hand.
export function mediaFor(post: Pick<Post, 'networks' | 'design' | 'media'>, network: string): MediaEntry[] {
  const media = asMedia(post.media);
  const own = splitNetworks(post.networks).overrides[network]?.media;
  if (own?.length) return own.map((rel) => media.find((m) => m.rel === rel)).filter((m): m is MediaEntry => !!m);
  const size = designSizeFor(post.design, network);
  const rendered = media.filter((m) => m.source === 'render' && m.renderSize === size).sort((a, b) => (a.slide ?? 0) - (b.slide ?? 0));
  const uploaded = media.filter((m) => m.source === 'upload');
  return [...rendered, ...uploaded];
}

// The path the engine sees for a file: the hash in the folder name changes when the picture does, and the engine's
// duplicate guard hashes the path, so a re-rendered image counts as changed content.
export const engineRel = (post: Pick<Post, 'postKey'>, m: MediaEntry): string => `${post.postKey}/${m.sha256.slice(0, 16)}/${m.rel}`;

function rawPostForEngine(post: Post, options: { withDesign: boolean; withMedia: boolean }): Record<string, unknown> {
  const { skip, overrides } = splitNetworks(post.networks);
  const networks: Record<string, Record<string, unknown>> = {};
  for (const [n, o] of Object.entries(overrides)) {
    const { media: _own, ...rest } = o;
    networks[n] = { ...rest };
  }
  return {
    id: post.postKey,
    title: post.title,
    date: post.date,
    time: post.time,
    caption: post.caption,
    ...(skip.length ? { skip } : {}),
    networks,
    ...(options.withDesign && post.design ? { design: post.design } : {}),
  };
}

// An engine batch (the raw JSON the engine validates) for posts, with media taken from what each post owns.
// withDesign keeps `design` blocks (validation of what a person typed); without it the batch is what scheduling sends.
export function rawBatchForEngine(
  batch: Pick<Batch, 'name' | 'timezone' | 'defaultTime' | 'defaultNetworks'>,
  posts: Post[],
  options: { mediaRoot: string; withDesign: boolean; withMedia: boolean; networks: readonly string[] },
): Record<string, unknown> {
  return {
    name: batch.name,
    timezone: batch.timezone,
    defaultTime: batch.defaultTime,
    defaultNetworks: batch.defaultNetworks,
    mediaRoot: options.mediaRoot,
    posts: posts.map((p) => {
      const raw = rawPostForEngine(p, options);
      if (options.withMedia) {
        const nets = raw.networks as Record<string, Record<string, unknown>>;
        for (const n of targetNetworks(p, batch.defaultNetworks, options.networks)) {
          const list = mediaFor(p, n).map((m) => engineRel(p, m));
          if (list.length) nets[n] = { ...(nets[n] ?? {}), media: list };
        }
      }
      return raw;
    }),
  };
}

export const slugify = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{ASCII}]/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'post';

// The engine's post id rule, minus names made only of dots ("." and ".." are path parts, not names).
export const POST_KEY_RE = /^(?!\.+$)[A-Za-z0-9._-]{1,60}$/;

export const safeFileName = (name: string): string => {
  const clean = path.basename(name).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return !clean || /^\.+$/.test(clean) ? 'file' : clean;
};

// Every file the app writes is checked to sit inside the folder it was meant for.
export function assertInside(base: string, target: string): string {
  const root = path.resolve(base);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(root + path.sep)) throw new Error('A file path points outside its folder');
  return resolved;
}

export const MEDIA_TYPES: Record<string, { contentType: string; kind: 'image' | 'video' }> = {
  '.jpg': { contentType: 'image/jpeg', kind: 'image' },
  '.jpeg': { contentType: 'image/jpeg', kind: 'image' },
  '.png': { contentType: 'image/png', kind: 'image' },
  '.gif': { contentType: 'image/gif', kind: 'image' },
  '.webp': { contentType: 'image/webp', kind: 'image' },
  '.mp4': { contentType: 'video/mp4', kind: 'video' },
  '.mov': { contentType: 'video/quicktime', kind: 'video' },
  '.m4v': { contentType: 'video/x-m4v', kind: 'video' },
};

// What the first bytes of an upload say it is. The extension must agree, so a renamed file does not pass.
export function sniffMedia(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 6 && buf.toString('latin1', 0, 4) === 'GIF8' && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) return 'image/gif';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buf.toString('latin1', 8, 12);
    return brand === 'qt  ' ? 'video/quicktime' : brand === 'M4V ' || brand === 'M4VH' || brand === 'M4VP' ? 'video/x-m4v' : 'video/mp4';
  }
  return null;
}
