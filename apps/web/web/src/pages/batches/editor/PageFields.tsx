// The form for one design, or for one page of a carousel: the layout, then the fields that layout takes. Fields the form
// does not show stay untouched in the object and can be edited in the advanced JSON.
import { SelectField, TextAreaField, TextField } from '@/components/kit';
import { ArtefactEditor, LedgerFields, PassbookFields } from './ArtefactEditor';
import { HeadlineField } from './HeadlineField';
import { ImageOptions } from './ImageOptions';
import { LayoutChooser } from './LayoutChooser';
import { ListEditor } from './ListEditor';
import { PicturePicker } from './PicturePicker';
import { StatsEditor } from './StatsEditor';
import { FIELD_LABEL, TEMPLATE_FIELDS, type FieldSpec, type Json, type LayoutBrief } from './types';

const LAYOUT = 'layout:';
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export interface SeriesOption { key: string; name: string }

interface Props {
  design: Json;
  onChange: (next: Json) => void;
  brandLayouts: LayoutBrief[];
  series: SeriesOption[];
  disabled?: boolean;
  // A page of a carousel: it may not be a carousel itself, and its post type and top label are optional.
  inCarousel?: boolean;
  // Only the layout, the post type and the top label: the frame of a whole carousel.
  frameOnly?: boolean;
}

export function PageFields({ design, onChange, brandLayouts, series, disabled, inCarousel, frameOnly }: Props) {
  const d = design;
  const chosen = d.template === 'layout' ? `${LAYOUT}${text(d.layout)}` : text(d.template);
  const ownLayout = d.template === 'layout' ? brandLayouts.find((l) => l.id === d.layout) ?? null : null;

  function setField(key: string, value: unknown) {
    const next: Json = { ...d };
    if (value === '' || value === undefined || value === null || (Array.isArray(value) && value.length === 0)) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  function choose(v: string) {
    if (!v.startsWith(LAYOUT)) { const { layout: _drop, ...rest } = d; onChange({ ...rest, template: v }); return; }
    onChange({ ...d, template: 'layout', layout: v.slice(LAYOUT.length) });
  }

  function setPicture(next: { image?: string; vaultItemId?: string }) {
    const out: Json = { ...d };
    delete out.image;
    delete out.vaultItemId;
    if (next.image) out.image = next.image;
    if (next.vaultItemId) out.vaultItemId = next.vaultItemId;
    onChange(out);
  }

  function builtIn(f: FieldSpec) {
    const label = f.label ?? FIELD_LABEL[f.name] ?? f.name;
    switch (f.kind) {
      case 'headline':
        return <HeadlineField key={f.name} label={label} required={f.required} value={text(d[f.name])} disabled={disabled} maxLength={f.max} onChange={(v) => setField(f.name, v)} />;
      case 'text':
        return <TextAreaField key={f.name} label={label} optional={!f.required} rows={2} maxLength={f.max} hint={f.hint} value={text(d[f.name])} disabled={disabled} onChange={(e) => setField(f.name, e.target.value)} />;
      case 'short':
        return <TextField key={f.name} label={label} optional={!f.required} maxLength={f.max} hint={f.hint} value={text(d[f.name])} disabled={disabled} onChange={(e) => setField(f.name, e.target.value)} />;
      case 'stats':
        return <StatsEditor key={f.name} value={d.stats} disabled={disabled} onChange={(v) => setField('stats', v)} />;
      case 'pills':
        return <ListEditor key={f.name} label="Pills" addLabel="Add a pill" max={4} maxChars={28} value={d.pills} disabled={disabled} onChange={(v) => setField('pills', v)} />;
      case 'checks':
        return <ListEditor key={f.name} label="Tick list" addLabel="Add a tick" max={4} maxChars={48} value={d.checks} disabled={disabled} onChange={(v) => setField('checks', v)} />;
      case 'artefact':
        return <ArtefactEditor key={f.name} value={d.artefact} disabled={disabled} onChange={(v) => setField('artefact', v)} />;
      case 'table':
        return <LedgerFields key={f.name} value={d} disabled={disabled} onChange={onChange} />;
      case 'passbook':
        return <PassbookFields key={f.name} value={d} disabled={disabled} onChange={onChange} />;
      case 'picture':
        return <PicturePicker key={f.name} required={f.required} value={{ image: text(d.image) || undefined, vaultItemId: text(d.vaultItemId) || undefined }} disabled={disabled} onChange={setPicture} />;
    }
  }

  function brand(f: LayoutBrief['fields'][number]) {
    const label = FIELD_LABEL[f.name] ?? f.name;
    const hint = `${f.word}${f.max && f.kind !== 'stats' && f.kind !== 'items' ? `, up to ${f.max} characters` : ''}`;
    switch (f.kind) {
      case 'image':
        return <PicturePicker key={f.name} required={f.required} value={{ image: text(d.image) || undefined, vaultItemId: text(d.vaultItemId) || undefined }} disabled={disabled} onChange={setPicture} />;
      case 'artefact':
        return <ArtefactEditor key={f.name} value={d.artefact} disabled={disabled} onChange={(v) => setField('artefact', v)} />;
      case 'stats':
        return <StatsEditor key={f.name} value={d[f.name]} max={f.max ?? 3} disabled={disabled} onChange={(v) => setField(f.name, v)} />;
      case 'items':
        return <ListEditor key={f.name} label={label} addLabel="Add a point" max={f.max ?? 4} maxChars={48} hint={f.word} value={d[f.name]} disabled={disabled} onChange={(v) => setField(f.name, v)} />;
      default:
        if (f.name === 'headline') return <HeadlineField key={f.name} label={label} required={f.required} value={text(d.headline)} disabled={disabled} maxLength={f.max ?? undefined} onChange={(v) => setField('headline', v)} />;
        return f.kind === 'text'
          ? <TextAreaField key={f.name} label={label} optional={!f.required} rows={2} maxLength={f.max ?? undefined} disabled={disabled} hint={hint} value={text(d[f.name])} onChange={(e) => setField(f.name, e.target.value)} />
          : <TextField key={f.name} label={label} optional={!f.required} maxLength={f.max ?? undefined} disabled={disabled} hint={hint} value={text(d[f.name])} onChange={(e) => setField(f.name, e.target.value)} />;
    }
  }

  const specs = !frameOnly && d.template !== 'layout' ? TEMPLATE_FIELDS[text(d.template)] : undefined;
  const typeHint = inCarousel ? "Uses the carousel's when empty." : undefined;
  const labelHint = inCarousel ? "Small text at the top of the image, up to 40 characters. Uses the carousel's when empty." : 'Small text at the top of the image, up to 40 characters.';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <LayoutChooser value={chosen} onChange={choose} brandLayouts={brandLayouts} disabled={disabled} allowCarousel={!inCarousel} />
      {!frameOnly && ownLayout?.description && <p className="text-[13px] text-muted-foreground">{ownLayout.description}</p>}
      {!frameOnly && ownLayout && ownLayout.fields.map(brand)}
      {specs?.map(builtIn)}
      {!frameOnly && <ImageOptions design={d} onChange={onChange} brandLayouts={brandLayouts} disabled={disabled} />}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <SelectField
          label="Post type" optional value={text(d.series)} disabled={disabled} hint={typeHint}
          onValueChange={(v) => setField('series', v)}
          options={[{ value: '', label: 'No post type' }, ...series.map((s) => ({ value: s.key, label: s.name }))]}
        />
        <TextField label="Top label" optional maxLength={40} value={text(d.label)} disabled={disabled} hint={labelHint} onChange={(e) => setField('label', e.target.value)} />
      </div>
    </div>
  );
}
