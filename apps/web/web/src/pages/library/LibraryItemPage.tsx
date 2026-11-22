// One picture as a page (/library/:id): the large image with Replace picture on one side and every field on the other.
// Saving, replacing the image, confirming and deleting all go through the vault API, so the rules there (a change makes a
// confirmed item unconfirmed again) apply here too.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ImageOff, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BusyButton, ConfirmAction, EmptyBlock, Hint, MoreMenu, Notice, PageHeader, SelectField, SwitchField, TagField, TextAreaField, TextField, ToneBadge, type MoreMenuItem } from '@/components/kit';
import { useDocumentTitle, useLoad } from '@/hooks';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { errorMessage, fieldErrors, formProblem } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import type { VaultItem } from '../vault-types';
import { cn } from '@/lib/utils';
import { CHECKER } from './RoleSwitch';
import { ACCEPT_BY_ROLE, fileProblem, isHttpUrl, KIND_OPTIONS, LICENCE_OPTIONS, needsRights, ROLE_ACCEPT_HINT, ROLE_NOUN, type Licence, type PictureKind, type PictureRole } from './util';

// What a screen is, in the words of the item page (the server's framing, read from the file at upload).
const SCREEN_KIND = {
  phone: 'Phone screen with the phone already drawn round it: shown as it is.',
  'phone-bare': 'Phone screenshot: a look\'s phone design draws the phone round it.',
  desktop: 'Desktop screenshot: for designs that show a desktop screen, not a phone.',
} as const;

interface Form { kind: PictureKind; role: PictureRole; title: string; body: string; sourceUrl: string; licence: Licence; licenceNotes: string; peoplePresent: boolean; consentRecorded: boolean; tintable: boolean; tags: string[] }

const toForm = (i: VaultItem): Form => ({
  kind: i.kind === 'screen' ? 'screen' : 'photo', role: i.role, title: i.title, body: i.body, sourceUrl: i.sourceUrl ?? '', licence: i.licence ?? '',
  licenceNotes: i.licenceNotes ?? '', peoplePresent: i.peoplePresent, consentRecorded: i.consentRecorded, tintable: i.tintable, tags: i.tags,
});

const payload = (f: Form) => ({
  kind: f.kind, title: f.title.trim(), body: f.body.trim(), sourceUrl: f.sourceUrl.trim() || null, licence: f.licence || null,
  licenceNotes: f.licenceNotes.trim() || null, peoplePresent: f.peoplePresent, consentRecorded: f.peoplePresent && f.consentRecorded, tintable: f.tintable, tags: f.tags,
});

// A graphic or cut-out has no kind to choose, and only a graphic is ever recoloured. The role is sent only when it changes (the
// server then checks the file suits it).
const payloadFor = (f: Form, was: PictureRole) => {
  const p: Record<string, unknown> = payload(f);
  if (f.role !== was) p.role = f.role;
  if (f.role !== 'photo') delete p.kind;
  if (f.role !== 'graphic') delete p.tintable;
  return p;
};
const USE_OPTIONS = [{ value: 'photo', label: 'A photo for posts' }, { value: 'cutout', label: 'A cut-out for designs' }, { value: 'graphic', label: 'A brand graphic for designs' }];

function validate(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.title.trim()) e.title = 'Give the picture a title';
  else if (f.title.trim().length > 200) e.title = 'Keep the title to 200 characters or fewer';
  if (f.sourceUrl.trim() && !isHttpUrl(f.sourceUrl.trim())) e.sourceUrl = 'Enter a full address starting with http:// or https://';
  return e;
}

export function LibraryItemPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const cameFrom = (location.state as { back?: unknown } | null)?.back;
  const backTo = typeof cameFrom === 'string' && cameFrom.startsWith('/library') ? cameFrom : '/library';
  const state = useLoad(() => api.get<{ item: VaultItem }>(`/api/vault/${encodeURIComponent(id)}`).then((r) => r.item), [id]);
  const item = state.data?.id === id ? state.data : null;
  useDocumentTitle(item ? item.title : 'Picture');

  if (!item && !state.error) {
    return (
      <div role="status" aria-label="Loading the picture">
        <PageHeader crumbs={[{ label: 'Pictures', to: backTo }, { label: 'Loading' }]} title="Loading" />
        <div className="grid gap-6 md:grid-cols-2"><Skeleton className="aspect-square w-full" /><div className="flex flex-col gap-3"><Skeleton className="h-8" /><Skeleton className="h-24" /><Skeleton className="h-8" /></div></div>
      </div>
    );
  }
  if (!item) {
    return (
      <div>
        <PageHeader crumbs={[{ label: 'Pictures', to: backTo }, { label: 'Not found' }]} title="Picture not found" />
        <EmptyBlock title="This picture could not be opened" action={<div className="flex gap-2"><Button variant="outline" className="max-sm:min-h-11" onClick={() => void state.reload()}>Try again</Button><Button asChild className="max-sm:min-h-11"><Link to={backTo}>Back to Pictures</Link></Button></div>}>
          {state.error}
        </EmptyBlock>
      </div>
    );
  }
  return <PictureEditor key={item.id} item={item} backTo={backTo} onItem={(next) => state.setData(next)} />;
}

function PictureEditor({ item, backTo, onItem }: { item: VaultItem; backTo: string; onItem: (item: VaultItem) => void }) {
  const navigate = useNavigate();
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

  // Start the form again from the stored item whenever a fresh copy arrives (saved, confirmed, picture replaced).
  const [seen, setSeen] = useState(item);
  if (seen !== item) { setSeen(item); setForm(toForm(item)); setFields({}); setError(''); setActionError(''); }

  const [version, setVersion] = useState(0);
  const image = useLoad(() => (item.hasFile ? api.get<{ url: string }>(`/api/vault/${item.id}/file-url`).then((r) => r.url) : Promise.resolve(null)), [item.id, item.hasFile, version]);
  useEffect(() => { setBroken(false); }, [image.data]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useUnsavedGuard(dirty);
  const goBack = () => confirmDiscard(dirty, () => navigate(backTo));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const anyBusy = busy || acting || replacing;

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setError('');
    const problems = validate(form);
    setFields(problems);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    try {
      const saved = (await api.patch<{ item: VaultItem }>(`/api/vault/${item.id}`, payloadFor(form, item.role))).item;
      toast.success(item.status === 'confirmed' && saved.status === 'unconfirmed' ? 'Saved. The picture is unconfirmed again: a person needs to check it and confirm it' : 'Picture saved');
      onItem(saved);
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
      onItem(saved);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setActing(false);
    }
  }

  async function replace(file: File) {
    setReplaceError('');
    const why = fileProblem(file, item.role);
    if (why) { setReplaceError(why); return; }
    setReplacing(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const saved = (await api.upload<{ item: VaultItem }>(`/api/vault/${item.id}/file`, body)).item;
      toast.success('Picture replaced');
      setVersion((v) => v + 1);
      onItem(saved);
    } catch (err) {
      setReplaceError(errorMessage(err));
    } finally {
      setReplacing(false);
    }
  }

  const rights = needsRights(item);
  const isPhoto = item.role === 'photo';
  const noun = isPhoto ? 'picture' : ROLE_NOUN[item.role];
  const menu: MoreMenuItem[] = [
    item.status === 'confirmed'
      ? { label: 'Take confirmation off', onSelect: () => void act('unconfirm') }
      : { label: 'Confirm this picture', onSelect: () => void act('confirm'), disabled: dirty },
    { label: 'Delete', tone: 'danger', onSelect: () => setDeleting(true) },
  ];

  return (
    <div>
      <PageHeader
        crumbs={[{ label: isPhoto ? 'Pictures' : item.role === 'cutout' ? 'Cut-outs' : 'Graphics', to: backTo }, { label: item.title }]}
        title={item.title}
        actions={(
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="mr-1 flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:mr-auto">
              <ToneBadge tone={item.status === 'confirmed' ? 'good' : 'warn'} dot>{item.status === 'confirmed' ? 'Confirmed' : 'Unconfirmed'}</ToneBadge>
              {rights && <ToneBadge tone="bad" dot>Rights</ToneBadge>}
            </div>
            <Button variant="outline" className="max-sm:min-h-11" disabled={anyBusy} onClick={goBack}>{dirty ? 'Cancel' : 'Back'}</Button>
            <BusyButton type="submit" form="library-item-form" loading={busy} disabled={!dirty || acting || replacing}>Save</BusyButton>
            <MoreMenu items={menu} disabled={anyBusy} />
          </div>
        )}
      />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] md:items-start">
        <div className="flex flex-col gap-2 md:sticky md:top-2">
          <div className={cn('flex min-h-48 items-center justify-center overflow-hidden rounded-lg', isPhoto ? 'bg-muted' : CHECKER)}>
            {image.loading && !image.data ? <Skeleton className="h-72 w-full rounded-none" />
              : image.data && !broken ? <img src={image.data} alt={item.title} className="max-h-[70dvh] w-auto max-w-full object-contain" onError={() => setBroken(true)} />
              : (
                <div className="flex flex-col items-center gap-1 p-6 text-center text-[13px] text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden="true" />
                  {item.hasFile ? (image.error || 'The picture could not be loaded.') : 'This item has no picture yet.'}
                </div>
              )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="max-sm:min-h-11" disabled={anyBusy} onClick={() => picker.current?.click()}>
              <Upload aria-hidden="true" />{item.hasFile ? 'Replace picture' : 'Upload picture'}
            </Button>
            <Hint about="the picture file" id="library-file-hint">{ROLE_ACCEPT_HINT[item.role].replace(' each', '')}</Hint>
            <input ref={picker} hidden type="file" accept={ACCEPT_BY_ROLE[item.role]} aria-label="Choose a new picture" aria-describedby="library-file-hint" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void replace(f); }} />
            {replacing && <span className="text-[13px] text-muted-foreground" role="status">Uploading the new picture</span>}
            {item.width && item.height && !replacing && <span className="text-[12.5px] text-muted-foreground">{item.width} x {item.height} px</span>}
            {item.fileName && !replacing && <span className="min-w-0 text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{item.fileName}</span>}
          </div>
          {item.kind === 'screen' && item.framing && !replacing && <p className="text-[12.5px] text-muted-foreground">{SCREEN_KIND[item.framing]}</p>}
          {item.status === 'confirmed' && <p className="text-[12.5px] text-muted-foreground">Replacing the picture makes it unconfirmed again.</p>}
          {replaceError && <Notice tone="bad">{replaceError}</Notice>}
        </div>

        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-1 text-[12.5px] text-muted-foreground">
            Added {formatDate(item.createdAt)}, changed {formatDateTime(item.updatedAt)}.{item.status === 'confirmed' && item.confirmedAt ? ` Confirmed by a person on ${formatDateTime(item.confirmedAt)}.` : ''}
            <Hint about="confirming">Only people confirm. Confirming means you have checked the picture and its description and are happy for posts to use it.</Hint>
          </p>
          {item.problems.rights.length > 0 && <Notice tone="warn" title="Still to settle.">{item.problems.rights.join('. ')}.</Notice>}
          {dirty && item.status !== 'confirmed' && <Notice tone="info">Save your changes before confirming, so what you confirm is what is stored.</Notice>}
          {actionError && <Notice tone="bad">{actionError}</Notice>}

          <form id="library-item-form" className="flex flex-col gap-3" onSubmit={(e) => void save(e)} noValidate>
            {item.status === 'confirmed' && <Notice tone="warn" title="This picture is confirmed.">Changing its kind, title, description or source makes it unconfirmed again.</Notice>}
            <TextField label="Title" value={form.title} maxLength={200} error={fields.title} disabled={anyBusy} onChange={(e) => set('title', e.target.value)} />
            <TextAreaField label="Description" rows={4} value={form.body} error={fields.body} disabled={anyBusy} onChange={(e) => set('body', e.target.value)}
              hint="What is in the picture, the mood, and what posts it suits. The AI reads this." />
            <div className="grid gap-3 sm:grid-cols-2">
              {form.role === 'photo' && <SelectField label="Kind" value={form.kind} options={KIND_OPTIONS} disabled={anyBusy} error={fields.kind} onValueChange={(v) => set('kind', v as PictureKind)} />}
              {form.kind === 'photo' && <SelectField label="Use as" value={form.role} options={USE_OPTIONS} disabled={anyBusy} error={fields.role} onValueChange={(v) => set('role', v as PictureRole)}
                hint="Cut-outs and brand graphics need a PNG or WebP with a transparent background. The AI picks only photos." />}
              <SelectField label="Licence" value={form.licence} options={LICENCE_OPTIONS} disabled={anyBusy} error={fields.licence} onValueChange={(v) => set('licence', v as Licence)} />
            </div>
            <TagField tags={form.tags} onChange={(t) => set('tags', t)} error={fields.tags} />
            {form.role === 'graphic' && <SwitchField label="Can be recoloured" hint="For single-colour artwork. A design may then paint it in one of your brand colours." checked={form.tintable} disabled={anyBusy} onCheckedChange={(v) => set('tintable', v)} />}
            {form.role !== 'graphic' && <SwitchField label="People can be recognised" checked={form.peoplePresent} disabled={anyBusy} onCheckedChange={(v) => set('peoplePresent', v)} />}
            {form.role !== 'graphic' && form.peoplePresent && <SwitchField label="Their consent is recorded" hintMode="inline" hint="Only when you hold written or recorded permission to use their image." checked={form.consentRecorded} disabled={anyBusy} onCheckedChange={(v) => set('consentRecorded', v)} />}
            <TextField label="Licence notes" optional value={form.licenceNotes} maxLength={2000} error={fields.licenceNotes} disabled={anyBusy} onChange={(e) => set('licenceNotes', e.target.value)} hint="The photographer or stock site to credit." />
            <TextField label="Source link" optional type="url" inputMode="url" placeholder="https://example.com/photo" value={form.sourceUrl} error={fields.sourceUrl} disabled={anyBusy} onChange={(e) => set('sourceUrl', e.target.value)} />
            {error && <Notice tone="bad">{error}</Notice>}
          </form>
        </div>
      </div>

      <ConfirmAction
        open={deleting}
        title={`Delete this ${noun}?`}
        message={isPhoto ? <>"{item.title}" will be removed from your pictures and from your facts. Posts already using it keep working. You can undo this for a short while from the message that follows.</> : <>"{item.title}" will be removed from your {item.role === 'cutout' ? 'cut-outs' : 'graphics'}. If a post or a look design still uses it, it cannot be deleted until you take it out. You can undo this for a short while from the message that follows.</>}
        confirmLabel={`Delete ${noun}`}
        danger
        onCancel={() => setDeleting(false)}
        onConfirm={async () => {
          await api.delete(`/api/vault/${item.id}`);
          setDeleting(false);
          toast.success(`"${item.title}" deleted`, {
            duration: 9000,
            action: {
              label: 'Undo',
              onClick: () => { api.post(`/api/vault/${item.id}/restore`).then(() => toast.success('Picture restored')).catch((e: unknown) => toast.error(errorMessage(e))); },
            },
          });
          withoutGuard(() => navigate(backTo));
        }}
      />
    </div>
  );
}
