// The soft look's test copy (sample = normal pages, stress = the longest copy that holds, minimal = the least a post of each kind needs).
// Fictional: Emberwell Coffee.
export const NORMAL = {
  'soft/statement/0': { label: 'The roastery', headline: 'Small batches, *roasted slowly.*', sub: 'Twelve kilos at a time, tasted at every stage and packed within days.' },
  'soft/statement/1': { label: 'Myths vs facts', headline: 'Roasting is guesswork. *We measure every batch.*', sub: 'Time, temperature and weight are logged on every roast, so any batch can be repeated.' },
  'soft/figure/0': { label: 'In numbers', big: '12', unit: 'kg per batch', sub: 'Our roaster holds twelve kilos and we never fill it past that, so every crack gets heard.' },
  'soft/list/0': { label: 'Process', headline: 'How we roast, in four steps', items: ['Sort and weigh the green beans', 'Roast twelve kilos, never more', 'Cool fast, then rest for three days', 'Cup every batch before it ships'] },
  'soft/quote/0': { label: 'Our view', quote: 'A good roast does not shout. It lets the bean speak, and it never hides a flaw behind the colour of the crust.', by: 'Emberwell house notes', avatar: { image: 'design/assets/demo/object-jar.jpg' } },
  'soft/photo/0': { label: 'Winter menu', headline: 'Winter filter coffee is back on the bar', sub: 'A washed Ethiopian lot, roasted light and brewed slowly.', tag: 'New' },
  'soft/photo/1': { label: 'From the roaster', headline: 'Straight from the *drum*, into your hands', sub: 'Roasted on Monday, in your cup by Friday.', tag: 'Fresh' },
  'soft/event/0': { label: 'Event', headline: 'Cupping evening: six roasts, one table', meta: '12 Dec · 6pm · The roastery', sub: 'Twelve seats, so book early.' },
  'soft/offer/0': { label: 'The house blend', headline: 'Ember No. 1, our everyday house blend', tag: '£9.50', sub: 'Chocolate, hazelnut and orange peel. 250 g.' },
};
export const STRESS = {
  'soft/statement/0': { label: 'Roastery and the small batch', headline: 'We roast a dozen kilos at a time and *bin the batches that miss*', sub: 'Twelve kilos at a time, tasted at every stage and packed within days. If a batch misses the mark, it never leaves.' },
  'soft/statement/1': { label: 'Myths vs facts about coffee', headline: 'More heat means more flavour. *Heat must be measured.*', sub: 'Time, temperature and weight are logged on every roast, so any batch can be repeated and nothing is guessed at.' },
  'soft/figure/0': { label: 'In numbers, every batch', big: '1,250 kg', unit: 'roasted per week here', sub: 'Our roaster holds twelve kilos and we never fill it past that. Smaller loads heat evenly.' },
  'soft/list/0': { label: 'Process, step by step', headline: 'How we roast every batch, in five steps', items: ['Sort and weigh the green beans by density', 'Roast twelve kilos, never a gram over', 'Cool fast on the tray, rest for three days', 'Cup every single batch before it ships', 'Pack within a week, roast date on every bag'] },
  'soft/quote/0': { label: 'Our view on roasting', quote: 'A good roast does not shout. It lets the bean speak, and it never hides a flaw behind the colour of the crust. Roast lighter, taste harder, be honest.', by: 'Emberwell house notes, winter 2026' },
  'soft/photo/0': { label: 'Winter menu on the bar', headline: 'Winter filter coffee is back on the bar, and brighter', sub: 'A washed Ethiopian lot, roasted light and brewed slowly through paper, with a long finish like plums.', tag: 'New in' },
  'soft/photo/1': { label: 'From the roaster, daily', headline: 'Straight from the *drum*, into your hands this same week', sub: 'Roasted on Monday, in your cup by Friday, with the date on every bag.', tag: 'Just in' },
  'soft/event/0': { label: 'Event at the roastery now', headline: 'Cupping evening: taste six roasts side by side', meta: '12 Dec · 6pm · The roastery, Unit 4', sub: 'Taste six roasts with the people who made them. Twelve seats, so book early.' },
  'soft/offer/0': { label: 'The house blend, weekly', headline: 'Ember No. 1, our everyday house blend, in a bigger bag', tag: '£9.50 / 250 g', sub: 'Chocolate, hazelnut and orange peel. Free delivery on three bags or more.' },
};
export const MINIMAL = {
  'soft/statement/0': { headline: 'Hello' },
  'soft/statement/1': { headline: 'Old way. *New way.*' },
  'soft/figure/0': { big: '7' },
  'soft/list/0': { headline: 'Three', items: ['One', 'Two', 'Three'] },
  'soft/quote/0': { quote: 'Said' },
  'soft/photo/0': { headline: 'Look' },
  'soft/photo/1': { headline: 'Look' },
  'soft/event/0': { headline: 'Night', meta: '12 Dec' },
  'soft/offer/0': { headline: 'Half', tag: '-50%' },
};
