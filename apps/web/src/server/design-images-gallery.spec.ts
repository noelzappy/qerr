// The pictures of a post's row of round pictures (`gallery`) are design nodes like the post's own picture: the same path rule, the same vault
// copy and rights checks, and the app's vaultItemId never reaches the engine.
import { describe, expect, it } from 'vitest';
import { designNodes, designProblems, withoutVaultIds } from './services/design-images.js';

const post = (gallery: unknown[]) => ({ template: 'post', kind: 'event', headline: 'Meet the *roasters*', meta: '12 Dec · 6pm · The roastery', gallery });

describe('gallery pictures as design nodes', () => {
  it('lists each picture of a post\'s gallery after the post itself', () => {
    const d = post([{ image: 'design/assets/demo/object-jar.jpg', caption: 'Ama' }, { image: 'design/assets/photos/vault-1.jpg', vaultItemId: 'x' }, 'not an object']);
    const nodes = designNodes(d);
    expect(nodes).toHaveLength(3);
    expect(nodes[2]).toEqual({ image: 'design/assets/photos/vault-1.jpg', vaultItemId: 'x' });
    // only a post's gallery: another template's key of that name is not a picture list
    expect(designNodes({ template: 'object', gallery: [{ image: 'x.jpg' }] })).toHaveLength(1);
  });
  it('strips the app\'s vaultItemId from every gallery picture, keeping the rest', () => {
    const out = withoutVaultIds(post([{ image: 'a.jpg', vaultItemId: 'v1', caption: 'Ama' }, { image: 'b.jpg', vaultItemId: 'v2' }])) as { gallery: unknown[] };
    expect(out.gallery).toEqual([{ image: 'a.jpg', caption: 'Ama' }, { image: 'b.jpg' }]);
  });
  it('treats the gallery of each carousel post page like the post\'s own: listed, stripped and named by page', async () => {
    const carousel = { template: 'carousel', pages: [post([{ image: 'design/assets/demo/object-jar.jpg' }]), post([{ image: 'a.jpg', vaultItemId: 'v1', caption: 'Ama' }, { image: '../../etc/secret.jpg' }])] };
    const nodes = designNodes(carousel);
    expect(nodes).toHaveLength(6);
    expect(nodes).toContainEqual({ image: '../../etc/secret.jpg' });
    const out = withoutVaultIds(carousel) as { pages: { gallery: unknown[] }[] };
    expect(out.pages[1].gallery).toEqual([{ image: 'a.jpg', caption: 'Ama' }, { image: '../../etc/secret.jpg' }]);
    const problems = await designProblems(carousel);
    expect(problems.some((p) => /design page 2 gallery picture 2: image "\.\.\/\.\.\/etc\/secret\.jpg" must be a file under design\/assets\//.test(p))).toBe(true);
  });
  it('refuses a gallery picture outside design/assets that is not a vault photo, naming the picture', async () => {
    const problems = await designProblems(post([{ image: 'design/assets/demo/object-jar.jpg' }, { image: '../../etc/secret.jpg' }]));
    expect(problems.some((p) => /design gallery picture 2: image "\.\.\/\.\.\/etc\/secret\.jpg" must be a file under design\/assets\//.test(p))).toBe(true);
    const empty = await designProblems(post([{ image: 'design/assets/demo/object-jar.jpg' }, { image: 'design/assets/demo/scene-market.jpg', vaultItemId: '' }]));
    expect(empty.some((p) => /design gallery picture 2: vaultItemId must be the id of a vault photo/.test(p))).toBe(true);
  });
});
