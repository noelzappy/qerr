// node --test   (named recurring series: validation against a look, marks, dates at a cadence, numbering, and the batch field. Pure.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { lookBrief } from './lib/design/look.mjs';
import { validateDesign } from './lib/design/spec.mjs';
import { validateBatch } from './lib/batch.mjs';
import { applySeriesSlot, markProblems, planSeries, seriesDates, seriesListProblems, seriesMark, seriesProblems, seriesRefProblems, seriesVariant } from './lib/design/series.mjs';

const swiss = () => shippedLooks().swiss;
const brief = () => lookBrief(swiss());
const tip = (over = {}) => ({ slug: 'tip-of-the-week', name: 'Tip of the week', kind: 'statement', variants: [], mark: 'Tip #{n}', markField: 'label', cadence: 'weekly', weekday: 1, nextNumber: 12, ...over });
const myth = (over = {}) => ({ slug: 'myth-vs-fact', name: 'Myth vs fact', kind: 'statement', variants: [], cadence: 'monthly', ...over });

test('a mark is plain words with at most one number, short enough for its field', () => {
  assert.equal(seriesMark('Tip #{n}', 12), 'Tip #12');
  assert.equal(seriesMark('No. {nn}', 7), 'No. 07');
  assert.equal(seriesMark('Myth vs fact', 3), 'Myth vs fact');
  assert.deepEqual(markProblems('Tip #{n}'), []);
  for (const [mark, re] of [['Tip {n} of {n}', /number once/], ['Tip {x}', /braces are only for the number/], ['*Tip*', /no \*emphasis\*/], ['Tip\nweek', /one line/], ['Tip 🎉', /no emoji/], ['x'.repeat(25) + '{n}', /29 characters with a four-digit number; the label holds 28/], ['', /non-empty/]]) {
    assert.match(markProblems(mark).join('|'), re, mark);
  }
  assert.match(markProblems('Tip #{n} of the day', 'tag').join('|'), /the tag holds 16/);
  assert.match(markProblems('Tip', 'headline').join('|'), /goes in one of label, tag/);
});

test('a series is checked on its own, and against the active look when it is known', () => {
  assert.deepEqual(seriesProblems(tip()), []);
  assert.deepEqual(seriesProblems(tip(), 's', { brief: brief() }), []);
  assert.deepEqual(seriesProblems(myth(), 's', { brief: brief() }), []);
  const bad = seriesProblems({ slug: 'Bad Slug', name: '', kind: 'nope', variants: [1, 1], cadence: 'daily', weekday: 9, nextNumber: 0, markField: 'sub' }).join('|');
  for (const re of [/slug must be/, /name must be/, /kind must be/, /variants must be/, /cadence must be/, /weekday must be/, /nextNumber must be/, /markField must be/]) assert.match(bad, re);
  assert.match(seriesProblems(tip({ variants: [7] }), 's', { brief: brief() }).join('|'), /design 8 is not one of them/);
  const thin = lookBrief({ ...swiss(), compositions: swiss().compositions.filter((c) => c.kind !== 'quote') });
  assert.match(seriesProblems(tip({ kind: 'quote' }), 's', { brief: thin }).join('|'), /draws no quote post/);
  // a design that does not show the mark's field is refused by name
  const b = brief(), blind = b.kinds.statement.variants.findIndex((v) => !v.fields.tag);
  if (blind >= 0) assert.match(seriesProblems(tip({ markField: 'tag', mark: 'No. {n}', variants: [blind] }), 's', { brief: b }).join('|'), /does not show a tag/);
});

test('a brand\'s list: at most 12 series and no slug twice', () => {
  assert.deepEqual(seriesListProblems([tip(), myth()]), []);
  assert.match(seriesListProblems([tip(), tip()]).join('|'), /slug is used twice/);
  assert.match(seriesListProblems(Array.from({ length: 13 }, (_, i) => tip({ slug: `s${i}` }))).join('|'), /at most 12 series/);
});

test('dates at the cadence, inside the period', () => {
  const dec = { from: '2026-12-01', to: '2026-12-31' };
  // 2026-12-01 is a Tuesday (weekday 1)
  assert.deepEqual(seriesDates(tip(), dec), ['2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22', '2026-12-29']);
  assert.deepEqual(seriesDates(tip({ weekday: 4 }), dec), ['2026-12-04', '2026-12-11', '2026-12-18', '2026-12-25']);
  assert.deepEqual(seriesDates(tip({ cadence: 'fortnightly', weekday: undefined }), dec), ['2026-12-01', '2026-12-15', '2026-12-29']);
  assert.deepEqual(seriesDates(myth({ weekday: 0 }), { from: '2026-12-10', to: '2027-02-28' }), ['2026-12-14', '2027-01-04', '2027-02-01']);
  assert.deepEqual(seriesDates(myth(), { from: '2026-12-10', to: '2027-01-31' }), ['2026-12-10', '2027-01-01']);
  assert.deepEqual(seriesDates(myth(), { from: '2027-01-02', to: '2027-01-01' }), []);
});

test('a plan numbers each series from its next number, in date order, and keeps within the batch', () => {
  const dec = { from: '2026-12-01', to: '2026-12-31' };
  const { slots, dropped } = planSeries([tip(), myth()], { period: dec, count: 4, brief: brief() });
  assert.deepEqual(slots.map((s) => [s.date, s.slug, s.number]), [['2026-12-01', 'tip-of-the-week', 12], ['2026-12-01', 'myth-vs-fact', 1], ['2026-12-08', 'tip-of-the-week', 13], ['2026-12-15', 'tip-of-the-week', 14]]);
  assert.equal(slots[0].mark, 'Tip #12');
  assert.equal(slots[1].mark, undefined);
  assert.deepEqual(dropped.map((s) => s.number), [15, 16], 'only the tail of a run is dropped, so numbers never skip');
  assert.equal(planSeries([], { period: dec, count: 4 }).slots.length, 0);
});

test('a series post takes the series\' designs in turn, or one that shows the mark', () => {
  assert.deepEqual([12, 13, 14].map((n) => seriesVariant(tip({ variants: [1, 0] }), n)), [0, 1, 0]);
  assert.equal(seriesVariant(myth(), 3, brief()), undefined, 'no mark, no designs chosen: the engine chooses');
  const b = brief(), showing = b.kinds.statement.variants.filter((v) => v.fields.label).map((v) => v.index);
  const v = seriesVariant(tip(), 12, b);
  assert.ok(v === undefined ? showing.length === b.kinds.statement.variants.length : showing.includes(v));
});

test('a series slot made into a post design passes the look\'s checks; the mark is only ever a plain field', () => {
  const [slot] = planSeries([tip()], { period: { from: '2026-12-01', to: '2026-12-07' }, count: 1, brief: brief() }).slots;
  const design = applySeriesSlot({ template: 'post', kind: 'list', headline: 'Save on *pay day*' }, slot);
  assert.equal(design.kind, 'statement');
  assert.equal(design.label, 'Tip #12');
  assert.deepEqual(validateDesign(design, 'd', { look: swiss() }), []);
  assert.ok(!('series' in design), 'the series itself never goes into the design');
});

test('the batch field: { slug, number } on the post, checked; never sent to Buffer', () => {
  assert.deepEqual(seriesRefProblems({ slug: 'tip-of-the-week', number: 12 }), []);
  assert.match(seriesRefProblems('tip').join(), /must look like/);
  assert.match(seriesRefProblems({ slug: 'tip', number: 0 }).join(), /whole number from 1/);
  assert.match(seriesRefProblems({ slug: 'tip', number: 1, mark: 'x' }).join(), /only slug and number/);
  const raw = (series) => ({ timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'm', posts: [{ id: 'p', date: '2026-12-01', caption: 'c', skip: ['instagram'], series }] });
  assert.deepEqual(validateBatch(raw({ slug: 'tip-of-the-week', number: 12 })).errors, []);
  assert.match(validateBatch(raw({ slug: 'x', number: -1 })).errors.join(), /post p: series.number/);
});
