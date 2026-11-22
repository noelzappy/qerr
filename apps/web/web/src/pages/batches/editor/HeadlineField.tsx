// The headline box, with a Highlight button that puts *asterisks* round the selected words (the words that stand out).
import { useRef, useState } from 'react';
import { Highlighter } from 'lucide-react';
import { TextAreaField } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { toggleHighlight } from './highlight';

export function HeadlineField({ value, onChange, label = 'Headline', required, error, disabled, maxLength, hint }: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  maxLength?: number;
  // Replaces the default hint.
  hint?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState('');

  function highlight() {
    const ta = box.current?.querySelector('textarea');
    if (!ta) return;
    const result = toggleHighlight(ta.value, ta.selectionStart, ta.selectionEnd);
    if (!result) {
      setNote('Select the words you want to stand out first.');
      ta.focus();
      return;
    }
    setNote('');
    onChange(result.text);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(result.start, result.end); });
  }

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
      <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label="Highlight the selected words" onClick={highlight}
        // Keep the textarea's selection: a button press must not move focus first.
        onMouseDown={(e) => e.preventDefault()} className="absolute right-0 top-0 h-7 max-sm:min-h-9">
        <Highlighter aria-hidden="true" /> Highlight
      </Button>
      <p className="text-[13px] text-muted-foreground empty:hidden" aria-live="polite">{note}</p>
    </div>
  );
}
