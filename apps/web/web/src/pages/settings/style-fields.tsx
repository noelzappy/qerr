// The style layer's fields in Settings, Brand and look: the colour roles, the type roles, surfaces and decoration, the photo
// treatment, and the logo and footer. Each field is a choice from the engine's fixed lists or a number in its range; the server
// checks every value again before anything is saved.
import { useRef, useState, type ReactNode } from 'react';
import { ImageUp, RotateCcw, Trash2 } from 'lucide-react';
import { BusyButton, SelectField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ACCENT_DEVICES, ARTWORK_FITS, DECORATION_ON, DECORATIONS, DISPLAY_FONTS, FOOTERS, LABEL_FONTS, LOGO_PLACES, PHOTO_TREATMENTS, ROLE_GROUPS, ROLE_LABEL, STYLE_COLOURS, SURFACES, TYPE_CASES,
  emptyRoles, optionsOf, validHex, type BrandRoles, type FontRole, type FontSource, type Palette, type RoleGroup, type StyleSettings, type TypeRole,
} from './brand-types';
import { RoleFont } from './font-source';

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const DEFAULT = '';

// ---- colour roles ----

// What a role is now: the colour people set, or the one the server made from the four colours.
const paletteValue = (p: Palette | null, group: RoleGroup, key: string): string | undefined => (p?.[group] as Record<string, string> | undefined)?.[key];

function RoleSwatch({ group, k, value, set, onSet, onReset }: { group: RoleGroup; k: string; value: string | undefined; set: boolean; onSet: (v: string) => void; onReset: () => void }) {
  const [text, setText] = useState('');
  const label = ROLE_LABEL[`${group}.${k}`] ?? k;
  const shown = value && validHex(value) ? value : '#000000';
  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <input type="color" value={shown.toLowerCase()} onChange={(e) => onSet(e.target.value.toUpperCase())} aria-label={`${label}, colour picker`} className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-medium">{label}</div>
        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <Input
            value={text || (value ?? '')}
            aria-label={`${label}, hex code`}
            className="h-6 w-[5.6rem] px-1.5 font-mono text-[11.5px] uppercase"
            onChange={(e) => { const v = e.target.value.trim(); setText(v); if (validHex(v)) { onSet(v.toUpperCase()); setText(''); } }}
            onBlur={() => setText('')}
          />
          <span>{set ? 'set by you' : 'from the four colours'}</span>
        </div>
      </div>
      {set && <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Make ${label} from the four colours again`} onClick={onReset}><RotateCcw aria-hidden="true" /></Button>}
    </li>
  );
}

export function ColourRoles({ roles, palette, onChange }: { roles: BrandRoles; palette: Palette | null; onChange: (r: BrandRoles) => void }) {
  const setCount = Object.values(roles).reduce((n, g) => n + Object.values(g).filter(Boolean).length, 0);
  const put = (group: RoleGroup, key: string, v: string | undefined) => {
    const next = { ...roles, [group]: { ...roles[group] } };
    if (v) next[group][key] = v; else delete next[group][key];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-[70ch] text-[12.5px] text-muted-foreground">
          Each colour posts use. Those you do not set are made from the four colours above, and text colours among them are adjusted until they read. A colour you set is used exactly as you set it; if it is hard to read, the checks below say so.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={!setCount} onClick={() => onChange(emptyRoles())}><RotateCcw aria-hidden="true" /> Start from four colours</Button>
      </div>
      {(Object.keys(ROLE_GROUPS) as RoleGroup[]).map((group) => (
        <fieldset key={group} className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[12.5px] font-semibold">{ROLE_GROUPS[group].title}</legend>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ROLE_GROUPS[group].keys.map((k) => (
              <RoleSwatch key={k} group={group} k={k} value={roles[group][k] ?? paletteValue(palette, group, k)} set={!!roles[group][k]} onSet={(v) => put(group, k, v)} onReset={() => put(group, k, undefined)} />
            ))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

// ---- type ----

const numberOrNull = (v: string, lo: number, hi: number) => { if (v.trim() === '') return null; const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

function TypeRoleFields({ title, hint, role, onChange, font }: { title: string; hint: string; role: TypeRole; onChange: (r: TypeRole) => void; font?: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <legend className="px-1 text-[13px] font-semibold">{title}</legend>
      <p className="-mt-1 text-[12.5px] text-muted-foreground">{hint}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {font}
        <SelectField label="Case" value={role.case} onValueChange={(v) => onChange({ ...role, case: v as TypeRole['case'] })} options={optionsOf(TYPE_CASES)} />
        <TextField label="Letter spacing" hint="In em, from -0.1 to 0.3; empty for the brand's" type="number" step={0.005} min={-0.1} max={0.3} value={role.tracking === null ? '' : String(role.tracking)} onChange={(e) => onChange({ ...role, tracking: numberOrNull(e.target.value, -0.1, 0.3) })} />
        <SelectField label="Weight" value={role.weight === null ? DEFAULT : String(role.weight)} onValueChange={(v) => onChange({ ...role, weight: v === DEFAULT ? null : Number(v) })} options={[{ value: DEFAULT, label: "The brand's" }, ...WEIGHTS.map((w) => ({ value: String(w), label: String(w) }))]} />
      </div>
    </fieldset>
  );
}

export function TypeFields({ style, onChange, fonts, version, busy, onUpload, onGoogle, onRemove }: {
  style: StyleSettings; onChange: (t: StyleSettings['type']) => void; fonts: Record<FontRole, FontSource | null>; version: string;
  busy: string; onUpload: (role: FontRole, f: File, family: string) => void; onGoogle: (role: FontRole, family: string) => void; onRemove: (role: FontRole) => void;
}) {
  const t = style.type;
  const font = (role: FontRole) => <RoleFont role={role} current={fonts[role]} version={version} busy={busy} onUpload={onUpload} onGoogle={onGoogle} onRemove={onRemove} />;
  return (
    <div className="flex flex-col gap-3">
      <TypeRoleFields
        title="Headlines" hint="The display type: headlines and big figures. Built in, they use the body font or the label font."
        role={t.display} onChange={(r) => onChange({ ...t, display: { ...t.display, ...r } })}
        font={<SelectField label="Font" value={t.display.font} onValueChange={(v) => onChange({ ...t, display: { ...t.display, font: v as typeof t.display.font } })} options={optionsOf(DISPLAY_FONTS)} />}
      />
      {t.display.font === 'own' && font('display')}
      <TypeRoleFields title="Body" hint="Sub lines, lists and captions, and headlines unless they have a font of their own. Built in, this is Inter." role={t.body} onChange={(r) => onChange({ ...t, body: r })} />
      {font('body')}
      <TypeRoleFields
        title="Labels" hint="Running heads, footers, eyebrows and the website. Figures in drawn ledgers keep the mono."
        role={t.label} onChange={(r) => onChange({ ...t, label: { ...t.label, ...r } })}
        font={<SelectField label="Font" value={t.label.font} onValueChange={(v) => onChange({ ...t, label: { ...t.label, font: v as typeof t.label.font } })} options={optionsOf(LABEL_FONTS)} />}
      />
      {t.label.font === 'own' && font('label')}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Headline scale" hint="All headline sizes times this, from 0.8 to 1.25. Long headlines are still shrunk to fit." type="number" step={0.05} min={0.8} max={1.25} value={String(t.scale)} onChange={(e) => onChange({ ...t, scale: numberOrNull(e.target.value, 0.8, 1.25) ?? 1 })} />
        <SelectField label="Second half of a headline" hint="The *phrase* in a headline: one device for every page, or as each series says." value={t.accent} onValueChange={(v) => onChange({ ...t, accent: v as typeof t.accent })} options={optionsOf(ACCENT_DEVICES, 'accent')} />
      </div>
    </div>
  );
}

// ---- surfaces, decoration, photos, logo ----

export function LookFields({ style, onChange, artwork, busy, onArtwork, onRemoveArtwork }: {
  style: StyleSettings; onChange: (s: StyleSettings) => void; artwork: string | null; busy: boolean; onArtwork: (f: File) => void; onRemoveArtwork: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const d = style.decoration, p = style.photo;
  const set = <K extends keyof StyleSettings>(k: K, v: StyleSettings[K]) => onChange({ ...style, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField label="Cards and panels" value={style.surface} onValueChange={(v) => set('surface', v as StyleSettings['surface'])} options={optionsOf(SURFACES)} />
        <SelectField label="Decoration" value={d.kind} onValueChange={(v) => set('decoration', { ...d, kind: v as typeof d.kind })} options={optionsOf(DECORATIONS, 'decoration')} />
        <SelectField label="Decoration on" value={d.on} onValueChange={(v) => set('decoration', { ...d, on: v as typeof d.on })} options={optionsOf(DECORATION_ON)} disabled={d.kind === 'none'} />
        {['dots', 'grid', 'lines', 'auto'].includes(d.kind) && (
          <TextField label="Decoration strength" hint="From 0.01 (faint) to 0.4; empty for the brand's" type="number" step={0.01} min={0.01} max={0.4} value={d.alpha === null ? '' : String(d.alpha)} onChange={(e) => set('decoration', { ...d, alpha: numberOrNull(e.target.value, 0.01, 0.4) })} />
        )}
      </div>
      {d.kind === 'artwork' && (
        <div className="flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted">{artwork ? <img src={artwork} alt="Brand artwork" className="max-h-full max-w-full object-contain" /> : <span className="px-1 text-center text-[11px] text-muted-foreground">No artwork</span>}</div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-[12.5px] text-muted-foreground">A PNG, JPEG or WebP picture of your own (a pattern, a shape, a texture), up to 4 MB. SVG is not accepted. Text is checked against it like any page colour.</p>
              <div className="flex flex-wrap gap-2">
                <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) onArtwork(f); e.target.value = ''; }} />
                <BusyButton type="button" variant="outline" size="sm" loading={busy} onClick={() => input.current?.click()}><ImageUp aria-hidden="true" /> {artwork ? 'Replace' : 'Upload'} artwork</BusyButton>
                {artwork && <Button type="button" variant="ghost" size="sm" onClick={onRemoveArtwork}><Trash2 aria-hidden="true" /> Remove</Button>}
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Placement" value={d.fit} onValueChange={(v) => set('decoration', { ...d, fit: v as typeof d.fit })} options={optionsOf(ARTWORK_FITS)} />
            <TextField label="Opacity" hint="From 0.05 to 1" type="number" step={0.05} min={0.05} max={1} value={String(d.opacity)} onChange={(e) => set('decoration', { ...d, opacity: numberOrNull(e.target.value, 0.05, 1) ?? 1 })} />
          </div>
          {!artwork && <p className="text-[12.5px] text-muted-foreground">Until a picture is uploaded the pages stay plain.</p>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField label="Photos" hint="Applied to photographs, never to phone or desktop screens. Text over photos is still checked." value={p.treatment} onValueChange={(v) => set('photo', { ...p, treatment: v as typeof p.treatment })} options={optionsOf(PHOTO_TREATMENTS, 'photo')} />
        {(p.treatment === 'tint' || p.treatment === 'overlay') && <>
          <SelectField label="Colour" value={p.colour} onValueChange={(v) => set('photo', { ...p, colour: v })} options={optionsOf(STYLE_COLOURS)} />
          <TextField label="Strength" hint="From 0 to 1" type="number" step={0.05} min={0} max={1} value={String(p.strength)} onChange={(e) => set('photo', { ...p, strength: numberOrNull(e.target.value, 0, 1) ?? 0.5 })} />
        </>}
        {p.treatment === 'duotone' && <>
          <SelectField label="Shadows in" value={p.shadows} onValueChange={(v) => set('photo', { ...p, shadows: v })} options={optionsOf(STYLE_COLOURS)} />
          <SelectField label="Highlights in" value={p.highlights} onValueChange={(v) => set('photo', { ...p, highlights: v })} options={optionsOf(STYLE_COLOURS)} />
        </>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Logo" hint="Posters put their logo bar at the top or the bottom; other pages keep it in the footer and follow the side." value={style.logo} onValueChange={(v) => set('logo', v as StyleSettings['logo'])} options={[{ value: 'auto', label: 'As each page is laid out' }, ...optionsOf(LOGO_PLACES.filter((x) => x !== 'auto'))]} />
        <SelectField label="Beside the logo" value={style.footer} onValueChange={(v) => set('footer', v as StyleSettings['footer'])} options={optionsOf(FOOTERS, 'footer')} />
      </div>
    </div>
  );
}

