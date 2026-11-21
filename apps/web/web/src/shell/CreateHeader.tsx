// The header of the Create, Facts and Pictures pages: an icon, the page's title, and its actions beside them. The three
// pages are siblings in the sidebar, so there are no tabs across the top any more.
import type { ReactNode } from 'react';
import { Lightbulb, type LucideIcon } from 'lucide-react';

export function CreateHeader({ title = 'Create', icon: Icon = Lightbulb, actions, description }: { title?: string; icon?: LucideIcon; actions?: ReactNode; description?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border bg-card" aria-hidden="true"><Icon className="size-5" /></span>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
      </div>
      {description && <p className="max-w-[80ch] text-[13px] text-muted-foreground">{description}</p>}
    </header>
  );
}
