// The right pane of the design editor with nothing selected: the design itself. A name and when to use it, the page colour as the brand's own
// colours, the fields as one compact row each (needed or optional, the most characters in place), and under "More" the rules on the words it
// accepts, the empty space and where text stays.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Hint, MoreMenu, SelectField, SwitchField, TextAreaField, TextField } from '@/components/kit';
import { SegmentedField } from '@/components/kit/segmented-field';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  acceptText, acceptsOf, addField, checkAccept, declaredFields, fieldLabel, removeField, requiredFields, setAccepts, setBudget, setCalm, setGround, setTop, shownFields,
  GROUND_WORDS, type Accept, type DesignProblem, type Edit, type Json,
} from '../design-model';
import { NumberInput, RolePicker } from '../design-controls';
import { useSwatches } from '../design-colours';
import type { LookCatalogue } from '../look-types';
import { Disclosure, InlineNumber } from './ui';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export interface DesignSettingsProps {
  comp: Json; look: Json; cat: LookCatalogue; readOnly: boolean; apply: (fn: (c: Json) => Edit, key?: string) => string; problems: DesignProblem[];
}

export function DesignSettings({ comp, look, cat, readOnly, apply, problems }: DesignSettingsProps) {
  const kind = String(comp.kind);
  const swatches = useSwatches();
  const declared = declaredFields(comp);
  const shown = new Set(shownFields(comp, look));
  const required = new Set(requiredFields(comp, cat));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const err = (k: string, m: string) => { setErrors((e) => (e[k] === m || (!e[k] && !m) ? e : { ...e, [k]: m })); return m; };
  const mine = problems.filter((x) => x.path === null && !/^(fields|accepts|ground|calm|fit|name|describe)/.test(x.prop ?? ''));
  const moreProblem = problems.some((x) => x.path === null && /^(accepts|calm|fit)/.test(x.prop ?? ''));
  const grounds = ((look.colour as Json | undefined)?.grounds as string[] | undefined) ?? Object.keys(GROUND_WORDS);
  const groundNow = typeof comp.ground === 'string' ? comp.ground : null;
  const free = (cat.kinds[kind]?.fields ?? []).filter((f) => !declared.includes(f));
  const accepts = acceptsOf(comp);
  const [draft, setDraft] = useState<{ field: string; part: string; n: string; min: string; max: string } | null>(null);
  const calm = isObj(comp.calm) ? (comp.calm.maxShare as number | undefined) : undefined;
  const fit = comp.fit;
  const fitNow = typeof fit === 'string' ? fit : isObj(fit) ? 'pixels' : 'margins';
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
  const moreSummary = [
    accepts.length ? `${accepts.length} word ${accepts.length === 1 ? 'rule' : 'rules'}` : 'no word rules',
    calm !== undefined ? `empty space ${Math.round((1 - calm) * 100)}%+` : 'full page',
    fitNow === 'pixels' ? 'text room in pixels' : `text inside the ${fitNow === 'frame' ? 'frame' : 'margins'}`,
  ].join(' · ');

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[15px] font-semibold">This design</h2>
      {mine.length > 0 && <ul className="list-disc space-y-0.5 pl-[18px] text-[12.5px] font-medium text-destructive" role="alert">{mine.map((m, i) => <li key={i}>{m.message}</li>)}</ul>}
      <TextField label="Name" value={String(comp.name ?? '')} maxLength={cat.limits.name} disabled={readOnly} error={errors.name}
        onChange={(e) => { const v = e.target.value; err('name', apply((c) => setTop(c, 'name', v, cat), 'name')); }} />
      <TextAreaField label="When to use it" rows={2} value={String(comp.describe ?? '')} maxLength={cat.limits.description} disabled={readOnly} error={errors.describe} optional
        hint="One or two sentences on how it looks and when it suits a post. People see it in the list of designs and the AI reads it to choose a design."
        onChange={(e) => { const v = e.target.value; err('describe', apply((c) => setTop(c, 'describe', v, cat), 'describe')); }} />

      {groundNow !== null
        ? <RolePicker label="Page colour" value={groundNow} roles={grounds.includes(groundNow) ? grounds : [groundNow, ...grounds]} swatches={swatches} disabled={readOnly} onChange={(g) => { if (g) apply((c) => setGround(c, g), 'ground'); return ''; }} />
        : <p className="text-[13px] text-muted-foreground">The page colour changes with the post (cases). Change the cases under Advanced: JSON.</p>}

      <section aria-label="Fields" className="flex flex-col gap-1 border-t pt-2.5">
        <div className="flex min-h-6 items-center gap-1">
          <h3 className="text-[13px] font-semibold">Fields</h3>
          <Hint about="Fields">The words and picture of a post this design uses. A needed field must be filled in for the design to be used; the most is how long its text may be.</Hint>
          <span className="ml-auto flex items-center gap-1 pr-8 text-[12px] text-muted-foreground">Most characters</span>
        </div>
        <ul className="flex flex-col">
          {declared.map((f) => {
            const info = cat.fields[f];
            const f0 = (comp.fields as Json)[f] as Json;
            const top = info?.max;
            const used = shown.has(f);
            const locked = required.has(f) && (cat.kinds[kind]?.required ?? []).includes(f);
            const name = fieldLabel(f, cat);
            const on = f0.required === true;
            const why = locked ? 'The kind of post needs it' : used ? 'An element still shows it' : '';
            return (
              <li key={f} className="group flex flex-col border-b last:border-b-0">
                <div className="flex min-h-9 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]" title={used ? undefined : 'No element shows it'}>{name}{!used && <span className="ml-1 text-muted-foreground">·&nbsp;unused</span>}</span>
                  <button type="button" aria-pressed={on} aria-label={`${name}: ${on ? 'needed' : 'optional'}. Click to change.`} disabled={readOnly || locked}
                    onClick={() => err(`f-${f}`, apply((c) => setBudget(c, f, { required: !on }, cat)))}
                    className={cn('h-6 rounded-full border px-2 text-[11.5px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed max-sm:h-9', on ? 'border-primary/60 bg-primary/10 text-foreground' : 'text-muted-foreground hover:border-foreground/40')}>
                    {on ? 'Needed' : 'Optional'}
                  </button>
                  {info?.type === 'text' && <InlineNumber ariaLabel={`Most characters for ${name}`} value={f0.max} desc={{ kind: 'number', int: true, min: 1, max: top }} disabled={readOnly} onError={(m) => err(`f-${f}`, m)}
                    onChange={(v) => apply((c) => setBudget(c, f, { max: v }, cat), `max-${f}`)} />}
                  {info?.type === 'items' && (
                    <span className="flex items-center gap-0.5 text-[12px] text-muted-foreground">
                      <InlineNumber className="w-11" ariaLabel={`Fewest ${name}`} value={f0.min} desc={{ kind: 'number', int: true, min: 1, max: info.max }} disabled={readOnly} onError={(m) => err(`f-${f}`, m)} onChange={(v) => apply((c) => setBudget(c, f, { min: v }, cat), `min-${f}`)} />
                      –
                      <InlineNumber className="w-11" ariaLabel={`Most ${name}`} value={f0.max} desc={{ kind: 'number', int: true, min: 1, max: info.max }} disabled={readOnly} onError={(m) => err(`f-${f}`, m)} onChange={(v) => apply((c) => setBudget(c, f, { max: v }, cat), `max-${f}`)} />
                    </span>
                  )}
                  {info?.type === 'image' && <span className="w-16" />}
                  <MoreMenu label={`More actions for ${name}`} className="size-7 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                    items={[{ label: why ? `Remove (${why.toLowerCase()})` : 'Remove', tone: 'danger', disabled: readOnly || !!why, onSelect: () => { err(`f-${f}`, apply((c) => removeField(c, f, look, cat))); } }]} />
                </div>
                {errors[`f-${f}`] && <p className="pb-1 text-[12.5px] font-medium text-destructive" role="alert">{errors[`f-${f}`]}</p>}
              </li>
            );
          })}
        </ul>
        {free.length > 0 && (
          <div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="ghost" disabled={readOnly} className="-ml-2 text-muted-foreground"><Plus aria-hidden="true" /> Add a field</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {free.map((f) => <DropdownMenuItem key={f} className="max-sm:min-h-11" onSelect={() => err('addField', apply((c) => addField(c, f, cat)))}>{fieldLabel(f, cat)}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            {errors.addField && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.addField}</p>}
          </div>
        )}
      </section>

      <Disclosure title="More" summary={moreSummary} force={moreProblem}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 text-[13px] font-medium">Words it accepts<Hint about="Words it accepts">Rules on the words this design can draw. When a post’s words break a rule, the next design of the same kind is used.</Hint></div>
          {accepts.length === 0 && <p className="text-[12.5px] text-muted-foreground">Any words within the field limits.</p>}
          <ul className="flex flex-col">
            {accepts.map((a, i) => (
              <li key={i} className="flex min-h-8 items-center gap-1 border-b text-[13px] last:border-b-0">
                <span className="min-w-0 flex-1">{acceptText(a, cat)}</span>
                <MoreMenu label={`More actions for the rule: ${acceptText(a, cat)}`} className="size-7" disabled={readOnly}
                  items={[{ label: 'Remove the rule', tone: 'danger', onSelect: () => err('accepts', apply((c) => setAccepts(c, acceptsOf(c).filter((_, k) => k !== i), cat))) }]} />
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
                  {emphasis(draft.field) && <SegmentedField className="col-span-2" label="Which part" value={draft.part} options={[{ value: 'all', label: 'The whole text' }, { value: 'pre', label: 'The first part' }, { value: 'phrase', label: 'The emphasised phrase' }]} onValueChange={(v) => setDraft({ ...draft, part: v })} />}
                  <TextField label="Up to characters" type="number" inputMode="numeric" value={draft.n} onChange={(e) => setDraft({ ...draft, n: e.target.value })} />
                </div>
              )}
              {errors.accepts && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.accepts}</p>}
              <div className="flex gap-2"><Button type="button" size="sm" onClick={addRule}>Add the rule</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(null); err('accepts', ''); }}>Cancel</Button></div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div><Button type="button" size="sm" variant="outline" disabled={readOnly || declared.filter((f) => f !== 'image').length === 0 || accepts.length >= (cat.limits.accepts ?? 6)} onClick={() => setDraft({ field: declared.find((f) => f !== 'image') ?? 'headline', part: 'all', n: '', min: '', max: '' })}><Plus aria-hidden="true" /> Add a rule</Button></div>
              {errors.accepts && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.accepts}</p>}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t pt-2.5">
          <SwitchField label="Keep part of the page empty" hint="A deliberately empty area, as a share of the page (0.45 to 0.8). Leave it off if the design should be full." checked={calm !== undefined} disabled={readOnly} onCheckedChange={(v) => err('calm', apply((c) => setCalm(c, v ? 0.6 : undefined)))} />
          {calm !== undefined && <NumberInput label="Most of the page it may fill" value={calm} desc={{ kind: 'number', min: 0.45, max: 0.8, step: 0.01 }} disabled={readOnly} onChange={(v) => (v === undefined ? 'Enter a number' : err('calm', apply((c) => setCalm(c, v), 'calm')))} />}
          {errors.calm && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.calm}</p>}
        </div>

        <div className="border-t pt-2.5">
          {isObj(fit)
            ? <p className="text-[13px] text-muted-foreground">The room for text is set in pixels. Change it under Advanced: JSON.</p>
            : <SegmentedField label="Text stays inside" value={fitNow} disabled={readOnly} options={[{ value: 'margins', label: 'The page margins' }, { value: 'frame', label: 'The frame' }]}
              onValueChange={(v) => { apply((c) => ({ comp: { ...c, fit: v } }), 'fit'); }} />}
        </div>
      </Disclosure>
    </div>
  );
}
