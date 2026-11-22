// Carousels on their way to Buffer, without a database or Buffer: each network gets the rendered pages in page order, and a post with
// more images than a network takes in one post cannot be approved for it (the engine's warning is a blocker here).
import { describe, expect, it } from 'vitest';
import type { Post } from '@prisma/client';
import { engineImport } from './engine/root.js';
import { isHardWarning } from './services/approval-rules.js';
import { mediaFor, type MediaEntry } from './services/post-model.js';

interface EngineBatch {
  validateBatch(raw: unknown, o: { fallbackName: string }): { errors: string[]; batch: unknown };
  resolveItems(b: unknown): Array<{ network: string; warnings: string[] }>;
  buildInput(item: unknown, o: { draft: boolean }): { assets?: Array<{ image: { url: string } }>; saveToDraft?: boolean };
}
interface EngineNetworks { MEDIA_LIMITS: Record<string, number> }

const page = (slide: number): MediaEntry => ({ rel: `tips-${slide + 1}.jpg`, key: `renders/b/tips/tips-${slide + 1}.jpg`, sha256: 'a'.repeat(64), size: 1, contentType: 'image/jpeg', kind: 'image', source: 'render', renderSize: 'feed', slide });
const carousel = { template: 'carousel', pages: [{ template: 'post', kind: 'statement', headline: 'a' }, { template: 'post', kind: 'statement', headline: 'b' }, { template: 'post', kind: 'statement', headline: 'c' }] };

describe('carousel media', () => {
  it('sends the rendered pages in page order, then files uploaded by hand', () => {
    const upload: MediaEntry = { ...page(0), rel: 'extra.jpg', source: 'upload', renderSize: undefined, slide: undefined };
    const post = { networks: {}, design: carousel, media: [page(2), upload, page(0), page(1)] } as unknown as Pick<Post, 'networks' | 'design' | 'media'>;
    expect(mediaFor(post, 'instagram').map((m) => m.rel)).toEqual(['tips-1.jpg', 'tips-2.jpg', 'tips-3.jpg', 'extra.jpg']);
  });

  it('builds a draft request with the images in that order (no request is sent)', async () => {
    const engine = await engineImport<EngineBatch>('batch');
    const { batch } = engine.validateBatch({ timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'm', posts: [{ id: 'tips', date: '2027-01-05', caption: 'Swipe', media: ['tips-1.jpg', 'tips-2.jpg', 'tips-3.jpg'], skip: ['linkedin', 'facebook'] }] }, { fallbackName: 'x' });
    const [item] = engine.resolveItems(batch);
    const input = engine.buildInput({ ...item, media: (item as unknown as { media: Array<Record<string, unknown>> }).media.map((m, i) => ({ ...m, url: `https://cdn.example/${i + 1}.jpg` })) }, { draft: true });
    expect(input.assets?.map((a) => a.image.url)).toEqual(['https://cdn.example/1.jpg', 'https://cdn.example/2.jpg', 'https://cdn.example/3.jpg']);
    expect(input.saveToDraft).toBe(true);
  });

  it('blocks approval when a network gets more images than it takes, with the engine\'s own message', async () => {
    const engine = await engineImport<EngineBatch>('batch');
    const { MEDIA_LIMITS } = await engineImport<EngineNetworks>('networks');
    const files = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}.jpg`);
    const warnings = (n: number) => {
      const { batch } = engine.validateBatch({ timezone: 'UTC', defaultTime: '09:00', mediaRoot: 'm', posts: [{ id: 'p', date: '2027-01-05', caption: 'c', media: files(n), skip: ['linkedin', 'facebook'], networks: { x: {} } }] }, { fallbackName: 'x' });
      return engine.resolveItems(batch).flatMap((i) => i.warnings.map((w) => ({ network: i.network, w })));
    };
    const over = warnings(MEDIA_LIMITS.instagram! + 1);
    expect(over.find((x) => x.network === 'instagram')?.w).toMatch(/^11 items, Instagram allows 10 in one post; remove pages/);
    expect(over.find((x) => x.network === 'x')?.w).toMatch(/^11 images, X allows 4; remove pages/);
    expect(over.filter((x) => isHardWarning(x.w)).map((x) => x.network).sort()).toEqual(['instagram', 'x']);
    expect(warnings(MEDIA_LIMITS.x!).filter((x) => isHardWarning(x.w))).toEqual([]);
    expect(isHardWarning('several items including a video; most networks take one video alone')).toBe(false);
  });
});
