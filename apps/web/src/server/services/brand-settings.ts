// The brand people set in Settings, and how the design engine and the AI library get it.
//
// The engine and the AI library read a brand pack folder (BRAND_DIR: brand.json, logos, optional map.json and prompts). The web
// app keeps the brand in the database instead (BrandProfile, DesignReference) and writes it out as a pack folder under
// state/brand/<hash>/ whenever it changes, then points BRAND_DIR at that folder. syncBrand() does this; it runs at start, after
// every change and before every job that renders or calls the AI, so several app processes converge on the same folder.
//
//   no BrandProfile row, no reference briefs   -> the configured pack (BRAND_DIR, default brands/demo) is used as it is
//   no row, reference briefs                   -> a copy of the configured pack with the briefs added
//   a row                                      -> a pack made from the settings (expandBrand) over the demo pack's layout values
//
// People never write markup here: every value is checked by the engine's own validateBrand before it is used, and the engine
// builds its CSS from the checked numbers.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrandProfile, DesignReference } from '@prisma/client';
import { z } from 'zod';
import { readBrandInfo, setBrandInfo } from '../brand.js';
import type { Deps } from '../deps.js';
import { engineImport } from '../engine/root.js';
import { logger, describeError } from '../log.js';

interface EngineCore { ROOT: string; DEFAULT_BRAND_DIR: string; brandDir(opts?: { root?: string; env?: Record<string, string | undefined> }): string }
interface EngineBrand { validateBrand(b: unknown): string[]; mapProblems(m: unknown): string[]; canonicalGrounds(g: unknown): Record<string, string> }
interface EngineTokens { GROUND_NAMES: string[]; ACCENT_STYLES: string[]; SERIES_KEY: RegExp; groundName(g: unknown): string | null; isDarkColour(hex: string): boolean }

const core = await engineImport<EngineCore>('core');
const engineBrand = await engineImport<EngineBrand>('design/brand');
const tokens = await engineImport<EngineTokens>('design/tokens');

// The pack named in the environment when the process started (or the default), used whenever the database holds no brand.
const CONFIGURED_BRAND_DIR = path.relative(core.ROOT, core.brandDir()).split(path.sep).join('/');
export const STATE_BRAND_DIR = 'state/brand';

// ---- the settings form ---------------------------------------------------------------------------------------------------

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1A2B3C').transform((s) => s.toUpperCase());
const line = (max: number) => z.string().trim().max(max).refine((s) => !/[\r\n]/.test(s), 'Keep this on one line');
const validZone = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };
const validPattern = (p: string) => { try { new RegExp(p, 'i'); return true; } catch { return false; } };

export const CORNERS = ['square', 'soft', 'round'] as const;
export const HEADLINE_WEIGHTS = [300, 400, 500, 600, 700] as const;

export const brandSettingsSchema = z.object({
  name: line(80).pipe(z.string().min(1, 'Give the brand a name')),
  website: line(120).pipe(z.string().min(1, 'Give the website people should visit (it is printed on posts)')),
  tagline: line(160).pipe(z.string().min(1, 'Give a short tagline')),
  descriptor: line(200).default(''),
  timezone: z.string().trim().refine(validZone, 'Choose a time zone such as Europe/London'),
  language: line(60).default('British English'),
  money: z.object({
    local: line(200).pipe(z.string().min(1)),
    foreign: z.string().trim().max(300).refine(validPattern, 'This is not a valid pattern'),
  }).nullable().default(null),
  colours: z.object({ primary: hex, accent: hex, dark: hex, light: hex }).strict(),
  headlineWeight: z.number().int().refine((n) => (HEADLINE_WEIGHTS as readonly number[]).includes(n), 'Choose a weight from 300 to 700'),
  corners: z.enum(CORNERS),
  series: z.array(z.object({
    key: z.string().regex(tokens.SERIES_KEY, 'Use lowercase letters, digits and -'),
    name: line(40).pipe(z.string().min(1)),
    // A ground by its name, or by its older name (white, tint, mint, gold-pale, ink), which is kept as the new name.
    ground: z.string().refine((g) => !!tokens.groundName(g), `Choose one of ${tokens.GROUND_NAMES.join(', ')}`).transform((g) => tokens.groundName(g)!),
    accent: z.string().refine((a) => tokens.ACCENT_STYLES.includes(a), `Choose one of ${tokens.ACCENT_STYLES.join(', ')}`),
  }).strict()).min(1, 'Keep at least one series').max(16)
    .refine((list) => new Set(list.map((s) => s.key)).size === list.length, 'Two series have the same key'),
  spellings: z.array(z.object({ wrong: line(80).pipe(z.string().min(1)), right: line(80).pipe(z.string().min(1)) }).strict()).max(30).default([]),
  voice: z.string().trim().max(4000).default(''),
  visualDirection: z.string().trim().max(4000).default(''),
  // Where the wordmark starts in the full logo, and the gap the engine leaves between the mark and the wordmark on dark pages
  logo: z.object({ wordmarkFrom: z.number().int().min(0).max(20000), markGap: z.number().int().min(0).max(20000) }).strict().default({ wordmarkFrom: 0, markGap: 0 }),
}).strict();

export type BrandSettings = z.infer<typeof brandSettingsSchema>;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// ---- colours -------------------------------------------------------------------------------------------------------------

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
// `w` of a and (1 - w) of b
export const mix = (a: string, b: string, w: number) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v * w + y[i] * (1 - w))); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100; };

const WHITE = '#FFFFFF';
const BLACK = '#000000';

// `c`, moved towards `towards` in small steps until it reaches `min` against every colour in `against` (or as far as it can).
export function fitContrast(c: string, against: string[], min: number, towards: string): string {
  const worst = (x: string) => Math.min(...against.map((a) => contrast(x, a)));
  if (worst(c) >= min) return c;
  for (let i = 1; i <= 100; i++) {
    const x = mix(towards, c, i / 100);
    if (worst(x) >= min) return x;
  }
  return towards;
}
const RADII: Record<(typeof CORNERS)[number], { card: number; device: number; button: number; slab: number }> = {
  square: { card: 2, device: 6, button: 2, slab: 6 },
  soft: { card: 8, device: 12, button: 4, slab: 28 },
  round: { card: 20, device: 24, button: 12, slab: 44 },
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The demo pack's brand.json: the layout values (shadows, window chrome, lint and contrast limits, photo rules) every brand
// starts from. Read fresh each time so a change to the pack is picked up.
export function baseBrand(): Json {
  return JSON.parse(fs.readFileSync(path.join(core.ROOT, core.DEFAULT_BRAND_DIR, 'brand.json'), 'utf8')) as Json;
}

// The full brand.json the settings describe. Logos and font files are filled in by the caller.
export function expandBrand(s: BrandSettings, base: Json = baseBrand()): Json {
  const b = structuredClone(base);
  const { primary, accent, dark, light } = s.colours;
  Object.assign(b, { name: s.name, website: s.website, tagline: s.tagline, timezone: s.timezone, language: s.language });
  if (s.descriptor) b.descriptor = s.descriptor; else delete b.descriptor;
  if (s.money) b.money = s.money; else delete b.money;
  for (const [k, v] of [['voice', s.voice], ['visualDirection', s.visualDirection]] as const) { if (v) b[k] = v; else delete b[k]; }
  delete b.references;
  // Every text colour is fitted to the page colours it is set on, so the design checks pass with the brand's own colours:
  // a colour that already reads is kept exactly; one that does not is moved towards black (on light pages) or white (on dark
  // pages) only as far as it must. paletteChanges() tells people which colours moved.
  const limits = (isObj(base.contrast) ? base.contrast : {}) as Record<string, number>;
  const need = (k: string) => (typeof limits[k] === 'number' ? limits[k] : 4.5) + 0.1;
  const mint = mix(primary, WHITE, 0.12), goldPale = mix(accent, WHITE, 0.14);
  const lights = [WHITE, light, mint, goldPale];
  const ink = fitContrast(dark, lights, need('headline'), BLACK);
  const textPrimary = fitContrast(primary, lights, need('accent'), BLACK);
  const deep = fitContrast(mix(dark, textPrimary, 0.78), [WHITE], need('headline'), BLACK);
  const slabMyth = fitContrast(mix(dark, textPrimary, 0.85), [WHITE], need('headline'), BLACK);
  const darks = [ink, deep, slabMyth];
  const gold = fitContrast(accent, darks, need('accent'), WHITE);
  b.grounds = { light: WHITE, soft: light, cool: mint, warm: goldPale, dark: ink, deep };
  b.text = {
    ink,
    body: fitContrast(mix(ink, WHITE, 0.85), lights, need('sub'), BLACK),
    muted: fitContrast(mix(ink, WHITE, 0.7), lights, need('label'), BLACK),
    mutedInv: fitContrast(mix(WHITE, ink, 0.62), darks, need('label'), WHITE),
    invBody: fitContrast(mix(WHITE, ink, 0.82), darks, need('sub'), WHITE),
    hair: { color: ink, alpha: 0.12 },
  };
  b.accents = { gold, goldDeep: fitContrast(mix(accent, dark, 0.55), lights, need('accent'), BLACK), primary: textPrimary };
  b.gradient = { sage: mix(primary, dark, 0.7), teal: primary, mint: mix(primary, WHITE, 0.5), gold: accent, amber: mix(accent, dark, 0.85) };
  b.surfaces = { panel: light, card: WHITE, line: { color: ink, alpha: 0.08 } };
  const shadows = (isObj(base.shadows) ? base.shadows : {}) as Record<string, Array<Json>>;
  b.shadows = Object.fromEntries(Object.entries(shadows).map(([k, layers]) => [k, layers.map((l) => ({ ...l, color: ink }))]));
  const r = RADII[s.corners];
  b.radius = { card: r.card, device: r.device, button: r.button };
  const font = { ...(base.font as Json) };
  font.headlineWeight = s.headlineWeight;
  font.accentWeight = Math.max(100, s.headlineWeight - 100);
  b.font = font;
  b.poster = { ...(base.poster as Json), headlineWeight: Math.min(900, s.headlineWeight + 200), slabs: { myth: slabMyth, fact: mint }, slabRadius: r.slab };
  b.series = Object.fromEntries(s.series.map((x) => [x.key, { name: x.name, ground: tokens.groundName(x.ground) ?? x.ground, accent: x.accent }]));
  b.spelling = s.spellings.map((x) => ({ wrong: escapeRe(x.wrong), flags: '', right: x.right }));
  b.logos = { ...(base.logos as Json), wordmarkFrom: s.logo.wordmarkFrom, markGap: s.logo.markGap };
  return b;
}

// The settings that describe a brand.json as closely as the form can (used to fill the form before anything is saved).
export function settingsFromBrand(b: Json): BrandSettings {
  const g = (o: unknown, k: string, d = '') => (isObj(o) && typeof o[k] === 'string' ? o[k] as string : d);
  const series = isObj(b.series) ? Object.entries(b.series).map(([key, v]) => ({ key, name: g(v, 'name', key), ground: tokens.groundName(g(v, 'ground', 'light')) ?? 'light', accent: g(v, 'accent', 'muted') })) : [];
  const grounds = engineBrand.canonicalGrounds(b.grounds);
  const weight = isObj(b.font) && typeof b.font.headlineWeight === 'number' ? b.font.headlineWeight : 400;
  const radius = isObj(b.radius) && typeof b.radius.card === 'number' ? b.radius.card : 8;
  return brandSettingsSchema.parse({
    name: b.name, website: b.website, tagline: b.tagline, descriptor: typeof b.descriptor === 'string' ? b.descriptor : '',
    timezone: typeof b.timezone === 'string' && validZone(b.timezone) ? b.timezone : 'UTC',
    language: typeof b.language === 'string' ? b.language : 'British English',
    money: isObj(b.money) ? b.money : null,
    colours: { primary: g(b.accents, 'primary', '#2F5BB7'), accent: g(b.accents, 'gold', '#F0805F'), dark: g(b.text, 'ink', '#14213D'), light: g(grounds, 'soft', '#F5F7FB') },
    headlineWeight: (HEADLINE_WEIGHTS as readonly number[]).reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), 400),
    corners: radius <= 4 ? 'square' : radius >= 16 ? 'round' : 'soft',
    series: series.length ? series : [{ key: 'posts', name: 'Posts', ground: 'light', accent: 'muted' }],
    spellings: [],
    voice: typeof b.voice === 'string' ? b.voice : '',
    visualDirection: typeof b.visualDirection === 'string' ? b.visualDirection : '',
    logo: { wordmarkFrom: isObj(b.logos) && Number.isInteger(b.logos.wordmarkFrom) ? b.logos.wordmarkFrom : 0, markGap: isObj(b.logos) && Number.isInteger(b.logos.markGap) ? b.logos.markGap : 0 },
  });
}

// Deep merge of an Advanced fragment over the generated brand. Lists and plain values replace; logo and font files never do.
const MANAGED = new Set(['logos.full', 'logos.mark', 'logos.fullSize', 'font.files', 'references']);
export function mergeAdvanced(target: Json, extra: Json, at = ''): Json {
  for (const [k, v] of Object.entries(extra)) {
    const where = at ? `${at}.${k}` : k;
    if (MANAGED.has(where) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (isObj(v) && isObj(target[k])) mergeAdvanced(target[k] as Json, v, where);
    else target[k] = structuredClone(v);
  }
  return target;
}

// An Advanced fragment (or an imported pack) may name grounds by their older names (white, tint, mint, gold-pale, ink); they are
// read as the new names so they replace the generated ground rather than sit beside it.
export function canonicalAdvanced(extra: Json): Json {
  if (!isObj(extra.grounds)) return extra;
  const grounds: Json = {};
  for (const [k, v] of Object.entries(extra.grounds)) grounds[tokens.groundName(k) ?? k] = v;
  return { ...extra, grounds };
}

export const advancedSchema = z.object({
  advanced: z.record(z.string(), z.unknown()).refine((o) => JSON.stringify(o).length <= 200_000, 'Keep the Advanced settings under 200 KB'),
  map: z.unknown().nullable(),
}).strict();

// A whole brand.json (a brand pack's) split for the database: the settings the form can show, and the rest kept as the
// Advanced fragment so the pack's exact colours, shadows, type and rules survive. Logo and font file paths are dropped.
const IDENTITY_KEYS = ['name', 'website', 'tagline', 'descriptor', 'timezone', 'language', 'money', 'series', 'voice', 'visualDirection', 'references', 'logos'];
export function splitPackBrand(b: Json): { settings: BrandSettings; advanced: Json } {
  const settings = settingsFromBrand(b);
  const advanced: Json = {};
  for (const [k, v] of Object.entries(b)) if (!IDENTITY_KEYS.includes(k) && !k.startsWith('_')) advanced[k] = structuredClone(v);
  if (isObj(advanced.font)) delete (advanced.font as Json).files;
  return { settings, advanced };
}

// The colour pairs the design checks care about most, with the ratio each needs (from the brand's contrast limits).
export interface ContrastCheck { label: string; ratio: number; needs: number; ok: boolean }

// Every pair of text and page colour the templates draw, with the ratio the design checks need (the brand's contrast
// limits): headlines, sub lines, labels and accent words on each ground, and on the two slabs of a myth-and-fact page.
export function contrastChecks(b: Json): ContrastCheck[] {
  const grounds = engineBrand.canonicalGrounds(b.grounds), text = b.text as Record<string, string>, accents = b.accents as Record<string, string>;
  const inverse = text.inverse ?? (tokens.isDarkColour(grounds.light ?? WHITE) ? WHITE : grounds.light ?? WHITE);
  const limits = b.contrast as Record<string, number>;
  const slabs = (isObj(b.poster) && isObj(b.poster.slabs) ? b.poster.slabs : {}) as Record<string, string>;
  const out: ContrastCheck[] = [];
  const add = (label: string, fg: string, bg: string, needs: number) => {
    if (!bg || !fg) return;
    const ratio = contrast(fg, bg);
    out.push({ label, ratio, needs, ok: ratio >= needs });
  };
  const surfaces: Array<[string, string, boolean]> = [
    // Which grounds are dark is worked out from their colours, as the engine does.
    ...tokens.GROUND_NAMES.map((g): [string, string, boolean] => [`the ${g} ground`, grounds[g]!, !!grounds[g] && tokens.isDarkColour(grounds[g]!)]),
    ['the myth slab', slabs.myth!, true],
    ['the fact slab', slabs.fact!, false],
  ];
  for (const [where, bg, dark] of surfaces) {
    add(`Headline on ${where}`, dark ? inverse : text.ink!, bg, limits.headline!);
    add(`Sub line on ${where}`, dark ? text.invBody! : text.body!, bg, limits.sub!);
    add(`Labels on ${where}`, dark ? text.mutedInv! : text.muted!, bg, limits.label!);
    add(`Accent words on ${where}`, dark ? accents.gold! : accents.primary!, bg, limits.accent!);
  }
  return out;
}

// The colours the expansion had to move for readability: what was asked for and what posts use as text.
export function paletteChanges(s: BrandSettings, b: Json): Array<{ colour: 'primary' | 'accent' | 'dark'; from: string; to: string }> {
  const accents = (b.accents ?? {}) as Record<string, string>, text = (b.text ?? {}) as Record<string, string>;
  const out: Array<{ colour: 'primary' | 'accent' | 'dark'; from: string; to: string }> = [];
  const add = (colour: 'primary' | 'accent' | 'dark', from: string, to: string | undefined) => { if (to && to.toUpperCase() !== from.toUpperCase()) out.push({ colour, from, to: to.toUpperCase() }); };
  add('primary', s.colours.primary, accents.primary);
  add('accent', s.colours.accent, accents.gold);
  add('dark', s.colours.dark, text.ink);
  return out;
}

// ---- reading the stored brand ----------------------------------------------------------------------------------------------

export interface BrandSnapshot {
  profile: BrandProfile | null;
  references: DesignReference[];
}

export async function loadSnapshot(deps: Deps): Promise<BrandSnapshot> {
  const [profile, references] = await Promise.all([
    deps.prisma.brandProfile.findUnique({ where: { id: 'brand' } }),
    deps.prisma.designReference.findMany({ where: { enabled: true, status: 'ready', brief: { not: null } }, orderBy: { createdAt: 'asc' }, take: 24 }),
  ]);
  return { profile, references };
}

const briefs = (refs: DesignReference[]) => refs.map((r) => (r.brief ?? '').trim()).filter(Boolean).map((s) => s.slice(0, 2000));

// The settings in force: the saved ones, or those read from the configured pack.
export function currentSettings(profile: BrandProfile | null): BrandSettings {
  if (profile) {
    const parsed = brandSettingsSchema.safeParse(profile.settings);
    if (parsed.success) return parsed.data;
  }
  return settingsFromBrand(JSON.parse(fs.readFileSync(path.join(core.ROOT, CONFIGURED_BRAND_DIR, 'brand.json'), 'utf8')) as Json);
}

// The brand.json a profile makes (before the logo and font paths are set), with the Advanced fragment merged in.
export function brandFromProfile(profile: Pick<BrandProfile, 'settings' | 'advanced' | 'logoFullWidth' | 'logoFullHeight' | 'fontFamily'>, settings: BrandSettings = brandSettingsSchema.parse(profile.settings)): Json {
  const b = expandBrand(settings);
  if (isObj(profile.advanced)) mergeAdvanced(b, canonicalAdvanced(profile.advanced));
  if (profile.logoFullWidth && profile.logoFullHeight) (b.logos as Json).fullSize = [profile.logoFullWidth, profile.logoFullHeight];
  return b;
}

// What is wrong with a brand.json, in the engine's words.
export const brandProblems = (b: Json): string[] => engineBrand.validateBrand(b);
export const mapProblems = (m: unknown): string[] => engineBrand.mapProblems(m);

// ---- writing the pack folder ---------------------------------------------------------------------------------------------

export interface BrandState {
  // The folder BRAND_DIR points at, relative to the repository root
  dir: string;
  // true while the brand comes from the database but has no uploaded logo: images cannot be made yet
  logosMissing: boolean;
  source: 'pack' | 'database';
  key: string;
}

let state: BrandState = { dir: CONFIGURED_BRAND_DIR, logosMissing: false, source: 'pack', key: 'pack' };
export const brandState = (): BrandState => state;

const snapshotKey = (s: BrandSnapshot) => JSON.stringify([s.profile?.updatedAt?.toISOString() ?? null, s.references.map((r) => [r.id, r.updatedAt.toISOString()])]);

function point(next: BrandState): void {
  process.env.BRAND_DIR = next.dir;
  state = next;
  try {
    setBrandInfo(readBrandInfo(path.join(core.ROOT, next.dir, 'brand.json')));
  } catch (e) {
    logger.error('brand.info_failed', describeError(e));
  }
}

const rel = (abs: string) => path.relative(core.ROOT, abs).split(path.sep).join('/');

// Writes the files to a new folder named by their hash and returns its path relative to the root. An existing folder with
// the same hash is reused (several processes may write the same brand).
function writePack(brand: Json, files: Array<{ name: string; body: Buffer }>, fill: (dir: string) => void): string {
  const root = path.join(core.ROOT, STATE_BRAND_DIR);
  fs.mkdirSync(root, { recursive: true });
  const h = createHash('sha256');
  for (const f of files) h.update(f.name).update(f.body);
  h.update(JSON.stringify(brand));
  const hash = h.digest('hex').slice(0, 16);
  const final = path.join(root, hash);
  if (!fs.existsSync(path.join(final, 'brand.json'))) {
    const tmp = path.join(root, `.tmp-${randomBytes(6).toString('hex')}`);
    fs.mkdirSync(tmp, { recursive: true });
    for (const f of files) { fs.mkdirSync(path.dirname(path.join(tmp, f.name)), { recursive: true }); fs.writeFileSync(path.join(tmp, f.name), f.body); }
    // The brand file names its files by their final path.
    const text = JSON.stringify(brand, null, 2).split(`${STATE_BRAND_DIR}/__PACK__/`).join(`${STATE_BRAND_DIR}/${hash}/`);
    fs.writeFileSync(path.join(tmp, 'brand.json'), text);
    fill(tmp);
    try { fs.renameSync(tmp, final); } catch { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // Old folders are removed after an hour, so a render that started on one never loses it.
  for (const d of fs.readdirSync(root)) {
    const p = path.join(root, d);
    if (d === hash) continue;
    try { if (Date.now() - fs.statSync(p).mtimeMs > 3600_000) fs.rmSync(p, { recursive: true, force: true }); } catch { /* another process removed it */ }
  }
  return rel(final);
}

const PACK = `${STATE_BRAND_DIR}/__PACK__`;

async function materialise(deps: Deps, snap: BrandSnapshot): Promise<BrandState> {
  const key = snapshotKey(snap);
  const refs = briefs(snap.references);
  if (!snap.profile && !refs.length) return { dir: CONFIGURED_BRAND_DIR, logosMissing: false, source: 'pack', key };
  const files: Array<{ name: string; body: Buffer }> = [];
  let brand: Json;
  let logosMissing = false;
  let fill: (dir: string) => void = () => {};
  if (!snap.profile) {
    // The configured pack with the briefs added: its logos stay where they are, its map and prompts are copied.
    const from = path.join(core.ROOT, CONFIGURED_BRAND_DIR);
    brand = JSON.parse(fs.readFileSync(path.join(from, 'brand.json'), 'utf8')) as Json;
    fill = (dir) => {
      if (fs.existsSync(path.join(from, 'map.json'))) fs.copyFileSync(path.join(from, 'map.json'), path.join(dir, 'map.json'));
      if (fs.existsSync(path.join(from, 'prompts'))) fs.cpSync(path.join(from, 'prompts'), path.join(dir, 'prompts'), { recursive: true });
    };
  } else {
    const p = snap.profile;
    brand = brandFromProfile(p);
    const logos = brand.logos as Json;
    if (p.logoFullKey && p.logoMarkKey) {
      files.push({ name: 'logos/logo-full.png', body: await deps.storage.getObject(p.logoFullKey) });
      files.push({ name: 'logos/logo-mark.png', body: await deps.storage.getObject(p.logoMarkKey) });
      logos.full = `${PACK}/logos/logo-full.png`;
      logos.mark = `${PACK}/logos/logo-mark.png`;
    } else {
      // The demo logos keep the brand file valid for the AI and the checks; rendering refuses until real ones are uploaded.
      logosMissing = true;
    }
    if (p.fontKey && p.fontFamily) {
      files.push({ name: 'fonts/brand.woff2', body: await deps.storage.getObject(p.fontKey) });
      const font = brand.font as Json;
      font.family = p.fontFamily;
      const mono = (Array.isArray(font.files) ? font.files as Json[] : []).filter((f) => f.role === 'mono');
      font.files = [{ role: 'sans', weight: '100 900', file: `${PACK}/fonts/brand.woff2`, range: 'U+0000-FFFF' }, ...mono];
    }
    if (p.map) files.push({ name: 'map.json', body: Buffer.from(JSON.stringify(p.map)) });
  }
  if (refs.length) brand.references = refs;
  const problems = brandProblems(brand);
  if (problems.length) throw new Error(`The saved brand is not valid: ${problems.join('; ')}`);
  const dir = writePack(brand, files, fill);
  return { dir, logosMissing, source: snap.profile ? 'database' : 'pack', key };
}

let syncing: Promise<BrandState> | null = null;

// Makes BRAND_DIR match the database. Cheap when nothing changed (two small queries). A brand that cannot be written leaves the
// last good one in place and is logged.
export function syncBrand(deps: Deps): Promise<BrandState> {
  syncing ??= (async () => {
    try {
      const snap = await loadSnapshot(deps);
      if (snapshotKey(snap) === state.key && process.env.BRAND_DIR === state.dir) return state;
      const next = await materialise(deps, snap);
      point(next);
      return next;
    } catch (e) {
      logger.error('brand.sync_failed', describeError(e));
      return state;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

// For tests: forget what was written, so the next sync starts from the configured pack.
export function resetBrandState(): void {
  point({ dir: CONFIGURED_BRAND_DIR, logosMissing: false, source: 'pack', key: 'pack' });
}
