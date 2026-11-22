// Choices first for the pieces that hold words in pills, icons, info rows, buttons, round pictures, charts, a portrait picture and a device: a row of
// chips each for the decision a person makes (pills or not and their shape, icons on or off, the button's shape and icon, how the info rows sit, how
// big the pictures are, the portrait's shape, size and ring, the device, its finish, camera and lean),
// with every exact value still behind the group's "Fine-tune". The chips write catalogue values only; the model says why one is refused.
import { useState, type ReactNode } from 'react';
import type { Json } from '../design-model';
import type { Ctx } from '../design-controls';
import { Chips, Label, ToggleChip } from './ui';
import { CHART_ROUNDING, CHART_WORDS, LINE_KINDS, chartKindPatch } from './chart-choices';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const PILL_WORDS: Record<string, string> = { pill: 'Round', soft: 'Soft', outline: 'Outline' };
// the few icons offered as chips on a button; the rest are under Fine-tune
const BUTTON_ICONS: Array<[string, string]> = [['none', 'None'], ['arrow-right', '→'], ['arrow-up-right', '↗'], ['check', '✓'], ['calendar', 'Date'], ['ticket', 'Ticket']];
const ROW_SIZES: Array<[number, string]> = [[140, 'Small'], [200, 'Medium'], [280, 'Large']];
const AVATAR_SIZES: Array<[number, string]> = [[96, 'Small'], [128, 'Medium'], [180, 'Large']];
// the device's lean: straight, or a little either way (the exact degrees, up to 6, under Fine-tune)
const LEANS: Array<[number, string]> = [[-4, 'Lean left'], [0, 'Straight'], [4, 'Lean right']];

// Whether this element has choices of its own here.
export const hasPartChoices = (el: Json): boolean => (el.type === 'text' && el.field === 'headline' && (el.part === undefined || el.part === 'all'))
  || (el.type === 'fitted-stack' && ['headline', 'quote'].includes(String(el.field ?? 'headline')) && el.mode !== 'fill') || ['button', 'info-rows', 'photo-row', 'chart', 'avatar', 'device'].includes(String(el.type));

// A decorative swash against one word of the headline: the shape and the word as chips; its colour, weight and whether it may cross the
// headline's other words are under Fine-tune (the catalogue's swash). The page refuses a swash that runs into other text.
const SWASH_WORDS: Record<string, string> = { underline: 'Underline', swoosh: 'Swoosh', tail: 'Tail', loop: 'Loop' };
function SwashChoices({ el, disabled, set }: { el: Json; disabled: boolean; set: (name: string, value: unknown) => void }) {
  const swash = isObj(el.swash) ? el.swash : null, shape = swash ? String(swash.shape) : 'off';
  const word = swash ? (typeof swash.word === 'number' ? null : String(swash.word ?? 'last')) : 'last';
  return (
    <>
      <div className="flex flex-col gap-1"><Label hint="A drawn flourish against one word of the headline, in a brand colour: an underline, a swoosh, a tail from the last letter or a loop from the first. It never covers other text; the image is checked.">Swash</Label>
        <Chips label="Swash" value={shape} disabled={disabled} onChange={(v) => set('swash', v === 'off' ? undefined : { ...(swash ?? { colour: 'accent' }), shape: v })}
          options={[{ value: 'off', label: 'Off' }, ...Object.entries(SWASH_WORDS).map(([v, l]) => ({ value: v, label: l }))]} /></div>
      {swash && <div className="flex flex-col gap-1"><Label hint="Which word it is drawn against. The last word suits a tail or a swoosh; the first a loop.">Against</Label>
        <Chips label="Swash word" value={word} custom disabled={disabled} onChange={(v) => set('swash', { ...swash, word: v })}
          options={[{ value: 'first', label: 'First word' }, { value: 'last', label: 'Last word' }, { value: 'phrase', label: 'Emphasis' }]} /></div>}
    </>
  );
}

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
        <SwashChoices el={el} disabled={ctx.disabled} set={set} />
      </>
    );
  } else if (type === 'fitted-stack') {
    body = <SwashChoices el={el} disabled={ctx.disabled} set={set} />;
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
  } else if (type === 'chart') {
    const kinds = Array.isArray(el.kinds) ? (el.kinds as string[]) : ['bar'], first = kinds[0] ?? 'bar', line = kinds.every((k) => LINE_KINDS.includes(k));
    const radius = typeof el.radius === 'number' ? el.radius : 0, named = CHART_ROUNDING.find(([n]) => n === radius);
    const setMany = (patch: Record<string, unknown>) => { for (const [k, v] of Object.entries(patch)) { const e = ctx.set(k, v); if (e) { setError(e); return; } } setError(''); };
    body = (
      <>
        {row('Chart', kinds.length > 1 ? `This design draws ${kinds.map((k) => CHART_WORDS[k] ?? k).join(', ')}; a post may name one. Choosing here keeps one.` : 'What the post\'s numbers are drawn as. A post may bring 2 to 12 points, or one value out of a total for a donut or progress bar.',
          <Chips label="Chart kind" value={kinds.length === 1 ? first : null} custom disabled={ctx.disabled} onChange={(v) => setMany(chartKindPatch(el, v))}
            options={Object.entries(CHART_WORDS).map(([v, l]) => ({ value: v, label: l }))} />)}
        {row('Axis', 'Nothing behind the marks, a baseline, or a light grid at round values.', <Chips label="Chart axis" value={String(el.axis ?? 'baseline')} disabled={ctx.disabled} onChange={(v) => set('axis', v)}
          options={[{ value: 'none', label: 'None' }, { value: 'baseline', label: 'Baseline' }, { value: 'grid', label: 'Light grid' }]} />)}
        {row('Corners', 'How round the ends of the bars are.', <Chips label="Chart corners" value={named ? String(named[0]) : null} custom disabled={ctx.disabled} onChange={(v) => set('radius', Number(v) || undefined)}
          options={CHART_ROUNDING.map(([n, l]) => ({ value: String(n), label: l, title: `${n} px` }))} />)}
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip on={el.values !== false} disabled={ctx.disabled} onClick={() => set('values', el.values === false ? undefined : false)}>Values</ToggleChip>
          <ToggleChip on={el.labels !== false} disabled={ctx.disabled} onClick={() => set('labels', el.labels === false ? undefined : false)}>Labels</ToggleChip>
          {line && <ToggleChip on={el.trim === true} disabled={ctx.disabled} onClick={() => set('trim', el.trim === true ? undefined : true)}>Start the axis near the data</ToggleChip>}
        </div>
        <p className="text-[12.5px] text-muted-foreground">Bars always start at zero. Colours, dots, the line width and the type sizes are under Fine-tune; the labels are checked for fit and contrast like any words.</p>
      </>
    );
  } else if (type === 'avatar') {
    const size = typeof el.size === 'number' ? el.size : 120, named = AVATAR_SIZES.find(([n]) => n === size);
    const ring = isObj(el.ring) ? el.ring : null;
    body = (
      <>
        {row('Shape', 'How the portrait is cropped.', <Chips label="Portrait shape" value={String(el.shape ?? 'circle')} disabled={ctx.disabled} onChange={(v) => set('shape', v)}
          options={[{ value: 'circle', label: 'Round' }, { value: 'rounded', label: 'Rounded' }, { value: 'square', label: 'Square' }]} />)}
        {row('Size', 'Its width and height; the exact pixels under Fine-tune.', <Chips label="Portrait size" value={named ? String(named[0]) : null} custom disabled={ctx.disabled} onChange={(v) => setError(ctx.set('size', Number(v)))}
          options={AVATAR_SIZES.map(([n, l]) => ({ value: String(n), label: l, title: `${n} px` }))} />)}
        <div className="flex flex-wrap gap-1.5"><ToggleChip on={!!ring} disabled={ctx.disabled} onClick={() => set('ring', ring ? undefined : { w: 6, colour: 'field' })}>Ring in the brand colour</ToggleChip></div>
      </>
    );
  } else if (type === 'device') {
    const tablet = el.model === 'tablet', tilt = typeof el.tilt === 'number' ? el.tilt : 0, lean = LEANS.find(([n]) => n === tilt);
    body = (
      <>
        {row('Device', 'A phone or a tablet drawn round the post\'s picture, a bare screenshot of the app. A capture with the phone already drawn is shown as it is.',
          <Chips label="Device" value={tablet ? 'tablet' : 'phone'} disabled={ctx.disabled} onChange={(v) => setError((v === 'tablet' ? ctx.set('cutout', undefined) : '') || ctx.set('model', v === 'phone' ? undefined : v))}
            options={[{ value: 'phone', label: 'Phone' }, { value: 'tablet', label: 'Tablet' }]} />)}
        {row('Finish', 'The colour of the body.', <Chips label="Device finish" value={String(el.finish ?? 'dark')} disabled={ctx.disabled} onChange={(v) => set('finish', v)}
          options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Silver' }, { value: 'brand', label: 'Brand colour' }]} />)}
        {!tablet && row('Camera', 'An island in the screen, a notch at its top, or none.', <Chips label="Device camera" value={String(el.cutout ?? 'island')} disabled={ctx.disabled} onChange={(v) => set('cutout', v)}
          options={[{ value: 'island', label: 'Island' }, { value: 'notch', label: 'Notch' }, { value: 'none', label: 'None' }]} />)}
        {row('Lean', 'Turns the device a little (the look\'s tilt dial scales it).', <Chips label="Device lean" value={lean ? String(lean[0]) : null} custom disabled={ctx.disabled} onChange={(v) => set('tilt', Number(v) || undefined)}
          options={LEANS.map(([n, l]) => ({ value: String(n), label: l, title: `${n} degrees` }))} />)}
        <div className="flex flex-wrap gap-1.5">
          <ToggleChip on={el.buttons !== false} disabled={ctx.disabled} onClick={() => set('buttons', el.buttons === false ? undefined : false)}>Side buttons</ToggleChip>
          <ToggleChip on={el.shadow === 'soft' || el.shadow === 'lift'} disabled={ctx.disabled} onClick={() => set('shadow', el.shadow ? undefined : 'soft')}>Soft shadow</ToggleChip>
        </div>
      </>
    );
  }
  if (!body) return null;
  return <div className="flex flex-col gap-2">{body}{error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}</div>;
}
