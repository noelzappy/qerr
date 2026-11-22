// The post editor's carousels of post pages and named series (web/src/pages/batches/editor/post-carousel.ts, series-model.ts): every
// design they make is one the engine accepts, and their rules match the engine's own.
import { describe, expect, it } from 'vitest';
import {
  IMAGE_LIMITS, addBodyPage, imageLimitProblems, isPostCarousel, movePostPage, pageRole, pageTitle, postPagesOf, removePostPage, toPostCarousel, toSinglePost, withPostPage,
} from '../web/src/pages/batches/editor/post-carousel';
import { applySeries, removeSeries, seriesMark, seriesSummary, type SeriesInfo } from '../web/src/pages/batches/editor/series-model';
import { engineImport } from './server/engine/root.js';

interface Spec { validateDesign(d: unknown, where: string, o: { look?: unknown }): string[] }
interface Dirs { shippedLooks(): Record<string, unknown> }
interface Series { seriesMark(m: string, n: number): string; seriesVariant(s: unknown, n: number): number | undefined }
interface Networks { MEDIA_LIMITS: Record<string, number> }
const engine = async () => ({
  spec: await engineImport<Spec>('design/spec'), dirs: await engineImport<Dirs>('design/directions/index'),
  series: await engineImport<Series>('design/series'), networks: await engineImport<Networks>('networks'),
});

const single = { template: 'post', kind: 'statement', label: 'Tips', headline: 'Three ways to *save more*', name: 'tips' };

describe('carousels of post pages', () => {
  it('a post becomes a carousel (its words the cover, a closing page after) and back, and the engine accepts both', async () => {
    const { spec, dirs } = await engine();
    const look = dirs.shippedLooks().swiss;
    const car = toPostCarousel(single);
    expect(car).toEqual({ template: 'carousel', name: 'tips', pages: [{ template: 'post', kind: 'statement', label: 'Tips', headline: 'Three ways to *save more*' }, { template: 'post', kind: 'statement' }] });
    expect(isPostCarousel(car)).toBe(true);
    const filled = withPostPage(car, 1, { template: 'post', kind: 'statement', headline: 'Start *this week*' });
    expect(spec.validateDesign(filled, 'd', { look })).toEqual([]);
    expect(toSinglePost(filled)).toEqual(single);
  });

  it('adds body pages before the closing page, moves and removes pages, within 2 to 10', () => {
    let d = toPostCarousel(single);
    d = addBodyPage(d, 'list');
    expect(postPagesOf(d).map((p) => p.kind)).toEqual(['statement', 'list', 'statement']);
    expect([0, 1, 2].map((i) => pageRole(i, 3))).toEqual(['cover', 'body', 'closing']);
    expect(pageTitle(2, 3)).toBe('Page 3 · Closing');
    expect(postPagesOf(movePostPage(d, 1, 1)).map((p) => p.kind)).toEqual(['statement', 'statement', 'list']);
    expect(movePostPage(d, 0, -1)).toBe(d);
    expect(postPagesOf(removePostPage(d, 1)).length).toBe(2);
    expect(removePostPage(removePostPage(d, 1), 0)).toEqual(removePostPage(d, 1));
    for (let i = 0; i < 20; i++) d = addBodyPage(d);
    expect(postPagesOf(d).length).toBe(10);
  });

  it('says which networks take fewer images than the carousel has, with the engine\'s limits', async () => {
    const { networks } = await engine();
    expect(IMAGE_LIMITS).toEqual(networks.MEDIA_LIMITS);
    expect(imageLimitProblems(4, ['instagram', 'x'])).toEqual([]);
    expect(imageLimitProblems(5, ['instagram', 'x', 'linkedin'])).toEqual(['X takes 4 images in one post and this carousel has 5. Remove 1 page, or leave X out under Networks.']);
  });
});

const tip: SeriesInfo = { id: 's', slug: 'tip-of-the-week', name: 'Tip of the week', kind: 'statement', variants: [], mark: 'Tip #{n}', markField: 'label', cadence: 'weekly', weekday: 1, nextNumber: 12, nextMark: 'Tip #12', designsInLook: true, problems: [], enabled: true };

describe('named series in the post editor', () => {
  it('marks and design turns follow the engine\'s rules', async () => {
    const { series } = await engine();
    for (const [m, n] of [['Tip #{n}', 12], ['No. {nn}', 7], ['Myth vs fact', 3]] as const) expect(seriesMark(m, n)).toBe(series.seriesMark(m, n));
    const s = { ...tip, variants: [1, 0] };
    for (const n of [12, 13, 14]) expect(applySeries({ template: 'post', kind: 'statement' }, s, n)!.variant).toBe(series.seriesVariant(s, n));
  });

  it('a post put in a series takes its kind, design and mark; taken out, it loses the mark it still shows', async () => {
    const { spec, dirs } = await engine();
    const look = dirs.shippedLooks().swiss;
    const d = applySeries({ template: 'post', kind: 'list', headline: 'Save on *pay day*', items: ['a', 'b', 'c'] }, tip, 12)!;
    expect(d).toEqual({ template: 'post', kind: 'statement', headline: 'Save on *pay day*', label: 'Tip #12' });
    expect(spec.validateDesign(d, 'd', { look })).toEqual([]);
    expect(applySeries(d, { ...tip, variants: [0], designsInLook: false }, 13)!.variant).toBeUndefined();
    expect(removeSeries(d, tip, 12)).toEqual({ template: 'post', kind: 'statement', headline: 'Save on *pay day*' });
    expect(removeSeries({ ...d, label: 'My own words' }, tip, 12)!.label).toBe('My own words');
    expect(applySeries({ template: 'carousel', pages: [] }, tip, 12)).toEqual({ template: 'carousel', pages: [] });
  });

  it('summarises a series in one line', () => {
    expect(seriesSummary(tip)).toBe('Statement · weekly on Tuesdays · next Tip #12');
    expect(seriesSummary({ ...tip, cadence: 'monthly', weekday: 0, nextMark: null, nextNumber: 3 })).toBe('Statement · monthly on the first Monday · next #3');
    expect(seriesSummary({ ...tip, cadence: 'fortnightly', weekday: null })).toBe('Statement · every two weeks · next Tip #12');
  });
});
