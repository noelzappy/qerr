// The choices of the Settings tab, each a preset over several of the look's values. A control says which option the look's values
// match now (or none: "Custom", and nothing is snapped), and writes only the values it owns when an option is chosen. Choosing
// what is already matched changes nothing. Pure (no React).
import { getAt, writeSetting } from '../look-model';
import type { Desc, FontFamilyInfo, Json } from '../look-types';
import { snapWeight, type FontRole } from './weights';

export interface PresetCtx {
  sections: Record<string, Desc>;
  fonts: FontFamilyInfo[];
  // The look's values as they were made (its origin, else as saved): Space scales from them, and Reset goes back to them.
  baseline: Json;
  // The brand has uploaded fonts, so "Our own font" is offered.
  ownFonts: boolean;
}
export interface ControlOption { id: string; label: string }
export interface Control {
  id: string;
  // The paths a choice writes (a path covers what is under it). Choosing never writes anything else.
  owns: string[];
  options(ctx: PresetCtx, look: Json): ControlOption[];
  matches(optionId: string, look: Json, ctx: PresetCtx): boolean;
  write(optionId: string, look: Json, ctx: PresetCtx): Json;
}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const numAt = (look: Json, path: string): number | undefined => { const v = getAt(look, path); return typeof v === 'number' && Number.isFinite(v) ? v : undefined; };
const put = (look: Json, ctx: PresetCtx, path: string, value: unknown): Json => writeSetting(look, ctx.sections, path, value);
const familyOf = (ctx: PresetCtx, name: unknown) => ctx.fonts.find((f) => f.family === name);

// ---- typeface: curated pairings of the font library ----

export interface Pairing { id: string; display: string; text: string; label: string; labelRole: 'label' | 'mono' }
export const PAIRINGS: Pairing[] = [
  { id: 'archivo', display: 'Archivo', text: 'Archivo', label: 'Archivo', labelRole: 'label' },
  { id: 'hanken-mono', display: 'Hanken Grotesk', text: 'Hanken Grotesk', label: 'JetBrains Mono', labelRole: 'mono' },
  { id: 'fraunces-hanken', display: 'Fraunces', text: 'Hanken Grotesk', label: 'Hanken Grotesk', labelRole: 'label' },
  { id: 'source-hanken', display: 'Source Serif 4', text: 'Hanken Grotesk', label: 'Hanken Grotesk', labelRole: 'label' },
  { id: 'inter', display: 'Inter', text: 'Inter', label: 'Inter', labelRole: 'label' },
  { id: 'inter-mono', display: 'Inter', text: 'Inter', label: 'JetBrains Mono', labelRole: 'mono' },
  { id: 'fraunces-inter', display: 'Fraunces', text: 'Inter', label: 'Inter', labelRole: 'label' },
];
export const OWN_FONT = 'own';
// "Hanken Grotesk + JetBrains Mono": the families of a pairing, each once.
export const pairingName = (p: Pairing): string => [...new Set([p.display, p.text, p.label])].join(' + ');
// The pairings whose families the font library has.
export const pairingsFor = (fonts: FontFamilyInfo[]): Pairing[] => PAIRINGS.filter((p) => [p.display, p.text, p.label].every((f) => fonts.some((x) => x.family === f)));
// The CSS stack a card draws a family in: the family, then a generic one (the browser may not hold the font file).
export const fontStack = (family: string): string => `'${family}', ${/mono/i.test(family) ? "'SF Mono', Menlo, monospace" : /serif|fraunces/i.test(family) ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Arial, sans-serif"}`;
const OWN_ROLES: Record<FontRole, string> = { display: 'display', text: 'sans', label: 'label', mono: 'mono' };
const roleFamily = (p: Pairing, r: FontRole): string => (r === 'display' ? p.display : r === 'text' ? p.text : p.label);

const pairing: Control = {
  id: 'pairing',
  // The weights of the type settings are written only to bring one inside the new family's range.
  owns: ['fonts.display', 'fonts.text', 'fonts.label', 'fonts.mono', 'type.label.role', 'type.display.weight', 'type.body.weight', 'type.item.weight', 'type.label.weight'],
  options: (ctx) => [...pairingsFor(ctx.fonts).map((p) => ({ id: p.id, label: pairingName(p) })), ...(ctx.ownFonts ? [{ id: OWN_FONT, label: 'Our own font' }] : [])],
  matches(id, look) {
    const roles: FontRole[] = ['display', 'text', 'label', 'mono'];
    if (id === OWN_FONT) return roles.every((r) => { const f = getAt(look, `fonts.${r}`); return isObj(f) && f.source === 'brand' && f.role === OWN_ROLES[r]; });
    const p = PAIRINGS.find((x) => x.id === id);
    return !!p && getAt(look, 'type.label.role') === p.labelRole && roles.every((r) => { const f = getAt(look, `fonts.${r}`); return isObj(f) && f.source === 'library' && f.family === roleFamily(p, r); });
  },
  write(id, look, ctx) {
    let next = look;
    for (const r of ['display', 'text', 'label', 'mono'] as FontRole[]) {
      const cur = getAt(next, `fonts.${r}`);
      if (id === OWN_FONT) { if (!(isObj(cur) && cur.source === 'brand' && cur.role === OWN_ROLES[r])) next = put(next, ctx, `fonts.${r}`, { source: 'brand', role: OWN_ROLES[r] }); continue; }
      const p = PAIRINGS.find((x) => x.id === id)!;
      const family = roleFamily(p, r);
      if (isObj(cur) && cur.source === 'library' && cur.family === family) continue;
      const fam = familyOf(ctx, family);
      const had = isObj(cur) && cur.source === 'library' && Array.isArray(cur.weights) ? (cur.weights as number[]) : [];
      const weights = [...new Set((had.length ? had : [400]).map((w) => snapWeight(w, fam)))].sort((a, b) => a - b);
      next = put(next, ctx, `fonts.${r}`, { source: 'library', family, weights });
    }
    if (id !== OWN_FONT) {
      const p = PAIRINGS.find((x) => x.id === id)!;
      if (getAt(next, 'type.label.role') !== p.labelRole) next = put(next, ctx, 'type.label.role', p.labelRole);
      const used: Array<[string, string]> = [['type.display.weight', p.display], ['type.body.weight', p.text], ['type.item.weight', p.text], ['type.label.weight', p.label]];
      for (const [path, family] of used) { const w = numAt(next, path); const snapped = w === undefined ? undefined : snapWeight(w, familyOf(ctx, family)); if (w !== undefined && snapped !== w) next = put(next, ctx, path, snapped); }
    }
    return next;
  },
};

// ---- headline voice ----

const displayRange = (look: Json, ctx: PresetCtx) => { const f = getAt(look, 'fonts.display'); return isObj(f) && f.source === 'library' ? familyOf(ctx, f.family) : undefined; };
const WEIGHTS = [{ id: 'regular', label: 'Regular', at: 400 }, { id: 'bold', label: 'Bold', at: 700 }, { id: 'heavy', label: 'Heavy', at: 900 }];
const weight: Control = {
  id: 'weight', owns: ['type.display.weight'],
  // Each option is the nearest weight the headline font has; two that come to the same weight are offered once.
  options(ctx, look) {
    const fam = displayRange(look, ctx), seen = new Set<number>();
    return WEIGHTS.filter((o) => { const w = snapWeight(o.at, fam); if (seen.has(w)) return false; seen.add(w); return true; }).map(({ id, label }) => ({ id, label }));
  },
  // The option whose weight is nearest to the headline's (the lighter one on a tie).
  matches(id, look, ctx) {
    const w = numAt(look, 'type.display.weight'), fam = displayRange(look, ctx);
    if (w === undefined) return false;
    const offered = weight.options(ctx, look).map((o) => ({ id: o.id, at: snapWeight(WEIGHTS.find((x) => x.id === o.id)!.at, fam) }));
    return [...offered].sort((a, b) => Math.abs(a.at - w) - Math.abs(b.at - w) || a.at - b.at)[0]?.id === id;
  },
  write(id, look, ctx) { return put(look, ctx, 'type.display.weight', snapWeight(WEIGHTS.find((o) => o.id === id)!.at, displayRange(look, ctx))); },
};
const caseControl: Control = {
  id: 'case', owns: ['type.display.case'],
  options: () => [{ id: 'as-typed', label: 'As typed' }, { id: 'upper', label: 'Capitals' }],
  matches: (id, look) => getAt(look, 'type.display.case') === id,
  write: (id, look, ctx) => put(look, ctx, 'type.display.case', id),
};
const SPACING = [{ id: 'tight', label: 'Tight', track: -0.04, lead: 0.88, leads: [0.78, 0.96] }, { id: 'normal', label: 'Normal', track: -0.02, lead: 0.96, leads: [0.88, 1.04] }, { id: 'open', label: 'Open', track: 0, lead: 1.04, leads: [0.98, 1.2] }];
const spacingBand = (track: number): string => (track <= -0.03 ? 'tight' : track <= -0.01 ? 'normal' : 'open');
const spacing: Control = {
  id: 'spacing', owns: ['type.display.track', 'type.display.lead'],
  options: () => SPACING.map(({ id, label }) => ({ id, label })),
  matches(id, look) {
    const t = numAt(look, 'type.display.track'), l = numAt(look, 'type.display.lead'), o = SPACING.find((s) => s.id === id)!;
    return t !== undefined && l !== undefined && spacingBand(t) === id && l >= o.leads[0]! && l <= o.leads[1]!;
  },
  write(id, look, ctx) { const o = SPACING.find((s) => s.id === id)!; return put(put(look, ctx, 'type.display.track', o.track), ctx, 'type.display.lead', o.lead); },
};

// ---- colour ----

export const LOGICS = [{ id: 'one-accent', label: 'One accent' }, { id: 'field', label: 'Colour as a field' }, { id: 'tonal', label: 'Tonal' }];
const logic: Control = {
  id: 'logic', owns: ['colour.logic'],
  options: () => LOGICS,
  matches: (id, look) => getAt(look, 'colour.logic') === id,
  write: (id, look, ctx) => put(look, ctx, 'colour.logic', id),
};
// Where a page with a picture takes its colour (colour.fromPicture): the brand's, the picture's background when it is plain enough, or the
// picture's background whenever it has one. The engine still keeps the brand's colour when no type reads on the picture's.
export const FROM_PICTURE = [{ id: 'brand', label: 'Brand colour' }, { id: 'auto', label: 'Picture, when plain' }, { id: 'picture', label: 'Picture' }];
const fromPicture: Control = {
  id: 'fromPicture', owns: ['colour.fromPicture'],
  options: () => FROM_PICTURE,
  matches: (id, look) => (getAt(look, 'colour.fromPicture') ?? 'brand') === id,
  write: (id, look, ctx) => put(look, ctx, 'colour.fromPicture', id),
};
// The switch under the colour cards is useful only where an accent colour exists to use.
export const accentSwitchRelevant = (look: Json): boolean => getAt(look, 'colour.logic') !== 'tonal';
export const accentAsType = (look: Json): boolean => getAt(look, 'colour.accentAsType') === 'when-contrast';

// ---- space: margins and gutter scaled from the look's baseline ----

export const SPACES = [{ id: 'tight', label: 'Tight', by: 0.75 }, { id: 'standard', label: 'Standard', by: 1 }, { id: 'airy', label: 'Airy', by: 1.3 }];
const SIDES = ['top', 'right', 'bottom', 'left'];
const MARGINS = SIDES.map((s) => `canvas.feed.margin.${s}`);
const spaceValues = (ctx: PresetCtx, by: number): Record<string, number> | null => {
  const out: Record<string, number> = {};
  for (const p of [...MARGINS, 'canvas.feed.grid.gutter']) {
    const b = numAt(ctx.baseline, p);
    if (b === undefined) return null;
    out[p] = p.endsWith('gutter') ? Math.min(80, Math.round(b * by)) : Math.min(300, Math.round(b * by));
  }
  return out;
};
const space: Control = {
  id: 'space', owns: [...MARGINS, 'canvas.feed.grid.gutter'],
  options: (ctx) => (spaceValues(ctx, 1) ? SPACES.map(({ id, label }) => ({ id, label })) : []),
  matches(id, look, ctx) { const v = spaceValues(ctx, SPACES.find((s) => s.id === id)!.by); return !!v && Object.entries(v).every(([p, n]) => numAt(look, p) === n); },
  write(id, look, ctx) { const v = spaceValues(ctx, SPACES.find((s) => s.id === id)!.by); let next = look; if (v) for (const [p, n] of Object.entries(v)) next = put(next, ctx, p, n); return next; },
};

// ---- pictures ----

export const TREATS = [{ id: 'as-shot', label: 'As shot', treat: [] as string[] }, { id: 'grey', label: 'Greyscale', treat: ['grey'] }, { id: 'tint', label: 'Colour tint', treat: ['multiply'] }, { id: 'punchy', label: 'Punchy', treat: ['punch'] }];
const TREAT_ORDER = ['grey', 'multiply', 'grain', 'punch'];
const treatList = (look: Json): string[] => (Array.isArray(getAt(look, 'photo.treat')) ? (getAt(look, 'photo.treat') as string[]) : []);
export const hasGrain = (look: Json): boolean => treatList(look).includes('grain');
const ordered = (l: string[]) => TREAT_ORDER.filter((t) => l.includes(t));
export const setGrain = (look: Json, ctx: PresetCtx, on: boolean): Json => put(look, ctx, 'photo.treat', ordered([...treatList(look).filter((t) => t !== 'grain'), ...(on ? ['grain'] : [])]));
const treat: Control = {
  id: 'treat', owns: ['photo.treat'],
  options: () => TREATS.map(({ id, label }) => ({ id, label })),
  matches(id, look) { const want = TREATS.find((t) => t.id === id)!.treat, have = treatList(look).filter((t) => t !== 'grain'); return have.length === want.length && want.every((t) => have.includes(t)); },
  write: (id, look, ctx) => put(look, ctx, 'photo.treat', ordered([...TREATS.find((t) => t.id === id)!.treat, ...(hasGrain(look) ? ['grain'] : [])])),
};

// ---- logo ----

const logo: Control = {
  id: 'logo', owns: ['logo.default'],
  options: () => [{ id: 'off', label: 'Off' }, { id: 'corner', label: 'In a corner' }],
  matches: (id, look) => (getAt(look, 'logo.default') ?? 'off') === id,
  write: (id, look, ctx) => put(look, ctx, 'logo.default', id),
};
export const LOGO_SIZES = [{ id: 'small', label: 'Small', at: 32 }, { id: 'medium', label: 'Medium', at: 44 }, { id: 'large', label: 'Large', at: 64 }];
const sizeBand = (h: number): string => (h <= 38 ? 'small' : h <= 52 ? 'medium' : 'large');
const logoSize: Control = {
  id: 'logoSize', owns: ['logo.height'],
  options: () => LOGO_SIZES.map(({ id, label }) => ({ id, label })),
  matches(id, look) { const h = numAt(look, 'logo.height'); return h !== undefined && sizeBand(h) === id; },
  write: (id, look, ctx) => put(look, ctx, 'logo.height', LOGO_SIZES.find((s) => s.id === id)!.at),
};

export const CONTROLS: Record<string, Control> = { pairing, weight, case: caseControl, spacing, logic, fromPicture, space, treat, logo, logoSize };

// The id of the option the look's values match now; null: Custom (the values fit none of the options).
export function detect(controlId: string, look: Json, ctx: PresetCtx): string | null {
  const c = CONTROLS[controlId]!;
  return c.options(ctx, look).find((o) => c.matches(o.id, look, ctx))?.id ?? null;
}
// The look after choosing an option; the very same object when it is already the one matched.
export function choose(controlId: string, optionId: string, look: Json, ctx: PresetCtx): Json {
  const c = CONTROLS[controlId]!;
  return c.matches(optionId, look, ctx) ? look : c.write(optionId, look, ctx);
}
export const ownsOf = (controlId: string): string[] => CONTROLS[controlId]!.owns;
