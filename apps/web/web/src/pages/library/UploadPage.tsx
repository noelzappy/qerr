// Adds pictures (/library/upload): drop or choose files, give each a title and kind (and, under More details, a description,
// licence, consent, tags and notes), then create the vault items and upload the files. A picture that fails stays in the list
// with its reason so it can be retried; those that worked are removed.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, CircleCheck, Loader2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BusyButton, Hint, Notice, PageHeader, parseTags, SelectField, SwitchField, TextAreaField, TextField } from '@/components/kit';
import { useDocumentTitle } from '@/hooks';
import { formProblem } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { CHECKER } from './RoleSwitch';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import type { VaultItem } from '../vault-types';
import { ACCEPT_BY_ROLE, asRole, fileProblem, guessKind, humaniseFileName, isHttpUrl, KIND_OPTIONS, LICENCE_OPTIONS, ROLE_ACCEPT_HINT, ROLE_NOUN, type Licence, type PictureKind, type PictureRole } from './util';

interface Row {
  key: string;
  file: File;
  previewUrl: string;
  title: string;
  body: string;
  kind: PictureKind;
  licence: Licence;
  licenceNotes: string;
  sourceUrl: string;
  peoplePresent: boolean;
  consentRecorded: boolean;
  tintable: boolean;
  tags: string;
  expanded: boolean;
  phase: 'idle' | 'working' | 'error';
  status: string;
  error: string;
  // Set once the vault item exists, so a retry after a failed upload does not make a second item.
  itemId: string | null;
  problems: Record<string, string>;
}

let nextKey = 0;
function newRow(file: File, role: PictureRole): Row {
  return {
    key: `row-${nextKey++}`, file, previewUrl: URL.createObjectURL(file),
    title: humaniseFileName(file.name), body: '', kind: role === 'photo' ? guessKind(file.name) : 'photo', licence: role === 'photo' ? '' : 'own', licenceNotes: role === 'photo' ? '' : 'Made by us', sourceUrl: '',
    peoplePresent: false, consentRecorded: false, tintable: false, tags: '', expanded: false, phase: 'idle', status: '', error: '', itemId: null, problems: {},
  };
}

function validateRow(r: Row, role: PictureRole): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.title.trim()) e.title = 'Give the picture a title';
  else if (r.title.trim().length > 200) e.title = 'Keep the title to 200 characters or fewer';
  if (role === 'photo' && !r.body.trim()) e.body = 'Describe the picture: the AI reads this to choose it';
  if (r.sourceUrl.trim() && !isHttpUrl(r.sourceUrl.trim())) e.sourceUrl = 'Enter a full address starting with http:// or https://';
  const tags = parseTags(r.tags);
  if (tags.some((t) => t.length > 40)) e.tags = 'A tag can be at most 40 characters';
  else if (new Set(tags).size > 30) e.tags = 'A picture can have at most 30 tags';
  return e;
}

const payload = (r: Row, role: PictureRole) => ({
  kind: r.kind, ...(role !== 'photo' ? { tintable: role === 'graphic' && r.tintable } : {}), title: r.title.trim(), body: r.body.trim(), tags: [...new Set(parseTags(r.tags))],
  licence: r.licence || null, licenceNotes: r.licenceNotes.trim() || null, sourceUrl: r.sourceUrl.trim() || null,
  peoplePresent: r.peoplePresent, consentRecorded: r.peoplePresent && r.consentRecorded,
});

export function UploadPage() {
  useDocumentTitle('Upload pictures');
  const navigate = useNavigate();
  const role = asRole(useSearchParams()[0].get('role'));
  const noun = ROLE_NOUN[role];
  const [rows, setRows] = useState<Row[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allLicence, setAllLicence] = useState<Licence>('');
  const [allTags, setAllTags] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const live = useRef<Row[]>([]);
  live.current = rows;
  useEffect(() => () => { for (const r of live.current) URL.revokeObjectURL(r.previewUrl); }, []);

  const patch = (key: string, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  function addFiles(list: FileList | File[]) {
    const accepted: Row[] = [];
    const bad: string[] = [];
    for (const f of Array.from(list)) {
      const why = fileProblem(f, role);
      if (why) bad.push(`${f.name}: ${why}`);
      else accepted.push(newRow(f, role));
    }
    setRejected(bad);
    if (accepted.length) setRows((rs) => [...rs, ...accepted]);
  }

  function remove(key: string) {
    const gone = rows.find((r) => r.key === key);
    if (gone) URL.revokeObjectURL(gone.previewUrl);
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  async function uploadAll() {
    const checked = rows.map((r) => ({ ...r, problems: validateRow(r, role) }));
    setRows(checked);
    if (checked.some((r) => Object.keys(r.problems).length)) return;
    setBusy(true);
    let added = 0;
    let failures = 0;
    for (const r of checked) {
      patch(r.key, { phase: 'working', status: r.itemId ? 'Saving the details' : 'Creating the item', error: '' });
      let id = r.itemId;
      try {
        if (id) await api.patch(`/api/vault/${id}`, payload(r, role));
        else {
          id = (await api.post<{ item: VaultItem }>('/api/vault', { ...payload(r, role), role })).item.id;
          patch(r.key, { itemId: id });
        }
        patch(r.key, { status: 'Uploading the image' });
        const body = new FormData();
        body.append('file', r.file);
        await api.upload(`/api/vault/${id}/file`, body);
        URL.revokeObjectURL(r.previewUrl);
        setRows((rs) => rs.filter((x) => x.key !== r.key));
        added++;
      } catch (err) {
        const why = id ? formProblem(err, []) : formProblem(err, ['kind', 'title', 'body', 'tags', 'licence', 'licenceNotes', 'sourceUrl']);
        failures++;
        patch(r.key, { phase: 'error', status: '', error: id ? `The item was created but the image was not uploaded. ${why}` : why });
      }
    }
    setBusy(false);
    if (added) toast.success(`${added} ${added === 1 ? 'picture' : 'pictures'} added`);
    if (!failures) withoutGuard(() => navigate(role === 'photo' ? '/library' : `/library?role=${role}`));
  }

  const applyAll = () => setRows((rs) => rs.map((r) => ({ ...r, ...(allLicence ? { licence: allLicence } : {}), ...(allTags.trim() ? { tags: allTags } : {}) })));

  const dirty = rows.length > 0;
  useUnsavedGuard(dirty, { message: 'The pictures you chose have not been uploaded yet.' });
  const goBack = () => confirmDiscard(dirty && !busy, () => navigate(role === 'photo' ? '/library' : `/library?role=${role}`));
  const failed = rows.filter((r) => r.phase === 'error').length;
  return (
    <div className="max-w-[900px]">
      <PageHeader
        crumbs={[{ label: 'Pictures', to: role === 'photo' ? '/library' : `/library?role=${role}` }, { label: 'Upload' }]}
        title={role === 'photo' ? 'Upload pictures' : `Upload ${noun}s`}
        actions={(
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button variant="outline" className="max-sm:min-h-11" disabled={busy} onClick={goBack}>Cancel</Button>
            <BusyButton loading={busy} disabled={rows.length === 0} onClick={() => void uploadAll()}>
              {rows.length === 0 ? (role === 'photo' ? 'Upload pictures' : `Upload ${noun}s`) : `${failed ? 'Retry and upload' : 'Upload'} ${rows.length} ${rows.length === 1 ? 'picture' : 'pictures'}`}
            </BusyButton>
          </div>
        )}
      />

      <div className="flex flex-col gap-4">
        <div
          className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border-2 border-dashed px-4 py-5 transition-colors max-sm:justify-center', over ? 'border-primary bg-accent' : 'border-border')}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-[13px]">Drag {role === 'photo' ? 'pictures' : `${noun}s`} here, or</p>
          <Button variant="outline" className="max-sm:min-h-11" disabled={busy} onClick={() => picker.current?.click()}>Choose {role === 'photo' ? 'pictures' : `${noun}s`}</Button>
          <Hint about="the files" id="upload-file-hint">{ROLE_ACCEPT_HINT[role]}</Hint>
          <input ref={picker} hidden type="file" multiple accept={ACCEPT_BY_ROLE[role]} aria-label="Choose pictures to upload" aria-describedby="upload-file-hint" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {rejected.length > 0 && (
          <Notice tone="warn" title="Some files were not added.">
            <ul className="m-0 list-disc pl-[18px]">{rejected.map((m) => <li key={m} className="[overflow-wrap:anywhere]">{m}</li>)}</ul>
          </Notice>
        )}

        {rows.length > 1 && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Apply to all pictures">
            <span className="text-[13px] font-medium">Apply to all</span>
            <Select value={allLicence} onValueChange={(v) => setAllLicence(v as Licence)}>
              <SelectTrigger aria-label="Licence for all" className="w-full max-sm:h-11 max-sm:text-base sm:w-44"><SelectValue placeholder="Licence" /></SelectTrigger>
              <SelectContent position="popper">{LICENCE_OPTIONS.filter((o) => o.value).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Tags for all" placeholder="Tags, e.g. news, the-numbers" value={allTags} onChange={(e) => setAllTags(e.target.value)} className="max-sm:h-11 max-sm:text-base sm:w-56" />
            <Button variant="outline" className="max-sm:min-h-11" disabled={busy || (!allLicence && !allTags.trim())} onClick={applyAll}>Apply</Button>
          </div>
        )}

        {rows.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y overflow-hidden rounded-lg border p-0" aria-label="Pictures to upload">
            {rows.map((r) => <UploadRow key={r.key} row={r} role={role} disabled={busy} onChange={(c) => patch(r.key, c)} onRemove={() => remove(r.key)} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function UploadRow({ row: r, role, disabled, onChange, onRemove }: { row: Row; role: PictureRole; disabled: boolean; onChange: (c: Partial<Row>) => void; onRemove: () => void }) {
  const locked = disabled || r.phase === 'working';
  // A problem with a field in the details opens them, so the message is never hidden.
  const detailProblem = !!(r.problems.body || r.problems.tags || r.problems.sourceUrl);
  const expanded = r.expanded || detailProblem;
  const panel = `${r.key}-details`;
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <img src={r.previewUrl} alt={`Preview of ${r.file.name}`} className={cn('size-12 flex-none rounded-md', role === 'photo' ? 'object-cover' : cn('object-contain', CHECKER))} />
        <div className={cn('grid min-w-0 flex-1 gap-2', role === 'photo' && 'sm:grid-cols-[minmax(0,1fr)_9rem]')}>
          <TextField label="Title" className="[&>div:first-child]:sr-only" value={r.title} disabled={locked} maxLength={200} error={r.problems.title} onChange={(e) => onChange({ title: e.target.value })} />
          {role === 'photo' && <SelectField label="Kind" className="[&>div:first-child]:sr-only" value={r.kind} disabled={locked} onValueChange={(v) => onChange({ kind: v as PictureKind })} options={KIND_OPTIONS} />}
        </div>
        <Button variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Remove ${r.file.name} from the upload`} disabled={locked} onClick={onRemove}><X aria-hidden="true" /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[60px] text-[12.5px] text-muted-foreground">
        <button type="button" aria-expanded={expanded} aria-controls={panel} onClick={() => onChange({ expanded: !r.expanded })}
          className="inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />More details
        </button>
        {role === 'photo' && !r.body.trim() && !expanded && <span>Description needed</span>}
        <span className="truncate">{r.file.name} · {r.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(r.file.size / 1024))} KB` : `${(r.file.size / 1024 / 1024).toFixed(1)} MB`}</span>
        {r.phase === 'working' && <span className="flex items-center gap-1.5" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{r.status}</span>}
        {r.phase === 'idle' && r.itemId && <span className="flex items-center gap-1.5 text-success"><CircleCheck className="size-3.5" aria-hidden="true" />Item created</span>}
      </div>
      {r.phase === 'error' && <div className="pl-[60px]"><Notice tone="bad">{r.error}</Notice></div>}
      {expanded && (
        <div id={panel} className="flex flex-col gap-3 pb-1 pl-[60px]">
          <TextAreaField label="Description" rows={2} value={r.body} disabled={locked} error={r.problems.body} onChange={(e) => onChange({ body: e.target.value })}
            hint="What is in the picture, the mood, and what posts it suits. The AI reads this." />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Licence" value={r.licence} disabled={locked} onValueChange={(v) => onChange({ licence: v as Licence })} options={LICENCE_OPTIONS} />
            <TextField label="Tags" optional placeholder="news, the-numbers" value={r.tags} disabled={locked} error={r.problems.tags} onChange={(e) => onChange({ tags: e.target.value })} hint="Separate several with commas." />
          </div>
          {role === 'graphic' && <SwitchField label="Can be recoloured" hint="For single-colour artwork. A design may then paint it in one of your brand colours." checked={r.tintable} disabled={locked} onCheckedChange={(v) => onChange({ tintable: v })} />}
          {role !== 'graphic' && <SwitchField label="People can be recognised" checked={r.peoplePresent} disabled={locked} onCheckedChange={(v) => onChange({ peoplePresent: v, consentRecorded: v ? r.consentRecorded : false })} />}
          {role !== 'graphic' && r.peoplePresent && <SwitchField label="Their consent is recorded" hintMode="inline" hint="Only when you hold written or recorded permission." checked={r.consentRecorded} disabled={locked} onCheckedChange={(v) => onChange({ consentRecorded: v })} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Licence notes" optional value={r.licenceNotes} disabled={locked} maxLength={2000} onChange={(e) => onChange({ licenceNotes: e.target.value })} hint="The photographer or stock site to credit." />
            <TextField label="Source link" optional type="url" inputMode="url" placeholder="https://example.com/photo" value={r.sourceUrl} disabled={locked} error={r.problems.sourceUrl} onChange={(e) => onChange({ sourceUrl: e.target.value })} />
          </div>
        </div>
      )}
    </li>
  );
}
