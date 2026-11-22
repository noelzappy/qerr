// The countries a brand may name (brand.json "country"), as the panel offers them, and the country a time zone most likely means, so
// the country can be filled in for the person from the time zone they already chose. Pure, so it is specced without a browser
// (src/web-countries.spec.ts, which also checks the list against the engine's own, packages/engine/lib/countries.mjs).

// ISO 3166-1 alpha-2, the codes officially assigned (the same 249 as the engine).
export const COUNTRY_CODES: readonly string[] = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI '
  + 'CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ '
  + 'GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS '
  + 'LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG '
  + 'PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK '
  + 'TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

// The countries whose holidays and observances the AI library's calendar knows (packages/ai/src/occasions.mjs); any other gets
// the global ones only.
export const CALENDAR_COUNTRIES: readonly string[] = ['GH', 'NG', 'KE', 'ZA', 'GB', 'IE', 'US', 'CA', 'IN', 'AU', 'DE', 'FR', 'NL', 'ES', 'IT'];

let names: Intl.DisplayNames | null | undefined;
// "IE" is Ireland; the code itself when the browser cannot name it.
export function countryName(code: string): string {
  if (names === undefined) { try { names = new Intl.DisplayNames(['en-GB'], { type: 'region' }); } catch { names = null; } }
  try { return names?.of(code) ?? code; } catch { return code; }
}

// Every country, by name, for a picker.
export const countryOptions = (): Array<{ value: string; label: string }> => COUNTRY_CODES.map((c) => ({ value: c, label: countryName(c) })).sort((a, b) => a.label.localeCompare(b.label, 'en-GB'));

// Time zones that belong to one country. Zones shared by several (UTC, Etc/*) or not listed give null: the person chooses.
const ZONES: Record<string, string> = {
  'Africa/Accra': 'GH', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Kampala': 'UG',
  'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kigali': 'RW', 'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN', 'Africa/Casablanca': 'MA', 'Africa/Addis_Ababa': 'ET',
  'Africa/Lusaka': 'ZM', 'Africa/Harare': 'ZW', 'Africa/Ceuta': 'ES',
  'Europe/London': 'GB', 'Europe/Belfast': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Busingen': 'DE', 'Europe/Paris': 'FR',
  'Europe/Amsterdam': 'NL', 'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Rome': 'IT', 'Europe/Lisbon': 'PT', 'Atlantic/Madeira': 'PT',
  'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR',
  'Europe/Bucharest': 'RO', 'Europe/Luxembourg': 'LU', 'Europe/Malta': 'MT',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Tokyo': 'JP', 'Asia/Singapore': 'SG', 'Asia/Hong_Kong': 'HK', 'Asia/Shanghai': 'CN',
  'Asia/Dubai': 'AE', 'Asia/Manila': 'PH', 'Asia/Jakarta': 'ID', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Seoul': 'KR', 'Asia/Bangkok': 'TH',
  'Pacific/Auckland': 'NZ', 'Pacific/Honolulu': 'US', 'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX', 'America/Bogota': 'CO',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Lima': 'PE', 'America/Jamaica': 'JM',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US',
  'America/Anchorage': 'US', 'America/Detroit': 'US', 'America/Boise': 'US', 'America/Juneau': 'US', 'America/Adak': 'US', 'America/Nome': 'US',
  'America/Sitka': 'US', 'America/Yakutat': 'US', 'America/Metlakatla': 'US', 'America/Menominee': 'US', 'America/Puerto_Rico': 'PR',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
  'America/St_Johns': 'CA', 'America/Regina': 'CA', 'America/Montreal': 'CA', 'America/Moncton': 'CA', 'America/Whitehorse': 'CA',
  'America/Yellowknife': 'CA', 'America/Iqaluit': 'CA', 'America/Glace_Bay': 'CA', 'America/Goose_Bay': 'CA', 'America/Swift_Current': 'CA',
  'America/Dawson_Creek': 'CA', 'America/Fort_Nelson': 'CA', 'America/Dawson': 'CA', 'America/Cambridge_Bay': 'CA', 'America/Rankin_Inlet': 'CA',
  'America/Resolute': 'CA', 'America/Inuvik': 'CA', 'America/Atikokan': 'CA', 'America/Creston': 'CA',
};
const PREFIXES: Array<[string, string]> = [['America/Indiana/', 'US'], ['America/Kentucky/', 'US'], ['America/North_Dakota/', 'US'], ['Australia/', 'AU']];

export function countryForZone(zone: string | null | undefined): string | null {
  if (!zone) return null;
  if (ZONES[zone]) return ZONES[zone]!;
  return PREFIXES.find(([p]) => zone.startsWith(p))?.[1] ?? null;
}

// Settings with the country filled in from the time zone when they name none (the form marks it as filled in for the person).
export function withCountryFromZone<T extends { country?: string | null; timezone: string }>(s: T): T {
  return s.country ? s : { ...s, country: countryForZone(s.timezone) };
}

// Whether a country is still the one the app filled in: none was saved and it is the time zone's.
export const countryIsFilled = (saved: string | null | undefined, current: string | null | undefined, zone: string): boolean => !saved && !!current && current === countryForZone(zone);

// A new time zone carries the country with it while the country is still the one filled in from the old zone.
export function countryAfterZoneChange(saved: string | null | undefined, current: string | null, oldZone: string, newZone: string): string | null {
  return !saved && (current === null || current === countryForZone(oldZone)) ? countryForZone(newZone) ?? current : current;
}
