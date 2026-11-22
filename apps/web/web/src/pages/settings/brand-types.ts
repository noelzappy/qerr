// The shapes of /api/settings/brand (see apps/web/src/server/routes/brand.ts and services/brand-settings.ts).
import type { Layout } from './layout-types';

// The style layer: every value is one of the engine's fixed lists (packages/engine/lib/design/tokens.mjs) or a number in range;
// the server checks them again with the engine's own validateBrand.
export const GROUNDS = ['light', 'soft', 'cool', 'warm', 'dark', 'deep'] as const;
export type GroundName = (typeof GROUNDS)[number];
export const TYPE_CASES = ['as-typed', 'upper'] as const;
export const ACCENTS = ['muted', 'colour', 'weight', 'none'] as const;
export const ACCENT_DEVICES = ['series', ...ACCENTS] as const;
export const SURFACES = ['shadow', 'outline', 'flat'] as const;
export const DECORATIONS = ['auto', 'none', 'dots', 'grid', 'lines', 'artwork'] as const;
export const DECORATION_ON = ['dark', 'all'] as const;
export const ARTWORK_FITS = ['cover', 'corner'] as const;
export const PHOTO_TREATMENTS = ['none', 'tint', 'duotone', 'overlay'] as const;
export const STYLE_COLOURS = ['primary', 'accent', 'ink', 'inverse', ...GROUNDS] as const;
export const LOGO_PLACES = ['auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export const FOOTERS = ['website', 'pill', 'none'] as const;
export const DISPLAY_FONTS = ['body', 'label', 'own'] as const;
export const LABEL_FONTS = ['mono', 'body', 'own'] as const;

// The design directions: a whole look for posts made as a kind of post (null: the classic layouts).
export const DIRECTIONS = ['editorial', 'swiss', 'retail'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface TypeRole { case: (typeof TYPE_CASES)[number]; tracking: number | null; weight: number | null }
export interface StyleSettings {
  direction: Direction | null;
  type: {
    display: TypeRole & { font: (typeof DISPLAY_FONTS)[number] };
    body: TypeRole;
    label: TypeRole & { font: (typeof LABEL_FONTS)[number] };
    scale: number;
    accent: (typeof ACCENT_DEVICES)[number];
  };
  surface: (typeof SURFACES)[number];
  decoration: { kind: (typeof DECORATIONS)[number]; on: (typeof DECORATION_ON)[number]; alpha: number | null; fit: (typeof ARTWORK_FITS)[number]; opacity: number };
  photo: { treatment: (typeof PHOTO_TREATMENTS)[number]; strength: number; colour: string; shadows: string; highlights: string };
  logo: (typeof LOGO_PLACES)[number];
  footer: (typeof FOOTERS)[number];
}

// The colour roles that can be set one by one; a role left out is made from the four colours.
export const ROLE_GROUPS = {
  grounds: { title: 'Page colours', keys: GROUNDS as readonly string[] },
  text: { title: 'Text', keys: ['ink', 'body', 'muted', 'inverse', 'invBody', 'mutedInv'] },
  accents: { title: 'Accents', keys: ['primary', 'gold', 'goldDeep'] },
  surfaces: { title: 'Panels and cards', keys: ['panel', 'card', 'outline'] },
  slabs: { title: 'Myth and fact panels', keys: ['myth', 'fact'] },
} as const;
export type RoleGroup = keyof typeof ROLE_GROUPS;
export type BrandRoles = Record<RoleGroup, Record<string, string | undefined>>;
export const ROLE_LABEL: Record<string, string> = {
  'grounds.light': 'Light page', 'grounds.soft': 'Soft page', 'grounds.cool': 'Cool page', 'grounds.warm': 'Warm page', 'grounds.dark': 'Dark page', 'grounds.deep': 'Deep page',
  'text.ink': 'Headlines on light', 'text.body': 'Body on light', 'text.muted': 'Labels on light',
  'text.inverse': 'Headlines on dark', 'text.invBody': 'Body on dark', 'text.mutedInv': 'Labels on dark',
  'accents.primary': 'Accent on light', 'accents.gold': 'Accent on dark', 'accents.goldDeep': 'Deep accent',
  'surfaces.panel': 'Panel behind cards', 'surfaces.card': 'Card', 'surfaces.outline': 'Card outline',
  'slabs.myth': 'Myth panel', 'slabs.fact': 'Fact panel',
};
export const emptyRoles = (): BrandRoles => ({ grounds: {}, text: {}, accents: {}, surfaces: {}, slabs: {} });

export interface BrandNumbers { decimal: '.' | ','; group: ',' | '.' | ' ' | 'thin' | 'none'; currency: string; currencyAt: 'before' | 'after'; currencySpace: boolean; percentSpace: boolean }
export interface BrandSettings {
  name: string;
  website: string;
  tagline: string;
  descriptor: string;
  timezone: string;
  // Where the brand works (ISO 3166-1 alpha-2): drafts are offered its holidays and observances. null: not said.
  country: string | null;
  language: string;
  money: { local: string; foreign: string } | null;
  // How numbers are written in charts (decimal mark, thousands separator, currency sign and where it goes); null: the engine's default.
  numbers: BrandNumbers | null;
  colours: { primary: string; accent: string; dark: string; light: string };
  roles: BrandRoles;
  headlineWeight: number;
  corners: 'square' | 'soft' | 'round';
  // The contrast large headlines need (3 to 7); null: the standard 4.5.
  contrastDisplay: number | null;
  style: StyleSettings;
  series: Array<{ key: string; name: string; ground: string; accent: string }>;
  spellings: Array<{ wrong: string; right: string }>;
  voice: string;
  visualDirection: string;
  // Emoji in the words of post images (at most three standard emoji per text); off by default.
  emoji: boolean;
  logo: { wordmarkFrom: number; markGap: number };
}

// `set`: the pair uses a colour people set themselves (never adjusted; change it to fix the pair).
export interface ContrastCheck { label: string; ratio: number; needs: number; ok: boolean; set?: boolean }
export interface PaletteChange { colour: 'primary' | 'accent' | 'dark'; from: string; to: string }
// Every colour role posts use, after the server made the unset ones from the four colours (POST /api/settings/brand/preview).
export interface Palette {
  grounds: Record<string, string>;
  text: Record<string, string>;
  accents: Record<string, string>;
  slabs: Record<string, string>;
  surfaces: Record<string, string>;
}
export interface BrandLook { checks: ContrastCheck[]; changes: PaletteChange[]; palette: Palette; explicit: string[] }

export type FontRole = 'body' | 'display' | 'label';
// A Google font: the weights it brought, and the weights the brand now draws its role at that it was stored without (the
// nearest stored weight stands in until it is picked again).
export interface FontSource { family: string; source: 'upload' | 'google'; google?: { family: string; weights: number[]; missing: number[] }; file: string }
// One family of the curated Google Fonts list (GET /api/settings/brand/google-fonts; services/google-fonts.ts on the server).
export interface GoogleFont { family: string; category: string; weights: number[]; licence: 'OFL-1.1' | 'Apache-2.0'; note: string }
export const GOOGLE_CATEGORY_LABEL: Record<string, string> = { sans: 'Sans serif', serif: 'Serif', display: 'Display', condensed: 'Condensed', mono: 'Monospace', handwriting: 'Handwriting' };
export const LICENCE_LABEL: Record<GoogleFont['licence'], string> = { 'OFL-1.1': 'SIL Open Font License 1.1', 'Apache-2.0': 'Apache License 2.0' };
export const WEIGHT_NAME: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi-bold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

export interface BrandView extends BrandLook {
  saved: boolean;
  settings: BrandSettings;
  logos: { full: string | null; mark: string | null; fullSize: [number, number] | null };
  font: { family: string } | null;
  fonts: { body: string | null; display: string | null; label: string | null };
  // Where each role's font came from (an upload or Google Fonts), and the address of its file for the preview.
  fontSources: Record<FontRole, FontSource | null>;
  artwork: string | null;
  advanced: Record<string, unknown>;
  map: unknown;
  logosMissing: boolean;
  updatedAt: string | null;
}

// What the AI proposes from a design reference (checked by the server before it is stored or shown).
export interface StyleProposal {
  colours: Partial<Record<string, string>>;
  display: { case: string; tracking?: number; weight?: number };
  label: { case: string; tracking?: number; font?: 'mono' | 'body' };
  accent: string;
  surface: string;
  decoration: { kind: string; on?: string };
  photo: { treatment: string; strength?: number };
}

export interface DesignReference {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  note: string;
  status: 'pending' | 'analysing' | 'ready' | 'failed';
  analysis: { summary: string; palette: Array<{ hex: string; role: string }>; typography: string; layout: string; imagery: string; mood: string; avoid: string; proposal?: StyleProposal; composition?: Layout } | null;
  brief: string | null;
  error: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  imageUrl: string | null;
}

export const GROUND_LABEL: Record<string, string> = { light: 'Light', soft: 'Soft', cool: 'Cool', warm: 'Warm', dark: 'Dark', deep: 'Deep' };
export const ACCENT_LABEL: Record<string, string> = { muted: 'Second half in grey', colour: 'Second half in the accent colour', weight: 'Second half in a lighter weight', none: 'No second-half device' };
export const LABELS: Record<string, string> = {
  'as-typed': 'As typed', upper: 'Capitals', series: 'As each post type says', ...ACCENT_LABEL,
  shadow: 'Soft shadow', outline: 'Outlined', flat: 'Flat',
  auto: 'Dots on dark pages, lines on dark posters', dots: 'Dots', grid: 'Grid', lines: 'Fine lines', artwork: 'Our artwork', dark: 'Dark pages only', all: 'Every page',
  cover: 'Fill the page', corner: 'Top right corner',
  tint: 'Tinted', duotone: 'Duotone', overlay: 'Colour overlay',
  'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right',
  website: 'Logo and website', pill: 'Logo in a pill, and website',
  body: 'The body font', label: 'The label font', own: 'Its own font', mono: 'The built-in mono (IBM Plex Mono)',
  primary: 'Accent on light', accent: 'Accent on dark', ink: 'Headline colour', inverse: 'Headline colour on dark', ...GROUND_LABEL,
};
// "none" means a different thing in each list.
export const NONE_LABEL: Record<string, string> = { decoration: 'None', photo: 'Untouched', footer: 'Logo only', accent: ACCENT_LABEL.none! };
export const optionsOf = (list: readonly string[], where?: keyof typeof NONE_LABEL) => list.map((v) => ({ value: v, label: v === 'none' && where ? NONE_LABEL[where]! : LABELS[v] ?? v }));

// The page colours the four colours make, as the server makes them (services/brand-settings.ts expandBrand), for a sketch
// before the server has answered.
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a: string, b: string, w: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * w + y[i]! * (1 - w))); };
export function groundColours(c: BrandSettings['colours'], roles?: BrandRoles): Record<string, string> {
  const g = roles?.grounds ?? {};
  return { light: g.light ?? '#ffffff', soft: g.soft ?? c.light, cool: g.cool ?? mix(c.primary, '#ffffff', 0.12), warm: g.warm ?? mix(c.accent, '#ffffff', 0.14), dark: g.dark ?? c.dark, deep: g.deep ?? mix(c.dark, c.primary, 0.78) };
}
// A colour is dark when white reads better on it than black (as the engine decides).
export function isDarkColour(h: string): boolean {
  if (!validHex(h)) return false;
  const [r, g, b] = rgb(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  const l = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.05;
}
export const validHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
