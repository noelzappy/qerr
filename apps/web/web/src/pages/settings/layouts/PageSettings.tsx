// The settings of the whole layout, shown in the editor's right-hand region when no block is selected: its name, id and
// description, the kind of page, the page colour, the texture and the grid and margins of the size being edited.
import { FieldGroup, SelectField, TextAreaField, TextField } from '@/components/kit';
import { GridEditor, GroundEditor } from '../layout-controls';
import { pageKind } from '../layout-model';
import type { Catalogue, Layout } from '../layout-types';
import { PAGE_LABEL } from './words';

const word = (v: string) => v.replace(/-/g, ' ');

export function PageSettings({ layout, catalogue, size, onChange, onName, onId, onPage }: {
  layout: Layout; catalogue: Catalogue; size: string;
  onChange: (l: Layout) => void; onName: (name: string) => void; onId: (id: string) => void; onPage: (to: string) => void;
}) {
  const built = pageKind(layout) !== 'grid';
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <FieldGroup legend="This layout">
        <TextField label="Name" value={layout.name ?? ''} maxLength={catalogue.layout.name.max} onChange={(e) => onName(e.target.value)} />
        <TextField label="Id" mono hint="Used in links and by the AI; lowercase letters, digits and -" value={layout.id ?? ''} maxLength={catalogue.layout.id.max} onChange={(e) => onId(e.target.value)} />
        <TextAreaField label="What it is for" optional rows={2} maxLength={catalogue.layout.description.max} hint="For your team and the AI: when to use this layout."
          value={layout.description ?? ''} onChange={(e) => { const { description: _d, ...rest } = layout; onChange(e.target.value ? { ...layout, description: e.target.value } : rest as Layout); }} />
      </FieldGroup>
      <FieldGroup legend="Page">
        <SelectField label="Kind of page" value={pageKind(layout)} onValueChange={onPage} options={Object.keys(catalogue.pages).map((p) => ({ value: p, label: PAGE_LABEL[p] ?? p }))}
          hint={built ? 'Made with the built-in look; blocks sit at pixel rectangles on the feed page and the page places its own logo and footer.' : 'Blocks in grid cells (or pixels), at the sizes you choose.'} />
        <SelectField label="Second half of the headline" value={layout.accent ?? 'series'} onValueChange={(v) => onChange({ ...layout, accent: v })}
          options={catalogue.layout.accents.map((a) => ({ value: a, label: a === 'series' ? "The brand's style" : word(a) }))} />
        <SelectField label="Texture" value={layout.texture ?? 'auto'} onValueChange={(v) => onChange({ ...layout, texture: v })} options={catalogue.textures.map((t) => ({ value: t, label: t === 'auto' ? "The brand's style" : word(t) }))} />
      </FieldGroup>
      <GroundEditor layout={layout} catalogue={catalogue} onChange={onChange} />
      {layout.canvas[size] && <GridEditor layout={layout} size={size} catalogue={catalogue} onChange={onChange} />}
    </div>
  );
}
