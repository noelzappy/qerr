// What a list shows while it has nothing to show: loading skeletons, an empty explanation, an error with a retry, and paging.
import type { ComponentProps, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function RowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-16 max-sm:hidden" />
        </div>
      ))}
    </div>
  );
}

// A spinner and a word, for a short wait where there is no content shape to put skeletons in (sign-in checks, the shell).
export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 px-5 py-7 text-muted-foreground" role="status">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyBlock({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-11 text-center text-muted-foreground">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {children && <p className="max-w-[46ch]">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBlock({ message, onRetry, title = 'This could not be loaded' }: { message: string; onRetry?: () => void; title?: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-5 py-11 text-center text-muted-foreground" role="alert">
      <h3 className="text-base font-semibold text-destructive">{title}</h3>
      <p className="max-w-[46ch]">{message}</p>
      {onRetry && <Button variant="outline" className="max-sm:min-h-11" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t px-3.5 py-3" aria-label="Pages">
      <span className="text-[13px] text-muted-foreground">{from}-{to} of {total}</span>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="outline" size="sm" className="max-sm:min-h-11" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="text-[13px]" aria-current="page">Page {page} of {pages}</span>
        <Button variant="outline" size="sm" className="max-sm:min-h-11" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </nav>
  );
}

// A button that shows a spinner and blocks double clicks while its work runs.
export function BusyButton({ busy, children, ...rest }: { busy?: boolean } & ComponentProps<typeof Button>) {
  return (
    <Button {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={`max-sm:min-h-11 ${rest.className ?? ''}`}>
      {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  );
}
