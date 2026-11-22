// Mixing looks: a design of any look added to the look in use ("Add to my look", with a copy of a shipped look made first and a design replaced
// at the limit of three per kind), a look started blank from the engine's starter, and a blank design added to a kind.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentSettings, resetBrandState } from './services/brand-settings.js';
import { createLooks, resetLookLogs, type GateRecord } from './services/looks.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => {
  await t.reset();
  resetBrandState();
  resetLookLogs();
});
afterEach(() => { vi.restoreAllMocks(); });

const BASE = '/api/settings/looks';
const scope = { brandId: 'brand' };
const KINDS = ['statement', 'figure', 'list', 'quote', 'photo', 'event', 'offer'];
const admin = async () => t.api(await t.signIn(await t.createUser('admin')));
const actor = async () => ({ id: (await t.createUser('admin')).id, email: 'a@example.test' });
// A saved brand starts on the shipped Clean look (two photo designs).
const saveBrand = () => t.prisma.brandProfile.create({ data: { settings: currentSettings(null) as object } });
const audits = async () => (await t.prisma.auditLog.findMany({ orderBy: { at: 'asc' } })).map((r) => r.action).filter((a) => a.startsWith('look.'));
const failing = async (i: { definitionHash: string }): Promise<GateRecord> => ({ engineVersion: 'x', definitionHash: i.definitionHash, at: '', passed: false, checks: [{ name: 'render:stress', passed: false, message: 'The headline does not fit' }] });
type Api = Awaited<ReturnType<typeof admin>>;
const photos = (look: { compositions: Array<{ kind: string; name: string; enabled: boolean; gate: unknown }> }) => look.compositions.filter((c) => c.kind === 'photo');

describe('starting a look blank', () => {
  it('makes a draft of the brand\'s own from the engine\'s starter: one plain design of every kind, named as asked, never a shipped look', async () => {
    const api = await admin();
    const res = await api.post(`${BASE}/blank`, { name: 'From scratch' });
    expect(res.status).toBe(201);
    const l = res.body.look;
    expect(l).toMatchObject({ slug: 'from-scratch', ref: 'own:from-scratch', name: 'From scratch', status: 'draft', origin: 'starter', needsAttention: false });
    expect(l.definition).toMatchObject({ id: 'from-scratch', name: 'From scratch', origin: 'starter', schema: 1 });
    expect(Object.values(l.definition.fonts).every((f) => (f as { source: string }).source === 'brand')).toBe(true);
    expect(l.compositions.map((c: { kind: string }) => c.kind)).toEqual(KINDS);
    expect(l.compositions.every((c: { enabled: boolean }) => c.enabled)).toBe(true);
    const list = (await api.get(BASE)).body;
    expect(list.shipped.map((s: { id: string }) => s.id)).not.toContain('starter');
    expect(list.own.map((o: { slug: string }) => o.slug)).toEqual(['from-scratch']);
    // it can be published and used like any other look
    expect((await api.post(`${BASE}/from-scratch/publish`)).body.look.status).toBe('ready');
    expect(await audits()).toEqual(['look.create_blank', 'look.publish']);
  });

  it('derives a free slug, refuses a taken or reserved one and a bad name, and keeps at most 20 looks', async () => {
    const api = await admin();
    expect((await api.post(`${BASE}/blank`, { name: 'Mine' })).body.look.slug).toBe('mine');
    expect((await api.post(`${BASE}/blank`, { name: 'Mine' })).body.look.slug).toBe('mine-2');
    expect((await api.post(`${BASE}/blank`, { name: 'Clean' })).body.look.slug).toBe('clean-2');
    expect((await api.post(`${BASE}/blank`, { name: 'X', slug: 'mine' })).status).toBe(409);
    for (const slug of ['new', 'add-design', 'inspiration', 'retail']) expect((await api.post(`${BASE}/blank`, { name: 'X', slug })).status).toBe(409);
    expect((await api.post(`${BASE}/blank`, { name: '' })).status).toBe(400);
    expect((await api.post(`${BASE}/blank`, { name: 'x'.repeat(41) })).status).toBe(400);
    expect((await api.post(`${BASE}/blank`, { name: 'X', brandId: 'other' })).status).toBe(400);
    for (let i = 0; i < 17; i++) expect((await api.post(`${BASE}/blank`, { name: `Look ${i}` })).status).toBe(201);
    const over = await api.post(`${BASE}/blank`, { name: 'One too many' });
    expect(over.status).toBe(409);
    expect(over.body.error).toMatch(/at most 20 looks/);
  });

  it('is for admins only', async () => {
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.post(`${BASE}/blank`, { name: 'Mine' })).status).toBe(403);
    expect((await editor.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'photo', index: 0 })).status).toBe(403);
    expect((await editor.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0, copy: true })).status).toBe(403);
    expect(await t.prisma.brandLook.count()).toBe(0);
  });
});

describe('adding a blank design to a kind', () => {
  it('adds the starter\'s plain design, checked, up to three per kind', async () => {
    const api = await admin();
    await api.post(`${BASE}/blank`, { name: 'Mine' });
    const one = await api.post(`${BASE}/mine/compositions/blank`, { kind: 'photo' });
    expect(one.status).toBe(201);
    expect(photos(one.body.look).map((c) => c.name)).toEqual(['Plain photo', 'Plain photo']);
    expect(one.body.added).toMatchObject({ enabled: true, passed: true });
    expect(photos(one.body.look)[1]!.gate).toMatchObject({ passed: true });
    expect((await api.post(`${BASE}/mine/compositions/blank`, { kind: 'photo' })).status).toBe(201);
    const full = await api.post(`${BASE}/mine/compositions/blank`, { kind: 'photo' });
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/at most 3 compositions of one kind/);
    expect((await api.post(`${BASE}/mine/compositions/blank`, { kind: 'poster' })).status).toBe(400);
    expect((await api.post(`${BASE}/nope/compositions/blank`, { kind: 'photo' })).status).toBe(404);
    expect((await audits()).filter((a) => a === 'look.composition.add_blank')).toHaveLength(2);
  });

  it('keeps a new design that does not pass the checks switched off, with the reason', async () => {
    const api = await admin();
    await api.post(`${BASE}/blank`, { name: 'Mine' });
    const svc = createLooks(t.deps, { runGate: failing });
    const r = await svc.addBlankComposition(scope, await actor(), 'mine', 'quote');
    expect(r.added).toMatchObject({ enabled: false, passed: false, message: 'The headline does not fit' });
    const rows = await t.prisma.brandLookComposition.findMany({ where: { look: { slug: 'mine' }, kind: 'quote' }, orderBy: { position: 'asc' } });
    expect(rows.map((x) => x.enabled)).toEqual([true, false]);
    expect(rows[1]!.gate).toMatchObject({ passed: false });
    // the same for a design copied from another look on the look's page
    const r2 = await svc.addCompositionFrom(scope, await actor(), 'mine', { sourceRef: 'shipped:soft', kind: 'photo', index: 0 });
    expect(r2.added).toMatchObject({ enabled: false, passed: false });
  });
});

describe('adding a design to the look in use', () => {
  it('plans it: a shipped look in use is copied first, the design is drawn in the look\'s own settings, typefaces do not travel', async () => {
    const api = await admin();
    await saveBrand();
    const res = await api.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'photo', index: 0 });
    expect(res.status).toBe(200);
    const p = res.body;
    expect(p.source).toMatchObject({ ref: 'shipped:soft', lookName: 'Soft', kind: 'photo', index: 0 });
    expect(p.target).toEqual({ ref: 'shipped:clean', name: 'Clean', shipped: true, copyName: 'Clean (yours)' });
    expect(p.designs.map((d: { name: string }) => d.name)).toEqual(['Object', 'Object, centred']);
    expect(p).toMatchObject({ full: false, perKind: 3, candidateIndex: 2, replace: null, typefaces: { travel: false } });
    // the candidate is the look in use with the design in it, sent whole to the preview route: Clean's settings, not Soft's
    expect(p.candidate.origin).toBe('copy:shipped:clean');
    expect(p.candidate.fonts).toEqual((await api.get(`${BASE}/shipped:clean`)).body.look.definition.fonts);
    expect(p.candidate.compositions.filter((c: { kind: string }) => c.kind === 'photo')[2].name).toBe(p.source.name);
    expect((await api.post(`${BASE}/validate`, { definition: p.candidate })).body.problems).toEqual([]);
    expect(await t.prisma.brandLook.count()).toBe(0);
    // without a look in use there is nothing to add to
    await api.put(`${BASE}/active`, { ref: null });
    expect((await api.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'photo', index: 0 })).body).toMatchObject({ target: null, candidate: null });
    const none = await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0, copy: true });
    expect(none.status).toBe(409);
    expect(none.body.error).toMatch(/No look is in use/);
  });

  it('copies a shipped look in use only when the person agrees, and switches to the copy only when asked', async () => {
    const api = await admin();
    await saveBrand();
    const refused = await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0 });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/Clean is a look we ship and is read only/);
    expect(await t.prisma.brandLook.count()).toBe(0);

    const res = await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0, copy: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ copied: true, used: false, published: false, activeRef: 'shipped:clean' });
    const l = res.body.look;
    expect(l).toMatchObject({ slug: 'clean-yours', name: 'Clean (yours)', origin: 'shipped:clean', status: 'draft' });
    const added = photos(l)[2]!;
    expect(added).toMatchObject({ enabled: true, gate: { passed: true } });
    expect(added.name).toBe((await api.get(`${BASE}/shipped:soft`)).body.look.definition.compositions.find((c: { kind: string }) => c.kind === 'photo').name);
    expect((await api.get(BASE)).body.activeRef).toBe('shipped:clean');
    expect(await audits()).toEqual(['look.duplicate', 'look.composition.add']);
    const row = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'look.composition.add' } });
    expect(row.detail).toMatchObject({ look: 'clean-yours', from: 'shipped:soft', kind: 'photo', index: 0, toActive: true, copiedFrom: 'shipped:clean' });
  });

  it('with the person\'s agreement, publishes the copy and uses it from then on', async () => {
    const api = await admin();
    await saveBrand();
    const res = await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0, copy: true, use: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ copied: true, used: true, published: true, activeRef: 'own:clean-yours' });
    expect(res.body.look.status).toBe('ready');
    expect((await api.get('/api/looks/brief')).body.look.kinds.photo.variants).toHaveLength(3);
    expect(await audits()).toEqual(['look.duplicate', 'look.composition.add', 'look.publish', 'look.activate']);
  });

  it('adds to an own look in use, which stays ready; refuses a design of the look itself', async () => {
    const api = await admin();
    await saveBrand();
    await api.post(`${BASE}/blank`, { name: 'Mine' });
    await api.post(`${BASE}/mine/publish`);
    await api.put(`${BASE}/active`, { ref: 'own:mine' });
    const plan = (await api.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'quote', index: 0 })).body;
    expect(plan.target).toEqual({ ref: 'own:mine', name: 'Mine', shipped: false, status: 'ready' });
    const res = await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'quote', index: 0 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ copied: false, used: false, published: true, activeRef: 'own:mine' });
    expect(res.body.look.status).toBe('ready');
    expect(res.body.look.compositions.filter((c: { kind: string }) => c.kind === 'quote')).toHaveLength(2);
    expect(await t.prisma.brandLook.count()).toBe(1);
    const self = await api.post(`${BASE}/add-design`, { source: 'own:mine', kind: 'quote', index: 0 });
    expect(self.status).toBe(409);
  });

  it('at the limit of three, refuses to add and lets the person replace one of the kind, keeping its place', async () => {
    const api = await admin();
    await saveBrand();
    await api.post(`${BASE}/blank`, { name: 'Mine' });
    await api.post(`${BASE}/mine/compositions`, { source: 'shipped:clean', kind: 'photo', index: 0 });
    await api.post(`${BASE}/mine/compositions`, { source: 'shipped:clean', kind: 'photo', index: 1 });
    await api.post(`${BASE}/mine/publish`);
    await api.put(`${BASE}/active`, { ref: 'own:mine' });
    const before = (await api.get(`${BASE}/own:mine`)).body.look;
    expect(photos(before).map((c) => c.name)).toEqual(['Plain photo', 'Object', 'Object, centred']);

    const plan = (await api.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'photo', index: 0 })).body;
    expect(plan).toMatchObject({ full: true, candidate: null, candidateIndex: null });
    expect(plan.designs.map((d: { index: number; name: string }) => [d.index, d.name])).toEqual([[0, 'Plain photo'], [1, 'Object'], [2, 'Object, centred']]);
    const full = await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0 });
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/choose one to replace/);

    const withReplace = (await api.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'photo', index: 0, replace: 1 })).body;
    expect(withReplace).toMatchObject({ full: true, candidateIndex: 1, replace: 1 });
    expect(withReplace.candidate.compositions.filter((c: { kind: string }) => c.kind === 'photo')).toHaveLength(3);
    expect((await api.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'photo', index: 0, replace: 3 })).status).toBe(404);

    const replacedId = photos(before)[1]! as unknown as { id: string };
    const res = await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0, replace: 1 });
    expect(res.status).toBe(201);
    const after = photos(res.body.look) as unknown as Array<{ id: string; name: string; position: number }>;
    expect(after).toHaveLength(3);
    expect(after.map((c) => c.name)).toEqual(['Plain photo', withReplace.source.name, 'Object, centred']);
    expect(after[1]!.id).toBe(replacedId.id);
    expect(res.body).toMatchObject({ published: true, activeRef: 'own:mine' });
    const row = await t.prisma.auditLog.findFirstOrThrow({ where: { action: 'look.composition.replace' } });
    expect(row.detail).toMatchObject({ look: 'mine', replaced: 'Object', from: 'shipped:soft', toActive: true });
  });

  it('runs the checks first: a design that does not pass is refused and nothing is stored, no copy either', async () => {
    await saveBrand();
    const runGate = vi.fn(failing);
    const svc = createLooks(t.deps, { runGate });
    await expect(svc.addDesignToActive(scope, await actor(), { source: 'shipped:soft', kind: 'photo', index: 0, copy: true, use: true }))
      .rejects.toMatchObject({ status: 400, details: [{ path: 'render:stress', message: 'The headline does not fit' }] });
    expect(runGate).toHaveBeenCalledOnce();
    expect(await t.prisma.brandLook.count()).toBe(0);
    expect((await t.prisma.brandProfile.findFirstOrThrow()).activeLookRef).toBe('shipped:clean');
  });

  it('refuses a design that does not fit the look in use, with the engine\'s reasons', async () => {
    const api = await admin();
    await saveBrand();
    const res = await api.post(`${BASE}/add-design`, { source: 'shipped:swiss', kind: 'list', index: 0, copy: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The design does not fit the look in use');
    expect(await t.prisma.brandLook.count()).toBe(0);
  });

  it('stays in the brand\'s scope: another brand\'s look in use and its own looks are invisible', async () => {
    const api = await admin();
    // another brand uses its own look; this brand has no profile, so no look in use
    await t.prisma.brandProfile.create({ data: { id: 'someone-else', settings: currentSettings(null) as object, activeLookRef: 'own:theirs' } });
    await api.post(`${BASE}/blank`, { name: 'Theirs' });
    await t.prisma.brandLook.updateMany({ where: { slug: 'theirs' }, data: { brandId: 'someone-else' } });
    await t.prisma.brandLookComposition.updateMany({ where: { look: { slug: 'theirs' } }, data: { brandId: 'someone-else' } });
    expect((await api.post(`${BASE}/add-design/plan`, { source: 'shipped:soft', kind: 'photo', index: 0 })).body.target).toBeNull();
    await saveBrand();
    // their look is no source for this brand, by slug
    expect((await api.post(`${BASE}/add-design/plan`, { source: 'own:theirs', kind: 'photo', index: 0 })).status).toBe(404);
    expect((await api.post(`${BASE}/add-design`, { source: 'own:theirs', kind: 'photo', index: 0, copy: true })).status).toBe(404);
    expect((await api.post(`${BASE}/theirs/compositions/blank`, { kind: 'photo' })).status).toBe(404);
    // and a copy made for this brand is this brand's, counted against its own limit only
    await api.post(`${BASE}/add-design`, { source: 'shipped:soft', kind: 'photo', index: 0, copy: true });
    expect((await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'clean-yours' } })).brandId).toBe('brand');
    expect(await t.prisma.brandLookComposition.count({ where: { brandId: 'someone-else' } })).toBe(7);
    expect((await t.prisma.brandProfile.findUniqueOrThrow({ where: { id: 'someone-else' } })).activeLookRef).toBe('own:theirs');
  });
});
