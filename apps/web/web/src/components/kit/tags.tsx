// Removable chips. The field that adds them is TagInput (tag-input.tsx), the one tag control of the panel.
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TagChips({ tags, onRemove, label, removeLabel = (t) => `Remove the tag ${t}`, className, disabled }: { tags: string[]; onRemove: (t: string) => void; label: string; removeLabel?: (t: string) => string; className?: string; disabled?: boolean }) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn('m-0 flex list-none flex-wrap gap-1.5 p-0', className)} aria-label={label}>
      {tags.map((t) => (
        <li key={t} className="inline-flex max-w-full items-center gap-0.5 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-0.5 text-[13px]">
          <span className="min-w-0 [overflow-wrap:anywhere]">{t}</span>
          <button type="button" aria-label={removeLabel(t)} onClick={() => onRemove(t)} disabled={disabled}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 max-sm:size-9">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// Comma-separated words as tags, '#' taken off the front (the bulk tag box).
export function parseTags(raw: string): string[] {
  return raw.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
}
