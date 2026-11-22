// Admin only: the brand (Settings, Brand) and its design references. Mounted at /api/settings/brand.
//
//   GET    /                      the settings in force, whether they are saved, the logos, the font and the contrast checks
//   PUT    /                      save the settings (checked by the engine's own brand validator before they are stored)
//   POST   /preview               what unsaved settings would give: the page colours, the contrast checks, the adjusted colours
//   POST   /direction-samples     { settings, direction }: sample posts (a statement, a figure, a photo or a second statement, a list)
//                                 drawn in that design direction with the brand as it would be saved; nothing is saved
//   PUT    /advanced              a brand.json fragment and the optional dot map, for people who know the engine's brand file
//   POST   /logo/:which           the full logo or the mark (PNG); :which is full | mark
//   GET    /logo/:which           the uploaded file
//   POST   /font?role=            a woff2 font with its family name: body (default: text, and headlines unless they have their
//                                 own), display (headlines) or label (labels and footers)
//   DELETE /font?role=            back to the built-in font for that role
//   GET    /font/:role            the stored font of a role (its latin file), for the page's preview; :role is body | display | label
//   GET    /google-fonts          the curated Google Fonts the type roles can use (family, category, weights, licence, note)
//   POST   /google-font           { role, family }: download that family from Google Fonts once, in every weight the role is drawn
//                                 at (or the nearest it has), and store it as the role's font, like an upload
//                                 (services/google-fonts.ts)
//   POST   /artwork               brand artwork for the decoration (PNG, JPEG or WebP; never SVG)
//   GET    /artwork               the uploaded file
//   DELETE /artwork
//   POST   /import                a brand pack's brand.json, its two logos, its optional map.json and font, all at once
//   GET    /references            the design references, each with a short-lived picture address
//   POST   /references            upload a picture (and a note); the AI describes it in the background
//   PATCH  /references/:id        the note, the brief and whether drafts use it
//   POST   /references/:id/analyse  ask the AI again
//   GET    /references/:id/proposal  the style settings the AI proposes, beside the ones in force (nothing is saved)
//   POST   /references/:id/apply     accept them: the proposal applied over the settings in force, checked and saved
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
  advancedSchema, applyProposal, assetsOf, baseBrand, bodyFont, brandFromProfile, fontFileKeys, proposalOf, brandProblems, brandSettingsSchema, contrastChecks, explicitRoles, paletteChanges, currentSettings, mapProblems, splitPackBrand, syncBrand,
  DIRECTIONS, familyWeightsOf, nearestWeights, storedWeights, type AssetFont, type BrandAssets,
} from '../services/brand-settings.js';
import { directionSamples } from '../services/direction-samples.js';
import { oneAtATime } from '../services/render.js';
import { fetchGoogleFont, findGoogleFont, GOOGLE_FONT_CATEGORIES, GOOGLE_FONTS, GoogleFontError } from '../services/google-fonts.js';
import { privateKey } from '../storage/types.js';
import { sniffImage } from './vault.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_FONT_BYTES = 2 * 1024 * 1024;
const MAX_ARTWORK_BYTES = 4 * 1024 * 1024;
const FONT_ROLES = ['body', 'display', 'label'] as const;
// The families the engine ships; an uploaded font takes a name of its own so its files never mix with these.
const BUILT_IN_FAMILIES = ['Inter', 'IBM Plex Mono'];
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
// Only a family of the curated list: no address is ever made from what the browser sent. The weights are the ones the role is
// drawn at (worked out on the server); `weight`, which older pages send, must be one the family offers and is brought as well.
const googleFontBody = z.object({
  role: z.enum(FONT_ROLES),
  family: z.string().max(60).refine((f) => !!findGoogleFont(f), 'Choose a family from the list'),
  weight: z.number().int().optional(),
}).strict().superRefine((b, ctx) => {
  const g = findGoogleFont(b.family);
  if (g && b.weight !== undefined && !g.weights.includes(b.weight)) ctx.addIssue({ code: 'custom', path: ['weight'], message: `${g.family} comes in ${g.weights.join(', ')}` });
});
// What a role's font is called on the page when its own name is taken (by the built-in fonts or another role's font).
const ROLE_SUFFIX = { body: 'Body', display: 'Headline', label: 'Label' } as const;
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

  // The colours posts use (every role, set or made from the four colours), the readability checks (marking the pairs that use a
  // colour people set themselves) and the derived colours that were moved, for a brand.json. When the Advanced fragment sets the
  // palette (an imported pack), the form's colours are not what posts use, so nothing counts as moved.
  const ADVANCED_PALETTE = ['grounds', 'text', 'accents', 'surfaces'];
  function look(settings: ReturnType<typeof currentSettings>, brand: Record<string, unknown>, advanced: unknown) {
    const fromAdvanced = !!advanced && typeof advanced === 'object' && ADVANCED_PALETTE.some((k) => k in (advanced as object));
    const pick = (k: string) => (brand[k] ?? {}) as Record<string, unknown>;
    const explicit = explicitRoles(settings);
    const surfaces = pick('surfaces'), text = pick('text');
    return {
      checks: contrastChecks(brand, explicit),
      changes: fromAdvanced ? [] : paletteChanges(settings, brand),
      explicit,
      palette: {
        grounds: pick('grounds'), text: { ...text, inverse: text.inverse ?? '#FFFFFF' }, accents: pick('accents'), slabs: (pick('poster').slabs ?? {}) as Record<string, unknown>,
        surfaces: { panel: surfaces.panel, card: surfaces.card, outline: surfaces.outline ?? text.ink },
      },
    };
  }
  const profileFields = (p: Awaited<ReturnType<typeof profile>>) => ({
    advanced: p?.advanced ?? {}, logoFullWidth: p?.logoFullWidth ?? null, logoFullHeight: p?.logoFullHeight ?? null, fontFamily: p?.fontFamily ?? null, fontKey: p?.fontKey ?? null, assets: p?.assets ?? {},
  });

  // A Google font says which weights it brought and, when the brand now draws its family at a weight the family has but the
  // font was stored without (the headline weight changed, or it was stored with one weight only), which ones picking it again
  // would add; until then the nearest stored weight stands in.
  const fontSource = (role: (typeof FONT_ROLES)[number], a: AssetFont | null | undefined, brand: Record<string, unknown>) => {
    if (!a) return null;
    const file = `/api/settings/brand/font/${role}`;
    if (!a.source) return { family: a.family, source: 'upload' as const, file };
    const weights = storedWeights(a).length ? storedWeights(a) : [a.source.weight!];
    const offered = findGoogleFont(a.source.family)?.weights ?? weights;
    const missing = nearestWeights(offered, familyWeightsOf(brand, a.family)).filter((w) => !weights.includes(w));
    return { family: a.family, source: 'google' as const, google: { family: a.source.family, weights, missing }, file };
  };

  async function view() {
    const p = await profile();
    const settings = currentSettings(p);
    const brand = brandFromProfile({ settings, ...profileFields(p) }, settings);
    const state = await syncBrand(deps);
    const assets = assetsOf(p?.assets);
    return {
      saved: !!p,
      settings,
      logos: {
        full: p?.logoFullKey ? '/api/settings/brand/logo/full' : null,
        mark: p?.logoMarkKey ? '/api/settings/brand/logo/mark' : null,
        fullSize: p?.logoFullWidth && p.logoFullHeight ? [p.logoFullWidth, p.logoFullHeight] : null,
      },
      font: p?.fontKey ? { family: p.fontFamily } : null,
      // The style layer's uploads: a display font, a label font, the artwork.
      fonts: { body: p?.fontKey ? p.fontFamily : null, display: assets.display?.family ?? null, label: assets.label?.family ?? null },
      // Where each role's font came from, and the address of its file for the page's preview.
      fontSources: Object.fromEntries(FONT_ROLES.map((r) => [r, fontSource(r, r === 'body' ? (p ? bodyFont(p) : null) : assets[r], brand)])),
      artwork: assets.artwork ? '/api/settings/brand/artwork' : null,
      advanced: p?.advanced ?? {},
      map: p?.map ?? null,
      ...look(settings, brand, p?.advanced),
      // Images cannot be made until the logo and the mark are uploaded.
      logosMissing: p ? state.logosMissing || !p.logoFullKey || !p.logoMarkKey : false,
      updatedAt: p?.updatedAt ?? null,
    };
  }

  app.get('/', async (c) => c.json(await view()));

  // Nothing is saved: the page asks this while people pick colours, so the checks and the preview follow the form.
  app.post('/preview', async (c) => {
    const settings = await readJson(c, brandSettingsSchema);
    const p = await profile();
    const brand = brandFromProfile({ settings, ...profileFields(p) }, settings);
    return c.json(look(settings, brand, p?.advanced));
  });

  // Sample posts in a design direction, drawn with the unsaved settings (one Chrome at a time; nothing is stored). The body is
  // checked before anything is drawn.
  const directionSamplesBody = z.strictObject({
    settings: brandSettingsSchema,
    direction: z.string().refine((d) => DIRECTIONS.includes(d), `Choose one of ${DIRECTIONS.join(', ')} for the design direction`),
  });
  app.post('/direction-samples', async (c) => {
    const body = await readJson(c, directionSamplesBody);
    await syncBrand(deps);
    return c.json(await directionSamples(deps, body, { lock: oneAtATime }));
  });

  app.put('/', async (c) => {
    const actor = c.get('user');
    const settings = await readJson(c, brandSettingsSchema);
    const existing = await profile();
    const candidate = brandFromProfile({ settings, ...profileFields(existing) }, settings);
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

  // Which type role a font upload is for: body (the sans: text, and headlines unless they have their own), display or label.
  const fontRole = (q: string | undefined) => {
    const role = q ?? 'body';
    if (!(FONT_ROLES as readonly string[]).includes(role)) throw badRequest('The request is not valid', [{ path: 'role', message: `Choose one of ${FONT_ROLES.join(', ')}` }]);
    return role as (typeof FONT_ROLES)[number];
  };
  const saveAssets = (assets: BrandAssets, actorId: string) => deps.prisma.brandProfile.update({ where: { id: 'brand' }, data: { assets: assets as Prisma.InputJsonValue, updatedById: actorId } });

  app.post('/font', async (c) => {
    const actor = c.get('user');
    const role = fontRole(c.req.query('role'));
    const { file, form } = await readFile(c);
    if (file.size > MAX_FONT_BYTES) throw new HttpError(413, 'The font is larger than 2 MB');
    const family = fontFamily.safeParse(form.family);
    if (!family.success) throw badRequest('The request is not valid', [{ path: 'family', message: family.error.issues[0]?.message ?? 'Give the font family a name' }]);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!isWoff2(bytes)) throw new HttpError(415, 'The font must be a .woff2 file');
    const p = await ensureProfile(actor.id);
    const assets = assetsOf(p.assets);
    // Each uploaded font has a family name of its own, so two files never claim the same family.
    const others = [
      ...(role === 'body' ? [] : BUILT_IN_FAMILIES), ...(role !== 'body' && p.fontFamily ? [p.fontFamily] : []),
      ...(['display', 'label'] as const).filter((r) => r !== role).map((r) => assets[r]?.family).filter((f): f is string => !!f),
    ];
    if (others.some((f) => f.toLowerCase() === family.data.toLowerCase())) throw badRequest('The request is not valid', [{ path: 'family', message: `"${family.data}" is already the name of another font; give this one its own name` }]);
    const key = privateKey('brand', `${role}.woff2`);
    await deps.storage.putObject(key, bytes, 'font/woff2');
    // Every file of the font it replaces (a Google font has two).
    const old = fontFileKeys(role === 'body' ? bodyFont(p) : assets[role]);
    if (role === 'body') {
      const next = { ...assets };
      delete next.body;
      await deps.prisma.brandProfile.update({ where: { id: 'brand' }, data: { fontKey: key, fontFamily: family.data, assets: next as Prisma.InputJsonValue, updatedById: actor.id } });
    } else await saveAssets({ ...assets, [role]: { key, family: family.data } }, actor.id);
    for (const k of old) await deps.storage.deleteObject(k).catch(() => undefined);
    await audit(deps, actor, 'brand.font.upload', 'brand', 'brand', { role, family: family.data, bytes: bytes.length });
    return c.json(await view());
  });

  app.delete('/font', async (c) => {
    const actor = c.get('user');
    const role = fontRole(c.req.query('role'));
    const p = await profile();
    const assets = assetsOf(p?.assets);
    const old = fontFileKeys(role === 'body' ? (p ? bodyFont(p) : null) : assets[role]);
    if (p && old.length) {
      const next = { ...assets };
      delete next[role];
      if (role === 'body') await deps.prisma.brandProfile.update({ where: { id: 'brand' }, data: { fontKey: null, fontFamily: null, assets: next as Prisma.InputJsonValue, updatedById: actor.id } });
      else await saveAssets(next, actor.id);
      for (const k of old) await deps.storage.deleteObject(k).catch(() => undefined);
      await audit(deps, actor, 'brand.font.remove', 'brand', 'brand', { role });
    }
    return c.json(await view());
  });

  // The stored font of a role, so the page can show its name in its own face (the app's CSP allows fonts from itself only).
  // The latin file only.
  app.get('/font/:role', async (c) => {
    const role = c.req.param('role');
    if (!(FONT_ROLES as readonly string[]).includes(role)) throw notFound();
    const p = await profile();
    const a = role === 'body' ? (p ? bodyFont(p) : null) : assetsOf(p?.assets)[role as 'display' | 'label'];
    if (!a) throw notFound();
    const body = await deps.storage.getObject(a.key);
    return c.body(new Uint8Array(body), 200, { 'content-type': 'font/woff2', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
  });

  app.get('/google-fonts', (c) => c.json({ categories: GOOGLE_FONT_CATEGORIES, fonts: GOOGLE_FONTS }));

  // A family of the curated list, downloaded from Google Fonts once (services/google-fonts.ts) and stored like an uploaded font:
  // every weight the brand draws the role's family at (the engine's familyWeights, with the settings as they will be), or the
  // nearest the family has, each in its latin file and, when Google has one, its latin-ext file, with their unicode-ranges. A
  // headline or label font is switched on for its role ("own"); the rest of the saved settings stay as they are. Nothing is
  // stored unless every file arrived and the brand with it passes the engine's checks.
  app.post('/google-font', async (c) => {
    const actor = c.get('user');
    const body = await readJson(c, googleFontBody);
    const g = findGoogleFont(body.family)!;
    const role = body.role;
    // What the brand will be with this font: worked out before anything is downloaded or stored.
    const plan = (p: Awaited<ReturnType<typeof profile>>, entry: (family: string) => AssetFont) => {
      const assets = assetsOf(p?.assets);
      // The family name on the page: Google's, unless the built-in fonts or another role's font already use it.
      const taken = [
        ...(role === 'body' ? [] : BUILT_IN_FAMILIES), ...(role !== 'body' && p?.fontKey && p.fontFamily ? [p.fontFamily] : []),
        ...(['display', 'label'] as const).filter((r) => r !== role).map((r) => assets[r]?.family).filter((f): f is string => !!f),
      ].map((f) => f.toLowerCase());
      const family = taken.includes(g.family.toLowerCase()) ? `${g.family} ${ROLE_SUFFIX[role]}` : g.family;
      const font = entry(family);
      const nextAssets: BrandAssets = { ...assets, [role]: font };
      const settings = currentSettings(p);
      const nextSettings = role === 'body' ? settings : { ...settings, style: { ...settings.style, type: { ...settings.style.type, [role]: { ...settings.style.type[role], font: 'own' } } } };
      const fontFields = role === 'body' ? { fontKey: font.key, fontFamily: family } : { fontKey: p?.fontKey ?? null, fontFamily: p?.fontFamily ?? null };
      const candidate = brandFromProfile({ ...profileFields(p), ...fontFields, settings: nextSettings as unknown as Prisma.JsonValue, assets: nextAssets as Prisma.JsonValue }, nextSettings);
      return { assets, family, nextAssets, nextSettings, fontFields, candidate };
    };
    const draft = plan(await profile(), (family) => ({ key: 'planned', family, files: [{ key: 'planned', range: 'U+0000-00FF', subset: 'latin', weights: [400] }], source: { kind: 'google', family: g.family, weights: [400] } }));
    // The weights the role is drawn at, each as the family has it or the nearest it has; and the one an older page asked for.
    const drawn = familyWeightsOf(draft.candidate, draft.family);
    const weights = nearestWeights(g.weights, [...(drawn.length ? drawn : [400]), ...(body.weight !== undefined ? [body.weight] : [])]);
    let files: Awaited<ReturnType<typeof fetchGoogleFont>>;
    try {
      files = await fetchGoogleFont(deps.fetchImpl, g, weights);
    } catch (e) {
      if (e instanceof GoogleFontError) throw new HttpError(e.status, e.message);
      throw e;
    }
    const stored = files.map((x) => ({ key: privateKey('brand', `${role}-${x.weights[0]}-${x.subset}.woff2`), range: x.range, subset: x.subset, weights: x.weights, bytes: x.bytes }))
      .sort((a, b) => a.weights[0]! - b.weights[0]! || (a.subset === 'latin' ? -1 : 1));
    // The preview shows the latin file of the weight nearest to 400.
    const regular = nearestWeights(weights, [400])[0]!;
    const preview = stored.find((x) => x.subset === 'latin' && x.weights.includes(regular))!;
    const p = await ensureProfile(actor.id);
    const { assets, family, nextAssets, nextSettings, fontFields, candidate } = plan(p, (fam) => ({
      key: preview.key, family: fam, files: stored.map((x) => ({ key: x.key, range: x.range, subset: x.subset, weights: x.weights })), source: { kind: 'google', family: g.family, weights },
    }));
    const problems = brandProblems(candidate);
    if (problems.length) throw badRequest('The brand is not valid with this font', problems);
    const old = fontFileKeys(role === 'body' ? bodyFont(p) : assets[role]);
    for (const x of stored) await deps.storage.putObject(x.key, x.bytes, 'font/woff2');
    await deps.prisma.brandProfile.update({
      where: { id: 'brand' },
      data: { ...fontFields, assets: nextAssets as Prisma.InputJsonValue, settings: nextSettings as unknown as Prisma.InputJsonValue, updatedById: actor.id },
    });
    for (const k of old) await deps.storage.deleteObject(k).catch(() => undefined);
    await audit(deps, actor, 'brand.font.google', 'brand', 'brand', {
      role, family: g.family, name: family, weights, licence: g.licence, source: 'fonts.googleapis.com', files: files.length,
      subsets: [...new Set(files.map((x) => x.subset))], bytes: files.reduce((n, x) => n + x.bytes.length, 0),
    });
    return c.json(await view());
  });

  // Brand artwork for the decoration: a PNG, JPEG or WebP picture whose bytes say so. Never SVG (it can carry script) and never
  // GIF; the engine checks the bytes again when it embeds the picture as a data: URI.
  app.post('/artwork', async (c) => {
    const actor = c.get('user');
    const { file } = await readFile(c);
    if (file.size > MAX_ARTWORK_BYTES) throw new HttpError(413, 'The artwork is larger than 4 MB');
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind || !['image/png', 'image/jpeg', 'image/webp'].includes(kind.type)) throw new HttpError(415, 'The artwork must be a PNG, JPEG or WebP picture');
    const p = await ensureProfile(actor.id);
    const assets = assetsOf(p.assets);
    const key = privateKey('brand', `artwork.${kind.ext}`);
    await deps.storage.putObject(key, bytes, kind.type);
    await saveAssets({ ...assets, artwork: { key, type: kind.type as 'image/png' | 'image/jpeg' | 'image/webp' } }, actor.id);
    if (assets.artwork) await deps.storage.deleteObject(assets.artwork.key).catch(() => undefined);
    await audit(deps, actor, 'brand.artwork.upload', 'brand', 'brand', { type: kind.type, bytes: bytes.length });
    return c.json(await view());
  });

  app.get('/artwork', async (c) => {
    const a = assetsOf((await profile())?.assets).artwork;
    if (!a) throw notFound();
    const body = await deps.storage.getObject(a.key);
    return c.body(new Uint8Array(body), 200, { 'content-type': a.type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' });
  });

  app.delete('/artwork', async (c) => {
    const actor = c.get('user');
    const p = await profile();
    const assets = assetsOf(p?.assets);
    if (p && assets.artwork) {
      const next = { ...assets };
      delete next.artwork;
      await saveAssets(next, actor.id);
      await deps.storage.deleteObject(assets.artwork.key).catch(() => undefined);
      await audit(deps, actor, 'brand.artwork.remove', 'brand', 'brand', {});
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
    const brandFile = file('brand'), full = file('full'), mark = file('mark'), mapFile = file('map'), fontUpload = file('font');
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
    // The pack's font files are paths inside its folder, which the upload does not carry. Its headline and text font comes
    // in as an optional .woff2 ("font"); without it the brand keeps Inter, and the answer says so. A label font other than
    // the built-in IBM Plex Mono is dropped the same way.
    const base = baseBrand(), baseFont = (base.font ?? {}) as Record<string, unknown>;
    const packFont = (split.advanced.font ?? {}) as Record<string, unknown>;
    const notes: string[] = [];
    let fontBytes: Buffer | null = null;
    const family = typeof packFont.family === 'string' ? packFont.family : null;
    if (fontUpload) {
      if (fontUpload.size > MAX_FONT_BYTES) throw new HttpError(413, 'The font is larger than 2 MB');
      fontBytes = Buffer.from(await fontUpload.arrayBuffer());
      if (!isWoff2(fontBytes)) throw new HttpError(415, 'The font must be a .woff2 file');
      if (!family || !fontFamily.safeParse(family).success) throw badRequest('The pack\'s font.family is not a usable name');
    } else if (family && family !== baseFont.family) {
      delete packFont.family;
      notes.push(`The pack uses the font "${family}". Upload its .woff2 file to use it; posts use ${String(baseFont.family)} until then.`);
    }
    if (typeof packFont.mono === 'string' && packFont.mono !== baseFont.mono) {
      notes.push(`The pack's label font "${packFont.mono}" is not built in; labels use ${String(baseFont.mono)}.`);
      delete packFont.mono;
    }
    for (const k of ['display', 'label'] as const) {
      const f = (brand as { font?: Record<string, unknown> }).font?.[k];
      if (typeof f === 'string' && f !== family && f !== packFont.mono && f !== baseFont.family && f !== baseFont.mono) notes.push(`The pack's ${k === 'display' ? 'headline' : 'label'} font "${f}" is not built in. Upload its .woff2 under Type to use it.`);
    }
    const packStyle = (brand as { style?: { decoration?: { kind?: unknown } } }).style;
    if (packStyle?.decoration?.kind === 'artwork') notes.push('The pack uses brand artwork. Upload the picture under Surfaces and decoration to show it.');
    if (family && fontBytes) delete packFont.family;
    const settings = { ...split.settings, logo: { wordmarkFrom: Math.min(split.settings.logo.wordmarkFrom, fullSize.width - 1), markGap: split.settings.logo.markGap } };
    const candidate = brandFromProfile({ settings, advanced: split.advanced as Prisma.JsonValue, logoFullWidth: fullSize.width, logoFullHeight: fullSize.height, fontFamily: fontBytes ? family : null }, settings);
    const after = brandProblems(candidate);
    if (after.length) throw badRequest('The brand is not valid after the import', after);
    const before = await profile();
    const { body: bodyAsset, ...restAssets } = assetsOf(before?.assets);
    const fullKey = privateKey('brand', 'logo-full.png'), markKey = privateKey('brand', 'logo-mark.png');
    await deps.storage.putObject(fullKey, fullBytes, 'image/png');
    await deps.storage.putObject(markKey, markBytes, 'image/png');
    const fontKey = fontBytes ? privateKey('brand', 'brand.woff2') : null;
    if (fontKey && fontBytes) await deps.storage.putObject(fontKey, fontBytes, 'font/woff2');
    const data = {
      settings: settings as unknown as Prisma.InputJsonValue, advanced: split.advanced as Prisma.InputJsonValue, map: (map ?? null) as unknown as Prisma.InputJsonValue,
      logoFullKey: fullKey, logoFullWidth: fullSize.width, logoFullHeight: fullSize.height, logoMarkKey: markKey, updatedById: actor.id,
      fontKey, fontFamily: fontKey ? family : null,
      // A Google body font's files and source go with the font they described.
      ...(bodyAsset ? { assets: restAssets as Prisma.InputJsonValue } : {}),
    };
    await deps.prisma.brandProfile.upsert({ where: { id: 'brand' }, create: data, update: data });
    for (const old of [before?.logoFullKey, before?.logoMarkKey, ...fontFileKeys(before ? bodyFont(before) : null)]) if (old) await deps.storage.deleteObject(old).catch(() => undefined);
    await audit(deps, actor, 'brand.import', 'brand', 'brand', { name: settings.name, series: settings.series.length, map: map !== null, font: !!fontKey, advancedKeys: Object.keys(split.advanced).length });
    return c.json({ ...(await view()), notes });
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

  // "Apply this look": the settings in force and the same settings with the reference's proposal applied, each with its colours
  // and checks, side by side. Nothing is saved here. The proposal is checked again on the way out (proposalOf).
  async function proposed(id: string) {
    const r = await reference(id);
    const proposal = proposalOf(r.analysis);
    if (!proposal) throw new HttpError(409, 'This reference has no style proposal. Ask the AI to describe it again.');
    const p = await profile();
    const current = currentSettings(p);
    let next: ReturnType<typeof currentSettings>;
    try { next = applyProposal(current, proposal); } catch { throw new HttpError(409, 'The proposal does not fit the brand settings. Ask the AI to describe it again.'); }
    return { r, p, proposal, current, next };
  }

  app.get('/references/:id/proposal', async (c) => {
    const { p, proposal, current, next } = await proposed(c.req.param('id'));
    const lookOf = (s: typeof current) => look(s, brandFromProfile({ settings: s, ...profileFields(p) }, s), p?.advanced);
    return c.json({ proposal, current: { settings: current, ...lookOf(current) }, proposed: { settings: next, ...lookOf(next) } });
  });

  // Accepting it: the proposal applied over the settings in force now, checked by the engine like any save.
  app.post('/references/:id/apply', async (c) => {
    const actor = c.get('user');
    const { r, p, next } = await proposed(c.req.param('id'));
    const problems = brandProblems(brandFromProfile({ settings: next, ...profileFields(p) }, next));
    if (problems.length) throw badRequest('The brand is not valid with this look', problems);
    const json = next as unknown as Prisma.InputJsonValue;
    await deps.prisma.brandProfile.upsert({ where: { id: 'brand' }, create: { settings: json, updatedById: actor.id }, update: { settings: json, updatedById: actor.id } });
    await audit(deps, actor, 'brand.reference.apply', 'design_reference', r.id, { fileName: r.fileName, firstSave: !p });
    return c.json(await view());
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
