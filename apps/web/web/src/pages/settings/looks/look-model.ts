// The logic of the Looks pages, pure (no React): reading and writing a setting of a look by path with range checks, grouping the
// engine's catalogue sections for the Settings form, summarising a design (a composition) in plain words, the status of a look
// and of a design, and mapping the server's problem paths to the controls that show them. The look is JSON and stays JSON: the
// form edits a copy of the object and sends it whole (PUT /api/settings/looks/:slug/settings).
import { POST_KIND_CATALOGUE, postKindName } from '../../batches/editor/catalogue';
import type { Composition, Desc, Json, LookCatalogue, OwnSummary, Problem } from './look-types';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ---- paths: "fonts.display.family", "devices.metaRow.cells[0].col" ----

export function parsePath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  for (const part of path.split('.')) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!m) { out.push(part); continue; }
    if (m[1]) out.push(m[1]);
    for (const i of m[2]!.matchAll(/\[(\d+)\]/g)) out.push(Number(i[1]));
  }
  return out;
}
export const joinPath = (path: string, key: string | number): string => (typeof key === 'number' ? `${path}[${key}]` : path ? `${path}.${key}` : key);

export function getAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of parsePath(path)) {
    if (typeof k === 'number' ? !Array.isArray(cur) : !isObj(cur)) return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

// A copy of `obj` with `value` at `path` (containers made on the way); `undefined` removes the key (or the list entry).
export function setAt<T extends Json>(obj: T, path: string, value: unknown): T {
  const keys = parsePath(path);
  const walk = (cur: unknown, i: number): unknown => {
    const k = keys[i]!;
    const last = i === keys.length - 1;
    if (typeof k === 'number') {
      const arr = Array.isArray(cur) ? [...cur] : [];
      if (last) { if (value === undefined) arr.splice(k, 1); else arr[k] = value; } else arr[k] = walk(arr[k], i + 1);
      return arr;
    }
    const o: Json = isObj(cur) ? { ...cur } : {};
    if (last) { if (value === undefined) delete o[k]; else o[k] = value; } else o[k] = walk(o[k], i + 1);
    return o;
  };
  return walk(obj, 0) as T;
}

// ---- descriptors ----

// The descriptor of the setting at `path` (a tagged value is read by the form its own `key` names in `root`).
export function descAt(sections: Record<string, Desc>, path: string, root?: Json): Desc | null {
  const keys = parsePath(path);
  let desc: Desc | undefined = { kind: 'object', props: sections };
  let at = '';
  for (const k of keys) {
    if (!desc) return null;
    if (desc.kind === 'tagged') {
      const form: unknown = root ? getAt(root, at + (desc.key ? `.${desc.key}` : '')) : undefined;
      const f: Desc | undefined = typeof form === 'string' ? desc.forms?.[form] : undefined;
      desc = f;
    }
    if (!desc) return null;
    if (typeof k === 'number') desc = desc.kind === 'list' ? desc.of : desc.kind === 'tuple' ? desc.items?.[k] : undefined;
    else desc = desc.kind === 'object' ? desc.props?.[k] : undefined;
    at = joinPath(at, k);
  }
  return desc ?? null;
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);
// "1 to 24", "-24 to 24", "0.78 to 1.2".
export function rangeText(desc: Desc): string {
  if (desc.kind === 'enum' && desc.values) return desc.values.join(', ');
  if (typeof desc.min === 'number' && typeof desc.max === 'number') return `${num(desc.min)} to ${num(desc.max)}`;
  return '';
}

// '' when the value is fine for the descriptor, else one plain sentence. Nothing is ever clamped: the person sees the problem.
export function checkValue(desc: Desc, value: unknown): string {
  switch (desc.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Enter a number';
      if (desc.int && !Number.isInteger(value)) return 'Use a whole number';
      if (typeof desc.min === 'number' && value < desc.min) return `Use ${rangeText(desc)}`;
      if (typeof desc.max === 'number' && value > desc.max) return `Use ${rangeText(desc)}`;
      return '';
    }
    case 'enum': return desc.values?.includes(value as string | number) ? '' : 'Choose one of the listed values';
    case 'bool': return typeof value === 'boolean' ? '' : 'Choose on or off';
    case 'text': return typeof value === 'string' && (typeof desc.max !== 'number' || value.length <= desc.max) ? '' : `Use at most ${desc.max} characters`;
    case 'list': {
      if (!Array.isArray(value)) return 'Enter a list';
      if (typeof desc.min === 'number' && value.length < desc.min) return `Add at least ${desc.min}`;
      if (typeof desc.max === 'number' && value.length > desc.max) return `Keep at most ${desc.max}`;
      if (desc.unique && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) return 'Each can be used once';
      const bad = desc.of ? value.map((v) => checkValue(desc.of!, v)).find(Boolean) : '';
      return bad ?? '';
    }
    case 'tuple': {
      if (!Array.isArray(value) || value.length !== (desc.items?.length ?? 0)) return 'Fill in every value';
      return (desc.items ?? []).map((d, i) => checkValue(d, value[i])).find(Boolean) ?? '';
    }
    default: return '';
  }
}

// What an absent object setting starts as when someone edits one value in it: the defaults of its properties.
export function seedDefaults(desc: Desc): Json {
  const out: Json = {};
  for (const [k, d] of Object.entries(desc.props ?? {})) {
    if (d.default !== undefined) out[k] = clone(d.default);
  }
  return out;
}

// Writes one setting of a look. An object that is not there yet is made with its defaults first, so a lone value never leaves it
// half-made. The value itself is NOT checked here (see checkValue and the server).
export function writeSetting(look: Json, sections: Record<string, Desc>, path: string, value: unknown): Json {
  const keys = parsePath(path);
  let next = look;
  let at = '';
  for (let i = 0; i < keys.length - 1; i++) {
    at = joinPath(at, keys[i]!);
    if (getAt(next, at) === undefined) {
      const d = descAt(sections, at, next);
      if (d?.kind === 'object') next = setAt(next, at, seedDefaults(d));
    }
  }
  return setAt(next, path, value);
}

export const readSetting = (look: Json, desc: Desc, path: string): unknown => getAt(look, path) ?? desc.default;

// ---- the Settings form: which sections form which group, in plain words ----

export interface SettingGroup { id: string; title: string; hint: string; sections: string[] }
export const SETTING_GROUPS: SettingGroup[] = [
  { id: 'dials', title: 'Dials', hint: 'Three dials that adjust the whole look at once: how much everything tilts, how tightly it is packed and how heavy the type is.', sections: ['dials'] },
  { id: 'typefaces', title: 'Typefaces', hint: 'The font for headlines, body text, labels and figures: one from our library, or the font your brand uploaded.', sections: ['fonts'] },
  { id: 'type', title: 'Type', hint: 'How headlines, body text, list items, labels and figures are set: line height, letter spacing, weight and sizes.', sections: ['type'] },
  { id: 'page', title: 'Page', hint: 'The margins and the grid every design is built on.', sections: ['canvas'] },
  { id: 'colour', title: 'Colour', hint: 'How your brand colours are used on a page.', sections: ['colour'] },
  { id: 'devices', title: 'Devices', hint: 'Rules, frames, highlight bars, hard shadows and the named angles that elements turn by.', sections: ['devices'] },
  { id: 'pictures', title: 'Pictures', hint: 'How pictures are treated.', sections: ['photo'] },
  { id: 'logo', title: 'Logo', hint: 'Whether the brand logo is placed, and how big.', sections: ['logo'] },
];

// The groups that have a section in the catalogue, in order; a section the groups do not know still gets a group of its own, so a
// setting the engine adds appears without any change here.
export function groupSections(sections: Record<string, Desc>): SettingGroup[] {
  const known = new Set(SETTING_GROUPS.flatMap((g) => g.sections));
  const groups = SETTING_GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => sections[s]) })).filter((g) => g.sections.length);
  for (const [name, d] of Object.entries(sections)) if (!known.has(name)) groups.push({ id: name, title: d.label ?? name, hint: d.help ?? '', sections: [name] });
  return groups;
}

// Plain names where the engine's label would not do for someone who is not a designer (by path).
export const LABEL_OVERRIDES: Record<string, string> = {
  'fonts.display': 'Headlines', 'fonts.text': 'Body text', 'fonts.label': 'Labels', 'fonts.mono': 'Figures and code',
  'colour.logic': 'How colour is used', 'colour.field': 'Which colour is the field', 'colour.sticker': 'Sticker colour', 'colour.accentAsType': 'Accent colour in large text',
  'colour.grounds': 'Page colours designs may use',
  'type.display.lead': 'Headline line height', 'type.display.track': 'Headline letter spacing',
  'canvas.feed': 'Square feed post', 'canvas.feed.grid.head': 'Top row height',
  'devices.angles': 'Named angles', 'devices.highlight': 'Highlight bar', 'devices.metaRow': 'Top label row',
};
export const labelFor = (path: string, desc: Desc): string => LABEL_OVERRIDES[path] ?? desc.label ?? path.split('.').pop() ?? path;

// Plain names of the values of fixed lists (by the last word of the path, then the value).
const VALUES: Record<string, Record<string, string>> = {
  logic: { tonal: 'Tonal', 'one-accent': 'One accent', field: 'Colour as a field' },
  field: { primary: 'Your main colour', dark: 'Your dark colour' },
  sticker: { accent: 'Your accent colour', primary: 'Your main colour' },
  accentAsType: { never: 'Never', 'when-contrast': 'Where it has enough contrast', field: 'In the deep colour of the field' },
  grounds: { paper: 'Paper', field: 'Field', dark: 'Dark', accent: 'Accent', soft: 'Soft', tint: 'Pale tint' },
  case: { 'as-typed': 'As typed', upper: 'Capitals' },
  trim: { cap: 'Trim to the capital height', none: 'No trim' },
  folio: { no: 'No number', pad2: '07', 'pad2-of-total': '07/12' },
  sep: { dash: 'Dash', dot: 'Dot', slash: 'Slash', bar: 'Bar' },
  figures: { lining: 'Lining', oldstyle: 'Old-style' },
  role: { label: 'The label font', mono: 'The mono font', display: 'Headlines', sans: 'Body text' },
  default: { off: 'No logo', corner: 'In a corner', 'top-left': 'Top left, always' },
  strength: { '1': 'Full', '0.8': 'Softer (80%)' },
  treat: { grey: 'Greyscale', multiply: 'Colour tint', grain: 'Grain', punch: 'Punchy contrast' },
  align: { left: 'Left', center: 'Centre', right: 'Right' },
  source: { label: 'The label', brand: 'The brand name', folio: 'The post number', site: 'The web address', library: 'A font from our library' },
};
export function valueLabel(path: string, value: string | number): string {
  const last = (path.split('.').pop() ?? '').replace(/\[\d+\]$/, '');
  return VALUES[last]?.[String(value)] ?? (typeof value === 'string' ? value.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : String(value));
}

// ---- problems the server names by path ----

// The control a problem belongs to: the problem's path itself when a control has it, else the nearest control above it
// (`fonts.display.weights[1]` belongs to the weights control, `type.nope` to `type`). null: no control shows it.
export function controlFor(path: string, controls: ReadonlySet<string>): string | null {
  let p = path.replace(/^look "[^"]*": /, '');
  while (p) {
    if (controls.has(p)) return p;
    const cut = Math.max(p.lastIndexOf('.'), p.lastIndexOf('['));
    if (cut <= 0) return null;
    p = p.slice(0, cut);
  }
  return null;
}
export function mapProblems(problems: Problem[], controls: ReadonlySet<string>): { byControl: Record<string, string>; other: string[] } {
  const byControl: Record<string, string> = {};
  const other: string[] = [];
  for (const pr of problems) {
    const c = controlFor(pr.path, controls);
    if (c) { if (!(c in byControl)) byControl[c] = pr.message; } else other.push(pr.message);
  }
  return { byControl, other };
}
// The server's problem sentence without its "look "retail": " lead-in, for showing next to a control.
export const plainProblem = (m: string): string => m.replace(/^look "[^"]*": /, '');

// ---- status ----

export type LookStatusId = 'draft' | 'ready' | 'attention';
export const LOOK_STATUS: Record<LookStatusId, { tone: 'quiet' | 'good' | 'warn'; label: string }> = {
  draft: { tone: 'quiet', label: 'Draft' }, ready: { tone: 'good', label: 'Ready' }, attention: { tone: 'warn', label: 'Needs attention' },
};
export const lookStatus = (l: Pick<OwnSummary, 'status' | 'needsAttention'>): LookStatusId => (l.needsAttention ? 'attention' : l.status === 'ready' ? 'ready' : 'draft');

export type DesignStatusId = 'published' | 'draft-pending' | 'check-failed';
export const DESIGN_STATUS: Record<DesignStatusId, { tone: 'good' | 'info' | 'bad'; label: string }> = {
  published: { tone: 'good', label: 'Published' }, 'draft-pending': { tone: 'info', label: 'Draft pending' }, 'check-failed': { tone: 'bad', label: 'Check failed' },
};
// A failed check wins over a pending draft; a design with neither is published.
export function designStatus(c: Pick<Composition, 'gate' | 'hasDraft'>): DesignStatusId {
  if (c.gate && c.gate.passed === false) return 'check-failed';
  return c.hasDraft ? 'draft-pending' : 'published';
}

// "7 kinds · 9 designs"
export function kindsSummary(kinds: Record<string, number>): string {
  const n = Object.values(kinds).filter((v) => v > 0).length, d = Object.values(kinds).reduce((a, b) => a + b, 0);
  return `${n} ${n === 1 ? 'kind' : 'kinds'} · ${d} ${d === 1 ? 'design' : 'designs'}`;
}

export const originText = (origin: string, nameOf: (ref: string) => string | null): string => {
  if (origin === 'starter') return 'Started blank';
  const ref = origin.replace(/^copy:/, '');
  const n = nameOf(ref);
  return n ? `Based on ${n}` : '';
};

export function whenText(iso: string | undefined, now = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 36) return `${Math.round(mins / 60)} h ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- designs (compositions) ----

// The kinds in the order the catalogue lists them, with the names the post editor uses (Number, Picture ...).
export const kindOrder = (cat: LookCatalogue | null): string[] => (cat ? Object.keys(cat.kinds) : POST_KIND_CATALOGUE.map((k) => k.value));
export const kindName = (kind: string): string => postKindName(kind);

export function groupByKind(comps: Composition[], order: string[]): Array<{ kind: string; designs: Composition[] }> {
  const out = order.map((kind) => ({ kind, designs: comps.filter((c) => c.kind === kind).sort((a, b) => a.position - b.position) }));
  for (const c of comps) if (!order.includes(c.kind) && !out.some((g) => g.kind === c.kind)) out.push({ kind: c.kind, designs: comps.filter((x) => x.kind === c.kind) });
  return out.filter((g) => g.designs.length);
}

export interface FieldBudget { name: string; label: string; required: boolean; max?: number; min?: number }
// The fields a design uses, in the kind's order, with what each needs and its longest text.
export function designFields(def: Json, cat: LookCatalogue | null): FieldBudget[] {
  const fields = isObj(def.fields) ? def.fields : {};
  const order = cat?.kinds[String(def.kind)]?.fields ?? [];
  const names = Object.keys(fields).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return names.map((name) => {
    const f = isObj(fields[name]) ? fields[name] as Json : {};
    const info = cat?.fields[name];
    const required = f.required === true || !!cat?.kinds[String(def.kind)]?.required.includes(name);
    const max = typeof f.max === 'number' ? f.max : info?.type === 'items' || info?.type === 'chart' ? info.max : info?.max;
    const min = typeof f.min === 'number' ? f.min : info?.type === 'items' || info?.type === 'chart' ? info.min : undefined;
    return { name, label: info?.label ?? name, required, ...(max !== undefined ? { max } : {}), ...(min !== undefined ? { min } : {}) };
  });
}
// "Headline up to 68", "List points 2 to 5", "Picture"
export function fieldLine(f: FieldBudget, cat: LookCatalogue | null): string {
  if (cat?.fields[f.name]?.type === 'image') return f.label;
  if (cat?.fields[f.name]?.type === 'items') return `${f.label} ${f.min ?? 2} to ${f.max ?? 5}`;
  if (cat?.fields[f.name]?.type === 'chart') return `${f.label} of ${f.min ?? 2} to ${f.max ?? 12} points`;
  return f.max !== undefined ? `${f.label} up to ${f.max}` : f.label;
}
// "Headline up to 68 · Sub line up to 120 · Picture"
export function budgetsText(def: Json, cat: LookCatalogue | null): string {
  return designFields(def, cat).map((f) => fieldLine(f, cat)).join(' · ');
}

export interface OutlineLine { depth: number; path: string; type: string; label: string; text: string }
// The elements of a design as an indented outline, each with its type and its key settings in plain words.
export function outline(def: Json, cat: LookCatalogue | null): OutlineLine[] {
  const out: OutlineLine[] = [];
  const walk = (list: unknown, depth: number, base: string) => {
    if (!Array.isArray(list)) return;
    list.forEach((el, i) => {
      if (!isObj(el)) return;
      const type = String(el.type);
      const path = base ? `${base}.${i}` : String(i);
      out.push({ depth, path, type, label: cat?.elements[type]?.label ?? type, text: elementText(el) });
      walk(el.children, depth + 1, path);
    });
  };
  walk(def.elements, 0, '');
  return out;
}

const placeText = (p: unknown): string => {
  if (!isObj(p)) return '';
  if (isObj(p.grid)) { const g = p.grid; return `grid column ${g.col}${Number(g.span) > 1 ? ` across ${g.span}` : ''}, row ${g.row}`; }
  if (isObj(p.px)) return 'placed by pixels';
  if (isObj(p.anchor)) return `anchored to ${Object.keys(p.anchor).filter((k) => k !== 'w' && k !== 'h').join(' and ')}`;
  if (typeof p.inset === 'string') return `fills the ${p.inset}`;
  return '';
};
export function elementText(el: Json): string {
  const bits: string[] = [];
  if (typeof el.field === 'string') bits.push(`shows the ${el.field.replace(/-/g, ' ')}`);
  if (typeof el.source === 'string') bits.push(`shows the ${el.source}`);
  if (typeof el.style === 'string') bits.push(`${el.style} style`);
  if (typeof el.shape === 'string') bits.push(`${el.shape} shape`);
  if (typeof el.mode === 'string') bits.push(`${el.mode} mode`);
  if (typeof el.emphasis === 'string' && el.emphasis !== 'none') bits.push(`emphasis: ${el.emphasis.replace(/-/g, ' ')}`);
  if (Array.isArray(el.treat) && el.treat.length) bits.push(`${el.treat.join(', ')}`);
  const place = placeText(el.place);
  if (place) bits.push(place);
  if (el.rot !== undefined && el.rot !== 0) bits.push(typeof el.rot === 'string' ? `turned by the ${el.rot} angle` : `turned ${el.rot} degrees`);
  if (typeof el.fill === 'string') bits.push(`${el.fill} fill`);
  if (isObj(el.when)) bits.push(`only when ${isObj(el.when) && el.when.present ? `${String(el.when.present)} is given` : `${String(el.when.absent)} is empty`}`);
  return bits.join(', ');
}

// What the post editor and the AI need from a design: its index among the look's designs of the same kind.
export const designIndex = (comps: Composition[], c: Composition): number => comps.filter((x) => x.kind === c.kind && x.position < c.position).length;

// Where a design would go if it moved one place up or down among its kind's (null: it cannot).
export function movedPosition(designs: Composition[], id: string, by: -1 | 1): number | null {
  const i = designs.findIndex((d) => d.id === id);
  const j = i + by;
  return i < 0 || j < 0 || j >= designs.length ? null : j;
}

// The designs a person can add to a look of a kind: those of every shipped look and of the brand's own looks, as { from, index, name }.
export interface AddOption { source: string; sourceName: string; kind: string; index: number; name: string; describe: string }
export function addOptions(kind: string, sources: Array<{ ref: string; name: string; designs: Array<{ kind: string; name: string; describe?: string }> }>): AddOption[] {
  const out: AddOption[] = [];
  for (const s of sources) {
    let index = 0;
    for (const d of s.designs) if (d.kind === kind) out.push({ source: s.ref, sourceName: s.name, kind, index: index++, name: d.name, describe: d.describe ?? '' });
  }
  return out;
}

// ---- walking the settings the way the form draws them ----

// A value for an entry just added to a list of objects: the required properties, from defaults, the lowest allowed or the first choice.
export function blankFor(desc: Desc): unknown {
  switch (desc.kind) {
    case 'number': return desc.default ?? desc.min ?? 0;
    case 'enum': return desc.default ?? desc.values?.[0] ?? '';
    case 'bool': return desc.default ?? false;
    case 'text': case 'role': return desc.default ?? '';
    case 'list': return clone(desc.default ?? []);
    case 'tuple': return (desc.items ?? []).map(blankFor);
    case 'object': {
      const out: Json = seedDefaults(desc);
      for (const k of desc.required ?? []) if (out[k] === undefined && desc.props?.[k]) out[k] = blankFor(desc.props[k]!);
      return out;
    }
    default: return undefined;
  }
}

// Every path the form shows a control (or a group) for, given the look as it is now.
export function collectControls(sections: Record<string, Desc>, look: Json): string[] {
  const out: string[] = [];
  const walk = (path: string, desc: Desc, value: unknown) => {
    out.push(path);
    if (desc.kind === 'object') for (const [k, d] of Object.entries(desc.props ?? {})) walk(joinPath(path, k), d, isObj(value) ? value[k] : undefined);
    else if (desc.kind === 'list' && desc.of?.kind === 'object' && Array.isArray(value)) value.forEach((v, i) => walk(joinPath(path, i), desc.of!, v));
  };
  for (const [name, d] of Object.entries(sections)) walk(name, d, look[name]);
  return out;
}

// What is wrong with the settings as they stand, per path, by the descriptors alone (the server checks everything again): a number
// out of range, a value not in its list. Only what is present is checked, and a missing required value is named.
export function settingsProblems(sections: Record<string, Desc>, look: Json): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (path: string, desc: Desc, value: unknown, required: boolean) => {
    if (value === undefined) { if (required && desc.default === undefined && desc.kind !== 'object') out[path] = 'Fill this in'; if (desc.kind !== 'object' || value === undefined) return; }
    if (desc.kind === 'object') {
      if (!isObj(value)) { out[path] = 'This is not set up correctly'; return; }
      for (const [k, d] of Object.entries(desc.props ?? {})) walk(joinPath(path, k), d, value[k], !!desc.required?.includes(k));
      return;
    }
    if (desc.kind === 'tagged') {
      const form = isObj(value) && desc.key ? value[desc.key] : undefined;
      const f = typeof form === 'string' ? desc.forms?.[form] : undefined;
      if (!f) { out[path] = 'Choose where this font comes from'; return; }
      walk(path, f, value, true);
      return;
    }
    const bad = checkValue(desc, value);
    if (bad) out[path] = bad;
    if (desc.kind === 'list' && desc.of?.kind === 'object' && Array.isArray(value)) value.forEach((v, i) => walk(joinPath(path, i), desc.of!, v, true));
  };
  for (const [name, d] of Object.entries(sections)) walk(name, d, look[name], false);
  return out;
}

// The look's settings: the definition without its compositions (what PUT .../settings takes).
export function settingsOf(definition: Json): Json {
  const { compositions: _c, ...rest } = definition;
  return clone(rest);
}
// The look as the engine reads it for a preview: the settings in hand and the enabled designs in order.
export function lookForPreview(settings: Json, comps: Composition[], order: string[]): Json {
  const enabled = comps.filter((c) => c.enabled).sort((a, b) => (order.indexOf(a.kind) - order.indexOf(b.kind)) || a.position - b.position);
  return { ...settings, compositions: enabled.map((c) => c.definition) };
}
