import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// The one way to combine Tailwind class names: later classes win over earlier ones, falsy values are dropped.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
