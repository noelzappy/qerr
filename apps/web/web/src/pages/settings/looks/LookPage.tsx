// A look on its own page: its name, status and actions in the header, and three tabs: Settings (a few choices beside larger sample
// pictures: typeface, headline voice, feel, colour, space, pictures, logo and details, each with its exact values under Fine-tune), Designs (one group per kind of
// post) and Check (what the checks said). A look in use can be edited like any other: the page says that changes reach posts drawn from
// then on (images already made stay as they are) and still offers a copy to try changes on.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppInfo } from '../../../app-info';
import { ApiError } from '../../../api';
import { errorMessage } from '../../../lib/errors';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { Breadcrumbs, BusyButton, ConfirmAction, FormProblem, Notice, ToneBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CheckTab } from './CheckTab';
import { DesignsTab } from './DesignsTab';
import { PublishDialog } from './PublishDialog';
import { SampleStrip } from './SampleStrip';
import { collectControls, kindOrder, LOOK_STATUS, lookForPreview, lookStatus, mapProblems, settingsOf, settingsProblems, writeSetting } from './look-model';
import { isOwn, type LooksAnswer, type OwnDetail, type Problem } from './look-types';
import { afterLookChange, lookApi } from './looks-api';
import { SettingsTab } from './settings/SettingsTab';
import { LookSamples } from './settings/LookSamples';
import { USE_MESSAGE } from './LooksPage';
import { useLookSamples } from './use-look-samples';

const TABS = [{ id: 'settings', label: 'Settings' }, { id: 'designs', label: 'Designs' }, { id: 'check', label: 'Check' }] as const;
type TabId = (typeof TABS)[number]['id'];

export function LookPage({ initial, list, activeRef, onActive }: { initial: OwnDetail; list: LooksAnswer; activeRef: string | null; onActive: (ref: string | null) => void }) {
  const navigate = useNavigate();
  const appInfo = useAppInfo();
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as TabId) : 'settings';
  const [look, setLook] = useState<OwnDetail>(initial);
  const [draft, setDraft] = useState(() => settingsOf(initial.definition));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [server, setServer] = useState<Problem[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [using, setUsing] = useState(false);
  const [copying, setCopying] = useState(false);
  const cat = list.catalogue;
  const inUse = activeRef === look.ref;

  const saved = useMemo(() => JSON.stringify(settingsOf(look.definition)), [look.definition]);
  const dirty = JSON.stringify(draft) !== saved;
  useUnsavedGuard(dirty);
  const controls = useMemo(() => new Set(collectControls(cat.sections, draft)), [cat.sections, draft]);
  const own = useMemo(() => settingsProblems(cat.sections, draft), [cat.sections, draft]);
  const name = String(draft.name ?? '');
  const nameProblem = name.trim().length < 1 || name.length > cat.limits.name ? `A name is 1 to ${cat.limits.name} characters` : '';
  const mapped = useMemo(() => mapProblems(server, controls), [server, controls]);
  const errors = { ...mapped.byControl, ...own };
  const invalid = Object.keys(own).length > 0 || !!nameProblem;

  const order = kindOrder(cat);
  const target = useMemo(() => (invalid ? null : { look: lookForPreview(draft, look.compositions, order) }), [invalid, draft, look.compositions]);
  const samples = useLookSamples(target);

  const apply = (next: OwnDetail, keepDraft = false) => { setLook(next); if (!keepDraft) setDraft(settingsOf(next.definition)); };
  const status = lookStatus(look);
  const primary = dirty ? 'save' : status === 'ready' && !inUse ? 'use' : 'publish';

  async function save() {
    setSaving(true); setError(''); setServer([]);
    try {
      apply(await lookApi.saveSettings(look.slug, draft));
      toast.success('The look is saved.');
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && Array.isArray(e.details)) setServer(e.details as Problem[]);
    } finally { setSaving(false); }
  }
  async function duplicate() {
    setCopying(true);
    try { navigate(`/settings/looks/${(await lookApi.duplicate(look.ref)).slug}`); } catch (e) { toast.error(errorMessage(e)); setCopying(false); }
  }
  async function reload() { try { const l = await lookApi.get(look.ref); if (isOwn(l)) apply(l, dirty); } catch { /* the page keeps what it has */ } }

  const change = (path: string, value: unknown) => setDraft((cur) => writeSetting(cur, cat.sections, path, value));

  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex flex-col gap-1.5">
        <Breadcrumbs items={[{ label: 'Settings', to: '/settings/preferences' }, { label: 'Looks', to: '/settings/looks' }, { label: look.name }]} />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 basis-64 items-center gap-2.5">
            <Input aria-label="Name of the look" value={name} maxLength={cat.limits.name} aria-invalid={nameProblem ? true : undefined}
              onChange={(e) => setDraft((cur) => ({ ...cur, name: e.target.value }))} className="h-9 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-[19px] font-semibold tracking-tight shadow-none hover:border-input focus-visible:border-input md:text-[19px]" />
            <ToneBadge tone={LOOK_STATUS[status].tone} dot>{LOOK_STATUS[status].label}</ToneBadge>
            {inUse && <ToneBadge tone="good" dot>In use</ToneBadge>}
          </div>
          <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
            {dirty && <span className="text-[13px] text-muted-foreground" role="status">You have changes that are not saved.</span>}
            {dirty && <Button type="button" variant="ghost" onClick={() => { setDraft(settingsOf(look.definition)); setServer([]); setError(''); }}>Undo</Button>}
            {dirty && <BusyButton variant={primary === 'save' ? 'default' : 'outline'} loading={saving} disabled={invalid} onClick={() => void save()}>Save</BusyButton>}
            {(status !== 'ready' || !inUse) && <Button type="button" variant={primary === 'publish' ? 'default' : 'outline'} disabled={dirty} title={dirty ? 'Save your changes first' : undefined} onClick={() => setPublishing(true)}>Publish</Button>}
            {!inUse && status === 'ready' && !dirty && <Button type="button" onClick={() => setUsing(true)}>Use this look</Button>}
          </div>
        </div>
        {nameProblem && <p className="text-[12.5px] font-medium text-destructive" role="alert">{nameProblem}</p>}
      </header>

      {inUse && (
        <Notice tone="info" actions={<BusyButton size="sm" variant="outline" loading={copying} onClick={() => void duplicate()}>Duplicate</BusyButton>}>
          This look is in use. What you save here is used for every post drawn from now on; images already made stay as they are until a post is drawn again.
          {status !== 'ready' && ' It has changes the checks have not seen yet: publish it to run them.'} To try changes without touching your posts, duplicate it first.
        </Notice>
      )}
      {status === 'attention' && look.problems?.[0] && <Notice tone="warn">{look.problems[0]}</Notice>}

      {tab !== 'settings' && <SampleStrip state={samples} kinds={order} lookName={look.name} compact className="max-w-xl" />}

      <nav aria-label="Parts of the look" className="-mb-2">
        <ul className="flex gap-1 border-b">
          {TABS.map((t) => (
            <li key={t.id}>
              <button type="button" aria-current={t.id === tab ? 'page' : undefined} onClick={() => setParams(t.id === 'settings' ? {} : { tab: t.id }, { replace: true })}
                className={cn('-mb-px flex min-h-11 items-center border-b-2 px-3 text-[13.5px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-9', t.id === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {tab === 'settings' && (
        <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start">
          <LookSamples state={samples} kinds={order} lookName={look.name} className="md:sticky md:top-4" />
          <div className="max-w-2xl">
            <SettingsTab ctx={{ look: draft, catalogue: cat, fonts: list.fonts, errors, disabled: false, onChange: change }} comps={look.compositions.map((c) => c.definition)}
              originRef={look.origin.startsWith('copy:') ? look.origin : null} saved={settingsOf(look.definition)} onLook={setDraft} />
            <div className="mt-4"><FormProblem error={error} lines={mapped.other} /></div>
          </div>
        </div>
      )}
      {tab === 'designs' && <DesignsTab look={look} list={list} onLook={(l) => apply(l, dirty)} />}
      {tab === 'check' && <CheckTab look={look} catalogue={cat} onReload={() => void reload()} />}

      {publishing && <PublishDialog look={look} onClose={() => setPublishing(false)} onPublished={(l) => apply(l, dirty)} />}
      <ConfirmAction open={using} title={`Use ${look.name}?`} confirmLabel="Use this look" message={USE_MESSAGE}
        onConfirm={async () => { await lookApi.use(look.ref); onActive(look.ref); setUsing(false); toast.success(`${look.name} is now in use.`); afterLookChange(); appInfo.reload(); }}
        onCancel={() => setUsing(false)} />
    </div>
  );
}
