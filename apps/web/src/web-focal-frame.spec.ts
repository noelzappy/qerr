// The picture focus: where a click on the picture lands as a focus point, what keys, the wheel and a pinch do, and which part of the picture
// each post size keeps (the engine crops with object-fit cover at the focus, then scales about it). The stored values stay "N% N%" and 1–3.
import { describe, expect, it } from 'vitest';
import { cropFrame, focalString, nudge, pinchZoom, pointToFocal, POST_SIZES, sizesOf, wheelSteps, zoomBy } from '../web/src/pages/batches/editor/focal-frame';
import { focalXY } from '../web/src/pages/batches/editor/image-options-support';

const close = (a: Record<string, number>, b: Record<string, number>) => { for (const k of Object.keys(b)) expect(a[k], k).toBeCloseTo(b[k]!, 6); };

describe('a click on the picture', () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 };
  it('is the focus point, in whole percentages of the picture', () => {
    expect(pointToFocal(348, 176, rect)).toEqual({ x: 62, y: 42 });
    expect(pointToFocal(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(pointToFocal(500, 350, rect)).toEqual({ x: 100, y: 100 });
  });
  it('stays on the picture when the pointer is dragged past its edge', () => {
    expect(pointToFocal(20, 900, rect)).toEqual({ x: 0, y: 100 });
  });
  it('is the middle when the picture has no size yet', () => {
    expect(pointToFocal(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 50, y: 50 });
  });
  it('is stored as the engine reads it, and read back the same', () => {
    expect(focalString({ x: 61.6, y: 42.2 })).toBe('62% 42%');
    expect(focalXY(focalString({ x: 62, y: 42 }))).toEqual({ x: 62, y: 42 });
    expect(focalString({ x: -5, y: 140 })).toBe('0% 100%');
  });
});

describe('keys, wheel and pinch', () => {
  it('moves the point by 1% with an arrow key, 10% with Shift, and to the middle with Home', () => {
    expect(nudge({ x: 62, y: 42 }, 'ArrowLeft')).toEqual({ x: 61, y: 42 });
    expect(nudge({ x: 62, y: 42 }, 'ArrowDown', true)).toEqual({ x: 62, y: 52 });
    expect(nudge({ x: 99, y: 0 }, 'ArrowRight', true)).toEqual({ x: 100, y: 0 });
    expect(nudge({ x: 0, y: 0 }, 'ArrowUp')).toEqual({ x: 0, y: 0 });
    expect(nudge({ x: 10, y: 90 }, 'Home')).toEqual({ x: 50, y: 50 });
    expect(nudge({ x: 10, y: 90 }, 'a')).toBeNull();
  });
  it('zooms in steps of 0.1 from 1 to 3, and leaves the zoom out at 1', () => {
    expect(zoomBy(undefined, 2)).toBe(1.2);
    expect(zoomBy(1.2, -2)).toBeUndefined();
    expect(zoomBy(2.95, 5)).toBe(3);
    expect(zoomBy(1.5, -10)).toBeUndefined();
  });
  it('turns the wheel into steps, gathering a trackpad\'s small turns', () => {
    expect(wheelSteps(-120)).toEqual({ steps: 2, rest: 0 });
    expect(wheelSteps(30)).toEqual({ steps: 0, rest: 30 });
    expect(wheelSteps(65)).toEqual({ steps: -1, rest: 5 });
  });
  it('zooms with a pinch by how far the fingers move apart', () => {
    expect(pinchZoom(undefined, 100, 150)).toBe(1.5);
    expect(pinchZoom(2, 100, 50)).toBeUndefined();
    expect(pinchZoom(2, 100, 400)).toBe(3);
    expect(pinchZoom(1.4, 0, 100)).toBe(1.4);
  });
});

describe('the part of the picture each size keeps', () => {
  it('keeps the whole picture when it has the frame\'s shape', () => {
    close(cropFrame(4 / 5, 4 / 5, { x: 50, y: 50 }) as never, { x: 0, y: 0, w: 1, h: 1 });
  });
  it('crops a wide picture at the sides, keeping the focus at the same share of the frame', () => {
    // a 3:2 picture in a 4:5 frame keeps 0.533 of its width; a focus at 25% puts the crop a quarter of the spare width in
    const box = cropFrame(3 / 2, 4 / 5, { x: 25, y: 50 });
    close(box as never, { y: 0, h: 1, w: (4 / 5) / (3 / 2), x: (1 - (4 / 5) / (3 / 2)) * 0.25 });
    expect(box.x + box.w * 0.25).toBeCloseTo(0.25, 6); // the focus sits 25% into the crop
  });
  it('crops a tall picture at the top and bottom', () => {
    close(cropFrame(1 / 2, 1, { x: 50, y: 100 }) as never, { x: 0, w: 1, h: 0.5, y: 0.5 });
  });
  it('zooms about the focus, which stays where it is in the frame', () => {
    for (const [fx, fy, z] of [[50, 50, 2], [10, 80, 1.5], [100, 0, 3]] as const) {
      const box = cropFrame(1, 4 / 5, { x: fx, y: fy }, z);
      const unzoomed = cropFrame(1, 4 / 5, { x: fx, y: fy }, 1);
      expect(box.w).toBeCloseTo(unzoomed.w / z, 6);
      expect(box.h).toBeCloseTo(unzoomed.h / z, 6);
      // the focus point is at the same share of the crop as before
      expect((fx / 100 - box.x) / box.w).toBeCloseTo((fx / 100 - unzoomed.x) / unzoomed.w, 6);
      expect((fy / 100 - box.y) / box.h).toBeCloseTo((fy / 100 - unzoomed.y) / unzoomed.h, 6);
      expect(box.x).toBeGreaterThanOrEqual(-1e-9); expect(box.x + box.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
  it('knows the sizes a design is made in, and the shape of each', () => {
    expect(sizesOf({})).toEqual(['feed']);
    expect(sizesOf({ sizes: ['story', 'feed', 'story', 'poster'] })).toEqual(['story', 'feed']);
    expect(POST_SIZES.feed!.w / POST_SIZES.feed!.h).toBeCloseTo(0.8, 6);
    expect(POST_SIZES.story!.w / POST_SIZES.story!.h).toBeCloseTo(9 / 16, 6);
  });
});
