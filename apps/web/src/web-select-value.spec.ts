// What a SelectField hands Radix (web/src/lib/select-value.ts): a "none" option travels as a word of its own, and an empty value
// without one stays empty so the placeholder shows ("Choose a field", "Add a condition").
import { describe, expect, it } from 'vitest';
import { fromSelectValue, toSelectValue } from '../web/src/lib/select-value';

describe('a select\'s value', () => {
  it('shows the placeholder for an empty value when no option is "none"', () => {
    expect(toSelectValue('', [{ value: 'a' }, { value: 'b' }])).toBe('');
  });
  it('selects the "none" option for an empty value when there is one, and reads it back as empty', () => {
    const v = toSelectValue('', [{ value: '' }, { value: 'a' }]);
    expect(v).not.toBe('');
    expect(fromSelectValue(v)).toBe('');
    expect(toSelectValue('a', [{ value: '' }, { value: 'a' }])).toBe('a');
    expect(fromSelectValue('a')).toBe('a');
  });
});
