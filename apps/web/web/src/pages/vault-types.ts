// The shape of a vault item as the server returns it, shared by the list and the item page.
import type { VaultKind } from '../lib/labels';

export interface VaultItem {
  id: string;
  kind: VaultKind;
  title: string;
  body: string;
  sourceUrl: string | null;
  sourceNotes: string | null;
  recordedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: 'confirmed' | 'unconfirmed';
  confirmedById: string | null;
  confirmedAt: string | null;
  tags: string[];
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  licence: 'own' | 'licensed' | 'rights_to_confirm' | null;
  licenceNotes: string | null;
  peoplePresent: boolean;
  consentRecorded: boolean;
  createdAt: string;
  updatedAt: string;
  hasFile: boolean;
  // Picture items: 'photo' (screens too), 'cutout' or 'graphic'; tintable graphics may be recoloured; pixel size read at upload.
  role: 'photo' | 'cutout' | 'graphic';
  tintable: boolean;
  width: number | null;
  height: number | null;
  // Only on list answers asked for with withFileUrls: a signed address, null when signing failed.
  fileUrl?: string | null;
  stale: boolean;
  staleReason: string | null;
  problems: { rights: string[]; source: string[] };
}

export const isFileKind = (kind: string) => kind === 'photo' || kind === 'screen';
