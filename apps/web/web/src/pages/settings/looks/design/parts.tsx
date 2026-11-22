// Choices first for the pieces that hold words in pills, icons, info rows, buttons and round pictures: a row of chips each for the decision a
// person makes (pills or not and their shape, icons on or off, the button's shape and icon, how the info rows sit, how big the pictures are),
// with every exact value still behind the group's "Fine-tune". The chips write catalogue values only; the model says why one is refused.
import { useState, type ReactNode } from 'react';
import type { Json } from '../design-model';
import type { Ctx } from '../design-controls';
import { Chips, Label, ToggleChip } from './ui';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const PILL_WORDS: Record<string, string> = { pill: 'Round', soft: 'Soft', outline: 'Outline' };
// the few icons offered as chips on a button; the rest are under Fine-tune
const BUTTON_ICONS: Array<[string, string]> = [['none', 'None'], ['arrow-right', '→'], ['arrow-up-right', '↗'], ['check', '✓'], ['calendar', 'Date'], ['ticket', 'Ticket']];
const ROW_SIZES: Array<[number, string]> = [[140, 'Small'], [200, 'Medium'], [280, 'Large']];

// Whether this element has choices of its own here.
export const hasPartChoices = (el: Json): boolean => (el.type === 'text' && el.field === 'headline' && (el.part === undefined || el.part === 'all')) || ['button', 'info-rows', 'photo-row'].includes(String(el.type));

export function PartChoices({ ctx }: { ctx: Ctx }) {
  const el = ctx.el, type = String(el.type);
  const [error, setError] = useState('');
  const set = (name: string, value: unknown) => setError(ctx.set(name, value));
  const row = (label: string, hint: string, chips: ReactNode) => (
    <div className="flex flex-col gap-1"><Label hint={hint}>{label}</Label>{chips}</div>
  );
  let body: ReactNode = null;
  if (type === 'text') {
    const pills = isObj(el.pills) ? el.pills : null, shape = pills ? String(pills.shape ?? 'pill') : 'off';
    const choose = (v: string) => set('pills', v === 'off' ? undefined : v === 'outline' ? { shape: 'outline', ink: 'ink' } : { shape: v, fill: typeof pills?.fill === 'string' ? pills.fill : 'accent', ink: typeof pills?.fill === 'string' && typeof pills.ink === 'string' ? pills.ink : 'on-accent' });
    body = (
      <>
        {row('Words in pills', 'A post marks one or two runs of words as [[words]]; they are set in a pill here, and plainly where this is off.',
          <Chips label="Words in pills" value={shape} disabled={ctx.disabled} onChange={choose}
            options={[{ value: 'off', label: 'Off' }, ...Object.entries(PILL_WORDS).map(([v, l]) => ({ value: v, label: l }))]} />)}
        {row('Icons', 'A post places up to two icons as {{name}}, from the engine\'s own set; they are left out where this is off.',
          <div className="flex flex-wrap gap-1.5"><ToggleChip on={isObj(el.icons)} disabled={ctx.disabled} onClick={() => set('icons', isObj(el.icons) ? undefined : {})}>Show icons</ToggleChip></div>)}
      </>
    );
  } else if (type === 'button') {
    body = (
      <>
        {row('Button', 'The shape of the button.', <Chips label="Button shape" value={String(el.shape ?? 'pill')} disabled={ctx.disabled} onChange={(v) => set('shape', v)}
          options={[{ value: 'pill', label: 'Pill' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }]} />)}
        {row('Icon', 'An icon after the words; more under Fine-tune.', <Chips label="Button icon" value={String(el.icon ?? 'none')} custom disabled={ctx.disabled} onChange={(v) => set('icon', v === 'none' ? undefined : v)}
          options={BUTTON_ICONS.map(([v, l]) => ({ value: v, label: l, title: v }))} />)}
        {row('Width', 'As wide as its words, or the whole width of its place.', <Chips label="Button width" value={String(el.width ?? 'hug')} disabled={ctx.disabled} onChange={(v) => set('width', v === 'hug' ? undefined : v)}
          options={[{ value: 'hug', label: 'Fits the words' }, { value: 'full', label: 'Full width' }]} />)}
      </>
    );
  } else if (type === 'info-rows') {
    body = row('Rows', 'The label beside its words, or above them.', <Chips label="Info rows" value={String(el.layout ?? 'beside')} disabled={ctx.disabled} onChange={(v) => set('layout', v === 'beside' ? undefined : v)}
      options={[{ value: 'beside', label: 'Label beside' }, { value: 'stacked', label: 'Label above' }]} />);
  } else if (type === 'photo-row') {
    const size = typeof el.size === 'number' ? el.size : 200, named = ROW_SIZES.find(([n]) => n === size);
    body = (
      <>
        {row('Pictures', 'The most each circle is across; it is smaller when the row needs the room.', <Chips label="Picture size" value={named ? String(named[0]) : null} custom disabled={ctx.disabled} onChange={(v) => set('size', Number(v))}
          options={ROW_SIZES.map(([n, l]) => ({ value: String(n), label: l, title: `${n} px` }))} />)}
        <div className="flex flex-wrap gap-1.5"><ToggleChip on={el.captions === true} disabled={ctx.disabled} onClick={() => set('captions', el.captions === true ? undefined : true)}>Names under them</ToggleChip></div>
      </>
    );
  }
  if (!body) return null;
  return <div className="flex flex-col gap-2">{body}{error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}</div>;
}
