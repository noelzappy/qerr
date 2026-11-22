import { describe, expect, it } from 'vitest';
import { cardFontFamily, ensureFamily, fontUrl } from '../web/src/pages/settings/looks/settings/load-fonts';

describe('look font loading', () => {
  it('encodes the family in the file url', () => {
    expect(fontUrl('Space Grotesk', 'a b.woff2')).toBe('/api/settings/looks/fonts/Space%20Grotesk/a%20b.woff2');
  });
  it('puts the panel alias first and strips quotes and backslashes', () => {
    expect(cardFontFamily("Fra'un\\ces")).toMatch(/^'Look Fraunces', Georgia/);
    expect(cardFontFamily('Inter')).toBe("'Look Inter', 'Helvetica Neue', Arial, sans-serif");
  });
  it('is a no-op without FontFace', () => {
    expect(() => ensureFamily({ family: 'Inter', minWeight: 400, maxWeight: 700, italic: false, stretch: false, files: [{ file: 'a.woff2', style: 'normal', weight: '400', range: 'U+0000-00FF' }] })).not.toThrow();
  });
});
