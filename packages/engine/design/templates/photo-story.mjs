// photo-story: a photograph and the story under it. "panel": a full-bleed photo at the top, then a label, headline and sub line
// (people in a place are a scene, never an object). "print": the headline and sub line on top, the photo as a raised card with the
// card radius on the tint panel.
// UNUSED: both variants are drawn from their layouts (lib/design/builtin/editorial.mjs). This function stays, unused, until
// every template is converted (testlib/CONVERTING.md); test-design-builtin-editorial.mjs compares the layouts with it. (A
// photo-story whose layout is not panel or print, which validateDesign refuses, still reaches it.)
import { footer, folio, head, lbl, obj, page, panel, photoWindow, styleOf, textBlock } from './editorial.mjs';

export function photoStory(spec, ctx) {
  if ((spec.layout ?? 'panel') === 'panel') {
    const st = styleOf(spec, ctx.brand), f = folio(ctx);
    const labelRow = `<div class="abs" style="left:70px;right:70px;top:784px;display:flex;justify-content:space-between">${lbl(st.label)}${f ? lbl(f) : ''}</div>`;
    const body = photoWindow(ctx, spec, { x: 0, y: 0, w: 1080, h: 756, avoid: true }) + labelRow + textBlock({ y: 840, size: 84, headline: spec.headline, sub: spec.sub, w: 940, subW: 940 }) + footer(ctx, { spec });
    return page(ctx, spec, { body });
  }
  const top = 470;
  const print = obj(70, 516, 940, 600, 'photo raised', photoWindow(ctx, spec, { x: 0, y: 0, w: 940, h: 600 }));
  const body = head(ctx, spec) + textBlock({ headline: spec.headline, sub: spec.sub, size: 70, w: 940 }) + panel(top) + print + footer(ctx, { spec, onPanel: true });
  return page(ctx, spec, { body });
}
