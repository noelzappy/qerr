// A named series as a kind of post: choosing one, giving it another number and choosing a plain kind instead (which takes the post out).
import { describe, expect, it } from 'vitest';
import { leaveSeries, pickSeries, renumberSeries } from '../web/src/pages/batches/editor/series-kind';
import type { SeriesInfo } from '../web/src/pages/batches/editor/series-model';
import { drawsFor } from '../web/src/pages/batches/editor/look-brief';

const tip: SeriesInfo = {
  id: 's1', slug: 'tip', name: 'Tip of the week', kind: 'statement', variants: [0, 2], mark: 'Tip #{n}', markField: 'label', cadence: 'weekly',
  weekday: 1, nextNumber: 12, nextMark: 'Tip #12', designsInLook: true, problems: [], enabled: true,
};
const myth: SeriesInfo = { ...tip, id: 's2', slug: 'myth', name: 'Myth buster', kind: 'quote', variants: [], mark: 'Myth {nn}', nextNumber: 3, nextMark: 'Myth 03', designsInLook: false };
const list = [tip, myth];

describe('a series as a kind of post', () => {
  it('sets the kind, the design by number and the mark', () => {
    const c = pickSeries(list, null, { template: 'post', kind: 'figure', big: '74%', headline: 'Save more' }, 's1');
    expect(c).toEqual({ series: { id: 's1', number: 12 }, design: { template: 'post', kind: 'statement', headline: 'Save more', variant: 2, label: 'Tip #12' } });
  });
  it('moves from one series to another, taking the first one\'s mark off', () => {
    const c = pickSeries(list, { id: 's1', number: 12 }, { template: 'post', kind: 'statement', headline: 'x', variant: 2, label: 'Tip #12' }, 's2');
    expect(c).toEqual({ series: { id: 's2', number: 3 }, design: { template: 'post', kind: 'quote', label: 'Myth 03' } });
  });
  it('writes the mark of another number, and refuses a number out of range', () => {
    const d = { template: 'post', kind: 'statement', headline: 'x', variant: 2, label: 'Tip #12' };
    expect(renumberSeries(list, { id: 's1', number: 12 }, d, 13)).toEqual({ series: { id: 's1', number: 13 }, design: { ...d, variant: 0, label: 'Tip #13' } });
    expect(renumberSeries(list, { id: 's1', number: 12 }, d, 0)).toBeNull();
    expect(renumberSeries(list, null, d, 5)).toBeNull();
  });
  it('takes the post out of its series when a plain kind is chosen, keeping words a person changed', () => {
    const d = { template: 'post', kind: 'statement', headline: 'x', variant: 2, label: 'Tip #12' };
    expect(leaveSeries(list, { id: 's1', number: 12 }, d, 'statement')).toEqual({ series: null, design: { template: 'post', kind: 'statement', headline: 'x', variant: 2 } });
    expect(leaveSeries(list, { id: 's1', number: 12 }, { ...d, label: 'Our tip' }, 'list').design).toMatchObject({ kind: 'list', label: 'Our tip', headline: 'x' });
    expect(leaveSeries(list, { id: 's1', number: 12 }, null, null)).toEqual({ series: null, design: null });
  });
  it('keeps the post as it is when its own series is chosen again', () => {
    const d = { template: 'post', kind: 'statement', label: 'Tip #4' };
    expect(pickSeries(list, { id: 's1', number: 4 }, d, 's1')).toEqual({ series: { id: 's1', number: 4 }, design: d });
    expect(pickSeries(list, null, d, 'gone')).toBeNull();
  });
});

describe('which marks a design draws', () => {
  const info = { kind: 'statement', fields: ['headline'], required: ['headline'], variants: [
    { variant: 0, name: 'Shout', describe: '', marks: { pills: true, icons: true } },
    { variant: 1, name: 'Letter', describe: '', marks: { pills: false, icons: true } },
  ] };
  it('is the chosen design\'s, or with Automatic any design\'s of the kind', () => {
    expect(drawsFor(info, 1)).toEqual({ pills: false, icons: true });
    expect(drawsFor(info, undefined)).toEqual({ pills: true, icons: true });
    expect(drawsFor({ ...info, variants: info.variants.map((v) => ({ ...v, marks: { pills: false, icons: false } })) }, undefined)).toEqual({ pills: false, icons: false });
  });
  it('is not known without a look or for a design the look no longer has', () => {
    expect(drawsFor(undefined, undefined)).toBeNull();
    expect(drawsFor({ ...info, variants: [{ variant: 0, name: 'x', describe: '' }] }, 0)).toBeNull();
    expect(drawsFor(info, 7)).toBeNull();
  });
});
