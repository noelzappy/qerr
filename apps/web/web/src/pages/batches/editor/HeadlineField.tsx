// The headline box, with a Highlight button that puts *asterisks* round the selected words (the words that stand out). With `marks`, also a
// Pill button that puts [[brackets]] round one to three selected words (set in a pill where the look draws pills) and an icon grid that puts
// an {{icon}} mark at the caret (from the engine's own icons, `icons`).
import { useRef, useState, type MouseEvent } from 'react';
import { Highlighter } from 'lucide-react';
import { TextAreaField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { insertIcon, toggleHighlight, togglePill, type Highlighted } from './highlight';
import { IconGrid } from './IconGrid';

export function HeadlineField({ value, onChange, label = 'Headline', required, error, disabled, maxLength, hint, marks, icons = [] }: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  // Replaces the default hint.
  hint?: string;
  // Offers the Pill button and the icon menu (a post designed by a look).
  marks?: boolean;
  icons?: string[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');

  function apply(fn: (ta: HTMLTextAreaElement) => Highlighted | null, empty: string) {
    const ta = box.current?.querySelector('textarea');
    if (!ta) return;
    const result = fn(ta);
    if (!result) { setNote(empty); ta.focus(); return; }
    setNote('');
    onChange(result.text);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(result.start, result.end); });
  }
  const highlight = () => apply((ta) => toggleHighlight(ta.value, ta.selectionStart, ta.selectionEnd), 'Select the words you want to stand out first.');
  const pill = () => apply((ta) => togglePill(ta.value, ta.selectionStart, ta.selectionEnd), 'Select one to three words (outside the highlight) to set in a pill.');
  const icon = (name: string) => apply((ta) => insertIcon(ta.value, ta.selectionStart, name), '');
  // Keep the textarea's selection: a button press must not move focus first.
  const keep = (e: MouseEvent) => e.preventDefault();

  return (
    <div ref={box} className="relative flex min-w-0 flex-col gap-1.5">
      <TextAreaField
        label={<>{label}{required && <span aria-hidden="true"> *</span>}</>}
        rows={2}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        required={required}
        error={error}
        hint={hint ?? "Select words and press Highlight to make them stand out. You can also type *asterisks* around them."}
        onChange={(e) => { setNote(''); onChange(e.target.value); }}
      />
      <div className="absolute right-0 top-0 flex items-center gap-1">
        {marks && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label="Set the selected words in a pill" onClick={pill} onMouseDown={keep} className="h-7 max-sm:min-h-9">Pill</Button>
            {icons.length > 0 && <IconGrid icons={icons} disabled={disabled} keepSelection={keep} onPick={icon} />}
          </>
        )}
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label="Highlight the selected words" onClick={highlight} onMouseDown={keep} className="h-7 max-sm:min-h-9">
          <Highlighter aria-hidden="true" /> Highlight
        </Button>
      </div>
      <p className="text-[13px] text-muted-foreground empty:hidden" aria-live="polite">{note}</p>
    </div>
  );
}
