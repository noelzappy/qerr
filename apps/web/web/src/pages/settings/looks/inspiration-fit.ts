// "Find the closest look": an honest suggestion from what is already stored about a design reference (the AI's written analysis and
// its proposed style settings), compared with the traits of each shipped look. No AI is asked and the picture is not looked at again.
// A trait the stored text does not settle is left out; with fewer than two known traits, or no clear winner, the answer is null
// ("We can't tell from this picture yet") rather than a guess.
import type { DesignReference } from '../brand-types';
import type { Json } from './look-types';

export type TraitName = 'heavy' | 'caps' | 'serif' | 'mono' | 'framed' | 'grid';
export type Traits = Partial<Record<TraitName, boolean>>;
export interface ClosestLook { ref: string; name: string; reasons: string[]; score: number }

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const WORDS: Record<TraitName, [string, string]> = {
  heavy: ['light or regular type', 'heavy type'], caps: ['mixed-case headlines', 'headlines in capitals'], serif: ['sans-serif type', 'serif type'],
  mono: ['no monospaced labels', 'monospaced labels'], framed: ['no frames or stickers', 'frames and stickers'], grid: ['a free layout', 'a strict grid'],
};

// What the stored analysis says about a reference (any of it may be missing).
export function referenceTraits(analysis: DesignReference['analysis']): Traits {
  if (!analysis) return {};
  const t: Traits = {};
  const p = analysis.proposal;
  if (p?.display) {
    if (typeof p.display.weight === 'number') { if (p.display.weight >= 900) t.heavy = true; else if (p.display.weight <= 600) t.heavy = false; }
    if (p.display.case === 'upper') t.caps = true; else if (p.display.case === 'as-typed') t.caps = false;
  }
  if (p?.label?.font === 'mono') t.mono = true; else if (p?.label?.font === 'body') t.mono = false;
  if (p?.decoration?.kind === 'grid' || p?.decoration?.kind === 'lines') t.grid = true;
  const type = `${analysis.typography ?? ''}`.toLowerCase();
  const layout = `${analysis.layout ?? ''} ${analysis.imagery ?? ''}`.toLowerCase();
  if (/sans[- ]?serif|grotesk|grotesque|geometric|helvetica|neo-grotesque/.test(type)) t.serif = false;
  else if (/\bserif\b|garamond|didone|slab/.test(type)) t.serif = true;
  if (t.heavy === undefined) { if (/\b(heavy|black|chunky|extra[- ]bold|ultra[- ]bold|bold)\b/.test(type)) t.heavy = true; else if (/\b(light|thin|delicate|hairline)\b/.test(type)) t.heavy = false; }
  if (t.caps === undefined && /all[- ]caps|uppercase|capitals/.test(type)) t.caps = true;
  if (t.mono === undefined && /\bmono(space|spaced)?\b/.test(type)) t.mono = true;
  if (/\b(no|without)\s+(\w+\s+)?(frames?|borders?|stickers?|badges?)\b/.test(layout)) t.framed = false;
  else if (/\b(frames?|framed|borders?|stickers?|badges?|bursts?)\b/.test(layout)) t.framed = true;
  if (t.grid === undefined && /\b(grid|columns?|systematic|swiss)\b/.test(layout)) t.grid = true;
  return t;
}

// The traits of a look, read from its definition (always all known).
export function lookTraits(def: Json): Traits {
  const fonts = isObj(def.fonts) ? def.fonts : {};
  const family = (role: string): string => (isObj(fonts[role]) && typeof (fonts[role] as Json).family === 'string' ? String((fonts[role] as Json).family) : '');
  const type = isObj(def.type) && isObj(def.type.display) ? def.type.display : {};
  const devices = isObj(def.devices) ? def.devices : {};
  const angles = isObj(devices.angles) ? devices.angles : {};
  const frame = isObj(devices.frame) ? devices.frame : {};
  const feed = isObj(def.canvas) && isObj(def.canvas.feed) ? def.canvas.feed : {};
  const grid = isObj(feed.grid) ? feed.grid : {};
  const metaCells = isObj(devices.metaRow) && Array.isArray(devices.metaRow.cells) ? devices.metaRow.cells.length : 0;
  const display = family('display');
  return {
    heavy: typeof type.weight === 'number' && type.weight >= 900,
    caps: type.case === 'upper',
    serif: /fraunces|serif|garamond|playfair|lora|merriweather|georgia/i.test(display) && !/sans/i.test(display),
    mono: /mono/i.test(family('label')),
    framed: (typeof frame.t === 'number' && frame.t > 0) || (typeof angles.sticker === 'number' && angles.sticker !== 0),
    grid: (typeof grid.rows === 'number' && grid.rows > 0) || metaCells > 0,
  };
}

export function closestLook(ref: Traits, looks: Array<{ ref: string; name: string; traits: Traits }>): ClosestLook | null {
  const known = (Object.keys(ref) as TraitName[]).filter((k) => typeof ref[k] === 'boolean');
  if (known.length < 2 || looks.length === 0) return null;
  const scored = looks.map((l) => {
    let score = 0;
    const reasons: string[] = [];
    for (const k of known) {
      if (typeof l.traits[k] !== 'boolean') continue;
      if (l.traits[k] === ref[k]) { score++; reasons.push(WORDS[k][ref[k] ? 1 : 0]); } else score--;
    }
    return { ref: l.ref, name: l.name, reasons, score };
  }).sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || best.score < 2 || (next && next.score >= best.score)) return null;
  return best;
}
