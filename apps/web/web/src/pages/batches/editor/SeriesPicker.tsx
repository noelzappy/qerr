// "Series": put a post in one of the brand's named series (Settings, Looks, Series) with its number. Choosing one sets the post's kind, its
// design (when the series chose some) and writes the mark ("Tip #12") into the label or tag; the number may be changed; None takes the post
// out of the series and its mark off. The server keeps the link; the words are the design's own.
import { Link } from 'react-router-dom';
import { SelectField, TextField } from '@/components/kit';
import { api } from '../../../api';
import { useLoad } from '../../../hooks';
import type { PostKindInfo } from '../design-model';
import { applySeries, removeSeries, seriesSummary, type SeriesInfo, type SeriesRef } from './series-model';
import type { Json } from './types';

export function SeriesPicker({ value, onChange, design, onDesign, kinds, disabled }: {
  value: SeriesRef | null;
  onChange: (next: SeriesRef | null) => void;
  design: Json | null;
  onDesign: (next: Json | null) => void;
  kinds?: PostKindInfo[];
  disabled?: boolean;
}) {
  const list = useLoad(() => api.get<{ series: SeriesInfo[] }>('/api/series').catch(() => ({ series: [] as SeriesInfo[] })), []);
  const all = list.data?.series ?? [];
  const current = value ? all.find((s) => s.id === value.id) : undefined;
  // a series that is switched off can still be kept on a post that has it, but is not offered to others
  const offered = all.filter((s) => s.enabled || s.id === value?.id);
  if (!list.data || (!offered.length && !value)) {
    return list.data ? <p className="text-[13px] text-muted-foreground">This brand has no named series yet. <Link to="/settings/looks/series" className="font-medium underline underline-offset-2">Add one in Settings, Looks, Series</Link>.</p> : null;
  }
  const single = !design || design.template === 'post';

  function choose(id: string) {
    const without = removeSeries(design, current, value?.number);
    if (!id) { onChange(null); onDesign(without); return; }
    const s = all.find((x) => x.id === id);
    if (!s) return;
    onChange({ id, number: s.nextNumber });
    onDesign(applySeries(without, s, s.nextNumber, kinds));
  }
  function renumber(raw: string) {
    if (!value || !current) return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 9999) return;
    onChange({ ...value, number: n });
    onDesign(applySeries(removeSeries(design, current, value.number), current, n, kinds));
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_8rem]">
      <SelectField
        label="Series" optional value={value?.id ?? ''} disabled={disabled || (!single && !value)}
        hint={!single ? 'A series post is a single image, not a carousel.' : current ? seriesSummary(current) : 'A recurring format of the brand, such as Tip of the week.'}
        onValueChange={choose}
        options={[{ value: '', label: 'None' }, ...offered.map((s) => ({ value: s.id, label: s.name }))]}
      />
      {value && current && (
        <TextField label="Number" type="number" min={1} max={9999} inputMode="numeric" value={String(value.number)} disabled={disabled}
          hint={current.mark ? undefined : 'Kept with the post; this series shows no mark.'} onChange={(e) => renumber(e.target.value)} />
      )}
    </div>
  );
}
