import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Notice } from '@/components/notice';
import { RunProgress, RunStatusBadge, runSummary } from '@/components/activity-parts';
import { useActivity } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { isActive } from '@/lib/activity';
import { TextField } from '@/components/text-field';
import { useDocumentTitle, useLoad } from '../hooks';
import { errorMessage, fieldErrors, formProblem } from '../lib/errors';
import { PROVIDER_KIND_LABEL, SEARCH_KIND_LABEL, TASK_LABEL } from '../lib/labels';
import { ConfirmAction } from './kit/confirm-action';
import { DataList, type Col } from './kit/data-list';
import { CheckField, FieldGroup, SelectField } from './kit/fields';
import { FormPanel } from '@/components/form-panel';
import { PageHeader } from './kit/page-header';
import { BusyButton, EmptyBlock, ErrorBlock } from './kit/states';
import { TagChips } from './kit/tags';

interface Provider { id: string; name: string; kind: 'anthropic' | 'openai-compatible'; baseUrl: string; model: string; keyLast4: string; tasks: string[]; enabled: boolean; inputPricePerMTok: number | null; outputPricePerMTok: number | null }
interface Settings {
  providers: Provider[];
  search: { kind: 'brave' | 'tavily' | 'exa'; keyLast4: string } | null;
  budget: { monthlyBudgetUsd: number | null; spentUsd: number; unpricedCalls: number; month: string };
  topics: string[];
}
const TASKS = ['draft', 'research', 'rewrite'] as const;
const usd = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD' });
const sm = 'max-sm:min-h-11';

const KIND_OPTIONS = [{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai-compatible', label: 'OpenAI-compatible (any service with that interface)' }];
const SEARCH_OPTIONS = Object.entries(SEARCH_KIND_LABEL).map(([value, label]) => ({ value, label }));

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the settings">
      {[0, 1, 2].map((i) => <Card key={i} className="gap-3 p-5"><Skeleton className="h-6 w-1/4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-9 w-full" /></Card>)}
    </div>
  );
}

export function AiSettings() {
  useDocumentTitle('AI and search');
  const state = useLoad(() => api.get<Settings>('/api/settings/ai'), []);
  const data = state.data;

  return (
    <>
      <PageHeader title="AI and search" description="Which AI services write and check posts, how much they may spend, and what the weekly research looks for. Keys are stored encrypted and cannot be read back." />
      {state.loading && !data ? <SettingsSkeleton />
        : state.error ? <Card className="gap-0 p-0"><ErrorBlock message={state.error} onRetry={() => void state.reload()} /></Card>
        : data && (
          <div className="flex flex-col gap-6">
            <Providers providers={data.providers} onChanged={() => void state.reload()} />
            <SearchCard search={data.search} onChanged={() => void state.reload()} />
            <BudgetCard budget={data.budget} onChanged={() => void state.reload()} />
            <TopicsCard topics={data.topics} ready={data.providers.some((p) => p.enabled && p.tasks.includes('research')) && !!data.search} onChanged={() => void state.reload()} />
          </div>
        )}
    </>
  );
}

function Providers({ providers, onChanged }: { providers: Provider[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Provider | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const columns: Col<Provider>[] = [
    { key: 'name', header: 'Name', primary: true, cell: (p) => <>{p.name}<span className="block text-[13px] font-normal text-muted-foreground">{PROVIDER_KIND_LABEL[p.kind]}</span></> },
    { key: 'model', header: 'Model', cell: (p) => <span className="font-mono [overflow-wrap:anywhere]">{p.model}</span> },
    { key: 'tasks', header: 'Used for', cell: (p) => p.tasks.map((t) => TASK_LABEL[t] ?? t).join(', ') },
    { key: 'key', header: 'Key', cell: (p) => <span className="whitespace-nowrap font-mono">{`•••• ${p.keyLast4}`}</span> },
    { key: 'on', header: 'Status', cell: (p) => (p.enabled ? <Badge variant="success">On</Badge> : <Badge variant="quiet">Off</Badge>) },
    {
      key: 'actions', header: 'Actions', actions: true,
      cell: (p) => (
        <div className="flex flex-wrap justify-end gap-2 max-md:justify-start">
          <Button variant="outline" size="sm" className={sm} onClick={() => setEditing(p)}>Edit</Button>
          <Button variant="outline" size="sm" className={sm} onClick={() => setDeleting(p)}>Delete</Button>
        </div>
      ),
    },
  ];
  return (
    <Card className="gap-0 overflow-hidden p-0" aria-label="AI providers">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 p-5 max-sm:p-4">
        <div className="min-w-0 flex-1 basis-72">
          <CardTitle className="text-lg">AI providers</CardTitle>
          <CardDescription className="mt-0.5">Each provider is used for the tasks you tick. The desk tries enabled providers in the order they were added.</CardDescription>
        </div>
        <Button className={sm} onClick={() => setEditing('new')}><Plus aria-hidden="true" />Add a provider</Button>
      </CardHeader>
      {providers.length === 0 ? <EmptyBlock title="No AI provider yet">Add one to let the desk draft batches, rewrite posts and run research.</EmptyBlock>
        : <DataList caption="AI providers" columns={columns} rows={providers} rowKey={(p) => p.id} />}
      {editing && <ProviderSheet key={editing === 'new' ? 'new' : editing.id} provider={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(created) => { setEditing(null); toast.success(created ? 'AI provider added' : 'AI provider saved'); onChanged(); }} />}
      <ConfirmAction
        open={!!deleting}
        title="Delete this AI provider?"
        message={<>The provider <strong>{deleting?.name}</strong> and its stored key will be deleted. This cannot be undone.</>}
        confirmLabel="Delete provider"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const p = deleting!;
          await api.delete(`/api/settings/ai/providers/${p.id}`);
          setDeleting(null);
          toast.success(`Provider ${p.name} deleted`);
          onChanged();
        }}
      />
    </Card>
  );
}

function ProviderSheet({ provider, onClose, onSaved }: { provider: Provider | null; onClose: () => void; onSaved: (created: boolean) => void }) {
  const [name, setName] = useState(provider?.name ?? '');
  const [kind, setKind] = useState<Provider['kind']>(provider?.kind ?? 'anthropic');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [model, setModel] = useState(provider?.model ?? '');
  const [apiKey, setApiKey] = useState('');
  const [tasks, setTasks] = useState<string[]>(provider?.tasks ?? ['draft', 'rewrite']);
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [inputPrice, setInputPrice] = useState(provider?.inputPricePerMTok == null ? '' : String(provider.inputPricePerMTok));
  const [outputPrice, setOutputPrice] = useState(provider?.outputPricePerMTok == null ? '' : String(provider.outputPricePerMTok));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const problems: Record<string, string> = {};
    if (!name.trim()) problems.name = 'Give the provider a name';
    if (!model.trim()) problems.model = 'Enter the model name';
    if (kind === 'openai-compatible' && !baseUrl.trim()) problems.baseUrl = 'Enter the address of the service, such as https://api.example.com/v1';
    if (baseUrl.trim() && !/^https?:\/\//i.test(baseUrl.trim())) problems.baseUrl = 'The address must start with https://';
    if (!provider && apiKey.trim().length < 8) problems.apiKey = 'Paste the provider key';
    if (/\s/.test(apiKey.trim())) problems.apiKey = 'The key cannot contain spaces';
    if (tasks.length === 0) problems.tasks = 'Pick at least one task';
    const prices = [inputPrice.trim(), outputPrice.trim()];
    if (prices.some(Boolean) && !prices.every(Boolean)) problems.inputPricePerMTok = 'Enter both prices, or leave both empty';
    else if (prices.some((v) => v && !(Number(v) >= 0))) problems.inputPricePerMTok = 'Prices are numbers such as 3 or 15.5';
    setFields(problems);
    if (Object.keys(problems).length) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), kind, model: model.trim(), tasks, enabled, inputPricePerMTok: inputPrice.trim() ? Number(inputPrice) : null, outputPricePerMTok: outputPrice.trim() ? Number(outputPrice) : null, ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) };
      if (provider) await api.patch(`/api/settings/ai/providers/${provider.id}`, body);
      else await api.post('/api/settings/ai/providers', body);
      onSaved(!provider);
    } catch (err) {
      setFields(fieldErrors(err));
      setError(formProblem(err, ['name', 'kind', 'baseUrl', 'model', 'apiKey', 'tasks', 'inputPricePerMTok']));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormPanel open onClose={onClose} busy={busy} title={provider ? `Edit ${provider.name}` : 'Add an AI provider'}
      footer={<><Button variant="outline" className={sm} onClick={onClose} disabled={busy}>Cancel</Button><BusyButton type="submit" form="provider-form" busy={busy}>{provider ? 'Save changes' : 'Add provider'}</BusyButton></>}>
      <form id="provider-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} required autoFocus hint="Only for you, such as Claude main." />
        <SelectField label="Kind" value={kind} onValueChange={(v) => setKind(v as Provider['kind'])} options={KIND_OPTIONS} error={fields.kind} />
        <TextField label="Service address" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} error={fields.baseUrl} mono optional={kind === 'anthropic'}
          placeholder={kind === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.example.com/v1'} hint={kind === 'anthropic' ? 'Leave blank to use Anthropic directly.' : 'Must start with https://.'} />
        <TextField label="Model" value={model} onChange={(e) => setModel(e.target.value)} error={fields.model} mono required />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Input price" optional type="number" inputMode="decimal" min={0} step="any" value={inputPrice} onChange={(e) => setInputPrice(e.target.value)} error={fields.inputPricePerMTok} hint="US dollars per million tokens, from the vendor's price list." />
          <TextField label="Output price" optional type="number" inputMode="decimal" min={0} step="any" value={outputPrice} onChange={(e) => setOutputPrice(e.target.value)} hint="Without both prices the cost of a call is unknown and the budget cannot count it." />
        </div>
        <TextField label={provider ? 'New key' : 'Key'} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} error={fields.apiKey} mono optional={!!provider}
          placeholder={provider ? `Leave blank to keep the key ending ${provider.keyLast4}` : ''} hint="Stored encrypted. It cannot be shown again." />
        <FieldGroup legend="Use this provider for" error={fields.tasks}>
          {TASKS.map((t) => (
            <CheckField key={t} label={TASK_LABEL[t]} checked={tasks.includes(t)} onCheckedChange={(on) => setTasks(on ? [...tasks, t] : tasks.filter((x) => x !== t))} />
          ))}
        </FieldGroup>
        <CheckField label="Switched on" hint="Turn off to stop using it without deleting it." checked={enabled} onCheckedChange={setEnabled} />
        {error && <Notice tone="bad">{error}</Notice>}
      </form>
    </FormPanel>
  );
}

function SearchCard({ search, onChanged }: { search: Settings['search']; onChanged: () => void }) {
  const [kind, setKind] = useState<'brave' | 'tavily' | 'exa'>(search?.kind ?? 'brave');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(''); setFields({});
    if (!search && apiKey.trim().length < 8) { setFields({ apiKey: 'Paste the search key' }); return; }
    setBusy(true);
    try {
      await api.put('/api/settings/ai/search', { kind, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) });
      setApiKey('');
      toast.success('Search service saved');
      onChanged();
    } catch (err) {
      setFields(fieldErrors(err));
      setError(formProblem(err, ['apiKey']));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="gap-4 p-5 max-sm:p-4" aria-label="Search service">
      <CardHeader className="gap-0.5 p-0">
        <CardTitle className="text-lg">Search service</CardTitle>
        <CardDescription>Research looks things up on the web through this service, so it does not depend on one AI vendor.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <form className="flex max-w-[520px] flex-col gap-4" onSubmit={(e) => void save(e)} noValidate>
          <SelectField label="Service" value={kind} onValueChange={(v) => setKind(v as typeof kind)} options={SEARCH_OPTIONS} />
          <TextField label={search ? 'New key' : 'Key'} type="password" autoComplete="off" mono value={apiKey} onChange={(e) => setApiKey(e.target.value)} error={fields.apiKey} optional={!!search}
            placeholder={search ? `Leave blank to keep the key ending ${search.keyLast4}` : ''} hint="Stored encrypted. It cannot be shown again." />
          {error && <Notice tone="bad">{error}</Notice>}
          <div><BusyButton type="submit" busy={busy}>Save search service</BusyButton></div>
        </form>
      </CardContent>
    </Card>
  );
}

function BudgetCard({ budget, onChanged }: { budget: Settings['budget']; onChanged: () => void }) {
  const [value, setValue] = useState(budget.monthlyBudgetUsd === null ? '' : String(budget.monthlyBudgetUsd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pct = budget.monthlyBudgetUsd ? Math.min(100, Math.round((budget.spentUsd / budget.monthlyBudgetUsd) * 100)) : null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError('');
    const n = Number(value);
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) { setError('Enter the most the AI may spend each month, in US dollars. Use 0 to stop AI spending.'); return; }
    setBusy(true);
    try {
      await api.put('/api/settings/ai/budget', { monthlyBudgetUsd: n });
      toast.success('Monthly budget saved');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="gap-4 p-5 max-sm:p-4" aria-label="Monthly budget">
      <CardHeader className="gap-0.5 p-0">
        <CardTitle className="text-lg">Monthly budget</CardTitle>
        <CardDescription>AI work stops for the month when this is reached.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <form className="flex max-w-[520px] flex-col gap-4" onSubmit={(e) => void save(e)} noValidate>
          <TextField label="Budget per month (US dollars)" type="number" inputMode="decimal" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} error={error} />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Spent in {budget.month}: <strong className="text-foreground">{usd.format(budget.spentUsd)}</strong>
            {pct !== null && <> ({pct}% of the budget)</>}
            {budget.monthlyBudgetUsd === null && <>. No budget is set yet, so the AI will not run until you set one.</>}
            {budget.unpricedCalls > 0 && <>. {budget.unpricedCalls} {budget.unpricedCalls === 1 ? 'call' : 'calls'} this month had no price, so {budget.unpricedCalls === 1 ? 'it is' : 'they are'} not counted. Add the provider's prices above.</>}
          </p>
          <div><BusyButton type="submit" busy={busy}>Save budget</BusyButton></div>
        </form>
      </CardContent>
    </Card>
  );
}

function TopicsCard({ topics, ready, onChanged }: { topics: string[]; ready: boolean; onChanged: () => void }) {
  const [list, setList] = useState(topics);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(list) !== JSON.stringify(topics);
  // The newest research run: shown while it works, and as the last result after.
  const runs = useActivity({ kind: 'research-run', pageSize: 1, withResult: true });
  const last = runs.items[0] ?? null;
  const working = !!last && isActive(last);
  const now = useNow(working);

  function add() {
    const t = draft.trim();
    if (!t) return;
    if (t.length > 200) { setError('A topic can be at most 200 characters.'); return; }
    if (list.some((x) => x.toLowerCase() === t.toLowerCase())) { setError('That topic is already in the list.'); return; }
    if (list.length >= 50) { setError('The list can hold at most 50 topics.'); return; }
    setError('');
    setList([...list, t]);
    setDraft('');
  }
  async function save() {
    setBusy(true); setError('');
    try {
      await api.put('/api/settings/research/topics', { topics: list });
      toast.success('Research topics saved');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function runNow() {
    setRunning(true); setError('');
    try {
      const r = await api.post<{ queued: boolean; alreadyQueued: boolean }>('/api/settings/research/run');
      if (r.queued) toast.success('Research run started. New items appear in the vault as unconfirmed');
      else toast.success('A research run is already waiting, so no second one was started');
      await runs.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }
  return (
    <Card className="gap-4 p-5 max-sm:p-4" aria-label="Research topics">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 p-0">
        <div className="min-w-0 flex-1 basis-72">
          <CardTitle className="text-lg">Research topics</CardTitle>
          <CardDescription className="mt-0.5">What the weekly research looks for. Everything it finds goes into the vault as unconfirmed, for a person to check.</CardDescription>
        </div>
        <BusyButton variant="outline" busy={running || working} disabled={dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => void runNow()}>Run research now</BusyButton>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-0">
        {!ready && <Notice tone="info" title="Research is not ready yet.">It needs an enabled AI provider ticked for research, and a search service with a key.</Notice>}
        {list.length === 0
          ? <p className="text-muted-foreground">No topics yet. Add the subjects to watch, for example news about your market or changes to the rules in your field.</p>
          : <TagChips tags={list} label="Topics" removeLabel={(t) => `Remove ${t}`} onRemove={(t) => setList(list.filter((x) => x !== t))} />}
        <form className="flex items-end gap-2.5" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <TextField className="flex-1" label="Add a topic" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} />
          <Button type="submit" variant="outline" className="max-sm:h-11">Add</Button>
        </form>
        {error && <Notice tone="bad">{error}</Notice>}
        {last && (
          <section aria-label="Latest research run" className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{working ? 'Research is running' : 'Last research run'}</h3>
              <RunStatusBadge run={last} />
            </div>
            {working
              ? <RunProgress run={last} now={now} />
              : <p className={last.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{runSummary(last) || 'It ended without a summary.'}</p>}
            <Link to={`/activity/${last.id}`} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline max-sm:py-2.5">{working ? 'Follow it in Activity' : 'See what it found and skipped'}</Link>
          </section>
        )}
        <div className="flex flex-wrap gap-2.5">
          <BusyButton busy={busy} disabled={!dirty} onClick={() => void save()}>Save topics</BusyButton>
          {dirty && <Button variant="ghost" className={sm} onClick={() => { setList(topics); setError(''); }}>Undo changes</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
