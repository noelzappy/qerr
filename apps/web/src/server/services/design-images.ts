// The pictures a design block names, and how they are checked and found.
//
// A design (or a carousel page) names its picture in `image`. Two kinds are allowed:
//   - a file in the repository's design/assets folder (for example "design/assets/photos/cocoa-pods.jpg");
//   - a vault photo, named by the optional field `vaultItemId` on the design or page. The render copies that photo from the
//     private bucket and uses it instead of `image` (which must still look like an image file name, for the validator).
// A design whose `image` has the file name of exactly one vault photo is treated as using that photo, so its rights are checked.
// Any other path (absolute, outside design/assets, climbing out with "..") is refused: the renderer would read it from disk.
import path from 'node:path';
import type { VaultItem } from '@prisma/client';
import type { Deps } from '../deps.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { screenFraming } from './screen-framing.js';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// The design, each carousel page and each picture of a post's row of round pictures (`gallery`: { image, vaultItemId?, caption? }), as the
// objects that may hold an `image`. A gallery picture is checked, copied and rights-checked exactly like the post's own picture.
const galleryOf = (o: Json): Json[] => (o.template === 'post' && Array.isArray(o.gallery) ? o.gallery.filter(isObj) : []);
export function designNodes(design: unknown): Json[] {
  if (!isObj(design)) return [];
  return [design, ...galleryOf(design), ...(Array.isArray(design.pages) ? design.pages.filter(isObj) : [])];
}

// A copy without the app's own `vaultItemId` field (on the design, its pages and its gallery pictures), which the engine's validators do not know.
export function withoutVaultIds(design: unknown): unknown {
  if (!isObj(design)) return design;
  const strip = (p: unknown) => (isObj(p) ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'vaultItemId')) : p);
  const copy: Json = { ...design };
  delete copy.vaultItemId;
  if (Array.isArray(copy.pages)) copy.pages = copy.pages.map(strip);
  if (copy.template === 'post' && Array.isArray(copy.gallery)) copy.gallery = copy.gallery.map(strip);
  return copy;
}

// How a problem names a node: the design, "design page 2" (1-based, as before) or "design gallery picture 1".
function nodeName(design: unknown, node: Json): string {
  if (node === design || !isObj(design)) return 'design';
  const g = galleryOf(design).indexOf(node);
  if (g >= 0) return `design gallery picture ${g + 1}`;
  return `design page ${(Array.isArray(design.pages) ? design.pages.filter(isObj) : []).indexOf(node) + 1}`;
}

const insideAssets = (file: string): boolean => {
  if (!file || file.includes('\0') || path.isAbsolute(file) || file.includes('\\')) return false;
  const n = path.posix.normalize(file);
  return !n.startsWith('..') && n.startsWith('design/assets/');
};

// A screen picture must be the kind its layout shows: a phone layout (the product template, a brand layout with a phone screen block)
// takes only a pre-framed phone capture, a desktop screen only a plain screenshot. The kind is read from the stored file, as the
// engine tests it. Said before any render, in plain words.
async function screenProblems(deps: Pick<Deps, 'prisma' | 'storage'>, design: unknown): Promise<string[]> {
  const engine = await pipelineEngine();
  const layouts = engine.loadLayouts({ root: engine.root });
  const out: string[] = [];
  for (const { node, item } of await photosOfDesign(deps, design)) {
    if (!item || item.kind !== 'screen') continue;
    const need = engine.screenDeviceOf(node, layouts);
    if (!need) continue;
    const framing = await screenFraming(deps, item);
    if (!framing || framing === need) continue;
    const where = nodeName(design, node);
    out.push(need === 'phone'
      ? `${where}: "${item.title}" is a desktop screenshot, but this layout shows a phone and needs a phone screen (a capture with the phone already drawn around it). Pick a phone screen, or a layout made for a desktop screenshot`
      : `${where}: "${item.title}" is a phone screen, but this layout shows a desktop screenshot. Pick a desktop screenshot, or a layout that shows a phone`);
  }
  return out;
}

// Every problem with a design block a person typed: the engine's validators plus our rule about where pictures may come from.
// With deps it also checks the kind of each screen picture against the layout (screenProblems).
export async function designProblems(design: unknown, deps?: Pick<Deps, 'prisma' | 'storage'>): Promise<string[]> {
  const engine = await pipelineEngine();
  const problems = engine.designBlockProblems(withoutVaultIds(design), { root: engine.root });
  designNodes(design).forEach((node) => {
    const where = nodeName(design, node);
    if ('vaultItemId' in node && (typeof node.vaultItemId !== 'string' || !node.vaultItemId)) problems.push(`${where}: vaultItemId must be the id of a vault photo`);
    if (typeof node.image === 'string' && !node.vaultItemId && !insideAssets(node.image)) {
      problems.push(`${where}: image "${node.image}" must be a file under design/assets/ or a vault photo (set vaultItemId)`);
    }
  });
  if (deps && !problems.length) problems.push(...(await screenProblems(deps, design)));
  return problems;
}

export interface DesignPhoto {
  node: Json;
  // Undefined when vaultItemId names something that is not in the vault.
  item?: VaultItem;
  // The id that was asked for, when it was named.
  vaultItemId?: string;
}

// The vault photos a design uses: by vaultItemId, or by an image file name that exactly one photo has.
export async function photosOfDesign(deps: Pick<Deps, 'prisma'>, design: unknown): Promise<DesignPhoto[]> {
  const out: DesignPhoto[] = [];
  const nodes = designNodes(design);
  const names = nodes.filter((n) => typeof n.image === 'string' && !n.vaultItemId).map((n) => path.posix.basename(n.image as string));
  const ids = nodes.map((n) => n.vaultItemId).filter((v): v is string => typeof v === 'string');
  if (!ids.length && !names.length) return out;
  const items = await deps.prisma.vaultItem.findMany({
    where: { OR: [{ id: { in: ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)) } }, { kind: { in: ['photo', 'screen'] }, fileName: { in: names }, deletedAt: null }] },
  });
  for (const node of nodes) {
    if (typeof node.vaultItemId === 'string') {
      out.push({ node, vaultItemId: node.vaultItemId, item: items.find((i) => i.id === node.vaultItemId) });
    } else if (typeof node.image === 'string') {
      const matches = items.filter((i) => i.fileName === path.posix.basename(node.image as string) && i.deletedAt === null);
      if (matches.length === 1) out.push({ node, item: matches[0] });
    }
  }
  return out;
}
