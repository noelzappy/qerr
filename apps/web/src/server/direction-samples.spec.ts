// Sample posts that show a design direction: the brand as it would be saved, drawn per direction. Chrome is never started here:
// the drawing is replaced by a stand-in that writes a small file and remembers what it was asked for.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine, type RenderResult } from './engine/pipeline.js';
import { brandSettingsSchema, draftBrandDir, resetBrandState, type BrandSettings } from './services/brand-settings.js';
import { sampleHeadline, sampleLabel } from './services/direction-sample-content.js';
import { clearDirectionSamplesCache, directionSamples } from './services/direction-samples.js';
import { oneAtATime } from './services/render.js';
import { jpegBytes } from './testing-batches.js';
import { createTestApp, type TestApp } from './testing.js';

const postSpec = await import('@vesk/engine/design/post-spec' as string) as {
  postProblems(d: Record<string, unknown>, where?: string, o?: Record<string, unknown>): string[]; POST_KEYS: string[]; POST_FIELDS: Record<string, { max: number }>;
};

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
  clearDirectionSamplesCache();
});

const DEMO = (f: string) => fs.readFileSync(path.join(root, 'brands', 'demo', 'logos', f));
const BEFORE = {
  name: 'Globex Garden', website: 'globex.example', tagline: 'Grow your garden with us', descriptor: '', timezone: 'Europe/London', language: 'British English', money: null,
  colours: { primary: '#2E7D32', accent: '#F9A825', dark: '#1B2A1E', light: '#F3F7F2' }, headlineWeight: 500, corners: 'soft',
  series: [{ key: 'tips', name: 'Tips', ground: 'warm', accent: 'colour' }], spellings: [], voice: '', visualDirection: '', logo: { wordmarkFrom: 0, markGap: 0 },
};
const S = (extra: Record<string, unknown> = {}): BrandSettings => brandSettingsSchema.parse({ ...BEFORE, ...extra });
const admin = async () => t.api(await t.signIn(await t.createUser('admin')));
function upload(api: ReturnType<TestApp['api']>, url: string, name: string, body: Buffer) {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(body)], name));
  return api.post(url, form);
}

interface Call { design: Record<string, unknown>; brandDir: string | undefined; direction: unknown; imageExists: boolean; only: unknown }
// Stands in for the renderer. `fail` says which sample (by stem) fails, and how.
function fakeRender(calls: Call[], fail: Record<string, 'result' | 'throw'> = {}) {
  return async (o: Record<string, unknown>): Promise<RenderResult> => {
    const design = o.design as Record<string, unknown>;
    const brandDir = process.env.BRAND_DIR;
    const brand = JSON.parse(fs.readFileSync(path.join(root, brandDir!, 'brand.json'), 'utf8'));
    calls.push({ design, brandDir, direction: brand.style?.direction, imageExists: typeof design.image === 'string' && fs.existsSync(path.join(root, design.image)), only: o.only });
    const stem = String(o.stem);
    if (fail[stem] === 'throw') throw new Error('boom: secret-looking detail');
    if (fail[stem] === 'result') return { ok: false, files: [], warnings: ['w'], notes: [], error: 'headline does not fit' };
    const dir = path.resolve(String(o.root), String(o.outDir));
    fs.mkdirSync(dir, { recursive: true });
    const abs = path.join(dir, `${stem}-feed.jpg`);
    fs.writeFileSync(abs, jpegBytes(stem));
    return { ok: true, files: [{ size: 'feed', slide: null, file: `${stem}-feed.jpg`, abs, w: 1080, h: 1350 }], warnings: ['one warning', 'one warning'], notes: [] };
  };
}
const draw = (settings: BrandSettings, direction: string, calls: Call[], fail?: Record<string, 'result' | 'throw'>) =>
  directionSamples(t.deps, { settings, direction }, { lock: oneAtATime, render: fakeRender(calls, fail) });

describe('the words of the samples', () => {
  it('use the brand name and tagline within the post limits, never inventing anything', () => {
    expect(sampleLabel('Globex Garden')).toBe('Globex Garden');
    expect(sampleLabel('A very long brand name that goes past the limit')).toBe('A very long brand name that');
    expect(sampleHeadline('Grow your garden with us')).toBe('Grow your garden *with us*');
    expect(sampleHeadline('Grow with us.')).toBe('Grow *with us.*');
    expect(sampleHeadline('Savings')).toBe('Savings');
    expect(sampleHeadline('Two words')).toBe('Two words');
    // an asterisk of the brand's own is never passed on
    expect(sampleHeadline('*Bold* claim about all of us')).toBe('Bold claim about all *of us*');
    const long = 'The quick brown fox jumps over the lazy dog and keeps running through the whole wide world';
    const cut = sampleHeadline(long);
    expect(cut).toBe('The quick brown fox jumps over the lazy dog and keeps running through');
    expect(cut.length).toBeLessThanOrEqual(postSpec.POST_FIELDS.headline!.max);
    expect(cut).not.toContain('*');
    expect(long.startsWith(cut)).toBe(true);
  });
});

describe('directionSamples', () => {
  it('draws a statement, a figure, a picture and a list in the direction, with the brand\'s own words', async () => {
    const calls: Call[] = [];
    const before = process.env.BRAND_DIR;
    const r = await draw(S(), 'swiss', calls);
    expect(r).toMatchObject({ direction: 'swiss', logosMissing: false, cached: false });
    expect(r.samples.map((s) => [s.id, s.kind, s.variant, s.name, s.ok])).toEqual([
      ['statement', 'statement', 0, 'Statement', true], ['figure', 'figure', 0, 'Figure', true], ['photo', 'photo', 0, 'Photo', true], ['list', 'list', 0, 'List', true],
    ]);
    for (const s of r.samples) { expect(s.image).toMatch(/^data:image\/jpeg;base64,/); expect(s.warnings).toEqual(['one warning']); expect(s.error).toBeUndefined(); }
    const [statement, figure, photo, list] = calls.map((c) => c.design);
    expect(statement).toEqual({ template: 'post', kind: 'statement', variant: 0, label: 'Globex Garden', headline: 'Grow your garden *with us*' });
    expect(figure).toMatchObject({ kind: 'figure', big: '3', unit: 'steps', sub: 'A neutral example, not a claim about your brand', label: 'Globex Garden' });
    // a pack brand with no picture of its own shows the engine's synthetic picture
    expect(photo).toMatchObject({ kind: 'photo', image: 'design/assets/demo/scene-market.jpg', headline: 'Grow your garden *with us*' });
    expect(list).toMatchObject({ kind: 'list', headline: 'Three things to check', items: ['First thing', 'Second thing', 'Third thing'] });
    // every design is a valid post design with no key a post does not have, and only the feed size is drawn
    for (const c of calls) {
      expect(postSpec.postProblems(c.design, 'design')).toEqual([]);
      expect(Object.keys(c.design).filter((k) => !postSpec.POST_KEYS.includes(k))).toEqual([]);
      expect(c.design).not.toHaveProperty('sizes');
      expect(c.only).toEqual(['feed']);
      expect(c.direction).toBe('swiss');
    }
    // BRAND_DIR pointed at the draft while drawing, and is back afterwards; the run folder is gone
    expect(new Set(calls.map((c) => c.brandDir)).size).toBe(1);
    expect(calls[0]!.brandDir).not.toBe(before);
    expect(process.env.BRAND_DIR).toBe(before);
    expect(fs.existsSync(path.join(root, 'out', 'direction-samples')) ? fs.readdirSync(path.join(root, 'out', 'direction-samples')) : []).toEqual([]);
  });

  it('restores BRAND_DIR even when drawing throws', async () => {
    const before = process.env.BRAND_DIR;
    const r = await directionSamples(t.deps, { settings: S(), direction: 'retail' }, { lock: oneAtATime, render: async () => { throw new Error('boom'); } });
    expect(r.samples.every((s) => !s.ok)).toBe(true);
    expect(process.env.BRAND_DIR).toBe(before);
  });

  it('keeps the set for five minutes; another direction or changed settings draw again', async () => {
    const calls: Call[] = [];
    const first = await draw(S(), 'swiss', calls);
    expect(first.cached).toBe(false);
    expect(calls).toHaveLength(4);
    const second = await draw(S(), 'swiss', calls);
    expect(calls).toHaveLength(4);
    expect(second.cached).toBe(true);
    expect(second.samples).toEqual(first.samples);
    expect((await draw(S(), 'retail', calls)).cached).toBe(false);
    expect(calls).toHaveLength(8);
    expect(calls.at(-1)!.direction).toBe('retail');
    expect((await draw(S({ name: 'Initech Garden' }), 'swiss', calls)).cached).toBe(false);
    expect(calls).toHaveLength(12);
    expect(calls.at(-1)!.design).toMatchObject({ label: 'Initech Garden' });
    // the direction in the settings is overridden by the one asked for
    const asked = await draw(S({ style: { direction: 'editorial' } }), 'swiss', calls);
    expect(asked.cached).toBe(true);
  });

  it('reports a sample that cannot be made on its own and still draws the others', async () => {
    const calls: Call[] = [];
    const r = await draw(S(), 'editorial', calls, { 'sample-figure': 'result', 'sample-list': 'throw' });
    expect(r.samples.map((s) => s.ok)).toEqual([true, false, true, false]);
    expect(r.samples[1]).toMatchObject({ id: 'figure', error: 'headline does not fit', warnings: ['w'] });
    expect(r.samples[1]!.image).toBeUndefined();
    // an unexpected error is not passed on
    expect(r.samples[3]!.error).toBe('The sample could not be made because of an unexpected error');
    expect(JSON.stringify(r)).not.toContain('secret-looking');
    expect(calls).toHaveLength(4);
    // a set with a failure is not kept
    expect((await draw(S(), 'editorial', calls)).cached).toBe(false);
  });

  it('draws nothing while a saved brand has no logos, and does not keep that answer', async () => {
    const api = await admin();
    expect((await api.put('/api/settings/brand', S())).status).toBe(200);
    const calls: Call[] = [];
    const r = await draw(S(), 'swiss', calls);
    expect(r).toEqual({ direction: 'swiss', logosMissing: true, cached: false, samples: [] });
    expect(calls).toHaveLength(0);
    expect(await draw(S(), 'swiss', calls)).toMatchObject({ logosMissing: true, cached: false });
    // once the logos are there, it draws; with no picture of its own the third sample is a second statement layout
    expect((await upload(api, '/api/settings/brand/logo/full', 'logo.png', DEMO('logo-full.png'))).status).toBe(200);
    expect((await upload(api, '/api/settings/brand/logo/mark', 'mark.png', DEMO('logo-mark.png'))).status).toBe(200);
    const ok = await draw(S(), 'swiss', calls);
    expect(ok.logosMissing).toBe(false);
    expect(ok.samples.map((s) => [s.id, s.variant, s.ok])).toEqual([['statement', 0, true], ['figure', 0, true], ['statement-2', 1, true], ['list', 0, true]]);
    expect(calls[2]!.design).toEqual({ template: 'post', kind: 'statement', variant: 1, label: 'Globex Garden', headline: 'Grow your garden *with us*' });
    for (const c of calls) { expect(postSpec.postProblems(c.design, 'design')).toEqual([]); expect(c.direction).toBe('swiss'); }
  });

  describe('with a picture of the brand\'s own', () => {
    async function brandWithLogos() {
      const api = await admin();
      await api.put('/api/settings/brand', S());
      await upload(api, '/api/settings/brand/logo/full', 'logo.png', DEMO('logo-full.png'));
      await upload(api, '/api/settings/brand/logo/mark', 'mark.png', DEMO('logo-mark.png'));
    }
    const photo = async (title: string, extra: Record<string, unknown>) => {
      const key = `vault/${title}.jpg`;
      await t.storage.putObject(key, jpegBytes(title), 'image/jpeg');
      return t.prisma.vaultItem.create({ data: { kind: 'photo', title, body: '', status: 'confirmed', fileKey: key, fileName: `${title}.jpg`, contentType: 'image/jpeg', size: 80, ...extra } });
    };

    it('copies a photo it may use next to the run, names it without the vault id, and removes the copy', async () => {
      await brandWithLogos();
      await photo('with-people', { licence: 'own', peoplePresent: true, consentRecorded: true });
      await photo('no-licence', {});
      await photo('deleted', { licence: 'own', deletedAt: new Date() });
      const good = await photo('good', { licence: 'own' });
      const calls: Call[] = [];
      const r = await draw(S(), 'retail', calls);
      expect(r.samples.map((s) => s.id)).toEqual(['statement', 'figure', 'photo', 'list']);
      const used = calls[2]!;
      expect(used.design).not.toHaveProperty('vaultItemId');
      expect(String(used.design.image)).toMatch(/^out\/direction-samples\/.+\/in\/1-good\.jpg$/);
      expect(used.imageExists).toBe(true);
      expect(postSpec.postProblems(used.design, 'design')).toEqual([]);
      expect(good.id).toBeTruthy();
      expect(fs.readdirSync(path.join(root, 'out', 'direction-samples'))).toEqual([]);
    });

    it('draws again when the picture changes', async () => {
      await brandWithLogos();
      const calls: Call[] = [];
      await draw(S(), 'retail', calls);
      expect(calls).toHaveLength(4);
      await photo('later', { licence: 'own' });
      const r = await draw(S(), 'retail', calls);
      expect(r.cached).toBe(false);
      expect(r.samples.map((s) => s.id)).toEqual(['statement', 'figure', 'photo', 'list']);
    });
  });
});

describe('draftBrandDir', () => {
  it('writes a pack folder for unsaved settings without touching BRAND_DIR, and reuses the same one', async () => {
    const before = process.env.BRAND_DIR;
    const a = await draftBrandDir(t.deps, S({ style: { direction: 'retail' } }));
    expect(a).toMatchObject({ logosMissing: false });
    expect(a.dir).toMatch(/^state\/brand\/[0-9a-f]{16}$/);
    // no saved brand: the configured pack, with the direction set
    const written = JSON.parse(fs.readFileSync(path.join(root, a.dir, 'brand.json'), 'utf8'));
    expect(written.name).toBe('Acme Savings');
    expect(written.style.direction).toBe('retail');
    expect((await draftBrandDir(t.deps, S({ style: { direction: 'retail' } }))).dir).toBe(a.dir);
    expect((await draftBrandDir(t.deps, S({ style: { direction: 'swiss' } }))).dir).not.toBe(a.dir);
    expect(process.env.BRAND_DIR).toBe(before);
  });

  it('uses the unsaved settings over the saved brand\'s uploads', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', S());
    const d = await draftBrandDir(t.deps, S({ name: 'Unsaved Name', style: { direction: 'editorial' } }));
    expect(d.logosMissing).toBe(true);
    const written = JSON.parse(fs.readFileSync(path.join(root, d.dir, 'brand.json'), 'utf8'));
    expect(written).toMatchObject({ name: 'Unsaved Name', style: { direction: 'editorial' } });
    expect((await t.prisma.brandProfile.findUniqueOrThrow({ where: { id: 'brand' } })).settings).toMatchObject({ name: 'Globex Garden' });
  });
});

describe('POST /api/settings/brand/direction-samples', () => {
  const body = (extra: Record<string, unknown> = {}) => ({ settings: S(), direction: 'swiss', ...extra });

  it('is for admins only', async () => {
    expect((await t.api().post('/api/settings/brand/direction-samples', body())).status).toBe(401);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    expect((await editor.post('/api/settings/brand/direction-samples', body())).status).toBe(403);
  });

  it('refuses a direction or settings that are not valid, and a body with other keys, before anything is drawn', async () => {
    const api = await admin();
    for (const bad of [body({ direction: 'cubist' }), body({ direction: '' }), body({ direction: undefined }), body({ settings: { ...BEFORE, name: '' } }), body({ settings: { ...BEFORE, style: { direction: 'cubist' } } }),
      body({ settings: undefined }), body({ extra: true }), {}]) {
      expect((await api.post('/api/settings/brand/direction-samples', bad)).status, JSON.stringify(bad).slice(0, 80)).toBe(400);
    }
    const runs = path.join(root, 'out', 'direction-samples');
    expect(fs.existsSync(runs) ? fs.readdirSync(runs) : []).toEqual([]);
  });

  it('answers that the logos are missing, without drawing, for a saved brand that has none', async () => {
    const api = await admin();
    await api.put('/api/settings/brand', S());
    const res = await api.post('/api/settings/brand/direction-samples', body());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ direction: 'swiss', logosMissing: true, cached: false, samples: [] });
  });
});
