// One library picture: the large image and every field, editable. Saving, replacing the image, confirming and deleting
// all go through the vault API, so the rules there (a change makes a confirmed item unconfirmed again) apply here too.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ImageOff, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BusyButton, ConfirmAction, FieldGroup, FormPanel, Notice, SelectField, SwitchField, TagField, TextAreaField, TextField } from '@/components/kit';
import { useLoad } from '@/hooks';
import { errorMessage, fieldErrors, formProblem } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import type { VaultItem } from '../vault-types';
import { KIND_OPTIONS, LICENCE_OPTIONS } from './UploadSheet';
import { ACCEPT, fileProblem, isHttpUrl, needsRights, type Licence, type PictureKind } from './util';

interface Form { kind: PictureKind; title: string; body: string; sourceUrl: string; licence: Licence; licenceNotes: string; peoplePresent: boolean; consentRecorded: boolean; tags: string[] }

const toForm = (i: VaultItem): Form => ({
  kind: i.kind === 'screen' ? 'screen' : 'photo', title: i.title, body: i.body, sourceUrl: i.sourceUrl ?? '', licence: i.licence ?? '',
  licenceNotes: i.licenceNotes ?? '', peoplePresent: i.peoplePresent, consentRecorded: i.consentRecorded, tags: i.tags,
});

const payload = (f: Form) => ({
  kind: f.kind, title: f.title.trim(), body: f.body.trim(), sourceUrl: f.sourceUrl.trim() || null, licence: f.licence || null,
  licenceNotes: f.licenceNotes.trim() || null, peoplePresent: f.peoplePresent, consentRecorded: f.peoplePresent && f.consentRecorded, tags: f.tags,
});

function validate(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.title.trim()) e.title = 'Give the picture a title';
  else if (f.title.trim().length > 200) e.title = 'Keep the title to 200 characters or fewer';
  if (f.sourceUrl.trim() && !isHttpUrl(f.sourceUrl.trim())) e.sourceUrl = 'Enter a full address starting with http:// or https://';
  return e;
}

export function ItemSheet({ item, onClose, onChanged, onRemoved }: {
  item: VaultItem;
  onClose: () => void;
  // The saved item; `imageChanged` tells the grid its thumbnail address is out of date.
  onChanged: (item: VaultItem, imageChanged: boolean) => void;
  // Called after the delete went through; the page says so and offers the undo, since this sheet closes.
  onRemoved: (item: VaultItem) => void;
}) {
  const initial = useMemo(() => toForm(item), [item]);
  const [form, setForm] = useState<Form>(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [broken, setBroken] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  // A fresh signed address on open: the one from the grid may be minutes old.
  const [version, setVersion] = useState(0);
  const image = useLoad(() => (item.hasFile ? api.get<{ url: string }>(`/api/vault/${item.id}/file-url`).then((r) => r.url) : Promise.resolve(null)), [item.id, item.hasFile, version]);
  useEffect(() => { setBroken(false); }, [image.data]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const anyBusy = busy || acting || replacing;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problems = validate(form);
    setFields(problems);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    try {
      const saved = (await api.patch<{ item: VaultItem }>(`/api/vault/${item.id}`, payload(form))).item;
      toast.success(item.status === 'confirmed' && saved.status === 'unconfirmed' ? 'Saved. The picture is unconfirmed again: a person needs to check it and confirm it' : 'Picture saved');
      onChanged(saved, false);
    } catch (err) {
      setFields(fieldErrors(err));
      setError(formProblem(err, Object.keys(form)));
    } finally {
      setBusy(false);
    }
  }

  async function act(path: 'confirm' | 'unconfirm') {
    setActing(true); setActionError('');
    try {
      const saved = (await api.post<{ item: VaultItem }>(`/api/vault/${item.id}/${path}`)).item;
      toast.success(path === 'confirm' ? 'Picture confirmed' : 'Confirmation removed');
      onChanged(saved, false);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setActing(false);
    }
  }

  async function replace(file: File) {
    setReplaceError('');
    const why = fileProblem(file);
    if (why) { setReplaceError(why); return; }
    setReplacing(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const saved = (await api.upload<{ item: VaultItem }>(`/api/vault/${item.id}/file`, body)).item;
      toast.success('Image replaced');
      setVersion((v) => v + 1);
      onChanged(saved, true);
    } catch (err) {
      setReplaceError(errorMessage(err));
    } finally {
      setReplacing(false);
    }
  }

  const rights = needsRights(item);
  return (
    <>
      <FormPanel open onClose={onClose} busy={anyBusy} size="lg" title={item.title} description={`${item.kind === 'screen' ? 'Screen' : 'Photo'}. Added ${formatDate(item.createdAt)}, last changed ${formatDateTime(item.updatedAt)}.`}
        footer={(
          <>
            <Button variant="outline" className="md:mr-auto" disabled={anyBusy} onClick={() => setDeleting(true)}><Trash2 aria-hidden="true" />Delete</Button>
            <Button variant="outline" className="max-sm:min-h-11" disabled={anyBusy} onClick={onClose}>Close</Button>
            <BusyButton type="submit" form="library-item-form" loading={busy} disabled={!dirty || acting || replacing}>Save changes</BusyButton>
          </>
        )}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {image.loading && !image.data ? <Skeleton className="h-72 w-full rounded-none" />
                : image.data && !broken ? <img src={image.data} alt={item.title} className="max-h-[28rem] w-auto max-w-full object-contain" onError={() => setBroken(true)} />
                : (
                  <div className="flex flex-col items-center gap-1 p-6 text-center text-sm text-muted-foreground">
                    <ImageOff className="size-7" aria-hidden="true" />
                    {item.hasFile ? (image.error || 'The image could not be loaded.') : 'This item has no image yet.'}
                  </div>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="max-sm:min-h-11" disabled={anyBusy} onClick={() => picker.current?.click()}>
                <Upload aria-hidden="true" />{item.hasFile ? 'Replace image' : 'Upload image'}
              </Button>
              <input ref={picker} hidden type="file" accept={ACCEPT} aria-label="Choose a new image" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void replace(f); }} />
              {replacing && <span className="text-[13px] text-muted-foreground" role="status">Uploading the new image</span>}
              {item.fileName && !replacing && <span className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">{item.fileName}</span>}
            </div>
            <p className="text-[13px] text-muted-foreground">JPG, PNG, WebP or GIF, up to 15 MB. Replacing the image makes a confirmed picture unconfirmed again.</p>
            {replaceError && <Notice tone="bad">{replaceError}</Notice>}
          </div>

          <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Confirmation">
            <div className="flex flex-wrap items-center gap-2">
              {item.status === 'confirmed' ? <Badge variant="success">Confirmed</Badge> : <Badge variant="warning">Unconfirmed</Badge>}
              {rights && <Badge variant="destructive">Rights</Badge>}
              {item.status === 'confirmed' && item.confirmedAt && <span className="text-sm text-muted-foreground">Confirmed by a person on {formatDateTime(item.confirmedAt)}.</span>}
            </div>
            <p className="text-sm">Only people confirm. Confirming means you have checked the picture and its description and are happy for posts to use it.</p>
            {item.problems.rights.length > 0 && <Notice tone="warn" title="Still to settle.">{item.problems.rights.join('. ')}.</Notice>}
            {dirty && <Notice tone="info">Save your changes before confirming, so what you confirm is what is stored.</Notice>}
            {actionError && <Notice tone="bad">{actionError}</Notice>}
            <div>
              {item.status === 'confirmed'
                ? <BusyButton variant="outline" loading={acting} disabled={busy || replacing} onClick={() => void act('unconfirm')}>Take confirmation off</BusyButton>
                : <BusyButton loading={acting} disabled={dirty || busy || replacing} onClick={() => void act('confirm')}>Confirm this picture</BusyButton>}
            </div>
          </section>

          <form id="library-item-form" className="flex flex-col gap-4" onSubmit={(e) => void save(e)} noValidate>
            {item.status === 'confirmed' && <Notice tone="warn" title="This picture is confirmed.">Changing its kind, title, description or source makes it unconfirmed again.</Notice>}
            <TextField label="Title" value={form.title} maxLength={200} error={fields.title} disabled={anyBusy} onChange={(e) => set('title', e.target.value)} />
            <TextAreaField label="Description" rows={4} value={form.body} error={fields.body} disabled={anyBusy} onChange={(e) => set('body', e.target.value)}
              hint="What is in the picture, the mood, and what posts it suits. The AI reads this." />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Kind" value={form.kind} options={KIND_OPTIONS} disabled={anyBusy} error={fields.kind} onValueChange={(v) => set('kind', v as PictureKind)} />
              <SelectField label="Licence" value={form.licence} options={LICENCE_OPTIONS} disabled={anyBusy} error={fields.licence} onValueChange={(v) => set('licence', v as Licence)} />
            </div>
            <TagField tags={form.tags} onChange={(t) => set('tags', t)} error={fields.tags} />
            <FieldGroup legend="Rights and people">
              <SwitchField label="People can be recognised" checked={form.peoplePresent} disabled={anyBusy} onCheckedChange={(v) => set('peoplePresent', v)} />
              {form.peoplePresent && <SwitchField label="Their consent is recorded" hint="Only when you hold written or recorded permission to use their image." checked={form.consentRecorded} disabled={anyBusy} onCheckedChange={(v) => set('consentRecorded', v)} />}
              <TextField label="Licence notes" optional value={form.licenceNotes} maxLength={2000} error={fields.licenceNotes} disabled={anyBusy} onChange={(e) => set('licenceNotes', e.target.value)} hint="The photographer or stock site to credit." />
              <TextField label="Source link" optional type="url" inputMode="url" placeholder="https://" value={form.sourceUrl} error={fields.sourceUrl} disabled={anyBusy} onChange={(e) => set('sourceUrl', e.target.value)} />
            </FieldGroup>
            {error && <Notice tone="bad">{error}</Notice>}
          </form>
        </div>
      </FormPanel>

      <ConfirmAction
        open={deleting}
        title="Delete this picture?"
        message={<>"{item.title}" will be removed from the library and from the vault. Posts already using it keep working. You can undo this for a short while from the message that follows.</>}
        confirmLabel="Delete picture"
        danger
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          await api.delete(`/api/vault/${item.id}`);
          setDeleting(false);
          onRemoved(item);
        }}
      />
    </>
  );
}
