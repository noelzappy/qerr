// "Period" as one tap: Next week, next month, the month after, or Custom (two date fields). The dates chosen are spelt out under
// the chips. Used by New batch and Draft with AI.
import { useState } from 'react';
import { TextField } from '@/components/kit';
import { ChoiceRow } from './editor/ChoiceRow';
import { choiceOf, monthName, periodFor, periodLine, type Period, type PeriodChoice } from './periods';

export function PeriodChips({ today, value, onChange, errors = {}, optional = false, disabled, legend = 'Period' }: {
  today: string;
  value: Period;
  onChange: (next: Period) => void;
  errors?: { from?: string; to?: string };
  // Custom dates may be left empty (New batch: the period then follows the posts).
  optional?: boolean;
  disabled?: boolean;
  legend?: string;
}) {
  const [choice, setChoice] = useState<PeriodChoice>(() => choiceOf(value, today));
  const pick = (c: PeriodChoice) => {
    setChoice(c);
    if (c !== 'custom') onChange(periodFor(c, today));
  };
  const line = periodLine(value);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ChoiceRow<PeriodChoice>
        legend={legend} value={choice} disabled={disabled} onChange={(v) => pick(v as PeriodChoice)}
        choices={[
          { value: 'week', label: 'Next week' },
          { value: 'month', label: monthName(today, 1) },
          { value: 'after', label: monthName(today, 2) },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {choice === 'custom' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField label="First day" optional={optional} type="date" value={value.from} error={errors.from} disabled={disabled} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <TextField label="Last day" optional={optional} type="date" value={value.to} error={errors.to} disabled={disabled} onChange={(e) => onChange({ ...value, to: e.target.value })}
            hint={optional ? 'Left empty, the period follows the posts you add.' : undefined} />
        </div>
      ) : (
        <>
          <p className="-mt-1 text-[12.5px] text-muted-foreground" aria-live="polite">{line}</p>
          {(errors.from || errors.to) && <p className="text-[12.5px] font-medium text-destructive" role="alert">{errors.from || errors.to}</p>}
        </>
      )}
    </div>
  );
}
