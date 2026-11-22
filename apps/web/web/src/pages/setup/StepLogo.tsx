// Step 2, Your logo: upload the logo (the small mark is cut from its left when it has one) or draw a simple pair from the
// name, then choose the brand's colours from the ones the logo (and the website) holds. Uploads save at once through the
// routes of Settings, Brand (POST /api/settings/brand/logo/full and /mark); the colours save with PUT /api/settings/brand.
import { useEffect, useId, useRef, useState } from 'react';
import { ImageUp, Wand2 } from 'lucide-react';
import { api } from '../../api';
import { useLoad } from '../../hooks';
import { useAppInfo } from '../../app-info';
import { errorMessage } from '../../lib/errors';
import { BusyButton, ErrorBlock, FormProblem, Notice } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { BrandView } from '../settings/brand-types';
import { measureLogo, simpleLogos } from '../settings/logo-tools';
import { loadSiteColours, sessionStore } from './flow';
import { coloursOfImage, guessRoles, markFromLogo, type Colours } from './logo-colours';
import { StepActions, StepHeader, SuggestedNote, type StepProps } from './parts';

const ROLES: Array<{ key: keyof Colours; label: string }> = [
  { key: 'primary', label: 'Main' }, { key: 'accent', label: 'Accent' }, { key: 'dark', label: 'Dark' }, { key: 'light', label: 'Light' },
];

function Swatch({ colour, selected, onPick, label }: { colour: string; selected?: boolean; onPick: () => void; label: string }) {
  return (
    <button type="button" onClick={onPick} aria-label={label} aria-pressed={selected}
      className={cn('size-9 shrink-0 rounded-md border shadow-xs outline-none transition-transform hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-11', selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background')}
      style={{ background: colour }} />
  );
}

export function StepLogo({ reload, mark, next }: StepProps) {
  const view = useLoad(() => api.get<BrandView>('/api/settings/brand'), []);
  const appInfo = useAppInfo();
  const fileId = useId();
  const markId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [bust, setBust] = useState(0);
  const [fromLogo, setFromLogo] = useState<string[]>([]);
  const [colours, setColours] = useState<Colours | null>(null);
  const [guessed, setGuessed] = useState(false);
  const [touched, setTouched] = useState<Set<keyof Colours>>(new Set());
  const [role, setRole] = useState<keyof Colours>('primary');
  const [needMark, setNeedMark] = useState(false);
  const site = loadSiteColours(sessionStore());

  useEffect(() => { if (view.data && !colours) setColours(view.data.settings.colours); }, [view.data, colours]);

  if (view.error) return <ErrorBlock message={view.error} onRetry={() => void view.reload()} />;
  if (!view.data || !colours) return <div className="flex flex-col gap-3"><Skeleton className="h-7 w-48" /><Skeleton className="h-48" /></div>;
  const v = view.data;
  const saved = v.settings.colours;
  const changed = (Object.keys(colours) as Array<keyof Colours>).some((k) => colours[k].toLowerCase() !== saved[k].toLowerCase());

  async function send(which: 'full' | 'mark', file: Blob, name: string, pos?: { wordmarkFrom: number; markGap: number }) {
    const q = pos ? `?wordmarkFrom=${pos.wordmarkFrom}&markGap=${pos.markGap}` : '';
    const form = new FormData();
    form.set('file', file, name);
    view.setData(await api.upload<BrandView>(`/api/settings/brand/logo/${which}${q}`, form));
  }
  const done = async () => { setBust((n) => n + 1); appInfo.reload(); await reload(); };

  // Colours the logo holds: offered as swatches, and a first guess fills the roles nobody chose yet on this screen.
  async function readColours(file: Blob) {
    const found = await coloursOfImage(file).catch(() => [] as string[]);
    setFromLogo(found);
    if (!found.length) return;
    const guess = guessRoles(found, saved);
    setColours((cur) => {
      const base = cur ?? saved;
      const out = { ...base };
      for (const r of ROLES) if (!touched.has(r.key)) out[r.key] = guess[r.key];
      return out;
    });
    setGuessed(true);
  }

  async function upload(file: File) {
    setBusy('upload'); setError(''); setNeedMark(false);
    try {
      const pos = await measureLogo(file);
      await send('full', file, file.name || 'logo.png', { wordmarkFrom: pos.wordmarkFrom, markGap: pos.markGap });
      const cut = await markFromLogo(file, pos.wordmarkFrom, pos.markGap).catch(() => null);
      if (cut) await send('mark', cut, 'mark.png');
      else setNeedMark(true);
      await readColours(file);
      await done();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function uploadMark(file: File) {
    setBusy('mark'); setError('');
    try { await send('mark', file, file.name || 'mark.png'); setNeedMark(false); await done(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(''); }
  }

  async function draw() {
    if (!colours) return;
    setBusy('draw'); setError(''); setNeedMark(false);
    try {
      const made = await simpleLogos(v.settings.name, { primary: colours.primary, dark: colours.dark });
      await send('mark', made.mark, 'mark.png');
      await send('full', made.full, 'logo.png', { wordmarkFrom: made.wordmarkFrom, markGap: made.markGap });
      await done();
    } catch (err) {
      setError(errorMessage(err, 'The logo could not be drawn.'));
    } finally {
      setBusy('');
    }
  }

  const pick = (c: string) => { setColours({ ...colours, [role]: c }); setTouched(new Set(touched).add(role)); };

  async function proceed() {
    setBusy('save'); setError('');
    try {
      if (changed) {
        const next = await api.put<BrandView>('/api/settings/brand', { ...v.settings, colours });
        view.setData(next);
        appInfo.reload();
      }
      next();
    } catch (err) {
      setError(errorMessage(err, 'These colours could not be saved.'));
    } finally {
      setBusy('');
    }
  }
  async function skip() { setBusy('skip'); try { await mark('logo', 'skipped'); next(); } finally { setBusy(''); } }

  const hasLogo = !!v.logos.full;
  const offered = [...new Set([...fromLogo, ...site])];

  return (
    <div className="flex flex-col gap-5">
      <StepHeader title="Your logo">A PNG with a transparent background works best.</StepHeader>

      <div className="flex flex-col gap-3">
        {hasLogo && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-[repeating-conic-gradient(#0000000a_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4">
            <img src={`${v.logos.full}?b=${bust}`} alt={`${v.settings.name} logo`} className="h-14 max-w-full object-contain" />
            {v.logos.mark && <img src={`${v.logos.mark}?b=${bust}`} alt={`${v.settings.name} mark`} className="size-14 object-contain" />}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} id={fileId} type="file" accept="image/png" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
          <BusyButton type="button" className="max-sm:min-h-11" variant={hasLogo ? 'outline' : 'default'} loading={busy === 'upload'} disabled={!!busy && busy !== 'upload'} onClick={() => fileRef.current?.click()}>
            <ImageUp aria-hidden="true" />{hasLogo ? 'Upload another logo' : 'Upload your logo'}
          </BusyButton>
          <BusyButton type="button" variant="outline" className="max-sm:min-h-11" loading={busy === 'draw'} disabled={!!busy && busy !== 'draw'} onClick={() => void draw()}>
            <Wand2 aria-hidden="true" />Draw one from the name
          </BusyButton>
        </div>
        {hasLogo && <p className="text-[12.5px] text-muted-foreground" role="status">Saved. Posts use it from now on.</p>}
        {needMark && (
          <Notice tone="info" title="Add the small mark too">
            This logo has no separate symbol to cut out. Upload a square mark for small places, or draw one from the name.
            <span className="mt-2 flex flex-wrap gap-2">
              <label htmlFor={markId} className="inline-flex h-8 cursor-pointer items-center rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-accent max-sm:min-h-11">
                {busy === 'mark' ? 'Uploading...' : 'Upload a mark'}
              </label>
              <input id={markId} type="file" accept="image/png" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadMark(f); }} />
            </span>
          </Notice>
        )}
      </div>

      <section aria-labelledby="colours-title" className="flex flex-col gap-3 border-t pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="colours-title" className="text-[14px] font-semibold">{fromLogo.length ? 'Colours from your logo' : 'Your colours'}</h2>
          {fromLogo.length > 0 && <span className="text-[12.5px] text-muted-foreground">Found {fromLogo.length}</span>}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Which colour to set</legend>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <label key={r.key} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium sm:min-h-9 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50', role === r.key ? 'border-primary bg-accent' : 'hover:bg-muted/60')}>
                <input type="radio" name="setup-colour-role" className="sr-only" checked={role === r.key} onChange={() => setRole(r.key)} />
                <span className="size-4 rounded-sm border" style={{ background: colours[r.key] }} aria-hidden="true" />
                {r.label}
                <span className="font-mono text-[11.5px] font-normal text-muted-foreground">{colours[r.key].toUpperCase()}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {offered.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[12.5px] text-muted-foreground">Pick a colour for <span className="font-medium text-foreground">{ROLES.find((r) => r.key === role)!.label.toLowerCase()}</span>:</p>
            <div className="flex flex-wrap gap-2">
              {offered.map((c) => <Swatch key={c} colour={c} selected={colours[role].toLowerCase() === c.toLowerCase()} onPick={() => pick(c)} label={`Use ${c} as the ${ROLES.find((r) => r.key === role)!.label.toLowerCase()} colour${fromLogo.includes(c) ? ' (from the logo)' : ' (from the website)'}`} />)}
              <label className="relative flex size-9 cursor-pointer items-center justify-center rounded-md border border-dashed text-[11px] text-muted-foreground hover:bg-muted/60 max-sm:size-11 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50" title="Another colour">
                <span aria-hidden="true">+</span>
                <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Choose another colour" value={colours[role]} onChange={(e) => pick(e.target.value.toUpperCase())} />
              </label>
            </div>
            {guessed && <SuggestedNote>The colours were matched from your logo. Pick another swatch to change one.</SuggestedNote>}
          </div>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Upload your logo to see its colours here. These are the example colours until then.</p>
        )}
      </section>

      <FormProblem error={error} />
      <StepActions step="logo" busy={!!busy} onSkip={hasLogo ? undefined : () => void skip()}
        primary={<BusyButton type="button" className="max-sm:min-h-11" loading={busy === 'save'} disabled={!!busy && busy !== 'save'} onClick={() => void proceed()}>{changed ? 'Save colours and continue' : 'Continue'}</BusyButton>} />
      {!hasLogo && <p className="-mt-3 text-right text-[12px] text-muted-foreground">Images are made once a logo is here.</p>}
    </div>
  );
}
