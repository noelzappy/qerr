// The layout editor's "sketch as if" and preview (web/src/pages/settings/layout-model.ts) show a brand's layout as a single post
// or as page 1, a middle page or the last page of a carousel, as the engine's "page" conditions see them.
import { describe, expect, it } from 'vitest';
import { PAGE_CONDITION_HINT, defaultScenario, holds, previewPage, sketchPages } from '../web/src/pages/settings/layout-model';
import type { Catalogue, Layout } from '../web/src/pages/settings/layout-types';
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
const engine = () => engineImport<{ layoutCatalogue(): Catalogue; PAGE_CONDITIONS: string[] }>('design/layout');

describe('the layout editor shows a layout as a carousel page', () => {
  it('sketches page 1, a middle page and the last page, as the engine\'s page conditions see them', async () => {
    const { layoutCatalogue, PAGE_CONDITIONS } = await engine();
    const cat = layoutCatalogue();
    expect(PAGE_CONDITIONS).toEqual(['single', 'first', 'later']);
    const sc = defaultScenario(STEP);
    expect(sc.page).toBe('single');
    const first = { page: 'first' }, later = { page: 'later' }, single = { page: 'single' };
    const at = (page: string) => [first, later, single].map((w) => holds(w, { ...sc, page }, STEP, cat));
    expect(at('single')).toEqual([false, false, true]);
    expect(at('first')).toEqual([true, false, false]);
    expect(at('middle')).toEqual([false, true, false]);
    expect(at('last')).toEqual([false, true, false]);
    expect(at('later')).toEqual([false, true, false]);
  });

  it('asks the preview for that page of a carousel, and only of a layout with a feed size', () => {
    expect(['single', 'first', 'middle', 'last', 'later'].map(previewPage)).toEqual([undefined, 'first', 'middle', 'last', 'middle']);
    expect(sketchPages(STEP)).toEqual(['single', 'first', 'middle', 'last']);
    expect(sketchPages(TALL)).toEqual(['single']);
  });

  it('tells the truth about a page condition', () => {
    expect(PAGE_CONDITION_HINT).not.toMatch(/one image/);
    expect(PAGE_CONDITION_HINT).toMatch(/page 1 or a later page/);
  });
});
