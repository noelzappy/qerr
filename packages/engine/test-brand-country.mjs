// brand.json "country": optional, and when set an ISO 3166-1 alpha-2 code in capitals (lib/countries.mjs).
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/core.mjs';
import { validateBrand } from './lib/design/brand.mjs';
import { COUNTRY_CODES, isCountryCode } from './lib/countries.mjs';

const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'brands/demo/brand.json'), 'utf8'));
const countryErrors = (country) => validateBrand({ ...demo, country }).filter((e) => /country/.test(e));

test('brand country: absent is fine, a known code passes, anything else is refused', () => {
  assert.deepEqual(countryErrors(undefined), []);
  for (const c of ['IE', 'GH', 'NG', 'US', 'ZA']) assert.deepEqual(countryErrors(c), [], c);
  for (const c of ['ie', 'IRL', 'XX', 'UK', 'EU', '', 12, null]) assert.equal(countryErrors(c).length, 1, String(c));
});

test('brand country: the list is the 249 assigned codes, two capital letters each', () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.ok(COUNTRY_CODES.every((c) => /^[A-Z]{2}$/.test(c)));
  assert.ok(isCountryCode('GB') && !isCountryCode('UK'));
});

test('brand country: the Pennyhive pack is set in Ireland and passes', () => {
  const penny = JSON.parse(fs.readFileSync(path.join(ROOT, 'brands/pennyhive/brand.json'), 'utf8'));
  assert.equal(penny.country, 'IE');
  assert.deepEqual(countryErrors(penny.country), []);
});
