// The fixed set of icons a post may show: inline in a headline ({{name}}, see post-spec.mjs) or on a button (the button primitive). Pure
// data, shipped with the engine: each icon is one SVG path on a 24 x 24 grid, filled in the colour of the text it sits in (even-odd fill, so a
// ring or a hole needs no second path). A post, a look or a brand names an icon only by one of these names; no SVG, path or URL ever comes
// from data, and the markup is written by the kit (kit.mjs iconSvg) from this table alone.
export const ICONS = Object.freeze({
  'arrow-right': { label: 'Arrow right', d: 'M4 11h12.2l-4.6-4.6L13 5l7 7-7 7-1.4-1.4 4.6-4.6H4z' },
  'arrow-up-right': { label: 'Arrow up and right', d: 'M7 5h12v12h-2V8.4L6.4 19 5 17.6 15.6 7H7z' },
  check: { label: 'Tick', d: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z' },
  plus: { label: 'Plus', d: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z' },
  star: { label: 'Star', d: 'M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z' },
  spark: { label: 'Spark', d: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z' },
  heart: { label: 'Heart', d: 'M12 20.5S3 15 3 9.2C3 6.3 5.2 4 7.9 4c1.7 0 3.2.9 4.1 2.3C12.9 4.9 14.4 4 16.1 4 18.8 4 21 6.3 21 9.2c0 5.8-9 11.3-9 11.3z' },
  bolt: { label: 'Lightning', d: 'M13 2 4 14h6l-1 8 9-12h-6z' },
  leaf: { label: 'Leaf', d: 'M20 4c-9.5 0-15 4.6-15 11.2 0 1.6.4 3.1 1 4.4l1.7-.9c-.3-.6-.5-1.2-.6-1.9C11.4 16 15 12.6 17 8.5 14.6 12 11.4 14.3 7.3 15.3 8 9.4 12.4 6 20 6z' },
  calendar: { label: 'Calendar', d: 'M7 2h2v2h6V2h2v2h3v17H4V4h3zM6 9v10h12V9z' },
  clock: { label: 'Clock', d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v6.6l4.9 2.9 1-1.7-3.9-2.3V7z' },
  pin: { label: 'Place', d: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z' },
  ticket: { label: 'Ticket', d: 'M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z' },
  tag: { label: 'Price tag', d: 'M3 3h8.6l9.4 9.4-8.6 8.6L3 11.6zm4.5 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z' },
  gift: { label: 'Gift', d: 'M3 8h8v4H3zm10 0h8v4h-8zM4 13h7v8H4zm9 0h7v8h-7zM8.5 3C10 3 11.3 4.6 12 7 9.6 7 7 6.7 7 4.7 7 3.7 7.6 3 8.5 3zm7 0c.9 0 1.5.7 1.5 1.7 0 2-2.6 2.3-5 2.3.7-2.4 2-4 3.5-4z' },
  phone: { label: 'Phone', d: 'M6.6 2.5 10 6.2 8 8.9a12.5 12.5 0 0 0 7.1 7.1l2.7-2 3.7 3.4-2.2 3.1C10.8 20 4 13.2 3.5 4.7z' },
  mail: { label: 'Mail', d: 'M3 5h18v14H3zm2 2.4 7 4.6 7-4.6V7H5zm0 2.4V17h14V9.8l-7 4.6z' },
  user: { label: 'Person', d: 'M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 10.5c4.4 0 8 2.2 8 5V21H4v-2.5c0-2.8 3.6-5 8-5z' },
  play: { label: 'Play', d: 'M7 4v16l13-8z' },
  dot: { label: 'Dot', d: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z' },
  // a padlock with a keyhole, and a shield with a tick (trust and security posts): the hole and the tick are cut out by the even-odd fill
  lock: { label: 'Padlock', d: 'M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10zm2 0h6V7a3 3 0 0 0-6 0zm2 4v4h2v-4z' },
  shield: { label: 'Shield', d: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm-1.2 13.6-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4z' },
  // a bowl of rice with chopsticks (the sticker of a food post): the shapes never overlap, so the even-odd fill leaves no hole
  bowl: { label: 'Bowl of rice', d: 'M5 9.5a7 3.5 0 0 1 14 0zM3 10.5h18a9 8.5 0 0 1-18 0zM9 19.4h6V21H9zM15.6 4.4 21.6.4l.8 1.2-6 4zM17.2 5.6 22.9 2.2l.7 1.2-5.7 3.4z' },
});
export const ICON_NAMES = Object.freeze(Object.keys(ICONS));
// What a path may hold: SVG path commands and numbers only (test-design-look-parts.mjs holds every entry to it).
export const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/;
