// The form for a `post` design: the kind of post, then only the fields that kind uses, each with its limit shown as a counter, and
// the look (the brand's look draws each kind in its own ways). Every change goes through withField, so an empty value is removed
// and the design carries nothing a post may not have. The server and the preview stay the authority on what is valid.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Notice, SelectField, TextAreaField, TextField } from '@/components/kit';
import { cn } from '@/lib/utils';
import { POST_LIMITS, postFieldsFor, seenLength, setVariant, switchKind, withField, type PostKindInfo, type PostLimits } from '../design-model';
import { HeadlineField } from './HeadlineField';
import { FocalPicker, ZoomField } from './ImageOptions';
import { KindChooser } from './KindChooser';
import { budgetsFor } from './look-brief';
import { ListEditor } from './ListEditor';
import { InfoEditor } from './InfoEditor';
import { GalleryEditor } from './GalleryEditor';
import { ChartEditor } from './ChartEditor';
import { PicturePicker } from './PicturePicker';
import type { Json } from './types';

const text = (v: unknown) => (typeof v === 'string' ? v : '');

type TextLimit = Exclude<keyof PostLimits, 'items' | 'info' | 'gallery' | 'infoKeys' | 'icons' | 'chart'>;
const LABELS: Record<string, string> = {
  label: 'Label', headline: 'Headline', sub: 'Sub line', big: 'Big figure', unit: 'Unit', quote: 'Quotation', by: 'Said by', meta: 'Details', tag: 'Sticker text', cta: 'Button',
};
const HINTS: Record<string, string> = {
  label: 'A few words above the headline, such as Numbers or Tips.',
  headline: 'One short phrase. Select words and press Highlight to make them stand out, or Pill to set them in a pill (where the look draws pills).',
  cta: 'What to do, in a few words, such as Book a seat.',
  sub: 'A line that adds to the headline.',
  big: 'The figure itself, such as 74% or 3x.',
  unit: 'What the figure counts, such as of tasks.',
  quote: "The words themselves, without quotation marks.",
  by: 'Who said it.',
  tag: 'A sticker or badge, such as New or £8',
};
const PLACEHOLDERS: Record<string, string> = { meta: '12 Dec · 6pm · Place' };

// "12/70", in the destructive colour once over. Only what is seen counts (asterisks and line breaks do not).
function Counter({ value, max }: { value: string; max: number }) {
  const n = seenLength(value);
  return <p className={cn('text-right text-[12.5px] tabular-nums text-muted-foreground', n > max && 'font-medium text-destructive')}>{n}/{max}</p>;
}

function Counted({ value, max, children, className }: { value: string; max: number; children: ReactNode; className?: string }) {
  return <div className={cn('flex min-w-0 flex-col gap-1', className)}>{children}<Counter value={value} max={max} /></div>;
}

export function PostFields({ design, onChange, direction, kinds, limits, offered, disabled }: {
  design: Json;
  onChange: (next: Json) => void;
  // The brand's design direction: null when it has none, undefined while that is not yet known.
  direction: string | null | undefined;
  kinds?: PostKindInfo[];
  limits?: PostLimits | null;
  // The kinds the brand's look draws (null or left out: every kind).
  offered?: string[] | null;
  disabled?: boolean;
}) {
  const d = design;
  const kind = text(d.kind);
  const { fields, required } = postFieldsFor(kind, kinds);
  const kindInfo = kinds?.find((k) => k.kind === kind);
  const variants = kindInfo?.variants ?? [];
  const lim = budgetsFor(limits ?? POST_LIMITS, kindInfo, typeof d.variant === 'number' ? d.variant : undefined);
  const set = (key: string, value: unknown) => onChange(withField(d, key, value));
  const needs = (f: string) => required.includes(f);

  function setPicture(next: { image?: string; vaultItemId?: string }) {
    const out: Json = { ...d };
    delete out.image;
    delete out.vaultItemId;
    if (next.image) out.image = next.image;
    if (next.vaultItemId) out.vaultItemId = next.vaultItemId;
    onChange(out);
  }

  function short(f: TextLimit, multi = false) {
    const common = { label: LABELS[f]!, optional: !needs(f), hint: HINTS[f], placeholder: PLACEHOLDERS[f], value: text(d[f]), disabled };
    return (
      <Counted key={f} value={text(d[f])} max={lim[f]}>
        {multi
          ? <TextAreaField {...common} rows={2} onChange={(e) => set(f, e.target.value)} />
          : <TextField {...common} onChange={(e) => set(f, e.target.value)} />}
      </Counted>
    );
  }

  const field = (f: string): ReactNode => {
    switch (f) {
      case 'label': case 'big': case 'unit': case 'meta': case 'tag': case 'by':
        return short(f);
      case 'sub': case 'quote':
        return short(f, true);
      case 'headline':
        return (
          <Counted key={f} value={text(d.headline)} max={lim.headline}>
            <HeadlineField label="Headline" required={needs('headline')} hint={HINTS.headline} value={text(d.headline)} disabled={disabled} onChange={(v) => set('headline', v)} marks icons={lim.icons} />
          </Counted>
        );
      case 'items':
        return <ListEditor key={f} label="Items" addLabel="Add an item" max={lim.items.max} maxChars={lim.items.chars} value={d.items} disabled={disabled} onChange={(v) => set('items', v)} />;
      case 'cta':
        return short('cta');
      case 'info':
        return <InfoEditor key={f} value={d.info} keys={lim.infoKeys} min={lim.info.min} max={lim.info.max} maxChars={lim.info.chars} disabled={disabled} onChange={(v) => set('info', v)} />;
      case 'gallery':
        return <GalleryEditor key={f} value={d.gallery} min={lim.gallery.min} max={lim.gallery.max} maxChars={lim.gallery.chars} disabled={disabled} onChange={(v) => set('gallery', v)} />;
      case 'chart':
        return <ChartEditor key={f} value={d.chart} limits={lim.chart} required={needs('chart')} disabled={disabled} onChange={(v) => set('chart', v)} />;
      case 'image':
        return (
          <div key={f} className="flex min-w-0 flex-col gap-3">
            <PicturePicker required={needs('image')} value={{ image: text(d.image) || undefined, vaultItemId: text(d.vaultItemId) || undefined }} disabled={disabled} onChange={setPicture} />
            <FocalPicker value={d.focal} disabled={disabled} onChange={(v) => set('focal', v)} />
            <ZoomField value={d.zoom} disabled={disabled} onChange={(v) => set('zoom', v)} />
          </div>
        );
      default:
        return null;
    }
  };

  // big and unit sit side by side on wider screens.
  const body: ReactNode[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    if (f === 'big' && fields[i + 1] === 'unit') {
      body.push(<div key="big-unit" className="grid grid-cols-1 gap-3 md:grid-cols-2">{field('big')}{field('unit')}</div>);
      i++;
    } else body.push(field(f));
  }

  const variant = typeof d.variant === 'number' ? d.variant : undefined;
  const looks = variants.some((v) => v.variant === variant) || variant === undefined ? variants : [...variants, { variant: variant!, name: `Look ${variant! + 1}`, describe: '' }];
  const chosenLook = looks.find((v) => v.variant === variant);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {direction === null && (
        <Notice tone="warn" actions={<Link to="/settings/looks" className="text-sm font-medium underline underline-offset-2">Open Looks</Link>}>
          This brand has no look yet, so this post cannot be made. Choose one in Settings, Looks.
        </Notice>
      )}
      <KindChooser value={kind} offered={offered} disabled={disabled} onChange={(k) => onChange(switchKind(d, k, kinds))} />
      {body}
      {looks.length >= 2 && (
        <SelectField
          label="Look" value={variant === undefined ? '' : String(variant)} disabled={disabled}
          hint={chosenLook?.describe || 'Automatic picks a design from the post, so a batch varies.'}
          onValueChange={(v) => onChange(setVariant(d, v === '' ? undefined : Number(v)))}
          options={[{ value: '', label: 'Automatic' }, ...looks.map((v) => ({ value: String(v.variant), label: v.name }))]}
        />
      )}
    </div>
  );
}
