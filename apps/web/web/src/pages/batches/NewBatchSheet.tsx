// "New batch": make an empty batch by hand, or paste or upload an engine batch file to import. By hand, the period is one tap
// (next month first), the title follows the dates until someone types one, and the time zone is the brand's, under "More".
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { toast } from 'sonner';
import { BusyButton, FilledTag, FormPanel, FormProblem, Lines, Notice, SelectField, TextAreaField, TextField } from '@/components/kit';
import { NetworkToggles } from '@/components/network-toggles';
import { confirmDiscard, useUnsavedGuard, withoutGuard } from '@/hooks/use-unsaved-guard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NETWORKS } from './labels';
import { PeriodChips } from './PeriodChips';
import { periodFor, periodTitle, todayIn, type Period } from './periods';
import type { BatchView } from './types';
import { detailLines } from './util';
import { useAppInfo } from '../../app-info';

const MAX_IMPORT = 2 * 1024 * 1024;

function timeZones(): string[] {
  let zones: string[] = [];
  try { zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []; } catch { zones = []; }
  const base = zones.length ? zones : ['Africa/Lagos', 'Africa/Nairobi', 'Europe/London', 'UTC'];
  return base;
}
const ALL_ZONES = timeZones();
// The brand's own time zone first.
const zonesFor = (home: string) => [home, ...ALL_ZONES.filter((z) => z !== home)];

// The submit buttons live in the dialog's pinned footer, so each form tells the dialog when it is busy or has unsaved input.
type FormState = { busy: boolean; dirty: boolean };

export function NewBatchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState('create');
  const [state, setState] = useState<FormState>({ busy: false, dirty: false });
  const creating = tab === 'create';
  const { busy, dirty } = state;
  const requestClose = () => confirmDiscard(dirty, onClose);
  return (
    <FormPanel
      open={open}
      onClose={requestClose}
      variant="dialog"
      size="md"
      busy={busy}
      title="New batch"
      footer={(
        <>
          <BusyButton variant="outline" onClick={requestClose} disabled={busy}>Cancel</BusyButton>
          <BusyButton type="submit" form={creating ? 'new-batch-form' : 'import-batch-form'} loading={busy}>{creating ? 'Create batch' : 'Import batch'}</BusyButton>
        </>
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="mb-3">
        <TabsList aria-label="How to start" className="h-auto max-w-full">
          <TabsTrigger value="create" disabled={busy} className="max-sm:min-h-11">Create by hand</TabsTrigger>
          <TabsTrigger value="import" disabled={busy} className="max-sm:min-h-11">Advanced: import a batch file</TabsTrigger>
        </TabsList>
      </Tabs>
      {creating ? <CreateForm onClose={onClose} onState={setState} /> : <ImportForm onClose={onClose} onState={setState} />}
    </FormPanel>
  );
}

// Reports the busy and unsaved state upward, and clears it when the form goes away.
function useReportState(busy: boolean, dirty: boolean, onState: (s: FormState) => void) {
  useEffect(() => { onState({ busy, dirty }); }, [busy, dirty, onState]);
  useEffect(() => () => onState({ busy: false, dirty: false }), [onState]);
  useUnsavedGuard(dirty && !busy);
}

function CreateForm({ onClose, onState }: { onClose: () => void; onState: (s: FormState) => void }) {
  const navigate = useNavigate();
  const { brand } = useAppInfo();
  const ZONES = zonesFor(brand.timezone);
  const [timezone, setTimezone] = useState(brand.timezone);
  // The brand's zone can arrive after the form opens: follow it, so an untouched form is not counted as changed.
  useEffect(() => { setTimezone(brand.timezone); }, [brand.timezone]);
  const today = todayIn(brand.timezone);
  // Next month, as Draft with AI starts.
  const [startPeriod] = useState(() => periodFor('month', today));
  const [period, setPeriod] = useState<Period>(startPeriod);
  // The title follows the dates ("December 2026") until someone types one.
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const autoTitle = periodTitle(period);
  const effectiveTitle = (titleTouched ? title.trim() : '') || autoTitle;
  const [defaultTime, setDefaultTime] = useState('09:00');
  const [networks, setNetworks] = useState<string[]>([...NETWORKS]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = (titleTouched && !!title.trim()) || period.from !== startPeriod.from || period.to !== startPeriod.to || timezone !== brand.timezone || defaultTime !== '09:00' || networks.length !== NETWORKS.length;
  useReportState(busy, dirty, onState);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  // A problem with the time zone must be seen.
  useEffect(() => { if (fields.timezone) setMore(true); }, [fields.timezone]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!effectiveTitle) problems.title = 'Give the batch a title';
    if (!networks.length) problems.defaultNetworks = 'Choose at least one network';
    if (period.from && period.to && period.to < period.from) problems.periodEnd = 'The end must be on or after the start';
    setFields(problems);
    setLines([]);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ batch: BatchView }>('/api/batches', {
        title: effectiveTitle, timezone, defaultTime, defaultNetworks: networks,
        ...(period.from ? { periodStart: period.from } : {}), ...(period.to ? { periodEnd: period.to } : {}),
      });
      toast.success('Batch created. Add its first post');
      withoutGuard(() => { onClose(); navigate(`/batches/${r.batch.id}`); });
    } catch (err) {
      setFields(fieldErrors(err));
      setLines(detailLines(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="new-batch-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
      <FormProblem error={error} lines={lines} />
      <PeriodChips today={today} value={period} onChange={setPeriod} optional errors={{ from: fields.periodStart, to: fields.periodEnd }} />
      <TextField
        label={<>Title{!titleTouched && autoTitle && <FilledTag>From the dates</FilledTag>}</>}
        value={titleTouched ? title : autoTitle} placeholder={autoTitle || 'January 2027 posts'} maxLength={200} error={fields.title}
        hint="Follows the dates until you change it. The batch starts empty: you add posts on the next screen."
        onChange={(e) => { setTitleTouched(true); setTitle(e.target.value); }}
      />
      <NetworkToggles value={networks} onChange={setNetworks} error={fields.defaultNetworks} />
      <TextField label="Default time" type="time" value={defaultTime} error={fields.defaultTime} onChange={(e) => setDefaultTime(e.target.value)} hint={`Used by posts that do not set their own. In ${timezone}.`} className="sm:max-w-[calc(50%-0.375rem)]" />
      <div>
        <button
          type="button" aria-expanded={more} aria-controls="new-batch-more" onClick={() => setMore(!more)}
          className="-ml-1 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1 text-sm font-medium outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11"
        >
          {more ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          More
          {!more && <span className="font-normal text-muted-foreground">Time zone: {timezone}</span>}
        </button>
        {more && (
          <div id="new-batch-more" className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField
              label={<>Time zone{timezone === brand.timezone && <FilledTag>The brand's</FilledTag>}</>}
              value={timezone} error={fields.timezone} onValueChange={setTimezone} hint="Post times are read in this zone." options={ZONES.map((z) => ({ value: z, label: z }))}
            />
          </div>
        )}
      </div>
    </form>
  );
}

function ImportForm({ onClose, onState }: { onClose: () => void; onState: (s: FormState) => void }) {
  const navigate = useNavigate();
  const [json, setJson] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  useReportState(busy, !!json.trim(), onState);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setLines([]);
    if (file.size > MAX_IMPORT) { setError('That file is larger than 2 MB. A batch file is much smaller than this.'); setFileKey((k) => k + 1); return; }
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') { setError('Choose a .json file, or paste the text below.'); setFileKey((k) => k + 1); return; }
    try {
      setJson(await file.text());
      setError('');
    } catch {
      setError('That file could not be read. Paste its text below instead.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLines([]);
    if (!json.trim()) { setError('Paste the text of the batch file, or choose a file.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ batch: BatchView; warnings?: string[] }>('/api/batches/import', { json });
      const warnings = r.warnings ?? [];
      toast.success(warnings.length ? `Batch imported with ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}` : 'Batch imported');
      withoutGuard(() => { onClose(); navigate(`/batches/${r.batch.id}`, { state: { importWarnings: warnings } }); });
    } catch (err) {
      setError(errorMessage(err));
      setLines(detailLines(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="import-batch-form" className="flex flex-col gap-3" onSubmit={(e) => void submit(e)} noValidate>
      {error && (
        <Notice tone="bad" title={lines.length ? `${error}. ${lines.length} ${lines.length === 1 ? 'problem' : 'problems'} to fix:` : undefined}>
          {lines.length ? <Lines items={lines} className="max-h-64 overflow-y-auto" /> : error}
        </Notice>
      )}
      <TextField key={fileKey} label="Choose a .json file" optional type="file" accept=".json,application/json" onChange={(e) => void pick(e.target.files?.[0])} />
      <TextAreaField
        label="Batch file text (JSON)" value={json} rows={10} spellCheck={false} mono
        hintMode="inline" hint="Nothing is saved until every post passes the checks."
        onChange={(e) => setJson(e.target.value)}
      />
    </form>
  );
}
