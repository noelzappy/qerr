// Tracks a CSS media query. Used to pick a side Sheet on desktop and a bottom Drawer on a phone.
import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Below Tailwind's `md` breakpoint (768px).
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
