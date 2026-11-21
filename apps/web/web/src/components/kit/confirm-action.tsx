// An AlertDialog for destructive or irreversible confirms. It runs onConfirm; if that throws, the reason (for example a
// 409 explanation) shows in the dialog and it stays open, so nothing is lost. The caller closes it on success.
import { useState, type ReactNode } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { errorMessage } from '@/lib/errors';
import { BusyButton } from './busy-button';
import { Notice } from './notice';

export function ConfirmAction({ open, title, message, confirmLabel, danger = false, confirmDisabled = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  // Say what will happen and name the thing, for example the person's email.
  message: ReactNode;
  confirmLabel: string;
  // A red confirm button, for deleting or anything else that cannot be taken back.
  danger?: boolean;
  confirmDisabled?: boolean;
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
      <AlertDialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="[overflow-wrap:anywhere]">{message}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {error && <Notice tone="bad">{error}</Notice>}
        <AlertDialogFooter className="max-sm:[&>*]:min-h-11">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* preventDefault keeps the dialog open so a failure can be shown in it; the caller closes it on success. */}
          <BusyButton variant={danger ? 'destructive' : 'default'} loading={busy} disabled={confirmDisabled} onClick={(e) => { e.preventDefault(); void go(); }}>{confirmLabel}</BusyButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
