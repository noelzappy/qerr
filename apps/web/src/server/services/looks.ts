// A brand's looks (Settings, Looks): whole ways of composing a post, stored as data and checked by the engine's own look module
// (packages/engine/lib/design/look.mjs: validateLook, lookBrief, lookHash...) before anything is stored, again when the brand pack
// is written, and once more when a page is drawn. People and the AI never write markup, CSS or code here.
//
// Two sources of looks, one reference format everywhere:
//   shipped:<id>   the engine's own looks: engine data, global, read only, never rows (shippedLooks below)
//   own:<slug>     a BrandLook of the caller's brand (tables brand_looks and brand_look_compositions)
// A brand always starts from a copy (duplicateLook); there is no blank look. The ACTIVE look is a pointer on the brand's profile
// (BrandProfile.activeLookRef), not a flag on a row; null means classic layouts.
//
// TENANCY. Every exported function of the service takes a scope first, `{ brandId }`, and every query filters on it. The scope
// comes from brandScope(c), the one place that decides it (today a constant); no route reads a brandId from a request. A row is
// found by (brandId, slug) or by uuid AND brandId, so another brand's rows are invisible even to someone who knows a uuid.
//
// DRAFTS. A composition's `definition` is what is drawn; `draft` holds unpublished edits and never affects drawing. A draft is
// stored only if the WHOLE look validates with it swapped in, and moves into `definition` by publishComposition once the gate
// (injectable: runGate; validation only today, render checks later) passes.
//
// WHAT IS NOT HERE YET: drawing. The interpreter that draws a look does not exist yet, so previews and the render gate answer
// "not available" (lookRenderer returns null).
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Prisma, type BrandLook, type BrandLookComposition } from '@prisma/client';
import type { Context } from 'hono';
import { audit, type AuditActor } from '../audit.js';
import type { AppEnv, Deps } from '../deps.js';
import { engineImport } from '../engine/root.js';
import { badRequest, conflict, notFound } from '../http.js';
import { logger } from '../log.js';

export type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---- scope ---------------------------------------------------------------------------------------------------------------

export interface LookScope { brandId: string }
// The id of the one brand today: BrandProfile.id.
export const DEFAULT_BRAND_ID = 'brand';
// THE place that says which brand a request works for. Today a constant; with several customers it reads the session.
// Never from the request's body, query or path.
export function brandScope(_c?: Context<AppEnv>): LookScope {
  return { brandId: DEFAULT_BRAND_ID };
}

// ---- the engine ----------------------------------------------------------------------------------------------------------

export type Kind = 'statement' | 'figure' | 'list' | 'quote' | 'photo' | 'event' | 'offer';
export interface LookBrief {
  id?: string; name?: string;
  kinds: Record<string, { variants: Array<{ index: number; name: string; describe: string; fields: Record<string, unknown>; accepts: unknown[] }> }>;
}
interface EngineLook {
  validateLook(look: unknown, where?: string, opts?: { shipped?: boolean }): string[];
  lookCatalogue(): Json;
  lookBrief(look: unknown): LookBrief;
  lookHash(look: unknown): string;
  canonicalJson(v: unknown): string;
  MAX_LOOKS: number;
  LOOK_SCHEMA: number;
  KINDS: string[];
  LIMITS: { compositions: number; perKind: number; definitionBytes: number; name: number; description: number };
}

let engineLoaded: Promise<EngineLook> | null = null;
export const lookEngine = (): Promise<EngineLook> => (engineLoaded ??= engineImport<EngineLook>('design/look'));

// The engine's catalogue of elements, sections and limits the editor draws its controls from; passed on as it is.
export async function lookCatalogue(): Promise<Json> { return (await lookEngine()).lookCatalogue(); }
export async function lookLimits() {
  const e = await lookEngine();
  return { looks: e.MAX_LOOKS, compositions: e.LIMITS.compositions, perKind: e.LIMITS.perKind, definitionBytes: e.LIMITS.definitionBytes };
}

// ---- references ----------------------------------------------------------------------------------------------------------

export const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
export interface LookRef { source: 'shipped' | 'own'; id: string }
// 'shipped:retail' or 'own:my-look'. Anything else, an id with a ':' included, is not a reference.
export function parseRef(ref: unknown): LookRef | null {
  if (typeof ref !== 'string') return null;
  const m = /^(shipped|own):([^:]*)$/.exec(ref);
  if (!m || !SLUG.test(m[2]!)) return null;
  return { source: m[1] as LookRef['source'], id: m[2]! };
}
export const formatRef = (source: LookRef['source'], id: string): string => {
  if (!SLUG.test(id)) throw new Error('A look id is lowercase letters, digits and - only');
  return `${source}:${id}`;
};

// ---- shipped looks -------------------------------------------------------------------------------------------------------

// THE ONE ADAPTER for the engine's own looks. They will be exported by the engine (`shippedLooks` or `SHIPPED_LOOKS`, a list, a
// map or a function returning either, from directions/index.mjs or look.mjs, frozen data authored in packages/engine/lib/design/
// looks/*.mjs). Until the engine has them, the two sample looks in packages/engine/testlib/looks stand in. Nothing else in the
// web app knows where shipped looks come from. Every look it returns passes validateLook(..., { shipped: true }).
async function loadShippedLooks(engine: EngineLook): Promise<Json[]> {
  let found: unknown[] | null = null;
  for (const mod of ['design/directions/index', 'design/look']) {
    let m: Record<string, unknown>;
    try { m = await engineImport<Record<string, unknown>>(mod); } catch { continue; }
    let v: unknown = m.shippedLooks ?? m.SHIPPED_LOOKS;
    if (typeof v === 'function') v = await (v as () => unknown)();
    const list = Array.isArray(v) ? v : isObj(v) ? Object.values(v) : null;
    if (list?.length) { found = list; break; }
  }
  if (!found) {
    // Fallback: the sample looks (read from the engine package, not copied anywhere).
    const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'testlib', 'looks');
    found = fs.readdirSync(dir).filter((f) => f.endsWith('.sample.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as unknown);
  }
  const out: Json[] = [], seen = new Set<string>();
  for (const l of found) {
    const problems = engine.validateLook(l, 'look', { shipped: true });
    if (problems.length || !isObj(l) || typeof l.id !== 'string' || seen.has(l.id)) { logOnce(`shipped:${isObj(l) ? String(l.id) : '?'}`, 'look.shipped_invalid', { problems: problems.slice(0, 3) }); continue; }
    seen.add(l.id);
    out.push(deepFreeze(clone(l)));
  }
  return out;
}
function deepFreeze<T>(o: T): T { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); } return o; }

let shippedCache: Promise<Json[]> | null = null;
// The engine's own looks, read only (frozen), in the order the engine lists them.
export async function shippedLooks(): Promise<readonly Json[]> {
  return (shippedCache ??= lookEngine().then(loadShippedLooks));
}

const logged = new Set<string>();
// One log line per (key, event), so a look the engine refuses does not fill the log on every request.
function logOnce(key: string, event: string, fields: Json): void {
  const k = `${event}|${key}`;
  if (logged.has(k)) return;
  logged.add(k);
  logger.warn(event, fields);
}
export const resetLookLogs = (): void => logged.clear();

// ---- gate ----------------------------------------------------------------------------------------------------------------

export interface GateCheck { name: string; passed: boolean; message?: string }
// What a gate run leaves on a composition (and, summed up, on a look): the engine it ran under, the hash of exactly what it
// checked, when, whether it passed, and each check.
export interface GateRecord { engineVersion: string; definitionHash: string; at: string; passed: boolean; checks: GateCheck[] }
export interface GateInput { scope: LookScope; look: Json; kind: string; composition: Json; definitionHash: string }
// THE HOOK for the checks a composition must pass before it replaces what is drawn. Today: validation only. The render checks
// (fit, contrast, emptiness, scale, levels, grid over sample, stress and minimal copy) join here when the interpreter exists.
export type RunGate = (input: GateInput) => Promise<GateRecord>;

let engineVersionCache: string | null = null;
function engineVersion(): string {
  if (engineVersionCache) return engineVersionCache;
  try { engineVersionCache = String((JSON.parse(fs.readFileSync(createRequire(import.meta.url).resolve('@vesk/engine/package.json'), 'utf8')) as Json).version ?? 'unknown'); } catch { engineVersionCache = 'unknown'; }
  return engineVersionCache;
}
export const validationGate = (engine: Pick<EngineLook, 'validateLook'>): RunGate => async ({ look, definitionHash }) => {
  const problems = engine.validateLook(look, 'look');
  return { engineVersion: engineVersion(), definitionHash, at: new Date().toISOString(), passed: problems.length === 0, checks: [{ name: 'validate', passed: problems.length === 0, ...(problems.length ? { message: problems[0] } : {}) }] };
};

// ---- the renderer that does not exist yet --------------------------------------------------------------------------------

export interface LookRenderer { preview(...args: unknown[]): Promise<unknown>; gate(...args: unknown[]): Promise<unknown> }
// Drawing a look (a preview, the render gate) needs the interpreter (a later step). Until then this is null and the routes answer
// 501. When it exists, this is the one function that returns it.
export function lookRenderer(): LookRenderer | null { return null; }
export const PREVIEW_UNAVAILABLE = 'Previews of looks are not available yet';

// ---- problems ------------------------------------------------------------------------------------------------------------

// The engine's sentences are `look "<id>": <path> <message>`; the details a route returns carry the path apart.
export function problemDetails(problems: string[]): Array<{ path: string; message: string }> {
  return problems.slice(0, 30).map((message) => {
    const m = /^[^:]*: ([A-Za-z0-9_.[\]]+) /.exec(message);
    return { path: m ? m[1]! : 'definition', message };
  });
}
const refuse = (what: string, problems: string[]) => badRequest(what, problemDetails(problems));

// ---- the service ---------------------------------------------------------------------------------------------------------

export interface LookOptions { runGate?: RunGate; shipped?: () => Promise<readonly Json[]> }
type Actor = AuditActor & { id: string };
type Row = BrandLook & { compositions: BrandLookComposition[] };
export interface OwnSummary {
  ref: string; source: 'own'; id: string; slug: string; name: string; description: string; origin: string; engineSchema: number; status: string;
  gate: { passed: boolean; at: unknown; stale: boolean } | null; position: number; kinds: Record<string, number>; compositionCount: number;
  needsAttention: boolean; problems?: string[]; createdAt: Date; updatedAt: Date;
}
export interface OwnComposition { id: string; kind: string; position: number; name: string; definition: unknown; draft: unknown; hasDraft: boolean; enabled: boolean; gate: unknown; updatedAt: Date }
export interface OwnDetail { definition: unknown; gateRecord: unknown; compositions: OwnComposition[] }

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34).replace(/-+$/g, '');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function createLooks(deps: Pick<Deps, 'prisma'>, options: LookOptions = {}) {
  const prisma = deps.prisma;
  const shipped = options.shipped ?? shippedLooks;

  const shippedById = async (id: string) => (await shipped()).find((l) => l.id === id) ?? null;

  // The rows of one own look of this brand, by slug; null when this brand has none (another brand's slug is invisible).
  const findRow = (scope: LookScope, slug: string): Promise<Row | null> =>
    prisma.brandLook.findFirst({ where: { brandId: scope.brandId, slug }, include: { compositions: true } });
  const needRow = async (scope: LookScope, slug: string): Promise<Row> => {
    const r = SLUG.test(slug) ? await findRow(scope, slug) : null;
    if (!r) throw notFound('Look not found');
    return r;
  };
  const needComp = (row: Row, compId: string): BrandLookComposition => {
    const c = row.compositions.find((x) => x.id === compId);
    if (!c) throw notFound('Composition not found');
    return c;
  };

  const activeRefOf = async (scope: LookScope): Promise<string | null> =>
    (await prisma.brandProfile.findUnique({ where: { id: scope.brandId }, select: { activeLookRef: true } }))?.activeLookRef ?? null;
  // Changes that alter what a brand draws are refused while the look is the active one: switch to another look (or to classic
  // layouts) first, or edit a copy. Drafts never alter drawing, so they stay open.
  const notActive = async (scope: LookScope, row: Row) => {
    if ((await activeRefOf(scope)) === formatRef('own', row.slug)) throw conflict('This look is the active one, so it cannot be changed. Edit a copy, or switch to another look first');
  };

  const sorted = async (comps: BrandLookComposition[]) => {
    const kinds = (await lookEngine()).KINDS;
    return [...comps].sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.position - b.position);
  };
  // The look as the engine reads it: the stored settings and the compositions' published definitions (enabled ones only for what
  // is drawn). `swap` puts a draft (or a new composition) in for one composition, to check it as it would be.
  const assemble = async (row: Pick<BrandLook, 'definition'> & { compositions: BrandLookComposition[] }, opts: { all?: boolean; swap?: { id: string; definition: unknown } } = {}): Promise<Json> => {
    const base = isObj(row.definition) ? clone(row.definition) : {};
    const comps = (await sorted(row.compositions)).filter((c) => opts.all || c.enabled);
    return { ...base, compositions: comps.map((c) => (opts.swap && opts.swap.id === c.id ? opts.swap.definition : c.definition)) } as Json;
  };
  const problemsOf = async (look: Json) => (await lookEngine()).validateLook(look, 'look');
  const checked = async (look: Json, what = 'The look is not valid') => {
    const problems = await problemsOf(look);
    if (problems.length) throw refuse(what, problems);
  };
  // Changes that touch what is drawn make a look a draft again and its gate stale.
  const stale = { status: 'draft', gate: Prisma.DbNull, } as const;

  const compositionView = (c: BrandLookComposition) => ({
    id: c.id, kind: c.kind, position: c.position, name: c.name, definition: c.definition, draft: c.draft, hasDraft: c.draft !== null, enabled: c.enabled,
    gate: c.gate, updatedAt: c.updatedAt,
  });
  const gateSummary = async (row: Row, drawn: Json | null) => {
    const g = isObj(row.gate) ? row.gate : null;
    if (!g) return null;
    const hash = drawn ? (await lookEngine()).lookHash(drawn) : null;
    return { passed: g.passed === true, at: g.at ?? null, stale: hash !== null && g.definitionHash !== hash };
  };
  // An own look as the panel reads it: the summary (the list), or in full with its drafts and gate records.
  async function ownView(row: Row, full: true): Promise<OwnSummary & OwnDetail>;
  async function ownView(row: Row, full: false): Promise<OwnSummary>;
  async function ownView(row: Row, full: boolean): Promise<OwnSummary | (OwnSummary & OwnDetail)> {
    const eng = await lookEngine();
    const all = await assemble(row, { all: true });
    const problems = row.engineSchema !== eng.LOOK_SCHEMA ? [`look "${row.slug}": written for look schema ${row.engineSchema}; this engine reads schema ${eng.LOOK_SCHEMA}`] : eng.validateLook(all, 'look');
    const drawn = await assemble(row);
    const kinds = Object.fromEntries(Object.entries(eng.lookBrief(drawn).kinds).map(([k, v]) => [k, v.variants.length]));
    const base: OwnSummary = {
      ref: formatRef('own', row.slug), source: 'own', id: row.id, slug: row.slug, name: row.name,
      description: isObj(row.definition) && typeof row.definition.description === 'string' ? row.definition.description : '',
      origin: row.origin, engineSchema: row.engineSchema, status: row.status, gate: await gateSummary(row, problems.length ? null : drawn),
      position: row.position, kinds, compositionCount: row.compositions.length,
      needsAttention: problems.length > 0, ...(problems.length ? { problems: problems.slice(0, 5) } : {}), createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
    if (!full) return base;
    return { ...base, definition: row.definition, gateRecord: row.gate, compositions: (await sorted(row.compositions)).map(compositionView) };
  }
  const shippedView = (l: Json, eng: EngineLook) => ({
    ref: formatRef('shipped', String(l.id)), source: 'shipped' as const, id: String(l.id), name: String(l.name), description: typeof l.description === 'string' ? l.description : '', readOnly: true as const,
    kinds: Object.fromEntries(Object.entries(eng.lookBrief(l).kinds).map(([k, v]) => [k, v.variants.length])),
  });

  // ---- reading ----

  // The full look a ref names (settings and enabled compositions, in order) as the engine reads it, or null: unknown, another
  // brand's, or one this engine refuses (then it is left out and logged once, like a layout that no longer validates).
  async function resolveLook(scope: LookScope, ref: string): Promise<{ ref: string; source: 'shipped' | 'own'; look: Json } | null> {
    const p = parseRef(ref);
    if (!p) return null;
    if (p.source === 'shipped') { const l = await shippedById(p.id); return l ? { ref, source: 'shipped', look: l } : null; }
    const row = await findRow(scope, p.id);
    if (!row) return null;
    const eng = await lookEngine();
    const look = await assemble(row);
    const problems = row.engineSchema !== eng.LOOK_SCHEMA ? [`written for look schema ${row.engineSchema}; this engine reads schema ${eng.LOOK_SCHEMA}`] : eng.validateLook(look, 'look');
    if (problems.length) { logOnce(`${scope.brandId}:${row.slug}:${row.updatedAt.toISOString()}`, 'look.skipped', { slug: row.slug, problems: problems.slice(0, 5) }); return null; }
    return { ref, source: 'own', look };
  }

  async function activeLook(scope: LookScope) {
    const ref = await activeRefOf(scope);
    return ref ? resolveLook(scope, ref) : null;
  }

  async function listLooks(scope: LookScope) {
    const eng = await lookEngine();
    const rows = await prisma.brandLook.findMany({ where: { brandId: scope.brandId }, include: { compositions: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take: 100 });
    return {
      activeRef: await activeRefOf(scope),
      shipped: (await shipped()).map((l) => shippedView(l, eng)),
      own: await Promise.all(rows.map((r) => ownView(r, false))),
    };
  }

  // One look in full. An own look comes with its drafts and gate records; a shipped look with its compositions as they are.
  async function getLook(scope: LookScope, ref: string) {
    const p = parseRef(ref);
    if (!p) throw badRequest('That is not a look reference (shipped:<id> or own:<slug>)');
    const eng = await lookEngine();
    if (p.source === 'shipped') {
      const l = await shippedById(p.id);
      if (!l) throw notFound('Look not found');
      return { ...shippedView(l, eng), definition: l, brief: eng.lookBrief(l) };
    }
    return ownView(await needRow(scope, p.id), true);
  }

  // The kinds, variants, fields and budgets of the active look, for the post editor and the AI; null when no look is active.
  async function lookBriefs(scope: LookScope): Promise<({ ref: string } & LookBrief) | null> {
    const a = await activeLook(scope);
    return a ? { ref: a.ref, ...(await lookEngine()).lookBrief(a.look) } : null;
  }

  // What goes into the brand pack's brand.json "looks": the active look, whole, or null (see packWithLook).
  async function lookForPack(scope: LookScope): Promise<Json | null> {
    return (await activeLook(scope))?.look ?? null;
  }

  // ---- looks ----

  async function freeSlug(scope: LookScope, wanted: string): Promise<string> {
    const base = slugify(wanted) || 'look';
    const taken = new Set((await prisma.brandLook.findMany({ where: { brandId: scope.brandId, slug: { startsWith: base } }, select: { slug: true } })).map((r) => r.slug));
    for (const l of await shipped()) taken.add(String(l.id));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
    return `${base}-${randomUUID().slice(0, 4)}`;
  }

  // A deep copy of a shipped look or of one of this brand's own looks, as a draft of this brand's own, with new ids. Looks are
  // never started blank.
  async function duplicateLook(scope: LookScope, actor: Actor, sourceRef: string, opts: { name?: string; slug?: string } = {}) {
    const eng = await lookEngine();
    const p = parseRef(sourceRef);
    if (!p) throw badRequest('That is not a look reference (shipped:<id> or own:<slug>)');
    let settings: Json, comps: Array<{ kind: string; name: string; definition: Json; enabled: boolean }>;
    if (p.source === 'shipped') {
      const l = await shippedById(p.id);
      if (!l) throw notFound('Look not found');
      const { compositions, ...rest } = clone(l) as Json & { compositions: Json[] };
      settings = rest;
      comps = compositions.map((c) => ({ kind: String(c.kind), name: String(c.name), definition: c, enabled: true }));
    } else {
      const src = await needRow(scope, p.id);
      settings = clone(isObj(src.definition) ? src.definition : {});
      comps = (await sorted(src.compositions)).map((c) => ({ kind: c.kind, name: c.name, definition: clone(c.definition as Json), enabled: c.enabled }));
    }
    if (await prisma.brandLook.count({ where: { brandId: scope.brandId } }) >= eng.MAX_LOOKS) throw conflict(`Keep at most ${eng.MAX_LOOKS} looks; remove one first`);
    if (comps.length > eng.LIMITS.compositions) throw conflict(`A look has at most ${eng.LIMITS.compositions} compositions`);
    const name = (opts.name ?? `${String(settings.name).slice(0, eng.LIMITS.name - 7)} (copy)`).trim();
    if (!name || name.length > eng.LIMITS.name) throw badRequest(`A look's name is 1 to ${eng.LIMITS.name} characters`);
    let slug: string;
    if (opts.slug !== undefined) {
      if (!SLUG.test(opts.slug)) throw badRequest('A look id is lowercase letters, digits and - only (up to 40, starting with a letter or digit)');
      if ((await shippedById(opts.slug)) || await findRow(scope, opts.slug)) throw conflict(`A look with the id "${opts.slug}" exists already; choose another id`);
      slug = opts.slug;
    } else slug = await freeSlug(scope, name);
    const definition: Json = { ...settings, id: slug, name, origin: `copy:${sourceRef}`, schema: eng.LOOK_SCHEMA };
    const full = { ...definition, compositions: comps.map((c) => c.definition) };
    if (JSON.stringify(full).length > eng.LIMITS.definitionBytes) throw badRequest(`The look is larger than ${eng.LIMITS.definitionBytes / 1024} KB`);
    await checked(full, 'The copy is not valid');
    const position = (await prisma.brandLook.aggregate({ where: { brandId: scope.brandId }, _max: { position: true } }))._max.position ?? -1;
    const next: Record<string, number> = {};
    try {
      const row = await prisma.brandLook.create({
        data: {
          brandId: scope.brandId, slug, name, definition: definition as Prisma.InputJsonValue, origin: sourceRef, engineSchema: eng.LOOK_SCHEMA, status: 'draft',
          position: position + 1, createdById: actor.id, updatedById: actor.id,
          compositions: { create: comps.map((c) => ({ brandId: scope.brandId, kind: c.kind, position: (next[c.kind] = (next[c.kind] ?? -1) + 1), name: c.name, definition: c.definition as Prisma.InputJsonValue, enabled: c.enabled })) },
        },
        include: { compositions: true },
      });
      await audit(deps, actor, 'look.duplicate', 'look', row.id, { look: slug, origin: sourceRef });
      return ownView(row, true);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflict(`A look with the id "${slug}" exists already; choose another id`);
      throw e;
    }
  }

  // The look's own settings (everything but its compositions), checked together with the compositions it has. The id, origin
  // and schema are the stored ones and cannot be changed here.
  async function updateLookSettings(scope: LookScope, actor: Actor, slug: string, settings: Json) {
    const eng = await lookEngine();
    const row = await needRow(scope, slug);
    await notActive(scope, row);
    if (!isObj(settings)) throw badRequest('The settings must be an object');
    if ('compositions' in settings) throw badRequest('Compositions are changed one at a time, not with the settings');
    const stored = isObj(row.definition) ? row.definition : {};
    const definition: Json = { ...settings, id: slug, origin: stored.origin, schema: stored.schema };
    const full = { ...definition, compositions: (await assemble(row, { all: true })).compositions };
    if (JSON.stringify(full).length > eng.LIMITS.definitionBytes) throw badRequest(`The look is larger than ${eng.LIMITS.definitionBytes / 1024} KB`);
    await checked(full);
    const updated = await prisma.brandLook.update({
      where: { id: row.id }, include: { compositions: true },
      data: { name: String(definition.name), definition: definition as Prisma.InputJsonValue, engineSchema: eng.LOOK_SCHEMA, updatedById: actor.id, ...stale },
    });
    await audit(deps, actor, 'look.update', 'look', row.id, { look: slug });
    return ownView(updated, true);
  }

  async function deleteLook(scope: LookScope, actor: Actor, slug: string) {
    const row = await needRow(scope, slug);
    await notActive(scope, row);
    await prisma.brandLook.delete({ where: { id: row.id } });
    await audit(deps, actor, 'look.delete', 'look', row.id, { look: slug });
  }

  // ---- compositions ----

  // Stores unpublished edits of one composition. They must make the whole look valid; they never change what is drawn.
  async function saveCompositionDraft(scope: LookScope, actor: Actor, slug: string, compId: string, draft: unknown) {
    const row = await needRow(scope, slug);
    const comp = needComp(row, compId);
    if (!isObj(draft)) throw badRequest('A draft must be an object');
    if (draft.kind !== comp.kind) throw badRequest(`A composition keeps its kind (${comp.kind}); add another composition for another kind`);
    await checked(await assemble(row, { all: true, swap: { id: comp.id, definition: draft } }), 'The draft is not valid');
    await prisma.brandLookComposition.update({ where: { id: comp.id }, data: { draft: clone(draft) as Prisma.InputJsonValue } });
    await audit(deps, actor, 'look.composition.draft', 'look', row.id, { look: slug, composition: comp.id });
    return ownView((await findRow(scope, slug))!, true);
  }

  async function discardCompositionDraft(scope: LookScope, actor: Actor, slug: string, compId: string) {
    const row = await needRow(scope, slug);
    const comp = needComp(row, compId);
    if (comp.draft === null) throw conflict('There is no draft to discard');
    await prisma.brandLookComposition.update({ where: { id: comp.id }, data: { draft: Prisma.DbNull } });
    await audit(deps, actor, 'look.composition.discard', 'look', row.id, { look: slug, composition: comp.id });
    return ownView((await findRow(scope, slug))!, true);
  }

  const compHash = async (definition: unknown) => sha((await lookEngine()).canonicalJson(definition));
  const gateOf = async (scope: LookScope, look: Json, comp: { kind: string; definition: unknown }) =>
    (options.runGate ?? validationGate(await lookEngine()))({ scope, look, kind: comp.kind, composition: comp.definition as Json, definitionHash: await compHash(comp.definition) });

  // Moves the draft into the definition once the whole look is valid with it and the gate passes. A failed gate is recorded on
  // the composition and the draft stays.
  async function publishComposition(scope: LookScope, actor: Actor, slug: string, compId: string) {
    const row = await needRow(scope, slug);
    await notActive(scope, row);
    const comp = needComp(row, compId);
    if (!isObj(comp.draft)) throw conflict('There is no draft to publish');
    const look = await assemble(row, { all: true, swap: { id: comp.id, definition: comp.draft } });
    await checked(look, 'The draft is not valid');
    const gate = await gateOf(scope, look, { kind: comp.kind, definition: comp.draft });
    if (!gate.passed) {
      await prisma.brandLookComposition.update({ where: { id: comp.id }, data: { gate: gate as unknown as Prisma.InputJsonValue } });
      throw badRequest('The checks did not pass, so the draft was not published', gate.checks.filter((c) => !c.passed).map((c) => ({ path: c.name, message: c.message ?? c.name })));
    }
    await prisma.$transaction([
      prisma.brandLookComposition.update({ where: { id: comp.id }, data: { definition: comp.draft as Prisma.InputJsonValue, name: String(comp.draft.name ?? comp.name), draft: Prisma.DbNull, gate: gate as unknown as Prisma.InputJsonValue } }),
      prisma.brandLook.update({ where: { id: row.id }, data: { ...stale, updatedById: actor.id } }),
    ]);
    await audit(deps, actor, 'look.composition.publish', 'look', row.id, { look: slug, composition: comp.id });
    return ownView((await findRow(scope, slug))!, true);
  }

  // Copies one composition (the `index`th of `kind`) of a shipped look or of one of this brand's own looks into this look.
  async function addCompositionFrom(scope: LookScope, actor: Actor, slug: string, from: { sourceRef: string; kind: string; index: number }) {
    const eng = await lookEngine();
    const row = await needRow(scope, slug);
    await notActive(scope, row);
    const p = parseRef(from.sourceRef);
    if (!p) throw badRequest('That is not a look reference (shipped:<id> or own:<slug>)');
    let list: Json[];
    if (p.source === 'shipped') {
      const l = await shippedById(p.id);
      if (!l) throw notFound('Look not found');
      list = (l.compositions as Json[]).filter((c) => c.kind === from.kind);
    } else {
      list = (await sorted((await needRow(scope, p.id)).compositions)).filter((c) => c.kind === from.kind).map((c) => clone(c.definition as Json));
    }
    const src = Number.isInteger(from.index) ? list[from.index] : undefined;
    if (!src) throw notFound(`That look has no ${String(from.kind).slice(0, 20)} composition number ${String(from.index).slice(0, 6)}`);
    const sameKind = row.compositions.filter((c) => c.kind === from.kind);
    if (sameKind.length >= eng.LIMITS.perKind) throw conflict(`A look has at most ${eng.LIMITS.perKind} compositions of one kind; remove one first`);
    if (row.compositions.length >= eng.LIMITS.compositions) throw conflict(`A look has at most ${eng.LIMITS.compositions} compositions; remove one first`);
    const definition = clone(src);
    await checked({ ...(await assemble(row, { all: true })), compositions: [...((await assemble(row, { all: true })).compositions as Json[]), definition] }, 'The composition does not fit this look');
    const position = Math.max(-1, ...sameKind.map((c) => c.position)) + 1;
    const created = await prisma.brandLookComposition.create({ data: { lookId: row.id, brandId: scope.brandId, kind: from.kind, position, name: String(definition.name), definition: definition as Prisma.InputJsonValue } });
    await prisma.brandLook.update({ where: { id: row.id }, data: { ...stale, updatedById: actor.id } });
    await audit(deps, actor, 'look.composition.add', 'look', row.id, { look: slug, composition: created.id, from: from.sourceRef, kind: from.kind, index: from.index });
    return ownView((await findRow(scope, slug))!, true);
  }

  async function setCompositionEnabled(scope: LookScope, actor: Actor, slug: string, compId: string, enabled: boolean) {
    const row = await needRow(scope, slug);
    await notActive(scope, row);
    const comp = needComp(row, compId);
    if (comp.enabled !== enabled) {
      if (!enabled && row.compositions.filter((c) => c.enabled && c.id !== comp.id).length === 0) throw conflict('A look keeps at least one composition switched on');
      await prisma.$transaction([
        prisma.brandLookComposition.update({ where: { id: comp.id }, data: { enabled } }),
        prisma.brandLook.update({ where: { id: row.id }, data: { ...stale, updatedById: actor.id } }),
      ]);
      await audit(deps, actor, 'look.composition.enable', 'look', row.id, { look: slug, composition: comp.id, enabled });
    }
    return ownView((await findRow(scope, slug))!, true);
  }

  // Puts the compositions of one kind in the given order (every id of that kind exactly once); positions become 0, 1, 2...
  async function reorderCompositions(scope: LookScope, actor: Actor, slug: string, kind: string, ids: string[]) {
    const row = await needRow(scope, slug);
    await notActive(scope, row);
    const ofKind = row.compositions.filter((c) => c.kind === kind);
    if (ids.length !== ofKind.length || new Set(ids).size !== ids.length || !ids.every((id) => ofKind.some((c) => c.id === id))) throw badRequest(`List every ${String(kind).slice(0, 20)} composition of this look exactly once`);
    // Two passes, because (look, kind, position) is unique: out of the way first, then into place.
    await prisma.$transaction([
      ...ids.map((id, i) => prisma.brandLookComposition.update({ where: { id }, data: { position: -(i + 1) } })),
      ...ids.map((id, i) => prisma.brandLookComposition.update({ where: { id }, data: { position: i } })),
      prisma.brandLook.update({ where: { id: row.id }, data: { ...stale, updatedById: actor.id } }),
    ]);
    await audit(deps, actor, 'look.composition.reorder', 'look', row.id, { look: slug, kind });
    return ownView((await findRow(scope, slug))!, true);
  }

  // Moves one composition to a place (0 = first) among those of its kind.
  async function moveComposition(scope: LookScope, actor: Actor, slug: string, compId: string, position: number) {
    const row = await needRow(scope, slug);
    const comp = needComp(row, compId);
    const ids = (await sorted(row.compositions)).filter((c) => c.kind === comp.kind).map((c) => c.id).filter((id) => id !== comp.id);
    ids.splice(Math.min(Math.max(position, 0), ids.length), 0, comp.id);
    return reorderCompositions(scope, actor, slug, comp.kind, ids);
  }

  // Removes a composition, never the last one of its kind (switch it off, or add another first).
  async function removeComposition(scope: LookScope, actor: Actor, slug: string, compId: string) {
    const row = await needRow(scope, slug);
    await notActive(scope, row);
    const comp = needComp(row, compId);
    if (row.compositions.filter((c) => c.kind === comp.kind).length <= 1) throw conflict(`This is the only ${comp.kind} composition; switch it off, or add another first`);
    if (comp.enabled && row.compositions.filter((c) => c.enabled && c.id !== comp.id).length === 0) throw conflict('A look keeps at least one composition switched on');
    await prisma.$transaction([
      prisma.brandLookComposition.delete({ where: { id: comp.id } }),
      prisma.brandLook.update({ where: { id: row.id }, data: { ...stale, updatedById: actor.id } }),
    ]);
    await audit(deps, actor, 'look.composition.remove', 'look', row.id, { look: slug, composition: comp.id });
    return ownView((await findRow(scope, slug))!, true);
  }

  // ---- publishing and activating ----

  // Marks the look ready: the whole look validates as it is drawn, no enabled composition has an invalid pending draft, and every
  // enabled composition has a passing gate record for exactly its current definition (one is made now for any that lacks it).
  async function publishLook(scope: LookScope, actor: Actor, slug: string) {
    const eng = await lookEngine();
    const row = await needRow(scope, slug);
    const drawn = await assemble(row);
    const enabled = await sorted(row.compositions.filter((c) => c.enabled));
    if (!enabled.length) throw badRequest('The look has no composition switched on');
    await checked(drawn, 'The look is not valid, so it was not published');
    for (const c of row.compositions.filter((x) => x.enabled && isObj(x.draft))) {
      const p = await problemsOf(await assemble(row, { all: true, swap: { id: c.id, definition: c.draft } }));
      if (p.length) throw refuse(`The pending draft of "${c.name}" is not valid; publish a valid one or discard it`, p);
    }
    const checks: GateCheck[] = [];
    for (const c of enabled) {
      const hash = await compHash(c.definition);
      let g = isObj(c.gate) ? (c.gate as unknown as GateRecord) : null;
      if (!(g && g.passed === true && g.definitionHash === hash)) {
        g = await gateOf(scope, drawn, { kind: c.kind, definition: c.definition });
        await prisma.brandLookComposition.update({ where: { id: c.id }, data: { gate: g as unknown as Prisma.InputJsonValue } });
      }
      checks.push({ name: `${c.kind}/${c.name}`, passed: g.passed, ...(g.passed ? {} : { message: g.checks.find((k) => !k.passed)?.message }) });
    }
    if (checks.some((c) => !c.passed)) throw badRequest('The checks did not pass, so the look was not published', checks.filter((c) => !c.passed).map((c) => ({ path: c.name, message: c.message ?? 'did not pass' })));
    const record: GateRecord = { engineVersion: engineVersion(), definitionHash: eng.lookHash(drawn), at: new Date().toISOString(), passed: true, checks };
    await prisma.brandLook.update({ where: { id: row.id }, data: { status: 'ready', gate: record as unknown as Prisma.InputJsonValue, engineSchema: eng.LOOK_SCHEMA, updatedById: actor.id } });
    await audit(deps, actor, 'look.publish', 'look', row.id, { look: slug });
    return ownView((await findRow(scope, slug))!, true);
  }

  // Makes a look the brand's active one (ref), or sends the brand back to classic layouts (null). Only a shipped look or one of the
  // brand's own looks that is ready. The brand pack follows on the next syncBrand (the caller runs it).
  async function setActiveLook(scope: LookScope, actor: Actor, ref: string | null) {
    const profile = await prisma.brandProfile.findUnique({ where: { id: scope.brandId }, select: { activeLookRef: true } });
    if (!profile) throw conflict('Save the brand in Settings, Brand first');
    if (ref !== null) {
      const p = parseRef(ref);
      if (!p) throw badRequest('That is not a look reference (shipped:<id> or own:<slug>)');
      if (p.source === 'own') {
        const row = await needRow(scope, p.id);
        if (row.status !== 'ready') throw conflict('Publish the look before it is used');
      }
      if (!(await resolveLook(scope, ref))) throw p.source === 'shipped' ? notFound('Look not found') : conflict('This engine cannot read this look; open it and fix what is listed first');
    }
    await prisma.brandProfile.update({ where: { id: scope.brandId }, data: { activeLookRef: ref, updatedById: actor.id } });
    await audit(deps, actor, 'look.activate', 'look', null, { ref, was: profile.activeLookRef });
    return { activeRef: ref };
  }

  return {
    resolveLook, activeLook, listLooks, getLook, lookBriefs, lookForPack,
    duplicateLook, updateLookSettings, deleteLook,
    saveCompositionDraft, discardCompositionDraft, publishComposition, addCompositionFrom,
    setCompositionEnabled, reorderCompositions, moveComposition, removeComposition,
    publishLook, setActiveLook,
    // for the validate route
    problems: (look: unknown) => lookEngine().then((e) => e.validateLook(look, 'look')),
  };
}
export type Looks = ReturnType<typeof createLooks>;

// The service as the app uses it (default gate, the engine's shipped looks), one per Deps.
const services = new WeakMap<object, Looks>();
export const looksFor = (deps: Pick<Deps, 'prisma'>): Looks => {
  let s = services.get(deps);
  if (!s) services.set(deps, (s = createLooks(deps)));
  return s;
};

// ---- the brand pack ------------------------------------------------------------------------------------------------------

// Whether an engine reads brand.json "looks": it does when a brand with a deliberately empty look is refused for the look itself.
// An engine that does not know looks yet either says nothing about them or calls the key unknown.
export function engineReadsLooks(brand: Json, validate: (b: Json) => string[]): boolean {
  return validate({ ...brand, looks: [{}] }).some((p) => /look/i.test(p) && !/unknown entries/i.test(p));
}

// The brand a pack would be written from, with the active look in it: `looks: [<the look>]` and style.direction naming it. Only
// when the engine reads looks; otherwise the brand is returned as it is (and logged once), so an engine without looks never
// fails to write a brand because a look is active.
export function packWithLook(brand: Json, look: Json | null, validate: (b: Json) => string[]): Json {
  if (!look) return brand;
  if (!engineReadsLooks(brand, validate)) { logOnce('engine', 'look.engine_unsupported', { look: String(look.id) }); return brand; }
  return { ...brand, looks: [look], style: { ...(isObj(brand.style) ? brand.style : {}), direction: look.id } };
}
