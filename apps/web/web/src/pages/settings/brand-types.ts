// The shapes of /api/settings/brand (see apps/web/src/server/routes/brand.ts).
export interface BrandSettings {
  name: string;
  website: string;
  tagline: string;
  descriptor: string;
  timezone: string;
  language: string;
  money: { local: string; foreign: string } | null;
  colours: { primary: string; accent: string; dark: string; light: string };
  headlineWeight: number;
  corners: 'square' | 'soft' | 'round';
  series: Array<{ key: string; name: string; ground: string; accent: string }>;
  spellings: Array<{ wrong: string; right: string }>;
  voice: string;
  visualDirection: string;
  logo: { wordmarkFrom: number; markGap: number };
}

export interface ContrastCheck { label: string; ratio: number; needs: number; ok: boolean }
export interface PaletteChange { colour: 'primary' | 'accent' | 'dark'; from: string; to: string }
// The colours posts use, after the server fitted the text colours to the page colours (POST /api/settings/brand/preview).
export interface Palette {
  grounds: Record<string, string>;
  text: Record<string, string>;
  accents: Record<string, string>;
  slabs: Record<string, string>;
}
export interface BrandLook { checks: ContrastCheck[]; changes: PaletteChange[]; palette: Palette }

export interface BrandView {
  saved: boolean;
  settings: BrandSettings;
  logos: { full: string | null; mark: string | null; fullSize: [number, number] | null };
  font: { family: string } | null;
  advanced: Record<string, unknown>;
  map: unknown;
  checks: ContrastCheck[];
  changes: PaletteChange[];
  palette: Palette;
  logosMissing: boolean;
  updatedAt: string | null;
}

export interface DesignReference {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  note: string;
  status: 'pending' | 'analysing' | 'ready' | 'failed';
  analysis: { summary: string; palette: Array<{ hex: string; role: string }>; typography: string; layout: string; imagery: string; mood: string; avoid: string } | null;
  brief: string | null;
  error: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  imageUrl: string | null;
}

export const GROUNDS = ['white', 'tint', 'mint', 'gold-pale', 'ink', 'deep'] as const;
export const GROUND_LABEL: Record<string, string> = { white: 'White', tint: 'Light tint', mint: 'Soft primary', 'gold-pale': 'Soft accent', ink: 'Dark', deep: 'Deep' };
export const ACCENTS = ['muted', 'colour', 'weight'] as const;
export const ACCENT_LABEL: Record<string, string> = { muted: 'Second half in grey', colour: 'Second half in the primary colour', weight: 'Second half in a lighter weight' };

// The page colours the settings make, as the server makes them (services/brand-settings.ts expandBrand), for the preview.
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
export const mix = (a: string, b: string, w: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * w + y[i]! * (1 - w))); };
export function groundColours(c: BrandSettings['colours']): Record<string, string> {
  return { white: '#ffffff', tint: c.light, mint: mix(c.primary, '#ffffff', 0.14), 'gold-pale': mix(c.accent, '#ffffff', 0.16), ink: c.dark, deep: mix(c.dark, c.primary, 0.78) };
}
export const isDarkGround = (g: string) => g === 'ink' || g === 'deep';
export const validHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);
