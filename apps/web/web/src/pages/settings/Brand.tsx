// Settings, Brand and look: everything that makes the posts look and sound like the organisation, with no file to edit.
//   Identity      name, website, tagline, what the brand does, time zone, language, currency
//   Logos         the full logo and the mark (PNG), or a simple pair drawn from the name; where the wordmark starts
//   Colours       four colours to start from, then every colour role (grounds, text, accents, surfaces, slabs) set one by one,
//                 the headline weight, the corners; a sketch and the contrast checks
//   Type          headlines, body and labels: font (built in, from the curated Google Fonts list, or a .woff2 upload), case,
//                 letter spacing, weight; the headline scale and the accent device
//   Surfaces      cards and panels, decoration (with uploaded artwork), photo treatment, logo place and footer
//   Series        the kinds of posts, each with its page colour and how the second half of a headline is set
//   Voice         how the brand sounds and how its images should look (the AI follows both), and names to spell exactly
//   Advanced      a brand.json fragment and the dot map, for people who know the design engine
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, ImageUp, Plus, Trash2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../../api';
import { useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useAppInfo } from '../../app-info';
import { BusyButton, ErrorBlock, FormProblem, Notice, SelectField, TextAreaField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ACCENT_LABEL, ACCENTS, GROUND_LABEL, GROUNDS, validHex, type BrandLook, type BrandSettings, type BrandView, type FontRole, type PaletteChange } from './brand-types';
import { StyleSketch } from './StyleSketch';
import { ColourRoles, LookFields, TypeFields } from './style-fields';
import { weightList } from './font-source';
import { measureLogo, simpleLogos } from './logo-tools';
import { Section, SettingsPage } from './section';

function zones(): string[] {
  try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['UTC']; } catch { return ['UTC']; }
}
const ALL_ZONES = zones();
const LANGUAGES = ['British English', 'American English', 'Australian English', 'Canadian English', 'French', 'German', 'Spanish', 'Portuguese', 'Dutch', 'Italian'];
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'series';

// ---- colour field ---------------------------------------------------------------------------------------------------

function ColourField({ label, hint, value, onChange, error }: { label: string; hint: string; value: string; onChange: (v: string) => void; error?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input type="color" value={validHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label}, colour picker`} className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
        <Input
          value={text}
          aria-label={`${label}, hex code`}
          aria-invalid={error || !validHex(text) ? true : undefined}
          className="font-mono uppercase"
          onChange={(e) => { const v = e.target.value.trim(); setText(v); if (validHex(v)) onChange(v.toUpperCase()); }}
        />
      </div>
      <p className="text-[12.5px] text-muted-foreground">{hint}</p>
      {error && <p className="text-[12.5px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}

const COLOUR_NAME: Record<PaletteChange['colour'], string> = { primary: 'primary', accent: 'accent', dark: 'dark' };

// The colours the server moved so text stays readable, side by side with what was picked.
function Changes({ changes }: { changes: PaletteChange[] }) {
  if (!changes.length) return null;
  return (
    <Notice tone="info" title="Adjusted so text stays readable">
      Where they are used for text, posts use {changes.map((c, i) => (
        <span key={c.colour}>
          {i > 0 && (i === changes.length - 1 ? ' and ' : ', ')}
          a slightly {c.colour === 'accent' ? 'lighter' : 'darker'} {COLOUR_NAME[c.colour]}
          {' '}<span className="inline-flex items-center gap-1 align-middle">
            <span className="inline-block size-3 rounded-full border" style={{ background: c.from }} aria-hidden="true" />
            <span className="font-mono text-[12px]">{c.from}</span> → <span className="inline-block size-3 rounded-full border" style={{ background: c.to }} aria-hidden="true" />
            <span className="font-mono text-[12px]">{c.to}</span>
          </span>
        </span>
      ))}. Large shapes keep the colours you picked.
    </Notice>
  );
}

// Waits for typing to stop, then asks the server what these settings would give.
function useLook(s: BrandSettings | null, initial: BrandLook | null): BrandLook | null {
  const [look, setLook] = useState<BrandLook | null>(initial);
  useEffect(() => { setLook(initial); }, [initial]);
  const key = s ? JSON.stringify(s) : '';
  useEffect(() => {
    if (!s || !Object.values(s.colours).every(validHex)) return;
    let live = true;
    const t = setTimeout(() => {
      api.post<BrandLook>('/api/settings/brand/preview', s).then((l) => { if (live) setLook(l); }).catch(() => { /* the saved look stays */ });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [key]);
  return look;
}

// ---- logos ----------------------------------------------------------------------------------------------------------

function LogoSlot({ title, hint, src, onFile, busy }: { title: string; hint: string; src: string | null; onFile: (f: File) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="text-[13.5px] font-semibold">{title}</div>
      <div className="flex h-24 items-center justify-center rounded-md bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-2">
        {src ? <img src={src} alt={title} className="max-h-full max-w-full object-contain" /> : <span className="text-[12.5px] text-muted-foreground">Not uploaded yet</span>}
      </div>
      <p className="text-[12.5px] text-muted-foreground">{hint}</p>
      <input ref={input} type="file" accept="image/png" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <BusyButton variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}><ImageUp aria-hidden="true" /> {src ? 'Replace' : 'Upload'} PNG</BusyButton>
    </div>
  );
}

// ---- the page ---------------------------------------------------------------------------------------------------------

export function BrandSettingsPage() {
  useDocumentTitle('Brand and look');
  const data = useLoad(() => api.get<BrandView>('/api/settings/brand'), []);
  const [view, setView] = useState<BrandView | null>(null);
  const [s, setS] = useState<BrandSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState('');
  const [logoBust, setLogoBust] = useState(0);
  const [artBust, setArtBust] = useState(0);
  const appInfo = useAppInfo();

  useEffect(() => { if (data.data) { setView(data.data); setS(data.data.settings); } }, [data.data]);
  const savedLook = useMemo(() => (view ? { checks: view.checks, changes: view.changes, palette: view.palette, explicit: view.explicit } : null), [view]);
  const look = useLook(s, savedLook);
  const dirty = useMemo(() => !!view && !!s && JSON.stringify(view.settings) !== JSON.stringify(s), [view, s]);

  if (data.error) return <ErrorBlock message={data.error} onRetry={() => void data.reload()} />;
  if (!view || !s) return <div className="flex flex-col gap-4"><Skeleton className="h-8 w-60" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;

  const set = <K extends keyof BrandSettings>(k: K, v: BrandSettings[K]) => setS({ ...s, [k]: v });
  const setColour = (k: keyof BrandSettings['colours'], v: string) => setS({ ...s, colours: { ...s.colours, [k]: v } });
  const logoUrl = (u: string | null) => (u ? `${u}?b=${logoBust}` : null);

  const apply = (next: BrandView) => { setView(next); setS(next.settings); setLogoBust((n) => n + 1); appInfo.reload(); };

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!s) return;
    setSaving(true); setError(''); setLines([]); setFields({});
    try {
      apply(await api.put<BrandView>('/api/settings/brand', s));
      toast.success('The brand is saved. New images use it from now on.');
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
      if (err instanceof ApiError && Array.isArray(err.details)) setLines((err.details as unknown[]).map((d) => (typeof d === 'string' ? d : `${(d as { path?: string }).path ?? ''}: ${(d as { message?: string }).message ?? ''}`)));
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(which: 'full' | 'mark', file: Blob, name = 'logo.png', pos?: { wordmarkFrom: number; markGap: number }) {
    setUploading(which);
    try {
      let q = '';
      if (which === 'full') {
        const m = pos ?? await measureLogo(file);
        q = `?wordmarkFrom=${m.wordmarkFrom}&markGap=${m.markGap}`;
      }
      const form = new FormData();
      form.set('file', file, name);
      const next = await api.upload<BrandView>(`/api/settings/brand/logo/${which}${q}`, form);
      // Keep what the person typed: only the logo position comes back from the upload.
      setView(next);
      setS((cur) => (cur ? { ...cur, logo: next.settings.logo } : next.settings));
      setLogoBust((n) => n + 1);
      appInfo.reload();
      toast.success(which === 'full' ? 'The logo is uploaded.' : 'The mark is uploaded.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading('');
    }
  }

  async function drawSimple() {
    if (!s) return;
    setUploading('simple');
    try {
      const made = await simpleLogos(s.name, { primary: s.colours.primary, dark: s.colours.dark });
      await uploadLogo('mark', made.mark, 'mark.png');
      await uploadLogo('full', made.full, 'logo.png', { wordmarkFrom: made.wordmarkFrom, markGap: made.markGap });
    } catch (err) {
      toast.error(errorMessage(err, 'The logo could not be drawn.'));
    } finally {
      setUploading('');
    }
  }

  // Uploads change only the files; what the person typed in the form stays as it is.
  async function uploadFont(file: File, family: string, role: FontRole = 'body') {
    setUploading(role === 'body' ? 'font' : `font-${role}`);
    try {
      const form = new FormData();
      form.set('file', file, file.name);
      form.set('family', family);
      const next = await api.upload<BrandView>(`/api/settings/brand/font?role=${role}`, form);
      setView(next);
      toast.success('The font is uploaded.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading('');
    }
  }

  async function removeFont(role: FontRole) {
    try { setView(await api.delete<BrandView>(`/api/settings/brand/font?role=${role}`)); } catch (err) { toast.error(errorMessage(err)); }
  }

  // A family from the curated Google Fonts list: the server downloads it once, in every weight the role is drawn at (with the
  // saved settings), and stores it like an upload. A headline or label font is switched on for its role there too; only that
  // choice is copied into the form, the rest of what was typed stays.
  async function pickGoogleFont(role: FontRole, family: string) {
    setUploading(`google-${role}`);
    try {
      const next = await api.post<BrandView>('/api/settings/brand/google-font', { role, family });
      setView(next);
      if (role !== 'body') setS((cur) => (cur ? { ...cur, style: { ...cur.style, type: { ...cur.style.type, [role]: { ...cur.style.type[role], font: next.settings.style.type[role].font } } } } : next.settings));
      const weights = next.fontSources[role]?.google?.weights ?? [];
      toast.success(`${family} is downloaded in ${weightList(weights)} and in use. New images use it from now on.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading('');
    }
  }

  async function uploadArtwork(file: File) {
    setUploading('artwork');
    try {
      const form = new FormData();
      form.set('file', file, file.name);
      setView(await api.upload<BrandView>('/api/settings/brand/artwork', form));
      setArtBust((n) => n + 1);
      toast.success('The artwork is uploaded.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading('');
    }
  }

  async function removeArtwork() {
    try { setView(await api.delete<BrandView>('/api/settings/brand/artwork')); } catch (err) { toast.error(errorMessage(err)); }
  }

  const checks = look?.checks ?? view.checks;
  const artworkUrl = view.artwork ? `${view.artwork}?b=${artBust}` : null;
  const failing = checks.filter((c) => !c.ok);
  return (
    <SettingsPage
      title="Brand and look"
      description="How your posts look and sound. The AI follows the voice and the visual direction; the design engine draws every image from these colours, logos and series."
    >
      {!view.saved && <Notice tone="info" title="Not saved yet">These are the example brand's settings. Change them to your own and save: nothing is used until you do.</Notice>}
      {view.saved && view.logosMissing && <Notice tone="warn" title="Images wait for your logo">Upload your logo and its mark (or draw a simple pair from your name) before images can be made.</Notice>}

      <form className="flex flex-col gap-8" onSubmit={(e) => void save(e)} noValidate>
        <Section id="identity" title="Identity" description="Who the brand is. The website is printed on the posts; the description tells the AI what the brand does.">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Brand name" value={s.name} onChange={(e) => set('name', e.target.value)} error={fields.name} maxLength={80} required />
            <TextField label="Website" hint="As it should appear on posts, without https://" value={s.website} onChange={(e) => set('website', e.target.value)} error={fields.website} maxLength={120} required />
            <TextField label="Tagline" value={s.tagline} onChange={(e) => set('tagline', e.target.value)} error={fields.tagline} maxLength={160} required />
            <TextField label="What the brand does" optional hint="One line, for the AI" value={s.descriptor} onChange={(e) => set('descriptor', e.target.value)} error={fields.descriptor} maxLength={200} />
            <SelectField label="Time zone" hint="Posts are planned in this time zone" value={s.timezone} onValueChange={(v) => set('timezone', v)} options={(ALL_ZONES.includes(s.timezone) ? ALL_ZONES : [s.timezone, ...ALL_ZONES]).map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))} error={fields.timezone} />
            <SelectField label="Language of the posts" value={s.language} onValueChange={(v) => set('language', v)} options={(LANGUAGES.includes(s.language) ? LANGUAGES : [s.language, ...LANGUAGES]).map((l) => ({ value: l, label: l }))} error={fields.language} />
          </div>
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-[13.5px] font-medium">
              <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={!!s.money} onChange={(e) => set('money', e.target.checked ? { local: 'We work in one currency only', foreign: '\\$|£|€' } : null)} />
              The brand works in one currency only
            </label>
            {s.money && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Your currency, in words" hint="For example: We work in euros (€) only" value={s.money.local} onChange={(e) => set('money', { ...s.money!, local: e.target.value })} error={fields['money.local']} />
                <TextField label="Other currencies to flag" mono hint="A pattern; posts that mention one get a warning. Separate with |" value={s.money.foreign} onChange={(e) => set('money', { ...s.money!, foreign: e.target.value })} error={fields['money.foreign']} />
              </div>
            )}
          </div>
        </Section>

        <Section id="logos" title="Logos" description="The full logo (the mark, then the name) goes on posts; the mark alone is used where space is short and as the app's icon. Transparent PNGs work best.">
          <div className="grid gap-3 sm:grid-cols-2">
            <LogoSlot title="Full logo" hint="The mark and the name side by side" src={logoUrl(view.logos.full)} busy={uploading === 'full'} onFile={(f) => void uploadLogo('full', f, f.name)} />
            <LogoSlot title="Mark" hint="The symbol on its own, about square" src={logoUrl(view.logos.mark)} busy={uploading === 'mark'} onFile={(f) => void uploadLogo('mark', f, f.name)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BusyButton variant="outline" size="sm" loading={uploading === 'simple'} onClick={() => void drawSimple()}><Wand2 aria-hidden="true" /> Draw a simple logo from the name</BusyButton>
            <span className="text-[12.5px] text-muted-foreground">Uses the brand name and the primary colour; replace it with your real logo any time.</span>
          </div>
          {view.logos.fullSize && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Where the name starts in the full logo" hint={`In pixels from the left, of ${view.logos.fullSize[0]}. Measured when you upload; on dark pages the name is drawn in white from here.`} type="number" min={0} max={view.logos.fullSize[0] - 1} value={String(s.logo.wordmarkFrom)} onChange={(e) => set('logo', { ...s.logo, wordmarkFrom: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
              <TextField label="Gap between the mark and the name" hint="In pixels" type="number" min={0} value={String(s.logo.markGap)} onChange={(e) => set('logo', { ...s.logo, markGap: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
            </div>
          )}
        </Section>

        <Section id="look" title="Colours" description="Four colours to start from: they make every colour role of your posts. Then set any role yourself. The checks below say whether text stays readable on each page colour.">
          <div className="grid gap-4 sm:grid-cols-2">
            <ColourField label="Primary" hint="Your main brand colour" value={s.colours.primary} onChange={(v) => setColour('primary', v)} error={fields['colours.primary']} />
            <ColourField label="Accent" hint="Highlights, numbers and buttons on dark pages" value={s.colours.accent} onChange={(v) => setColour('accent', v)} error={fields['colours.accent']} />
            <ColourField label="Dark" hint="Text, and the dark page colour" value={s.colours.dark} onChange={(v) => setColour('dark', v)} error={fields['colours.dark']} />
            <ColourField label="Light" hint="The light tint behind quiet pages" value={s.colours.light} onChange={(v) => setColour('light', v)} error={fields['colours.light']} />
          </div>
          {['grounds', 'text', 'accents', 'gradient', 'surfaces'].some((k) => k in (view.advanced ?? {})) && (
            <Notice tone="info">The Advanced settings (an imported pack) set the exact page and text colours, so changing these four colours has little effect. Empty the Advanced fragment to let these colours decide.</Notice>
          )}
          <Changes changes={look?.changes ?? []} />
          <details className="rounded-lg border p-3" open={Object.values(s.roles).some((g) => Object.keys(g).length > 0)}>
            <summary className="cursor-pointer text-[13.5px] font-medium">Colour roles <span className="font-normal text-muted-foreground">(each page, text and accent colour, set one by one)</span></summary>
            <div className="mt-3"><ColourRoles roles={s.roles} palette={look?.palette ?? null} onChange={(roles) => set('roles', roles)} /></div>
          </details>
          <StyleSketch s={s} palette={look?.palette ?? null} logo={logoUrl(view.logos.mark)} artwork={artworkUrl} font={view.font?.family ?? null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Headline weight" value={String(s.headlineWeight)} onValueChange={(v) => set('headlineWeight', Number(v))} options={[300, 400, 500, 600, 700].map((w) => ({ value: String(w), label: { 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semi-bold', 700: 'Bold' }[w]! }))} />
            <SelectField label="Corners" value={s.corners} onValueChange={(v) => set('corners', v as BrandSettings['corners'])} options={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Softly rounded' }, { value: 'round', label: 'Round' }]} />
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            Posts use {view.fontSources.body ? <strong className="text-foreground">{view.fontSources.body.family}</strong> : 'Inter'} for text{view.fontSources.display ? <> and <strong className="text-foreground">{view.fontSources.display.family}</strong> for headlines</> : ''}. Choose fonts under <a className="underline underline-offset-2" href="#type">Type</a>: from Google Fonts or a .woff2 of your own.
          </p>
          <details className="rounded-lg border p-3" open={failing.length > 0}>
            <summary className="cursor-pointer text-[13.5px] font-medium">
              {failing.length ? `${failing.length} of ${checks.length} colour pairs are hard to read` : `All ${checks.length} colour pairs are readable`} <span className="font-normal text-muted-foreground">(headlines, sub lines, labels and accent words on every page colour)</span>
            </summary>
            <ul className="mt-3 grid gap-1.5 text-[12.5px] sm:grid-cols-2">
              {[...checks].sort((a, b) => Number(a.ok) - Number(b.ok)).map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  {c.ok ? <Check className="size-3.5 text-primary" aria-label="Readable" /> : <X className="size-3.5 text-destructive" aria-label="Too faint" />}
                  <span className="flex-1">{c.label}{c.set && <span className="text-muted-foreground"> (a colour you set)</span>}</span>
                  <span className="tabular-nums text-muted-foreground">{c.ratio.toFixed(1)} : 1 (needs {c.needs})</span>
                </li>
              ))}
            </ul>
            {failing.length > 0 && <p className="mt-2 text-[12.5px] text-muted-foreground">Posts with faint text get a warning from the design checks. {failing.some((c) => c.set) ? 'Colours you set yourself are used exactly as you set them: change them, or make them from the four colours again. ' : ''}Otherwise make the dark colour darker or the light colour lighter: the four colours you picked are as far as the automatic adjustment can go.</p>}
          </details>
        </Section>

        <Section id="type" title="Type" description="How headlines, body text and labels are set. Leave a value empty to keep the brand's own.">
          <TypeFields
            style={s.style} onChange={(type) => set('style', { ...s.style, type })} fonts={view.fontSources} version={view.updatedAt ?? ''} busy={uploading}
            onUpload={(role, f, fam) => void uploadFont(f, fam, role)} onGoogle={(role, fam) => void pickGoogleFont(role, fam)} onRemove={(role) => void removeFont(role)}
          />
        </Section>

        <Section id="surfaces" title="Surfaces and decoration" description="How cards and panels stand off the page, the texture behind pages, what happens to photos, and where the logo goes.">
          <LookFields style={s.style} onChange={(style) => set('style', style)} artwork={artworkUrl} busy={uploading === 'artwork'} onArtwork={(f) => void uploadArtwork(f)} onRemoveArtwork={() => void removeArtwork()} />
        </Section>

        <Section
          id="series"
          title="Series"
          description="The kinds of posts you make (tips, news, numbers...). Each has a page colour; the AI picks a series for every post."
          aside={<Button type="button" variant="outline" size="sm" disabled={s.series.length >= 16} onClick={() => set('series', [...s.series, { key: `series-${s.series.length + 1}`, name: 'New series', ground: 'light', accent: 'muted' }])}><Plus aria-hidden="true" /> Add a series</Button>}
        >
          {fields.series && <p className="text-[12.5px] font-medium text-destructive" role="alert">{fields.series}</p>}
          <ul className="flex flex-col gap-2">
            {s.series.map((x, i) => (
              <li key={i} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1.2fr_1fr_1.3fr_auto]">
                <TextField label="Name" value={x.name} maxLength={40} onChange={(e) => { const name = e.target.value; const keyFollows = x.key === slug(x.name) || x.key.startsWith('series-'); set('series', s.series.map((y, j) => (j === i ? { ...y, name, key: keyFollows ? slug(name) : y.key } : y))); }} />
                <SelectField label="Page colour" value={x.ground} onValueChange={(v) => set('series', s.series.map((y, j) => (j === i ? { ...y, ground: v } : y)))} options={GROUNDS.map((g) => ({ value: g, label: GROUND_LABEL[g]! }))} />
                <SelectField label="Headline style" value={x.accent} onValueChange={(v) => set('series', s.series.map((y, j) => (j === i ? { ...y, accent: v } : y)))} options={ACCENTS.map((a) => ({ value: a, label: ACCENT_LABEL[a]! }))} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${x.name}`} disabled={s.series.length <= 1} onClick={() => set('series', s.series.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></Button>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="voice" title="Voice and visual direction" description="In your own words. The AI reads both every time it drafts or rewrites a post. Design references add to the visual direction.">
          <TextAreaField label="Voice" optional hint="Who you talk to, the tone, words you use and avoid. For example: Warm and plain. Short sentences. We say 'members', never 'customers'." rows={5} maxLength={4000} value={s.voice} onChange={(e) => set('voice', e.target.value)} error={fields.voice} />
          <TextAreaField label="Visual direction" optional hint="How the images should feel. For example: Calm pages with lots of space, one strong photo, numbers large; avoid busy collages." rows={5} maxLength={4000} value={s.visualDirection} onChange={(e) => set('visualDirection', e.target.value)} error={fields.visualDirection} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Names to spell exactly</Label>
              <Button type="button" variant="ghost" size="sm" disabled={s.spellings.length >= 30} onClick={() => set('spellings', [...s.spellings, { wrong: '', right: s.name }])}><Plus aria-hidden="true" /> Add</Button>
            </div>
            <p className="text-[12.5px] text-muted-foreground">A wrong form and how it should be written. The checks correct it in every post.</p>
            {s.spellings.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input aria-label="Written wrongly as" placeholder="Written wrongly as" value={x.wrong} onChange={(e) => set('spellings', s.spellings.map((y, j) => (j === i ? { ...y, wrong: e.target.value } : y)))} />
                <span className="text-muted-foreground" aria-hidden="true">→</span>
                <Input aria-label="Written as" placeholder="Written as" value={x.right} onChange={(e) => set('spellings', s.spellings.map((y, j) => (j === i ? { ...y, right: e.target.value } : y)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove this spelling" onClick={() => set('spellings', s.spellings.filter((_, j) => j !== i))}><Trash2 aria-hidden="true" /></Button>
              </div>
            ))}
          </div>
        </Section>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
          <FormProblem error={error} lines={lines} />
          <div className="flex flex-wrap items-center justify-end gap-3">
            {dirty && <span className="text-[12.5px] text-muted-foreground">You have changes that are not saved.</span>}
            {dirty && <Button type="button" variant="ghost" onClick={() => setS(view.settings)}>Undo changes</Button>}
            <BusyButton type="submit" loading={saving} disabled={!dirty && view.saved}>{view.saved ? 'Save changes' : 'Save as our brand'}</BusyButton>
          </div>
        </div>
      </form>

      <Advanced view={view} onSaved={apply} />
    </SettingsPage>
  );
}


function Advanced({ view, onSaved }: { view: BrandView; onSaved: (v: BrandView) => void }) {
  const [advanced, setAdvanced] = useState(() => JSON.stringify(view.advanced ?? {}, null, 2));
  const [map, setMap] = useState(() => (view.map ? JSON.stringify(view.map) : ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  async function save() {
    setBusy(true); setError(''); setLines([]);
    try {
      let a: unknown, m: unknown = null;
      try { a = JSON.parse(advanced || '{}'); } catch { throw new Error('The brand.json fragment is not valid JSON'); }
      try { m = map.trim() ? JSON.parse(map) : null; } catch { throw new Error('The map is not valid JSON'); }
      onSaved(await api.put<BrandView>('/api/settings/brand/advanced', { advanced: a, map: m }));
      toast.success('The Advanced settings are saved.');
    } catch (err) {
      setError(err instanceof ApiError ? errorMessage(err) : (err as Error).message);
      if (err instanceof ApiError && Array.isArray(err.details)) setLines((err.details as unknown[]).map((d) => (typeof d === 'string' ? d : JSON.stringify(d))));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section id="advanced" title="Advanced" description="For people who know the design engine's brand.json (docs/design.md). The fragment is merged over what the form makes; the logos and the font always come from the uploads.">
      <ImportPack onSaved={onSaved} />
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-[13.5px] font-medium">Edit the brand.json fragment and the dot map</summary>
        <div className="mt-3 flex flex-col gap-3">
          <TextAreaField label="brand.json fragment" mono rows={10} value={advanced} onChange={(e) => setAdvanced(e.target.value)} />
          <TextAreaField label="Dot map (map.json)" optional mono rows={4} value={map} onChange={(e) => setMap(e.target.value)} hint="Needed only for the map poster. Leave empty for none." />
          <FormProblem error={error} lines={lines} />
          <div><BusyButton variant="outline" loading={busy} onClick={() => void save()}>Save the Advanced settings</BusyButton></div>
        </div>
      </details>
    </Section>
  );
}

// A brand pack folder (brand.json, logos/logo-full.png, logos/logo-mark.png, optional map.json) moved in at once.
function ImportPack({ onSaved }: { onSaved: (v: BrandView) => void }) {
  const [files, setFiles] = useState<Record<string, File | null>>({ brand: null, full: null, mark: null, map: null, font: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const pick = (k: string) => (e: ChangeEvent<HTMLInputElement>) => setFiles((f) => ({ ...f, [k]: e.target.files?.[0] ?? null }));
  async function go() {
    setBusy(true); setError(''); setLines([]);
    try {
      const form = new FormData();
      for (const [k, f] of Object.entries(files)) if (f) form.set(k, f, f.name);
      const next = await api.upload<BrandView & { notes?: string[] }>('/api/settings/brand/import', form);
      onSaved(next);
      toast.success('The brand pack is imported.', next.notes?.length ? { description: next.notes.join(' '), duration: 12000 } : undefined);
      setFiles({ brand: null, full: null, mark: null, map: null, font: null });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && Array.isArray(err.details)) setLines((err.details as unknown[]).map((d) => (typeof d === 'string' ? d : JSON.stringify(d))));
    } finally {
      setBusy(false);
    }
  }
  const row = (k: string, label: string, accept: string, optional = false) => (
    <label className="flex flex-col gap-1 text-[13px]">
      <span className="font-medium">{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</span>
      <input type="file" accept={accept} onChange={pick(k)} className="text-[12.5px] file:mr-3 file:rounded-md file:border file:bg-transparent file:px-2.5 file:py-1 file:text-[12.5px]" />
    </label>
  );
  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-[13.5px] font-medium">Import a brand pack</summary>
      <p className="mt-2 text-[12.5px] text-muted-foreground">If you have a brand pack folder (brand.json, its logos and an optional map.json, such as brands/demo in the repository), choose its files. Its exact colours and rules are kept in the Advanced settings; the form is filled from it. This replaces the saved brand and logos.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {row('brand', 'brand.json', 'application/json,.json')}
        {row('map', 'map.json', 'application/json,.json', true)}
        {row('full', 'logos/logo-full.png', 'image/png')}
        {row('mark', 'logos/logo-mark.png', 'image/png')}
        {row('font', 'The headline and text font (.woff2)', '.woff2,font/woff2', true)}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <FormProblem error={error} lines={lines} />
        <div><BusyButton variant="outline" loading={busy} disabled={!files.brand || !files.full || !files.mark} onClick={() => void go()}>Import the pack</BusyButton></div>
      </div>
    </details>
  );
}

