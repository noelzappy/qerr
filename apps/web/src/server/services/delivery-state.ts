// The engine keeps a "state" (what was sent where) in a file. Here it lives in the Delivery table: these functions
// build the engine's state from Delivery rows and write changes back, one row per post and network.
import { Prisma, type Delivery } from '@prisma/client';
import type { Deps } from '../deps.js';
import type { EngineItem, EngineRecord, EngineState } from '../engine/pipeline.js';

export const UNKNOWN_PREFIX = 'unknown, check Buffer';

export type DeliveryWithPostKey = Delivery & { post: { postKey: string } };

// Rows that count as "already sent or maybe sent". A failed row never created anything and a deleted one is gone from
// Buffer, so a later send treats both as not sent.
const LIVE_STATUSES = new Set(['created', 'unknown']);

export function recordOf(d: Delivery): EngineRecord {
  const rec: EngineRecord = {
    account: d.account,
    mode: d.mode as 'draft' | 'live',
    dueAt: d.dueAt.toISOString(),
    hash: d.hash,
    at: d.updatedAt.toISOString(),
    status: d.status as 'created' | 'unknown',
  };
  if (d.bufferId) rec.bufferId = d.bufferId;
  if (Array.isArray(d.previous)) rec.previous = d.previous as EngineRecord['previous'];
  if (d.status === 'unknown' && d.error) rec.error = d.error;
  return rec;
}

export function stateFromDeliveries(batchName: string, deliveries: DeliveryWithPostKey[]): EngineState {
  const state: EngineState = { batch: batchName, posts: {} };
  for (const d of deliveries) {
    if (!LIVE_STATUSES.has(d.status)) continue;
    (state.posts[d.post.postKey] ??= {})[d.network] = recordOf(d);
  }
  return state;
}

export const bufferStatusOf = (rec: EngineRecord): 'draft' | 'scheduled' | 'unknown' => (rec.status === 'unknown' ? 'unknown' : rec.mode === 'live' ? 'scheduled' : 'draft');

// Writes every record that changed since it was last written. The engine calls saveState() synchronously after each
// Buffer answer; save() queues the write and flush() waits for all of them, so an answer is never lost in a long run.
export function createPersister(deps: Pick<Deps, 'prisma'>, ctx: { state: EngineState; postIds: Map<string, string>; items: Map<string, EngineItem> }) {
  const written = new Map<string, string>();
  for (const [postKey, byNetwork] of Object.entries(ctx.state.posts)) for (const [network, rec] of Object.entries(byNetwork)) written.set(`${postKey}|${network}`, JSON.stringify(rec));
  let chain: Promise<void> = Promise.resolve();
  let failure: unknown;

  async function writeChanged(): Promise<void> {
    for (const [postKey, byNetwork] of Object.entries(ctx.state.posts)) {
      for (const [network, rec] of Object.entries(byNetwork)) {
        const key = `${postKey}|${network}`;
        const sig = JSON.stringify(rec);
        if (written.get(key) === sig) continue;
        const postId = ctx.postIds.get(postKey);
        const item = ctx.items.get(key);
        if (!postId) continue;
        const data = {
          account: rec.account ?? item?.account ?? '',
          channelId: item?.channelId ?? '',
          bufferId: rec.bufferId ?? null,
          mode: rec.mode,
          status: rec.status,
          bufferStatus: bufferStatusOf(rec),
          hash: rec.hash,
          dueAt: new Date(rec.dueAt),
          error: rec.status === 'unknown' ? `${UNKNOWN_PREFIX}${rec.error ? ` (${rec.error})` : ''}` : null,
          previous: rec.previous ?? Prisma.DbNull,
          mediaUrls: item ? item.media.map((m) => m.url) : Prisma.DbNull,
          lastCheckedAt: null,
          statusNote: rec.status === 'unknown' ? 'The answer from Buffer was not clear. It may or may not exist there. Look in Buffer, then resolve it here' : null,
        };
        await deps.prisma.delivery.upsert({ where: { postId_network: { postId, network } }, create: { postId, network, ...data }, update: data });
        written.set(key, sig);
      }
    }
  }

  return {
    save(): void {
      chain = chain.then(writeChanged).catch((e) => {
        failure ??= e;
      });
    },
    async flush(): Promise<void> {
      await chain;
      if (failure) throw failure;
    },
  };
}
