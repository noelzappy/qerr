import { describe, expect, it } from 'vitest';
import { aiImport, engineImport } from './server/engine/root.js';
import { CALENDAR_COUNTRIES, COUNTRY_CODES, countryForZone, countryName, countryOptions } from '../web/src/lib/countries';

describe('countries for the brand', () => {
  it('offers exactly the engine\'s codes, and names the calendar\'s countries as the AI library does', async () => {
    const engine = await engineImport<{ COUNTRY_CODES: string[] }>('countries');
    expect([...COUNTRY_CODES]).toEqual([...engine.COUNTRY_CODES]);
    const ai = await aiImport<{ OCCASION_COUNTRIES: string[] }>();
    expect([...CALENDAR_COUNTRIES]).toEqual(ai.OCCASION_COUNTRIES);
    expect(countryName('IE')).toBe('Ireland');
    const options = countryOptions();
    expect(options).toHaveLength(249);
    expect(options.find((o) => o.value === 'GH')?.label).toBe('Ghana');
  });

  it('fills the country in from a time zone that belongs to one country, and leaves the rest to the person', () => {
    const cases: Record<string, string> = {
      'Europe/Dublin': 'IE', 'Africa/Accra': 'GH', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Johannesburg': 'ZA', 'Europe/London': 'GB',
      'America/New_York': 'US', 'America/Indiana/Indianapolis': 'US', 'America/Toronto': 'CA', 'Asia/Kolkata': 'IN', 'Australia/Sydney': 'AU',
      'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Amsterdam': 'NL', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
    };
    for (const [zone, cc] of Object.entries(cases)) expect(countryForZone(zone), zone).toBe(cc);
    for (const zone of ['UTC', 'Etc/GMT+1', '', null, 'Mars/Olympus']) expect(countryForZone(zone)).toBeNull();
    for (const cc of CALENDAR_COUNTRIES) expect(COUNTRY_CODES).toContain(cc);
  });
});
