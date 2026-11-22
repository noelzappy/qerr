// The look renderer. Part one runs the real thing: the engine and Chrome (a sample picture, one design with its rectangles, the checks of a whole
// look, a post drawn with the active look). Part two replaces the drawing with a stand-in where Chrome would only make it slow: what the routes and
// the gate do with its answers, the font files, the kinds of post of a look.
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pipelineEngine } from './engine/pipeline.js';
import { engineImport } from './engine/root.js';
import { copyFor } from './services/look-copy.js';
import { clearSampleCache, connectLookRenderer, renderStats, sampleCacheSize } from './services/look-render.js';
import { currentSettings, resetBrandState } from './services/brand-settings.js';
import { lookEngine, setLookRenderer, shippedLooks, type GateCheck, type GateRenderRequest } from './services/looks.js';
import { createTestApp, type TestApp } from './testing.js';

let t: TestApp;
let root: string;
beforeAll(async () => { t = await createTestApp(); root = (await pipelineEngine()).root; });
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); clearSampleCache(); });
afterEach(() => setLookRenderer(null));

const BASE = '/api/settings/looks';
const admin = async () => t.api(await t.signIn(await t.createUser('admin')));
const saveBrand = () => t.prisma.brandProfile.create({ data: { settings: currentSettings(null) as object } });
const jpegSize = (b: Buffer) => {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!, len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
};
const decode = (url: string) => Buffer.from(url.replace(/^data:image\/jpeg;base64,/, ''), 'base64');

describe('the real renderer (the engine and Chrome)', () => {
  it('needs a signed-in admin', async () => {
    connectLookRenderer(t.deps);
    for (const url of ['preview', 'preview-design', 'mine/gate']) expect((await t.api().post(`${BASE}/${url}`, {})).status).toBe(401);
    const editor = t.api(await t.signIn(await t.createUser('editor')));
    for (const url of ['preview', 'preview-design', 'mine/gate']) expect((await editor.post(`${BASE}/${url}`, {})).status).toBe(403);
  });

  it('draws a sample picture of a shipped look, keeps it, and draws one design with the rectangle of each element', async () => {
    connectLookRenderer(t.deps);
    const api = await admin();
    const before = renderStats.runs;
    const res = await api.post(`${BASE}/preview`, { ref: 'shipped:retail', kinds: ['statement', 'figure'] });
    expect(res.status).toBe(200);
    expect(res.body.samples.map((s: { kind: string; ok: boolean }) => [s.kind, s.ok])).toEqual([['statement', true], ['figure', true]]);
    const bytes = decode(res.body.samples[0].image);
    expect(bytes.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(jpegSize(bytes)).toEqual({ w: 1080, h: 1350 });
    expect(renderStats.runs).toBe(before + 1); // both kinds in one Chrome run
    expect(sampleCacheSize()).toBe(2);
    // asked again: the same pictures, no Chrome
    const again = await api.post(`${BASE}/preview`, { ref: 'shipped:retail', kinds: ['figure', 'statement'] });
    expect(again.body.samples.map((s: { kind: string; image: string }) => s.image)).toEqual([res.body.samples[1].image, res.body.samples[0].image]);
    expect(renderStats.runs).toBe(before + 1);
    // another look is another picture
    expect((await api.post(`${BASE}/preview`, { ref: 'shipped:swiss', kinds: ['statement'] })).body.samples[0].ok).toBe(true);
    expect(sampleCacheSize()).toBe(3);

    const one = await api.post(`${BASE}/preview-design`, { ref: 'shipped:swiss', kind: 'photo', index: 0, scenario: 'stress' });
    expect(one.status).toBe(200);
    expect(one.body.problems).toEqual([]);
    expect(one.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(jpegSize(decode(one.body.image))).toEqual({ w: 1080, h: 1350 });
    expect(one.body.rects.length).toBeGreaterThan(2);
    for (const r of one.body.rects) {
      expect(r.el).toMatch(/^[0-9]+(\.[0-9]+)*$/);
      expect(r.w).toBeGreaterThan(0); expect(r.h).toBeGreaterThan(0);
      expect(r.x).toBeGreaterThan(-200); expect(r.x + r.w).toBeLessThan(1280);
    }
    // an unfinished draft is not drawn
    const runs = renderStats.runs;
    const comp = (await api.get(`${BASE}/shipped:swiss`)).body.look.definition.compositions.find((c: { kind: string }) => c.kind === 'photo');
    const bad = await api.post(`${BASE}/preview-design`, { look: { ...(await api.get(`${BASE}/shipped:swiss`)).body.look.definition, origin: 'copy:shipped:swiss' }, kind: 'photo', index: 0, draft: { ...comp, fields: {} } });
    expect(bad.status).toBe(200);
    expect(bad.body.problems.length).toBeGreaterThan(0);
    expect(renderStats.runs).toBe(runs);
  }, 120_000);

  it('checks every design of a look with sample, stress and minimal copy, and publishes it on those checks', async () => {
    connectLookRenderer(t.deps);
    const api = await admin();
    expect((await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', slug: 'mine', name: 'Mine' })).status).toBe(201);
    const started = Date.now();
    const gate = await api.post(`${BASE}/mine/gate`);
    const took = Date.now() - started;
    expect(gate.status).toBe(200);
    const comps = gate.body.look.compositions as Array<{ kind: string; name: string; gate: { passed: boolean; checks: GateCheck[] } }>;
    expect(comps).toHaveLength(9);
    for (const c of comps) {
      expect(c.gate.checks.map((k) => k.name)).toEqual(['validate', 'render:sample', 'render:stress', 'render:minimal']);
      expect(c.gate.checks.filter((k) => !k.passed), `${c.kind}/${c.name}`).toEqual([]);
      expect(c.gate.passed).toBe(true);
    }
    expect(took).toBeLessThan(120_000);
    const publish = await api.post(`${BASE}/mine/publish`);
    expect(publish.status).toBe(200);
    expect(publish.body.look.status).toBe('ready');
  }, 240_000);

  it('draws a post with the look the brand uses, and refuses a layout the look does not have', async () => {
    connectLookRenderer(t.deps);
    const api = await admin();
    await saveBrand();
    const demo = (f: string) => fs.readFileSync(path.join(root, 'brands', 'demo', 'logos', f));
    for (const [which, file] of [['full', 'logo-full.png'], ['mark', 'logo-mark.png']] as const) {
      const form = new FormData();
      form.set('file', new File([new Uint8Array(demo(file))], file));
      expect((await api.post(`/api/settings/brand/logo/${which}`, form)).status).toBe(200);
    }
    expect((await api.put(`${BASE}/active`, { ref: 'shipped:swiss' })).status).toBe(200);
    const kinds = await api.get('/api/posts/post-kinds');
    expect(kinds.body.direction).toBe('swiss');
    expect(kinds.body.kinds.find((k: { kind: string }) => k.kind === 'statement').variants.map((v: { name: string }) => v.name)).toHaveLength(2);
    const post = await api.post('/api/posts/preview-design', { design: { template: 'post', kind: 'statement', variant: 1, headline: 'Fresh bread, *every morning*' } });
    expect(post.status).toBe(200);
    expect(post.body.ok).toBe(true);
    expect(jpegSize(decode(post.body.image))).toEqual({ w: 1080, h: 1350 });
    const tooFar = await api.post('/api/posts/preview-design', { design: { template: 'post', kind: 'statement', variant: 5, headline: 'Fresh bread' } });
    expect(tooFar.status).toBe(422);
    expect(tooFar.body.details.join(' ')).toMatch(/variant/i);
  }, 120_000);
});

describe('what the routes and the gate do with a renderer\'s answers', () => {
  const IMG = 'data:image/jpeg;base64,/9j/4AAQ';
  function standIn(opts: { fail?: (kind: string, index: number) => string | null } = {}) {
    const calls = { preview: [] as Array<{ userId?: string; kinds: string[] }>, gate: [] as GateRenderRequest[] };
    setLookRenderer({
      preview: async (req) => { calls.preview.push({ userId: req.userId, kinds: req.kinds }); return { samples: req.kinds.map((kind) => ({ kind, ok: true, image: IMG, warnings: [] })) }; },
      previewComposition: async (req) => (req.userId === 'superseded' ? { superseded: true } : { image: IMG, rects: [], warnings: [] }),
      gate: async (req) => {
        calls.gate.push(req);
        return req.targets.map((tg) => { const why = opts.fail?.(tg.kind, tg.index) ?? null; return [{ name: 'render:sample', passed: why === null, ...(why ? { message: why } : {}) }]; });
      },
    });
    return calls;
  }
  const copyOf = async (api: Awaited<ReturnType<typeof admin>>) => (await api.post(`${BASE}/duplicate`, { source: 'shipped:retail', slug: 'mine', name: 'Mine' })).body.look;

  it('passes the signed-in person to the renderer, so a newer request replaces an older one', async () => {
    const calls = standIn();
    const api = await admin();
    expect((await api.post(`${BASE}/preview`, { ref: 'shipped:retail', kinds: ['photo'] })).status).toBe(200);
    expect(calls.preview[0]!.userId).toMatch(/\S/);
    setLookRenderer({ preview: async () => ({ samples: [], superseded: true }), previewComposition: async () => ({ superseded: true }) });
    expect((await api.post(`${BASE}/preview`, { ref: 'shipped:retail' })).body).toMatchObject({ samples: [], superseded: true });
    expect((await api.post(`${BASE}/preview-design`, { ref: 'shipped:retail', kind: 'photo', index: 0 })).body).toMatchObject({ rects: [], problems: [], superseded: true });
  });

  it('stores a record on each enabled design: which render checks passed, and why one did not', async () => {
    const calls = standIn({ fail: (kind, index) => (kind === 'photo' && index === 1 ? 'Stress copy: the headline does not fit' : null) });
    const api = await admin();
    await copyOf(api);
    const res = await api.post(`${BASE}/mine/gate`);
    expect(res.status).toBe(200);
    expect(calls.gate).toHaveLength(1);
    expect(calls.gate[0]!.targets).toEqual([
      { kind: 'statement', index: 0 }, { kind: 'statement', index: 1 }, { kind: 'figure', index: 0 }, { kind: 'list', index: 0 }, { kind: 'quote', index: 0 },
      { kind: 'photo', index: 0 }, { kind: 'photo', index: 1 }, { kind: 'event', index: 0 }, { kind: 'offer', index: 0 },
    ]);
    const comps = res.body.look.compositions as Array<{ kind: string; gate: { passed: boolean; checks: GateCheck[]; definitionHash: string } }>;
    const failed = comps.filter((c) => !c.gate.passed);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.kind).toBe('photo');
    expect(failed[0]!.gate.checks.find((k) => !k.passed)).toMatchObject({ name: 'render:sample', message: 'Stress copy: the headline does not fit' });
    expect(comps.filter((c) => c.gate.passed).every((c) => c.gate.checks.map((k) => k.name).join() === 'validate,render:sample')).toBe(true);
    // a design that is switched off is not checked
    const off = comps[0]!;
    const id = (res.body.look.compositions as Array<{ id: string }>)[0]!.id;
    expect((await api.patch(`${BASE}/mine/compositions/${id}`, { enabled: false })).status).toBe(200);
    calls.gate.length = 0;
    await api.post(`${BASE}/mine/gate`);
    expect(calls.gate[0]!.targets).toHaveLength(8);
    expect(off.kind).toBe('statement');
  });

  it('refuses to publish a look whose render checks fail, naming the design and the reason, and checks only what has no passing record', async () => {
    let fail = true;
    const calls = standIn({ fail: (kind) => (fail && kind === 'figure' ? 'Minimal copy: an empty area covers 51% of the page' : null) });
    const api = await admin();
    await copyOf(api);
    const refused = await api.post(`${BASE}/mine/publish`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/checks did not pass/);
    expect(refused.body.details).toEqual([{ path: expect.stringMatching(/^figure\//), message: 'Minimal copy: an empty area covers 51% of the page' }]);
    expect((await api.get(`${BASE}/own:mine`)).body.look.status).toBe('draft');
    // after a fix the figure is checked again; the designs that passed are not
    fail = false;
    calls.gate.length = 0;
    const ok = await api.post(`${BASE}/mine/publish`);
    expect(ok.status).toBe(200);
    expect(calls.gate).toHaveLength(1);
    expect(calls.gate[0]!.targets).toEqual([{ kind: 'figure', index: 0 }]);
    calls.gate.length = 0;
    expect((await api.post(`${BASE}/mine/publish`)).status).toBe(200);
    expect(calls.gate).toHaveLength(0);
  });

  it('lists the kinds of post of the brand\'s own look, from the look\'s brief', async () => {
    standIn();
    const api = await admin();
    await saveBrand();
    await copyOf(api);
    expect((await api.post(`${BASE}/mine/publish`)).status).toBe(200);
    expect((await api.put(`${BASE}/active`, { ref: 'own:mine' })).status).toBe(200);
    const res = await t.api(await t.signIn(await t.createUser('editor'))).get('/api/posts/post-kinds');
    expect(res.body.direction).toBe('mine');
    const statement = res.body.kinds.find((k: { kind: string }) => k.kind === 'statement');
    expect(statement.variants.map((v: { name: string }) => v.name)).toEqual(['Stack', 'Mantra']);
    // a post is held to the look's own designs and limits before any drawing
    const eng = await pipelineEngine();
    expect(eng.designBlockProblems({ template: 'post', kind: 'statement', variant: 1, headline: 'Fresh *bread*' }, { root: eng.root })).toEqual([]);
    expect(eng.designBlockProblems({ template: 'post', kind: 'statement', variant: 2, headline: 'Fresh *bread*' }, { root: eng.root }).join(' ')).toMatch(/variant/);
    expect(eng.designBlockProblems({ template: 'post', kind: 'figure', variant: 0, big: '123456789' }, { root: eng.root }).join(' ')).toMatch(/big/);
  });
});

describe('the font files for the typeface cards', () => {
  const fontsDir = path.join(path.dirname(new URL(import.meta.resolve('@vesk/engine/package.json')).pathname), 'design', 'fonts');
  it('serves a file the engine\'s font library lists, with a long-lived cache header, to a signed-in admin only', async () => {
    const lib = JSON.parse(fs.readFileSync(path.join(fontsDir, 'library.json'), 'utf8')) as Array<{ family: string; dir: string; files: Array<{ file: string }> }>;
    const fraunces = lib.find((f) => f.family === 'Fraunces')!;
    const url = `${BASE}/fonts/${encodeURIComponent('Fraunces')}/${fraunces.files[0]!.file}`;
    expect((await t.api().get(url)).status).toBe(401);
    expect((await t.api(await t.signIn(await t.createUser('editor'))).get(url)).status).toBe(403);
    const cookie = await t.signIn(await t.createUser('admin'));
    const res = await t.app.request(url, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('font/woff2');
    expect(res.headers.get('cache-control')).toMatch(/immutable/);
    expect(res.headers.get('cache-control')).toMatch(/max-age=31536000/);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(fs.readFileSync(path.join(fontsDir, fraunces.dir, fraunces.files[0]!.file)))).toBe(true);
    // a family whose files sit in the fonts folder itself
    const inter = lib.find((f) => f.dir === '.')!;
    expect((await (await admin()).get(`${BASE}/fonts/${encodeURIComponent(inter.family)}/${inter.files[0]!.file}`)).status).toBe(200);
  });

  it('serves nothing the library does not list: no path from the request reaches the disk', async () => {
    const api = await admin();
    const f = 'fraunces-v38-normal-latin.woff2';
    for (const bad of [
      `Fraunces/${f}x`, `Fraunces/..%2F..%2Fpackage.json`, `Fraunces/%2e%2e%2flibrary.json`, `..%2Ffonts/library.json`, `Nope/${f}`, `Archivo/${f}`,
      `Fraunces/library.json`, `Fraunces/OFL.txt`, `%2e%2e/%2e%2e`, `Fraunces/${f}%00`, `fraunces/${f}`,
    ]) expect((await api.get(`${BASE}/fonts/${bad}`)).status, bad).toBe(404);
    expect((await api.get(`${BASE}/fonts/Fraunces`)).status).not.toBe(200);
  });

  it('is allowed by the page\'s content security policy (font-src \'self\')', async () => {
    const csp = (await t.app.request('/healthz')).headers.get('content-security-policy') ?? '';
    expect(csp).toMatch(/font-src [^;]*'self'/);
  });

  it('is named in the answer of the list, per family, for the cards', async () => {
    const res = await (await admin()).get(BASE);
    const fraunces = res.body.fonts.find((f: { family: string }) => f.family === 'Fraunces');
    expect(fraunces.files.length).toBeGreaterThan(0);
    expect(fraunces.files[0]).toMatchObject({ file: expect.stringMatching(/\.woff2$/), style: expect.any(String), weight: expect.any(String), range: expect.stringMatching(/^U\+/) });
  });
});

describe('the copy a look is drawn with', () => {
  it('stays inside the budgets of the look\'s own brief, for every design, scenario and attempt', async () => {
    const eng = await lookEngine();
    const { ATTEMPTS } = await import('./services/look-copy.js');
    const spec = await engineImport<{ validateDesign(d: unknown, w: string, o: unknown): string[] }>('design/spec');
    for (const look of await shippedLooks()) {
      const brief = eng.lookBrief(look);
      for (const [kind, entry] of Object.entries(brief.kinds)) {
        for (const v of entry.variants) {
          for (const scenario of ['sample', 'stress', 'minimal'] as const) {
            for (const a of ATTEMPTS[scenario]) {
              const design = { template: 'post', kind, variant: v.index, name: 'x', ...copyFor(kind, v, scenario, a) };
              expect(spec.validateDesign(design, 'design', { look }), `${look.id}/${kind}/${v.index} ${scenario} ${JSON.stringify(a)}`).toEqual([]);
            }
          }
        }
      }
    }
  });
});
