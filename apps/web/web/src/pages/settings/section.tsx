// A block of a settings page: a title (its explanation in an info icon beside it) and its fields. Settings pages are a
// column of these, separated by space and one hairline.
import type { ReactNode } from 'react';
import { Hint } from '@/components/kit/hint';
import { PageHeader } from '@/components/kit/page-header';
import type { Crumb } from '@/components/kit/breadcrumbs';
import { cn } from '@/lib/utils';

// `crumbs` defaults to Settings / <title>.
export function SettingsPage({ title, description, children, actions, crumbs }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode; crumbs?: Crumb[] }) {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader className="mb-0" crumbs={crumbs ?? [{ label: 'Settings', to: '/settings/preferences' }, { label: title }]} title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}

export function Section({ id, title, description, children, className, aside }: { id?: string; title: string; description?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  const hid = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={hid} className={cn('flex scroll-mt-6 flex-col gap-3 border-t pt-6 first-of-type:border-t-0 first-of-type:pt-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <h2 id={hid} className="text-sm font-semibold">{title}</h2>
          {description && <Hint about={title}>{description}</Hint>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
