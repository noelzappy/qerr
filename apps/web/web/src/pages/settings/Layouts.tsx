// Settings, Layouts: the brand's own compositions. A layout is blocks (a headline, a photo, a colour panel ...) placed in slots on a
// grid, with options from fixed lists; the engine draws it with the brand's look and checks every image like the built-in pages.
// People start from a blank layout or a starting point, place blocks by clicking the grid, set their options, see a sketch at
// once and a real preview on request, and save. The JSON view shows the same layout as the engine reads it. The server checks
// every layout with the engine's own validator; the problems it finds are shown as they are typed.
// The built-in layouts (the templates' own) are listed read only; an admin may copy one into a layout of the brand's own, on the
// built-in poster or editorial page, where blocks sit at pixel rectangles and the page places its chrome.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Braces, Copy, Eye, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, api } from '../../api';
import { useDebounced, useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage } from '../../lib/errors';
import { BusyButton, CheckField, ConfirmAction, EmptyBlock, ErrorBlock, FieldGroup, FormPanel, Lines, Notice, SelectField, SwitchField, TextAreaField, TextField, ToneBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutSketch } from './LayoutSketch';
import {
  BLOCK_LABEL, EDGES, OPTION_LABEL, SIZE_LABEL, blankLayout, blockTitle, builtPage, marginsOf, pxFor, slotFor, whenWords, withSlot,
  type Block, type BuiltinLayout, type Catalogue, type Edge, type Grid, type Layout, type LayoutsResponse, type OptionSpec, type PageBlockSpec,
  type PreviewResult, type Px, type Slot, type StoredLayout,
} from './layout-types';
import { SettingsPage } from './section';

const word = (v: string | number) => String(v).replace(/-/g, ' ');
const opts = (values: Array<string | number>) => values.map((v) => ({ value: String(v), label: word(v) }));
const num = (v: string, fallback: number) => (v.trim() === '' || !Number.isFinite(Number(v)) ? fallback : Math.round(Number(v)));
const problemsOf = (err: unknown) => (err instanceof ApiError && err.details ? err.details.map((d) => d.message) : []);
// The page colour a layout starts from, for the sketch (a list of cases: the one used when no condition holds).
const groundOf = (l: Layout) => (typeof l.ground === 'string' ? l.ground : Array.isArray(l.ground) ? l.ground[l.ground.length - 1]?.ground ?? '' : '');
const PAGE_WORD: Record<string, string> = { poster: 'the poster page', editorial: 'the editorial page', photo: 'the photo post', grid: 'a grid' };
// What a block type shows and takes: the grid's catalogue, or the built-in page's own (pages[page].blocks).
const specOf = (catalogue: Catalogue, layout: Layout, type: string): PageBlockSpec | null => {
  if (builtPage(layout)) return catalogue.pages[layout.page!]?.blocks[type] ?? null;
  const b = catalogue.blocks[type];
  return b ? { kinds: b.kinds, field: b.field, chrome: false, children: b.children, under: b.under, options: b.options } : null;
};
const fieldsOfKind = (catalogue: Catalogue, kinds: string[]) => Object.keys(catalogue.fields).filter((f) => kinds.includes(catalogue.fields[f].kind));

// ---- one block's settings ----

function OptionFields({ block, options, onChange }: { block: Block; options: Record<string, OptionSpec>; onChange: (b: Block) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(options).map(([k, o]) => (o.type === 'enum'
        ? <SelectField key={k} label={OPTION_LABEL[k] ?? k} value={String(block[k] ?? o.default)} options={opts(o.values)}
            onValueChange={(v) => onChange({ ...block, [k]: typeof o.values[0] === 'number' ? Number(v) : v })} />
        : o.type === 'int'
          ? <TextField key={k} label={OPTION_LABEL[k] ?? k} type="number" min={o.min} max={o.max} hint={`${o.min} to ${o.max}`} value={String(block[k] ?? o.default)}
              onChange={(e) => onChange({ ...block, [k]: num(e.target.value, Number(block[k] ?? o.default)) })} />
          : <SwitchField key={k} label={OPTION_LABEL[k] ?? k} checked={(block[k] ?? o.default) === true} onCheckedChange={(v) => onChange({ ...block, [k]: v })} />))}
    </div>
  );
}

function WhatItShows({ block, layout, catalogue, onChange }: { block: Block; layout: Layout; catalogue: Catalogue; onChange: (b: Block) => void }) {
  const spec = specOf(catalogue, layout, block.type);
  const declared = (kinds: string[]) => Object.keys(layout.fields).filter((f) => kinds.includes(catalogue.fields[f]?.kind));
  if (block.type === 'label') {
    const way = block.field !== undefined ? 'field' : block.text !== undefined ? 'text' : 'source';
    const set = (w: string) => { const { field: _f, text: _t, source: _s, ...rest } = block; onChange(w === 'field' ? { ...rest, field: declared(['short'])[0] ?? 'label' } : w === 'text' ? { ...rest, text: 'Label' } : { ...rest, source: 'series' }); };
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Words" value={way} onValueChange={set} options={[{ value: 'field', label: 'A field of the post' }, { value: 'text', label: 'Fixed words of the layout' }, { value: 'source', label: 'The series, brand or page number' }]} />
        {way === 'field' && <SelectField label="Field" value={block.field ?? ''} onValueChange={(v) => onChange({ ...block, field: v })} options={opts(fieldsOfKind(catalogue, ['short']))} hint="Declare it under Fields" />}
        {way === 'text' && <TextField label="Fixed words" value={block.text ?? ''} maxLength={40} onChange={(e) => onChange({ ...block, text: e.target.value })} />}
        {way === 'source' && <SelectField label="Shows" value={block.source ?? 'series'} onValueChange={(v) => onChange({ ...block, source: v })} options={catalogue.labelSources.map((s) => ({ value: s, label: { series: 'The series name', brand: 'The brand name', folio: 'The page number (carousels)' }[s] ?? s }))} />}
      </div>
    );
  }
  if (!spec?.kinds.length) return null;
  // On a built-in page a headline may carry its sub line flowing under it, in the same box (subField).
  const flowing = builtPage(layout) && block.type === 'headline';
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField label="Shows the field" value={block.field ?? spec.field ?? ''} onValueChange={(v) => onChange({ ...block, field: v })} options={opts(fieldsOfKind(catalogue, spec.kinds))} hint="Declare it under Fields" />
      {flowing && (
        <SelectField label="Sub line under it" optional value={block.subField ?? ''} hint="Set 28 px under the headline, in the same box"
          onValueChange={(v) => { const { subField: _s, subWidth: _w, ...rest } = block; onChange(v ? { ...rest, subField: v } : rest); }}
          options={[{ value: '', label: 'None' }, ...opts(declared(['text', 'short']).filter((f) => f !== (block.field ?? 'headline')))]} />
      )}
      {block.type === 'screen' && block.device === 'desktop' && (
        <SelectField label="Window title from" optional value={block.titleField ?? ''} onValueChange={(v) => { const { titleField: _t, ...rest } = block; onChange(v ? { ...rest, titleField: v } : rest); }}
          options={[{ value: '', label: 'No title' }, ...opts(fieldsOfKind(catalogue, ['short']))]} />
      )}
    </div>
  );
}

// A block's rectangle on a built-in page, in page pixels.
function PxFields({ px, page, onChange }: { px: Px | null; page: { w: number; h: number }; onChange: (p: Px) => void }) {
  const p = px ?? { x: 80, y: 600, w: 920, h: 200 };
  const field = (k: keyof Px, label: string, max: number) => (
    <TextField key={k} label={label} type="number" min={0} max={max} value={String(p[k])} onChange={(e) => onChange({ ...p, [k]: num(e.target.value, p[k]) })} />
  );
  return <div className="grid grid-cols-4 gap-2">{field('x', 'Left', page.w)}{field('y', 'Top', page.h)}{field('w', 'Width', page.w)}{field('h', 'Height', page.h)}</div>;
}

function SlotFields({ slot, grid, onChange }: { slot: Slot | null; grid: Grid; onChange: (s: Slot) => void }) {
  const s = slot ?? { col: 1, row: 1, width: 1, height: 1 };
  const field = (k: keyof Slot, label: string, max: number) => (
    <TextField key={k} label={label} type="number" min={1} max={max} value={String(s[k])} onChange={(e) => onChange({ ...s, [k]: num(e.target.value, s[k]) })} />
  );
  return <div className="grid grid-cols-4 gap-2">{field('col', 'Column', grid.columns)}{field('row', 'Row', grid.rows)}{field('width', 'Width', grid.columns)}{field('height', 'Height', grid.rows)}</div>;
}

function BlockEditor({ block, layout, size, catalogue, onChange, child = false }: { block: Block; layout: Layout; size: string; catalogue: Catalogue; onChange: (b: Block) => void; child?: boolean }) {
  const spec = specOf(catalogue, layout, block.type);
  const built = builtPage(layout);
  const sizes = Object.keys(layout.canvas);
  const [childAt, setChildAt] = useState<number | null>(null);
  const [childType, setChildType] = useState('headline');
  const children = block.children ?? [];
  const setChildren = (list: Block[]) => onChange({ ...block, children: list });
  return (
    <div className="flex flex-col gap-4">
      {!child && built && (spec?.chrome
        ? <p className="text-[13px] text-muted-foreground">The page places this, as the brand's style says (logo placement, footer style).</p>
        : (
          <FieldGroup legend={`Rectangle on the ${size} page (px)`} hint="From the page's top-left corner. Text keeps inside the page's minimum margins; the preview runs every check.">
            <PxFields px={pxFor(block, size)} page={catalogue.sizes[size] ?? { w: 1080, h: 1350 }} onChange={(p) => onChange({ ...block, px: p })} />
          </FieldGroup>
        ))}
      {!child && block.when && <p className="text-[13px] text-muted-foreground">Drawn only when {whenWords(block.when)}. Change the condition in the JSON view.</p>}
      {!child && !built && (
        <FieldGroup legend={`Slot on the ${size} grid`} hint="In grid cells, counted from 1. Or click two cells on the sketch: the first corner, then the opposite one.">
          <SlotFields slot={slotFor(block, size)} grid={layout.canvas[size]} onChange={(s) => onChange(withSlot(block, size, s, sizes))} />
          {catalogue.blocks[block.type]?.bleed && (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {EDGES.map((e) => <CheckField key={e} label={`Bleed ${e}`} checked={(block.bleed ?? []).includes(e)} onCheckedChange={(v) => { const list = (block.bleed ?? []).filter((x) => x !== e); onChange({ ...block, bleed: (v ? [...list, e] : list) as Edge[] }); }} />)}
            </div>
          )}
        </FieldGroup>
      )}
      <WhatItShows block={block} layout={layout} catalogue={catalogue} onChange={onChange} />
      {spec && <OptionFields block={block} options={spec.options} onChange={onChange} />}
      {spec?.children && (
        <FieldGroup legend="Inside the panel" hint="These flow from the top of the panel, one under the other.">
          {children.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing yet: add a headline, a sub line or a label.</p>}
          <ul className="flex flex-col gap-1.5">
            {children.map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <Button size="sm" variant={childAt === i ? 'secondary' : 'ghost'} className="flex-1 justify-start" onClick={() => setChildAt(childAt === i ? null : i)}>{blockTitle(c)}</Button>
                <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => { const l = [...children]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; setChildren(l); }}><ArrowUp /></Button>
                <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => { setChildren(children.filter((_, k) => k !== i)); setChildAt(null); }}><Trash2 /></Button>
              </li>
            ))}
          </ul>
          {childAt !== null && children[childAt] && (
            <div className="rounded-md border p-3"><BlockEditor block={children[childAt]} layout={layout} size={size} catalogue={catalogue} child onChange={(c) => setChildren(children.map((x, k) => (k === childAt ? c : x)))} /></div>
          )}
          {children.length < catalogue.limits.children && (
            <div className="flex items-end gap-2">
              <SelectField className="flex-1" label="Add inside" value={childType} onValueChange={setChildType} options={(built ? ['headline', 'sub'] : Object.keys(catalogue.blocks).filter((t) => catalogue.blocks[t].child)).map((t) => ({ value: t, label: BLOCK_LABEL[t] ?? t }))} />
              <Button variant="outline" onClick={() => { setChildren([...children, { type: childType }]); setChildAt(children.length); }}><Plus /> Add</Button>
            </div>
          )}
        </FieldGroup>
      )}
    </div>
  );
}

// ---- the layout as a whole ----

function FieldsEditor({ layout, catalogue, onChange }: { layout: Layout; catalogue: Catalogue; onChange: (l: Layout) => void }) {
  const [adding, setAdding] = useState('');
  const free = Object.keys(catalogue.fields).filter((f) => !layout.fields[f]);
  const set = (name: string, rule: Layout['fields'][string] | null) => {
    const fields = { ...layout.fields };
    if (rule) fields[name] = rule; else delete fields[name];
    onChange({ ...layout, fields });
  };
  return (
    <FieldGroup legend="Fields" hint="What a post fills in for this layout, and how long it may be. Every field must be shown by a block.">
      <ul className="flex flex-col gap-2">
        {Object.entries(layout.fields).map(([name, rule]) => {
          const f = catalogue.fields[name];
          const list = f?.kind === 'stats' || f?.kind === 'items';
          const text = f?.kind === 'text' || f?.kind === 'short';
          return (
            <li key={name} className="flex flex-wrap items-end gap-3 rounded-md border p-2.5">
              <div className="min-w-40 flex-1"><p className="font-mono text-[13px]">{name}</p><p className="text-[12px] text-muted-foreground">{f?.word}</p></div>
              <CheckField label="Required" checked={rule.required === true} onCheckedChange={(v) => set(name, { ...rule, required: v || undefined })} />
              {text && <TextField className="w-28" label="Most characters" type="number" min={1} max={f?.cap} value={String(rule.max ?? f?.max ?? '')} onChange={(e) => set(name, { ...rule, max: num(e.target.value, f?.max ?? 1) })} />}
              {list && <TextField className="w-24" label="At least" type="number" min={0} max={f?.cap} value={String(rule.min ?? '')} onChange={(e) => set(name, { ...rule, min: e.target.value === '' ? undefined : num(e.target.value, 0) })} />}
              {list && <TextField className="w-24" label="At most" type="number" min={1} max={f?.cap} value={String(rule.max ?? f?.max ?? '')} onChange={(e) => set(name, { ...rule, max: num(e.target.value, f?.max ?? 1) })} />}
              <Button size="icon" variant="ghost" aria-label={`Remove the field ${name}`} onClick={() => set(name, null)}><Trash2 /></Button>
            </li>
          );
        })}
      </ul>
      {free.length > 0 && (
        <div className="flex items-end gap-2">
          <SelectField className="flex-1" label="Add a field" value={adding} placeholder="Choose a field" onValueChange={setAdding} options={free.map((f) => ({ value: f, label: `${f}: ${catalogue.fields[f].word}` }))} />
          <Button variant="outline" disabled={!adding} onClick={() => { set(adding, {}); setAdding(''); }}><Plus /> Add</Button>
        </div>
      )}
    </FieldGroup>
  );
}

function GridEditor({ layout, size, catalogue, onChange }: { layout: Layout; size: string; catalogue: Catalogue; onChange: (l: Layout) => void }) {
  const g = layout.canvas[size];
  const m = marginsOf(g.margin), min = catalogue.sizes[size]?.minMargins;
  const set = (next: Partial<Grid>) => onChange({ ...layout, canvas: { ...layout.canvas, [size]: { ...g, ...next } } });
  return (
    <FieldGroup legend={`Grid of the ${size} page`} hint={min ? `Margins of at least ${min.top} px at the top, ${min.right} at the sides and ${min.bottom} at the bottom keep text clear of the edges.` : undefined}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TextField label="Columns" type="number" min={1} max={catalogue.grid.columns[1]} value={String(g.columns)} onChange={(e) => set({ columns: num(e.target.value, g.columns) })} />
        <TextField label="Rows" type="number" min={1} max={catalogue.grid.rows[1]} value={String(g.rows)} onChange={(e) => set({ rows: num(e.target.value, g.rows) })} />
        <TextField label="Gutter (px)" type="number" min={0} max={catalogue.grid.gutter[1]} value={String(g.gutter ?? 0)} onChange={(e) => set({ gutter: num(e.target.value, 0) })} />
        <TextField label="Row gutter (px)" type="number" min={0} max={catalogue.grid.gutter[1]} value={String(g.rowGutter ?? g.gutter ?? 0)} onChange={(e) => set({ rowGutter: num(e.target.value, 0) })} />
        {EDGES.map((e) => <TextField key={e} label={`Margin ${e}`} type="number" min={min?.[e] ?? 0} max={catalogue.grid.margin[1]} value={String(m[e])} onChange={(ev) => set({ margin: { ...m, [e]: num(ev.target.value, m[e]) } })} />)}
      </div>
    </FieldGroup>
  );
}

function LayoutEditor({ initial, stored, catalogue, onSaved, onClose }: { initial: Layout; stored: StoredLayout | null; catalogue: Catalogue; onSaved: (l: StoredLayout) => void; onClose: () => void }) {
  const [layout, setLayout] = useState<Layout>(initial);
  const sizes = Object.keys(layout.canvas);
  const [size, setSize] = useState(sizes.includes('feed') ? 'feed' : sizes[0] ?? 'feed');
  const [selected, setSelected] = useState<number | null>(null);
  const [corner, setCorner] = useState<{ col: number; row: number } | null>(null);
  const [tab, setTab] = useState('editor');
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [newType, setNewType] = useState('headline');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const checked = useDebounced(layout, 400);
  const seq = useRef(0);
  const built = builtPage(layout);
  const pageCat = built ? catalogue.pages[layout.page!] : null;

  // The engine's verdict as people edit.
  useEffect(() => {
    const mine = ++seq.current;
    api.post<{ problems: string[] }>('/api/settings/layouts/validate', { definition: checked })
      .then((r) => { if (mine === seq.current) setProblems(r.problems); })
      .catch((e) => { if (mine === seq.current) setProblems([errorMessage(e)]); });
  }, [checked]);
  useEffect(() => { if (tab === 'json') { setJson(JSON.stringify(layout, null, 2)); setJsonError(''); } }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!layout.canvas[size]) setSize(Object.keys(layout.canvas)[0] ?? 'feed'); }, [layout.canvas, size]);

  const block = selected !== null ? layout.blocks[selected] : null;
  const setBlock = (i: number, b: Block) => setLayout({ ...layout, blocks: layout.blocks.map((x, k) => (k === i ? b : x)) });
  const move = (i: number, d: -1 | 1) => { const l = [...layout.blocks]; [l[i], l[i + d]] = [l[i + d], l[i]]; setLayout({ ...layout, blocks: l }); setSelected(i + d); };
  const onCell = (cell: { col: number; row: number }) => {
    if (selected === null || !block) return;
    if (!corner) { setCorner(cell); return; }
    const slot = { col: Math.min(corner.col, cell.col), row: Math.min(corner.row, cell.row), width: Math.abs(cell.col - corner.col) + 1, height: Math.abs(cell.row - corner.row) + 1 };
    setBlock(selected, withSlot(block, size, slot, sizes));
    setCorner(null);
  };
  const addBlock = () => {
    if (built) {
      // On a built-in page: chrome is placed by the page; anything else starts at a rectangle across the middle of the page.
      const spec = pageCat?.blocks[newType];
      const b: Block = spec?.chrome ? { type: newType } : { type: newType, px: { x: 80, y: 600, w: 920, h: 200 } };
      if (newType === 'slabs') b.children = [];
      const next = { ...layout, blocks: [...layout.blocks, b] };
      if (spec?.field && !layout.fields[spec.field]) next.fields = { ...layout.fields, [spec.field]: {} };
      setLayout(next);
      setSelected(next.blocks.length - 1);
      return;
    }
    const g = layout.canvas[size];
    const b: Block = { type: newType, slot: { col: 1, row: Math.max(1, g.rows - 1), width: Math.min(4, g.columns), height: 1 } };
    const spec = catalogue.blocks[newType];
    if (newType === 'label') b.text = 'Label';
    if (newType === 'slab') b.children = [];
    const next = { ...layout, blocks: [...layout.blocks, sizes.length > 1 ? withSlot(b, size, b.slot as Slot, sizes) : b] };
    // A block that shows a field brings its field along, so the layout stays complete.
    if (spec?.field && !layout.fields[spec.field]) next.fields = { ...layout.fields, [spec.field]: {} };
    setLayout(next);
    setSelected(next.blocks.length - 1);
  };
  const toggleSize = (z: string, on: boolean) => {
    const canvas = { ...layout.canvas };
    if (on) canvas[z] = { ...(layout.canvas[size] ?? blankLayout().canvas.feed), margin: { ...marginsOf((layout.canvas[size] ?? blankLayout().canvas.feed).margin), ...Object.fromEntries(EDGES.map((e) => [e, Math.max(marginsOf(layout.canvas[size]?.margin ?? 0)[e], catalogue.sizes[z].minMargins[e])])) } };
    else delete canvas[z];
    const keys = Object.keys(canvas);
    // per-size slots follow the sizes: a new size starts from the current one's slots, a removed size drops its own
    const blocks = layout.blocks.map((b) => {
      if (!b.slot || 'col' in b.slot) return b;
      const per = { ...(b.slot as Record<string, Slot>) };
      if (on) per[z] = per[size]; else delete per[z];
      return { ...b, slot: keys.length === 1 ? per[keys[0]] : per };
    });
    setLayout({ ...layout, canvas, blocks });
    if (on) setSize(z);
  };

  async function runPreview() {
    setBusy('preview');
    setPreview(null);
    try { setPreview(await api.post<PreviewResult>('/api/settings/layouts/preview', { definition: layout, size })); }
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
      const parsed = JSON.parse(json) as Layout;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The JSON must be one layout object');
      setLayout(parsed);
      setSelected(null);
      setJsonError('');
      toast.success('Applied; the editor shows the new layout');
    } catch (e) { setJsonError(errorMessage(e)); }
  }

  const darkPage = catalogue.darkGrounds.includes(groundOf(layout));
  const blockTypes = built ? Object.keys(pageCat?.blocks ?? {}) : Object.keys(catalogue.blocks);
  return (
    <FormPanel open onClose={onClose} size="xl" busy={busy === 'save'} title={stored ? `Edit ${stored.name}` : 'New layout'}
      description="Place blocks on the grid and set their options. The sketch moves as you edit; the preview draws the real image with the brand and runs every check."
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy === 'save'}>Cancel</Button>
          <BusyButton variant="outline" loading={busy === 'preview'} onClick={() => void runPreview()}><Eye aria-hidden="true" /> Preview</BusyButton>
          <BusyButton loading={busy === 'save'} disabled={problems.length > 0} onClick={() => void save()}>{stored ? 'Save' : 'Add layout'}</BusyButton>
        </>
      )}>
      <div className="flex flex-col gap-5">
        {error && <Notice tone="bad">{error}</Notice>}
        {built && (
          <Notice tone="info" title={`On ${PAGE_WORD[layout.page!] ?? layout.page} of the built-in templates`}>
            Blocks sit at pixel rectangles on the feed page and are drawn with the built-in look; the logo bar, running head and footer are
            placed by the page as your brand's style says. Conditions (a block drawn only when a field is filled) and page colours chosen by
            conditions are edited in the JSON view.
          </Notice>
        )}
        {problems.length > 0
          ? <Notice tone="warn" title="The engine would not accept this layout yet:"><Lines items={problems.slice(0, 12)} />{problems.length > 12 && <p className="mt-1 text-[12.5px]">and {problems.length - 12} more</p>}</Notice>
          : <Notice tone="good">The engine accepts this layout.</Notice>}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="editor">Editor</TabsTrigger><TabsTrigger value="json"><Braces aria-hidden="true" /> JSON</TabsTrigger></TabsList>
          <TabsContent value="editor" className="mt-4 flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Name" value={layout.name} maxLength={40} onChange={(e) => setLayout({ ...layout, name: e.target.value })} />
              <TextField label="Id" mono hint="What a post's design names: lowercase letters, digits and -" value={layout.id} maxLength={40} onChange={(e) => setLayout({ ...layout, id: e.target.value })} />
              <TextAreaField className="sm:col-span-2" label="Description" optional rows={2} maxLength={300} hint="For your team and the AI: what this layout is for." value={layout.description ?? ''} onChange={(e) => setLayout({ ...layout, description: e.target.value || undefined })} />
              {Array.isArray(layout.ground)
                ? <p className="text-[13px] text-muted-foreground">Page colour: chosen by conditions ({layout.ground.map((c) => (c.when ? `${c.ground} when ${whenWords(c.when)}` : `else ${c.ground}`)).join(', ')}); edit it in the JSON view.</p>
                : <SelectField label="Page colour" value={layout.ground ?? 'series'} onValueChange={(v) => setLayout({ ...layout, ground: v })} options={[{ value: 'series', label: "The series' colour" }, ...opts([...catalogue.grounds, ...(layout.page === 'poster' && layout.fields.image ? ['photo'] : [])])]} />}
              <SelectField label="Second half of the headline" value={layout.accent ?? 'series'} onValueChange={(v) => setLayout({ ...layout, accent: v })} options={[{ value: 'series', label: "The brand's style" }, ...opts(catalogue.accents)]} />
              <SelectField label="Texture" value={layout.texture ?? 'auto'} onValueChange={(v) => setLayout({ ...layout, texture: v })} options={catalogue.textures.map((t) => ({ value: t, label: t === 'auto' ? "The brand's style" : word(t) }))} />
            </div>
            {!built && <FieldGroup legend="Sizes" hint="Each size has its own grid; a block may sit in a different slot on each.">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {Object.keys(catalogue.sizes).map((z) => <CheckField key={z} label={SIZE_LABEL[z] ?? z} checked={!!layout.canvas[z]} disabled={!!layout.canvas[z] && sizes.length === 1} onCheckedChange={(v) => toggleSize(z, v)} />)}
              </div>
              {sizes.length > 1 && <div className="flex flex-wrap gap-1.5">{sizes.map((z) => <Button key={z} size="sm" variant={z === size ? 'secondary' : 'ghost'} onClick={() => setSize(z)}>{z}</Button>)}</div>}
            </FieldGroup>}
            {layout.canvas[size] && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className="flex flex-col gap-2">
                  <LayoutSketch layout={layout} size={size} catalogue={catalogue} selected={selected} dark={darkPage} onSelect={(i) => { setSelected(i); setCorner(null); }} onCell={selected !== null && !built ? onCell : undefined} />
                  <p className="text-[12.5px] text-muted-foreground">{selected === null ? 'Click a block to change it.' : built ? 'Set the selected block\'s rectangle in pixels on the right.' : corner ? `First corner at column ${corner.col}, row ${corner.row}: click the opposite corner.` : 'Click two cells to place the selected block.'}</p>
                  {preview && (
                    <div className="flex flex-col gap-2">
                      {preview.image && <img src={preview.image} alt={`Preview of the layout at ${preview.size} size`} className="w-full rounded-md border" />}
                      {preview.error && <Notice tone="bad">{preview.error}</Notice>}
                      {preview.warnings.length > 0 && <Notice tone="warn" title="Checks:"><Lines items={preview.warnings} /></Notice>}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <FieldGroup legend="Blocks" hint="Listed from the back to the front.">
                    <ul className="flex flex-col gap-1">
                      {layout.blocks.map((b, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <Button size="sm" variant={selected === i ? 'secondary' : 'ghost'} className="min-w-0 flex-1 justify-start truncate" onClick={() => { setSelected(selected === i ? null : i); setCorner(null); }}>{blockTitle(b)}</Button>
                          <Button size="icon" variant="ghost" aria-label="Move back" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                          <Button size="icon" variant="ghost" aria-label="Move forward" disabled={i === layout.blocks.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                          <Button size="icon" variant="ghost" aria-label={`Remove ${blockTitle(b)}`} onClick={() => { setLayout({ ...layout, blocks: layout.blocks.filter((_, k) => k !== i) }); setSelected(null); }}><Trash2 /></Button>
                        </li>
                      ))}
                    </ul>
                    {layout.blocks.length < catalogue.limits.blocks && (
                      <div className="flex items-end gap-2">
                        <SelectField className="flex-1" label="Add a block" value={newType} onValueChange={setNewType} options={blockTypes.map((t) => ({ value: t, label: BLOCK_LABEL[t] ?? t }))} />
                        <Button variant="outline" onClick={addBlock}><Plus /> Add</Button>
                      </div>
                    )}
                  </FieldGroup>
                  {block && selected !== null && (
                    <FieldGroup legend={blockTitle(block)}>
                      <BlockEditor key={selected} block={block} layout={layout} size={size} catalogue={catalogue} onChange={(b) => setBlock(selected, b)} />
                    </FieldGroup>
                  )}
                  {!built && <GridEditor layout={layout} size={size} catalogue={catalogue} onChange={setLayout} />}
                  <FieldsEditor layout={layout} catalogue={catalogue} onChange={setLayout} />
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="json" className="mt-4 flex flex-col gap-3">
            <p className="text-[13px] text-muted-foreground">The layout exactly as the engine reads it. Edit it here and apply it; the engine checks it like any other change.</p>
            <TextAreaField label="Layout JSON" mono rows={24} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} error={jsonError || undefined} />
            <div><Button variant="outline" onClick={applyJson}>Apply the JSON</Button></div>
          </TabsContent>
        </Tabs>
      </div>
    </FormPanel>
  );
}

// ---- the page ----

function LayoutCard({ item, catalogue, onEdit, onToggle, onCopy, onRemove }: { item: StoredLayout; catalogue: Catalogue; onEdit: () => void; onToggle: (v: boolean) => Promise<void>; onCopy: () => Promise<void>; onRemove: () => void }) {
  const [busy, setBusy] = useState('');
  const sizes = Object.keys(item.definition.canvas ?? {});
  const run = (what: string, fn: () => Promise<void>) => async () => { setBusy(what); try { await fn(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(''); } };
  return (
    <li className="grid gap-4 rounded-lg border bg-card p-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <LayoutSketch layout={item.definition} size={sizes.includes('feed') ? 'feed' : sizes[0]} catalogue={catalogue} showGrid={false} dark={catalogue.darkGrounds.includes(groundOf(item.definition))} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{item.name}</h3>
            <p className="font-mono text-[12px] text-muted-foreground">{item.slug}</p>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={item.enabled} disabled={busy === 'toggle'} onCheckedChange={(v) => void run('toggle', () => onToggle(v))()} aria-label={`Posts and the AI can use ${item.name}`} />
            {item.enabled ? 'In use' : 'Off'}
          </label>
        </div>
        {item.definition.description && <p className="text-[13px] text-muted-foreground">{item.definition.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {sizes.map((z) => <ToneBadge key={z} tone="quiet">{z}</ToneBadge>)}
          {builtPage(item.definition) && <ToneBadge tone="quiet">{PAGE_WORD[item.definition.page!] ?? item.definition.page}</ToneBadge>}
          <span className="text-[12px] text-muted-foreground">Fields: {Object.keys(item.definition.fields ?? {}).join(', ')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil aria-hidden="true" /> Edit</Button>
          <BusyButton size="sm" variant="ghost" loading={busy === 'copy'} onClick={() => void run('copy', onCopy)()}><Copy aria-hidden="true" /> Duplicate</BusyButton>
          <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 aria-hidden="true" /> Remove</Button>
        </div>
      </div>
    </li>
  );
}

// A built-in layout: read only. Its sketch, what it is for, the variant of its template it draws, its fields; a copy to change, when a
// brand's layout may use what it uses (else why not); and its JSON to read.
function BuiltinCard({ item, catalogue, canCopy, onCopy }: { item: BuiltinLayout; catalogue: Catalogue; canCopy: boolean; onCopy: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [json, setJson] = useState(false);
  const l = item.definition, sizes = Object.keys(l.canvas ?? {});
  return (
    <li className="grid gap-4 rounded-lg border bg-card p-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <LayoutSketch layout={l} size={sizes.includes('feed') ? 'feed' : sizes[0]} catalogue={catalogue} showGrid={false} dark={catalogue.darkGrounds.includes(groundOf(l))} />
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{l.name}</h3>
            <p className="font-mono text-[12px] text-muted-foreground">{'{ "template": "'}{item.template}{'" }'}{item.variant ? `, when ${item.variant}` : ''}</p>
          </div>
          <ToneBadge tone="info">Built-in</ToneBadge>
        </div>
        {l.description && <p className="text-[13px] text-muted-foreground">{l.description}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {sizes.map((z) => <ToneBadge key={z} tone="quiet">{z}</ToneBadge>)}
          <ToneBadge tone="quiet">{PAGE_WORD[l.page ?? 'grid'] ?? l.page}</ToneBadge>
          <span className="text-[12px] text-muted-foreground">Fields: {Object.keys(l.fields ?? {}).join(', ')}</span>
        </div>
        {!item.copyable && item.why && <p className="text-[12.5px] text-muted-foreground">Not copied into a layout of your own: {item.why}.</p>}
        <div className="flex flex-wrap gap-2">
          {item.copyable && (
            <BusyButton size="sm" variant="outline" loading={busy} disabled={!canCopy}
              onClick={async () => { setBusy(true); try { await onCopy(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>
              <Copy aria-hidden="true" /> Duplicate to edit
            </BusyButton>
          )}
          <Button size="sm" variant="ghost" aria-expanded={json} onClick={() => setJson(!json)}><Braces aria-hidden="true" /> {json ? 'Hide' : 'Show'} JSON</Button>
        </div>
        {json && <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11.5px] leading-snug">{JSON.stringify(l, null, 2)}</pre>}
      </div>
    </li>
  );
}

export function LayoutsPage() {
  useDocumentTitle('Layouts');
  const list = useLoad(() => api.get<LayoutsResponse>('/api/settings/layouts'), []);
  const [editing, setEditing] = useState<{ layout: Layout; stored: StoredLayout | null } | null>(null);
  const [start, setStart] = useState('blank');
  const [removing, setRemoving] = useState<StoredLayout | null>(null);
  const data = list.data;
  const items = data?.layouts ?? [];
  const starter = useMemo(() => data?.starters.find((s) => s.id === start) ?? null, [data, start]);

  const replace = (l: StoredLayout) => list.setData((d) => (d ? { ...d, layouts: d.layouts.some((x) => x.id === l.id) ? d.layouts.map((x) => (x.id === l.id ? l : x)) : [...d.layouts, l] } : d));
  async function copyBuiltin(b: BuiltinLayout) {
    const { layout } = await api.post<{ layout: StoredLayout }>('/api/settings/layouts', { builtin: b.id });
    replace(layout);
    toast.success(`Copied as ${layout.slug}; it is off until you switch it on`);
    setEditing({ layout: structuredClone(layout.definition), stored: layout });
  }
  const freeId = (base: string) => { let id = base, n = 2; while (items.some((x) => x.slug === id)) id = `${base}-${n++}`; return id; };
  function begin() {
    const base = starter ? structuredClone(starter) : blankLayout();
    setEditing({ layout: { ...base, id: freeId(base.id) }, stored: null });
  }

  return (
    <SettingsPage
      title="Layouts"
      description="Your own page compositions: blocks placed on a grid, drawn in your brand's look and checked like the built-in pages. A post uses one by its id; the AI is told about the layouts that are in use."
    >
      {list.error && <ErrorBlock message={list.error} onRetry={() => void list.reload()} />}
      {list.loading && !data && <div className="flex flex-col gap-3"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>}
      {data && (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-4">
            <SelectField className="min-w-60 flex-1" label="Start from" value={start} onValueChange={setStart}
              options={[{ value: 'blank', label: 'A blank layout' }, ...data.starters.map((s) => ({ value: s.id, label: `${s.name} (like the built-in ${s.id} page)` }))]}
              hint={starter?.description} />
            <Button disabled={items.length >= data.max} onClick={begin}><Plus aria-hidden="true" /> New layout</Button>
          </div>
          {items.length === 0
            ? <EmptyBlock title="No layouts yet">Start from a blank layout or one like a built-in page, change it, preview it with your brand and add it.</EmptyBlock>
            : <ul className="flex flex-col gap-3">{items.map((item) => (
              <LayoutCard key={item.id} item={item} catalogue={data.catalogue}
                onEdit={() => setEditing({ layout: structuredClone(item.definition), stored: item })}
                onToggle={async (v) => replace((await api.patch<{ layout: StoredLayout }>(`/api/settings/layouts/${item.id}`, { enabled: v })).layout)}
                onCopy={async () => { replace((await api.post<{ layout: StoredLayout }>(`/api/settings/layouts/${item.id}/duplicate`)).layout); toast.success('Copied; the copy is off until you switch it on'); }}
                onRemove={() => setRemoving(item)} />
            ))}</ul>}
          <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><LayoutTemplate className="size-4" aria-hidden="true" /> {items.length} of {data.max} layouts. A design block uses one as {'{ "template": "layout", "layout": "<id>" }'} with the layout's fields.</p>
          <section className="flex flex-col gap-3" aria-labelledby="builtin-layouts">
            <div>
              <h2 id="builtin-layouts" className="text-base font-semibold">Built-in layouts</h2>
              <p className="text-[13px] text-muted-foreground">
                The templates' own layouts, as a design names them ({'{ "template": "number" }'}): read only. Duplicate one to start a layout of
                your own from it, on the same page, with the same blocks and pixel positions. A copy leaves out what reads a template's own
                settings (the headline size and alignment a design gives, the phone's and photo's positions, the pills, a desktop window's
                frame and tilt): set those in the copy itself. Page covers are not post images and are not listed.
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {data.builtins.map((b) => <BuiltinCard key={b.id} item={b} catalogue={data.catalogue} canCopy={items.length < data.max} onCopy={() => copyBuiltin(b)} />)}
            </ul>
          </section>
          {editing && (
            <LayoutEditor initial={editing.layout} stored={editing.stored} catalogue={data.catalogue} onClose={() => setEditing(null)}
              onSaved={(l) => { replace(l); setEditing(null); }} />
          )}
        </>
      )}
      <ConfirmAction open={!!removing} danger title="Remove this layout?" confirmLabel="Remove"
        message={<>The layout <strong>{removing?.name}</strong> ({removing?.slug}) is removed. Posts that use it keep it: it cannot be removed while one does.</>}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          await api.delete(`/api/settings/layouts/${removing!.id}`);
          list.setData((d) => (d ? { ...d, layouts: d.layouts.filter((x) => x.id !== removing!.id) } : d));
          setRemoving(null);
          toast.success('Layout removed');
        }} />
    </SettingsPage>
  );
}
