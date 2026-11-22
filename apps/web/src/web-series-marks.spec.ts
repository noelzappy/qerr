// A series' mark chosen from presets instead of typing the {n} placeholder (Settings, Looks, Series).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MARK_PRESETS, markFor, markPreset } from '../web/src/pages/settings/looks/series-marks';
import { seriesMark } from '../web/src/pages/batches/editor/series-model';

describe('the mark of a series', () => {
  it('offers Tip #12, No. 12 and Part 12, each written with {n} where the number goes', () => {
    expect(MARK_PRESETS.map((p) => p.label)).toEqual(['No mark', 'Tip #12', 'No. 12', 'Part 12']);
    for (const p of MARK_PRESETS.filter((x) => x.mark)) expect(seriesMark(p.mark, 12)).toBe(p.label);
  });
  it('reads a stored mark back as its preset, and anything else as Custom', () => {
    expect(markPreset('')).toBe('none');
    expect(markPreset(' Tip #{n} ')).toBe('tip');
    expect(markPreset('Part {n}')).toBe('part');
    expect(markPreset('Myth vs fact')).toBe('custom');
    expect(markPreset('Tip {nn}')).toBe('custom');
  });
  it('writes the preset\'s mark, and keeps the text when Custom is chosen so it can be edited', () => {
    expect(markFor('no', 'anything')).toBe('No. {n}');
    expect(markFor('none', 'Tip #{n}')).toBe('');
    expect(markFor('custom', 'Tip #{n}')).toBe('Tip #{n}');
  });
});

describe('the series form', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '../web/src/pages/settings/looks/SeriesPanel.tsx'), 'utf8');
  it('is a centred dialog that asks before losing changes', () => {
    expect(src).toMatch(/<FormPanel open=\{!!editing\} variant="dialog"/);
    expect(src).toContain('confirmDiscard(dirty && !busy');
    expect(src).toContain('useUnsavedGuard(dirty)');
  });
});
