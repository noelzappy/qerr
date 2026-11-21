// The vault: confirmed facts, figures, news, photos and screens the posts are written from. Editors and admins.
//
// Trust rule: only a person signed in can make an item "confirmed" (POST /:id/confirm). No create or update body may
// carry a status, and code that adds items (research, imports) goes through createVaultItemFromSystem, which always
// writes "unconfirmed".
import { revokeApprovalsFor } from '../services/approval-revoke.js';
import { createHash } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, notFound, pageQuery, readQuery, validate } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { LICENCES, publicVaultItem, staleFigureDays, VAULT_KINDS } from '../services/vault.js';
import { staleInfo } from '../services/vault-rules.js';
import { describeError, logger } from '../log.js';
import { privateKey } from '../storage/types.js';
import { framingOfBytes, phoneFramedOf } from '../services/screen-framing.js';
import type { Prisma } from '@prisma/client';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
// Set by the system or by the confirm routes, never by a request body.
const SYSTEM_FIELDS = ['status', 'confirmed', 'confirmedById', 'confirmedAt', 'fileKey', 'fileName', 'contentType', 'size', 'createdById', 'deletedAt', 'id'];

const date = z.union([z.iso.datetime({ offset: true }), z.iso.date()]).nullable();
const httpUrl = z.string().trim().max(2000).refine((v) => /^https?:\/\//i.test(v) && URL.canParse(v), 'Enter a full address starting with http:// or https://');
const tag = z.string().trim().min(1).max(40);

const fields = {
  kind: z.enum(VAULT_KINDS),
  title: z.string().trim().min(1, 'A title is required').max(200),
  body: z.string().max(20_000),
  sourceUrl: httpUrl.nullable(),
  sourceNotes: z.string().max(20_000).nullable(),
  recordedAt: date,
  validFrom: date,
  validUntil: date,
  tags: z.array(tag).max(30).transform((t) => [...new Set(t)]),
  licence: z.enum(LICENCES).nullable(),
  licenceNotes: z.string().max(2000).nullable(),
  peoplePresent: z.boolean(),
  consentRecorded: z.boolean(),
};
const createBody = z.object({ ...fields, body: fields.body.optional() }).partial().required({ kind: true, title: true }).strict();
const updateBody = z.object(fields).partial().strict();

const listQuery = pageQuery.extend({
  kind: z.enum(VAULT_KINDS).optional(),
  status: z.enum(['confirmed', 'unconfirmed']).optional(),
  tag: z.string().trim().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  stale: z.enum(['true', 'false']).optional(),
  // Both picture kinds (photo and screen) at once, for the image library. An explicit kind still narrows it.
  images: z.enum(['true', 'false']).optional(),
  // Adds a short-lived signed address for each item's file, so a grid of pictures needs one request, not one per tile.
  withFileUrls: z.enum(['true', 'false']).optional(),
});

// Fields whose change means the facts are no longer what a person confirmed.
const CONFIRMED_FIELDS = ['kind', 'title', 'body', 'sourceUrl', 'validFrom', 'validUntil', 'recordedAt'] as const;

const toDate = (v: string | null | undefined): Date | null | undefined => (v === undefined ? undefined : v === null ? null : new Date(v));
const same = (a: unknown, b: unknown) => (a instanceof Date || b instanceof Date ? (a as Date | null)?.getTime() === (b as Date | null)?.getTime() : a === b);

async function readVaultBody<T>(c: { req: { json(): Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try { raw = await c.req.json(); } catch { throw new HttpError(400, 'The request body must be JSON'); }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const forbidden = SYSTEM_FIELDS.filter((f) => f in (raw as object));
    if (forbidden.length) throw new HttpError(422, `These fields cannot be set here: ${forbidden.join(', ')}. Confirming an item is done with the confirm button by a signed-in person.`, { fields: forbidden });
  }
  return validate(schema, raw);
}

// Image type from the first bytes, never from the file name or the type the browser claimed.
export function sniffImage(buf: Buffer): { type: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.subarray(0, 6).toString('latin1'))) return { type: 'image/gif', ext: 'gif' };
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  return null;
}

// A stored name: letters, digits, dot, dash and underscore only, with the extension the bytes say.
function safeName(original: string, ext: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
  return `${stem}.${ext}`;
}

export function vaultRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  const live = async (id: string) => {
    const item = await deps.prisma.vaultItem.findUnique({ where: { id } });
    if (!item || item.deletedAt) throw notFound('Vault item not found');
    return item;
  };
  const view = async (item: Parameters<typeof publicVaultItem>[0]) => publicVaultItem(item, deps.now(), await staleFigureDays(deps));

  const FILE_URL_TTL_SECONDS = 300;
  const listView = async (items: Array<Parameters<typeof publicVaultItem>[0]>, withFileUrls: boolean, now: Date, days: number) =>
    Promise.all(items.map(async (i) => {
      const out = publicVaultItem(i, now, days);
      if (!withFileUrls || !i.fileKey) return out;
      let fileUrl: string | null = null;
      try {
        fileUrl = await deps.storage.presignGet(i.fileKey, FILE_URL_TTL_SECONDS);
      } catch (err) {
        // The grid still shows the item with a placeholder, but a signing fault must show in the logs, not only as a grey box.
        logger.warn('media.sign_failed', { itemId: i.id, error: describeError(err) });
      }
      return { ...out, fileUrl };
    }));

  app.get('/', async (c) => {
    const q = readQuery(c, listQuery);
    const withUrls = q.withFileUrls === 'true';
    const where: Prisma.VaultItemWhereInput = { deletedAt: null };
    if (q.kind) where.kind = q.kind;
    else if (q.images === 'true') where.kind = { in: ['photo', 'screen'] };
    if (q.status) where.status = q.status;
    if (q.tag) where.tags = { has: q.tag };
    if (q.q) where.OR = [{ title: { contains: q.q, mode: 'insensitive' } }, { body: { contains: q.q, mode: 'insensitive' } }];
    const days = await staleFigureDays(deps);
    const now = deps.now();
    const orderBy = { updatedAt: 'desc' as const };
    if (q.stale) {
      // Staleness depends on the clock and a setting, so it is decided here; the vault is small.
      const all = await deps.prisma.vaultItem.findMany({ where, orderBy, take: 5000 });
      const wanted = all.filter((i) => staleInfo(i, now, days).stale === (q.stale === 'true'));
      const items = wanted.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
      return c.json({ items: await listView(items, withUrls, now, days), total: wanted.length, page: q.page, pageSize: q.pageSize });
    }
    const [items, total] = await Promise.all([
      deps.prisma.vaultItem.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      deps.prisma.vaultItem.count({ where }),
    ]);
    return c.json({ items: await listView(items, withUrls, now, days), total, page: q.page, pageSize: q.pageSize });
  });

  app.get('/:id', async (c) => c.json({ item: await view(await live(c.req.param('id'))) }));

  app.post('/', async (c) => {
    const actor = c.get('user');
    const b = await readVaultBody(c, createBody);
    const item = await deps.prisma.vaultItem.create({
      data: {
        kind: b.kind!, title: b.title!, body: b.body ?? '', sourceUrl: b.sourceUrl ?? null, sourceNotes: b.sourceNotes ?? null,
        recordedAt: toDate(b.recordedAt) ?? null, validFrom: toDate(b.validFrom) ?? null, validUntil: toDate(b.validUntil) ?? null,
        tags: b.tags ?? [], licence: b.licence ?? null, licenceNotes: b.licenceNotes ?? null,
        peoplePresent: b.peoplePresent ?? false, consentRecorded: b.consentRecorded ?? false,
        status: 'unconfirmed', createdById: actor.id,
      },
    });
    await audit(deps, actor, 'vault.create', 'vault_item', item.id, { kind: item.kind, title: item.title, source: 'person', status: 'unconfirmed' });
    return c.json({ item: await view(item) }, 201);
  });

  app.patch('/:id', async (c) => {
    const actor = c.get('user');
    const existing = await live(c.req.param('id'));
    const b = await readVaultBody(c, updateBody);
    const data: Record<string, unknown> = {};
    const changed: string[] = [];
    for (const [k, v] of Object.entries(b)) {
      if (v === undefined) continue;
      const next = ['recordedAt', 'validFrom', 'validUntil'].includes(k) ? toDate(v as string | null) : v;
      if (k === 'tags' ? JSON.stringify(next) === JSON.stringify(existing.tags) : same((existing as Record<string, unknown>)[k], next)) continue;
      data[k] = next;
      changed.push(k);
    }
    // Why a confirmed item drops back to unconfirmed: a person vouched for the words and figures as they were. If the
    // facts change, that vouching no longer applies, and the item must be confirmed again before posts can rely on it.
    const reset = existing.status === 'confirmed' && changed.some((k) => (CONFIRMED_FIELDS as readonly string[]).includes(k));
    if (reset) Object.assign(data, { status: 'unconfirmed', confirmedById: null, confirmedAt: null });
    const item = changed.length ? await deps.prisma.vaultItem.update({ where: { id: existing.id }, data }) : existing;
    if (changed.length) await revokeApprovalsFor(deps, actor, item.id, 'The vault item was edited');
    if (changed.length) await audit(deps, actor, 'vault.update', 'vault_item', item.id, { title: item.title, changed, ...(reset ? { unconfirmed: true } : {}) });
    return c.json({ item: await view(item) });
  });

  app.delete('/:id', async (c) => {
    const actor = c.get('user');
    const item = await live(c.req.param('id'));
    await deps.prisma.vaultItem.update({ where: { id: item.id }, data: { deletedAt: deps.now() } });
    await revokeApprovalsFor(deps, actor, item.id, 'The vault item was deleted');
    await audit(deps, actor, 'vault.delete', 'vault_item', item.id, { kind: item.kind, title: item.title });
    return c.json({ ok: true });
  });

  app.post('/:id/restore', async (c) => {
    const actor = c.get('user');
    const item = await deps.prisma.vaultItem.findUnique({ where: { id: c.req.param('id') } });
    if (!item) throw notFound('Vault item not found');
    if (!item.deletedAt) return c.json({ item: await view(item) });
    const restored = await deps.prisma.vaultItem.update({ where: { id: item.id }, data: { deletedAt: null } });
    await audit(deps, actor, 'vault.restore', 'vault_item', item.id, { kind: item.kind, title: item.title });
    return c.json({ item: await view(restored) });
  });

  // The one place an item becomes confirmed, and only for the person making this request.
  app.post('/:id/confirm', async (c) => {
    const actor = c.get('user');
    const item = await live(c.req.param('id'));
    const done = await deps.prisma.vaultItem.update({ where: { id: item.id }, data: { status: 'confirmed', confirmedById: actor.id, confirmedAt: deps.now() } });
    await audit(deps, actor, 'vault.confirm', 'vault_item', item.id, { kind: item.kind, title: item.title });
    return c.json({ item: await view(done) });
  });

  app.post('/:id/unconfirm', async (c) => {
    const actor = c.get('user');
    const item = await live(c.req.param('id'));
    const done = await deps.prisma.vaultItem.update({ where: { id: item.id }, data: { status: 'unconfirmed', confirmedById: null, confirmedAt: null } });
    await revokeApprovalsFor(deps, actor, item.id, 'The vault item was unconfirmed');
    await audit(deps, actor, 'vault.unconfirm', 'vault_item', item.id, { kind: item.kind, title: item.title });
    return c.json({ item: await view(done) });
  });

  app.post('/:id/file', async (c) => {
    const actor = c.get('user');
    const item = await live(c.req.param('id'));
    if (item.kind !== 'photo' && item.kind !== 'screen') throw new HttpError(422, 'Only photos and screens can have a file');
    let form: Record<string, unknown>;
    try { form = await c.req.parseBody(); } catch { throw new HttpError(400, 'Send the file as multipart form data in a field named "file"'); }
    const file = form.file;
    if (!(file instanceof File)) throw new HttpError(400, 'Send the file as multipart form data in a field named "file"');
    if (file.size === 0) throw new HttpError(400, 'The file is empty');
    if (file.size > MAX_FILE_BYTES) throw new HttpError(413, 'The file is larger than 15 MB');
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) throw new HttpError(415, 'Only JPG, PNG, WebP and GIF images are accepted');
    const sha = createHash('sha256').update(bytes).digest('hex');
    const name = safeName(file.name, kind.ext);
    // The same bytes under the same name keep the stored key (old-format keys included); anything else gets a fresh unguessable key.
    const leaf = `${sha.slice(0, 16)}-${name}`;
    const key = item.fileKey?.startsWith(`vault/`) && item.fileKey.endsWith(`/${leaf}`) ? item.fileKey : privateKey('vault', item.id, leaf);
    if (key !== item.fileKey) await deps.storage.putObject(key, bytes, kind.type);
    // A new file is new material: a person confirmed the old one, not this.
    const reset = item.status === 'confirmed' && key !== item.fileKey;
    const done = await deps.prisma.vaultItem.update({
      where: { id: item.id },
      data: { fileKey: key, fileName: name, contentType: kind.type, size: bytes.length, phoneFramed: item.kind === 'screen' ? phoneFramedOf(await framingOfBytes(bytes)) : null, ...(reset ? { status: 'unconfirmed', confirmedById: null, confirmedAt: null } : {}) },
    });
    if (item.fileKey && item.fileKey !== key) {
      await deps.storage.deleteObject(item.fileKey).catch((e) => logger.warn('vault.old_file_not_deleted', { itemId: item.id, message: String((e as Error).message).slice(0, 200) }));
    }
    if (key !== item.fileKey) await revokeApprovalsFor(deps, actor, item.id, 'The vault file was replaced');
    await audit(deps, actor, 'vault.file', 'vault_item', item.id, { title: item.title, fileName: name, contentType: kind.type, size: bytes.length, replaced: !!item.fileKey, ...(reset ? { unconfirmed: true } : {}) });
    return c.json({ item: await view(done) });
  });

  app.get('/:id/file-url', async (c) => {
    const item = await live(c.req.param('id'));
    if (!item.fileKey) throw notFound('This item has no file');
    const ttl = 300;
    const url = await deps.storage.presignGet(item.fileKey, ttl);
    return c.json({ url, expiresAt: new Date(deps.now().getTime() + ttl * 1000).toISOString() });
  });

  return app;
}
