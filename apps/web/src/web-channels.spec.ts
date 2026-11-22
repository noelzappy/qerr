// The Channels page's pure rules: which account a network row starts on, when a row counts as changed, why the table is off.
import { describe, expect, it } from 'vitest';
import { baselineAccountId, captionLimitSummary, organisationChoices, routeIsDirty, routesBlockedReason } from '../web/src/pages/channels/channels-logic';
import { CAPTION_LIMIT } from '../web/src/pages/batches/labels';
import { networkLabel } from '../web/src/lib/labels';

const one = [{ accountId: 'a1' }];
const two = [{ accountId: 'a1' }, { accountId: 'a2' }];

describe('the account a network row starts on', () => {
  it('preselects the only account when the network has no route', () => {
    expect(baselineAccountId(null, one)).toBe('a1');
  });
  it('leaves the choice open with no account or with several', () => {
    expect(baselineAccountId(null, [])).toBe('');
    expect(baselineAccountId(null, two)).toBe('');
  });
  it('keeps the saved route\'s account', () => {
    expect(baselineAccountId({ accountId: 'a2' }, one)).toBe('a2');
  });
});

describe('a changed row', () => {
  it('is not changed by the preselected account alone', () => {
    expect(routeIsDirty(null, one, 'a1', '')).toBe(false);
  });
  it('is changed once a channel is chosen', () => {
    expect(routeIsDirty(null, one, 'a1', 'c1')).toBe(true);
  });
  it('is changed when another account is picked', () => {
    expect(routeIsDirty(null, two, 'a2', '')).toBe(true);
    expect(routeIsDirty({ accountId: 'a1', channelId: 'c1' }, two, 'a2', '')).toBe(true);
  });
  it('is unchanged when it matches the saved route', () => {
    expect(routeIsDirty({ accountId: 'a1', channelId: 'c1' }, two, 'a1', 'c1')).toBe(false);
  });
});

describe('the reason the table is off', () => {
  it('is given only when there is no account', () => {
    expect(routesBlockedReason(0)).toMatch(/Connect Buffer/);
    expect(routesBlockedReason(1)).toBeNull();
    expect(routesBlockedReason(null)).toBeNull();
  });
});

describe('the organisation of an account, after a key check', () => {
  const orgs = [{ id: 'o1', name: 'Studio' }, { id: 'o2', name: '' }];
  it('is a choice of every organisation or one of those the check listed, by name', () => {
    expect(organisationChoices(orgs, '')).toEqual([
      { value: '', label: 'Every organisation' }, { value: 'o1', label: 'Studio' }, { value: 'o2', label: 'Unnamed (o2)' },
    ]);
  });
  it('keeps a saved id the check did not list, so it is not dropped unseen', () => {
    expect(organisationChoices(orgs, 'o9').at(-1)).toEqual({ value: 'o9', label: 'o9 (not listed by the check)' });
    expect(organisationChoices(orgs, 'o1')).toHaveLength(3);
  });
});

describe('the caption limits behind Fine-tune', () => {
  it('say the networks\' own limits when none is set', () => {
    expect(captionLimitSummary({ instagram: '', linkedin: '', facebook: '', x: '' }, networkLabel, CAPTION_LIMIT))
      .toBe("Caption limits: the networks' own (Instagram 2,200, LinkedIn 3,000, Facebook 63,206, X 280)");
  });
  it('name the ones set', () => {
    expect(captionLimitSummary({ instagram: '', x: '4000' }, networkLabel, CAPTION_LIMIT)).toBe("Caption limits: X 4,000; the rest the networks' own");
  });
});
