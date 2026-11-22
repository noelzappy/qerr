// Which font weights a look needs, worked out from its type settings and its designs (a pure mirror of the engine's font usage:
// packages/engine/lib/design/directions/interpret.mjs, fontUsage), so the form can write the weights instead of asking for nine
// checkboxes. The manual list stays in each group's Fine-tune.
import { getAt, setAt } from '../look-model';
import type { FontFamilyInfo, Json } from '../look-types';

export type FontRole = 'display' | 'text' | 'label' | 'mono';
export const FONT_ROLES: FontRole[] = ['display', 'text', 'label', 'mono'];
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// The weight a family can actually be set at: the nearest hundred inside its range (any weight when the family is not known).
export function snapWeight(w: number, family?: Pick<FontFamilyInfo, 'minWeight' | 'maxWeight'>): number {
  const lo = family?.minWeight ?? 100, hi = family?.maxWeight ?? 900;
  return Math.min(hi, Math.max(lo, Math.round(Math.min(900, Math.max(100, w)) / 100) * 100));
}

const styleOf = (el: Json): string => {
  if (typeof el.style === 'string') return el.style;
  if (el.field === 'headline' || el.field === 'quote') return 'display';
  if (el.field === 'big') return 'numeral';
  if (el.source || ['label', 'meta', 'tag', 'unit', 'by'].includes(String(el.field))) return 'label';
  return 'body';
};

// The weights each font role is used at, by the look's type settings and by every design's elements. A role nothing uses is left out.
export function neededWeights(look: Json, comps: Json[]): Partial<Record<FontRole, number[]>> {
  const T = (isObj(look.type) ? look.type : {}) as Json;
  const part = (k: string): Json => (isObj(T[k]) ? (T[k] as Json) : {});
  const shift = num(getAt(look, 'dials.weightShift'), 0);
  const use: Record<FontRole, Set<number>> = { display: new Set(), text: new Set(), label: new Set(), mono: new Set() };
  const labelRole: FontRole = part('label').role === 'mono' ? 'mono' : 'label';
  const add = (role: unknown, weight: number) => { if (typeof role === 'string' && role in use) use[role as FontRole].add(Math.min(900, Math.max(100, Math.round(weight + shift)))); };
  const dw = num(part('display').weight, 800), bw = num(part('body').weight, 400), iw = num(part('item').weight, 500), lw = num(part('label').weight, 500);
  const styleUse = (style: string, el: Json) => {
    if (style === 'display' || style === 'numeral') add(el.font ?? 'display', num(el.weight, dw));
    else if (style === 'body') add(el.font ?? 'text', num(el.weight, bw));
    else if (style === 'item') add(el.font ?? 'text', num(el.weight, iw));
    else add(el.font ?? labelRole, num(el.weight, lw));
  };
  // What the type settings alone ask for, before any design.
  styleUse('display', {}); styleUse('body', {}); styleUse('item', {}); styleUse('label', {});
  const visit = (list: unknown) => {
    if (!Array.isArray(list)) return;
    const items = (list as unknown[]).filter(isObj);
    for (const el of [...items, ...items.flatMap((e) => (isObj(e.sticker) ? [e.sticker as Json] : []))]) {
      switch (el.type) {
        case 'text': styleUse(styleOf(el), el); break;
        case 'fitted-stack': case 'mantra-rows': case 'wordmark-pattern': case 'glyph': add('display', dw); break;
        case 'numeral': add(el.family ?? 'display', num(el.weight, dw)); if (isObj(el.unit)) styleUse(String(el.unit.style ?? 'label'), {}); break;
        case 'sticker': add('display', dw); if (el.children) visit(el.children); break;
        case 'rows':
          styleUse(String(el.textStyle ?? 'item'), {});
          if (el.number && el.number !== 'none') styleUse(el.numberTile ? 'display' : String(el.numberStyle ?? 'label'), el.numberTile ? { weight: 900 } : {});
          if (el.keys) styleUse('label', {});
          break;
        case 'meta-row': styleUse('label', {}); break;
        default: break;
      }
      if (el.children && el.type !== 'sticker') visit(el.children);
    }
  };
  for (const c of comps) visit(isObj(c) ? c.elements : undefined);
  const out: Partial<Record<FontRole, number[]>> = {};
  for (const r of FONT_ROLES) if (use[r].size) out[r] = [...use[r]].sort((a, b) => a - b);
  return out;
}

// The look with every library font's weights holding what the look needs: the needed weights (snapped into the family's range),
// then the ones already listed while there is room (never more than `max`). Idempotent; a role nothing uses is untouched.
export function syncWeights(look: Json, comps: Json[], fonts: FontFamilyInfo[], max = 4): Json {
  const used = neededWeights(look, comps);
  let next = look;
  for (const role of FONT_ROLES) {
    const f = getAt(next, `fonts.${role}`);
    const want = used[role];
    if (!isObj(f) || f.source !== 'library' || !want?.length) continue;
    const fam = fonts.find((x) => x.family === f.family);
    const need = [...new Set(want.map((w) => snapWeight(w, fam)))].sort((a, b) => a - b).slice(0, max);
    const have = Array.isArray(f.weights) ? (f.weights as number[]).filter((w) => typeof w === 'number') : [];
    const merged = [...need, ...have.filter((w) => !need.includes(w)).slice(0, max - need.length)].sort((a, b) => a - b);
    if (merged.length !== have.length || merged.some((w, i) => w !== have[i])) next = setAt(next, `fonts.${role}.weights`, merged);
  }
  return next;
}

// ---- the weight strip: the weights of one font as samples to switch on and off, instead of nine checkboxes ----

export interface WeightStrip {
  role: FontRole;
  family: string;
  // The weights the family has, by the hundred, and any listed weight it lacks (so that one can be switched off).
  offered: number[];
  // The weights listed now.
  chosen: number[];
  // The weights the look's type settings and designs use.
  needed: number[];
  // The weights that cannot be switched off: a type setting or a design uses this font at it (the engine refuses a weight not listed).
  locked: number[];
  max: number;
  min: number;
}
// The strip of a library font; null for a brand font (its weights are the files the brand uploaded).
export function weightStrip(look: Json, comps: Json[], role: FontRole, fonts: FontFamilyInfo[], limits: { min?: number; max?: number } = {}): WeightStrip | null {
  const f = getAt(look, `fonts.${role}`);
  if (!isObj(f) || f.source !== 'library' || typeof f.family !== 'string') return null;
  const fam = fonts.find((x) => x.family === f.family);
  const chosen = Array.isArray(f.weights) ? (f.weights as unknown[]).filter((w): w is number => typeof w === 'number') : [];
  const offered = [100, 200, 300, 400, 500, 600, 700, 800, 900].filter((w) => !fam || (w >= fam.minWeight && w <= fam.maxWeight));
  const needed = [...new Set((neededWeights(look, comps)[role] ?? []).map((w) => snapWeight(w, fam)))].sort((a, b) => a - b);
  const T = (isObj(look.type) ? look.type : {}) as Json;
  const labelRole: FontRole = isObj(T.label) && (T.label as Json).role === 'mono' ? 'mono' : 'label';
  const styles: Record<FontRole, string[]> = { display: ['display'], text: ['body', 'item'], label: labelRole === 'label' ? ['label'] : [], mono: labelRole === 'mono' ? ['label'] : [] };
  // What the type settings and the designs ask for as written (the engine checks those against the list), and as the weight dial moves them.
  const asWritten = neededWeights(setAt(look, 'dials.weightShift', 0), comps)[role] ?? [];
  const locked = [...styles[role].map((st) => (isObj(T[st]) ? (T[st] as Json).weight : undefined)), ...asWritten, ...needed].filter((w): w is number => typeof w === 'number' && chosen.includes(w));
  return { role, family: f.family, offered: [...new Set([...offered, ...chosen])].sort((a, b) => a - b), chosen: [...chosen].sort((a, b) => a - b), needed, locked: [...new Set(locked)].sort((a, b) => a - b), max: limits.max ?? 4, min: limits.min ?? 1 };
}
// The weights after switching one on or off; the same list when that is not allowed (above the most, below the least, or a weight a
// type setting is at).
export function toggleWeight(strip: Pick<WeightStrip, 'chosen' | 'max' | 'min'> & { locked?: number[] }, w: number): number[] {
  const on = strip.chosen.includes(w);
  if (on && (strip.chosen.length <= strip.min || strip.locked?.includes(w))) return strip.chosen;
  if (!on && strip.chosen.length >= strip.max) return strip.chosen;
  return (on ? strip.chosen.filter((x) => x !== w) : [...strip.chosen, w]).sort((a, b) => a - b);
}
