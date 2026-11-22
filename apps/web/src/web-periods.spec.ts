// A batch's period as one tap (New batch, Draft with AI) and the title the dates suggest.
import { describe, expect, it } from 'vitest';
import { choiceOf, monthFrom, monthName, nextWeek, periodFor, periodLine, periodTitle, todayIn } from '../web/src/pages/batches/periods';

describe('a period as one tap', () => {
  const today = '2026-11-22'; // a Sunday
  it('offers next week (Monday to Sunday), next month and the month after', () => {
    expect(nextWeek(today)).toEqual({ from: '2026-11-23', to: '2026-11-29' });
    expect(nextWeek('2026-11-23')).toEqual({ from: '2026-11-30', to: '2026-12-06' });
    expect(periodFor('month', today)).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(periodFor('after', today)).toEqual({ from: '2027-01-01', to: '2027-01-31' });
    expect(monthFrom('2027-01-31', 1)).toEqual({ from: '2027-02-01', to: '2027-02-28' });
  });
  it('names the months, with the year when it is not this one', () => {
    expect(monthName(today, 1)).toBe('December');
    expect(monthName(today, 2)).toBe('January 2027');
  });
  it('knows which chip a range is, else Custom', () => {
    expect(choiceOf({ from: '2026-12-01', to: '2026-12-31' }, today)).toBe('month');
    expect(choiceOf({ from: '2026-11-23', to: '2026-11-29' }, today)).toBe('week');
    expect(choiceOf({ from: '2026-12-02', to: '2026-12-31' }, today)).toBe('custom');
    expect(choiceOf({ from: '', to: '' }, today)).toBe('custom');
  });
  it('suggests a batch title from the dates', () => {
    expect(periodTitle({ from: '2026-12-01', to: '2026-12-31' })).toBe('December 2026');
    expect(periodTitle({ from: '2026-11-30', to: '2026-12-06' })).toBe('Week of 30 November');
    expect(periodTitle({ from: '2026-12-08', to: '2026-12-21' })).toBe('8 to 21 December 2026');
    expect(periodTitle({ from: '2026-12-28', to: '2027-01-03' })).toBe('Week of 28 December');
    expect(periodTitle({ from: '2026-12-20', to: '2027-01-10' })).toBe('20 December 2026 to 10 January 2027');
    expect(periodTitle({ from: '', to: '2026-12-31' })).toBe('');
    expect(periodTitle({ from: '2026-12-31', to: '2026-12-01' })).toBe('');
  });
  it('spells the dates out under the chips', () => {
    expect(periodLine({ from: '2026-12-01', to: '2026-12-31' })).toBe('Tue 1 Dec – Thu 31 Dec 2026');
  });
  it("reads today in the brand's time zone", () => {
    const late = new Date('2026-11-22T23:30:00Z');
    expect(todayIn('Europe/London', late)).toBe('2026-11-22');
    expect(todayIn('Asia/Tokyo', late)).toBe('2026-11-23');
  });
});
