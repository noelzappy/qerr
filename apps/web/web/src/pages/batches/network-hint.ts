// The one-line hint "Changing networks takes approval off." is shown once above the posts, until someone has changed a post's
// networks in this browser. The flag lives in localStorage; the event keeps the page's line and the cards in step.
import { useEffect, useState } from 'react';

const HINT_KEY = 'vesk.hint.network-approval';
const HINT_EVENT = 'vesk:network-hint-seen';

function readHintSeen(): boolean { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } }

export function markNetworkHintSeen() {
  try { localStorage.setItem(HINT_KEY, '1'); } catch { /* private mode */ }
  window.dispatchEvent(new Event(HINT_EVENT));
}

export function useNetworkHintSeen(): boolean {
  const [seen, setSeen] = useState(readHintSeen);
  useEffect(() => {
    const on = () => setSeen(true);
    window.addEventListener(HINT_EVENT, on);
    return () => window.removeEventListener(HINT_EVENT, on);
  }, []);
  return seen;
}
