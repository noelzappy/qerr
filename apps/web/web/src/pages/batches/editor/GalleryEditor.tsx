// A post's row of round pictures: 2 to 5 pictures from the Pictures page (the same picker as the post's own picture), each with an optional
// name under it. Compact: one line per picture, its picker and its name side by side. A picture is named by its file path and vault id, as
// the post's own picture is; the server checks, copies and rights-checks each one the same way.
import { Plus, X } from 'lucide-react';
import { TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { PicturePicker, type PictureValue } from './PicturePicker';

export interface GalleryPicture { image?: string; vaultItemId?: string; caption?: string }
const parse = (value: unknown): GalleryPicture[] => (Array.isArray(value) ? value.filter((p): p is GalleryPicture => !!p && typeof p === 'object') : []);
const clean = (p: GalleryPicture): GalleryPicture => ({ ...(p.image ? { image: p.image } : {}), ...(p.vaultItemId ? { vaultItemId: p.vaultItemId } : {}), ...(p.caption?.trim() ? { caption: p.caption } : {}) });

export function GalleryEditor({ value, onChange, min, max, maxChars, disabled }: {
  value: unknown; onChange: (next: GalleryPicture[] | undefined) => void; min: number; max: number; maxChars: number; disabled?: boolean;
}) {
  const rows = parse(value);
  // a row without a picture is kept while it is being filled in; the post stores only what it has
  const emit = (next: GalleryPicture[]) => onChange(next.length ? next.map(clean) : undefined);
  const setPicture = (i: number, v: PictureValue) => emit(rows.map((r, j) => (j === i ? { ...r, image: v.image, vaultItemId: v.vaultItemId } : r)));
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Round pictures <span className="font-normal text-muted-foreground">({min} to {max}, each with an optional name)</span></legend>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-md border p-2 md:grid-cols-[1fr_12rem_auto]">
          <PicturePicker label={`Picture ${i + 1}`} value={{ image: r.image, vaultItemId: r.vaultItemId }} disabled={disabled} onChange={(v) => setPicture(i, v)} />
          <TextField label={<span className="text-[13px]">Name</span>} value={r.caption ?? ''} maxLength={maxChars} placeholder="Optional"
            onChange={(e) => emit(rows.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove picture ${i + 1}`} className="max-sm:size-11" onClick={() => emit(rows.filter((_, j) => j !== i))}><X aria-hidden="true" /></Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" disabled={rows.length >= max} onClick={() => onChange([...rows.map(clean), {}])}>
          <Plus aria-hidden="true" /> Add a picture
        </Button>
      </div>
    </fieldset>
  );
}
