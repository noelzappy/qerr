// Settings, Looks: the gallery. "In use" (the brand's look, or Classic layouts), "Looks we ship" (use one, or customise a copy) and
// "Your looks" (copies the brand made, with their status). A second tab, Inspiration, holds the design references. A look decides how
// every kind of post is drawn; changing the look in use changes new images only (posts already made keep theirs until remade).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppInfo } from '../../../app-info';
import { useDocumentTitle, useLoad } from '../../../hooks';
import { errorMessage } from '../../../lib/errors';
import { BusyButton, ConfirmAction, EmptyBlock, ErrorBlock, MoreMenu, Notice, ToneBadge, type MoreMenuItem } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { SettingsPage } from '../section';
import { InspirationPanel } from './Inspiration';
import { SampleStrip } from './SampleStrip';
import { kindOrder, kindsSummary, LOOK_STATUS, lookStatus, originText, whenText } from './look-model';
import type { LooksAnswer, OwnSummary, ShippedSummary } from './look-types';
import { afterLookChange, lookApi } from './looks-api';
import { useLookSamples } from './use-look-samples';

const PURPOSE = 'A look decides how every kind of post is drawn: typeface, layout, picture treatment and emphasis.';
export const USE_MESSAGE = 'New images use this look. Posts already made keep their images until you make them again.';

type Summary = ShippedSummary | OwnSummary;
const nameOfRef = (data: LooksAnswer, ref: string | null): string | null => {
  if (!ref) return null;
  return [...data.shipped, ...data.own].find((l) => l.ref === ref)?.name ?? null;
};

function Tabs({ tab }: { tab: 'looks' | 'inspiration' }) {
  const items = [{ id: 'looks', label: 'Looks', to: '/settings/looks' }, { id: 'inspiration', label: 'Inspiration', to: '/settings/looks/inspiration' }] as const;
  return (
    <nav aria-label="Looks" className="-mb-2">
      <ul className="flex gap-1 border-b">
        {items.map((x) => (
          <li key={x.id}>
            <Link to={x.to} aria-current={x.id === tab ? 'page' : undefined}
              className={cn('-mb-px flex min-h-11 items-center border-b-2 px-3 text-[13.5px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-9', x.id === tab ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {x.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Name({ l }: { l: Summary }) {
  return <h3 className="min-w-0 truncate text-[14px] font-semibold">{l.name}</h3>;
}

function ShippedCard({ l, kinds, active, onUse, onCustomise, busy }: { l: ShippedSummary; kinds: string[]; active: boolean; onUse: () => void; onCustomise: () => void; busy: boolean }) {
  const samples = useLookSamples({ ref: l.ref });
  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-3">
      <div>
        <div className="flex items-center gap-2"><Name l={l} />{active && <ToneBadge tone="good" dot>In use</ToneBadge>}</div>
        <p className="line-clamp-2 text-[13px] text-muted-foreground" title={l.description}>{l.description}</p>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{kindsSummary(l.kinds)}</p>
      </div>
      <SampleStrip state={samples} kinds={kinds} lookName={l.name} compact />
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {!active && <Button size="sm" onClick={onUse}>Use this look</Button>}
        <BusyButton size="sm" variant="outline" loading={busy} onClick={onCustomise}>Customise</BusyButton>
      </div>
    </li>
  );
}

function InUse({ data, kinds, onChange, onClassic }: { data: LooksAnswer; kinds: string[]; onChange: () => void; onClassic: () => void }) {
  const active = [...data.shipped, ...data.own].find((l) => l.ref === data.activeRef) ?? null;
  const samples = useLookSamples(data.activeRef ? { ref: data.activeRef, version: active && 'updatedAt' in active ? active.updatedAt : '' } : null);
  const go = useNavigate();
  const menu: MoreMenuItem[] = [];
  if (active?.source === 'own') menu.push({ label: 'Open', onSelect: () => go(`/settings/looks/${active.slug}`) });
  if (data.activeRef) menu.push({ label: 'Back to classic layouts', onSelect: onClassic });
  return (
    <section aria-labelledby="in-use-title" className="flex flex-col gap-2.5">
      <h2 id="in-use-title" className="text-sm font-semibold">In use</h2>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:items-center md:gap-5">
        <div className="min-w-0 md:w-72 md:shrink-0">
          <div className="flex items-center gap-1"><h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{active ? active.name : 'Classic layouts'}</h3>{menu.length > 0 && <MoreMenu items={menu} />}</div>
          <p className="text-[13px] text-muted-foreground">{active ? active.description : 'Posts use the layouts of Settings, Classic layouts.'}</p>
          <div className="mt-2.5"><Button size="sm" variant="outline" onClick={onChange}>Change</Button></div>
        </div>
        {active && <SampleStrip state={samples} kinds={kinds} lookName={active.name} className="min-w-0 flex-1" />}
      </div>
    </section>
  );
}

export function LooksPage({ tab = 'looks' }: { tab?: 'looks' | 'inspiration' }) {
  useDocumentTitle(tab === 'looks' ? 'Looks' : 'Inspiration');
  const data = useLoad(() => lookApi.list(), []);
  const navigate = useNavigate();
  const appInfo = useAppInfo();
  const [using, setUsing] = useState<Summary | null>(null);
  const [classic, setClassic] = useState(false);
  const [deleting, setDeleting] = useState<OwnSummary | null>(null);
  const [copying, setCopying] = useState('');
  const d = data.data;
  const kinds = kindOrder(d?.catalogue ?? null);

  const changed = () => { afterLookChange(); appInfo.reload(); void data.reload(); };
  async function customise(ref: string) {
    setCopying(ref);
    try { navigate(`/settings/looks/${(await lookApi.duplicate(ref)).slug}`); }
    catch (e) { toast.error(errorMessage(e)); setCopying(''); }
  }

  return (
    <SettingsPage title="Looks" description={PURPOSE} crumbs={[{ label: 'Settings', to: '/settings/preferences' }, { label: 'Looks' }]}>
      <Tabs tab={tab} />
      {tab === 'inspiration' ? <InspirationPanel looks={d ?? null} activeRef={d?.activeRef ?? null} />
        : data.error ? <ErrorBlock message={data.error} onRetry={() => void data.reload()} />
        : !d ? <div className="flex flex-col gap-4"><Skeleton className="h-32 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div>
        : (
          <>
            <InUse data={d} kinds={kinds} onChange={() => document.getElementById('shipped')?.scrollIntoView({ behavior: 'smooth' })} onClassic={() => setClassic(true)} />

            <section id="shipped" aria-labelledby="shipped-title" className="flex scroll-mt-6 flex-col gap-2.5">
              <h2 id="shipped-title" className="text-sm font-semibold">Looks we ship</h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {d.shipped.map((l) => <ShippedCard key={l.ref} l={l} kinds={kinds} active={d.activeRef === l.ref} busy={copying === l.ref} onUse={() => setUsing(l)} onCustomise={() => void customise(l.ref)} />)}
              </ul>
            </section>

            <section aria-labelledby="own-title" className="flex flex-col gap-2.5">
              <h2 id="own-title" className="text-sm font-semibold">Your looks</h2>
              {d.own.length >= d.limits.looks - 2 && <p className="text-[12.5px] text-muted-foreground" role="status">You have {d.own.length} of {d.limits.looks} looks.</p>}
              {d.own.length === 0 ? <EmptyBlock title="No looks of your own yet">Customise a look we ship to make it your own.</EmptyBlock> : (
                <ul className="divide-y rounded-lg border">
                  {d.own.map((l) => {
                    const st = lookStatus(l);
                    const based = originText(l.origin, (r) => nameOfRef(d, r));
                    const isActive = d.activeRef === l.ref;
                    const canUse = st === 'ready' && !isActive;
                    return (
                      <li key={l.ref} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                        <div className="min-w-0 flex-1 basis-56">
                          <div className="flex items-center gap-2">
                            <Link to={`/settings/looks/${l.slug}`} className="min-w-0 truncate text-[14px] font-semibold underline-offset-2 hover:underline">{l.name}</Link>
                            <ToneBadge tone={LOOK_STATUS[st].tone} dot>{LOOK_STATUS[st].label}</ToneBadge>
                            {isActive && <ToneBadge tone="good" dot>In use</ToneBadge>}
                          </div>
                          <p className="truncate text-[12.5px] text-muted-foreground">{[based, kindsSummary(l.kinds), `Changed ${whenText(l.updatedAt)}`].filter(Boolean).join(' · ')}</p>
                          {st === 'attention' && l.problems?.[0] && <p className="text-[12.5px] text-warning-foreground [overflow-wrap:anywhere]">{l.problems[0]}</p>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button asChild size="sm" variant="outline"><Link to={`/settings/looks/${l.slug}`}>Open</Link></Button>
                          {canUse && <Button size="sm" variant="outline" onClick={() => setUsing(l)}>Use</Button>}
                          <MoreMenu items={[
                            { label: 'Duplicate', onSelect: () => void customise(l.ref) },
                            { label: 'Delete', tone: 'danger', onSelect: () => setDeleting(l) },
                          ]} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

      <ConfirmAction
        open={!!using} title={using ? `Use ${using.name}?` : ''} confirmLabel="Use this look" message={USE_MESSAGE}
        onConfirm={async () => { if (!using) return; await lookApi.use(using.ref); setUsing(null); toast.success(`${using.name} is now in use.`); changed(); }}
        onCancel={() => setUsing(null)}
      />
      <ConfirmAction
        open={classic} title="Go back to classic layouts?" confirmLabel="Use classic layouts" message="New images use your classic layouts again. Posts already made keep their images until you make them again. The look stays in Your looks."
        onConfirm={async () => { await lookApi.use(null); setClassic(false); toast.success('Classic layouts are in use again.'); changed(); }}
        onCancel={() => setClassic(false)}
      />
      <ConfirmAction
        open={!!deleting} danger title={deleting ? `Delete ${deleting.name}?` : ''} confirmLabel="Delete the look"
        message="The look and all its designs are deleted. This cannot be undone. A look that is in use cannot be deleted."
        onConfirm={async () => { if (!deleting) return; await lookApi.remove(deleting.slug); setDeleting(null); toast.success('The look is deleted.'); changed(); }}
        onCancel={() => setDeleting(null)}
      />
      {tab === 'looks' && d && d.shipped.length === 0 && <Notice tone="warn">This version of the app has no looks to show yet.</Notice>}
    </SettingsPage>
  );
}
