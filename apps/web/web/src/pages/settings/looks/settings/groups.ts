// The choice groups of the Settings tab and which catalogue values each group's Fine-tune holds. A value belongs to exactly one
// group: the groups name their nodes (a path in the catalogue, taken with everything under it) and whatever no group names falls
// to "Details", so a setting the engine adds is still reachable without a change here. Pure (no React).
import { getAt, joinPath, parsePath, setAt } from '../look-model';
import type { Desc, Json } from '../look-types';

export type GroupId = 'typeface' | 'voice' | 'feel' | 'colour' | 'space' | 'pictures' | 'logo' | 'details';
export interface SettingsGroup { id: GroupId; title: string; hint: string; nodes: string[]; controls: string[] }

export const GROUPS: SettingsGroup[] = [
  { id: 'typeface', title: 'Typeface', hint: 'The fonts for headlines, body text, labels and figures, chosen as a pair. Fine-tune has each font, its weights and the sizes of body, list, label and figure text.',
    nodes: ['fonts.display', 'fonts.text', 'fonts.label', 'fonts.mono', 'type.body', 'type.item', 'type.label', 'type.numeral'], controls: ['pairing'] },
  { id: 'voice', title: 'Headline voice', hint: 'How headlines are set: how heavy, capitals or as typed, and how tightly the lines sit.', nodes: ['type.display'], controls: ['weight', 'case', 'spacing'] },
  { id: 'feel', title: 'Feel', hint: 'Three dials that adjust the whole look at once.', nodes: ['dials'], controls: [] },
  { id: 'colour', title: 'Colour', hint: 'How your brand colours are used on a page.', nodes: ['colour'], controls: ['logic'] },
  { id: 'space', title: 'Space', hint: 'The margins and the gap between columns.', nodes: ['canvas.feed.margin', 'canvas.feed.grid.cols', 'canvas.feed.grid.gutter'], controls: ['space'] },
  { id: 'pictures', title: 'Pictures', hint: 'How photographs are treated.', nodes: ['photo'], controls: ['treat'] },
  { id: 'logo', title: 'Logo', hint: 'Whether the brand logo is placed, and how big.', nodes: ['logo'], controls: ['logo', 'logoSize'] },
  { id: 'details', title: 'Details', hint: '', nodes: [], controls: [] },
];
export const DETAILS_TEXT = 'Rules, frames, highlight bars, shadows, named angles, the top label row, grid rows and extra text lines.';

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const covers = (node: string, path: string) => path === node || path.startsWith(`${node}.`) || path.startsWith(`${node}[`);

// The nodes each group's Fine-tune draws: its own, and for Details every part of the catalogue no other group names.
export function assignNodes(sections: Record<string, Desc>): Record<GroupId, string[]> {
  const out = Object.fromEntries(GROUPS.map((g) => [g.id, [] as string[]])) as Record<GroupId, string[]>;
  const named = new Map<string, GroupId>();
  for (const g of GROUPS) for (const n of g.nodes) named.set(n, g.id);
  const inside = (path: string) => [...named.keys()].some((n) => n.startsWith(`${path}.`));
  const visit = (path: string, desc: Desc) => {
    const owner = named.get(path);
    if (owner) { out[owner].push(path); return; }
    if (desc.kind === 'object' && inside(path)) { for (const [k, d] of Object.entries(desc.props ?? {})) visit(joinPath(path, k), d); return; }
    out.details.push(path);
  };
  for (const [name, d] of Object.entries(sections)) visit(name, d);
  // A named node the catalogue does not have is dropped, so a removed setting leaves no empty control.
  for (const g of GROUPS) out[g.id] = out[g.id].filter((n) => descExists(sections, n));
  return out;
}
function descExists(sections: Record<string, Desc>, path: string): boolean {
  let cur: Desc | undefined = { kind: 'object', props: sections };
  for (const k of parsePath(path)) { cur = typeof k === 'string' ? cur?.props?.[k] : undefined; if (!cur) return false; }
  return true;
}

// The group a problem (by path, with or without the server's `look "x": ` lead-in) belongs to; Details when no node names it.
export function groupOfPath(path: string, assignment: Record<GroupId, string[]>): GroupId {
  const p = path.replace(/^look "[^"]*": /, '');
  for (const g of GROUPS) if (assignment[g.id].some((n) => covers(n, p))) return g.id;
  return 'details';
}

// Every value under a path, as { "a.b[0]": json } (an array is one value).
function leaves(value: unknown, path: string, into: Record<string, string>): void {
  if (isObj(value)) { for (const [k, v] of Object.entries(value)) leaves(v, joinPath(path, k), into); return; }
  into[path] = JSON.stringify(value ?? null);
}
export function changedPaths(look: Json, baseline: Json, nodes: string[]): string[] {
  const out = new Set<string>();
  for (const n of nodes) {
    const a: Record<string, string> = {}, b: Record<string, string> = {};
    leaves(getAt(look, n), n, a); leaves(getAt(baseline, n), n, b);
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) out.add(k);
  }
  return [...out];
}
// How many single values the nodes hold (an object counts what is inside it; a list, a font or a tuple is one value).
export function leafCount(sections: Record<string, Desc>, nodes: string[]): number {
  const count = (d: Desc | undefined): number => (!d ? 0 : d.kind === 'object' && d.props ? Object.values(d.props).reduce((n, x) => n + count(x), 0) : 1);
  return nodes.reduce((n, path) => {
    let cur: Desc | undefined = { kind: 'object', props: sections };
    for (const k of parsePath(path)) cur = typeof k === 'string' ? cur?.props?.[k] : undefined;
    return n + count(cur);
  }, 0);
}
export const changedCount = (look: Json, baseline: Json, nodes: string[]): number => changedPaths(look, baseline, nodes).length;

// The look with the group's nodes put back to the baseline's values (a node the baseline lacks is removed).
export function resetNodes(look: Json, baseline: Json, nodes: string[]): Json {
  let next = look;
  for (const n of nodes) { const v = getAt(baseline, n); next = setAt(next, n, v === undefined ? undefined : JSON.parse(JSON.stringify(v))); }
  return next;
}
