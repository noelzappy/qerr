// Unsaved-changes guard.
//
//   useUnsavedGuard(dirty, { message?, allow? })   call it in any editor with a "has the user changed something" flag. While `dirty`
//                                         is true, leaving the page by a link, the back button or a menu asks first
//                                         ("Leave without saving?" with Stay and Leave), and closing the tab or reloading
//                                         shows the browser's own warning. `allow(from, to)` names moves that keep the form's state
//                                         (for example between the sections of one page) and so are not asked about.
//   confirmDiscard(dirty, close)          for sheets and panels: call it from every way of closing (Escape, the X, Cancel,
//                                         a click outside). When `dirty` it asks first and only then runs `close`;
//                                         when clean it runs `close` at once. Pass it as FormPanel's onClose:
//                                           <FormPanel onClose={() => confirmDiscard(dirty, close)} ...>
//   withoutGuard(fn)                      runs a navigation without asking, for the redirect after a successful save or delete.
//   <UnsavedGuardHost />                  rendered once, inside the router, in App.tsx. It owns the dialog.
//
// Use the hook in the component that owns the form state, with the flag you already compute for the Save button. A route-driven
// sheet (one that closes by navigating) is covered by both: confirmDiscard asks, and the navigation it triggers is not asked again.
import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { useBlocker } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const DEFAULT_MESSAGE = 'Your changes will be lost.';

// A tiny store: which editors are dirty right now, and a request from confirmDiscard that waits for an answer.
type Loc = { pathname: string; search: string };
const guards = new Map<string, { message: string; allow?: (from: Loc, to: Loc) => boolean }>();
let discard: { run: () => void } | null = null;
let bypass = false;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => version;

export function useUnsavedGuard(dirty: boolean, opts?: { message?: string; allow?: (from: Loc, to: Loc) => boolean }) {
  const id = useId();
  const message = opts?.message ?? DEFAULT_MESSAGE;
  const allowRef = useRef(opts?.allow);
  allowRef.current = opts?.allow;
  const hasAllow = !!opts?.allow;
  useEffect(() => {
    if (!dirty) return;
    guards.set(id, { message, allow: hasAllow ? (from, to) => allowRef.current?.(from, to) ?? false : undefined });
    emit();
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => { guards.delete(id); window.removeEventListener('beforeunload', warn); emit(); };
  }, [dirty, id, message, hasAllow]);
}

// Run a navigation that must not be asked about, for example the redirect right after a successful save.
export function withoutGuard<T>(run: () => T): T {
  const before = bypass;
  bypass = true;
  try { return run(); } finally { bypass = before; }
}

// Ask before closing something that has unsaved changes.
export function confirmDiscard(dirty: boolean, close: () => void) {
  if (!dirty) { close(); return; }
  discard = {
    run: () => {
      // Closing a route-driven sheet navigates; that navigation was just confirmed.
      withoutGuard(close);
    },
  };
  emit();
}

const lastMessage = () => [...guards.values()].pop()?.message ?? DEFAULT_MESSAGE;

export function UnsavedGuardHost() {
  useSyncExternalStore(subscribe, snapshot);
  const shouldBlock = useCallback(({ currentLocation, nextLocation }: { currentLocation: Loc; nextLocation: Loc }) => (
    !bypass
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
    && [...guards.values()].some((g) => !g.allow?.(currentLocation, nextLocation))
  ), []);
  const blocker = useBlocker(shouldBlock);
  const open = blocker.state === 'blocked' || discard !== null;
  const stay = () => {
    if (blocker.state === 'blocked') blocker.reset();
    discard = null;
    emit();
  };
  const leave = () => {
    const pending = discard;
    discard = null;
    if (blocker.state === 'blocked') blocker.proceed();
    pending?.run();
    emit();
  };
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) stay(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>{lastMessage()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="max-sm:[&>*]:min-h-11">
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={leave}>Leave</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
