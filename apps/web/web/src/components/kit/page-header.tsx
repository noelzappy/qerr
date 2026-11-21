// The title block every page starts with: one h1, a line saying what the page is for, and the page's actions.
import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-[72ch] flex-1 basis-72">
        <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] max-sm:text-[23px]">{title}</h1>
        {description && <div className="mt-1.5 text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
    </header>
  );
}
