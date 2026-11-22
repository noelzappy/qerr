// The settings menu after Looks and Channels (web/src/shell/nav.ts) and the contrast control's rules.
import { describe, expect, it } from 'vitest';
import { SETTINGS, isWideSettingsPath, visibleSettings } from '../web/src/shell/nav';
import { displayMode, displayNote, displayProblem } from '../web/src/pages/settings/brand/contrast-logic';

const labels = (admin: boolean, look: boolean | undefined) => visibleSettings(admin, look).map((s) => [s.title, s.items.map((i) => i.label)]);

describe('the settings menu', () => {
  it('reads You, Brand, Organisation, Records, with no menu entry for Buffer accounts or Design references', () => {
    expect(labels(true, false)).toEqual([
      ['You', ['Preferences']],
      ['Brand', ['Brand and look', 'Looks', 'Classic layouts']],
      ['Organisation', ['Team', 'Channels', 'AI and search']],
      ['Records', ['Audit log']],
    ]);
    const tos = SETTINGS.flatMap((s) => s.items.map((i) => i.to));
    expect(tos).not.toContain('/settings/accounts');
    expect(tos).not.toContain('/settings/references');
    expect(tos).toContain('/settings/looks');
    expect(tos.indexOf('/settings/looks')).toBeLessThan(tos.indexOf('/settings/layouts'));
  });
  it('hides Classic layouts while a look is active, and shows it while that is not yet known', () => {
    expect(labels(true, true)[1]).toEqual(['Brand', ['Brand and look', 'Looks']]);
    expect(labels(true, undefined)[1]![1]).toContain('Classic layouts');
  });
  it('keeps admin groups from editors', () => {
    expect(labels(false, false)).toEqual([['You', ['Preferences']]]);
  });
  it('gives the Looks pages the whole width', () => {
    for (const p of ['/settings/looks', '/settings/looks/inspiration', '/settings/looks/mine', '/settings/looks/mine/designs/abc']) expect(isWideSettingsPath(p)).toBe(true);
    expect(isWideSettingsPath('/settings/brand')).toBe(false);
  });
});

describe('contrast for large headlines', () => {
  it('is Standard when unset or 4.5, High at 7, Custom otherwise', () => {
    expect([null, 4.5, 7, 3.2, 6].map(displayMode)).toEqual(['standard', 'standard', 'high', 'custom', 'custom']);
  });
  it('refuses a ratio outside 3 to 7 and says when it is below the standard', () => {
    expect([2.9, 7.1, Number.NaN].map(displayProblem).every(Boolean)).toBe(true);
    expect([null, 3, 4.5, 7].map(displayProblem)).toEqual(['', '', '', '']);
    expect(displayNote(3.5)).toBe('Below the standard for normal text; fine for large headlines only.');
    expect(displayNote(4.5)).toBe('');
    expect(displayNote(null)).toBe('');
  });
});
