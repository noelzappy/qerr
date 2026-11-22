// "Image options": the optional look settings of a design or carousel page that most people never need, shown only for the layouts
// whose design accepts them (packages/engine/lib/design/spec.mjs: checkFrame, checkWindow, checkOptions, checkScreen). A setting that
// is not chosen is not written, so the layout decides. The server and the preview stay the authority on what is valid; a value the
// form cannot show (a focal point set per size, say) is left as it is and named as something for Advanced.
import { useEffect, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Hint, SelectField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ChoiceRow } from './ChoiceRow';
import { focalXY, imageOptionsSupport } from './image-options-support';
import type { Json, LayoutBrief } from './types';

const GROUNDS = [
  { value: 'light', label: 'Light' }, { value: 'soft', label: 'Soft' }, { value: 'cool', label: 'Cool' },
  { value: 'warm', label: 'Warm' }, { value: 'dark', label: 'Dark' }, { value: 'deep', label: 'Deep' },
];
const ACCENTS = [
  { value: 'muted', label: 'Softer colour' }, { value: 'colour', label: 'Brand colour' },
  { value: 'weight', label: 'Lighter weight' }, { value: 'none', label: 'Same as the rest' },
];
// The small choices are one tap each; '' leaves the setting to the layout (it is then not written).
const YES_NO = [{ value: '', label: 'Automatic' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];
const BOOL_LABEL: Record<string, string> = { framed: 'Show the screenshot without the window frame', glow: 'Glow behind the phone', fade: 'Fade the phone out at the bottom' };
const LAYOUT_DECIDES = 'Automatic leaves it to the layout.';

const focalText = (x: number, y: number) => `${Math.round(x)}% ${Math.round(y)}%`;
const word = (v: unknown) => (typeof v === 'string' ? v : '');
const isPerSize = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && !('x' in (v as Json));

export function FocalPicker({ value, onChange, disabled }: { value: unknown; onChange: (v: string | undefined) => void; disabled?: boolean }) {
  const id = useId();
  const xy = focalXY(value);
  const set = value !== undefined;
  if (set && !xy) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-medium">Picture position</span>
        <p className="text-[13px] text-muted-foreground">{isPerSize(value) ? 'This position is set for each size separately.' : 'This position is written in a way this form does not show.'} Change it in Advanced, or <button type="button" className="underline underline-offset-2" disabled={disabled} onClick={() => onChange(undefined)}>clear it</button>.</p>
      </div>
    );
  }
  const x = xy?.x ?? 50;
  const y = xy?.y ?? 50;
  const cells = [0, 50, 100];
  return (
    <div className="flex min-w-0 flex-col gap-2" role="group" aria-labelledby={`${id}-l`}>
      <span className="flex items-center gap-1"><span id={`${id}-l`} className="text-[13px] font-medium">Picture position</span><Hint about="Picture position">Which part of the picture stays in view when it is cropped.</Hint></span>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid size-20 shrink-0 grid-cols-3 gap-1 max-sm:size-32">
          {cells.flatMap((cy) => cells.map((cx) => {
            const on = set && Math.round(x) === cx && Math.round(y) === cy;
            const names = ['top', 'middle', 'bottom'];
            const cols = ['left', 'centre', 'right'];
            return (
              <button key={`${cx}-${cy}`} type="button" disabled={disabled} aria-pressed={on} aria-label={`${names[cy / 50]} ${cols[cx / 50]}`}
                onClick={() => onChange(focalText(cx, cy))}
                className={cn('rounded-sm border bg-muted outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50', on && 'border-primary bg-primary')} />
            );
          }))}
        </div>
        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-x`} className="text-[12.5px] font-normal text-muted-foreground">Across: {Math.round(x)}%</Label>
          <input id={`${id}-x`} type="range" min={0} max={100} step={1} value={x} disabled={disabled} className="w-full max-sm:h-8" onChange={(e) => onChange(focalText(Number(e.target.value), y))} />
          <Label htmlFor={`${id}-y`} className="text-[12.5px] font-normal text-muted-foreground">Down: {Math.round(y)}%</Label>
          <input id={`${id}-y`} type="range" min={0} max={100} step={1} value={y} disabled={disabled} className="w-full max-sm:h-8" onChange={(e) => onChange(focalText(x, Number(e.target.value)))} />
        </div>
      </div>
      {set && <div><Button type="button" variant="ghost" size="sm" className="max-sm:min-h-11" disabled={disabled} onClick={() => onChange(undefined)}>Use the layout's position</Button></div>}
    </div>
  );
}

export function ZoomField({ value, onChange, disabled }: { value: unknown; onChange: (v: number | undefined) => void; disabled?: boolean }) {
  const id = useId();
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1">
        <Label htmlFor={id} className="text-[13px]">Zoom: {n.toFixed(1)}x{value === undefined && <span className="font-normal text-muted-foreground"> (as the layout has it)</span>}</Label>
        <Hint about="Zoom">1 shows the whole crop. Up to 3 moves in on the picture position. A picture enlarged too far is refused when the image is made.</Hint>
      </span>
      <input id={id} type="range" min={1} max={3} step={0.1} value={n} disabled={disabled} className="w-full max-sm:h-8" onChange={(e) => { const v = Math.round(Number(e.target.value) * 10) / 10; onChange(v <= 1 ? undefined : v); }} />
    </div>
  );
}

export function ImageOptions({ design, onChange, brandLayouts, disabled }: { design: Json; onChange: (next: Json) => void; brandLayouts: LayoutBrief[]; disabled?: boolean }) {
  const d = design;
  const s = imageOptionsSupport(d, brandLayouts);
  const phone = (d.device ?? 'phone') === 'phone';
  const shown: string[] = [
    ...(s.frame ? ['ground', 'accent'] : []), ...(s.focal ? ['focal'] : []), ...(s.zoom ? ['zoom'] : []),
    ...(s.photo ? ['textAt', 'scrim'] : []), ...(s.screen ? ['device', 'framed', 'glow', 'fade', 'title'] : []), ...(s.glow ? ['glow'] : []),
  ];
  const anySet = shown.some((k) => d[k] !== undefined);
  const [open, setOpen] = useState(anySet);
  useEffect(() => { if (anySet) setOpen(true); }, [anySet]);
  if (shown.length === 0) return null;

  function setField(key: string, value: unknown) {
    const next: Json = { ...d };
    if (value === '' || value === undefined) delete next[key]; else next[key] = value;
    onChange(next);
  }
  const bool = (key: string) => (
    <ChoiceRow<string> key={key} legend={BOOL_LABEL[key] ?? key} tip={LAYOUT_DECIDES} value={d[key] === true ? 'true' : d[key] === false ? 'false' : ''} choices={YES_NO} disabled={disabled}
      onChange={(v) => setField(key, v === 'true' ? true : v === 'false' ? false : undefined)} />
  );
  // A value the choices do not have (set for each size, say) stays, shown as its own choice, and is changed in Advanced.
  const odd = (list: { value: string }[], v: unknown) => (v !== undefined && (typeof v !== 'string' || !list.some((o) => o.value === v))
    ? [{ value: typeof v === 'string' && v ? v : 'other', label: isPerSize(v) ? 'Per size' : typeof v === 'string' ? v : 'Other' }] : []);
  const choice = (key: string, legend: string, list: Array<{ value: string; label: string }>, auto: string) => {
    const options = [{ value: '', label: 'Automatic' }, ...list];
    const extra = odd(options, d[key]);
    return (
      <ChoiceRow<string> key={key} legend={legend} tip={`Automatic leaves it to the layout (${auto}).${extra.length ? ' The value now set is changed in Advanced.' : ''}`}
        value={extra[0]?.value ?? word(d[key])} choices={[...options, ...extra]} disabled={disabled}
        onChange={(v) => { if (!extra.some((o) => o.value === v)) setField(key, v); }} />
    );
  };
  const known = (list: { value: string }[], v: unknown) => (typeof v === 'string' && v && !list.some((o) => o.value === v) ? [{ value: v, label: v }] : []);

  return (
    <details className="group border-t pt-3" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />Image options
        {/* A click on the info icon must not open or close the section. */}
        <span onClick={(e) => e.preventDefault()}><Hint about="Image options">Anything not set here is left to the layout. Other settings, such as the headline size or where text and pictures start, are in Advanced.</Hint></span>
      </summary>
      <div className="mt-3 flex min-w-0 flex-col gap-3">
        {s.focal && <FocalPicker value={d.focal} disabled={disabled} onChange={(v) => setField('focal', v)} />}
        {s.zoom && <ZoomField value={d.zoom} disabled={disabled} onChange={(v) => setField('zoom', v)} />}
        {(s.frame || s.photo || s.screen || s.glow) && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {s.frame && (
              <SelectField label="Page colour" value={word(d.ground)} disabled={disabled} onValueChange={(v) => setField('ground', v)}
                options={[{ value: '', label: 'As the post type says' }, ...GROUNDS, ...known(GROUNDS, d.ground)]} />
            )}
            {s.frame && (
              <SelectField label="Second half of the headline" hint="The part of the headline in asterisks." value={word(d.accent)} disabled={disabled} onValueChange={(v) => setField('accent', v)}
                options={[{ value: '', label: 'As the post type says' }, ...ACCENTS, ...known(ACCENTS, d.accent)]} />
            )}
            {s.photo && choice('textAt', 'Where the text sits', [{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }], 'top')}
            {s.photo && choice('scrim', 'Dark fade behind the text', [{ value: 'black', label: 'On' }, { value: 'none', label: 'Off' }], 'on')}
            {s.screen && choice('device', 'Kind of screen', [{ value: 'phone', label: 'Phone' }, { value: 'desktop', label: 'Desktop' }], 'phone')}
            {s.screen && !phone && bool('framed')}
            {s.screen && !phone && (
              <TextField label="Window title" optional maxLength={40} value={word(d.title)} disabled={disabled} onChange={(e) => setField('title', e.target.value)} hint="Shown on the window's title bar." />
            )}
            {(s.glow || (s.screen && phone)) && bool('glow')}
            {s.screen && phone && bool('fade')}
          </div>
        )}
      </div>
    </details>
  );
}
