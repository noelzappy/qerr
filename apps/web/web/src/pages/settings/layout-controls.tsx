// The layout editor's controls (Settings, Layouts), each drawn from the engine's catalogue for the layout's kind of page and each
// changing one part of the layout through the editor model (layout-model.ts): a block's condition, the page colour and its cases,
// a block's place on each size, its options, what it shows and the blocks inside a slab, the fields, the grid of each size, and
// the "sketch as if" switches.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { CheckField, FieldGroup, SelectField, SwitchField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CHOICE_WORDS, blockControls, choicesFor, blockTitle, casesToOne, clauseKinds, conditionsUsed, defaultScenario, dropClause, edgesTouched, fieldsShown,
  fullWidthPx, groundToCases, isFullWidth, newClause, pageCatalogue, placeAs, placeBy, pxOn, readGround, readWhen, samePlace, sizesOf, slotOn, specFor,
  tidyBlock, withPlace, withSamePlace, writeGround, writeWhen,
  type ClauseKind, type Condition, type Control, type GroundModel, type Scenario,
} from './layout-model';
import {
  BLOCK_LABEL, EDGES, OPTION_LABEL, SIZE_LABEL, marginsOf,
  type Block, type Catalogue, type ChoiceValue, type Edge, type FieldRule, type Grid, type Layout, type OptionSpec, type PageCatalogue, type Px, type Slot, type When,
} from './layout-types';

const word = (v: string | number | boolean) => (v === true ? 'yes' : v === false ? 'no' : String(v).replace(/-/g, ' '));
const opts = (values: Array<string | number>) => values.map((v) => ({ value: String(v), label: word(v) }));
const num = (v: string, fallback: number) => (v.trim() === '' || !Number.isFinite(Number(v)) ? fallback : Math.round(Number(v)));
const move = <T,>(list: T[], i: number, d: -1 | 1): T[] => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; return l; };
const GROUND_LABEL: Record<string, string> = { series: "The series' colour", photo: 'The photo (from the image field)' };

// ---- a condition: always, or only when every clause holds ----

const PAGE_CHOICE: Record<string, string> = { first: 'page 1 of a carousel', later: 'a later page of a carousel', single: 'a single post (not a carousel)' };
const CLAUSE_ADD: Record<ClauseKind, string> = {
  present: 'Only when a field is filled', absent: 'Only when a field is empty', page: 'Only on some carousel pages', choice: 'Only when a choice is (or is not) …',
};

function ChoiceClause({ choice, choices, page, onChange }: { choice: NonNullable<Condition['choice']>; choices: string[]; page: PageCatalogue; onChange: (c: NonNullable<Condition['choice']>) => void }) {
  const spec = page.conditions.choices[choice.field];
  const values = spec?.values ?? choice.values;
  const toggle = (v: ChoiceValue, on: boolean) => {
    const next = on ? values.filter((x) => x === v || choice.values.includes(x)) : choice.values.filter((x) => x !== v);
    if (next.length) onChange({ ...choice, values: next });
  };
  const list = choices.includes(choice.field) ? choices : [choice.field, ...choices];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <SelectField label="when" value={choice.field} options={list.map((n) => ({ value: n, label: CHOICE_WORDS[n] ?? n }))}
          onValueChange={(f) => onChange({ field: f, op: choice.op, values: [page.conditions.choices[f].values[0]], list: false })} />
        <SelectField label="is" value={choice.op} options={[{ value: 'is', label: 'one of' }, { value: 'not', label: 'none of' }]} onValueChange={(op) => onChange({ ...choice, op: op as 'is' | 'not' })} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1" role="group" aria-label="Values">
        {values.map((v) => <CheckField key={String(v)} label={word(v)} checked={choice.values.includes(v)} disabled={choice.values.length === 1 && choice.values.includes(v)} onCheckedChange={(on) => toggle(v, on)} />)}
      </div>
      {spec?.unset && <p className="text-[12.5px] text-muted-foreground">An empty {choice.field} is none of these values: only “none of” lets it through.</p>}
    </div>
  );
}

export function ConditionEditor({ when, onChange, page, declared, legend = 'Show this block', always = 'Always shown.' }: {
  when: unknown; onChange: (w: When | undefined) => void; page: PageCatalogue; declared: string[]; legend?: string; always?: string;
}) {
  const { cond } = readWhen(when);
  const used = clauseKinds(cond);
  const set = (c: Condition) => onChange(writeWhen(c));
  const choices = choicesFor(page, declared);
  const free = (['present', 'absent', 'page', 'choice'] as ClauseKind[]).filter((k) => !used.includes(k)
    && (k === 'choice' ? choices.length > 0 : k === 'page' ? page.conditions.pages.length > 0 : declared.length > (k === 'present' ? (cond.absent ? 1 : 0) : (cond.present ? 1 : 0))));
  const fieldsFor = (other?: string) => opts(declared.filter((f) => f !== other));
  return (
    <div className="flex min-w-0 flex-col gap-2" role="group" aria-label={legend}>
      <p className="text-sm font-medium">{legend}</p>
      {used.length === 0 && <p className="text-[13px] text-muted-foreground">{always}</p>}
      {used.map((k, i) => (
        <div key={k} className="flex min-w-0 flex-col gap-1 rounded-md border bg-muted/30 px-2.5 pb-2.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-medium text-muted-foreground">{i === 0 ? 'Only' : 'and'}</span>
            <Button size="icon" variant="ghost" className="size-8" aria-label={`Remove the condition: ${CLAUSE_ADD[k].toLowerCase()}`} onClick={() => set(dropClause(k, cond))}><X /></Button>
          </div>
          {k === 'present' && <SelectField label="when this field is filled" value={cond.present ?? ''} options={fieldsFor(cond.absent)} onValueChange={(f) => set({ ...cond, present: f })} />}
          {k === 'absent' && <SelectField label="when this field is empty" value={cond.absent ?? ''} options={fieldsFor(cond.present)} onValueChange={(f) => set({ ...cond, absent: f })} />}
          {k === 'page' && (
            <SelectField label="on" value={cond.page ?? ''} options={page.conditions.pages.map((p) => ({ value: p, label: PAGE_CHOICE[p] ?? p }))} onValueChange={(p) => set({ ...cond, page: p })}
              hint="A post made with a layout is one image: it counts as a single post." />
          )}
          {k === 'choice' && cond.choice && <ChoiceClause choice={cond.choice} choices={choices} page={page} onChange={(choice) => set({ ...cond, choice })} />}
        </div>
      ))}
      {free.length > 0 && (
        <SelectField label={used.length ? 'Add another condition' : 'Add a condition'} value="" placeholder={used.length ? 'And only …' : 'Always, or only …'}
          onValueChange={(k) => { if (k) set(newClause(k as ClauseKind, cond, page, declared)); }}
          options={free.map((k) => ({ value: k, label: CLAUSE_ADD[k] }))} />
      )}
    </div>
  );
}

// ---- the page colour ----

function GroundSelect({ value, page, layout, catalogue, onChange, label = 'Page colour' }: { value: unknown; page: PageCatalogue; layout: Layout; catalogue: Catalogue; onChange: (g: string) => void; label?: string }) {
  const v = typeof value === 'string' ? value : 'series';
  const list = page.grounds.filter((g) => g !== 'photo' || (page.photoGround && layout.fields[page.photoGround.field]));
  const alias = Object.hasOwn(catalogue.groundAliases, v) ? [{ value: v, label: `${v} (an older name for ${catalogue.groundAliases[v]})` }] : [];
  return <SelectField label={label} value={v} onValueChange={onChange} options={[...list.map((g) => ({ value: g, label: GROUND_LABEL[g] ?? word(g) })), ...alias]}
    hint={page.photoGround && !layout.fields[page.photoGround.field] ? 'Declare the image field to start the page from the photo.' : undefined} />;
}

export function GroundEditor({ layout, catalogue, onChange }: { layout: Layout; catalogue: Catalogue; onChange: (l: Layout) => void }) {
  const page = pageCatalogue(catalogue, layout)!;
  const model = readGround(layout.ground).model;
  const declared = Object.keys(layout.fields);
  const set = (m: GroundModel) => { const g = writeGround(m); const next = { ...layout }; if (g === undefined) delete next.ground; else next.ground = g; onChange(next); };
  const cases = model.kind === 'cases' ? model.cases : [];
  const setCase = (i: number, c: (typeof cases)[number]) => set({ kind: 'cases', cases: cases.map((x, k) => (k === i ? c : x)) });
  return (
    <FieldGroup legend="Page colour" hint="One colour, or a colour chosen by the post: the first case whose condition holds, else the last.">
      <SelectField label="Chosen" value={model.kind === 'cases' ? 'cases' : 'one'} onValueChange={(v) => set(v === 'cases' ? groundToCases(layout, page) : casesToOne(model))}
        options={[{ value: 'one', label: 'One colour for every post' }, { value: 'cases', label: 'By conditions' }]} />
      {model.kind !== 'cases' && <GroundSelect value={model.kind === 'one' ? model.ground : undefined} page={page} layout={layout} catalogue={catalogue} onChange={(g) => set({ kind: 'one', ground: g })} />}
      {model.kind === 'cases' && (
        <ol className="flex flex-col gap-2">
          {cases.map((c, i) => {
            const last = i === cases.length - 1, otherwise = last && !c.cond;
            return (
              <li key={i} className="flex flex-col gap-3 rounded-md border p-3">
                <div className="flex items-center gap-1">
                  <p className="flex-1 text-sm font-medium">{otherwise ? 'Otherwise' : `Case ${i + 1}`}</p>
                  {!otherwise && <Button size="icon" variant="ghost" aria-label={`Move case ${i + 1} up`} disabled={i === 0} onClick={() => set({ kind: 'cases', cases: move(cases, i, -1) })}><ArrowUp /></Button>}
                  {!otherwise && <Button size="icon" variant="ghost" aria-label={`Move case ${i + 1} down`} disabled={i >= cases.length - 2} onClick={() => set({ kind: 'cases', cases: move(cases, i, 1) })}><ArrowDown /></Button>}
                  {!otherwise && <Button size="icon" variant="ghost" aria-label={`Remove case ${i + 1}`} onClick={() => set(cases.length === 1 ? casesToOne(model) : { kind: 'cases', cases: cases.filter((_, k) => k !== i) })}><Trash2 /></Button>}
                </div>
                {!otherwise && <ConditionEditor legend="When" always="This case needs a condition (only the last case has none)." when={c.cond ? writeWhen(c.cond) : undefined} page={page} declared={declared}
                  onChange={(w) => setCase(i, { ...c, cond: readWhen(w).cond })} />}
                <GroundSelect label={otherwise ? 'Page colour' : 'then the page colour is'} value={c.ground} page={page} layout={layout} catalogue={catalogue} onChange={(g) => setCase(i, { ...c, ground: g })} />
              </li>
            );
          })}
        </ol>
      )}
      {model.kind === 'cases' && cases.length < catalogue.limits.groundCases && (
        <div><Button variant="outline" onClick={() => set({ kind: 'cases', cases: [...cases.slice(0, -1), { cond: newClause('present', {}, page, declared), ground: 'dark' }, ...cases.slice(-1)] })}><Plus /> Add a case</Button></div>
      )}
    </FieldGroup>
  );
}

// ---- one option ----

export function OptionControl({ name, spec, value, onChange }: { name: string; spec: OptionSpec; value: unknown; onChange: (v: unknown) => void }) {
  const label = OPTION_LABEL[name] ?? name;
  if (spec.type === 'enum') {
    const v = String(value ?? spec.default);
    const alias = spec.aliases && Object.hasOwn(spec.aliases, v) ? [{ value: v, label: `${v} (an older name for ${spec.aliases[v]})` }] : [];
    return <SelectField label={label} value={v} options={[...opts(spec.values), ...alias]} onValueChange={(x) => onChange(typeof spec.values[0] === 'number' ? Number(x) : x)} />;
  }
  if (spec.type === 'int') {
    return <TextField label={label} type="number" inputMode="numeric" min={spec.min} max={spec.max} step={spec.step} hint={`${spec.min} to ${spec.max}`} value={String(value ?? spec.default)}
      onChange={(e) => onChange(Math.min(spec.max, Math.max(spec.min, num(e.target.value, Number(value ?? spec.default)))))} />;
  }
  return <SwitchField className="sm:mt-6" label={label} checked={(value ?? spec.default) === true} onCheckedChange={onChange} />;
}

// ---- where a block sits ----

function NumberRow<K extends string>({ keys, labels, value, bounds, onChange }: { keys: K[]; labels: Record<K, string>; value: Record<K, number>; bounds: Record<K, [number, number]>; onChange: (v: Record<K, number>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {keys.map((k) => (
        <TextField key={k} label={labels[k]} type="number" inputMode="numeric" min={bounds[k][0]} max={bounds[k][1]} value={String(value[k])}
          onChange={(e) => onChange({ ...value, [k]: num(e.target.value, value[k]) })} />
      ))}
    </div>
  );
}
const SLOT_LABEL = { col: 'Column', row: 'Row', width: 'Width', height: 'Height' };
const PX_LABEL = { x: 'Left', y: 'Top', w: 'Width', h: 'Height' };

function PlaceEditor({ block, layout, size, setSize, catalogue, by, onChange }: { block: Block; layout: Layout; size: string; setSize: (z: string) => void; catalogue: Catalogue; by: Array<'slot' | 'px'>; onChange: (b: Block) => void }) {
  const sizes = sizesOf(layout), spec = specFor(catalogue, layout, block.type), page = catalogue.sizes[size] ?? { w: 1080, h: 1350 };
  const how = placeBy(block) === 'none' ? by[0] : (placeBy(block) as 'slot' | 'px'), same = samePlace(block), g = layout.canvas[size];
  const full = isFullWidth(block, spec);
  const slot = slotOn(block, size) ?? { col: 1, row: 1, width: 1, height: 1 }, px = pxOn(block, size) ?? { x: 80, y: 600, w: 920, h: 200 };
  const summary = (z: string) => { const s = slotOn(block, z), p = pxOn(block, z); return s ? `column ${s.col}, row ${s.row}, ${s.width} x ${s.height} cells` : p ? `${p.x}, ${p.y}, ${p.w} x ${p.h} px` : 'not placed'; };
  return (
    <FieldGroup legend="Place" hint={how === 'slot' ? 'In grid cells, counted from 1 (width and height in cells). Or click two cells on the sketch: the first corner, then the opposite one.' : 'In page pixels from the top-left corner. Text keeps inside the page\'s minimum margins.'}>
      <div className="grid gap-3 sm:grid-cols-2">
        {by.length > 1 && <SelectField label="Placed by" value={how} options={[{ value: 'slot', label: 'Grid cells' }, { value: 'px', label: 'Page pixels' }]} onValueChange={(v) => onChange(placeAs(block, v as 'slot' | 'px', layout, catalogue))} />}
        {sizes.length > 1 && <SwitchField className="sm:mt-6" label="Same place on every size" checked={same} onCheckedChange={(v) => onChange(withSamePlace(block, v, size, sizes))} />}
      </div>
      {sizes.length > 1 && !same && (
        <ul className="flex flex-col gap-1 text-[13px]" aria-label="Place on each size">
          {sizes.map((z) => (
            <li key={z}><button type="button" onClick={() => setSize(z)} className={cn('flex w-full flex-wrap gap-x-2 rounded px-2 py-1 text-left hover:bg-muted', z === size && 'bg-secondary font-medium')}>
              <span className="w-14">{z}</span><span className="text-muted-foreground">{summary(z)}</span>
            </button></li>
          ))}
        </ul>
      )}
      <p className="text-[12.5px] text-muted-foreground">{same || sizes.length === 1 ? (sizes.length > 1 ? 'On every size:' : `On the ${size} page:`) : `On the ${size} page:`}</p>
      {full
        ? (
          <>
            <p className="text-[13px] text-muted-foreground">The page runs this the full width of the page down to its bottom edge; set where it starts.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <TextField label="Top (px)" type="number" inputMode="numeric" min={0} max={page.h - 1} value={String(px.y)} onChange={(e) => onChange(withPlace(block, 'px', size, fullWidthPx(num(e.target.value, px.y), page), sizes))} />
            </div>
          </>
        )
        : how === 'slot' && g
          ? <NumberRow keys={['col', 'row', 'width', 'height']} labels={SLOT_LABEL} value={slot} bounds={{ col: [1, g.columns], row: [1, g.rows], width: [1, g.columns], height: [1, g.rows] }} onChange={(s: Slot) => onChange(withPlace(block, 'slot', size, s, sizes))} />
          : <NumberRow keys={['x', 'y', 'w', 'h']} labels={PX_LABEL} value={px} bounds={catalogue.sizes[size]?.px ?? { x: [0, 1079], y: [0, 1349], w: [1, 1080], h: [1, 1350] }} onChange={(p: Px) => onChange(withPlace(block, 'px', size, p, sizes))} />}
    </FieldGroup>
  );
}

// ---- one block ----

export function BlockEditor({ block, layout, size, setSize, catalogue, onChange, child = false }: {
  block: Block; layout: Layout; size: string; setSize: (z: string) => void; catalogue: Catalogue; onChange: (b: Block, declare?: string[]) => void; child?: boolean;
}) {
  const spec = specFor(catalogue, layout, block.type), page = pageCatalogue(catalogue, layout);
  const declared = Object.keys(layout.fields);
  const [childAt, setChildAt] = useState<number | null>(null);
  const [childType, setChildType] = useState('');
  if (!spec || !page) return <p className="text-[13px] text-destructive">This page does not draw a {BLOCK_LABEL[block.type] ?? block.type} block. Remove it, or change it in the JSON view.</p>;
  const change = (b: Block, declare?: string[]) => onChange(tidyBlock(b, spec), declare);
  const fieldOptions = (fields: string[]) => fields.map((f) => ({ value: f, label: declared.includes(f) ? f : `${f} (adds the field)` }));
  const pick = (key: string, f: string) => change(f ? { ...block, [key]: f } : (({ [key]: _x, ...rest }) => rest as Block)(block), f && !declared.includes(f) ? [f] : undefined);
  const children = block.children ?? [];
  const setChildren = (list: Block[], declare?: string[]) => change({ ...block, children: list }, declare);
  const render = (c: Control) => {
    switch (c.kind) {
      case 'place': return <PlaceEditor key="place" block={block} layout={layout} size={size} setSize={setSize} catalogue={catalogue} by={c.by} onChange={change} />;
      case 'bleed': {
        const touched = edgesTouched(block, layout);
        return (
          <FieldGroup key="bleed" legend="Bleed" hint="Run past the margins to the page edge, where the slot touches the edge of the grid on every size.">
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {c.edges.map((e: Edge) => {
                const on = (block.bleed ?? []).includes(e);
                return <CheckField key={e} label={`To the ${e} edge`} checked={on} disabled={!on && !touched.includes(e)}
                  onCheckedChange={(v) => { const list = (block.bleed ?? []).filter((x) => x !== e); const next = v ? [...list, e] : list; change(next.length ? { ...block, bleed: next } : (({ bleed: _b, ...rest }) => rest as Block)(block)); }} />;
              })}
            </div>
          </FieldGroup>
        );
      }
      case 'field': return <SelectField key="field" label="Shows the field" value={String(block.field ?? spec.field ?? '')} options={fieldOptions(c.fields)} onValueChange={(f) => pick('field', f)} />;
      case 'words': {
        const way = block.field !== undefined ? 'field' : block.text !== undefined ? 'text' : 'source';
        const setWay = (w: string) => { const { field: _f, text: _t, source: _s, ...rest } = block; const f = c.fields.find((x) => declared.includes(x)) ?? c.fields[0]; change(w === 'field' ? { ...rest, field: f } : w === 'text' ? { ...rest, text: 'Label' } : { ...rest, source: c.sources[0] }, w === 'field' && !declared.includes(f) ? [f] : undefined); };
        return (
          <div key="words" className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Words" value={way} onValueChange={setWay} options={[{ value: 'field', label: 'A field of the post' }, { value: 'text', label: 'Fixed words of the layout' }, { value: 'source', label: 'The series, brand or page number' }]} />
            {way === 'field' && <SelectField label="Field" value={block.field ?? ''} onValueChange={(f) => pick('field', f)} options={fieldOptions(c.fields)} />}
            {way === 'text' && <TextField label="Fixed words" value={block.text ?? ''} maxLength={c.max} hint={`One line, up to ${c.max} characters`} onChange={(e) => change({ ...block, text: e.target.value })} />}
            {way === 'source' && <SelectField label="Shows" value={block.source ?? c.sources[0]} onValueChange={(v) => change({ ...block, source: v })} options={c.sources.map((s) => ({ value: s, label: { series: 'The series name', brand: 'The brand name', folio: 'The page number (carousels)' }[s] ?? s }))} />}
          </div>
        );
      }
      case 'binding': return (
        <SelectField key={c.key} label={OPTION_LABEL[c.key] ?? c.key} optional value={String(block[c.key] ?? '')} onValueChange={(f) => pick(c.key, f)}
          hint={c.key === 'subField' ? 'Set 28 px under the headline, in the same box' : undefined}
          options={[{ value: '', label: 'None' }, ...fieldOptions(c.fields.filter((f) => f !== (block.field ?? spec.field)))]} />
      );
      case 'option': return <OptionControl key={c.key} name={c.key} spec={c.spec} value={block[c.key]} onChange={(v) => change({ ...block, [c.key]: v })} />;
      case 'when': return (
        <div key="when" className="rounded-lg border p-3 sm:p-4">
          <ConditionEditor when={block.when} page={page} declared={declared} onChange={(w) => change(w ? { ...block, when: w } : (({ when: _w, ...rest }) => rest as Block)(block))} />
        </div>
      );
      case 'children': return (
        <FieldGroup key="children" legend={block.type === 'slabs' ? 'Inside the slabs' : 'Inside the panel'} hint={block.type === 'slabs' ? 'Each headline starts the next slab (the myth, then the fact); a sub line goes in the slab before it.' : 'These flow from the top of the panel, one under the other.'}>
          {children.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing yet.</p>}
          <ul className="flex flex-col gap-1.5">
            {children.map((ch, i) => (
              <li key={i} className="flex items-center gap-1">
                <Button size="sm" variant={childAt === i ? 'secondary' : 'ghost'} className="min-w-0 flex-1 justify-start truncate" aria-expanded={childAt === i} onClick={() => setChildAt(childAt === i ? null : i)}>{blockTitle(ch)}</Button>
                <Button size="icon" variant="ghost" aria-label={`Move ${blockTitle(ch)} up`} disabled={i === 0} onClick={() => { setChildren(move(children, i, -1)); setChildAt(i - 1); }}><ArrowUp /></Button>
                <Button size="icon" variant="ghost" aria-label={`Move ${blockTitle(ch)} down`} disabled={i === children.length - 1} onClick={() => { setChildren(move(children, i, 1)); setChildAt(i + 1); }}><ArrowDown /></Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${blockTitle(ch)}`} onClick={() => { setChildren(children.filter((_, k) => k !== i)); setChildAt(null); }}><Trash2 /></Button>
              </li>
            ))}
          </ul>
          {childAt !== null && children[childAt] && (
            <div className="rounded-md border p-3">
              <BlockEditor block={children[childAt]} layout={layout} size={size} setSize={setSize} catalogue={catalogue} child
                onChange={(cb, declare) => setChildren(children.map((x, k) => (k === childAt ? cb : x)), declare)} />
            </div>
          )}
          {children.length < catalogue.limits.children && (
            <div className="flex flex-wrap items-end gap-2">
              <SelectField className="min-w-40 flex-1" label="Add inside" value={childType || c.types[0]} onValueChange={setChildType} options={c.types.map((t) => ({ value: t, label: BLOCK_LABEL[t] ?? t }))} />
              <Button variant="outline" onClick={() => {
                const t = childType || c.types[0], cs = page.blocks[t];
                const nb: Block = { type: t };
                let declare: string[] | undefined;
                if (t === 'label') nb.text = 'Label';
                else if (cs?.kinds.length) { const f = cs.fields.find((x) => !fieldsShown(layout, catalogue).includes(x)) ?? cs.fields[0]; nb.field = f; if (!declared.includes(f)) declare = [f]; }
                setChildren([...children, nb], declare); setChildAt(children.length);
              }}><Plus /> Add</Button>
            </div>
          )}
        </FieldGroup>
      );
    }
  };
  const controls = blockControls(block, layout, catalogue, child);
  const options = controls.filter((c) => c.kind === 'option');
  return (
    <div className="flex flex-col gap-4">
      {!child && spec.chrome && <p className="text-[13px] text-muted-foreground">The page places this, as the brand's style says (logo placement, footer style).</p>}
      {controls.filter((c) => c.kind === 'place' || c.kind === 'bleed').map(render)}
      <div className="grid gap-3 sm:grid-cols-2">
        {controls.filter((c) => c.kind === 'field' || c.kind === 'binding').map(render)}
      </div>
      {controls.filter((c) => c.kind === 'words').map(render)}
      {options.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{options.map(render)}</div>}
      {controls.filter((c) => c.kind === 'when' || c.kind === 'children').map(render)}
    </div>
  );
}

// ---- the fields a post fills in ----

export function FieldsEditor({ layout, catalogue, onChange }: { layout: Layout; catalogue: Catalogue; onChange: (l: Layout) => void }) {
  const [adding, setAdding] = useState('');
  const free = Object.keys(catalogue.fields).filter((f) => !layout.fields[f]);
  const shown = fieldsShown(layout, catalogue);
  const set = (name: string, rule: FieldRule | null) => {
    const fields = { ...layout.fields };
    if (rule) fields[name] = rule; else delete fields[name];
    onChange({ ...layout, fields });
  };
  const without = (rule: FieldRule, k: keyof FieldRule) => { const { [k]: _x, ...rest } = rule; return rest; };
  return (
    <FieldGroup legend="Fields" hint="What a post fills in for this layout, and how long it may be. Every field must be shown by exactly one block (or by blocks that are never drawn together).">
      <ul className="flex flex-col gap-2">
        {Object.entries(layout.fields).map(([name, rule]) => {
          const f = catalogue.fields[name], R = f?.rules;
          return (
            <li key={name} className="flex flex-col gap-3 rounded-md border p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13px]">{name}</p>
                  <p className="text-[12px] text-muted-foreground">{f?.word}{shown.includes(name) ? '' : ' · no block shows it yet'}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label={`Remove the field ${name}`} onClick={() => set(name, null)}><Trash2 /></Button>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <CheckField label="Required" checked={rule.required === true} onCheckedChange={(v) => set(name, v ? { ...rule, required: true } : without(rule, 'required'))} />
                {R?.min && <TextField className="w-28" label="At least" type="number" inputMode="numeric" min={R.min.min} max={R.min.max} optional value={rule.min === undefined ? '' : String(rule.min)}
                  onChange={(e) => set(name, e.target.value === '' ? without(rule, 'min') : { ...rule, min: Math.min(R.min!.max, Math.max(R.min!.min, num(e.target.value, 0))) })} />}
                {R?.max && <TextField className="w-32" label={R.min ? 'At most' : 'Most characters'} type="number" inputMode="numeric" min={R.max.min} max={R.max.max} hint={`up to ${R.max.max}`}
                  value={rule.max === undefined ? '' : String(rule.max)} placeholder={R.max.default !== undefined ? String(R.max.default) : undefined}
                  onChange={(e) => set(name, e.target.value === '' ? without(rule, 'max') : { ...rule, max: Math.min(R.max!.max, Math.max(R.max!.min, num(e.target.value, R.max!.default ?? 1))) })} />}
              </div>
              {R?.types && (
                <div className="flex flex-col gap-1">
                  <p className="text-[13px]">Kinds of artefact it takes <span className="text-muted-foreground">(none ticked: any)</span></p>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {R.types.map((t) => {
                      const list = rule.types ?? [];
                      return <CheckField key={t} label={t} checked={list.includes(t)} onCheckedChange={(v) => { const next = v ? R.types!.filter((x) => x === t || list.includes(x)) : list.filter((x) => x !== t); set(name, next.length ? { ...rule, types: next } : without(rule, 'types')); }} />;
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {free.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField className="min-w-52 flex-1" label="Add a field" value={adding} placeholder="Choose a field" onValueChange={setAdding} options={free.map((f) => ({ value: f, label: `${f}: ${catalogue.fields[f].word}` }))} />
          <Button variant="outline" disabled={!adding} onClick={() => { set(adding, {}); setAdding(''); }}><Plus /> Add</Button>
        </div>
      )}
    </FieldGroup>
  );
}

// ---- the grid of one size ----

export function GridEditor({ layout, size, catalogue, onChange }: { layout: Layout; size: string; catalogue: Catalogue; onChange: (l: Layout) => void }) {
  const g = layout.canvas[size], G = catalogue.grid, S = catalogue.sizes[size];
  const min = S?.minMargins ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const m = marginsOf(g.margin), one = typeof g.margin === 'number';
  const set = (next: Partial<Grid>) => onChange({ ...layout, canvas: { ...layout.canvas, [size]: { ...g, ...next } } });
  const unset = (k: 'rowGutter' | 'gutter') => { const { [k]: _x, ...rest } = g; onChange({ ...layout, canvas: { ...layout.canvas, [size]: rest as Grid } }); };
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const gx = g.gutter ?? 0, gy = g.rowGutter ?? gx;
  const cw = S ? (S.w - m.left - m.right - (g.columns - 1) * gx) / g.columns : 0, ch = S ? (S.h - m.top - m.bottom - (g.rows - 1) * gy) / g.rows : 0;
  const oneMin = Math.max(min.top, min.right, min.bottom, min.left);
  return (
    <FieldGroup legend={`Grid of the ${size} page`} hint={`Margins of at least ${min.top} px at the top, ${min.right} at the sides and ${min.bottom} at the bottom keep text clear of the edges. Cells are ${Math.floor(cw)} x ${Math.floor(ch)} px (at least ${G.minCell}).`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TextField label="Columns" type="number" inputMode="numeric" min={G.columns[0]} max={G.columns[1]} value={String(g.columns)} onChange={(e) => set({ columns: clamp(num(e.target.value, g.columns), ...G.columns) })} />
        <TextField label="Rows" type="number" inputMode="numeric" min={G.rows[0]} max={G.rows[1]} value={String(g.rows)} onChange={(e) => set({ rows: clamp(num(e.target.value, g.rows), ...G.rows) })} />
        <TextField label="Gutter (px)" type="number" inputMode="numeric" min={G.gutter[0]} max={G.gutter[1]} value={g.gutter === undefined ? '' : String(g.gutter)} placeholder="0"
          onChange={(e) => (e.target.value === '' ? unset('gutter') : set({ gutter: clamp(num(e.target.value, 0), ...G.gutter) }))} />
        <TextField label="Row gutter (px)" type="number" inputMode="numeric" min={G.gutter[0]} max={G.gutter[1]} disabled={g.rowGutter === undefined} value={String(g.rowGutter ?? gx)}
          onChange={(e) => set({ rowGutter: clamp(num(e.target.value, 0), ...G.gutter) })} />
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <CheckField label="Rows use the same gutter" checked={g.rowGutter === undefined} onCheckedChange={(v) => (v ? unset('rowGutter') : set({ rowGutter: gx }))} />
        <CheckField label="The same margin on every side" checked={one} onCheckedChange={(v) => set({ margin: v ? Math.max(oneMin, m.top, m.right, m.bottom, m.left) : { ...m } })} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {one
          ? <TextField label="Margin (px)" type="number" inputMode="numeric" min={oneMin} max={G.margin[1]} hint={`at least ${oneMin}`} value={String(g.margin)} onChange={(e) => set({ margin: clamp(num(e.target.value, Number(g.margin)), G.margin[0], G.margin[1]) })} />
          : EDGES.map((e) => <TextField key={e} label={`Margin ${e}`} type="number" inputMode="numeric" min={min[e]} max={G.margin[1]} hint={`at least ${min[e]}`} value={String(m[e])}
              onChange={(ev) => set({ margin: { ...m, [e]: clamp(num(ev.target.value, m[e]), G.margin[0], G.margin[1]) } })} />)}
      </div>
    </FieldGroup>
  );
}

// ---- sizes ----

export function SizesEditor({ layout, size, setSize, catalogue, onToggle }: { layout: Layout; size: string; setSize: (z: string) => void; catalogue: Catalogue; onToggle: (z: string, on: boolean) => void }) {
  const page = pageCatalogue(catalogue, layout)!, sizes = sizesOf(layout);
  return (
    <FieldGroup legend="Sizes" hint={page.sizes.length > 1 ? 'Each size has its own grid; a block may sit in a different place on each.' : 'This page is drawn at the feed size only.'}>
      {page.sizes.length > 1 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {page.sizes.map((z) => <CheckField key={z} label={SIZE_LABEL[z] ?? z} checked={!!layout.canvas[z]} disabled={!!layout.canvas[z] && sizes.length === 1} onCheckedChange={(v) => onToggle(z, v)} />)}
        </div>
      )}
      {sizes.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="The size being edited">
          {sizes.map((z) => <Button key={z} size="sm" variant={z === size ? 'secondary' : 'ghost'} aria-pressed={z === size} onClick={() => setSize(z)}>{z}</Button>)}
        </div>
      )}
    </FieldGroup>
  );
}

// ---- sketch as if ----

// The switches that change what the layout draws: each field a condition names (filled or empty), the carousel page, and the
// value of each choice a condition tests.
export function ScenarioBar({ layout, catalogue, scenario, onChange }: { layout: Layout; catalogue: Catalogue; scenario: Scenario; onChange: (s: Scenario) => void }) {
  const page = pageCatalogue(catalogue, layout);
  const used = conditionsUsed(layout);
  if (!page || !used.length) return null;
  const fields = [...new Set(used.flatMap((c) => [c.present, c.absent, c.choice && page.conditions.choices[c.choice.field]?.declared ? c.choice.field : undefined]).filter((f): f is string => !!f && !!layout.fields[f]))];
  const pages = used.some((c) => c.page !== undefined);
  const choices = [...new Set(used.flatMap((c) => (c.choice ? [c.choice.field] : [])))].filter((n) => page.conditions.choices[n]);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3" role="group" aria-label="Sketch as if">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[13px] font-medium">Sketch as if</p>
        <Button size="sm" variant="ghost" onClick={() => onChange(defaultScenario(layout))}>Reset</Button>
      </div>
      {fields.length > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {fields.map((f) => <CheckField key={f} label={`${f} is filled`} checked={!scenario.empty.includes(f)} onCheckedChange={(v) => onChange({ ...scenario, empty: v ? scenario.empty.filter((x) => x !== f) : [...scenario.empty, f] })} />)}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {pages && <SelectField label="Page" value={scenario.page} onValueChange={(p) => onChange({ ...scenario, page: p })} options={page.conditions.pages.map((p) => ({ value: p, label: { single: 'A single post', first: 'Page 1 of a carousel', later: 'A later carousel page' }[p] ?? p }))} />}
        {choices.map((n) => (
          <SelectField key={n} label={CHOICE_WORDS[n] ?? n} value={String(scenario.choices[n])} onValueChange={(v) => onChange({ ...scenario, choices: { ...scenario.choices, [n]: page.conditions.choices[n].values.find((x) => String(x) === v) } })}
            options={page.conditions.choices[n].values.map((v) => ({ value: String(v), label: word(v) }))} />
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">Blocks a post would not draw in this case are hidden (the selected one is shown dashed). The preview draws a single post with these fields empty.</p>
    </div>
  );
}
