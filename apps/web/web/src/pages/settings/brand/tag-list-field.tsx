// A list of short words edited as chips: type a word and press Enter or comma, or click Add. Pasted text with commas is split.
// Controlled: the caller owns `values`. Label, hint and error are wired to the input like the kit's TextField.
import { useId, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Hint } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function TagListField({ label, hint, error, values, onChange, placeholder, addLabel = 'Add', maxItems = 20, maxLength = 30 }: {
  label: string;
  hint?: ReactNode;
  error?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  maxItems?: number;
  maxLength?: number;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const [draft, setDraft] = useState('');
  const full = values.length >= maxItems;

  function add(raw: string[]) {
    const next = [...values];
    for (const r of raw) {
      const v = r.trim().slice(0, maxLength);
      if (!v || next.length >= maxItems || next.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
      next.push(v);
    }
    if (next.length !== values.length) onChange(next);
    setDraft('');
  }
  const commit = () => add([draft]);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes(',')) return;
    e.preventDefault();
    add(text.split(','));
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-1">
        <Label htmlFor={id}>{label}</Label>
        {hint && <Hint about={label} id={hintId}>{hint}</Hint>}
      </div>
      <div className="flex gap-2">
        <Input id={id} value={draft} maxLength={maxLength} disabled={full} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste}
          className="max-sm:h-11 max-sm:text-base" aria-invalid={error ? true : undefined} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} />
        <Button type="button" variant="outline" className="max-sm:h-11" disabled={full || !draft.trim()} onClick={commit}>{addLabel}</Button>
      </div>
      {error && <p className="text-[13px] font-medium text-destructive" id={errorId} role="alert">{error}</p>}
      {values.length > 0 && (
        <div role="list" className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} role="listitem" className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-1 text-[13px]">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
