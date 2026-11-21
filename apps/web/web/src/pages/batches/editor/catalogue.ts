// The built-in layouts as a person meets them: a plain name, a group and one line on what each is for.
// The engine's template names are the values; labels.ts (TEMPLATES) carries the same words.
export const LAYOUT_GROUPS = ['Posters', 'Editorial pages', 'Photo', 'Carousel'] as const;

export const LAYOUT_CATALOGUE: Array<{ value: string; group: (typeof LAYOUT_GROUPS)[number]; name: string; purpose: string }> = [
  { value: 'object', group: 'Posters', name: 'Photo under a headline', purpose: 'A styled photograph under a big headline, with one phrase in the brand colour.' },
  { value: 'number', group: 'Posters', name: 'One big figure', purpose: 'One large figure with a line under it, and an optional photo.' },
  { value: 'product', group: 'Posters', name: 'Framed phone screen', purpose: 'A headline beside a phone screenshot that already has its phone frame.' },
  { value: 'myth-fact', group: 'Posters', name: 'Myth and fact', purpose: 'A myth on a dark colour panel and the fact on a pale one.' },
  { value: 'closing', group: 'Posters', name: 'Closing page', purpose: 'The last page: the tagline, large, on the dark page.' },
  { value: 'cover', group: 'Editorial pages', name: 'Cover', purpose: 'The opening page: a photo, a headline and a sub line.' },
  { value: 'text', group: 'Editorial pages', name: 'Text', purpose: 'A big headline on its own, or with a table or card under it.' },
  { value: 'ledger', group: 'Editorial pages', name: 'Ledger table', purpose: 'A headline over a ruled table of up to 10 rows, with cells you can circle.' },
  { value: 'passbook', group: 'Editorial pages', name: 'Passbook page', purpose: 'A ruled page of days with ticks, and an optional member card beside it.' },
  { value: 'stats', group: 'Editorial pages', name: 'Figures', purpose: 'One big figure and up to three smaller figures side by side.' },
  { value: 'screen', group: 'Editorial pages', name: 'App screen', purpose: 'A headline with a screenshot of the app, on a phone or in a window.' },
  { value: 'photo-story', group: 'Editorial pages', name: 'Photo story', purpose: 'A photograph with a headline and sub line telling its story.' },
  { value: 'photo', group: 'Photo', name: 'Photo post', purpose: 'A full-page photograph with the headline over a dark fade.' },
  { value: 'carousel', group: 'Carousel', name: 'Carousel of pages', purpose: 'Two to ten pages that are swiped through, with a PDF made from them.' },
];

// The plain name of an engine template; any other value is returned as it is.
export function layoutName(value: string): string {
  return LAYOUT_CATALOGUE.find((l) => l.value === value)?.name ?? value;
}
