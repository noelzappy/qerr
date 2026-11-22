// The kit's PresetNumber (web/src/components/kit/preset-number.tsx): which preset a value is, when it is Custom, the range check of a
// typed number, and the markup (drawn as static markup, with no browser). The Contrast control of Brand and look is drawn through it.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { numberProblem, PresetNumber, presetChoice, presetIndex } from '../web/src/components/kit/preset-number';
import { ContrastDisplay } from '../web/src/pages/settings/brand/contrast-display';

// React's text separators out of the way, so text reads as on screen.
const strip = (html: string) => html.replace(/<!-- -->/g, '');
const SPACING = [{ value: -0.04, label: 'Tight' }, { value: -0.02, label: 'Snug' }, { value: 0, label: 'Normal' }];

describe('which preset a value is', () => {
  it('finds the preset equal to the value, allowing for decimals that do not add up exactly', () => {
    expect(presetIndex(-0.02, SPACING)).toBe(1);
    expect(presetIndex(0, SPACING)).toBe(2);
    expect(presetIndex(0.1 + 0.2, [{ value: 0.3 }])).toBe(0);
  });
  it('is Custom (null) for a value between presets, and never snaps it', () => {
    expect(presetIndex(-0.03, SPACING)).toBeNull();
    expect(presetIndex(-0.012, SPACING)).toBeNull();
  });
  it('takes the nearest preset within a tolerance, and the nearer of two', () => {
    expect(presetIndex(-0.012, SPACING, 0.01)).toBe(1);
    expect(presetIndex(-0.009, SPACING, 0.01)).toBe(2);
    expect(presetIndex(0.5, SPACING, 0.01)).toBeNull();
  });
  it('is Custom for no value or not a number', () => {
    expect(presetIndex(null, SPACING)).toBeNull();
    expect(presetIndex(undefined, SPACING)).toBeNull();
    expect(presetIndex(Number.NaN, SPACING)).toBeNull();
  });
  it('shows Custom when forced or chosen, even on a preset value', () => {
    expect(presetChoice(0, SPACING)).toBe(2);
    expect(presetChoice(0, SPACING, { custom: true })).toBe('custom');
    expect(presetChoice(0, SPACING, { customOpen: true })).toBe('custom');
    expect(presetChoice(0.01, SPACING)).toBe('custom');
  });
});

describe('a typed number', () => {
  it('passes inside the range, ends included, and says the range otherwise', () => {
    expect(numberProblem(3, 3, 7)).toBe('');
    expect(numberProblem(7, 3, 7)).toBe('');
    expect(numberProblem(7.1, 3, 7)).toBe('Use a number from 3 to 7.');
    expect(numberProblem(Number.NaN, 3, 7)).toBe('Use a number from 3 to 7.');
    expect(numberProblem(1, -0.06, 0.02)).toBe('Use a number from −0.06 to 0.02.');
  });
});

describe('the markup', () => {
  const draw = (value: number | null, extra: Record<string, unknown> = {}) => strip(renderToString(
    <PresetNumber label="Letter spacing" hint="How far apart the letters sit." presets={SPACING.map((p) => ({ ...p, visual: <span style={{ letterSpacing: `${p.value}em` }}>Sale</span> }))}
      value={value} min={-0.06} max={0.02} step={0.005} unit="em" onChange={() => {}} {...extra} />,
  ));
  const checked = (html: string) => [...html.matchAll(/<input type="radio"([^>]*)>/g)].map((m) => m[1]!.includes('checked=""'));

  it('is a group of radio buttons named by its label, with one per preset and Custom last', () => {
    const html = draw(-0.02);
    expect(html).toContain('<fieldset');
    expect(html).toContain('Letter spacing');
    expect(html).toContain('About Letter spacing');
    expect(checked(html)).toEqual([false, true, false, false]);
    expect(html).toContain('Custom…');
    // Each preset draws its own picture of the value.
    expect(html).toContain('letter-spacing:-0.04em');
    // No number box while a preset is on.
    expect(html).not.toContain('type="number"');
  });
  it('opens the exact number with its range, step and unit when the value fits no preset', () => {
    const html = draw(-0.03);
    expect(checked(html)).toEqual([false, false, false, true]);
    expect(html).toMatch(/type="number"[^>]*min="-0.06"[^>]*max="0.02"[^>]*step="0.005"[^>]*value="-0.03"/);
    expect(html).toContain('−0.06 to 0.02 em');
  });
  it('shows Custom when told the value stands for values that do not follow it', () => {
    expect(checked(draw(0, { custom: true }))).toEqual([false, false, false, true]);
  });
  it('shows a problem as an alert, and a note only when there is no problem', () => {
    const bad = draw(-0.03, { error: 'Use a number from −0.06 to 0.02.', note: 'A remark' });
    expect(bad).toContain('role="alert"');
    expect(bad).not.toContain('A remark');
    expect(draw(-0.03, { note: 'A remark' })).toContain('role="status"');
  });
  it('offers a first choice for no number, chosen while there is none, and Custom otherwise for none', () => {
    const empty = { label: "The brand's own", onChoose: () => {} };
    const html = draw(null, { empty });
    expect(html).toContain("The brand&#x27;s own");
    expect(checked(html)).toEqual([true, false, false, false, false]);
    expect(html).not.toContain('type="number"');
    expect(checked(draw(-0.02, { empty }))).toEqual([false, false, true, false, false]);
    // Without it, no number is Custom, as before.
    expect(checked(draw(null))).toEqual([false, false, false, true]);
  });
  it('disables every choice when disabled', () => {
    expect(draw(0, { disabled: true })).toMatch(/<fieldset[^>]*disabled=""/);
  });
});

describe('Contrast for large headlines, drawn through it', () => {
  const draw = (value: number | null) => strip(renderToString(<ContrastDisplay value={value} onChange={() => {}} />));
  it('shows Standard for no value, High for 7 and Custom with the number otherwise', () => {
    expect(draw(null)).toMatch(/checked=""[^>]*\/?>(<[^>]+>)*Standard \(4\.5\)/);
    expect(draw(7)).toMatch(/checked=""[^>]*\/?>(<[^>]+>)*High \(7\)/);
    const custom = draw(4);
    expect(custom).toMatch(/type="number"[^>]*min="3"[^>]*max="7"[^>]*step="0.1"[^>]*value="4"/);
    expect(custom).toContain('Below the standard for normal text; fine for large headlines only.');
  });
  it('says the range for a ratio the engine refuses', () => {
    expect(draw(9)).toContain('Use a ratio from 3 to 7');
  });
});
