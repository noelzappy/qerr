// The brand Vesk works for, read from the brand pack folder in force (BRAND_DIR, see packages/engine/lib/core.mjs, which
// syncBrand points at the brand saved in Settings): the name, website, time zone and series the web app shows, and the file
// of the logo mark. Colours and fonts stay with the design engine, which reads the same folder when it renders.
import fs from 'node:fs';
import path from 'node:path';
import { engineImport } from './engine/root.js';

export interface BrandInfo {
  name: string;
  website: string;
  tagline: string;
  timezone: string;
  series: Array<{ key: string; name: string }>;
  logoMarkFile: string | null;
  // The brand's money (brand.json "money"): what it is, and a pattern (matched without regard to case) of other currencies.
  money: { local: string; foreign: string } | null;
}

interface EngineCore {
  ROOT: string;
  brandFile(name: string): string;
  repoPath(rel: string): string;
}

const core = await engineImport<EngineCore>('core');

const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function readBrandInfo(file: string = core.brandFile('brand.json')): BrandInfo {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`The brand pack is not usable: ${path.relative(core.ROOT, file)} could not be read (${(e as Error).message}). Set BRAND_DIR to a folder under brands/.`);
  }
  const series = raw.series && typeof raw.series === 'object' && !Array.isArray(raw.series)
    ? Object.entries(raw.series as Record<string, { name?: unknown }>).map(([key, s]) => ({ key, name: text(s?.name, key) }))
    : [];
  const tz = text(raw.timezone, 'UTC');
  const mark = (raw.logos as { mark?: unknown } | undefined)?.mark;
  let logoMarkFile: string | null = null;
  if (typeof mark === 'string' && mark.endsWith('.png')) {
    const abs = core.repoPath(mark);
    const inside = path.relative(core.ROOT, abs);
    if (!inside.startsWith('..') && !path.isAbsolute(inside) && fs.existsSync(abs)) logoMarkFile = abs;
  }
  const m = raw.money as { local?: unknown; foreign?: unknown } | undefined;
  return {
    name: text(raw.name, 'Vesk'),
    website: text(raw.website, ''),
    tagline: text(raw.tagline, ''),
    timezone: validTimeZone(tz) ? tz : 'UTC',
    series,
    logoMarkFile,
    money: typeof m?.foreign === 'string' && m.foreign ? { local: typeof m.local === 'string' ? m.local : '', foreign: m.foreign } : null,
  };
}

// The brand in force. It starts as the configured pack's and is replaced by syncBrand (services/brand-settings.ts) when the
// brand in the database changes.
let cached: BrandInfo | undefined;
export const brandInfo = (): BrandInfo => (cached ??= readBrandInfo());
export const setBrandInfo = (info: BrandInfo): void => { cached = info; };
