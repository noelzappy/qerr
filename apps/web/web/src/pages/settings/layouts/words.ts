// The words the layout pages use for kinds of page and sizes (the engine's names are kept for the stored values only).
export const PAGE_LABEL: Record<string, string> = { grid: 'A grid of your own', poster: 'The built-in poster page', editorial: 'The built-in editorial page' };
export const PAGE_WORD: Record<string, string> = { poster: 'the poster page', editorial: 'the editorial page', photo: 'the photo post', grid: 'a grid' };
export const SIZE_SHORT: Record<string, string> = { feed: 'Feed', square: 'Square', story: 'Story', wide: 'Wide' };
export const sizeName = (z: string) => SIZE_SHORT[z] ?? z;
