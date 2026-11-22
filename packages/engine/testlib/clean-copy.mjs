// The clean look's test copy (sample = normal pages, stress = the longest copy that holds, minimal = the least a post of each kind needs).
// Fictional: a savings group app (the demo brand, Acme Savings). No real organisation, person or amount.
export const NORMAL = {
  'clean/statement/0': { label: 'How it works', headline: 'Save together, *see every step.*', sub: 'Every deposit is recorded the moment it is made, so the whole group sees the same balance.' },
  'clean/statement/1': { label: 'Myths vs facts', headline: 'Saving needs a bank account. *A phone is enough.*', sub: 'The collector records each deposit and every member gets a receipt by message.' },
  'clean/figure/0': { label: 'The numbers', big: '3,900+', unit: 'members saving weekly', sub: 'Groups in twelve towns now keep their records in the app instead of a paper book.' },
  'clean/list/0': { label: 'Getting started', headline: 'Start a group in *four steps*', items: ['Name the group and its goal', 'Invite the members by phone', 'Choose a collector', 'Record the first deposit'] },
  'clean/quote/0': { label: 'In their words', quote: 'We used to argue about the book every month. Now everyone sees the same numbers, and the meeting takes ten minutes.', by: 'Treasurer of a market group' },
  'clean/photo/0': { label: 'Every deposit', headline: 'Every coin, *on record.*', sub: 'One place for the group’s savings, open to every member.', tag: 'New' },
  'clean/photo/1': { label: 'Saving together', headline: 'Watch the jar fill, *week by week*', sub: 'Small amounts, saved together, add up.', tag: 'Weekly' },
  'clean/event/0': { label: 'Open evening', headline: 'Meet the team behind *your savings*', meta: '12 Dec · 6pm · The community hall', sub: 'Bring your questions. Forty seats, so register early.' },
  'clean/offer/0': { label: 'Group plan', headline: 'The group plan, *free for the first year*', tag: '£0', sub: 'For groups of up to thirty members. No card needed.' },
};
export const STRESS = {
  'clean/statement/0': { label: 'How the group account works', headline: 'Every member sees the same balance, *the moment money moves in*', sub: 'Every deposit is recorded the moment it is made, so the whole group sees the same balance and nobody keeps a book.' },
  'clean/statement/1': { label: 'Myths vs facts about saving', headline: 'Group saving is hard to track. *Each deposit is receipted.*', sub: 'The collector records each deposit, every member gets a receipt by message and the balance is open to all.' },
  'clean/figure/0': { label: 'The numbers, this year', big: '14.8M+', unit: 'saved by members', sub: 'Groups in twelve towns now keep their records in the app instead of a paper book.' },
  'clean/list/0': { label: 'Getting started, in steps', headline: 'Start a saving group in *five easy steps*', items: ['Name the group and the goal it saves for', 'Invite the members with their phone numbers', 'Choose the collector who records deposits', 'Record the very first deposit together', 'Share the balance at the next meeting'] },
  'clean/quote/0': { label: 'In their own words', quote: 'We used to argue about the book every month. Now everyone sees the same numbers, the meeting takes ten minutes and nobody wonders where the money went.', by: 'Treasurer of a market group, 2026' },
  'clean/photo/0': { label: 'Every single deposit', headline: 'Every coin your group saves, *on record for all*', sub: 'One place for the group’s savings, open to every member, with a receipt for each deposit.', tag: 'New in' },
  'clean/photo/1': { label: 'Saving together, weekly', headline: 'Watch the jar fill, *week by week, together*', sub: 'Small amounts, saved together, add up to something real.', tag: 'Weekly' },
  'clean/event/0': { label: 'Open evening at the hall', headline: 'Meet the people who keep *your savings safe*', meta: '12 Dec · 6pm · Community hall, Room 2', sub: 'Bring your questions and your group. Forty seats, so register early.' },
  'clean/offer/0': { label: 'The group plan, this year', headline: 'The group plan, *free for the whole first year*', tag: '£0 / year', sub: 'For groups of up to thirty members. No card needed, cancel any time.' },
};
export const MINIMAL = {
  'clean/statement/0': { headline: 'Hello' },
  'clean/statement/1': { headline: 'Old way. *New way.*' },
  'clean/figure/0': { big: '7' },
  'clean/list/0': { headline: 'Three', items: ['One', 'Two', 'Three'] },
  'clean/quote/0': { quote: 'Said' },
  'clean/photo/0': { headline: 'Look' },
  'clean/photo/1': { headline: 'Look' },
  'clean/event/0': { headline: 'Night', meta: '12 Dec' },
  'clean/offer/0': { headline: 'Half', tag: '-50%' },
};

// The sparklines the Number page draws under its figure when a post brings a chart (test-design-chart-render.mjs). Round, illustrative.
export const CHARTS = {
  'clean/figure/0': [
    { kind: 'spark', series: [1200, 1650, 1500, 2100, 2600, 2450, 3100, 3900].map((value) => ({ value })) },
    { highlight: 'min', series: [2.1, 2.4, 2.2, 3.9, 4.6, 5.2, 6.8, 7.1, 9.4, 11.2, 12.9, 14.8].map((value) => ({ value })) },
  ],
};
