// The brand's actual colours for the colour pickers of the design editor: each colour ROLE a design may name (paper, ink, field, accent ...)
// shown as a swatch in the brand's own colour, from the palette the server made (GET /api/settings/brand, `palette`). A role the palette does
// not hold gets a neutral grey, so a picker never shows a wrong brand colour. These are for looking at only: the design names the role.
import { useEffect, useState } from 'react';
import { api } from '../../../api';
import type { BrandView } from '../brand-types';

export type Swatches = Record<string, string>;
export const ROLE_WORDS: Record<string, string> = {
  paper: 'Paper', ink: 'Ink', white: 'White', dark: 'Dark', primary: 'Brand colour', field: 'Colour field', 'on-field': 'Type on field', gold: 'Accent', 'gold-deep': 'Deep accent',
  accent: 'Accent', 'accent-dark': 'Accent on dark', 'on-accent': 'Type on accent', 'on-primary': 'Type on brand colour', body: 'Body type', soft: 'Soft', muted: 'Muted type',
  'body-dark': 'Body on dark', 'muted-dark': 'Muted on dark', rule: 'Rule', 'rule-soft': 'Soft rule', 'rule-dark': 'Rule on dark', 'rule-field': 'Rule on field', 'accent-type': 'Accent type',
  'body-field': 'Body on field', 'field-deep': 'Deep field', 'paper-warm': 'Warm paper', 'light-tint': 'Light tint', 'tint-deep': 'Deeper tint', 'field-text': 'Field type',
};
export const roleWord = (role: string): string => ROLE_WORDS[role] ?? role.replace(/-/g, ' ');

const NEUTRAL = '#9ca3af';
// The colour a role shows as, from the brand's palette (approximate where the engine derives a colour at drawing time).
export function swatchesFrom(view: Pick<BrandView, 'palette'> | null): Swatches {
  const p = view?.palette;
  if (!p) return {};
  const g = p.grounds ?? {}, t = p.text ?? {}, a = p.accents ?? {};
  const paper = g.light ?? '#ffffff', dark = g.dark ?? t.ink ?? '#111111', primary = a.primary ?? NEUTRAL, gold = a.gold ?? primary;
  return {
    paper, white: '#ffffff', ink: t.ink ?? dark, dark, primary, field: primary, 'field-deep': g.deep ?? dark, 'on-field': t.inverse ?? '#ffffff', gold, accent: gold, 'gold-deep': a.goldDeep ?? gold,
    'accent-dark': gold, 'on-accent': t.ink ?? dark, 'on-primary': t.inverse ?? '#ffffff', body: t.body ?? t.ink ?? dark, soft: g.soft ?? paper, muted: t.muted ?? NEUTRAL,
    'body-dark': t.invBody ?? '#e5e7eb', 'muted-dark': t.mutedInv ?? NEUTRAL, rule: t.muted ?? NEUTRAL, 'rule-soft': g.soft ?? paper, 'rule-dark': t.mutedInv ?? NEUTRAL, 'rule-field': t.mutedInv ?? NEUTRAL,
    'accent-type': a.goldDeep ?? gold, 'body-field': t.invBody ?? '#e5e7eb', 'paper-warm': g.warm ?? paper, 'light-tint': g.cool ?? paper, 'tint-deep': g.cool ?? paper, 'field-text': dark,
  };
}
export const swatchOf = (s: Swatches, role: string): string => s[role] ?? NEUTRAL;

let cached: Swatches | null = null;
// The brand's swatches, loaded once (an empty set while loading or when the brand cannot be read: the pickers then show names alone).
export function useSwatches(): Swatches {
  const [sw, setSw] = useState<Swatches>(cached ?? {});
  useEffect(() => {
    if (cached) return;
    let live = true;
    api.get<BrandView>('/api/settings/brand').then((v) => { cached = swatchesFrom(v); if (live) setSw(cached); }).catch(() => { /* names alone */ });
    return () => { live = false; };
  }, []);
  return sw;
}
