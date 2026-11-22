// Small choices as segments instead of dropdowns (Settings): the kit's SegmentedField and ChoiceField, the brand colour swatches, and the
// Settings forms that use them, drawn as static markup.
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ChoiceField, SegmentedField, fitsSegments } from '../web/src/components/kit/segmented-field';
import { RolePicker } from '../web/src/pages/settings/looks/design-controls';
import { LookFields, STYLE_COLOUR_WORD, TypeFields, styleSwatches } from '../web/src/pages/settings/style-fields';
import { groundColours, type StyleSettings } from '../web/src/pages/settings/brand-types';
import { DesignSettings, ElementProperties } from '../web/src/pages/settings/looks/DesignProperties';
import { listTree } from '../web/src/pages/settings/looks/design-model';
import { swatchesFrom } from '../web/src/pages/settings/looks/design-colours';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const noop = () => '';
const radios = (html: string) => html.match(/type="radio"/g)?.length ?? 0;
// Each <input> as its attributes, whatever their order.
const inputs = (html: string) => [...html.matchAll(/<input([^>]*)>/g)].map((m) => Object.fromEntries([...m[1]!.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!])));
const checkedValue = (html: string) => inputs(html).filter((i) => i.type === 'radio' && 'checked' in i).map((i) => i.value);

describe('a segmented field', () => {
  const html = renderToString(<SegmentedField label="Corners" hint="How rounded cards are." value="soft" onValueChange={noop}
    options={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Soft' }, { value: 'round', label: 'Round' }]} />);
  it('is a named group of real radio buttons, so the arrow keys move the choice', () => {
    expect(html).toContain('<fieldset');
    expect(html).toMatch(/<legend[^>]*>.*Corners/);
    expect(radios(html)).toBe(3);
    const names = inputs(html).filter((i) => i.type === 'radio').map((i) => i.name);
    expect(names.length).toBe(3);
    expect(new Set(names).size).toBe(1);
    expect(checkedValue(html)).toEqual(['soft']);
  });
  it('is named by its label alone and described by its hint', () => {
    const labelled = html.match(/aria-labelledby="([^"]+)"/)![1];
    expect(html).toContain(`id="${labelled}">Corners`);
    expect(html).toMatch(/aria-describedby="[^"]+-hint"/);
  });
  it('shows an error under the choice', () => {
    const bad = renderToString(<SegmentedField label="Role" value="editor" onValueChange={noop} error="Pick a role" options={[{ value: 'editor', label: 'Editor' }, { value: 'admin', label: 'Admin' }]} />);
    expect(bad).toContain('role="alert"');
    expect(bad).toContain('Pick a role');
  });
});

describe('a choice known only at run time', () => {
  it('is segments for two to four short options, else a dropdown', () => {
    expect(fitsSegments([{ label: 'Top' }, { label: 'Centre' }, { label: 'Bottom' }])).toBe(true);
    expect(fitsSegments([{ label: 'One' }])).toBe(false);
    expect(fitsSegments(['a', 'b', 'c', 'd', 'e'].map((label) => ({ label })))).toBe(false);
    expect(fitsSegments([{ label: 'The look\'s own (Inside the margins)' }, { label: 'The whole page' }])).toBe(false);
    const short = renderToString(<ChoiceField label="Fills" value="page" onValueChange={noop} options={[{ value: 'page', label: 'The whole page' }, { value: 'margins', label: 'Inside the margins' }]} />);
    expect(radios(short)).toBe(2);
    const long = renderToString(<ChoiceField label="Logo" value="auto" onValueChange={noop} options={['A', 'B', 'C', 'D', 'E'].map((v) => ({ value: v, label: v }))} />);
    expect(radios(long)).toBe(0);
    expect(long).toContain('role="combobox"');
  });
});

describe('brand colour swatches', () => {
  const colours = { primary: '#2F6B5A', accent: '#FFB300', dark: '#1D2026', light: '#F3F1EC' };
  const sw = styleSwatches(colours, null, groundColours(colours));
  it('give each colour a photo can take the brand\'s own colour', () => {
    expect(sw.primary).toBe('#2F6B5A');
    expect(sw.accent).toBe('#FFB300');
    expect(sw.ink).toBe('#1D2026');
    expect(sw.dark).toBe('#1D2026');
    expect(sw.light).toBe('#ffffff');
  });
  it('are one radio group with one tab stop, on the chosen swatch, named in the brand\'s words', () => {
    const html = renderToString(<RolePicker label="Shadows in" value="accent" roles={['primary', 'accent', 'ink']} swatches={sw} wordOf={STYLE_COLOUR_WORD} onChange={noop} />);
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/tabindex="0"/g)?.length).toBe(1);
    expect(html).toMatch(/aria-checked="true" aria-label="Accent on dark"[^>]*tabindex="0"/);
    expect(html).toContain('aria-label="Accent on light"');
  });
});

const STYLE: StyleSettings = {
  direction: null,
  type: { display: { case: 'as-typed', tracking: null, weight: null, font: 'body' }, body: { case: 'as-typed', tracking: null, weight: null }, label: { case: 'upper', tracking: null, weight: null, font: 'mono' }, scale: 1, accent: 'series' },
  surface: 'shadow', decoration: { kind: 'dots', on: 'dark', alpha: null, fit: 'cover', opacity: 1 },
  photo: { treatment: 'duotone', strength: 0.5, colour: 'primary', shadows: 'dark', highlights: 'light' }, logo: 'auto', footer: 'website',
} as unknown as StyleSettings;

describe('Brand and look, Surfaces and photos', () => {
  const colours = { primary: '#2F6B5A', accent: '#FFB300', dark: '#1D2026', light: '#F3F1EC' };
  const html = renderToString(<MemoryRouter><LookFields style={STYLE} onChange={() => {}} artwork={null} busy={false} onArtwork={() => {}} onRemoveArtwork={() => {}} swatches={styleSwatches(colours, null, groundColours(colours))} /></MemoryRouter>);
  it('offers the small choices as segments', () => {
    for (const legend of ['Cards and panels', 'Decoration on', 'Photos', 'Beside the logo']) expect(html).toMatch(new RegExp(`<legend[^>]*>(<[^>]+>)*${legend}`));
    expect(checkedValue(html)).toEqual(expect.arrayContaining(['duotone', 'shadow', 'dark', 'website']));
  });
  it('offers the duotone colours as swatches, not lists of names', () => {
    expect(html.match(/role="radiogroup" aria-label="(Shadows in|Highlights in)"/g)?.length).toBe(2);
    expect(html).not.toMatch(/Shadows in<\/label>/);
  });
  it('keeps longer lists (the decoration, the logo\'s place) as dropdowns', () => {
    expect(html.match(/role="combobox"/g)?.length).toBe(2);
  });
});

describe('Brand and look, Type', () => {
  const html = renderToString(<TypeFields style={STYLE} headlineWeight={700} onChange={() => {}} fonts={{ body: null, display: null, label: null }} version="" busy="" onUpload={() => {}} onGoogle={() => {}} onRemove={() => {}} />);
  it('offers the case and the fonts as segments', () => {
    expect(html.match(/<legend[^>]*>(<[^>]+>)*Case/g)?.length).toBe(3);
    expect(html.match(/<legend[^>]*>(<[^>]+>)*Font/g)?.length).toBe(2);
    expect(html).toContain('title="The built-in mono (IBM Plex Mono)"');
  });
});

describe('the design editor', () => {
  it('has no native dropdown left, and asks where text stays as segments', async () => {
    const engine = await import('@vesk/engine/design/look' as string) as { lookCatalogue(): any };
    const cat = engine.lookCatalogue();
    const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'lib', 'design', 'looks');
    const { compositions, ...look } = JSON.parse(fs.readFileSync(path.join(dir, 'retail.look.json'), 'utf8'));
    const sw = swatchesFrom(null);
    for (const comp of compositions) {
      for (const r of listTree(comp, cat)) {
        const html = renderToString(<MemoryRouter><ElementProperties comp={comp} look={look} cat={cat} path={r.path} swatches={sw} advanced={false} readOnly={false} problems={[]} apply={noop as any} onSelect={noop as any} /></MemoryRouter>);
        // (Radix's own Select keeps a hidden native one for forms, aria-hidden; no native dropdown is shown)
        expect(html).not.toMatch(/<select(?![^>]*aria-hidden="true")/);
        expect(html).toContain('Shown only when');
      }
    }
    // "Text stays inside" sits behind the closed "More" of the design pane; its two choices are written as segments in the source
    const pane = fs.readFileSync(path.join(import.meta.dirname, '../web/src/pages/settings/looks/design/DesignPane.tsx'), 'utf8');
    expect(pane).toMatch(/<SegmentedField label="Text stays inside"/);
    void DesignSettings;
  });
});
