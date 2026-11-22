// A list of short brand words edited as chips. It is the kit's TagInput (components/kit/tag-input.tsx), the one tag control
// of the panel, with the brand lists' limits: '#' is kept, at most 20 words of 30 characters.
import type { ReactNode } from 'react';
import { TagInput } from '@/components/kit';

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
  return (
    <TagInput label={label} hint={hint} error={error} values={values} onChange={onChange} placeholder={placeholder} addLabel={addLabel}
      maxItems={maxItems} maxLength={maxLength} stripHash={false} noun="word" chipsLabel={label} />
  );
}
