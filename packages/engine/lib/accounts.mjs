// Buffer accounts as the push loop sees them: { name, apiKey, organizationId, captionLimits }, one per Buffer account, and a
// routing of each network to one account and one channel id. The web app builds both from its database (keys are kept there
// encrypted and decrypted only to send); this module holds the rules they share.

// An account name: letters, digits, _ and -, up to 32 characters.
export const ACCOUNT_NAME = /^[A-Za-z0-9_-]{1,32}$/;
export const isValidAccountName = (name) => typeof name === 'string' && ACCOUNT_NAME.test(name);

// Caption limit for one network on one account: the account's own setting, else the built-in default.
export const captionLimitFor = (account, network, defaults) => account?.captionLimits?.[network] ?? defaults[network].chars;
