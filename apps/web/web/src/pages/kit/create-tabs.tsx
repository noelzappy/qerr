// The tabs across the top of the Create pages (batches, the vault, the library), with the page's title and actions beside
// them, as the reference dashboards lay out their Create page.
import type { ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CREATE_TABS } from '../../shell/nav';

export function CreateHeader({ actions, description }: { actions?: ReactNode; description?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg border bg-card" aria-hidden="true"><Lightbulb className="size-5" /></span>
          <h1 className="text-xl font-semibold tracking-tight">Create</h1>
        </div>
        {actions && <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">{actions}</div>}
      </div>
      <nav aria-label="Create" className="flex gap-1 border-b">
        {CREATE_TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end
            className={({ isActive }) => cn('-mb-px border-b-2 px-3 py-2 text-[13.5px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', isActive ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      {description && <p className="max-w-[80ch] text-[13px] text-muted-foreground">{description}</p>}
    </header>
  );
}
