// The size of an element's text: four named sizes (Small to Huge) over the look's type scale, and the exact controls for Fine-tune.
// A named size writes only `size` and `ladder`, and shows "Custom" (none lit, nothing snapped) when the element's own values match none.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ChoiceField } from '@/components/kit/segmented-field';
import { Button } from '@/components/ui/button';
import { firstSize, ladderOf } from '../design-model';
import { LadderEditor, NumberInput, ValueControl, type Ctx } from '../design-controls';
import type { Json } from '../look-types';
import { Chips } from './ui';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);

export const STEPS = [['small', 0.7, 'Small'], ['medium', 1, 'Medium'], ['large', 1.4, 'Large'], ['huge', 2, 'Huge']] as const;
type SizeId = (typeof STEPS)[number][0];

export function textStyleOf(el: Json): string {
  return typeof el.style === 'string' ? el.style : (['headline', 'quote'].includes(String(el.field)) ? 'display' : el.field === 'big' ? 'numeral' : el.source || ['label', 'meta', 'tag', 'unit', 'by'].includes(String(el.field)) ? 'label' : 'body');
}

function facts(ctx: Ctx) {
  const { el, cat, look, comp } = ctx;
  const style = textStyleOf(el);
  const big = style === 'display' || style === 'numeral';
  const range = (cat.sizeRange?.[style] ?? [14, 900]) as [number, number];
  const by = String(el.field ?? '');
  const max = (isObj(comp.fields) && isObj((comp.fields as Json)[by]) ? ((comp.fields as Json)[by] as Json).max : undefined) as number | undefined ?? cat.fields[by]?.max;
  const own = ((look.type as Json | undefined)?.[style] as Json | undefined)?.size;
  const base = typeof own === 'number' ? own : (firstSize(el, look) ?? (big ? 96 : 40));
  return { style, big, range, by, max, base };
}
const clampTo = (n: number, r: [number, number]) => Math.min(r[1], Math.max(r[0], Math.round(n)));
// The sizes of a named size, one per step of the ladder: each step a little smaller than the one before.
const stepsFor = (thresholds: number[], base: number, scale: number, r: [number, number]): number[][] => thresholds.map((t, i) => [t, clampTo(base * scale * (1 - 0.18 * i), r)]);

// Which named size the element's values are now (null: none, so Custom).
export function detectSize(ctx: Ctx): SizeId | null {
  const { el } = ctx;
  const f = facts(ctx);
  if (el.ladder === undefined && el.size === undefined) return f.big ? null : 'medium';
  const lad = ladderOf(el);
  if (el.size !== undefined || !lad) return null;
  const th = lad.steps.map((s) => s[0]);
  for (const [id, scale] of STEPS) {
    const want = stepsFor(th, f.base, scale, f.range);
    if (want.every((s, i) => s[1] === lad.steps[i]![1])) return id;
  }
  return null;
}

export function writeSize(ctx: Ctx, id: SizeId): string {
  const { el } = ctx;
  const f = facts(ctx);
  const scale = STEPS.find((s) => s[0] === id)![1];
  if (id === 'medium' && !f.big) return ctx.set('ladder', undefined) || ctx.set('size', undefined);
  const lad = ladderOf(el);
  const top = f.max ?? 70;
  const th = lad ? lad.steps.map((s) => s[0]) : top > 30 ? [30, top] : [top];
  const base = isObj(el.ladder) ? { ...el.ladder } : {};
  return ctx.set('size', undefined) || ctx.set('ladder', { ...base, by: f.by, steps: stepsFor(th, f.base, scale, f.range) });
}

export function SizeChips({ ctx }: { ctx: Ctx }) {
  const [error, setError] = useState('');
  const f = facts(ctx);
  return (
    <div className="flex flex-col gap-1">
      <Chips label="Size" value={detectSize(ctx)} custom disabled={ctx.disabled} onChange={(id) => setError(writeSize(ctx, id))}
        options={STEPS.map(([id, , label]) => ({ value: id, label, title: id === 'medium' && !f.big ? 'The look’s own size' : undefined }))} />
      {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

// The exact size of text: the look's own, steps by the length of the text, or (Advanced) one fixed size.
export function TextSize({ ctx }: { ctx: Ctx }) {
  const { el, cat, look } = ctx;
  const { style, big, range, by, max, base } = facts(ctx);
  const mode = el.ladder !== undefined ? 'ladder' : el.size !== undefined ? 'fixed' : 'own';
  const own = ((look.type as Json | undefined)?.[style] as Json | undefined)?.size;
  const [error, setError] = useState('');
  const change = (m: string) => {
    let why = '';
    if (m === 'ladder') {
      const size = clampTo(firstSize(el, look) ?? base, range);
      const top = max ?? 70;
      const steps = top > 30 ? [[30, size], [top, Math.max(range[0], size - 16)]] : [[top, size]];
      why = ctx.set('size', undefined) || ctx.set('ladder', { by, steps });
    } else if (m === 'fixed') why = ctx.set('ladder', undefined) || ctx.set('size', clampTo(firstSize(el, look) ?? base, range));
    else why = ctx.set('ladder', undefined) || ctx.set('size', undefined);
    setError(why);
  };
  const opts = [...(big ? [] : [{ value: 'own', label: `The look's own${typeof own === 'number' ? ` (${own} px)` : ''}` }]), { value: 'ladder', label: 'Steps by the length of the text' }, ...(ctx.advanced || mode === 'fixed' ? [{ value: 'fixed', label: 'One fixed size' }] : [])];
  return (
    <>
      <div className="col-span-2"><ValueControl name="style" desc={cat.elements.text!.properties.style!} value={el.style} ctx={ctx} optional onChange={(v) => ctx.set('style', v)} /></div>
      <div className="col-span-2"><ChoiceField label="Size" value={mode} options={opts} disabled={ctx.disabled} error={error || undefined} hint={big ? 'Headlines and figures need steps (or a fixed size under Advanced).' : 'Body, list and label text keep the look’s sizes so the design stays in step with it.'} onValueChange={change} /></div>
      {mode === 'ladder' && <div className="col-span-2"><LadderEditor ctx={ctx} el={el} fieldMax={max} range={range} disabled={ctx.disabled} /></div>}
      {mode === 'fixed' && <NumberInput label="Size in pixels" value={el.size} desc={{ kind: 'number', int: true, min: range[0], max: range[1] }} disabled={ctx.disabled} onChange={(v) => (v === undefined ? 'Enter a number' : ctx.set('size', v))} />}
    </>
  );
}

export function StickerSize({ ctx }: { ctx: Ctx }) {
  const { el, cat, comp } = ctx;
  const by = String(el.field ?? '');
  const max = (isObj(comp.fields) && isObj((comp.fields as Json)[by]) ? ((comp.fields as Json)[by] as Json).max : undefined) as number | undefined ?? cat.fields[by]?.max;
  const range = (cat.sizeRange?.display ?? [24, 300]) as [number, number];
  if (el.field === undefined) return null;
  if (el.ladder !== undefined) {
    return (
      <div className="col-span-2 flex flex-col gap-2">
        <LadderEditor ctx={ctx} el={el} fieldMax={max} range={range} disabled={ctx.disabled} />
        <div><Button type="button" size="sm" variant="ghost" disabled={ctx.disabled} onClick={() => ctx.set('ladder', undefined)}>Use one size instead</Button></div>
      </div>
    );
  }
  return (
    <>
      {el.fit === undefined && <NumberInput label="Text size in pixels" value={el.textSize} optional desc={{ kind: 'number', int: true, min: 14, max: 400 }} disabled={ctx.disabled} onChange={(v) => ctx.set('textSize', v)} />}
      {el.fit === undefined && el.textSize === undefined && <div className="col-span-2"><Button type="button" size="sm" variant="outline" disabled={ctx.disabled} onClick={() => ctx.set('ladder', { by, steps: [[Math.min(6, max ?? 6), 80], [max ?? 16, 56]].filter((s, i, a) => i === 0 || s[0]! > a[i - 1]![0]!) })}><Plus aria-hidden="true" /> Size by length</Button></div>}
    </>
  );
}
