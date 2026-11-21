// Dates for people: "20 Nov 2026, 14:05". The browser's own locale is used for the month name; the order is day first.
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : timeFmt.format(d);
}

// The value for <input type="date">: the date part of an ISO string.
export const dateInputValue = (v: string | null | undefined): string => (v ? v.slice(0, 10) : '');
