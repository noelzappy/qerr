// Brand and look fields built on the kit: a colour (picker and hex code), a number with a plain range message, and a file
// choice with its hint, its "saved straight away" note and its error.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BusyButton, Hint, TextField } from '@/components/kit';
import { cn } from '@/lib/utils';
import { validHex } from '../brand-types';
import { SavedNote, useReportProblem, useUploadStatus } from './status';

// ---- colour ----

const HEX_HELP = 'Use a six-digit colour code, like #1A2B3C.';
const asHex = (raw: string) => { const t = raw.trim(); return /^[0-9a-fA-F]{6}$/.test(t) ? `#${t}` : t; };

// A colour picker beside a hex box. A hex code that is not complete shows a message instead of being ignored; the colour
// stays at its last good value until the code is right.
export function ColourControl({ label, value, onChange, error, compact = false, allowEmpty = false, describedBy }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; compact?: boolean; allowEmpty?: boolean; describedBy?: string;
}) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;
  const trimmed = shown.trim();
  const problem = text !== null && !(allowEmpty && trimmed === '') && !validHex(asHex(trimmed)) ? HEX_HELP : '';
  useReportProblem(`colour-${id}`, problem ? `${label}: ${HEX_HELP}` : '');
  const message = error || problem;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="color" value={(validHex(value) ? value : '#000000').toLowerCase()} onChange={(e) => { setText(null); onChange(e.target.value.toUpperCase()); }}
        aria-label={`${label}, colour picker`} className={cn('shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5', compact ? 'size-8' : 'size-9 max-sm:size-11')}
      />
      <div className="min-w-0 flex-1">
        <Input
          id={id} value={shown} aria-label={`${label}, hex code`} aria-invalid={message ? true : undefined} aria-describedby={[describedBy, message ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined}
          className={cn('font-mono uppercase', compact && 'h-7 px-1.5 text-[12px]')}
          onChange={(e) => { const raw = e.target.value; setText(raw); const h = asHex(raw); if (validHex(h)) onChange(h.toUpperCase()); }}
          onBlur={() => { if (text !== null && validHex(asHex(text))) setText(null); }}
        />
        {message && <p id={`${id}-error`} className="mt-1 text-[12.5px] font-medium text-destructive" role="alert">{message}</p>}
      </div>
    </div>
  );
}

// A labelled colour with a hint, for the four starting colours.
export function ColourField({ label, hint, value, onChange, error }: { label: string; hint: string; value: string; onChange: (v: string) => void; error?: string }) {
  const hintId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-5 items-center gap-1">
        <Label>{label}</Label>
        <Hint about={label} id={hintId}>{hint}</Hint>
      </div>
      <ColourControl label={label} value={value} onChange={onChange} error={error} describedBy={hintId} />
    </div>
  );
}

// ---- number ----

type Parsed = { ok: true; n: number | null } | { ok: false; why: string };

// A number in a range. Text that is not a number in range shows what is allowed; the value stays at the last good one until it is.
export function NumberField({ label, hint, value, onChange, min, max, integer = false, emptyAllowed = false, error, className, unit }: {
  label: string; hint?: ReactNode; value: number | null; onChange: (v: number | null) => void; min: number; max: number; integer?: boolean; emptyAllowed?: boolean; error?: string; className?: string; unit?: string;
}) {
  const [text, setText] = useState(value === null ? '' : String(value));
  const rid = useId();
  const range = `from ${min} to ${max}${unit ? ` ${unit}` : ''}`;
  const parse = (raw: string): Parsed => {
    const t = raw.trim();
    if (t === '') return emptyAllowed ? { ok: true, n: null } : { ok: false, why: `Enter a number ${range}.` };
    const n = Number(t);
    if (!Number.isFinite(n)) return { ok: false, why: `Use a number ${range}.` };
    if (integer && !Number.isInteger(n)) return { ok: false, why: 'Use a whole number.' };
    if (n < min || n > max) return { ok: false, why: `Use a number ${range}.` };
    return { ok: true, n };
  };
  const parsed = parse(text);
  const problem = parsed.ok ? '' : parsed.why;
  useReportProblem(`number-${rid}`, problem ? `${label}: ${problem}` : '');
  // When the value changes from outside (undo, a saved copy), show it; text that already means this value stays as typed.
  useEffect(() => { const p = parse(text); if (!(p.ok && p.n === value)) setText(value === null ? '' : String(value)); }, [value]);
  return (
    <TextField
      className={className} label={label} hint={hint} inputMode="decimal" value={text} error={error || problem}
      onChange={(e) => { setText(e.target.value); const p = parse(e.target.value); if (p.ok) onChange(p.n); }}
    />
  );
}

// ---- file ----

// A button that opens the file chooser, under a label, with a hint and a place for what went wrong. With `statusKey` it shows
// "Saved straight away" after an upload that is saved the moment a file is chosen (`immediate`).
export function FileField({ label, hint, accept, onFile, busy = false, buttonLabel, icon, statusKey, immediate = false, fileName, disabled, className }: {
  label: ReactNode; hint?: ReactNode; accept: string; onFile: (f: File) => void; busy?: boolean; buttonLabel: string; icon?: ReactNode; statusKey?: string; immediate?: boolean; fileName?: string | null; disabled?: boolean; className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const { saved, error } = useUploadStatus(statusKey);
  const hintId = `${id}-hint`, errorId = `${id}-error`;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center gap-1">
        <span id={`${id}-label`} className="text-sm leading-none font-medium select-none">{label}</span>
        {hint && <Hint about={label} id={hintId}>{hint}</Hint>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        <BusyButton variant="outline" size="sm" loading={busy} disabled={disabled} aria-labelledby={`${id}-label ${id}-button`} aria-describedby={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined} onClick={() => input.current?.click()}>
          {icon}<span id={`${id}-button`}>{buttonLabel}</span>
        </BusyButton>
        {fileName && <span className="min-w-0 truncate text-[13px] text-muted-foreground">{fileName}</span>}
        {saved && <SavedNote />}
      </div>
      {immediate && !saved && <p className="text-[12.5px] text-muted-foreground">Saved as soon as you choose a file.</p>}
      {error && <p id={errorId} className="text-[13px] font-medium text-destructive" role="alert">{error}</p>}
    </div>
  );
}
