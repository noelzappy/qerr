// The sections of Brand and look, their addresses, and what a section needs from the page.
import type { BrandLook, BrandSettings, BrandView, FontRole } from '../brand-types';

export const SECTIONS = [
  { id: 'identity', title: 'Identity', look: false },
  { id: 'logos', title: 'Logos', look: true },
  { id: 'colours', title: 'Colours', look: true },
  { id: 'type', title: 'Type', look: true },
  { id: 'surfaces', title: 'Surfaces and photos', look: true },
  { id: 'post-types', title: 'Post types', look: true },
  { id: 'voice', title: 'Voice and spelling', look: false },
  { id: 'advanced', title: 'Advanced', look: false },
] as const;
export type SectionId = (typeof SECTIONS)[number]['id'];

export const isSection = (v: string | undefined): v is SectionId => SECTIONS.some((s) => s.id === v);
export const sectionPath = (id: SectionId) => (id === 'identity' ? '/settings/brand' : `/settings/brand/${id}`);

// Addresses that older links and the setup checklist use: `/settings/brand#logos` and the former section names.
export function sectionFromHash(hash: string): SectionId | null {
  const h = hash.replace(/^#/, '');
  const legacy: Record<string, SectionId> = { look: 'colours', series: 'post-types' };
  if (isSection(h)) return h;
  return legacy[h] ?? null;
}

// Which section holds the field a server problem names (the path the server gives, such as `colours.primary`).
export function sectionOfPath(path: string): SectionId {
  const head = path.split('.')[0] ?? '';
  if (head === 'colours' || head === 'roles' || head === 'corners' || head === 'headlineWeight') return 'colours';
  if (head === 'logo') return 'logos';
  if (head === 'style') {
    const second = path.split('.')[1];
    return second === 'type' ? 'type' : 'surfaces';
  }
  if (head === 'series') return 'post-types';
  if (head === 'voice' || head === 'visualDirection' || head === 'spellings') return 'voice';
  if (head === 'money') return 'identity';
  return 'identity';
}

// What every section receives from the page. Changes go through `update`, which always works on the latest form state.
export interface BrandCtx {
  s: BrandSettings;
  view: BrandView;
  look: BrandLook | null;
  fields: Record<string, string>;
  set: <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) => void;
  update: (fn: (cur: BrandSettings) => BrandSettings) => void;
  logoUrl: (u: string | null) => string | null;
  artworkUrl: string | null;
  busy: string;
  uploadLogo: (which: 'full' | 'mark', file: Blob, name?: string) => void;
  drawSimple: () => void;
  uploadFont: (file: File, family: string, role: FontRole) => void;
  pickGoogleFont: (role: FontRole, family: string, weight: number) => void;
  askRemoveFont: (role: FontRole) => void;
  uploadArtwork: (file: File) => void;
  askRemoveArtwork: () => void;
  applyView: (next: BrandView) => void;
}
