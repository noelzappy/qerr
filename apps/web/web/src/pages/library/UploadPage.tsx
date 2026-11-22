// Adds pictures (/library/upload): drop or choose files, then each card shows its title (from the file name), its kind
// (guessed), its description (required for photos), its licence and who is in it; tags, licence notes and the source are under
// More details. With two or more pictures, "For all pictures" sets the licence, the people and tags on every card at once; a
// card can still choose its own. Then the vault items are created and the files uploaded. A picture that fails stays in the
// list with its reason so it can be retried; those that worked are removed.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, CircleCheck, Loader2, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { BusyButton, FilledTag, Hint, Notice, PageHeader, SegmentedField, SwitchField, TagInput, TextAreaField, TextField } from '@/components/kit';
import { useDocumentTitle } from '@/hooks';
import { formProblem } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { CHECKER } from './RoleSwitch';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import type { VaultItem } from '../vault-types';
import { ChoiceRow } from '../batches/editor/ChoiceRow';
import { applyForAll, editRow, makeRow, NO_FOR_ALL, rowPayload, validateRow, type ForAll, type UploadRow as Row } from './upload-rows';
import { DescribeAllButton, PictureSuggest, PictureSuggestProvider, pictureSuggestionPatch } from '@/components/suggest/PictureSuggest';
import { ACCEPT_BY_ROLE, asRole, fileProblem, humaniseFileName, KIND_OPTIONS, LICENCE_CHOICES, PEOPLE_CHOICES, peopleFlags, peopleOf, ROLE_ACCEPT_HINT, ROLE_NOUN, type Licence, type People, type PictureKind, type PictureRole } from './util';

// What a picture suggestion changes on a card: the title only while it is still the one made from the file name, the description,
// and the suggested tags added to the card's own.
function suggestionChange(r: Row, s: Parameters<typeof pictureSuggestionPatch>[1]): Partial<Row> {
  const p = pictureSuggestionPatch({ title: r.title, tags: r.tags.join(', ') }, s, r.titleAuto ? r.title : humaniseFileName(r.file.name));
  return { ...(p.title !== r.title ? { title: p.title } : {}), body: p.body, tags: p.tags.split(',').map((t) => t.trim()).filter(Boolean) };
}

export function UploadPage() {
  useDocumentTitle('Upload pictures');
  const navigate = useNavigate();
  const role = asRole(useSearchParams()[0].get('role'));
  const noun = ROLE_NOUN[role];
  const [rows, setRows] = useState<Row[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forAll, setForAll] = useState<ForAll>(NO_FOR_ALL);
  const picker = useRef<HTMLInputElement>(null);
  const live = useRef<Row[]>([]);
  live.current = rows;
  useEffect(() => () => { for (const r of live.current) URL.revokeObjectURL(r.previewUrl); }, []);

  const patch = (key: string, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  // A change the person made on one card (it becomes that card's own).
  const edit = (key: string, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? editRow(r, change) : r)));
  const changeForAll = (next: ForAll) => { setRows((rs) => applyForAll(rs, forAll, next, role)); setForAll(next); };

  function addFiles(list: FileList | File[]) {
    const accepted: Row[] = [];
    const bad: string[] = [];
    for (const f of Array.from(list)) {
      const why = fileProblem(f, role);
      if (why) bad.push(`${f.name}: ${why}`);
      else accepted.push(makeRow(f, URL.createObjectURL(f), role, forAll));
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
    const checked = rows.map((r) => {
      const problems = validateRow(r, role);
      // A problem in the details opens them, so the message is never hidden.
      return { ...r, problems, expanded: r.expanded || !!(problems.tags || problems.sourceUrl) };
    });
    setRows(checked);
    if (checked.some((r) => Object.keys(r.problems).length)) return;
    setBusy(true);
    let added = 0;
    let failures = 0;
    for (const r of checked) {
      patch(r.key, { phase: 'working', status: r.itemId ? 'Saving the details' : 'Creating the item', error: '' });
      let id = r.itemId;
      let made = false;
      try {
        const body = new FormData();
        body.append('file', r.file);
        if (id) await api.patch(`/api/vault/${id}`, rowPayload(r, role));
        else {
          // The server checks the file for its role first (a cut-out or graphic needs transparency and a size), so a file it
          // would refuse never leaves an empty item behind.
          patch(r.key, { status: 'Checking the file' });
          await api.upload(`/api/vault/file-check?role=${role}`, body);
          id = (await api.post<{ item: VaultItem }>('/api/vault', { ...rowPayload(r, role), role })).item.id;
          made = true;
          patch(r.key, { itemId: id });
        }
        patch(r.key, { status: 'Uploading the image' });
        try {
          await api.upload(`/api/vault/${id}/file`, body);
        } catch (err) {
          // An item made just now for a file that was then refused is taken away again, so the list holds no empty item.
          if (made && id) {
            await api.delete(`/api/vault/${id}`).then(() => { patch(r.key, { itemId: null }); id = null; }).catch(() => {});
          }
          throw err;
        }
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

  const dirty = rows.length > 0;
  useUnsavedGuard(dirty, { message: 'The pictures you chose have not been uploaded yet.' });
  const goBack = () => confirmDiscard(dirty && !busy, () => navigate(role === 'photo' ? '/library' : `/library?role=${role}`));
  const failed = rows.filter((r) => r.phase === 'error').length;
  return (
    <PictureSuggestProvider><div className="max-w-[900px]">
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

        {rows.length > 1 && <ForAllBar count={rows.length} role={role} value={forAll} disabled={busy} onChange={changeForAll} />}

        {rows.length > 0 && <DescribeAllButton disabled={busy} />}
        {rows.length > 0 && (
          <ul className="m-0 flex list-none flex-col divide-y overflow-hidden rounded-lg border p-0" aria-label="Pictures to upload">
            {rows.map((r) => <UploadRow key={r.key} row={r} role={role} disabled={busy} forAll={rows.length > 1 ? forAll : NO_FOR_ALL} onChange={(c) => edit(r.key, c)} onToggle={() => patch(r.key, { expanded: !r.expanded })} onRemove={() => remove(r.key)} />)}
          </ul>
        )}
      </div>
    </div></PictureSuggestProvider>
  );
}

// "For all pictures": the licence, who is in them and tags, set once for every card. Shown with two or more pictures.
export function ForAllBar({ count, role, value, disabled, onChange }: { count: number; role: PictureRole; value: ForAll; disabled: boolean; onChange: (v: ForAll) => void }) {
  return (
    <section aria-labelledby="for-all-title" className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3">
      <h2 id="for-all-title" className="text-[13.5px] font-semibold">For all {count} {role === 'photo' ? 'pictures' : `${ROLE_NOUN[role]}s`}</h2>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <SegmentedField label="Licence" options={LICENCE_CHOICES.filter((o) => o.value)} value={value.licence} disabled={disabled} onChange={(v) => onChange({ ...value, licence: v })} />
        {role !== 'graphic' && <PeopleChoice value={value.people} disabled={disabled} onChange={(p) => onChange({ ...value, people: p })} />}
      </div>
      <TagInput label="Tags" optional values={value.tags} disabled={disabled} onChange={(t) => onChange({ ...value, tags: t })} chipsLabel="Tags for every picture" placeholder="news" className="sm:max-w-sm" />
    </section>
  );
}

// No people, people with consent recorded, or people without: the two stored flags as one choice of three chips.
function PeopleChoice({ value, onChange, disabled, marker }: { value: People | null; onChange: (p: People) => void; disabled: boolean; marker?: ReactNode }) {
  return <ChoiceRow<People> legend={<>People{marker}</>} choices={PEOPLE_CHOICES} value={value} disabled={disabled} onChange={(v) => onChange(v as People)} />;
}

export function UploadRow({ row: r, role, disabled, forAll, onChange, onToggle, onRemove }: { row: Row; role: PictureRole; disabled: boolean; forAll: ForAll; onChange: (c: Partial<Row>) => void; onToggle: () => void; onRemove: () => void }) {
  const locked = disabled || r.phase === 'working';
  // A problem with a field in the details opens them, so the message is never hidden.
  const detailProblem = !!(r.problems.tags || r.problems.sourceUrl);
  const expanded = r.expanded || detailProblem;
  const panel = `${r.key}-details`;
  const size = r.file.size < 1024 * 1024 ? `${Math.max(1, Math.round(r.file.size / 1024))} KB` : `${(r.file.size / 1024 / 1024).toFixed(1)} MB`;
  return (
    <li className="grid grid-cols-[4rem_minmax(0,1fr)_auto] gap-3 px-3 py-3 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-4">
      <img src={r.previewUrl} alt={`Preview of ${r.file.name}`} className={cn('size-16 rounded-md sm:row-span-2 sm:size-24', role === 'photo' ? 'object-cover' : cn('object-contain', CHECKER))} />
      <div className="col-span-3 row-start-2 flex min-w-0 flex-col gap-3 sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1">
        <div className={cn('grid min-w-0 items-start gap-3', role === 'photo' && 'lg:grid-cols-[minmax(0,1fr)_auto]')}>
          <TextField label={<>Title{r.titleAuto && <FilledTag>From the file name</FilledTag>}</>} value={r.title} disabled={locked} maxLength={200} error={r.problems.title} onChange={(e) => onChange({ title: e.target.value })} />
          {role === 'photo' && (
            <SegmentedField label="Kind" marker={r.kindGuessed ? <FilledTag>Guessed</FilledTag> : undefined} options={KIND_OPTIONS} value={r.kind} disabled={locked} onChange={(v) => onChange({ kind: v as PictureKind })} />
          )}
        </div>
        <TextAreaField label="Description" optional={role !== 'photo'} rows={2} value={r.body} disabled={locked} error={r.problems.body} onChange={(e) => onChange({ body: e.target.value })}
          placeholder="A jar of honey on a stall, morning light" hint="What is in the picture, the mood, and what posts it suits. The AI reads this." />
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <SegmentedField label="Licence" options={LICENCE_CHOICES} value={r.licence} disabled={locked} onChange={(v) => onChange({ licence: v as Licence })}
            marker={!r.licenceOwn && forAll.licence !== null && r.licence === forAll.licence ? <FilledTag>For all</FilledTag> : undefined} />
          {role !== 'graphic' && (
            <PeopleChoice value={peopleOf(r)} disabled={locked} onChange={(p) => onChange(peopleFlags(p))}
              marker={!r.peopleOwn && forAll.people !== null && peopleOf(r) === forAll.people ? <FilledTag>For all</FilledTag> : undefined} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
          <button type="button" aria-expanded={expanded} aria-controls={panel} onClick={onToggle}
            className="inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />More details
          </button>
          <PictureSuggest id={r.key} source={{ file: r.file, title: r.title, role: r.kind === 'screen' ? 'screen' : role }} hasDescription={!!r.body.trim()} disabled={locked} onUse={(s) => onChange(suggestionChange(r, s))} />
          {!expanded && r.tags.length > 0 && <span className="truncate">{r.tags.map((t) => `#${t}`).join(' ')}</span>}
          <span className="truncate">{r.file.name} · {size}</span>
          {r.phase === 'working' && <span className="flex items-center gap-1.5" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{r.status}</span>}
          {r.phase === 'idle' && r.itemId && <span className="flex items-center gap-1.5 text-success"><CircleCheck className="size-3.5" aria-hidden="true" />Item created</span>}
        </div>
        {r.phase === 'error' && <Notice tone="bad">{r.error}</Notice>}
        {expanded && (
          <div id={panel} className="flex flex-col gap-3">
            <TagInput label="Tags" optional values={r.tags} disabled={locked} error={r.problems.tags} onChange={(t) => onChange({ tags: t })} chipsLabel={`Tags on ${r.title || r.file.name}`} placeholder="news" />
            {role === 'graphic' && <SwitchField label="Can be recoloured" hint="For single-colour artwork. A design may then paint it in one of your brand colours." checked={r.tintable} disabled={locked} onCheckedChange={(v) => onChange({ tintable: v })} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Licence notes" optional value={r.licenceNotes} disabled={locked} maxLength={2000} onChange={(e) => onChange({ licenceNotes: e.target.value })} hint="The photographer or stock site to credit." />
              <TextField label="Source link" optional type="url" inputMode="url" placeholder="https://example.com/photo" value={r.sourceUrl} disabled={locked} error={r.problems.sourceUrl} onChange={(e) => onChange({ sourceUrl: e.target.value })} />
            </div>
          </div>
        )}
      </div>
      <div className="truncate self-center text-[13px] font-medium sm:hidden">{r.file.name}</div>
      <Button variant="ghost" size="icon" className="col-start-3 row-start-1 -mt-1 -mr-1 max-sm:size-11" aria-label={`Remove ${r.file.name} from the upload`} disabled={locked} onClick={onRemove}><X aria-hidden="true" /></Button>
    </li>
  );
}
