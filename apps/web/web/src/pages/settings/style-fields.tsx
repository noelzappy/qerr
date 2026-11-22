// The style layer's fields in Settings, Brand and look: the colour roles, the type roles, surfaces and decoration, the photo
// treatment, and the logo and footer. Each field is a choice from Qerr's fixed lists or a number in its range; the server
// checks every value again before anything is saved.
import { type ReactNode } from 'react';
import { ImageUp, RotateCcw, Trash2 } from 'lucide-react';
import { Hint } from '@/components/kit';
import { SegmentedField } from '@/components/kit/segmented-field';
import { Button } from '@/components/ui/button';
import { FileField } from './brand/fields';
import {
  ARTWORK_FITS, DECORATION_ON, DISPLAY_FONTS, FOOTERS, LABEL_FONTS, ROLE_GROUPS, ROLE_LABEL, STYLE_COLOURS, SURFACES, TYPE_CASES,
  emptyRoles, optionsOf, type BrandRoles, type FontRole, type FontSource, type Palette, type RoleGroup, type StyleSettings, type TypeRole,
} from './brand-types';
import { AccentPicker, DecorationPicker, LogoPlacePicker, PhotoTreatmentPicker, WeightPicker, type SampleColours } from './brand/pickers';
import { ArtworkOpacityField, DecorationStrengthField, HeadlineSizeField, PhotoStrengthField, TrackingField } from './brand/preset-fields';
import { RoleTile } from './brand/role-grid';
import { RoleFont } from './font-source';
import { RolePicker } from './looks/design-controls';
import type { Swatches } from './looks/design-colours';

const HEADLINE_WEIGHTS = [300, 400, 500, 600, 700];
// Short words for a segment, with the full sentence as its tooltip.
const short = (list: readonly string[], words: Record<string, string>, where?: Parameters<typeof optionsOf>[1]) =>
  optionsOf(list, where).map((o) => ({ value: o.value, label: words[o.value] ?? o.label, title: o.label }));
const FONT_WORDS: Record<string, string> = { body: 'Body font', label: 'Label font', own: 'Its own', mono: 'Mono' };
const FOOTER_WORDS: Record<string, string> = { website: 'Website', pill: 'Pill and website', none: 'Logo only' };
// The colours a photo can take (STYLE_COLOURS), as swatches of the brand's own colours: the page colours and the four roles.
export const STYLE_COLOUR_WORD = (c: string): string => LABELS_FOR_COLOUR[c] ?? c;
const LABELS_FOR_COLOUR: Record<string, string> = Object.fromEntries(optionsOf(STYLE_COLOURS).map((o) => [o.value, o.label]));
export function styleSwatches(colours: { primary: string; accent: string; dark: string; light: string }, palette: Palette | null, grounds: Record<string, string>): Swatches {
  const a = palette?.accents ?? {}, t = palette?.text ?? {}, g = palette?.grounds ?? {};
  return {
    ...grounds, ...g,
    primary: a.primary ?? colours.primary, accent: a.gold ?? colours.accent, ink: t.ink ?? colours.dark, inverse: t.inverse ?? '#ffffff',
  };
}

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
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {set.groups.flatMap((group) => ROLE_GROUPS[group].keys.map((k) => (
              <RoleTile key={`${group}.${k}`} label={ROLE_LABEL[`${group}.${k}`] ?? k} value={roles[group][k] ?? paletteValue(palette, group, k)} set={!!roles[group][k]}
                onSet={(v) => put(group, k, v || undefined)} onReset={() => put(group, k, undefined)} />
            )))}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

// ---- type ----

// `part` (see TypeFields): 'look' draws only the role's font and font file, 'classic' only its case, spacing and weight.
function TypeRoleFields({ title, hint, role, onChange, font, weight, fontFile, part }: { title: string; hint: string; role: TypeRole; onChange: (r: TypeRole) => void; font?: ReactNode; weight?: ReactNode; fontFile?: ReactNode; part?: TypePart }) {
  if (part === 'look') {
    if (!font && !fontFile) return null;
    return (
      <fieldset className="mt-5 flex min-w-0 flex-col gap-3 first:mt-0">
        <legend className="mb-2 flex items-center gap-1 text-[13.5px] font-semibold">{title}<Hint about={title}>{hint}</Hint></legend>
        {font && <div className="grid gap-3 sm:grid-cols-2">{font}</div>}
        {fontFile}
      </fieldset>
    );
  }
  return (
    <fieldset className="mt-5 flex min-w-0 flex-col gap-3 first:mt-0">
      <legend className="mb-2 flex items-center gap-1 text-[13.5px] font-semibold">{title}<Hint about={title}>{hint}</Hint></legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {part !== 'classic' && font}
        <SegmentedField label="Case" value={role.case} onValueChange={(v) => onChange({ ...role, case: v as TypeRole['case'] })} options={optionsOf(TYPE_CASES)} />
      </div>
      <TrackingField value={role.tracking} onChange={(v) => onChange({ ...role, tracking: v })} />
      {weight ?? <WeightPicker label="Weight" hint="How heavy the letters are." value={role.weight} onChange={(w) => onChange({ ...role, weight: w })} empty="Brand's own" />}
      {part !== 'classic' && fontFile}
    </fieldset>
  );
}

// `part`: 'look' is what a look reads too (each role's font and font file), 'classic' what only the classic layouts draw (case, letter
// spacing, weight, headline size, the second half of a headline); both by default. See LOOK_READS in brand/model.ts.
export type TypePart = 'look' | 'classic';
export function TypeFields({ style, headlineWeight, onChange, fonts, version, busy, onUpload, onGoogle, onRemove, part, sample }: {
  style: StyleSettings; headlineWeight: number; part?: TypePart;
  // the brand's colours for the headline samples (the second half of a headline)
  sample?: SampleColours;
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
    <WeightPicker
      label="Weight" hint="How heavy headlines are. Regular is 400, bold is 700."
      value={shownWeight}
      onChange={(w) => {
        if (w === null) return;
        if (HEADLINE_WEIGHTS.includes(w)) onChange({ ...t, display: { ...t.display, weight: null } }, w);
        else onChange({ ...t, display: { ...t.display, weight: w } });
      }}
    />
  );
  return (
    <div className="flex flex-col">
      <TypeRoleFields
        title="Headlines" hint="Headlines and big figures. Built in, they use the body font or the label font."
        part={part} role={t.display} onChange={(r) => onChange({ ...t, display: { ...t.display, ...r } })} weight={headlineWeightField}
        fontFile={t.display.font === 'own' ? font('display') : undefined}
        font={<SegmentedField label="Font" value={t.display.font} onValueChange={(v) => onChange({ ...t, display: { ...t.display, font: v as typeof t.display.font } })} options={short(DISPLAY_FONTS, FONT_WORDS)} />}
      />
      <TypeRoleFields title="Body" hint="Sub lines, lists and captions, and headlines unless they have a font of their own. Built in, this is Inter." part={part} role={t.body} onChange={(r) => onChange({ ...t, body: r })} fontFile={font('body')} />
      <TypeRoleFields
        title="Labels" hint="Top labels, footers, the small label above a headline and the website. Figures in tables keep the monospaced font."
        part={part} role={t.label} onChange={(r) => onChange({ ...t, label: { ...t.label, ...r } })}
        fontFile={t.label.font === 'own' ? font('label') : undefined}
        font={<SegmentedField label="Font" value={t.label.font} onValueChange={(v) => onChange({ ...t, label: { ...t.label, font: v as typeof t.label.font } })} options={short(LABEL_FONTS, { ...FONT_WORDS, mono: 'Built-in mono' })} />}
      />
      {part !== 'look' && <div className="mt-5 flex flex-col gap-4">
        <HeadlineSizeField value={t.scale} onChange={(v) => onChange({ ...t, scale: v })} />
        <AccentPicker value={t.accent} colours={sample} onChange={(v) => onChange({ ...t, accent: v })}
          hint="The phrase in a headline that stands out. Use one style for every page, or let each post type decide." />
      </div>}
    </div>
  );
}

// ---- surfaces, decoration, photos, logo ----

// `part`: 'look' is what a look reads too (the photo treatment and the logo's place), 'classic' what only the classic layouts draw
// (cards and panels, decoration and artwork, what goes beside the logo); both by default. See LOOK_READS in brand/model.ts.
export function LookFields({ style, onChange, artwork, busy, onArtwork, onRemoveArtwork, part, swatches }: {
  style: StyleSettings; onChange: (s: StyleSettings) => void; artwork: string | null; busy: boolean; onArtwork: (f: File) => void; onRemoveArtwork: () => void;
  part?: 'look' | 'classic';
  // the brand's colours for the colour choices (styleSwatches)
  swatches: Swatches;
}) {
  const d = style.decoration, p = style.photo;
  const set = <K extends keyof StyleSettings>(k: K, v: StyleSettings[K]) => onChange({ ...style, [k]: v });
  const logoField = <LogoPlacePicker value={style.logo} onChange={(v) => set('logo', v)} colour={swatches.primary ?? '#2f4b8f'}
    hint="Moves the logo on posters, editorial pages and photo posts, with what shares its edge; a page whose picture takes that edge keeps its logo where it is and follows the side. As laid out leaves it where each page puts it. A layout's own logo block stays where the layout puts it." />;
  const footerField = <SegmentedField label="Beside the logo" value={style.footer} onValueChange={(v) => set('footer', v as StyleSettings['footer'])} options={short(FOOTERS, FOOTER_WORDS, 'footer')} />;
  const colour = (label: string, value: string, put: (v: string) => void) => (
    <RolePicker label={label} value={value} roles={[...STYLE_COLOURS]} swatches={swatches} wordOf={STYLE_COLOUR_WORD} onChange={(v) => { if (v) put(v); return ''; }} />
  );
  const photos = (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2"><PhotoTreatmentPicker value={p.treatment} photo={p} swatches={swatches} onChange={(v) => set('photo', { ...p, treatment: v })}
        hint="Applied to photographs, never to phone or desktop screens. Text over photos is still checked." /></div>
      {(p.treatment === 'tint' || p.treatment === 'overlay') && <>
        {colour('Colour', p.colour, (v) => set('photo', { ...p, colour: v }))}
        <PhotoStrengthField className="md:col-span-2" value={p.strength} colour={swatches[p.colour] ?? '#2f4b8f'} onChange={(v) => set('photo', { ...p, strength: v })} />
      </>}
      {p.treatment === 'duotone' && <>
        {colour('Shadows in', p.shadows, (v) => set('photo', { ...p, shadows: v }))}
        {colour('Highlights in', p.highlights, (v) => set('photo', { ...p, highlights: v }))}
      </>}
    </div>
  );
  if (part === 'look') return <div className="flex flex-col gap-4">{photos}{logoField}</div>;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <SegmentedField label="Cards and panels" value={style.surface} onValueChange={(v) => set('surface', v as StyleSettings['surface'])} options={optionsOf(SURFACES)} />
        <SegmentedField label="Decoration on" value={d.on} onValueChange={(v) => set('decoration', { ...d, on: v as typeof d.on })} options={short(DECORATION_ON, { dark: 'Dark pages only', all: 'Every page' })} disabled={d.kind === 'none'} />
      </div>
      <DecorationPicker value={d.kind} onChange={(v) => set('decoration', { ...d, kind: v })} dark={swatches.dark ?? '#1d2026'} light={swatches.light ?? '#ffffff'} alpha={d.alpha} artwork={artwork} />
      {['dots', 'grid', 'lines', 'auto'].includes(d.kind) && (
        <DecorationStrengthField value={d.alpha} onChange={(v) => set('decoration', { ...d, alpha: v })} />
      )}
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
            <SegmentedField label="Placement" value={d.fit} onValueChange={(v) => set('decoration', { ...d, fit: v as typeof d.fit })} options={optionsOf(ARTWORK_FITS)} />
            <ArtworkOpacityField value={d.opacity} onChange={(v) => set('decoration', { ...d, opacity: v })} />
          </div>
          {!artwork && <p className="text-[13px] text-muted-foreground">Until a picture is uploaded the pages stay plain.</p>}
        </div>
      )}
      {part !== 'classic' && photos}
      {part !== 'classic' && logoField}
      <div className="grid gap-3 md:grid-cols-2">{footerField}</div>
    </div>
  );
}
