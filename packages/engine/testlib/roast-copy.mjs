// The roast look's test copy (sample = normal pages, stress = the longest copy that holds, minimal = the least a post of each kind needs).
// Fictional: Kettleworks Coffee, a neighbourhood roaster in an invented town (brands/kettleworks). Prices are round, illustrative and in euros;
// the regular quoted is an invented name. No real organisation, person, place or amount.
// PICTURES: the pack's own drawn pictures (brands/kettleworks/make-assets.mjs), by kind, for the pages that take one.
export const PICTURES = {
  photo: 'brands/kettleworks/pictures/latte-top.jpg', 'photo/1': 'brands/kettleworks/pictures/beans.jpg', offer: 'brands/kettleworks/pictures/mug.jpg',
};
// PHOTOS: licensed photographs for the contact sheets (design/assets/photos/, git-ignored; credits in CREDITS.md there). Used only where present.
export const PHOTOS = {
  photo: 'design/assets/photos/scout-latte-leaf-art-top-wood.jpg', 'photo/1': 'design/assets/photos/scout-roasted-coffee-beans-pile.jpg',
  offer: 'design/assets/photos/scout-latte-white-cup-dark-wood.jpg',
};
export const NORMAL = {
  'roast/statement/0': { label: 'Roastery notes', headline: 'Roasted round the corner, *poured with care.*', sub: 'Small batches every Thursday, from the drum to your cup within the week.' },
  'roast/statement/1': { label: 'New this week', headline: 'Fresh beans [[every Thursday]]', sub: 'Bags of the new roast are on the counter from eight.', cta: 'See the beans' },
  'roast/figure/0': { label: 'Rested', big: '48 h', unit: 'after every roast', sub: 'Our beans rest for two days before they reach the grinder, so every cup tastes settled.' },
  'roast/list/0': { label: 'On the menu', headline: 'The *morning* board', items: ['Espresso · €2', 'Flat white · €3', 'Oat latte · €4', 'Filter of the day · €3'], sub: 'Oat, soy or whole milk, at no extra cost.' },
  'roast/list/1': { label: 'Pastries', headline: 'Something *on the side*', items: ['Cinnamon bun · €3', 'Butter croissant · €2', 'Banana bread · €3'] },
  'roast/quote/0': { label: 'Regulars', quote: 'I come for the flat white and stay for the *people*. It is the best ten minutes of my morning.', by: 'Maren, a regular since spring' },
  'roast/photo/0': { label: 'Drink of the week', headline: 'Honey oat latte, *warm and slow*', tag: '€4' },
  'roast/photo/1': { label: 'Roastery notes', headline: 'Every bean, *roasted by hand*', sub: 'We roast twice a week in small batches, a few streets from the counter.' },
  'roast/event/0': { label: 'Winter hours', headline: 'Our *winter* hours', meta: 'From 1 December · Kettle Lane', info: [{ key: 'Open', value: 'Every day, 7:00 to 18:00' }, { key: 'When', value: 'From 1 December' }, { key: 'Where', value: '12 Kettle Lane, Brookmere' }], cta: 'Find us' },
  'roast/event/1': { label: 'Tasting night', headline: 'A *tasting* night at the roastery', meta: '12 Dec · 19:00 · The roastery', info: [{ key: 'Where', value: 'The roastery, Kettle Lane' }, { key: 'Entry', value: '€10, a coffee included' }], cta: 'Book a seat' },
  'roast/offer/0': { label: 'Stamp card', headline: 'Your tenth cup *is on us*', tag: 'Free', sub: 'Collect a stamp with every coffee. Ask for a card at the counter.' },
  'roast/offer/1': { headline: 'A latte before nine, *half price*', tag: '€2', sub: 'Every weekday morning until nine, in a cup or to take away.' },
};
export const STRESS = {
  'roast/statement/0': { label: 'Notes from the roastery', headline: 'Roasted round the corner every week, *poured with a lot of care.*', sub: 'Small batches every Thursday, from the drum to your cup within the week, and never a bag older than a month.' },
  'roast/statement/1': { label: 'New on the counter now', headline: 'Fresh beans from the drum [[every Thursday]]', sub: 'Bags of the new roast are on the counter from eight, while they last, ground to order.', cta: 'See the new beans' },
  'roast/figure/0': { label: 'Rested beans', big: '48 hrs', unit: 'rest after every roast', sub: 'Our beans rest for two days before they reach the grinder, so every single cup tastes settled.' },
  'roast/list/0': { label: 'On the menu every morning', headline: 'The *morning* board, all day', items: ['Espresso, single or double · €2', 'Flat white with whole milk · €3', 'Oat latte with house espresso · €4', 'Filter coffee of the day · €3', 'Hot chocolate, made with milk · €4'], sub: 'Oat, soy or whole milk, at no extra cost.' },
  'roast/list/1': { label: 'Pastries, baked daily', headline: 'Something warm *on the side*', items: ['Cinnamon bun with brown butter · €3', 'Butter croissant, baked here · €2', 'Banana bread with walnuts · €3', 'Almond biscuit, two to a bag · €2', 'Cheese scone, warmed through · €3'] },
  'roast/quote/0': { label: 'Our regulars', quote: 'I come for the flat white and stay for the *people*. It is the best ten minutes of my morning, and they know my order before I reach the counter.', by: 'Maren, a regular since the spring' },
  'roast/photo/0': { label: 'The drink of the week', headline: 'Honey oat latte, *warm, slow and sweet*', tag: '€4 a cup' },
  'roast/photo/1': { label: 'Notes from the roastery', headline: 'Every single bean, *roasted by hand, close by*', sub: 'We roast twice a week in small batches, a few streets from the counter, and taste every one.' },
  'roast/event/0': { label: 'Our winter hours', headline: 'Our *winter* hours, from December', meta: 'From 1 December · 12 Kettle Lane', info: [{ key: 'Open', value: 'Monday to Friday, 7:00 to 18:00' }, { key: 'When', value: 'Saturday and Sunday, 8:00 to 16:00' }, { key: 'Starts', value: 'From 1 December to the end of March' }, { key: 'Where', value: '12 Kettle Lane, Brookmere' }], cta: 'Find us on the map' },
  'roast/event/1': { label: 'A night at the roastery', headline: 'A *tasting* night with the people who roast', meta: '12 Dec · 19:00 · The roastery', info: [{ key: 'Where', value: 'The roastery, 12 Kettle Lane' }, { key: 'Entry', value: '€10, with a coffee to take home' }, { key: 'Starts', value: 'Doors at 18:45, tasting at 19:00' }], cta: 'Book a seat tonight' },
  'roast/offer/0': { label: 'The Kettleworks stamp card', headline: 'Ten stamps, and your *tenth cup is on us*', tag: 'Free cup', sub: 'Collect a stamp with every coffee you buy. Ask for a card at the counter, it never runs out.' },
  'roast/offer/1': { headline: 'Any latte before nine, *half price*', tag: '€2 a cup', sub: 'Every weekday morning until nine, in a cup or to take away.' },
};
export const MINIMAL = {
  'roast/statement/0': { headline: 'Hello' },
  'roast/statement/1': { headline: 'Open' },
  'roast/figure/0': { big: '7' },
  'roast/list/0': { headline: 'Menu', items: ['Espresso · €2', 'Latte · €3'] },
  'roast/list/1': { headline: 'Bakes', items: ['Bun · €3', 'Scone · €2'] },
  'roast/quote/0': { quote: 'Lovely' },
  'roast/photo/0': { headline: 'Latte' },
  'roast/photo/1': { headline: 'Beans' },
  'roast/event/0': { headline: 'Hours', meta: 'Every day' },
  'roast/event/1': { headline: 'Tasting', meta: '12 Dec' },
  'roast/offer/0': { headline: 'Free cup', tag: 'Free' },
  'roast/offer/1': { headline: 'Latte', tag: '€2' },
};
