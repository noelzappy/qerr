// Adds pictures to the library: drop or choose files, describe each one, then create the vault items and upload the
// files. A picture that fails stays in the list with its reason so it can be retried; those that worked are removed.
import { useEffect, useRef, useState } from 'react';
import { CircleCheck, Loader2, UploadCloud, X } from 'lucide-react';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { BusyButton, FieldGroup, FormPanel, Notice, parseTags, SelectField, SwitchField, TextAreaField, TextField } from '@/components/kit';
import { formProblem } from '@/lib/errors';
import { cn } from '@/lib/utils';
import type { VaultItem } from '../vault-types';
import { ACCEPT, fileProblem, guessKind, humaniseFileName, isHttpUrl, type Licence, type PictureKind } from './util';

export const KIND_OPTIONS = [{ value: 'photo', label: 'Photo' }, { value: 'screen', label: 'Screen' }];
export const LICENCE_OPTIONS = [
  { value: '', label: 'Not recorded yet' },
  { value: 'own', label: 'Own' },
  { value: 'licensed', label: 'Licensed stock' },
  { value: 'rights_to_confirm', label: 'Rights to confirm' },
];

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
  tags: string;
  phase: 'idle' | 'working' | 'error';
  status: string;
  error: string;
  // Set once the vault item exists, so a retry after a failed upload does not make a second item.
  itemId: string | null;
  problems: Record<string, string>;
}

let nextKey = 0;
function newRow(file: File): Row {
  return {
    key: `row-${nextKey++}`, file, previewUrl: URL.createObjectURL(file),
    title: humaniseFileName(file.name), body: '', kind: guessKind(file.name), licence: '', licenceNotes: '', sourceUrl: '',
    peoplePresent: false, consentRecorded: false, tags: '', phase: 'idle', status: '', error: '', itemId: null, problems: {},
  };
}

function validateRow(r: Row): Record<string, string> {
  const e: Record<string, string> = {};
  if (!r.title.trim()) e.title = 'Give the picture a title';
  else if (r.title.trim().length > 200) e.title = 'Keep the title to 200 characters or fewer';
  if (!r.body.trim()) e.body = 'Describe the picture: the AI reads this to choose it';
  if (r.sourceUrl.trim() && !isHttpUrl(r.sourceUrl.trim())) e.sourceUrl = 'Enter a full address starting with http:// or https://';
  const tags = parseTags(r.tags);
  if (tags.some((t) => t.length > 40)) e.tags = 'A tag can be at most 40 characters';
  else if (new Set(tags).size > 30) e.tags = 'A picture can have at most 30 tags';
  return e;
}

const payload = (r: Row) => ({
  kind: r.kind, title: r.title.trim(), body: r.body.trim(), tags: [...new Set(parseTags(r.tags))],
  licence: r.licence || null, licenceNotes: r.licenceNotes.trim() || null, sourceUrl: r.sourceUrl.trim() || null,
  peoplePresent: r.peoplePresent, consentRecorded: r.peoplePresent && r.consentRecorded,
});

export function UploadSheet({ onClose, onUploaded }: { onClose: () => void; onUploaded: (count: number) => void }) {
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
      const why = fileProblem(f);
      if (why) bad.push(`${f.name}: ${why}`);
      else accepted.push(newRow(f));
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
    const checked = rows.map((r) => ({ ...r, problems: validateRow(r) }));
    setRows(checked);
    if (checked.some((r) => Object.keys(r.problems).length)) return;
    setBusy(true);
    let added = 0;
    let failures = 0;
    for (const r of checked) {
      patch(r.key, { phase: 'working', status: r.itemId ? 'Saving the details' : 'Creating the item', error: '' });
      let id = r.itemId;
      try {
        if (id) await api.patch(`/api/vault/${id}`, payload(r));
        else {
          id = (await api.post<{ item: VaultItem }>('/api/vault', payload(r))).item.id;
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
    if (added) onUploaded(added);
    if (!failures) onClose();
  }

  const failed = rows.filter((r) => r.phase === 'error').length;
  return (
    <FormPanel open onClose={onClose} busy={busy} size="xl" title="Upload images"
      description="Add pictures the AI may use in posts. Describe each one: the AI reads the description to choose a picture."
      footer={(
        <>
          <Button variant="outline" className="max-sm:min-h-11" disabled={busy} onClick={onClose}>{rows.length ? 'Cancel' : 'Close'}</Button>
          <BusyButton loading={busy} disabled={rows.length === 0} onClick={() => void uploadAll()}>
            {rows.length === 0 ? 'Upload images' : `${failed ? 'Retry and upload' : 'Upload'} ${rows.length} ${rows.length === 1 ? 'image' : 'images'}`}
          </BusyButton>
        </>
      )}>
      <div className="flex flex-col gap-4">
        <div
          className={cn('flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors', over ? 'border-primary bg-accent' : 'border-border')}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          <UploadCloud className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm">Drag pictures here, or</p>
          <Button variant="outline" className="max-sm:min-h-11" disabled={busy} onClick={() => picker.current?.click()}>Choose images</Button>
          <p className="text-[13px] text-muted-foreground">JPG, PNG, WebP or GIF, up to 15 MB each.</p>
          <input ref={picker} hidden type="file" multiple accept={ACCEPT} aria-label="Choose images to upload" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {rejected.length > 0 && (
          <Notice tone="warn" title="Some files were not added.">
            <ul className="m-0 list-disc pl-[18px]">{rejected.map((m) => <li key={m} className="[overflow-wrap:anywhere]">{m}</li>)}</ul>
          </Notice>
        )}

        {rows.length > 1 && (
          <FieldGroup legend="Apply to all">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <SelectField className="flex-1" label="Licence for all" value={allLicence} onValueChange={(v) => setAllLicence(v as Licence)} options={LICENCE_OPTIONS} />
                <Button variant="outline" className="max-sm:h-11" disabled={busy} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, licence: allLicence })))}>Apply</Button>
              </div>
              <div className="flex items-end gap-2">
                <TextField className="flex-1" label="Tags for all" placeholder="news, the-numbers" value={allTags} onChange={(e) => setAllTags(e.target.value)} />
                <Button variant="outline" className="max-sm:h-11" disabled={busy} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, tags: allTags })))}>Apply</Button>
              </div>
            </div>
          </FieldGroup>
        )}

        <ul className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Pictures to upload">
          {rows.map((r) => <UploadRow key={r.key} row={r} disabled={busy} onChange={(c) => patch(r.key, c)} onRemove={() => remove(r.key)} />)}
        </ul>
      </div>
    </FormPanel>
  );
}

function UploadRow({ row: r, disabled, onChange, onRemove }: { row: Row; disabled: boolean; onChange: (c: Partial<Row>) => void; onRemove: () => void }) {
  const locked = disabled || r.phase === 'working';
  return (
    <li className="rounded-lg border p-3">
      <div className="mb-3 flex items-start gap-3">
        <img src={r.previewUrl} alt={`Preview of ${r.file.name}`} className="size-20 flex-none rounded-md border object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.file.name}</p>
          <p className="text-[13px] text-muted-foreground">{r.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(r.file.size / 1024))} KB` : `${(r.file.size / 1024 / 1024).toFixed(1)} MB`}</p>
          {r.phase === 'working' && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{r.status}</p>}
          {r.phase === 'idle' && r.itemId && <p className="mt-1 flex items-center gap-1.5 text-[13px] text-success"><CircleCheck className="size-3.5" aria-hidden="true" />Item created</p>}
        </div>
        <Button variant="ghost" size="icon" className="max-sm:size-11" aria-label={`Remove ${r.file.name} from the upload`} disabled={locked} onClick={onRemove}><X aria-hidden="true" /></Button>
      </div>
      {r.phase === 'error' && <div className="mb-3"><Notice tone="bad">{r.error}</Notice></div>}
      <div className="flex flex-col gap-3">
        <TextField label="Title" value={r.title} disabled={locked} maxLength={200} error={r.problems.title} onChange={(e) => onChange({ title: e.target.value })} />
        <TextAreaField label="Description" rows={3} value={r.body} disabled={locked} error={r.problems.body} onChange={(e) => onChange({ body: e.target.value })}
          hint="What is in the picture, the mood, and what posts it suits. The AI reads this." />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Kind" value={r.kind} disabled={locked} onValueChange={(v) => onChange({ kind: v as PictureKind })} options={KIND_OPTIONS} />
          <SelectField label="Licence" value={r.licence} disabled={locked} onValueChange={(v) => onChange({ licence: v as Licence })} options={LICENCE_OPTIONS} />
        </div>
        <SwitchField label="People can be recognised" checked={r.peoplePresent} disabled={locked} onCheckedChange={(v) => onChange({ peoplePresent: v, consentRecorded: v ? r.consentRecorded : false })} />
        {r.peoplePresent && <SwitchField label="Their consent is recorded" hint="Only when you hold written or recorded permission." checked={r.consentRecorded} disabled={locked} onCheckedChange={(v) => onChange({ consentRecorded: v })} />}
        <TextField label="Tags" optional placeholder="news, the-numbers" value={r.tags} disabled={locked} error={r.problems.tags} onChange={(e) => onChange({ tags: e.target.value })} hint="Separate several with commas." />
        <details className="rounded-md border px-3 py-2" open={!!(r.licenceNotes || r.sourceUrl || r.problems.sourceUrl)}>
          <summary className="cursor-pointer text-sm font-medium max-sm:min-h-11 max-sm:py-2">Licence notes and source link</summary>
          <div className="mt-2 flex flex-col gap-3 pb-1">
            <TextField label="Licence notes" optional value={r.licenceNotes} disabled={locked} maxLength={2000} onChange={(e) => onChange({ licenceNotes: e.target.value })} hint="The photographer or stock site to credit." />
            <TextField label="Source link" optional type="url" inputMode="url" placeholder="https://" value={r.sourceUrl} disabled={locked} error={r.problems.sourceUrl} onChange={(e) => onChange({ sourceUrl: e.target.value })} />
          </div>
        </details>
      </div>
    </li>
  );
}
