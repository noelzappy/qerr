// The upload page's pictures as plain data. Each picture starts with its title from the file name and its kind guessed
// from it, both marked as filled in until the person changes them. The "For all pictures" bar sets the licence, the people
// and tags on every picture; a picture whose licence or people the person changed on its own card keeps its own.
import { guessKind, humaniseFileName, isHttpUrl, peopleFlags, type Licence, type People, type PictureKind, type PictureRole } from './util';

export interface UploadRow {
  key: string;
  file: File;
  previewUrl: string;
  title: string;
  // Still the title made from the file name.
  titleAuto: boolean;
  body: string;
  kind: PictureKind;
  // Still the kind guessed from the file name.
  kindGuessed: boolean;
  licence: Licence;
  // The person chose this picture's licence on its card: the bar leaves it alone.
  licenceOwn: boolean;
  licenceNotes: string;
  sourceUrl: string;
  peoplePresent: boolean;
  consentRecorded: boolean;
  peopleOwn: boolean;
  tintable: boolean;
  tags: string[];
  expanded: boolean;
  phase: 'idle' | 'working' | 'error';
  status: string;
  error: string;
  // Set once the vault item exists, so a retry after a failed upload does not make a second item.
  itemId: string | null;
  problems: Record<string, string>;
}

// What the bar says. null: not chosen, so each picture keeps its own.
export interface ForAll { licence: Licence | null; people: People | null; tags: string[] }
export const NO_FOR_ALL: ForAll = { licence: null, people: null, tags: [] };

let nextKey = 0;
export function makeRow(file: File, previewUrl: string, role: PictureRole, all: ForAll = NO_FOR_ALL): UploadRow {
  const base: UploadRow = {
    key: `row-${nextKey++}`, file, previewUrl,
    title: humaniseFileName(file.name), titleAuto: true, body: '',
    kind: role === 'photo' ? guessKind(file.name) : 'photo', kindGuessed: role === 'photo',
    licence: role === 'photo' ? '' : 'own', licenceOwn: false, licenceNotes: role === 'photo' ? '' : 'Made by us', sourceUrl: '',
    peoplePresent: false, consentRecorded: false, peopleOwn: false, tintable: false, tags: [], expanded: false,
    phase: 'idle', status: '', error: '', itemId: null, problems: {},
  };
  return withForAll(base, all, role);
}

function withForAll(r: UploadRow, all: ForAll, role: PictureRole): UploadRow {
  const next = { ...r };
  if (all.licence !== null && !r.licenceOwn) next.licence = all.licence;
  if (all.people !== null && !r.peopleOwn && role !== 'graphic') Object.assign(next, peopleFlags(all.people));
  if (all.tags.length) next.tags = [...r.tags, ...all.tags.filter((t) => !r.tags.some((x) => x.toLowerCase() === t.toLowerCase()))];
  return next;
}

// The bar changed: every picture takes the new licence and people unless it has its own; tags added to the bar are added to
// every picture, and tags taken off the bar are taken off every picture.
export function applyForAll(rows: UploadRow[], before: ForAll, after: ForAll, role: PictureRole): UploadRow[] {
  const removed = before.tags.filter((t) => !after.tags.includes(t));
  const added = after.tags.filter((t) => !before.tags.includes(t));
  // Only what changed on the bar is passed on, so a tag a card took off is not put back by an unrelated change.
  const change: ForAll = { licence: after.licence === before.licence ? null : after.licence, people: after.people === before.people ? null : after.people, tags: added };
  return rows.map((r) => {
    if (r.phase === 'working') return r;
    const kept = removed.length ? { ...r, tags: r.tags.filter((t) => !removed.includes(t)) } : r;
    return withForAll(kept, change, role);
  });
}

// A change made on one picture's card. Changing the title, kind, licence or people there makes it the person's own.
export function editRow(r: UploadRow, change: Partial<UploadRow>): UploadRow {
  const next = { ...r, ...change };
  if ('title' in change) next.titleAuto = false;
  if ('kind' in change) next.kindGuessed = false;
  if ('licence' in change) next.licenceOwn = true;
  if ('peoplePresent' in change || 'consentRecorded' in change) next.peopleOwn = true;
  return next;
}

export function validateRow(r: UploadRow, role: PictureRole): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.title.trim()) e.title = 'Give the picture a title';
  else if (r.title.trim().length > 200) e.title = 'Keep the title to 200 characters or fewer';
  if (role === 'photo' && !r.body.trim()) e.body = 'Describe the picture: the AI reads this to choose it';
  if (r.sourceUrl.trim() && !isHttpUrl(r.sourceUrl.trim())) e.sourceUrl = 'Enter a full address starting with http:// or https://';
  if (r.tags.length > 30) e.tags = 'A picture can have at most 30 tags';
  return e;
}

export const rowPayload = (r: UploadRow, role: PictureRole) => ({
  kind: r.kind, ...(role !== 'photo' ? { tintable: role === 'graphic' && r.tintable } : {}), title: r.title.trim(), body: r.body.trim(), tags: r.tags,
  licence: r.licence || null, licenceNotes: r.licenceNotes.trim() || null, sourceUrl: r.sourceUrl.trim() || null,
  peoplePresent: r.peoplePresent, consentRecorded: r.peoplePresent && r.consentRecorded,
});
