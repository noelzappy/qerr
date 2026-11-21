// Brand and look, Colours, Type, Surfaces and photos, Post types.
import { Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Notice, SelectField, TextField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { ACCENT_LABEL, ACCENTS, GROUND_LABEL, GROUNDS, type BrandSettings } from '../brand-types';
import { Section } from '../section';
import { ColourRoles, LookFields, TypeFields } from '../style-fields';
import { ColourField } from './fields';
import { sectionPath, type BrandCtx } from './model';
import { Changes, Readability } from './preview';

export function ColoursSection({ ctx }: { ctx: BrandCtx }) {
  const { s, set, fields, look, view } = ctx;
  const setColour = (k: keyof BrandSettings['colours'], v: string) => ctx.update((cur) => ({ ...cur, colours: { ...cur.colours, [k]: v } }));
  const checks = look?.checks ?? view.checks;
  const customised = Object.values(s.roles).reduce((n, g) => n + Object.values(g).filter(Boolean).length, 0);
  return (
    <Section id="colours" title="Colours" description="Four colours to start from: they make every colour of your posts. Set any single colour yourself under Fine-tune. The check below says whether text stays readable on each page colour.">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColourField label="Primary" hint="Your main brand colour" value={s.colours.primary} onChange={(v) => setColour('primary', v)} error={fields['colours.primary']} />
        <ColourField label="Accent" hint="Highlights, numbers and buttons on dark pages" value={s.colours.accent} onChange={(v) => setColour('accent', v)} error={fields['colours.accent']} />
        <ColourField label="Dark" hint="Text, and the dark page colour" value={s.colours.dark} onChange={(v) => setColour('dark', v)} error={fields['colours.dark']} />
        <ColourField label="Light" hint="The light tint behind quiet pages" value={s.colours.light} onChange={(v) => setColour('light', v)} error={fields['colours.light']} />
      </div>
      {['grounds', 'text', 'accents', 'gradient', 'surfaces'].some((k) => k in (view.advanced ?? {})) && (
        <Notice tone="info">Imported brand settings (see Advanced) set the exact page and text colours, so changing these four colours has little effect. Clear them under Advanced to let these colours decide.</Notice>
      )}
      <Changes changes={look?.changes ?? []} />
      <SelectField label="Corners" hint="How rounded cards, panels and buttons are." value={s.corners} onValueChange={(v) => set('corners', v as BrandSettings['corners'])} options={[{ value: 'square', label: 'Square' }, { value: 'soft', label: 'Softly rounded' }, { value: 'round', label: 'Round' }]} className="sm:max-w-xs" />
      <Readability checks={checks} />
      <details className="rounded-lg border p-3" open={customised > 0}>
        <summary className="cursor-pointer text-[13.5px] font-medium">
          Fine-tune each colour (advanced) <span className="font-normal text-muted-foreground">{customised ? `(${customised} set by you)` : '(all made from the four colours)'}</span>
        </summary>
        <div className="mt-3"><ColourRoles roles={s.roles} palette={look?.palette ?? null} onChange={(roles) => set('roles', roles)} /></div>
      </details>
    </Section>
  );
}

export function TypeSection({ ctx }: { ctx: BrandCtx }) {
  const { s, view } = ctx;
  return (
    <Section id="type" title="Type" description="How headlines, body text and labels are set. Leave a value empty to keep the brand's own.">
      <p className="text-[13px] text-muted-foreground">
        Posts use {view.fontSources.body ? <strong className="text-foreground">{view.fontSources.body.family}</strong> : 'Inter'} for text{view.fontSources.display ? <> and <strong className="text-foreground">{view.fontSources.display.family}</strong> for headlines</> : ''}.
        Fonts you choose here are saved straight away, not with the Save bar.
      </p>
      <TypeFields
        style={s.style} headlineWeight={s.headlineWeight} fonts={view.fontSources} version={view.updatedAt ?? ''} busy={ctx.busy}
        onChange={(type, headline) => ctx.update((cur) => ({ ...cur, style: { ...cur.style, type }, ...(headline !== undefined ? { headlineWeight: headline } : {}) }))}
        onUpload={(role, f, fam) => ctx.uploadFont(f, fam, role)} onGoogle={(role, fam, w) => ctx.pickGoogleFont(role, fam, w)} onRemove={(role) => ctx.askRemoveFont(role)}
      />
    </Section>
  );
}

export function SurfacesSection({ ctx }: { ctx: BrandCtx }) {
  const { s, set } = ctx;
  return (
    <Section id="surfaces" title="Surfaces and photos" description="How cards and panels stand off the page, the texture behind pages, what happens to photos, and where the logo goes.">
      <LookFields style={s.style} onChange={(style) => set('style', style)} artwork={ctx.artworkUrl} busy={ctx.busy === 'artwork'} onArtwork={ctx.uploadArtwork} onRemoveArtwork={ctx.askRemoveArtwork} />
    </Section>
  );
}

const slug = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'series';
const MAX_POST_TYPES = 16;

export function PostTypesSection({ ctx }: { ctx: BrandCtx }) {
  const { s, set, fields } = ctx;
  const change = (i: number, patch: Partial<BrandSettings['series'][number]>) => ctx.update((cur) => ({ ...cur, series: cur.series.map((y, j) => (j === i ? { ...y, ...patch } : y)) }));
  function remove(i: number) {
    const gone = s.series[i]!;
    ctx.update((cur) => ({ ...cur, series: cur.series.filter((_, j) => j !== i) }));
    toast(`Removed the post type "${gone.name}".`, {
      duration: 10000,
      action: { label: 'Undo', onClick: () => ctx.update((cur) => (cur.series.some((y) => y.key === gone.key) ? cur : { ...cur, series: [...cur.series.slice(0, i), gone, ...cur.series.slice(i)] })) },
    });
  }
  return (
    <Section
      id="post-types"
      title="Post types"
      description="The kinds of posts you make (tips, news, numbers...). Each has a page colour; the AI picks a post type for every post."
      aside={<Button type="button" variant="outline" size="sm" disabled={s.series.length >= MAX_POST_TYPES} onClick={() => set('series', [...s.series, { key: `series-${s.series.length + 1}`, name: 'New post type', ground: 'light', accent: 'muted' }])}><Plus aria-hidden="true" /> Add a post type</Button>}
    >
      {fields.series && <p className="text-[13px] font-medium text-destructive" role="alert">{fields.series}</p>}
      <ul className="flex flex-col gap-2">
        {s.series.map((x, i) => (
          <li key={i} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1.2fr_1fr_1.3fr_auto]">
            <TextField label="Name" value={x.name} maxLength={40} onChange={(e) => { const name = e.target.value; const keyFollows = x.key === slug(x.name) || x.key.startsWith('series-'); change(i, { name, key: keyFollows ? slug(name) : x.key }); }} />
            <SelectField label="Page colour" value={x.ground} onValueChange={(v) => change(i, { ground: v })} options={GROUNDS.map((g) => ({ value: g, label: GROUND_LABEL[g]! }))} />
            <SelectField label="Headline style" value={x.accent} onValueChange={(v) => change(i, { accent: v })} options={ACCENTS.map((a) => ({ value: a, label: ACCENT_LABEL[a]! }))} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove the post type ${x.name}`} disabled={s.series.length <= 1} onClick={() => remove(i)}><Trash2 aria-hidden="true" /></Button>
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">Fonts and the second half of a headline are set under <Link className="underline underline-offset-2" to={sectionPath('type')}>Type</Link>.</p>
    </Section>
  );
}
