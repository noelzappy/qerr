// The picture's focus point and zoom as the picture picker shows them: where a click lands on the picture, what a key or the wheel does,
// and which part of the picture each post size keeps. Pure, so it is tested without a browser (web-focal-frame.spec.ts).
//
// The engine crops a picture as CSS does: object-fit cover with object-position at the focus point, then scale(zoom) about that same point
// (packages/engine/lib/design/directions/kit.mjs photo). The point at x% of the picture stays at x% of the frame, so the focus is always kept.
// The stored values do not change: focal is "N% N%" and zoom a number from 1 to 3 (left out at 1).

export interface Pt { x: number; y: number }
export interface Box { x: number; y: number; w: number; h: number }

// The engine's post sizes (lib/design/sizes.mjs), with a short name for the frame's tag.
export const POST_SIZES: Record<string, { w: number; h: number; label: string }> = {
  feed: { w: 1080, h: 1350, label: 'Feed 4:5' },
  square: { w: 1080, h: 1080, label: 'Square' },
  story: { w: 1080, h: 1920, label: 'Story 9:16' },
  wide: { w: 1200, h: 675, label: 'Wide 16:9' },
};
export const ZOOM = { min: 1, max: 3, step: 0.1 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export const focalString = (p: Pt): string => `${Math.round(clamp(p.x, 0, 100))}% ${Math.round(clamp(p.y, 0, 100))}%`;

// The sizes a design is made in (its own list, else the feed size).
export function sizesOf(design: { sizes?: unknown }): string[] {
  const list = Array.isArray(design.sizes) ? design.sizes.filter((s): s is string => typeof s === 'string' && s in POST_SIZES) : [];
  return list.length ? [...new Set(list)] : ['feed'];
}

// The part of the picture (fractions of its width and height) a frame of `frameAspect` (width / height) keeps.
export function cropFrame(imageAspect: number, frameAspect: number, focal: Pt, zoom = 1): Box {
  const z = clamp(Number.isFinite(zoom) ? zoom : 1, ZOOM.min, ZOOM.max);
  const fx = clamp(focal.x, 0, 100) / 100, fy = clamp(focal.y, 0, 100) / 100;
  // cover: the frame's share of the picture before zooming
  const fw = imageAspect > frameAspect ? frameAspect / imageAspect : 1;
  const fh = imageAspect > frameAspect ? 1 : imageAspect / frameAspect;
  // object-position puts the focus at the same share of the frame; the zoom keeps that point where it is
  const left = (1 - fw) * fx, top = (1 - fh) * fy;
  return { x: left + fx * fw * (1 - 1 / z), y: top + fy * fh * (1 - 1 / z), w: fw / z, h: fh / z };
}

// A click or touch at (clientX, clientY) on the picture drawn in `rect`, as a focus point (whole percentages, kept on the picture).
export function pointToFocal(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Pt {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 50, y: 50 };
  return { x: Math.round(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)), y: Math.round(clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)) };
}

// An arrow key moves the point by 1% (10% with Shift); Home puts it in the middle. null for any other key.
export function nudge(p: Pt, key: string, big = false): Pt | null {
  const d = big ? 10 : 1;
  const step: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] };
  if (key === 'Home') return { x: 50, y: 50 };
  const s = step[key];
  if (!s) return null;
  return { x: clamp(Math.round(p.x) + s[0], 0, 100), y: clamp(Math.round(p.y) + s[1], 0, 100) };
}

// The zoom after `steps` steps of 0.1 (negative zooms out). At 1 the zoom is left out (undefined), as the form writes it.
export function zoomBy(zoom: number | undefined, steps: number): number | undefined {
  const z = round1(clamp((typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 1) + steps * ZOOM.step, ZOOM.min, ZOOM.max));
  return z <= 1 ? undefined : z;
}
// The zoom a pinch gives: the zoom when it started times how far the fingers moved apart.
export function pinchZoom(start: number | undefined, startDistance: number, distance: number): number | undefined {
  if (!(startDistance > 0) || !(distance > 0)) return start;
  const z = round1(clamp((start ?? 1) * (distance / startDistance), ZOOM.min, ZOOM.max));
  return z <= 1 ? undefined : z;
}
// Steps of zoom for a turn of the wheel, from the scroll gathered so far (pixels; a line counts 40): one step per 60 pixels, up zooms in.
// Returns the steps and what is left over to gather, so a trackpad's many small turns zoom as smoothly as a mouse's notches.
export function wheelSteps(gathered: number): { steps: number; rest: number } {
  const steps = Math.trunc(gathered / 60);
  return { steps: steps === 0 ? 0 : -steps, rest: gathered - steps * 60 };
}
