// What the AI layer assumes about a vault item (the app owns the real table):
//   { id, kind, title?, body, status: 'confirmed' | 'unconfirmed', source?, sourceUrls?, recordedAt?, validFrom?, validUntil?,
//     tags?, file? (photos and screens: path relative to the repository), license?, identifiable?, consent? }
// Only items listed here are facts the AI may use. Everything in them is untrusted text.
export const VAULT_KINDS = ['fact', 'figure', 'news', 'event', 'product-note', 'story', 'photo', 'screen'];
export const RESEARCH_KINDS = ['fact', 'figure', 'news', 'event', 'product-note', 'story'];
export const MEDIA_KINDS = ['photo', 'screen'];

export const DEFAULT_FIGURE_MAX_AGE_DAYS = 180;

export function isStale(item, { now = new Date(), figureMaxAgeDays = DEFAULT_FIGURE_MAX_AGE_DAYS } = {}) {
  if (item.stale === true) return true;
  const today = now.toISOString().slice(0, 10);
  if (typeof item.validUntil === 'string' && item.validUntil.slice(0, 10) < today) return true;
  if (item.kind === 'figure' && typeof item.recordedAt === 'string' && !item.validUntil) {
    const t = Date.parse(item.recordedAt);
    if (Number.isFinite(t) && (now.getTime() - t) / 86400000 > figureMaxAgeDays) return true;
  }
  return false;
}

export const needsRightsCheck = (item) => item.license === 'rights-to-confirm' || item.rightsToConfirm === true || (item.identifiable === true && item.consent !== true && item.consent !== 'recorded');

export function normaliseVault(vault) {
  if (!Array.isArray(vault)) return [];
  const seen = new Set();
  return vault.filter((i) => i && typeof i === 'object' && typeof i.id === 'string' && i.id && !seen.has(i.id) && seen.add(i.id));
}

// Confirmed and current items first, then unconfirmed or stale ones, newest record first within a group.
export function rank(items, opts) {
  const score = (i) => (i.status === 'confirmed' ? 0 : 2) + (isStale(i, opts) ? 1 : 0);
  return [...items].sort((a, b) => score(a) - score(b) || String(b.recordedAt ?? '').localeCompare(String(a.recordedAt ?? '')));
}

// The compact, data-only view a model gets. Bodies are clipped.
export function forPrompt(item, opts, maxBody = 700) {
  const o = { id: item.id, kind: item.kind, title: item.title ?? null, body: String(item.body ?? '').slice(0, maxBody), status: item.status === 'confirmed' ? 'confirmed' : 'unconfirmed' };
  if (isStale(item, opts)) o.stale = true;
  if (item.validUntil) o.validUntil = item.validUntil;
  if (item.recordedAt) o.recordedAt = item.recordedAt;
  if (item.tags?.length) o.tags = item.tags.slice(0, 8);
  if (MEDIA_KINDS.includes(item.kind)) { o.hasFile = Boolean(item.file); if (needsRightsCheck(item)) o.rightsToConfirm = true; if (item.identifiable) o.identifiablePeople = true; }
  return o;
}

// Pictures the drafter may offer: a photo or a framed phone screen that has a file and is not deleted.
export const usableMedia = (items) => items.filter((i) => MEDIA_KINDS.includes(i.kind) && i.file && !i.deletedAt);

// What the model is told a screen item is: the product template (a phone layout) takes only the first, a desktop layout the second.
const SCREEN_WORDS = { phone: 'phone screen, framed', desktop: 'desktop screenshot' };

// The compact form for a picture: enough to judge what it shows, short enough to offer well over a hundred of them.
export function forPromptMedia(item, maxDescription = 220) {
  const o = { id: item.id, kind: item.kind, title: item.title ?? null, description: String(item.body ?? '').slice(0, maxDescription) };
  if (item.kind === 'screen' && ['phone', 'desktop'].includes(item.framing)) o.screenKind = SCREEN_WORDS[item.framing];
  if (item.tags?.length) o.tags = item.tags.slice(0, 8);
  if (item.identifiable) o.identifiablePeople = true;
  if (needsRightsCheck(item)) o.rightsToConfirm = true;
  return o;
}

// Words that show a picture is about another country's money: the brand's money.foreign pattern (brand.json), or null
// when the brand sets none and every currency is fine.
export const foreignMoneyPattern = (brand) => (typeof brand?.money?.foreign === 'string' && brand.money.foreign ? new RegExp(brand.money.foreign, 'i') : null);
export const mentionsForeignMoney = (item, pattern) => !!pattern && pattern.test([item.title, item.body, ...(Array.isArray(item.tags) ? item.tags : [])].filter((x) => typeof x === 'string').join(' \n '));
