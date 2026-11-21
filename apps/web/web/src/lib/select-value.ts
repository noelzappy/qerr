// The value a Radix Select holds for a SelectField's value. Radix cannot hold an item whose value is the empty string, so a
// "none" option travels as a word of its own; an empty value with no "none" option stays empty, so the placeholder shows.
const EMPTY = '__none__';
export const toSelectValue = (value: string, options: Array<{ value: string }>): string => (value === '' ? (options.some((o) => o.value === '') ? EMPTY : '') : value);
export const fromSelectValue = (v: string): string => (v === EMPTY ? '' : v);
