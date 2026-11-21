// pagecover: profile picture and cover images for the social pages (profile, facebook, linkedin, x). Fixed layouts on the white
// ground in the brand type; the words come from the brand file (tagline, descriptor, website).
//
// UNUSED: the page covers are drawn from their layouts (lib/design/builtin/photo.mjs, drawn by lib/design/layout-cover.mjs with
// the helpers exported here). The function stays until every template is converted (testlib/CONVERTING.md).
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

export function pagecover(spec, ctx) {
  const b = ctx.brand, w = coverWords(b), logo = w.logo;
  const k = spec.kind;
  let h = '';
  if (k === 'profile') h = `<div class="pc">${coverMark(b, { h: 580, cx: 50, cy: 50 })}</div>`;
  if (k === 'facebook') h = `<div class="pc"><div class="col" style="left:0;right:0;top:62px;height:500px;flex-direction:column;align-items:center;justify-content:center;text-align:center">${logo(66)}
${coverTag(w, { size: 104, gap: 34 })}
${coverLine(w, { size: 34, gap: 24 })}
${coverUrl(w, { size: 28, gap: 20 })}</div></div>`;
  if (k === 'linkedin') h = `<div class="pc"><div class="col" style="left:560px;right:90px;top:20px;height:270px;align-items:center;gap:56px">${logo(48)}
${coverTag(w, { size: 76 })}
<div style="margin-left:auto">${coverLine(w, { size: 30, maxw: 420 })}${coverUrl(w, { size: 24, gap: 10 })}</div></div></div>`;
  if (k === 'x') h = `<div class="pc"><div class="col" style="left:440px;right:90px;top:105px;height:290px;flex-direction:column;justify-content:center;align-items:flex-start">${logo(48)}
${coverTag(w, { size: 80, gap: 24 })}
${coverLine(w, { size: 29, gap: 16 })}
${coverUrl(w, { size: 24, gap: 10 })}</div></div>`;
  return { body: h };
}
