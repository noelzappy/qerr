import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createVaultItemFromSystem } from './services/vault.js';
import { rightsProblems, sourceProblems, staleInfo } from './services/vault-rules.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => t.close());
beforeEach(() => t.reset());

const ID = '00000000-0000-0000-0000-000000000000';
const DAY = 24 * 60 * 60 * 1000;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(32)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);

const upload = (bytes: Buffer, name: string, type = 'image/png') => {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return form;
};

async function users() {
  const admin = await t.createUser('admin');
  const editor = await t.createUser('editor');
  return { admin, editor, adminApi: t.api(await t.signIn(admin)), editorApi: t.api(await t.signIn(editor)) };
}
const fact = (extra: Record<string, unknown> = {}) => ({ kind: 'fact', title: 'Collectors are licensed', body: 'GCSCA licences collectors.', ...extra });

describe('vault: access', () => {
  const ROUTES: Array<[string, string, unknown?]> = [
    ['GET', '/api/vault'], ['POST', '/api/vault', fact()], ['GET', `/api/vault/${ID}`], ['PATCH', `/api/vault/${ID}`, { title: 'x' }],
    ['DELETE', `/api/vault/${ID}`], ['POST', `/api/vault/${ID}/restore`], ['POST', `/api/vault/${ID}/confirm`], ['POST', `/api/vault/${ID}/unconfirm`],
    ['POST', `/api/vault/${ID}/file`], ['GET', `/api/vault/${ID}/file-url`],
  ];
  it.each(ROUTES)('%s %s needs a session', async (method, url, body) => {
    const m = method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
    const a = t.api();
    const res = m === 'get' || m === 'delete' ? await a[m](url) : await a[m](url, body);
    expect(res.status).toBe(401);
    expect(await t.prisma.vaultItem.count()).toBe(0);
  });

  it('is open to editors and admins alike', async () => {
    const { editorApi, adminApi } = await users();
    expect((await editorApi.post('/api/vault', fact())).status).toBe(201);
    expect((await adminApi.get('/api/vault')).body.total).toBe(1);
  });
});

describe('vault: trust rule', () => {
  it('creates items unconfirmed and rejects any attempt to set status or confirmation fields', async () => {
    const { editorApi } = await users();
    const ok = await editorApi.post('/api/vault', fact());
    expect(ok.body.item).toMatchObject({ status: 'unconfirmed', confirmedById: null });
    for (const bad of [{ status: 'confirmed' }, { confirmedById: 'x' }, { confirmedAt: new Date().toISOString() }, { confirmed: true }, { fileKey: 'vault/x/y' }]) {
      expect((await editorApi.post('/api/vault', fact(bad))).status).toBe(422);
      expect((await editorApi.patch(`/api/vault/${ok.body.item.id}`, bad)).status).toBe(422);
    }
    expect(await t.prisma.vaultItem.count({ where: { status: 'confirmed' } })).toBe(0);
    expect((await editorApi.post('/api/vault', fact({ surprise: 1 }))).status).toBe(400);
  });

  it('is confirmed only through the confirm route by the signed-in person, and can be unconfirmed', async () => {
    const { editor, editorApi } = await users();
    const id = (await editorApi.post('/api/vault', fact())).body.item.id;
    const confirmed = await editorApi.post(`/api/vault/${id}/confirm`);
    expect(confirmed.body.item).toMatchObject({ status: 'confirmed', confirmedById: editor.id });
    expect(confirmed.body.item.confirmedAt).toBeTruthy();
    const back = await editorApi.post(`/api/vault/${id}/unconfirm`);
    expect(back.body.item).toMatchObject({ status: 'unconfirmed', confirmedById: null, confirmedAt: null });
  });

  it('createVaultItemFromSystem always writes unconfirmed', async () => {
    const item = await createVaultItemFromSystem(t.deps, { kind: 'news', title: 'Found by AI', body: 'x', sourceUrl: 'https://example.com/a' });
    expect(item).toMatchObject({ status: 'unconfirmed', confirmedById: null, confirmedAt: null, createdById: null });
    const forced = await createVaultItemFromSystem(t.deps, { kind: 'news', title: 'Sneaky', status: 'confirmed', confirmedById: 'x' } as never);
    expect(forced.status).toBe('unconfirmed');
    expect(forced.confirmedById).toBeNull();
  });

  it('editing the facts of a confirmed item sends it back to unconfirmed; notes and tags do not', async () => {
    const { editorApi } = await users();
    const id = (await editorApi.post('/api/vault', fact({ kind: 'figure', title: 'Users', body: '12,000 users' }))).body.item.id;
    await editorApi.post(`/api/vault/${id}/confirm`);
    expect((await editorApi.patch(`/api/vault/${id}`, { body: '12,000 users', tags: ['kpi'], sourceNotes: 'from the dashboard' })).body.item.status).toBe('confirmed');
    const edited = await editorApi.patch(`/api/vault/${id}`, { body: '15,000 users' });
    expect(edited.body.item).toMatchObject({ status: 'unconfirmed', confirmedById: null, confirmedAt: null, body: '15,000 users' });
    const audit = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'vault.update' }, orderBy: { at: 'desc' } });
    expect(audit.detail).toMatchObject({ unconfirmed: true, changed: ['body'] });
  });
});

describe('vault: crud and filters', () => {
  it('lists with filters, soft deletes, restores and audits', async () => {
    const { editorApi } = await users();
    const a = (await editorApi.post('/api/vault', fact({ title: 'Alpha rate', tags: ['pricing'] }))).body.item;
    await editorApi.post('/api/vault', { kind: 'news', title: 'Beta launch', body: 'rate cut', tags: ['news'] });
    await editorApi.post(`/api/vault/${a.id}/confirm`);
    expect((await editorApi.get('/api/vault?kind=fact')).body.items.map((i: any) => i.title)).toEqual(['Alpha rate']);
    expect((await editorApi.get('/api/vault?status=confirmed')).body.total).toBe(1);
    expect((await editorApi.get('/api/vault?tag=news')).body.items[0].title).toBe('Beta launch');
    expect((await editorApi.get('/api/vault?q=RATE')).body.total).toBe(2);
    expect((await editorApi.get('/api/vault?q=launch')).body.total).toBe(1);

    expect((await editorApi.delete(`/api/vault/${a.id}`)).status).toBe(200);
    expect((await editorApi.get(`/api/vault/${a.id}`)).status).toBe(404);
    expect((await editorApi.get('/api/vault')).body.total).toBe(1);
    expect((await editorApi.post(`/api/vault/${a.id}/restore`)).body.item.title).toBe('Alpha rate');
    expect((await editorApi.get('/api/vault')).body.total).toBe(2);
    expect((await t.prisma.auditLog.findMany({ orderBy: { at: 'asc' } })).map((r) => r.action)).toEqual(
      ['vault.create', 'vault.create', 'vault.confirm', 'vault.delete', 'vault.restore']);
  });

  it('validates bodies', async () => {
    const { editorApi } = await users();
    expect((await editorApi.post('/api/vault', { kind: 'fact' })).status).toBe(400);
    expect((await editorApi.post('/api/vault', fact({ kind: 'rumour' }))).status).toBe(400);
    expect((await editorApi.post('/api/vault', fact({ sourceUrl: 'javascript:alert(1)' }))).status).toBe(400);
    expect((await editorApi.post('/api/vault', fact({ licence: 'stolen' }))).status).toBe(400);
    expect((await editorApi.post('/api/vault', fact({ validUntil: 'next week' }))).status).toBe(400);
    expect((await editorApi.get('/api/vault?kind=rumour')).status).toBe(400);
  });
});

describe('vault: stale figures', () => {
  it('flags figures past validUntil, or older than staleFigureDays, on read and in the stale filter', async () => {
    const { editorApi } = await users();
    const now = new Date('2026-11-20T10:00:00Z');
    t.setNow(now);
    const iso = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
    const expired = (await editorApi.post('/api/vault', { kind: 'figure', title: 'Expired', validUntil: iso(-1) })).body.item;
    const old = (await editorApi.post('/api/vault', { kind: 'figure', title: 'Old', validFrom: iso(-400) })).body.item;
    const recorded = (await editorApi.post('/api/vault', { kind: 'figure', title: 'Recorded', recordedAt: iso(-100) })).body.item;
    const factOld = (await editorApi.post('/api/vault', { kind: 'fact', title: 'Old fact', recordedAt: iso(-900) })).body.item;
    const factExpired = (await editorApi.post('/api/vault', { kind: 'event', title: 'Past event', validUntil: iso(-3) })).body.item;
    expect(expired).toMatchObject({ stale: true });
    expect(expired.staleReason).toContain('valid until 2026-11-19');
    expect(old.stale).toBe(true);
    expect(old.staleReason).toContain('365 days');
    expect(recorded.stale).toBe(false);
    expect(factOld.stale).toBe(false);
    expect(factExpired.stale).toBe(true);
    expect((await editorApi.get('/api/vault?stale=true')).body.items.map((i: any) => i.title).sort()).toEqual(['Expired', 'Old', 'Past event']);
    expect((await editorApi.get('/api/vault?stale=false')).body.total).toBe(2);

    await t.prisma.appSetting.create({ data: { key: 'staleFigureDays', value: 60 } });
    expect((await editorApi.get(`/api/vault/${recorded.id}`)).body.item.stale).toBe(true);
    expect(staleInfo({ kind: 'figure', status: 'confirmed', recordedAt: new Date(now.getTime() - 10 * DAY) }, now, 60).stale).toBe(false);
  });
});

describe('vault: files', () => {
  async function photo() {
    const u = await users();
    const item = (await u.editorApi.post('/api/vault', { kind: 'photo', title: 'Team at Osu' })).body.item;
    return { ...u, item };
  }

  it('adds a signed fileUrl to listed items only when asked, never a fileKey property, and null when signing fails', async () => {
    const { editorApi, item } = await photo();
    await editorApi.post(`/api/vault/${item.id}/file`, upload(PNG, 'team.png'));
    const noFile = (await editorApi.post('/api/vault', { kind: 'photo', title: 'No file yet' })).body.item;
    const row = await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: item.id } });

    const plain = await editorApi.get('/api/vault?kind=photo');
    expect(plain.body.items.every((i: Record<string, unknown>) => !('fileUrl' in i))).toBe(true);

    const withUrls = await editorApi.get('/api/vault?kind=photo&withFileUrls=true&pageSize=100');
    expect(withUrls.status).toBe(200);
    const byId = new Map<string, Record<string, unknown>>(withUrls.body.items.map((i: Record<string, unknown>) => [i.id as string, i]));
    expect(byId.get(item.id)!.fileUrl).toBe(await t.storage.presignGet(row.fileKey!, 300));
    expect('fileUrl' in byId.get(noFile.id)!).toBe(false);
    expect(withUrls.body.items.every((i: Record<string, unknown>) => !('fileKey' in i))).toBe(true);

    const original = t.storage.presignGet;
    t.storage.presignGet = async () => { throw new Error('signing is down'); };
    try {
      const broken = await editorApi.get('/api/vault?kind=photo&withFileUrls=true');
      expect(broken.status).toBe(200);
      expect(broken.body.items.find((i: Record<string, unknown>) => i.id === item.id).fileUrl).toBeNull();
    } finally {
      t.storage.presignGet = original;
    }
  });

  it('lists both picture kinds with images=true, and an explicit kind still narrows it', async () => {
    const { editorApi } = await photo();
    await editorApi.post('/api/vault', { kind: 'screen', title: 'Phone screen' });
    await editorApi.post('/api/vault', fact());
    const both = await editorApi.get('/api/vault?images=true');
    expect(both.body.items.map((i: { kind: string }) => i.kind).sort()).toEqual(['photo', 'screen']);
    expect(both.body.total).toBe(2);
    const onlyScreens = await editorApi.get('/api/vault?images=true&kind=screen');
    expect(onlyScreens.body.items.map((i: { kind: string }) => i.kind)).toEqual(['screen']);
    expect((await editorApi.get('/api/vault')).body.total).toBe(3);
  });

  it('stores a sniffed image under vault/<random>/<id>/<sha16>-<name>, returns a presigned URL and replaces the old object', async () => {
    const { editorApi, item } = await photo();
    // The name says .exe and the browser says text; the bytes say PNG.
    const first = await editorApi.post(`/api/vault/${item.id}/file`, upload(PNG, '../../My Team Photo.exe', 'text/plain'));
    expect(first.status).toBe(200);
    expect(first.body.item).toMatchObject({ hasFile: true, contentType: 'image/png', size: PNG.length, fileName: 'My_Team_Photo.png' });
    expect(first.body.item.fileKey).toBeUndefined();
    const row = await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row.fileKey).toMatch(new RegExp(`^vault/[A-Za-z0-9_-]{43}/${item.id}/[0-9a-f]{16}-My_Team_Photo\\.png$`));
    expect(t.storage.objects.has(row.fileKey!)).toBe(true);

    const url = await editorApi.get(`/api/vault/${item.id}/file-url`);
    expect(url.status).toBe(200);
    expect(url.body.url).toBe(await t.storage.presignGet(row.fileKey!, 300));
    expect(new Date(url.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 290_000);

    const second = await editorApi.post(`/api/vault/${item.id}/file`, upload(JPG, 'new.jpg', 'image/jpeg'));
    expect(second.body.item.contentType).toBe('image/jpeg');
    const after = await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(t.storage.objects.has(row.fileKey!)).toBe(false);
    expect(t.storage.objects.has(after.fileKey!)).toBe(true);
    expect([...t.storage.objects.keys()]).toHaveLength(1);
    expect((await t.prisma.auditLog.findMany()).filter((a) => a.action === 'vault.file')).toHaveLength(2);
  });

  it('gives every stored file its own unguessable segment and keeps the key for identical bytes', async () => {
    const { editorApi, item } = await photo();
    const other = (await editorApi.post('/api/vault', { kind: 'photo', title: 'Other' })).body.item;
    const keyOf = async (id: string) => (await t.prisma.vaultItem.findUniqueOrThrow({ where: { id } })).fileKey!;
    await editorApi.post(`/api/vault/${item.id}/file`, upload(PNG, 'a.png'));
    const first = await keyOf(item.id);
    await editorApi.post(`/api/vault/${item.id}/file`, upload(JPG, 'a.png'));
    const second = await keyOf(item.id);
    await editorApi.post(`/api/vault/${other.id}/file`, upload(PNG, 'a.png'));
    const third = await keyOf(other.id);
    const segment = (k: string) => k.split('/')[1];
    for (const k of [first, second, third]) expect(segment(k)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set([segment(first), segment(second), segment(third)]).size).toBe(3);
    // The same bytes under the same name are not a new file: the key, the confirmation and the approvals stay.
    await editorApi.post(`/api/vault/${other.id}/file`, upload(PNG, 'a.png'));
    expect(await keyOf(other.id)).toBe(third);
  });

  it('still reads and keeps a file stored under an old-format key', async () => {
    const { editorApi, item } = await photo();
    const oldKey = `vault/${item.id}/0123456789abcdef-old.png`;
    await t.storage.putObject(oldKey, PNG, 'image/png');
    await t.prisma.vaultItem.update({ where: { id: item.id }, data: { fileKey: oldKey, fileName: 'old.png', contentType: 'image/png', size: PNG.length } });
    expect((await editorApi.get(`/api/vault/${item.id}/file-url`)).body.url).toBe(await t.storage.presignGet(oldKey, 300));
    // A different file replaces it and the old object is removed.
    await editorApi.post(`/api/vault/${item.id}/file`, upload(JPG, 'new.jpg', 'image/jpeg'));
    expect(t.storage.objects.has(oldKey)).toBe(false);
    expect((await t.prisma.vaultItem.findUniqueOrThrow({ where: { id: item.id } })).fileKey).toMatch(/^vault\/[A-Za-z0-9_-]{43}\//);
  });

  it('accepts webp and gif, and refuses other bytes, empty files, oversize files and non-image items', async () => {
    const { editorApi, item } = await photo();
    expect((await editorApi.post(`/api/vault/${item.id}/file`, upload(WEBP, 'a.webp', 'image/webp'))).body.item.contentType).toBe('image/webp');
    expect((await editorApi.post(`/api/vault/${item.id}/file`, upload(GIF, 'a.gif', 'image/gif'))).body.item.contentType).toBe('image/gif');
    const before = [...t.storage.objects.keys()];
    expect((await editorApi.post(`/api/vault/${item.id}/file`, upload(Buffer.from('<svg onload=alert(1)>'), 'x.png', 'image/png'))).status).toBe(415);
    expect((await editorApi.post(`/api/vault/${item.id}/file`, upload(Buffer.from('%PDF-1.4 hello'), 'x.jpg', 'image/jpeg'))).status).toBe(415);
    expect((await editorApi.post(`/api/vault/${item.id}/file`, upload(Buffer.alloc(0), 'x.png'))).status).toBe(400);
    const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(15 * 1024 * 1024 + 1)]);
    expect((await editorApi.post(`/api/vault/${item.id}/file`, upload(big, 'big.png'))).status).toBe(413);
    expect((await editorApi.post(`/api/vault/${item.id}/file`, { not: 'multipart' })).status).toBe(400);
    expect([...t.storage.objects.keys()]).toEqual(before);

    const fact1 = (await editorApi.post('/api/vault', fact())).body.item;
    expect((await editorApi.post(`/api/vault/${fact1.id}/file`, upload(PNG, 'a.png'))).status).toBe(422);
    expect((await editorApi.get(`/api/vault/${fact1.id}/file-url`)).status).toBe(404);
  });

  it('a new file unconfirms a confirmed photo, and licence fields round trip', async () => {
    const { editorApi, item } = await photo();
    await editorApi.patch(`/api/vault/${item.id}`, { licence: 'own', licenceNotes: 'shot by staff', peoplePresent: true, consentRecorded: true });
    await editorApi.post(`/api/vault/${item.id}/file`, upload(PNG, 'a.png'));
    expect((await editorApi.post(`/api/vault/${item.id}/confirm`)).body.item.status).toBe('confirmed');
    const re = await editorApi.post(`/api/vault/${item.id}/file`, upload(JPG, 'b.jpg'));
    expect(re.body.item).toMatchObject({ status: 'unconfirmed', licence: 'own', licenceNotes: 'shot by staff', peoplePresent: true, consentRecorded: true });
  });
});

describe('vault rules', () => {
  const base = { kind: 'photo', title: 'Photo', status: 'confirmed', fileKey: 'vault/x/y.png', licence: 'own', peoplePresent: false, consentRecorded: false };

  it('rightsProblems explains why a photo or screen cannot be used', () => {
    expect(rightsProblems(base)).toEqual([]);
    expect(rightsProblems({ ...base, licence: 'licensed', peoplePresent: true, consentRecorded: true })).toEqual([]);
    expect(rightsProblems({ ...base, licence: 'rights_to_confirm' })[0]).toContain('rights to confirm');
    expect(rightsProblems({ ...base, licence: null })[0]).toContain('no licence');
    expect(rightsProblems({ ...base, peoplePresent: true })[0]).toContain('no consent');
    expect(rightsProblems({ ...base, fileKey: null })[0]).toContain('no file');
    expect(rightsProblems({ ...base, licence: null, peoplePresent: true })).toHaveLength(2);
    expect(rightsProblems({ ...base, kind: 'screen', licence: 'rights_to_confirm' })).toHaveLength(1);
    expect(rightsProblems({ kind: 'fact', title: 'F', status: 'confirmed' })).toEqual([]);
  });

  it('sourceProblems explains unconfirmed, stale and deleted items', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    expect(sourceProblems({ kind: 'fact', title: 'F', status: 'confirmed' }, { now })).toEqual([]);
    expect(sourceProblems({ kind: 'fact', title: 'F', status: 'unconfirmed' }, { now })[0]).toContain('not been confirmed');
    const stale = sourceProblems({ kind: 'figure', title: 'Fig', status: 'confirmed', validUntil: new Date('2026-01-01') }, { now });
    expect(stale).toHaveLength(1);
    expect(stale[0]).toContain('valid until 2026-01-01');
    expect(sourceProblems({ kind: 'figure', title: 'Fig', status: 'unconfirmed', recordedAt: new Date('2020-01-01') }, { now })).toHaveLength(2);
    expect(sourceProblems({ kind: 'figure', title: 'Fig', status: 'confirmed', recordedAt: new Date('2026-09-01') }, { now, staleFigureDays: 30 })).toHaveLength(1);
    expect(sourceProblems({ kind: 'fact', title: 'F', status: 'confirmed', deletedAt: now }, { now })[0]).toContain('deleted');
  });

  it('the item view carries the same problems', async () => {
    const { editorApi } = await users();
    const item = (await editorApi.post('/api/vault', { kind: 'screen', title: 'Dashboard', licence: 'rights_to_confirm' })).body.item;
    expect(item.problems.rights.length).toBeGreaterThan(0);
    expect(item.problems.source[0]).toContain('not been confirmed');
  });
});
