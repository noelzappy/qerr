// The Channels page's pure rules: which account a network row starts on, when a row counts as changed, why the table is off.
import { describe, expect, it } from 'vitest';
import { baselineAccountId, routeIsDirty, routesBlockedReason } from '../web/src/pages/channels/channels-logic';

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
