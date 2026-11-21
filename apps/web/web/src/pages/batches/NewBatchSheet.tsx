// "New batch": make an empty batch by hand, or paste or upload an engine batch file to import.
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { networkLabel } from '../../lib/labels';
import { toast } from 'sonner';
import { BusyButton, CheckField, FieldSet, FormPanel, FormProblem, Lines, Notice, SelectField, TextAreaField, TextField } from '@/components/kit';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NETWORKS } from './labels';
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

// The submit buttons live in the panel's pinned footer, so each form tells the panel when it is busy.
export function NewBatchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState('create');
  const [busy, setBusy] = useState(false);
  const creating = tab === 'create';
  return (
    <FormPanel
      open={open}
      onClose={onClose}
      busy={busy}
      title="New batch"
      description="Make an empty batch and add posts to it, or import a batch file you already have."
      footer={(
        <>
          <BusyButton variant="outline" onClick={onClose} disabled={busy}>Cancel</BusyButton>
          <BusyButton type="submit" form={creating ? 'new-batch-form' : 'import-batch-form'} loading={busy}>{creating ? 'Create batch' : 'Import batch'}</BusyButton>
        </>
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList aria-label="How to start" className="h-auto max-w-full">
          <TabsTrigger value="create" disabled={busy} className="max-sm:min-h-11">Create by hand</TabsTrigger>
          <TabsTrigger value="import" disabled={busy} className="max-sm:min-h-11">Import batch JSON</TabsTrigger>
        </TabsList>
      </Tabs>
      {creating ? <CreateForm onClose={onClose} onBusy={setBusy} /> : <ImportForm onClose={onClose} onBusy={setBusy} />}
    </FormPanel>
  );
}

// Reports the busy state upward, and clears it when the form goes away.
function useReportBusy(busy: boolean, onBusy: (busy: boolean) => void) {
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => () => onBusy(false), [onBusy]);
}

function CreateForm({ onClose, onBusy }: { onClose: () => void; onBusy: (busy: boolean) => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const { brand } = useAppInfo();
  const ZONES = zonesFor(brand.timezone);
  const [timezone, setTimezone] = useState(brand.timezone);
  const [defaultTime, setDefaultTime] = useState('09:00');
  const [networks, setNetworks] = useState<string[]>([...NETWORKS]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);
  useReportBusy(busy, onBusy);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (!title.trim()) problems.title = 'Give the batch a title';
    if (!networks.length) problems.defaultNetworks = 'Choose at least one network';
    if (periodStart && periodEnd && periodEnd < periodStart) problems.periodEnd = 'The end must be on or after the start';
    setFields(problems);
    setLines([]);
    if (Object.keys(problems).length) { setError('Check the highlighted fields and try again.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ batch: BatchView }>('/api/batches', {
        title: title.trim(), timezone, defaultTime, defaultNetworks: networks,
        ...(periodStart ? { periodStart } : {}), ...(periodEnd ? { periodEnd } : {}),
      });
      toast.success('Batch created. Add its first post');
      onClose();
      navigate(`/batches/${r.batch.id}`);
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
      <TextField label="Title" value={title} maxLength={200} error={fields.title} onChange={(e) => setTitle(e.target.value)} hint="For example: January 2027 posts" />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <SelectField label="Time zone" value={timezone} error={fields.timezone} onValueChange={setTimezone} hint="Post times are read in this zone." options={ZONES.map((z) => ({ value: z, label: z }))} />
        <TextField label="Default time" type="time" value={defaultTime} error={fields.defaultTime} onChange={(e) => setDefaultTime(e.target.value)} hint="Used by posts that do not set their own." />
      </div>
      <FieldSet legend="Networks" error={fields.defaultNetworks}>
        {NETWORKS.map((n) => (
          <CheckField key={n} label={networkLabel(n)} checked={networks.includes(n)} onCheckedChange={(c) => setNetworks(c ? [...networks, n] : networks.filter((x) => x !== n))} />
        ))}
      </FieldSet>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <TextField label="Period starts" optional type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        <TextField label="Period ends" optional type="date" value={periodEnd} error={fields.periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} hint="Left empty, the period follows the posts you add." />
      </div>
      <p className="text-sm text-muted-foreground">The batch starts empty. You add posts on the next screen.</p>
    </form>
  );
}

function ImportForm({ onClose, onBusy }: { onClose: () => void; onBusy: (busy: boolean) => void }) {
  const navigate = useNavigate();
  const [json, setJson] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  useReportBusy(busy, onBusy);
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
    if (!json.trim()) { setError('Paste the batch JSON, or choose a file.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await api.post<{ batch: BatchView; warnings?: string[] }>('/api/batches/import', { json });
      const warnings = r.warnings ?? [];
      toast.success(warnings.length ? `Batch imported with ${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}` : 'Batch imported');
      onClose();
      navigate(`/batches/${r.batch.id}`, { state: { importWarnings: warnings } });
    } catch (err) {
      setError(errorMessage(err));
      setLines(detailLines(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="import-batch-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
      {error && (
        <Notice tone="bad" title={lines.length ? `${error}. ${lines.length} ${lines.length === 1 ? 'problem' : 'problems'} to fix:` : undefined}>
          {lines.length ? <Lines items={lines} className="max-h-64 overflow-y-auto" /> : error}
        </Notice>
      )}
      <TextField key={fileKey} label="Choose a .json file" optional type="file" accept=".json,application/json" onChange={(e) => void pick(e.target.files?.[0])} />
      <TextAreaField
        label="Batch JSON" value={json} rows={14} spellCheck={false} mono
        hint="The same format as a batch file for the command line tools. Nothing is saved until every post passes the checks."
        onChange={(e) => setJson(e.target.value)}
      />
    </form>
  );
}
