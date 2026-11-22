// What a `post` design can say, for the post editor and Settings: the kinds of post, the fields each takes, what it needs and the
// layouts (variants) of the brand's design direction. Mounted at /api/posts/post-kinds.
//
//   GET /  -> { direction, kinds: [{ kind, fields, required, variants: [{ variant, name, describe }] }], limits }
//
// `direction` is style.direction of the brand in force (an engine direction or the id of the brand's active look; null when it has none); `variants` are its layouts for each kind (none
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
interface EngineDirections {
  compositionsFor(direction: string, kind: string): Composition[];
  lookOfBrand(brand: unknown): Record<string, unknown> | null;
  postKinds(brand: unknown): Record<string, { variants: Array<{ variant: number; name: string; describe: string }> }>;
}

const core = await engineImport<EngineCore>('core');
const tokens = await engineImport<EngineTokens>('design/tokens');
const postSpec = await engineImport<EnginePostSpec>('design/post-spec');
const directions = await engineImport<EngineDirections>('design/directions/index');

// The order fields are listed in.
const FIELD_ORDER = ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'image', 'meta', 'tag'];
const LIMITED = ['label', 'headline', 'sub', 'big', 'unit', 'quote', 'by', 'meta', 'tag'];

// The brand.json in force (the pack syncBrand wrote), as written, or null.
function brandInForce(): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(core.ROOT, brandState().dir, 'brand.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}
// style.direction of the brand in force: an engine direction, or the id of a look written as data (the brand's active look); else null.
function directionOf(brand: Record<string, unknown> | null): string | null {
  const d = (brand?.style as { direction?: unknown } | undefined)?.direction;
  return typeof d === 'string' && (DIRECTIONS.includes(d) || directions.lookOfBrand(brand)) ? d : null;
}

export function postKindsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use('*', requireUser(deps), requireRole('admin', 'editor'));

  app.get('/', async (c) => {
    await syncBrand(deps);
    const brand = brandInForce();
    const direction = directionOf(brand);
    // a look written as data answers from its own brief (postKinds); an engine direction from its compositions
    const own = direction && directions.lookOfBrand(brand) ? directions.postKinds(brand) : null;
    const kinds = tokens.POST_KINDS.map((kind) => {
      const used = new Set(tokens.DIRECTIONS.flatMap((d) => directions.compositionsFor(d, kind).flatMap((comp) => comp.fields)));
      return {
        kind,
        fields: FIELD_ORDER.filter((f) => used.has(f)),
        required: postSpec.POST_REQUIRED[kind] ?? [],
        variants: own ? (own[kind]?.variants ?? []).map((v) => ({ variant: v.variant, name: v.name, describe: v.describe })) : direction ? directions.compositionsFor(direction, kind).map((comp, variant) => ({ variant, name: comp.name, describe: comp.describe })) : [],
      };
    });
    const limits = { ...Object.fromEntries(LIMITED.map((f) => [f, postSpec.POST_FIELDS[f]!.max])), items: { ...postSpec.POST_ITEMS } };
    return c.json({ direction, kinds, limits });
  });

  return app;
}
