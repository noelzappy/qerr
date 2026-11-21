// Test helpers for the batch, review and scheduling specs: a fake Buffer (several accounts), seeded accounts and routes,
// and batches whose posts already have images in the (in-memory) private bucket. Nothing here talks to a network.
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { encrypt, last4 } from './crypto.js';
import type { MediaEntry } from './services/post-model.js';
import { privateKey } from './storage/types.js';
import type { TestApp, TestUser } from './testing.js';

// Enough of a JPEG to pass the content check; the seed makes each file different.
export const jpegBytes = (seed = 'a') => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`desk-test-image-${seed}`.padEnd(64, '.'))]);
export const pngBytes = (seed = 'a') => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`png-${seed}`.padEnd(32, '.'))]);

export const KEYS = { A: 'bufkey-AAAA-secret-1111', B: 'bufkey-BBBB-secret-2222' } as const;
export const CHANNELS = { linkedin: 'ch-A-linkedin', x: 'ch-A-x', instagram: 'ch-B-instagram', facebook: 'ch-B-facebook' } as const;

type Failure = 'network' | 'http500' | null;

export interface FakeBufferRequest {
  kind: 'create' | 'delete' | 'lookup' | 'orgs' | 'list' | 'head' | 'other';
  account?: 'A' | 'B';
  authorization?: string;
  input?: Record<string, any>;
  url: string;
}

export interface FakePost {
  id: string;
  text: string;
  dueAt: string;
  status: 'draft' | 'scheduled';
  account: 'A' | 'B';
  channelId: string;
}

export function createFakeBuffer(t: Pick<TestApp, 'storage'>) {
  const requests: FakeBufferRequest[] = [];
  const posts = new Map<string, FakePost>();
  let counter = 0;
  const state = {
    // Decides, per create, whether Buffer answers badly. The post is still created for 'http500' to model "it may exist".
    failCreate: (_req: FakeBufferRequest): Failure => null,
    createsPostOnFailure: false,
    deleteMode: 'ok' as 'ok' | 'void' | 'http500' | 'weird',
    hidden: new Set<string>(),
    mediaPublic: true,
    // When set, a media check throws an error with this message (as a network failure might).
    headError: null as string | null,
  };
  const accountOf = (auth: string | null): 'A' | 'B' | null => (auth === `Bearer ${KEYS.A}` ? 'A' : auth === `Bearer ${KEYS.B}` ? 'B' : null);
  const channelsOf = (a: 'A' | 'B'): string[] => (a === 'A' ? [CHANNELS.linkedin, CHANNELS.x] : [CHANNELS.instagram, CHANNELS.facebook]);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const base = t.storage.publicConfig.publicBaseUrl;
    if (init?.method === 'HEAD' && u.startsWith(`${base}/`)) {
      requests.push({ kind: 'head', url: u });
      if (state.headError) throw new Error(state.headError);
      const key = decodeURIComponent(u.slice(base.length + 1));
      const obj = t.storage.objects.get(key);
      return obj && state.mediaPublic ? new Response(null, { status: 200, headers: { 'content-type': obj.contentType } }) : new Response(null, { status: 404 });
    }
    if (u !== 'https://api.buffer.com') throw new Error(`Unexpected outbound request in a test: ${u}`);
    const headers = new Headers(init?.headers);
    const authorization = headers.get('authorization');
    const account = accountOf(authorization);
    const body = JSON.parse(String(init?.body ?? '{}')) as { query: string; variables?: { input?: Record<string, any> } };
    if (!account) return json({ errors: [{ message: 'Unauthorized' }] }, 401);
    const input = body.variables?.input;

    if (body.query.includes('createPost(')) {
      const req: FakeBufferRequest = { kind: 'create', account, authorization: authorization ?? undefined, input, url: u };
      requests.push(req);
      if (!channelsOf(account).includes(input?.channelId)) return json({ data: { createPost: { __typename: 'MutationError', message: `Channel ${input?.channelId} is not in this account` } } });
      const failure = state.failCreate(req);
      const make = () => {
        const id = `buf_${++counter}`;
        posts.set(id, { id, text: input!.text, dueAt: input!.dueAt, status: input!.saveToDraft ? 'draft' : 'scheduled', account, channelId: input!.channelId });
        return id;
      };
      if (failure === 'network') {
        if (state.createsPostOnFailure) make();
        throw new TypeError('fetch failed');
      }
      if (failure === 'http500') {
        if (state.createsPostOnFailure) make();
        return json({ error: 'upstream' }, 500);
      }
      const id = make();
      return json({ data: { createPost: { __typename: 'PostActionSuccess', post: { id, text: input!.text, dueAt: input!.dueAt } } } });
    }
    if (body.query.includes('deletePost(')) {
      requests.push({ kind: 'delete', account, authorization: authorization ?? undefined, input, url: u });
      if (state.deleteMode === 'http500') return json({ error: 'upstream' }, 500);
      if (state.deleteMode === 'weird') return json({ data: { deletePost: { __typename: 'Something' } } });
      const post = posts.get(input?.id);
      if (state.deleteMode === 'void' || !post || post.account !== account) return json({ data: { deletePost: { __typename: 'VoidMutationError', message: 'Post not found' } } });
      posts.delete(post.id);
      return json({ data: { deletePost: { __typename: 'DeletePostSuccess' } } });
    }
    if (body.query.includes('post(input')) {
      requests.push({ kind: 'lookup', account, authorization: authorization ?? undefined, input: { id: /id: "([^"]+)"/.exec(body.query)?.[1] }, url: u });
      const post = posts.get(/id: "([^"]+)"/.exec(body.query)?.[1] ?? '');
      return json({ data: { post: post && post.account === account ? { id: post.id, channelId: post.channelId } : null } });
    }
    if (body.query.includes('organizations')) {
      requests.push({ kind: 'orgs', account, authorization: authorization ?? undefined, url: u });
      return json({ data: { account: { organizations: [{ id: `org-${account}`, name: `Org ${account}` }] } } });
    }
    if (body.query.includes('posts(input')) {
      requests.push({ kind: 'list', account, authorization: authorization ?? undefined, url: u });
      const status = /status: \[(\w+)\]/.exec(body.query)?.[1];
      const edges = [...posts.values()].filter((p) => p.account === account && p.status === status && !state.hidden.has(p.id)).map((p) => ({ node: { id: p.id, text: p.text, dueAt: p.dueAt } }));
      return json({ data: { posts: { edges } } });
    }
    requests.push({ kind: 'other', account, url: u });
    return json({ errors: [{ message: 'Unknown query' }] });
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    requests,
    posts,
    state,
    creates: () => requests.filter((r) => r.kind === 'create'),
    reset() {
      requests.length = 0;
      posts.clear();
      state.failCreate = () => null;
      state.createsPostOnFailure = false;
      state.deleteMode = 'ok';
      state.hidden.clear();
      state.mediaPublic = true;
      state.headError = null;
      counter = 0;
    },
  };
}
export type FakeBuffer = ReturnType<typeof createFakeBuffer>;

// Two Buffer accounts: A holds linkedin and x, B holds instagram and facebook. Keys are stored encrypted, as the app does.
export async function seedBufferAccounts(t: TestApp) {
  const make = async (name: 'A' | 'B') =>
    t.prisma.bufferAccount.create({ data: { name: `account-${name}`, keyCipher: encrypt(KEYS[name], t.config.keyring), keyVersion: t.config.keyring.currentVersion, keyLast4: last4(KEYS[name]) } });
  const a = await make('A');
  const b = await make('B');
  const route = (network: keyof typeof CHANNELS, accountId: string) => t.prisma.channelRoute.create({ data: { network, accountId, channelId: CHANNELS[network] } });
  await route('linkedin', a.id);
  await route('x', a.id);
  await route('instagram', b.id);
  await route('facebook', b.id);
  return { a, b };
}

export interface SeedPost {
  key: string;
  date?: string;
  time?: string;
  caption?: string;
  networks?: Record<string, unknown>;
  design?: Record<string, unknown>;
  images?: string[];
  status?: 'draft' | 'approved' | 'removed';
  renderStatus?: string;
  sources?: string[];
  warnings?: string[];
}

export async function addImage(t: TestApp, batchId: string, postKey: string, name: string, seed = name): Promise<MediaEntry> {
  const body = jpegBytes(seed);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const key = privateKey('renders', batchId, postKey, `${sha256.slice(0, 16)}-${name}`);
  await t.storage.putObject(key, body, 'image/jpeg');
  return { rel: name, key, sha256, size: body.length, contentType: 'image/jpeg', kind: 'image', source: 'upload' };
}

export async function seedBatch(
  t: TestApp,
  owner: Pick<TestUser, 'id'>,
  options: { name?: string; defaultNetworks?: string[]; status?: string; posts?: SeedPost[]; timezone?: string } = {},
) {
  const batch = await t.prisma.batch.create({
    data: {
      name: options.name ?? `batch-${Math.random().toString(36).slice(2, 8)}`, title: 'Test batch', timezone: options.timezone ?? 'UTC', defaultTime: '09:00',
      defaultNetworks: options.defaultNetworks ?? ['instagram', 'linkedin', 'facebook', 'x'], status: options.status ?? 'draft', ownerId: owner.id,
    },
  });
  const posts = [];
  for (const [i, p] of (options.posts ?? []).entries()) {
    const media = await Promise.all((p.images ?? ['image-1.jpg']).map((n) => addImage(t, batch.id, p.key, n, `${p.key}-${n}`)));
    const approved = p.status === 'approved';
    posts.push(
      await t.prisma.post.create({
        data: {
          batchId: batch.id, postKey: p.key, position: i, title: `Post ${p.key}`, date: p.date ?? '2027-06-01', time: p.time ?? '09:00', caption: p.caption ?? `Caption for ${p.key} #AcmeSavings`,
          networks: (p.networks ?? {}) as Prisma.InputJsonValue, design: p.design ? (p.design as Prisma.InputJsonValue) : undefined,
          media: (p.images?.length === 0 ? [] : media) as unknown as Prisma.InputJsonValue, renderStatus: p.renderStatus ?? (p.design ? 'ok' : 'none'),
          sources: p.sources ?? [], warnings: p.warnings ?? [], status: p.status ?? 'draft',
          approvedById: approved ? owner.id : null, approvedAt: approved ? new Date() : null, removedAt: p.status === 'removed' ? new Date() : null,
        },
      }),
    );
  }
  return { batch, posts };
}
