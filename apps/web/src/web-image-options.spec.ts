import { describe, expect, it } from 'vitest';
import { focalXY, imageOptionsSupport } from '../web/src/pages/batches/editor/image-options-support';

describe('image options', () => {
  it('reads a focal point written the ways the design accepts', () => {
    expect(focalXY('60% 40%')).toEqual({ x: 60, y: 40 });
    expect(focalXY('left top')).toEqual({ x: 0, y: 0 });
    expect(focalXY('center')).toEqual({ x: 50, y: 50 });
    expect(focalXY({ x: 0.6, y: 0.4 })).toEqual({ x: 60, y: 40 });
    expect(focalXY([70, 100])).toEqual({ x: 70, y: 100 });
  });
  it('does not guess a focal point set per size', () => {
    expect(focalXY({ feed: '60% 40%', wide: 'center' })).toBeNull();
    expect(focalXY('nonsense')).toBeNull();
  });
  it('offers each option only where the design accepts it', () => {
    expect(imageOptionsSupport({ template: 'photo' }, [])).toMatchObject({ photo: true, focal: true, zoom: false, frame: false });
    expect(imageOptionsSupport({ template: 'screen' }, [])).toMatchObject({ screen: true, frame: true, focal: false });
    expect(imageOptionsSupport({ template: 'text' }, [])).toMatchObject({ frame: true, focal: false });
    expect(imageOptionsSupport({ template: 'number' }, [])).toMatchObject({ focal: false });
    expect(imageOptionsSupport({ template: 'number', image: 'design/assets/photos/a.jpg' }, [])).toMatchObject({ focal: true, zoom: true });
    const brand = [{ id: 'a', name: 'A', description: null, sizes: [], fields: [{ name: 'image', kind: 'image', required: true, max: null, min: null, word: '' }] }];
    expect(imageOptionsSupport({ template: 'layout', layout: 'a' }, brand)).toMatchObject({ frame: true, focal: true, zoom: true });
    expect(imageOptionsSupport({ template: 'layout', layout: 'b' }, brand)).toMatchObject({ frame: false, focal: false });
  });
});
