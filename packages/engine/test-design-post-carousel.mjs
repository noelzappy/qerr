// node --test   (carousels of post pages: validation against the brand's look, file names, and normalising. Pure: no Chrome.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { shippedLooks } from './lib/design/directions/index.mjs';
import { MAX_PAGES, normaliseDesign, outputFiles, validateDesign } from './lib/design/spec.mjs';
import { POST_PAGES, isPostCarousel, usesPostTemplate } from './lib/design/post-spec.mjs';
import { textFieldsOf } from './lib/design/lint.mjs';

const look = () => structuredClone(shippedLooks().swiss);
const cover = { template: 'post', kind: 'statement', label: 'Tips', headline: 'Three ways to *save more*' };
const body = { template: 'post', kind: 'list', headline: 'Start small', items: ['Set a weekly amount', 'Save on pay day', 'Keep a record'] };
const closing = { template: 'post', kind: 'statement', headline: 'Start *this week*', sub: 'Open the app and set your first goal.' };
const carousel = (pages, extra = {}) => ({ template: 'carousel', pages, ...extra });

test('a carousel of post pages is valid against the brand\'s look, page by page', () => {
  assert.deepEqual(validateDesign(carousel([cover, body, closing]), 'd', { look: look() }), []);
  assert.deepEqual(validateDesign(carousel([cover, closing], { name: 'tips', sizes: ['feed'] }), 'd', { look: look() }), []);
  assert.ok(isPostCarousel(carousel([cover, closing])));
  assert.ok(usesPostTemplate(cover) && usesPostTemplate(carousel([cover, closing])));
  assert.ok(!usesPostTemplate(carousel([{ template: 'closing' }, { template: 'closing' }])));
  assert.equal(POST_PAGES.max, MAX_PAGES, 'the same most pages as every carousel');
});

test('each page is held to the look: kind, budgets and required fields, with the page named', () => {
  const thin = { ...look(), compositions: look().compositions.filter((c) => c.kind !== 'quote') };
  const errs = validateDesign(carousel([cover, { template: 'post', kind: 'quote', quote: 'Said' }, { template: 'post', kind: 'list', headline: 'x', items: ['a'] }]), 'd', { look: thin });
  assert.ok(errs.some((e) => /^d page 2: the Swiss look has no quote composition/.test(e)), errs.join('|'));
  assert.ok(errs.some((e) => /^d page 3: items must be a list of 2 to 5/.test(e)), errs.join('|'));
  const noLook = validateDesign(carousel([cover, closing]), 'd', { direction: null });
  assert.ok(noLook.some((e) => /^d page 1: a post is drawn in the brand's design direction/.test(e)));
});

test('post pages and the older templates do not mix, and the carousel itself carries no words', () => {
  const mixed = validateDesign(carousel([cover, { template: 'closing' }]), 'd', { look: look() });
  assert.ok(mixed.some((e) => /^d page 2: every page of this carousel must be a post page/.test(e)), mixed.join('|'));
  const framed = validateDesign(carousel([cover, closing], { label: 'Tips', series: 'the-numbers' }), 'd', { look: look() });
  assert.ok(framed.some((e) => /"label" is not used by a carousel of post pages/.test(e)) && framed.some((e) => /"series" is not used by a carousel of post pages/.test(e)));
  const own = validateDesign(carousel([{ ...cover, name: 'x' }, closing]), 'd', { look: look() });
  assert.ok(own.some((e) => /^d page 1: name belongs to the carousel/.test(e)));
});

test('a post carousel takes 2 to 10 pages, feed only', () => {
  const one = validateDesign(carousel([cover]), 'd', { look: look() });
  assert.ok(one.some((e) => /pages needs 2 to 10 pages/.test(e)));
  const many = validateDesign(carousel(Array.from({ length: MAX_PAGES + 1 }, () => closing)), 'd', { look: look() });
  assert.ok(many.some((e) => /pages needs 2 to 10 pages/.test(e)));
  const wide = validateDesign(carousel([cover, closing], { sizes: ['wide'] }), 'd', { look: look() });
  assert.ok(wide.some((e) => /feed format/.test(e)));
});

test('hostile words in a page are refused or kept as plain data (never markup): limits and one-line rules apply per page', () => {
  const errs = validateDesign(carousel([{ ...cover, label: '</style><script>x</script>'.repeat(3) }, { ...closing, extra: 'javascript:alert(1)' }]), 'd', { look: look() });
  assert.ok(errs.some((e) => /^d page 1: label is \d+ characters; the most is 28/.test(e)), errs.join('|'));
  assert.ok(errs.some((e) => /^d page 2: "extra" is not a field of a post/.test(e)), errs.join('|'));
});

test('one image per page, in order, and the pages keep their own words', () => {
  const spec = normaliseDesign(carousel([cover, body, closing]));
  assert.deepEqual(outputFiles(spec, { stem: 'tips' }).map((f) => [f.file, f.slide]), [['tips-1.jpg', 0], ['tips-2.jpg', 1], ['tips-3.jpg', 2]]);
  assert.deepEqual(spec.pages.map((p) => [p.template, p.kind, p.sizes]), [['post', 'statement', ['feed']], ['post', 'list', ['feed']], ['post', 'statement', ['feed']]]);
  assert.equal(spec.pages[0].series, undefined);
  assert.deepEqual(textFieldsOf(spec).map((f) => f.field).slice(0, 3), ['page 1 headline', 'page 1 label', 'page 2 headline']);
});
