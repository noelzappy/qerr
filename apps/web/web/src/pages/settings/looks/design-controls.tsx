// The controls of the design editor's property panel, drawn from the engine's catalogue descriptors: one control for each kind of setting
// (a number in bounds, a choice from a fixed list, a switch, a brand colour role shown as a swatch, a length or a token, an angle from the look's
// named set, a list, a group of settings, a choice between forms), the place editor, the size ladder, the condition editor.
// Every change goes out as a value; the editor model (design-model.ts) checks it against the descriptor and says why it will not take it, and that
// sentence is shown under the control. Nothing here clamps a number.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { CheckField, FieldGroup, SelectField, SwitchField, TextField } from '@/components/kit';
import { ChoiceField } from '@/components/kit/segmented-field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  checkLadder, coerceProp, declaredFields, fieldLabel, gridOf, ladderOf, namedAngles, turnOptions, placeForm, PLACE_FORM_WORDS, readWhen, whenText, type LadderStep, type PlaceForm,
} from './design-model';
import { roleWord, swatchOf, type Swatches } from './design-colours';
import { blankFor, clone } from './look-model';
import type { Desc, Json, LookCatalogue } from './look-types';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

// ---- the words ----
const WORDS: Record<string, string> = {
  display: 'Headline', body: 'Body', item: 'List item', label: 'Label', numeral: 'Big figure', mono: 'Figures and code', text: 'Body text',
  'as-typed': 'As typed', upper: 'Capitals', none: 'None', all: 'The whole text', pre: 'Before the emphasised phrase', phrase: 'The emphasised phrase', post: 'After the emphasised phrase',
  italic: 'Italic', accent: 'Accent colour', bar: 'Highlight bar', 'tilt-bar': 'Tilted highlight bar', 'own-line-bar': 'Highlight bar on its own line',
  'date-dd.mm': 'Date as 12.12', day: 'Day number', month: 'Month name', pad2: 'Two digits (07)', roman: 'Roman numerals', brand: 'The brand name', folio: 'The post number', index: 'The list number', site: 'The web address',
  column: 'Down a column', row: 'Across a row', start: 'Start', center: 'Centre', end: 'End', stretch: 'Fill', between: 'Spread out', left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom',
  rect: 'Rectangle', circle: 'Circle', arch: 'Arch', rounded: 'Rounded rectangle', card: 'Card in a paper mount', print: 'Framed print', pill: 'Pill', tile: 'Tile', stamp: 'Stamp', seal: 'Seal',
  grey: 'Greyscale', multiply: 'Colour tint', grain: 'Grain', punch: 'Punchy contrast', hair: 'Hairline', heavy: 'Heavy rule', hard: 'The look\'s hard shadow', solid: 'Solid', dashed: 'Dashed',
  lines: 'Line by line', fill: 'Edge to edge', block: 'One size for all lines', photo: 'The picture', field: 'A colour field', up: 'Up the page', down: 'Down the page',
  'meta-parts': 'Each part of the event line', items: 'Each list item', '1': 'Numbers 1 2 3', '01': 'Numbers 01 02 03', 'page': 'The whole page', margins: 'Inside the margins', frame: 'Inside the frame',
  'top-right': 'Top right', under: 'Under the figure', 'on-bar': 'On a bar', full: 'Round', ink: 'Dark type', light: 'Light type', primary: 'Brand colour', dash: 'Dash', dot: 'Dot', slash: 'Slash',
};
export const word = (v: string | number | boolean): string => (typeof v === 'string' ? WORDS[v] ?? v.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : String(v));
const TOKEN_WORDS: Record<string, string> = { margin: 'Page margin', gutter: 'Gutter', col: 'One column', frame: 'Frame thickness', 'frame+pad': 'Frame and padding' };
const FORM_WORDS: Record<string, [string, string]> = {
  shadow: ['The look\'s hard shadow', 'Our own'], textShadow: ['The look\'s hard shadow', 'Our own'], pad: ['The same on every side', 'Each side'], radius: ['Pixels', 'Fully round'],
  weight: ['Hair or heavy', 'Pixels'], w: ['Pixels', 'As wide as its words'], pick: ['One part', 'Everything after the first'],
};
const options = (values: Array<string | number>) => values.map((v) => ({ value: String(v), label: word(v) }));

// ---- a few buttons side by side of which one is on ----
export function Segmented<T extends string>({ value, onChange, options: opts, label, className, disabled }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; title?: string }>; label: string; className?: string; disabled?: boolean }) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex rounded-md border bg-muted/40 p-0.5', className)}>
      {opts.map((o) => (
        <Button key={o.value} type="button" size="sm" variant={o.value === value ? 'secondary' : 'ghost'} aria-pressed={o.value === value} disabled={disabled} title={o.title}
          className={cn('h-7 flex-1 px-2.5 max-sm:h-9', o.value === value && 'bg-background shadow-sm hover:bg-background')} onClick={() => onChange(o.value)}>{o.label}</Button>
      ))}
    </div>
  );
}

export interface Ctx {
  comp: Json; look: Json; cat: LookCatalogue; path: string; el: Json; swatches: Swatches; advanced: boolean; disabled: boolean;
  // writes a property of the element; returns '' or the plain reason it was refused
  set: (name: string, value: unknown) => string;
  rotate: (v: string | number | undefined) => string;
  setPlace: (place: Json) => string;
  setForm: (form: PlaceForm) => string;
  inks: string[];
}

// ---- a number in bounds ----
export function NumberInput({ label, value, desc, onChange, hint, disabled, optional, step }: { label: ReactNode; value: unknown; desc: Desc; onChange: (v: number | undefined) => string; hint?: ReactNode; disabled?: boolean; optional?: boolean; step?: number }) {
  const shown = typeof value === 'number' ? String(value) : '';
  const [text, setText] = useState(shown);
  const [error, setError] = useState('');
  // follow the value, but never rewrite what is being typed ("1." is 1, and stays "1." until the next digit)
  useEffect(() => { setText((cur) => (cur.trim() !== '' && Number(cur) === value ? cur : shown)); setError(''); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const range = typeof desc.min === 'number' && typeof desc.max === 'number' ? `${Math.round(desc.min * 1000) / 1000} to ${Math.round(desc.max * 1000) / 1000}` : undefined;
  return (
    <TextField label={label} type="number" inputMode={desc.int ? 'numeric' : 'decimal'} min={desc.min} max={desc.max} step={step ?? desc.step ?? (desc.int ? 1 : 'any')} value={text} disabled={disabled}
      hint={hint ?? range} error={error || undefined} optional={optional}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (t.trim() === '') { setError(optional ? onChange(undefined) : 'Enter a number'); return; }
        const r = coerceProp({ ...desc, kind: 'number' }, t, { lists: {} } as unknown as LookCatalogue);
        setError('error' in r ? r.error : onChange(r.value as number));
      }} />
  );
}

// ---- a brand colour role as a swatch ----
// A radio group: one tab stop (the chosen swatch, else the first), the arrow keys move the choice. `wordOf` names a role (default: the design
// editor's words for the look's roles).
export function RolePicker({ label, value, roles, swatches, onChange, optional, disabled, hint, wordOf = roleWord }: { label: ReactNode; value: string | undefined; roles: string[]; swatches: Swatches; onChange: (v: string | undefined) => string; optional?: boolean; disabled?: boolean; hint?: ReactNode; wordOf?: (role: string) => string }) {
  const [error, setError] = useState('');
  const list = value && !roles.includes(value) ? [value, ...roles] : roles;
  const pick = (v: string | undefined) => setError(onChange(v));
  const all: Array<string | undefined> = optional ? [undefined, ...list] : list;
  const focusAt = all.includes(value) ? all.indexOf(value) : 0;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step || disabled) return;
    e.preventDefault();
    const at = (all.indexOf(value) + step + all.length) % all.length;
    pick(all[at]);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[at])?.focus();
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-1 text-[13px] font-medium">{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
        <span className="ml-auto truncate font-normal text-muted-foreground">{value ? wordOf(value) : 'Not set'}</span></div>
      <div role="radiogroup" aria-label={typeof label === 'string' ? label : undefined} className="flex flex-wrap gap-1.5" onKeyDown={onKey}>
        {optional && <button type="button" role="radio" aria-checked={value === undefined} aria-label="No colour" tabIndex={focusAt === 0 ? 0 : -1} disabled={disabled} onClick={() => pick(undefined)}
          className={cn('grid size-6 place-items-center rounded-full border bg-background text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-9', value === undefined && 'ring-2 ring-primary ring-offset-1')}><X className="size-3" aria-hidden="true" /></button>}
        {list.map((r, i) => (
          <button key={r} type="button" role="radio" aria-checked={value === r} aria-label={wordOf(r)} title={wordOf(r)} tabIndex={focusAt === i + (optional ? 1 : 0) ? 0 : -1} disabled={disabled} onClick={() => pick(r)}
            className={cn('size-6 rounded-full border border-foreground/20 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-9', value === r && 'ring-2 ring-primary ring-offset-1')}
            style={{ backgroundColor: swatchOf(swatches, r) }} />
        ))}
      </div>
      {hint && <p className="text-[12.5px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

// ---- a length: pixels or a token ----
function LengthControl({ label, desc, value, onChange, disabled, optional }: { label: ReactNode; desc: Desc; value: unknown; onChange: (v: number | string | undefined) => string; disabled?: boolean; optional?: boolean }) {
  const mode = value === undefined ? '' : typeof value === 'string' ? value : 'px';
  const [error, setError] = useState('');
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SelectField label={label} value={mode} disabled={disabled} error={error || undefined}
        options={[...(optional ? [{ value: '', label: 'Not set' }] : []), { value: 'px', label: 'Pixels' }, ...['margin', 'gutter', 'col', 'frame', 'frame+pad'].map((t) => ({ value: t, label: TOKEN_WORDS[t]! }))]}
        onValueChange={(m) => setError(onChange(m === '' ? undefined : m === 'px' ? (typeof desc.min === 'number' ? Math.max(desc.min, 0) : 0) : m))} />
      {mode === 'px' && <NumberInput label="Pixels" value={value} desc={{ ...desc, kind: 'number' }} disabled={disabled} onChange={(v) => (v === undefined ? '' : onChange(v))} />}
    </div>
  );
}

// ---- an angle: straight, a named angle of the look, or (Advanced) degrees ----
export function AngleControl({ label, value, ctx, onChange, disabled }: { label: ReactNode; value: unknown; ctx: Pick<Ctx, 'look' | 'cat' | 'advanced'>; onChange: (v: string | number | undefined) => string; disabled?: boolean }) {
  const named = namedAngles(ctx.look, ctx.cat);
  const cur = value === undefined || value === 0 ? '' : typeof value === 'string' ? value : 'custom';
  const [error, setError] = useState('');
  const opts = [{ value: '', label: 'Straight' }, ...turnOptions(named, ctx.look).map(({ value: v, label: l }) => ({ value: v, label: l })), ...(cur === 'custom' || ctx.advanced ? [{ value: 'custom', label: 'Our own angle' }] : [])];
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SelectField label={label} value={cur} options={opts} disabled={disabled} error={error || undefined} hint="A named angle of this look, so the design turns the way the look does. Our own angle needs Advanced."
        onValueChange={(v) => setError(onChange(v === '' ? undefined : v === 'custom' ? 2 : v))} />
      {cur === 'custom' && <NumberInput label="Degrees" value={value} desc={{ kind: 'number', min: -15, max: 15, step: 0.5 }} disabled={disabled} onChange={(v) => onChange(v)} />}
    </div>
  );
}

// ---- a size ladder: "up to N characters, this size" ----
export function LadderEditor({ ctx, el, fieldMax, range, disabled }: { ctx: Ctx; el: Json; fieldMax: number | undefined; range: [number, number]; disabled?: boolean }) {
  const ladder = ladderOf(el);
  const by = ladder?.by ?? String(el.field ?? '');
  const [rows, setRows] = useState<LadderStep[]>(ladder?.steps ?? []);
  const [error, setError] = useState('');
  const key = JSON.stringify(ladder?.steps ?? []);
  useEffect(() => { setRows(ladder?.steps ?? []); setError(''); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  function commit(next: LadderStep[]) {
    setRows(next);
    const bad = checkLadder(next, fieldMax, range);
    if (bad) { setError(bad); return; }
    const base = isObj(el.ladder) ? { ...el.ladder } : { by };
    setError(ctx.set('ladder', { ...base, by, steps: next }));
  }
  const change = (i: number, j: 0 | 1, v: string) => { const n = rows.map((r) => [...r] as LadderStep); n[i]![j] = v.trim() === '' ? NaN : Number(v); commit(n); };
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-[13px] font-medium">Size by length of the text</legend>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[13px]">
            <span className="shrink-0 text-muted-foreground">Up to</span>
            <input aria-label={`Step ${i + 1}: characters`} type="number" inputMode="numeric" min={1} value={Number.isFinite(r[0]) ? r[0] : ''} onChange={(e) => change(i, 0, e.target.value)}
              className="h-8 w-16 rounded-md border bg-background px-2 text-[13px] max-sm:h-11 max-sm:text-base" />
            <span className="shrink-0 text-muted-foreground">characters, size</span>
            <input aria-label={`Step ${i + 1}: size`} type="number" inputMode="numeric" min={range[0]} max={range[1]} value={Number.isFinite(r[1]) ? r[1] : ''} onChange={(e) => change(i, 1, e.target.value)}
              className="h-8 w-16 rounded-md border bg-background px-2 text-[13px] max-sm:h-11 max-sm:text-base" />
            {rows.length > 1 && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove step ${i + 1}`} onClick={() => commit(rows.filter((_, k) => k !== i))}><Trash2 /></Button>}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        {rows.length < (ctx.cat.limits.ladderSteps ?? 6) && <Button type="button" size="sm" variant="outline" onClick={() => { const last = rows[rows.length - 1] ?? [30, 96]; commit([...rows, [Math.min(last[0] + 20, fieldMax ?? last[0] + 20), Math.max(range[0], last[1] - 12)]]); }}><Plus aria-hidden="true" /> Add a step</Button>}
        <span className="text-[12.5px] text-muted-foreground">Counted on {fieldLabel(by, ctx.cat).toLowerCase()}{fieldMax !== undefined ? `; the last step must reach ${fieldMax}` : ''}</span>
      </div>
      {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}

// ---- one setting of any kind, by descriptor ----
export function ValueControl({ name, desc, value, onChange, ctx, label, optional, disabled }: { name: string; desc: Desc; value: unknown; onChange: (v: unknown) => string; ctx: Ctx; label?: ReactNode; optional?: boolean; disabled?: boolean }) {
  const lab = label ?? desc.label ?? name;
  const hint = desc.help;
  const dis = disabled ?? ctx.disabled;
  const [error, setError] = useState('');
  const send = (v: unknown) => setError(onChange(v));
  switch (desc.kind) {
    case 'number': return <NumberInput label={lab} value={value} desc={desc} hint={hint ? `${hint}` : undefined} disabled={dis} optional={optional} onChange={(v) => onChange(v)} />;
    case 'enum': {
      const vals = desc.values ?? [];
      const v = value === undefined ? (optional || desc.default === undefined ? '' : String(desc.default)) : String(value);
      return <ChoiceField label={lab} hint={hint} value={v} disabled={dis} error={error || undefined} placeholder={optional ? 'Not set' : undefined}
        options={[...(optional || value === undefined ? [{ value: '', label: desc.default !== undefined ? `Look's own (${word(desc.default as string)})` : 'Not set' }] : []), ...options(vals)]}
        onValueChange={(x) => send(x === '' ? undefined : typeof vals[0] === 'number' ? Number(x) : x)} />;
    }
    case 'bool': return <SwitchField label={lab} hint={hint} checked={value === true || (value === undefined && desc.default === true)} disabled={dis} onCheckedChange={(v) => send(v)} />;
    case 'text': return <TextField label={lab} hint={hint} value={typeof value === 'string' ? value : ''} maxLength={desc.max} disabled={dis} error={error || undefined} onChange={(e) => send(e.target.value)} />;
    case 'role': return <RolePicker label={lab} value={typeof value === 'string' ? value : undefined} roles={name === 'fill' ? (ctx.cat.lists.fillRoles as string[]) : name === 'ink' ? ctx.inks : (ctx.cat.lists.roles as string[])} swatches={ctx.swatches} optional={optional} disabled={dis} onChange={(v) => onChange(v)} />;
    case 'length': return <LengthControl label={lab} desc={desc} value={value} disabled={dis} optional={optional ?? true} onChange={(v) => onChange(v)} />;
    case 'angle': return <AngleControl label={lab} value={value} ctx={ctx} disabled={dis} onChange={(v) => (name === 'rot' ? ctx.rotate(v) : onChange(v))} />;
    case 'field': {
      const of = ((desc as unknown as { of?: string[] }).of ?? []).filter((f) => f in ctx.cat.fields);
      const here = declaredFields(ctx.comp);
      return <SelectField label={lab} hint={hint} value={typeof value === 'string' ? value : ''} disabled={dis} error={error || undefined} placeholder="Not set"
        options={[...(value === undefined ? [{ value: '', label: 'Not set' }] : []), ...of.map((f) => ({ value: f, label: `${fieldLabel(f, ctx.cat)}${here.includes(f) ? '' : ' (not in this design yet)'}` }))]}
        onValueChange={(f) => send(f === '' ? undefined : f)} />;
    }
    case 'list': return <ListControl name={name} desc={desc} value={value} lab={lab} ctx={ctx} onChange={onChange} disabled={dis} />;
    case 'tuple': {
      const items = desc.items ?? [];
      const arr = Array.isArray(value) ? value : items.map(blankFor);
      return (
        <FieldGroup legend={lab} hint={hint} error={error || undefined}>
          <div className={cn('grid gap-2', items.length >= 4 ? 'grid-cols-2' : 'grid-cols-2')}>
            {items.map((d, i) => (
              <ValueControl key={i} name={`${name}.${i}`} desc={d} value={arr[i]} ctx={ctx} disabled={dis} label={d.label ?? `Value ${i + 1}`}
                onChange={(v) => { const n = [...arr]; n[i] = v; const m = onChange(n); setError(m); return m; }} />
            ))}
          </div>
        </FieldGroup>
      );
    }
    case 'object': return <ObjectControl name={name} desc={desc} value={value} lab={lab} ctx={ctx} onChange={onChange} optional={optional} disabled={dis} />;
    case 'oneOf': return <OneOfControl name={name} desc={desc} value={value} lab={lab} ctx={ctx} onChange={onChange} disabled={dis} />;
    default: return null;
  }
}

function ListControl({ name, desc, value, lab, ctx, onChange, disabled }: { name: string; desc: Desc; value: unknown; lab: ReactNode; ctx: Ctx; onChange: (v: unknown) => string; disabled?: boolean }) {
  const of = desc.of as Desc | undefined;
  const arr = Array.isArray(value) ? value : [];
  const [error, setError] = useState('');
  if (of?.kind === 'enum') {
    return (
      <FieldGroup legend={lab} hint={desc.help} error={error || undefined}>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {(of.values ?? []).map((v) => <CheckField key={String(v)} label={word(v)} checked={arr.includes(v)} disabled={disabled}
            onCheckedChange={(on) => setError(onChange((() => { const n = on ? [...arr, v] : arr.filter((x) => x !== v); return n.length ? n : undefined; })()))} />)}
        </div>
      </FieldGroup>
    );
  }
  if (of?.kind === 'number') {
    return (
      <FieldGroup legend={lab} hint={desc.help} error={error || undefined}>
        <div className="flex flex-wrap items-end gap-2">
          {arr.map((v, i) => (
            <div key={i} className="flex items-end gap-0.5">
              <NumberInput label={`${i + 1}`} value={v} desc={of} disabled={disabled} onChange={(x) => { if (x === undefined) return 'Enter a number'; const n = [...arr]; n[i] = x; return onChange(n); }} />
              {arr.length > (desc.min ?? 0) && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${i + 1}`} disabled={disabled} onClick={() => setError(onChange(arr.filter((_, k) => k !== i)))}><Trash2 /></Button>}
            </div>
          ))}
          {arr.length < (desc.max ?? 8) && <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setError(onChange([...arr, Math.max(of.min ?? 0, Math.round(((arr[arr.length - 1] as number | undefined) ?? 120) * 0.9))]))}><Plus aria-hidden="true" /> Add</Button>}
        </div>
      </FieldGroup>
    );
  }
  return <p className="text-[12.5px] text-muted-foreground">{lab}: set this in Advanced JSON.</p>;
}

function ObjectControl({ name, desc, value, lab, ctx, onChange, optional, disabled }: { name: string; desc: Desc; value: unknown; lab: ReactNode; ctx: Ctx; onChange: (v: unknown) => string; optional?: boolean; disabled?: boolean }) {
  const [error, setError] = useState('');
  const obj = isObj(value) ? value : null;
  if (!obj) {
    return <div><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setError(onChange(blankFor(desc)))}><Plus aria-hidden="true" /> {lab}</Button>{error && <p className="mt-1 text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}</div>;
  }
  const required = new Set(desc.required ?? []);
  return (
    <FieldGroup legend={<span className="flex items-center gap-2">{lab}{(optional ?? true) && <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${typeof lab === 'string' ? lab : 'this'}`} disabled={disabled} onClick={() => setError(onChange(undefined))}><X /></Button>}</span>} hint={desc.help} error={error || undefined}>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(desc.props ?? {}).map(([k, d]) => (
          <div key={k} className={cn(['object', 'list', 'tuple', 'role', 'oneOf'].includes(d.kind) && 'col-span-2')}>
            <ValueControl name={k === 'colour' ? 'colour' : k} desc={d} value={obj[k]} ctx={ctx} disabled={disabled} optional={!required.has(k)}
              onChange={(v) => { const n = { ...obj }; if (v === undefined) delete n[k]; else n[k] = v; const m = onChange(n); setError(m); return m; }} />
          </div>
        ))}
      </div>
    </FieldGroup>
  );
}

function OneOfControl({ name, desc, value, lab, ctx, onChange, disabled }: { name: string; desc: Desc; value: unknown; lab: ReactNode; ctx: Ctx; onChange: (v: unknown) => string; disabled?: boolean }) {
  const forms = (desc as unknown as { forms: Array<{ is: string; desc: Desc }> }).forms ?? [];
  const idx = forms.findIndex((f) => (f.is === 'array' ? Array.isArray(value) : f.is === 'object' ? isObj(value) : f.is === 'boolean' ? typeof value === 'boolean' : typeof value === f.is));
  const words = FORM_WORDS[name] ?? FORM_WORDS[(name.split('.').pop() ?? '')];
  const [error, setError] = useState('');
  if (value === undefined) {
    return <div><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setError(onChange(blankFor(forms[0]!.desc)))}><Plus aria-hidden="true" /> {lab}</Button>{error && <p className="mt-1 text-[12.5px] text-destructive" role="alert">{error}</p>}</div>;
  }
  return (
    <FieldGroup legend={<span className="flex items-center gap-2">{lab}<Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${typeof lab === 'string' ? lab : 'this'}`} disabled={disabled} onClick={() => setError(onChange(undefined))}><X /></Button></span>} hint={desc.help} error={error || undefined}>
      {forms.length > 1 && <ChoiceField label="Form" value={String(Math.max(idx, 0))} disabled={disabled} options={forms.map((f, i) => ({ value: String(i), label: words?.[i] ?? word(f.is) }))}
        onValueChange={(i) => setError(onChange(clone(blankFor(forms[Number(i)]!.desc))))} />}
      {idx >= 0 && <ValueControl name={name} desc={forms[idx]!.desc} value={value} ctx={ctx} disabled={disabled} label={forms.length > 1 ? (forms[idx]!.desc.label ?? 'Value') : (forms[idx]!.desc.label ?? 'Value')} onChange={onChange} />}
    </FieldGroup>
  );
}

// ---- where an element sits ----
const FORM_ORDER: PlaceForm[] = ['grid', 'anchor', 'px', 'inset'];
export function PlaceEditor({ ctx }: { ctx: Ctx }) {
  const { el, cat, look } = ctx;
  const form = placeForm(el, cat);
  const place = isObj(el.place) ? el.place : {};
  const inBox = ctx.path.includes('.');
  const [error, setError] = useState('');
  const g = gridOf(look);
  const forms = cat.place?.forms ?? {};
  const mods = cat.place?.modifiers ?? {};
  if (form === 'none') return <p className="text-[13px] text-muted-foreground">It sits where the look puts it; it has no place to set.</p>;
  const write = (p: Json) => setError(ctx.setPlace(p));
  const choices: PlaceForm[] = [...FORM_ORDER.filter((f) => f !== 'px' || ctx.advanced || form === 'px'), ...(inBox ? (['flow'] as PlaceForm[]) : [])];
  const sub = (k: string, v: unknown) => { const n = { ...place }; const inner = isObj(n[form]) ? { ...(n[form] as Json) } : {}; if (v === undefined) delete inner[k]; else inner[k] = v; n[form] = inner; return n; };
  const modify = (k: string, v: unknown) => { const n = { ...place }; if (v === undefined || v === false) delete n[k]; else n[k] = v; return n; };
  const side = (k: string) => { const d = (forms.anchor as Desc | undefined)?.props?.[k]; return d ? d : ({ kind: 'length', min: -300, max: 1700 } as Desc); };
  return (
    <div className="flex flex-col gap-3">
      <ChoiceField label="Placed" value={form} disabled={ctx.disabled} error={error || undefined}
        hint="Grid snaps to the page grid. Anchored holds distances from the page edges. Free pixels places it by pixels (Advanced). Fills an area covers the page, the margins or the frame."
        options={choices.map((f) => ({ value: f, label: PLACE_FORM_WORDS[f] ?? f }))}
        onValueChange={(f) => setError(ctx.setForm(f as PlaceForm))} />
      {form === 'flow' && <p className="text-[13px] text-muted-foreground">Positioned by its box: it flows with the other items in it.</p>}
      {form === 'grid' && isObj(place.grid) && (
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Column" value={place.grid.col} desc={{ kind: 'number', int: true, min: 1, max: g?.cols ?? 24 }} disabled={ctx.disabled} onChange={(v) => { if (v === undefined) return 'Enter a number'; const m = ctx.setPlace(sub('col', v)); return m; }} />
          <NumberInput label="Columns wide" value={place.grid.span} desc={{ kind: 'number', int: true, min: 1, max: g?.cols ?? 24 }} disabled={ctx.disabled} onChange={(v) => { if (v === undefined) return 'Enter a number'; return ctx.setPlace(sub('span', v)); }} />
          {(g?.rows ?? 0) > 0 && <NumberInput label="Row" value={place.grid.row} optional desc={{ kind: 'number', int: true, min: 1, max: g?.rows ?? 16 }} disabled={ctx.disabled} onChange={(v) => ctx.setPlace(sub('row', v))} />}
          {(g?.rows ?? 0) > 0 && <NumberInput label="Rows tall" value={place.grid.rowSpan} optional desc={{ kind: 'number', int: true, min: 1, max: g?.rows ?? 16 }} disabled={ctx.disabled} onChange={(v) => ctx.setPlace(sub('rowSpan', v))} />}
          {(g?.rows ?? 0) > 0 && <div className="col-span-2"><ChoiceField label="Sits in its rows" value={String(place.grid.alignY ?? '')} disabled={ctx.disabled} options={[{ value: '', label: 'Look\'s own' }, ...options(((forms.grid as Desc | undefined)?.props?.alignY?.values) ?? ['top', 'center', 'bottom'])]} onValueChange={(v) => write(sub('alignY', v === '' ? undefined : v))} /></div>}
        </div>
      )}
      {form === 'px' && isObj(place.px) && (
        <div className="grid grid-cols-2 gap-2">
          {(['x', 'y', 'w', 'h'] as const).map((k) => (
            <NumberInput key={k} label={{ x: 'Left', y: 'Top', w: 'Width', h: 'Height' }[k]} value={(place.px as Json)[k]} optional={k === 'w' || k === 'h'} desc={((forms.px as Desc | undefined)?.props?.[k]) ?? { kind: 'number', int: true, min: 0, max: 1700 }} disabled={ctx.disabled}
              onChange={(v) => { if (v === undefined && (k === 'x' || k === 'y')) return 'Enter a number'; return ctx.setPlace(sub(k, v)); }} />
          ))}
        </div>
      )}
      {form === 'anchor' && isObj(place.anchor) && (
        <div className="grid grid-cols-2 gap-2">
          {(['left', 'right', 'top', 'bottom', 'w', 'h'] as const).map((k) => (
            <LengthControl key={k} label={{ left: 'From the left', right: 'From the right', top: 'From the top', bottom: 'From the bottom', w: 'Width', h: 'Height' }[k]} desc={side(k)} value={(place.anchor as Json)[k]} optional disabled={ctx.disabled}
              onChange={(v) => ctx.setPlace(sub(k, v))} />
          ))}
        </div>
      )}
      {form === 'inset' && (
        <ChoiceField label="Fills" value={String(place.inset)} disabled={ctx.disabled} options={options(['page', 'margins', 'frame'])} onValueChange={(v) => write({ inset: v })} />
      )}
      {(form === 'grid' || form === 'px' || form === 'anchor') && ctx.advanced && (
        <details className="rounded-md bg-muted/40 px-2.5 py-1.5">
          <summary className="cursor-pointer text-[12.5px] font-medium text-muted-foreground">Nudge and minimum height</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['dx', 'dy', 'minH'] as const).map((k) => <NumberInput key={k} label={mods[k]?.label ?? k} value={place[k]} optional desc={mods[k] ?? { kind: 'number', int: true, min: -200, max: 200 }} disabled={ctx.disabled} onChange={(v) => ctx.setPlace(modify(k, v))} />)}
            {form === 'grid' && <SwitchField label="Square" checked={place.square === true} disabled={ctx.disabled} onCheckedChange={(v) => write(modify('square', v))} />}
          </div>
        </details>
      )}
    </div>
  );
}

// ---- when an element is shown ----
export function WhenEditor({ ctx }: { ctx: Ctx }) {
  const w = readWhen(ctx.el);
  const declared = declaredFields(ctx.comp).filter((f) => f !== 'image' || true);
  const [error, setError] = useState('');
  const opts = (other?: string) => [{ value: '', label: 'Not needed' }, ...declared.filter((f) => f !== other).map((f) => ({ value: f, label: fieldLabel(f, ctx.cat) }))];
  const set = (next: Json) => setError(ctx.set('when', Object.keys(next).length ? next : undefined));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] text-muted-foreground" role="status">{whenText(w, ctx.cat)}</p>
      <SelectField label="Only when this is filled in" value={w.present ?? ''} options={opts(w.absent)} disabled={ctx.disabled} error={error || undefined} onValueChange={(f) => set({ ...(f ? { present: f } : {}), ...(w.absent ? { absent: w.absent } : {}) })} />
      <SelectField label="and only when this is empty" value={w.absent ?? ''} options={opts(w.present)} disabled={ctx.disabled} onValueChange={(f) => set({ ...(w.present ? { present: w.present } : {}), ...(f ? { absent: f } : {}) })} />
    </div>
  );
}

// ---- what the element shows: a field of the post, or the brand name, folio, list number ----
export function BindingEditor({ ctx, onBind, onSource }: { ctx: Ctx; onBind: (field: string | null) => string; onSource: (s: string | null) => string }) {
  const { el, cat, comp } = ctx;
  const type = String(el.type);
  const desc = cat.elements[type]?.properties.field as (Desc & { of?: string[] }) | undefined;
  const sourceDesc = cat.elements[type]?.properties.source;
  const kind = cat.kinds[String(comp.kind)];
  const allowed = ((desc as unknown as { of?: string[] } | undefined)?.of ?? []).filter((f) => kind?.fields.includes(f));
  const mode = typeof el.source === 'string' ? el.source : 'field';
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-2">
      {sourceDesc && <ChoiceField label="Shows" value={mode === 'field' ? 'field' : mode} disabled={ctx.disabled} options={[{ value: 'field', label: 'A field of the post' }, ...options(sourceDesc.values ?? [])]}
        onValueChange={(v) => setError(v === 'field' ? onSource(null) : onSource(v))} />}
      {desc && mode === 'field' && (
        <SelectField label="Field" hint="Which of the post's words it shows. A field no element shows is left out of the design once you confirm." value={typeof el.field === 'string' ? el.field : ''} disabled={ctx.disabled} error={error || undefined} placeholder="Choose a field"
          options={[...(el.field === undefined ? [{ value: '', label: 'Choose a field' }] : []), ...allowed.map((f) => ({ value: f, label: `${fieldLabel(f, cat)}${declaredFields(comp).includes(f) ? '' : ' (adds it to the design)'}` }))]}
          onValueChange={(f) => setError(onBind(f === '' ? null : f))} />
      )}
      {error && !desc && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}
