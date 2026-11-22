// The brand's active look as the post editor sees it (GET /api/looks/brief): the kinds it has an enabled design for, each design by
// name, and each design's field budgets. Pure, so it is tested without a browser (web-look-brief.spec.ts).
import type { ActiveBrief } from '@/hooks/use-active-look';
import { POST_LIMITS, type PostKindInfo, type PostLimits } from '../design-model';
import type { PostKinds } from './use-post-kinds';

const CANON = ['label', 'headline', 'sub', 'big', 'unit', 'items', 'quote', 'by', 'image', 'meta', 'tag'];

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
      variants: variants.map((v) => ({ variant: v.index, name: v.name, describe: v.describe, budgets: v.fields })),
    };
  });
  return { ...base, direction: brief.id ?? brief.ref, kinds, offered: kinds.map((k) => k.kind) };
}

// The budgets for the chosen design of a kind, or, with Automatic, the most any of its designs takes. Text a design does not use
// keeps the engine's own limit. Never below what the field needs.
export function budgetsFor(base: PostLimits | null | undefined, info: PostKindInfo | undefined, variant: number | undefined): PostLimits {
  const lim: PostLimits = { ...(base ?? POST_LIMITS), items: { ...(base ?? POST_LIMITS).items } };
  const variants = (info?.variants ?? []).filter((v) => v.budgets);
  if (!variants.length) return lim;
  const chosen = variant === undefined ? variants : variants.filter((v) => v.variant === variant);
  const use = chosen.length ? chosen : variants;
  for (const f of Object.keys(lim) as Array<keyof PostLimits>) {
    if (f === 'items') continue;
    const maxes = use.map((v) => v.budgets![f]?.max).filter((m): m is number => typeof m === 'number');
    if (maxes.length) lim[f] = Math.max(...maxes);
  }
  const items = use.map((v) => v.budgets!.items).filter(Boolean);
  if (items.length) {
    lim.items.max = Math.max(...items.map((i) => i!.max ?? lim.items.max));
    lim.items.min = Math.min(...items.map((i) => i!.min ?? lim.items.min));
  }
  return lim;
}
