// The fields of the fact page: kind as chips, the title (suggested from the text until the person types one), the text,
// the source link and notes side by side, the three dates folded into one "Dates" line, the picture's licence and people
// for photos and screens, and the tags. Presentational: the page owns the draft (fact-form.ts) and the picture upload.
import { useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { FilledTag, Hint, SegmentedField, SwitchField, TagInput, TextAreaField, TextField } from '@/components/kit';
import { KIND_LABEL, VAULT_KINDS, type VaultKind } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { ChoiceRow } from '../batches/editor/ChoiceRow';
import { LICENCE_CHOICES } from '../library/util';
import { isFileKind } from '../vault-types';
import { datesSummary, editBody, editField, editTitle, todayInput, type FactDraft, type FactForm } from './fact-form';

const KIND_CHOICES = VAULT_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }));

// A titled part of the page: space above, no box.
function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="flex items-center gap-1 text-[13.5px] font-semibold">{title}{hint && <Hint about={title}>{hint}</Hint>}</h2>
      {children}
    </section>
  );
}

export function FactFields({ draft, onDraft, fields, autoRecordedAt, picture, today = todayInput(), autoFocusText }: {
  draft: FactDraft;
  onDraft: (d: FactDraft) => void;
  fields: Record<string, string>;
  // The "Recorded on" value the page filled in for a new fact (today), or null.
  autoRecordedAt: string | null;
  // The picture upload, for photos and screens.
  picture?: ReactNode;
  today?: string;
  // A new fact starts in the text: the title follows it.
  autoFocusText?: boolean;
}) {
  const f = draft.form;
  const set = <K extends Exclude<keyof FactForm, 'title' | 'body'>>(k: K, v: FactForm[K]) => onDraft(editField(draft, k, v));
  const fileKind = isFileKind(f.kind);
  // Open at first when a validity date is set; a problem with a date always opens it.
  const [datesOpen, setDatesOpen] = useState(() => !!(f.validFrom || f.validUntil));
  const dateProblem = !!(fields.recordedAt || fields.validFrom || fields.validUntil);
  const showDates = datesOpen || dateProblem;
  const recordedAuto = !!autoRecordedAt && f.recordedAt === autoRecordedAt;
  const titleAuto = draft.titleAuto && !!f.title;

  return (
    <>
      <Section title="The fact">
        <ChoiceRow<VaultKind> legend="Kind" choices={KIND_CHOICES} value={f.kind} onChange={(v) => set('kind', v as VaultKind)} />
        {fields.kind && <p className="-mt-2 text-[12.5px] font-medium text-destructive" role="alert">{fields.kind}</p>}
        <TextField label={<>Title{titleAuto && <FilledTag>From the text</FilledTag>}</>} value={f.title} onChange={(e) => onDraft(editTitle(draft, e.target.value))} error={fields.title} required maxLength={200} />
        <TextAreaField label={fileKind ? 'Description' : 'Text'} rows={fileKind ? 3 : 7} value={f.body} autoFocus={autoFocusText} onChange={(e) => onDraft(editBody(draft, e.target.value))} error={fields.body} optional={fileKind}
          hint={f.kind === 'figure' ? 'State the figure and what it measures, for example "12 million mobile money accounts in the country".' : fileKind ? 'What the picture shows, in a sentence or two. The AI reads this when choosing pictures.' : 'The fact or story, in plain words. Posts are written from this text.'} />
      </Section>

      <Section title="Source">
        <div className="grid items-start gap-3 md:grid-cols-2">
          <TextField label="Link" type="url" inputMode="url" value={f.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} error={fields.sourceUrl} optional placeholder="https://example.com/report" hint="Where this came from." />
          <TextAreaField label="Notes" rows={1} className="[&_textarea]:min-h-8" value={f.sourceNotes} onChange={(e) => set('sourceNotes', e.target.value)} error={fields.sourceNotes} optional placeholder="Annual report, page 12" hint="Who said it, which document, or how you checked it." />
        </div>
      </Section>

      <section className="flex flex-col gap-3" aria-label="Dates">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" aria-expanded={showDates} aria-controls="fact-dates" onClick={() => setDatesOpen(!showDates)}
            className="-ml-1 inline-flex min-h-7 min-w-0 items-center gap-1.5 rounded-sm px-1 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
            <ChevronRight className={cn('size-3.5 flex-none transition-transform', showDates && 'rotate-90')} aria-hidden="true" />
            <span className="text-[13.5px] font-semibold">Dates</span>
            <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">{datesSummary(f, today)}</span>
          </button>
          <Hint about="Dates">Figures carry the date they were true. Once the valid-until date passes, or the figure is older than the stale limit, it is flagged as stale.</Hint>
        </div>
        {showDates && (
          <div id="fact-dates" className="grid gap-3 md:grid-cols-3">
            <TextField label={<>Recorded on{recordedAuto && <FilledTag>Today</FilledTag>}</>} type="date" value={f.recordedAt} onChange={(e) => set('recordedAt', e.target.value)} error={fields.recordedAt} optional />
            <TextField label="Valid from" type="date" value={f.validFrom} onChange={(e) => set('validFrom', e.target.value)} error={fields.validFrom} optional />
            <TextField label="Valid until" type="date" value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} error={fields.validUntil} optional />
          </div>
        )}
      </section>

      {fileKind && (
        <Section title="Picture">
          {picture}
          <SegmentedField label="Licence or permission" options={LICENCE_CHOICES} value={f.licence} onValueChange={(v) => set('licence', v)} error={fields.licence} />
          <TextField label="Licence notes" value={f.licenceNotes} onChange={(e) => set('licenceNotes', e.target.value)} error={fields.licenceNotes} optional hint="The photographer or stock site to credit, and the licence reference." />
          <p className="text-[12.5px] text-muted-foreground">A picture marked rights still to confirm can go in a draft, but its post cannot be approved until this is settled.</p>
          <SwitchField label="People can be recognised" checked={f.peoplePresent} onCheckedChange={(v) => set('peoplePresent', v)} />
          {f.peoplePresent && (
            <SwitchField label="Their consent is recorded" hintMode="inline" hint="Only when you hold written or recorded permission to use their image." checked={f.consentRecorded} onCheckedChange={(v) => set('consentRecorded', v)} />
          )}
        </Section>
      )}

      <Section title="Tags">
        <TagInput label="Add a tag" values={f.tags} onChange={(t) => set('tags', t)} error={fields.tags} chipsLabel="Tags on this fact" placeholder="news" />
      </Section>
    </>
  );
}
