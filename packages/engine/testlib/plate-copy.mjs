// The plate look's test copy (sample = normal pages, stress = the longest copy that holds, minimal = the least a post of each kind needs).
// Fictional: Salt & Ember, a grill restaurant in an invented city (brands/saltandember). Prices are round, illustrative and in euros; the
// chef quoted is an invented name. No real organisation, person, place or amount.
// PICTURES: the pack's own drawn pictures (brands/saltandember/make-assets.mjs), by kind, for the pages that take one.
export const PICTURES = {
  photo: 'brands/saltandember/pictures/steak.jpg', 'photo/1': 'brands/saltandember/pictures/grill.jpg',
  event: 'brands/saltandember/pictures/embers.jpg', offer: 'brands/saltandember/pictures/plate.jpg',
};
// PHOTOS: licensed photographs for the contact sheets (design/assets/photos/, git-ignored; credits in CREDITS.md there). Used only where present.
export const PHOTOS = {
  photo: 'design/assets/photos/scout-embers-and-flames-close.jpg', 'photo/1': 'design/assets/photos/scout-grilled-vegetables-over-charcoal.jpg',
  event: 'design/assets/photos/scout-steaks-on-grill-over-coals.jpg', offer: 'design/assets/photos/scout-grilled-steak-vegetables-plate.jpg',
};
export const NORMAL = {
  'plate/statement/0': { label: 'From the fire', headline: 'Cooked over wood, *served after dark.*', sub: 'Every cut meets the fire slowly. Tables from six, every evening.' },
  'plate/statement/1': { label: 'The kitchen', headline: 'Salt, smoke and *time.*', sub: 'Three things we never rush. The rest is the work of the fire.' },
  'plate/figure/0': { label: 'Brisket', big: '12', unit: 'hour smoke', sub: 'Our brisket goes over oak at dawn and comes off the fire just before service.' },
  'plate/list/0': { label: 'This week', headline: 'From the *grill*', items: ['Bone marrow, sourdough · €14', 'Flat iron steak · €28', 'Charred leeks, hazelnut · €12', 'Ember-baked potato · €8'], sub: 'Bread and cultured butter to start, on the house.' },
  'plate/quote/0': { label: 'The kitchen', quote: 'Fire is the oldest cook in the room. Our job is to *listen to it* and never hurry the meat.', by: 'Tomas Reyne, head chef' },
  'plate/photo/0': { label: 'From the fire', headline: 'Oak, ember and *patience*', sub: 'The grill is lit at dawn and the coals are ready by the first table.' },
  'plate/photo/1': { label: 'On the grill', headline: 'Mushrooms and peppers, *charred*' },
  'plate/event/0': { label: 'Book a table', headline: 'A *fire-cooked* tasting menu', meta: 'Fridays in December', info: [{ key: 'When', value: 'Fridays in December, 19:30' }, { key: 'Where', value: 'Salt & Ember, Cindervale' }, { key: 'Book on', value: 'saltandember.example' }], cta: 'Reserve a table' },
  'plate/event/1': { label: 'Supper club', headline: 'A long table *by the fire*', meta: '18 Dec · 19:00 · Cindervale', info: [{ key: 'Where', value: 'The back room, Salt & Ember' }, { key: 'Price', value: '€60 a guest, wine extra' }], cta: 'Book a seat' },
  'plate/offer/0': { label: 'Tonight\'s special', headline: 'Rib eye from the grill, *with frites*', tag: '€32', cta: 'Reserve tonight' },
};
export const STRESS = {
  'plate/statement/0': { label: 'From the fire, every night', headline: 'Cooked slowly over wood and *served long after dark.*', sub: 'Every cut meets the fire slowly and rests before it reaches you. Tables from six, every evening.' },
  'plate/statement/1': { label: 'Notes from the kitchen', headline: 'Salt, smoke and a great deal of *patient time.*', sub: 'Three things we never rush in this kitchen. The rest is the work of the fire.' },
  'plate/figure/0': { label: 'The brisket, every day', big: '12 h', unit: 'over oak, low and slow', sub: 'Our brisket goes over oak at dawn and comes off the fire just before the first table sits down.' },
  'plate/list/0': { label: 'From the grill this week', headline: 'From the *grill*, this week', items: ['Bone marrow, sourdough, parsley · €14', 'Flat iron steak, aged thirty days · €28', 'Charred leeks, hazelnut, brown butter · €12', 'Ember-baked potato, sour cream · €8', 'Smoked cream, burnt honey · €9'], sub: 'Bread and cultured butter to start, on the house.' },
  'plate/quote/0': { label: 'Notes from the kitchen', quote: 'Fire is the oldest cook in the room. Our job is to *listen to it*, to feed it oak and patience, and never to hurry the meat.', by: 'Tomas Reyne, head chef since day one' },
  'plate/photo/0': { label: 'From the fire, every night', headline: 'Oak, ember and a great deal of *patience*', sub: 'The grill is lit at dawn, fed with oak all day, and the coals are ready long before the first table.' },
  'plate/photo/1': { label: 'On the grill this week', headline: 'Mushrooms and sweet peppers, *charred*' },
  'plate/event/0': { label: 'Book a table this month', headline: 'A *fire-cooked* tasting menu, six courses', meta: 'Every Friday in December', info: [{ key: 'When', value: 'Every Friday in December, from 19:30' }, { key: 'Where', value: 'Salt & Ember, Cindervale' }, { key: 'Book on', value: 'saltandember.example/tables' }], cta: 'Reserve a table now' },
  'plate/event/1': { label: 'The supper club, monthly', headline: 'One long table, *by the fire*', meta: '18 Dec · 19:00 · The back room', info: [{ key: 'Where', value: 'The back room, Salt & Ember' }, { key: 'Price', value: '€60 a guest, wine to match extra' }, { key: 'Starts', value: 'Doors at 18:30, dinner at 19:00' }], cta: 'Book a seat at the table' },
  'plate/offer/0': { label: 'Tonight\'s special, only', headline: 'Rib eye from the grill with *frites and greens*', tag: '€32 a plate', cta: 'Reserve a table tonight' },
};
export const MINIMAL = {
  'plate/statement/0': { headline: 'Fire' },
  'plate/statement/1': { headline: 'Smoke' },
  'plate/figure/0': { big: '12' },
  'plate/list/0': { headline: 'Grill', items: ['Steak · €28', 'Leeks · €12'] },
  'plate/quote/0': { quote: 'Patience' },
  'plate/photo/0': { headline: 'Steak' },
  'plate/photo/1': { headline: 'Leeks' },
  'plate/event/0': { headline: 'Dinner', meta: 'Fridays' },
  'plate/event/1': { headline: 'Supper', meta: '18 Dec' },
  'plate/offer/0': { headline: 'Rib eye', tag: '€32' },
};
