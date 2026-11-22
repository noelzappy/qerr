// The AI designer in the app (services/ai-design.ts): Redesign with AI on a batch, the Design choice of Draft with AI, switching a post between
// its two designs, and editing a post's own design. The AI library is a fake that answers with compositions; the engine is real. The tests
// that draw (the trial render, a post whose own design a check refuses) need Chrome and are skipped without it.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateAiOptions } from './ai.js';
import { engineImport } from './engine/root.js';
import { pipelineEngine } from './engine/pipeline.js';
import { currentSettings, resetBrandState } from './services/brand-settings.js';
import { OWN_DESIGN_NOT_USED, renderPost } from './services/render.js';
import { runDraftBatch } from './services/ai-jobs.js';
import { runRedesign, switchDesign } from './services/ai-design.js';
import { addImage, seedBatch } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

const fake = vi.hoisted(() => ({
  calls: [] as Array<{ task: string; input: any }>,
  design: null as null | ((input: any) => Promise<any>),
  draft: null as any,
  options: null as null | CreateAiOptions,
}));
vi.mock('./ai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ai.js')>()),
  loadAI: async () => ({
    createAI: (options: CreateAiOptions) => {
      fake.options = options;
      return {
        designBatch: async (input: any) => { fake.calls.push({ task: 'design', input }); return fake.design!(input); },
        draftBatch: async (input: any) => { fake.calls.push({ task: 'draft', input }); return fake.draft; },
      };
    },
  }),
}));

let t: TestApp;
let CLEAN: Record<string, any>;
beforeAll(async () => {
  t = await createTestApp();
  const looks = await engineImport<{ shippedLooks(): Record<string, any> }>('design/directions/index');
  CLEAN = JSON.parse(JSON.stringify(looks.shippedLooks().clean));
});
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); fake.calls.length = 0; fake.design = null; fake.draft = null; });

const KEY = 'sk-ant-SECRETAIKEY-DESIGN-4242';
async function setup() {
  const admin = t.api(await t.signIn(await t.createUser('admin')));
  await t.prisma.brandProfile.create({ data: { settings: currentSettings(null) as object } });
  expect((await admin.put('/api/settings/looks/active', { ref: 'shipped:clean' })).status).toBe(200);
  expect((await admin.post('/api/settings/ai/providers', { name: 'Claude', kind: 'anthropic', model: 'm', apiKey: KEY, tasks: ['draft'], inputPricePerMTok: 3, outputPricePerMTok: 15 })).status).toBe(201);
  expect((await admin.put('/api/settings/ai/budget', { monthlyBudgetUsd: 5 })).status).toBe(200);
  const editor = await t.createUser('editor');
  return { admin, editor, editorApi: t.api(await t.signIn(editor)) };
}
// The Clean look's own statement design with a soft circle of art behind the words: what the fake AI answers.
function aiStatement(name = 'AI statement') {
  const c = JSON.parse(JSON.stringify(CLEAN.compositions.find((x: any) => x.kind === 'statement')));
  c.name = name;
  c.elements.unshift({ type: 'art', place: { inset: 'page' }, z: 0, shapes: [{ shape: 'circle', cx: 900, cy: 120, r: 260, colour: 'soft' }] });
  return c;
}
const STATEMENT = (headline: string) => ({ template: 'post', kind: 'statement', headline, sub: 'One line that says why it matters.' });

async function batchOfTwo(editor: { id: string }, status: 'approved' | 'draft' = 'approved') {
  const { batch, posts } = await seedBatch(t, editor, { posts: [{ key: 'one', design: STATEMENT('Save a little *every day*'), status }, { key: 'two', design: STATEMENT('Your group, *your rules*') }] });
  // the images the look's design made (a render), and a hand upload that is never touched
  const made = await addImage(t, batch.id, 'one', 'one-feed.jpg', 'look-render');
  const hand = (posts[0]!.media as any[])[0];
  await t.prisma.post.update({ where: { id: posts[0]!.id }, data: { media: [{ ...made, source: 'render', renderSize: 'feed', slide: null }, hand] as never } });
  return { batch, posts };
}

describe('Redesign with AI', () => {
  it('gives each post the AI\'s design, keeps the look\'s design and its images for switching back, and takes an approval back; words never change', async () => {
    const { editor } = await setup();
    const { batch, posts } = await batchOfTwo(editor);
    fake.design = async (input) => ({ results: input.posts.map((p: any, i: number) => (i === 0 ? { id: p.id, composition: aiStatement(), reasons: [], tries: 1 } : { id: p.id, composition: null, reasons: ['validation: a reason'], tries: 2 })), notes: { promptVersion: 'design-1', usage: { costUsd: 0.04 } } });
    await runRedesign(t.deps, { batchId: batch.id, actorId: editor.id });

    expect(fake.calls).toHaveLength(1);
    const asked = fake.calls[0]!.input;
    expect(asked.posts.map((p: any) => p.id)).toEqual(posts.map((p) => p.id));
    expect(asked.posts[0].design).toMatchObject({ kind: 'statement', headline: 'Save a little *every day*' });
    expect(typeof asked.check).toBe('function');

    const one = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[0]!.id } });
    expect((one.design as any).composition.name).toBe('AI statement');
    expect((one.design as any).headline).toBe('Save a little *every day*');
    const alt = one.designAlt as any;
    expect(alt.design).toEqual(STATEMENT('Save a little *every day*'));
    expect(alt.media).toHaveLength(1);
    expect(alt.media[0].key).toMatch(/\/one\/alt-[0-9a-f]{8}-/);
    expect(t.storage.objects.has(alt.media[0].key)).toBe(true);
    expect(one.status).toBe('draft');
    expect(one.renderStatus).toBe('queued');
    expect(t.jobs.enqueued.some((j) => j.name === 'render-post' && (j.payload as any).postId === one.id)).toBe(true);
    // the post the AI could not design well keeps the look's design and is untouched
    const two = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[1]!.id } });
    expect(two.design).toEqual(STATEMENT('Your group, *your rules*'));
    expect(two.designAlt).toBeNull();
    const run = await t.prisma.activityRun.findFirstOrThrow({ where: { kind: 'redesign-batch' } });
    expect(run.status).toBe('done');
    expect(run.result).toMatchObject({ designed: 1, of: 2, skipped: [{ postKey: 'two', reasons: ['validation: a reason'] }] });
    expect(await t.prisma.auditLog.count({ where: { action: 'ai.redesign_batch' } })).toBe(1);
    expect(JSON.stringify(await t.prisma.auditLog.findMany())).not.toContain('SECRETAIKEY');
  });

  it('switches a post back to the look\'s design and to the AI\'s again, reusing each design\'s images while the words are the same', async () => {
    const { editor, editorApi } = await setup();
    const { batch, posts } = await batchOfTwo(editor, 'draft');
    fake.design = async (input) => ({ results: [{ id: input.posts[0].id, composition: aiStatement(), reasons: [], tries: 1 }] });
    await runRedesign(t.deps, { batchId: batch.id, actorId: editor.id, postIds: [posts[0]!.id] });
    // the AI's images, as a render would have made them
    const aiImage = await addImage(t, batch.id, 'one', 'one-feed.jpg', 'ai-render');
    const now = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[0]!.id } });
    await t.prisma.post.update({ where: { id: now.id }, data: { renderStatus: 'ok', media: [{ ...aiImage, source: 'render', renderSize: 'feed', slide: null }, ...(now.media as any[]).filter((m) => m.source === 'upload')] as never } });
    t.jobs.enqueued.length = 0;

    const back = await editorApi.post(`/api/posts/${now.id}/design/switch`, {});
    expect(back.status).toBe(200);
    expect(back.body.post.aiDesigned).toBe(false);
    expect(back.body.post.otherDesign).toMatchObject({ aiDesigned: true });
    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: now.id } });
    expect((row.design as any).composition).toBeUndefined();
    expect(row.renderStatus).toBe('ok');
    const media = row.media as any[];
    expect(media.find((m) => m.source === 'render').sha256).toBe((now.designAlt as any).media[0].sha256);
    expect(media.filter((m) => m.source === 'upload')).toHaveLength(1);
    expect(t.jobs.enqueued.filter((j) => j.name === 'render-post')).toHaveLength(0);
    // the AI's images went with its design
    expect((row.designAlt as any).media[0].sha256).toBe(aiImage.sha256);

    // after an edit of the words, switching draws the post again
    await editorApi.patch(`/api/posts/${now.id}`, { design: { ...(row.design as object), headline: 'New *words*' } });
    t.jobs.enqueued.length = 0;
    const again = await editorApi.post(`/api/posts/${now.id}/design/switch`, {});
    expect(again.status).toBe(200);
    const row2 = await t.prisma.post.findUniqueOrThrow({ where: { id: now.id } });
    expect(row2.design).toMatchObject({ headline: 'New *words*', composition: { name: 'AI statement' } });
    expect(row2.renderStatus).toBe('queued');
    expect(t.jobs.enqueued.some((j) => j.name === 'render-post')).toBe(true);
    // a post with no other design cannot switch
    expect((await editorApi.post(`/api/posts/${posts[1]!.id}/design/switch`, {})).status).toBe(409);
  });

  it('is requested through the API for a batch (or some of its posts), one at a time, and refused without a provider or with nothing to design', async () => {
    const { editor, editorApi } = await setup();
    const { batch, posts } = await batchOfTwo(editor);
    const res = await editorApi.post(`/api/batches/${batch.id}/redesign`, { postIds: [posts[0]!.id] });
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    const job = t.jobs.enqueued.find((j) => j.name === 'redesign-batch')!;
    expect(job.payload).toMatchObject({ batchId: batch.id, actorId: editor.id, postIds: [posts[0]!.id] });
    expect((await editorApi.post(`/api/batches/${batch.id}/redesign`, { postIds: ['not-a-uuid'] })).status).toBe(400);
    const { batch: empty } = await seedBatch(t, editor, { posts: [{ key: 'carousel', design: { template: 'carousel', pages: [] } }] });
    expect((await editorApi.post(`/api/batches/${empty.id}/redesign`, {})).status).toBe(409);
    await t.prisma.aiProvider.deleteMany();
    expect((await editorApi.post(`/api/batches/${batch.id}/redesign`, {})).status).toBe(409);
  });
});

describe('a post\'s own design in the design editor', () => {
  it('checks a draft against the look, refuses a hostile one, and saves a valid one (the look\'s design kept to switch back)', async () => {
    const { editor, editorApi } = await setup();
    const { posts } = await batchOfTwo(editor, 'draft');
    const bad = aiStatement(); bad.elements[0].shapes[0].colour = '#ff0000'; bad.render = 'x';
    const checked = await editorApi.post(`/api/posts/${posts[1]!.id}/own-design/check`, { definition: bad });
    expect(checked.status).toBe(200);
    expect(checked.body.problems.length).toBeGreaterThan(0);
    expect(JSON.stringify(checked.body)).not.toContain('#ff0000');
    expect((await editorApi.post(`/api/posts/${posts[1]!.id}/own-design/check`, { definition: { ...aiStatement(), kind: 'photo' } })).status).toBe(400);
    expect((await editorApi.post(`/api/posts/${posts[1]!.id}/own-design/check`, { definition: aiStatement() })).body.problems).toEqual([]);
    expect((await editorApi.put(`/api/posts/${posts[1]!.id}/own-design`, { definition: bad })).status).toBe(422);
    const saved = await editorApi.put(`/api/posts/${posts[1]!.id}/own-design`, { definition: aiStatement('Edited') });
    expect(saved.status).toBe(200);
    expect(saved.body.post.aiDesigned).toBe(true);
    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[1]!.id } });
    expect((row.design as any).composition.name).toBe('Edited');
    expect((row.designAlt as any).design).toEqual(STATEMENT('Your group, *your rules*'));
    expect(row.renderStatus).toBe('queued');
    // editing it again keeps the look's design as the other one
    await editorApi.put(`/api/posts/${posts[1]!.id}/own-design`, { definition: aiStatement('Edited twice') });
    const row2 = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[1]!.id } });
    expect((row2.design as any).composition.name).toBe('Edited twice');
    expect((row2.designAlt as any).design).toEqual(STATEMENT('Your group, *your rules*'));
    // a batch file may carry a post's own design, and it is checked on import like any design
    const imported = await editorApi.post('/api/batches/import', { json: { name: 'own', timezone: 'UTC', defaultTime: '09:00', posts: [{ id: 'own-1', date: '2027-06-02', title: 'Own', caption: 'Words #AcmeSavings', design: { ...STATEMENT('Imported *design*'), composition: aiStatement('Imported') } }] } });
    expect(imported.status).toBe(201);
    const refused = await editorApi.post('/api/batches/import', { json: { name: 'own-bad', timezone: 'UTC', defaultTime: '09:00', posts: [{ id: 'own-2', date: '2027-06-02', title: 'Own', caption: 'Words #AcmeSavings', design: { ...STATEMENT('Imported *design*'), composition: bad } }] } });
    expect(refused.status).toBe(422);
  });
});

describe('Draft with AI: Design', () => {
  it('with "AI-designed", the new batch\'s posts are designed by the AI after drafting; with the look\'s designs, no design call is made', async () => {
    const { editor } = await setup();
    const vault = await t.prisma.vaultItem.create({ data: { kind: 'fact', title: 'Members', body: 'Members save together.', status: 'confirmed' } });
    fake.draft = { batch: { name: 'x', timezone: 'UTC', defaultTime: '09:00', posts: [{ id: 'p1', date: '2026-12-02', title: 'T', caption: 'Words #AcmeSavings', design: STATEMENT('Members save *together*'), sources: [vault.id] }] }, notes: {} };
    fake.design = async (input) => ({ results: input.posts.map((p: any) => ({ id: p.id, composition: aiStatement(), reasons: [], tries: 1 })) });
    const out = await runDraftBatch(t.deps, { actorId: editor.id, brief: { count: 1, periodStart: '2026-12-01', periodEnd: '2026-12-31', design: 'ai' } });
    expect(fake.calls.map((c) => c.task)).toEqual(['draft', 'design']);
    const post = await t.prisma.post.findFirstOrThrow({ where: { batchId: out.batchId } });
    expect((post.design as any).composition.name).toBe('AI statement');
    expect((post.designAlt as any).design).toMatchObject({ headline: 'Members save *together*' });
    const run = await t.prisma.activityRun.findFirstOrThrow({ where: { kind: 'draft-batch' } });
    expect(run.result).toMatchObject({ aiDesign: { designed: 1, of: 1 } });

    fake.calls.length = 0;
    await runDraftBatch(t.deps, { actorId: editor.id, brief: { count: 1, periodStart: '2026-12-01', periodEnd: '2026-12-31' } });
    expect(fake.calls.map((c) => c.task)).toEqual(['draft']);
  });
});

// ---- with Chrome ----
let chrome = false;
try { chrome = !!(await pipelineEngine()).findChrome(); } catch { chrome = false; }
describe.skipIf(!chrome)('with Chrome', () => {
  it('the trial render refuses a design whose art covers the words, and passes a good one; a post whose own design a check refuses is drawn with the look\'s design and says why', async () => {
    const { editor } = await setup();
    const { batch, posts } = await batchOfTwo(editor, 'draft');
    const over = aiStatement('Covering'); over.elements[0] = { type: 'art', place: { inset: 'page' }, z: 9, shapes: [{ shape: 'rect', x: 0, y: 0, w: 1000, h: 1000, colour: 'accent' }] };
    let verdicts: string[][] = [];
    // the headline in the ink of a light page on the dark page: the page only warns about it for a look's design; the AI's is refused
    const unreadable = aiStatement('Unreadable'); unreadable.ground = 'dark';
    const noInk = (list: any[]) => { for (const e of list) { delete e.ink; noInk(e.children ?? []); } };
    noInk(unreadable.elements);
    fake.design = async (input) => {
      verdicts = [await input.check(input.posts[0].id, over), await input.check(input.posts[0].id, aiStatement()), await input.check(input.posts[0].id, unreadable)];
      return { results: [{ id: input.posts[0].id, composition: aiStatement(), reasons: [], tries: 2 }] };
    };
    await runRedesign(t.deps, { batchId: batch.id, actorId: editor.id, postIds: [posts[0]!.id] });
    expect(verdicts[0]!.join(' ')).toMatch(/art lies over the words/);
    expect(verdicts[1]).toEqual([]);
    expect(verdicts[2]!.join(' ')).toMatch(/low contrast/);

    // a post that carries an own design the page refuses is still made, with the look's design, and says so (the brand's logos first)
    const engine = await pipelineEngine();
    const logo = (f: string) => { const form = new FormData(); form.set('file', new File([new Uint8Array(fs.readFileSync(path.join(engine.root, 'brands', 'demo', 'logos', f)))], f)); return form; };
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    expect((await admin.post('/api/settings/brand/logo/full?wordmarkFrom=360&markGap=39', logo('logo-full.png'))).status).toBe(200);
    expect((await admin.post('/api/settings/brand/logo/mark', logo('logo-mark.png'))).status).toBe(200);
    await t.prisma.post.update({ where: { id: posts[1]!.id }, data: { design: { ...STATEMENT('Your group, *your rules*'), composition: over } as never, renderStatus: 'queued' } });
    await renderPost(t.deps, { postId: posts[1]!.id });
    const row = await t.prisma.post.findUniqueOrThrow({ where: { id: posts[1]!.id } });
    expect(row.renderError).toBeNull();
    expect(row.renderStatus).toBe('ok');
    expect(row.warnings.some((w) => w.includes(OWN_DESIGN_NOT_USED) && /art lies over/.test(w))).toBe(true);
  }, 240_000);
});
