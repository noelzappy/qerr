// Builds the context that post checks need: brand file, series keys, vault lookups.
import { ROOT, brandFile, readJson, validTimeZone } from '@vesk/engine/core';
import { AIError } from './errors.mjs';
import { NETWORKS } from '@vesk/engine/networks';
import { normaliseVault } from './vault.mjs';

export function readBrand({ root = ROOT, override } = {}) {
  const b = readJson(brandFile('brand.json', { root }), null);
  if (!b) throw new AIError('the brand pack\'s brand.json could not be read (BRAND_DIR)', { code: 'config' });
  return { ...b, ...(override && typeof override === 'object' ? Object.fromEntries(['name', 'tagline', 'website', 'descriptor'].filter((k) => typeof override[k] === 'string').map((k) => [k, override[k]])) : {}) };
}

// What the model is told about the brand, so the library's prompts stay brand-neutral: the brand pack's own prompts may
// say more. Names, lines, spellings, the language, the voice and the visual direction (with the style briefs of the design
// references); no colours or file paths.
export const brandBrief = (b) => ({
  name: b.name, descriptor: b.descriptor ?? null, tagline: b.tagline, website: b.website,
  spellings: [...new Set((b.spelling ?? []).map((r) => r.right).filter((x) => typeof x === 'string'))],
  money: typeof b.money?.local === 'string' ? b.money.local : null,
  language: typeof b.language === 'string' && b.language.trim() ? b.language.trim() : 'British English',
  voice: typeof b.voice === 'string' && b.voice.trim() ? b.voice.trim() : null,
  visualDirection: typeof b.visualDirection === 'string' && b.visualDirection.trim() ? b.visualDirection.trim() : null,
  references: Array.isArray(b.references) ? b.references.filter((r) => typeof r === 'string' && r.trim()).slice(0, 24) : [],
});

export function makeCtx({ vault, channels, period = null, brand, now, seriesKeys }) {
  const items = normaliseVault(vault);
  const byId = new Map(items.map((i) => [i.id, i]));
  const byFile = new Map(items.filter((i) => typeof i.file === 'string' && i.file).map((i) => [i.file, i]));
  return { items, byId, byFile, channels, period, brand, now, seriesKeys: seriesKeys ?? Object.keys(brand.series ?? {}), takenIds: new Set() };
}

export function parseChannels(channels, fallback = ['instagram', 'linkedin', 'facebook']) {
  const list = channels === undefined ? fallback : channels;
  if (!Array.isArray(list) || !list.length || list.some((n) => !NETWORKS.includes(n))) throw new AIError(`channels must be a non-empty list of ${NETWORKS.join(', ')}`, { code: 'config' });
  return [...new Set(list)];
}

// period: { from, to } | { start, end } | "YYYY-MM"
export function parsePeriod(p) {
  let from, to;
  if (typeof p === 'string' && /^\d{4}-\d{2}$/.test(p)) {
    from = `${p}-01`;
    const d = new Date(`${p}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0);
    to = d.toISOString().slice(0, 10);
  } else if (p && typeof p === 'object') { from = p.from ?? p.start; to = p.to ?? p.end; }
  const ok = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
  if (!ok(from) || !ok(to) || from > to) throw new AIError('period must be "YYYY-MM" or { from, to } with real YYYY-MM-DD dates, from before to', { code: 'config' });
  return { from, to };
}

export const checkTimezone = (tz = 'UTC') => {
  if (!validTimeZone(tz)) throw new AIError(`timezone "${tz}" is not a valid IANA time zone`, { code: 'config' });
  return tz;
};
