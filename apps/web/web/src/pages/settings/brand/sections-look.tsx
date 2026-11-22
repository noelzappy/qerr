// Brand and look, Colours, Type, Surfaces and photos, Post types.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Hint, Notice } from '@/components/kit';
import { SegmentedField } from '@/components/kit/segmented-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ACCENT_LABEL, ACCENTS, GROUND_LABEL, GROUNDS, groundColours, type BrandSettings } from '../brand-types';
import { Section } from '../section';
import { ColourRoles, LookFields, TypeFields, styleSwatches, type TypePart } from '../style-fields';
import { ColourField } from './fields';
import { useActiveLook } from '@/hooks/use-active-look';
import { LOOK_HINT, classicProblem, lookInForce, type BrandCtx } from './model';
import { Changes, Readability } from './preview';
import { ContrastDisplay } from './contrast-display';

// Each choice drawn as the corner it makes.
const corner = (r: string) => <span aria-hidden="true" className="mr-1.5 inline-block size-3 border-[1.5px] border-current" style={{ borderRadius: r }} />;
const CORNERS: Array<{ value: BrandSettings['corners']; label: ReactNode }> = [
  { value: 'square', label: <>{corner('0')}Square</> }, { value: 'soft', label: <>{corner('3px')}Softly rounded</> }, { value: 'round', label: <>{corner('999px')}Round</> },
];

export function ColoursSection({ ctx }: { ctx: BrandCtx }) {
  const { s, set, fields, look, view } = ctx;
  const setColour = (k: keyof BrandSettings['colours'], v: string) => ctx.update((cur) => ({ ...cur, colours: { ...cur.colours, [k]: v } }));
  const checks = look?.checks ?? view.checks;
  const customised = Object.values(s.roles).reduce((n, g) => n + Object.values(g).filter(Boolean).length, 0);
  return (
    <Section id="colours" title="Colours" description="Four colours to start from: they make every colour of your posts. Set any single colour yourself under Fine-tune. The check below says whether text stays readable on each page colour.">
      <div className="grid gap-3 md:grid-cols-2">
        <ColourField label="Primary" hint="Your main brand colour" value={s.colours.primary} onChange={(v) => setColour('primary', v)} error={fields['colours.primary']} />
        <ColourField label="Accent" hint="Highlights, numbers and buttons on dark pages" value={s.colours.accent} onChange={(v) => setColour('accent', v)} error={fields['colours.accent']} />
        <ColourField label="Dark" hint="Text, and the dark page colour" value={s.colours.dark} onChange={(v) => setColour('dark', v)} error={fields['colours.dark']} />
        <ColourField label="Light" hint="The light tint behind quiet pages" value={s.colours.light} onChange={(v) => setColour('light', v)} error={fields['colours.light']} />
      </div>
      {['grounds', 'text', 'accents', 'gradient', 'surfaces'].some((k) => k in (view.advanced ?? {})) && (
        <Notice tone="info">Imported brand settings (see Advanced) set the exact page and text colours, so changing these four colours has little effect. Clear them under Advanced to let these colours decide.</Notice>
      )}
      <Changes changes={look?.changes ?? []} />
      <SegmentedField label="Corners" hint="How rounded cards, panels and buttons are." value={s.corners} onValueChange={(v) => set('corners', v as BrandSettings['corners'])} options={CORNERS} />
      <ContrastDisplay value={s.contrastDisplay} onChange={(v) => set('contrastDisplay', v)} error={fields.contrastDisplay} />
      <Readability checks={checks} />
      <details className="border-t pt-3" open={customised > 0}>
        <summary className="cursor-pointer text-[13.5px] font-medium">
          Fine-tune each colour (advanced) <span className="font-normal text-muted-foreground">{customised ? `(${customised} set by you)` : '(all made from the four colours)'}</span>
        </summary>
        <div className="mt-3"><ColourRoles roles={s.roles} palette={look?.palette ?? null} onChange={(roles) => set('roles', roles)} /></div>
      </details>
    </Section>
  );
}

// While a look draws the posts: one line pointing to Settings, Looks, then the settings the look reads too (`look`), then the settings
// only the classic layouts draw (`classic`), folded one click away; they open by themselves when the server names a problem among
// them. With classic layouts in use, `all` shows as usual.
function ClassicSplit({ id, inForce, problem, look, classic, all }: { id: string; inForce: boolean; problem: boolean; look: ReactNode; classic: ReactNode; all: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (!inForce) return <>{all}</>;
  const open = shown || problem;
  return (
    <>
      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground">
        <span>A look is in use.</span>
        <Hint about="the look in use">{LOOK_HINT}</Hint>
        <Link to="/settings/looks" className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">Settings, Looks</Link>
      </p>
      {look}
      <div>
        <button
          type="button" aria-expanded={open} aria-controls={`${id}-classic`} onClick={() => setShown(!shown)}
          className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-[13px] font-medium outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11"
        >
          Settings for classic layouts only <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      <div id={`${id}-classic`} hidden={!open} className="flex flex-col gap-3">{open && classic}</div>
    </>
  );
}

export function TypeSection({ ctx }: { ctx: BrandCtx }) {
  const { s, view } = ctx;
  const inForce = lookInForce(s.style.direction, useActiveLook().active);
  const fields = (part?: TypePart) => (
    <TypeFields
      part={part} style={s.style} headlineWeight={s.headlineWeight} fonts={view.fontSources} version={view.updatedAt ?? ''} busy={ctx.busy}
      onChange={(type, headline) => ctx.update((cur) => ({ ...cur, style: { ...cur.style, type }, ...(headline !== undefined ? { headlineWeight: headline } : {}) }))}
      onUpload={(role, f, fam) => ctx.uploadFont(f, fam, role)} onGoogle={(role, fam) => ctx.pickGoogleFont(role, fam)} onRemove={(role) => ctx.askRemoveFont(role)}
    />
  );
  const saved = <p className="text-[13px] text-muted-foreground">Fonts you choose here are saved straight away, not with the Save bar.</p>;
  return (
    <Section id="type" title="Type" description="How headlines, body text and labels are set. Leave a value empty to keep the brand's own.">
      <ClassicSplit
        id="type" inForce={inForce} problem={classicProblem(ctx.fields, 'type')}
        look={<>{saved}{fields('look')}</>} classic={fields('classic')} all={<>{saved}{fields()}</>}
      />
    </Section>
  );
}

export function SurfacesSection({ ctx }: { ctx: BrandCtx }) {
  const { s, set } = ctx;
  const inForce = lookInForce(s.style.direction, useActiveLook().active);
  const swatches = styleSwatches(s.colours, ctx.look?.palette ?? null, groundColours(s.colours, s.roles));
  const fields = (part?: 'look' | 'classic') => (
    <LookFields part={part} swatches={swatches} style={s.style} onChange={(style) => set('style', style)} artwork={ctx.artworkUrl} busy={ctx.busy === 'artwork'} onArtwork={ctx.uploadArtwork} onRemoveArtwork={ctx.askRemoveArtwork} />
  );
  return (
    <Section id="surfaces" title="Surfaces and photos" description="How cards and panels stand off the page, the texture behind pages, what happens to photos, and where the logo goes.">
      <ClassicSplit id="surfaces" inForce={inForce} problem={classicProblem(ctx.fields, 'surfaces')} look={fields('look')} classic={fields('classic')} all={fields()} />
    </Section>
  );
}

// The headline styles in a word each; the full sentence is the segment's tooltip and is explained above the table.
const ACCENT_WORDS: Record<string, string> = { muted: 'Grey', colour: 'Accent', weight: 'Lighter', none: 'None' };
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
      description="The kinds of posts you make (tips, news, numbers...). Each has a page colour; the AI picks a post type for every post. Fonts and the second half of a headline are set under Type."
      aside={<Button type="button" variant="outline" size="sm" disabled={s.series.length >= MAX_POST_TYPES} onClick={() => set('series', [...s.series, { key: `series-${s.series.length + 1}`, name: 'New post type', ground: 'light', accent: 'muted' }])}><Plus aria-hidden="true" /> Add a post type</Button>}
    >
      {fields.series && <p className="text-[13px] font-medium text-destructive" role="alert">{fields.series}</p>}
      <div className="overflow-x-auto">
        <Table className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Page colour</TableHead>
              <TableHead><span className="inline-flex items-center gap-1">Headline style<Hint about="Headline style">How the second half of a headline stands out: in grey, in the accent colour, in a lighter weight, or not at all.</Hint></span></TableHead>
              <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.series.map((x, i) => (
              <TableRow key={i}>
                <TableCell className="whitespace-normal">
                  <Input aria-label={`Name of post type ${i + 1}`} value={x.name} maxLength={40} onChange={(e) => { const name = e.target.value; const keyFollows = x.key === slug(x.name) || x.key.startsWith('series-'); change(i, { name, key: keyFollows ? slug(name) : x.key }); }} />
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Select value={x.ground} onValueChange={(v) => change(i, { ground: v })}>
                    <SelectTrigger className="w-full" aria-label={`Page colour of ${x.name}`}><SelectValue /></SelectTrigger>
                    <SelectContent position="popper">{GROUNDS.map((g) => <SelectItem key={g} value={g}>{GROUND_LABEL[g]}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <SegmentedField hideLabel label={`Headline style of ${x.name}`} value={x.accent} onValueChange={(v) => change(i, { accent: v })}
                    options={ACCENTS.map((a) => ({ value: a, label: ACCENT_WORDS[a] ?? a, title: ACCENT_LABEL[a] }))} />
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove the post type ${x.name}`} disabled={s.series.length <= 1} onClick={() => remove(i)}><Trash2 aria-hidden="true" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}
