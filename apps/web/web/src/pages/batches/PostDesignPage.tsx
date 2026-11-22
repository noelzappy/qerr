// "Edit this post's design", at /batches/:id/posts/:postId/design: the post's own design (the AI's, or one started from the look's design that
// draws the post) in the same design editor the looks use: the layers, the canvas (the real picture of THIS post, with its own words and picture,
// and every check), and the properties of the selected piece, the art layer included. Saving keeps the design on the post and makes its images
// again; a post that had the look's design keeps it to switch back to. The design is JSON: every control edits a copy through design-model.ts,
// and the server checks it against the look in use as it changes.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CircleCheck, Redo2, TriangleAlert, Undo2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError, isAbort } from '../../api';
import { useDebounced, useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { Breadcrumbs, BusyButton, EmptyBlock, LoadingBlock, Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { useSwatches } from '../settings/looks/design-colours';
import { Segmented } from '../settings/looks/design-controls';
import { designHealth, mergeServer } from '../settings/looks/design-health';
import { DesignCanvas } from '../settings/looks/DesignCanvas';
import { HealthPanel } from '../settings/looks/DesignHealth';
import { DesignLayers } from '../settings/looks/DesignLayers';
import { DesignSettings, ElementProperties } from '../settings/looks/DesignProperties';
import { elementName, mapProblems, removeElement, reorderElement, restoreElement, type Edit, type Json } from '../settings/looks/design-model';
import { clone } from '../settings/looks/look-model';
import type { LookCatalogue, Problem } from '../settings/looks/look-types';
import type { DesignPreviewState, ElementRect } from '../settings/looks/use-design-preview';

interface Start { postId: string; title: string; kind: string; own: boolean; composition: Json | null; settings: Json; catalogue: LookCatalogue; lookName: string }
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null');

export function PostDesignPage() {
  const { id = '', postId = '' } = useParams();
  const start = useLoad(() => api.get<Start>(`/api/posts/${encodeURIComponent(postId)}/own-design`), [postId]);
  useDocumentTitle('Edit the post\'s design');
  const back = <Button asChild variant="outline"><Link to={`/batches/${id}/posts/${postId}`}>Back to the post</Link></Button>;
  if (start.loading && !start.data) return <LoadingBlock label="Loading the design" />;
  if (start.error || !start.data) return <EmptyBlock title="This post's design cannot be edited here" action={back}>{start.error || 'It may have been removed.'}</EmptyBlock>;
  if (!start.data.composition) return <EmptyBlock title="There is no design to start from" action={back}>The look in use has no design of this kind of post.</EmptyBlock>;
  return <PostDesignEditor key={postId} batchId={id} start={start.data} />;
}

// The real picture of the post with this design (POST /api/posts/:id/own-design/preview), asked when the design stops changing.
function usePostPreview(postId: string, draft: Json | null): DesignPreviewState {
  const [state, setState] = useState<DesignPreviewState>({ status: 'idle', image: '', rects: [], warnings: [], problems: [], fresh: false, error: '' });
  const key = draft ? JSON.stringify(draft) : '';
  const latest = useRef(draft);
  latest.current = draft;
  useEffect(() => {
    const d = latest.current;
    if (!d) return;
    setState((cur) => ({ ...cur, status: 'loading', fresh: false, error: '' }));
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      api.post<{ image?: string; rects: ElementRect[]; warnings: string[]; problems: Problem[] }>(`/api/posts/${encodeURIComponent(postId)}/own-design/preview`, { definition: d }, ctrl.signal)
        .then((a) => setState({ status: a.image ? 'ready' : 'error', image: a.image ?? '', rects: a.rects ?? [], warnings: a.warnings ?? [], problems: a.problems ?? [], fresh: !!a.image, error: a.image ? '' : (a.problems?.[0]?.message ?? 'The picture could not be made') }))
        .catch((e) => { if (!isAbort(e)) setState((cur) => ({ ...cur, status: 'error', fresh: false, error: errorMessage(e, 'The picture could not be made.') })); });
    }, 600);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [key, postId]);
  return state;
}

function PostDesignEditor({ batchId, start }: { batchId: string; start: Start }) {
  const navigate = useNavigate();
  const cat = start.catalogue;
  const settings = start.settings;
  const swatches = useSwatches();
  const initial = useMemo(() => clone(start.composition as Json), [start]);
  const [comp, setComp] = useState<Json>(initial);
  const compRef = useRef(comp);
  const undoStack = useRef<Json[]>([]);
  const redoStack = useRef<Json[]>([]);
  const [, bump] = useState(0);
  const commit = useCallback((next: Json) => {
    if (next === compRef.current) return;
    undoStack.current.push(compRef.current); if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    compRef.current = next; setComp(next);
  }, []);
  const apply = useCallback((fn: (c: Json) => Edit): string => { const e = fn(compRef.current); if (e.error) return e.error; commit(e.comp); return ''; }, [commit]);
  const undo = () => { const prev = undoStack.current.pop(); if (!prev) return; redoStack.current.push(compRef.current); compRef.current = prev; setComp(prev); bump((n) => n + 1); };
  const redo = () => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(compRef.current); compRef.current = next; setComp(next); bump((n) => n + 1); };
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'sketch' | 'real'>('real');
  const [grid, setGrid] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const dirty = canon(comp) !== canon(initial) || !start.own;
  useUnsavedGuard(dirty && canon(comp) !== canon(initial));

  // what the server says about the design as it changes
  const checked = useDebounced(comp, 400);
  const [serverProblems, setServerProblems] = useState<Problem[]>([]);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    setChecking(true);
    api.post<{ problems: Problem[] }>(`/api/posts/${encodeURIComponent(start.postId)}/own-design/check`, { definition: checked }, ctrl.signal)
      .then((r) => { setServerProblems(r.problems); setChecking(false); })
      .catch((e) => { if (isAbort(e)) return; setServerProblems([{ path: 'definition', message: errorMessage(e) }]); setChecking(false); });
    return () => ctrl.abort();
  }, [checked, start.postId]);
  const problems = useMemo(() => mapProblems(serverProblems, checked, cat), [serverProblems, checked, cat]);
  const preview = usePostPreview(start.postId, problems.length === 0 && !checking ? checked : null);
  const shownView = view === 'real' && preview.image ? 'real' : 'sketch';
  const health = useMemo(() => mergeServer(designHealth(comp, settings, cat), problems.map((p) => p.message)), [comp, settings, cat, problems]);

  async function save() {
    setBusy(true);
    try {
      await api.put(`/api/posts/${encodeURIComponent(start.postId)}/own-design`, { definition: comp });
      toast.success('Saved. The post\'s images are being made again.');
      withoutGuard(() => navigate(`/batches/${batchId}/posts/${start.postId}`));
    } catch (e) {
      toast.error(errorMessage(e));
      if (e instanceof ApiError && Array.isArray(e.details)) setServerProblems((e.details as unknown[]).map((m) => ({ path: 'definition', message: String(m) })));
    } finally { setBusy(false); }
  }
  function remove(path: string) {
    const r = removeElement(compRef.current, path);
    if (r.error || !r.undo) { toast.error(r.error ?? 'It could not be removed'); return; }
    const undo0 = r.undo;
    commit(r.comp);
    setSelected(null);
    toast(`Removed ${elementName(undo0.el, cat)}`, { action: { label: 'Undo', onClick: () => { const back = restoreElement(compRef.current, undo0); commit(back.comp); setSelected(back.path ?? null); } } });
  }
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="combobox"]')) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  };
  const saveWhy = problems.length ? 'Fix what the design needs before you save it.' : checking ? 'Checking the design.' : !dirty ? 'There is nothing new to save.' : '';
  const canvasWidth = 'min(100%, max(18rem, calc((100dvh - 21rem) * 0.8)))';

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[92rem] flex-col gap-4 pb-10" onKeyDown={onKey}>
      <header className="sticky top-0 z-30 -mx-1 flex flex-col gap-2 border-b bg-background px-1 pb-2 pt-1">
        <Breadcrumbs items={[{ label: 'Create', to: '/create' }, { label: 'Batch', to: `/batches/${batchId}` }, { label: start.title, to: `/batches/${batchId}/posts/${start.postId}` }, { label: 'Design' }]} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[19px] font-semibold tracking-tight">This post's design</h1>
          <span className="text-[12.5px] text-muted-foreground">{start.own ? 'Its own design' : 'Started from the look\'s design'}, in the {start.lookName || 'look'}'s fonts and colours</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" size="icon" variant="ghost" aria-label="Undo" disabled={undoStack.current.length === 0} onClick={undo}><Undo2 /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Redo" disabled={redoStack.current.length === 0} onClick={redo}><Redo2 /></Button>
            <Button asChild variant="outline"><Link to={`/batches/${batchId}/posts/${start.postId}`}>Cancel</Link></Button>
            <BusyButton loading={busy} disabled={!!saveWhy || busy} title={saveWhy || undefined} onClick={() => void save()}>Save</BusyButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {problems.length === 0
            ? <span className="inline-flex items-center gap-1.5 text-success"><CircleCheck className="size-4" aria-hidden="true" /> {checking ? 'Checking this design...' : 'This design is ready to save'}</span>
            : <span className="inline-flex items-center gap-1.5 font-medium text-warning-foreground"><TriangleAlert className="size-4" aria-hidden="true" /> {problems[0]!.message}{problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}</span>}
          {notice && <span role="status" className="text-muted-foreground">{notice}</span>}
        </div>
      </header>
      <Notice tone="info">Saving makes this post's images again, with every check. An approved post goes back to Writing. The post keeps its other design to switch back to.</Notice>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_22rem] xl:grid-cols-[19rem_minmax(0,1fr)_24rem]">
        <section aria-label="Layers" className="min-w-0 lg:sticky lg:top-36 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto">
          <DesignLayers comp={comp} look={settings} cat={cat} selected={selected} onSelect={setSelected} readOnly={false} apply={apply} onRemove={remove} />
        </section>
        <section aria-label="Canvas" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {preview.image && <Segmented label="What the canvas shows" value={shownView} onChange={setView} options={[{ value: 'sketch', label: 'Sketch' }, { value: 'real', label: 'Real image' }]} />}
            <div className="ml-auto flex items-center gap-1">
              <Button type="button" size="sm" variant={grid ? 'secondary' : 'ghost'} aria-pressed={grid} onClick={() => setGrid(!grid)}>Grid</Button>
              <Button type="button" size="sm" variant={advanced ? 'secondary' : 'ghost'} aria-pressed={advanced} onClick={() => setAdvanced(!advanced)}>Advanced</Button>
            </div>
          </div>
          <div className="mx-auto w-full" style={{ maxWidth: canvasWidth, width: canvasWidth }}>
            <DesignCanvas comp={comp} look={settings} cat={cat} selected={selected} onSelect={setSelected} preview={preview} view={shownView} showGrid={grid} readOnly={false} advanced={advanced} swatches={swatches}
              onChange={(next) => commit(next)} onGestureEnd={() => undefined} onRemove={remove}
              onReorder={(path, by) => { let to: string | undefined; const why = apply((c) => { const e = reorderElement(c, path, by); to = e.path; return e; }); if (why) setNotice(why); else if (to) setSelected(to); }} onNotice={setNotice} />
          </div>
          <p className="text-center text-[12.5px] text-muted-foreground" aria-live="polite">
            {preview.status === 'loading' ? 'Making the image of this post...' : preview.status === 'error' ? preview.error : preview.image ? 'This post, with its own words and picture' : 'Sketch'}
          </p>
          <HealthPanel health={health} warnings={preview.warnings} />
        </section>
        <section aria-label="Properties" className="min-w-0 lg:sticky lg:top-36 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto">
          {selected
            ? <ElementProperties key={selected} comp={comp} look={settings} cat={cat} path={selected} swatches={swatches} advanced={advanced} readOnly={false} problems={problems} apply={apply} onSelect={setSelected} />
            : <DesignSettings comp={comp} look={settings} cat={cat} readOnly={false} apply={apply} problems={problems} />}
        </section>
      </div>
    </div>
  );
}
