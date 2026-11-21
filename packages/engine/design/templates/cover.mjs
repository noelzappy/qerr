// cover: the photo-led opening page of a carousel. The photo sits inside the margins with the card radius and a 1 px line, the
// headline under it, then the sub line. "Swipe →" in the footer when it is page 1 of a carousel.
// UNUSED: the cover is drawn from its layout (lib/design/builtin/editorial.mjs). This function stays, unused, until every
// template is converted (testlib/CONVERTING.md); test-design-builtin-editorial.mjs compares the layout with it.
import { footer, head, obj, page, photoWindow, textBlock } from './editorial.mjs';

export function cover(spec, ctx) {
  const ph = 714;
  const print = obj(70, 126, 940, ph, 'photo', photoWindow(ctx, spec, { x: 0, y: 0, w: 940, h: ph }));
  const w = 940;
  const body = head(ctx, spec, { rule: false }) + print + textBlock({ y: 126 + ph + 56, size: 84, headline: spec.headline, sub: spec.sub, w, subW: 900 }) + footer(ctx, { spec });
  return page(ctx, spec, { body });
}
