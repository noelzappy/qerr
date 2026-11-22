// What a post can say: the kinds, their fields, what they need and the brand direction's layouts, from the engine's own registry.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { brandSettingsSchema, resetBrandState } from './services/brand-settings.js';
import { createTestApp, type TestApp } from './testing.js';

const tokens = await import('@vesk/engine/design/tokens' as string) as { DIRECTIONS: string[]; POST_KINDS: string[] };
const postSpec = await import('@vesk/engine/design/post-spec' as string) as { POST_FIELDS: Record<string, { max: number }>; POST_ITEMS: Record<string, number>; POST_REQUIRED: Record<string, string[]> };
const registry = await import('@vesk/engine/design/directions/index' as string) as { compositionsFor(d: string, k: string): Array<{ name: string; describe: string; fields: string[] }> };

let t: TestApp;
beforeAll(async () => { t = await createTestApp(); });
afterAll(() => { resetBrandState(); return t.close(); });
beforeEach(async () => { await t.reset(); resetBrandState(); });

const BRAND = {
  name: 'Globex Garden', website: 'globex.example', tagline: 'Grow with us.', descriptor: '', timezone: 'Europe/London', language: 'British English', money: null,
  colours: { primary: '#2E7D32', accent: '#F9A825', dark: '#1B2A1E', light: '#F3F7F2' }, headlineWeight: 500, corners: 'soft',
  series: [{ key: 'tips', name: 'Tips', ground: 'warm', accent: 'colour' }], spellings: [], voice: '', visualDirection: '', logo: { wordmarkFrom: 0, markGap: 0 },
};
const ORDER = ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'image', 'meta', 'tag'];

describe('GET /api/posts/post-kinds', () => {
  it('needs a signed-in editor or admin', async () => {
    expect((await t.api().get('/api/posts/post-kinds')).status).toBe(401);
    expect((await t.api(await t.signIn(await t.createUser('editor'))).get('/api/posts/post-kinds')).status).toBe(200);
    expect((await t.api(await t.signIn(await t.createUser('admin'))).get('/api/posts/post-kinds')).status).toBe(200);
  });

  it('lists every kind in the engine\'s order with its fields, what it needs and the limits; no variants without a direction', async () => {
    const res = await t.api(await t.signIn(await t.createUser('editor'))).get('/api/posts/post-kinds');
    expect(res.body.direction).toBeNull();
    expect(res.body.kinds.map((k: { kind: string }) => k.kind)).toEqual(tokens.POST_KINDS);
    for (const k of res.body.kinds) {
      const used = new Set(tokens.DIRECTIONS.flatMap((d) => registry.compositionsFor(d, k.kind).flatMap((c) => c.fields)));
      expect(k.fields).toEqual(ORDER.filter((f) => used.has(f)));
      expect(k.required).toEqual(postSpec.POST_REQUIRED[k.kind]);
      expect(k.variants).toEqual([]);
    }
    const spec = postSpec as unknown as { POST_INFO: { min: number; max: number; value: number }; POST_GALLERY: { min: number; max: number; caption: number }; INFO_KEYS: string[] };
    const icons = await import('@vesk/engine/design/icons' as string) as { ICON_NAMES: string[] };
    expect(res.body.limits).toEqual({
      ...Object.fromEntries(['label', 'headline', 'sub', 'big', 'unit', 'quote', 'by', 'meta', 'tag', 'cta'].map((f) => [f, postSpec.POST_FIELDS[f]!.max])),
      items: { min: postSpec.POST_ITEMS.min, max: postSpec.POST_ITEMS.max, chars: postSpec.POST_ITEMS.chars },
      info: { min: spec.POST_INFO.min, max: spec.POST_INFO.max, chars: spec.POST_INFO.value }, gallery: { min: spec.POST_GALLERY.min, max: spec.POST_GALLERY.max, chars: spec.POST_GALLERY.caption },
      infoKeys: spec.INFO_KEYS, icons: icons.ICON_NAMES,
      chart: { min: 2, max: 12, chars: 14, kinds: ['bar', 'hbar', 'line', 'area', 'spark', 'donut', 'progress'], units: ['number', 'currency', 'percent'] },
    });
  });

  it('reports the saved brand\'s direction and its layouts of each kind', async () => {
    const admin = t.api(await t.signIn(await t.createUser('admin')));
    expect((await admin.put('/api/settings/brand', brandSettingsSchema.parse({ ...BRAND, style: { direction: 'swiss' } }))).status).toBe(200);
    // Classic layouts: the saved direction applies (a new brand otherwise starts on the Clean look).
    expect((await admin.put('/api/settings/looks/active', { ref: null })).status).toBe(200);
    const res = await admin.get('/api/posts/post-kinds');
    expect(res.body.direction).toBe('swiss');
    for (const k of res.body.kinds) {
      expect(k.variants).toEqual(registry.compositionsFor('swiss', k.kind).map((c, variant) => ({ variant, name: c.name, describe: c.describe })));
    }
    expect(res.body.kinds.find((k: { kind: string }) => k.kind === 'statement').variants.length).toBeGreaterThan(0);
    // back to none
    await admin.put('/api/settings/brand', brandSettingsSchema.parse(BRAND));
    expect((await admin.get('/api/posts/post-kinds')).body.direction).toBeNull();
  });
});
