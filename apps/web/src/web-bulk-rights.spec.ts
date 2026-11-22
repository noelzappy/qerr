import { describe, expect, it } from 'vitest';
import { choiceIsEmpty, KEEP_ALL, rightsPatch } from '../web/src/pages/vault/bulk-rights';

const photo = { kind: 'photo' as const, licence: null, peoplePresent: false, consentRecorded: false };

describe('the bulk Rights action (licence, people and consent on pictures)', () => {
  it('sends only what changes, and nothing for a choice of No change everywhere', () => {
    expect(choiceIsEmpty(KEEP_ALL)).toBe(true);
    expect(rightsPatch(photo, KEEP_ALL)).toBeNull();
    expect(rightsPatch(photo, { ...KEEP_ALL, licence: 'licensed' })).toEqual({ licence: 'licensed' });
    expect(rightsPatch({ ...photo, licence: 'licensed' }, { ...KEEP_ALL, licence: 'licensed' })).toBeNull();
    expect(rightsPatch({ ...photo, licence: 'own' }, { ...KEEP_ALL, licence: 'none' })).toEqual({ licence: null });
  });

  it('marks people as shown when consent is recorded, and drops consent when no people are shown', () => {
    expect(rightsPatch(photo, { ...KEEP_ALL, consent: 'yes' })).toEqual({ peoplePresent: true, consentRecorded: true });
    expect(rightsPatch({ ...photo, peoplePresent: true, consentRecorded: true }, { ...KEEP_ALL, people: 'no' })).toEqual({ peoplePresent: false, consentRecorded: false });
    expect(rightsPatch({ ...photo, peoplePresent: true }, { ...KEEP_ALL, consent: 'no' })).toBeNull();
    expect(rightsPatch({ ...photo, peoplePresent: true, consentRecorded: true }, { ...KEEP_ALL, consent: 'no' })).toEqual({ consentRecorded: false });
  });

  it('covers screens too, and leaves facts that are not pictures alone', () => {
    expect(rightsPatch({ ...photo, kind: 'screen' }, { ...KEEP_ALL, licence: 'own' })).toEqual({ licence: 'own' });
    expect(rightsPatch({ ...photo, kind: 'figure' }, { ...KEEP_ALL, licence: 'own' })).toBeNull();
  });
});
