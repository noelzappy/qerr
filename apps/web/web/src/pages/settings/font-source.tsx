// A type role's own font in Settings, Brand and look, Type: the font in force (shown in its own face), and where a new one comes
// from: a family from the curated Google Fonts list, or a .woff2 file of the organisation's own.
//
// The browser never talks to Google. The list comes from the server; picking a family asks the server to download it once and
// store it with the brand; the font in force is previewed from the server's own copy (the app's CSP allows fonts from itself
// only).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { errorMessage } from '../../lib/errors';
import { BusyButton, SelectField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { GOOGLE_CATEGORY_LABEL, LICENCE_LABEL, WEIGHT_NAME, type FontRole, type FontSource, type GoogleFont } from './brand-types';

const ROLE_WORD: Record<FontRole, string> = { body: 'body', display: 'headline', label: 'label' };
// The weight a role usually wants, when the family has it (else the nearest it has).
const PREFERRED_WEIGHT: Record<FontRole, number> = { body: 400, display: 700, label: 500 };
const nearest = (weights: number[], want: number) => weights.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), weights[0] ?? 400);

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
  const file = src?.file ?? null, key = src ? `${src.family}|${src.google?.weight ?? ''}|${version}` : '';
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

export function sourceText(src: FontSource): string {
  return src.source === 'google' && src.google ? `Google Fonts, ${src.google.family} ${src.google.weight}` : 'your upload';
}

export function RoleFont({ role, current, version, busy, onUpload, onGoogle, onRemove }: {
  role: FontRole; current: FontSource | null; version: string; busy: string;
  onUpload: (role: FontRole, f: File, family: string) => void; onGoogle: (role: FontRole, family: string, weight: number) => void; onRemove: (role: FontRole) => void;
}) {
  const what = ROLE_WORD[role];
  const preview = useFontPreview(current, role, version);
  const fallback = role === 'body' ? 'Inter, the built-in font' : role === 'display' ? 'the body font' : 'the built-in mono (IBM Plex Mono)';
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
          {current
            ? <>The {what} font is <strong className="text-[15px] font-normal text-foreground" style={preview ? { fontFamily: `'${preview}', sans-serif` } : undefined}>{current.family}</strong> ({sourceText(current)}).{current.source === 'google' && ' The one weight is used for all of this role\'s text.'}</>
            : <>No {what} font of its own yet: {role === 'body' ? 'text uses' : `${what}s use`} {fallback}.</>}
        </p>
        {current && <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => onRemove(role)}><Trash2 aria-hidden="true" /> {role === 'body' ? 'Back to Inter' : 'Remove'}</Button>}
      </div>
      <Tabs defaultValue={current?.source === 'upload' ? 'upload' : 'google'}>
        <TabsList>
          <TabsTrigger value="google">Google Fonts</TabsTrigger>
          <TabsTrigger value="upload">Upload a .woff2</TabsTrigger>
        </TabsList>
        <TabsContent value="google" className="mt-3">
          <GoogleFontPicker role={role} current={current?.google ?? null} busy={busy === `google-${role}`} onUse={(family, weight) => onGoogle(role, family, weight)} />
        </TabsContent>
        <TabsContent value="upload" className="mt-3">
          <UploadFont role={role} busy={busy === (role === 'body' ? 'font' : `font-${role}`)} onUpload={onUpload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UploadFont({ role, busy, onUpload }: { role: FontRole; busy: boolean; onUpload: (role: FontRole, f: File, family: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [family, setFamily] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-muted-foreground">A .woff2 file you are licensed to use, up to 2 MB, with a name of its own.</p>
      <div className="flex flex-wrap items-end gap-2">
        <TextField label="Font name" className="w-56" value={family} onChange={(e) => setFamily(e.target.value)} placeholder={{ body: 'Brand Sans', display: 'Brand Display', label: 'Brand Label' }[role]} maxLength={40} />
        <input ref={input} type="file" accept=".woff2,font/woff2" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(role, f, family.trim() || f.name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().slice(0, 40) || 'Brand'); e.target.value = ''; }} />
        <BusyButton type="button" variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}>Upload .woff2</BusyButton>
      </div>
    </div>
  );
}

function GoogleFontPicker({ role, current, busy, onUse }: { role: FontRole; current: { family: string; weight: number } | null; busy: boolean; onUse: (family: string, weight: number) => void }) {
  const { data, error } = useGoogleFonts();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string>(current?.family ?? '');
  const [weight, setWeight] = useState<number | null>(current?.weight ?? null);
  const fonts = data?.fonts ?? [];
  const font = fonts.find((g) => g.family === chosen) ?? null;
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = fonts.filter((g) => !q || g.family.toLowerCase().includes(q) || g.category.includes(q) || (GOOGLE_CATEGORY_LABEL[g.category] ?? '').toLowerCase().includes(q) || g.note.toLowerCase().includes(q));
    return (data?.categories ?? []).map((c) => ({ category: c, fonts: shown.filter((g) => g.category === c) })).filter((g) => g.fonts.length);
  }, [fonts, data, query]);
  const pick = (g: GoogleFont) => { setChosen(g.family); setWeight(weight !== null && g.weights.includes(weight) ? weight : nearest(g.weights, PREFERRED_WEIGHT[role])); };

  if (error) return <p className="text-[12.5px] text-destructive" role="alert">The list of Google Fonts could not be loaded: {error}</p>;
  if (!data) return <p className="text-[12.5px] text-muted-foreground">Loading the list of Google Fonts…</p>;
  const listId = `google-fonts-${role}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or style (serif, condensed...)" aria-label="Search the Google Fonts" aria-controls={listId} className="pl-8" />
      </div>
      <div id={listId} role="listbox" aria-label={`Google Fonts for the ${ROLE_WORD[role]}s`} className="max-h-72 overflow-y-auto rounded-md border">
        {groups.length === 0 && <p className="p-3 text-[12.5px] text-muted-foreground">No family matches “{query}”.</p>}
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
                    <span className="text-[13.5px] font-medium">{g.family}{current?.family === g.family && <span className="font-normal text-muted-foreground"> (in use)</span>}</span>
                    <span className="shrink-0 text-[11.5px] text-muted-foreground">{g.weights.length === 1 ? '1 weight' : `${g.weights.length} weights`}</span>
                  </span>
                  <span className="text-[12px] text-muted-foreground">{g.note}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {font && (
        <div className="flex flex-wrap items-end gap-2">
          <SelectField className="w-48" label={`Weight of ${font.family}`} value={String(weight ?? nearest(font.weights, PREFERRED_WEIGHT[role]))} onValueChange={(v) => setWeight(Number(v))} options={font.weights.map((w) => ({ value: String(w), label: `${w} ${WEIGHT_NAME[w] ?? ''}`.trim() }))} />
          <BusyButton type="button" size="sm" loading={busy} disabled={current?.family === font.family && current.weight === weight} onClick={() => onUse(font.family, weight ?? nearest(font.weights, PREFERRED_WEIGHT[role]))}>Use this font</BusyButton>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        {font ? <>{font.family} is free to use under the {LICENCE_LABEL[font.licence]}. </> : 'Every family here is free to use (SIL Open Font License or Apache License). '}
        This server downloads the latin and latin-ext files once from Google Fonts and keeps them with the brand; posts and this page never load anything from Google.
      </p>
    </div>
  );
}
