// The right pane of the design editor. With an element selected: its settings in seven parts (Place, Size and rotation, Content, Type, Colour,
// Effects, Conditions), generated from the engine's catalogue so it offers nothing the engine refuses. With nothing selected: the design's own
// settings (name, when to use it, page colour, the fields with their budgets, which words it accepts, the empty area).
import { useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmAction, FieldGroup, SelectField, SwitchField, TextAreaField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import {
  acceptText, acceptsOf, addField, bindField, checkAccept, declaredFields, elementName, fieldLabel, firstSize, GROUND_WORDS, inkChoices, propsOf, pruneFields,
  removeField, requiredFields, setAccepts, setBudget, setCalm, setGround, setPlace, setPlaceForm, setProp, setRotation, setSource, setTop, shownFields, summary,
  type Accept, type DesignProblem, type Edit, type Json,
} from './design-model';
import { AngleControl, BindingEditor, LadderEditor, NumberInput, PlaceEditor, ValueControl, WhenEditor, word, type Ctx } from './design-controls';
import type { Swatches } from './design-colours';
import type { Desc, LookCatalogue } from './look-types';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

type SectionId = 'place' | 'size' | 'content' | 'type' | 'colour' | 'effects';
const SECTION_TITLE: Record<SectionId, string> = { place: 'Place', size: 'Size and rotation', content: 'Content', type: 'Type', colour: 'Colour', effects: 'Effects' };
const TYPE_NAMES = ['style', 'ladder', 'textSize', 'shrinkFloor', 'emphasis', 'emphasisOwnLine', 'upper', 'nowrap', 'track', 'lead', 'weight', 'font', 'family', 'valign', 'dropWhenTight', 'numberStyle', 'textStyle', 'gapEm', 'baselineAt'];
const SIZE_NAMES = ['size', 'cap', 'floor', 'min', 'sizes', 'maxLines', 'fit', 'minW', 'maxW', 'rmin', 'rmax', 'rowMinH', 'numberSize', 'numberSpan', 'skew', 'origin', 'vertical', 't'];
const COLOUR_NAMES = ['fill', 'ink', 'colour', 'tint', 'altFill', 'edgeFill', 'lower', 'keylineColour'];
const EFFECT_NAMES = ['shadow', 'textShadow', 'ring', 'border', 'radius', 'pad', 'treat', 'keyline', 'altRot', 'rule', 'firstAccent', 'need', 'fade', 'fadeFrom', 'altItalic', 'outline', 'number', 'numberTile'];
const SKIP = new Set(['type', 'children', 'place', 'when', 'field', 'source', 'rot', 'sticker']);

function sectionOf(type: string, name: string, desc: Desc & { group?: string }, textual: boolean): SectionId {
  if (desc.group === 'flow') return 'place';
  if (['bleed', 'z'].includes(name)) return 'place';
  if (type === 'text' && ['size', 'ladder', 'textSize'].includes(name)) return 'type';
  if (COLOUR_NAMES.includes(name)) return 'colour';
  if (['scrim', 'wordmark-pattern', 'punch-hole'].includes(type) && !['size'].includes(name)) return 'effects';
  if (name === 'align') return textual ? 'type' : 'content';
  if (TYPE_NAMES.includes(name)) return 'type';
  if (SIZE_NAMES.includes(name)) return 'size';
  if (name === 'w' || name === 'h') return 'size';
  if (EFFECT_NAMES.includes(name)) return 'effects';
  return 'content';
}

function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border-t pt-2 first:border-t-0 first:pt-0 [&>summary::-webkit-details-marker]:hidden">
      <summary className="mb-2 flex min-h-8 cursor-pointer list-none items-center text-[13.5px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
        <span className="mr-1.5 inline-block text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true">{'›'}</span>{title}
      </summary>
      <div className="flex flex-col gap-3 pb-3">{children}</div>
    </details>
  );
}

export interface PropertiesProps {
  comp: Json; look: Json; cat: LookCatalogue; path: string; swatches: Swatches; advanced: boolean; readOnly: boolean; problems: DesignProblem[];
  // applies an edit (the editor keeps history and the draft); returns '' or why it was refused
  apply: (fn: (c: Json) => Edit, key?: string) => string;
  onSelect: (path: string | null) => void;
}

export function ElementProperties(p: PropertiesProps) {
  const { comp, look, cat, path } = p;
  const el = elementAtPath(comp, path);
  const [orphans, setOrphans] = useState<string[]>([]);
  if (!el) return <p className="text-[13px] text-muted-foreground">That element is not there any more.</p>;
  const type = String(el.type);
  const info = cat.elements[type]!;
  const ctx: Ctx = {
    comp, look, cat, path, el, swatches: p.swatches, advanced: p.advanced, disabled: p.readOnly, inks: inkChoices(comp, path, look, cat, p.advanced),
    set: (name, value) => p.apply((c) => setProp(c, path, name, value, cat, look), `${path}.${name}`),
    rotate: (v) => p.apply((c) => setRotation(c, path, v, look, cat), `${path}.rot`),
    setPlace: (pl) => p.apply((c) => setPlace(c, path, pl, cat), `${path}.place`),
    setForm: (f) => p.apply((c) => setPlaceForm(c, path, f, look, cat)),
  };
  const onBind = (field: string | null): string => {
    let found: string[] = [];
    const why = p.apply((c) => { const e = bindField(c, path, field, look, cat); found = e.orphans; return e; });
    if (!why && found.length) setOrphans(found);
    return why;
  };
  const onSource = (source: string | null): string => {
    let found: string[] = [];
    const why = p.apply((c) => { const e = setSource(c, path, source, look, cat); found = e.orphans; return e; });
    if (!why && found.length) setOrphans(found);
    return why;
  };
  const props = propsOf(type, cat).filter(([name]) => !SKIP.has(name));
  const byGroup: Record<SectionId, Array<[string, Desc & { group?: string }]>> = { place: [], size: [], content: [], type: [], colour: [], effects: [] };
  for (const [name, desc] of props) byGroup[sectionOf(type, name, desc, !!info.text)].push([name, desc]);
  // properties an element that does not flow cannot take
  const flowing = !isObj(el.place) && path.includes('.');
  byGroup.place = byGroup.place.filter(([name, d]) => d.group !== 'flow' || flowing || name in el);
  const required = new Set(info.required ?? []);
  const mine = p.problems.filter((x) => x.path === path);
  const render = ([name, desc]: [string, Desc]) => {
    if (type === 'text' && name === 'size') return null;
    return (
      <ValueControl key={name} name={name} desc={desc} value={el[name]} ctx={ctx} optional={!required.has(name)} onChange={(v) => ctx.set(name, v)} />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-semibold">{elementName(el, cat)}</h2>
        <p className="text-[12.5px] text-muted-foreground">{summary(el, cat, look)}</p>
      </div>
      {mine.length > 0 && <ul className="list-disc space-y-0.5 pl-[18px] text-[12.5px] font-medium text-destructive" role="alert">{mine.map((m, i) => <li key={i}>{m.message}</li>)}</ul>}

      <Section title={SECTION_TITLE.place} open>
        <PlaceEditor ctx={ctx} />
        {byGroup.place.map(render)}
      </Section>
      <Section title={SECTION_TITLE.size}>
        {byGroup.size.map(render)}
        {info.properties.rot && el.vertical === undefined && <AngleControl label="Turn" value={el.rot} ctx={ctx} disabled={p.readOnly} onChange={(v) => ctx.rotate(v)} />}
        {byGroup.size.length === 0 && !info.properties.rot && <p className="text-[13px] text-muted-foreground">Its size comes from its place.</p>}
      </Section>
      <Section title={SECTION_TITLE.content} open>
        {(info.properties.field || info.properties.source) && <BindingEditor ctx={ctx} onBind={onBind} onSource={onSource} />}
        {byGroup.content.map(render)}
      </Section>
      {(byGroup.type.length > 0 || type === 'text') && (
        <Section title={SECTION_TITLE.type} open>
          {type === 'text' && <TextSize ctx={ctx} />}
          {type === 'sticker' && <StickerSize ctx={ctx} />}
          {byGroup.type.filter(([n]) => !(type === 'text' && ['ladder', 'textSize'].includes(n)) && !(type === 'sticker' && n === 'ladder')).map(render)}
        </Section>
      )}
      {byGroup.colour.length > 0 && <Section title={SECTION_TITLE.colour} open>{byGroup.colour.map(render)}</Section>}
      {byGroup.effects.length > 0 && <Section title={SECTION_TITLE.effects}>{byGroup.effects.map(render)}</Section>}
      <Section title="Conditions" open={!!el.when}>
        <WhenEditor ctx={ctx} />
      </Section>

      <ConfirmAction open={orphans.length > 0} title="Leave a field out of this design?" confirmLabel="Leave it out"
        message={<>Nothing shows {orphans.map((f) => fieldLabel(f, cat).toLowerCase()).join(' or ')} any more. Leave {orphans.length > 1 ? 'them' : 'it'} out of this design, so posts need no text for {orphans.length > 1 ? 'them' : 'it'}? You can add {orphans.length > 1 ? 'them' : 'it'} back under the design’s fields.</>}
        onConfirm={() => { const why = p.apply((c) => ({ comp: pruneFields(c, orphans) })); setOrphans([]); return why; }} onCancel={() => setOrphans([])} />
    </div>
  );
}

const elementAtPath = (comp: Json, path: string): Json | null => {
  let list = Array.isArray(comp.elements) ? (comp.elements as Json[]) : [];
  let cur: Json | null = null;
  for (const i of path.split('.').map(Number)) {
    if (i < list.length) cur = list[i]!;
    else if (cur && i === list.length && isObj(cur.sticker)) cur = cur.sticker as Json;
    else return null;
    list = Array.isArray(cur.children) ? (cur.children as Json[]) : [];
  }
  return cur;
};

// The size of text: the look's own, steps by the length of the text, or (Advanced) one fixed size.
function TextSize({ ctx }: { ctx: Ctx }) {
  const { el, cat, look, comp } = ctx;
  const style = typeof el.style === 'string' ? el.style : (['headline', 'quote'].includes(String(el.field)) ? 'display' : el.field === 'big' ? 'numeral' : el.source || ['label', 'meta', 'tag', 'unit', 'by'].includes(String(el.field)) ? 'label' : 'body');
  const big = style === 'display' || style === 'numeral';
  const range = (cat.sizeRange?.[style] ?? [14, 900]) as [number, number];
  const mode = el.ladder !== undefined ? 'ladder' : el.size !== undefined ? 'fixed' : 'own';
  const by = String(el.field ?? '');
  const max = (isObj(comp.fields) && isObj((comp.fields as Json)[by]) ? ((comp.fields as Json)[by] as Json).max : undefined) as number | undefined ?? cat.fields[by]?.max;
  const own = ((look.type as Json | undefined)?.[style] as Json | undefined)?.size;
  const [error, setError] = useState('');
  const change = (m: string) => {
    let why = '';
    if (m === 'ladder') {
      const size = Math.min(range[1], Math.max(range[0], firstSize(el, look) ?? (big ? 96 : 40)));
      const top = max ?? 70;
      const steps = top > 30 ? [[30, size], [top, Math.max(range[0], size - 16)]] : [[top, size]];
      why = ctx.set('size', undefined) || ctx.set('ladder', { by, steps });
    } else if (m === 'fixed') why = ctx.set('ladder', undefined) || ctx.set('size', Math.min(range[1], Math.max(range[0], firstSize(el, look) ?? (big ? 96 : 40))));
    else why = ctx.set('ladder', undefined) || ctx.set('size', undefined);
    setError(why);
  };
  const opts = [...(big ? [] : [{ value: 'own', label: `The look's own${typeof own === 'number' ? ` (${own} px)` : ''}` }]), { value: 'ladder', label: 'Steps by the length of the text' }, ...(ctx.advanced || mode === 'fixed' ? [{ value: 'fixed', label: 'One fixed size' }] : [])];
  return (
    <div className="flex flex-col gap-2">
      <ValueControl name="style" desc={cat.elements.text!.properties.style!} value={el.style} ctx={ctx} optional onChange={(v) => ctx.set('style', v)} />
      <SelectField label="Size" value={mode} options={opts} disabled={ctx.disabled} error={error || undefined} hint={big ? 'Headlines and figures need steps (or a fixed size under Advanced).' : 'Body, list and label text keep the look’s sizes so the design stays in step with it.'} onValueChange={change} />
      {mode === 'ladder' && <LadderEditor ctx={ctx} el={el} fieldMax={max} range={range} disabled={ctx.disabled} />}
      {mode === 'fixed' && <NumberInput label="Size in pixels" value={el.size} desc={{ kind: 'number', int: true, min: range[0], max: range[1] }} disabled={ctx.disabled} onChange={(v) => (v === undefined ? 'Enter a number' : ctx.set('size', v))} />}
    </div>
  );
}

function StickerSize({ ctx }: { ctx: Ctx }) {
  const { el, cat, comp } = ctx;
  const by = String(el.field ?? '');
  const max = (isObj(comp.fields) && isObj((comp.fields as Json)[by]) ? ((comp.fields as Json)[by] as Json).max : undefined) as number | undefined ?? cat.fields[by]?.max;
  const range = (cat.sizeRange?.display ?? [24, 300]) as [number, number];
  if (el.field === undefined) return null;
  if (el.ladder !== undefined) {
    return (
      <div className="flex flex-col gap-2">
        <LadderEditor ctx={ctx} el={el} fieldMax={max} range={range} disabled={ctx.disabled} />
        <div><Button type="button" size="sm" variant="ghost" disabled={ctx.disabled} onClick={() => ctx.set('ladder', undefined)}>Use one size instead</Button></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {el.fit === undefined && <NumberInput label="Text size in pixels" value={el.textSize} optional desc={{ kind: 'number', int: true, min: 14, max: 400 }} disabled={ctx.disabled} onChange={(v) => ctx.set('textSize', v)} />}
      {el.fit === undefined && el.textSize === undefined && <div><Button type="button" size="sm" variant="outline" disabled={ctx.disabled} onClick={() => ctx.set('ladder', { by, steps: [[Math.min(6, max ?? 6), 80], [max ?? 16, 56]].filter((s, i, a) => i === 0 || s[0]! > a[i - 1]![0]!) })}><Plus aria-hidden="true" /> Size by length</Button></div>}
    </div>
  );
}

// ================================================================== the design's own settings

export interface DesignSettingsProps {
  comp: Json; look: Json; cat: LookCatalogue; readOnly: boolean; apply: (fn: (c: Json) => Edit, key?: string) => string; problems: DesignProblem[];
}

export function DesignSettings({ comp, look, cat, readOnly, apply, problems }: DesignSettingsProps) {
  const kind = String(comp.kind);
  const declared = declaredFields(comp);
  const shown = new Set(shownFields(comp, look));
  const required = new Set(requiredFields(comp, cat));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const err = (k: string, m: string) => { setErrors((e) => ({ ...e, [k]: m })); return m; };
  const mine = problems.filter((x) => x.path === null && !/^(fields|accepts|ground|calm|fit|name|describe)/.test(x.path ?? ''));
  const grounds = ((look.colour as Json | undefined)?.grounds as string[] | undefined) ?? Object.keys(GROUND_WORDS);
  const groundNow = typeof comp.ground === 'string' ? comp.ground : null;
  const free = (cat.kinds[kind]?.fields ?? []).filter((f) => !declared.includes(f));
  const accepts = acceptsOf(comp);
  const [draft, setDraft] = useState<{ field: string; part: string; n: string; min: string; max: string } | null>(null);
  const calm = isObj(comp.calm) ? (comp.calm.maxShare as number | undefined) : undefined;
  const fit = comp.fit;
  const emphasis = (f: string) => !!cat.fields[f]?.emphasis;
  const addRule = () => {
    if (!draft) return;
    const rule: Accept = draft.field === 'items'
      ? { field: 'items', ...(draft.min ? { min: Number(draft.min) } : {}), ...(draft.max ? { max: Number(draft.max) } : {}) }
      : { field: draft.field, ...(draft.part !== 'all' ? { part: draft.part } : {}), maxChars: Number(draft.n) };
    const bad = checkAccept(rule, comp, cat);
    if (bad) { err('accepts', bad); return; }
    const why = apply((c) => setAccepts(c, [...acceptsOf(c), rule], cat));
    err('accepts', why);
    if (!why) setDraft(null);
  };
  return (
    <div className="flex flex-col gap-3">
      <div><h2 className="text-[15px] font-semibold">This design</h2><p className="text-[12.5px] text-muted-foreground">Select a piece on the canvas or in the layers to change it.</p></div>
      {mine.length > 0 && <ul className="list-disc space-y-0.5 pl-[18px] text-[12.5px] font-medium text-destructive" role="alert">{mine.map((m, i) => <li key={i}>{m.message}</li>)}</ul>}
      <TextField label="Name" value={String(comp.name ?? '')} maxLength={cat.limits.name} disabled={readOnly} error={errors.name}
        onChange={(e) => { const v = e.target.value; err('name', apply((c) => setTop(c, 'name', v, cat), 'name')); }} />
      <TextAreaField label="When to use it" rows={3} value={String(comp.describe ?? '')} maxLength={cat.limits.description} disabled={readOnly} error={errors.describe} optional
        hint="One or two sentences on how it looks and when it suits a post. People see it in the list of designs and the AI reads it to choose a design."
        onChange={(e) => { const v = e.target.value; err('describe', apply((c) => setTop(c, 'describe', v, cat), 'describe')); }} />
      {groundNow !== null
        ? <SelectField label="Page colour" value={groundNow} disabled={readOnly} options={(grounds.includes(groundNow) ? grounds : [groundNow, ...grounds]).map((g) => ({ value: g, label: GROUND_WORDS[g] ?? word(g) }))} onValueChange={(g) => { apply((c) => setGround(c, g), 'ground'); }} />
        : <p className="text-[13px] text-muted-foreground">The page colour changes with the post (cases). Change the cases under Advanced: JSON.</p>}

      <FieldGroup legend="Fields" hint="The words and picture of a post this design uses. A field marked needed must be filled in for the design to be used; the most is how long the text may be.">
        <ul className="flex flex-col gap-2">
          {declared.map((f) => {
            const info = cat.fields[f];
            const f0 = (comp.fields as Json)[f] as Json;
            const top = info?.max;
            const used = shown.has(f);
            const locked = required.has(f) && (cat.kinds[kind]?.required ?? []).includes(f);
            return (
              <li key={f} className="flex flex-col gap-1.5 rounded-md bg-muted/30 px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{fieldLabel(f, cat)}{!used && <span className="ml-1.5 font-normal text-muted-foreground">(no element shows it)</span>}</span>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${fieldLabel(f, cat)}`} disabled={readOnly || locked || used} title={locked ? 'The kind of post needs it' : used ? 'An element still shows it' : undefined}
                    onClick={() => { err(`f-${f}`, apply((c) => removeField(c, f, look, cat))); }}><Trash2 /></Button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <SwitchField label="Needed" checked={f0.required === true} disabled={readOnly || locked} onCheckedChange={(v) => err(`f-${f}`, apply((c) => setBudget(c, f, { required: v }, cat)))} />
                  {info?.type === 'text' && <div className="w-28"><NumberInput label="Most characters" value={f0.max} desc={{ kind: 'number', int: true, min: 1, max: top }} disabled={readOnly} onChange={(v) => (v === undefined ? 'Enter a number' : err(`f-${f}`, apply((c) => setBudget(c, f, { max: v }, cat), `max-${f}`)))} /></div>}
                  {info?.type === 'items' && <div className="w-24"><NumberInput label="Fewest" value={f0.min} desc={{ kind: 'number', int: true, min: 1, max: info.max }} disabled={readOnly} onChange={(v) => (v === undefined ? 'Enter a number' : err(`f-${f}`, apply((c) => setBudget(c, f, { min: v }, cat), `min-${f}`)))} /></div>}
                  {info?.type === 'items' && <div className="w-24"><NumberInput label="Most" value={f0.max} desc={{ kind: 'number', int: true, min: 1, max: info.max }} disabled={readOnly} onChange={(v) => (v === undefined ? 'Enter a number' : err(`f-${f}`, apply((c) => setBudget(c, f, { max: v }, cat), `max-${f}`)))} /></div>}
                </div>
                {errors[`f-${f}`] && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors[`f-${f}`]}</p>}
              </li>
            );
          })}
        </ul>
        {free.length > 0 && (
          <SelectField label="Add a field" value="" placeholder="Choose a field" disabled={readOnly} options={free.map((f) => ({ value: f, label: fieldLabel(f, cat) }))}
            onValueChange={(f) => { if (f) err('addField', apply((c) => addField(c, f, cat))); }} error={errors.addField} />
        )}
      </FieldGroup>

      <FieldGroup legend="Words it accepts" hint="Rules on the words this design can draw. When a post's words break a rule, the next design of the same kind is used.">
        {accepts.length === 0 && <p className="text-[13px] text-muted-foreground">It takes any words within the field budgets.</p>}
        <ul className="flex flex-col gap-1">
          {accepts.map((a, i) => (
            <li key={i} className="flex items-center gap-1 text-[13px]">
              <span className="min-w-0 flex-1">{acceptText(a, cat)}</span>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove the rule: ${acceptText(a, cat)}`} disabled={readOnly} onClick={() => err('accepts', apply((c) => setAccepts(c, acceptsOf(c).filter((_, k) => k !== i), cat)))}><Trash2 /></Button>
            </li>
          ))}
        </ul>
        {draft ? (
          <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-2.5">
            <SelectField label="About" value={draft.field} options={declared.filter((f) => f !== 'image').map((f) => ({ value: f, label: fieldLabel(f, cat) }))} onValueChange={(f) => setDraft({ ...draft, field: f, part: 'all' })} />
            {draft.field === 'items' ? (
              <div className="grid grid-cols-2 gap-2">
                <TextField label="Fewest points" type="number" inputMode="numeric" value={draft.min} onChange={(e) => setDraft({ ...draft, min: e.target.value })} />
                <TextField label="Most points" type="number" inputMode="numeric" value={draft.max} onChange={(e) => setDraft({ ...draft, max: e.target.value })} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {emphasis(draft.field) && <SelectField label="Which part" value={draft.part} options={[{ value: 'all', label: 'The whole text' }, { value: 'pre', label: 'The first part' }, { value: 'phrase', label: 'The emphasised phrase' }]} onValueChange={(v) => setDraft({ ...draft, part: v })} />}
                <TextField label="Up to characters" type="number" inputMode="numeric" value={draft.n} onChange={(e) => setDraft({ ...draft, n: e.target.value })} />
              </div>
            )}
            {errors.accepts && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.accepts}</p>}
            <div className="flex gap-2"><Button type="button" size="sm" onClick={addRule}>Add the rule</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(null); err('accepts', ''); }}>Cancel</Button></div>
          </div>
        ) : (
          <div><Button type="button" size="sm" variant="outline" disabled={readOnly || declared.filter((f) => f !== 'image').length === 0 || accepts.length >= (cat.limits.accepts ?? 6)} onClick={() => setDraft({ field: declared.find((f) => f !== 'image') ?? 'headline', part: 'all', n: '', min: '', max: '' })}><Plus aria-hidden="true" /> Add a rule</Button></div>
        )}
      </FieldGroup>

      <FieldGroup legend="Empty space" hint="A deliberately empty area, as a share of the page (0.45 to 0.8). Leave it off if the design should be full.">
        <SwitchField label="Keep part of the page empty" checked={calm !== undefined} disabled={readOnly} onCheckedChange={(v) => err('calm', apply((c) => setCalm(c, v ? 0.6 : undefined)))} />
        {calm !== undefined && <NumberInput label="Most of the page it may fill" value={calm} desc={{ kind: 'number', min: 0.45, max: 0.8, step: 0.01 }} disabled={readOnly} onChange={(v) => (v === undefined ? 'Enter a number' : err('calm', apply((c) => setCalm(c, v), 'calm')))} />}
        {errors.calm && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.calm}</p>}
      </FieldGroup>

      {typeof fit === 'string' && (
        <SelectField label="Text stays inside" value={fit} disabled={readOnly} options={[{ value: 'margins', label: 'The page margins' }, { value: 'frame', label: 'The frame' }]}
          onValueChange={(v) => apply((c) => ({ comp: { ...c, fit: v } }), 'fit')} />
      )}
      {(fit === undefined) && (
        <SelectField label="Text stays inside" value="margins" disabled={readOnly} options={[{ value: 'margins', label: 'The page margins' }, { value: 'frame', label: 'The frame' }]}
          onValueChange={(v) => apply((c) => ({ comp: { ...c, fit: v } }), 'fit')} />
      )}
      {isObj(fit) && <p className="text-[13px] text-muted-foreground">The room for text is set in pixels. Change it under Advanced: JSON.</p>}
    </div>
  );
}
