// What the AI designer is told about a post's picture before it composes around it: a small thumbnail (a JPEG, at most `size` px on its longer
// side) the model can look at, the picture's proportions, and the colour of its background read from its edges as a look's page reads it
// (edge.mjs pictureEdge: the colour most of the top and side segments agree on, and whether it is plain enough for the page to take it).
// One Chrome, behind the machine-wide lock like every render. The picture is read and checked like every picture (assets.mjs readImageBytes:
// inside the repository, a real image of an allowed type) and reaches the page only as a data: URI; the page loads nothing else.
import { Browser, findChrome, NO_CHROME } from './chrome.mjs';
import { readImageBytes } from './assets.mjs';
import { PICTURE_LIMITS, pictureEdge } from './edge.mjs';
import { DesignError } from './errors.mjs';
import { ROOT } from '../core.mjs';

export const PROBE = Object.freeze({ size: 384, min: 96, max: 768, quality: 0.8 });

// -> { w, h, thumb: { mediaType: 'image/jpeg', data: base64 }, edge: { rgb, plain, auto, picture, share } }
export async function probePicture({ root = ROOT, file, size = PROBE.size, browser } = {}) {
  if (!Number.isInteger(size) || size < PROBE.min || size > PROBE.max) throw new DesignError(`a probe is ${PROBE.min} to ${PROBE.max} px`);
  const { type, buf } = readImageBytes(file, { root });
  const own = !browser;
  if (own) { const chrome = findChrome(); if (!chrome) throw new DesignError(NO_CHROME); browser = await Browser.launch({ chromePath: chrome }); }
  try {
    const page = await browser.page(size, size);
    try {
      await page.setContent(`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:"><img id="p" alt="" src="data:${type};base64,${buf.toString('base64')}">`);
      return await page.evaluate(`(async () => {
        const PICTURE_LIMITS = ${JSON.stringify(PICTURE_LIMITS)};
        const pictureEdge = ${pictureEdge.toString()};
        const i = document.getElementById('p'); await i.decode();
        const nw = i.naturalWidth, nh = i.naturalHeight, k = Math.min(1, ${size} / Math.max(nw, nh));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(nw * k)); c.height = Math.max(1, Math.round(nh * k));
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0, c.width, c.height);
        const grab = (x, y, w, h) => { w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); return { d: g.getImageData(Math.round(x), Math.round(y), w, h).data, w }; };
        const W = c.width, H = c.height, top = grab(0, 0, W, H * 0.03), left = grab(0, 0, W * 0.03, H * 0.6), right = grab(W - W * 0.03, 0, W * 0.03, H * 0.6);
        const e = pictureEdge({ top: top.d, topWidth: top.w, left: left.d, right: right.d, sideWidth: left.w });
        const thumb = c.toDataURL('image/jpeg', ${PROBE.quality}).replace(/^data:image\\/jpeg;base64,/, '');
        return { w: nw, h: nh, thumb: { mediaType: 'image/jpeg', data: thumb }, edge: { rgb: e.rgb, plain: e.plain, auto: e.auto, picture: e.picture, share: Math.round(e.share * 100) / 100 } };
      })()`);
    } finally { await page.close(); }
  } finally { if (own) browser.close(); }
}
