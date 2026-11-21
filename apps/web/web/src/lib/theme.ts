// Light or dark. shadcn switches on the `dark` class on <html>; the choice is kept in localStorage ('light' | 'dark' | 'system').
// Without a choice the system setting decides.
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'theme';
const listeners = new Set<() => void>();

function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch {
    return 'system';
  }
}

function resolved(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return choice;
}

function apply() {
  document.documentElement.classList.toggle('dark', resolved(stored()) === 'dark');
  listeners.forEach((l) => l());
}

export function initTheme() {
  apply();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
}

export const themeChoice = (): ThemeChoice => stored();

export function setTheme(choice: ThemeChoice) {
  try { localStorage.setItem(KEY, choice); } catch { /* private mode: the choice lasts until reload */ }
  apply();
}

// The theme actually in effect ('light' or 'dark').
export function useTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'light',
  );
}
