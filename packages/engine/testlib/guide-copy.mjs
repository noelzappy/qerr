// The guide look's test copy (sample = normal pages, stress = the longest copy that holds, minimal = the least a post of each kind needs).
// Fictional: Outabout, a what's-on guide for Tallowmere, an invented city (brands/outabout). No real organisation, person, place or
// amount. The round pictures are the engine's synthetic demo pictures.
const G = (n) => ['design/assets/demo/object-jar.jpg', 'design/assets/demo/scene-market.jpg', 'design/assets/demo/screen-desk.png'].slice(0, n).map((image) => ({ image }));
export const NORMAL = {
  'guide/statement/0': { label: 'Week 47 · 16 Nov–22 Nov', headline: 'Seven [[days]] out', sub: 'Swipe for what’s on in Tallowmere', cta: 'Swipe', gallery: G(3) },
  'guide/statement/1': { label: '10 plans · Tallowmere', headline: 'The leftovers can wait {{bowl}}', sub: '10 plans in Tallowmere that have nothing to do with dinner.', cta: 'See all', gallery: G(3) },
  'guide/figure/0': { label: 'Week 47 · 16 Nov–22 Nov', big: '10', unit: 'Plans this week', sub: 'Ten things to do this week, from padel to a rooftop film night.' },
  'guide/list/0': { label: 'Week 47 · 16 Nov–22 Nov', headline: 'This [[weekend]]', items: ['Beginner padel on the quay', 'Rooftop film night', 'Sunday book market', 'Late opening at the gallery'] },
  'guide/quote/0': { label: 'Overheard', quote: 'Came for one drink at the night market and somehow learned to play padel.', by: 'A reader, last Saturday' },
  'guide/photo/0': { label: 'Week 47', headline: 'The new spot [[your friends]] will ask about', sub: 'Stay in the know with everything happening on the quay.', cta: 'Read' },
  'guide/photo/1': { label: 'Now hiring', headline: 'We’re hiring [[interns]]', info: [{ key: 'Who', value: 'Growth and partnerships intern' }, { key: 'Starts', value: 'January' }], cta: 'outabout.example/jobs' },
  'guide/event/0': { label: 'Week 47', meta: 'Beginner social padel', headline: 'First serve', sub: 'Never held a racket? Perfect. Come play, meet people and have a laugh on court.', info: [{ key: 'When', value: 'Fri 20 Nov, 6pm' }, { key: 'Where', value: 'Quayside courts' }], cta: 'outabout.example' },
  'guide/event/1': { label: 'Listings', meta: 'Sat 21 Nov · The Old Ropeworks', headline: 'Night market on the quay', info: [{ key: 'When', value: 'Sat 21 Nov, 5pm to 11pm' }, { key: 'Entry', value: 'Free' }], cta: 'Details' },
  'guide/offer/0': { label: 'Tickets', headline: 'Rooftop [[film night]]', tag: '£12', sub: 'Blankets, popcorn and a classic on the roof.', cta: 'Book a seat' },
};
export const STRESS = {
  'guide/statement/0': { label: 'Week 47 · 16 Nov–22 Nov 2026', headline: 'Seven [[days]] out on the quay', sub: 'Swipe for everything on in Tallowmere this week', cta: 'See the plans', gallery: G(3) },
  'guide/statement/1': { label: 'Ten plans out · Tallowmere', headline: 'The leftovers in the fridge can wait {{bowl}}', sub: 'Ten plans in Tallowmere this week that have nothing at all to do with dinner.', cta: 'See them all', gallery: G(3) },
  'guide/figure/0': { label: 'Week 47 · 16 Nov–22 Nov 2026', big: '120', unit: 'Plans out this month', sub: 'Things to do across the quay, from padel to a rooftop film night and late gallery evenings.' },
  'guide/list/0': { label: 'Week 47 · 16 Nov–22 Nov 2026', headline: 'Plans for [[this weekend]] on the quay', items: ['Beginner padel on the quayside courts', 'Rooftop film night at the Old Ropeworks', 'Sunday book market under the arches', 'Late opening at the harbour gallery', 'Night swim at the lido, wetsuits on'] },
  'guide/quote/0': { label: 'Overheard on the quay', quote: 'Came for one drink at the night market, stayed for the music and somehow learned to play padel by Sunday.', by: 'A reader, last Saturday night' },
  'guide/photo/0': { label: 'Week 47 · 16 Nov–22 Nov', headline: 'The new spot on the quay [[your friends]] will all ask about', sub: 'Stay in the know with everything happening on the quay, from openings to late nights.', cta: 'Read the list' },
  'guide/photo/1': { label: 'Now hiring · two roles', headline: 'We’re hiring [[summer interns]]', info: [{ key: 'Who', value: 'Growth and partnerships intern' }, { key: 'Starts', value: 'January, three days a week' }, { key: 'Where', value: 'The studio on Ropewalk Lane' }], cta: 'Apply: outabout.example' },
  'guide/event/0': { label: 'Week 47 · 16 Nov–22 Nov', meta: 'Beginner social padel night', headline: 'First serve on the quay', sub: 'Never held a racket? Perfect. Come and play, meet new people and have a laugh on court.', info: [{ key: 'When', value: 'Fri 20 Nov, 6pm to 9pm' }, { key: 'Where', value: 'Quayside courts, court 2' }], cta: 'Book at outabout' },
  'guide/event/1': { label: 'Listings · this weekend', meta: 'Sat 21 Nov · The Old Ropeworks yard', headline: 'Night market and live music on the quay', info: [{ key: 'When', value: 'Sat 21 Nov, 5pm to 11pm' }, { key: 'Entry', value: 'Free, all ages welcome' }, { key: 'Where', value: 'The Old Ropeworks yard' }], cta: 'All details' },
  'guide/offer/0': { label: 'Tickets · this Friday', headline: 'Rooftop [[film night]] on the quay', tag: '£12.50', sub: 'Blankets, popcorn and a classic film on the roof, rain or shine.', cta: 'Book a seat now' },
};
export const MINIMAL = {
  'guide/statement/0': { headline: 'Days out' },
  'guide/statement/1': { headline: 'Leftovers' },
  'guide/figure/0': { big: '10' },
  'guide/list/0': { headline: 'Plans', items: ['Padel', 'Films'] },
  'guide/quote/0': { quote: 'Brilliant night out.' },
  'guide/photo/0': { headline: 'Talk of the town' },
  'guide/photo/1': { headline: 'We’re hiring' },
  'guide/event/0': { headline: 'First serve', meta: 'Padel' },
  'guide/event/1': { headline: 'Night market', meta: 'Sat 21 Nov' },
  'guide/offer/0': { headline: 'Film night', tag: '£12' },
};
