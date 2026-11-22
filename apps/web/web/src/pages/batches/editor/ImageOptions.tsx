// "Image options": the optional look settings of a design or carousel page that most people never need, shown only for the layouts
// whose design accepts them (packages/engine/lib/design/spec.mjs: checkFrame, checkWindow, checkOptions, checkScreen). A setting that
// is not chosen is not written, so the layout decides. The server and the preview stay the authority on what is valid; a value the
// form cannot show (a focal point set per size, say) is left as it is and named as something for Advanced.
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Hint, SelectField, TextField } from '@/components/kit';
import { ChoiceRow } from './ChoiceRow';
import { sizesOf } from './focal-frame';
import { imageOptionsSupport } from './image-options-support';
import { PictureFocus } from './PictureFocus';
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

const word = (v: unknown) => (typeof v === 'string' ? v : '');
const isPerSize = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v) && !('x' in (v as Json));

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
        {(s.focal || s.zoom) && (
          <PictureFocus focal={d.focal} zoom={d.zoom} withFocal={s.focal} withZoom={s.zoom} vaultItemId={word(d.vaultItemId) || undefined} sizes={sizesOf(d)} disabled={disabled}
            onChange={(focal, zoom) => { const next: Json = { ...d }; for (const [k, v] of [['focal', focal], ['zoom', zoom]] as const) { if (v === undefined) delete next[k]; else next[k] = v; } onChange(next); }} />
        )}
        {(s.frame || s.photo || s.screen || s.glow) && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {s.frame && (
              <SelectField label="Page colour" value={word(d.ground)} disabled={disabled} onValueChange={(v) => setField('ground', v)}
                options={[{ value: '', label: 'As the kind of post says' }, ...GROUNDS, ...known(GROUNDS, d.ground)]} />
            )}
            {s.frame && (
              <SelectField label="Second half of the headline" hint="The words set in the second colour." value={word(d.accent)} disabled={disabled} onValueChange={(v) => setField('accent', v)}
                options={[{ value: '', label: 'As the kind of post says' }, ...ACCENTS, ...known(ACCENTS, d.accent)]} />
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
