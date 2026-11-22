// A post's one portrait picture (avatar): the person a quote is by, or an event's speaker. One picture from the Pictures page (the same
// picker as the post's own picture) and the point of it the round crop keeps. The look's design decides its shape, size and ring. The
// server checks, copies and rights-checks it like every picture: a picture that shows people needs their consent recorded.
import { PicturePicker, type PictureValue } from './PicturePicker';
import { PictureFocus } from './PictureFocus';

export interface AvatarPicture { image?: string; vaultItemId?: string; focal?: string }
const parse = (value: unknown): AvatarPicture => (value && typeof value === 'object' && !Array.isArray(value) ? (value as AvatarPicture) : {});
const clean = (p: AvatarPicture): AvatarPicture | undefined => (p.image ? { image: p.image, ...(p.vaultItemId ? { vaultItemId: p.vaultItemId } : {}), ...(p.focal ? { focal: p.focal } : {}) } : undefined);

export function AvatarEditor({ value, onChange, disabled }: { value: unknown; onChange: (next: AvatarPicture | undefined) => void; disabled?: boolean }) {
  const a = parse(value);
  const setPicture = (v: PictureValue) => onChange(clean({ ...a, image: v.image, vaultItemId: v.vaultItemId }));
  return (
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">Portrait picture <span className="font-normal text-muted-foreground">(optional: the person quoted, cropped round)</span></legend>
      <PicturePicker label="Portrait" value={{ image: a.image, vaultItemId: a.vaultItemId }} disabled={disabled} onChange={setPicture} />
      {a.image && <PictureFocus focal={a.focal} zoom={undefined} withZoom={false} vaultItemId={a.vaultItemId} disabled={disabled} onChange={(focal) => onChange(clean({ ...a, focal }))} />}
    </fieldset>
  );
}
