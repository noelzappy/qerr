// The small mark beside a label when the app filled the value in for the person ("Auto", "From the file name", "Today").
// It stays only while the value is the one the app filled; the field stays editable. Put it in the field's label, so it is
// read with the label: <TextField label={<>Title <FilledTag>From the file name</FilledTag></>} ... />
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function FilledTag({ children = 'Auto', className }: { children?: ReactNode; className?: string }) {
  return (
    <span data-filled-tag="" className={cn('ml-1.5 inline-flex items-center rounded-full border px-1.5 py-px align-middle text-[11px] leading-4 font-normal whitespace-nowrap text-muted-foreground', className)}>
      {children}
    </span>
  );
}
