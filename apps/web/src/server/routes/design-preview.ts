// Drawing a post's design without saving it, for the post editor's live preview. Mounted at /api/posts/preview-design.
//
//   POST /   { design, size? } -> { ok, image, images, size, warnings, notes } or { ok: false, error, ... }
//
// The design is refused with the same messages as saving a post. Nothing is stored: no post, media or batch is touched.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { syncBrand } from '../services/brand-settings.js';
import { PREVIEW_SIZES, previewDesign } from '../services/design-preview.js';
import { oneAtATime } from '../services/render.js';

const body = z.strictObject({
  design: z.record(z.string(), z.unknown()),
  size: z.enum(PREVIEW_SIZES).optional(),
});

export function designPreviewRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  app.post('/', async (c) => {
    const { design, size } = await readJson(c, body);
    const brand = await syncBrand(deps);
    if (brand.logosMissing) throw new HttpError(409, 'Add your logo and its mark in Settings, Brand before a preview can be made');
    return c.json(await previewDesign(deps, design, { size, lock: oneAtATime }));
  });

  return app;
}
