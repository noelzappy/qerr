// Brand and look drawn as pictures (calmer forms, phase 2): photo treatments, decorations, the logo's place, the second half of a
// headline and weights as pictures; the number fields as presets; the colour roles as a grid of swatches; colours read from the logo;
// fonts named in their own face. Drawn as static markup, with no browser.
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ColourRoles, LookFields, TypeFields, styleSwatches } from '../web/src/pages/settings/style-fields';
import { emptyRoles, groundColours, GROUNDS, GROUND_LABEL, type StyleSettings } from '../web/src/pages/settings/brand-types';
import { paletteFromPixels } from '../web/src/lib/logo-colours';
import { offsetPresets } from '../web/src/pages/settings/brand/logo-offsets';
import { RolePicker } from '../web/src/pages/settings/looks/design-controls';
import { FontFaceChoice } from '../web/src/pages/settings/looks/settings/font-choice';

const strip = (html: string) => html.replace(/<!-- -->/g, '');
const inputs = (html: string) => [...html.matchAll(/<input([^>]*)>/g)].map((m) => Object.fromEntries([...m[1]!.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!])));
const checkedValues = (html: string) => inputs(html).filter((i) => i.type === 'radio' && 'checked' in i).map((i) => i.value);
// The words of each chosen choice (a radio button's label, its picture's text included).
const chosenWords = (html: string) => [...html.matchAll(/<label[^>]*><input[^>]*checked=""[^>]*\/?>(.*?)<\/label>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ''));
const radioValues = (html: string) => inputs(html).filter((i) => i.type === 'radio').map((i) => i.value);

const COLOURS = { primary: '#2F6B5A', accent: '#FFB300', dark: '#1D2026', light: '#F3F1EC' };
const STYLE = {
  direction: null,
  type: { display: { case: 'as-typed', tracking: null, weight: null, font: 'body' }, body: { case: 'as-typed', tracking: -0.02, weight: 600 }, label: { case: 'upper', tracking: 0.013, weight: null, font: 'mono' }, scale: 1.1, accent: 'colour' },
  surface: 'shadow', decoration: { kind: 'grid', on: 'dark', alpha: 0.15, fit: 'cover', opacity: 1 },
  photo: { treatment: 'tint', strength: 0.5, colour: 'primary', shadows: 'dark', highlights: 'light' }, logo: 'bottom-right', footer: 'website',
} as unknown as StyleSettings;

describe('Surfaces and photos as pictures', () => {
  const html = strip(renderToString(<MemoryRouter><LookFields style={STYLE} onChange={() => {}} artwork={null} busy={false} onArtwork={() => {}} onRemoveArtwork={() => {}} swatches={styleSwatches(COLOURS, null, groundColours(COLOURS))} /></MemoryRouter>));
  it('has no dropdown and no bare number box left', () => {
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain('inputmode="decimal"');
  });
  it('offers the four photo treatments as treated pictures, in plain words', () => {
    for (const v of ['none', 'tint', 'duotone', 'overlay']) expect(radioValues(html)).toContain(v);
    for (const w of ['As shot', 'Tinted', 'Duotone', 'Colour overlay']) expect(html).toContain(w);
    // The tinted picture is drawn in the brand's primary colour, at the strength set.
    expect(html).toMatch(/mix-blend-multiply" style="background:#2F6B5A;opacity:0.5"/);
  });
  it('offers the six decorations as pattern tiles and the five logo places as page diagrams', () => {
    for (const v of ['auto', 'none', 'dots', 'grid', 'lines', 'artwork', 'top-left', 'top-right', 'bottom-left', 'bottom-right']) expect(radioValues(html)).toContain(v);
    expect(checkedValues(html)).toEqual(expect.arrayContaining(['grid', 'bottom-right', 'tint']));
    expect(html).toContain('As laid out');
    expect(html.match(/<pattern /g)!.length).toBeGreaterThanOrEqual(15);
  });
  it('gives the strengths as presets, each with its picture, and keeps a value between presets as Custom', () => {
    expect(html).toContain('Decoration strength');
    expect(chosenWords(html)).toEqual(expect.arrayContaining(['Medium', 'Tinted']));
    expect(html).toContain('Brand&#x27;s own');
    // Photo strength 0.5 is the Medium preset, drawn in the chosen colour
    expect(html).toMatch(/background:#2F6B5A;opacity:0.5/);
    const between = strip(renderToString(<MemoryRouter><LookFields style={{ ...STYLE, decoration: { ...STYLE.decoration, alpha: 0.2 } }} onChange={() => {}} artwork={null} busy={false} onArtwork={() => {}} onRemoveArtwork={() => {}} swatches={{}} /></MemoryRouter>));
    expect(between).toMatch(/type="number"[^>]*min="0.01"[^>]*max="0.4"[^>]*value="0.2"/);
  });
});

describe('Type as pictures', () => {
  const html = strip(renderToString(<TypeFields style={STYLE} headlineWeight={700} onChange={() => {}} fonts={{ body: null, display: null, label: null }} version="" busy="" onUpload={() => {}} onGoogle={() => {}} onRemove={() => {}}
    sample={{ ink: '#111111', muted: '#999999', accent: '#2F6B5A', paper: '#ffffff' }} />));
  it('has no dropdown left', () => expect(html).not.toContain('role="combobox"'));
  it('draws every weight as "Ag" in that weight, and the brand\'s own as a first choice where it applies', () => {
    for (const w of [100, 400, 900]) expect(html).toContain(`font-weight:${w}`);
    expect(html).toContain('aria-label="600 Semi-bold"');
    // a first choice for body text and labels (not headlines), and the label's weight is that choice now
    expect(html.match(/>Brand&#x27;s own<\/label>/g)?.length).toBe(2);
    expect(chosenWords(html)).toContain('Brand&#x27;s own');
    // The headline weight falls back to the brand's 700; body text is set at 600.
    expect(checkedValues(html)).toEqual(expect.arrayContaining(['700', '600']));
  });
  it('sets each letter-spacing preset in its own spacing, and a spacing between presets is Custom', () => {
    expect(html).toContain('letter-spacing:-0.04em');
    expect(html).toContain('letter-spacing:0.1em');
    expect(html).toMatch(/type="number"[^>]*value="0.013"/);
  });
  it('shows headline sizes at their size and the second half of a headline as samples in the brand\'s colours', () => {
    expect(chosenWords(html)).toContain('AaLarger');
    expect(html).toContain('font-size:14px');
    expect(html).toContain('every week.');
    expect(html).toMatch(/<span style="color:#2F6B5A">every week\./);
    for (const v of ['series', 'muted', 'colour', 'weight', 'none']) expect(radioValues(html)).toContain(v);
  });
});

describe('the colour roles as a grid of swatches', () => {
  const roles = { ...emptyRoles(), text: { ink: '#000000' } };
  const html = strip(renderToString(<ColourRoles roles={roles} palette={null} onChange={() => {}} />));
  it('shows twenty swatches, each Automatic or Set by you, with no hex box until one is opened', () => {
    expect(html.match(/aria-haspopup="dialog"/g)?.length).toBe(20);
    expect(html).not.toContain('hex code');
    expect(html).toContain('aria-label="Headlines on light: #000000, set by you. Change"');
    expect(html.match(/, automatic\. Change"/g)?.length).toBe(19);
  });
});

describe('the page colour of a post type', () => {
  it('is a group of swatches named for the post type, the chosen one named beside it', () => {
    const html = renderToString(<RolePicker hideLabel label="Page colour of Tips" value="cool" roles={[...GROUNDS]} swatches={groundColours(COLOURS)} wordOf={(g) => GROUND_LABEL[g] ?? g} onChange={() => ''} />);
    expect(html).toContain('role="radiogroup" aria-label="Page colour of Tips"');
    expect(html).toMatch(/class="sr-only">Page colour of Tips/);
    expect(html.match(/role="radio"/g)?.length).toBe(6);
    expect(html).toMatch(/aria-checked="true" aria-label="Cool"/);
  });
});

describe('colours read from a logo', () => {
  const px = (list: Array<[number, number, number, number, number]>) => list.flatMap(([r, g, b, a, n]) => Array.from({ length: n }, () => [r, g, b, a]).flat());
  it('takes the main colours, biggest first, leaving out see-through pixels and white', () => {
    const data = px([[255, 255, 255, 255, 500], [0, 0, 0, 0, 500], [43, 122, 70, 255, 300], [242, 165, 65, 255, 100], [43, 122, 70, 120, 200]]);
    expect(paletteFromPixels(data)).toEqual(['#2B7A46', '#F2A541']);
  });
  it('folds near shades into one, and leaves out specks', () => {
    const data = px([[20, 40, 200, 255, 300], [24, 44, 205, 255, 300], [200, 30, 30, 255, 200], [10, 200, 10, 255, 2]]);
    const found = paletteFromPixels(data);
    expect(found).toHaveLength(2);
    expect(found[1]).toBe('#C81E1E');
  });
  it('finds nothing in a blank picture', () => expect(paletteFromPixels(px([[0, 0, 0, 0, 10], [255, 255, 255, 255, 10]]))).toEqual([]));
});

describe('the logo offsets', () => {
  it('offer the measured place first, then the fixed ones, without repeats', () => {
    expect(offsetPresets(212, [{ value: 0, label: 'Whole logo' }], () => null).map((p) => [p.value, p.label])).toEqual([[212, 'Measured'], [0, 'Whole logo']]);
    expect(offsetPresets(0, [{ value: 0, label: 'Whole logo' }], () => null).map((p) => p.label)).toEqual(['Whole logo']);
    expect(offsetPresets(null, [{ value: 0, label: 'No gap' }], () => null).map((p) => p.label)).toEqual(['No gap']);
  });
});

describe('a typeface of the font library', () => {
  it('is chosen from names set in their own face, not from a dropdown', () => {
    const fonts = [{ family: 'Fraunces', minWeight: 100, maxWeight: 900, italic: true, stretch: false, files: [] }, { family: 'Inter', minWeight: 100, maxWeight: 900, italic: false, stretch: false, files: [] }];
    const html = renderToString(<FontFaceChoice label="Typeface" value="Inter" fonts={fonts} onChange={() => {}} />);
    expect(html).not.toContain('role="combobox"');
    expect(checkedValues(html)).toEqual(['Inter']);
    expect(html).toContain('font-family:&#x27;Look Fraunces&#x27;, Georgia');
  });
});
