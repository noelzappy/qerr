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
