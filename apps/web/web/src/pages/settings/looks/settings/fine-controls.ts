// The grouped controls of a group's Fine-tune: a dozen labelled numbers, each standing for one or more catalogue values (Text size moves
// the body, list and label sizes together; Margins sets the four sides), drawn with the kit's PresetNumber. Each says the number its
// values stand for now, and whether they all follow it (if not, it shows Custom and nothing is snapped); writing a number writes every
// value it owns, worked out by the mapping below, and nothing else. The exact values stay under "Exact values". A number is offered (as
// a preset) or taken (typed) only when the look stays one the engine accepts: the grid keeps its columns and rows, a design that draws
// the look's frame keeps one, and no design breaks a guard rail it kept before (design-health.ts, the browser's mirror of the engine's
// static checks: type levels, headline against body, text over a picture). The server still checks on save. Pure (no React).
import { designHealth } from '../design-health';
import { descAt, getAt, writeSetting } from '../look-model';
import type { Json, LookCatalogue } from '../look-types';
import type { GroupId } from './groups';
import type { PresetCtx } from './presets';

export interface FinePreset { value: number; label: string }
export interface FineReading {
  // The number the values stand for now (null: a value is missing).
  value: number | null;
  // Every owned value is what writing `value` would give.
  linked: boolean;
}
export interface FineControl {
  id: string;
  group: GroupId;
  label: string;
  hint: string;
  // What the tiny picture on each preset shows (SettingsTab draws it).
  visual: 'size' | 'lines' | 'tracking' | 'caps' | 'margin' | 'gap' | 'rule' | 'frame' | 'shadow' | 'strength';
  // The paths a number writes; never anything else.
  owns: string[];
  min: number; max: number; step: number; unit?: string;
  presets(look: Json, ctx: PresetCtx): FinePreset[];
  read(look: Json, ctx: PresetCtx): FineReading;
  // The owned values worked out from n (n within min..max), as { path: value }.
  values(n: number, look: Json, ctx: PresetCtx): Record<string, unknown> | null;
}

const num = (look: Json, path: string): number | undefined => { const v = getAt(look, path); return typeof v === 'number' && Number.isFinite(v) ? v : undefined; };
const same = (a: unknown, b: unknown): boolean => typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;
const round = (n: number, dp: number): number => Number(n.toFixed(dp));
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
// The numbers from min to max by step, inclusive (for working out what a number stands for).
const steps = (c: Pick<FineControl, 'min' | 'max' | 'step'>): number[] => {
  const out: number[] = [];
  for (let i = 0; c.min + i * c.step <= c.max + 1e-9; i++) out.push(round(c.min + i * c.step, 6));
  return out;
};

// One number that is one catalogue value.
function single(id: string, group: GroupId, label: string, hint: string, visual: FineControl['visual'], path: string, min: number, max: number, step: number, unit: string | undefined, presets: FinePreset[]): FineControl {
  return {
    id, group, label, hint, visual, owns: [path], min, max, step, unit,
    presets: () => presets,
    read: (look) => { const v = num(look, path); return { value: v ?? null, linked: v !== undefined }; },
    values: (n) => ({ [path]: n }),
  };
}

// One number that sets several values: `lead` is the value the number is, `follow` works out the others from it.
function linked(id: string, group: GroupId, label: string, hint: string, visual: FineControl['visual'], lead: string, follow: Record<string, (n: number) => number>, min: number, max: number, step: number, unit: string | undefined, presets: FinePreset[]): FineControl {
  const values = (n: number) => ({ [lead]: n, ...Object.fromEntries(Object.entries(follow).map(([p, f]) => [p, f(n)])) });
  return {
    id, group, label, hint, visual, owns: [lead, ...Object.keys(follow)], min, max, step, unit,
    presets: () => presets,
    read(look) {
      const v = num(look, lead);
      if (v === undefined) return { value: null, linked: false };
      return { value: v, linked: Object.entries(values(v)).every(([p, x]) => same(getAt(look, p), x)) };
    },
    values,
  };
}

// ---- Text size: the body, list and label sizes together, as a percentage of the look's original sizes ----

const SIZE_PATHS = ['type.body.size', 'type.item.size', 'type.label.size'];
// The size a path takes at pct of the baseline: the catalogue's allowed size nearest to it (the smaller on a tie).
function sizesAt(pct: number, ctx: PresetCtx): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const p of SIZE_PATHS) {
    const base = num(ctx.baseline, p);
    const allowed = (descAt(ctx.sections, p)?.values ?? []).filter((v): v is number => typeof v === 'number');
    if (base === undefined || !allowed.length) return null;
    const want = (base * pct) / 100;
    out[p] = [...allowed].sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b)[0]!;
  }
  return out;
}
// Close steps: the designs keep at most three type sizes and a headline 2.6 times the body, so most looks take only a little change.
const TEXT_PRESETS: FinePreset[] = [{ value: 90, label: 'Smaller' }, { value: 95, label: 'A little smaller' }, { value: 100, label: 'As designed' }, { value: 105, label: 'A little larger' }, { value: 110, label: 'Larger' }];
const textSize: FineControl = {
  id: 'textSize', group: 'typeface', label: 'Text size', visual: 'size',
  hint: 'Body, list and label text together, as a share of the look\'s original sizes. Each moves to the nearest size the engine allows; the exact sizes are under Exact values.',
  owns: SIZE_PATHS, min: 70, max: 140, step: 5, unit: '%',
  // Two that come to the same sizes are offered once (the first).
  presets(_look, ctx) {
    const seen = new Set<string>();
    return TEXT_PRESETS.filter((p) => { const s = JSON.stringify(sizesAt(p.value, ctx)); if (s === 'null' || seen.has(s)) return false; seen.add(s); return true; });
  },
  read(look, ctx) {
    if (SIZE_PATHS.some((p) => num(look, p) === undefined) || !sizesAt(100, ctx)) return { value: null, linked: false };
    // As designed first, then the presets, then every other step, nearest to 100 first.
    const order = [100, ...textSize.presets(look, ctx).map((p) => p.value), ...steps(textSize).sort((a, b) => Math.abs(a - 100) - Math.abs(b - 100))];
    for (const pct of order) { const s = sizesAt(pct, ctx)!; if (SIZE_PATHS.every((p) => same(getAt(look, p), s[p]))) return { value: pct, linked: true }; }
    const ratio = (num(look, 'type.body.size')! / num(ctx.baseline, 'type.body.size')!) * 100;
    return { value: clamp(Math.round(ratio / 5) * 5, textSize.min, textSize.max), linked: false };
  },
  values: (n, _look, ctx) => sizesAt(n, ctx),
};

// ---- the others ----

const bodyLead = linked('bodyLead', 'typeface', 'Line height', 'How far apart the lines of body text sit; list lines follow, 0.2 closer. The exact values are under Exact values.', 'lines',
  'type.body.lead', { 'type.item.lead': (n) => clamp(round(n - 0.2, 2), 1, 1.5) }, 1.1, 1.7, 0.01, undefined,
  [{ value: 1.25, label: 'Compact' }, { value: 1.4, label: 'Standard' }, { value: 1.55, label: 'Relaxed' }]);
const labelTrack = single('labelTrack', 'typeface', 'Label letter spacing', 'How far apart the letters of labels sit, in em.', 'caps',
  'type.label.track', -0.02, 0.2, 0.01, 'em', [{ value: 0, label: 'Snug' }, { value: 0.04, label: 'Normal' }, { value: 0.08, label: 'Wide' }, { value: 0.14, label: 'Extra wide' }]);
const displayTrack = single('displayTrack', 'voice', 'Letter spacing', 'How far apart the letters of headlines sit, in em.', 'tracking',
  'type.display.track', -0.06, 0.02, 0.005, 'em', [{ value: -0.04, label: 'Tight' }, { value: -0.02, label: 'Snug' }, { value: 0, label: 'Normal' }]);
const displayLead = single('displayLead', 'voice', 'Line height', 'How far apart the lines of a headline sit, as a share of its size.', 'lines',
  'type.display.lead', 0.78, 1.2, 0.01, undefined, [{ value: 0.9, label: 'Tight' }, { value: 0.98, label: 'Standard' }, { value: 1.06, label: 'Open' }]);
const SIDES = ['top', 'right', 'bottom', 'left'].map((s) => `canvas.feed.margin.${s}`);
const margins = linked('margins', 'space', 'Margins', 'The same margin on all four sides, in pixels of a 1080 by 1350 page. Different sides are set under Exact values.', 'margin',
  SIDES[0]!, Object.fromEntries(SIDES.slice(1).map((p) => [p, (n: number) => n])), 0, 300, 4, 'px',
  [{ value: 48, label: 'Narrow' }, { value: 64, label: 'Standard' }, { value: 80, label: 'Wide' }, { value: 104, label: 'Extra wide' }]);
const gutter = single('gutter', 'space', 'Gap between columns', 'The space between the columns of the grid, in pixels.', 'gap',
  'canvas.feed.grid.gutter', 0, 80, 2, 'px', [{ value: 16, label: 'Narrow' }, { value: 24, label: 'Standard' }, { value: 40, label: 'Wide' }]);
const rules = linked('rules', 'details', 'Rule thickness', 'How thick the heavy rules are, in pixels; hairlines follow (2 from 6 up, else 1).', 'rule',
  'devices.rule.heavy', { 'devices.rule.hair': (n) => (n >= 6 ? 2 : 1) }, 2, 12, 1, 'px', [{ value: 3, label: 'Fine' }, { value: 4, label: 'Standard' }, { value: 6, label: 'Bold' }]);
const frame = linked('frame', 'details', 'Frame', 'A coloured frame round the page: its thickness in pixels, with the space inside it following (about two thirds of it).', 'frame',
  'devices.frame.t', { 'devices.frame.pad': (n) => Math.min(120, Math.round(n * 0.63)) }, 0, 160, 2, 'px', [{ value: 0, label: 'None' }, { value: 24, label: 'Thin' }, { value: 70, label: 'Bold' }]);
const shadow = linked('shadow', 'details', 'Shadow', 'How far a hard shadow falls, across and down by the same amount, in pixels. Its colour is under Exact values.', 'shadow',
  'devices.shadow.x', { 'devices.shadow.y': (n) => n }, -24, 24, 1, 'px', [{ value: 0, label: 'None' }, { value: 6, label: 'Soft' }, { value: 14, label: 'Strong' }]);
const wordmark = single('wordmark', 'details', 'Wordmark strength', 'How strongly the repeated brand name shows on pages that use it.', 'strength',
  'devices.wordmark.opacity', 0.02, 0.08, 0.01, undefined, [{ value: 0.03, label: 'Faint' }, { value: 0.05, label: 'Soft' }, { value: 0.08, label: 'Strong' }]);

export const FINE_CONTROLS: Record<string, FineControl> = Object.fromEntries([textSize, bodyLead, labelTrack, displayTrack, displayLead, margins, gutter, rules, frame, shadow, wordmark].map((c) => [c.id, c]));
// The weight strips are a grouped control too (Typeface), drawn from weights.ts rather than a number.
export const WEIGHTS_CONTROL = 'weights';
// Each group's grouped controls, in order.
export const FINE_LAYOUT: Record<GroupId, string[]> = {
  typeface: ['textSize', 'bodyLead', 'labelTrack', WEIGHTS_CONTROL], voice: ['displayTrack', 'displayLead'], feel: [], colour: [], space: ['margins', 'gutter'],
  pictures: [], logo: [], details: ['rules', 'frame', 'shadow', 'wordmark'],
};

// What the guard needs beyond the presets' context: the look's designs and the catalogue (its page size and limits).
export interface FineCtx extends PresetCtx { comps: Json[]; catalogue: Pick<LookCatalogue, 'page' | 'limits'> }

// Why the engine would refuse the look with the control at n, in plain words; '' when it would not (or nothing changes).
export function fineProblem(id: string, n: number, look: Json, ctx: FineCtx): string {
  const c = FINE_CONTROLS[id]!;
  if (!Number.isFinite(n) || n < c.min - 1e-9 || n > c.max + 1e-9) return `Use a number from ${c.min} to ${c.max}.`;
  const next = writeFine(id, n, look, ctx);
  if (next === look) return '';
  const page = ctx.catalogue.page ?? { w: 1080, h: 1350 };
  // the grid: columns and rows at least 16 px, side margins leaving room
  const g = (k: string) => num(next, `canvas.feed.${k}`);
  const [top, right, bottom, left, cols, gx] = [g('margin.top'), g('margin.right'), g('margin.bottom'), g('margin.left'), g('grid.cols'), g('grid.gutter')];
  if ([top, right, bottom, left, cols, gx].every((x) => x !== undefined)) {
    const colW = (page.w - left! - right! - (cols! - 1) * gx!) / cols!;
    if (colW < 16) return `The ${cols} columns would be ${Math.max(0, Math.floor(colW))} px wide; each needs at least 16 px.`;
    const rows = g('grid.rows') ?? 0, head = g('grid.head') ?? 0, bodyRows = head > 0 ? rows - 1 : rows;
    if (rows > 0 && bodyRows > 0 && (page.h - top! - bottom! - (head > 0 ? head + gx! : 0) - (bodyRows - 1) * gx!) / bodyRows < 16) return 'The grid\'s rows would be less than 16 px tall.';
    if (left! + 16 > page.w / 2 || right! + 16 > page.w / 2) return 'The side margins would leave no room on the page.';
  }
  // a design that draws the look's frame needs a thickness
  if (!((num(next, 'devices.frame.t') ?? 0) > 0) && ctx.comps.some((comp) => usesLookFrame(comp.elements))) return 'A design draws the look\'s frame, so the frame needs a thickness.';
  // no design breaks a rule it kept before
  const before = brokenBefore(look, ctx);
  for (const [i, comp] of ctx.comps.entries()) {
    const broken = designHealth(comp, next, ctx.catalogue as LookCatalogue).items.find((x) => x.status === 'bad' && !before[i]!.has(x.id));
    if (broken) return `That would break the design ${typeof comp.name === 'string' ? `"${comp.name}"` : 'of this look'}: ${broken.detail.charAt(0).toLowerCase()}${broken.detail.slice(1)}.`;
  }
  return '';
}
// The rules each design breaks already, worked out once per look and set of designs.
const brokenCache = new WeakMap<Json, { comps: Json[]; sets: Array<Set<string>> }>();
function brokenBefore(look: Json, ctx: FineCtx): Array<Set<string>> {
  const hit = brokenCache.get(look);
  if (hit && hit.comps === ctx.comps) return hit.sets;
  const sets = ctx.comps.map((comp) => new Set(designHealth(comp, look, ctx.catalogue as LookCatalogue).items.filter((x) => x.status === 'bad').map((x) => x.id)));
  brokenCache.set(look, { comps: ctx.comps, sets });
  return sets;
}

// The problems the engine has with a candidate that it did not have with the look before (the server's check: what design-health
// cannot see, such as the type sizes of buttons and photo rows, it finds). Messages are compared without the look's name.
export function newProblems(before: string[], after: string[]): string[] {
  const plain = (m: string) => m.replace(/^look "[^"]*": /, '');
  const had = new Set(before.map(plain));
  return after.filter((m) => !had.has(plain(m)));
}

function usesLookFrame(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  return list.some((el) => !!el && typeof el === 'object' && (((el as Json).type === 'frame' && (el as Json).t === undefined) || usesLookFrame((el as Json).children)));
}

// The presets the look can take now (those the guard lets through), worked out once per look, control and context.
const presetCache = new WeakMap<Json, Map<string, { ctx: FineCtx; presets: FinePreset[] }>>();
export function finePresets(id: string, look: Json, ctx: FineCtx): FinePreset[] {
  let byId = presetCache.get(look);
  if (!byId) { byId = new Map(); presetCache.set(look, byId); }
  const hit = byId.get(id);
  if (hit && hit.ctx === ctx) return hit.presets;
  const presets = FINE_CONTROLS[id]!.presets(look, ctx).filter((p) => !fineProblem(id, p.value, look, ctx));
  byId.set(id, { ctx, presets });
  return presets;
}

// A control is offered when the catalogue has every value it owns and the look's values can be read as its number.
export function fineAvailable(id: string, look: Json, ctx: PresetCtx): boolean {
  const c = FINE_CONTROLS[id];
  return !!c && c.owns.every((p) => !!descAt(ctx.sections, p)) && c.presets(look, ctx).length > 0 && c.read(look, ctx).value !== null;
}
export const readFine = (id: string, look: Json, ctx: PresetCtx): FineReading => FINE_CONTROLS[id]!.read(look, ctx);
// The look with the control's values worked out from n; the very same object when they already are, or n is outside the range.
export function writeFine(id: string, n: number, look: Json, ctx: PresetCtx): Json {
  const c = FINE_CONTROLS[id]!;
  if (!Number.isFinite(n) || n < c.min - 1e-9 || n > c.max + 1e-9) return look;
  const vals = c.values(n, look, ctx);
  if (!vals) return look;
  let next = look;
  for (const [p, v] of Object.entries(vals)) if (!same(getAt(next, p), v)) next = writeSetting(next, ctx.sections, p, v);
  return next;
}
