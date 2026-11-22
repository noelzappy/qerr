// What the post editor fills in by itself: the title from the headline (else the caption), and a designed image for a new post.
import { describe, expect, it } from 'vitest';
import { autoTitle, designForNewPost, firstWords, headlineOf, plainHeadline } from '../web/src/pages/batches/editor/post-defaults';

describe('a post title filled in for you', () => {
  it('reads the headline without its marks', () => {
    expect(plainHeadline('Save together, *see every* [[euro]] {{arrow-right}}')).toBe('Save together, see every euro');
  });
  it('comes from the headline first', () => {
    expect(autoTitle({ template: 'post', kind: 'statement', headline: 'Save *together*' }, 'Some caption')).toEqual({ title: 'Save together', from: 'headline' });
  });
  it('comes from a carousel page or a quotation when there is no headline', () => {
    expect(headlineOf({ template: 'post', pages: [{ kind: 'cover' }, { headline: 'Page *two*' }] })).toBe('Page two');
    expect(headlineOf({ template: 'post', kind: 'quote', quote: 'Small steps' })).toBe('Small steps');
  });
  it('falls back to the first words of the caption, cut at a word', () => {
    const r = autoTitle(null, '\nEvery member sees the shared pot grow, week by week, in the app and at every meeting of the circle.');
    expect(r.from).toBe('caption');
    expect(r.title.length).toBeLessThanOrEqual(60);
    expect(r.title).toBe('Every member sees the shared pot grow, week by week, in the');
    expect(firstWords('Short one')).toBe('Short one');
  });
  it('is empty when there is nothing to take it from', () => {
    expect(autoTitle({ template: 'post', kind: 'statement' }, '  ')).toEqual({ title: '', from: null });
  });
});

describe('a new post', () => {
  it('starts with a designed image when the brand has a look, and without one otherwise', () => {
    expect(designForNewPost('retail')).toEqual({ template: 'post', kind: 'statement' });
    expect(designForNewPost(null)).toBeNull();
    expect(designForNewPost(undefined)).toBeNull();
  });
});
