// Small helpers for the batch pages: server problem lists, dates in words, and "only when it is on screen".
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api';
import { errorMessage } from '../../lib/errors';

// Every line of a 400 or 422 answer. The server sends either plain strings or { path, message } objects.
export function detailLines(err: unknown): string[] {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return [];
  return (err.details as unknown[]).map((d) => {
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object') {
      const { path, message } = d as { path?: unknown; message?: unknown };
      if (typeof message === 'string') return typeof path === 'string' && path ? `${path}: ${message}` : message;
    }
    return '';
  }).filter(Boolean);
}

export const problemText = (err: unknown) => errorMessage(err);

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const utcFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

// "Mon, 11 Jan 2027" from "2027-01-11". The date is a calendar day, so no time zone shifts it.
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : dayFmt.format(d);
}

// "11 Jan 2027, 09:00" from the engine's "2027-01-11 09:00" (the batch's own time zone).
export function localLabel(local: string): string {
  const [date = '', time = ''] = local.split(' ');
  const d = new Date(`${date}T12:00:00Z`);
  const day = Number.isNaN(d.getTime()) ? date : shortDayFmt.format(d);
  return time ? `${day}, ${time}` : day;
}

export function utcLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${utcFmt.format(d)} UTC`;
}

export const charCount = (s: string) => [...s].length;

export function periodLabel(start: string | null, end: string | null): string {
  if (!start && !end) return 'No dates yet';
  if (start && end && start !== end) return `${dayLabel(start)} to ${dayLabel(end)}`;
  return dayLabel((start ?? end)!);
}

// True once the element has come near the screen. Cards use it so a long batch does not fetch every post at once.
export function useInView<T extends Element>(rootMargin = '500px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, rootMargin]);
  return [ref, seen];
}

export const MAX_UPLOAD = 25 * 1024 * 1024;
