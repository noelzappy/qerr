// Removable chips, and a text field that turns typed words into chips (Enter, comma or leaving the field adds them).
import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { TextField } from './fields';
import { cn } from '@/lib/utils';

export function TagChips({ tags, onRemove, label, removeLabel = (t) => `Remove the tag ${t}`, className }: { tags: string[]; onRemove: (t: string) => void; label: string; removeLabel?: (t: string) => string; className?: string }) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn('m-0 flex list-none flex-wrap gap-2 p-0', className)} aria-label={label}>
      {tags.map((t) => (
        <li key={t} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-sm">
          <span className="min-w-0 [overflow-wrap:anywhere]">{t}</span>
          <button type="button" aria-label={removeLabel(t)} onClick={() => onRemove(t)}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:size-9">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function parseTags(raw: string): string[] {
  return raw.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
}

export function TagField({ tags, onChange, error, label = 'Tags', hint = 'Post types and topics, for example news or the-numbers. Press Enter to add a tag; separate several with commas.' }: { tags: string[]; onChange: (t: string[]) => void; error?: string; label?: string; hint?: string }) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  function add() {
    const parts = parseTags(draft);
    if (!parts.length) return;
    if (parts.some((p) => p.length > 40)) { setProblem('A tag can be at most 40 characters.'); return; }
    const next = [...new Set([...tags, ...parts])];
    if (next.length > 30) { setProblem('An item can have at most 30 tags.'); return; }
    setProblem('');
    onChange(next);
    setDraft('');
  }
  return (
    <div className="flex flex-col gap-2">
      <TextField label={label} optional value={draft} onChange={(e) => setDraft(e.target.value)} error={problem || error} hint={hint}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} />
      <TagChips tags={tags} label="Tags on this item" onRemove={(t) => onChange(tags.filter((x) => x !== t))} />
    </div>
  );
}
