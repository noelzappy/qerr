// The time zone picker's rules: one list of zones, a zone's city, offset and time, the short list of likely zones and the city search.
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ALL_TIME_ZONES, likelyZones, searchZones, zoneCity, zoneLabel, zoneOffset, zoneTime } from '../web/src/lib/time-zones';
import { TimeZonePicker } from '../web/src/components/kit/time-zone-picker';

// A winter day and a summer day, so the offsets are known.
const WINTER = new Date('2026-01-15T12:00:00Z');
const SUMMER = new Date('2026-07-15T12:00:00Z');
// India's zone under the name this runtime uses (Asia/Kolkata or the older Asia/Calcutta).
const INDIA = ALL_TIME_ZONES.find((z) => z === 'Asia/Kolkata' || z === 'Asia/Calcutta')!;

describe('the one list of time zones', () => {
  it('holds every zone the runtime knows, UTC included', () => {
    expect(ALL_TIME_ZONES.length).toBeGreaterThan(300);
    expect(ALL_TIME_ZONES).toContain('Europe/London');
    expect(ALL_TIME_ZONES).toContain('UTC');
  });
});

describe('a zone written for people', () => {
  it('names the city, and the country for a three-part name', () => {
    expect(zoneCity('Europe/London')).toBe('London');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires, Argentina');
    expect(zoneCity('UTC')).toBe('UTC');
  });
  it('gives the offset as it is on that day', () => {
    expect(zoneOffset('Europe/London', WINTER)).toBe('GMT');
    expect(zoneOffset('Europe/London', SUMMER)).toBe('GMT+1');
    expect(zoneOffset('Africa/Lagos', WINTER)).toBe('GMT+1');
    expect(zoneOffset(INDIA, WINTER)).toBe('GMT+5:30');
    expect(zoneOffset('UTC', WINTER)).toBe('GMT');
    expect(zoneLabel('Europe/Lisbon', SUMMER)).toBe('Lisbon · GMT+1');
  });
  it('reads the clock in that zone', () => {
    expect(zoneTime('Europe/London', SUMMER)).toBe('13:00');
    expect(zoneTime(INDIA, WINTER)).toBe('17:30');
    expect(zoneTime('Not/AZone', WINTER)).toBe('');
  });
});

describe('the likely zones', () => {
  it('starts with the zone chosen, then this browser, then places on the same clock and UTC', () => {
    const list = likelyZones({ current: 'Africa/Lagos', detected: 'Europe/London', at: WINTER });
    expect(list[0]).toBe('Africa/Lagos');
    expect(list[1]).toBe('Europe/London');
    expect(list.at(-1)).toBe('UTC');
    expect(list.length).toBeLessThanOrEqual(6);
    // the others share London's clock that day, Europe first
    const middle = list.slice(2, -1);
    expect(middle.length).toBeGreaterThan(0);
    for (const z of middle) expect(zoneOffset(z, WINTER)).toBe('GMT');
    expect(middle[0]!.startsWith('Europe/')).toBe(true);
  });
  it('lists no zone twice and keeps a stored zone the browser does not know', () => {
    const list = likelyZones({ current: 'Europe/London', detected: 'Europe/London', at: WINTER });
    expect(new Set(list).size).toBe(list.length);
    expect(likelyZones({ current: 'Mars/Olympus', detected: '', at: WINTER })).toEqual(['Mars/Olympus', 'UTC']);
  });
});

describe('the search over every zone', () => {
  it('finds a city by part of its name, ignoring case, spaces and accents', () => {
    expect(searchZones('lisb', { at: WINTER })[0]).toBe('Europe/Lisbon');
    expect(searchZones('buenos aires', { at: WINTER }).some((z) => zoneCity(z).startsWith('Buenos Aires'))).toBe(true);
    expect(searchZones('SAO PAULO', { at: WINTER })).toContain('America/Sao_Paulo');
  });
  it('puts cities that start with the words first', () => {
    const r = searchZones('york', { at: WINTER });
    expect(r[0]).toBe('America/New_York');
  });
  it('finds every zone on an offset', () => {
    const r = searchZones('GMT+5:30', { at: WINTER });
    expect(r).toContain(INDIA);
    for (const z of r) expect(zoneOffset(z, WINTER)).toBe('GMT+5:30');
  });
  it('answers nothing for an empty search and at most the limit', () => {
    expect(searchZones('  ')).toEqual([]);
    expect(searchZones('a', { max: 5 }).length).toBe(5);
  });
});

describe('the picker', () => {
  it('is a labelled combobox showing the city, the offset and the time, not the raw name', () => {
    const html = renderToString(createElement(TimeZonePicker, { label: 'Time zone', value: 'America/Argentina/Buenos_Aires', onChange: () => {}, hint: 'Posts are planned in this time zone' }));
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('Buenos Aires, Argentina');
    expect(html).not.toContain('America/Argentina/Buenos_Aires<');
    expect(html).toMatch(/aria-describedby="[^"]+-hint"/);
  });
  it('says when the zone is the one this browser is in', () => {
    const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(renderToString(createElement(TimeZonePicker, { value: here, onChange: () => {} }))).toContain('From this browser');
    const other = here === 'Asia/Tokyo' ? 'Europe/Paris' : 'Asia/Tokyo';
    expect(renderToString(createElement(TimeZonePicker, { value: other, onChange: () => {} }))).not.toContain('From this browser');
  });
});
