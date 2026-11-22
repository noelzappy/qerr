// Typed access to the engine pieces batches, rendering and scheduling use: batch validation, item resolution, the push
// loop, status reconciliation, uploads, the design renderer and Buffer deletes. Loaded once, lazily, because the engine
// is plain .mjs outside this package. Nothing here is re-implemented: these are the engine's own functions.
import { engineImport } from './root.js';

export interface EngineMedia {
  rel: string;
  kind: 'image' | 'video';
  abs: string;
  url: string | null;
  thumbnailOffsetMs?: number;
}

export interface EngineItem {
  postId: string;
  title: string;
  network: string;
  account: string | null;
  channelId: string | null;
  date: string;
  time: string;
  dueAt: string;
  text: string;
  type: string | null;
  media: EngineMedia[];
  hash: string;
  charLimit: number;
  warnings: string[];
}

export interface EngineRow {
  item: EngineItem;
  action: 'create' | 'skip' | 'refuse';
  promote?: boolean;
  note?: string;
  reason?: string;
}

export interface EngineRecord {
  account?: string;
  mode: 'draft' | 'live';
  dueAt: string;
  hash: string;
  at?: string;
  status: 'created' | 'unknown';
  bufferId?: string;
  previous?: Array<{ bufferId: string; mode: string; hash: string; account?: string }>;
  error?: string;
  text?: string;
  resolvedBy?: string;
}

export interface EngineState {
  batch: string;
  posts: Record<string, Record<string, EngineRecord>>;
  media?: Record<string, { url: string; key: string; sha256: string; size: number; contentType: string }>;
}

export interface EngineBatch {
  name: string;
  timezone: string;
  defaultTime: string;
  mediaRootRel: string;
  mediaRoot: string;
  posts: Array<{ id: string; title: string; date: string; time: string; dueAt: string; networks: Record<string, unknown> }>;
}

export interface PushSummary {
  created: number;
  skipped: number;
  refused: number;
  failed: number;
  unknown: number;
  stopped: string | null;
  byAccount: Record<string, Record<string, number>>;
  notAttempted: Array<{ postId: string; network: string; account: string | null }>;
}

interface Gql {
  gql(query: string, variables?: Record<string, unknown>): Promise<any>;
}

export interface UploadPlanEntry {
  rel: string;
  abs: string;
  size: number;
  sha256: string;
  contentType: string;
  key: string;
  url: string | null;
}

export interface RenderResult {
  ok: boolean;
  files: Array<{ size: string; slide: number | null; file: string; abs: string; w: number; h: number }>;
  warnings: string[];
  notes: string[];
  error?: string;
  // a post's own design (design.composition): whether it was drawn (used), or why the look's design drew the post instead (reasons)
  ownDesign?: { asked: boolean; used: boolean; reasons: string[] };
}

// What the AI designer is told about a picture (packages/engine lib/design/picture-probe.mjs): a small thumbnail and its edge colour.
export interface PictureProbe { w: number; h: number; thumb: { mediaType: string; data: string }; edge: { rgb: number[] | null; plain: boolean; auto: boolean; picture: boolean; share: number } }

export interface PipelineEngine {
  root: string;
  validateBatch(raw: unknown, options: { fallbackName?: string; root: string }): { errors: string[]; batch?: EngineBatch };
  resolveItems(batch: EngineBatch, options: Record<string, unknown>): EngineItem[];
  planRows(items: EngineItem[], state: EngineState, options: { live: boolean }): EngineRow[];
  runPush(options: Record<string, unknown>): Promise<PushSummary>;
  runStatus(options: Record<string, unknown>): Promise<{ remote: Array<{ id: string; listedAs: string; dueAt?: string; text?: string }>; rows: unknown[][] }>;
  resolveOrg(client: Gql, configuredId: string): Promise<string>;
  createClient(options: { apiKey: string; fetchImpl?: typeof fetch }): Gql;
  planUploads(options: { batch: EngineBatch; items: EngineItem[]; prefix: string; publicBaseUrl: string }): UploadPlanEntry[];
  runUpload(options: Record<string, unknown>): Promise<{ uploaded: number; skipped: number; notPublic: number; stopped: string | null }>;
  designBlockProblems(design: unknown, options: { root: string; layouts?: unknown[] }): string[];
  renderDesignBlock(options: Record<string, unknown>): Promise<RenderResult>;
  // The brand graphics each picture of a design block places with the brand's active look (the composition the renderer will choose).
  designGraphicNeeds(design: unknown, options: { root: string }): Array<{ page: number | null; kind: string; variant: number; name: string; refs: string[] }>;
  // The device (phone or tablet) each picture of a design block is drawn on with the brand's active look, only the pictures drawn on one.
  designScreenNeeds(design: unknown, options: { root: string }): Array<{ page: number | null; kind: string; variant: number; name: string; device: 'phone' | 'tablet' }>;
  findChrome(): string | null;
  // The thumbnail and edge colour of one picture (a path relative to the root), in one Chrome behind the lock.
  probePicture(options: { root: string; file: string; size?: number }): Promise<PictureProbe>;
  deletePost(client: Gql, bufferId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  isBufferError(e: unknown): e is Error & { ambiguous: boolean; kind?: string };
  isUploadError(e: unknown): e is Error & { errors: string[] };
  zonedToUtcIso(date: string, time: string, timeZone: string): string;
  validTimeZone(tz: unknown): boolean;
  maskSecrets(text: string, secrets?: string[]): string;
  networks: readonly string[];
  classicNetworks: readonly string[];
  imageTypes: Record<string, string>;
  // Whether a picture has an alpha channel (a pre-framed phone capture does), read from its header; null when it cannot tell (GIF).
  hasAlpha(bytes: Buffer): boolean | null;
  // Which kind of screen picture a design block needs: 'phone', 'desktop' or null (the brand's layouts, for template "layout").
  screenDeviceOf(spec: unknown, layouts?: unknown[]): 'phone' | 'desktop' | null;
  // The brand's own layouts (brand.json "layouts" of the pack in force).
  loadLayouts(options: { root: string }): unknown[];
}

// The engine's validateBatch throws (instead of listing an error) for a date such as 2027-13-01, whose month does not
// exist. Those posts are reported here, as the engine words it for other bad dates, and the rest are still validated.
function safeValidateBatch(
  inner: (raw: unknown, options: { fallbackName?: string; root: string }) => { errors: string[]; batch?: EngineBatch },
  raw: unknown,
  options: { fallbackName?: string; root: string },
): { errors: string[]; batch?: EngineBatch } {
  const posts = raw && typeof raw === 'object' && Array.isArray((raw as { posts?: unknown }).posts) ? ((raw as { posts: Array<Record<string, unknown>> }).posts) : null;
  const impossible = (posts ?? []).filter((p) => typeof p?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isNaN(Date.parse(`${p.date}T00:00:00Z`)));
  if (!posts || !impossible.length) return inner(raw, options);
  const pre = impossible.map((p) => `post ${String(p.id ?? '?')}: date "${String(p.date)}" must be a real date like 2026-12-01`);
  const rest = posts.filter((p) => !impossible.includes(p));
  const more = rest.length ? inner({ ...(raw as object), posts: rest }, options).errors : [];
  return { errors: [...pre, ...more] };
}

let cached: Promise<PipelineEngine> | null = null;

export function pipelineEngine(): Promise<PipelineEngine> {
  cached ??= (async () => {
    const [batch, push, client, upload, render, del, chrome, core, networks, assets, layout, probe] = await Promise.all([
      engineImport<any>('batch'),
      engineImport<any>('push'),
      engineImport<any>('client'),
      engineImport<any>('storage/upload'),
      engineImport<any>('design-render'),
      engineImport<any>('buffer-delete'),
      engineImport<any>('design/chrome'),
      engineImport<any>('core'),
      engineImport<any>('networks'),
      engineImport<any>('design/assets'),
      engineImport<any>('design/layout'),
      engineImport<any>('design/picture-probe'),
    ]);
    return {
      root: core.ROOT,
      validateBatch: (raw, options) => safeValidateBatch(batch.validateBatch, raw, options),
      resolveItems: batch.resolveItems,
      planRows: push.planRows,
      runPush: push.runPush,
      runStatus: push.runStatus,
      resolveOrg: push.resolveOrg,
      createClient: client.createClient,
      planUploads: upload.planUploads,
      runUpload: upload.runUpload,
      designBlockProblems: render.designBlockProblems,
      renderDesignBlock: render.renderDesignBlock,
      designGraphicNeeds: render.designGraphicNeeds,
      designScreenNeeds: render.designScreenNeeds,
      findChrome: chrome.findChrome,
      probePicture: probe.probePicture,
      deletePost: del.deletePost,
      isBufferError: (e: unknown): e is Error & { ambiguous: boolean; kind?: string } => e instanceof client.BufferError,
      isUploadError: (e: unknown): e is Error & { errors: string[] } => e instanceof upload.UploadError,
      zonedToUtcIso: core.zonedToUtcIso,
      validTimeZone: core.validTimeZone,
      maskSecrets: core.maskSecrets,
      networks: networks.NETWORKS,
      classicNetworks: networks.CLASSIC_NETWORKS,
      imageTypes: assets.IMAGE_TYPES,
      hasAlpha: assets.hasAlpha,
      screenDeviceOf: layout.screenDeviceOf,
      loadLayouts: layout.loadLayouts,
    } satisfies PipelineEngine;
  })();
  return cached;
}
