// The design editor: one composition of a look, edited visually, at /settings/looks/:slug/designs/:id.
//
//   header   crumbs, the design's name, whether it is ready to save (and what to fix, each problem a link to the piece it is about), the unsaved
//            indicator, and the actions: Undo and Redo, Save draft (the one primary button), Publish, and a menu (Discard draft, Advanced JSON,
//            Reset to the original)
//   left     the layers and the library of pieces
//   centre   the canvas (the real image when Vesk can make one, else a sketch), with the copy to draw it with, and Design health
//   right    the settings of the selected piece, or of the design when none is selected
//
// The composition is JSON and stays JSON: every control edits a copy of the object through design-model.ts, and the whole is sent when the draft is
// saved. As it is edited the server says what is wrong (a debounced check of the whole look with this draft swapped in); Save draft is refused only
// for what the server would refuse. A look in use is edited here like any other (the pieces keep a readOnly mode, not used here). Under the lg breakpoint the three regions become tabs.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Braces, CircleCheck, Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError, isAbort } from '../../../api';
import { useAppInfo } from '../../../app-info';
import { useDebounced, useDocumentTitle } from '../../../hooks';
import { errorMessage } from '../../../lib/errors';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { Breadcrumbs, BusyButton, ConfirmAction, FormPanel, Lines, MoreMenu, Notice, TextAreaField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useSwatches } from './design-colours';
import { Segmented } from './design-controls';
import { designHealth, mergeServer } from './design-health';
import { DesignCanvas } from './DesignCanvas';
import { HealthPanel } from './DesignHealth';
import { DesignLayers } from './DesignLayers';
import { DesignSettings, ElementProperties } from './DesignProperties';
import { elementName, findOriginal, mapProblems, removeElement, reorderElement, restoreElement, setTop, shippedIdOf, type Edit, type Json } from './design-model';
import { clone, designIndex, settingsOf } from './look-model';
import type { Composition, LooksAnswer, OwnDetail, Problem } from './look-types';
import { afterLookChange, lookApi } from './looks-api';
import { resetSampleCache } from './use-look-samples';
import { useDesignPreview, type Scenario } from './use-design-preview';

type Tab = 'layers' | 'canvas' | 'properties';
const SCENARIOS: Array<{ value: Scenario; label: string; title: string }> = [
  { value: 'sample', label: 'Sample', title: 'The sample words of a post' },
  { value: 'stress', label: 'Longest copy', title: 'The longest words the design accepts' },
  { value: 'minimal', label: 'Shortest copy', title: 'Only the fields the design needs' },
];

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
// The same JSON whatever the order of its keys (the database does not keep them).
const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null');

export function DesignEditor({ initialLook, designId, list }: { initialLook: OwnDetail; designId: string; list: LooksAnswer }) {
  const navigate = useNavigate();
  const appInfo = useAppInfo();
  const cat = list.catalogue;
  const [look, setLook] = useState<OwnDetail>(initialLook);
  const design = look.compositions.find((c) => c.id === designId) as Composition;
  // A look in use is edited like any other: saving keeps a draft, and only publishing changes what posts are drawn with.
  const inUse = list.activeRef === look.ref;
  const settings = useMemo(() => settingsOf(look.definition), [look.definition]);
  const swatches = useSwatches();
  useDocumentTitle(`Edit ${design.name}`);

  // ---- the design being edited, with its history ----
  const start = useMemo(() => clone((design.draft ?? design.definition) as Json), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [comp, setComp] = useState<Json>(start);
  const compRef = useRef(comp);
  const undoStack = useRef<Json[]>([]);
  const redoStack = useRef<Json[]>([]);
  const [, bump] = useState(0);
  const lastKey = useRef<string | null>(null);
  const lastAt = useRef(0);
  const commit = useCallback((next: Json, key?: string) => {
    if (next === compRef.current) return;
    const now = Date.now();
    if (!(key && key === lastKey.current && now - lastAt.current < 1500)) { undoStack.current.push(compRef.current); if (undoStack.current.length > 100) undoStack.current.shift(); }
    redoStack.current = [];
    lastKey.current = key ?? null; lastAt.current = now;
    compRef.current = next;
    setComp(next);
  }, []);
  const apply = useCallback((fn: (c: Json) => Edit, key?: string): string => {
    const e = fn(compRef.current);
    if (e.error) return e.error;
    commit(e.comp, key);
    return '';
  }, [commit]);
  const replace = (next: Json) => { undoStack.current = []; redoStack.current = []; lastKey.current = null; compRef.current = next; setComp(next); setSelected(null); bump((n) => n + 1); };
  const undo = () => { const prev = undoStack.current.pop(); if (!prev) return; redoStack.current.push(compRef.current); compRef.current = prev; lastKey.current = null; setComp(prev); bump((n) => n + 1); };
  const redo = () => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(compRef.current); compRef.current = next; lastKey.current = null; setComp(next); bump((n) => n + 1); };

  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('canvas');
  const [view, setView] = useState<'sketch' | 'real'>('real');
  const [grid, setGrid] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('sample');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [gateLines, setGateLines] = useState<string[]>([]);
  const [published, setPublished] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const [resetting, setResetting] = useState<Json | null>(null);
  const [copying, setCopying] = useState(false);
  const [notice, setNotice] = useState('');

  const savedJson = useMemo(() => canon(design.draft ?? design.definition), [design.draft, design.definition]);
  const dirty = canon(comp) !== savedJson;
  useUnsavedGuard(dirty);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(t); } }, [notice]);

  // ---- what the server says about the draft as it is edited ----
  const checked = useDebounced(comp, 400);
  const settled = checked === comp;
  const [serverProblems, setServerProblems] = useState<Problem[]>([]);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    setChecking(true);
    lookApi.validateDraft(look.slug, design.id, checked, ctrl.signal)
      .then((r) => { setServerProblems(r.problems); setChecking(false); })
      .catch((e) => { if (isAbort(e)) return; setServerProblems([{ path: 'definition', message: errorMessage(e) }]); setChecking(false); });
    return () => ctrl.abort();
  }, [checked, look.slug, design.id]);
  const problems = useMemo(() => mapProblems(serverProblems, checked, cat), [serverProblems, checked, cat]);

  // ---- the picture ----
  const preview = useDesignPreview(problems.length === 0 ? { ref: look.ref, kind: String(comp.kind), index: designIndex(look.compositions, design), draft: comp, scenario } : null);
  const hasImage = preview.image !== '';
  const shownView = view === 'real' && hasImage ? 'real' : 'sketch';

  const health = useMemo(() => mergeServer(designHealth(comp, settings, cat), problems.map((p) => p.raw.replace(/^look "[^"]*": /, '')).concat(problems.map((p) => p.message))), [comp, settings, cat, problems]);

  // ---- actions ----
  async function save(): Promise<OwnDetail | null> {
    setBusy('save'); setError(''); setGateLines([]);
    try {
      const l = await lookApi.saveDraft(look.slug, design.id, comp);
      setLook(l);
      toast.success('Draft saved.');
      return l;
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && Array.isArray(e.details)) setServerProblems(e.details as Problem[]);
      return null;
    } finally { setBusy(''); }
  }
  async function publish() {
    setPublished(false);
    if (dirty && !(await save())) return;
    setBusy('publish'); setError(''); setGateLines([]);
    try {
      const l = await lookApi.publishDesign(look.slug, design.id);
      setLook(l);
      setPublished(true);
      resetSampleCache();
      afterLookChange();
      appInfo.reload();
      toast.success(`${design.name} is published.`);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && Array.isArray(e.details)) setGateLines(e.details.map((d) => d.message));
    } finally { setBusy(''); }
  }
  async function discard() {
    const l = await lookApi.discardDraft(look.slug, design.id);
    setLook(l);
    const d = l.compositions.find((c) => c.id === design.id);
    if (d) replace(clone(d.definition as Json));
    setDiscarding(false);
    toast.success('Draft discarded.');
  }
  async function duplicateLook() {
    setCopying(true);
    try { navigate(`/settings/looks/${(await lookApi.duplicate(look.ref)).slug}?tab=designs`); } catch (e) { toast.error(errorMessage(e)); setCopying(false); }
  }
  async function askReset() {
    const id = shippedIdOf(look.origin);
    try {
      const shipped = id ? await lookApi.get(`shipped:${id}`) : null;
      const original = shipped ? findOriginal(shipped.definition as Json, comp, designIndex(look.compositions, design)) : null;
      if (!original) { toast.error('The original of this design is not in the look it was copied from.'); return; }
      setResetting(clone(original));
    } catch (e) { toast.error(errorMessage(e)); }
  }
  function openJson() { setJson(JSON.stringify(comp, null, 2)); setJsonError(''); setJsonOpen(true); }
  function applyJson() {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (!isObj(parsed) || !Array.isArray(parsed.elements)) throw new Error('A design is an object with a list of elements.');
      if (parsed.kind !== comp.kind) throw new Error(`A design keeps its kind (${String(comp.kind)}).`);
      commit(parsed);
      setSelected(null);
      setJsonOpen(false);
      toast.success('Applied; the editor shows the new design. Vesk checks it like any other change.');
    } catch (e) { setJsonError(errorMessage(e)); }
  }
  function remove(path: string) {
    const r = removeElement(compRef.current, path);
    if (r.error || !r.undo) { toast.error(r.error ?? 'It could not be removed'); return; }
    const undo0 = r.undo;
    commit(r.comp);
    setSelected(null);
    toast(`Removed ${elementName(undo0.el, cat)}`, { action: { label: 'Undo', onClick: () => { const back = restoreElement(compRef.current, undo0); commit(back.comp); setSelected(back.path ?? null); } } });
  }

  const saveWhy = problems.length ? 'Fix what the design needs before you save it.' : checking || !settled ? 'Checking the design.' : !dirty ? 'There is nothing new to save.' : '';
  const publishWhy = problems.length ? 'Fix what the design needs first.' : checking || !settled ? 'Checking the design.' : !dirty && !design.hasDraft ? 'There is nothing to publish: save a draft first.' : '';

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="combobox"]')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  };

  const select = (p: string | null) => { setSelected(p); if (p !== null) setTab((t) => (t === 'layers' ? 'properties' : t)); };
  const region = (name: Tab, label: string, node: ReactNode, extra?: string) => (
    <section aria-label={label} className={cn('min-w-0', tab !== name && 'max-lg:hidden', extra)}>{node}</section>
  );
  const canvasWidth = 'min(100%, max(18rem, calc((100dvh - 21rem) * 0.8)))';
  const first = problems[0];

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[92rem] flex-col gap-4 pb-10" onKeyDown={onKey}>
      <header className="sticky top-0 z-30 -mx-1 flex flex-col gap-2 border-b bg-background px-1 pb-2 pt-1">
        <Breadcrumbs items={[{ label: 'Settings', to: '/settings/preferences' }, { label: 'Looks', to: '/settings/looks' }, { label: look.name, to: `/settings/looks/${look.slug}?tab=designs` }, { label: String(comp.name ?? design.name) }]} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Input aria-label="Name of the design" value={String(comp.name ?? '')} maxLength={cat.limits.name} onChange={(e) => { const v = e.target.value; const why = apply((c) => setTop(c, 'name', v, cat), 'name'); if (why) setNotice(why); }}
            className="-ml-2 h-9 min-w-40 flex-1 border-transparent bg-transparent px-2 text-[19px] font-semibold tracking-tight shadow-none hover:border-input focus-visible:border-ring sm:max-w-md md:text-[19px]" />
          {dirty && <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] text-warning-foreground"><span className="size-2 rounded-full bg-warning" aria-hidden="true" /> Unsaved changes</span>}
          {!dirty && design.hasDraft && <span className="text-[12.5px] text-muted-foreground">Draft saved, not published</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" size="icon" variant="ghost" aria-label="Undo" disabled={undoStack.current.length === 0} onClick={undo} title="Undo"><Undo2 /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Redo" disabled={redoStack.current.length === 0} onClick={redo} title="Redo"><Redo2 /></Button>
            <Button type="button" variant="outline" disabled={!!publishWhy || busy !== ''} title={publishWhy || undefined} aria-describedby={publishWhy ? 'publish-why' : undefined} onClick={() => void publish()}>Publish</Button>
            <BusyButton loading={busy === 'save'} disabled={!!saveWhy || busy !== ''} title={saveWhy || undefined} aria-describedby={saveWhy ? 'save-why' : undefined} onClick={() => void save()}>Save draft</BusyButton>
            <MoreMenu items={[
              { label: 'Discard draft', tone: 'danger', disabled: !design.hasDraft, onSelect: () => setDiscarding(true) },
              { label: 'Advanced: JSON', icon: <Braces />, onSelect: openJson },
              ...(shippedIdOf(look.origin) ? [{ label: 'Reset to the shipped original', onSelect: () => void askReset() }] : []),
            ]} />
          </div>
        </div>
        <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          {problems.length === 0
            ? <span className="inline-flex items-center gap-1.5 text-success"><CircleCheck className="size-4" aria-hidden="true" /> {checking || !settled ? 'Checking this design...' : 'This design is ready to save'}</span>
            : (
              <>
                <span className="inline-flex items-center gap-1.5 font-medium text-warning-foreground"><TriangleAlert className="size-4" aria-hidden="true" /> {problems.length === 1 ? 'One thing to fix:' : `${problems.length} things to fix:`}</span>
                <button type="button" onClick={() => first?.path && select(first.path)} disabled={!first?.path} className="min-w-0 max-w-[60ch] truncate text-left underline-offset-2 hover:underline disabled:no-underline">{first?.message}</button>
                {problems.length > 1 && <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[12.5px]" aria-expanded={showProblems} onClick={() => setShowProblems(!showProblems)}>{showProblems ? 'Hide' : `Show all ${problems.length}`}</Button>}
              </>
            )}
          <span id="save-why" className="sr-only">{saveWhy}</span><span id="publish-why" className="sr-only">{publishWhy}</span>
          {error && <span role="alert" className="font-medium text-destructive">{error}</span>}
          {notice && <span role="status" className="font-medium text-muted-foreground">{notice}</span>}
          {showProblems && problems.length > 1 && (
            <div className="absolute left-0 top-full z-40 mt-1 max-h-72 w-full max-w-3xl overflow-y-auto rounded-md border bg-popover p-2 text-popover-foreground shadow-md">
              <ul className="flex flex-col">
                {problems.slice(0, 30).map((p, i) => (
                  <li key={i}><button type="button" disabled={!p.path} onClick={() => { if (p.path) select(p.path); setShowProblems(false); }} className="w-full rounded px-2 py-1 text-left text-[13px] hover:bg-accent disabled:hover:bg-transparent">{p.message}</button></li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="lg:hidden">
          <Segmented<Tab> label="Part of the editor" className="w-full" value={tab} onChange={setTab} options={[{ value: 'layers', label: 'Layers' }, { value: 'canvas', label: 'Canvas' }, { value: 'properties', label: 'Properties' }]} />
        </div>
      </header>

      {inUse && (
        <Notice tone="info" actions={<BusyButton size="sm" variant="outline" loading={copying} onClick={() => void duplicateLook()}>Duplicate the look</BusyButton>}>
          This look is in use. Saving keeps your changes as a draft that posts do not use; publishing the design puts it into every post drawn from then on. Images already made stay as they are until a post is drawn again.
        </Notice>
      )}
      {gateLines.length > 0 && <Notice tone="bad" title="The checks did not pass, so the design was not published:"><Lines items={gateLines} /></Notice>}
      {published && gateLines.length === 0 && <Notice tone="good">Published. {design.gate?.passed === false ? 'The checks did not pass.' : 'The design passed its checks and is now part of the look.'}</Notice>}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_22rem] xl:grid-cols-[19rem_minmax(0,1fr)_24rem]">
        {region('layers', 'Layers', (
          <DesignLayers comp={comp} look={settings} cat={cat} selected={selected} onSelect={select} readOnly={false} apply={apply} onRemove={remove} />
        ), 'lg:sticky lg:top-36 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:pr-1')}

        {region('canvas', 'Canvas', (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {hasImage && <Segmented label="What the canvas shows" value={shownView} onChange={setView} options={[{ value: 'sketch', label: 'Sketch' }, { value: 'real', label: 'Real image' }]} />}
              {preview.status !== 'unavailable' && <Segmented<Scenario> label="The words to draw it with" value={scenario} onChange={setScenario} options={SCENARIOS} />}
              <div className="ml-auto flex items-center gap-1">
                <Button type="button" size="sm" variant={grid ? 'secondary' : 'ghost'} aria-pressed={grid} onClick={() => setGrid(!grid)}>Grid</Button>
                <Button type="button" size="sm" variant={advanced ? 'secondary' : 'ghost'} aria-pressed={advanced} title="Free angles, pixel placement and fixed sizes" onClick={() => setAdvanced(!advanced)}>Advanced</Button>
              </div>
            </div>
            <div className="mx-auto w-full" style={{ maxWidth: canvasWidth, width: canvasWidth }}>
              <DesignCanvas comp={comp} look={settings} cat={cat} selected={selected} onSelect={select} preview={preview} view={shownView} showGrid={grid} readOnly={false} advanced={advanced} swatches={swatches}
                onChange={(next) => commit(next, 'drag')} onGestureEnd={() => { lastKey.current = null; }} onRemove={remove}
                onReorder={(path, by) => { let to: string | undefined; const why = apply((c) => { const e = reorderElement(c, path, by); to = e.path; return e; }); if (why) setNotice(why); else if (to) setSelected(to); }} onNotice={setNotice} />
            </div>
            <p className="text-center text-[12.5px] text-muted-foreground" aria-live="polite">
              {preview.status === 'loading' && hasImage ? 'Making the image again...' : preview.status === 'loading' ? 'Making the image...' : preview.status === 'error' ? preview.error : preview.status === 'unavailable' ? 'Sketch' : hasImage && !preview.fresh ? 'The image is out of date' : hasImage ? (shownView === 'real' ? 'Real image' : 'Sketch') : 'Sketch'}
            </p>
            <HealthPanel health={health} warnings={preview.warnings} />
          </div>
        ))}

        {region('properties', 'Properties', (
          selected
            ? <ElementProperties key={selected} comp={comp} look={settings} cat={cat} path={selected} swatches={swatches} advanced={advanced} readOnly={false} problems={problems} apply={apply} onSelect={select} />
            : <DesignSettings comp={comp} look={settings} cat={cat} readOnly={false} apply={apply} problems={problems} />
        ), 'lg:sticky lg:top-36 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:pr-1')}
      </div>

      <FormPanel open={jsonOpen} variant="dialog" size="lg" title="Advanced: JSON" onClose={() => setJsonOpen(false)} dismissOnOutside
        footer={<><Button type="button" variant="outline" onClick={() => setJsonOpen(false)}>Close</Button><Button type="button" disabled={false} onClick={applyJson}>Apply the JSON</Button></>}>
        <TextAreaField label="The design exactly as Vesk reads it" mono rows={20} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} error={jsonError || undefined}
          hint="Edit it here and apply it; the editor then shows it, and Vesk checks it like any other change." />
      </FormPanel>
      <ConfirmAction open={discarding} danger title="Discard the draft?" confirmLabel="Discard the draft" message="The unpublished changes to this design are thrown away and the published design comes back." onConfirm={discard} onCancel={() => setDiscarding(false)} />
      <ConfirmAction open={!!resetting} title="Reset to the original?" confirmLabel="Reset the design" message="The design goes back to the one the look was copied from. It stays unsaved until you save the draft, and Undo brings your version back."
        onConfirm={() => { if (resetting) { commit(resetting); setSelected(null); } setResetting(null); }} onCancel={() => setResetting(null)} />
    </div>
  );
}
