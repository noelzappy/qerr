// Admin only: the brand (Settings, Brand) and its design references. Mounted at /api/settings/brand.
//
//   GET    /                      the settings in force, whether they are saved, the logos, the font and the contrast checks
//   PUT    /                      save the settings (checked by the engine's own brand validator before they are stored)
//   PUT    /advanced              a brand.json fragment and the optional dot map, for people who know the engine's brand file
//   POST   /logo/:which           the full logo or the mark (PNG); :which is full | mark
//   GET    /logo/:which           the uploaded file
//   POST   /font                  a woff2 font for headlines and text, with its family name
//   DELETE /font                  back to the built-in font
//   POST   /import                a brand pack's brand.json, its two logos and its optional map.json, all at once
//   GET    /references            the design references, each with a short-lived picture address
//   POST   /references            upload a picture (and a note); the AI describes it in the background
//   PATCH  /references/:id        the note, the brief and whether drafts use it
//   POST   /references/:id/analyse  ask the AI again
//   DELETE /references/:id
import { Hono } from 'hono';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { audit } from '../audit.js';
import type { AppEnv, Deps } from '../deps.js';
import { badRequest, HttpError, notFound, readJson } from '../http.js';
import { requireRole, requireUser } from '../middleware.js';
import { enqueueTracked } from '../services/activity.js';
import {
  advancedSchema, brandFromProfile, brandProblems, brandSettingsSchema, contrastChecks, currentSettings, expandBrand, mapProblems, splitPackBrand, syncBrand,
} from '../services/brand-settings.js';
import { privateKey } from '../storage/types.js';
import { sniffImage } from './vault.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_FONT_BYTES = 2 * 1024 * 1024;
// The browser scales a reference down before it uploads it; the AI accepts up to 5 MB per picture.
const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;
const MAX_REFERENCES = 24;
const URL_TTL_SECONDS = 15 * 60;

// Width and height from a PNG's header (IHDR), or null.
export function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (sniffImage(buf)?.type !== 'image/png' || buf.length < 24 || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 20000 && height <= 20000 ? { width, height } : null;
}

const isWoff2 = (buf: Buffer) => buf.length > 48 && buf.toString('latin1', 0, 4) === 'wOF2';

const fontFamily = z.string().trim().regex(/^[A-Za-z0-9 _-]{1,40}$/, 'Use letters, digits, spaces, _ and - (up to 40)');
const referencePatch = z.object({
  note: z.string().trim().max(500).optional(),
  brief: z.string().trim().min(1).max(2000).optional(),
  enabled: z.boolean().optional(),
}).strict();

async function readFile(c: { req: { parseBody(): Promise<Record<string, unknown>> } }): Promise<{ file: File; form: Record<string, unknown> }> {
  let form: Record<string, unknown>;
  try { form = await c.req.parseBody(); } catch { throw new HttpError(400, 'Send the file as multipart form data in a field named "file"'); }
  const file = form.file;
  if (!(file instanceof File)) throw new HttpError(400, 'Send the file as multipart form data in a field named "file"');
  if (file.size === 0) throw new HttpError(400, 'The file is empty');
  return { file, form };
}

const safeStem = (name: string) => (name.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'reference';

export function brandRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin'));

  const profile = () => deps.prisma.brandProfile.findUnique({ where: { id: 'brand' } });

  // The row, made from the settings in force when there is none yet (the first upload or Advanced save creates it).
  async function ensureProfile(actorId: string) {
    const existing = await profile();
    if (existing) return existing;
    return deps.prisma.brandProfile.create({ data: { settings: currentSettings(null) as unknown as Prisma.InputJsonValue, updatedById: actorId } });
  }

  async function view() {
    const p = await profile();
    const settings = currentSettings(p);
    const brand = p ? brandFromProfile(p, settings) : expandBrand(settings);
    const state = await syncBrand(deps);
    return {
      saved: !!p,
      settings,
      logos: {
        full: p?.logoFullKey ? '/api/settings/brand/logo/full' : null,
        mark: p?.logoMarkKey ? '/api/settings/brand/logo/mark' : null,
        fullSize: p?.logoFullWidth && p.logoFullHeight ? [p.logoFullWidth, p.logoFullHeight] : null,
      },
      font: p?.fontKey ? { family: p.fontFamily } : null,
      advanced: p?.advanced ?? {},
      map: p?.map ?? null,
      checks: contrastChecks(brand),
      // Images cannot be made until the logo and the mark are uploaded.
      logosMissing: p ? state.logosMissing || !p.logoFullKey || !p.logoMarkKey : false,
      updatedAt: p?.updatedAt ?? null,
    };
  }

  app.get('/', async (c) => c.json(await view()));

  app.put('/', async (c) => {
    const actor = c.get('user');
    const settings = await readJson(c, brandSettingsSchema);
    const existing = await profile();
    const candidate = brandFromProfile({ settings, advanced: existing?.advanced ?? {}, logoFullWidth: existing?.logoFullWidth ?? null, logoFullHeight: existing?.logoFullHeight ?? null, fontFamily: existing?.fontFamily ?? null }, settings);
    const problems = brandProblems(candidate);
    if (problems.length) throw badRequest('The brand is not valid', problems);
    if (existing?.logoFullWidth && settings.logo.wordmarkFrom >= existing.logoFullWidth) throw badRequest('The brand is not valid', ['The wordmark must start inside the logo']);
    const json = settings as unknown as Prisma.InputJsonValue;
    await deps.prisma.brandProfile.upsert({ where: { id: 'brand' }, create: { settings: json, updatedById: actor.id }, update: { settings: json, updatedById: actor.id } });
    await audit(deps, actor, 'brand.update', 'brand', 'brand', { name: settings.name, series: settings.series.length, firstSave: !existing });
    return c.json(await view());
  });

  app.put('/advanced', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, advancedSchema);
    if (body.map !== null && body.map !== undefined) {
      const bad = mapProblems(body.map);
      if (bad.length) throw badRequest('The map is not valid', bad);
    }
    const p = await ensureProfile(actor.id);
    const candidate = brandFromProfile({ ...p, advanced: body.advanced as Prisma.JsonValue });
    const problems = brandProblems(candidate);
    if (problems.length) throw badRequest('The brand is not valid with these Advanced settings', problems);
    await deps.prisma.brandProfile.update({
      where: { id: 'brand' },
      data: { advanced: body.advanced as Prisma.InputJsonValue, map: body.map === null || body.map === undefined ? (null as unknown as Prisma.InputJsonValue) : (body.map as Prisma.InputJsonValue), updatedById: actor.id },
    });
    await audit(deps, actor, 'brand.advanced.update', 'brand', 'brand', { keys: Object.keys(body.advanced).slice(0, 30), map: body.map != null });
    return c.json(await view());
  });

  app.post('/logo/:which', async (c) => {
    const actor = c.get('user');
    const which = c.req.param('which');
    if (which !== 'full' && which !== 'mark') throw notFound();
    const { file } = await readFile(c);
    if (file.size > MAX_LOGO_BYTES) throw new HttpError(413, 'The logo is larger than 2 MB');
    const bytes = Buffer.from(await file.arrayBuffer());
    const size = pngSize(bytes);
    if (!size) throw new HttpError(415, 'The logo must be a PNG file (a transparent background works best)');
    const p = await ensureProfile(actor.id);
    const key = privateKey('brand', `logo-${which}.png`);
    await deps.storage.putObject(key, bytes, 'image/png');
    const old = which === 'full' ? p.logoFullKey : p.logoMarkKey;
    if (which === 'full') {
      const settings = currentSettings(p);
      // A new logo: the wordmark position from the form (the page measures it), else where the old one was if it still fits.
      const from = Number(c.req.query('wordmarkFrom'));
      const gap = Number(c.req.query('markGap'));
      const logo = {
        wordmarkFrom: Number.isInteger(from) && from >= 0 && from < size.width ? from : settings.logo.wordmarkFrom < size.width ? settings.logo.wordmarkFrom : 0,
        markGap: Number.isInteger(gap) && gap >= 0 && gap < size.width ? gap : settings.logo.markGap,
      };
      await deps.prisma.brandProfile.update({ where: { id: 'brand' }, data: { logoFullKey: key, logoFullWidth: size.width, logoFullHeight: size.height, settings: { ...settings, logo } as unknown as Prisma.InputJsonValue, updatedById: actor.id } });
    } else {
      await deps.prisma.brandProfile.update({ where: { id: 'brand' }, data: { logoMarkKey: key, updatedById: actor.id } });
    }
    if (old) await deps.storage.deleteObject(old).catch(() => undefined);
    await audit(deps, actor, 'brand.logo.upload', 'brand', 'brand', { which, width: size.width, height: size.height, bytes: bytes.length });
    return c.json(await view());
  });

  app.get('/logo/:which', async (c) => {
    const p = await profile();
    const key = c.req.param('which') === 'full' ? p?.logoFullKey : c.req.param('which') === 'mark' ? p?.logoMarkKey : null;
    if (!key) throw notFound();
    const body = await deps.storage.getObject(key);
    return c.body(new Uint8Array(body), 200, { 'content-type': 'image/png', 'cache-control': 'private, no-store' });
  });

  app.post('/font', async (c) => {
    const actor = c.get('user');
    const { file, form } = await readFile(c);
    if (file.size > MAX_FONT_BYTES) throw new HttpError(413, 'The font is larger than 2 MB');
    const family = fontFamily.safeParse(form.family);
    if (!family.success) throw badRequest('The request is not valid', [{ path: 'family', message: family.error.issues[0]?.message ?? 'Give the font family a name' }]);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!isWoff2(bytes)) throw new HttpError(415, 'The font must be a .woff2 file');
    const p = await ensureProfile(actor.id);
    const key = privateKey('brand', 'brand.woff2');
    await deps.storage.putObject(key, bytes, 'font/woff2');
    await deps.prisma.brandProfile.update({ where: { id: 'brand' }, data: { fontKey: key, fontFamily: family.data, updatedById: actor.id } });
    if (p.fontKey) await deps.storage.deleteObject(p.fontKey).catch(() => undefined);
    await audit(deps, actor, 'brand.font.upload', 'brand', 'brand', { family: family.data, bytes: bytes.length });
    return c.json(await view());
  });

  app.delete('/font', async (c) => {
    const actor = c.get('user');
    const p = await profile();
    if (p?.fontKey) {
      await deps.prisma.brandProfile.update({ where: { id: 'brand' }, data: { fontKey: null, fontFamily: null, updatedById: actor.id } });
      await deps.storage.deleteObject(p.fontKey).catch(() => undefined);
      await audit(deps, actor, 'brand.font.remove', 'brand', 'brand', {});
    }
    return c.json(await view());
  });

  // A brand pack moved in one step: brand.json (checked by the engine), the full logo and the mark (PNG), and map.json if the
  // pack has one. The pack's own values become the settings and the Advanced fragment; nothing in the pack is run.
  app.post('/import', async (c) => {
    const actor = c.get('user');
    let form: Record<string, unknown>;
    try { form = await c.req.parseBody(); } catch { throw new HttpError(400, 'Send the files as multipart form data'); }
    const file = (k: string) => (form[k] instanceof File ? form[k] as File : null);
    const brandFile = file('brand'), full = file('full'), mark = file('mark'), mapFile = file('map');
    if (!brandFile || !full || !mark) throw badRequest('Send brand.json, the full logo and the mark');
    if (brandFile.size > 512 * 1024 || (mapFile && mapFile.size > 512 * 1024)) throw new HttpError(413, 'brand.json and map.json must be under 512 KB');
    if (full.size > MAX_LOGO_BYTES || mark.size > MAX_LOGO_BYTES) throw new HttpError(413, 'Each logo must be under 2 MB');
    let brand: unknown, map: unknown = null;
    try { brand = JSON.parse(await brandFile.text()); } catch { throw badRequest('brand.json is not valid JSON'); }
    try { if (mapFile) map = JSON.parse(await mapFile.text()); } catch { throw badRequest('map.json is not valid JSON'); }
    const fullBytes = Buffer.from(await full.arrayBuffer()), markBytes = Buffer.from(await mark.arrayBuffer());
    const fullSize = pngSize(fullBytes);
    if (!fullSize || !pngSize(markBytes)) throw new HttpError(415, 'Both logos must be PNG files');
    const problems = brandProblems(brand as Record<string, unknown>);
    if (problems.length) throw badRequest('The brand.json is not valid', problems);
    if (map !== null) { const bad = mapProblems(map); if (bad.length) throw badRequest('The map is not valid', bad); }
    let split: ReturnType<typeof splitPackBrand>;
    try { split = splitPackBrand(brand as Record<string, unknown>); } catch { throw badRequest('The brand.json could not be read into the settings'); }
    const settings = { ...split.settings, logo: { wordmarkFrom: Math.min(split.settings.logo.wordmarkFrom, fullSize.width - 1), markGap: split.settings.logo.markGap } };
    const candidate = brandFromProfile({ settings, advanced: split.advanced as Prisma.JsonValue, logoFullWidth: fullSize.width, logoFullHeight: fullSize.height, fontFamily: null }, settings);
    const after = brandProblems(candidate);
    if (after.length) throw badRequest('The brand is not valid after the import', after);
    const before = await profile();
    const fullKey = privateKey('brand', 'logo-full.png'), markKey = privateKey('brand', 'logo-mark.png');
    await deps.storage.putObject(fullKey, fullBytes, 'image/png');
    await deps.storage.putObject(markKey, markBytes, 'image/png');
    const data = {
      settings: settings as unknown as Prisma.InputJsonValue, advanced: split.advanced as Prisma.InputJsonValue, map: (map ?? null) as unknown as Prisma.InputJsonValue,
      logoFullKey: fullKey, logoFullWidth: fullSize.width, logoFullHeight: fullSize.height, logoMarkKey: markKey, updatedById: actor.id,
    };
    await deps.prisma.brandProfile.upsert({ where: { id: 'brand' }, create: data, update: data });
    for (const old of [before?.logoFullKey, before?.logoMarkKey]) if (old) await deps.storage.deleteObject(old).catch(() => undefined);
    await audit(deps, actor, 'brand.import', 'brand', 'brand', { name: settings.name, series: settings.series.length, map: map !== null, advancedKeys: Object.keys(split.advanced).length });
    return c.json(await view());
  });

  // ---- design references ----

  const publicReference = async (r: Awaited<ReturnType<typeof deps.prisma.designReference.findUniqueOrThrow>>) => {
    let imageUrl: string | null = null;
    try { imageUrl = await deps.storage.presignGet(r.fileKey, URL_TTL_SECONDS); } catch { imageUrl = null; }
    return {
      id: r.id, fileName: r.fileName, contentType: r.contentType, size: r.size, note: r.note, status: r.status, analysis: r.analysis, brief: r.brief,
      error: r.error, enabled: r.enabled, createdAt: r.createdAt, updatedAt: r.updatedAt, imageUrl,
    };
  };
  const reference = async (id: string) => {
    const r = await deps.prisma.designReference.findUnique({ where: { id } });
    if (!r) throw notFound('Design reference not found');
    return r;
  };
  const analyse = (actorId: string, r: { id: string; fileName: string }) =>
    enqueueTracked(deps, 'analyse-reference', { referenceId: r.id, actorId }, { singletonKey: r.id }, { title: `Describe design reference ${r.fileName}`, actorId });

  app.get('/references', async (c) => {
    const rows = await deps.prisma.designReference.findMany({ orderBy: { createdAt: 'asc' } });
    return c.json({ references: await Promise.all(rows.map(publicReference)), max: MAX_REFERENCES });
  });

  app.post('/references', async (c) => {
    const actor = c.get('user');
    if (await deps.prisma.designReference.count() >= MAX_REFERENCES) throw new HttpError(409, `Keep at most ${MAX_REFERENCES} design references; remove one first`);
    const { file, form } = await readFile(c);
    if (file.size > MAX_REFERENCE_BYTES) throw new HttpError(413, 'The picture is larger than 5 MB');
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) throw new HttpError(415, 'Upload a JPEG, PNG, WebP or GIF picture');
    const note = z.string().trim().max(500).safeParse(form.note ?? '');
    if (!note.success) throw badRequest('The request is not valid', [{ path: 'note', message: 'Keep the note under 500 characters' }]);
    const fileName = `${safeStem(file.name)}.${kind.ext}`;
    const key = privateKey('brand', 'references', fileName);
    await deps.storage.putObject(key, bytes, kind.type);
    const row = await deps.prisma.designReference.create({ data: { fileKey: key, fileName, contentType: kind.type, size: bytes.length, note: note.data, createdById: actor.id } });
    await audit(deps, actor, 'design_reference.create', 'design_reference', row.id, { fileName, size: bytes.length });
    await analyse(actor.id, row);
    return c.json({ reference: await publicReference(row) }, 201);
  });

  app.patch('/references/:id', async (c) => {
    const actor = c.get('user');
    const r = await reference(c.req.param('id'));
    const body = await readJson(c, referencePatch);
    const row = await deps.prisma.designReference.update({ where: { id: r.id }, data: body });
    await audit(deps, actor, 'design_reference.update', 'design_reference', r.id, { changed: Object.keys(body) });
    await syncBrand(deps);
    return c.json({ reference: await publicReference(row) });
  });

  app.post('/references/:id/analyse', async (c) => {
    const actor = c.get('user');
    const r = await reference(c.req.param('id'));
    const row = await deps.prisma.designReference.update({ where: { id: r.id }, data: { status: 'pending', error: null } });
    await analyse(actor.id, r);
    return c.json({ reference: await publicReference(row) });
  });

  app.delete('/references/:id', async (c) => {
    const actor = c.get('user');
    const r = await reference(c.req.param('id'));
    await deps.prisma.designReference.delete({ where: { id: r.id } });
    await deps.storage.deleteObject(r.fileKey).catch(() => undefined);
    await audit(deps, actor, 'design_reference.delete', 'design_reference', r.id, { fileName: r.fileName });
    await syncBrand(deps);
    return c.json({ ok: true });
  });

  return app;
}
