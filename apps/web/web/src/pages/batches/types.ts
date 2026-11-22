// The shapes the batch, review and schedule endpoints return. Only what the pages read is listed.
export type BatchStatus = 'draft' | 'in_review' | 'scheduled' | 'done';
export type PostStatus = 'draft' | 'approved' | 'removed';
export type RenderStatus = 'none' | 'queued' | 'rendering' | 'ok' | 'failed';

export interface BatchOwner { id: string; name: string; email: string }

export interface BatchView {
  id: string;
  name: string;
  title: string;
  timezone: string;
  defaultTime: string;
  defaultNetworks: string[];
  periodStart: string | null;
  periodEnd: string | null;
  status: BatchStatus;
  aiDrafted?: boolean;
  ownerId: string;
  owner: BatchOwner | null;
  counts: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

// What the drafter reported about an AI-drafted batch (only on the single-batch answer).
export interface AiDraftNotes {
  promptVersion?: string;
  model?: string;
  plan?: string | null;
  requested?: number;
  delivered?: number;
  draftedAt?: string;
  usage?: { calls?: number; inputTokens?: number | null; outputTokens?: number | null; costUsd?: number | null };
  rejected?: Array<{ id: string | null; reasons: string[] }>;
  imageSuggestions?: Array<{ postId: string; suggestion: string }>;
  imageReasons?: Array<{ postId: string; reason: string }>;
  messages?: string[];
}

export interface PostSummary {
  id: string;
  postKey: string;
  position: number;
  title: string;
  date: string;
  time: string;
  caption: string;
  status: PostStatus;
  renderStatus: RenderStatus;
  warningCount: number;
  hasDesign: boolean;
  mediaCount: number;
  thumbnailUrl: string | null;
}

export interface NetworkOverride {
  caption?: string;
  type?: string;
  shouldShareToFeed?: boolean;
  firstComment?: string;
  media?: string[];
}

export interface MediaView {
  rel: string;
  sha256: string;
  size: number;
  contentType: string;
  kind: 'image' | 'video';
  source: 'render' | 'upload';
  renderSize?: string;
  slide?: number | null;
  url: string | null;
}

export type DesignBlock = Record<string, unknown>;

export interface PostView {
  id: string;
  batchId: string;
  postKey: string;
  position: number;
  title: string;
  date: string;
  time: string;
  caption: string;
  // Per-network overrides, plus the networks to leave out under `skip`.
  networks: { skip?: string[] } & Record<string, NetworkOverride | string[] | undefined>;
  design: DesignBlock | null;
  media: MediaView[];
  renderStatus: RenderStatus;
  renderError: string | null;
  sources: string[];
  warnings: string[];
  // the brand's named series the post belongs to, and its number in it
  series?: { id: string; number: number } | null;
  status: PostStatus;
  updatedAt: string;
}

export interface SourceView { id: string; kind: string | null; title: string | null; status: string; deletedAt: string | null }

export interface PostDetail {
  post: PostView;
  blockers: string[];
  warnings: string[];
  sources: SourceView[];
  batch: { id: string; name: string; title: string; timezone: string; status: string; ownerId: string };
  // Whether "Rewrite with AI" can start now, and if not, why.
  rewrite?: { available: boolean; reason: string | null };
}

export interface ApproveAllResult {
  approved: Array<{ id: string; postKey: string }>;
  skipped: Array<{ id: string; postKey: string; reasons: string[] }>;
}

// ---- schedule ----

export interface PlanRow {
  postId: string;
  postKey: string;
  title: string;
  network: string;
  account: string | null;
  channelId: string | null;
  dueAtLocal: string;
  dueAtUtc: string;
  action: 'create' | 'skip' | 'refuse';
  promote: boolean;
  explanation: string | null;
  warnings: string[];
  problems: string[];
  needsDraftFirst: boolean;
  willSend: boolean;
  media: number;
}

export interface Plan {
  batchId: string;
  mode: 'draft' | 'live';
  rows: PlanRow[];
  count: number;
  willSend: number;
  approvedPosts: number;
  notApproved: number;
  token: string;
  allowDirectLive?: boolean;
  // A server that notices approval went stale says so here, and marks the affected rows as not sendable.
  stale?: boolean;
  staleReason?: string | null;
}

export interface DeliveryRow {
  id: string;
  postId: string;
  postKey: string;
  title: string;
  network: string;
  account: string;
  channelId: string;
  bufferId: string | null;
  mode: 'draft' | 'live';
  status: 'created' | 'unknown' | 'failed' | 'deleted';
  bufferStatus: 'draft' | 'scheduled' | 'sent' | 'failed' | 'unknown' | null;
  dueAt: string;
  error: string | null;
  statusNote: string | null;
  lastCheckedAt: string | null;
  updatedAt: string;
}

export interface RunRecord {
  state: 'queued' | 'running' | 'done' | 'refused';
  mode: 'draft' | 'live';
  at: string;
  count?: number;
  willSend?: number;
  message?: string;
  summary?: {
    created: number; skipped: number; refused: number; failed: number; unknown: number;
    stopped: string | null;
    notAttempted: Array<{ postId: string; network: string; account: string | null }>;
  };
  log?: string[];
}

export interface DeliveriesResponse {
  batch: { id: string; name: string; status: string };
  counts: Record<string, number>;
  deliveries: DeliveryRow[];
  lastRun: RunRecord | null;
}
