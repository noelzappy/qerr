// Settings, Brand and look: everything that makes the posts look and sound like the organisation, with no file to edit.
// One page, one form, split into sections that each have an address (/settings/brand/<section>):
//   Identity            name, website, tagline, what the brand does, time zone, language, currency
//   Design direction    one of three whole looks (editorial, swiss, retail) for posts made as a kind of post, with real samples
//   Logos               the full logo and the mark (PNG), or a simple pair drawn from the name; where the name starts
//   Colours             four colours to start from, then each colour set one by one; corners; the readability checks
//   Type                headlines, body and labels: font (built in, Google Fonts or a .woff2), case, spacing, weight
//   Surfaces and photos cards and panels, decoration (with uploaded artwork), photo treatment, logo place and footer
//   Post types          the kinds of posts, each with its page colour and how the second half of a headline is set
//   Voice and spelling  how the brand sounds and how its images should look (the AI follows both), names to spell exactly
//   Advanced            a brand.json fragment, the dot map, importing a brand pack
// The settings are ONE form state across all sections, saved with the Save bar. Uploads (logos, fonts, artwork) and the Advanced
// section are saved the moment they are done, and say so next to the control.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../../api';
import { useDocumentTitle, useLoad } from '../../hooks';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useAppInfo } from '../../app-info';
import { useUnsavedGuard } from '@/hooks/use-unsaved-guard';
import { BusyButton, ConfirmAction, ErrorBlock, FormProblem, Notice } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { DIRECTIONS, type BrandSettings, type BrandView, type Direction, type FontRole } from './brand-types';
import { measureLogo, simpleLogos } from './logo-tools';
import { SettingsPage } from './section';
import { SECTIONS, isSection, sectionFromHash, sectionOfPath, sectionPath, type BrandCtx, type SectionId } from './brand/model';
import { PreviewBar, PreviewRail, useLook } from './brand/preview';
import { DirectionSection } from './brand/sections-direction';
import { useDirectionSamples } from './brand/direction-samples';
import { IdentitySection, LogosSection } from './brand/sections-identity';
import { ColoursSection, PostTypesSection, SurfacesSection, TypeSection } from './brand/sections-look';
import { AdvancedSection, VoiceSection } from './brand/sections-words';
import { FieldProblemsProvider, UploadStatusProvider, useFieldProblemsState, useUploadStatusState } from './brand/status';

const sectionTitle = (id: SectionId) => SECTIONS.find((x) => x.id === id)!.title;
const FONT_FALLBACK: Record<FontRole, string> = { body: 'Inter, the built-in font', display: 'the body font', label: 'the built-in monospaced font' };
const FONT_WORD: Record<FontRole, string> = { body: 'body', display: 'headline', label: 'label' };

export function BrandSettingsPage() {
  useDocumentTitle('Brand and look');
  const { section: sectionParam } = useParams();
  const location = useLocation();
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
  const [removingFont, setRemovingFont] = useState<FontRole | null>(null);
  const [removingArtwork, setRemovingArtwork] = useState(false);
  const appInfo = useAppInfo();
  const status = useUploadStatusState();
  const { problems, report } = useFieldProblemsState();

  useEffect(() => { if (data.data) { setView(data.data); setS(data.data.settings); } }, [data.data]);
  const savedLook = useMemo(() => (view ? { checks: view.checks, changes: view.changes, palette: view.palette, explicit: view.explicit } : null), [view]);
  const look = useLook(s, savedLook);
  const dirty = useMemo(() => !!view && !!s && JSON.stringify(view.settings) !== JSON.stringify(s), [view, s]);
  // Moving between the sections of this page keeps the one form state, so only leaving the page asks.
  useUnsavedGuard(dirty, { allow: (from, to) => from.pathname.startsWith('/settings/brand') && to.pathname.startsWith('/settings/brand') });
  const section: SectionId = isSection(sectionParam) ? sectionParam : 'identity';
  // Real samples: all three while choosing, only the chosen one for the preview column. Held here so they survive section changes.
  const chosenDirection = (s?.style.direction ?? null) as Direction | null;
  const wanted: Direction[] = section === 'direction' ? [...DIRECTIONS] : chosenDirection ? [chosenDirection] : [];
  const directions = useDirectionSamples(s, wanted, wanted.length > 0 && !!s);
  useEffect(() => {
    document.getElementById('main')?.scrollTo?.({ top: 0 });
    window.scrollTo?.({ top: 0 });
  }, [section]);

  // An old address: `/settings/brand#logos` (the setup checklist) opens that section.
  if (!sectionParam && location.hash) {
    const target = sectionFromHash(location.hash);
    if (target) return <Navigate to={sectionPath(target)} replace />;
  }
  if (sectionParam && !isSection(sectionParam)) return <Navigate to="/settings/brand" replace />;
  if (data.error) return <ErrorBlock message={data.error} onRetry={() => void data.reload()} />;
  if (!view || !s) return <div className="flex flex-col gap-4"><Skeleton className="h-8 w-60" /><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;

  const set: BrandCtx['set'] = (k, v) => setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  const update: BrandCtx['update'] = (fn) => setS((cur) => (cur ? fn(cur) : cur));
  const logoUrl = (u: string | null) => (u ? `${u}?b=${logoBust}` : null);
  const apply = (next: BrandView) => { setView(next); setS(next.settings); setLogoBust((n) => n + 1); appInfo.reload(); };
  const problemList = Object.values(problems);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (!s || problemList.length) return;
    setSaving(true); setError(''); setLines([]); setFields({});
    try {
      apply(await api.put<BrandView>('/api/settings/brand', s));
      toast.success('The brand is saved. New images use it from now on.');
    } catch (err) {
      setError(errorMessage(err));
      setFields(fieldErrors(err));
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setLines((err.details as unknown[]).map((d) => {
          if (typeof d === 'string') return d;
          const x = d as { path?: string; message?: string };
          return x.path ? `${sectionTitle(sectionOfPath(x.path))}: ${x.message ?? ''}` : `${x.message ?? ''}`;
        }));
      }
    } finally {
      setSaving(false);
    }
  }

  // ---- uploads: each is saved the moment it succeeds, and says so next to its control ----

  async function sendLogo(which: 'full' | 'mark', file: Blob, name = 'logo.png', pos?: { wordmarkFrom: number; markGap: number }) {
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
  }

  async function uploadLogo(which: 'full' | 'mark', file: Blob, name?: string) {
    const key = `logo-${which}`;
    setUploading(which); status.clear(key);
    try { await sendLogo(which, file, name); status.markSaved(key); } catch (err) { status.setError(key, errorMessage(err)); } finally { setUploading(''); }
  }

  async function drawSimple() {
    if (!s) return;
    setUploading('simple'); status.clear('logo-simple');
    try {
      const made = await simpleLogos(s.name, { primary: s.colours.primary, dark: s.colours.dark });
      await sendLogo('mark', made.mark, 'mark.png');
      await sendLogo('full', made.full, 'logo.png', { wordmarkFrom: made.wordmarkFrom, markGap: made.markGap });
      status.markSaved('logo-simple');
    } catch (err) {
      status.setError('logo-simple', errorMessage(err, 'The logo could not be drawn.'));
    } finally {
      setUploading('');
    }
  }

  // Uploads change only the files; what the person typed in the form stays as it is.
  async function uploadFont(file: File, family: string, role: FontRole = 'body') {
    const key = `font-upload-${role}`;
    setUploading(role === 'body' ? 'font' : `font-${role}`); status.clear(key);
    try {
      const form = new FormData();
      form.set('file', file, file.name);
      form.set('family', family);
      setView(await api.upload<BrandView>(`/api/settings/brand/font?role=${role}`, form));
      status.markSaved(key);
    } catch (err) {
      status.setError(key, errorMessage(err));
    } finally {
      setUploading('');
    }
  }

  // A family from the curated Google Fonts list: the server downloads it once, in every weight the role is drawn at (with the
  // saved settings), and stores it like an upload. A headline or label font is switched on for its role there too; only that
  // choice is copied into the form, the rest of what was typed stays.
  async function pickGoogleFont(role: FontRole, family: string) {
    const key = `font-google-${role}`;
    setUploading(`google-${role}`); status.clear(key);
    try {
      const next = await api.post<BrandView>('/api/settings/brand/google-font', { role, family });
      setView(next);
      if (role !== 'body') setS((cur) => (cur ? { ...cur, style: { ...cur.style, type: { ...cur.style.type, [role]: { ...cur.style.type[role], font: next.settings.style.type[role].font } } } } : next.settings));
      status.markSaved(key);
    } catch (err) {
      status.setError(key, errorMessage(err));
    } finally {
      setUploading('');
    }
  }

  async function uploadArtwork(file: File) {
    setUploading('artwork'); status.clear('artwork');
    try {
      const form = new FormData();
      form.set('file', file, file.name);
      setView(await api.upload<BrandView>('/api/settings/brand/artwork', form));
      setArtBust((n) => n + 1);
      status.markSaved('artwork');
    } catch (err) {
      status.setError('artwork', errorMessage(err));
    } finally {
      setUploading('');
    }
  }

  const ctx: BrandCtx = {
    s, view, look, fields, set, update, logoUrl, busy: uploading, applyView: apply,
    artworkUrl: view.artwork ? `${view.artwork}?b=${artBust}` : null,
    uploadLogo: (w, f, n) => void uploadLogo(w, f, n), drawSimple: () => void drawSimple(),
    uploadFont: (f, fam, role) => void uploadFont(f, fam, role), pickGoogleFont: (r, fam) => void pickGoogleFont(r, fam),
    askRemoveFont: setRemovingFont, uploadArtwork: (f) => void uploadArtwork(f), askRemoveArtwork: () => setRemovingArtwork(true),
    directions,
  };
  const showLook = SECTIONS.find((x) => x.id === section)!.look;
  const attention = new Set<SectionId>(Object.keys(fields).map(sectionOfPath));
  const sketch = { s, look, fallbackChecks: view.checks, logo: logoUrl(view.logos.mark), artwork: ctx.artworkUrl, font: view.font?.family ?? null, dir: chosenDirection ? directions.states[chosenDirection] : undefined };

  return (
    <UploadStatusProvider value={status}>
      <FieldProblemsProvider report={report}>
        <SettingsPage
          title="Brand and look"
        >
          {!view.saved && <Notice tone="info" title="Not saved yet">These are the example brand's settings. Nothing is used until you save your own.</Notice>}
          {view.saved && view.logosMissing && <Notice tone="warn" title="Images wait for your logo">Upload your logo and its mark, or draw a simple pair from your name.</Notice>}

          <nav aria-label="Sections of Brand and look" className="-mx-4 -mb-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
            <ul className="flex min-w-max gap-1 border-b">
              {SECTIONS.map((x) => {
                const active = x.id === section;
                return (
                  <li key={x.id}>
                    <Link
                      to={sectionPath(x.id)} aria-current={active ? 'page' : undefined}
                      className={cn('-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-[13.5px] font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-9', active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                    >
                      {x.title}
                      {attention.has(x.id) && <><span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" /><span className="sr-only"> (needs attention)</span></>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className={cn(showLook && 'xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:items-start xl:gap-6')}>
            <div className="flex min-w-0 flex-col gap-4">
              {showLook && <PreviewBar {...sketch} />}
              {section === 'advanced'
                ? <AdvancedSection ctx={ctx} />
                : (
                  <form id="brand-form" onSubmit={(e) => void save(e)} noValidate>
                    {section === 'identity' && <IdentitySection ctx={ctx} />}
                    {section === 'direction' && <DirectionSection ctx={ctx} />}
                    {section === 'logos' && <LogosSection ctx={ctx} />}
                    {section === 'colours' && <ColoursSection ctx={ctx} />}
                    {section === 'type' && <TypeSection ctx={ctx} />}
                    {section === 'surfaces' && <SurfacesSection ctx={ctx} />}
                    {section === 'post-types' && <PostTypesSection ctx={ctx} />}
                    {section === 'voice' && <VoiceSection ctx={ctx} />}
                  </form>
                )}
            </div>
            {showLook && <PreviewRail {...sketch} />}
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
            <FormProblem error={error} lines={lines} />
            {problemList.length > 0 && <Notice tone="warn" title="Fix these before saving:">{problemList.join(' ')}</Notice>}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {dirty && <span className="text-[13px] text-muted-foreground" role="status">You have changes that are not saved.</span>}
              {dirty && <Button type="button" variant="ghost" onClick={() => setS(view.settings)}>Undo changes</Button>}
              <BusyButton type="submit" form="brand-form" loading={saving} disabled={(!dirty && view.saved) || problemList.length > 0}>{view.saved ? 'Save changes' : 'Save as our brand'}</BusyButton>
            </div>
          </div>
        </SettingsPage>

        <ConfirmAction
          open={!!removingFont} danger confirmLabel="Remove the font"
          title={`Remove the ${removingFont ? FONT_WORD[removingFont] : ''} font?`}
          message={<>The font file is deleted from this server straight away, and {removingFont ? `${FONT_WORD[removingFont]} text` : 'text'} goes back to {removingFont ? FONT_FALLBACK[removingFont] : 'the built-in font'}. You can choose or upload it again later.</>}
          onConfirm={async () => { if (!removingFont) return; setView(await api.delete<BrandView>(`/api/settings/brand/font?role=${removingFont}`)); setRemovingFont(null); }}
          onCancel={() => setRemovingFont(null)}
        />
        <ConfirmAction
          open={removingArtwork} danger confirmLabel="Remove the artwork" title="Remove the artwork?"
          message="The picture is deleted from this server straight away, and pages go back to plain until you upload another. Placement and opacity are kept."
          onConfirm={async () => { setView(await api.delete<BrandView>('/api/settings/brand/artwork')); setRemovingArtwork(false); }}
          onCancel={() => setRemovingArtwork(false)}
        />
      </FieldProblemsProvider>
    </UploadStatusProvider>
  );
}
