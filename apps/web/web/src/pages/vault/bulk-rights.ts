// The "Rights" bulk action: one change to the licence, the people shown and their consent, applied to every selected picture.
// Each choice may be left as it is ('keep'). Facts other than photos and screens carry no rights and are skipped.
//   rightsPatch(item, { licence: 'licensed', people: 'keep', consent: 'yes' }) -> { licence: 'licensed', peoplePresent: true, consentRecorded: true } | null
import { isFileKind, type VaultItem } from '../vault-types';

export type Keep = 'keep';
export interface RightsChoice {
  licence: Keep | 'none' | 'own' | 'licensed' | 'rights_to_confirm';
  people: Keep | 'yes' | 'no';
  consent: Keep | 'yes' | 'no';
}
export const KEEP_ALL: RightsChoice = { licence: 'keep', people: 'keep', consent: 'keep' };
export const choiceIsEmpty = (c: RightsChoice): boolean => c.licence === 'keep' && c.people === 'keep' && c.consent === 'keep';

export interface RightsPatch { licence?: VaultItem['licence']; peoplePresent?: boolean; consentRecorded?: boolean }

// What to send for one item, or null when it is not a picture or nothing would change. Consent recorded means people are shown;
// no people shown means no consent to record (as on the item page, where consent is asked only when people can be recognised).
export function rightsPatch(item: Pick<VaultItem, 'kind' | 'licence' | 'peoplePresent' | 'consentRecorded'>, c: RightsChoice): RightsPatch | null {
  if (!isFileKind(item.kind)) return null;
  const licence = c.licence === 'keep' ? item.licence : c.licence === 'none' ? null : c.licence;
  let people = c.people === 'keep' ? item.peoplePresent : c.people === 'yes';
  let consent = c.consent === 'keep' ? item.consentRecorded : c.consent === 'yes';
  if (c.consent === 'yes') people = true;
  if (!people) consent = false;
  const patch: RightsPatch = {};
  if (licence !== item.licence) patch.licence = licence;
  if (people !== item.peoplePresent) patch.peoplePresent = people;
  if (consent !== item.consentRecorded) patch.consentRecorded = consent;
  return Object.keys(patch).length ? patch : null;
}
