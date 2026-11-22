// The one tag control: short words edited as chips. Type a word and press Enter or a comma, click Add, or leave the field;
// pasted text with commas is split. A chip's x removes it. Controlled: the caller owns `values`. The label, hint and error
// are wired to the input like the kit's TextField. Used for the tags on facts and pictures and for brand word lists.
import { useId, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Hint } from './hint';
import { TagChips } from './tags';

export interface TagInputRules { maxItems: number; maxLength: number; stripHash: boolean; noun: string }

// Adds the typed pieces to the list: trimmed, '#' taken off the front when asked, no repeats (ignoring case). Returns the
// new list, or the reason nothing was added.
export function addTags(values: string[], pieces: string[], rules: TagInputRules): { next: string[] } | { problem: string } {
  const clean = pieces.map((p) => p.trim()).map((p) => (rules.stripHash ? p.replace(/^#+/, '').trim() : p)).filter(Boolean);
  if (clean.some((p) => p.length > rules.maxLength)) return { problem: `A ${rules.noun} can be at most ${rules.maxLength} characters.` };
  const next = [...values];
  for (const p of clean) if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
  if (next.length > rules.maxItems) return { problem: `There can be at most ${rules.maxItems} ${rules.noun}s.` };
  return { next };
}

export function TagInput({ label, values, onChange, hint, error, optional, placeholder, disabled, hideLabel, className, chipsLabel, addLabel = 'Add', maxItems = 30, maxLength = 40, stripHash = true, noun = 'tag' }: {
  label: ReactNode;
  values: string[];
  onChange: (next: string[]) => void;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  placeholder?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
  // The name of the list of chips, for screen readers ("Tags on this picture").
  chipsLabel?: string;
  addLabel?: string;
  maxItems?: number;
  maxLength?: number;
  stripHash?: boolean;
  noun?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const shownError = problem || error;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = shownError ? `${id}-error` : undefined;
  const name = typeof label === 'string' ? label : 'Tags';

  function add(pieces: string[]) {
    const r = addTags(values, pieces, { maxItems, maxLength, stripHash, noun });
    if ('problem' in r) { setProblem(r.problem); return; }
    setProblem('');
    setDraft('');
    if (r.next.length !== values.length) onChange(r.next);
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add([draft]); }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes(',')) return;
    e.preventDefault();
    add(`${draft}${text}`.split(','));
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className={cn('flex min-h-5 items-center gap-1', hideLabel && 'sr-only')}>
        <Label htmlFor={id}>{label}{optional && <span className="font-normal text-muted-foreground"> (optional)</span>}</Label>
        {hint && <Hint about={label} id={hintId}>{hint}</Hint>}
      </div>
      <div className="flex gap-2">
        <Input id={id} value={draft} maxLength={maxLength} disabled={disabled} placeholder={placeholder}
          onChange={(e) => { setDraft(e.target.value); if (problem) setProblem(''); }} onKeyDown={onKeyDown} onPaste={onPaste} onBlur={() => { if (draft.trim()) add([draft]); }}
          className="max-sm:h-11 max-sm:text-base" aria-invalid={shownError ? true : undefined} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} />
        <Button type="button" variant="outline" className="max-sm:h-11" disabled={disabled || !draft.trim()} onClick={() => add([draft])}>{addLabel}</Button>
      </div>
      {shownError && <p className="text-[12.5px] font-medium text-destructive" id={errorId} role="alert">{shownError}</p>}
      <TagChips tags={values} label={chipsLabel ?? `${name}: chosen`} disabled={disabled} onRemove={(t) => onChange(values.filter((x) => x !== t))} />
    </div>
  );
}
