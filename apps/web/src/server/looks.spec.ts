import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import { engineImport } from './engine/root.js';
import { logger } from './log.js';
import { currentSettings, resetBrandState, syncBrand } from './services/brand-settings.js';
import { brandScope, createLooks, setLookRenderer, engineReadsLooks, formatRef, looksFor, packWithLook, parseRef, resetLookLogs, shippedLooks, type GateRecord } from './services/looks.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => {
  t = await createTestApp();
  root = (await pipelineEngine()).root;
});
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => {
  await t.reset();
  resetBrandState();
  resetLookLogs();
});
afterEach(() => { vi.restoreAllMocks(); });

const BASE = '/api/settings/looks';
const scope = { brandId: 'brand' };
const admin = async () => t.api(await t.signIn(await t.createUser('admin')));
const activeBrand = () => JSON.parse(fs.readFileSync(path.join(root, process.env.BRAND_DIR!, 'brand.json'), 'utf8'));
const saveBrand = () => t.prisma.brandProfile.create({ data: { settings: currentSettings(null) as object } });

type Look = { slug: string; status: string; compositions: Array<{ id: string; kind: string; position: number; name: string; definition: Record<string, any>; draft: unknown; enabled: boolean; gate: any }>; definition: Record<string, any>; gate: any };
async function copy(api: Awaited<ReturnType<typeof admin>>, slug = 'mine', source = 'shipped:retail'): Promise<Look> {
  const res = await api.post(`${BASE}/duplicate`, { source, slug, name: 'Mine' });
  expect(res.status).toBe(201);
  return res.body.look;
}
const comp = (l: Look, kind: string, i = 0) => l.compositions.filter((c) => c.kind === kind)[i]!;
const actor = async () => ({ id: (await t.createUser('admin')).id, email: 'a@example.test' });

describe('references', () => {
  it('parses shipped:<id> and own:<slug> and nothing else', () => {
    expect(parseRef('shipped:retail')).toEqual({ source: 'shipped', id: 'retail' });
    expect(parseRef('own:my-look-2')).toEqual({ source: 'own', id: 'my-look-2' });
    for (const bad of ['own:a:b', 'shipped:a:b', 'retail', 'own:', 'own:UP', 'own:-x', 'other:x', '', null, 5, 'own:' + 'a'.repeat(41)]) expect(parseRef(bad)).toBeNull();
    expect(formatRef('own', 'mine')).toBe('own:mine');
    expect(() => formatRef('own', 'a:b')).toThrow();
  });

  it('refuses an id with a colon and an own id that takes a shipped look\'s id', async () => {
    const api = await admin();
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', slug: 'a:b' })).status).toBe(400);
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', slug: 'retail' })).status).toBe(409);
    expect((await api.post(`${BASE}/duplicate`, { source: 'own:a:b' })).status).toBe(400);
    expect((await api.get(`${BASE}/own:a:b`)).status).toBe(400);
    // a generated id never lands on a shipped one either
    const res = await api.post(`${BASE}/duplicate`, { source: 'shipped:swiss', name: 'Retail' });
    expect(res.body.look.slug).toBe('retail-2');
    // an address of the panel's own pages is never a look's id
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', slug: 'inspiration' })).status).toBe(409);
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', name: 'Inspiration' })).body.look.slug).toBe('inspiration-2');
  });
});

describe('who may use the looks', () => {
  it('is admins only, but any signed-in person reads the brief', async () => {
    expect((await t.api().get(BASE)).status).toBe(401);
    expect((await t.api().get('/api/looks/brief')).status).toBe(401);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.get(BASE)).status).toBe(403);
    expect((await editor.post(`${BASE}/duplicate`, { source: 'shipped:retail' })).status).toBe(403);
    expect((await editor.put(`${BASE}/active`, { ref: null })).status).toBe(403);
    expect((await editor.delete(`${BASE}/mine`)).status).toBe(403);
    const res = await editor.get('/api/looks/brief');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ look: null });
  });
});

describe('the list', () => {
  it('gives the shipped looks read only, the own looks, the active reference, the catalogue and the limits', async () => {
    const api = await admin();
    await copy(api);
    const { body } = await api.get(BASE);
    expect(body.activeRef).toBeNull();
    const retail = body.shipped.find((l: { id: string }) => l.id === 'retail');
    expect(retail).toMatchObject({ ref: 'shipped:retail', source: 'shipped', readOnly: true });
    expect(Object.keys(retail.kinds)).toEqual(expect.arrayContaining(['photo', 'statement', 'list']));
    expect(retail.kinds.statement).toBe(2);
    expect(body.own).toHaveLength(1);
    expect(body.own[0]).toMatchObject({ ref: 'own:mine', slug: 'mine', status: 'draft', origin: 'shipped:retail', gate: null, needsAttention: false });
    expect(Object.keys(body.catalogue)).toEqual(expect.arrayContaining(['elements', 'kinds', 'sections']));
    expect(body.limits).toMatchObject({ looks: 20, perKind: 3, compositions: 21, definitionBytes: 262144 });
    // the font library's families, for the typeface pickers
    const archivo = body.fonts.find((f: { family: string }) => f.family === 'Archivo');
    expect(archivo).toMatchObject({ family: 'Archivo' });
    expect(archivo.minWeight).toBeLessThanOrEqual(400);
    expect(archivo.maxWeight).toBeGreaterThanOrEqual(800);
  });

  it('reads one look in full: shipped as it is, own with its drafts', async () => {
    const api = await admin();
    expect((await api.get(`${BASE}/shipped:retail`)).body.look).toMatchObject({ readOnly: true, brief: { id: 'retail' } });
    expect((await api.get(`${BASE}/shipped:nope`)).status).toBe(404);
    const l = await copy(api);
    const c = comp(l, 'photo');
    await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, name: 'Draft name' } });
    const got = (await api.get(`${BASE}/own:mine`)).body.look;
    expect(got.compositions.find((x: { id: string }) => x.id === c.id)).toMatchObject({ name: 'Frame pop', hasDraft: true, draft: { name: 'Draft name' } });
    expect((await api.get(`${BASE}/own:missing`)).status).toBe(404);
  });
});

describe('duplicating', () => {
  it('is a deep copy under new ids: a draft of the brand\'s own, whose origin is its source', async () => {
    const api = await admin();
    const l = await copy(api);
    expect(l).toMatchObject({ slug: 'mine', status: 'draft' });
    expect(l.definition).toMatchObject({ id: 'mine', name: 'Mine', origin: 'copy:shipped:retail', schema: 1 });
    expect(l.compositions.map((c) => c.kind)).toEqual(['statement', 'statement', 'list', 'photo'].sort((a, b) => ['statement', 'figure', 'list', 'quote', 'photo', 'event', 'offer'].indexOf(a) - ['statement', 'figure', 'list', 'quote', 'photo', 'event', 'offer'].indexOf(b)));
    const src = (await shippedLooks()).find((s) => s.id === 'retail')!;
    expect(new Set(l.compositions.map((c) => c.id)).size).toBe(l.compositions.length);
    expect(l.compositions.map((c) => c.name).sort()).toEqual((src.compositions as Array<{ name: string }>).map((c) => c.name).sort());
    // the source is untouched, and so is it after the copy changes
    const row = await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'mine' } });
    expect(row).toMatchObject({ brandId: 'brand', origin: 'shipped:retail', engineSchema: 1 });
    const c = comp(l, 'photo');
    await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, name: 'Changed' } });
    await api.post(`${BASE}/mine/compositions/${c.id}/publish`);
    expect(((await shippedLooks()).find((s) => s.id === 'retail')!.compositions as Array<{ name: string }>)[0]!.name).toBe('Frame pop');
  });

  it('copies one of the brand\'s own looks, with its switches, and not its drafts', async () => {
    const api = await admin();
    const a = await copy(api);
    const c = comp(a, 'photo');
    await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, name: 'Pending' } });
    await api.patch(`${BASE}/mine/compositions/${comp(a, 'statement', 1).id}`, { enabled: false });
    const b = (await api.post(`${BASE}/duplicate`, { source: 'own:mine' })).body.look as Look;
    expect(b).toMatchObject({ slug: 'mine-copy' });
    expect(b.definition.origin).toBe('copy:own:mine');
    expect(b.compositions.every((x) => x.draft === null)).toBe(true);
    expect(b.compositions.filter((x) => !x.enabled)).toHaveLength(1);
    expect(b.compositions.map((x) => x.id)).not.toContain(c.id);
  });

  it('generates a free id from the name, refuses a taken one, and keeps at most 20 looks', async () => {
    const api = await admin();
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', name: 'Spring sale' })).body.look.slug).toBe('spring-sale');
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', name: 'Spring sale' })).body.look.slug).toBe('spring-sale-2');
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', slug: 'spring-sale' })).status).toBe(409);
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:nope' })).status).toBe(404);
    expect((await api.post(`${BASE}/duplicate`, { source: 'own:nope' })).status).toBe(404);
    const row = await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'spring-sale' } });
    for (let i = 0; i < 18; i++) await t.prisma.brandLook.create({ data: { slug: `filler-${i}`, name: 'F', definition: row.definition as object, origin: 'shipped:retail', engineSchema: 1 } });
    const res = await api.post(`${BASE}/duplicate`, { source: 'shipped:retail' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/at most 20 looks/);
  });

  it('writes an audit row', async () => {
    const api = await admin();
    await copy(api);
    expect((await t.prisma.auditLog.findFirst({ where: { action: 'look.duplicate' } }))?.detail).toMatchObject({ look: 'mine', origin: 'shipped:retail' });
  });
});

describe('the look\'s settings', () => {
  it('checks the whole look with its compositions, refuses with the engine\'s reasons, and stores nothing', async () => {
    const api = await admin();
    const l = await copy(api);
    const bad = await api.put(`${BASE}/mine/settings`, { definition: { ...l.definition, dials: { tilt: 99 } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('The look is not valid');
    expect(bad.body.details[0]).toMatchObject({ path: 'dials.tilt' });
    expect(bad.body.details[0].message).toMatch(/dials.tilt/);
    expect((await api.put(`${BASE}/mine/settings`, { definition: { ...l.definition, compositions: [] } })).status).toBe(400);
    expect((await api.put(`${BASE}/mine/settings`, { definition: { ...l.definition, junk: 'x'.repeat(300_000) } })).body.error).toMatch(/larger than 256 KB/);
    expect((await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'mine' } })).definition).toMatchObject({ dials: l.definition.dials });
  });

  it('keeps the id, origin and schema, resets the gate, and makes a ready look a draft again', async () => {
    const api = await admin();
    const l = await copy(api);
    expect((await api.post(`${BASE}/mine/publish`)).body.look).toMatchObject({ status: 'ready' });
    const res = await api.put(`${BASE}/mine/settings`, { definition: { ...l.definition, id: 'other', origin: 'shipped', name: 'Renamed', description: 'New' } });
    expect(res.status).toBe(200);
    expect(res.body.look).toMatchObject({ slug: 'mine', name: 'Renamed', status: 'draft', gate: null });
    expect(res.body.look.definition).toMatchObject({ id: 'mine', origin: 'copy:shipped:retail', schema: 1, description: 'New' });
    const row = await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'mine' } });
    expect(row.updatedById).not.toBeNull();
    expect(await t.prisma.auditLog.count({ where: { action: 'look.update' } })).toBe(1);
  });
});

describe('compositions and drafts', () => {
  it('stores a valid draft without changing what is drawn, until it is published', async () => {
    const api = await admin();
    const l = await copy(api);
    const c = comp(l, 'photo');
    const draft = { ...c.definition, name: 'Brighter' };
    const saved = await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: draft });
    expect(saved.status).toBe(200);
    const svc = looksFor(t.deps);
    const names = async () => ((await svc.resolveLook(scope, 'own:mine'))!.look.compositions as Array<{ name: string }>).map((x) => x.name);
    expect(await names()).toContain('Frame pop');
    expect(await names()).not.toContain('Brighter');
    const pub = await api.post(`${BASE}/mine/compositions/${c.id}/publish`);
    expect(pub.status).toBe(200);
    expect(await names()).toContain('Brighter');
    const after = comp(pub.body.look, 'photo');
    expect(after).toMatchObject({ name: 'Brighter', draft: null });
    expect(after.gate).toMatchObject({ passed: true, checks: [{ name: 'validate', passed: true }] });
    expect(after.gate.definitionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pub.body.look.status).toBe('draft');
  });

  it('refuses a draft that does not validate (with the problems) or that changes the kind, and stores nothing', async () => {
    const api = await admin();
    const l = await copy(api);
    const c = comp(l, 'photo');
    const bad = await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, elements: [{ type: 'html' }] } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('The draft is not valid');
    expect(bad.body.details.length).toBeGreaterThan(0);
    expect((await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, kind: 'list' } })).status).toBe(400);
    expect((await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, render: 'x' } })).status).toBe(400);
    expect((await t.prisma.brandLookComposition.findUniqueOrThrow({ where: { id: c.id } })).draft).toBeNull();
    expect((await api.post(`${BASE}/mine/compositions/${c.id}/publish`)).status).toBe(409);
    expect((await api.delete(`${BASE}/mine/compositions/${c.id}/draft`)).status).toBe(409);
  });

  it('discards a draft', async () => {
    const api = await admin();
    const c = comp(await copy(api), 'photo');
    await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, name: 'X' } });
    const res = await api.delete(`${BASE}/mine/compositions/${c.id}/draft`);
    expect(res.status).toBe(200);
    expect(comp(res.body.look, 'photo').draft).toBeNull();
    expect(await t.prisma.auditLog.count({ where: { action: 'look.composition.discard' } })).toBe(1);
  });

  it('runs the gate hook on publish: a gate that fails keeps the draft and records the failure', async () => {
    const api = await admin();
    const c = comp(await copy(api), 'photo');
    await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, name: 'Gated' } });
    const runGate = vi.fn(async (i: { definitionHash: string }): Promise<GateRecord> => ({ engineVersion: 'x', definitionHash: i.definitionHash, at: new Date().toISOString(), passed: false, checks: [{ name: 'fit', passed: false, message: 'The headline does not fit' }] }));
    const svc = createLooks(t.deps, { runGate });
    await expect(svc.publishComposition(scope, await actor(), 'mine', c.id)).rejects.toMatchObject({ status: 400, details: [{ path: 'fit', message: 'The headline does not fit' }] });
    expect(runGate).toHaveBeenCalledOnce();
    const row = await t.prisma.brandLookComposition.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.name).toBe('Frame pop');
    expect(row.draft).not.toBeNull();
    expect(row.gate).toMatchObject({ passed: false });
  });

  it('adds a composition from a shipped look or an own look, up to three per kind', async () => {
    const api = await admin();
    const l = await copy(api, 'mine', 'shipped:swiss');
    const add = (source: string, kind: string, index: number) => api.post(`${BASE}/mine/compositions`, { source, kind, index });
    const one = await add('shipped:swiss', 'photo', 0);
    expect(one.status).toBe(201);
    expect(one.body.look.compositions.filter((c: { kind: string }) => c.kind === 'photo')).toHaveLength(2);
    expect((await add('own:mine', 'photo', 0)).status).toBe(201);
    const full = await add('shipped:swiss', 'photo', 0);
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/at most 3 compositions of one kind/);
    expect((await add('shipped:swiss', 'event', 0)).status).toBe(404);
    expect((await add('shipped:swiss', 'list', 7)).status).toBe(404);
    expect((await add('own:nope', 'photo', 0)).status).toBe(404);
    expect(l.compositions.length + 2).toBe(await t.prisma.brandLookComposition.count({ where: { look: { slug: 'mine' } } }));
    expect(await t.prisma.auditLog.count({ where: { action: 'look.composition.add' } })).toBe(2);
  });

  it('refuses a composition that does not fit the look it is added to (a six column grid cannot hold a twelve column one)', async () => {
    const api = await admin();
    await copy(api, 'mine', 'shipped:retail');
    const res = await api.post(`${BASE}/mine/compositions`, { source: 'shipped:swiss', kind: 'list', index: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('The composition does not fit this look');
    expect(res.body.details[0].message).toMatch(/grid/);
    expect(await t.prisma.brandLookComposition.count({ where: { look: { slug: 'mine' }, kind: 'list' } })).toBe(1);
  });

  it('switches compositions on and off, but keeps one on', async () => {
    const api = await admin();
    const l = await copy(api, 'mine', 'shipped:swiss');
    const [a, b, c] = l.compositions;
    expect((await api.patch(`${BASE}/mine/compositions/${a!.id}`, { enabled: false })).status).toBe(200);
    expect((await api.patch(`${BASE}/mine/compositions/${b!.id}`, { enabled: false })).status).toBe(200);
    const res = await api.patch(`${BASE}/mine/compositions/${c!.id}`, { enabled: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/at least one composition/);
    expect((await api.patch(`${BASE}/mine/compositions/${c!.id}`, {})).status).toBe(400);
    const drawn = (await looksFor(t.deps).resolveLook(scope, 'own:mine'))!.look.compositions as unknown[];
    expect(drawn).toHaveLength(1);
  });

  it('reorders the compositions of a kind, by position or by list', async () => {
    const api = await admin();
    const l = await copy(api);
    const [s0, s1] = l.compositions.filter((c) => c.kind === 'statement');
    const moved = await api.patch(`${BASE}/mine/compositions/${s1!.id}`, { position: 0 });
    expect(moved.status).toBe(200);
    expect(moved.body.look.compositions.filter((c: { kind: string }) => c.kind === 'statement').map((c: { id: string }) => c.id)).toEqual([s1!.id, s0!.id]);
    const svc = looksFor(t.deps);
    await expect(svc.reorderCompositions(scope, await actor(), 'mine', 'statement', [s0!.id])).rejects.toMatchObject({ status: 400 });
    const back = await svc.reorderCompositions(scope, await actor(), 'mine', 'statement', [s0!.id, s1!.id]);
    expect(back.compositions.filter((c) => c.kind === 'statement').map((c) => c.id)).toEqual([s0!.id, s1!.id]);
  });

  it('removes a composition, never the last of its kind', async () => {
    const api = await admin();
    const l = await copy(api);
    const photo = comp(l, 'photo');
    const res = await api.delete(`${BASE}/mine/compositions/${photo.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/only photo composition/);
    const gone = await api.delete(`${BASE}/mine/compositions/${comp(l, 'statement', 0).id}`);
    expect(gone.status).toBe(200);
    expect(gone.body.look.compositions.filter((c: { kind: string }) => c.kind === 'statement')).toHaveLength(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'look.composition.remove' } })).toBe(1);
  });
});

describe('publishing and using a look', () => {
  it('makes a look ready once it validates and every enabled composition has a passing gate record for its current definition', async () => {
    const api = await admin();
    const l = await copy(api);
    expect(l.status).toBe('draft');
    const res = await api.post(`${BASE}/mine/publish`);
    expect(res.status).toBe(200);
    expect(res.body.look).toMatchObject({ status: 'ready', gate: { passed: true, stale: false } });
    for (const c of res.body.look.compositions) expect(c.gate).toMatchObject({ passed: true });
    expect(res.body.look.gateRecord.checks).toHaveLength(res.body.look.compositions.length);
    expect(await t.prisma.auditLog.count({ where: { action: 'look.publish' } })).toBe(1);
  });

  it('refuses while a pending draft is not valid, or a gate does not pass', async () => {
    const api = await admin();
    const l = await copy(api);
    const c = comp(l, 'photo');
    await t.prisma.brandLookComposition.update({ where: { id: c.id }, data: { draft: { ...c.definition, elements: [{ type: 'html' }] } } });
    const res = await api.post(`${BASE}/mine/publish`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending draft of "Frame pop" is not valid/);
    await t.prisma.brandLookComposition.update({ where: { id: c.id }, data: { draft: Prisma.DbNull } });
    const failing = createLooks(t.deps, { runGate: async (i) => ({ engineVersion: 'x', definitionHash: i.definitionHash, at: '', passed: false, checks: [{ name: 'contrast', passed: false, message: 'Too faint' }] }) });
    await expect(failing.publishLook(scope, await actor(), 'mine')).rejects.toMatchObject({ status: 400, details: expect.arrayContaining([{ path: expect.stringContaining('/'), message: 'Too faint' }]) });
    expect((await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'mine' } })).status).toBe('draft');
  });

  it('uses a gate record that is still current and makes a new one for a changed definition', async () => {
    const api = await admin();
    const c = comp(await copy(api), 'photo');
    await api.post(`${BASE}/mine/publish`);
    const runGate = vi.fn(async (i: { definitionHash: string }): Promise<GateRecord> => ({ engineVersion: 'x', definitionHash: i.definitionHash, at: '', passed: true, checks: [] }));
    const svc = createLooks(t.deps, { runGate });
    await svc.publishLook(scope, await actor(), 'mine');
    expect(runGate).not.toHaveBeenCalled();
    await t.prisma.brandLookComposition.update({ where: { id: c.id }, data: { definition: { ...c.definition, describe: 'Changed outside the service' } } });
    await svc.publishLook(scope, await actor(), 'mine');
    expect(runGate).toHaveBeenCalledOnce();
  });

  it('is activated only if shipped or the brand\'s own and ready, once the brand is saved; null returns to classic layouts', async () => {
    const api = await admin();
    expect((await api.put(`${BASE}/active`, { ref: 'shipped:retail' })).status).toBe(409);
    await saveBrand();
    await copy(api);
    const draft = await api.put(`${BASE}/active`, { ref: 'own:mine' });
    expect(draft.status).toBe(409);
    expect(draft.body.error).toMatch(/Publish the look/);
    expect((await api.put(`${BASE}/active`, { ref: 'own:nope' })).status).toBe(404);
    expect((await api.put(`${BASE}/active`, { ref: 'shipped:nope' })).status).toBe(404);
    expect((await api.put(`${BASE}/active`, { ref: 'bad' })).status).toBe(400);
    await api.post(`${BASE}/mine/publish`);
    expect((await api.put(`${BASE}/active`, { ref: 'own:mine' })).body).toEqual({ activeRef: 'own:mine' });
    expect((await api.get(BASE)).body.activeRef).toBe('own:mine');
    expect((await looksFor(t.deps).activeLook(scope))?.ref).toBe('own:mine');
    expect((await api.put(`${BASE}/active`, { ref: 'shipped:swiss' })).body.activeRef).toBe('shipped:swiss');
    expect((await api.put(`${BASE}/active`, { ref: null })).body.activeRef).toBeNull();
    expect(await looksFor(t.deps).activeLook(scope)).toBeNull();
    const rows = await t.prisma.auditLog.findMany({ where: { action: 'look.activate' }, orderBy: { at: 'asc' } });
    expect(rows.map((r) => (r.detail as { ref: string | null }).ref)).toEqual(['own:mine', 'shipped:swiss', null]);
  });

  it('cannot be changed or removed while it is the active one', async () => {
    const api = await admin();
    await saveBrand();
    const l = await copy(api);
    await api.post(`${BASE}/mine/publish`);
    await api.put(`${BASE}/active`, { ref: 'own:mine' });
    const c = comp(l, 'photo');
    expect((await api.delete(`${BASE}/mine`)).status).toBe(409);
    expect((await api.put(`${BASE}/mine/settings`, { definition: l.definition })).status).toBe(409);
    expect((await api.patch(`${BASE}/mine/compositions/${c.id}`, { enabled: false })).status).toBe(409);
    expect((await api.delete(`${BASE}/mine/compositions/${comp(l, 'statement').id}`)).status).toBe(409);
    expect((await api.post(`${BASE}/mine/compositions`, { source: 'shipped:swiss', kind: 'photo', index: 0 })).status).toBe(409);
    // drafts never change what is drawn, so they stay open
    expect((await api.put(`${BASE}/mine/compositions/${c.id}/draft`, { definition: { ...c.definition, name: 'Later' } })).status).toBe(200);
    expect((await api.post(`${BASE}/mine/compositions/${c.id}/publish`)).status).toBe(409);
    await api.put(`${BASE}/active`, { ref: null });
    expect((await api.delete(`${BASE}/mine`)).status).toBe(200);
    expect(await t.prisma.brandLookComposition.count()).toBe(0);
    expect(await t.prisma.auditLog.count({ where: { action: 'look.delete' } })).toBe(1);
  });

  it('gives the active look\'s brief to the post editor, or { look: null }', async () => {
    const api = await admin();
    await saveBrand();
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.get('/api/looks/brief')).body).toEqual({ look: null });
    await api.put(`${BASE}/active`, { ref: 'shipped:swiss' });
    const { body } = await editor.get('/api/looks/brief');
    expect(body.look).toMatchObject({ ref: 'shipped:swiss', id: 'swiss' });
    expect(Object.keys(body.look.kinds).sort()).toEqual(['list', 'photo', 'statement']);
    expect(body.look.kinds.photo.variants[0]).toMatchObject({ index: 0, name: 'Grid photo', fields: { headline: { required: true, max: 64 } } });
    expect((await looksFor(t.deps).lookBriefs(scope))?.ref).toBe('shipped:swiss');
  });
});

describe('validating without storing', () => {
  it('gives the problems of a whole look', async () => {
    const api = await admin();
    const retail = (await api.get(`${BASE}/shipped:retail`)).body.look.definition;
    expect((await api.post(`${BASE}/validate`, { definition: { ...retail, origin: 'copy:shipped:retail' } })).body.problems).toEqual([]);
    const res = await api.post(`${BASE}/validate`, { definition: { ...retail, origin: 'copy:shipped:retail', dials: { tilt: 99 } } });
    expect(res.body.problems[0]).toMatch(/dials.tilt/);
    expect(await t.prisma.brandLook.count()).toBe(0);
  });
});

describe('what is not available yet', () => {
  it('answers 501 for previews and the gate', async () => {
    const api = await admin();
    await copy(api);
    for (const res of [await api.post(`${BASE}/preview`, { definition: {} }), await api.post(`${BASE}/mine/gate`)]) {
      expect(res.status).toBe(501);
      expect(res.body).toMatchObject({ error: 'Previews of looks are not available yet' });
    }
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.post(`${BASE}/preview`, {})).status).toBe(403);
  });
});

describe('previews of a whole look (with a stand-in renderer)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  afterEach(() => setLookRenderer(null));
  const standIn = () => {
    const seen: Array<{ kinds: string[]; look: Record<string, any> }> = [];
    setLookRenderer({
      preview: async ({ look, kinds }) => { seen.push({ kinds, look }); return { samples: kinds.map((kind) => ({ kind, ok: true, image: PNG, warnings: [] })) }; },
      gate: async () => ({}),
    });
    return seen;
  };

  it('answers 501 without a renderer, before looking at the body', async () => {
    const api = await admin();
    const res = await api.post(`${BASE}/preview`, { ref: 'shipped:retail' });
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('Previews of looks are not available yet');
  });

  it('draws one picture per kind for a reference and returns the look hash', async () => {
    const seen = standIn();
    const api = await admin();
    const res = await api.post(`${BASE}/preview`, { ref: 'shipped:retail', kinds: ['photo', 'list'] });
    expect(res.status).toBe(200);
    expect(res.body.samples).toEqual([{ kind: 'photo', ok: true, image: PNG, warnings: [] }, { kind: 'list', ok: true, image: PNG, warnings: [] }]);
    const eng = await (await import('./services/looks.js')).lookEngine();
    expect(res.body.hash).toBe(eng.lookHash((await shippedLooks()).find((l) => l.id === 'retail')));
    expect(seen[0]!.kinds).toEqual(['photo', 'list']);
    // all kinds when none are asked for
    expect((await api.post(`${BASE}/preview`, { ref: 'shipped:swiss' })).body.samples).toHaveLength(eng.KINDS.length);
  });

  it('draws a look sent whole, checks it first, and refuses a bad body', async () => {
    standIn();
    const api = await admin();
    const retail = (await shippedLooks()).find((l) => l.id === 'retail')!;
    const ok = await api.post(`${BASE}/preview`, { look: { ...JSON.parse(JSON.stringify(retail)), origin: 'copy:shipped:retail' } });
    expect(ok.status).toBe(200);
    const bad = await api.post(`${BASE}/preview`, { look: { ...JSON.parse(JSON.stringify(retail)), origin: 'copy:shipped:retail', dials: { tilt: 99 } } });
    expect(bad.status).toBe(400);
    expect(bad.body.details[0].path).toMatch(/dials/);
    expect((await api.post(`${BASE}/preview`, {})).status).toBe(400);
    expect((await api.post(`${BASE}/preview`, { ref: 'shipped:retail', look: {} })).status).toBe(400);
    expect((await api.post(`${BASE}/preview`, { ref: 'shipped:retail', kinds: ['nope'] })).status).toBe(400);
    expect((await api.post(`${BASE}/preview`, { ref: 'own:missing' })).status).toBe(404);
  });

  it('keeps previews for admins', async () => {
    standIn();
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.post(`${BASE}/preview`, { ref: 'shipped:retail' })).status).toBe(403);
  });
});

describe('the brand scope', () => {
  const OTHER = { brandId: 'someone-else' };
  // A look of another brand, put in directly; the service must not see it, even by slug or uuid.
  async function foreign() {
    const api = await admin();
    const l = await copy(api, 'theirs');
    await t.prisma.brandLook.update({ where: { id: (await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'theirs' } })).id }, data: { brandId: 'someone-else' } });
    await t.prisma.brandLookComposition.updateMany({ where: { look: { slug: 'theirs' } }, data: { brandId: 'someone-else' } });
    return { api, l };
  }

  it('comes from one function and is a constant today', () => {
    expect(brandScope()).toEqual({ brandId: 'brand' });
  });

  it('hides another brand\'s looks: not listed, not read, not resolved, not copied, not changed', async () => {
    const { api, l } = await foreign();
    const c = comp(l, 'photo');
    expect((await api.get(BASE)).body.own).toEqual([]);
    expect((await api.get(`${BASE}/own:theirs`)).status).toBe(404);
    expect(await looksFor(t.deps).resolveLook(scope, 'own:theirs')).toBeNull();
    expect((await looksFor(t.deps).listLooks(OTHER)).own).toHaveLength(1);
    expect((await api.post(`${BASE}/duplicate`, { source: 'own:theirs' })).status).toBe(404);
    expect((await api.put(`${BASE}/theirs/settings`, { definition: l.definition })).status).toBe(404);
    expect((await api.put(`${BASE}/theirs/compositions/${c.id}/draft`, { definition: c.definition })).status).toBe(404);
    expect((await api.post(`${BASE}/theirs/compositions/${c.id}/publish`)).status).toBe(404);
    expect((await api.patch(`${BASE}/theirs/compositions/${c.id}`, { enabled: false })).status).toBe(404);
    expect((await api.delete(`${BASE}/theirs/compositions/${c.id}`)).status).toBe(404);
    expect((await api.post(`${BASE}/theirs/publish`)).status).toBe(404);
    expect((await api.delete(`${BASE}/theirs`)).status).toBe(404);
    expect((await api.post(`${BASE}/theirs/compositions`, { source: 'shipped:swiss', kind: 'photo', index: 0 })).status).toBe(404);
    expect((await t.prisma.brandLook.findFirstOrThrow({ where: { slug: 'theirs' } })).brandId).toBe('someone-else');
  });

  it('does not take a composition by uuid from another look, and does not count another brand\'s looks against the limit', async () => {
    const { api } = await foreign();
    const mine = await copy(api, 'mine');
    const theirs = await t.prisma.brandLookComposition.findFirstOrThrow({ where: { brandId: 'someone-else', kind: 'photo' } });
    expect((await api.delete(`${BASE}/mine/compositions/${theirs.id}`)).status).toBe(404);
    expect((await api.put(`${BASE}/mine/compositions/${theirs.id}/draft`, { definition: comp(mine, 'photo').definition })).status).toBe(404);
    expect((await api.get(BASE)).body.own.map((l: { slug: string }) => l.slug)).toEqual(['mine']);
    // the same slug may live in two brands
    await t.prisma.brandLook.create({ data: { brandId: 'someone-else', slug: 'mine', name: 'Theirs', definition: mine.definition as object, origin: 'shipped:retail', engineSchema: 1 } });
    expect((await api.get(`${BASE}/own:mine`)).body.look.name).toBe('Mine');
  });

  it('keeps the active pointer per brand', async () => {
    await t.prisma.brandProfile.create({ data: { id: 'someone-else', settings: currentSettings(null) as object, activeLookRef: 'shipped:swiss' } });
    expect(await looksFor(t.deps).activeLook(scope)).toBeNull();
    expect((await looksFor(t.deps).activeLook(OTHER))?.ref).toBe('shipped:swiss');
  });
});

describe('a look this engine refuses', () => {
  async function stored(patch: Record<string, unknown>) {
    const api = await admin();
    await copy(api);
    await t.prisma.brandLook.updateMany({ where: { slug: 'mine' }, data: patch });
    return api;
  }

  it('is left out of resolveLook and logged once, and the list says it needs attention', async () => {
    const api = await stored({ engineSchema: 99 });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const svc = looksFor(t.deps);
    expect(await svc.resolveLook(scope, 'own:mine')).toBeNull();
    expect(await svc.resolveLook(scope, 'own:mine')).toBeNull();
    expect(warn.mock.calls.filter((c) => c[0] === 'look.skipped')).toHaveLength(1);
    expect(warn.mock.calls[0]![1]).toMatchObject({ slug: 'mine' });
    const row = (await api.get(BASE)).body.own[0];
    expect(row).toMatchObject({ needsAttention: true });
    expect(row.problems[0]).toMatch(/schema 99/);
  });

  it('also when the stored definition no longer validates', async () => {
    const api = await stored({ definition: { schema: 1, id: 'mine', name: 'Mine', origin: 'copy:shipped:retail', dials: { tilt: 99 } } });
    expect(await looksFor(t.deps).resolveLook(scope, 'own:mine')).toBeNull();
    const row = (await api.get(BASE)).body.own[0];
    expect(row.needsAttention).toBe(true);
    expect(row.problems.length).toBeGreaterThan(0);
    expect((await api.put(`${BASE}/active`, { ref: 'own:mine' })).status).toBe(409);
  });
});

describe('the brand pack', () => {
  const brand = { name: 'B', style: { corners: 'soft' } };
  const retail = { id: 'retail', name: 'Retail' };

  it('writes the look and names it in style.direction only when the engine reads looks', () => {
    const reads = (b: Record<string, unknown>) => ('looks' in b ? ["brand.json: looks[0] must have an id"] : []);
    expect(engineReadsLooks(brand, reads)).toBe(true);
    expect(packWithLook(brand, retail, reads)).toEqual({ name: 'B', style: { corners: 'soft', direction: 'retail' }, looks: [retail] });
  });

  it('leaves the brand as it is, and logs once, when the engine does not read looks', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    for (const validate of [() => [] as string[], () => ['brand.json: looks has unknown entries (looks)']]) {
      expect(engineReadsLooks(brand, validate)).toBe(false);
      expect(packWithLook(brand, retail, validate)).toBe(brand);
    }
    expect(warn.mock.calls.filter((c) => c[0] === 'look.engine_unsupported')).toHaveLength(1);
    expect(packWithLook(brand, null, () => ['x'])).toBe(brand);
  });

  it('is written by syncBrand for the active look, in whichever way the installed engine reads looks', async () => {
    const api = await admin();
    await saveBrand();
    await syncBrand(t.deps);
    expect(activeBrand().looks).toBeUndefined();
    const engine = await engineImport<{ validateBrand(b: unknown): string[] }>('design/brand');
    const reads = engineReadsLooks(activeBrand(), (b) => engine.validateBrand(b));
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    expect((await api.put(`${BASE}/active`, { ref: 'shipped:swiss' })).status).toBe(200);
    if (reads) {
      expect(activeBrand().looks.map((l: { id: string }) => l.id)).toEqual(['swiss']);
      expect(activeBrand().style.direction).toBe('swiss');
    } else {
      expect(activeBrand().looks).toBeUndefined();
      expect(warn.mock.calls.some((c) => c[0] === 'look.engine_unsupported')).toBe(true);
    }
    await api.put(`${BASE}/active`, { ref: null });
    expect(activeBrand().looks).toBeUndefined();
  });
});
