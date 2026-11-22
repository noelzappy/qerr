// Pure rules for the Channels page, kept apart so they can be tested without a browser.

// The account a network row starts on: its saved route's account; with no route, the only account when exactly one exists.
export function baselineAccountId(route: { accountId: string } | null, accounts: ReadonlyArray<{ accountId: string }>): string {
  if (route) return route.accountId;
  return accounts.length === 1 ? accounts[0]!.accountId : '';
}

// A row is changed when its account or channel differs from what is saved. A preselected account alone is not a change.
export function routeIsDirty(route: { accountId: string; channelId: string } | null, accounts: ReadonlyArray<{ accountId: string }>, accountId: string, channelId: string): boolean {
  return accountId !== baselineAccountId(route, accounts) || channelId !== (route?.channelId ?? '');
}

// What the networks table says while it cannot be used. null means the accounts have not loaded yet.
export function routesBlockedReason(accountCount: number | null): string | null {
  return accountCount === 0 ? 'Connect Buffer first, then choose a channel for each network.' : null;
}
