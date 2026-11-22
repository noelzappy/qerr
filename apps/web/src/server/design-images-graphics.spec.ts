// A post's brand graphics (`graphics`: [{ ref, image, tintable }]) name files the renderer reads from disk, like a picture. The same path
// rule holds for them as for the post's own picture: a file under design/assets/, never an absolute path or one that climbs out with "..",
// on a post and on each post page of a carousel.
import { describe, expect, it } from 'vitest';
import { designProblems } from './services/design-images.js';

const REF = '0f8fad5b-d9cb-469f-a165-70867728950e';
const post = (graphics: unknown[]) => ({ template: 'post', kind: 'statement', headline: 'A plain *headline*', graphics });

describe('brand graphics named by a design', () => {
  it('refuses a graphic file outside design/assets, naming the graphic', async () => {
    for (const image of ['/etc/secret.png', '../../etc/secret.png', 'apps/web/.data/vault/other.png', 'design/assets/../../secret.webp']) {
      const problems = await designProblems(post([{ ref: REF, image }]));
      expect(problems.some((p) => /design graphic 1: image ".*" must be a file under design\/assets\//.test(p)), `${image}: ${problems.join(' | ')}`).toBe(true);
    }
  });
  it('refuses one on a carousel post page too, naming the page', async () => {
    const carousel = { template: 'carousel', pages: [post([]), post([{ ref: REF, image: '/var/lib/vesk/other-brand.png' }])] };
    const problems = await designProblems(carousel);
    expect(problems.some((p) => /design page 2 graphic 1: image ".*" must be a file under design\/assets\//.test(p)), problems.join(' | ')).toBe(true);
  });
  it('lets a graphic under design/assets through this rule', async () => {
    const problems = await designProblems(post([{ ref: REF, image: 'design/assets/demo/graphic.png' }]));
    expect(problems.filter((p) => /graphic 1: image/.test(p))).toEqual([]);
  });
});
