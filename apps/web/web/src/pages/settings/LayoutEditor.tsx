// The layout editor (Settings, Layouts), a page of its own: everything a brand's layout can say, edited visually.
//
//   header   back to the list, the layout's name, whether it is ready to use (and what to fix), whether there are unsaved
//            changes, and the actions: Advanced JSON, Cancel, Preview, Save
//   left     the blocks (add, reorder, remove with Undo) and the fields a post fills in
//   centre   the canvas: the layout's grid drawn large at one size, with the sizes it is made at; blocks are dragged and resized
//            on it. The real image (the preview) has a fixed place of its own, a "Real image" view of the same box, so showing
//            it never moves the controls
//   right    the settings of the selected block, or of the whole layout when no block is selected
//
// Under the `lg` breakpoint the three regions stack as tabs (Blocks, Canvas, Settings) and the header stays in view. Every control is
// drawn from the engine's catalogue for the layout's kind of page, so it offers nothing the engine refuses; the Advanced JSON view
// shows the same layout as the engine reads it, and anything in it the editor could not show is listed there. The engine's verdict is
// shown as people edit (a debounced check), the sketch follows the "sketch as if" switches, and the preview draws the real image
// with the brand. Nothing here decides what is valid.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Braces, CircleCheck, Eye, ImageIcon, Plus, Save, Trash2, TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, api } from '../../api';
import { useDebounced, useDocumentTitle } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { Breadcrumbs, BusyButton, FieldGroup, Hint, Lines, Notice, SelectField, TextAreaField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { cn } from '@/lib/utils';
import { BlockEditor, FieldsEditor, ScenarioBar, SizesMenu } from './layout-controls';
import { LayoutSketch, type SketchEdit } from './LayoutSketch';
import {
  blockTitle, conditionsUsed, convertPage, defaultScenario, editableShape, fieldsShown, freeId, fullWidthPx, idFromName, isBuiltPage, isFullWidth, pageCatalogue,
  pageKind, previewPage, pxOn, sizesOf, sketchPages, SKETCH_PAGE_WORDS, specFor, uncovered, withPlace, withSize, type Scenario,
} from './layout-model';
import { BLOCK_LABEL, type Block, type Catalogue, type Layout, type PreviewResult, type StoredLayout } from './layout-types';
import { PageSettings } from './layouts/PageSettings';
import { PAGE_WORD, sizeName } from './layouts/words';

export { PAGE_WORD } from './layouts/words';

const problemsOf = (err: unknown) => (err instanceof ApiError && err.details ? err.details.map((d) => d.message) : []);
type Tab = 'blocks' | 'canvas' | 'settings';

// A few buttons side by side of which one is on.
function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex rounded-md border bg-muted/40 p-0.5', className)}>
      {options.map((o) => (
        <Button key={o.value} size="sm" variant={o.value === value ? 'secondary' : 'ghost'} aria-pressed={o.value === value} className={cn('h-7 flex-1 px-3 max-sm:h-9', o.value === value && 'bg-background shadow-sm hover:bg-background')} onClick={() => onChange(o.value)}>{o.label}</Button>
      ))}
    </div>
  );
}

export function LayoutEditor({ initial, stored, catalogue, takenIds, onSaved }: { initial: Layout; stored: StoredLayout | null; catalogue: Catalogue; takenIds: string[]; onSaved: (l: StoredLayout) => void }) {
  const navigate = useNavigate();
  useDocumentTitle(stored ? `Edit ${stored.name}` : 'New layout');
  const [layout, setLayout] = useState<Layout>(initial);
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const [idTouched, setIdTouched] = useState(!!stored);
  const sizes = sizesOf(layout);
  const [size, setSize] = useState(sizes.includes('feed') ? 'feed' : sizes[0] ?? 'feed');
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('canvas');
  const [view, setView] = useState<'sketch' | 'real'>('sketch');
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [showProblems, setShowProblems] = useState(false);
  const [newType, setNewType] = useState('');
  const [scenario, setScenario] = useState<Scenario>(() => defaultScenario(initial));
  const [preview, setPreview] = useState<{ result: PreviewResult; of: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const checked = useDebounced(layout, 400);
  const seq = useRef(0);
  const page = pageCatalogue(catalogue, layout);
  const built = isBuiltPage(layout);
  const hidden = useMemo(() => uncovered(layout, catalogue), [layout, catalogue]);
  const current = useMemo(() => JSON.stringify(layout), [layout]);
  const dirty = current !== baseline;
  useUnsavedGuard(dirty);
  const settled = checked === layout;
  const S = catalogue.sizes[size] ?? { w: 1080, h: 1350 };

  // The verdict on the layout as people edit.
  useEffect(() => {
    const mine = ++seq.current;
    api.post<{ problems: string[] }>('/api/settings/layouts/validate', { definition: checked })
      .then((r) => { if (mine === seq.current) setProblems(r.problems); })
      .catch((e) => { if (mine === seq.current) setProblems([errorMessage(e)]); });
  }, [checked]);
  useEffect(() => { if (!layout.canvas[size]) setSize(sizesOf(layout)[0] ?? 'feed'); }, [layout.canvas, size]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!page) setAdvanced(true); }, [page]);

  const block = selected !== null ? layout.blocks[selected] ?? null : null;
  const select = (i: number | null) => { setSelected(i); if (i !== null) setTab((t) => (t === 'blocks' ? 'settings' : t)); };

  // A block changed, and the fields it now shows declared.
  const setBlock = (i: number, b: Block, declare?: string[]) => setLayout((l) => ({
    ...l, blocks: l.blocks.map((x, k) => (k === i ? b : x)), fields: declare?.length ? { ...l.fields, ...Object.fromEntries(declare.filter((f) => !l.fields[f]).map((f) => [f, {}])) } : l.fields,
  }));
  const move = (i: number, d: -1 | 1) => { const l = [...layout.blocks]; [l[i], l[i + d]] = [l[i + d], l[i]]; setLayout({ ...layout, blocks: l }); setSelected(i + d); };
  // A block an option makes full width (an editorial panel) runs the page's width down to its bottom edge from where it starts.
  const snapFullWidth = (b: Block): Block => {
    if (!isFullWidth(b, page?.blocks[b.type] ?? null)) return b;
    const p = pxOn(b, size), want = fullWidthPx(p?.y ?? Math.round(S.h * 0.6), S);
    return p && p.x === want.x && p.w === want.w && p.h === want.h ? b : withPlace(b, 'px', size, want, sizes);
  };

  const removeBlock = (i: number) => {
    const b = layout.blocks[i];
    if (!b) return;
    setLayout((l) => ({ ...l, blocks: l.blocks.filter((_, k) => k !== i) }));
    setSelected(null);
    toast(`Removed ${blockTitle(b)}`, {
      action: { label: 'Undo', onClick: () => { setLayout((l) => { const blocks = [...l.blocks]; blocks.splice(Math.min(i, blocks.length), 0, b); return { ...l, blocks }; }); setSelected(i); } },
    });
  };
  const edit: SketchEdit = {
    onPlace: (i, p) => setLayout((l) => {
      const b = l.blocks[i];
      if (!b) return l;
      const moved = 'slot' in p ? withPlace(b, 'slot', size, p.slot, sizesOf(l)) : withPlace(b, 'px', size, p.px, sizesOf(l));
      return { ...l, blocks: l.blocks.map((x, k) => (k === i ? snapFullWidth(moved) : x)) };
    }),
    onRemove: removeBlock,
    fullWidth: (i) => { const b = layout.blocks[i]; return !!b && isFullWidth(b, specFor(catalogue, layout, b.type)); },
  };

  const blockTypes = Object.keys(page?.blocks ?? {});
  const addType = newType && blockTypes.includes(newType) ? newType : blockTypes.find((t) => t === 'headline') ?? blockTypes[0];
  const addBlock = () => {
    const spec = page?.blocks[addType];
    if (!spec) return;
    const b: Block = { type: addType };
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
  const toggleSize = (z: string, on: boolean) => { setLayout(withSize(layout, z, on, size, catalogue)); if (on) setSize(z); };
  const changePage = (to: string) => {
    if (to === pageKind(layout)) return;
    const { layout: next, dropped } = convertPage(layout, to, catalogue);
    setLayout(next);
    setSelected(null);
    toast.success(`Moved to ${PAGE_WORD[to] ?? to}${dropped.length ? `; left out what that page does not draw: ${dropped.map((t) => BLOCK_LABEL[t] ?? t).join(', ')}` : ''}`);
  };
  const setName = (name: string) => setLayout((l) => ({ ...l, name, ...(idTouched ? {} : { id: freeId(idFromName(name, catalogue.layout.id.max), takenIds, catalogue.layout.id.max) }) }));
  const setId = (id: string) => { setIdTouched(true); setLayout((l) => ({ ...l, id })); };

  async function runPreview() {
    setBusy('preview');
    setView('real');
    setTab('canvas');
    const empty = scenario.empty.filter((f) => layout.fields[f]);
    const artefact = layout.fields.artefact && typeof scenario.choices.artefact === 'string' ? scenario.choices.artefact : undefined;
    // as that page of a carousel, when the sketch shows one (a carousel page is drawn at the feed size)
    const page = sketchPages(layout).includes(scenario.page) ? previewPage(scenario.page) : undefined;
    const of = current;
    try { setPreview({ of, result: await api.post<PreviewResult>('/api/settings/layouts/preview', { definition: layout, size, ...(empty.length ? { empty } : {}), ...(artefact ? { artefact } : {}), ...(page ? { page } : {}) }) }); }
    catch (e) { setPreview({ of, result: { ok: false, size, error: errorMessage(e), warnings: problemsOf(e), notes: [] } }); }
    finally { setBusy(''); }
  }
  async function save() {
    setBusy('save');
    setError('');
    try {
      const r = stored
        ? await api.put<{ layout: StoredLayout }>(`/api/settings/layouts/${stored.id}`, { definition: layout })
        : await api.post<{ layout: StoredLayout }>('/api/settings/layouts', { definition: layout });
      setBaseline(current);
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
  const toggleAdvanced = () => { if (!advanced) { setJson(JSON.stringify(layout, null, 2)); setJsonError(''); } setAdvanced(!advanced); };

  const saveWhy = problems.length ? 'Fix what the layout needs before you save it.' : !settled ? 'Checking the layout.' : '';
  const stale = preview !== null && preview.of !== current;
  const shownPreview = preview && preview.result.size === size ? preview : null;
  const ratio = S.w / S.h;
  const canvasWidth = `min(100%, max(18rem, calc((100dvh - 19rem) * ${ratio})))`;
  const hasConditions = conditionsUsed(layout).length > 0;

  const blocksRegion = (
    <div className="flex min-w-0 flex-col gap-4">
      <FieldGroup legend="Blocks" hint="From the back to the front. A block with a condition says when it is drawn.">
        {layout.blocks.length === 0 && <p className="text-[13px] text-muted-foreground">No blocks yet. Add one below.</p>}
        <ul className="flex flex-col gap-1">
          {layout.blocks.map((b, i) => (
            <li key={i} className="flex items-center gap-0.5">
              <Button size="sm" variant={selected === i ? 'secondary' : 'ghost'} aria-pressed={selected === i} className="h-auto min-h-8 min-w-0 flex-1 justify-start whitespace-normal py-1 text-left"
                onClick={() => select(selected === i ? null : i)}>
                {blockTitle(b)}
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Move ${blockTitle(b)} back`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Move ${blockTitle(b)} forward`} disabled={i === layout.blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button size="icon-sm" variant="ghost" aria-label={`Remove ${blockTitle(b)}`} onClick={() => removeBlock(i)}><Trash2 /></Button>
            </li>
          ))}
        </ul>
        {layout.blocks.length < catalogue.limits.blocks && (
          <div className="flex flex-wrap items-end gap-2">
            <SelectField className="min-w-36 flex-1" label="Add a block" value={addType} onValueChange={setNewType} options={blockTypes.map((t) => ({ value: t, label: BLOCK_LABEL[t] ?? t }))} />
            <Button variant="outline" onClick={addBlock}><Plus aria-hidden="true" /> Add</Button>
          </div>
        )}
      </FieldGroup>
      <FieldsEditor layout={layout} catalogue={catalogue} onChange={setLayout}
        onRemoved={(name, rule) => toast(`Removed the field ${name}`, { action: { label: 'Undo', onClick: () => setLayout((l) => (l.fields[name] ? l : { ...l, fields: { ...l.fields, [name]: rule } })) } })} />
    </div>
  );

  const canvasRegion = (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {sizes.length > 1 && (
          <Segmented label="The size being edited" value={size} onChange={(z) => setSize(z)} options={sizes.map((z) => ({ value: z, label: sizeName(z) }))} />
        )}
        {sizes.length === 1 && <span className="text-[13px] font-medium">{sizeName(size)} ({S.w} x {S.h})</span>}
        {page && <SizesMenu layout={layout} catalogue={catalogue} onToggle={toggleSize} />}
        <div className="ml-auto flex items-center gap-2">
          {view === 'real' && stale && <span className="text-[12.5px] text-muted-foreground">Changed since this image was made</span>}
          <Segmented label="What the canvas shows" value={view} onChange={setView} options={[{ value: 'sketch', label: 'Sketch' }, { value: 'real', label: 'Real image' }]} />
        </div>
      </div>
      <div className="mx-auto w-full" style={{ maxWidth: canvasWidth, width: canvasWidth }}>
        {view === 'sketch' || !page
          ? (layout.canvas[size]
            ? <LayoutSketch layout={layout} size={size} catalogue={catalogue} selected={selected} scenario={scenario} onSelect={select} edit={edit} />
            : <div className="grid aspect-[4/5] place-items-center rounded-md border text-[13px] text-muted-foreground">This size is off. Turn it on under Sizes.</div>)
          : (
            <div className="relative grid place-items-center overflow-hidden rounded-md border bg-muted/30" style={{ aspectRatio: `${S.w} / ${S.h}` }}>
              {shownPreview?.result.image
                ? <img src={shownPreview.result.image} alt={`The real image at ${size} size${shownPreview.result.page ? `, as ${(SKETCH_PAGE_WORDS[shownPreview.result.page] ?? '').toLowerCase()}` : ''}`} className="size-full object-contain" />
                : (
                  <div className="flex flex-col items-center gap-3 p-6 text-center text-[13px] text-muted-foreground">
                    <ImageIcon className="size-8" aria-hidden="true" />
                    <p>{busy === 'preview' ? 'Making the image...' : shownPreview?.result.error ? 'The image could not be made. See the checks below.' : `No image for the ${sizeName(size)} size yet.`}</p>
                    <BusyButton variant="outline" loading={busy === 'preview'} onClick={() => void runPreview()}><Eye aria-hidden="true" /> Preview this size</BusyButton>
                  </div>
                )}
            </div>
          )}
      </div>
      <div className="flex min-w-0 flex-col gap-2" aria-live="polite">
        {view === 'real' && busy === 'preview' && shownPreview?.result.image && <p className="text-[12.5px] text-muted-foreground">Making the image again...</p>}
        {shownPreview?.result.error && <Notice tone="bad">{shownPreview.result.error}</Notice>}
        {shownPreview && shownPreview.result.warnings.length > 0 && <div className="max-h-44 overflow-y-auto"><Notice tone="warn" title="Checks:"><Lines items={shownPreview.result.warnings} /></Notice></div>}
        {shownPreview?.result.ok && shownPreview.result.warnings.length === 0 && !stale && <Notice tone="good">The image passed every check.</Notice>}
      </div>
      {(hasConditions || sketchPages(layout).length > 1) && (
        <details>
          <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground">Sketch as if</summary>
          <div className="mt-2"><ScenarioBar layout={layout} catalogue={catalogue} scenario={scenario} onChange={setScenario} /></div>
        </details>
      )}
    </div>
  );

  const settingsRegion = (
    <div className="@container flex min-w-0 flex-col gap-4">
      {block && selected !== null
        ? (
          <>
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 text-sm font-semibold">Block settings</h2>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Page settings</Button>
            </div>
            <FieldGroup legend={blockTitle(block)}>
              <BlockEditor key={selected} block={block} layout={layout} size={size} setSize={setSize} catalogue={catalogue}
                onChange={(b, declare) => setBlock(selected, snapFullWidth(b), declare)} />
            </FieldGroup>
          </>
        )
        : (
          <>
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-semibold">Page settings</h2>
              <Hint about="Page settings">Select a block on the canvas or in the list to change it.</Hint>
            </div>
            {page
              ? <PageSettings layout={layout} catalogue={catalogue} size={size} onChange={setLayout} onName={setName} onId={setId} onPage={changePage} />
              : <Notice tone="bad">A brand's layout is made on {Object.keys(catalogue.pages).join(', ')} pages. Change its "page" under Advanced: JSON.</Notice>}
          </>
        )}
    </div>
  );

  const region = (name: Tab, node: ReactNode, extra?: string) => (
    <section aria-label={{ blocks: 'Blocks', canvas: 'Canvas', settings: 'Settings' }[name]} className={cn('min-w-0', tab !== name && 'max-lg:hidden', extra)}>{node}</section>
  );

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[88rem] flex-col gap-4 pb-10">
      <header className="sticky top-0 z-30 -mx-1 flex flex-col gap-2 border-b bg-background px-1 pb-2 pt-1">
        <Breadcrumbs items={[{ label: 'Settings', to: '/settings/preferences' }, { label: 'Classic layouts', to: '/settings/layouts' }, { label: layout.name?.trim() || stored?.name || 'New layout' }]} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Input aria-label="Layout name" value={layout.name ?? ''} maxLength={catalogue.layout.name.max} placeholder="Name this layout" onChange={(e) => setName(e.target.value)}
            className="-ml-2 h-9 min-w-40 flex-1 border-transparent bg-transparent px-2 text-[19px] font-semibold tracking-tight shadow-none md:text-[19px] hover:border-input focus-visible:border-ring sm:max-w-md" />
          {dirty && <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] text-warning-foreground"><span className="size-2 rounded-full bg-warning" aria-hidden="true" /> Unsaved changes</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant={advanced ? 'secondary' : 'ghost'} size="sm" aria-pressed={advanced} onClick={toggleAdvanced}><Braces aria-hidden="true" /> Advanced: JSON</Button>
            <Button variant="outline" onClick={() => navigate('/settings/layouts')} disabled={busy === 'save'}>Cancel</Button>
            <BusyButton variant="outline" loading={busy === 'preview'} onClick={() => void runPreview()}><Eye aria-hidden="true" /> Preview</BusyButton>
            <BusyButton loading={busy === 'save'} disabled={!!saveWhy} title={saveWhy || undefined} aria-describedby={saveWhy ? 'save-why' : undefined} onClick={() => void save()}>
              <Save aria-hidden="true" /> {stored ? 'Save' : 'Add layout'}
            </BusyButton>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {problems.length === 0
            ? <span className="inline-flex items-center gap-1.5 text-success"><CircleCheck className="size-4" aria-hidden="true" /> {settled ? 'This layout is ready to use' : 'Checking this layout...'}</span>
            : (
              <>
                <span className="inline-flex items-center gap-1.5 font-medium text-warning-foreground"><TriangleAlert className="size-4" aria-hidden="true" /> This layout needs fixing:</span>
                <span className="min-w-0 max-w-[60ch] truncate">{problems[0]}</span>
                {problems.length > 1 && <Button size="sm" variant="ghost" className="h-6 px-2 text-[12.5px]" aria-expanded={showProblems} onClick={() => setShowProblems(!showProblems)}>{showProblems ? 'Hide' : `Show all ${problems.length}`}</Button>}
                <span id="save-why" className="text-muted-foreground">{saveWhy}</span>
              </>
            )}
          {problems.length === 0 && saveWhy && <span id="save-why" className="sr-only">{saveWhy}</span>}
          {hidden.length > 0 && <span className="text-muted-foreground">{hidden.length} setting{hidden.length === 1 ? '' : 's'} the editor cannot show: see Advanced: JSON.</span>}
          {error && <span role="alert" className="font-medium text-destructive">{error}</span>}
          {showProblems && problems.length > 1 && (
            <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-full max-w-3xl overflow-y-auto rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
              <Lines items={problems.slice(0, 30)} className="mt-0" />
              {problems.length > 30 && <p className="mt-1 text-[12.5px]">and {problems.length - 30} more</p>}
            </div>
          )}
        </div>
        <div className="lg:hidden">
          <Segmented<Tab> label="Part of the editor" className="w-full" value={tab} onChange={setTab} options={[{ value: 'blocks', label: 'Blocks' }, { value: 'canvas', label: 'Canvas' }, { value: 'settings', label: 'Settings' }]} />
        </div>
      </header>

      {advanced && (
        <div className="flex flex-col gap-3 border-b pb-4">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold">Advanced: JSON</h2>
            <Hint about="Advanced: JSON">The layout exactly as Vesk reads it. Edit it here and apply it; the editor then shows it, and Vesk checks it like any other change.</Hint>
          </div>
          {hidden.length > 0 && (
            <Notice tone="warn" title="Settings the editor cannot show (Vesk refuses them for a brand's layout); change or remove them here:">
              <Lines items={hidden.slice(0, 12)} />
            </Notice>
          )}
          <TextAreaField label="Layout JSON" mono rows={16} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} error={jsonError || undefined} />
          <div><Button variant="outline" onClick={applyJson}>Apply the JSON</Button></div>
        </div>
      )}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_22rem] xl:grid-cols-[19rem_minmax(0,1fr)_24rem]">
        {region('blocks', blocksRegion, 'lg:sticky lg:top-28 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:pr-1')}
        {region('canvas', canvasRegion)}
        {region('settings', settingsRegion, 'lg:sticky lg:top-28 lg:max-h-[calc(100dvh-10rem)] lg:overflow-y-auto lg:pr-1')}
      </div>
    </div>
  );
}
