// The currency list editor's conversion (web/src/pages/settings/brand/currency.ts) between the engine's regex source and a plain list.
import { describe, expect, it } from 'vitest';
import { CURRENCY_PATTERN_MAX, buildCurrencyPattern, currencyListProblem, parseCurrencyPattern } from '../web/src/pages/settings/brand/currency';

describe('currency pattern conversion', () => {
  it('reads a stored pattern as a list of words', () => {
    expect(parseCurrencyPattern('\\$|£|€')).toEqual(['$', '£', '€']);
    expect(parseCurrencyPattern('USD|dollars')).toEqual(['USD', 'dollars']);
    expect(parseCurrencyPattern('a\\-b|c\\/d')).toEqual(['a-b', 'c/d']);
  });

  it('refuses a pattern that is more than a plain list', () => {
    for (const p of ['\\bUSD\\b', '(a|b)', 'US.', '', 'a||b', '|a', 'a|', '\\d+', '\\s', '\\w', 'a\\', '[abc]', 'x*']) expect(parseCurrencyPattern(p), JSON.stringify(p)).toBeNull();
  });

  it('escapes what would otherwise be a pattern, and round-trips', () => {
    expect(buildCurrencyPattern(['$'])).toBe('\\$');
    expect(buildCurrencyPattern(['a.b'])).toBe('a\\.b');
    expect(buildCurrencyPattern(['(x)'])).toBe('\\(x\\)');
    for (const words of [['$', '£', '€'], ['a.b', '(x)', 'US$'], ['dollars', 'a-b', 'c/d'], ['a\\b', '[x]', '{y}', '^z', 'q?']]) {
      const p = buildCurrencyPattern(words);
      expect(parseCurrencyPattern(p)).toEqual(words);
      expect(buildCurrencyPattern(parseCurrencyPattern(p)!)).toBe(p);
    }
  });

  it('trims and drops empty and case-insensitive duplicate words', () => {
    const p = buildCurrencyPattern([' USD ', 'usd', '', '  ', 'Dollars', 'DOLLARS', '€']);
    expect(parseCurrencyPattern(p)).toEqual(['USD', 'Dollars', '€']);
  });

  it('keeps a typed "a|b" as one word', () => {
    const p = buildCurrencyPattern(['a|b']);
    expect(p).toBe('a\\|b');
    expect(parseCurrencyPattern(p)).toEqual(['a|b']);
    const re = new RegExp(p, 'i');
    expect(re.test('a|b')).toBe(true);
    expect(re.test('a')).toBe(false);
  });

  it('builds a pattern that matches each word as typed, without regard to case', () => {
    const words = ['$', '£', 'US$', 'a.b', '(x)', 'dollars', 'a|b', '[k]', 'c+d'];
    const re = new RegExp(buildCurrencyPattern(words), 'i');
    for (const w of words) expect(re.test(`pay ${w} now`), w).toBe(true);
    expect(re.test('DOLLARS')).toBe(true);
    expect(re.test('axb')).toBe(false);
  });

  it('says in plain words what is wrong with a list', () => {
    expect(currencyListProblem([])).toBe('Add at least one currency word or symbol');
    expect(currencyListProblem(['  ', ''])).toBe('Add at least one currency word or symbol');
    expect(currencyListProblem(['$', 'USD'])).toBe('');
    const long = Array.from({ length: 40 }, (_, i) => `currency${i}xxxx`);
    expect(buildCurrencyPattern(long).length).toBeGreaterThan(CURRENCY_PATTERN_MAX);
    expect(currencyListProblem(long)).toBe('The list is too long: remove a few words');
  });
});
