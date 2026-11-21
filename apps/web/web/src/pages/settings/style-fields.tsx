// The style layer's fields in Settings, Brand and look: the colour roles, the type roles, surfaces and decoration, the photo
// treatment, and the logo and footer. Each field is a choice from Vesk's fixed lists or a number in its range; the server
// checks every value again before anything is saved.
import { type ReactNode } from 'react';
import { ImageUp, RotateCcw, Trash2 } from 'lucide-react';
import { Hint, SelectField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { ColourControl, FileField, NumberField } from './brand/fields';
import {
  ACCENT_DEVICES, ARTWORK_FITS, DECORATION_ON, DECORATIONS, DISPLAY_FONTS, FOOTERS, LABEL_FONTS, LOGO_PLACES, PHOTO_TREATMENTS, ROLE_GROUPS, ROLE_LABEL, STYLE_COLOURS, SURFACES, TYPE_CASES, WEIGHT_NAME,
  emptyRoles, optionsOf, type BrandRoles, type FontRole, type FontSource, type Palette, type RoleGroup, type StyleSettings, type TypeRole,
} from './brand-types';
import { RoleFont } from './font-source';

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const HEADLINE_WEIGHTS = [300, 400, 500, 600, 700];
const DEFAULT = '';
const weightOption = (w: number) => ({ value: String(w), label: `${w} ${WEIGHT_NAME[w] ?? ''}`.trim() });

// ---- colour roles ----

// What a role is now: the colour people set, or the one the server made from the four colours.
const paletteValue = (p: Palette | null, group: RoleGroup, key: string): string | undefined => (p?.[group] as Record<string, string> | undefined)?.[key];

// The roles under plain headings; the two panel groups the server keeps apart read as one set to people.
const ROLE_SETS: Array<{ title: string; groups: RoleGroup[] }> = [
  { title: 'Page colours', groups: ['grounds'] },
  { title: 'Text', groups: ['text'] },
  { title: 'Accents', groups: ['accents'] },
  { title: 'Panels and cards', groups: ['surfaces', 'slabs'] },
];

function RoleSwatch({ group, k, value, set, onSet, onReset }: { group: RoleGroup; k: string; value: string | undefined; set: boolean; onSet: (v: string) => void; onReset: () => void }) {
  const label = ROLE_LABEL[`${group}.${k}`] ?? k;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium">{label}</span>
        <span className={set ? 'shrink-0 text-[12px] font-medium text-foreground' : 'shrink-0 text-[12px] text-muted-foreground'}>{set ? 'Set by you' : 'Automatic'}</span>
      </div>
      <ColourControl label={label} value={value ?? ''} onChange={onSet} compact allowEmpty />
      {set && <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onReset}><RotateCcw aria-hidden="true" /> Reset to automatic</Button>}
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
        <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
          Each colour posts use.
          <Hint about="the colour list">A colour you do not set is made from the four colours above, and text colours among them are adjusted until they read. A colour you set is used exactly as you set it; if it is hard to read, the colour check says so.</Hint>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!setCount} onClick={() => onChange(emptyRoles())}><RotateCcw aria-hidden="true" /> Reset all to automatic{setCount ? ` (${setCount} set)` : ''}</Button>
      </div>
      {ROLE_SETS.map((set) => (
        <fieldset key={set.title} className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13.5px] font-semibold">{set.title}</legend>
          <ul className="grid gap-3 md:grid-cols-2">
            {set.groups.flatMap((group) => ROLE_GROUPS[group].keys.map((k) => (
              <RoleSwatch key={`${group}.${k}`} group={group} k={k} value={roles[group][k] ?? paletteValue(palette, group, k)} set={!!roles[group][k]} onSet={(v) => put(group, k, v)} onReset={() => put(group, k, undefined)} />
            )))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

// ---- type ----

function TypeRoleFields({ title, hint, role, onChange, font, weight, fontFile }: { title: string; hint: string; role: TypeRole; onChange: (r: TypeRole) => void; font?: ReactNode; weight?: ReactNode; fontFile?: ReactNode }) {
  return (
    <fieldset className="mt-5 flex min-w-0 flex-col gap-3 first:mt-0">
      <legend className="mb-2 flex items-center gap-1 text-[13.5px] font-semibold">{title}<Hint about={title}>{hint}</Hint></legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {font}
        <SelectField label="Case" value={role.case} onValueChange={(v) => onChange({ ...role, case: v as TypeRole['case'] })} options={optionsOf(TYPE_CASES)} />
        <NumberField
          label="Letter spacing" hint="Tighter or wider letters. 0 is normal; try 0.02 for a little more air. Leave empty to use the brand's."
          min={-0.1} max={0.3} emptyAllowed value={role.tracking} onChange={(v) => onChange({ ...role, tracking: v })}
        />
        {weight ?? <SelectField label="Weight" hint="How heavy the letters are." value={role.weight === null ? DEFAULT : String(role.weight)} onValueChange={(v) => onChange({ ...role, weight: v === DEFAULT ? null : Number(v) })} options={[{ value: DEFAULT, label: "The brand's own" }, ...WEIGHTS.map(weightOption)]} />}
      </div>
      {fontFile}
    </fieldset>
  );
}

export function TypeFields({ style, headlineWeight, onChange, fonts, version, busy, onUpload, onGoogle, onRemove }: {
  style: StyleSettings; headlineWeight: number;
  // `headline` is given when the brand's headline weight changes with the type settings, in one step.
  onChange: (t: StyleSettings['type'], headline?: number) => void; fonts: Record<FontRole, FontSource | null>; version: string;
  busy: string; onUpload: (role: FontRole, f: File, family: string) => void; onGoogle: (role: FontRole, family: string) => void; onRemove: (role: FontRole) => void;
}) {
  const t = style.type;
  const font = (role: FontRole) => <RoleFont role={role} current={fonts[role]} version={version} busy={busy} onUpload={onUpload} onGoogle={onGoogle} onRemove={onRemove} />;
  // One headline weight. The brand has a headline weight (300 to 700) and the headline type may set an exact one (100 to 900);
  // this single choice writes whichever applies, so the two can never disagree.
  const shownWeight = t.display.weight ?? headlineWeight;
  const headlineWeightField = (
    <SelectField
      label="Weight" hint="How heavy headlines are. Regular is 400, bold is 700."
      value={String(shownWeight)}
      onValueChange={(v) => {
        const w = Number(v);
        if (HEADLINE_WEIGHTS.includes(w)) onChange({ ...t, display: { ...t.display, weight: null } }, w);
        else onChange({ ...t, display: { ...t.display, weight: w } });
      }}
      options={WEIGHTS.map(weightOption)}
    />
  );
  return (
    <div className="flex flex-col">
      <TypeRoleFields
        title="Headlines" hint="Headlines and big figures. Built in, they use the body font or the label font."
        role={t.display} onChange={(r) => onChange({ ...t, display: { ...t.display, ...r } })} weight={headlineWeightField}
        fontFile={t.display.font === 'own' ? font('display') : undefined}
        font={<SelectField label="Font" value={t.display.font} onValueChange={(v) => onChange({ ...t, display: { ...t.display, font: v as typeof t.display.font } })} options={optionsOf(DISPLAY_FONTS)} />}
      />
      <TypeRoleFields title="Body" hint="Sub lines, lists and captions, and headlines unless they have a font of their own. Built in, this is Inter." role={t.body} onChange={(r) => onChange({ ...t, body: r })} fontFile={font('body')} />
      <TypeRoleFields
        title="Labels" hint="Top labels, footers, the small label above a headline and the website. Figures in tables keep the monospaced font."
        role={t.label} onChange={(r) => onChange({ ...t, label: { ...t.label, ...r } })}
        fontFile={t.label.font === 'own' ? font('label') : undefined}
        font={<SelectField label="Font" value={t.label.font} onValueChange={(v) => onChange({ ...t, label: { ...t.label, font: v as typeof t.label.font } })} options={optionsOf(LABEL_FONTS)} />}
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Headline size" hint="Makes every headline bigger or smaller. 1 is normal; 1.1 is a tenth bigger. Long headlines are still shrunk to fit."
          min={0.8} max={1.25} value={t.scale} onChange={(v) => onChange({ ...t, scale: v ?? 1 })}
        />
        <SelectField label="Second half of a headline" hint="The phrase in a headline that stands out. Use one style for every page, or let each post type decide." value={t.accent} onValueChange={(v) => onChange({ ...t, accent: v as typeof t.accent })} options={optionsOf(ACCENT_DEVICES, 'accent')} />
      </div>
    </div>
  );
}

// ---- surfaces, decoration, photos, logo ----

export function LookFields({ style, onChange, artwork, busy, onArtwork, onRemoveArtwork }: {
  style: StyleSettings; onChange: (s: StyleSettings) => void; artwork: string | null; busy: boolean; onArtwork: (f: File) => void; onRemoveArtwork: () => void;
}) {
  const d = style.decoration, p = style.photo;
  const set = <K extends keyof StyleSettings>(k: K, v: StyleSettings[K]) => onChange({ ...style, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField label="Cards and panels" value={style.surface} onValueChange={(v) => set('surface', v as StyleSettings['surface'])} options={optionsOf(SURFACES)} />
        <SelectField label="Decoration" value={d.kind} onValueChange={(v) => set('decoration', { ...d, kind: v as typeof d.kind })} options={optionsOf(DECORATIONS, 'decoration')} />
        <SelectField label="Decoration on" value={d.on} onValueChange={(v) => set('decoration', { ...d, on: v as typeof d.on })} options={optionsOf(DECORATION_ON)} disabled={d.kind === 'none'} />
        {['dots', 'grid', 'lines', 'auto'].includes(d.kind) && (
          <NumberField label="Decoration strength" hint="How visible the pattern is: 0.01 is faint, 0.4 is strong. Leave empty to use the brand's." min={0.01} max={0.4} emptyAllowed value={d.alpha} onChange={(v) => set('decoration', { ...d, alpha: v })} />
        )}
      </div>
      {d.kind === 'artwork' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex h-24 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted">{artwork ? <img src={artwork} alt="Brand artwork" className="max-h-full max-w-full object-contain" /> : <span className="px-1 text-center text-[11px] text-muted-foreground">No artwork</span>}</div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <FileField
                label="Artwork" accept="image/png,image/jpeg,image/webp" onFile={onArtwork} busy={busy} icon={<ImageUp aria-hidden="true" />} buttonLabel={`${artwork ? 'Replace' : 'Upload'} artwork`}
                statusKey="artwork" immediate hint="A PNG, JPEG or WebP picture of your own (a pattern, a shape, a texture), up to 4 MB. SVG is not accepted. Text is checked against it like any page colour."
              />
              {artwork && <div><Button type="button" variant="ghost" size="sm" onClick={onRemoveArtwork}><Trash2 aria-hidden="true" /> Remove artwork</Button></div>}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField label="Placement" value={d.fit} onValueChange={(v) => set('decoration', { ...d, fit: v as typeof d.fit })} options={optionsOf(ARTWORK_FITS)} />
            <NumberField label="Opacity" hint="How solid the artwork is: 0.05 is faint, 1 is solid." min={0.05} max={1} value={d.opacity} onChange={(v) => set('decoration', { ...d, opacity: v ?? 1 })} />
          </div>
          {!artwork && <p className="text-[13px] text-muted-foreground">Until a picture is uploaded the pages stay plain.</p>}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField label="Photos" hint="Applied to photographs, never to phone or desktop screens. Text over photos is still checked." value={p.treatment} onValueChange={(v) => set('photo', { ...p, treatment: v as typeof p.treatment })} options={optionsOf(PHOTO_TREATMENTS, 'photo')} />
        {(p.treatment === 'tint' || p.treatment === 'overlay') && <>
          <SelectField label="Colour" value={p.colour} onValueChange={(v) => set('photo', { ...p, colour: v })} options={optionsOf(STYLE_COLOURS)} />
          <NumberField label="Strength" hint="From 0 (none) to 1 (full)." min={0} max={1} value={p.strength} onChange={(v) => set('photo', { ...p, strength: v ?? 0.5 })} />
        </>}
        {p.treatment === 'duotone' && <>
          <SelectField label="Shadows in" value={p.shadows} onValueChange={(v) => set('photo', { ...p, shadows: v })} options={optionsOf(STYLE_COLOURS)} />
          <SelectField label="Highlights in" value={p.highlights} onValueChange={(v) => set('photo', { ...p, highlights: v })} options={optionsOf(STYLE_COLOURS)} />
        </>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField label="Logo" hint="Moves the logo on posters, editorial pages and photo posts, with what shares its edge; a page whose picture takes that edge keeps its logo where it is and follows the side. A layout's own logo block stays where the layout puts it." value={style.logo} onValueChange={(v) => set('logo', v as StyleSettings['logo'])} options={[{ value: 'auto', label: 'As each page is laid out' }, ...optionsOf(LOGO_PLACES.filter((x) => x !== 'auto'))]} />
        <SelectField label="Beside the logo" value={style.footer} onValueChange={(v) => set('footer', v as StyleSettings['footer'])} options={optionsOf(FOOTERS, 'footer')} />
      </div>
    </div>
  );
}
