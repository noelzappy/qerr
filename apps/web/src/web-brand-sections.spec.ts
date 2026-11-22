// The sections of Brand and look: their order and addresses (web/src/pages/settings/brand/model.ts).
import { describe, expect, it } from 'vitest';
import { SECTIONS, isSection, sectionOfPath, sectionPath } from '../web/src/pages/settings/brand/model';

describe('brand sections', () => {
  it('lists the design direction right after identity', () => {
    const ids = SECTIONS.map((s) => s.id);
    expect(ids.indexOf('direction')).toBe(ids.indexOf('identity') + 1);
    expect(ids[ids.indexOf('direction') + 1]).toBe('logos');
    expect(SECTIONS.find((s) => s.id === 'direction')?.look).toBe(true);
  });
  it('gives it its own address and maps its server path', () => {
    expect(sectionPath('direction')).toBe('/settings/brand/direction');
    expect(isSection('direction')).toBe(true);
    expect(sectionOfPath('style.direction')).toBe('direction');
    expect(sectionOfPath('style.type.display')).toBe('type');
    expect(sectionOfPath('style.surface')).toBe('surfaces');
  });
});
