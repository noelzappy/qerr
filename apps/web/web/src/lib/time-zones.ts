// The one list of time zones the panel offers (Brand and look, New batch), and the small rules the time zone picker uses: the zone this
// browser is in, a zone's city, its offset and its time now, a short list of likely zones, and a search over every zone by city.
// Pure, so it is specced without a browser (src/web-time-zones.spec.ts).

// What the panel offers when the browser cannot list its zones (an old browser): a few, and always UTC.
const FALLBACK = ['Africa/Lagos', 'Africa/Nairobi', 'America/New_York', 'Asia/Singapore', 'Australia/Sydney', 'Europe/Berlin', 'Europe/London', 'UTC'];

function listZones(): string[] {
  let zones: string[] = [];
  try { zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { zones = []; }
  const base = zones.length ? zones : FALLBACK;
  return base.includes('UTC') ? base : [...base, 'UTC'];
}

// Every zone, in the browser's order (alphabetical), with UTC in it.
export const ALL_TIME_ZONES: readonly string[] = listZones();

// The zone this browser is set to, or '' when it does not say.
export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
}

// "Europe/London" is London; "America/Argentina/Buenos_Aires" is Buenos Aires, Argentina; "UTC" stays UTC.
export function zoneCity(zone: string): string {
  const parts = zone.split('/').map((p) => p.replace(/_/g, ' '));
  if (parts.length === 1) return parts[0]!;
  const city = parts[parts.length - 1]!;
  return parts.length > 2 ? `${city}, ${parts[parts.length - 2]}` : city;
}

// The zone's offset from UTC at `at`, as people read it: GMT, GMT+1, GMT-3:30. '' when the browser cannot tell.
export function zoneOffset(zone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName');
    const v = part?.value ?? '';
    return v === 'UTC' || v === 'GMT+0' || v === 'GMT-0' ? 'GMT' : v;
  } catch { return ''; }
}

// The time on the clock in that zone at `at`, as 14:20. '' for a zone the browser does not know.
export function zoneTime(zone: string, at: Date = new Date()): string {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at); } catch { return ''; }
}

// A zone written in full for a button or a list: "London · GMT+1".
export const zoneLabel = (zone: string, at: Date = new Date()): string => [zoneCity(zone), zoneOffset(zone, at)].filter(Boolean).join(' · ');

// The few zones worth offering before anyone types: the one chosen now, this browser's, other places on the browser's clock (its own region
// first), then UTC. At most `max`, none twice, only zones that exist.
export function likelyZones({ current, detected, all = ALL_TIME_ZONES, at = new Date(), max = 6 }: { current?: string; detected?: string; all?: readonly string[]; at?: Date; max?: number }): string[] {
  const out: string[] = [];
  const add = (z: string | undefined) => { if (z && !out.includes(z) && (all.includes(z) || z === current) && out.length < max) out.push(z); };
  add(current);
  add(detected);
  if (detected) {
    const offset = zoneOffset(detected, at);
    const region = detected.split('/')[0];
    const same = all.filter((z) => z !== detected && z.includes('/') && zoneOffset(z, at) === offset);
    for (const z of [...same.filter((z) => z.split('/')[0] === region), ...same.filter((z) => z.split('/')[0] !== region)]) {
      if (out.length >= max - 1) break;
      add(z);
    }
  }
  if (out.length < max) add('UTC');
  return out;
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[_/,]+/g, ' ').replace(/\s+/g, ' ').trim();

// Zones whose city, region or full name contains every word typed, or whose offset is the one typed ("gmt+1"); cities that start with the
// words first. At most `max`.
export function searchZones(query: string, { all = ALL_TIME_ZONES, at = new Date(), max = 50 }: { all?: readonly string[]; at?: Date; max?: number } = {}): string[] {
  const q = fold(query);
  if (!q) return [];
  const words = q.split(' ');
  const offsetQuery = /^(gmt|utc)\s*[+-]?\d/.test(q) ? q.replace(/\s+/g, '').replace(/^utc/, 'gmt') : '';
  const hits: Array<{ z: string; rank: number }> = [];
  for (const z of all) {
    const city = fold(zoneCity(z));
    const name = fold(z);
    if (offsetQuery) {
      if (fold(zoneOffset(z, at)).replace(/\s+/g, '') === offsetQuery) hits.push({ z, rank: 2 });
      continue;
    }
    if (!words.every((w) => name.includes(w) || city.includes(w))) continue;
    hits.push({ z, rank: city.startsWith(q) ? 0 : city.includes(q) ? 1 : 2 });
  }
  return hits.sort((a, b) => a.rank - b.rank || a.z.localeCompare(b.z)).slice(0, max).map((h) => h.z);
}
