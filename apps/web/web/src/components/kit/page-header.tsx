// The title block every page starts with: an optional breadcrumb trail, one h1, at most one muted line saying what the
// page is for, and the page's actions on the title row. A description longer than about 90 characters moves into the
// info icon beside the title.
//
//   <PageHeader crumbs={[{ label: 'Create', to: '/create' }, { label: 'March posts' }]} title="March posts" actions={<Button>Add post</Button>} />
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumbs, type Crumb } from './breadcrumbs';
import { Hint, textOf } from './hint';

const LONG = 90;

export function PageHeader({ title, description, actions, crumbs, className }: { title: string; description?: ReactNode; actions?: ReactNode; crumbs?: Crumb[]; className?: string }) {
  const long = description ? textOf(description).length > LONG : false;
  return (
    <header className={cn('mb-4 flex flex-col gap-1.5', className)}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="min-w-0 text-[19px] leading-7 font-semibold tracking-tight [overflow-wrap:anywhere] max-sm:text-lg">{title}</h1>
            {long && <Hint about={title}>{description}</Hint>}
          </div>
          {description && !long && <div className="text-[13px] text-muted-foreground max-md:line-clamp-2 md:truncate">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1 max-sm:[&>[aria-haspopup]]:ml-auto max-sm:[&>[aria-haspopup]]:flex-none max-sm:[&:has(>[aria-haspopup]:only-child)]:w-auto">{actions}</div>}
      </div>
    </header>
  );
}
