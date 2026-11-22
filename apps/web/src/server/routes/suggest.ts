// AI suggestions a person reviews before anything is saved. Nothing here writes a brand setting or a vault item.
//
//   GET  /api/suggest                       whether suggestions can run now: { available, reason }   (admin, editor)
//   POST /api/suggest/brand-from-site       { website } -> { descriptor?, tagline?, voice?, visualDirection?, colours?, source }  (admin)
//   POST /api/suggest/picture-description   { vaultItemId } as JSON, or a picture as multipart (`file`, optional `title`,
//                                           `role`) -> { title?, description, tags?, peopleVisible }                     (admin, editor)
//
// Both go through the AI library's own provider choice (the provider ticked for drafting), the monthly budget and the call
// log (one ai_calls row per call, with the person who asked), like every other AI call. They answer 409 with the reason when
// no provider is ticked, no budget is set or the budget is used up, before anything is fetched or sent. The website is read on
// the server by the library's safe page reader; its text reaches the model only as data, and the answer is checked twice
// (the library's schema, then the strict shapes below). `peopleVisible` is a hint for the person and never sets consent.
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { audit } from '../audit.js';
import { loadAI, type AI } from '../ai.js';
import type { AppEnv, Deps } from '../deps.js';
import { HttpError, readJson } from '../http.js';
import { describeError, logger } from '../log.js';
import { requireRole, requireUser } from '../middleware.js';
import { getAiConfig, getSetting, SETTING_BUDGET, spentThisMonth } from '../services/ai-config.js';
import { syncBrand } from '../services/brand-settings.js';
import { sniffImage } from './vault.js';

// The AI reads one picture of at most 5 MB (the provider's limit). The upload page scales pictures down before it asks.
export const MAX_SUGGEST_PICTURE_BYTES = 5 * 1024 * 1024;
const PICTURE_ROLES = ['photo', 'screen', 'cutout', 'graphic'] as const;
const hex = z.string().regex(/^#[0-9A-F]{6}$/);

const siteBody = z.strictObject({ website: z.string().trim().min(1, 'Give the website address').max(300, 'Keep the address to 300 characters') });
const pictureBody = z.strictObject({ vaultItemId: z.string().trim().min(1).max(64) });

// What may reach the browser: the library already checked these, and they are checked again here.
const brandOut = z.strictObject({
  descriptor: z.string().min(1).max(200).optional(),
  tagline: z.string().min(1).max(120).optional(),
  voice: z.string().min(1).max(900).optional(),
  visualDirection: z.string().min(1).max(900).optional(),
  colours: z.strictObject({ primary: hex.optional(), accent: hex.optional() }).optional(),
});
const pictureOut = z.strictObject({
  title: z.string().min(1).max(80).optional(),
  description: z.string().min(1).max(400),
  tags: z.array(z.string().min(1).max(30)).max(6).optional(),
  peopleVisible: z.boolean(),
});

// Why suggestions cannot run now, in words for the page, or null. Provider first, then the budget.
export async function suggestBlocker(deps: Pick<Deps, 'prisma' | 'now'>): Promise<string | null> {
  if (!(await deps.prisma.aiProvider.count({ where: { enabled: true, tasks: { has: 'draft' } } }))) return 'No AI provider is set up for drafting, which suggestions use. Ask an admin to add one in Settings, AI and search';
  const [limit, spent] = await Promise.all([getSetting<unknown>(deps, SETTING_BUDGET, 0), spentThisMonth(deps)]);
  if (typeof limit !== 'number' || limit <= 0) return 'There is no monthly AI budget, so the AI cannot run. Ask an admin to set one in Settings, AI and search';
  if (spent >= limit) return 'The monthly AI budget is used up. Ask an admin to raise it in Settings, AI and search';
  return null;
}

type AiFailure = { name?: string; code?: unknown; message?: unknown };

// The library's refusals as answers a person can act on. Provider details stay in the log.
function aiProblem(err: unknown, secrets: string[], what: string): HttpError {
  const e = (err ?? {}) as AiFailure;
  const code = e.name === 'AIError' && typeof e.code === 'string' ? e.code : null;
  const message = describeError(err, secrets).message;
  if (code === 'budget') return new HttpError(409, 'The monthly AI budget is used up. Ask an admin to raise it in Settings, AI and search');
  if (code === 'config') return new HttpError(409, 'The AI is not set up for this. Ask an admin to check Settings, AI and search');
  if (code === 'unsafe_url') return new HttpError(422, `Vesk only reads public websites. ${message}`.slice(0, 300));
  if (code === 'site') return new HttpError(422, message.slice(0, 300));
  logger.warn('ai.suggest_failed', { what, ...describeError(err, secrets) });
  if (code === 'invalid_output' || code === 'truncated') return new HttpError(502, 'The AI\'s answer could not be used. Try again.');
  if (code) return new HttpError(502, 'The AI provider did not answer. Try again in a moment, or ask an admin to check Settings, AI and search.');
  return new HttpError(500, 'Something went wrong on our side. Try again, and tell an admin if it keeps happening.');
}

export function suggestRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  // Every suggestion request counts (each may cost money), per person, when RATE_LIMIT is on; at most three at once.
  const limited = async (c: Context<AppEnv>, run: () => Promise<Response>): Promise<Response> => {
    if (!deps.config.rateLimitEnabled) return run();
    const who = c.get('user').id;
    const gate = deps.limits.suggestUser.reserve(who);
    if (!gate.allowed) return c.json({ error: 'Too many AI suggestions. Try again in a few minutes.' }, 429, { 'retry-after': String(gate.retryAfterSeconds) });
    if (!deps.limits.suggestInflight.tryAcquire(who)) return c.json({ error: 'Too many AI suggestions at once. Wait for one to finish.' }, 429, { 'retry-after': '1' });
    try { return await run(); } finally { deps.limits.suggestInflight.release(who); }
  };

  // Ready checks first, so nothing is fetched or read when the AI could not run anyway; then the library with the stored settings.
  const withAi = async <T>(actorId: string, what: string, call: (ai: AI) => Promise<T>): Promise<T> => {
    const blocked = await suggestBlocker(deps);
    if (blocked) throw new HttpError(409, blocked);
    await syncBrand(deps);
    const config = await getAiConfig(deps, { actorId });
    const secrets = [...config.providers.map((p) => p.apiKey), ...(config.search ? [config.search.apiKey] : [])].filter(Boolean);
    const { createAI } = await loadAI();
    try {
      return await call(createAI(config));
    } catch (err) {
      throw aiProblem(err, secrets, what);
    } finally {
      await config.flush();
    }
  };

  app.get('/', async (c) => {
    const reason = await suggestBlocker(deps);
    return c.json({ available: reason === null, reason });
  });

  app.post('/brand-from-site', requireRole('admin'), (c) => limited(c, async () => {
    const actor = c.get('user');
    const { website } = await readJson(c, siteBody);
    const out = await withAi(actor.id, 'brand-from-site', (ai) => ai.suggestBrandFromSite({ website }));
    const checked = brandOut.safeParse(out.suggestion ?? {});
    if (!checked.success) throw new HttpError(502, 'The AI\'s answer could not be used. Try again.');
    let host: string | null = null;
    try { host = out.source?.url ? new URL(out.source.url).hostname : null; } catch { host = null; }
    await audit(deps, actor, 'ai.suggest_brand_from_site', 'brand', null, { host, fields: Object.keys(checked.data), promptVersion: out.notes?.promptVersion ?? null });
    return c.json({ ...checked.data, source: { url: out.source?.url ?? null } });
  }));

  app.post('/picture-description', (c) => limited(c, async () => {
    const actor = c.get('user');
    const picture = await readPicture(c);
    const out = await withAi(actor.id, 'picture-description', (ai) => ai.describePicture({ image: { mediaType: picture.type, data: picture.bytes }, hints: picture.hints }));
    const checked = pictureOut.safeParse(out.suggestion ?? {});
    if (!checked.success) throw new HttpError(502, 'The AI\'s answer could not be used. Try again.');
    await audit(deps, actor, 'ai.describe_picture', picture.itemId ? 'vault_item' : 'upload', picture.itemId, { size: picture.bytes.length, peopleVisible: checked.data.peopleVisible, promptVersion: out.notes?.promptVersion ?? null });
    return c.json(checked.data);
  }));

  // The picture to describe: a vault item's stored file, or one sent with the request (the upload page, before the item exists).
  // The type is read from the bytes, never from a name or a claimed type.
  async function readPicture(c: Context<AppEnv>): Promise<{ bytes: Buffer; type: string; itemId: string | null; hints: { title?: string; fileName?: string; role?: string } }> {
    const contentType = c.req.header('content-type') ?? '';
    if (contentType.startsWith('multipart/form-data')) {
      let form: Record<string, unknown>;
      try { form = await c.req.parseBody(); } catch { throw new HttpError(400, 'Send the picture as multipart form data in a field named "file"'); }
      const file = form.file;
      if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Send the picture as multipart form data in a field named "file"');
      if (file.size > MAX_SUGGEST_PICTURE_BYTES) throw new HttpError(413, 'The picture is larger than 5 MB, which is more than the AI reads');
      const bytes = Buffer.from(await file.arrayBuffer());
      const kind = sniffImage(bytes);
      if (!kind) throw new HttpError(415, 'The AI reads JPEG, PNG, WebP and GIF pictures');
      const title = typeof form.title === 'string' ? form.title.trim().slice(0, 200) : '';
      const role = typeof form.role === 'string' && (PICTURE_ROLES as readonly string[]).includes(form.role) ? form.role : undefined;
      return { bytes, type: kind.type, itemId: null, hints: { ...(title ? { title } : {}), fileName: file.name.slice(0, 120), ...(role ? { role } : {}) } };
    }
    const { vaultItemId } = await readJson(c, pictureBody);
    const item = await deps.prisma.vaultItem.findUnique({ where: { id: vaultItemId } });
    if (!item || item.deletedAt) throw new HttpError(404, 'Vault item not found');
    if ((item.kind !== 'photo' && item.kind !== 'screen') || !item.fileKey) throw new HttpError(422, 'This item has no picture to describe');
    if ((item.size ?? 0) > MAX_SUGGEST_PICTURE_BYTES) throw new HttpError(413, 'The picture is larger than 5 MB, which is more than the AI reads');
    const bytes = await deps.storage.getObject(item.fileKey);
    if (bytes.length > MAX_SUGGEST_PICTURE_BYTES) throw new HttpError(413, 'The picture is larger than 5 MB, which is more than the AI reads');
    const kind = sniffImage(bytes);
    if (!kind) throw new HttpError(415, 'The AI reads JPEG, PNG, WebP and GIF pictures');
    return { bytes, type: kind.type, itemId: item.id, hints: { title: item.title, ...(item.fileName ? { fileName: item.fileName } : {}), role: item.kind === 'screen' ? 'screen' : item.role } };
  }

  return app;
}
