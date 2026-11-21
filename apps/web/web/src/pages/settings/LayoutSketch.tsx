// A live sketch of a layout at one size: the grid, every block in its slot (bleeding to the page edges it asks for) or at its pixel
// rectangle (a built-in page's), the page's chrome roughly where the page puts it, with sample words, drawn in the browser as plain
// boxes. It shows where things go while the layout is edited; the real image always comes
// from the design engine (the preview button), which also runs the fit, contrast and enlargement checks.
import type { CSSProperties, MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { BLOCK_LABEL, CHROME_RECT, builtPage, cellAt, cellOf, pxFor, rectOf, slotFor, type Block, type Catalogue, type Layout } from './layout-types';

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

function words(b: Block): string {
  if (b.type === 'label') return b.text ?? (b.field ? SAMPLE[b.field] : b.source === 'series' ? 'Series name' : b.source === 'brand' ? 'Brand name' : '02 / 05');
  if (b.type === 'website') return 'brand.example';
  if (b.type === 'logo') return 'Logo';
  if (b.type === 'bar') return 'Logo   brand.example';
  if (b.type === 'runhead') return 'Series   Brand';
  if (b.type === 'footer' || b.type === 'footlogo') return 'Logo';
  if (b.type === 'mark' || b.type === 'labelrow') return 'Series name';
  const f = b.field ?? ({ headline: 'headline', sub: 'sub', figure: 'big', stats: 'stats', list: 'items' } as Record<string, string>)[b.type];
  return f ? SAMPLE[f] ?? '' : '';
}

export function LayoutSketch({ layout, size, catalogue, selected, onSelect, onCell, showGrid = true, className, dark = false }: {
  layout: Layout; size: string; catalogue: Catalogue; selected?: number | null; onSelect?: (i: number) => void;
  onCell?: (cell: { col: number; row: number }) => void; showGrid?: boolean; className?: string; dark?: boolean;
}) {
  const page = catalogue.sizes[size] ?? { w: 1080, h: 1350 };
  const g = layout.canvas[size];
  const px = builtPage(layout), grid = showGrid && !px;
  if (!g || !(g.columns > 0) || !(g.rows > 0)) return <div className={cn('grid aspect-[4/5] place-items-center rounded-md border text-[12px] text-muted-foreground', className)}>No grid for this size</div>;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const box = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: pct(r.x, page.w), top: pct(r.y, page.h), width: pct(r.w, page.w), height: pct(r.h, page.h) });
  const c = cellOf(g, page);
  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (!onCell) return;
    const b = e.currentTarget.getBoundingClientRect();
    const hit = cellAt(g, page, ((e.clientX - b.left) / b.width) * page.w, ((e.clientY - b.top) / b.height) * page.h);
    if (hit) onCell(hit);
  };
  // With every field filled (as the sample words fill them), a block drawn only when a field is empty, or only on a carousel's
  // pages, is left out, so blocks that take turns in the same place do not pile up (the selected one is always shown).
  const drawn = (b: Block, i: number) => i === selected || !b.when || !((typeof b.when.absent === 'string' && layout.fields[b.when.absent]) || (b.when.page !== undefined && b.when.page !== 'single'));
  const order = layout.blocks.map((b, i) => ({ b, i })).filter(({ b, i }) => drawn(b, i)).sort((a, z) => Number(z.b.type === 'decoration') - Number(a.b.type === 'decoration'));
  return (
    <div
      className={cn('relative w-full overflow-hidden rounded-md border text-left', dark ? 'bg-zinc-800 text-zinc-100' : 'bg-white text-zinc-900', onCell && 'cursor-crosshair', className)}
      style={{ aspectRatio: `${page.w} / ${page.h}`, containerType: 'inline-size' }}
      onClick={click}
      role="img"
      aria-label={`Sketch of the layout at ${size} size`}
    >
      {grid && Array.from({ length: g.columns }, (_, i) => (
        <div key={`c${i}`} aria-hidden="true" className="absolute bg-sky-400/10" style={box({ x: c.m.left + i * (c.w + c.gx), y: c.m.top, w: c.w, h: page.h - c.m.top - c.m.bottom })} />
      ))}
      {grid && Array.from({ length: g.rows + 1 }, (_, i) => (
        <div key={`r${i}`} aria-hidden="true" className="absolute h-px bg-sky-500/15" style={{ left: pct(c.m.left, page.w), right: pct(c.m.right, page.w), top: pct(c.m.top + i * (c.h + c.gy) - (i === g.rows ? c.gy : 0), page.h) }} />
      ))}
      {order.map(({ b, i }) => {
        const s = slotFor(b, size), p = px ? pxFor(b, size) ?? CHROME_RECT[b.type] : null;
        if (!s && !p) return null;
        const r = p ?? rectOf(g, page, s!, b.bleed);
        const text = words(b);
        const big = ['headline', 'figure'].includes(b.type);
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect?.(i); }}
            className={cn('absolute flex flex-col overflow-hidden rounded-[2px] border p-[0.6cqw] text-left leading-tight', TINT[b.type] ?? 'border-zinc-500/40', selected === i && 'ring-2 ring-primary ring-offset-1')}
            style={{ ...box(r), justifyContent: b.valign === 'center' ? 'center' : b.valign === 'bottom' ? 'flex-end' : 'flex-start', textAlign: (b.align as CSSProperties['textAlign']) ?? 'left', fontSize: big ? '3.2cqw' : '1.8cqw' }}
            title={BLOCK_LABEL[b.type] ?? b.type}
          >
            <span className="pointer-events-none block truncate text-[max(8px,1.3cqw)] font-medium uppercase tracking-wide opacity-60">{BLOCK_LABEL[b.type] ?? b.type}</span>
            {b.type === 'slab' || b.type === 'slabs'
              ? (b.children ?? []).map((ch, k) => <span key={k} className={cn('pointer-events-none block', ['headline', 'figure'].includes(ch.type) && 'text-[2.6cqw] font-semibold')}>{words(ch)}</span>)
              : text && <span className={cn('pointer-events-none block', big && 'font-semibold')}>{text}</span>}
          </button>
        );
      })}
    </div>
  );
}
