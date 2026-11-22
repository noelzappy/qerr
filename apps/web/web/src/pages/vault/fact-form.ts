// The fact page's form as plain data, and the few rules that fill it in for the person: "Recorded on" starts as today, and
// while the person has not typed a title the title follows the first words of the text. Nothing filled in ever replaces
// what the person typed, and switching the kind keeps every value (fields that do not apply are only hidden).
import { dateInputValue } from '@/lib/format';
import type { VaultKind } from '@/lib/labels';
import type { VaultItem } from '../vault-types';

export interface FactForm {
  kind: VaultKind; title: string; body: string; sourceUrl: string; sourceNotes: string;
  recordedAt: string; validFrom: string; validUntil: string; tags: string[];
  licence: '' | 'own' | 'licensed' | 'rights_to_confirm'; licenceNotes: string; peoplePresent: boolean; consentRecorded: boolean;
}

// The form and whether its title is still the one suggested from the text.
export interface FactDraft { form: FactForm; titleAuto: boolean }

// Today as the value of a date input, in the person's own time zone.
export function todayInput(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// A stored item as the form; a new one starts with "Recorded on" set to today.
export function toFactForm(i: VaultItem | null, today: string = todayInput()): FactForm {
  return {
    kind: i?.kind ?? 'fact', title: i?.title ?? '', body: i?.body ?? '', sourceUrl: i?.sourceUrl ?? '', sourceNotes: i?.sourceNotes ?? '',
    recordedAt: i ? dateInputValue(i.recordedAt) : today, validFrom: dateInputValue(i?.validFrom), validUntil: dateInputValue(i?.validUntil), tags: i?.tags ?? [],
    licence: i?.licence ?? '', licenceNotes: i?.licenceNotes ?? '', peoplePresent: i?.peoplePresent ?? false, consentRecorded: i?.consentRecorded ?? false,
  };
}

export const startDraft = (i: VaultItem | null, today?: string): FactDraft => ({ form: toFactForm(i, today), titleAuto: !i || !i.title });

// The first words of the text as a title: the first sentence or line, at most eight words and 80 characters, without the
// closing punctuation. Empty when there is no text.
export function suggestTitle(body: string): string {
  const first = (body.trim().split(/\n|(?<=[.!?])\s/)[0] ?? '').replace(/\s+/g, ' ').trim();
  if (!first) return '';
  let out = '';
  for (const w of first.split(' ').slice(0, 8)) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > 80) break;
    out = next;
  }
  if (!out) out = first.slice(0, 80);
  out = out.replace(/[\s.,;:!?…–—-]+$/u, '');
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : '';
}

// The person types the text: the title follows it while it is still the suggested one.
export function editBody(d: FactDraft, body: string): FactDraft {
  return { titleAuto: d.titleAuto, form: { ...d.form, body, ...(d.titleAuto ? { title: suggestTitle(body) } : {}) } };
}

// The person types the title: from then on it is theirs.
export const editTitle = (d: FactDraft, title: string): FactDraft => ({ titleAuto: false, form: { ...d.form, title } });

// Any other field. Switching the kind keeps every typed value: the fields a kind does not use are hidden, not cleared, and
// only the ones it uses are sent.
export const editField = <K extends Exclude<keyof FactForm, 'title' | 'body'>>(d: FactDraft, k: K, v: FactForm[K]): FactDraft => ({ ...d, form: { ...d.form, [k]: v } });

// "22 Nov 2026" from a date input's value, without moving it across a time zone.
export function dayLabel(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// The three dates in one line, for the closed "Dates" disclosure.
export function datesSummary(f: Pick<FactForm, 'recordedAt' | 'validFrom' | 'validUntil'>, today: string = todayInput()): string {
  const recorded = f.recordedAt ? `Recorded ${f.recordedAt === today ? 'today' : dayLabel(f.recordedAt)}` : 'No date recorded';
  const valid = f.validFrom && f.validUntil ? `valid ${dayLabel(f.validFrom)} to ${dayLabel(f.validUntil)}`
    : f.validFrom ? `valid from ${dayLabel(f.validFrom)}`
    : f.validUntil ? `valid until ${dayLabel(f.validUntil)}`
    : 'no end date';
  return `${recorded}, ${valid}`;
}
