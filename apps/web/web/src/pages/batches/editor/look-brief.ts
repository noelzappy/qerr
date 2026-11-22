// The brand's active look as the post editor sees it (GET /api/looks/brief): the kinds it has an enabled design for, each design by
// name, and each design's field budgets. Pure, so it is tested without a browser (web-look-brief.spec.ts).
import type { ActiveBrief } from '@/hooks/use-active-look';
import { POST_LIMITS, POST_LISTS, type PostKindInfo, type PostLimits } from '../design-model';
import type { PostKinds } from './use-post-kinds';

const CANON = ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'avatar', 'image', 'meta', 'tag', 'cta', 'info', 'gallery', 'chart'];

// With a look in force: only the kinds it draws, the fields its designs use, its designs as the "Look" choices (the variant a post
// names is the design's index) and the look's name as the direction. Without one, the answer is returned as it is.
export function applyLookBrief(base: PostKinds, brief: ActiveBrief): PostKinds {
  if (!brief) return base;
  const offered = Object.keys(brief.kinds).filter((k) => brief.kinds[k]!.variants.length > 0);
  const kinds: PostKindInfo[] = base.kinds.filter((k) => offered.includes(k.kind)).map((k) => {
    const variants = brief.kinds[k.kind]!.variants;
    const used = new Set(variants.flatMap((v) => Object.keys(v.fields)));
    const fields = CANON.filter((f) => used.has(f));
    return {
      kind: k.kind, fields, required: k.required.filter((f) => fields.includes(f)),
      variants: variants.map((v) => ({ variant: v.index, name: v.name, describe: v.describe, budgets: v.fields, ...(v.marks ? { marks: v.marks } : {}) })),
    };
  });
  return { ...base, direction: brief.id ?? brief.ref, kinds, offered: kinds.map((k) => k.kind) };
}

// The budgets for the chosen design of a kind, or, with Automatic, the most any of its designs takes. Text a design does not use
// keeps the engine's own limit. Never below what the field needs.
export function budgetsFor(base: PostLimits | null | undefined, info: PostKindInfo | undefined, variant: number | undefined): PostLimits {
  // (an answer from an older server may lack the newer fields: the engine's own limits fill them)
  const b = { ...POST_LIMITS, ...(base ?? {}) } as PostLimits;
  const lim: PostLimits = { ...b, items: { ...b.items }, info: { ...b.info }, gallery: { ...b.gallery }, infoKeys: [...b.infoKeys], icons: [...b.icons], chart: { ...b.chart, kinds: [...b.chart.kinds], units: [...b.chart.units] } };
  const variants = (info?.variants ?? []).filter((v) => v.budgets);
  if (!variants.length) return lim;
  const chosen = variant === undefined ? variants : variants.filter((v) => v.variant === variant);
  const use = chosen.length ? chosen : variants;
  for (const f of Object.keys(lim) as Array<keyof PostLimits>) {
    if ((POST_LISTS as readonly string[]).includes(f) || f === 'infoKeys' || f === 'icons' || f === 'chart') continue;
    const maxes = use.map((v) => v.budgets![f]?.max).filter((m): m is number => typeof m === 'number');
    if (maxes.length) (lim as unknown as Record<string, number>)[f] = Math.max(...maxes);
  }
  // a counted list: the most any chosen design takes, the least any needs (an info block and a row of pictures only from the designs that draw one)
  for (const f of POST_LISTS) {
    const own = use.map((v) => v.budgets![f]).filter(Boolean);
    if (!own.length) continue;
    lim[f].max = Math.max(...own.map((i) => i!.max ?? lim[f].max));
    lim[f].min = Math.min(...own.map((i) => i!.min ?? lim[f].min));
  }
  // a chart: the kinds the chosen designs draw (in their order) and their point counts, from the designs that draw one
  const charts = use.map((v) => v.budgets!.chart).filter(Boolean);
  if (charts.length) {
    const kinds = [...new Set(charts.flatMap((c) => c!.kinds ?? []))];
    if (kinds.length) lim.chart.kinds = kinds;
    lim.chart.max = Math.max(...charts.map((c) => c!.max ?? lim.chart.max));
    lim.chart.min = Math.min(...charts.map((c) => c!.min ?? lim.chart.min));
  }
  return lim;
}

// Which of the headline's marks the chosen design draws; with Automatic, a mark counts as drawn when any design of the kind draws it.
// null when it is not known (no look, or an older server).
export function drawsFor(info: PostKindInfo | undefined, variant: number | undefined): { pills: boolean; icons: boolean } | null {
  const known = (info?.variants ?? []).filter((v) => v.marks);
  if (!known.length) return null;
  const use = variant === undefined ? known : known.filter((v) => v.variant === variant);
  if (!use.length) return null;
  return { pills: use.some((v) => v.marks!.pills), icons: use.some((v) => v.marks!.icons) };
}
