// The art layer and a post's own design in the web app: the design editor adds art at the back of the page with one quiet shape and edits its
// shapes (colour, strength, moves, size, delete) through the catalogue, the post card tags an AI-designed post, and a design the engine refuses
// is refused by the editor's own model first. Drawn as static markup; the edits run through the same model the editor uses.
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { addElement, listTree, setProp, type Json } from '../web/src/pages/settings/looks/design-model';
import { ElementProperties } from '../web/src/pages/settings/looks/DesignProperties';
import { AiDesignTag } from '../web/src/pages/batches/PostCard';
import type { LookCatalogue } from '../web/src/pages/settings/looks/look-types';
import { engineImport } from './server/engine/root.js';

const engine = async () => {
  const look = await engineImport<{ lookCatalogue(): LookCatalogue; validateLook(l: unknown, w?: string): string[] }>('design/look');
  const dirs = await engineImport<{ shippedLooks(): Record<string, Json> }>('design/directions/index');
  const clean = JSON.parse(JSON.stringify(dirs.shippedLooks().clean)) as Json;
  clean.origin = 'copy:shipped:clean';
  const { compositions, ...settings } = clean;
  return { cat: look.lookCatalogue(), validateLook: look.validateLook, clean, settings: settings as Json, statement: JSON.parse(JSON.stringify((compositions as Json[]).find((c) => c.kind === 'statement'))) as Json };
};

describe('the art layer in the design editor', () => {
  it('is added at the back of the page with one quiet shape, and the look with it is valid', async () => {
    const { cat, settings, statement, validateLook, clean } = await engine();
    const e = addElement(statement, 'art', settings, cat);
    expect(e.error).toBeUndefined();
    const art = (e.comp.elements as Json[])[0]!;
    expect(art).toMatchObject({ type: 'art', place: { inset: 'page' } });
    expect((art.shapes as Json[]).length).toBe(1);
    expect(validateLook({ ...clean, compositions: [e.comp] }, 'look')).toEqual([]);
    expect(listTree(e.comp, cat)[0]).toMatchObject({ type: 'art' });
    // a box cannot hold it
    const boxAt = (e.comp.elements as Json[]).findIndex((x) => x.type === 'box');
    expect(addElement(e.comp, 'art', settings, cat, String(boxAt)).error).toMatch(/goes on the page/);
  });

  it('edits shapes through the catalogue: a hex colour, a shape that does not exist and a strength out of range are refused', async () => {
    const { cat, settings, statement } = await engine();
    const comp = addElement(statement, 'art', settings, cat).comp;
    const shapes = (comp.elements as Json[])[0]!.shapes as Json[];
    expect(setProp(comp, '0', 'shapes', [{ ...shapes[0], colour: 'accent', opacity: 0.4 }], cat, settings).error).toBeUndefined();
    expect(setProp(comp, '0', 'shapes', [{ ...shapes[0], colour: '#ff0000' }], cat, settings).error).toBeTruthy();
    expect(setProp(comp, '0', 'shapes', [{ shape: 'star', cx: 1, cy: 1, r: 1 }], cat, settings).error).toBeTruthy();
    expect(setProp(comp, '0', 'shapes', [{ ...shapes[0], opacity: 2 }], cat, settings).error).toBeTruthy();
    expect(setProp(comp, '0', 'shapes', [], cat, settings).error).toBeTruthy();
  });

  it('shows the shapes as choices, with colour, strength, moves, size and delete, and the exact values behind Fine-tune', async () => {
    const { cat, settings, statement } = await engine();
    const comp = addElement(statement, 'art', settings, cat).comp;
    const html = renderToString(<ElementProperties comp={comp} look={settings} cat={cat} path="0" swatches={{}} advanced={false} readOnly={false} problems={[]} apply={() => ''} onSelect={() => undefined} />);
    expect(html).toContain('1 Circle');
    for (const w of ['Add a shape', 'Strength', 'Move left', 'Larger', 'Delete shape', 'Fine-tune']) expect(html).toContain(w);
  });
});

describe('a post card of an AI-designed post', () => {
  it('carries a small tag, or says the AI design was not used when a check refused it; a look-designed post carries none', () => {
    expect(renderToString(<AiDesignTag ai used />)).toContain('AI-designed');
    expect(renderToString(<AiDesignTag ai used={false} />)).toContain('AI design not used');
    expect(renderToString(<AiDesignTag ai={false} used />)).toBe('');
  });
});
