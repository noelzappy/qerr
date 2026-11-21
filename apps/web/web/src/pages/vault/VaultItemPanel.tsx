// One vault item in a side panel over the vault list: create, edit, confirm, file upload for photos and screens, and the list
// of what still blocks it. /vault/new and /vault/:id open it, so a link to an item still works.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { BusyButton, CheckField, ConfirmAction, ErrorBlock, FieldGroup, FormPanel, Notice, SelectField, TagField, TextAreaField, TextField } from '@/components/kit';
import { useLoad } from '@/hooks';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { errorMessage, fieldErrors, formProblem } from '@/lib/errors';
import { dateInputValue, formatDateTime } from '@/lib/format';
import { KIND_LABEL, LICENCE_LABEL, VAULT_KINDS, type VaultKind } from '@/lib/labels';
import { isFileKind, type VaultItem } from '../vault-types';

const MAX_FILE = 15 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function ItemSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Loading the item">
      <Skeleton className="h-9 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-2/3" />
    </div>
  );
}

interface Form {
  kind: VaultKind; title: string; body: string; sourceUrl: string; sourceNotes: string;
  recordedAt: string; validFrom: string; validUntil: string; tags: string[];
  licence: '' | 'own' | 'licensed' | 'rights_to_confirm'; licenceNotes: string; peoplePresent: boolean; consentRecorded: boolean;
}

const toForm = (i: VaultItem | null): Form => ({
  kind: i?.kind ?? 'fact', title: i?.title ?? '', body: i?.body ?? '', sourceUrl: i?.sourceUrl ?? '', sourceNotes: i?.sourceNotes ?? '',
  recordedAt: dateInputValue(i?.recordedAt), validFrom: dateInputValue(i?.validFrom), validUntil: dateInputValue(i?.validUntil), tags: i?.tags ?? [],
  licence: i?.licence ?? '', licenceNotes: i?.licenceNotes ?? '', peoplePresent: i?.peoplePresent ?? false, consentRecorded: i?.consentRecorded ?? false,
});

function toPayload(f: Form) {
  return {
    kind: f.kind, title: f.title.trim(), body: f.body,
    sourceUrl: f.sourceUrl.trim() || null, sourceNotes: f.sourceNotes.trim() || null,
    recordedAt: f.recordedAt || null, validFrom: f.validFrom || null, validUntil: f.validUntil || null, tags: f.tags,
    ...(isFileKind(f.kind) ? { licence: f.licence || null, licenceNotes: f.licenceNotes.trim() || null, peoplePresent: f.peoplePresent, consentRecorded: f.peoplePresent && f.consentRecorded } : {}),
  };
}

function validate(f: Form, file: File | null): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.title.trim()) e.title = 'Give the item a title';
  else if (f.title.trim().length > 200) e.title = 'Keep the title to 200 characters or fewer';
  if (f.sourceUrl.trim() && !(/^https?:\/\//i.test(f.sourceUrl.trim()) && URL.canParse(f.sourceUrl.trim()))) e.sourceUrl = 'Enter a full address starting with http:// or https://';
  if (f.validFrom && f.validUntil && f.validUntil < f.validFrom) e.validUntil = 'This date must be on or after "Valid from"';
  if (file) {
    if (!IMAGE_TYPES.includes(file.type)) e.file = 'Choose a JPG, PNG, WebP or GIF image';
    else if (file.size > MAX_FILE) e.file = 'The file is larger than 15 MB';
    else if (file.size === 0) e.file = 'The file is empty';
  }
  return e;
}

const KIND_OPTIONS = VAULT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }));
const LICENCE_OPTIONS = [{ value: '', label: 'Not recorded yet' }, ...Object.entries(LICENCE_LABEL).map(([value, label]) => ({ value, label }))];

export function VaultItemPanel({ id, onClose, onChanged }: {
  id: string;
  // Closes the panel (the vault page goes back to /vault).
  onClose: () => void;
  // Something was saved, confirmed or deleted, so the list behind the panel is out of date.
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const isNew = id === 'new';
  const state = useLoad(() => (isNew ? Promise.resolve(null) : api.get<{ item: VaultItem }>(`/api/vault/${encodeURIComponent(id)}`).then((r) => r.item)), [id]);
  const item = !isNew && state.data?.id === id ? state.data : null;
  const loading = !isNew && !item && !state.error;
  const ready = isNew || !!item;

  const [form, setForm] = useState<Form>(() => toForm(item));
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');

  // Start the form again from the stored item whenever a fresh copy arrives (opened, saved, confirmed).
  const [seen, setSeen] = useState(item);
  if (seen !== item) {
    setSeen(item);
    setForm(toForm(item));
    setFile(null);
    setFileKey((k) => k + 1);
    setFields({});
    setError('');
    setActionError('');
  }

  const initial = useMemo(() => toForm(item), [item]);
  const dirty = !!file || JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedGuard(dirty);
  const requestClose = () => confirmDiscard(dirty, onClose);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fileKind = isFileKind(form.kind);
  const reload = async () => { await state.reload(); onChanged(); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problems = validate(form, fileKind ? file : null);
    setFields(problems);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    let saved: VaultItem | null = item;
    try {
      if (item) {
        const changed = JSON.stringify(form) !== JSON.stringify(initial);
        if (changed) saved = (await api.patch<{ item: VaultItem }>(`/api/vault/${item.id}`, toPayload(form))).item;
      } else {
        saved = (await api.post<{ item: VaultItem }>('/api/vault', toPayload(form))).item;
      }
      if (file && fileKind && saved) {
        const body = new FormData();
        body.append('file', file);
        try {
          saved = (await api.upload<{ item: VaultItem }>(`/api/vault/${saved.id}/file`, body)).item;
        } catch (err) {
          toast.error(`The item was saved but the file was not uploaded: ${errorMessage(err)}`);
          onChanged();
          if (!item) { const to = `/vault/${saved.id}`; withoutGuard(() => navigate(to, { replace: true })); }
          else await state.reload();
          return;
        }
      }
      if (item?.status === 'confirmed' && saved?.status === 'unconfirmed') toast.success('Saved. The item is unconfirmed again: a person needs to check it and confirm it');
      else toast.success(item ? 'Saved' : 'Added to your facts');
      if (!item && saved) { const to = `/vault/${saved.id}`; onChanged(); withoutGuard(() => navigate(to, { replace: true })); }
      else await reload();
    } catch (err) {
      setFields(fieldErrors(err));
      setError(formProblem(err, Object.keys(toForm(null))));
    } finally {
      setBusy(false);
    }
  }

  async function act(path: 'confirm' | 'unconfirm') {
    if (!item) return;
    setActing(true); setActionError('');
    try {
      await api.post(`/api/vault/${item.id}/${path}`);
      toast.success(path === 'confirm' ? 'Item confirmed' : 'Confirmation removed');
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setActing(false);
    }
  }

  const anyBusy = busy || acting;
  const title = item ? item.title : isNew ? 'Add a fact' : 'Fact';
  const description = item
    ? `${KIND_LABEL[item.kind]}. Last changed ${formatDateTime(item.updatedAt)}.`
    : isNew ? 'New items start unconfirmed. After saving you can confirm the item yourself once you have checked it.' : undefined;
  return (
    <>
      <FormPanel
        open
        onClose={requestClose}
        busy={anyBusy}
        size="lg"
        title={title}
        description={description}
        footer={ready ? (
          <>
            {item && <Button variant="outline" className="md:mr-auto" disabled={anyBusy} onClick={() => setDeleting(true)}><Trash2 aria-hidden="true" />Delete</Button>}
            <Button variant="outline" disabled={anyBusy} onClick={requestClose}>{item ? 'Close' : 'Cancel'}</Button>
            <BusyButton type="submit" form="vault-item-form" loading={busy} disabled={acting || (!!item && !dirty)}>{item ? 'Save changes' : 'Add to your facts'}</BusyButton>
          </>
        ) : <Button variant="outline" onClick={requestClose}>Close</Button>}
      >
        {loading ? <ItemSkeleton />
          : state.error ? <ErrorBlock message={state.error} onRetry={() => void state.reload()} title="This item could not be opened" />
          : (
            <div className="flex flex-col gap-5">
              {item && (
                <>
                  <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Confirmation">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.status === 'confirmed' ? <Badge variant="success">Confirmed</Badge> : <Badge variant="warning">Unconfirmed</Badge>}
                      {item.status === 'confirmed' && item.confirmedAt && <span className="text-sm text-muted-foreground">Confirmed by a person on {formatDateTime(item.confirmedAt)}.</span>}
                    </div>
                    <p className="text-sm">Only people confirm. The AI can add items and check them, but it can never confirm one. Confirming means you have checked the text against its source and are happy for posts to rely on it.</p>
                    {dirty && <Notice tone="info">Save your changes before confirming, so what you confirm is what is stored.</Notice>}
                    {actionError && <Notice tone="bad">{actionError}</Notice>}
                    <div>
                      {item.status === 'confirmed'
                        ? <BusyButton variant="outline" loading={acting} disabled={busy} onClick={() => void act('unconfirm')}>Take confirmation off</BusyButton>
                        : <BusyButton loading={acting} disabled={dirty || busy} onClick={() => void act('confirm')}>Confirm this item</BusyButton>}
                    </div>
                  </section>
                  <ProblemsPanel item={item} />
                </>
              )}

              <form id="vault-item-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
                {item?.status === 'confirmed' && (
                  <Notice tone="warn" title="This item is confirmed.">
                    Changing its kind, title, text, source or dates makes it unconfirmed again, and a person has to confirm it again. Changing the file does the same.
                  </Notice>
                )}
                <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                  <SelectField label="Kind" value={form.kind} onValueChange={(v) => set('kind', v as VaultKind)} options={KIND_OPTIONS} error={fields.kind} />
                  <TextField label="Title" value={form.title} onChange={(e) => set('title', e.target.value)} error={fields.title} required maxLength={200} autoFocus={!item} />
                </div>
                <TextAreaField label={fileKind ? 'Description' : 'Text'} rows={fileKind ? 3 : 7} value={form.body} onChange={(e) => set('body', e.target.value)} error={fields.body} optional={fileKind}
                  hint={form.kind === 'figure' ? 'State the figure and what it measures, for example "12 million mobile money accounts in the country".' : fileKind ? 'What the picture shows, in a sentence or two. The AI reads this when choosing pictures.' : 'The fact or story, in plain words. Posts are written from this text.'} />

                {fileKind && (
                  <FileSection item={item} file={file} fileKey={fileKey} error={fields.file}
                    onFile={(f) => { setFile(f); setFields((x) => ({ ...x, file: '' })); }} onClear={() => { setFile(null); setFileKey((k) => k + 1); }} />
                )}

                <TextField label="Source link" type="url" inputMode="url" value={form.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} error={fields.sourceUrl} optional placeholder="https://" hint="Where this came from." />
                <TextAreaField label="Source notes" rows={3} value={form.sourceNotes} onChange={(e) => set('sourceNotes', e.target.value)} error={fields.sourceNotes} optional hint="Who said it, which document, or how you checked it." />
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField label="Recorded on" type="date" value={form.recordedAt} onChange={(e) => set('recordedAt', e.target.value)} error={fields.recordedAt} optional />
                  <TextField label="Valid from" type="date" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} error={fields.validFrom} optional />
                  <TextField label="Valid until" type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} error={fields.validUntil} optional />
                </div>
                {form.kind === 'figure' && <p className="-mt-2 text-[13px] text-muted-foreground">Figures carry the date they were true. Once the valid-until date passes, or the figure is older than the stale limit, it is flagged as stale.</p>}
                <TagField tags={form.tags} onChange={(t) => set('tags', t)} error={fields.tags} />

                {fileKind && (
                  <FieldGroup legend="Rights and people">
                    <SelectField label="Licence or permission" value={form.licence} onValueChange={(v) => set('licence', v as Form['licence'])} options={LICENCE_OPTIONS} error={fields.licence}
                      hint="A picture marked rights still to confirm can go in a draft, but its post cannot be approved until this is settled." />
                    <TextAreaField label="Licence notes" rows={2} value={form.licenceNotes} onChange={(e) => set('licenceNotes', e.target.value)} error={fields.licenceNotes} optional hint="The photographer or stock site to credit, and the licence reference." />
                    <CheckField label="People can be recognised in this picture" checked={form.peoplePresent} onCheckedChange={(v) => set('peoplePresent', v)} />
                    {form.peoplePresent && (
                      <CheckField label="Their consent is recorded" hint="Tick only when you hold written or recorded permission to use their image." checked={form.consentRecorded} onCheckedChange={(v) => set('consentRecorded', v)} />
                    )}
                  </FieldGroup>
                )}

                {!item && <Notice tone="info" title="After you save.">The item is saved as unconfirmed. Check it against its source, then confirm it here. Photos and screens also need a licence, and consent if people can be recognised, before posts using them can be approved.</Notice>}
                {error && <Notice tone="bad">{error}</Notice>}
                {item && dirty && <div><Button type="button" variant="ghost" className="max-sm:min-h-11" disabled={busy} onClick={() => { setForm(initial); setFile(null); setFileKey((k) => k + 1); setFields({}); setError(''); }}>Undo changes</Button></div>}
              </form>
            </div>
          )}
      </FormPanel>

      <ConfirmAction
        open={deleting}
        title="Delete this item?"
        message={<>"{item?.title}" will be removed from your facts and from the lists. Posts already using it keep working. You can undo this for a short while from the message that follows.</>}
        confirmLabel="Delete item"
        danger
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          const gone = item!;
          await api.delete(`/api/vault/${gone.id}`);
          setDeleting(false);
          toast.success(`"${gone.title}" deleted`, {
            duration: 9000,
            action: {
              label: 'Undo',
              onClick: () => { api.post(`/api/vault/${gone.id}/restore`).then(() => { toast.success('Item restored'); onChanged(); }).catch((e: unknown) => toast.error(errorMessage(e))); },
            },
          });
          onChanged();
          withoutGuard(onClose);
        }}
      />
    </>
  );
}

function ProblemsPanel({ item }: { item: VaultItem }) {
  const rights = isFileKind(item.kind) ? item.problems.rights : [];
  const source = item.problems.source;
  const none = rights.length === 0 && source.length === 0;
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4" aria-label="Problems">
      <div>
        <h3 className="text-base font-semibold">Problems</h3>
        <p className="text-sm text-muted-foreground">What stops this item being relied on in an approved post.</p>
      </div>
      <div>
        {none ? <Notice tone="good">No problems. Posts can use this item.</Notice> : (
          <div className="flex flex-col gap-4">
            {source.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold">Source and dates</h3>
                <ul className="m-0 list-disc pl-[18px]">{source.map((p) => <li key={p} className="text-sm">{p}</li>)}</ul>
              </div>
            )}
            {rights.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold">Rights and permission</h3>
                <ul className="m-0 list-disc pl-[18px]">{rights.map((p) => <li key={p} className="text-sm">{p}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function FileSection({ item, file, fileKey, error, onFile, onClear }: { item: VaultItem | null; file: File | null; fileKey: number; error?: string; onFile: (f: File | null) => void; onClear: () => void }) {
  const localUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);
  const saved = useLoad(
    () => (item?.hasFile ? api.get<{ url: string }>(`/api/vault/${item.id}/file-url`).then((r) => r.url) : Promise.resolve(null)),
    [item?.id, item?.hasFile, item?.updatedAt],
  );
  const [broken, setBroken] = useState(false);
  const shown = localUrl ?? saved.data;
  const err = saved.error && !localUrl ? saved.error : '';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="vault-file">{item?.hasFile ? 'Replace the picture' : 'Picture'}{item?.hasFile && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
        <Input id="vault-file" key={fileKey} type="file" accept={IMAGE_TYPES.join(',')} className="max-sm:h-11" aria-invalid={error ? true : undefined} aria-describedby="vault-file-hint"
          onChange={(e) => { setBroken(false); onFile(e.target.files?.[0] ?? null); }} />
        <p className="text-[13px] text-muted-foreground" id="vault-file-hint">JPG, PNG, WebP or GIF, up to 15 MB. The file is uploaded when you save.{item?.hasFile && item.fileName ? ` Now stored: ${item.fileName}.` : ''}</p>
        {error && <p className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
      </div>
      {file && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">Selected: {file.name}</span>
          <Button type="button" size="sm" variant="ghost" className="max-sm:min-h-11" onClick={onClear}>Remove</Button>
        </div>
      )}
      {shown && !broken
        ? <div className="overflow-hidden rounded-lg border bg-muted"><img src={shown} className="mx-auto max-h-80 w-auto max-w-full object-contain" alt={file ? `Preview of ${file.name}` : `Stored picture${item?.fileName ? `: ${item.fileName}` : ''}`} onError={() => setBroken(true)} /></div>
        : item?.hasFile || file ? <div className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">{broken || err ? 'The preview could not be loaded.' : 'Loading the preview'}</div> : null}
    </div>
  );
}
