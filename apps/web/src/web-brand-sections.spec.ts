// The sections of Brand and look: their order and addresses (web/src/pages/settings/brand/model.ts).
import { describe, expect, it } from 'vitest';
import { SECTIONS, isSection, lookInForce, sectionHasProblem, sectionOfPath, sectionPath } from '../web/src/pages/settings/brand/model';

describe('settings only the classic layouts use', () => {
  it('fold away while a look or a design direction draws the posts, and show while classic layouts are in use', () => {
    expect(lookInForce(null, true)).toBe(true);
    expect(lookInForce('retail', false)).toBe(true);
    expect(lookInForce('retail', undefined)).toBe(true);
    expect(lookInForce(null, false)).toBe(false);
    // not known yet: nothing is hidden on a guess
    expect(lookInForce(null, undefined)).toBe(false);
  });
  it('open again when the server names a problem in their section', () => {
    expect(sectionHasProblem({ 'style.type.display': 'bad' }, 'type')).toBe(true);
    expect(sectionHasProblem({ 'style.surface': 'bad' }, 'type')).toBe(false);
    expect(sectionHasProblem({ 'style.surface': 'bad' }, 'surfaces')).toBe(true);
    expect(sectionHasProblem({}, 'surfaces')).toBe(false);
  });
});

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
