// A post's pictures in short (web/src/pages/batches/media-groups.ts): the carousel badge's page count on a card, and the saved
// pictures grouped by size, pages in order, on the post page.
import { describe, expect, it } from 'vitest';
import { carouselPages, groupMedia } from '../web/src/pages/batches/media-groups';
import type { MediaView } from '../web/src/pages/batches/types';

const m = (rel: string, o: Partial<MediaView> = {}): MediaView => ({ rel, sha256: 'x', size: 1, contentType: 'image/png', kind: 'image', source: 'render', renderSize: 'feed', slide: null, url: null, ...o });
const page = { template: 'post', kind: 'statement' };

describe('carousel pages', () => {
  it('counts the pages a carousel design has, before anything is drawn', () => {
    expect(carouselPages({ template: 'carousel', pages: [page, page, page, page] }, [])).toBe(4);
  });
  it('counts the drawn pages of one size when the design does not say', () => {
    const media = [m('f2', { slide: 1 }), m('f1', { slide: 0 }), m('f3', { slide: 2 }), m('s1', { renderSize: 'story', slide: 0 }), m('u', { source: 'upload', renderSize: undefined })];
    expect(carouselPages(null, media)).toBe(3);
  });
  it('is null for a single post, several sizes of one picture or uploads', () => {
    expect(carouselPages({ template: 'post', kind: 'statement' }, [m('f')])).toBeNull();
    expect(carouselPages(null, [m('f'), m('s', { renderSize: 'story' })])).toBeNull();
    expect(carouselPages(null, [m('a', { source: 'upload' }), m('b', { source: 'upload' })])).toBeNull();
    expect(carouselPages({ template: 'carousel', pages: [page] }, [])).toBeNull();
  });
});

describe('saved pictures by size', () => {
  it('puts made pictures by size in page order, then the uploads', () => {
    const media = [m('u1', { source: 'upload', renderSize: undefined }), m('f2', { slide: 1 }), m('s1', { renderSize: 'story', slide: 0 }), m('f1', { slide: 0 })];
    const groups = groupMedia(media);
    expect(groups.map((g) => [g.label, g.items.map((x) => x.rel)])).toEqual([['Feed', ['f1', 'f2']], ['Story', ['s1']], ['Uploaded', ['u1']]]);
  });
});
