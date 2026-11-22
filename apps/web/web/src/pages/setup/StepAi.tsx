// Step 5, AI: the provider with its model and prices chosen for the person (exact values under Fine-tune), a monthly budget as
// preset chips, and an optional web search key. Saved with the routes of Settings, AI and search (POST providers, PUT budget,
// PUT search). Keys are sent once and never shown again; only their last four characters come back. It can wait.
import { useState, type FormEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { BusyButton, ErrorBlock, FormProblem, PresetNumber, TextField } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ChoiceRow } from '../batches/editor/ChoiceRow';
import { SEARCH_KIND_LABEL } from '../../lib/labels';
import { ANTHROPIC_MODELS, BUDGET_PRESETS, DEFAULT_BUDGET, providerBody } from './flow';
import { StepActions, StepHeader, type StepProps } from './parts';

interface AiAnswer {
  providers: Array<{ id: string; name: string; kind: string; model: string; keyLast4: string; enabled: boolean }>;
  search: { kind: 'brave' | 'tavily' | 'exa'; keyLast4: string } | null;
  budget: { monthlyBudgetUsd: number | null };
}
type Kind = 'anthropic' | 'openai-compatible';

function Disclosure({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-fit items-center gap-1 rounded-sm text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
        <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden="true" />{label}
      </button>
      {open && <div className="flex flex-col gap-3 pl-5">{children}</div>}
    </div>
  );
}

export function StepAi({ reload, mark, next }: StepProps) {
  const data = useLoad(() => api.get<AiAnswer>('/api/settings/ai'), []);
  const [kind, setKind] = useState<Kind>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [preset, setPreset] = useState<string>('recommended');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [fine, setFine] = useState(false);
  // the budget chosen here; null until the person chooses (then the saved one, else the default)
  const [budget, setBudget] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKind, setSearchKind] = useState<'brave' | 'tavily' | 'exa'>('brave');
  const [searchKey, setSearchKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  useUnsavedGuard(apiKey !== '' || searchKey !== '');

  if (data.error) return <ErrorBlock message={data.error} onRetry={() => void data.reload()} />;
  if (!data.data) return <div className="flex flex-col gap-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-56" /></div>;
  const d = data.data;
  const existing = d.providers.find((p) => p.enabled) ?? d.providers[0] ?? null;
  const savedBudget = d.budget.monthlyBudgetUsd;
  const amountShown = budget ?? (savedBudget && savedBudget > 0 ? savedBudget : DEFAULT_BUDGET);
  const chosen = ANTHROPIC_MODELS.find((m) => m.id === preset) ?? ANTHROPIC_MODELS[0];
  // What the form will send: the preset's values unless Fine-tune changed them.
  const modelId = kind === 'anthropic' ? (model.trim() || chosen.model) : model.trim();
  const price = (typed: string, preset: number | null) => (typed.trim() ? Number(typed) : preset);
  const inputPrice = kind === 'anthropic' ? price(input, chosen.input) : (input.trim() ? Number(input) : null);
  const outputPrice = kind === 'anthropic' ? price(output, chosen.output) : (output.trim() ? Number(output) : null);

  async function save(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    const amount = Number.isFinite(amountShown) && amountShown > 0 ? amountShown : null;
    if (!existing) {
      if (apiKey.trim().length < 8) problems.apiKey = 'Paste the key, or skip this step for later';
      if (/\s/.test(apiKey.trim())) problems.apiKey = 'The key cannot contain spaces';
      if (!modelId) problems.model = 'Enter the model name';
      if (kind === 'openai-compatible' && !/^https:\/\//i.test(baseUrl.trim())) problems.baseUrl = 'Enter the address of the service, starting with https://';
      if ((inputPrice === null) !== (outputPrice === null) || [inputPrice, outputPrice].some((p) => p !== null && !(p >= 0))) problems.inputPricePerMTok = 'Enter both prices as numbers, or leave both empty';
    }
    if (amount === null) problems.budget = 'Enter a monthly budget in dollars, such as 40';
    if (searchKey && searchKey.trim().length < 8) problems.searchKey = 'Paste the whole search key';
    setFields(problems);
    if (Object.keys(problems).length) return;
    setBusy(true); setError('');
    try {
      if (!existing) await api.post('/api/settings/ai/providers', providerBody({ kind, apiKey, model: modelId, baseUrl, input: inputPrice, output: outputPrice }));
      setApiKey('');
      if (amount !== savedBudget) await api.put('/api/settings/ai/budget', { monthlyBudgetUsd: amount });
      if (searchKey.trim()) { await api.put('/api/settings/ai/search', { kind: searchKind, apiKey: searchKey.trim() }); setSearchKey(''); }
      await reload();
      next();
    } catch (err) {
      setFields(fieldErrors(err));
      setError(errorMessage(err));
      void data.reload();
    } finally {
      setBusy(false);
    }
  }
  async function skip() { setBusy(true); try { await mark('ai', 'skipped'); next(); } finally { setBusy(false); } }

  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => void save(e)} noValidate>
      <StepHeader title="AI">The AI drafts posts from your facts. It only runs within the monthly budget you set.</StepHeader>

      {existing ? (
        <p className="text-[13px]"><span className="font-medium">{existing.name}</span> is added <span className="font-mono text-muted-foreground">({existing.model}, key •••• {existing.keyLast4})</span>. Change it in Settings, AI and search.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ChoiceRow legend="Provider" value={kind} onChange={(v) => { setKind(v as Kind); setModel(''); setInput(''); setOutput(''); }}
            choices={[{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai-compatible', label: 'OpenAI-compatible' }]} />
          <TextField label="Key" type="password" autoComplete="off" mono value={apiKey} onChange={(e) => setApiKey(e.target.value)} error={fields.apiKey} required
            hintMode="inline" hint="Stored encrypted. It cannot be shown again." />
          {kind === 'anthropic' ? (
            <>
              <ChoiceRow legend="Model" value={preset} onChange={(v) => { setPreset(v as string); setModel(''); setInput(''); setOutput(''); }}
                choices={ANTHROPIC_MODELS.map((m) => ({ value: m.id, label: m.label, title: `${m.model}, $${m.input} in and $${m.output} out per million tokens` }))}
                hint={`${chosen.model} · $${chosen.input} in, $${chosen.output} out per million tokens`} />
              <Disclosure label="Fine-tune" open={fine} onToggle={() => setFine(!fine)}>
                <TextField label="Model id" mono value={model} placeholder={chosen.model} onChange={(e) => setModel(e.target.value)} error={fields.model} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Input price" type="number" inputMode="decimal" min={0} step="any" placeholder={String(chosen.input)} value={input} onChange={(e) => setInput(e.target.value)} error={fields.inputPricePerMTok} hint="US dollars per million tokens sent." />
                  <TextField label="Output price" type="number" inputMode="decimal" min={0} step="any" placeholder={String(chosen.output)} value={output} onChange={(e) => setOutput(e.target.value)} hint="US dollars per million tokens written." />
                </div>
              </Disclosure>
            </>
          ) : (
            <>
              <TextField label="Service address" mono value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} error={fields.baseUrl} required placeholder="https://api.example.com/v1" />
              <TextField label="Model" mono value={model} onChange={(e) => setModel(e.target.value)} error={fields.model} required />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Input price" optional type="number" inputMode="decimal" min={0} step="any" value={input} onChange={(e) => setInput(e.target.value)} error={fields.inputPricePerMTok} hint="US dollars per million tokens sent. Without prices the budget cannot count a call." />
                <TextField label="Output price" optional type="number" inputMode="decimal" min={0} step="any" value={output} onChange={(e) => setOutput(e.target.value)} hint="US dollars per million tokens written." />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t pt-4">
        <PresetNumber label="Monthly budget (US dollars)" presets={BUDGET_PRESETS.map((v) => ({ value: v, label: `$${v}` }))}
          value={amountShown} min={0.01} max={100000} step={0.01} unit="US dollars" error={fields.budget}
          onChange={(v) => setBudget(v)} onInvalid={() => setBudget(NaN)} />
        <p className="text-[12.5px] text-muted-foreground">When the month's spend reaches it, the AI stops until the next month.</p>
      </div>

      <Disclosure label={d.search ? `Web search: ${SEARCH_KIND_LABEL[d.search.kind] ?? d.search.kind}, key •••• ${d.search.keyLast4}` : 'Add a web search key (optional)'} open={searchOpen} onToggle={() => setSearchOpen(!searchOpen)}>
        <ChoiceRow legend="Search service" value={searchKind} onChange={(v) => setSearchKind(v as typeof searchKind)}
          choices={Object.entries(SEARCH_KIND_LABEL).map(([value, label]) => ({ value: value as typeof searchKind, label }))} />
        <TextField label={d.search ? 'New key' : 'Key'} type="password" autoComplete="off" mono optional value={searchKey} onChange={(e) => setSearchKey(e.target.value)} error={fields.searchKey}
          hint="Research looks things up on the web with it." />
      </Disclosure>

      <FormProblem error={error} />
      <StepActions step="ai" busy={busy} onSkip={existing ? undefined : () => void skip()}
        primary={<BusyButton type="submit" className="max-sm:min-h-11" loading={busy}>{existing ? 'Continue' : 'Add and continue'}</BusyButton>} />
    </form>
  );
}
