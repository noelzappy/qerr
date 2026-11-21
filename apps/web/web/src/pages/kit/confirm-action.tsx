// An AlertDialog for destructive or irreversible confirms. It runs onConfirm; if that throws, the reason (for example a
// 409 explanation) shows in the dialog and it stays open. The caller closes it on success.
import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/notice';
import { errorMessage } from '@/lib/errors';

export function ConfirmAction({ open, title, message, confirmLabel, destructive = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  // Say what will happen and name the thing, for example the person's email.
  message: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const cancel = () => { setError(''); onCancel(); };
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) cancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div>{message}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Notice tone="bad">{error}</Notice>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="max-sm:min-h-11">Cancel</AlertDialogCancel>
          {/* preventDefault keeps the dialog open so a failure can be shown in it. */}
          <Button variant={destructive ? 'destructive' : 'default'} className="max-sm:min-h-11" disabled={busy} aria-busy={busy || undefined} onClick={(e) => { e.preventDefault(); void go(); }}>
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
