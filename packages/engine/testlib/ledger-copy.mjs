// The ledger look's test copy (sample = normal pages, stress = the longest copy that holds, minimal = the least a post of each kind needs).
// Fictional: a savings app that works in euros. No real organisation, person or amount; the figures are round and illustrative.
// PICTURES: what each composition that draws a picture is given (the engine's synthetic demo pictures; the phone page takes the pre-framed
// phone capture).
export const PICTURES = {
  'ledger/photo/0': { image: 'design/assets/demo/screen-phone.png' },
  'ledger/photo/1': { image: 'design/assets/demo/object-jar.jpg' },
};
const GALLERY = [{ image: 'design/assets/demo/object-jar.jpg' }, { image: 'design/assets/demo/scene-market.jpg' }];
export const NORMAL = {
  'ledger/statement/0': { label: 'How it works', headline: 'Save together, see every euro.', sub: 'One shared pot for your group, with every payment on record.', cta: 'Start a pot' },
  'ledger/statement/1': { label: 'Your money, protected', headline: 'Every payment, *on record for all.*', sub: 'Each member sees the same balance and every payment, the moment it is made.' },
  'ledger/figure/0': { label: 'The numbers', big: '€2,400', tag: '+12%', unit: 'saved per group', sub: 'The average pot after one year of weekly saving. Illustrative figure.' },
  'ledger/figure/1': { label: 'Group pot', big: '€1,250', tag: '+€50', unit: 'this week', sub: 'Ten members, €5 each, every Friday. An illustrative example.' },
  'ledger/figure/2': { big: '1', headline: 'Name your group and *its goal.*', sub: 'A holiday, a laptop, a rainy-day fund: say what you are saving for.' },
  'ledger/list/0': { headline: 'Everything your group *needs to save.*', items: ['One shared pot', 'Every payment on record', 'Reminders on pay day'], cta: 'See how it works' },
  'ledger/list/1': { label: 'How it works', headline: 'Start a group in three steps', items: ['Name the group and its goal', 'Invite the members', 'Agree the amount and the day'] },
  'ledger/quote/0': { label: 'Group organiser', quote: 'We stopped arguing about who paid. *Now everyone just looks.*', by: 'Ama, saves with five friends', gallery: GALLERY },
  'ledger/photo/0': { label: 'New in the app', headline: 'See the pot fill, *week by week.*', sub: 'Every payment, the moment it lands.', cta: 'Get the app' },
  'ledger/photo/1': { headline: 'Small amounts, *saved together.*', sub: 'One place for the group’s savings, open to every member.', tag: 'Weekly', cta: 'Start saving' },
  'ledger/event/0': { label: 'Live session', headline: 'Ask us anything about *group saving*', meta: '12 Dec · 6pm · Online', cta: 'Save a seat' },
  'ledger/offer/0': { headline: 'Groups of up to twenty save', tag: '€0 fees', sub: 'Free for small groups, for the whole first year.', cta: 'Start a group' },
};
export const STRESS = {
  'ledger/statement/0': { label: 'How the group pot works', headline: 'Every member sees the same balance, the moment money moves in', sub: 'One shared pot for your group, with every payment on record and a reminder on each pay day.', cta: 'Start a group pot today' },
  'ledger/statement/1': { label: 'Your money, protected', headline: 'Every payment your group makes, *on record for everyone*', sub: 'Each member sees the same balance and every payment, the moment it is made, with a receipt for each one.' },
  'ledger/figure/0': { label: 'The numbers, this year', big: '€14,800', tag: '+12.5%', unit: 'saved per group a year', sub: 'The average pot after one year of weekly saving, across all groups. Illustrative figure.' },
  'ledger/figure/1': { label: 'The group pot this month', big: '€12,500', tag: '+€250', unit: 'added this month', sub: 'Twenty members, €12.50 each, every Friday of the month. An illustrative example.' },
  'ledger/figure/2': { big: '3', headline: 'Agree the amount and *the day you all save*', sub: 'Pick an amount everyone can manage and the day it goes in. Change it together any time.' },
  'ledger/list/0': { headline: 'Everything your group needs *to save together*', items: ['One shared pot for the group', 'Every payment on record', 'A reminder on every pay day', 'A receipt for each payment', 'Leave the group any time'], cta: 'See how it all works' },
  'ledger/list/1': { label: 'How it works, step by step', headline: 'Start a saving group in five easy steps', items: ['Name the group and its goal', 'Invite the members by phone', 'Agree the amount and the day', 'Make the very first payment', 'Watch the pot grow each week'] },
  'ledger/quote/0': { label: 'Group organiser since 2026', quote: 'We used to argue about who had paid. Now everyone sees the same numbers, the meeting takes ten minutes and nobody wonders where the money went.', by: 'Ama, saves with five friends', gallery: GALLERY },
  'ledger/photo/0': { label: 'New in the app this week', headline: 'Watch your group pot fill, week by week', sub: 'Every payment shows up the moment it lands in the pot.', cta: 'Get the app' },
  'ledger/photo/1': { headline: 'Small amounts, saved together, *add up to more*', sub: 'One place for the group’s savings, open to every member, with a receipt for each payment.', tag: 'Every week', cta: 'Start saving today' },
  'ledger/event/0': { label: 'Live session, online', headline: 'Ask our team anything about *saving as a group*', meta: '12 Dec · 6pm · Online, link by email', cta: 'Save your seat now' },
  'ledger/offer/0': { headline: 'Groups of up to twenty members save', tag: '3 months free', sub: 'Free for small groups for the first three months. No card needed, leave any time.', cta: 'Start a group today' },
};
export const MINIMAL = {
  'ledger/statement/0': { headline: 'Hello' },
  'ledger/statement/1': { headline: 'Safe' },
  'ledger/figure/0': { big: '7' },
  'ledger/figure/1': { big: '€7' },
  'ledger/figure/2': { big: '1', headline: 'Start' },
  'ledger/list/0': { headline: 'Three', items: ['One', 'Two', 'Three'] },
  'ledger/list/1': { headline: 'Steps', items: ['One', 'Two'] },
  'ledger/quote/0': { quote: 'Said' },
  'ledger/photo/0': { headline: 'Look' },
  'ledger/photo/1': { headline: 'Look' },
  'ledger/event/0': { headline: 'Night', meta: '12 Dec' },
  'ledger/offer/0': { headline: 'Half', tag: '€0' },
};

// The charts the Big number page draws when a post brings one (test-design-chart-render.mjs): bars, an area and a line of the months behind the
// figure. Round, illustrative euros.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
const months = (vals) => vals.map((value, i) => ({ label: MONTHS[i], value }));
export const CHARTS = {
  'ledger/figure/0': [
    { kind: 'bar', unit: 'currency', highlight: 'last', series: months([1450, 1600, 1720, 1980, 2150, 2400]) },
    { kind: 'area', unit: 'currency', series: [{ label: 'Q1', value: 3100 }, { label: 'Q2', value: 6900 }, { label: 'Q3', value: 10200 }, { label: 'Q4', value: 14800 }] },
    { kind: 'line', unit: 'currency', highlight: 'max', series: months([9800, 10450, 11200, 11900, 12600, 13300, 14050, 14800]) },
    { unit: 'currency', series: months([800, 1200, 2400]) },
  ],
};
