// After drafting, the made-up photo paths the AI was offered (design/assets/photos/vault-<id>.jpg) become `vaultItemId`, which is
// how the render job finds the real file. A post's row of round pictures (`gallery`) and its portrait (`avatar`) name pictures
// too: left unlinked, the render failed with "image not found" for every AI-drafted gallery.
import { describe, expect, it } from 'vitest';
import { linkVaultPhotos } from './services/ai-vault.js';

const A = '3578cd1a-b90e-4f2d-b84f-5c78381d75c2';
const B = '5f0fd2b2-cde2-4d7c-868f-bb23e9d478ed';
const C = '4dff0343-350d-4cfb-924b-3a564d90bfef';
const path = (id: string) => `design/assets/photos/vault-${id}.jpg`;

describe('linkVaultPhotos', () => {
  it('links the post\'s own picture', () => {
    const r = linkVaultPhotos({ template: 'post', kind: 'photo', headline: 'Hi', image: path(A) });
    expect(r.design).toMatchObject({ image: path(A), vaultItemId: A });
    expect(r.photoIds).toEqual([A]);
  });

  it('links every gallery picture and the avatar of a post', () => {
    const r = linkVaultPhotos({ template: 'post', kind: 'statement', headline: 'Hi', gallery: [{ image: path(A) }, { image: path(B), caption: 'B' }], avatar: { image: path(C) } });
    const d = r.design as { gallery: Array<Record<string, unknown>>; avatar: Record<string, unknown> };
    expect(d.gallery).toEqual([{ image: path(A), vaultItemId: A }, { image: path(B), caption: 'B', vaultItemId: B }]);
    expect(d.avatar).toEqual({ image: path(C), vaultItemId: C });
    expect(r.photoIds.sort()).toEqual([A, B, C].sort());
  });

  it('links the gallery of a post page of a carousel', () => {
    const r = linkVaultPhotos({ template: 'carousel', pages: [{ template: 'post', kind: 'statement', headline: 'Hi', gallery: [{ image: path(B) }] }] });
    expect((r.design as { pages: Array<{ gallery: unknown[] }> }).pages[0]!.gallery).toEqual([{ image: path(B), vaultItemId: B }]);
    expect(r.photoIds).toEqual([B]);
  });

  it('leaves other paths alone', () => {
    const r = linkVaultPhotos({ template: 'post', kind: 'statement', headline: 'Hi', gallery: [{ image: 'design/assets/photos/cocoa.jpg' }, 'odd'] });
    expect((r.design as { gallery: unknown[] }).gallery).toEqual([{ image: 'design/assets/photos/cocoa.jpg' }, 'odd']);
    expect(r.photoIds).toEqual([]);
  });
});
