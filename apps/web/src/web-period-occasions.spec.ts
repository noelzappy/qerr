// "This period" in Draft with AI (period-occasions.ts) and the batch's seasonal and tool notes (ai-draft-note.ts).
import { describe, expect, it } from 'vitest';
import { addOwn, addWeb, chipDate, chosenOccasions, fromCalendar, mergeCalendar, ownProblem, removeChip, toggle, type CalendarOccasion } from '../web/src/pages/batches/period-occasions';
import { seasonalLines, toolLines } from '../web/src/lib/ai-draft-note';

const CAL: CalendarOccasion[] = [
  { id: 'christmas-2026-12-25', name: 'Christmas Day', date: '2026-12-25', kind: 'holiday', note: 'A public holiday.' },
  { id: 'winter-2026-12-01', name: 'Winter', date: '2026-12-01', end: '2027-02-28', kind: 'season', note: 'Short days.' },
];

describe('this period: occasions as chips', () => {
  it('ticks the calendar\'s by default, and the brief gets the ticked ones only', () => {
    let chips = fromCalendar(CAL);
    expect(chips.every((c) => c.ticked && c.origin === 'calendar')).toBe(true);
    chips = toggle(chips, 'cal:winter-2026-12-01');
    expect(chosenOccasions(chips)).toEqual([{ name: 'Christmas Day', kind: 'holiday', origin: 'calendar', date: '2026-12-25', note: 'A public holiday.' }]);
  });

  it('adds up to five of the person\'s own, each a short text, never twice', () => {
    let chips = fromCalendar(CAL);
    expect(ownProblem(chips, '  ')).toMatch(/Type/);
    expect(ownProblem(chips, 'x'.repeat(81))).toMatch(/80 characters/);
    expect(ownProblem(chips, 'christmas day')).toMatch(/already/);
    for (let i = 1; i <= 5; i++) chips = addOwn(chips, `Our fair ${i}`);
    expect(ownProblem(chips, 'One more')).toMatch(/up to 5/);
    expect(addOwn(chips, 'One more')).toBe(chips);
    expect(chosenOccasions(chips).filter((o) => o.origin === 'own')).toHaveLength(5);
    expect(removeChip(chips, 'own:our fair 1').filter((c) => c.origin === 'own')).toHaveLength(4);
    expect(removeChip(chips, 'cal:christmas-2026-12-25')).toHaveLength(chips.length);
  });

  it('adds web finds unticked, with their source, and keeps them and the person\'s choices when the dates change', () => {
    let chips = addWeb(fromCalendar(CAL), [
      { name: 'Winter Lights', date: '2026-12-04', kind: 'observance', note: 'Lights.', source: 'https://visit.example/' },
      { name: 'Christmas Day', date: '2026-12-25', kind: 'observance', note: 'Again.', source: 'https://x.example/' },
    ]);
    const web = chips.filter((c) => c.origin === 'web');
    expect(web).toEqual([expect.objectContaining({ name: 'Winter Lights', ticked: false, source: 'https://visit.example/' })]);
    chips = toggle(toggle(chips, web[0]!.key), 'cal:christmas-2026-12-25');
    expect(chosenOccasions(chips).map((o) => o.name)).toEqual(['Winter', 'Winter Lights']);
    const next = mergeCalendar(chips, [...CAL, { id: 'nye-2026-12-31', name: "New Year's Eve", date: '2026-12-31', kind: 'observance', note: 'x' }], { from: '2026-12-01', to: '2026-12-31' });
    expect(next.map((c) => [c.name, c.ticked])).toEqual([['Christmas Day', false], ['Winter', true], ["New Year's Eve", true], ['Winter Lights', true]]);
    expect(mergeCalendar(chips, [], { from: '2027-01-01', to: '2027-01-31' })).toEqual([]);
    expect(chipDate({ date: '2026-12-25' })).toBe('25 Dec');
    expect(chipDate({ date: '2026-12-01', end: '2027-02-28' })).toBe('1 Dec – 28 Feb');
  });
});

describe('the batch\'s seasonal note', () => {
  it('lists each occasion with its date and the posts planned around it; the tools say what they searched and found', () => {
    const notes = {
      seasonal: { occasions: [{ name: 'Christmas Day', date: '2026-12-25' }, { name: 'Winter Lights', date: '2026-12-04', end: '2026-12-31', source: 'https://visit.example/' }], used: [{ postId: '01-xmas', occasion: 'Christmas Day' }] },
      tools: { searches: [{ tool: 'search_facts', query: 'savings day', results: 1 }, { tool: 'search_web', query: 'events', results: 3 }], foundOnTheWeb: [{ title: 'Market', sourceUrl: 'https://news.example/', citedBy: ['02-market'] }] },
    };
    expect(seasonalLines(notes)).toEqual(['Christmas Day (25 Dec): 01-xmas', 'Winter Lights (4 Dec – 31 Dec), from the web: no post']);
    expect(toolLines(notes)).toEqual(['Searched the facts once and the web once: "savings day", "events"', 'Found on the web, waiting in Facts to be confirmed: Market (https://news.example/), used by 02-market']);
    expect(seasonalLines({})).toEqual([]);
    expect(toolLines({})).toEqual([]);
  });
});
