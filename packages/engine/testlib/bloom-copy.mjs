// The bloom look's test copy (sample = normal pages, stress = the longest copy that holds, minimal = the least a post of each kind needs).
// Fictional: Emberwell Coffee.
export const NORMAL = {
  'bloom/statement/0': { label: 'The roastery', headline: 'Small batches, *roasted slowly.*', sub: 'Twelve kilos at a time, tasted at every stage and packed within days.' },
  'bloom/statement/1': { label: 'How we work', headline: 'We taste *every batch*', sub: 'Small enough to watch closely. Big enough to keep the lights on.' },
  'bloom/figure/0': { label: 'In numbers', big: '12', unit: 'kg per batch', sub: 'Our roaster holds twelve kilos and we never fill it past that, so every crack gets heard.' },
  'bloom/list/0': { label: 'Process', headline: 'How we roast, in *four steps*', items: ['Sort and weigh the green beans', 'Roast twelve kilos, never more', 'Cool fast, then rest for three days', 'Cup every batch before it ships'] },
  'bloom/quote/0': { label: 'Our view', quote: 'A good roast does not shout. It lets the bean *speak*, and never hides a flaw behind the crust.', by: 'Emberwell house notes' },
  'bloom/photo/0': { label: 'Winter menu', headline: 'Winter filter coffee is *back on the bar*', sub: 'A washed Ethiopian lot, roasted light and brewed slowly.', tag: 'New' },
  'bloom/photo/1': { label: 'From the roaster', headline: 'Straight from the *drum*, into your hands', sub: 'Roasted on Monday, in your cup by Friday.', tag: 'Fresh' },
  'bloom/event/0': { label: 'Event', headline: 'Cupping evening: *six roasts*, one table', meta: '12 Dec · 6pm · The roastery', sub: 'Twelve seats, so book early.' },
  'bloom/offer/0': { label: 'The house blend', headline: 'Ember No. 1, our *everyday* house blend', tag: '£9.50', sub: 'Chocolate, hazelnut and orange peel. 250 g.' },
  'bloom/offer/1': { label: 'The house blend', headline: 'Ember No. 1, our *everyday* house blend', tag: '£9.50', sub: 'Chocolate, hazelnut and orange peel. 250 g.' },
};
export const STRESS = {
  'bloom/statement/0': { label: 'Roastery and the small batch', headline: 'We roast a dozen kilos at a time, taste every batch and *bin the rest*', sub: 'Twelve kilos at a time, tasted at every stage and packed within days. If a batch misses the mark, it never leaves.' },
  'bloom/statement/1': { label: 'How we work, in our words', headline: 'We taste *every single batch* we roast', sub: 'Small enough to watch closely. Big enough to keep the lights on, and never bigger.' },
  'bloom/figure/0': { label: 'In numbers, every batch', big: '1,250 kg', unit: 'roasted per week here', sub: 'Our roaster holds twelve kilos and we never fill it past that. Smaller loads heat evenly and give us time to listen to every crack.' },
  'bloom/list/0': { label: 'Process, step by step', headline: 'How we roast every batch, in *five steps*', items: ['Sort and weigh the green beans by density', 'Roast twelve kilos, never a gram over', 'Cool fast on the tray, rest for three days', 'Cup every single batch before it ships', 'Pack within a week, roast date on every bag'] },
  'bloom/quote/0': { label: 'Our view on roasting', quote: 'A good roast does not shout. It lets the bean *speak*, and it never hides a flaw behind the colour of the crust. Roast lighter, taste harder.', by: 'Emberwell house notes, winter 2026' },
  'bloom/photo/0': { label: 'Winter menu on the bar', headline: 'Winter filter coffee is *back on the bar*, and brighter than ever', sub: 'A washed Ethiopian lot, roasted light and brewed slowly through paper, with a long finish like plums.', tag: 'New in' },
  'bloom/photo/1': { label: 'From the roaster, daily', headline: 'Straight from the *drum*, into your hands this week', sub: 'Roasted on Monday, in your cup by Friday, with the date on every bag.', tag: 'Just in' },
  'bloom/event/0': { label: 'At the roastery now', headline: 'Cupping evening: taste *six roasts* side by side', meta: '12 Dec · 6pm · The roastery, Unit 4', sub: 'Taste six roasts with the people who made them. Twelve seats, so book early.' },
  'bloom/offer/0': { label: 'The house blend, weekly', headline: 'Ember No. 1, our *everyday* house blend, in a bigger bag', tag: '£9.50 / 250 g', sub: 'Chocolate, hazelnut and orange peel. Free delivery on three bags or more.' },
  'bloom/offer/1': { label: 'The house blend, weekly', headline: 'Ember No. 1, our *everyday* blend, in a bigger bag', tag: '£9.50 / 250 g', sub: 'Chocolate, hazelnut and orange peel. Free delivery on three bags or more.' },
};
export const MINIMAL = {
  'bloom/statement/0': { headline: 'Hello' },
  'bloom/statement/1': { headline: 'Go' },
  'bloom/figure/0': { big: '7' },
  'bloom/list/0': { headline: 'Three', items: ['One', 'Two', 'Three'] },
  'bloom/quote/0': { quote: 'Said' },
  'bloom/photo/0': { headline: 'Look' },
  'bloom/photo/1': { headline: 'Look' },
  'bloom/event/0': { headline: 'Night', meta: '12 Dec' },
  'bloom/offer/0': { headline: 'Half', tag: '-50%' },
  'bloom/offer/1': { headline: 'Half', tag: '-50%' },
};
