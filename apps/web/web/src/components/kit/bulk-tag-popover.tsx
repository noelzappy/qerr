// "Add tag" for a bulk action: a small popover with one field. The tags are added to what each item already has.
import { useState, type FormEvent } from 'react';
import { Loader2, Tag } from 'lucide-react';
import { TextField } from './fields';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { parseTags } from './tags';

export function BulkTagPopover({ disabled, count, onAdd }: { disabled?: boolean; count: number; onAdd: (tags: string[]) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const tags = [...new Set(parseTags(draft))];
    if (!tags.length) { setError('Type at least one tag.'); return; }
    if (tags.some((t) => t.length > 40)) { setError('A tag can be at most 40 characters.'); return; }
    setBusy(true);
    try {
      await onAdd(tags);
      setOpen(false);
      setDraft('');
      setError('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) setError(''); } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="max-sm:min-h-11" disabled={disabled}><Tag aria-hidden="true" />Add tag</Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[min(20rem,calc(100vw-2rem))]">
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" aria-label="Add tags">
          <TextField label="Tags to add" placeholder="For example news" value={draft} onChange={(e) => { setDraft(e.target.value); setError(''); }}
            hint={`Added to the ${count} selected. Separate several with commas.`} error={error} autoFocus />
          <Button type="submit" className="max-sm:min-h-11" disabled={busy} aria-busy={busy || undefined}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}Add tags
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
