// The picture of the post, as the design would draw it now. The parent decides where it sits and whether it sticks.
import { useEffect, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Hint, Lines, Notice, SelectField, Spin } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DesignBlock } from '../types';
import type { PreviewResult } from './usePreview';

const SIZE_WORDS: Record<string, string> = { feed: 'Feed', wide: 'Wide', story: 'Story', square: 'Square' };
const RATIO: Record<string, string> = { feed: '1080 / 1350', wide: '1200 / 675', story: '1080 / 1920', square: '1 / 1' };

// The sizes a design lists, in plain words, or none when it has one or no list.
function listedSizes(design: DesignBlock | null): string[] {
  const v = design?.sizes;
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out = list.map((s) => String(s).trim()).filter((s) => s in SIZE_WORDS);
  return [...new Set(out)];
}

export function PreviewPane({ design, preview }: { design: DesignBlock | null; preview: PreviewResult }) {
  const { state, images, warnings, problems, error, size, refresh, requestedSize, setRequestedSize } = preview;
  const [page, setPage] = useState(0);
  useEffect(() => { if (page > images.length - 1) setPage(Math.max(0, images.length - 1)); }, [images.length, page]);
  const sizes = listedSizes(design);
  const shownSize = requestedSize || size || sizes[0] || 'feed';
  const image = images[page] ?? null;
  const updating = state === 'updating';
  const carousel = images.length > 1;

  function onKey(e: KeyboardEvent) {
    if (!carousel) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [role="combobox"]')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPage((p) => Math.max(0, p - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setPage((p) => Math.min(images.length - 1, p + 1)); }
  }

  if (!design) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        <ImageOff className="size-6" aria-hidden="true" />
        <p>Turn on the designed image to see a preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKey}>
      {sizes.length > 1 && (
        <SelectField
          label="Format" value={shownSize} onValueChange={(v) => { setRequestedSize(v); setPage(0); }}
          options={sizes.map((s) => ({ value: s, label: SIZE_WORDS[s] ?? s }))}
        />
      )}
      <div className="relative">
        <div
          className={cn('mx-auto flex items-center justify-center overflow-hidden rounded-lg border bg-muted/40', image ? 'w-fit max-w-full' : 'w-full')}
          style={image ? undefined : { aspectRatio: RATIO[shownSize] ?? RATIO.feed, maxHeight: '70vh' }}
        >
          {image ? (
            <img src={image} alt="Preview of the designed image" className={cn('max-h-[70vh] max-w-full object-contain transition-opacity', (updating || problems.length > 0) && 'opacity-60')} />
          ) : state === 'problem' ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground"><ImageOff className="size-6" aria-hidden="true" /><p>No picture yet</p></div>
          ) : (
            <Skeleton className="size-full min-h-40 rounded-none" />
          )}
        </div>
        <div role="status" aria-live="polite" className="pointer-events-none absolute top-2 left-2">
          {updating && (
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
              <Spin className="size-3" />Updating...
            </span>
          )}
        </div>
      </div>
      {carousel && (
        <div className="flex items-center justify-between gap-2" role="group" aria-label="Pages of the carousel">
          <Button type="button" variant="outline" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="max-sm:size-11"><ChevronLeft aria-hidden="true" /></Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">Page {page + 1} of {images.length}</span>
          <Button type="button" variant="outline" size="icon" aria-label="Next page" disabled={page >= images.length - 1} onClick={() => setPage(page + 1)} className="max-sm:size-11"><ChevronRight aria-hidden="true" /></Button>
        </div>
      )}
      {problems.length > 0 && (
        <Notice tone="warn" title="Fix these to see the image"><Lines items={problems} className="max-h-48 overflow-y-auto" /></Notice>
      )}
      {error && <Notice tone="bad" title="The image could not be made">{error}</Notice>}
      {warnings.length > 0 && (
        <Notice tone="warn" title="Worth a look"><Lines items={warnings} className="max-h-48 overflow-y-auto" /></Notice>
      )}
      <div className="flex items-center justify-end gap-1">
        <Hint about="the preview">This is a preview. The saved post gets its images when you save.</Hint>
        <Button type="button" variant="ghost" size="sm" onClick={refresh} disabled={updating}>Update now</Button>
      </div>
    </div>
  );
}
