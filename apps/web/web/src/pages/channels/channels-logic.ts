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

// ---- the account dialog ----

export interface Organisation { id: string; name: string }

// The organisations an account can be limited to, as choices: every organisation (the empty value), then each one the key check listed by
// name. A saved id the check did not list stays a choice, so it is never dropped without a person choosing.
export function organisationChoices(orgs: ReadonlyArray<Organisation>, current: string): Array<{ value: string; label: string }> {
  const choices = [{ value: '', label: 'Every organisation' }, ...orgs.map((o) => ({ value: o.id, label: o.name.trim() || `Unnamed (${o.id})` }))];
  const cur = current.trim();
  return cur && !orgs.some((o) => o.id === cur) ? [...choices, { value: cur, label: `${cur} (not listed by the check)` }] : choices;
}

// The caption limits in one line, for the closed Fine-tune: the ones set, else the networks' own.
export function captionLimitSummary(limits: Readonly<Record<string, string>>, labelOf: (n: string) => string, defaults: Readonly<Record<string, number>>): string {
  const n = (v: number) => v.toLocaleString('en-GB');
  const set = Object.entries(limits).filter(([, v]) => v.trim() !== '');
  if (!set.length) return `Caption limits: the networks' own (${Object.entries(defaults).map(([k, v]) => `${labelOf(k)} ${n(v)}`).join(', ')})`;
  return `Caption limits: ${set.map(([k, v]) => `${labelOf(k)} ${n(Number(v))}`).join(', ')}; the rest the networks' own`;
}
