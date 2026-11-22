// "Add to my look": one design of any look (shipped or the brand's own) added to the look IN USE, on a page of its own
// (/settings/looks/add-design?source=<ref>&kind=<kind>&index=<n>, crumbs Settings / Looks / Add a design). It shows the design as its own look
// draws it beside how it would look in the look in use (the look's fonts, colours and type: a design brings no typefaces of its own), lets
// the person choose a design to replace when the kind already has three, and says plainly what happens to a shipped look in use (it is read
// only, so the brand's own copy is made first, and is used from then on only if the person says so). The server runs the design's checks
// before anything is stored; a refusal shows its reasons.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppInfo } from '../../../app-info';
import { api, ApiError, isAbort } from '../../../api';
import { useDocumentTitle, useLoad } from '../../../hooks';
import { errorMessage } from '../../../lib/errors';
import { Breadcrumbs, BusyButton, EmptyBlock, ErrorBlock, FormProblem, LoadingBlock, Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { kindName } from './look-model';
import type { AddDesignPlan, Json } from './look-types';
import { afterLookChange, lookApi } from './looks-api';

// The address of this page for one design: the `index`th design of `kind` among all of the look's designs of that kind.
export const addDesignHref = (source: string, kind: string, index: number): string =>
  `/settings/looks/add-design?${new URLSearchParams({ source, kind, index: String(index) }).toString()}`;

type Picture = { status: 'loading' | 'ready' | 'unavailable' | 'error'; image: string; error: string };
// One design drawn with sample words by POST /preview-design (a look by reference, or sent whole); null asks for nothing.
function usePicture(body: Json | null): Picture {
  const [state, setState] = useState<Picture>({ status: 'loading', image: '', error: '' });
  const key = body ? JSON.stringify(body) : '';
  useEffect(() => {
    if (!key) { setState({ status: 'ready', image: '', error: '' }); return; }
    const controller = new AbortController();
    setState((cur) => ({ ...cur, status: 'loading', error: '' }));
    api.post<{ image?: string; problems?: Array<{ message: string }>; superseded?: boolean }>('/api/settings/looks/preview-design', { ...JSON.parse(key), scenario: 'sample', withRects: false }, controller.signal)
      .then((a) => {
        if (a.superseded) return;
        if (a.image) setState({ status: 'ready', image: a.image, error: '' });
        else setState({ status: 'error', image: '', error: a.problems?.[0]?.message ?? 'The picture could not be made.' });
      })
      .catch((e) => {
        if (isAbort(e)) return;
        if (e instanceof ApiError && e.status === 501) setState({ status: 'unavailable', image: '', error: '' });
        else setState({ status: 'error', image: '', error: errorMessage(e, 'The picture could not be made.') });
      });
    return () => controller.abort();
  }, [key]);
  return state;
}

function Figure({ title, picture, alt, empty }: { title: string; picture: Picture; alt: string; empty?: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="truncate text-[13px] font-medium">{title}</figcaption>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-md border bg-muted/40" aria-busy={picture.status === 'loading'}>
        {empty ? <p className="absolute inset-0 m-auto flex items-center justify-center p-6 text-center text-[13px] text-muted-foreground">{empty}</p>
          : picture.image ? <img src={picture.image} alt={alt} className={picture.status === 'loading' ? 'size-full object-cover opacity-50' : 'size-full object-cover'} />
          : picture.status === 'loading' ? <Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          : <p className="absolute inset-0 m-auto flex items-center justify-center p-6 text-center text-[13px] text-muted-foreground">{picture.status === 'unavailable' ? 'Pictures appear here once previews are switched on' : picture.error}</p>}
        {picture.status === 'loading' && <span className="sr-only" role="status">Drawing the picture</span>}
      </div>
    </figure>
  );
}

export function AddDesignPage() {
  useDocumentTitle('Add a design');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const appInfo = useAppInfo();
  const source = params.get('source') ?? '', kind = params.get('kind') ?? '', index = Number(params.get('index') ?? 'x');
  const valid = /^(shipped|own):[a-z0-9][a-z0-9-]{0,39}$/.test(source) && /^[a-z]{1,20}$/.test(kind) && Number.isInteger(index) && index >= 0;
  const [replace, setReplace] = useState<number | null>(null);
  const plan = useLoad<AddDesignPlan | null>(() => (valid ? lookApi.planAdd(source, kind, index, replace) : Promise.resolve(null)), [source, kind, index, replace]);
  // keep the last plan on screen while a new one (another design to replace) is asked for
  const [shown, setShown] = useState<AddDesignPlan | null>(null);
  useEffect(() => { if (plan.data) setShown(plan.data); }, [plan.data]);
  const p = plan.data ?? shown;
  const [busy, setBusy] = useState<'' | 'use' | 'copy' | 'add'>('');
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);

  const sourceBody = useMemo(() => (valid ? { ref: source, kind, index } : null), [valid, source, kind, index]);
  const targetBody = useMemo(() => (p?.candidate && p.candidateIndex !== null ? { look: p.candidate, kind, index: p.candidateIndex } : null), [p?.candidate, p?.candidateIndex, kind]);
  const before = usePicture(sourceBody);
  const after = usePicture(targetBody);

  const crumbs = <Breadcrumbs items={[{ label: 'Settings', to: '/settings/preferences' }, { label: 'Looks', to: '/settings/looks' }, { label: 'Add a design' }]} />;
  const back = <Button asChild variant="outline"><Link to="/settings/looks">Back to Looks</Link></Button>;
  if (!valid) return <div className="flex flex-col gap-4">{crumbs}<EmptyBlock title="This design could not be found" action={back} /></div>;
  if (plan.error && !p) return <div className="flex flex-col gap-4">{crumbs}<ErrorBlock title="This design could not be loaded" message={plan.error} onRetry={() => void plan.reload()} /></div>;
  if (!p) return <div className="flex flex-col gap-4">{crumbs}<LoadingBlock label="Loading the design" /></div>;

  const kindLabel = kindName(kind).toLowerCase();
  const t = p.target;
  const targetName = t ? (t.shipped ? t.copyName ?? t.name : t.name) : '';
  const mustChoose = p.full && replace === null;
  const replacing = replace !== null ? p.designs[replace]?.name : undefined;

  async function go(mode: 'use' | 'copy' | 'add') {
    setBusy(mode); setError(''); setLines([]);
    try {
      const r = await lookApi.addToActive({ source, kind, index, replace, copy: mode !== 'add', use: mode === 'use' });
      afterLookChange(); appInfo.reload();
      if (r.publishProblems?.length) toast.warning(`${r.look.name} was saved but not published: ${r.publishProblems[0]!.message}`);
      else if (r.used) toast.success(`${r.look.name} is now in use, with ${p!.source.name}.`);
      else toast.success(`${replacing ? `Replaced ${replacing} with` : 'Added'} ${p!.source.name} in ${r.look.name}.`);
      navigate(`/settings/looks/${r.look.slug}?tab=designs`);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && Array.isArray(e.details)) setLines((e.details as Array<{ message?: string }>).map((d) => String(d.message ?? '')).filter(Boolean).slice(0, 8));
      setBusy('');
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <header className="flex flex-col gap-1.5">
        {crumbs}
        <h1 className="text-[19px] font-semibold tracking-tight">Add {p.source.name} to your look</h1>
        <p className="text-[13px] text-muted-foreground">A {kindLabel} design from {p.source.lookName}</p>
      </header>

      {!t ? (
        <EmptyBlock title="No look is in use" action={back}>Choose a look to use first, then add designs to it.</EmptyBlock>
      ) : t.ref === p.source.ref ? (
        <EmptyBlock title="This design is already in the look in use" action={back}>To try a variation, duplicate it on the look&apos;s Designs tab.</EmptyBlock>
      ) : (
        <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Figure title={`In ${p.source.lookName}`} picture={before} alt={`${p.source.name} as ${p.source.lookName} draws it`} />
              <Figure title={`In ${targetName}`} picture={after} alt={`${p.source.name} in ${targetName}, with its fonts and colours`}
                empty={mustChoose ? `Choose a ${kindLabel} design to replace to see it here` : undefined} />
            </div>
            <p className="text-[13px] text-muted-foreground">It takes {targetName}&apos;s fonts, colours and type. A design has no typefaces of its own, so {p.source.lookName}&apos;s fonts do not come with it.</p>
          </div>

          <div className="flex flex-col gap-4">
            {p.full && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13.5px] font-semibold">Replace one of your {kindLabel} designs</legend>
                <p className="text-[13px] text-muted-foreground">{t.name} already has {p.perKind}, the most a kind can have.</p>
                <RadioGroup value={replace === null ? '' : String(replace)} onValueChange={(v) => setReplace(Number(v))} aria-label={`The ${kindLabel} design to replace`} className="gap-0 divide-y rounded-md border">
                  {p.designs.map((d) => (
                    <div key={d.index} className="flex items-center gap-2.5 px-3 py-2.5">
                      <RadioGroupItem id={`replace-${d.index}`} value={String(d.index)} disabled={!!busy} />
                      <Label htmlFor={`replace-${d.index}`} className="min-w-0 flex-1 cursor-pointer truncate text-[13.5px] font-medium">{d.name}{!d.enabled && <span className="font-normal text-muted-foreground"> (off)</span>}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </fieldset>
            )}

            {t.shipped ? (
              <Notice tone="info">
                {t.name} is a shipped look, so we&apos;ll make your own copy, &lsquo;{t.copyName}&rsquo;, add the design to it and use it from now on. Posts already drawn keep their images.
              </Notice>
            ) : (
              <p className="text-[13px]">{replacing ? `${replacing} is replaced in ${t.name}.` : `It is added to ${t.name}, the look in use.`} Posts already drawn keep their images.</p>
            )}

            <FormProblem error={error} lines={lines} />
            {busy && <p role="status" className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Checking the design in your look…</p>}

            <div className="flex flex-wrap items-center gap-2">
              {t.shipped ? (
                <>
                  <BusyButton loading={busy === 'use'} disabled={!!busy || mustChoose} onClick={() => void go('use')}>Make the copy and use it</BusyButton>
                  <BusyButton variant="outline" loading={busy === 'copy'} disabled={!!busy || mustChoose} onClick={() => void go('copy')}>Make the copy only</BusyButton>
                </>
              ) : (
                <BusyButton loading={busy === 'add'} disabled={!!busy || mustChoose} onClick={() => void go('add')}>{replacing ? `Replace ${replacing}` : `Add to ${t.name}`}</BusyButton>
              )}
              <Button asChild variant="ghost"><Link to="/settings/looks">Cancel</Link></Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
