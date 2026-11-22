// The brand people set in Settings, and how the design engine and the AI library get it.
//
// The engine and the AI library read a brand pack folder (BRAND_DIR: brand.json, logos, optional map.json and prompts). The web
// app keeps the brand in the database instead (BrandProfile, DesignReference, BrandLayout) and writes it out as a pack folder
// under state/brand/<hash>/ whenever it changes, then points BRAND_DIR at that folder. syncBrand() does this; it runs at start,
// after every change and before every job that renders or calls the AI, so several app processes converge on the same folder.
//
//   no BrandProfile row, no reference briefs, no layouts -> the configured pack (BRAND_DIR, default brands/demo) as it is
//   no row, reference briefs or layouts                  -> a copy of the configured pack with the briefs and layouts added
//   a row                                                -> a pack made from the settings (expandBrand) over the demo pack's values
// The enabled layouts of Settings, Layouts go into brand.json "layouts" in every case (services/layouts.ts).
//
// People never write markup here: every value is checked by the engine's own validateBrand before it is used, and the engine
// builds its CSS from the checked numbers.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BrandLayout, BrandProfile, DesignReference } from '@prisma/client';
import { z } from 'zod';
import { readBrandInfo, setBrandInfo } from '../brand.js';
import type { Deps } from '../deps.js';
import { badRequest } from '../http.js';
import { engineImport } from '../engine/root.js';
import { logger, describeError } from '../log.js';
import { MAX_LAYOUTS, layoutsForBrand, mergeLayouts } from './layouts.js';
import { brandScope, looksFor, packWithLook } from './looks.js';

interface EngineCore { ROOT: string; DEFAULT_BRAND_DIR: string; brandDir(opts?: { root?: string; env?: Record<string, string | undefined> }): string }
interface EngineBrand {
  validateBrand(b: unknown): string[]; mapProblems(m: unknown): string[]; canonicalGrounds(g: unknown): Record<string, string>;
  familyWeights(b: unknown): Record<string, number[]>; nearestWeight(available: readonly number[], want: number): number | null; weightRanges(weights: readonly number[]): Map<number, string>;
}
interface EngineTokens {
  GROUND_NAMES: string[]; ACCENT_STYLES: string[]; SERIES_KEY: RegExp; groundName(g: unknown): string | null; isDarkColour(hex: string): boolean;
  TYPE_CASES: string[]; ACCENT_DEVICES: string[]; SURFACES: string[]; DECORATIONS: string[]; DECORATION_ON: string[]; ARTWORK_FITS: string[];
  PHOTO_TREATMENTS: string[]; STYLE_COLOURS: string[]; LOGO_PLACES: string[]; FOOTERS: string[];
  DIRECTIONS: string[]; POST_KINDS: string[];
}

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

// The design directions a brand can be drawn in (the engine's own list).
export const DIRECTIONS: readonly string[] = tokens.DIRECTIONS;
export const CORNERS = ['square', 'soft', 'round'] as const;
export const HEADLINE_WEIGHTS = [300, 400, 500, 600, 700] as const;

// ---- the style layer in the form ----
// The engine's own lists (lib/design/tokens.mjs), so the form can only hold what brand.json accepts.
const list = (values: string[], what: string) => z.string().refine((v) => values.includes(v), `Choose one of ${values.join(', ')} for ${what}`);
// The colour roles, set one by one. Each is optional: a role left out is made from the four colours (and, for text, fitted
// for contrast); a role that is set is used exactly as it is, and the checks say whether it reads.
export const ROLE_KEYS = {
  grounds: tokens.GROUND_NAMES,
  text: ['ink', 'body', 'muted', 'inverse', 'invBody', 'mutedInv'],
  accents: ['primary', 'gold', 'goldDeep'],
  surfaces: ['panel', 'card', 'outline'],
  slabs: ['myth', 'fact'],
} as const;
type RoleGroup = keyof typeof ROLE_KEYS;
const roleGroup = (keys: readonly string[]) => z.object(Object.fromEntries(keys.map((k) => [k, hex.optional()]))).strict().prefault({});
export const rolesSchema = z.object({
  grounds: roleGroup(ROLE_KEYS.grounds), text: roleGroup(ROLE_KEYS.text), accents: roleGroup(ROLE_KEYS.accents),
  surfaces: roleGroup(ROLE_KEYS.surfaces), slabs: roleGroup(ROLE_KEYS.slabs),
}).strict().prefault({});
export type BrandRoles = z.infer<typeof rolesSchema>;

const tracking = z.number().min(-0.1).max(0.3).nullable().default(null);
const weight = z.number().int().min(100).max(900).nullable().default(null);
// Where each type role's font comes from: headlines in the body font, the label font or a display font of their own; labels in
// the built-in mono, the body font or a label font of their own. "own" needs its .woff2 uploaded (until then the default is used).
export const DISPLAY_FONTS = ['body', 'label', 'own'] as const;
export const LABEL_FONTS = ['mono', 'body', 'own'] as const;
export const styleSettingsSchema = z.object({
  type: z.object({
    display: z.object({ font: z.enum(DISPLAY_FONTS).default('body'), case: list(tokens.TYPE_CASES, 'the case').default('as-typed'), tracking, weight }).strict().prefault({}),
    body: z.object({ case: list(tokens.TYPE_CASES, 'the case').default('as-typed'), tracking, weight }).strict().prefault({}),
    label: z.object({ font: z.enum(LABEL_FONTS).default('mono'), case: list(tokens.TYPE_CASES, 'the case').default('upper'), tracking, weight }).strict().prefault({}),
    scale: z.number().min(0.8).max(1.25).default(1),
    accent: list(tokens.ACCENT_DEVICES, 'the accent').default('series'),
  }).strict().prefault({}),
  surface: list(tokens.SURFACES, 'the surfaces').default('shadow'),
  decoration: z.object({
    kind: list(tokens.DECORATIONS, 'the decoration').default('auto'),
    on: list(tokens.DECORATION_ON, 'where it goes').default('dark'),
    alpha: z.number().min(0.01).max(0.4).nullable().default(null),
    fit: list(tokens.ARTWORK_FITS, 'the artwork').default('cover'),
    opacity: z.number().min(0.05).max(1).default(1),
  }).strict().prefault({}),
  photo: z.object({
    treatment: list(tokens.PHOTO_TREATMENTS, 'the photo treatment').default('none'),
    strength: z.number().min(0).max(1).default(0.5),
    colour: list(tokens.STYLE_COLOURS, 'the colour').default('primary'),
    shadows: list(tokens.STYLE_COLOURS, 'the shadows').default('dark'),
    highlights: list(tokens.STYLE_COLOURS, 'the highlights').default('light'),
  }).strict().prefault({}),
  logo: list(tokens.LOGO_PLACES, 'the logo').default('auto'),
  footer: list(tokens.FOOTERS, 'the footer').default('website'),
  // The design direction `post` designs are drawn in (brand.json style.direction); none until one is chosen.
  direction: list(tokens.DIRECTIONS, 'the design direction').nullable().default(null),
}).strict().prefault({});
export type StyleSettings = z.infer<typeof styleSettingsSchema>;

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
  // The four colours every role starts from ("Start from four colours"); roles may then be set one by one.
  colours: z.object({ primary: hex, accent: hex, dark: hex, light: hex }).strict(),
  roles: rolesSchema,
  headlineWeight: z.number().int().refine((n) => (HEADLINE_WEIGHTS as readonly number[]).includes(n), 'Choose a weight from 300 to 700'),
  corners: z.enum(CORNERS),
  // How strongly large headlines must stand out from what is behind them (a ratio, 3 to 7). null: the engine's own (4.5). Written
  // to the pack as contrast.display only when set.
  contrastDisplay: z.number().min(3, 'Choose a ratio from 3 to 7').max(7, 'Choose a ratio from 3 to 7').nullable().default(null),
  style: styleSettingsSchema,
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
export type BrandSettingsInput = z.input<typeof brandSettingsSchema>;

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

// The full brand.json the settings describe. Logos and font files are filled in by the caller (applyAssets).
//
// Colours: every role starts from the four colours. A role the settings set (roles.*) is used exactly as it is. Every text
// colour that is not set is fitted to the page colours it is set on, so the design checks pass with the brand's own colours: a
// colour that already reads is kept exactly; one that does not is moved towards black (on light pages) or white (on dark pages)
// only as far as it must. Which grounds are light and which dark is worked out from their colours, as the engine does.
// paletteChanges() tells people which derived colours moved; contrastChecks() shows whether the ones they set read.
export function expandBrand(s: BrandSettings, base: Json = baseBrand()): Json {
  const b = structuredClone(base);
  const { primary, accent, dark, light } = s.colours;
  const R = s.roles as { [G in RoleGroup]: Record<string, string | undefined> };
  Object.assign(b, { name: s.name, website: s.website, tagline: s.tagline, timezone: s.timezone, language: s.language });
  if (s.descriptor) b.descriptor = s.descriptor; else delete b.descriptor;
  if (s.money) b.money = s.money; else delete b.money;
  for (const [k, v] of [['voice', s.voice], ['visualDirection', s.visualDirection]] as const) { if (v) b[k] = v; else delete b[k]; }
  delete b.references;
  const limits = (isObj(base.contrast) ? base.contrast : {}) as Record<string, number>;
  const need = (k: string) => (typeof limits[k] === 'number' ? limits[k] : 4.5) + 0.1;
  const isDark = (c: string) => tokens.isDarkColour(c);
  // The page grounds people usually keep light, as set or made from the four colours.
  const light4 = { light: R.grounds.light ?? WHITE, soft: R.grounds.soft ?? light, cool: R.grounds.cool ?? mix(primary, WHITE, 0.12), warm: R.grounds.warm ?? mix(accent, WHITE, 0.14) };
  const lightsFirst = Object.values(light4).filter((c) => !isDark(c));
  const ink = fitContrast(dark, lightsFirst, need('headline'), BLACK);
  const textPrimary = R.accents.primary ?? fitContrast(primary, lightsFirst, need('accent'), BLACK);
  const inverse = R.text.inverse ?? WHITE;
  const groundDark = R.grounds.dark ?? ink;
  const deep = R.grounds.deep ?? fitContrast(mix(groundDark, textPrimary, 0.78), [inverse], need('headline'), BLACK);
  const slabMyth = R.slabs.myth ?? fitContrast(mix(groundDark, textPrimary, 0.85), [inverse], need('headline'), BLACK);
  b.grounds = { ...light4, dark: groundDark, deep };
  // Text is fitted to every surface it is set on: the grounds, and the two slabs of a myth-and-fact page.
  const slabFact = R.slabs.fact ?? light4.cool;
  const groundList = [...Object.values(b.grounds as Record<string, string>), slabFact];
  const lights = groundList.filter((c) => !isDark(c)), darks = [...groundList.filter(isDark), slabMyth];
  const textInk = R.text.ink ?? (R.grounds.light || R.grounds.soft || R.grounds.cool || R.grounds.warm ? fitContrast(dark, lights, need('headline'), BLACK) : ink);
  b.text = {
    ink: textInk,
    body: R.text.body ?? fitContrast(mix(textInk, WHITE, 0.85), lights, need('sub'), BLACK),
    muted: R.text.muted ?? fitContrast(mix(textInk, WHITE, 0.7), lights, need('label'), BLACK),
    mutedInv: R.text.mutedInv ?? fitContrast(mix(WHITE, textInk, 0.62), darks, need('label'), WHITE),
    invBody: R.text.invBody ?? fitContrast(mix(WHITE, textInk, 0.82), darks, need('sub'), WHITE),
    hair: { color: textInk, alpha: 0.12 },
    ...(R.text.inverse ? { inverse: R.text.inverse } : {}),
  };
  b.accents = {
    gold: R.accents.gold ?? fitContrast(accent, darks, need('accent'), WHITE),
    goldDeep: R.accents.goldDeep ?? fitContrast(mix(accent, dark, 0.55), lights, need('accent'), BLACK),
    primary: textPrimary,
  };
  b.gradient = { sage: mix(primary, dark, 0.7), teal: primary, mint: mix(primary, WHITE, 0.5), gold: accent, amber: mix(accent, dark, 0.85) };
  b.surfaces = { panel: R.surfaces.panel ?? light, card: R.surfaces.card ?? WHITE, line: { color: textInk, alpha: 0.08 }, ...(R.surfaces.outline ? { outline: R.surfaces.outline } : {}) };
  const shadows = (isObj(base.shadows) ? base.shadows : {}) as Record<string, Array<Json>>;
  b.shadows = Object.fromEntries(Object.entries(shadows).map(([k, layers]) => [k, layers.map((l) => ({ ...l, color: textInk }))]));
  const r = RADII[s.corners];
  b.radius = { card: r.card, device: r.device, button: r.button };
  const font = { ...(base.font as Json) };
  font.headlineWeight = s.headlineWeight;
  font.accentWeight = Math.max(100, s.headlineWeight - 100);
  b.font = font;
  b.poster = { ...(base.poster as Json), headlineWeight: Math.min(900, s.headlineWeight + 200), slabs: { myth: slabMyth, fact: slabFact }, slabRadius: r.slab };
  b.series = Object.fromEntries(s.series.map((x) => [x.key, { name: x.name, ground: tokens.groundName(x.ground) ?? x.ground, accent: x.accent }]));
  b.spelling = s.spellings.map((x) => ({ wrong: escapeRe(x.wrong), flags: '', right: x.right }));
  b.logos = { ...(base.logos as Json), wordmarkFrom: s.logo.wordmarkFrom, markGap: s.logo.markGap };
  b.style = engineStyle(s.style);
  if (s.contrastDisplay !== null) b.contrast = { ...(isObj(b.contrast) ? b.contrast : {}), display: s.contrastDisplay };
  return b;
}

// The settings' style as the engine's brand.json `style` block (only the fields the engine knows; nothing unset is written).
// The font choices are the settings' own: applyAssets turns them into font families and files.
export function engineStyle(st: StyleSettings): Json {
  const role = (t: { case: string; tracking: number | null; weight: number | null }) => ({ case: t.case, ...(t.tracking !== null ? { tracking: t.tracking } : {}), ...(t.weight !== null ? { weight: t.weight } : {}) });
  const d = st.decoration;
  return {
    type: { display: role(st.type.display), body: role(st.type.body), label: role(st.type.label), scale: st.type.scale, accent: st.type.accent },
    surface: st.surface,
    // Artwork needs its picture; applyAssets adds its path when one is uploaded, and leaves the page plain until then.
    decoration: { kind: d.kind === 'artwork' ? 'none' : d.kind, on: d.on, fit: d.fit, opacity: d.opacity, ...(d.alpha !== null ? { alpha: d.alpha } : {}) },
    photo: { ...st.photo },
    logo: st.logo,
    footer: st.footer,
    // Written only when one is chosen, so a brand without one keeps its brand.json exactly as before.
    ...(st.direction ? { direction: st.direction } : {}),
  };
}

// The engine's style block read back into the form (an imported pack's look, or the configured pack before anything is saved).
export function styleSettingsFrom(style: unknown): StyleSettings {
  const s = isObj(style) ? style : {};
  const t = isObj(s.type) ? s.type : {};
  const role = (v: unknown) => (isObj(v) ? { case: v.case, tracking: v.tracking ?? null, weight: v.weight ?? null } : {});
  const d = isObj(s.decoration) ? s.decoration : {};
  const parsed = styleSettingsSchema.safeParse({
    type: { display: role(t.display), body: role(t.body), label: role(t.label), scale: t.scale, accent: t.accent },
    surface: s.surface, decoration: { kind: d.kind === 'artwork' ? 'none' : d.kind, on: d.on, fit: d.fit, opacity: d.opacity, alpha: d.alpha ?? null },
    photo: s.photo, logo: s.logo, footer: s.footer,
    direction: typeof s.direction === 'string' && tokens.DIRECTIONS.includes(s.direction) ? s.direction : null,
  });
  return parsed.success ? parsed.data : styleSettingsSchema.parse({});
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
    contrastDisplay: isObj(b.contrast) && typeof b.contrast.display === 'number' && b.contrast.display >= 3 && b.contrast.display <= 7 ? b.contrast.display : null,
    roles: {},
    style: styleSettingsFrom(b.style),
    series: series.length ? series : [{ key: 'posts', name: 'Posts', ground: 'light', accent: 'muted' }],
    spellings: [],
    voice: typeof b.voice === 'string' ? b.voice : '',
    visualDirection: typeof b.visualDirection === 'string' ? b.visualDirection : '',
    logo: { wordmarkFrom: isObj(b.logos) && Number.isInteger(b.logos.wordmarkFrom) ? b.logos.wordmarkFrom : 0, markGap: isObj(b.logos) && Number.isInteger(b.logos.markGap) ? b.logos.markGap : 0 },
  });
}

// Deep merge of an Advanced fragment over the generated brand. Lists and plain values replace; logo, font and artwork files (and
// the display and label families, which need their files) never do: they come from the uploads.
const MANAGED = new Set(['logos.full', 'logos.mark', 'logos.fullSize', 'font.files', 'font.display', 'font.label', 'style.decoration.artwork', 'references']);
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
// The pack's style block becomes the form's style settings (so it can be edited there), not part of the fragment.
const IDENTITY_KEYS = ['name', 'website', 'tagline', 'descriptor', 'timezone', 'language', 'money', 'series', 'voice', 'visualDirection', 'references', 'logos', 'style'];
export function splitPackBrand(b: Json): { settings: BrandSettings; advanced: Json } {
  const settings = settingsFromBrand(b);
  const advanced: Json = {};
  for (const [k, v] of Object.entries(b)) if (!IDENTITY_KEYS.includes(k) && !k.startsWith('_')) advanced[k] = structuredClone(v);
  // The pack's font files are paths inside its folder, which an upload does not carry; the display and label families need them.
  if (isObj(advanced.font)) for (const k of ['files', 'display', 'label']) delete (advanced.font as Json)[k];
  return { settings, advanced };
}

// The colour pairs the design checks care about most, with the ratio each needs (from the brand's contrast limits). `set` is
// true when the text or the page colour of the pair is one people set themselves: such a colour is never adjusted, so a pair
// that fails stays failing until they change it.
export interface ContrastCheck { label: string; ratio: number; needs: number; ok: boolean; set?: boolean }

// The roles people set themselves, as "group.key" (grounds.cool, text.ink ...).
// (The fact slab is the cool ground unless it is set itself, so a cool ground people set is theirs on the slab too.)
export function explicitRoles(s: Pick<BrandSettings, 'roles'>): string[] {
  const out = Object.entries(s.roles as Record<string, Record<string, string | undefined>>).flatMap(([g, o]) => Object.entries(o).filter(([, v]) => !!v).map(([k]) => `${g}.${k}`));
  return out.includes('grounds.cool') && !out.includes('slabs.fact') ? [...out, 'slabs.fact'] : out;
}

// Every pair of text and page colour the templates draw, with the ratio the design checks need (the brand's contrast
// limits): headlines, sub lines, labels and accent words on each ground, and on the two slabs of a myth-and-fact page.
export function contrastChecks(b: Json, explicit: string[] = []): ContrastCheck[] {
  const grounds = engineBrand.canonicalGrounds(b.grounds), text = b.text as Record<string, string>, accents = b.accents as Record<string, string>;
  const inverse = text.inverse ?? (tokens.isDarkColour(grounds.light ?? WHITE) ? WHITE : grounds.light ?? WHITE);
  const limits = b.contrast as Record<string, number>;
  const slabs = (isObj(b.poster) && isObj(b.poster.slabs) ? b.poster.slabs : {}) as Record<string, string>;
  const out: ContrastCheck[] = [];
  const set = new Set(explicit);
  const add = (label: string, fg: string, fgRole: string, bg: string, bgRole: string, needs: number) => {
    if (!bg || !fg) return;
    const ratio = contrast(fg, bg);
    out.push({ label, ratio, needs, ok: ratio >= needs, ...(set.has(fgRole) || set.has(bgRole) ? { set: true } : {}) });
  };
  const surfaces: Array<[string, string, string, boolean]> = [
    // Which grounds are dark is worked out from their colours, as the engine does.
    ...tokens.GROUND_NAMES.map((g): [string, string, string, boolean] => [`the ${g} ground`, grounds[g]!, `grounds.${g}`, !!grounds[g] && tokens.isDarkColour(grounds[g]!)]),
    ['the myth slab', slabs.myth!, 'slabs.myth', true],
    ['the fact slab', slabs.fact!, 'slabs.fact', false],
  ];
  for (const [where, bg, bgRole, dark] of surfaces) {
    add(`Headline on ${where}`, dark ? inverse : text.ink!, dark ? 'text.inverse' : 'text.ink', bg, bgRole, limits.headline!);
    add(`Sub line on ${where}`, dark ? text.invBody! : text.body!, dark ? 'text.invBody' : 'text.body', bg, bgRole, limits.sub!);
    add(`Labels on ${where}`, dark ? text.mutedInv! : text.muted!, dark ? 'text.mutedInv' : 'text.muted', bg, bgRole, limits.label!);
    add(`Accent words on ${where}`, dark ? accents.gold! : accents.primary!, dark ? 'accents.gold' : 'accents.primary', bg, bgRole, limits.accent!);
  }
  return out;
}

// The colours the expansion had to move for readability: what was asked for and what posts use as text. A role people set
// themselves is never moved, so it is never listed here.
export function paletteChanges(s: BrandSettings, b: Json): Array<{ colour: 'primary' | 'accent' | 'dark'; from: string; to: string }> {
  const accents = (b.accents ?? {}) as Record<string, string>, text = (b.text ?? {}) as Record<string, string>;
  const set = new Set(explicitRoles(s));
  const out: Array<{ colour: 'primary' | 'accent' | 'dark'; from: string; to: string }> = [];
  const add = (colour: 'primary' | 'accent' | 'dark', role: string, from: string, to: string | undefined) => { if (!set.has(role) && to && to.toUpperCase() !== from.toUpperCase()) out.push({ colour, from, to: to.toUpperCase() }); };
  add('primary', 'accents.primary', s.colours.primary, accents.primary);
  add('accent', 'accents.gold', s.colours.accent, accents.gold);
  add('dark', 'text.ink', s.colours.dark, text.ink);
  return out;
}

// ---- the uploaded files of the style layer ----

// A font of a type role. An uploaded font is one file (`key`) for every character and weight. A font from Google Fonts is its
// files, each with the unicode-range Google gave it, its subset and the weights it draws (`key` is the latin file of the weight
// nearest to 400, for the page's preview), and `source` says which family and weights it is (services/google-fonts.ts). A Google
// font stored before fonts came in several weights has one weight (`source.weight`) and its latin and latin-ext files without
// subset or weights; it is still read, and drawn for every weight as before.
const FONT_RANGE = /^U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?(, ?U\+[0-9A-Fa-f?]{1,6}(-[0-9A-Fa-f]{1,6})?)*$/;
export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const weightList = z.array(z.number().int().refine((w) => (FONT_WEIGHTS as readonly number[]).includes(w), 'a weight from 100 to 900 in hundreds'))
  .min(1).max(FONT_WEIGHTS.length).refine((l) => l.every((w, i) => i === 0 || w > l[i - 1]!), 'weights in ascending order, each once');
const fontFile = z.object({ key: z.string().min(1), range: z.string().max(2000).regex(FONT_RANGE), subset: z.enum(['latin', 'latin-ext']).optional(), weights: weightList.optional() }).strict();
const assetFont = z.object({
  key: z.string().min(1),
  family: z.string().regex(/^[A-Za-z0-9 _-]{1,40}$/),
  // at most every weight in two subsets
  files: z.array(fontFile).min(1).max(FONT_WEIGHTS.length * 2).optional()
    // either every file says its subset and weights, or none does (the older one-weight Google font)
    .refine((l) => !l || l.every((x) => !!x.weights && !!x.subset) || l.every((x) => !x.weights && !x.subset), 'every file with its subset and weights, or none')
    // a weight is drawn by one file per subset
    .refine((l) => !l || new Set(l.flatMap((x) => (x.weights ?? []).map((w) => `${x.subset}:${w}`))).size === l.reduce((n, x) => n + (x.weights?.length ?? 0), 0), 'each weight once per subset'),
  source: z.object({ kind: z.literal('google'), family: z.string().regex(/^[A-Za-z0-9 ]{1,40}$/), weight: z.number().int().min(100).max(900).optional(), weights: weightList.optional() }).strict()
    .refine((s) => s.weight !== undefined || s.weights !== undefined, 'the weight or weights of the font').optional(),
}).strict();
export type AssetFont = z.infer<typeof assetFont>;
export const assetsSchema = z.object({
  // The body font's files and source when it came from Google Fonts; the profile's fontKey and fontFamily still name it (fontKey
  // is the latin file), and this is used only while its key is that fontKey.
  body: assetFont.optional(),
  display: assetFont.optional(),
  label: assetFont.optional(),
  artwork: z.object({ key: z.string().min(1), type: z.enum(['image/png', 'image/jpeg', 'image/webp']) }).strict().optional(),
}).strict();
export type BrandAssets = z.infer<typeof assetsSchema>;
export const assetsOf = (v: unknown): BrandAssets => { const p = assetsSchema.safeParse(v ?? {}); return p.success ? p.data : {}; };
// Every stored file of a role's font, for removing them all when it is replaced.
export const fontFileKeys = (a: AssetFont | undefined | null): string[] => (a ? [...new Set([a.key, ...(a.files ?? []).map((x) => x.key)])] : []);
// The weights a role's font brings (a Google font's; an upload says nothing about its weights).
export const storedWeights = (a: Pick<AssetFont, 'files' | 'source'>): number[] =>
  a.source?.weights ?? [...new Set((a.files ?? []).flatMap((x) => x.weights ?? []))].sort((x, y) => x - y);
// The weights the brand draws a family at (the engine's familyWeights: every role the family fills).
export const familyWeightsOf = (b: Json, family: string): number[] => engineBrand.familyWeights(b)[family] ?? [];
// Of the weights a family has, those that draw `wanted`: the weight itself, or the nearest it has.
export const nearestWeights = (available: readonly number[], wanted: readonly number[]): number[] =>
  [...new Set(wanted.map((w) => engineBrand.nearestWeight(available, w)).filter((w): w is number => w !== null))].sort((x, y) => x - y);

// The files of a role's font in the pack, each with the font-weight it is declared for. One file (an upload): `stem`.woff2, for
// every weight ("100 900"), so a variable font draws each weight and a static one is never made bold by the browser. An older
// one-weight Google font: `stem`-latin.woff2 and `stem`-latin-ext.woff2, also for every weight. A Google font with its weights:
// `stem`-<weight>-<subset>.woff2 for each file, declared for the weights it is the nearest to (the engine's weightRanges), so
// every weight is drawn with the true face nearest to it; a variable file that draws several weights covers all of theirs.
const packFonts = (stem: string, a: Pick<AssetFont, 'key' | 'files'>): Array<{ name: string; key: string; range: string; weight: string }> => {
  if (!a.files?.length) return [{ name: `fonts/${stem}.woff2`, key: a.key, range: 'U+0000-FFFF', weight: '100 900' }];
  if (!a.files.every((x) => x.weights?.length && x.subset)) return a.files.map((x, i) => ({ name: `fonts/${stem}-${i === 0 ? 'latin' : 'latin-ext'}.woff2`, key: x.key, range: x.range, weight: '100 900' }));
  const all = [...new Set(a.files.flatMap((x) => x.weights!))].sort((x, y) => x - y);
  const declared = engineBrand.weightRanges(all);
  const bound = (w: number, i: 0 | 1) => Number(declared.get(w)!.split(' ')[i]);
  return a.files.flatMap((x) => {
    const name = `fonts/${stem}-${x.weights![0]}-${x.subset}.woff2`;
    // the file's weights in runs of neighbours (of all the font's weights), one declaration per run
    const runs: number[][] = [];
    for (const w of x.weights!) {
      const last = runs.at(-1);
      if (last && all.indexOf(w) === all.indexOf(last.at(-1)!) + 1) last.push(w); else runs.push([w]);
    }
    return runs.map((run) => ({ name, key: x.key, range: x.range, weight: `${bound(run[0]!, 0)} ${bound(run.at(-1)!, 1)}` }));
  });
};
// The body font as stored: the Google files and source when assets.body describes the profile's fontKey, else one uploaded file.
export const bodyFont = (p: AssetProfile): AssetFont | null => {
  if (!p.fontKey || !p.fontFamily) return null;
  const b = assetsOf(p.assets).body;
  return b && b.key === p.fontKey ? { ...b, family: p.fontFamily } : { key: p.fontKey, family: p.fontFamily };
};
const ARTWORK_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const PACK = `${STATE_BRAND_DIR}/__PACK__`;

type AssetProfile = Pick<BrandProfile, 'fontKey' | 'fontFamily'> & { assets?: unknown };

// Points the brand at the uploaded files (the body font, the display and label fonts, the artwork), by their paths in the pack
// folder, and lists what has to be copied there. A choice whose file is not uploaded yet falls back: headlines in the body
// font, labels in the mono, no artwork.
export function applyAssets(b: Json, s: BrandSettings, p: AssetProfile): Array<{ name: string; key: string }> {
  const files: Array<{ name: string; key: string }> = [];
  const font = b.font as Json;
  const list = () => (Array.isArray(font.files) ? font.files as Json[] : []);
  // Each file under the weights packFonts declares it for, so the browser never draws a synthetic bold or a fallback instead.
  const copy = (mine: Array<{ name: string; key: string }>) => { for (const x of mine) if (!files.some((f) => f.name === x.name)) files.push({ name: x.name, key: x.key }); };
  const body = bodyFont(p);
  if (body) {
    const own = packFonts('brand', body);
    copy(own);
    font.family = body.family;
    font.files = [...own.map((x) => ({ role: 'sans', weight: x.weight, file: `${PACK}/${x.name}`, range: x.range })), ...list().filter((f) => f.role === 'mono')];
  }
  const A = assetsOf(p.assets);
  const own = (role: 'display' | 'label') => {
    const a = A[role];
    if (!a) return null;
    const mine = packFonts(role, a);
    copy(mine);
    font.files = [...list(), ...mine.map((x) => ({ role, weight: x.weight, file: `${PACK}/${x.name}`, range: x.range }))];
    return a.family;
  };
  const t = s.style.type;
  const label = t.label.font === 'own' ? own('label') : t.label.font === 'body' ? font.family as string : null;
  if (label) font.label = label; else delete font.label;
  const display = t.display.font === 'own' ? own('display') : t.display.font === 'label' ? (label ?? font.mono as string) : null;
  if (display) font.display = display; else delete font.display;
  const style = (b.style ?? {}) as Json, deco = (style.decoration ?? {}) as Json;
  if (s.style.decoration.kind === 'artwork' && A.artwork) {
    const name = `artwork/artwork.${ARTWORK_EXT[A.artwork.type]}`;
    files.push({ name, key: A.artwork.key });
    style.decoration = { ...deco, kind: 'artwork', artwork: `${PACK}/${name}` };
  }
  return files;
}

// ---- what a design reference proposes ----
//
// The AI looks at a reference and proposes concrete style settings (packages/ai/src/reference.mjs PROPOSAL_SCHEMA). Its answer
// is untrusted: it is checked again here, against the same lists, before it is stored, shown or applied. A proposal only ever
// changes the colour roles and the style; it is applied over the settings in force only when an admin accepts it.
const PROPOSAL_COLOURS = [...tokens.GROUND_NAMES, 'ink', 'body', 'muted', 'inverse', 'primary', 'accent'];
const caseOf = z.string().refine((v) => tokens.TYPE_CASES.includes(v));
export const proposalSchema = z.object({
  colours: z.object(Object.fromEntries(PROPOSAL_COLOURS.map((k) => [k, hex.optional()]))).strict(),
  display: z.object({ case: caseOf, tracking: z.number().min(-0.1).max(0.3).optional(), weight: z.number().int().min(100).max(900).optional() }).strict(),
  label: z.object({ case: caseOf, tracking: z.number().min(-0.1).max(0.3).optional(), font: z.enum(['mono', 'body']).optional() }).strict(),
  accent: z.string().refine((v) => tokens.ACCENT_DEVICES.includes(v) && v !== 'series'),
  surface: z.string().refine((v) => tokens.SURFACES.includes(v)),
  decoration: z.object({ kind: z.string().refine((v) => tokens.DECORATIONS.includes(v) && v !== 'artwork'), on: z.string().refine((v) => tokens.DECORATION_ON.includes(v)).optional() }).strict(),
  photo: z.object({ treatment: z.string().refine((v) => tokens.PHOTO_TREATMENTS.includes(v)), strength: z.number().min(0).max(1).optional() }).strict(),
}).strict();
export type StyleProposal = z.infer<typeof proposalSchema>;

// The checked proposal of an analysis, or null (an older analysis, or one whose proposal does not pass).
export function proposalOf(analysis: unknown): StyleProposal | null {
  if (!isObj(analysis) || analysis.proposal === undefined) return null;
  const p = proposalSchema.safeParse(analysis.proposal);
  return p.success ? p.data : null;
}

const COLOUR_ROLE: Record<string, [RoleGroup, string]> = {
  ...Object.fromEntries(tokens.GROUND_NAMES.map((g) => [g, ['grounds', g] as [RoleGroup, string]])),
  ink: ['text', 'ink'], body: ['text', 'body'], muted: ['text', 'muted'], inverse: ['text', 'inverse'], primary: ['accents', 'primary'], accent: ['accents', 'gold'],
};

// The settings with a proposal applied: the colours it names become set roles (the others keep what they were), and the type,
// accent device, surface, decoration and photo treatment it names replace the current ones. The result is parsed by the
// settings schema again, so it can only hold what the form could.
export function applyProposal(s: BrandSettings, p: StyleProposal): BrandSettings {
  const roles = structuredClone(s.roles) as Record<RoleGroup, Record<string, string | undefined>>;
  for (const [k, v] of Object.entries(p.colours)) if (v && COLOUR_ROLE[k]) { const [g, key] = COLOUR_ROLE[k]; roles[g][key] = v; }
  const t = s.style.type;
  const style = {
    ...s.style,
    type: {
      ...t,
      display: { ...t.display, case: p.display.case, tracking: p.display.tracking ?? t.display.tracking, weight: p.display.weight ?? t.display.weight },
      label: { ...t.label, case: p.label.case, tracking: p.label.tracking ?? t.label.tracking, font: p.label.font ?? (t.label.font === 'own' ? 'own' : t.label.font) },
      accent: p.accent,
    },
    surface: p.surface,
    decoration: { ...s.style.decoration, kind: p.decoration.kind, on: p.decoration.on ?? s.style.decoration.on },
    photo: { ...s.style.photo, treatment: p.photo.treatment, strength: p.photo.strength ?? s.style.photo.strength },
  };
  return brandSettingsSchema.parse({ ...s, roles, style });
}

// ---- reading the stored brand ----------------------------------------------------------------------------------------------

export interface BrandSnapshot {
  profile: BrandProfile | null;
  references: DesignReference[];
  // The enabled layouts of Settings, Layouts, in order (services/layouts.ts)
  layouts: BrandLayout[];
}

export async function loadSnapshot(deps: Deps): Promise<BrandSnapshot> {
  const [profile, references, layouts] = await Promise.all([
    deps.prisma.brandProfile.findUnique({ where: { id: 'brand' } }),
    deps.prisma.designReference.findMany({ where: { enabled: true, status: 'ready', brief: { not: null } }, orderBy: { createdAt: 'asc' }, take: 24 }),
    deps.prisma.brandLayout.findMany({ where: { enabled: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take: MAX_LAYOUTS }),
  ]);
  return { profile, references, layouts };
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
// The uploaded fonts and artwork are pointed at by their paths in the pack folder (applyAssets), so the brand checked here is the
// one that is written; `files` says what to copy into the folder.
type ProfileFields = Pick<BrandProfile, 'settings' | 'advanced' | 'logoFullWidth' | 'logoFullHeight' | 'fontFamily'> & Partial<Pick<BrandProfile, 'fontKey' | 'assets'>>;
export function brandAndFiles(profile: ProfileFields, settings: BrandSettings = brandSettingsSchema.parse(profile.settings)): { brand: Json; files: Array<{ name: string; key: string }> } {
  const b = expandBrand(settings);
  if (isObj(profile.advanced)) mergeAdvanced(b, canonicalAdvanced(profile.advanced));
  if (profile.logoFullWidth && profile.logoFullHeight) (b.logos as Json).fullSize = [profile.logoFullWidth, profile.logoFullHeight];
  const files = applyAssets(b, settings, { fontKey: profile.fontKey ?? null, fontFamily: profile.fontFamily, assets: profile.assets });
  return { brand: b, files };
}
export const brandFromProfile = (profile: ProfileFields, settings?: BrandSettings): Json => brandAndFiles(profile, settings).brand;

// contrast.display (the target for large headlines) is written only when the engine knows it: an engine that does not is not given
// a key it would call unknown, so a brand never fails to be written because of it (the same guard as packWithLook for looks).
let contrastLogged = false;
export function withoutUnreadContrast(b: Json, validate: (b: Json) => string[] = brandProblems): Json {
  if (!isObj(b.contrast) || b.contrast.display === undefined) return b;
  const probe = validate({ ...b, contrast: { ...b.contrast, display: 99 } });
  if (probe.some((p) => /contrast\.display/.test(p))) return b;
  if (!contrastLogged) { contrastLogged = true; logger.warn('brand.contrast_display_unsupported', {}); }
  const { display: _display, ...rest } = b.contrast;
  return { ...b, contrast: rest };
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

const snapshotKey = (s: BrandSnapshot) => JSON.stringify([s.profile?.updatedAt?.toISOString() ?? null, s.references.map((r) => [r.id, r.updatedAt.toISOString()]), s.layouts.map((l) => [l.id, l.updatedAt.toISOString()])]);

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
  const reused = fs.existsSync(path.join(final, 'brand.json'));
  if (!reused) {
    const tmp = path.join(root, `.tmp-${randomBytes(6).toString('hex')}`);
    fs.mkdirSync(tmp, { recursive: true });
    for (const f of files) { fs.mkdirSync(path.dirname(path.join(tmp, f.name)), { recursive: true }); fs.writeFileSync(path.join(tmp, f.name), f.body); }
    // The brand file names its files by their final path.
    const text = JSON.stringify(brand, null, 2).split(`${STATE_BRAND_DIR}/__PACK__/`).join(`${STATE_BRAND_DIR}/${hash}/`);
    fs.writeFileSync(path.join(tmp, 'brand.json'), text);
    fill(tmp);
    try { fs.renameSync(tmp, final); } catch { fs.rmSync(tmp, { recursive: true, force: true }); }
  } else {
    // A reused folder counts as new again, so it is not removed while it is still in use.
    try { const now = new Date(); fs.utimesSync(final, now, now); } catch { /* removed meanwhile; the next write makes it again */ }
  }
  // Old folders are removed after an hour, so a render that started on one never loses it. The folder in force stays.
  for (const d of fs.readdirSync(root)) {
    const p = path.join(root, d);
    if (d === hash || d === path.basename(state.dir)) continue;
    try { if (Date.now() - fs.statSync(p).mtimeMs > 3600_000) fs.rmSync(p, { recursive: true, force: true }); } catch { /* another process removed it */ }
  }
  return rel(final);
}


class BrandNotValid extends Error {
  constructor(readonly problems: string[], what: string) { super(`${what}: ${problems.join('; ')}`); }
}

// `draft` makes the pack for settings that are not saved (see draftBrandDir): the saved profile's uploads with these settings, or,
// when nothing is saved, the configured pack with the draft's design direction.
async function materialise(deps: Deps, snap: BrandSnapshot, draft?: { settings: BrandSettings }): Promise<BrandState> {
  const key = snapshotKey(snap);
  const refs = briefs(snap.references);
  const layouts = await layoutsForBrand(deps, snap.layouts);
  if (!draft && !snap.profile && !refs.length && !layouts.length) return { dir: CONFIGURED_BRAND_DIR, logosMissing: false, source: 'pack', key };
  const files: Array<{ name: string; body: Buffer }> = [];
  let brand: Json;
  let logosMissing = false;
  let fill: (dir: string) => void = () => {};
  if (!snap.profile) {
    // The configured pack with the briefs and layouts added: its logos stay where they are, its map and prompts are copied.
    const from = path.join(core.ROOT, CONFIGURED_BRAND_DIR);
    brand = JSON.parse(fs.readFileSync(path.join(from, 'brand.json'), 'utf8')) as Json;
    if (draft?.settings.style.direction) brand.style = { ...(isObj(brand.style) ? brand.style : {}), direction: draft.settings.style.direction };
    fill = (dir) => {
      if (fs.existsSync(path.join(from, 'map.json'))) fs.copyFileSync(path.join(from, 'map.json'), path.join(dir, 'map.json'));
      if (fs.existsSync(path.join(from, 'prompts'))) fs.cpSync(path.join(from, 'prompts'), path.join(dir, 'prompts'), { recursive: true });
    };
  } else {
    const p = snap.profile;
    const made = brandAndFiles(p, draft?.settings);
    brand = made.brand;
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
    // The uploaded fonts (body, display, label) and the artwork, already named in the brand by applyAssets.
    for (const f of made.files) files.push({ name: f.name, body: await deps.storage.getObject(f.key) });
    if (p.map) files.push({ name: 'map.json', body: Buffer.from(JSON.stringify(p.map)) });
  }
  if (refs.length) brand.references = refs;
  // The layouts of Settings, Layouts, ahead of any the pack already had (checked again by validateBrand just below).
  if (layouts.length) brand.layouts = mergeLayouts(layouts, brand.layouts);
  // The active look (Settings, Looks), written as `looks` with style.direction naming it, once the engine reads looks (looks.ts).
  if (snap.profile?.activeLookRef) brand = packWithLook(brand, await looksFor(deps).lookForPack(brandScope()), brandProblems);
  brand = withoutUnreadContrast(brand);
  const problems = brandProblems(brand);
  if (problems.length) throw new BrandNotValid(problems, draft ? 'The brand is not valid' : 'The saved brand is not valid');
  const dir = writePack(brand, files, fill);
  return { dir, logosMissing, source: snap.profile ? 'database' : 'pack', key };
}

// A pack folder for settings that are not saved, written the way a saved brand is (same hash-named folders, reused when the same,
// removed after an hour). BRAND_DIR is not touched: whoever renders with it points BRAND_DIR at `dir` for the time it draws.
// `logosMissing` is true when a saved brand has no logos yet (nothing can be drawn).
export async function draftBrandDir(deps: Deps, settings: BrandSettings): Promise<{ dir: string; logosMissing: boolean }> {
  try {
    const made = await materialise(deps, await loadSnapshot(deps), { settings });
    return { dir: made.dir, logosMissing: made.logosMissing };
  } catch (e) {
    if (e instanceof BrandNotValid) throw badRequest('The brand is not valid', e.problems);
    throw e;
  }
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
