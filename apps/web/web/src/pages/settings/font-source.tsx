// A type role's own font in Settings, Brand and look, Type: the font in force (shown in its own face), and where a new one comes
// from: a family from the curated Google Fonts list, or a .woff2 file of the organisation's own.
//
// The browser never talks to Google. The list comes from the server; picking a family asks the server to download it once and
// store it with the brand; the font in force is previewed from the server's own copy (the app's CSP allows fonts from itself
// only).
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { errorMessage } from '../../lib/errors';
import { BusyButton, FormPanel, Hint, TextField } from '@/components/kit';
import { FileField } from './brand/fields';
import { SavedNote, useUploadStatus } from './brand/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { GOOGLE_CATEGORY_LABEL, LICENCE_LABEL, WEIGHT_NAME, type FontRole, type FontSource, type GoogleFont } from './brand-types';
import type { FontFamilyInfo } from './looks/look-types';
import { cardFontFamily, ensureFamily } from './looks/settings/load-fonts';

const ROLE_WORD: Record<FontRole, string> = { body: 'body', display: 'headline', label: 'label' };
// "300 Light, 400 Regular and 700 Bold"
export function weightList(weights: number[]): string {
  const named = weights.map((w) => `${w} ${WEIGHT_NAME[w] ?? ''}`.trim());
  return named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : (named[0] ?? '');
}

// The curated list, asked for once per page load.
let catalogue: Promise<{ categories: string[]; fonts: GoogleFont[] }> | null = null;
function useGoogleFonts() {
  const [state, setState] = useState<{ categories: string[]; fonts: GoogleFont[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    catalogue ??= api.get<{ categories: string[]; fonts: GoogleFont[] }>('/api/settings/brand/google-fonts');
    catalogue.then((c) => { if (live) setState(c); }, (err) => { catalogue = null; if (live) setError(errorMessage(err)); });
    return () => { live = false; };
  }, []);
  return { data: state, error };
}

// Loads the role's stored font from the server under a name of its own, so its name can be shown in its face. Null until loaded
// (or when there is none or it does not load: the name is then shown in the app's font).
function useFontPreview(src: FontSource | null, role: FontRole, version: string): string | null {
  const [family, setFamily] = useState<string | null>(null);
  const file = src?.file ?? null, key = src ? `${src.family}|${src.google?.weights.join(',') ?? ''}|${version}` : '';
  useEffect(() => {
    setFamily(null);
    if (!file || typeof FontFace === 'undefined') return;
    const name = `vesk-preview-${role}-${Math.abs([...key].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7))}`;
    const face = new FontFace(name, `url("${encodeURI(file)}?v=${encodeURIComponent(key)}")`);
    let live = true;
    face.load().then((f) => { if (!live) return; document.fonts.add(f); setFamily(name); }, () => undefined);
    return () => { live = false; document.fonts.delete(face); };
  }, [file, key, role]);
  return family;
}

// The families the server already serves (the engine's font library, for the Looks typeface cards), asked for once per page load:
// a family of the Google list that is also one of these shows its name in its own face. Nothing is loaded from Google.
let library: Promise<FontFamilyInfo[]> | null = null;
function useLibraryFaces(): (family: string) => CSSProperties | undefined {
  const [fonts, setFonts] = useState<FontFamilyInfo[]>([]);
  useEffect(() => {
    let live = true;
    library ??= api.get<{ fonts?: FontFamilyInfo[] }>('/api/settings/looks').then((r) => r.fonts ?? []);
    library.then((f) => { if (live) { for (const x of f) ensureFamily(x); setFonts(f); } }, () => { library = null; });
    return () => { live = false; };
  }, []);
  return (family) => (fonts.some((f) => f.family === family && f.files?.length) ? { fontFamily: cardFontFamily(family), fontSize: '15px' } : undefined);
}

export function sourceText(src: FontSource): string {
  return src.source === 'google' && src.google ? `Google Fonts, ${src.google.family}` : 'your upload';
}

export function RoleFont({ role, current, version, busy, onUpload, onGoogle, onRemove }: {
  role: FontRole; current: FontSource | null; version: string; busy: string;
  onUpload: (role: FontRole, f: File, family: string) => void; onGoogle: (role: FontRole, family: string) => void; onRemove: (role: FontRole) => void;
}) {
  const what = ROLE_WORD[role];
  const [open, setOpen] = useState(false);
  const preview = useFontPreview(current, role, version);
  const fallback = role === 'body' ? 'Inter, the built-in font' : role === 'display' ? 'the body font' : 'the built-in monospaced font (IBM Plex Mono)';
  const google = current?.source === 'google' ? current.google : undefined;
  const status = useUploadStatus(`font-google-${role}`);
  const adding = busy === `google-${role}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-1">
        <span className="text-sm leading-none font-medium select-none">Font file</span>
        <Hint about="Font file">
          {current
            ? <>In use for {what === 'body' ? 'body text' : `${what}s`}: {current.family} ({sourceText(current)}).{google && (google.weights.length > 1 ? ' Each weight is drawn as its own face.' : ' The one weight is used for every weight of this text.')}</>
            : <>No {what} font of its own yet: {role === 'body' ? 'text uses' : `${what}s use`} {fallback}.</>}
        </Hint>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 truncate text-[15px] leading-snug font-medium" style={current && preview ? { fontFamily: `'${preview}', sans-serif` } : undefined} aria-label={current ? `Sample in ${current.family}` : undefined}>
          {current ? current.family : role === 'body' ? 'Inter' : role === 'display' ? 'The body font' : 'IBM Plex Mono'}
        </span>
        <span className="text-[12.5px] text-muted-foreground">{current ? sourceText(current) : 'built in'}</span>
        {google && <span className="text-[12.5px] text-muted-foreground" data-testid={`font-weights-${role}`}>{google.weights.length > 1 ? 'weights' : 'weight'} {google.weights.join(', ')}</span>}
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Change font</Button>
        {current && <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(role)}><Trash2 aria-hidden="true" /> {role === 'body' ? 'Back to Inter' : 'Remove'}</Button>}
      </div>
      {google && google.missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="status">
          <span className="text-[12.5px] text-muted-foreground">Also drawn at {google.missing.join(', ')}</span>
          <Hint about="Missing weights">The brand now also draws this font at {weightList(google.missing)}. Until you add {google.missing.length > 1 ? 'them' : 'it'}, the nearest weight the font has stands in. Adding downloads {google.missing.length > 1 ? 'them' : 'it'} from Google Fonts once and saves {google.missing.length > 1 ? 'them' : 'it'} straight away.</Hint>
          <BusyButton type="button" variant="outline" size="sm" loading={adding} onClick={() => onGoogle(role, google.family)}>Add the missing weights</BusyButton>
        </div>
      )}
      {!open && status.error && <p className="text-[13px] font-medium text-destructive" role="alert">{status.error}</p>}
      <FormPanel
        open={open} onClose={() => setOpen(false)} variant="dialog" size="lg" title={`Change the ${what} font`}
        footer={<Button type="button" variant="outline" onClick={() => setOpen(false)}>Done</Button>}
      >
        <Tabs defaultValue={current?.source === 'upload' ? 'upload' : 'google'}>
          <TabsList>
            <TabsTrigger value="google">Google Fonts</TabsTrigger>
            <TabsTrigger value="upload">Upload a .woff2</TabsTrigger>
          </TabsList>
          <TabsContent value="google" className="mt-3">
            <GoogleFontPicker role={role} current={google ?? null} busy={adding} onUse={(family) => onGoogle(role, family)} inUseFace={preview} />
          </TabsContent>
          <TabsContent value="upload" className="mt-3">
            <UploadFont role={role} busy={busy === (role === 'body' ? 'font' : `font-${role}`)} onUpload={onUpload} />
          </TabsContent>
        </Tabs>
      </FormPanel>
    </div>
  );
}

function UploadFont({ role, busy, onUpload }: { role: FontRole; busy: boolean; onUpload: (role: FontRole, f: File, family: string) => void }) {
  const [family, setFamily] = useState('');
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Font name" optional className="max-w-xs" value={family} onChange={(e) => setFamily(e.target.value)} maxLength={40}
        hint="Leave empty to use the file's name." placeholder={{ body: 'Brand Sans', display: 'Brand Display', label: 'Brand Label' }[role]}
      />
      <FileField
        label=".woff2 file" accept=".woff2,font/woff2" busy={busy} buttonLabel="Choose a .woff2 file" statusKey={`font-upload-${role}`} immediate
        hint="A font file you are licensed to use, up to 2 MB."
        onFile={(f) => onUpload(role, f, family.trim() || f.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().slice(0, 40) || 'Brand')}
      />
    </div>
  );
}

function GoogleFontPicker({ role, current, busy, onUse, inUseFace }: {
  role: FontRole; current: { family: string; weights: number[]; missing: number[] } | null; busy: boolean; onUse: (family: string) => void;
  // the stored font in force, loaded under this name (useFontPreview), so its name shows in its face
  inUseFace?: string | null;
}) {
  const { data, error } = useGoogleFonts();
  const faceOf = useLibraryFaces();
  const status = useUploadStatus(`font-google-${role}`);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('');
  const [chosen, setChosen] = useState<string>(current?.family ?? '');
  const fonts = data?.fonts ?? [];
  const font = fonts.find((g) => g.family === chosen) ?? null;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = fonts.filter((g) => (!category || g.category === category) && (!q || g.family.toLowerCase().includes(q) || g.category.includes(q) || (GOOGLE_CATEGORY_LABEL[g.category] ?? '').toLowerCase().includes(q) || g.note.toLowerCase().includes(q)));
    return (data?.categories ?? []).map((c) => ({ category: c, fonts: shown.filter((g) => g.category === c) })).filter((g) => g.fonts.length);
  }, [fonts, data, query, category]);
  const pick = (g: GoogleFont) => setChosen(g.family);

  if (error) return <p className="text-[13px] text-destructive" role="alert">The list of Google Fonts could not be loaded: {error}</p>;
  if (!data) return <p className="text-[13px] text-muted-foreground">Loading the list of Google Fonts…</p>;
  const listId = `google-fonts-${role}`;
  const chip = (value: string, label: string) => (
    <button
      key={value || 'all'} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}
      className={cn('rounded-full border px-3 py-1 text-[13px] outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-9', category === value && 'border-primary bg-primary/10 font-medium text-primary')}
    >{label}</button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or style (serif, condensed...)" aria-label="Search the Google Fonts" aria-controls={listId} className="pl-8" />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show only">
        {chip('', 'All')}
        {data.categories.map((c) => chip(c, GOOGLE_CATEGORY_LABEL[c] ?? c))}
      </div>
      <div id={listId} role="listbox" aria-label={`Google Fonts for the ${ROLE_WORD[role]}s`} className="max-h-72 overflow-y-auto rounded-md border">
        {current && (
          <div className="border-b bg-accent/40 px-3 py-2">
            <div className="text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">In use now</div>
            <div className="text-[13.5px] font-medium"><span style={inUseFace ? { fontFamily: `'${inUseFace}', sans-serif`, fontSize: '15px' } : faceOf(current.family)}>{current.family}</span> <span className="font-normal text-muted-foreground">{current.weights.length > 1 ? 'weights' : 'weight'} {current.weights.join(', ')}</span></div>
          </div>
        )}
        {groups.length === 0 && <p className="p-3 text-[13px] text-muted-foreground">No family matches{query ? <> “{query}”</> : ''}.</p>}
        {groups.map((group) => (
          <div key={group.category} role="group" aria-label={GOOGLE_CATEGORY_LABEL[group.category] ?? group.category}>
            <div className="sticky top-0 z-[1] border-b bg-muted/95 px-3 py-1 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">{GOOGLE_CATEGORY_LABEL[group.category] ?? group.category}</div>
            {group.fonts.map((g) => {
              const selected = g.family === chosen;
              return (
                <button
                  key={g.family} type="button" role="option" aria-selected={selected} onClick={() => pick(g)}
                  className={cn('flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none', selected && 'bg-accent')}
                >
                  <span className="flex w-full items-baseline justify-between gap-2">
                    <span className="text-[13.5px] font-medium">
                      <span style={faceOf(g.family)}>{g.family}</span>
                      {current?.family === g.family && <span className="font-normal text-muted-foreground"> (in use)</span>}
                    </span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{g.weights.length === 1 ? '1 weight' : `${g.weights.length} weights`}</span>
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">{g.note}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {font && (
        <div className="flex flex-wrap items-center gap-2">
          <BusyButton type="button" size="sm" loading={busy} disabled={current?.family === font.family && current.missing.length === 0} onClick={() => onUse(font.family)}>Use this font</BusyButton>
          <span className="text-[12.5px] text-muted-foreground">{font.family} comes in {weightList(font.weights)}.</span>
          {status.saved && <SavedNote />}
        </div>
      )}
      {status.error && <p className="text-[13px] font-medium text-destructive" role="alert">{status.error}</p>}
      <p className="text-[12.5px] text-muted-foreground">
        {font ? <>{font.family} is free to use under the {LICENCE_LABEL[font.licence]}. </> : 'Every family here is free to use. '}
        Choosing a font downloads it once to this server, in every weight the {ROLE_WORD[role]}s are drawn at (where the family lacks one, the nearest it has), and saves it straight away; nothing is loaded from Google in your browser. Save a change of weight before you pick a font.
      </p>
    </div>
  );
}
