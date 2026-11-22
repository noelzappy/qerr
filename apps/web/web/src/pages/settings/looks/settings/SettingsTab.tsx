// The Settings tab of a look as choices, not configuration: about seven groups, each with a short title, a choice (cards or a switch,
// each a preset over several values, "Custom" when the values fit none) and a "Fine-tune" link. Fine-tune shows the group's grouped
// controls (fine-controls.ts: a number with named presets standing for several values, and the weight strips), then an "Exact values"
// disclosure with every catalogue value of the group, drawn by the catalogue-driven controls of look-settings.tsx. Details has no
// choice, only Fine-tune. A server problem on a value opens its group's Fine-tune and exact values.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Hint, SwitchField } from '@/components/kit';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '../../../../api';
import { mix, type BrandView } from '../../brand-types';
import { descAt, getAt, settingsOf, writeSetting } from '../look-model';
import { Node, type SettingsCtx } from '../look-settings';
import type { Json } from '../look-types';
import { lookApi } from '../looks-api';
import { CardChoice, ColourDiagram, CustomChip, LogoDiagram, NEUTRAL_COLOURS, PictureThumb, Segmented, SpaceDiagram, type BrandColours } from './controls';
import { assignNodes, changedCount, DETAILS_TEXT, GROUPS, groupOfPath, leafCount, resetNodes, type GroupId, type SettingsGroup } from './groups';
import { accentAsType, accentSwitchRelevant, choose, CONTROLS, detect, hasGrain, LOGO_SIZES, OWN_FONT, pairingName, PAIRINGS, setGrain, SPACES, TREATS, LOGICS, FROM_PICTURE, type PresetCtx } from './presets';
import { cardFontFamily, ensureFamily } from './load-fonts';
import { syncWeights } from './weights';
import { FINE_LAYOUT, fineAvailable, WEIGHTS_CONTROL, type FineCtx } from './fine-controls';
import { FineNumber, WeightStrips } from './fine-tune';

const FEEL = [
  { path: 'dials.tilt', label: 'Tilt', lo: 'Straight', hi: 'Tilted' },
  // The engine's density runs from tight (-1) to loose (1), so the airy end is the high one.
  { path: 'dials.density', label: 'Density', lo: 'Dense', hi: 'Airy' },
  { path: 'dials.weightShift', label: 'Weight', lo: 'Lighter', hi: 'Heavier' },
];

export interface SettingsTabProps {
  ctx: SettingsCtx;
  // The definitions of the look's designs (the weights a look needs depend on them).
  comps: Json[];
  // What the look was made from ("copy:<ref>"), and its settings as saved: the baseline Reset and Space go back to.
  originRef: string | null;
  saved: Json;
  // Replace the whole draft (a choice writes several values at once).
  onLook: (next: Json) => void;
}

function useBrand(): { colours: BrandColours; ownFonts: boolean } {
  const [state, setState] = useState<{ colours: BrandColours; ownFonts: boolean }>({ colours: NEUTRAL_COLOURS, ownFonts: false });
  useEffect(() => {
    let live = true;
    api.get<BrandView>('/api/settings/brand').then((v) => {
      if (live) setState({ colours: { ...NEUTRAL_COLOURS, ...v.settings.colours }, ownFonts: !!(v.fonts?.display && v.fonts?.body) });
    }).catch(() => { /* neutral colours stay */ });
    return () => { live = false; };
  }, []);
  return state;
}

function useOrigin(originRef: string | null, saved: Json): Json {
  const [origin, setOrigin] = useState<Json | null>(null);
  const [initial] = useState(saved);
  useEffect(() => {
    if (!originRef) return;
    let live = true;
    lookApi.get(originRef.replace(/^copy:/, '')).then((l) => { if (live) setOrigin(settingsOf(l.definition)); }).catch(() => { /* the look as it was opened stands in */ });
    return () => { live = false; };
  }, [originRef]);
  return origin ?? initial;
}

function Row({ label, chip, children }: { label?: string; chip?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {(label || chip) && <div className="flex items-center gap-2"><span className="text-[13px] font-medium">{label}</span>{chip && <CustomChip />}</div>}
      {children}
    </div>
  );
}

export function SettingsTab({ ctx, comps, originRef, saved, onLook }: SettingsTabProps) {
  const { look, catalogue: cat, fonts } = ctx;
  const brand = useBrand();
  const baseline = useOrigin(originRef, saved);
  const usesOwn = [...['display', 'text', 'label', 'mono']].some((r) => getAt(look, `fonts.${r}.source`) === 'brand');
  const preset: PresetCtx = useMemo(() => ({ sections: cat.sections, fonts, baseline, ownFonts: brand.ownFonts || usesOwn }), [cat.sections, fonts, baseline, brand.ownFonts, usesOwn]);
  const assignment = useMemo(() => assignNodes(cat.sections), [cat.sections]);

  // A choice, or a value of the main controls, is saved with the weights the look then needs; Fine-tune edits are left as typed.
  useEffect(() => { for (const p of PAIRINGS) { const i = fonts.find((x) => x.family === p.display); if (i) ensureFamily(i); } }, [fonts]);
  const commit = (next: Json) => { if (next !== look) onLook(syncWeights(next, comps, fonts)); };
  const pick = (control: string, option: string) => commit(choose(control, option, look, preset));
  const setPath = (path: string, value: unknown) => commit(writeSetting(look, cat.sections, path, value));
  const state = (control: string) => ({ options: CONTROLS[control]!.options(preset, look), value: detect(control, look, preset) });

  const logicDesc = cat.sections.colour?.props?.accentAsType, fromPictureDesc = cat.sections.colour?.props?.fromPicture;
  const tint = brand.colours.primary;

  const body = (g: SettingsGroup): ReactNode => {
    switch (g.id) {
      case 'typeface': {
        const { options, value } = state('pairing');
        if (!options.length) return null;
        return (
          <Row>
            {value === null && <div><CustomChip /></div>}
            <CardChoice legend="Typeface" value={value} disabled={ctx.disabled} onChange={(id) => pick('pairing', id)}
              options={options.map((o) => {
                const p = PAIRINGS.find((x) => x.id === o.id);
                return {
                  id: o.id, label: p ? pairingName(p) : o.label,
                  preview: (
                    <span className="flex flex-col gap-0.5 rounded-[3px] bg-muted/40 px-2 py-1.5" aria-hidden="true" style={p ? { fontFamily: cardFontFamily(p.display) } : undefined}>
                      <span className="text-[28px] font-bold leading-none">Aa</span>
                      <span className="truncate text-[12.5px] font-bold" style={p ? { fontFamily: cardFontFamily(p.display) } : undefined}>{o.id === OWN_FONT ? 'Your headline' : 'Fresh arrivals'}</span>
                    </span>
                  ),
                };
              })} />
          </Row>
        );
      }
      case 'voice':
        return (
          <div className="flex flex-col gap-4">
            {([['weight', 'Weight'], ['case', 'Case'], ['spacing', 'Spacing']] as const).map(([c, label]) => {
              const { options, value } = state(c);
              return <Row key={c} label={label} chip={value === null}><Segmented legend={`Headline ${label.toLowerCase()}`} options={options} value={value} disabled={ctx.disabled} onChange={(id) => pick(c, id)} /></Row>;
            })}
          </div>
        );
      case 'feel':
        return (
          <div className="flex flex-col gap-4">
            {FEEL.map((f) => {
              const d = descAt(cat.sections, f.path);
              if (!d) return null;
              const value = Number(getAt(look, f.path) ?? d.default ?? 0);
              return (
                <div key={f.path} className="flex flex-col gap-1">
                  <label htmlFor={`feel-${f.path}`} className="text-[13px] font-medium">{f.label}</label>
                  <div className="flex items-center gap-3 text-[12.5px] text-muted-foreground">
                    <span className="w-16 shrink-0 text-right max-sm:w-14">{f.lo}</span>
                    <input id={`feel-${f.path}`} type="range" min={d.min} max={d.max} step={d.int ? 1 : 0.05} value={Number.isFinite(value) ? value : 0} disabled={ctx.disabled}
                      onChange={(e) => setPath(f.path, Number(e.target.value))} className="h-8 min-w-0 flex-1 accent-[var(--primary)] max-sm:h-11" />
                    <span className="w-16 shrink-0 max-sm:w-14">{f.hi}</span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      case 'colour': {
        const { value } = state('logic'), page = state('fromPicture');
        return (
          <Row>
            {value === null && <div><CustomChip /></div>}
            <CardChoice legend="Colour" value={value} disabled={ctx.disabled} onChange={(id) => pick('logic', id)} className="grid-cols-3"
              options={LOGICS.map((o) => ({ id: o.id, label: o.label, preview: <ColourDiagram kind={o.id} c={brand.colours} mix={mix} /> }))} />
            {logicDesc && accentSwitchRelevant(look) && <SwitchField label="Use the accent colour for large words" checked={accentAsType(look)} disabled={ctx.disabled} onCheckedChange={(on) => setPath('colour.accentAsType', on ? 'when-contrast' : 'never')} />}
            {fromPictureDesc && <Row label="Page colour from the picture" chip={page.value === null}><Segmented legend="Page colour from the picture" options={FROM_PICTURE} value={page.value} disabled={ctx.disabled} onChange={(id) => pick('fromPicture', id)} /></Row>}
          </Row>
        );
      }
      case 'space': {
        const { options, value } = state('space');
        if (!options.length) return null;
        return (
          <Row>
            {value === null && <div><CustomChip /></div>}
            <CardChoice legend="Space" value={value} disabled={ctx.disabled} onChange={(id) => pick('space', id)} className="grid-cols-3 max-w-sm"
              options={SPACES.map((o) => ({ id: o.id, label: o.label, preview: <SpaceDiagram kind={o.id} /> }))} />
          </Row>
        );
      }
      case 'pictures': {
        const { value } = state('treat');
        const grain = hasGrain(look);
        return (
          <Row>
            {value === null && <div><CustomChip /></div>}
            <CardChoice legend="Pictures" value={value} disabled={ctx.disabled} onChange={(id) => pick('treat', id)} className="grid-cols-4"
              options={TREATS.map((o) => ({ id: o.id, label: o.label, preview: <PictureThumb treat={o.id} tint={tint} grain={grain} /> }))} />
            <SwitchField label="Grain" checked={grain} disabled={ctx.disabled} onCheckedChange={(on) => commit(setGrain(look, preset, on))} />
          </Row>
        );
      }
      case 'logo': {
        const where = state('logo'), size = state('logoSize');
        const on = where.value === 'corner';
        return (
          <Row>
            {where.value === null && <div><CustomChip /></div>}
            <CardChoice legend="Logo" value={where.value} disabled={ctx.disabled} onChange={(id) => pick('logo', id)} className="grid-cols-2 max-w-60"
              options={[{ id: 'off', label: 'Off', preview: <LogoDiagram on={false} /> }, { id: 'corner', label: 'In a corner', preview: <LogoDiagram on size={size.value ?? 'medium'} /> }]} />
            {on && <Row label="Size" chip={size.value === null}><Segmented legend="Logo size" options={LOGO_SIZES} value={size.value} disabled={ctx.disabled} onChange={(id) => pick('logoSize', id)} /></Row>}
          </Row>
        );
      }
      default: return <p className="text-[13px] text-muted-foreground">{DETAILS_TEXT}</p>;
    }
  };

  // Fine-tune's grouped controls; their edits are left as made, like the exact values.
  const fineLook = (next: Json) => { if (next !== look) onLook(next); };
  const fineCtx: FineCtx = useMemo(() => ({ ...preset, comps, catalogue: cat }), [preset, comps, cat]);
  const definitionOf = (settings: Json): Json => ({ ...settings, compositions: comps });
  const weightsMax = cat.sections.fonts?.props?.display?.forms?.library?.props?.weights?.max;
  const grouped = (id: GroupId): ReactNode[] => FINE_LAYOUT[id].flatMap((c) => {
    if (c === WEIGHTS_CONTROL) return [<WeightStrips key={c} look={look} comps={comps} fonts={fonts} max={weightsMax} disabled={ctx.disabled} onChange={ctx.onChange} />];
    return fineAvailable(c, look, preset) ? [<FineNumber key={c} id={c} look={look} preset={fineCtx} definitionOf={definitionOf} disabled={ctx.disabled} onLook={fineLook} />] : [];
  });

  return (
    <div className="flex flex-col gap-9">
      {GROUPS.filter((g) => assignment[g.id].length).map((g) => (
        <GroupSection key={g.id} group={g} nodes={assignment[g.id]} ctx={{ ...ctx, comps }} baseline={baseline} assignment={assignment}
          grouped={grouped(g.id)} onReset={() => onLook(resetNodes(look, baseline, assignment[g.id]))}>
          {body(g)}
        </GroupSection>
      ))}
    </div>
  );
}

function GroupSection({ group, nodes, ctx, baseline, assignment, grouped, onReset, children }: {
  group: SettingsGroup; nodes: string[]; ctx: SettingsCtx; baseline: Json; assignment: Record<GroupId, string[]>; grouped: ReactNode[]; onReset: () => void; children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [exact, setExact] = useState(false);
  const problems = Object.keys(ctx.errors).filter((p) => groupOfPath(p, assignment) === group.id);
  // A problem on a value the main controls do not show opens Fine-tune and its exact values, where the value and its message are.
  useEffect(() => { if (problems.length) { setOpen(true); setExact(true); } }, [problems.length > 0]);
  const changed = changedCount(ctx.look, baseline, nodes);
  const values = leafCount(ctx.catalogue.sections, nodes);
  // The weights have their own strips above, so the fonts leave them out here.
  const fine: SettingsCtx = { ...ctx, compact: true, exact: true, hideWeights: grouped.length > 0 && group.id === 'typeface' };
  return (
    <section aria-labelledby={`${id}-title`} id={`settings-${group.id}`} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <h2 id={`${id}-title`} className="text-[14px] font-semibold">{group.title}</h2>
        {group.hint && <Hint about={group.title}>{group.hint}</Hint>}
      </div>
      {children}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" aria-expanded={open} aria-controls={`${id}-fine`} onClick={() => setOpen((v) => !v)}
            className="-mx-1 min-h-8 rounded px-1 text-[13px] text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
            Fine-tune
          </button>
          {problems.length > 0 && <span role="alert" className="text-[12.5px] font-medium text-destructive">{problems.length === 1 ? '1 value needs fixing' : `${problems.length} values need fixing`}</span>}
        </div>
        {open && (
          <div id={`${id}-fine`} className="flex flex-col gap-4 border-l pl-4">
            {grouped.length > 0 && <div className="flex flex-col gap-4">{grouped}</div>}
            <div className="flex flex-col gap-3">
              <button type="button" aria-expanded={exact} aria-controls={`${id}-exact`} onClick={() => setExact((v) => !v)}
                className="-mx-1 inline-flex min-h-8 items-center gap-1 self-start rounded px-1 text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11">
                <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform', exact && 'rotate-90')} />
                Exact values <span className="tabular-nums">({values})</span>
              </button>
              {exact && (
                <div id={`${id}-exact`} className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                  {nodes.map((n) => {
                    const d = descAt(ctx.catalogue.sections, n, ctx.look);
                    if (!d) return null;
                    const wide = d.kind === 'object' || d.kind === 'list' || d.kind === 'tuple' || d.kind === 'tagged';
                    return <div key={n} className={cn('min-w-0', wide && 'col-span-full')}><Node path={n} desc={d} ctx={fine} /></div>;
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {changed > 0 && <span role="status" className="text-[12.5px] text-muted-foreground">{changed === 1 ? '1 value changed from the original' : `${changed} values changed from the original`}</span>}
              <Button type="button" variant="ghost" size="sm" disabled={ctx.disabled || changed === 0} onClick={onReset}>Reset this group</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
