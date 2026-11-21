// The layout editor (Settings, Layouts): everything a brand's layout can say, edited visually: its name, kind of page, page colour
// (one, or cases chosen by conditions), sizes and the grid of each, its blocks (placed in cells or pixels on each size, with their
// options, what they show, the blocks inside a slab and the condition each is drawn on) and its fields. Every control is drawn
// from the engine's catalogue for the layout's kind of page, so it offers nothing the engine refuses; the JSON view shows the same
// layout as the engine reads it, and anything in it the editor could not show is listed. The engine's verdict is shown as people
// edit, the sketch follows the "sketch as if" switches, and the preview draws the real image with the brand.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Braces, Eye, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '../../api';
import { useDebounced } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { BusyButton, FieldGroup, FormPanel, Lines, Notice, SelectField, TextAreaField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BlockEditor, FieldsEditor, GridEditor, GroundEditor, ScenarioBar, SizesEditor } from './layout-controls';
import { LayoutSketch } from './LayoutSketch';
import {
  blockTitle, convertPage, defaultScenario, editableShape, fieldsShown, fullWidthPx, isBuiltPage, isFullWidth, pageCatalogue, pageKind, placeBy, pxOn, sizesOf,
  uncovered, withPlace, withSize, type Scenario,
} from './layout-model';
import { BLOCK_LABEL, type Block, type Catalogue, type Layout, type PreviewResult, type StoredLayout } from './layout-types';

const word = (v: string) => v.replace(/-/g, ' ');
const problemsOf = (err: unknown) => (err instanceof ApiError && err.details ? err.details.map((d) => d.message) : []);
const PAGE_LABEL: Record<string, string> = { grid: 'A grid of your own', poster: 'The built-in poster page', editorial: 'The built-in editorial page' };
export const PAGE_WORD: Record<string, string> = { poster: 'the poster page', editorial: 'the editorial page', photo: 'the photo post', grid: 'a grid' };

export function LayoutEditor({ initial, stored, catalogue, onSaved, onClose }: { initial: Layout; stored: StoredLayout | null; catalogue: Catalogue; onSaved: (l: StoredLayout) => void; onClose: () => void }) {
  const [layout, setLayout] = useState<Layout>(initial);
  const sizes = sizesOf(layout);
  const [size, setSize] = useState(sizes.includes('feed') ? 'feed' : sizes[0] ?? 'feed');
  const [selected, setSelected] = useState<number | null>(null);
  const [corner, setCorner] = useState<{ col: number; row: number } | null>(null);
  const [tab, setTab] = useState('editor');
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [newType, setNewType] = useState('');
  const [scenario, setScenario] = useState<Scenario>(() => defaultScenario(initial));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const checked = useDebounced(layout, 400);
  const seq = useRef(0);
  const page = pageCatalogue(catalogue, layout);
  const built = isBuiltPage(layout);
  const hidden = uncovered(layout, catalogue);

  // The engine's verdict as people edit.
  useEffect(() => {
    const mine = ++seq.current;
    api.post<{ problems: string[] }>('/api/settings/layouts/validate', { definition: checked })
      .then((r) => { if (mine === seq.current) setProblems(r.problems); })
      .catch((e) => { if (mine === seq.current) setProblems([errorMessage(e)]); });
  }, [checked]);
  useEffect(() => { if (tab === 'json') { setJson(JSON.stringify(layout, null, 2)); setJsonError(''); } }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!layout.canvas[size]) setSize(sizesOf(layout)[0] ?? 'feed'); }, [layout.canvas, size]); // eslint-disable-line react-hooks/exhaustive-deps

  const block = selected !== null ? layout.blocks[selected] ?? null : null;
  // A block changed, and the fields it now shows declared.
  const setBlock = (i: number, b: Block, declare?: string[]) => setLayout((l) => ({
    ...l, blocks: l.blocks.map((x, k) => (k === i ? b : x)), fields: declare?.length ? { ...l.fields, ...Object.fromEntries(declare.filter((f) => !l.fields[f]).map((f) => [f, {}])) } : l.fields,
  }));
  const move = (i: number, d: -1 | 1) => { const l = [...layout.blocks]; [l[i], l[i + d]] = [l[i + d], l[i]]; setLayout({ ...layout, blocks: l }); setSelected(i + d); };
  const onCell = (cell: { col: number; row: number }) => {
    if (selected === null || !block) return;
    if (!corner) { setCorner(cell); return; }
    const slot = { col: Math.min(corner.col, cell.col), row: Math.min(corner.row, cell.row), width: Math.abs(cell.col - corner.col) + 1, height: Math.abs(cell.row - corner.row) + 1 };
    setBlock(selected, withPlace(block, 'slot', size, slot, sizes));
    setCorner(null);
  };
  const blockTypes = Object.keys(page?.blocks ?? {});
  const addType = newType && blockTypes.includes(newType) ? newType : blockTypes.find((t) => t === 'headline') ?? blockTypes[0];
  const addBlock = () => {
    const spec = page?.blocks[addType];
    if (!spec) return;
    const b: Block = { type: addType };
    const S = catalogue.sizes[size] ?? { w: 1080, h: 1350 };
    if (!spec.chrome) {
      if (isFullWidth(b, spec)) b.px = fullWidthPx(Math.round(S.h * 0.6), S);
      else if (page!.place.includes('slot')) {
        const g = layout.canvas[size];
        Object.assign(b, withPlace(b, 'slot', size, { col: 1, row: Math.max(1, g.rows - 1), width: Math.min(4, g.columns), height: 1 }, sizes));
      } else b.px = { x: 80, y: 600, w: S.w - 160, h: 200 };
    }
    let declare: string[] = [];
    if (addType === 'label') b.text = 'Label';
    else if (spec.kinds.length) {
      // the block type's own field when it is free, else the first field it may show that no block shows yet
      const taken = fieldsShown(layout, catalogue);
      const f = spec.field && !taken.includes(spec.field) ? spec.field : spec.fields.find((x) => !taken.includes(x)) ?? spec.field ?? spec.fields[0];
      if (f !== spec.field) b.field = f;
      if (!layout.fields[f]) declare = [f];
    }
    if (spec.children) b.children = [];
    const next = { ...layout, blocks: [...layout.blocks, b], fields: { ...layout.fields, ...Object.fromEntries(declare.map((f) => [f, {}])) } };
    setLayout(next);
    setSelected(next.blocks.length - 1);
  };
  // A block an option makes full width (an editorial panel) runs the page's width down to its bottom edge from where it starts.
  const snapFullWidth = (b: Block): Block => {
    if (!isFullWidth(b, page?.blocks[b.type] ?? null)) return b;
    const S = catalogue.sizes[size] ?? { w: 1080, h: 1350 }, p = pxOn(b, size), want = fullWidthPx(p?.y ?? Math.round(S.h * 0.6), S);
    return p && p.x === want.x && p.w === want.w && p.h === want.h ? b : withPlace(b, 'px', size, want, sizes);
  };
  const toggleSize = (z: string, on: boolean) => { setLayout(withSize(layout, z, on, size, catalogue)); if (on) setSize(z); };
  const changePage = (to: string) => {
    if (to === pageKind(layout)) return;
    const { layout: next, dropped } = convertPage(layout, to, catalogue);
    setLayout(next);
    setSelected(null);
    toast.success(`Moved to ${PAGE_WORD[to] ?? to}${dropped.length ? `; left out what that page does not draw: ${dropped.map((t) => BLOCK_LABEL[t] ?? t).join(', ')}` : ''}`);
  };

  async function runPreview() {
    setBusy('preview');
    setPreview(null);
    const empty = scenario.empty.filter((f) => layout.fields[f]);
    const artefact = layout.fields.artefact && typeof scenario.choices.artefact === 'string' ? scenario.choices.artefact : undefined;
    try { setPreview(await api.post<PreviewResult>('/api/settings/layouts/preview', { definition: layout, size, ...(empty.length ? { empty } : {}), ...(artefact ? { artefact } : {}) })); }
    catch (e) { setPreview({ ok: false, size, error: errorMessage(e), warnings: problemsOf(e), notes: [] }); }
    finally { setBusy(''); }
  }
  async function save() {
    setBusy('save');
    setError('');
    try {
      const r = stored
        ? await api.put<{ layout: StoredLayout }>(`/api/settings/layouts/${stored.id}`, { definition: layout })
        : await api.post<{ layout: StoredLayout }>('/api/settings/layouts', { definition: layout });
      toast.success(stored ? 'Layout saved' : 'Layout added');
      onSaved(r.layout);
    } catch (e) {
      setError(errorMessage(e));
      const lines = problemsOf(e);
      if (lines.length) setProblems(lines);
    } finally { setBusy(''); }
  }
  function applyJson() {
    try {
      const parsed = JSON.parse(json) as unknown;
      const why = editableShape(parsed);
      if (why) throw new Error(why);
      setLayout(parsed as Layout);
      setScenario(defaultScenario(parsed as Layout));
      setSelected(null);
      setJsonError('');
      toast.success('Applied; the editor shows the new layout');
    } catch (e) { setJsonError(errorMessage(e)); }
  }

  const clickHint = selected === null ? 'Click a block to change it.'
    : !block || placeBy(block) === 'px' || built ? 'Set the selected block\'s place in pixels under Place.'
      : corner ? `First corner at column ${corner.col}, row ${corner.row}: click the opposite corner.` : 'Click two cells to place the selected block.';
  return (
    <FormPanel open onClose={onClose} size="xl" busy={busy === 'save'} title={stored ? `Edit ${stored.name}` : 'New layout'}
      description="Place blocks, set their options and the conditions they are drawn on. The sketch moves as you edit; the preview draws the real image with the brand and runs every check."
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy === 'save'}>Cancel</Button>
          <BusyButton variant="outline" loading={busy === 'preview'} onClick={() => void runPreview()}><Eye aria-hidden="true" /> Preview</BusyButton>
          <BusyButton loading={busy === 'save'} disabled={problems.length > 0} onClick={() => void save()}>{stored ? 'Save' : 'Add layout'}</BusyButton>
        </>
      )}>
      <div className="flex min-w-0 flex-col gap-5">
        {error && <Notice tone="bad">{error}</Notice>}
        {problems.length > 0
          ? <Notice tone="warn" title="The engine would not accept this layout yet:"><Lines items={problems.slice(0, 12)} />{problems.length > 12 && <p className="mt-1 text-[12.5px]">and {problems.length - 12} more</p>}</Notice>
          : <Notice tone="good">The engine accepts this layout.</Notice>}
        {hidden.length > 0 && (
          <Notice tone="warn" title="Settings the editor cannot show (the engine refuses them for a brand's layout); change or remove them in the JSON view:">
            <Lines items={hidden.slice(0, 12)} />
          </Notice>
        )}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="editor">Editor</TabsTrigger><TabsTrigger value="json"><Braces aria-hidden="true" /> JSON</TabsTrigger></TabsList>
          <TabsContent value="editor" className="mt-4 flex min-w-0 flex-col gap-5">
            {!page
              ? <Notice tone="bad">A brand's layout is drawn on {Object.keys(catalogue.pages).join(', ')} pages; change its "page" in the JSON view.</Notice>
              : (
                <>
                  <FieldGroup legend="The layout">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Name" value={layout.name ?? ''} maxLength={catalogue.layout.name.max} onChange={(e) => setLayout({ ...layout, name: e.target.value })} />
                      <TextField label="Id" mono hint="What a post's design names: lowercase letters, digits and -" value={layout.id ?? ''} maxLength={catalogue.layout.id.max} onChange={(e) => setLayout({ ...layout, id: e.target.value })} />
                      <TextAreaField className="sm:col-span-2" label="Description" optional rows={2} maxLength={catalogue.layout.description.max} hint="For your team and the AI: what this layout is for."
                        value={layout.description ?? ''} onChange={(e) => { const { description: _d, ...rest } = layout; setLayout(e.target.value ? { ...layout, description: e.target.value } : rest as Layout); }} />
                      <SelectField label="Kind of page" value={pageKind(layout)} onValueChange={changePage} options={Object.keys(catalogue.pages).map((p) => ({ value: p, label: PAGE_LABEL[p] ?? p }))}
                        hint={built ? 'Drawn with the built-in look; blocks sit at pixel rectangles on the feed page and the page places its chrome.' : 'Blocks in grid cells (or pixels), at the sizes you choose.'} />
                      <SelectField label="Second half of the headline" value={layout.accent ?? 'series'} onValueChange={(v) => setLayout({ ...layout, accent: v })}
                        options={catalogue.layout.accents.map((a) => ({ value: a, label: a === 'series' ? "The brand's style" : word(a) }))} />
                      <SelectField label="Texture" value={layout.texture ?? 'auto'} onValueChange={(v) => setLayout({ ...layout, texture: v })} options={catalogue.textures.map((t) => ({ value: t, label: t === 'auto' ? "The brand's style" : word(t) }))} />
                    </div>
                  </FieldGroup>
                  <GroundEditor layout={layout} catalogue={catalogue} onChange={setLayout} />
                  <SizesEditor layout={layout} size={size} setSize={setSize} catalogue={catalogue} onToggle={toggleSize} />
                  {layout.canvas[size] && (
                    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                      <div className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-0 lg:max-h-[85dvh] lg:self-start lg:overflow-y-auto">
                        <LayoutSketch layout={layout} size={size} catalogue={catalogue} selected={selected} scenario={scenario}
                          onSelect={(i) => { setSelected(i); setCorner(null); }} onCell={selected !== null && block && !built && placeBy(block) !== 'px' ? onCell : undefined} />
                        <p className="text-[12.5px] text-muted-foreground">{clickHint}</p>
                        <ScenarioBar layout={layout} catalogue={catalogue} scenario={scenario} onChange={setScenario} />
                        {preview && (
                          <div className="flex flex-col gap-2">
                            {preview.image && <img src={preview.image} alt={`Preview of the layout at ${preview.size} size`} className="w-full rounded-md border" />}
                            {preview.error && <Notice tone="bad">{preview.error}</Notice>}
                            {preview.warnings.length > 0 && <Notice tone="warn" title="Checks:"><Lines items={preview.warnings} /></Notice>}
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col gap-4">
                        <FieldGroup legend="Blocks" hint="Listed from the back to the front. A block with a condition says when it is drawn.">
                          <ul className="flex flex-col gap-1">
                            {layout.blocks.map((b, i) => (
                              <li key={i} className="flex items-center gap-1">
                                <Button size="sm" variant={selected === i ? 'secondary' : 'ghost'} aria-expanded={selected === i} className="h-auto min-h-8 min-w-0 flex-1 justify-start whitespace-normal py-1 text-left"
                                  onClick={() => { setSelected(selected === i ? null : i); setCorner(null); }}>
                                  {blockTitle(b)}
                                </Button>
                                <Button size="icon" variant="ghost" aria-label={`Move ${blockTitle(b)} back`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                                <Button size="icon" variant="ghost" aria-label={`Move ${blockTitle(b)} forward`} disabled={i === layout.blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                                <Button size="icon" variant="ghost" aria-label={`Remove ${blockTitle(b)}`} onClick={() => { setLayout({ ...layout, blocks: layout.blocks.filter((_, k) => k !== i) }); setSelected(null); }}><Trash2 /></Button>
                              </li>
                            ))}
                          </ul>
                          {layout.blocks.length < catalogue.limits.blocks && (
                            <div className="flex flex-wrap items-end gap-2">
                              <SelectField className="min-w-44 flex-1" label="Add a block" value={addType} onValueChange={setNewType} options={blockTypes.map((t) => ({ value: t, label: BLOCK_LABEL[t] ?? t }))} />
                              <Button variant="outline" onClick={addBlock}><Plus /> Add</Button>
                            </div>
                          )}
                        </FieldGroup>
                        {block && selected !== null && (
                          <FieldGroup legend={blockTitle(block)}>
                            <BlockEditor key={selected} block={block} layout={layout} size={size} setSize={setSize} catalogue={catalogue}
                              onChange={(b, declare) => setBlock(selected, snapFullWidth(b), declare)} />
                          </FieldGroup>
                        )}
                      </div>
                    </div>
                  )}
                  {layout.canvas[size] && <GridEditor layout={layout} size={size} catalogue={catalogue} onChange={setLayout} />}
                  <FieldsEditor layout={layout} catalogue={catalogue} onChange={setLayout} />
                </>
              )}
          </TabsContent>
          <TabsContent value="json" className="mt-4 flex flex-col gap-3">
            <p className="text-[13px] text-muted-foreground">The layout exactly as the engine reads it. Edit it here and apply it; the editor then shows it, and the engine checks it like any other change.</p>
            <TextAreaField label="Layout JSON" mono rows={24} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} error={jsonError || undefined} />
            <div><Button variant="outline" onClick={applyJson}>Apply the JSON</Button></div>
          </TabsContent>
        </Tabs>
      </div>
    </FormPanel>
  );
}
