// Pixel sizes and the spacing that goes with each. Story keeps the top 270 px and bottom 350 px clear of the
// Instagram story interface; the others use ordinary margins.
export const SIZES = {
  feed: { name: 'feed', w: 1080, h: 1350, pad: 70, top: 80, fbot: 56, logoH: 32, url: 30 },
  wide: { name: 'wide', w: 1200, h: 675, pad: 56, top: 52, fbot: 40, logoH: 24, url: 22 },
  story: { name: 'story', w: 1080, h: 1920, pad: 72, top: 270, fbot: 350, logoH: 34, url: 30 },
  square: { name: 'square', w: 1080, h: 1080, pad: 72, top: 72, fbot: 56, logoH: 32, url: 28 },
};
// Page covers are not post sizes; only the page-cover template uses them.
export const COVER_SIZES = {
  profile: { name: 'profile', w: 1080, h: 1080, pad: 0, top: 0, fbot: 0, logoH: 0, url: 0 },
  facebook: { name: 'facebook', w: 1640, h: 624, pad: 24, top: 24, fbot: 0, logoH: 0, url: 0 },
  linkedin: { name: 'linkedin', w: 2256, h: 382, pad: 24, top: 16, fbot: 0, logoH: 0, url: 0 },
  x: { name: 'x', w: 1500, h: 500, pad: 24, top: 16, fbot: 0, logoH: 0, url: 0 },
};
export const SIZE_NAMES = Object.keys(SIZES);
export const DEFAULT_SIZES = ['feed'];

// Height of the logo pill in the footer: padding .36 each side plus the logo itself.
export const pillHeight = (logoH) => Math.round(logoH * 1.72);
// Bottom edge of the free content area, above the footer.
export const contentBottom = (s) => s.h - s.fbot - pillHeight(s.logoH) - 40;
