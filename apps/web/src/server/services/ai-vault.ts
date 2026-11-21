// The vault as the AI library sees it, and the way back from the pictures it chose to vault photos.
//
// The library knows items as { id, kind, title, body, status, file?, license?, identifiable?, consent?, stale? } and, when
// a post uses a picture, writes the item's `file` into the design's `image`. The app has no file path for a vault photo
// (it lives in the private bucket), so each photo is offered with a made-up path under design/assets/photos named after
// its id. After drafting, every design that carries such a path gets `vaultItemId` instead, which is how the render job
// finds the real file (it copies it from the bucket next to the render).
import type { VaultItem } from '@prisma/client';
import path from 'node:path';
import { rightsProblems, staleInfo } from './vault-rules.js';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const SYNTHETIC = /^design\/assets\/photos\/vault-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:jpe?g|png|webp|gif)$/i;

const extOf = (item: Pick<VaultItem, 'fileName' | 'contentType'>): string => {
  const fromName = path.extname(item.fileName ?? '').toLowerCase();
  if (IMAGE_EXT.has(fromName)) return fromName;
  return ({ 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' } as Record<string, string>)[item.contentType ?? ''] ?? '.jpg';
};

const syntheticPhotoPath = (item: Pick<VaultItem, 'id' | 'fileName' | 'contentType'>): string => `design/assets/photos/vault-${item.id}${extOf(item)}`;

// The AI library's kind names use hyphens; the app's use underscores.
const kindForAi = (kind: string): string => kind.replace(/_/g, '-');
export const kindFromAi = (kind: string): string => kind.replace(/-/g, '_');

export function vaultForAi(item: VaultItem, now: Date): Json {
  const isFile = item.kind === 'photo' || item.kind === 'screen';
  const stale = staleInfo(item, now).stale;
  return {
    id: item.id, kind: kindForAi(item.kind), title: item.title, body: item.body, status: item.status,
    sourceUrl: item.sourceUrl, validUntil: item.validUntil?.toISOString() ?? null, recordedAt: item.recordedAt?.toISOString() ?? null,
    tags: item.tags, ...(stale ? { stale: true } : {}),
    ...(isFile && item.fileKey && !item.deletedAt
      ? { file: syntheticPhotoPath(item), identifiable: item.peoplePresent, consent: item.consentRecorded, ...(rightsProblems(item).length ? { rightsToConfirm: true } : {}) }
      : {}),
  };
}

// Turns the made-up photo paths in a drafted design (and its carousel pages) into `vaultItemId`. Returns the design and
// the ids it uses. Any other picture path is left alone: the app's own design check decides about it.
export function linkVaultPhotos(design: unknown): { design: unknown; photoIds: string[] } {
  const ids = new Set<string>();
  const walk = (node: Json): Json => {
    const out: Json = { ...node };
    const m = typeof out.image === 'string' ? SYNTHETIC.exec(out.image) : null;
    if (m) { out.vaultItemId = m[1]!.toLowerCase(); ids.add(m[1]!.toLowerCase()); }
    if (Array.isArray(out.pages)) out.pages = out.pages.map((p) => (isObj(p) ? walk(p) : p));
    return out;
  };
  return { design: isObj(design) ? walk(design) : design, photoIds: [...ids] };
}
