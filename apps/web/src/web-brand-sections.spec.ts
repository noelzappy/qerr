// The sections of Brand and look: their order and addresses (web/src/pages/settings/brand/model.ts).
import { describe, expect, it } from 'vitest';
import { SECTIONS, classicOnly, classicProblem, isSection, lookInForce, sectionOfPath, sectionPath } from '../web/src/pages/settings/brand/model';
import { engineImport } from './server/engine/root.js';

describe('settings only the classic layouts use', () => {
  it('never include the fonts, the photo treatment or the logo place, which a look reads too', async () => {
    for (const p of ['style.type.display.font', 'style.type.label.font', 'style.photo.treatment', 'style.photo.colour', 'style.logo']) expect(classicOnly(p), p).toBe(false);
    // the Clean look (every new brand's) takes every font from the brand
    const dirs = await engineImport<{ shippedLooks(): Record<string, unknown> }>('design/directions/index');
    const tokens = await engineImport<{ tokensFromLook(l: unknown, b: unknown): { fonts: Record<string, { brandVar?: string }> } }>('design/directions/look-tokens');
    const fonts = tokens.tokensFromLook(dirs.shippedLooks().clean, { font: { family: 'Brand Sans', display: 'Brand Display', label: 'Brand Sans', mono: 'Brand Mono' } }).fonts;
    for (const role of ['display', 'text', 'label', 'mono']) expect(fonts[role]?.brandVar, role).toBeTruthy();
  });
  it('are the case, spacing, weight, size and accent of type, and cards, decoration and what goes beside the logo', () => {
    for (const p of ['style.type.display.case', 'style.type.body.tracking', 'style.type.label.weight', 'style.type.scale', 'style.type.accent', 'style.surface', 'style.decoration.kind', 'style.footer']) expect(classicOnly(p), p).toBe(true);
  });
  it('fold away while a look or a design direction draws the posts, and show while classic layouts are in use', () => {
    expect(lookInForce(null, true)).toBe(true);
    expect(lookInForce('retail', false)).toBe(true);
    expect(lookInForce('retail', undefined)).toBe(true);
    expect(lookInForce(null, false)).toBe(false);
    // not known yet: nothing is hidden on a guess
    expect(lookInForce(null, undefined)).toBe(false);
  });
  it('open again when the server names a problem among them', () => {
    expect(classicProblem({ 'style.type.display.case': 'bad' }, 'type')).toBe(true);
    expect(classicProblem({ 'style.type.display.font': 'bad' }, 'type')).toBe(false);
    expect(classicProblem({ 'style.surface': 'bad' }, 'type')).toBe(false);
    expect(classicProblem({ 'style.decoration.alpha': 'bad' }, 'surfaces')).toBe(true);
    expect(classicProblem({ 'style.logo': 'bad' }, 'surfaces')).toBe(false);
    expect(classicProblem({}, 'surfaces')).toBe(false);
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
