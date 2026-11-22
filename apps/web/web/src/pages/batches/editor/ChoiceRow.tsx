// One row of visual choices (a radio group, or with `multiple` a set of toggles), in the look of the kind chooser.
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Choice<T extends string | number> { value: T; label: ReactNode; title?: string }

export function ChoiceRow<T extends string | number>({ legend, hint, choices, value, onChange, disabled, multiple = false }: {
  legend: ReactNode; hint?: ReactNode; choices: Array<Choice<T>>; disabled?: boolean;
  value: T | T[] | null; onChange: (next: T | T[]) => void; multiple?: boolean;
}) {
  const id = useId();
  const chosen = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  const pick = (v: T) => {
    if (!multiple) return onChange(v);
    const list = Array.isArray(value) ? value : [];
    onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled} aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((c) => {
          const on = chosen(c.value);
          return (
            <label key={String(c.value)} title={c.title}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium transition-colors sm:min-h-8',
                'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
                on ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent hover:bg-accent',
              )}
            >
              <input type={multiple ? 'checkbox' : 'radio'} name={id} checked={on} disabled={disabled} className="sr-only" onChange={() => pick(c.value)} />
              {c.label}
            </label>
          );
        })}
      </div>
      {hint && <p id={`${id}-hint`} className="text-[12.5px] text-muted-foreground">{hint}</p>}
    </fieldset>
  );
}
