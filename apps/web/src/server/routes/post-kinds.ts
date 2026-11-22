// What a `post` design can say, for the post editor and Settings: the kinds of post, the fields each takes, what it needs and the
// layouts (variants) of the brand's design direction. Mounted at /api/posts/post-kinds.
//
//   GET /  -> { direction, kinds: [{ kind, fields, required, variants: [{ variant, name, describe }] }], limits }
//
// `direction` is style.direction of the brand in force (null when it has none); `variants` are its layouts for each kind (none
// without a direction). `fields` lists every field some direction draws for the kind, whatever the brand's direction.
// `limits` are the engine's own: characters per field, and the list.
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { AppEnv, Deps } from '../deps.js';
import { engineImport } from '../engine/root.js';
import { requireRole, requireUser } from '../middleware.js';
import { brandState, DIRECTIONS, syncBrand } from '../services/brand-settings.js';

interface Composition { id: string; name: string; describe: string; fields: string[] }
interface EngineCore { ROOT: string }
interface EngineTokens { DIRECTIONS: string[]; POST_KINDS: string[] }
interface EnginePostSpec { POST_FIELDS: Record<string, { max: number }>; POST_ITEMS: { min: number; max: number; chars: number }; POST_REQUIRED: Record<string, string[]> }
interface EngineDirections { compositionsFor(direction: string, kind: string): Composition[] }

const core = await engineImport<EngineCore>('core');
const tokens = await engineImport<EngineTokens>('design/tokens');
const postSpec = await engineImport<EnginePostSpec>('design/post-spec');
const directions = await engineImport<EngineDirections>('design/directions/index');

// The order fields are listed in.
const FIELD_ORDER = ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'image', 'meta', 'tag'];
const LIMITED = ['label', 'headline', 'sub', 'big', 'unit', 'quote', 'by', 'meta', 'tag'];

// style.direction of the brand.json in force, or null (no file, no direction, or one the engine does not know).
function directionInForce(): string | null {
  try {
    const file = path.join(core.ROOT, brandState().dir, 'brand.json');
    const d = (JSON.parse(fs.readFileSync(file, 'utf8')) as { style?: { direction?: unknown } }).style?.direction;
    return typeof d === 'string' && DIRECTIONS.includes(d) ? d : null;
  } catch {
    return null;
  }
}

export function postKindsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  app.get('/', async (c) => {
    await syncBrand(deps);
    const direction = directionInForce();
    const kinds = tokens.POST_KINDS.map((kind) => {
      const used = new Set(tokens.DIRECTIONS.flatMap((d) => directions.compositionsFor(d, kind).flatMap((comp) => comp.fields)));
      return {
        kind,
        fields: FIELD_ORDER.filter((f) => used.has(f)),
        required: postSpec.POST_REQUIRED[kind] ?? [],
        variants: direction ? directions.compositionsFor(direction, kind).map((comp, variant) => ({ variant, name: comp.name, describe: comp.describe })) : [],
      };
    });
    const limits = { ...Object.fromEntries(LIMITED.map((f) => [f, postSpec.POST_FIELDS[f]!.max])), items: { ...postSpec.POST_ITEMS } };
    return c.json({ direction, kinds, limits });
  });

  return app;
}
