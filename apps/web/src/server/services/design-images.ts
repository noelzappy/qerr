// The pictures a design block names, and how they are checked and found.
//
// A design (or a carousel page) names its picture in `image`. Two kinds are allowed:
//   - a file in the repository's design/assets folder (for example "design/assets/photos/cocoa-pods.jpg");
//   - a vault photo, named by the optional field `vaultItemId` on the design or page. The render copies that photo from the
//     private bucket and uses it instead of `image` (which must still look like an image file name, for the validator).
// A design whose `image` has the file name of exactly one vault photo is treated as using that photo, so its rights are checked.
// Any other path (absolute, outside design/assets, climbing out with "..") is refused: the renderer would read it from disk.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { VaultItem } from '@prisma/client';
import type { Deps } from '../deps.js';
import { pipelineEngine } from '../engine/pipeline.js';
import { assertInside, safeFileName } from './post-model.js';
import { screenFraming } from './screen-framing.js';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// The design, each carousel page and each picture of a post's row of round pictures (`gallery`: { image, vaultItemId?, caption? }), as the
// objects that may hold an `image`. A gallery picture is checked, copied and rights-checked exactly like the post's own picture, on a post
// and on each post page of a carousel alike.
const galleryOf = (o: Json): Json[] => (o.template === 'post' && Array.isArray(o.gallery) ? o.gallery.filter(isObj) : []);
const pagesOf = (o: Json): Json[] => (Array.isArray(o.pages) ? o.pages.filter(isObj) : []);
export function designNodes(design: unknown): Json[] {
  if (!isObj(design)) return [];
  return [design, ...galleryOf(design), ...pagesOf(design).flatMap((p) => [p, ...galleryOf(p)])];
}

// A copy without the app's own `vaultItemId` field (on the design, its pages and the gallery pictures of either), which the engine's
// validators do not know.
export function withoutVaultIds(design: unknown): unknown {
  if (!isObj(design)) return design;
  const strip = (p: unknown) => (isObj(p) ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'vaultItemId')) : p);
  const stripNode = (p: unknown): unknown => {
    if (!isObj(p)) return p;
    const out = strip(p) as Json;
    if (out.template === 'post' && Array.isArray(out.gallery)) out.gallery = out.gallery.map(strip);
    return out;
  };
  const copy = stripNode(design) as Json;
  if (Array.isArray(copy.pages)) copy.pages = copy.pages.map(stripNode);
  return copy;
}

// How a problem names a node: the design, "design page 2" (1-based, as before), "design gallery picture 1" or
// "design page 2 gallery picture 1".
function nodeName(design: unknown, node: Json): string {
  if (node === design || !isObj(design)) return 'design';
  const g = galleryOf(design).indexOf(node);
  if (g >= 0) return `design gallery picture ${g + 1}`;
  const pages = pagesOf(design);
  const p = pages.indexOf(node);
  if (p >= 0) return `design page ${p + 1}`;
  const at = pages.findIndex((page) => galleryOf(page).includes(node));
  return at >= 0 ? `design page ${at + 1} gallery picture ${galleryOf(pages[at]).indexOf(node) + 1}` : 'design';
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
    // A post's brand graphics name files the renderer reads from disk too: the same rule, so a design never reaches a file elsewhere
    // (another brand's vault files, anything on the machine) through `graphics`.
    if (node.template === 'post' && Array.isArray(node.graphics)) {
      node.graphics.forEach((g, i) => {
        if (isObj(g) && typeof g.image === 'string' && !insideAssets(g.image)) problems.push(`${where} graphic ${i + 1}: image "${g.image.slice(0, 80)}" must be a file under design/assets/`);
      });
    }
    // The brand graphics a look places are found in the vault by the app when the images are made (attachGraphics); a design never
    // names their files, so no path from a request reaches the renderer this way.
    if ('graphics' in node) problems.push(`${where}: graphics is filled in from the look's brand graphics when the images are made; leave it out`);
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

// ---- copying vault files next to a run ---------------------------------------------------------------------------------------

const IMAGE_EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

// Copies a vault item's file from the private bucket into <runDir>/in/ (the run's own, git-ignored folder) and returns its path relative to
// the engine root, as a spec names a picture. The name is made from the item's (cleaned); the extension is the item's when the engine knows
// it, else its content type's. `ext` forces one (a graphic is always a .png or .webp).
export async function copyVaultFile(deps: Pick<Deps, 'storage'>, item: VaultItem, runDir: string, n: number, ext?: string): Promise<string> {
  const engine = await pipelineEngine();
  const own = path.extname(item.fileName ?? '').toLowerCase();
  const e = ext ?? (own in engine.imageTypes ? own : (IMAGE_EXT_BY_TYPE[item.contentType ?? ''] ?? '.jpg'));
  const body = await deps.storage.getObject(item.fileKey!);
  await fs.mkdir(path.join(runDir, 'in'), { recursive: true });
  const file = assertInside(runDir, path.join(runDir, 'in', `${n}-${safeFileName(path.basename(item.fileName ?? 'picture', own))}${e}`));
  await fs.writeFile(file, body);
  return path.relative(engine.root, file).split(path.sep).join('/');
}

// ---- brand graphics and cut-outs a look places ---------------------------------------------------------------------------------
//
// A look's `graphic` elements name a vault item by its id. When a post (or a design of a look) is drawn, the app asks the engine which
// composition will draw it (designGraphicNeeds, lookCompositionGraphics), loads the items its graphic elements name, checks each one and
// copies its file next to the run; the spec then carries `graphics: [{ ref, image, tintable }]` with paths the app made. Nothing in a
// request names these files (designProblems refuses a design that sets graphics).

export const GRAPHIC_ROLES = ['cutout', 'graphic'] as const;
const GRAPHIC_EXT: Record<string, string> = { 'image/png': '.png', 'image/webp': '.webp' };

// What one picture needs: its composition (the name is for messages) and the vault ids it places. `page`: null for a post, else the
// carousel page (from 0).
export interface GraphicNeed { page: number | null; kind: string; variant: number; name: string; refs: string[] }
export interface SpecGraphic { ref: string; image: string; tintable: boolean }

// Why a vault item cannot be placed by a design, in words that name the design and the graphic; null when it can. A picture is not held
// to being confirmed to be drawn (as a post's own photo is not); approval checks what goes out.
export function graphicProblem(design: string, ref: string, item: VaultItem | undefined, brandId: string): string | null {
  const d = `The design "${design}"`;
  if (!item || item.brandId !== brandId) return `${d} places a brand graphic that is not in Pictures (id ${ref}). It may have been removed for good: choose another graphic for this design in Settings, Looks`;
  const g = `"${item.title}"`;
  if (item.deletedAt) return `${d} places the brand graphic ${g}, which was deleted from Pictures. Restore it, or choose another graphic for this design in Settings, Looks`;
  if (item.kind !== 'photo' || !(GRAPHIC_ROLES as readonly string[]).includes(item.role)) {
    return `${d} places ${g}, which is no longer a cut-out or graphic (it is now ${item.kind === 'photo' ? 'a photo' : `a ${item.kind} item`}). Mark it as a cut-out or graphic again in Pictures, or choose another graphic for this design in Settings, Looks`;
  }
  if (!item.fileKey) return `${d} places the brand graphic ${g}, which has no file yet. Upload its file in Pictures`;
  if (!GRAPHIC_EXT[item.contentType ?? '']) return `${d} places the brand graphic ${g}, whose file is not a PNG or WebP picture. Upload a PNG or WebP with a transparent background in Pictures`;
  return null;
}

// Loads and checks every item the needs name and copies each usable file once into the run. -> the problems (none when every graphic
// can be placed; nothing is copied otherwise), and per need the graphics list for its spec.
export async function loadGraphics(
  deps: Pick<Deps, 'prisma' | 'storage'>, needs: GraphicNeed[], o: { runDir: string; brandId: string; start?: number },
): Promise<{ problems: string[]; lists: SpecGraphic[][] }> {
  const refs = [...new Set(needs.flatMap((n) => n.refs))];
  if (!refs.length) return { problems: [], lists: needs.map(() => []) };
  // only this brand's items: another brand's is "not in Pictures", like one that does not exist
  const items = await deps.prisma.vaultItem.findMany({ where: { id: { in: refs }, brandId: o.brandId } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const problems: string[] = [];
  for (const need of needs) {
    for (const ref of need.refs) {
      const why = graphicProblem(need.name, ref, byId.get(ref), o.brandId);
      if (why) problems.push(need.page === null ? why : `Page ${need.page + 1}: ${why}`);
    }
  }
  if (problems.length) return { problems, lists: [] };
  const copied = new Map<string, string>();
  let n = o.start ?? 1000;
  for (const ref of refs) {
    const item = byId.get(ref)!;
    copied.set(ref, await copyVaultFile(deps, item, o.runDir, ++n, GRAPHIC_EXT[item.contentType!]));
  }
  return {
    problems: [],
    lists: needs.map((need) => need.refs.map((ref) => {
      const item = byId.get(ref)!;
      return { ref, image: copied.get(ref)!, tintable: item.role === 'graphic' && item.tintable };
    })),
  };
}

// The graphics the brand's active look places on a post design, for the composition the engine will draw it with (the brand pack in
// force), copied into the run and set on the spec (on the post, or on each carousel page that places one). `spec` is the run's private
// copy and is changed in place. -> the problems (nothing is set then).
export async function attachGraphics(deps: Pick<Deps, 'prisma' | 'storage'>, spec: Json, o: { runDir: string; brandId: string }): Promise<string[]> {
  const engine = await pipelineEngine();
  const needs = engine.designGraphicNeeds(withoutVaultIds(spec), { root: engine.root });
  if (!needs.length) return [];
  const { problems, lists } = await loadGraphics(deps, needs, o);
  if (problems.length) return problems;
  const pages = pagesOf(spec);
  needs.forEach((need, i) => {
    const node = need.page === null ? spec : pages[need.page];
    if (node) node.graphics = lists[i];
  });
  return [];
}
