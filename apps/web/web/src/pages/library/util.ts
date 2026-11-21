// Small rules the library shares: which files are accepted, what a file name suggests, and when a picture needs attention.
import type { VaultItem } from '../vault-types';

const MAX_FILE = 15 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ACCEPT = IMAGE_TYPES.join(',');

export type PictureKind = 'photo' | 'screen';
export type Licence = '' | 'own' | 'licensed' | 'rights_to_confirm';

// "IMG_2041-team-at-osu.JPG" becomes "IMG 2041 team at osu": something a person can tidy, not a file name.
export function humaniseFileName(name: string): string {
  const stem = name.replace(/\.[^.]*$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : 'Untitled picture';
}

export const guessKind = (name: string): PictureKind => (/screen|phone/i.test(name) ? 'screen' : 'photo');

// Why a file cannot be used, or null when it can.
export function fileProblem(file: File): string | null {
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
