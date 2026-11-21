// A block of a settings page: a heading, a line saying what it is for, and its fields. Settings pages are a column of these.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SettingsPage({ title, description, children, actions }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-[70ch] text-[13.5px] text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Section({ id, title, description, children, className, aside }: { id?: string; title: string; description?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  const hid = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={hid} className={cn('flex scroll-mt-6 flex-col gap-4 border-t pt-6 first-of-type:border-t-0 first-of-type:pt-0', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={hid} className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 max-w-[70ch] text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
