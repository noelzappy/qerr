// The sections of Brand and look: their order and addresses (web/src/pages/settings/brand/model.ts).
import { describe, expect, it } from 'vitest';
import { SECTIONS, isSection, sectionOfPath, sectionPath } from '../web/src/pages/settings/brand/model';

describe('brand sections', () => {
  it('no longer has a Design direction tab (its job moved to Settings, Looks)', () => {
    const ids = SECTIONS.map((s) => s.id) as string[];
    expect(ids).toEqual(['identity', 'logos', 'colours', 'type', 'surfaces', 'post-types', 'voice', 'advanced']);
    expect(isSection('direction')).toBe(false);
  });
  it('gives sections their address and maps server paths', () => {
    expect(sectionPath('logos')).toBe('/settings/brand/logos');
    expect(sectionOfPath('style.type.display')).toBe('type');
    expect(sectionOfPath('style.surface')).toBe('surfaces');
    expect(sectionOfPath('contrastDisplay')).toBe('colours');
  });
});
