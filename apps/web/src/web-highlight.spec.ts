// The headline's Highlight button: wrapping, unwrapping and the cases where it does nothing.
import { describe, expect, it } from 'vitest';
import { insertIcon, toggleHighlight, togglePill } from '../web/src/pages/batches/editor/highlight';

describe('togglePill and insertIcon', () => {
  it('wraps one to three selected words in [[brackets]] and takes them off again', () => {
    expect(togglePill('Coffee on us today', 7, 12)).toEqual({ text: 'Coffee [[on us]] today', start: 9, end: 14 });
    expect(togglePill('Coffee [[on us]] today', 7, 16)).toEqual({ text: 'Coffee on us today', start: 7, end: 12 });
    expect(togglePill('Coffee [[on us]] today', 9, 14)).toEqual({ text: 'Coffee on us today', start: 7, end: 12 });
  });
  it('does nothing for an empty selection, four words or a selection holding a mark', () => {
    expect(togglePill('Coffee', 2, 2)).toBeNull();
    expect(togglePill('one two three four', 0, 18)).toBeNull();
    expect(togglePill('a *b* c', 0, 7)).toBeNull();
  });
  it('puts an icon mark at the caret with a space where it touches a word', () => {
    expect(insertIcon('New blend', 3, 'star')).toEqual({ text: 'New {{star}} blend', start: 12, end: 12 });
    expect(insertIcon('New', 0, 'star')).toEqual({ text: '{{star}} New', start: 9, end: 9 });
  });
});

describe('toggleHighlight', () => {
  it('wraps the selected words and keeps them selected', () => {
    expect(toggleHighlight('Pay out the pot', 12, 15)).toEqual({ text: 'Pay out the *pot*', start: 13, end: 16 });
  });
  it('takes the asterisks off a selection that is exactly *words*', () => {
    expect(toggleHighlight('Pay out the *pot*', 12, 17)).toEqual({ text: 'Pay out the pot', start: 12, end: 15 });
  });
  it('takes the asterisks off when the selection sits directly inside them', () => {
    expect(toggleHighlight('Pay out the *pot*', 13, 16)).toEqual({ text: 'Pay out the pot', start: 12, end: 15 });
  });
  it('does nothing when nothing is selected', () => {
    expect(toggleHighlight('Pay out the pot', 4, 4)).toBeNull();
    expect(toggleHighlight('Pay out the pot', 3, 4)).toBeNull();
  });
  it('works at both ends of the text', () => {
    expect(toggleHighlight('Pay out', 0, 3)).toEqual({ text: '*Pay* out', start: 1, end: 4 });
    expect(toggleHighlight('Pay out', 4, 7)).toEqual({ text: 'Pay *out*', start: 5, end: 8 });
    expect(toggleHighlight('Pay', 0, 3)).toEqual({ text: '*Pay*', start: 1, end: 4 });
  });
  it('leaves spaces at the edge of the selection outside the asterisks', () => {
    expect(toggleHighlight('Pay out now', 3, 8)).toEqual({ text: 'Pay *out* now', start: 5, end: 8 });
  });
  it('refuses a selection that holds asterisks without framing a pair', () => {
    expect(toggleHighlight('a *b* c', 0, 4)).toBeNull();
    expect(toggleHighlight('a *b* c', 3, 7)).toBeNull();
  });
});
