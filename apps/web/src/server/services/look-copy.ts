// The words a look is drawn with when nobody wrote a post: neutral sample copy for each design of a look, made from the look's own
// brief (lookBrief: which fields a design draws, which are required, the longest each takes, how many list items). Three scenarios:
//   sample   ordinary copy, about half the budget of each field
//   stress   the longest copy that holds: every field at its whole budget, then (the engine refuses text that does not fit) at 85%, 70%,
//            60% and 50% of it; a design that holds less than 50% of the budget its own brief states fails the check
//   minimal  the least the design needs (only its required fields, as short as can be); `minimalMore` adds the short optional fields
//            for the designs whose bare minimum leaves an empty area (the engine's emptiness check)
// `fill` is the share of each field's budget the copy uses.
// Nothing here is a customer's text or a real person or place. The text goes to the renderer only as the values of a post design,
// which the engine escapes and validates; this module builds no markup.
import type { LookBrief } from './looks.js';

export type CopyScenario = 'sample' | 'stress' | 'minimal';
type Variant = LookBrief['kinds'][string]['variants'][number];
type Json = Record<string, unknown>;

// The neutral sample picture the engine ships (synthetic, drawn by brands/demo/make-assets.mjs), by kind. Relative to the repository.
export const SAMPLE_PICTURES: Record<string, string> = { photo: 'design/assets/demo/object-jar.jpg', event: 'design/assets/demo/scene-market.jpg', offer: 'design/assets/demo/scene-market.jpg' };
const DEFAULT_PICTURE = 'design/assets/demo/object-jar.jpg';

const POOL = {
  headline: ['Small batches', 'made with care', 'and never in a hurry', 'because good things take a little longer', 'than anyone expects'],
  emphasis: ['and never in a hurry', 'made slowly, on purpose', 'every single day'],
  sub: ['Every one is made by a person who cares how it turns out, from the first step to the last, and checked again before it leaves.'],
  label: ['Our promise'],
  unit: ['kg', 'per bag', 'per batch', 'kg per batch', 'in every single batch'],
  quote: ['We do not do things fast. We do them right, in small batches, by hand, and we check every one before it goes out.'],
  by: ['A regular customer'],
  meta: ['12 Dec · 6pm · Town hall'],
  tag: ['New this week'],
  item: ['Made by hand, every time', 'Checked before it leaves', 'Sent the same day', 'Fixed for free if wrong', 'Never rushed, never cut'],
};

// The words of `source`, cut at a word end so that its length (the characters a person counts: `*` and a new-line mark do not count) is at
// most `max`; with no word fitting, the first `max` characters. Repeats the source when it is shorter than `want`.
function words(source: string, want: number, max: number): string {
  const target = Math.max(1, Math.min(want, max));
  let text = source;
  while ([...text].length < target) text += ` ${source}`;
  const cut = text.split(' ');
  let out = '';
  for (const w of cut) {
    const next = out ? `${out} ${w}` : w;
    if ([...next].length > target) break;
    out = next;
  }
  if (!out) out = [...cut[0]!].slice(0, target).join('');
  return out.replace(/[\s,;:.-]+$/, '') || [...source].slice(0, target).join('');
}

// Headlines with an emphasised ending (`*...*`), from short to long: the headline is the longest of them that fits the budget and, when a design asks
// for a short first part (a rule of its brief), whose first part is short enough. They are plain sentences, so they set the way a person's would.
const HEADLINES: ReadonlyArray<readonly [string, string]> = [
  ['Made slowly,', 'on purpose.'], ['Small batches,', 'never in a hurry.'], ['Slow by design,', 'on purpose every day.'], ['Roasted in small batches,', 'never in a hurry.'],
  ['Everything is made by hand,', 'never in a hurry.'], ['Everything is made by hand, in small batches,', 'never in a hurry.'],
];
const chars = (s: string) => [...s.replace(/\*/g, '')].length;
// The shortest headline a design takes: a bare word, or, when its brief asks for a first part and an emphasised phrase (a Myth and fact
// design: `accepts` rules on the headline's `pre` or `phrase`), the shortest two-part headline that meets each part's least length.
function minimalHeadline(rules: ReadonlyArray<{ field?: string; part?: string; minChars?: number }>): string {
  const parts = rules.filter((r) => r.field === 'headline' && (r.part === 'pre' || r.part === 'phrase'));
  if (!parts.length) return 'Hello';
  const least = (part: string) => Math.max(1, ...parts.filter((r) => r.part === part).map((r) => r.minChars ?? 1));
  // the shortest of a few plain words with at least n characters
  const pick = (list: readonly string[], n: number) => list.find((w) => w.length >= n) ?? words(list[list.length - 1]!, n, n);
  return `${pick(['Old', 'Old way', 'The old way'], least('pre'))} *${pick(['new', 'the new', 'the new one', 'the new way now'], least('phrase'))}*`;
}

function headline(max: number, scenario: CopyScenario, fill: number, preMax: number | null, rules: ReadonlyArray<{ field?: string; part?: string; minChars?: number }> = []): string {
  if (scenario === 'minimal') return minimalHeadline(rules);
  const total = Math.min(max, Math.max(10, Math.round(max * fill)));
  const ok = HEADLINES.filter(([pre, emph]) => chars(`${pre} ${emph}`) <= total && (preMax === null || chars(pre.replace(/,$/, '')) <= preMax));
  const pick = ok[ok.length - 1] ?? HEADLINES[0]!;
  const out = `${pick[0]} *${pick[1]}*`;
  return chars(out) <= max ? out : words(HEADLINES[0]!.join(' '), max, max);
}

// The longest of `list` that has at most `n` characters (the shortest when none has).
const ladder = (list: readonly string[], n: number): string => [...list].sort((a, b) => a.length - b.length).filter((x) => x.length <= n).pop() ?? [...list].sort((a, b) => a.length - b.length)[0]!;

const itemsChars = 44;

// The post design (without kind and variant) for one variant of a look's brief.
export function copyFor(kind: string, variant: Variant, scenario: CopyScenario, opts: { minimalMore?: boolean; fill?: number; drop?: readonly string[] | '*' } = {}): Json {
  const fill = opts.fill ?? (scenario === 'stress' ? 1 : 0.5);
  const fields = variant.fields as Record<string, { required?: boolean; max?: number; min?: number }>;
  const out: Json = {};
  const preMax = (variant.accepts as Array<{ field?: string; part?: string; maxChars?: number }>).find((r) => r.field === 'headline' && r.part === 'pre')?.maxChars ?? null;
  const bare = scenario === 'minimal' && !opts.minimalMore;
  for (const [name, f] of Object.entries(fields)) {
    if (name === 'image') { out.image = SAMPLE_PICTURES[kind] ?? DEFAULT_PICTURE; continue; }
    if (bare && !f.required) continue;
    if (!f.required && name !== 'image' && (opts.drop === '*' || opts.drop?.includes(name))) continue;
    const max = f.max ?? 40;
    const mini = scenario === 'minimal';
    const share = (m: number) => Math.max(3, Math.round(m * fill));
    switch (name) {
      case 'headline': out.headline = headline(max, scenario, fill, preMax, variant.accepts as Array<{ field?: string; part?: string; minChars?: number }>); break;
      case 'big': out.big = [...(mini ? '7 kg' : scenario === 'stress' ? (fill >= 1 ? '1,250 kg' : fill >= 0.85 ? '125 kg' : fill >= 0.7 ? '12 kg' : '12') : '12')].slice(0, max).join(''); break;
      case 'items': {
        const lo = f.min ?? 2, hi = f.max ?? 5;
        const n = scenario === 'stress' ? hi : mini ? lo : Math.min(hi, Math.max(lo, 3));
        out.items = Array.from({ length: n }, (_, i) => (mini ? `Item ${i + 1}` : words(POOL.item[i % POOL.item.length]!, Math.max(8, Math.round(itemsChars * fill * (scenario === 'stress' ? 1 : 0.6))), itemsChars)));
        break;
      }
      case 'quote': out.quote = mini ? 'Said' : words(POOL.quote[0]!, share(max), max); break;
      case 'sub': out.sub = mini ? 'One short line.' : words(POOL.sub[0]!, scenario === 'sample' ? Math.round(max * Math.min(0.9, fill + 0.3)) : share(max), max); break;
      case 'label': out.label = mini ? 'New' : words(POOL.label[0]!, share(max) , max); break;
      case 'unit': out.unit = mini ? 'per bag' : ladder(POOL.unit, share(max)); break;
      case 'by': out.by = mini ? 'A friend' : words(POOL.by[0]!, share(max), max); break;
      case 'meta': out.meta = mini ? '12 Dec' : words(POOL.meta[0]!, share(max), max); break;
      case 'tag': out.tag = mini ? 'New' : words(POOL.tag[0]!, share(max), max); break;
      default: break; // a field the engine's copy does not know: left off (it is optional, or the design check says what is missing)
    }
  }
  return out;
}

// What to try, in order, for each scenario (the first that the engine's checks accept is the one drawn). The stress copy gives up at 50%.
export const ATTEMPTS: Record<CopyScenario, ReadonlyArray<{ fill?: number; minimalMore?: boolean; drop?: readonly string[] | '*' }>> = {
  // a brand's own (wider) type may not hold a label, a tag or a long sub line that another brand's does: those optional fields are the first to go
  sample: [{ fill: 0.5 }, { fill: 0.65 }, { fill: 0.8 }, { fill: 0.5, drop: ['label'] }, { fill: 0.35, drop: ['label', 'tag'] }, { fill: 0.35, drop: ['label', 'tag', 'unit', 'meta'] }, { fill: 0.4 }, { fill: 0.2, drop: ['label', 'tag'] }, { fill: 0.12, drop: ['label', 'tag', 'unit'] }, { fill: 0.12, drop: ['label', 'tag', 'unit', 'meta'] }, { fill: 0.25, drop: '*' }],
  stress: [{ fill: 1 }, { fill: 0.85 }, { fill: 0.7 }, { fill: 0.6 }, { fill: 0.5 }],
  minimal: [{ minimalMore: false }, { minimalMore: true }],
};
