// pagecover: profile picture and cover images for the social pages (profile, facebook, linkedin, x). Fixed layouts on the white
// ground in the brand type; the words come from the brand file (tagline, descriptor, website).
import { esc, fmt, taglineMarkup } from './common.mjs';

export function pagecover(spec, ctx) {
  const b = ctx.brand, logo = (h) => `<img src="${b.logoFullSrc}" alt="" style="height:${h}px;display:block">`;
  const tag = fmt(taglineMarkup(b.tagline)).replace(/<span class="gold">/g, '<em>').replace(/<\/span>/g, '</em>');
  const line = esc(b.descriptor.replace(/\.$/, '')), url = esc(b.website);
  const k = spec.kind;
  let h = '';
  if (k === 'profile') h = `<div class="pc"><img src="${b.logoMarkSrc}" alt="" style="position:absolute;height:580px;left:50%;top:50%;transform:translate(-50%,-50%)"></div>`;
  if (k === 'facebook') h = `<div class="pc"><div class="col" style="left:0;right:0;top:62px;height:500px;flex-direction:column;align-items:center;justify-content:center;text-align:center">${logo(66)}
<div class="h" data-role="headline" style="font-weight:var(--hw);font-size:104px;line-height:1;letter-spacing:-.034em;margin-top:34px;white-space:nowrap">${tag}</div>
<div class="sub" data-role="sub" style="font-size:34px;line-height:1.25;margin-top:24px">${line}</div>
<div class="url" data-role="url" style="font-size:28px;margin-top:20px">${url}</div></div></div>`;
  if (k === 'linkedin') h = `<div class="pc"><div class="col" style="left:560px;right:90px;top:20px;height:270px;align-items:center;gap:56px">${logo(48)}
<div class="h" data-role="headline" style="font-weight:var(--hw);font-size:76px;line-height:1;letter-spacing:-.034em;white-space:nowrap">${tag}</div>
<div style="margin-left:auto"><div class="sub" data-role="sub" style="font-size:30px;line-height:1.25;max-width:420px">${line}</div><div class="url" data-role="url" style="font-size:24px;margin-top:10px">${url}</div></div></div></div>`;
  if (k === 'x') h = `<div class="pc"><div class="col" style="left:440px;right:90px;top:105px;height:290px;flex-direction:column;justify-content:center;align-items:flex-start">${logo(48)}
<div class="h" data-role="headline" style="font-weight:var(--hw);font-size:80px;line-height:1;letter-spacing:-.034em;margin-top:24px;white-space:nowrap">${tag}</div>
<div class="sub" data-role="sub" style="font-size:29px;line-height:1.25;margin-top:16px">${line}</div>
<div class="url" data-role="url" style="font-size:24px;margin-top:10px">${url}</div></div></div>`;
  return { body: h };
}
