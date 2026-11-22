// The geometry of a direction page: a rectangle per element a builder marked (data-el, kit.mjs numberElements), rounded to a whole pixel,
// measured the way the renderer measures before it checks (ready, fitLines at the designed scale, postMetrics). No pictures are written.
// -> [[ "2.0", x0, y0, x1, y1 ], ...] in document order. Chrome; one at a time (the caller holds the Browser).
import { buildPage } from '../lib/design/page.mjs';
import { preparePage } from '../lib/design/render.mjs';
import { SIZES } from '../lib/design/sizes.mjs';
import { normaliseDesign } from '../lib/design/spec.mjs';

export async function postGeometry(browser, brand, design) {
  const prep = preparePage(brand, { spec: normaliseDesign(design), sizeName: 'feed' });
  const page = await browser.page(SIZES.feed.w, SIZES.feed.h);
  try {
    await page.setContent(buildPage({ brand, size: SIZES.feed, ...prep.out }));
    await page.evaluate('window.__ds.ready({})');
    await page.evaluate('window.__ds.fitLines()');
    const m = await page.evaluate('window.__ds.postMetrics()');
    return m.els.map((e) => [e.el, Math.round(e.x0), Math.round(e.y0), Math.round(e.x1), Math.round(e.y1)]);
  } finally { await page.close(); }
}
// Two geometries are the same when they list the same elements and every edge is within `tol` px (1 by default).
export const sameGeometry = (a, b, tol = 1) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
  && a.every((r, i) => r[0] === b[i][0] && r.slice(1).every((v, k) => Math.abs(v - b[i][k + 1]) <= tol));
