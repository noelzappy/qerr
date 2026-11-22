// Every part of the design editor drawn once (as static markup, with no browser) for every composition of both shipped looks, with and without a
// selection, in the sketch and over a picture: a smoke test that nothing throws on real data. How it behaves under the pointer was not run.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DesignCanvas } from '../web/src/pages/settings/looks/DesignCanvas';
import { DesignLayers } from '../web/src/pages/settings/looks/DesignLayers';
import { DesignSettings, ElementProperties } from '../web/src/pages/settings/looks/DesignProperties';
import { HealthPanel } from '../web/src/pages/settings/looks/DesignHealth';
import { designHealth } from '../web/src/pages/settings/looks/design-health';
import { listTree } from '../web/src/pages/settings/looks/design-model';
import { swatchesFrom } from '../web/src/pages/settings/looks/design-colours';

const engine = await import('@vesk/engine/design/look' as string) as any;
const cat = engine.lookCatalogue();
const dir = path.join(path.dirname(createRequire(import.meta.url).resolve('@vesk/engine/package.json')), 'lib', 'design', 'looks');
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.look.json`), 'utf8'));
const sw = swatchesFrom({ palette: { grounds: { light: '#fff', dark: '#111', soft: '#eee' }, text: { ink: '#000' }, accents: { primary: '#06f', gold: '#fc0' }, slabs: {}, surfaces: {} } } as any);
const noop = () => '';
const idle = { status: 'idle', image: '', rects: [], warnings: [], problems: [], fresh: false, error: '' } as any;
const ready = { status: 'ready', image: 'data:image/png;base64,AAAA', rects: [{ el: '0', x: 10, y: 10, w: 400, h: 300, rot: -2 }], warnings: ['w'], problems: [], fresh: true, error: '' } as any;

describe('the design editor draws every composition of both looks', () => {
  for (const n of ['retail', 'swiss']) {
    const look = load(n);
    const { compositions, ...settings } = look;
    for (const comp of compositions) {
      it(`${n}/${comp.kind}/${comp.name}`, () => {
        for (const [pv, view] of [[idle, 'sketch'], [ready, 'real']] as const) {
          for (const selected of [null, ...listTree(comp, cat).map((r) => r.path)]) {
            const html = renderToString(<DesignCanvas comp={comp} look={settings} cat={cat} selected={selected} onSelect={noop as any} onChange={noop as any} onGestureEnd={noop as any} onRemove={noop as any} onReorder={noop as any} onNotice={noop as any} preview={pv} view={view} showGrid readOnly={false} advanced swatches={sw} />);
            expect(html.length).toBeGreaterThan(100);
            if (selected) renderToString(<ElementProperties comp={comp} look={settings} cat={cat} path={selected} swatches={sw} advanced={false} readOnly={false} problems={[]} apply={noop as any} onSelect={noop as any} />);
            if (selected) renderToString(<ElementProperties comp={comp} look={settings} cat={cat} path={selected} swatches={sw} advanced readOnly problems={[]} apply={noop as any} onSelect={noop as any} />);
          }
        }
        renderToString(<DesignSettings comp={comp} look={settings} cat={cat} readOnly={false} apply={noop as any} problems={[]} />);
        renderToString(<DesignLayers comp={comp} look={settings} cat={cat} selected="0" onSelect={noop as any} readOnly={false} apply={noop as any} onRemove={noop as any} />);
        renderToString(<HealthPanel health={designHealth(comp, settings, cat)} warnings={['x']} />);
      });
    }
  }
});

// The choices of the three look capabilities (design/capabilities.tsx): a gradient area, a box with a gradient fill, a colour over the picture and a
// brand graphic each get their own visual group, with the exact values behind Fine-tune; nothing of theirs is left to the generic groups.
describe('the design editor offers gradients, colour over a picture and brand graphics as choices', () => {
  const settings = (() => { const { compositions, ...s } = load('retail'); void compositions; return s; })();
  const comp = {
    kind: 'photo', name: 'Capabilities', describe: 'Every capability.', ground: 'field', fields: { image: { required: true }, headline: { required: true, max: 68 } },
    elements: [
      { type: 'photo', place: { inset: 'page' } },
      { type: 'gradient', gradient: { kind: 'linear', stops: ['field', 'field-deep', 'dark'], angle: 135, mid: 40 }, place: { px: { x: 0, y: 900, w: 1080, h: 450 } } },
      { type: 'overlay', colour: 'ink', from: 'bottom', place: { inset: 'page' } },
      { type: 'graphic', ref: '0f8fad5b-d9cb-469f-a165-70867728950e', at: 'top-right', size: 'l', flip: true },
      { type: 'box', place: { px: { x: 56, y: 1000, w: 900, h: 300 } }, gradient: { kind: 'radial', stops: ['dark', 'ink'], at: 'left top' }, ink: 'white', children: [{ type: 'text', field: 'headline', style: 'display', size: 90 }] },
    ],
  };
  const pane = (path: string) => renderToString(<MemoryRouter><ElementProperties comp={comp} look={settings} cat={cat} path={path} swatches={sw} advanced={false} readOnly={false} problems={[]} apply={noop as any} onSelect={noop as any} /></MemoryRouter>);
  it('the catalogue has the three capabilities', () => {
    expect(Object.keys(cat.elements)).toEqual(expect.arrayContaining(['gradient', 'overlay', 'graphic']));
  });
  it('a gradient: kind, colours, direction', () => {
    const html = pane('1');
    for (const t of ['Gradient', 'Linear', 'Radial', 'From', 'Middle', 'To', 'Direction', 'Fine-tune']) expect(html).toContain(t);
    expect(html).toContain('aria-checked="true" title="Down to the right"');
  });
  it('a colour over the picture: where it is strongest and its colour', () => {
    const html = pane('2');
    for (const t of ['Colour over the picture', 'From the foot', 'From the top', 'Even', 'The words on it must read on this colour']) expect(html).toContain(t);
  });
  it('a brand graphic: which one, where, how big, mirrored', () => {
    const html = pane('3');
    for (const t of ['Graphic', 'Where on the page', 'Size', 'Mirror', 'On the edge', 'Place and size']) expect(html).toContain(t);
    expect(html).toContain('aria-checked="true" aria-label="Top right"');
    expect(html).not.toContain('>Position<');
  });
  it('a box with a gradient fill shows the gradient under its colour, not a single fill', () => {
    const html = pane('4');
    expect(html).toContain('Gradient fill');
    expect(html).toContain('Spreads from');
  });
});
