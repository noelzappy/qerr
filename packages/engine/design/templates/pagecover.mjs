// The page covers' drawing helpers: profile picture and cover images for the social pages (profile, facebook, linkedin, x), drawn
// by lib/design/layout-cover.mjs from their layouts (lib/design/builtin/photo.mjs) on the white ground in the brand type; the
// words come from the brand file (tagline, descriptor, website).
import { esc, fmt, taglineMarkup } from './common.mjs';

// The brand's words as a cover sets them: its full logo at a height h (a number the caller computed), its tagline (the part
// after the first comma as the accent), its descriptor without the closing full stop, and its website.
export function coverWords(b) {
  return {
    logo: (h) => `<img src="${b.logoFullSrc}" alt="" style="height:${h}px;display:block">`,
    tag: fmt(taglineMarkup(b.tagline)).replace(/<span class="gold">/g, '<em>').replace(/<\/span>/g, '</em>'),
    line: esc(b.descriptor.replace(/\.$/, '')),
    url: esc(b.website),
  };
}
// The brand's mark, centred on (cx, cy) in % of the page, h px high (numbers the caller computed).
export const coverMark = (b, { h, cx, cy }) => `<img src="${b.logoMarkSrc}" alt="" style="position:absolute;height:${h}px;left:${cx}%;top:${cy}%;transform:translate(-50%,-50%)">`;
// The tagline, the descriptor and the website, each at a size and with a margin above it (numbers the caller computed).
export const coverTag = (w, { size, gap }) => `<div class="h" data-role="headline" style="font-weight:var(--hw);font-size:${size}px;line-height:1;letter-spacing:-.034em;${gap === undefined ? '' : `margin-top:${gap}px;`}white-space:nowrap">${w.tag}</div>`;
export const coverLine = (w, { size, gap, maxw }) => `<div class="sub" data-role="sub" style="font-size:${size}px;line-height:1.25;${gap === undefined ? '' : `margin-top:${gap}px`}${maxw === undefined ? '' : `max-width:${maxw}px`}">${w.line}</div>`;
export const coverUrl = (w, { size, gap }) => `<div class="url" data-role="url" style="font-size:${size}px;margin-top:${gap}px">${w.url}</div>`;
