// The editor's `post` design (web/src/pages/batches/design-model.ts): a kind of post and only the fields it uses, as designs the
// engine accepts, and a static fallback that cannot drift from the engine's post-spec.mjs.
import { describe, expect, it } from 'vitest';
import {
  convertToPost, isPostDesign, newPostDesign, POST_KIND_FIELDS, POST_KINDS, POST_LIMITS, postFieldsFor, seenLength, setVariant, switchKind, withField,
  type PostKindInfo,
} from '../web/src/pages/batches/design-model';
import { POST_KIND_CATALOGUE } from '../web/src/pages/batches/editor/catalogue';
import { engineImport } from './server/engine/root.js';

interface PostSpec {
  POST_KINDS: string[]; POST_KEYS: string[]; POST_REQUIRED: Record<string, string[]>; POST_ITEMS: { min: number; max: number; chars: number };
  POST_FIELDS: Record<string, { max: number }>; postProblems(d: unknown, where: string, opts: { direction?: string | null }): string[];
}
const engine = () => engineImport<PostSpec>('design/post-spec');

// Plausible words for the required fields of a kind (the editor itself never invents text).
const WORDS: Record<string, unknown> = {
  headline: 'A *short* headline', big: '74%', items: ['One', 'Two'], quote: 'Kind words', image: 'media/pictures/a.jpg', meta: '12 Dec · 6pm · Place', tag: 'New',
};
const filled = (kind: string, required: string[]) => required.reduce((d, f) => withField(d, f, WORDS[f]), newPostDesign(kind));
const keysOk = (d: Record<string, unknown>, keys: string[]) => Object.keys(d).filter((k) => !keys.includes(k) && k !== 'vaultItemId');

describe('the static fallback for a post design', () => {
  it('matches the engine: kinds, required fields, limits', async () => {
    const e = await engine();
    expect([...POST_KINDS]).toEqual(e.POST_KINDS);
    expect(POST_KIND_CATALOGUE.map((k) => k.value)).toEqual(e.POST_KINDS);
    for (const kind of e.POST_KINDS) {
      const own = POST_KIND_FIELDS[kind as keyof typeof POST_KIND_FIELDS];
      expect([...own.required].sort()).toEqual([...e.POST_REQUIRED[kind]!].sort());
      // every field of a kind is a field the engine knows, and the required ones are among them
      for (const f of own.fields) expect([...Object.keys(e.POST_FIELDS), 'items', 'image']).toContain(f);
      for (const f of own.required) expect(own.fields).toContain(f);
    }
    const { items, info, gallery, infoKeys, icons, ...texts } = POST_LIMITS;
    expect(items).toEqual(e.POST_ITEMS);
    expect(texts).toEqual(Object.fromEntries(Object.entries(e.POST_FIELDS).map(([k, v]) => [k, v.max])));
    // the counted lists, the info labels and the icons match the engine's too
    const lists = await engineImport<{ POST_INFO: { min: number; max: number; value: number }; POST_GALLERY: { min: number; max: number; caption: number }; INFO_KEYS: string[] }>('design/post-spec');
    expect(info).toEqual({ min: lists.POST_INFO.min, max: lists.POST_INFO.max, chars: lists.POST_INFO.value });
    expect(gallery).toEqual({ min: lists.POST_GALLERY.min, max: lists.POST_GALLERY.max, chars: lists.POST_GALLERY.caption });
    expect(infoKeys).toEqual(lists.INFO_KEYS);
    expect(icons).toEqual((await engineImport<{ ICON_NAMES: string[] }>('design/icons')).ICON_NAMES);
    // what is seen of a headline: the pill brackets do not count, an icon counts as two (the engine's seenText)
    const seen = (await engineImport<{ seenText(v: string): string }>('design/post-spec')).seenText;
    for (const h of ['Coffee [[on us]] *now*', '{{star}} New [[blend]]', 'Plain \\n words']) expect(seenLength(h)).toBe([...seen(h)].length);
  });

  it('lists a kind\'s fields in the canonical order, from the server when it answers', () => {
    expect(postFieldsFor('figure').fields).toEqual(['label', 'sub', 'big', 'unit']);
    const server: PostKindInfo[] = [{ kind: 'figure', fields: ['unit', 'big', 'label'], required: ['big'], variants: [] }];
    expect(postFieldsFor('figure', server)).toEqual({ fields: ['label', 'big', 'unit'], required: ['big'] });
    expect(postFieldsFor('nonsense')).toEqual({ fields: [], required: [] });
  });
});

describe('a post design', () => {
  it('is only its kind when new, and is accepted by the engine once the required fields exist', async () => {
    const e = await engine();
    for (const kind of POST_KINDS) {
      expect(newPostDesign(kind)).toEqual({ template: 'post', kind });
      expect(isPostDesign(newPostDesign(kind))).toBe(true);
      const d = filled(kind, POST_KIND_FIELDS[kind].required);
      expect(e.postProblems(d, 'design', { direction: 'swiss' })).toEqual([]);
      expect(keysOk(d, e.POST_KEYS)).toEqual([]);
    }
    expect(isPostDesign({ template: 'cover' })).toBe(false);
    expect(isPostDesign(null)).toBe(false);
  });

  it('counts what is seen: asterisks and line breaks do not count', () => {
    expect(seenLength('A *short* one')).toBe(11);
    expect(seenLength('two\nlines')).toBe(8);
    expect(seenLength('two\\nlines')).toBe(8);
  });

  it('removes an empty value and sets a look', () => {
    const d = setVariant(withField(newPostDesign('statement'), 'headline', 'Hi'), 2);
    expect(d.variant).toBe(2);
    expect(setVariant(d, undefined)).not.toHaveProperty('variant');
    expect(withField(d, 'headline', '')).not.toHaveProperty('headline');
    expect(withField({ ...d, items: ['a', 'b'] }, 'items', [])).not.toHaveProperty('items');
  });
});

describe('switching the kind of a post', () => {
  const base = {
    template: 'post', kind: 'photo', variant: 1, name: 'one', networkSizes: { instagram: 'feed' }, label: 'News', headline: 'Opening', sub: 'Soon',
    image: 'media/a.jpg', vaultItemId: 'v1', focal: '30% 40%', zoom: 1.5, meta: 'x', big: '5',
  };

  it('keeps the fields both kinds use and drops the others and the variant', () => {
    const next = switchKind(base, 'statement');
    expect(next).toEqual({ template: 'post', kind: 'statement', name: 'one', networkSizes: { instagram: 'feed' }, label: 'News', headline: 'Opening', sub: 'Soon' });
    const photo = switchKind(next, 'offer');
    expect(photo).not.toHaveProperty('variant');
  });

  it('keeps the picture with its position, zoom and vault id when the new kind has a picture', () => {
    const next = switchKind(base, 'offer');
    expect(next).toMatchObject({ kind: 'offer', image: 'media/a.jpg', vaultItemId: 'v1', focal: '30% 40%', zoom: 1.5, headline: 'Opening', sub: 'Soon' });
    expect(next).not.toHaveProperty('meta');
    expect(next).not.toHaveProperty('big');
  });

  it('uses the server\'s fields when it gives them', () => {
    const server: PostKindInfo[] = [{ kind: 'quote', fields: ['quote', 'by'], required: ['quote'], variants: [] }];
    expect(switchKind({ ...base, quote: 'q', by: 'me' }, 'quote', server)).toEqual({ template: 'post', kind: 'quote', name: 'one', networkSizes: { instagram: 'feed' }, quote: 'q', by: 'me' });
  });
});

describe('converting an old layout to a post', () => {
  const NAMES = (d: { kind: string; design: Record<string, unknown> }) => d.design;

  it('makes a photo post from a photo layout with a picture, keeping the picture and its position', async () => {
    const e = await engine();
    for (const template of ['photo', 'cover', 'photo-story', 'object']) {
      const r = convertToPost({ template, headline: 'H', sub: 'S', label: 'L', image: 'media/a.jpg', vaultItemId: 'v', focal: '10% 20%', zoom: 2, series: 'tips', eyebrow: 'x', sizes: ['feed', 'story'] })!;
      expect(r.kind).toBe('photo');
      expect(NAMES(r)).toEqual({ template: 'post', kind: 'photo', label: 'L', headline: 'H', sub: 'S', image: 'media/a.jpg', vaultItemId: 'v', focal: '10% 20%', zoom: 2 });
      // the server strips the app's vaultItemId before the engine sees the design
      const { vaultItemId: _v, ...forEngine } = r.design;
      expect(e.postProblems(forEngine, 'design', { direction: 'swiss' })).toEqual([]);
    }
  });

  it('makes a statement from a layout without a picture, and from the text-like layouts', async () => {
    const e = await engine();
    expect(convertToPost({ template: 'cover', headline: 'H' })).toEqual({ kind: 'statement', design: { template: 'post', kind: 'statement', headline: 'H' } });
    for (const template of ['text', 'screen', 'product', 'ledger', 'passbook', 'closing']) {
      const r = convertToPost({ template, headline: 'H', sub: 'S', image: 'media/a.jpg', series: 'tips', stats: [] })!;
      expect(r.kind).toBe('statement');
      expect(r.design).toEqual({ template: 'post', kind: 'statement', headline: 'H', sub: 'S' });
      expect(e.postProblems(r.design, 'design', { direction: 'swiss' })).toEqual([]);
    }
    expect(convertToPost({ template: 'closing', line: 'Thanks', headline: '' })!.design).toEqual({ template: 'post', kind: 'statement', headline: 'Thanks' });
  });

  it('makes a number from a figure layout and a statement from myth and fact', async () => {
    const e = await engine();
    for (const template of ['number', 'stats']) {
      const r = convertToPost({ template, big: '74%', line: 'of tasks', label: 'Numbers', stats: [{ n: 1 }] })!;
      expect(r).toEqual({ kind: 'figure', design: { template: 'post', kind: 'figure', big: '74%', sub: 'of tasks', label: 'Numbers' } });
      expect(e.postProblems(r.design, 'design', { direction: 'retail' })).toEqual([]);
    }
    const mf = convertToPost({ template: 'myth-fact', myth: 'M', factLead: 'Fact lead', fact: 'The detail' })!;
    expect(mf).toEqual({ kind: 'statement', design: { template: 'post', kind: 'statement', headline: 'Fact lead', sub: 'The detail' } });
  });

  it('drops empty texts, clamps nothing, and never carries a post type or other sizes', () => {
    const long = 'x'.repeat(200);
    const r = convertToPost({ template: 'text', headline: long, sub: '  ', label: '', series: 'tips', sizes: ['feed', 'story'], name: 'n', networkSizes: { x: 'feed' } })!;
    expect(r.design.headline).toBe(long);
    expect(r.design).not.toHaveProperty('sub');
    expect(r.design).not.toHaveProperty('label');
    expect(r.design).not.toHaveProperty('series');
    expect(r.design).not.toHaveProperty('sizes');
    expect(r.design).toMatchObject({ name: 'n', networkSizes: { x: 'feed' } });
    expect(convertToPost({ template: 'text', headline: 'H', sizes: ['feed'] })!.design.sizes).toEqual(['feed']);
  });

  it('has no mapping for a carousel, a brand layout or an unknown template', () => {
    expect(convertToPost({ template: 'carousel', pages: [{ template: 'closing' }, { template: 'closing' }] })).toBeNull();
    expect(convertToPost({ pages: [] })).toBeNull();
    expect(convertToPost({ template: 'layout', layout: 'step', headline: 'H' })).toBeNull();
    expect(convertToPost({ template: 'mystery' })).toBeNull();
    expect(convertToPost({})).toBeNull();
  });
});
