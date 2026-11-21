// The post editor's design form (web/src/pages/batches/design-model.ts): a carousel's pages, each made with a built-in page
// template or one of the brand's layouts, as pages the engine accepts.
import { describe, expect, it } from 'vitest';
import {
  addPage, chooseLayout, chosenOf, MAX_PAGES, movePage, ownLayoutOf, PAGE_TEMPLATES, pageLayouts, pagesOf, removePage, withField, withPage, type LayoutBrief,
} from '../web/src/pages/batches/design-model';
import { LAYOUT_CATALOGUE } from '../web/src/pages/batches/editor/catalogue';
import type { Layout } from '../web/src/pages/settings/layout-types';
import { engineImport } from './server/engine/root.js';

const at = (col: number, row: number, width: number, height: number) => ({ col, row, width, height });
const GRID = { columns: 12, rows: 24, margin: { top: 56, right: 70, bottom: 56, left: 70 }, gutter: 20, rowGutter: 0 };
const STEP = {
  id: 'step', name: 'Step', fields: { headline: { required: true, max: 90 }, image: {} }, canvas: { feed: GRID },
  blocks: [
    { type: 'label', text: 'Start here', slot: at(1, 2, 8, 1), when: { page: 'first' } },
    { type: 'headline', slot: at(1, 5, 12, 6), size: 84 },
    { type: 'photo', slot: at(1, 12, 12, 11), when: { present: 'image' } },
    { type: 'logo', slot: at(1, 24, 6, 1), valign: 'bottom' },
  ],
} as unknown as Layout;
const TALL = { ...STEP, id: 'tall', name: 'Tall', canvas: { story: { ...GRID, margin: { top: 250, right: 70, bottom: 320, left: 70 } } } } as unknown as Layout;
// As GET /api/layouts lists them.
const brief = (l: Layout): LayoutBrief => ({
  id: l.id, name: l.name, description: null, sizes: Object.keys(l.canvas),
  fields: Object.entries(l.fields).map(([name, f]) => ({ name, kind: name === 'image' ? 'image' : 'text', required: !!f.required, max: (f as { max?: number }).max ?? null, min: null, word: name })),
});
const BRAND = [brief(STEP), brief(TALL)];

const engine = async () => {
  const layout = await engineImport<{ postDesignProblems(d: unknown, where: string, opts: { layouts: unknown[] }): string[] }>('design/layout');
  const spec = await engineImport<{ PAGE_TEMPLATES: string[]; MAX_PAGES: number }>('design/spec');
  return { ...layout, ...spec };
};

describe('the post editor\'s carousel pages', () => {
  it('offers the engine\'s page templates and the brand\'s layouts drawn at the feed size', async () => {
    const e = await engine();
    expect(PAGE_TEMPLATES.map((t) => t.value).sort()).toEqual([...e.PAGE_TEMPLATES].sort());
    expect(MAX_PAGES).toBe(e.MAX_PAGES);
    // a page: the page templates only (no photo post, no carousel), and the brand's layouts that have the feed size
    const values = PAGE_TEMPLATES.map((t) => t.value);
    expect(values).not.toContain('carousel');
    expect(values).not.toContain('photo');
    expect(pageLayouts(BRAND).map((l) => l.id)).toEqual(['step']);
    // a post may use every layout the editor lists, the photo post and the carousel too
    expect(LAYOUT_CATALOGUE.map((t) => t.value)).toEqual(expect.arrayContaining(['photo', 'carousel', ...values]));
  });

  it('makes a carousel whose pages use a brand layout, which the engine accepts', async () => {
    const e = await engine();
    let d = chooseLayout({ template: 'cover', headline: 'Hi' }, 'carousel', BRAND);
    expect(pagesOf(d)).toEqual([{ template: 'closing' }, { template: 'closing' }]);
    // page 1 becomes the brand's layout: only that layout's fields and the page frame are kept
    const p1 = chooseLayout({ template: 'object', headline: 'Kept', image: 'design/assets/demo/object-jar.jpg', align: 'center', sizes: ['feed'], vaultItemId: 'v1' }, 'layout:step', BRAND, { page: true });
    expect(p1).toEqual({ template: 'layout', layout: 'step', headline: 'Kept', image: 'design/assets/demo/object-jar.jpg', vaultItemId: 'v1' });
    d = withPage(d, 0, p1);
    d = withPage(d, 1, withField(chooseLayout(pagesOf(d)[1]!, 'layout:step', BRAND, { page: true }), 'headline', 'Second'));
    expect(chosenOf(pagesOf(d)[0]!)).toBe('layout:step');
    expect(ownLayoutOf(pagesOf(d)[0]!, BRAND)?.id).toBe('step');
    const { vaultItemId: _v, ...page1 } = pagesOf(d)[0]!;
    const forEngine = { ...d, pages: [page1, pagesOf(d)[1]] };
    expect(e.postDesignProblems(forEngine, 'design', { layouts: [STEP, TALL] })).toEqual([]);
    // a required field emptied is the engine's refusal, as for a post made with the layout
    const emptied = withPage(forEngine, 1, withField(pagesOf(forEngine)[1]!, 'headline', ''));
    expect(e.postDesignProblems(emptied, 'design', { layouts: [STEP] })).toEqual(['design page 2: headline is required by this layout']);
    // back to a built-in page: the layout id goes
    expect(chooseLayout(pagesOf(d)[0]!, 'closing', BRAND, { page: true })).toEqual({ template: 'closing', headline: 'Kept', image: 'design/assets/demo/object-jar.jpg', vaultItemId: 'v1' });
  });

  it('adds, removes and moves pages within the engine\'s 2 to 10', () => {
    let d = { template: 'carousel', pages: [{ template: 'closing' }, { template: 'layout', layout: 'step', headline: 'B' }] };
    expect(pagesOf(removePage(d, 0))).toHaveLength(2);
    d = addPage(d);
    expect(pagesOf(d)).toHaveLength(3);
    expect(pagesOf(removePage(d, 0))[0]).toEqual({ template: 'layout', layout: 'step', headline: 'B' });
    expect(pagesOf(movePage(d, 1, -1))[0]).toEqual({ template: 'layout', layout: 'step', headline: 'B' });
    expect(movePage(d, 0, -1)).toBe(d);
    for (let i = 0; i < 20; i++) d = addPage(d);
    expect(pagesOf(d)).toHaveLength(MAX_PAGES);
  });
});
