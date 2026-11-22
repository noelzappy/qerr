// Small rules the library shares: which files are accepted, what a file name suggests, and when a picture needs attention.
import type { VaultItem } from '../vault-types';

const MAX_FILE = 15 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ACCEPT = IMAGE_TYPES.join(',');

export type PictureKind = 'photo' | 'screen';
export type PictureRole = 'photo' | 'cutout' | 'graphic';
export const ROLES: PictureRole[] = ['photo', 'cutout', 'graphic'];
export const ROLE_LABEL: Record<PictureRole, string> = { photo: 'Photos', cutout: 'Cut-outs', graphic: 'Graphics' };
export const ROLE_NOUN: Record<PictureRole, string> = { photo: 'picture', cutout: 'cut-out', graphic: 'graphic' };
export const ROLE_ACCEPT_HINT: Record<PictureRole, string> = {
  photo: 'JPG, PNG, WebP or GIF, up to 15 MB each.',
  cutout: 'PNG or WebP with a transparent background, at least 256 px on the longer side, up to 15 MB each.',
  graphic: 'PNG or WebP with a transparent background, at least 256 px on the longer side, up to 15 MB each.',
};
export const ROLE_EMPTY: Record<PictureRole, string> = { photo: 'No pictures yet.', cutout: 'People or products on a transparent background.', graphic: 'Shapes, stickers and marks your designs can use.' };
export const asRole = (v: string | null): PictureRole => (v === 'cutout' || v === 'graphic' ? v : 'photo');
// A cut-out or graphic needs a transparent PNG or WebP; the server checks the real file again.
export const ACCEPT_BY_ROLE: Record<PictureRole, string> = { photo: IMAGE_TYPES.join(','), cutout: 'image/png,image/webp', graphic: 'image/png,image/webp' };
export type Licence = '' | 'own' | 'licensed' | 'rights_to_confirm';

// "IMG_2041-team-at-osu.JPG" becomes "IMG 2041 team at osu": something a person can tidy, not a file name.
export function humaniseFileName(name: string): string {
  const stem = name.replace(/\.[^.]*$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : 'Untitled picture';
}

export const guessKind = (name: string): PictureKind => (/screen|phone/i.test(name) ? 'screen' : 'photo');

// Why a file cannot be used, or null when it can.
export function fileProblem(file: File, role: PictureRole = 'photo'): string | null {
  if (role !== 'photo' && !['image/png', 'image/webp'].includes(file.type)) return 'Choose a PNG or WebP with a transparent background';
  if (!IMAGE_TYPES.includes(file.type)) return 'Choose a JPG, PNG, WebP or GIF image';
  if (file.size === 0) return 'The file is empty';
  if (file.size > MAX_FILE) return 'The file is larger than 15 MB';
  return null;
}

// A picture needs a person's attention when the rights are unsettled or people are shown without their consent.
export function needsRights(i: Pick<VaultItem, 'licence' | 'peoplePresent' | 'consentRecorded'>): boolean {
  return i.licence === 'rights_to_confirm' || (i.peoplePresent && !i.consentRecorded);
}

export const isHttpUrl = (v: string) => /^https?:\/\//i.test(v) && URL.canParse(v);

export const KIND_OPTIONS = [{ value: 'photo', label: 'Photo' }, { value: 'screen', label: 'Screen' }];
export const LICENCE_OPTIONS = [
  { value: '', label: 'Not recorded yet' },
  { value: 'own', label: 'Own' },
  { value: 'licensed', label: 'Licensed stock' },
  { value: 'rights_to_confirm', label: 'Rights to confirm' },
];
