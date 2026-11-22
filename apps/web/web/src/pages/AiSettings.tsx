import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BusyButton, CheckField, ConfirmAction, DataList, EmptyBlock, ErrorBlock, FieldGroup, FilledTag, FormPanel, MoreMenu, Notice, SwitchField, TagChips, TextField, ToneBadge, type Column } from '@/components/kit';
import { FineTune } from '@/components/kit/fine-tune';
import { SegmentedField } from '@/components/kit/segmented-field';
import { PROVIDER_ADDRESS, addressIsDefault, modelPresets, modelSummary, newProviderDraft, presetFor, pricesFromModel, withKind, withModel, type ProviderDraft, type ProviderKind } from '../lib/ai-presets';
import { RunProgress, RunStatusBadge, runSummary } from '@/components/activity-parts';
import { useActivity } from '@/hooks/use-activity';
import { useNow } from '@/hooks/use-now';
import { isActive } from '@/lib/activity';
import { useDocumentTitle, useLoad } from '../hooks';
import { errorMessage, fieldErrors, formProblem } from '../lib/errors';
import { confirmDiscard, useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { Section, SettingsPage } from './settings/section';
import { PROVIDER_KIND_LABEL, SEARCH_KIND_LABEL, TASK_LABEL } from '../lib/labels';

interface Provider { id: string; name: string; kind: ProviderKind; baseUrl: string; model: string; keyLast4: string; tasks: string[]; enabled: boolean; inputPricePerMTok: number | null; outputPricePerMTok: number | null }
interface Settings {
  providers: Provider[];
  search: { kind: 'brave' | 'tavily' | 'exa'; keyLast4: string } | null;
  budget: { monthlyBudgetUsd: number | null; spentUsd: number; unpricedCalls: number; month: string };
  topics: string[];
}
const TASKS = ['draft', 'research', 'rewrite'] as const;
const usd = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'USD' });
const sm = 'max-sm:min-h-11';
// One bordered container; the list's rows are separated by hairlines.
const LIST = 'overflow-hidden rounded-lg border';

const KIND_OPTIONS: Array<{ value: ProviderKind; label: string }> = [{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai-compatible', label: 'OpenAI-compatible' }];
const SEARCH_OPTIONS = Object.entries(SEARCH_KIND_LABEL).map(([value, label]) => ({ value, label }));

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the settings">
      {[0, 1, 2].map((i) => <div key={i} className="flex flex-col gap-3"><Skeleton className="h-5 w-1/4" /><Skeleton className="h-9 w-full" /></div>)}
    </div>
  );
}

export function AiSettings() {
  useDocumentTitle('AI and search');
  const state = useLoad(() => api.get<Settings>('/api/settings/ai'), []);
  const data = state.data;

  return (
    <SettingsPage title="AI and search" description="Keys are stored encrypted and cannot be shown again.">
      {state.loading && !data ? <SettingsSkeleton />
        : state.error ? <div className={LIST}><ErrorBlock message={state.error} onRetry={() => void state.reload()} /></div>
        : data && (
          <>
            <Providers providers={data.providers} onChanged={() => void state.reload()} />
            <SearchCard search={data.search} onChanged={() => void state.reload()} />
            <BudgetCard budget={data.budget} onChanged={() => void state.reload()} />
            <TopicsCard topics={data.topics} ready={data.providers.some((p) => p.enabled && p.tasks.includes('research')) && !!data.search} onChanged={() => void state.reload()} />
          </>
        )}
    </SettingsPage>
  );
}

// Shown beside a section's title while it has changes that are not saved yet.
function NotSaved({ show }: { show: boolean }) {
  return show ? <Badge variant="warning" role="status">Not saved</Badge> : null;
}

function Providers({ providers, onChanged }: { providers: Provider[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Provider | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Provider | null>(null);
  const columns: Column<Provider>[] = [
    { key: 'name', header: 'Name', primary: true, cell: (p) => <>{p.name}<span className="block text-[13px] font-normal text-muted-foreground">{PROVIDER_KIND_LABEL[p.kind]}</span></> },
    { key: 'model', header: 'Model', cell: (p) => <span className="font-mono [overflow-wrap:anywhere]">{p.model}</span> },
    { key: 'tasks', header: 'Used for', cell: (p) => p.tasks.map((t) => TASK_LABEL[t] ?? t).join(', ') },
    { key: 'key', header: 'Key', cell: (p) => <span className="whitespace-nowrap font-mono">{`•••• ${p.keyLast4}`}</span> },
    { key: 'on', header: 'Status', cell: (p) => (p.enabled ? <ToneBadge tone="good" dot>On</ToneBadge> : <ToneBadge tone="quiet" dot>Off</ToneBadge>) },
    {
      key: 'actions', header: 'Actions', actions: true,
      cell: (p) => (
        <MoreMenu label={`Actions for ${p.name}`} items={[
          { label: 'Edit', onSelect: () => setEditing(p) },
          { label: 'Delete provider', tone: 'danger', onSelect: () => setDeleting(p) },
        ]} />
      ),
    },
  ];
  return (
    <Section id="ai-providers" title="AI providers" description="Each provider is used for the tasks you tick. The app tries enabled providers in the order they were added."
      aside={<Button variant="outline" size="sm" className={sm} onClick={() => setEditing('new')}><Plus aria-hidden="true" />Add a provider</Button>}>
      <div className={LIST}>
        {providers.length === 0 ? <EmptyBlock title="No AI provider yet">Add one to let the app draft batches, rewrite posts and run research.</EmptyBlock>
          : <DataList caption="AI providers" columns={columns} rows={providers} rowKey={(p) => p.id} />}
      </div>
      {editing && <ProviderDialog key={editing === 'new' ? 'new' : editing.id} provider={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={(created) => { setEditing(null); toast.success(created ? 'AI provider added' : 'AI provider saved'); onChanged(); }} />}
      <ConfirmAction
        open={!!deleting}
        title="Delete this AI provider?"
        message={<>The provider <strong>{deleting?.name}</strong> and its stored key will be deleted. This cannot be undone.</>}
        confirmLabel="Delete provider"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const p = deleting!;
          await api.delete(`/api/settings/ai/providers/${p.id}`);
          setDeleting(null);
          toast.success(`Provider ${p.name} deleted`);
          onChanged();
        }}
      />
    </Section>
  );
}

function ProviderDialog({ provider, onClose, onSaved }: { provider: Provider | null; onClose: () => void; onSaved: (created: boolean) => void }) {
  const priceText = (v: number | null | undefined) => (v == null ? '' : String(v));
  // What the dialog opened with: the provider as saved, or a new one with Anthropic's address and the recommended model filled in.
  const [initial] = useState<ProviderDraft>(() => (provider
    ? { kind: provider.kind, baseUrl: provider.baseUrl, model: provider.model, inputPrice: priceText(provider.inputPricePerMTok), outputPrice: priceText(provider.outputPricePerMTok) }
    : newProviderDraft()));
  const [name, setName] = useState(provider?.name ?? '');
  const [draft, setDraft] = useState<ProviderDraft>(initial);
  const { kind, baseUrl, model, inputPrice, outputPrice } = draft;
  const [apiKey, setApiKey] = useState('');
  const [tasks, setTasks] = useState<string[]>(provider?.tasks ?? ['draft', 'rewrite']);
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  const dirty = name !== (provider?.name ?? '') || (Object.keys(initial) as Array<keyof ProviderDraft>).some((k) => draft[k] !== initial[k])
    || apiKey !== '' || enabled !== (provider?.enabled ?? true)
    || [...tasks].sort().join() !== [...(provider?.tasks ?? ['draft', 'rewrite'])].sort().join();
  useUnsavedGuard(dirty);
  const requestClose = () => confirmDiscard(dirty && !busy, onClose);
  const presets = modelPresets(kind);
  const preset = presetFor(kind, model);
  // A known provider shows its models as a choice and keeps the exact id and address under Fine-tune; any other shows both as fields.
  const known = presets.length > 0;

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

  // "Auto" while the address is the kind's own; "From the model" while the prices are the model's known ones. Both go once a person types.
  const addressTag = addressIsDefault(baseUrl) && baseUrl.trim().replace(/\/+$/, '') === PROVIDER_ADDRESS[kind] ? <FilledTag /> : null;
  const addressField = (
    <TextField label={<>Service address{addressTag}</>} value={baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} error={fields.baseUrl} mono optional={kind === 'anthropic'}
      placeholder={PROVIDER_ADDRESS[kind]}
      hint={kind === 'anthropic' ? 'Anthropic\'s own address. Change it only to go through a gateway.' : 'Filled with OpenAI\'s address. For another service, the web address it gave you for its API. It must start with https://.'} />
  );
  const modelField = (
    <TextField label="Model" value={model} onChange={(e) => setDraft(withModel(draft, e.target.value))} error={fields.model} mono required placeholder={known ? 'claude-sonnet-5-5' : 'gpt-5-mini'}
      hint="The name of the model this provider should use, exactly as the provider spells it." />
  );
  const pricesTag = pricesFromModel(draft) ? <FilledTag>From the model</FilledTag> : null;
  const priceFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label={<>Input price{pricesTag}</>} optional type="number" inputMode="decimal" min={0} step="any" placeholder="For example 3" value={inputPrice} onChange={(e) => setDraft({ ...draft, inputPrice: e.target.value })} error={fields.inputPricePerMTok}
        hint="US dollars for each million tokens sent to the model. It is on the provider's price page." />
      <TextField label={<>Output price{pricesTag}</>} optional type="number" inputMode="decimal" min={0} step="any" placeholder="For example 15" value={outputPrice} onChange={(e) => setDraft({ ...draft, outputPrice: e.target.value })}
        hint="US dollars for each million tokens the model writes back. Without both prices the cost of a call is unknown and the budget cannot count it." />
    </div>
  );
  // A problem on a value under Fine-tune opens it.
  const hiddenProblem = !!(fields.inputPricePerMTok || (known && (fields.baseUrl || fields.model)));

  return (
    <FormPanel open variant="dialog" size="lg" onClose={requestClose} busy={busy} title={provider ? `Edit ${provider.name}` : 'Add an AI provider'}
      footer={<><Button variant="outline" className={sm} onClick={requestClose} disabled={busy}>Cancel</Button><BusyButton type="submit" form="provider-form" loading={busy}>{provider ? 'Save changes' : 'Add provider'}</BusyButton></>}>
      <form id="provider-form" className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} required autoFocus placeholder="Claude main" hint="Only for you." />
          <SegmentedField label="Kind" value={kind} onValueChange={(v) => setDraft(withKind(draft, v))} options={KIND_OPTIONS} error={fields.kind}
            hint="OpenAI-compatible is any service with OpenAI's interface; give its address and model." />
        </div>
        <TextField label={provider ? 'New key' : 'Key'} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} error={fields.apiKey} mono optional={!!provider}
          placeholder={provider ? `Leave blank to keep the key ending ${provider.keyLast4}` : ''} hintMode="inline" hint="Stored encrypted. It cannot be shown again." />
        {known ? (
          <div className="flex flex-col gap-1.5">
            <SegmentedField label="Model" value={preset?.id ?? null} onValueChange={(id) => setDraft(withModel(draft, presets.find((p) => p.id === id)!.model))}
              options={presets.map((p) => ({ value: p.id, label: p.label }))}
              tag={preset ? null : <span className="ml-1 rounded-full border px-1.5 py-px text-[11px] font-medium text-muted-foreground">Custom</span>}
              hint="Recommended suits most work. Best quality costs more; Faster, cheaper suits short rewrites. The exact model and its prices are under Fine-tune." />
            <p className="font-mono text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{modelSummary(draft)}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">{addressField}{modelField}</div>
        )}
        <FineTune force={hiddenProblem || (known && !preset)} summary={known ? 'Model id, address and prices' : 'Prices'}>
          {known && <>{modelField}{addressField}</>}
          {priceFields}
        </FineTune>
        <FieldGroup legend="Use this provider for" error={fields.tasks}>
          {TASKS.map((t) => (
            <CheckField key={t} label={TASK_LABEL[t]} checked={tasks.includes(t)} onCheckedChange={(on) => setTasks(on ? [...tasks, t] : tasks.filter((x) => x !== t))} />
          ))}
        </FieldGroup>
        <SwitchField label="Switched on" hint="Turn off to stop using it without deleting it." checked={enabled} onCheckedChange={setEnabled} />
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
  const dirty = kind !== (search?.kind ?? 'brave') || apiKey !== '';
  useUnsavedGuard(dirty);

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
    <Section id="search-service" title="Search service" description="Research looks things up on the web through this service, so it does not depend on one AI vendor." aside={<NotSaved show={dirty} />}>
      <form className="flex max-w-[520px] flex-col gap-3" onSubmit={(e) => void save(e)} noValidate>
        <SegmentedField label="Service" value={kind} onValueChange={(v) => setKind(v as typeof kind)} options={SEARCH_OPTIONS} />
        <TextField label={search ? 'New key' : 'Key'} type="password" autoComplete="off" mono value={apiKey} onChange={(e) => setApiKey(e.target.value)} error={fields.apiKey} optional={!!search}
          placeholder={search ? `Leave blank to keep the key ending ${search.keyLast4}` : ''} />
        {error && <Notice tone="bad">{error}</Notice>}
        <div><BusyButton type="submit" loading={busy} disabled={!dirty}>Save search service</BusyButton></div>
      </form>
    </Section>
  );
}

function BudgetCard({ budget, onChanged }: { budget: Settings['budget']; onChanged: () => void }) {
  const [value, setValue] = useState(budget.monthlyBudgetUsd === null ? '' : String(budget.monthlyBudgetUsd));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = value.trim() === '' ? budget.monthlyBudgetUsd !== null : Number(value) !== budget.monthlyBudgetUsd;
  useUnsavedGuard(dirty);
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
    <Section id="monthly-budget" title="Monthly budget" description="AI work stops for the month when this is reached." aside={<NotSaved show={dirty} />}>
      <form className="flex max-w-[520px] flex-col gap-3" onSubmit={(e) => void save(e)} noValidate>
        <TextField label="Budget per month (US dollars)" type="number" inputMode="decimal" min={0} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} error={error} />
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          Spent in {budget.month}: <strong className="text-foreground">{usd.format(budget.spentUsd)}</strong>
          {pct !== null && <> ({pct}% of the budget)</>}
          {budget.unpricedCalls > 0 && <>. {budget.unpricedCalls} {budget.unpricedCalls === 1 ? 'call' : 'calls'} this month had no price, so {budget.unpricedCalls === 1 ? 'it is' : 'they are'} not counted. Add the provider's prices above.</>}
        </p>
        {!(budget.monthlyBudgetUsd && budget.monthlyBudgetUsd > 0) && <p className="text-[13px] text-warning-foreground">{budget.monthlyBudgetUsd === null ? 'No budget is set yet' : 'The budget is zero'}, so the AI does not run.</p>}
        <div><BusyButton type="submit" loading={busy} disabled={!dirty}>Save budget</BusyButton></div>
      </form>
    </Section>
  );
}

function TopicsCard({ topics, ready, onChanged }: { topics: string[]; ready: boolean; onChanged: () => void }) {
  const [list, setList] = useState(topics);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(list) !== JSON.stringify(topics);
  useUnsavedGuard(dirty);
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
  function removeTopic(t: string) {
    const at = list.indexOf(t);
    setList((cur) => cur.filter((x) => x !== t));
    toast(`Removed "${t}"`, {
      duration: 8000,
      action: { label: 'Undo', onClick: () => setList((cur) => (cur.includes(t) ? cur : [...cur.slice(0, at), t, ...cur.slice(at)])) },
    });
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
      if (r.queued) toast.success('Research run started. New items appear in Facts as unconfirmed');
      else toast.success('A research run is already waiting, so no second one was started');
      await runs.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }
  return (
    <Section id="research-topics" title="Research topics" description="What the weekly research looks for. Everything it finds goes into Facts as unconfirmed, for a person to check." aside={<><NotSaved show={dirty} /><BusyButton variant="outline" size="sm" loading={running || working} disabled={dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => void runNow()}>Run research now</BusyButton></>}>
      <div className="flex flex-col gap-3">
        {!ready && <Notice tone="info" title="Research is not ready yet.">It needs an enabled AI provider ticked for research, and a search service with a key.</Notice>}
        {list.length === 0
          ? <p className="text-muted-foreground">No topics yet. Add the subjects to watch, such as news about your market.</p>
          : <TagChips tags={list} label="Topics" removeLabel={(t) => `Remove ${t}`} onRemove={removeTopic} />}
        <form className="flex max-w-[520px] items-end gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <TextField className="flex-1" label="Add a topic" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} />
          <Button type="submit" variant="outline" className="max-sm:h-11">Add</Button>
        </form>
        {error && <Notice tone="bad">{error}</Notice>}
        {last && (
          <section aria-label="Latest research run" className="flex flex-col gap-1.5 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold">{working ? 'Research is running' : 'Last research run'}</h3>
              <RunStatusBadge run={last} />
            </div>
            {working
              ? <RunProgress run={last} now={now} />
              : <p className={last.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{runSummary(last) || 'It ended without a summary.'}</p>}
            <Link to={`/activity/${last.id}`} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline max-sm:py-2.5">{working ? 'Follow it in Activity' : 'See what it found and skipped'}</Link>
          </section>
        )}
        <div className="flex flex-wrap gap-2">
          <BusyButton loading={busy} disabled={!dirty} onClick={() => void save()}>Save topics</BusyButton>
          {dirty && <Button variant="ghost" className={sm} onClick={() => { setList(topics); setError(''); }}>Undo changes</Button>}
        </div>
      </div>
    </Section>
  );
}
