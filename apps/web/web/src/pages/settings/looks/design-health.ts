// "Design health": the guard rails of a design, worked out in the browser from the design's JSON while it is edited. They mirror the
// engine's static checks (packages/engine/lib/design/look-static.mjs): at most three type levels (or the design's own levels, up to five), a headline at least 2.6 times the body,
// at most three turned pieces, every required field shown exactly once, and text over a picture with a block or a fade under it. The server
// remains the authority (it also checks the drawn image); where it speaks, its sentences replace these in the page.
import { angleDegrees, bindingsOf, isTurned, listTree, requiredFields, sketchRect, type Rect } from './design-model';
import type { Json, LookCatalogue } from './look-types';

export type HealthStatus = 'ok' | 'warn' | 'bad' | 'unknown';
export interface HealthItem { id: 'levels' | 'scale' | 'rotated' | 'required' | 'photo-text'; label: string; status: HealthStatus; detail: string }
export interface Health { items: HealthItem[]; worst: HealthStatus }

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const TEXT_TYPES = ['text', 'fitted-stack', 'numeral', 'mantra-rows', 'rows', 'meta-row'];
export const SCALE_MIN = 2.6;

const styleDefault = (el: Json): string => (el.field === 'headline' || el.field === 'quote' ? 'display' : el.field === 'big' ? 'numeral' : el.source || ['label', 'meta', 'tag', 'unit', 'by'].includes(String(el.field)) ? 'label' : 'body');
const styleOf = (el: Json): string => (typeof el.style === 'string' ? el.style : styleDefault(el));
function styleSize(style: string, look: Json): number | undefined {
  const t = (look.type ?? {}) as Json;
  const pick = (k: string) => (isObj(t[k]) ? ((t[k] as Json).size as number | undefined) : undefined);
  return style === 'body' ? pick('body') : style === 'item' ? pick('item') ?? pick('body') : style === 'label' ? pick('label') : undefined;
}

interface Node { el: Json; type: string; path: string; parent: Node | null; order: number; slot: boolean }
function nodesOf(comp: Json): Node[] {
  const rows = listTree(comp, null);
  const byPath = new Map<string, Node>();
  const out: Node[] = [];
  rows.forEach((r, order) => {
    const n: Node = { el: r.el, type: r.type, path: r.path, parent: r.parentPath ? byPath.get(r.parentPath) ?? null : null, order, slot: r.slot };
    byPath.set(r.path, n);
    out.push(n);
  });
  return out;
}

const levelCount = (sizes: number[]): number => {
  const s = [...sizes].sort((a, b) => a - b), groups: number[][] = [];
  for (const z of s) { const g = groups[groups.length - 1]; if (!g || z - g[g.length - 1]! > 2) groups.push([z]); else g.push(z); }
  return groups.length;
};
// The sizes a node sets and whether it is a fitted headline.
function sizesOf(n: Node, look: Json): { sizes: number[]; fitted: boolean } {
  const el = n.el, out = { sizes: [] as number[], fitted: false };
  const add = (s: unknown) => { if (isNum(s)) out.sizes.push(s); };
  const first = (l: unknown) => (isObj(l) && Array.isArray(l.steps) ? (l.steps as number[][])[0]?.[1] : undefined);
  if (n.type === 'text') add(isObj(el.ladder) ? first(el.ladder) : el.size ?? styleSize(styleOf(el), look));
  else if (n.type === 'fitted-stack' || n.type === 'mantra-rows') out.fitted = true;
  else if (n.type === 'numeral') { out.fitted = true; if (isObj(el.unit)) add(styleSize(String(el.unit.style ?? 'label'), look)); }
  else if (n.type === 'sticker' && el.field !== undefined) add(isObj(el.ladder) ? first(el.ladder) : isObj(el.fit) ? el.fit.cap : el.textSize ?? Math.round((((el.size ?? el.h ?? 100) as number)) / 5));
  else if (n.type === 'rows') {
    add(el.textSize ?? styleSize(String(el.textStyle ?? 'item'), look));
    if ((el.number ?? 'none') !== 'none') add(el.numberSize ?? styleSize(String(el.numberStyle ?? 'label'), look));
  } else if (n.type === 'meta-row') add(((look.type as Json | undefined)?.label as Json | undefined)?.size);
  return out;
}

const hasFill = (n: Node) => n.el.fill !== undefined && ['box', 'band'].includes(n.type);
const topOf = (n: Node): Node => { let x = n; while (x.parent) x = x.parent; return x; };
const keyOf = (n: Node): number => ((isNum(n.el.z) ? n.el.z : 0) * 1000) + n.order;

export function designHealth(comp: Json, look: Json, cat: LookCatalogue): Health {
  const nodes = nodesOf(comp);
  const items: HealthItem[] = [];
  const limits = cat.limits;

  // ---- required fields shown once, and type levels, over the ways the optional fields may be filled ----
  const fields = isObj(comp.fields) ? (comp.fields as Json) : {};
  const declared = Object.keys(fields);
  const required = new Set(requiredFields(comp, cat));
  const optional = declared.filter((f) => !required.has(f));
  const whens: Json[] = nodes.map((n) => n.el.when).filter(isObj);
  if (Array.isArray(comp.ground)) for (const c of comp.ground as Json[]) if (isObj(c) && isObj(c.when)) whens.push(c.when);
  const conditioned = [...new Set(whens.flatMap((w) => [w.present, w.absent]).filter((f): f is string => typeof f === 'string' && optional.includes(f)))];
  const problems: string[] = [];
  let maxLevels = 0;
  let levelsWhen = '';
  const dup = new Set<string>(), missing = new Set<string>();
  const fieldName = (f: string) => cat.fields[f]?.label ?? f;
  if (conditioned.length <= (limits.optionalFieldsInConditions ?? 6)) {
    for (let mask = 0; mask < 1 << conditioned.length; mask++) {
      const present = new Set([...required, ...optional.filter((f) => !conditioned.includes(f)), ...conditioned.filter((_f, i) => mask & (1 << i))]);
      const holds = (w: unknown) => !isObj(w) || ((w.present === undefined || present.has(String(w.present))) && (w.absent === undefined || !present.has(String(w.absent))));
      const empty = conditioned.filter((f) => !present.has(f));
      const combo = empty.length ? ` when ${empty.map((f) => fieldName(f).toLowerCase()).join(' and ')} ${empty.length > 1 ? 'are' : 'is'} empty` : '';
      const active = nodes.filter((n) => { for (let a: Node | null = n; a; a = a.parent) if (!holds(a.el.when)) return false; return true; });
      const seen = new Map<string, string>();
      for (const n of active) for (const b of bindingsOf(n.el, look)) {
        if (seen.has(b.sig) && !dup.has(b.sig)) { dup.add(b.sig); problems.push(`${fieldName(b.field)} is shown twice in the same way${combo}`); }
        seen.set(b.sig, n.path);
      }
      for (const f of required) if (![...seen.keys()].some((s) => s.startsWith(`${f}|`)) && !missing.has(f)) { missing.add(f); problems.push(`Nothing shows ${fieldName(f).toLowerCase()}${combo}`); }
      const sizes: number[] = [];
      let fitted = false;
      for (const n of active) { const s = sizesOf(n, look); sizes.push(...s.sizes); fitted ||= s.fitted; }
      const lv = levelCount(sizes) + (fitted ? 1 : 0);
      if (lv > maxLevels) { maxLevels = lv; levelsWhen = combo; }
    }
  }
  for (const f of declared) if (!nodes.some((n) => bindingsOf(n.el, look).some((b) => b.field === f))) problems.push(`${fieldName(f)} is in the design but no element shows it`);

  // a design may allow up to five sizes (levels.max), held to a hierarchy the server measures on the drawn image
  const maxLevelsAllowed = isObj(comp.levels) && isNum(comp.levels.max) ? comp.levels.max : limits.typeLevels ?? 3;
  items.push({
    id: 'levels', label: 'Type sizes',
    status: maxLevels > maxLevelsAllowed ? 'bad' : 'ok',
    detail: maxLevels > maxLevelsAllowed ? `${maxLevels} sizes${levelsWhen}; at most ${maxLevelsAllowed} (a fitted headline counts as one)` : `${maxLevels} of ${maxLevelsAllowed} sizes in use`,
  });

  // ---- scale: the headline against the body ----
  let big: number | null = null, bigSmallest: number | null = null, body: number | null = null, unknownHead = false;
  for (const n of nodes) {
    const el = n.el;
    const headlineLike = (n.type === 'text' && styleOf(el) === 'display' && ['headline', 'quote'].includes(String(el.field))) || n.type === 'fitted-stack' || n.type === 'mantra-rows';
    if (headlineLike) {
      const steps = isObj(el.ladder) && Array.isArray(el.ladder.steps) ? (el.ladder.steps as number[][]).map((s) => s[1]!) : [];
      const sizes = Array.isArray(el.sizes) ? (el.sizes as number[]) : steps.length ? steps : isNum(el.size) ? [el.size] : isNum(el.cap) ? [el.cap] : [];
      if (sizes.length) { big = Math.max(big ?? 0, Math.max(...sizes)); bigSmallest = Math.max(bigSmallest ?? 0, Math.min(...sizes)); } else unknownHead = true;
    }
    if (n.type === 'text' && ['body', 'item'].includes(styleOf(el)) && !el.vertical) { const s = isNum(el.size) ? el.size : styleSize(styleOf(el), look); if (isNum(s)) body = Math.min(body ?? Infinity, s); }
  }
  if (big === null || body === null) {
    items.push({ id: 'scale', label: 'Headline against body', status: body === null ? 'ok' : unknownHead ? 'unknown' : 'ok', detail: body === null ? 'No body text to compare with' : 'The headline is sized when the image is made' });
  } else {
    const ratio = big / body, low = (bigSmallest ?? big) / body;
    items.push({
      id: 'scale', label: 'Headline against body',
      status: ratio < SCALE_MIN ? 'bad' : low < SCALE_MIN ? 'warn' : 'ok',
      detail: ratio < SCALE_MIN ? `${Math.round(ratio * 10) / 10} to 1; the headline should be at least ${SCALE_MIN} times the body` : low < SCALE_MIN ? `${Math.round(ratio * 10) / 10} to 1, but only ${Math.round(low * 10) / 10} to 1 with the longest text` : `${Math.round(ratio * 10) / 10} to 1`,
    });
  }

  // ---- turned pieces ----
  const turned = nodes.filter((n) => n.el.rot !== undefined && isTurned(n.el.rot, look)).length
    + nodes.filter((n) => n.type === 'rows' && Array.isArray(n.el.altRot) && (n.el.altRot as unknown[]).some((v) => isTurned(v, look))).length;
  const maxTurned = limits.rotated ?? 3;
  items.push({ id: 'rotated', label: 'Turned pieces', status: turned > maxTurned ? 'bad' : 'ok', detail: `${turned} of ${maxTurned}${turned > maxTurned ? '; at most ' + maxTurned + ' may be turned' : ''}` });
  // text turned too far (outside a sticker)
  const maxText = limits.textRotation ?? 8;
  const tooTurned = nodes.filter((n) => {
    if (!TEXT_TYPES.includes(n.type) || n.el.vertical !== undefined) return false;
    let sum = 0;
    for (let a: Node | null = n; a; a = a.parent) { if (a.type === 'sticker') return false; if (a.el.rot !== undefined) sum += angleDegrees(a.el.rot, look); }
    return Math.abs(sum) > maxText;
  });
  if (tooTurned.length) items[items.length - 1] = { ...items[items.length - 1]!, status: 'bad', detail: `Text is turned more than ${maxText} degrees outside a sticker` };

  // ---- required fields ----
  items.push({ id: 'required', label: 'Fields shown once', status: problems.length ? 'bad' : 'ok', detail: problems[0] ?? `${required.size} needed field${required.size === 1 ? '' : 's'} shown exactly once` });

  // ---- text over a picture ----
  items.push(photoTextItem(nodes, comp, look));

  const order: HealthStatus[] = ['ok', 'unknown', 'warn', 'bad'];
  return { items, worst: items.reduce<HealthStatus>((w, i) => (order.indexOf(i.status) > order.indexOf(w) ? i.status : w), 'ok') };
}

const overlaps = (a: Rect, b: Rect): boolean => {
  const ax = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), ay = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ax > 0.5 && ay > 0.5;
};
const contains = (b: Rect, t: Rect): boolean => t.x >= b.x - 1 && t.x + t.w <= b.x + b.w + 1 && t.y >= b.y - 1 && t.y + t.h <= b.y + b.h + 1;

function photoTextItem(nodes: Node[], comp: Json, look: Json): HealthItem {
  const base: Pick<HealthItem, 'id' | 'label'> = { id: 'photo-text', label: 'Text over a picture' };
  const cache = new Map<Node, Rect>();
  const rectFor = (n: Node): Rect => {
    const hit = cache.get(n);
    if (hit) return hit;
    const r = sketchRect(comp, n.path, look)?.rect ?? (n.parent ? rectFor(n.parent) : { x: 0, y: 0, w: 1080, h: 1350 });
    cache.set(n, r);
    return r;
  };
  const photos = nodes.filter((n) => n.type === 'photo' || n.type === 'taped-photo' || (n.type === 'seam' && n.el.upper !== 'field'));
  if (!photos.length) return { ...base, status: 'ok', detail: 'No picture' };
  // a colour over the picture (overlay) is raised by the page until the words on it reach their contrast, like a scrim
  const backers = nodes.filter((n) => ['scrim', 'overlay', 'block', 'sticker'].includes(n.type) || hasFill(n) || (n.type === 'rows' && (n.el.fill || n.el.altFill)))
    .map((n) => ({ n, rect: rectFor(n), key: keyOf(topOf(n)) }));
  for (const s of nodes.filter((x) => x.type === 'seam')) {
    const y = Math.max(Number(s.el.leftY) || 0, Number(s.el.rightY) || 0);
    backers.push({ n: s, rect: { x: 0, y, w: 1080, h: 1350 - y }, key: keyOf(s) + 0.5 });
  }
  for (const t of nodes.filter((x) => TEXT_TYPES.includes(x.type))) {
    let ok = false;
    for (let a = t.parent; a; a = a.parent) if (a.type === 'sticker' || a.type === 'seam' || hasFill(a)) ok = true;
    if (ok || (t.type === 'rows' && (t.el.fill || t.el.altFill))) continue;
    const tr = rectFor(t), tk = keyOf(topOf(t));
    for (const p of photos) {
      const pk = keyOf(topOf(p));
      if (pk >= tk || topOf(p) === topOf(t)) continue;
      if (!overlaps(rectFor(p), tr)) continue;
      if (!backers.some((b) => b.key > pk - 0.001 && b.key < tk && b.n !== t && contains(b.rect, tr))) {
        return { ...base, status: 'bad', detail: 'Some text lies over the picture with no block or dark fade under it' };
      }
    }
  }
  return { ...base, status: 'ok', detail: 'Text over the picture has a block or fade under it' };
}

// The server's sentences, when it has spoken, in place of the guesses above: each of its problems that belongs to one of the checks marks that
// check as failed, with the server's words.
const OF_CHECK: Array<[HealthItem['id'], RegExp]> = [
  ['levels', /sets type in \d+ sizes|type levels/],
  ['rotated', /turns \d+ elements|text is turned|turned .* degrees/],
  ['required', /nothing shows the required field|in the same way as|declares .* but no element shows it/],
  ['photo-text', /lies over a picture/],
  ['scale', /scale|times the body/],
];
export function mergeServer(health: Health, messages: string[]): Health {
  if (!messages.length) return health;
  const items = health.items.map((it) => {
    const re = OF_CHECK.find(([id]) => id === it.id)?.[1];
    const hit = re ? messages.find((m) => re.test(m)) : undefined;
    return hit ? { ...it, status: 'bad' as HealthStatus, detail: hit } : it;
  });
  const order: HealthStatus[] = ['ok', 'unknown', 'warn', 'bad'];
  return { items, worst: items.reduce<HealthStatus>((w, i) => (order.indexOf(i.status) > order.indexOf(w) ? i.status : w), 'ok') };
}
