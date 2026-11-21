// screen: a real product screen, shown the way the website shows it.
//   device "phone" (default): a pre-framed phone capture (the phone is already drawn into the transparent image), as it is, with
//     the website's drop shadow. Text on the left, the whole phone on the right, both centred on the page. With `beside`, a
//     passbook card lies next to the phone on the panel and the phone runs off the bottom of the page.
//   device "desktop": a desktop screenshot in the website's window chrome (or as it is, with `framed: true`), on the panel under
//     the headline and sub line; `region` zooms on the top-left part of a wide capture.
import { passbookSvg, svgBox } from './artefacts.mjs';
import { desktopWindow, footer, glow, head, obj, page, panel, panelTopFor, phone, textBlock } from './editorial.mjs';

// The phone's width on the page. A 660 px wide capture (the website's) is shown at 0.71x, well under the 1.3x enlargement limit.
export const PHONE_W = 470;
export const PHONE_BESIDE_W = 430;
// The content band between the running head and the footer, where the phone and its text are centred.
const BAND = { top: 126, bottom: 1240 };
// fade: the text across the top, the phone centred under it, cut and faded out above the footer (the website's product wells).
export const PHONE_FADE_W = 620;
const FADE = { top: 600, bottom: 1236 };
// A capture's height over its width (the website's phones are 660 x 1354).
const ratioOf = (ctx, spec) => { const d = ctx.imageSize?.(spec.image); return d && d.w > 0 ? d.h / d.w : 1354 / 660; };
const withGlow = (spec) => spec.glow !== false;

function phonePage(spec, ctx) {
  if (spec.beside) {
    const top = panelTopFor(70, Boolean(spec.sub)), y = top + 50, b = spec.beside;
    const pw = 380, ph = 500, pad = 28;
    const sheet = obj(70, y, pw, ph, 'card', svgBox(pad, pad, pw - 2 * pad, ph - 2 * pad, passbookSvg(pw - 2 * pad, ph - 2 * pad, { days: b.days ?? 31, ticked: b.ticked ?? 0, today: b.today ?? 0, tick: b.tick ?? 'ink' })));
    const body = head(ctx, spec) + textBlock({ headline: spec.headline, sub: spec.sub, size: 70, w: 940, subW: 900 }) + panel(top) + sheet
      + phone(ctx, spec, { w: PHONE_BESIDE_W, at: { x: 1010 - PHONE_BESIDE_W, y } }) + footer(ctx, { label: '', spec, onPanel: true });
    return page(ctx, spec, { body });
  }
  if (spec.fade) {
    const h = FADE.bottom - FADE.top, x = (1080 - PHONE_FADE_W) / 2;
    const text = textBlock({ headline: spec.headline, size: 70, w: 940, sub: spec.sub, subW: 900, pills: spec.pills, checks: spec.checks });
    const g = withGlow(spec) ? glow(ctx, { x, y: FADE.top, w: PHONE_FADE_W, h: Math.min(h, PHONE_FADE_W * ratioOf(ctx, spec)) }) : '';
    return page(ctx, spec, { body: g + head(ctx, spec) + text + phone(ctx, spec, { w: PHONE_FADE_W, at: { x, y: FADE.top }, cut: h }) + footer(ctx, { label: '', spec }) });
  }
  const text = `<div style="flex:1;min-width:0">`
    + textBlock({ headline: spec.headline, size: 70, w: 430, sub: spec.sub, subW: 430, flow: true, pills: spec.pills, checks: spec.checks }) + '</div>';
  // The phone sits at the right of the row, centred in the band; the glow is drawn behind that place.
  const ph = PHONE_W * ratioOf(ctx, spec), py = BAND.top + (BAND.bottom - BAND.top - ph) / 2;
  // Shifted right by the glow's inset, so its blur stays off the text column.
  const g = withGlow(spec) ? glow(ctx, { x: 1010 - PHONE_W + ctx.brand.glow.inset * ctx.brand.scale, y: py, w: PHONE_W, h: ph }) : '';
  const row = `<div class="abs" style="left:70px;top:${BAND.top}px;width:940px;height:${BAND.bottom - BAND.top}px;display:flex;align-items:center;gap:40px">${text}${phone(ctx, spec, { w: PHONE_W })}</div>`;
  return page(ctx, spec, { body: g + head(ctx, spec) + row + footer(ctx, { label: '', spec }) });
}

function desktopPage(spec, ctx) {
  const top = panelTopFor(70, Boolean(spec.sub));
  const win = desktopWindow(ctx, spec, { w: 940, framed: spec.framed === true, title: spec.title, tilt: spec.tilt === true, region: spec.region });
  const stack = `<div class="stack" style="left:70px;top:${top + 48}px;width:940px;gap:32px">${win}</div>`;
  const body = head(ctx, spec) + textBlock({ headline: spec.headline, sub: spec.sub, size: 70, w: 940, subW: 900 }) + panel(top) + stack + footer(ctx, { label: '', spec, onPanel: true });
  return page(ctx, spec, { body });
}

export const screen = (spec, ctx) => ((spec.device ?? 'phone') === 'desktop' ? desktopPage(spec, ctx) : phonePage(spec, ctx));
