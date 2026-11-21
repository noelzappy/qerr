// A live sketch of a layout at one size: the grid, every block in its slot (bleeding to the page edges it asks for) or at its pixel
// rectangle, the page's chrome roughly where the page puts it, with sample words, drawn in the browser as plain boxes. It shows
// where things go while the layout is edited; the real image always comes from the design engine (the preview button), which
// also runs the fit, contrast and enlargement checks.
//
// A block with a condition is drawn as a post would draw it in the scenario given ("as if" sub were empty, on page 1 of a
// carousel ...; by default every field filled, a single post), and marked "if". A block the scenario leaves out is not drawn,
// unless it is the selected one: then it is drawn dashed and faded, so it can still be found and placed.
import type { CSSProperties, MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { defaultScenario, groundIn, holds, isBuiltPage, pxOn, slotOn, type Scenario } from './layout-model';
import { BLOCK_LABEL, CHROME_RECT, cellAt, cellOf, rectOf, type Block, type Catalogue, type Layout } from './layout-types';

const SAMPLE: Record<string, string> = {
  headline: 'Every saving, on record.', sub: 'One clear line about the post.', line: 'saved by members this year', quote: 'We finally see where every euro goes.',
  myth: 'Group savings are hard to track.', factLead: 'Every payment is on the record.', fact: 'Each member sees the same ledger.', big: '14.8M+',
  label: 'Label', eyebrow: 'New this month', note: 'A short note', title: 'Window title', stats: '3,900+ members  ·  400+ groups', items: '✓ One  ✓ Two  ✓ Three',
};
const TINT: Record<string, string> = {
  headline: 'bg-sky-500/15 border-sky-600/50', sub: 'bg-sky-500/10 border-sky-600/40', label: 'bg-violet-500/10 border-violet-600/40', figure: 'bg-sky-500/15 border-sky-600/50',
  stats: 'bg-sky-500/10 border-sky-600/40', list: 'bg-sky-500/10 border-sky-600/40', photo: 'bg-amber-500/25 border-amber-700/50', screen: 'bg-emerald-500/20 border-emerald-700/50',
  logo: 'bg-zinc-500/15 border-zinc-600/50', website: 'bg-zinc-500/10 border-zinc-600/40', slab: 'bg-indigo-500/15 border-indigo-700/50', artefact: 'bg-orange-500/15 border-orange-700/50',
  decoration: 'bg-transparent border-dashed border-zinc-500/40', spacer: 'bg-transparent border-dashed border-zinc-400/40',
  bar: 'bg-zinc-500/15 border-zinc-600/50', runhead: 'bg-violet-500/10 border-violet-600/40', footer: 'bg-zinc-500/15 border-zinc-600/50', footlogo: 'bg-zinc-500/15 border-zinc-600/50',
  mark: 'bg-violet-500/10 border-violet-600/40', labelrow: 'bg-violet-500/10 border-violet-600/40', slabs: 'bg-indigo-500/15 border-indigo-700/50', halo: 'bg-transparent border-dashed border-emerald-600/40',
};

function words(b: Block, empty: string[]): string {
  if (b.type === 'label') return b.text ?? (b.field ? (empty.includes(b.field) ? '' : SAMPLE[b.field]) : b.source === 'series' ? 'Series name' : b.source === 'brand' ? 'Brand name' : '02 / 05');
  if (b.type === 'website') return 'brand.example';
  if (b.type === 'logo') return 'Logo';
  if (b.type === 'bar') return 'Logo   brand.example';
  if (b.type === 'runhead') return 'Series   Brand';
  if (b.type === 'footer' || b.type === 'footlogo') return 'Logo';
  if (b.type === 'mark' || b.type === 'labelrow') return 'Series name';
  const f = b.field ?? ({ headline: 'headline', sub: 'sub', figure: 'big', stats: 'stats', list: 'items' } as Record<string, string>)[b.type];
  const main = f && !empty.includes(f) ? SAMPLE[f] ?? '' : '';
  const sub = typeof b.subField === 'string' && !empty.includes(b.subField) ? SAMPLE[b.subField] ?? '' : '';
  return [main, sub].filter(Boolean).join(' / ');
}

export function LayoutSketch({ layout, size, catalogue, selected, onSelect, onCell, showGrid = true, className, scenario }: {
  layout: Layout; size: string; catalogue: Catalogue; selected?: number | null; onSelect?: (i: number) => void;
  onCell?: (cell: { col: number; row: number }) => void; showGrid?: boolean; className?: string; scenario?: Scenario;
}) {
  const page = catalogue.sizes[size] ?? { w: 1080, h: 1350 };
  const g = layout.canvas?.[size];
  const built = isBuiltPage(layout), grid = showGrid && !built;
  if (!g || !(g.columns > 0) || !(g.rows > 0) || !Array.isArray(layout.blocks)) return <div className={cn('grid aspect-[4/5] place-items-center rounded-md border text-[12px] text-muted-foreground', className)}>No grid for this size</div>;
  const sc = scenario ?? defaultScenario(layout);
  const ground = groundIn(layout, sc, catalogue);
  const dark = catalogue.darkGrounds.includes(ground), photo = ground === 'photo';
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const box = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: pct(r.x, page.w), top: pct(r.y, page.h), width: pct(r.w, page.w), height: pct(r.h, page.h) });
  const c = cellOf(g, page);
  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (!onCell) return;
    const b = e.currentTarget.getBoundingClientRect();
    const hit = cellAt(g, page, ((e.clientX - b.left) / b.width) * page.w, ((e.clientY - b.top) / b.height) * page.h);
    if (hit) onCell(hit);
  };
  const order = layout.blocks.map((b, i) => ({ b, i, on: holds(b.when, sc, layout, catalogue) }))
    .filter(({ i, on }) => on || i === selected)
    .sort((a, z) => Number(z.b.type === 'decoration') - Number(a.b.type === 'decoration'));
  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-md border text-left', photo ? 'bg-amber-900/70 text-white' : dark ? 'bg-zinc-800 text-zinc-100' : 'bg-white text-zinc-900', onCell && 'cursor-crosshair', className)}
      style={{ aspectRatio: `${page.w} / ${page.h}`, containerType: 'inline-size' }}
      onClick={click}
      role="img"
      aria-label={`Sketch of the layout at ${size} size`}
    >
      {photo && <span aria-hidden="true" className="absolute inset-x-0 bottom-1 text-center text-[max(8px,1.4cqw)] uppercase tracking-wide opacity-60">Photo page colour</span>}
      {grid && Array.from({ length: g.columns }, (_, i) => (
        <div key={`c${i}`} aria-hidden="true" className="absolute bg-sky-400/10" style={box({ x: c.m.left + i * (c.w + c.gx), y: c.m.top, w: c.w, h: page.h - c.m.top - c.m.bottom })} />
      ))}
      {grid && Array.from({ length: g.rows + 1 }, (_, i) => (
        <div key={`r${i}`} aria-hidden="true" className="absolute h-px bg-sky-500/15" style={{ left: pct(c.m.left, page.w), right: pct(c.m.right, page.w), top: pct(c.m.top + i * (c.h + c.gy) - (i === g.rows ? c.gy : 0), page.h) }} />
      ))}
      {order.map(({ b, i, on }) => {
        const p = pxOn(b, size) ?? (built ? CHROME_RECT[b.type] ?? null : null), s = p ? null : slotOn(b, size);
        if (!s && !p) return null;
        const r = p ?? rectOf(g, page, s!, Array.isArray(b.bleed) ? b.bleed : []);
        const text = words(b, sc.empty);
        const big = ['headline', 'figure'].includes(b.type);
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect?.(i); }}
            className={cn('absolute flex flex-col overflow-hidden rounded-[2px] border p-[0.6cqw] text-left leading-tight', TINT[b.type] ?? 'border-zinc-500/40',
              !on && 'border-dashed opacity-45', selected === i && 'ring-2 ring-primary ring-offset-1')}
            style={{ ...box(r), justifyContent: b.valign === 'center' ? 'center' : b.valign === 'bottom' ? 'flex-end' : 'flex-start', textAlign: (b.align as CSSProperties['textAlign']) ?? 'left', fontSize: big ? '3.2cqw' : '1.8cqw' }}
            title={`${BLOCK_LABEL[b.type] ?? b.type}${b.when ? (on ? ' (shown in this case)' : ' (not drawn in this case)') : ''}`}
          >
            <span className="pointer-events-none flex items-center gap-1 truncate text-[max(8px,1.3cqw)] font-medium uppercase tracking-wide opacity-60">
              {BLOCK_LABEL[b.type] ?? b.type}
              {b.when !== undefined && <span className="rounded-sm bg-amber-400/80 px-[0.4cqw] text-[max(7px,1.1cqw)] text-zinc-950 normal-case">if</span>}
            </span>
            {b.type === 'slab' || b.type === 'slabs'
              ? (b.children ?? []).map((ch, k) => <span key={k} className={cn('pointer-events-none block', ['headline', 'figure'].includes(ch.type) && 'text-[2.6cqw] font-semibold')}>{words(ch, sc.empty)}</span>)
              : text && <span className={cn('pointer-events-none block', big && 'font-semibold')}>{text}</span>}
          </button>
        );
      })}
    </div>
  );
}
